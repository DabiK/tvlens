const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash, randomUUID } = require('node:crypto');
const { performance } = require('node:perf_hooks');

const hash = value => createHash('sha256').update(value).digest('hex');
const clock = () => ({ utc: new Date().toISOString(), monotonicMs: performance.now() });
const fail = code => Object.assign(Error(code), { code });
async function save(file, value) {
  await fs.writeFile(file + '.tmp', JSON.stringify(value, null, 2) + '\n', { mode: 0o600 });
  await fs.rename(file + '.tmp', file);
}
function parse(argv) {
  const options = { execute: false, repeats: 1, repo: process.cwd() };
  const names = { '--corpus': 'corpus', '--out': 'out', '--repo': 'repo', '--backend': 'backend',
    '--base-url': 'url', '--model': 'model', '--repeats': 'repeats', '--identity-file': 'identityFile' };
  const seen = new Set();
  for (let i = 0; i < argv.length; i++) {
    const name = argv[i];
    if (seen.has(name)) throw fail('CLI_DUPLICATE');
    seen.add(name);
    if (name === '--execute') options.execute = true;
    else {
      if (!names[name] || !argv[i + 1] || argv[i + 1].startsWith('--')) throw fail('CLI_INVALID');
      options[names[name]] = argv[++i];
    }
  }
  options.repeats = Number(options.repeats);
  if (!options.out || !options.corpus || !['ollama', 'vllm'].includes(options.backend)
    || ![1, 2].includes(options.repeats)) throw fail('CLI_INVALID');
  options.model ||= options.backend === 'ollama' ? 'qwen3.8:27b' : 'nvidia/Qwen3.8-27B-NVFP4';
  const url = new URL(options.url || (options.backend === 'ollama' ? 'http://127.0.0.1:11434' : 'http://127.0.0.1:8001'));
  if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || url.username || url.password
    || url.pathname !== '/' || url.search || url.hash) throw fail('LOOPBACK_ROOT_REQUIRED');
  options.url = url.origin;
  options.out = path.resolve(options.out);
  options.repo = path.resolve(options.repo);
  return options;
}
function validate(corpus) {
  if (corpus.version !== 1 || corpus.readyForScoring !== false || corpus.historicalPromptReplay !== false
    || !Array.isArray(corpus.cases) || !corpus.cases.length || corpus.cases.length > 20) throw fail('CORPUS_INVALID');
  const ids = new Set();
  for (const item of corpus.cases) {
    if (!/^[a-zA-Z0-9_-]+$/.test(item.id) || ids.has(item.id)
      || hash(JSON.stringify(item.messages)) !== item.messagesSha256) throw fail('PROMPT_INVALID');
    ids.add(item.id);
    if (!Array.isArray(item.context?.passages) || item.context.passages.some(p => p.endMs > item.anchorMs)
      || item.revisions.some(p => p.publishedAtMs > item.anchorMs || p.endMs > item.anchorMs)) throw fail('FUTURE_CONTEXT_REFUSED');
  }
  const settings = corpus.settings;
  if (settings.temperature !== 0 || settings.thinking !== false || settings.numCtx !== 16384
    || !Number.isInteger(settings.maxOutputTokens) || settings.maxOutputTokens < 1 || settings.maxOutputTokens > 1024
    || !(settings.requestTimeoutMs > 0 && settings.requestTimeoutMs <= 90000)
    || !(settings.budgetMs > 0 && settings.budgetMs <= 1200000) || settings.maxConsecutiveErrors !== 3) throw fail('BUDGET_INVALID');
}
function payload(options, corpus, item) {
  const shared = { model: options.model, messages: item.messages, stream: false };
  if (options.backend === 'ollama') return { ...shared, format: corpus.schema, think: false, keep_alive: '10m',
    options: { temperature: 0, num_ctx: corpus.settings.numCtx, num_predict: corpus.settings.maxOutputTokens } };
  return { ...shared, temperature: 0, max_tokens: corpus.settings.maxOutputTokens,
    chat_template_kwargs: { enable_thinking: false },
    response_format: { type: 'json_schema', json_schema: { name: 'tvlens_answer', strict: true, schema: corpus.schema } } };
}
async function request(url, body, file, signal, entry) {
  const started = performance.now();
  const response = await fetch(url, { method: body ? 'POST' : 'GET', redirect: 'error', signal,
    headers: body ? { 'Content-Type': 'application/json' } : {}, ...(body && { body: JSON.stringify(body) }) });
  entry.httpStatus = response.status;
  entry.headersReceivedMs = performance.now() - started;
  entry.fixtureServer = response.headers.get('x-tvlens-fixture') === 'true';
  await save(file + '.http.json', { httpStatus: entry.httpStatus, headersReceivedMs: entry.headersReceivedMs });
  const chunks = [];
  let bytes = 0;
  const output = await fs.open(file, 'wx', 0o600);
  try {
    for await (const chunk of response.body) {
      signal.throwIfAborted();
      bytes += chunk.length;
      if (bytes > 4194304) throw fail('RESPONSE_TOO_LARGE');
      chunks.push(chunk);
      await output.write(chunk);
    }
  } finally { await output.close(); }
  entry.responseBytes = bytes;
  const raw = Buffer.concat(chunks);
  entry.responseSha256 = hash(raw);
  if (!response.ok) throw fail('HTTP_' + response.status);
  try { return JSON.parse(raw.toString()); } catch { throw fail('JSON_INVALID'); }
}
function decode(data, backend, readAnswer) {
  const message = backend === 'ollama' ? data.message : data.choices?.[0]?.message;
  if (message?.tool_calls?.length) throw fail('TOOL_CALL_REFUSED');
  const finishReason = backend === 'ollama' ? data.done_reason : data.choices?.[0]?.finish_reason;
  if (finishReason === 'length') throw fail('OUTPUT_TRUNCATED');
  if (finishReason !== 'stop') throw fail('TERMINATION_UNCONFIRMED');
  if ((backend === 'ollama' && data.done !== true) || message?.role !== 'assistant'
    || typeof message.content !== 'string') throw fail('MESSAGE_INVALID');
  return { answer: readAnswer(message.content), finishReason: finishReason ?? null,
    model: data.model ?? null, usage: data.usage ?? null,
    ollamaTimings: backend === 'ollama' ? Object.fromEntries(['total_duration', 'load_duration', 'prompt_eval_duration',
      'eval_duration', 'prompt_eval_count', 'eval_count'].map(key => [key, data[key] ?? null])) : null,
    thinkingChars: (message.reasoning || message.reasoning_content || message.thinking || '').length };
}
async function callCase(options, corpus, item, repeat, controller, readAnswer) {
  const folder = path.join(options.out, `${repeat}-${item.id}`);
  await fs.mkdir(folder);
  const entry = { id: randomUUID(), caseId: item.id, repeat, started: clock(), status: 'running',
    messagesSha256: item.messagesSha256, question: item.question, firstTokenMs: null, quality: null };
  const body = payload(options, corpus, item);
  await save(path.join(folder, 'request.json'), body);
  await save(path.join(folder, 'result.json'), entry);
  const timeout = new AbortController();
  const timer = setTimeout(() => timeout.abort(fail('REQUEST_TIMEOUT')), corpus.settings.requestTimeoutMs);
  const signal = AbortSignal.any([controller.signal, timeout.signal]);
  try {
    signal.throwIfAborted();
    const route = options.backend === 'ollama' ? '/api/chat' : '/v1/chat/completions';
    const data = await request(options.url + route, body, path.join(folder, 'response.raw.json'), signal, entry);
    signal.throwIfAborted();
    if (data.model !== options.model) throw fail('MODEL_MISMATCH');
    Object.assign(entry, decode(data, options.backend, readAnswer));
    entry.citationChecks = entry.answer.citations.map(c => ({ ...c, withinProvidedEvidence: item.context.passages.some(p =>
      p.id === c.id && c.startMs >= p.startMs - 1 && c.endMs <= p.endMs + 1 && c.endMs > c.startMs) }));
    entry.status = 'returned';
  } catch (error) {
    entry.status = signal.aborted ? 'cancelled' : 'error';
    entry.error = { code: signal.aborted ? (signal.reason?.code || 'CANCELLED') : (error.code || 'REQUEST_FAILED') };
  } finally {
    clearTimeout(timer);
    entry.finished = clock();
    entry.clientTotalMs = entry.finished.monotonicMs - entry.started.monotonicMs;
    await save(path.join(folder, 'result.json'), entry);
  }
  return entry;
}
async function inventory(options, signal, phase) {
  const entry = {};
  const route = options.backend === 'ollama' ? '/api/tags' : '/v1/models';
  const data = await request(options.url + route, null, path.join(options.out, phase + '-models.raw.json'),
    AbortSignal.any([signal, AbortSignal.timeout(5000)]), entry);
  const models = options.backend === 'ollama' ? data.models?.map(m => m.name) : data.data?.map(m => m.id);
  if (!models?.includes(options.model)) throw fail('MODEL_NOT_LISTED');
  return { ...entry, data };
}
async function integrity(directory) {
  const files = {};
  async function walk(folder) {
    for (const item of await fs.readdir(folder, { withFileTypes: true })) {
      const file = path.join(folder, item.name);
      if (item.isDirectory()) await walk(file);
      else files[path.relative(directory, file)] = hash(await fs.readFile(file));
    }
  }
  await walk(directory);
  await save(path.join(directory, 'integrite.json'), { sealedAtUtc: new Date().toISOString(), files });
}
async function run(options) {
  const raw = await fs.readFile(options.corpus);
  const corpus = JSON.parse(raw);
  validate(corpus);
  await fs.mkdir(options.out, { mode: 0o700 });
  const report = { id: randomUUID(), started: clock(), mode: options.execute ? 'execution' : 'validation',
    backend: options.backend, model: options.model, corpusSha256: hash(raw), readyForScoring: false,
    nodeVersion: process.version, platform: process.platform, architecture: process.arch,
    complete: false, successfulResponses: null, quality: null, cases: [], failures: [], identity: null };
  await fs.writeFile(path.join(options.out, 'corpus.json'), raw, { flag: 'wx' });
  await fs.copyFile(__filename, path.join(options.out, 'sonder.cjs'));
  await save(path.join(options.out, 'campaign.json'), report);
  const controller = new AbortController();
  const stop = () => controller.abort(fail('INTERRUPTED'));
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
  const timer = setTimeout(() => controller.abort(fail('GLOBAL_BUDGET')), corpus.settings.budgetMs);
  try {
    const responseSource = await fs.readFile(path.join(options.repo, 'adapters/ollama/question-response.cjs'));
    if (hash(responseSource) !== corpus.code.sources['adapters/ollama/question-response.cjs']) throw fail('RESPONSE_PARSER_CHANGED');
    const { readAnswer } = require(path.join(options.repo, 'adapters/ollama/question-response.cjs'));
    const { schema } = require(path.join(options.repo, 'adapters/companion-prompt.cjs'));
    if (JSON.stringify(schema) !== JSON.stringify(corpus.schema)) throw fail('SCHEMA_CHANGED');
    if (options.identityFile) {
      const rawIdentity = await fs.readFile(options.identityFile);
      const identity = JSON.parse(rawIdentity);
      report.identity = { sha256: hash(rawIdentity), ...Object.fromEntries(['modelRevision', 'imageDigest', 'vllmVersion',
        'maxModelLen', 'generationConfig', 'fixture'].map(key => [key, identity[key] ?? null])) };
    }
    if (options.execute) {
      report.before = await inventory(options, controller.signal, 'before');
      await save(path.join(options.out, 'campaign.json'), report);
      let consecutiveErrors = 0;
      for (let repeat = 1; repeat <= options.repeats && !controller.signal.aborted; repeat++) {
        for (const item of corpus.cases) {
          if (controller.signal.aborted) break;
          const result = await callCase(options, corpus, item, repeat, controller, readAnswer);
          report.cases.push(result);
          consecutiveErrors = result.status === 'returned' ? 0 : consecutiveErrors + 1;
          await save(path.join(options.out, 'campaign.json'), report);
          await fs.appendFile(path.join(options.out, 'index.jsonl'), JSON.stringify(result) + '\n');
          if (consecutiveErrors >= corpus.settings.maxConsecutiveErrors) controller.abort(fail('CONSECUTIVE_ERRORS'));
        }
      }
      report.complete = !controller.signal.aborted && report.cases.length === corpus.cases.length * options.repeats;
      report.successfulResponses = report.cases.filter(item => item.status === 'returned').length;
    } else report.complete = true;
  } catch (error) {
    report.failures.push({ code: controller.signal.aborted ? controller.signal.reason.code : (error.code || 'PREFLIGHT_FAILED') });
  } finally {
    clearTimeout(timer);
    process.removeListener('SIGINT', stop);
    process.removeListener('SIGTERM', stop);
    report.stopReason = controller.signal.aborted ? controller.signal.reason.code : null;
    report.finished = clock();
    await save(path.join(options.out, 'campaign.json'), report);
    await save(path.join(options.out, 'a-annoter.json'), { readyForScoring: false, corpusSha256: report.corpusSha256,
      rows: report.cases.map(item => ({ caseId: item.caseId, repeat: item.repeat, question: item.question, status: item.status,
        answer: item.answer ?? null, error: item.error ?? null, citationChecks: item.citationChecks ?? null,
        clientTotalMs: item.clientTotalMs, firstTokenMs: null, quality: null, reviewer: null })) });
    await integrity(options.out);
  }
  console.log(JSON.stringify({ out: options.out, complete: report.complete, responses: report.successfulResponses, stopReason: report.stopReason }));
  return report.complete && !report.failures.length && report.cases.every(item => item.status === 'returned') ? 0 : 1;
}
module.exports = { parse, run, payload, validate };
if (require.main === module) {
  Promise.resolve().then(() => run(parse(process.argv.slice(2)))).then(code => { process.exitCode = code; }).catch(error => {
    console.error(JSON.stringify({ error: error.code || 'PROBE_FAILED' }));
    process.exitCode = 1;
  });
}
