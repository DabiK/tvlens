const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createSessionInspection, createSessionPerception } = require('../runtime/session-providers.cjs');
const { loadConfig } = require('../adapters/config.cjs');
const { CodexPerception } = require('../adapters/codex-perception.cjs');
const { LocalVlmAgent } = require('../adapters/local-vlm-agent.cjs');

function options(extra = {}) {
  return { id: 'session', config: { inspectionBackend: 'local',
    localVlm: { url: 'http://127.0.0.1:9', model: 'vision-local', numCtx: 8192 } },
  selectedModels: { inspectionModel: 'codex-selected' }, transcriber: {}, store: {}, ...extra };
}

test('explicit local inspection composes the shared role with its own local agent and actual model', async t => {
  const built = createSessionInspection(options());
  t.after(() => built.inspectorModel.close());
  assert.ok(built.inspectorModel instanceof CodexPerception);
  assert.ok(built.inspectorModel.agent instanceof LocalVlmAgent);
  assert.equal(built.inspectorModel.model, 'vision-local');
  assert.equal(built.inspectorModel.agent.timeoutMs, 45000);
  assert.deepEqual(built.inspector.identity, { role: 'inspection', backend: 'ollama', model: 'vision-local',
    host: '127.0.0.1:9', numCtx: 8192, think: 'default' });
});

test('invalid, incomplete and conflicting local selections are refused before any provider is constructed', () => {
  const forbidden = class { constructor() { assert.fail('no provider for an invalid selection'); } };
  for (const [config, extra] of [
    [{ inspectionBackend: 'invalid' }, {}],
    [{ inspectionBackend: 'local' }, {}],
    [{ inspectionBackend: 'local', localVlm: { url: 'http://127.0.0.1:9' } }, {}],
    [{ inspectionBackend: 'local', localVlm: { url: 'http://127.0.0.1:9', model: 'm', numCtx: NaN } }, {}],
    [options().config, { localInspection: true }],
    [options().config, { smoke: true }],
  ]) {
    assert.throws(() => createSessionInspection(options({ config, ...extra }), {
      CodexPerception: forbidden, LocalVlmAgent: forbidden,
    }), error => ['TVLENS_INSPECTION_CONFIG_INVALID', 'TVLENS_OLLAMA_CONFIG_INVALID'].includes(error.code));
  }
});

const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const sharp = require('sharp');
const { VideoTools } = require('../core/video-tools.cjs');
const { DeepAsk } = require('../core/deep-ask.cjs');
const { consultationFrom } = require('./helpers/memory-consultation.cjs');
const { deferred, failure, tick, bounded } = require('./helpers/wait.cjs');

const request = { startMs: 1000, endMs: 6000, question: 'Quel geste ?' };
const timings = { total_duration: 12345678, load_duration: 1234567, prompt_eval_count: 21, eval_count: 8 };
function content() {
  return { observations: [
    { id: 'moment-1', startMs: 1200, endMs: 1800, text: 'Geste visible.', basis: 'images', inspection: { backend: 'forged' } },
    { id: 'moment-1', startMs: 1500, endMs: 1600, text: 'Paroles rapportées.', basis: 'speech' },
    { id: 'foreign', startMs: 1200, endMs: 1800, text: 'Intrus.', basis: 'images' },
  ], hypotheses: ['Hypothèse prudente.'], limits: ['Identité inconnue.'],
  backend: { kind: 'forged', model: 'forged' }, inspection: { backend: 'forged' },
  clientTimings: { queueMs: -1 }, providerTimings: { loadMs: -1 }, headers: 'PRIVATE_SECRET' };
}
function body(value = content()) {
  return JSON.stringify({ message: { content: JSON.stringify(value) }, ...timings });
}
async function bench(t, { handler, fetchImpl, now, transcribe, configure = config => config } = {}) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tvlens-local-inspection-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const calls = [], speech = [], agents = [], transports = [];
  const server = http.createServer((req, res) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk)).on('end', () => {
      calls.push(JSON.parse(Buffer.concat(chunks).toString()));
      transports.push({ path: req.url, authorization: req.headers.authorization });
      if (handler) handler(calls.at(-1), res);
      else res.end(body());
    });
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
  const url = 'http://127.0.0.1:' + server.address().port;
  const image = await sharp({ create: { width: 120, height: 80, channels: 3, background: 'blue' } }).jpeg().toBuffer();
  await fs.writeFile(path.join(root, 'moment-1.webm'), image);
  const decoder = path.join(root, 'decoder');
  await fs.writeFile(decoder, `#!${process.execPath}
const fs = require('node:fs'), args = process.argv;
fs.copyFileSync(args[args.indexOf('-i') + 1], args.at(-1).replace('%03d', '001'));
`, { mode: 0o700 });
  const audio = Buffer.alloc(44 + 8 * 32000);
  audio.write('RIFF'); audio.writeUInt32LE(audio.length - 8, 4); audio.write('WAVEfmt ', 8);
  audio.writeUInt32LE(16, 16); audio.writeUInt16LE(1, 20); audio.writeUInt16LE(1, 22);
  audio.writeUInt32LE(16000, 24); audio.writeUInt32LE(32000, 28); audio.writeUInt16LE(2, 32); audio.writeUInt16LE(16, 34);
  audio.write('data', 36); audio.writeUInt32LE(audio.length - 44, 40);
  const config = await configure({ inspectionBackend: 'local', ffmpeg: decoder,
    localVlm: { url: url + '/PRIVATE_PATH', model: 'vision-local', token: 'PRIVATE_SECRET', numCtx: 8192 } });
  const built = createSessionInspection(options({ config,
  store: { file: id => path.join(root, id + '.webm'), read: async () => ({ audio, frames: [] }) },
  transcriber: { transcribe: async bytes => {
    speech.push(bytes.length);
    return transcribe ? transcribe(bytes) : { text: 'Paroles de l’extrait.', limits: [] };
  } } }), {
    CodexPerception: class extends CodexPerception {
      constructor(settings) {
        assert.ok(settings.agent instanceof LocalVlmAgent, 'the role must never construct its Codex agent/client');
        super(settings);
      }
    },
    LocalVlmAgent: class extends LocalVlmAgent {
      constructor(settings) { super({ ...settings, ...(fetchImpl && { fetchImpl }), ...(now && { now }) }); agents.push(this); }
    },
  });
  t.after(() => built.inspectorModel.close());
  let leases = 0;
  const consultation = consultationFrom({ id: 'session', elapsedMs: 8000, history: [], segments: [
    { id: 'moment-1', startMs: 0, endMs: 8000, available: true, status: 'ready', audioStatus: 'ready',
      observation: { summary: 'Résumé.', transcript: 'Paroles du passage.' } },
  ] });
  const tools = (signal, inspector = built.inspector) => new VideoTools({ consultation, inspector, signal,
    media: { lease: async () => { leases++; return async () => { leases--; }; } } });
  return { ...built, config, calls, transports, agents, tools, speech, leases: () => leases, identity: {
    role: 'inspection', backend: 'ollama', model: 'vision-local', host: new URL(url).host, numCtx: 8192, think: 'default',
  } };
}

test('composed clip reexamination sends its dedicated model and settings while perception keeps its own', async t => {
  const perceptionCalls = [], perceptionTransports = [];
  const server = http.createServer((req, res) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk)).on('end', () => {
      perceptionCalls.push(JSON.parse(Buffer.concat(chunks).toString()));
      perceptionTransports.push({ path: req.url, authorization: req.headers.authorization });
      res.end(body({ summary: 'Un geste visible.', visual: 'Un geste visible.', topic: 'Un geste',
        uncertainty: '', continuity: 'change', topicSummary: 'Un geste visible.' }));
    });
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
  const perceptionUrl = 'http://127.0.0.1:' + server.address().port;
  const f = await bench(t, { configure: async original => {
    const config = await loadConfig({ userData: '/unused', safeStorage: { isEncryptionAvailable: () => false }, environment: {
      TVLENS_PERCEPTION_BACKEND: 'local', TVLENS_INSPECTION_BACKEND: 'local',
      TVLENS_LOCAL_VLM_URL: perceptionUrl + '/PRIVATE_PATH', TVLENS_LOCAL_VLM_MODEL: 'modele-a',
      TVLENS_LOCAL_VLM_NUM_CTX: '8192', TVLENS_LOCAL_VLM_KEEP_ALIVE: '10m', TVLENS_LOCAL_VLM_THINK: 'on',
      TVLENS_LOCAL_INSPECTION_URL: original.localVlm.url.replace('/PRIVATE_PATH', '/INSPECTION_PATH'),
      TVLENS_LOCAL_INSPECTION_MODEL: 'modele-b', TVLENS_LOCAL_INSPECTION_NUM_CTX: '16384',
      TVLENS_LOCAL_INSPECTION_KEEP_ALIVE: '2m', TVLENS_LOCAL_INSPECTION_THINK: 'off', TVLENS_LOCAL_INSPECTION_TOKEN: 'INSPECTION_SECRET',
    } });
    return { ...config, ffmpeg: original.ffmpeg };
  } });
  const perception = createSessionPerception({ ...options({ config: f.config }), overrides: {} }, {
    CodexPerception: class extends CodexPerception {
      constructor(settings) {
        assert.ok(settings.agent instanceof LocalVlmAgent);
        super(settings);
      }
    },
  });
  t.after(() => perception.close());
  const observation = await perception.observeVisual({ id: 'moment-1', startMs: 0, endMs: 8000, frames: [] });
  const tools = f.tools();
  await tools.call('inspect_clip', request);
  assert.deepEqual([...perceptionCalls, ...f.calls].map(input => [input.model, input.options.num_ctx, input.keep_alive, input.think]),
    [['modele-a', 8192, '10m', true], ['modele-b', 16384, '2m', false]]);
  assert.deepEqual([...perceptionTransports, ...f.transports], [
    { path: '/PRIVATE_PATH/api/chat', authorization: undefined },
    { path: '/INSPECTION_PATH/api/chat', authorization: 'Bearer INSPECTION_SECRET' },
  ]);
  assert.equal(f.calls[0].messages[0].images.length, 1);
  assert.equal(observation.metrics.backend.model, 'modele-a');
  const diagnostic = tools.toolMetrics[0].inspection;
  assert.deepEqual(f.inspector.identity, { role: 'inspection', backend: 'ollama', model: 'modele-b',
    host: new URL(f.config.localInspectionVlm.url).host, numCtx: 16384, think: 'off' });
  assert.equal(diagnostic.model, 'modele-b');
  assert.equal(diagnostic.host, f.inspector.identity.host);
  assert.notEqual(diagnostic.host, observation.metrics.backend.host);
  assert.equal(diagnostic.modelCalled, true);
  assert.doesNotMatch(JSON.stringify(diagnostic), /INSPECTION_PATH|INSPECTION_SECRET/);
});

test('without a dedicated model every inspection request and identity keeps the complete perception configuration', async t => {
  const f = await bench(t, { configure: config => ({ ...config, localInspectionVlm: {
    url: 'INVALID_UNUSED_URL', numCtx: NaN, keepAlive: 'unused', think: 'INVALID_UNUSED_THINK', token: 'UNUSED_SECRET',
  }, localVlm: { ...config.localVlm, think: 'on', keepAlive: '3m' } }) });
  const tools = f.tools();
  await tools.call('inspect_clip', request);
  assert.deepEqual(f.inspector.identity, { ...f.identity, think: 'on' });
  const [input] = f.calls;
  assert.equal(f.calls.length, 1);
  assert.deepEqual([input.model, input.options.num_ctx, input.keep_alive, input.think], ['vision-local', 8192, '3m', true]);
  assert.deepEqual(f.transports, [{ path: '/PRIVATE_PATH/api/chat', authorization: 'Bearer PRIVATE_SECRET' }]);
  assert.deepEqual(tools.observations[0].inspection, f.inspector.identity);
});

test('dedicated inspection refuses incomplete or invalid settings by name before constructing any provider', async () => {
  const forbidden = class { constructor() { assert.fail('invalid inspection must construct no provider'); } };
  const valid = { url: 'http://127.0.0.1:9', model: 'modele-b' };
  for (const invalid of [
    { url: null }, { url: 'INVALID_PRIVATE_URL' }, { url: 'file:///PRIVATE_PATH' },
    { url: 'http://PRIVATE_USER:PRIVATE_PASSWORD@127.0.0.1:9' }, { model: ' ' },
    { numCtx: NaN }, { numCtx: 0 }, { numCtx: 1.5 }, { token: 'PRIVATE_SECRET\r\n' },
    { think: 'PRIVATE_INVALID_VALUE' },
  ]) {
    const config = { ...options().config, localInspectionVlm: { ...valid, ...invalid } };
    assert.throws(() => createSessionInspection(options({ config }), { CodexPerception: forbidden, LocalVlmAgent: forbidden }), error => {
      assert.ok(['TVLENS_INSPECTION_CONFIG_INVALID', 'TVLENS_LOCAL_THINK_INVALID'].includes(error.code));
      assert.match(error.message, /TVLENS_LOCAL_INSPECTION_/);
      assert.doesNotMatch(error.message, /PRIVATE/);
      return true;
    });
  }
});

test('an unreachable dedicated inspection returns a named failure without calling the perception model or Codex', async t => {
  const f = await bench(t, { configure: config => ({ ...config,
    localVlm: { ...config.localVlm, keepAlive: '3m', think: 'on' }, localInspectionVlm: {
    url: config.localVlm.url.replace('/PRIVATE_PATH', '/INSPECTION_PATH'), model: 'modele-b',
  } }), handler: (_input, res) => res.destroy() });
  const tools = f.tools();
  await assert.rejects(tools.call('inspect_clip', request), { code: 'TVLENS_LOCAL_VLM_UNREACHABLE' });
  assert.deepEqual(f.calls.map(input => input.model), ['modele-b']);
  assert.deepEqual(f.transports, [{ path: '/INSPECTION_PATH/api/chat', authorization: undefined }]);
  assert.equal(Object.hasOwn(f.calls[0].options, 'num_ctx'), false);
  assert.equal(Object.hasOwn(f.calls[0], 'think'), false);
  assert.equal(f.calls[0].keep_alive, '10m');
  assert.deepEqual(f.inspector.identity, { role: 'inspection', backend: 'ollama', model: 'modele-b',
    host: new URL(f.config.localInspectionVlm.url).host, think: 'default' });
  assert.equal(f.inspectorModel.model, 'modele-b');
  const diagnostic = tools.toolMetrics[0].inspection;
  assert.equal(diagnostic.model, 'modele-b');
  assert.equal(diagnostic.failure.code, 'TVLENS_LOCAL_VLM_UNREACHABLE');
  assert.equal(f.inspector.cache.size, 0);
  assert.equal(f.leases(), 0);
});

test('real tools send contact sheets to fake Ollama, admit bounded evidence and preserve provenance through cache and revocation', async t => {
  const f = await bench(t);
  const tools = f.tools();
  const first = await tools.call('inspect_clip', request);
  assert.deepEqual(first.observations.map(o => [o.basis, o.startMs, o.endMs]), [['images', 1200, 1800], ['speech', 0, 8000]]);
  assert.deepEqual(tools.observations[0].inspection, f.identity);
  assert.ok(first.observations.every(observation => !Object.hasOwn(observation, 'inspection')));
  assert.equal(JSON.stringify(first).includes(f.identity.host), false, 'the tool output keeps the internal endpoint out of model context');
  assert.notEqual(first.observations[0], tools.observations[0], 'tool output and retained evidence are distinct objects');
  assert.deepEqual(f.speech, [], 'published passage speech is reused');
  assert.equal(f.calls.length, 1);
  assert.equal(f.agents.length, 1);
  assert.equal(f.calls[0].model, 'vision-local');
  assert.equal(f.calls[0].messages[0].images.length, 1);
  const sheet = await sharp(Buffer.from(f.calls[0].messages[0].images[0], 'base64')).metadata();
  assert.deepEqual([sheet.width, sheet.height], [1200, 868]);
  assert.match(f.calls[0].messages[0].content, /Paroles du passage/);
  const diagnostic = tools.toolMetrics[0].inspection;
  assert.deepEqual(Object.fromEntries(Object.keys(f.identity).map(key => [key, diagnostic[key]])), f.identity);
  assert.deepEqual([diagnostic.exercised, diagnostic.modelCalled, diagnostic.cacheHit], [true, true, false]);
  assert.equal(diagnostic.metrics.providerTimings.rawNs.load_duration, timings.load_duration);
  assert.equal(diagnostic.metrics.modelState, 'unknown');
  assert.ok(diagnostic.metrics.clientTimings.requestMs >= 0);
  assert.doesNotMatch(JSON.stringify(diagnostic), /PRIVATE|forged|Geste|Paroles|base64/);
  const second = await tools.call('inspect_clip', request);
  assert.deepEqual(second.observations, first.observations);
  assert.deepEqual(tools.observations.at(-1).inspection, f.identity);
  assert.equal(JSON.stringify(second).includes(f.identity.host), false, 'cached output also keeps the endpoint private');
  assert.equal(f.calls.length, 1);
  assert.deepEqual([tools.toolMetrics[1].inspection.cacheHit, tools.toolMetrics[1].inspection.modelCalled], [true, false]);
  assert.deepEqual(tools.toolMetrics[1].inspection.metrics, diagnostic.metrics, 'cached metrics describe the original inference');
  assert.equal(f.leases(), 0);
  f.inspector.revoke();
  await assert.rejects(f.tools().call('inspect_clip', request), /Session terminée/);
  assert.equal(f.calls.length, 1);
});

for (const invalid of [false, true]) {
  test(`local inspection diagnostics count private reasoning with ${invalid ? 'invalid' : 'valid'} answer content`, async t => {
    const thought = 'PRIVATE_INSPECTION_REASONING';
    const f = await bench(t, { handler: (_input, res) => {
      const data = JSON.parse(body());
      data.message.thinking = thought;
      if (invalid) data.message.content = 'not JSON';
      res.end(JSON.stringify(data));
    } });
    const tools = f.tools();
    const pending = tools.call('inspect_clip', request);
    if (invalid) await assert.rejects(pending, { code: 'TVLENS_LOCAL_VLM_RESPONSE_INVALID' });
    else await pending;
    assert.equal(tools.toolMetrics[0].inspection.metrics.thinkingChars, thought.length);
    assert.equal(tools.toolMetrics[0].inspection.think, 'default');
    assert.doesNotMatch(JSON.stringify([tools.toolMetrics, tools.observations, f.calls]), /PRIVATE_INSPECTION_REASONING/);
  });
}

for (const mode of ['http', 'json', 'content']) {
  test(`local inspection ${mode} failure records identity and available metrics without fallback`, async t => {
    const f = await bench(t, { handler: (_input, res) => {
      res.writeHead(mode === 'http' ? 503 : 200);
      if (mode === 'content') res.end(JSON.stringify({ message: { content: '{broken PRIVATE_SECRET' }, ...timings }));
      else res.end(mode === 'http' ? 'PRIVATE_SECRET' : '{broken PRIVATE_SECRET');
    } });
    const tools = f.tools();
    const error = await failure(tools.call('inspect_clip', request));
    assert.equal(error.code, mode === 'http' ? 'TVLENS_LOCAL_VLM_UNAVAILABLE' : 'TVLENS_LOCAL_VLM_RESPONSE_INVALID');
    const diagnostic = tools.toolMetrics[0].inspection;
    assert.equal(diagnostic.backend, 'ollama');
    assert.equal(diagnostic.model, 'vision-local');
    assert.equal(diagnostic.modelCalled, true);
    assert.equal(diagnostic.failure.code, error.code);
    assert.ok(diagnostic.metrics.clientTimings.requestMs >= 0);
    if (mode === 'content') assert.equal(diagnostic.metrics.providerTimings?.rawNs.load_duration, timings.load_duration);
    assert.equal(f.calls.length, 1);
    assert.equal(f.inspector.cache.size, 0);
    assert.equal(f.leases(), 0);
    assert.doesNotMatch(JSON.stringify(tools.toolMetrics), /PRIVATE|base64|Geste/);
  });
}

for (const mode of ['cancel', 'revoke']) {
  test(`a response retained after ${mode} keeps its media lease until actual completion and never becomes cached evidence`, async t => {
    const entered = deferred();
    const f = await bench(t, { handler: (_input, res) => entered.resolve(res),
      fetchImpl: (url, settings) => fetch(url, { ...settings, signal: undefined }) });
    const caller = new AbortController(), tools = f.tools(caller.signal);
    const pending = failure(tools.call('inspect_clip', request));
    const res = await entered.promise;
    if (mode === 'cancel') caller.abort(Error('Annulation pilotée.'));
    else f.inspector.revoke();
    tools.release();
    await tick();
    assert.equal(f.leases(), 1, 'the actual transport still owns the media');
    res.end(body());
    const error = await pending;
    assert.match(error.message, mode === 'cancel' ? /Annulation/ : /Session terminée/);
    assert.equal(f.leases(), 0);
    assert.equal(f.inspector.cache.size, 0);
    assert.deepEqual(tools.observations, []);
    assert.equal(tools.toolMetrics[0].status, 'failed');
  });
}

test('the local 45 second deadline is recorded distinctly with controlled time and no late evidence', async t => {
  const deadline = new AbortController(), entered = deferred();
  const deadlines = [];
  t.mock.method(AbortSignal, 'timeout', ms => { deadlines.push(ms); return deadline.signal; });
  let time = 0;
  const f = await bench(t, { now: () => time, handler: (_input, res) => entered.resolve(res),
    fetchImpl: (url, settings) => fetch(url, { ...settings, signal: undefined }) });
  const tools = f.tools();
  const pending = failure(tools.call('inspect_clip', request));
  const res = await entered.promise;
  time = 45000;
  deadline.abort(new DOMException('Délai piloté.', 'TimeoutError'));
  res.end(body());
  const error = await pending;
  assert.equal(error.name, 'TimeoutError');
  assert.deepEqual(deadlines, [45000]);
  const diagnostic = tools.toolMetrics[0].inspection;
  assert.deepEqual(diagnostic.failure, { code: 'TVLENS_LOCAL_VLM_TIMEOUT', timeoutMs: 45000 });
  assert.deepEqual(diagnostic.metrics.clientTimings, { queueMs: 0, requestMs: 45000 });
  assert.equal(diagnostic.metrics.providerTimings, undefined, 'a late response supplies no successful provider measurements');
  assert.deepEqual(tools.observations, []);
  assert.equal(f.inspector.cache.size, 0);
});

test('question metrics and traces distinguish unexercised inspection and keep the provenance of a cited prior reexamination', async t => {
  const f = await bench(t);
  const traces = [];
  let count = 0;
  const ask = new DeepAsk({
    makeTools: signal => {
      return f.tools(signal, count ? { identity: { role: 'inspection', backend: 'codex', model: 'later-model' },
        inspect: () => assert.fail('reused evidence must not trigger another backend') } : f.inspector);
    },
    agent: { answer: async ({ tools }) => {
      if (count++ === 0) await tools.call('inspect_clip', request);
      return { kind: 'observation', answer: 'Un geste.', citations: [{ id: 'moment-1', startMs: 1200, endMs: 1800 }] };
    } },
    onTrace: (event, fields) => traces.push({ event, ...structuredClone(fields) }),
  });
  const first = ask.start('Quel geste ?', { mode: 'chat' });
  await ask.jobs.find(job => job.id === first.id).done;
  const firstJob = ask.snapshot().jobs[0];
  assert.ok(firstJob.metrics.inspection, 'inspection diagnostics must reach question metrics');
  assert.equal(firstJob.metrics.inspection.backend, 'ollama');
  assert.equal(firstJob.metrics.inspection.exercised, true);
  const second = ask.start('Et ce même geste ?', { mode: 'chat' });
  await ask.jobs.find(job => job.id === second.id).done;
  const secondJob = ask.snapshot().jobs[1];
  assert.equal(secondJob.status, 'done');
  assert.equal(secondJob.metrics.inspection.exercised, false);
  assert.equal(secondJob.metrics.inspection.backend, 'codex');
  assert.equal(secondJob.result.observations[0].inspection.backend, 'ollama');
  assert.equal(f.calls.length, 1);
  const finished = traces.filter(trace => trace.event === 'job.finished');
  assert.equal(finished[0].tools[0].inspection.metrics.providerTimings.rawNs.load_duration, timings.load_duration);
  assert.equal(finished[1].inspection.exercised, false);
  assert.doesNotMatch(JSON.stringify(finished), /PRIVATE|forged|Geste|Paroles|base64/);
});

test('a failed inspection reaches question metrics and traces as a failure with local identity', async t => {
  const f = await bench(t, { handler: (_input, res) => { res.writeHead(503); res.end('PRIVATE_SECRET'); } });
  const traces = [];
  const ask = new DeepAsk({ makeTools: signal => f.tools(signal),
    agent: { answer: ({ tools }) => tools.call('inspect_clip', request) },
    onTrace: (event, fields) => traces.push({ event, ...structuredClone(fields) }),
  });
  ask.start('Quel geste ?', { mode: 'chat' });
  await ask.jobs[0].done;
  const job = ask.snapshot().jobs[0];
  assert.equal(job.status, 'error');
  assert.ok(job.metrics.inspection, 'inspection failure diagnostics must reach question metrics');
  assert.equal(job.metrics.inspection.backend, 'ollama');
  assert.equal(job.metrics.tools[0].inspection.failure.code, 'TVLENS_LOCAL_VLM_UNAVAILABLE');
  assert.equal(traces.find(trace => trace.event === 'job.finished').inspection.backend, 'ollama');
});

test('local perception and local inspection own separate agents and close independently', async t => {
  const { createSessionPerception } = require('../runtime/session-providers.cjs');
  const settings = options();
  settings.config.perceptionBackend = 'local';
  const inspection = createSessionInspection(settings);
  const perception = createSessionPerception({ ...settings, overrides: {} });
  t.after(() => perception.close());
  t.after(() => inspection.inspectorModel.close());
  assert.ok(perception.agent instanceof LocalVlmAgent);
  assert.notEqual(perception.agent, inspection.inspectorModel.agent);
  await inspection.inspectorModel.close();
  let sent = 0;
  perception.agent.fetchImpl = async () => { sent++; return { ok: true, text: async () => body() }; };
  await perception.agent.answer({ instructions: 'Perception indépendante.' });
  assert.equal(sent, 1);
});

test('explicit Codex, smoke and localInspection retain distinct truthful identities', async t => {
  for (const [extra, expected] of [
    [{}, { role: 'inspection', backend: 'codex', model: 'codex-selected' }],
    [{ smoke: true }, { role: 'inspection', backend: 'simulation', model: null, mode: 'smoke' }],
    [{ localInspection: true }, { role: 'inspection', backend: 'simulation', model: null, mode: 'localInspection' }],
  ]) {
    const built = createSessionInspection(options({ config: { inspectionBackend: 'codex' }, ...extra }));
    t.after(() => built.inspectorModel.close?.());
    assert.deepEqual(built.inspector.identity, expected);
    const tools = new VideoTools({ inspector: built.inspector,
      consultation: consultationFrom({ id: 's', elapsedMs: 0, segments: [], history: [] }) });
    assert.deepEqual(tools.inspectionDiagnostics, { ...expected, exercised: false, modelCalled: false, cacheHit: false });
  }
});

test('exact speech uses only excerpt bytes and failed transcription supplies no speech evidence through the local path', async t => {
  const f = await bench(t, { transcribe: () => ({ text: '', limits: ['Transcription indisponible.'], metrics: { failed: true } }) });
  const tools = f.tools();
  const result = await tools.call('inspect_clip', { ...request, exactSpeech: true });
  assert.deepEqual(f.speech, [44 + 5 * 32000]);
  assert.deepEqual(result.observations.map(o => o.basis), ['images']);
  assert.equal(result.intervals[0].speech, undefined);
  assert.ok(result.limits.some(limit => /transcription locale a échoué/.test(limit)));
  assert.equal(tools.toolMetrics[0].speech.failed, 1);
  const repeated = await tools.call('inspect_clip', request);
  assert.equal(repeated.intervals[0].speech.precision, 'segment');
  assert.equal(f.calls.length, 2, 'exact speech and passage speech have distinct caches');
});

test('real local tools retain the inspection count, duration, passage and anchor limits', async t => {
  const f = await bench(t);
  const tools = f.tools();
  await tools.call('inspect_clip', request);
  await tools.call('inspect_clip', request);
  await assert.rejects(tools.call('inspect_clip', request), /deux inspections/);
  assert.equal(f.calls.length, 1);
  const consultation = consultationFrom({ id: 'session', elapsedMs: 40000, history: [],
    segments: Array.from({ length: 10 }, (_, index) => ({ id: 'p' + index, startMs: index * 4000, endMs: (index + 1) * 4000,
      status: 'ready', available: true, observation: { summary: 'Passage.' } })) });
  const bounded = new VideoTools({ consultation, inspector: f.inspector,
    media: { lease: () => assert.fail('invalid bounds must never lease media') } });
  await assert.rejects(bounded.call('inspect_clip', { ...request, startMs: 0, endMs: 21000 }), /20 secondes/);
  await assert.rejects(bounded.call('inspect_clip', { ...request, startMs: 0, endMs: 20000 }), /quatre segments/);
  await assert.rejects(bounded.call('inspect_clip', { ...request, startMs: 38000, endMs: 41000 }), /postérieur/);
  assert.equal(f.calls.length, 1);
});

test('an inspection settling after question cancellation records failure metrics without republishing state or reviving evidence', async t => {
  const entered = deferred(), settled = deferred(), released = deferred(), publications = [];
  const f = await bench(t, { handler: (_input, res) => entered.resolve(res),
    fetchImpl: (url, settings) => fetch(url, { ...settings, signal: undefined }) });
  let toolSet;
  const ask = new DeepAsk({ makeTools: signal => {
    toolSet = f.tools(signal);
    const release = toolSet.release.bind(toolSet);
    toolSet.release = settings => { release(settings); released.resolve('released'); };
    return toolSet;
  },
    agent: { answer: ({ tools }) => tools.call('inspect_clip', request) },
    onChange: snapshot => publications.push(structuredClone(snapshot)),
    onTrace: event => { if (event === 'inspection.settled') settled.resolve('recorded'); },
  });
  ask.start('Quel geste ?', { mode: 'chat' });
  const res = await entered.promise;
  ask.cancel();
  await ask.jobs[0].done;
  assert.equal(f.leases(), 1);
  const publicationCount = publications.length;
  res.end(body());
  assert.equal(await bounded(settled.promise), 'recorded');
  assert.equal(await bounded(released.promise), 'released');
  assert.equal(publications.length, publicationCount, 'late diagnostic settlement must not publish or trigger a checkpoint');
  const job = ask.snapshot().jobs[0];
  assert.equal(job.status, 'cancelled');
  assert.equal(job.metrics.tools.length, 1, 'late tool metrics must remain visible after the question ended');
  assert.equal(job.metrics.tools[0].status, 'failed');
  assert.equal(job.metrics.inspection.failure.code, 'TVLENS_INSPECTION_CANCELLED');
  assert.equal(job.result, null);
  assert.deepEqual(toolSet.observations, []);
  assert.equal(f.inspector.cache.size, 0);
  assert.equal(f.leases(), 0);
});

test('inspection diagnostics retain only numeric measures even when a role receives hostile metric fields', async () => {
  const { InspectionDiagnostics } = require('../adapters/perception/inspection-diagnostics.cjs');
  const emitted = [];
  const inspector = new InspectionDiagnostics({ inspect: async ({ onDiagnostic }) => {
    onDiagnostic({ exercised: true, modelCalled: true, metrics: {
      backend: { kind: 'forged' }, modelState: 'warm',
      clientTimings: { queueMs: 3, requestMs: 'PRIVATE_SECRET', image: 'data:image/jpeg;base64,QUJD' },
      providerTimings: { loadMs: 2, evalTokens: -1, rawNs: { load_duration: 2000000, secret: 'PRIVATE_SECRET' } },
    } });
    return { observations: [] };
  } }, { role: 'inspection', backend: 'codex', model: 'declared-model' });
  const result = await inspector.inspect({ onDiagnostic: diagnostic => emitted.push(diagnostic) });
  assert.deepEqual(result.inspection.metrics, { clientTimings: { queueMs: 3 },
    providerTimings: { loadMs: 2, rawNs: { load_duration: 2000000 } } });
  assert.doesNotMatch(JSON.stringify(emitted), /PRIVATE|base64|forged|warm/);
});

for (const mode of ['cache', 'budget', 'interval', 'question']) {
  test(`question inspection summary retains model usage and measurements after a later ${mode} call`, async t => {
    const f = await bench(t), traces = [];
    const ask = new DeepAsk({ makeTools: signal => f.tools(signal),
      agent: { answer: async ({ tools }) => {
        await tools.call('inspect_clip', request);
        if (mode === 'cache' || mode === 'budget') await tools.call('inspect_clip', request);
        if (mode === 'budget') await assert.rejects(tools.call('inspect_clip', request), /deux inspections/);
        if (mode === 'interval') await assert.rejects(tools.call('inspect_clip', { ...request, endMs: 9000 }), /postérieur/);
        if (mode === 'question') await assert.rejects(tools.call('inspect_clip', { ...request, question: '' }), /invalide/);
        return { kind: 'observation', answer: 'Un geste.', citations: [{ id: 'moment-1', startMs: 1200, endMs: 1800 }] };
      } },
      onTrace: (event, fields) => traces.push({ event, ...structuredClone(fields) }),
    });
    ask.start('Quel geste ?', { mode: 'chat' });
    await ask.jobs[0].done;
    const job = ask.snapshot().jobs[0];
    assert.equal(job.status, 'done');
    assert.equal(f.calls.length, 1);
    assert.equal(job.metrics.inspection.exercised, true, 'the question retains its exercised inspection');
    assert.equal(job.metrics.inspection.modelCalled, true, 'the question retains its actual model invocation');
    assert.deepEqual(job.metrics.inspection.metrics, job.metrics.tools[0].inspection.metrics);
    const last = job.metrics.tools.at(-1);
    assert.equal(last.inspection.modelCalled, false, 'the last call itself invoked no model');
    assert.equal(last.inspection.exercised, mode === 'cache');
    assert.equal(last.status, mode === 'cache' ? 'completed' : 'failed');
    assert.deepEqual(traces.find(trace => trace.event === 'job.finished').inspection, job.metrics.inspection);
  });
}

test('question inspection summary keeps the latest outcome when a real model call succeeds after a failed one', async t => {
  let calls = 0;
  const f = await bench(t, { handler: (_input, res) => {
    if (++calls === 1) { res.writeHead(503); res.end('{}'); }
    else res.end(body());
  } });
  const tools = f.tools();
  await assert.rejects(tools.call('inspect_clip', request), { code: 'TVLENS_LOCAL_VLM_UNAVAILABLE' });
  await tools.call('inspect_clip', request);
  assert.equal(tools.inspectionDiagnostics.exercised, true);
  assert.equal(tools.inspectionDiagnostics.modelCalled, true);
  assert.equal(tools.inspectionDiagnostics.failure, undefined, 'a new successful outcome replaces the earlier failure');
  assert.deepEqual(tools.inspectionDiagnostics.metrics, tools.toolMetrics.at(-1).inspection.metrics);
});
