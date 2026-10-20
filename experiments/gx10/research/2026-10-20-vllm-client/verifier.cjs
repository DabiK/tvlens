const fs = require('node:fs/promises');
const path = require('node:path');
const http = require('node:http');
const { spawn } = require('node:child_process');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');

const root = __dirname;
const repo = process.cwd();
const out = path.resolve(process.argv[2] || path.join(root, 'preuves/serveur-factice'));
const hash = value => createHash('sha256').update(value).digest('hex');
let active;
const requests = [];
const server = http.createServer(async (req, res) => {
  res.setHeader('x-tvlens-fixture', 'true');
  res.setHeader('Content-Type', 'application/json');
  const model = active.backend === 'vllm' ? 'nvidia/Qwen3.8-27B-NVFP4' : 'qwen3.8:27b';
  if (req.method === 'GET') {
    res.end(JSON.stringify(active.backend === 'vllm' ? { data: [{ id: model }] } : { models: [{ name: model, digest: 'fixture' }] }));
    return;
  }
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const body = JSON.parse(Buffer.concat(chunks));
  requests.push({ test: active.name, url: req.url, body });
  if (active.name === 'interrupt') active.child.kill('SIGTERM');
  if (['timeout', 'budget', 'interrupt'].includes(active.name)) {
    res.on('close', () => { active.connectionClosed = true; });
    return;
  }
  if (active.name === 'http') {
    res.writeHead(503);
    res.end('{"error":"fixture indisponible"}');
    return;
  }
  const answer = { answer: 'Réponse fictive : aucune mesure réelle.', kind: 'insufficient', citations: [], sources: [], limits: ['Fixture.'] };
  const content = active.name === 'malformed' ? '{' : JSON.stringify(answer);
  const finish = active.name === 'truncated' ? 'length' : 'stop';
  const message = { role: 'assistant', content };
  if (active.name === 'tools') message.tool_calls = [{ function: { name: 'inspect_clip', arguments: '{}' } }];
  res.end(JSON.stringify(active.backend === 'vllm'
    ? { model, choices: [{ message, finish_reason: finish }], usage: { prompt_tokens: 20, completion_tokens: 10, total_tokens: 30 } }
    : { model, message, done: true, done_reason: finish, total_duration: 10000000, eval_count: 10, prompt_eval_count: 20 }));
});
async function execute(name, backend, original) {
  const corpus = structuredClone(original);
  corpus.cases = corpus.cases.slice(0, name === 'http' ? 4 : 1);
  corpus.settings.requestTimeoutMs = name === 'timeout' ? 100 : 1000;
  corpus.settings.budgetMs = name === 'budget' ? 100 : 5000;
  const input = path.join(out, name + '-corpus.json');
  await fs.writeFile(input, JSON.stringify(corpus));
  const run = path.join(out, name);
  active = { name, backend, connectionClosed: false };
  const args = [path.join(root, 'sonder.cjs'), '--repo', repo, '--corpus', input, '--backend', backend,
    '--base-url', `http://127.0.0.1:${server.address().port}`, '--out', run, '--execute'];
  const child = spawn(process.execPath, args, { stdio: ['ignore', 'pipe', 'pipe'] });
  active.child = child;
  let stdout = '', stderr = '';
  child.stdout.on('data', chunk => { stdout += chunk; });
  child.stderr.on('data', chunk => { stderr += chunk; });
  const code = await new Promise(resolve => child.on('close', resolve));
  await fs.writeFile(path.join(out, name + '.stdout.txt'), stdout);
  await fs.writeFile(path.join(out, name + '.stderr.txt'), stderr);
  const report = JSON.parse(await fs.readFile(path.join(run, 'campaign.json')));
  return { name, backend, exitCode: code, complete: report.complete, stopReason: report.stopReason,
    statuses: report.cases.map(item => item.status), errors: report.cases.map(item => item.error?.code ?? null),
    firstTokenMs: report.cases.map(item => item.firstTokenMs), connectionClosed: active.connectionClosed };
}
async function main() {
  await fs.mkdir(out);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const corpus = JSON.parse(await fs.readFile(path.join(root, 'corpus.json')));
    const results = [];
    for (const [name, backend] of [['vllm', 'vllm'], ['ollama', 'ollama'], ['http', 'vllm'], ['malformed', 'vllm'],
      ['truncated', 'vllm'], ['tools', 'vllm'], ['timeout', 'vllm'], ['budget', 'vllm'], ['interrupt', 'vllm']]) {
      results.push(await execute(name, backend, corpus));
    }
    assert.deepEqual(results.slice(0, 2).map(item => item.exitCode), [0, 0]);
    assert.ok(results.slice(2).every(item => item.exitCode === 1));
    assert.equal(results[2].stopReason, 'CONSECUTIVE_ERRORS');
    assert.equal(results[2].errors.length, 3);
    assert.equal(results[3].errors[0], 'TVLENS_OLLAMA_ANSWER_INVALID');
    assert.equal(results[4].errors[0], 'OUTPUT_TRUNCATED');
    assert.equal(results[5].errors[0], 'TOOL_CALL_REFUSED');
    assert.equal(results[6].errors[0], 'REQUEST_TIMEOUT');
    assert.equal(results[7].stopReason, 'GLOBAL_BUDGET');
    assert.equal(results[8].stopReason, 'INTERRUPTED');
    assert.ok(results.slice(6).every(item => item.connectionClosed));
    assert.ok(results.every(item => item.firstTokenMs.every(value => value === null)));
    const vllm = requests.find(item => item.test === 'vllm').body;
    const ollama = requests.find(item => item.test === 'ollama').body;
    assert.deepEqual(vllm.messages, ollama.messages);
    assert.deepEqual(vllm.response_format.json_schema.schema, ollama.format);
    assert.equal(vllm.max_tokens, ollama.options.num_predict);
    assert.equal(vllm.chat_template_kwargs.enable_thinking, ollama.think);
    assert.equal(vllm.temperature, ollama.options.temperature);
    assert.ok(requests.every(item => !item.body.tools));
    await fs.writeFile(path.join(out, 'requests.json'), JSON.stringify(requests, null, 2));
    await fs.writeFile(path.join(out, 'verification.json'), JSON.stringify({ utc: new Date().toISOString(), fixtureOnly: true,
      passed: true, sourceSha256: hash(await fs.readFile(path.join(root, 'sonder.cjs'))), results }, null, 2));
    console.log(JSON.stringify({ passed: true, scenarios: results.length, out, realInference: false }));
  } finally {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
