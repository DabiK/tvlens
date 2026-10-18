const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { inspect } = require('node:util');
const { bounded, failure, deferred, tick } = require('./helpers/wait.cjs');
const { LocalVlmAgent } = require('../adapters/local-vlm-agent.cjs');
const { CodexPerception } = require('../adapters/codex-perception.cjs');

// Contract tests against a fake Ollama on loopback: they prove the wire format and the
// failure handling, never the quality or the speed of a real local model.
const MODEL = 'modele-factice', SECRET = 'Bearer JETON_PRIVE';
const image = (data) => ({ type: 'image', url: 'data:image/jpeg;base64,' + data });
async function backend(t, handler) {
  const requests = [];
  const server = http.createServer((req, res) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk)).on('end', () => {
      const request = { method: req.method, path: req.url, headers: req.headers, body: JSON.parse(Buffer.concat(chunks).toString('utf8')),
        closed: new Promise((resolve) => res.on('close', () => resolve(res.writableFinished))) };
      requests.push(request);
      handler(request, res, requests.length);
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => { server.closeAllConnections(); server.close(resolve); }));
  return { url: 'http://127.0.0.1:' + server.address().port, host: '127.0.0.1:' + server.address().port, requests };
}
function reply(res, content, extra = {}) {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ model: MODEL, message: { role: 'assistant', content: typeof content === 'string' ? content : JSON.stringify(content) }, done: true, ...extra }));
}

test('configuration requires a model and a plain http(s) URL, and never echoes a secret', () => {
  assert.throws(() => new LocalVlmAgent(), /URL et modèle requis/);
  assert.throws(() => new LocalVlmAgent({ url: 'http://127.0.0.1:1' }), /URL et modèle requis/);
  assert.throws(() => new LocalVlmAgent({ model: MODEL }), /URL et modèle requis/);
  for (const url of ['ftp://127.0.0.1/', 'pas une url', 'http://utilisateur:MOT_DE_PASSE@127.0.0.1:1'])
    assert.throws(() => new LocalVlmAgent({ url, model: MODEL }), (error) => /URL http\(s\)/.test(error.message) && !/MOT_DE_PASSE/.test(error.message));
  assert.throws(() => new LocalVlmAgent({ url: 'http://127.0.0.1:1', model: MODEL, headers: { Authorization: SECRET.replace(' ', '\n') } }),
    (error) => error.message === 'Backend local : en-têtes invalides.');
});

test('request carries prompt, bare base64 images, schema and private header; result names the backend with timings in ms', { timeout: 10000 }, async (t) => {
  const schema = { type: 'object', additionalProperties: false, properties: { summary: { type: 'string' } }, required: ['summary'] };
  const server = await backend(t, (request, res, n) => reply(res, { summary: 'Une image.', backend: 'usurpé' }, n === 1
    ? { total_duration: 2500000000, load_duration: 1200000000, prompt_eval_count: 321, prompt_eval_duration: 800400000, eval_count: 42, eval_duration: 499600000 }
    : { total_duration: 'inconnu', eval_count: 7 }));
  const agent = new LocalVlmAgent({ url: server.url, model: MODEL, numCtx: 8192, keepAlive: '30m', headers: { Authorization: SECRET } });
  await agent.prepare('session'); await agent.reset();
  assert.equal(server.requests.length, 0, 'prepare and reset send nothing');
  const result = await agent.answer({ sessionId: 'session', instructions: 'Décris.', mediaInput: [image('QUJD'), image('REVGRw==')], outputSchema: schema, signal: AbortSignal.timeout(5000) });
  const [request] = server.requests;
  assert.equal(request.method, 'POST'); assert.equal(request.path, '/api/chat');
  assert.equal(request.headers.authorization, SECRET);
  assert.equal(request.headers['content-type'], 'application/json');
  assert.deepEqual(request.body, { model: MODEL, stream: false, format: schema, keep_alive: '30m', options: { temperature: 0, num_ctx: 8192 },
    messages: [{ role: 'user', content: 'Décris.', images: ['QUJD', 'REVGRw=='] }] });
  assert.equal(result.summary, 'Une image.');
  assert.deepEqual(result.backend, { kind: 'ollama', model: MODEL, host: server.host, numCtx: 8192 });
  assert.deepEqual([result.coldStart, result.connectMs], [false, 0], 'connection facts come from the agent, never from the model output');
  assert.deepEqual(result.providerTimings, { totalMs: 2500, loadMs: 1200, promptEvalMs: 800, evalMs: 500, promptTokens: 321, evalTokens: 42,
    rawNs: { total_duration: 2500000000, load_duration: 1200000000, prompt_eval_duration: 800400000, eval_duration: 499600000 } });
  assert.ok(Number.isFinite(result.elapsedMs) && result.elapsedMs >= 0);
  assert.doesNotMatch(JSON.stringify(result) + inspect(agent, { depth: 6, showHidden: true }), /JETON_PRIVE/);

  // Defaults: no num_ctx, no format; a path prefix is kept in the request but not in the identity.
  const plain = new LocalVlmAgent({ url: server.url + '/prefixe/', model: MODEL });
  const second = await plain.answer({ instructions: 'Encore.' });
  assert.equal(server.requests[1].path, '/prefixe/api/chat');
  assert.equal(server.requests[1].headers.authorization, undefined);
  assert.deepEqual(server.requests[1].body, { model: MODEL, stream: false, keep_alive: '10m', options: { temperature: 0 }, messages: [{ role: 'user', content: 'Encore.', images: [] }] });
  assert.equal(second.backend.host, server.host);
  assert.deepEqual(second.providerTimings, { evalTokens: 7 });
});

test('answers issued together never overlap on the backend and settle in order, whatever the outcome', { timeout: 10000 }, async (t) => {
  let active = 0, peak = 0;
  const settled = [];
  // Slowest first: without the serial tail the requests would overlap and settle in reverse.
  const server = await backend(t, (request, res, n) => {
    peak = Math.max(peak, ++active);
    setTimeout(() => { active--; if (n === 2) { res.writeHead(500); res.end('{}'); } else reply(res, { n }); }, [150, 30, 5][n - 1]);
  });
  const agent = new LocalVlmAgent({ url: server.url, model: MODEL });
  const track = (name) => agent.answer({ instructions: name }).then((value) => { settled.push(name); return value; }, (error) => { settled.push(name); return error; });
  const [first, second, third] = await Promise.all([track('un'), track('deux'), track('trois')]);
  assert.equal(peak, 1);
  assert.deepEqual(server.requests.map((r) => r.body.messages[0].content), ['un', 'deux', 'trois']);
  assert.deepEqual(settled, ['un', 'deux', 'trois']);
  assert.equal(first.n, 1); assert.match(second.message, /HTTP 500/); assert.equal(third.n, 3);
  // elapsedMs spans the request itself (transport + backend time), not the 180 ms spent queued behind the others.
  assert.ok(first.elapsedMs >= 140, String(first.elapsedMs));
  assert.ok(third.elapsedMs < 150, String(third.elapsedMs));
});

test('caller abort rejects promptly with its reason, drops the connection and leaves the agent usable', { timeout: 10000 }, async (t) => {
  let arrived;
  const inFlight = new Promise((resolve) => (arrived = resolve));
  const server = await backend(t, (request, res, n) => (n === 1 ? arrived(request) : reply(res, { ok: true })));
  const agent = new LocalVlmAgent({ url: server.url, model: MODEL });
  t.after(() => agent.close());
  const controller = new AbortController(), reason = Error('Nouvelle question');
  const pending = agent.answer({ instructions: 'lent', signal: controller.signal });
  pending.catch(() => {});
  const request = await bounded(inFlight);
  assert.ok(server.requests.includes(request), 'the backend received the held request');
  controller.abort(reason);
  assert.equal(await bounded(failure(pending)), reason, 'rejection carries the caller reason before any backend response');
  assert.equal(await bounded(request.closed), false, 'the backend sees the connection close before any response');
  assert.equal(await bounded(failure(agent.answer({ instructions: 'jamais envoyé', signal: controller.signal }))), reason);
  assert.equal(server.requests.length, 1);
  assert.equal((await bounded(agent.answer({ instructions: 'suite' }))).ok, true);
});

test('timeout, HTTP error and dropped connection reject with stable messages', { timeout: 10000 }, async (t) => {
  const server = await backend(t, (request, res) => {
    const mode = request.body.messages[0].content;
    if (['500', '404'].includes(mode)) {
      res.writeHead(Number(mode), { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'détail interne ' + request.headers.authorization }));
    }
    else if (mode === 'coupure') res.socket.destroy();
  });
  const impatient = new LocalVlmAgent({ url: server.url, model: MODEL, timeoutMs: 40 });
  await assert.rejects(impatient.answer({ instructions: 'silence' }), { name: 'TimeoutError' });
  assert.equal(await server.requests[0].closed, false, 'the timed-out request is dropped, not left pending on the backend');
  const agent = new LocalVlmAgent({ url: server.url, model: MODEL, headers: { Authorization: SECRET } });
  for (const status of [500, 404]) {
    const error = await failure(agent.answer({ instructions: String(status) }));
    assert.equal(error.message, `Backend local indisponible (HTTP ${status}).`);
    assert.equal(error.code, 'TVLENS_LOCAL_VLM_UNAVAILABLE');
    assert.equal(require('../adapters/local-vlm-agent.cjs').TVLENS_LOCAL_VLM_UNAVAILABLE, error.code);
    assert.equal(error.httpStatus, status);
    assert.equal('status' in error, false);
  }
  const unreachable = await failure(agent.answer({ instructions: 'coupure' }));
  assert.deepEqual([unreachable.message, unreachable.cause], ['Backend local injoignable.', undefined]);
  assert.equal(unreachable.code, 'TVLENS_LOCAL_VLM_UNREACHABLE');
  assert.equal(require('../adapters/local-vlm-agent.cjs').TVLENS_LOCAL_VLM_UNREACHABLE, unreachable.code);
});

test('a body that is not JSON, has no string content or no JSON object is rejected as invalid', { timeout: 10000 }, async (t) => {
  const bodies = ['<html>indisponible</html>', 'null', '{"done":true}', '{"message":{"content":{"summary":"objet"}}}', '{"message":{"content":["{}"]}}',
    ...['pas du JSON', '[1,2]', '"texte"', '42', 'null', '{"summary":'].map((content) => JSON.stringify({ message: { content }, done: true }))];
  const server = await backend(t, (request, res, n) => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(bodies[n - 1]); });
  const agent = new LocalVlmAgent({ url: server.url, model: MODEL });
  for (const body of bodies) await assert.rejects(agent.answer({ instructions: 'x' }), (error) => error.message === 'Réponse du modèle local invalide.', body);
  assert.equal(server.requests.length, bodies.length);
});

test('anything but a base64 image data URL is refused before any request', { timeout: 10000 }, async (t) => {
  const server = await backend(t, (request, res) => reply(res, { ok: true }));
  const agent = new LocalVlmAgent({ url: server.url, model: MODEL });
  for (const item of [{ type: 'image', url: 'https://exemple.invalid/a.jpg' }, { type: 'image', url: 'data:image/jpeg;base64,' }, { type: 'image', url: 'data:image/jpeg;base64,QUJD\nREVG' },
    { type: 'image', url: 'data:text/plain;base64,QUJD' }, { type: 'image', url: 'data:image/jpeg,QUJD' }, { type: 'image' }, { type: 'text', text: 'QUJD' }, { type: 'video', url: 'data:image/jpeg;base64,QUJD' }, null])
    await assert.rejects(agent.answer({ instructions: 'x', mediaInput: [image('QUJD'), item] }), {
      message: 'Backend local : image invalide.', code: 'TVLENS_LOCAL_VLM_INPUT_REFUSED',
    }, JSON.stringify(item));
  assert.equal(require('../adapters/local-vlm-agent.cjs').TVLENS_LOCAL_VLM_INPUT_REFUSED, 'TVLENS_LOCAL_VLM_INPUT_REFUSED');
  assert.equal(server.requests.length, 0);
});

test('close aborts the request in flight and refuses every later answer', { timeout: 10000 }, async (t) => {
  let arrived;
  const inFlight = new Promise((resolve) => (arrived = resolve));
  const server = await backend(t, (request) => arrived(request));
  const agent = new LocalVlmAgent({ url: server.url, model: MODEL });
  const pending = agent.answer({ instructions: 'en vol' }), queued = agent.answer({ instructions: 'en file' });
  pending.catch(() => {}); queued.catch(() => {});
  const request = await inFlight;
  await agent.close();
  await assert.rejects(pending, { message: 'Backend local fermé.', code: 'TVLENS_LOCAL_VLM_CLOSED' });
  await assert.rejects(queued, { message: 'Backend local fermé.', code: 'TVLENS_LOCAL_VLM_CLOSED' });
  assert.equal(await request.closed, false);
  await assert.rejects(agent.answer({ instructions: 'après' }), { message: 'Backend local fermé.', code: 'TVLENS_LOCAL_VLM_CLOSED' });
  assert.equal(require('../adapters/local-vlm-agent.cjs').TVLENS_LOCAL_VLM_CLOSED, 'TVLENS_LOCAL_VLM_CLOSED');
  await agent.close();
  assert.equal(server.requests.length, 1);
});

test('seam: CodexPerception builds the prompt and validates the observation inferred by a LocalVlmAgent', { timeout: 10000 }, async (t) => {
  const server = await backend(t, (request, res) => reply(res, { topic: 'Débat économique', continuity: 'change', summary: 'Deux personnes débattent en plateau.',
    visual: 'Plan large du plateau.', uncertainty: 'Identités non confirmées.', topicSummary: 'Débat en plateau sur les prix.' }));
  const perception = new CodexPerception({ agent: new LocalVlmAgent({ url: server.url, model: MODEL }), transcriber: { transcribe: async () => ({ text: '', limits: [] }) } });
  t.after(() => perception.close());
  const result = await perception.observeVisual({ id: 'moment-1', startMs: 8000, endMs: 16000, frames: [{ atMs: 8000, dataUrl: image('QUJD').url }, { atMs: 12000, dataUrl: image('REVG').url }],
    observation: { transcript: 'Bonjour à tous.', uncertainty: '' } });
  assert.equal(result.observation.topic, 'Débat économique');
  assert.equal(result.observation.topicContinuity, 'change');
  assert.equal(result.observation.summary, 'Deux personnes débattent en plateau.');
  assert.equal(result.observation.visual, 'Plan large du plateau.');
  assert.equal(result.observation.transcript, 'Bonjour à tous.');
  assert.equal(result.observation.uncertainty, 'Identités non confirmées.');
  assert.equal(result.topicSummary, 'Débat en plateau sur les prix.');
  const [request] = server.requests;
  assert.equal(server.requests.length, 1);
  assert.deepEqual(request.body.messages[0].images, ['QUJD', 'REVG']);
  assert.match(request.body.messages[0].content, /Bonjour à tous\./);
  assert.equal(request.body.format.type, 'object');
  assert.ok(request.body.format.required.includes('summary'));
});

// Chaque frontière du transport est retenue séparément, sans mesurer le temps de la machine.
function heldTransport(count = 2) {
  const calls = Array.from({ length: count }, () => ({
    started: deferred(), headers: deferred(), reading: deferred(), body: deferred(),
  }));
  let sent = 0;
  const fetchImpl = async (url, { signal }) => {
    const call = calls[sent++];
    call.started.resolve(signal);
    await call.headers.promise;
    return { ok: true, text: () => {
      call.reading.resolve();
      return call.body.promise;
    } };
  };
  return { calls, fetchImpl, sent: () => sent };
}
function localBody(content = { ok: true }, durations = {}) {
  return JSON.stringify({ message: { content: JSON.stringify(content) }, ...durations });
}

test('client timings separate time since answer from HTTP through the entire body without overlapping requests', async (t) => {
  let time = 100;
  const transport = heldTransport();
  const agent = new LocalVlmAgent({ url: 'http://127.0.0.1:9', model: MODEL, now: () => time, fetchImpl: transport.fetchImpl });
  t.after(() => agent.close());
  const [one, two] = transport.calls;
  const first = agent.answer({ instructions: 'un' });
  time = 110;
  await one.started.promise;
  time = 140;
  const second = agent.answer({ instructions: 'deux' });
  await tick();
  assert.equal(transport.sent(), 1);
  time = 170;
  one.headers.resolve();
  await one.reading.promise;
  assert.equal(transport.sent(), 1, 'headers alone do not release serialization');
  time = 210;
  one.body.resolve(localBody({ clientTimings: { queueMs: -1, requestMs: -1 }, elapsedMs: -1 }));
  const firstResult = await first;
  await two.started.promise;
  time = 230;
  two.headers.resolve();
  await two.reading.promise;
  time = 260;
  two.body.resolve(localBody());
  const secondResult = await second;
  assert.deepEqual(firstResult.clientTimings, { queueMs: 10, requestMs: 100 });
  assert.deepEqual(secondResult.clientTimings, { queueMs: 70, requestMs: 50 });
  assert.deepEqual([firstResult.elapsedMs, secondResult.elapsedMs], [100, 50]);
  assert.equal(transport.sent(), 2);
});

test('provider timings retain exact nanoseconds and omit missing or invalid durations instead of inventing zero', async () => {
  const durations = { total_duration: 12345678, load_duration: 1234567, prompt_eval_duration: 3456789, eval_duration: 7654321 };
  let supplied = durations;
  const agent = new LocalVlmAgent({ url: 'http://127.0.0.1:9', model: MODEL,
    fetchImpl: async () => ({ ok: true, text: async () => localBody({ providerTimings: { loadMs: 999, rawNs: { load_duration: 999 } } }, supplied) }) });
  assert.deepEqual((await agent.answer({ instructions: 'un' })).providerTimings, {
    totalMs: 12, loadMs: 1, promptEvalMs: 3, evalMs: 8, rawNs: durations,
  });
  for (const invalid of [undefined, null, '0', -1, NaN, Infinity, {}, []]) {
    supplied = Object.fromEntries(Object.keys(durations).map(key => [key, invalid]));
    assert.deepEqual((await agent.answer({ instructions: 'inconnu' })).providerTimings, {}, String(invalid));
  }
  supplied = { load_duration: 0 };
  assert.deepEqual((await agent.answer({ instructions: 'zéro annoncé' })).providerTimings, { loadMs: 0, rawNs: { load_duration: 0 } });
});

test('local model state stays unknown for positive, zero, absent or invalid loading durations and resists model claims', async () => {
  let supplied;
  const agent = new LocalVlmAgent({ url: 'http://127.0.0.1:9', model: MODEL,
    fetchImpl: async () => ({ ok: true, text: async () => localBody({ modelState: 'warm', coldStart: true, connectMs: 999 }, supplied) }) });
  for (const load_duration of [9000000000, 0, undefined, null, -1, 'inconnu']) {
    supplied = { load_duration };
    const result = await agent.answer({ instructions: 'un' });
    assert.deepEqual([result.modelState, result.coldStart, result.connectMs], ['unknown', false, 0], String(load_duration));
  }
});

test('seam: queued local client and provider timings reach visual metrics without turning a model load into a thread reset', async (t) => {
  let time = 0;
  const arrivals = [deferred(), deferred()];
  const content = { topic: 'Sujet', continuity: 'continue', summary: 'Résumé', visual: 'Image', uncertainty: '',
    topicSummary: 'Cumul', coldStart: true, connectMs: 999, modelState: 'warm', threadReset: true, threadTurn: 1,
    backend: { host: 'usurpé' }, providerTimings: { loadMs: 999 }, clientTimings: { queueMs: -1, requestMs: -1 },
    endpoint: 'CHEMIN_PRIVE', headers: { Authorization: SECRET } };
  const durations = { total_duration: 1100000000, load_duration: 500000000, prompt_eval_duration: 400000000, eval_duration: 200000000 };
  const server = await backend(t, (request, res, n) => {
    if (n <= 2) arrivals[n - 1].resolve(res);
    else reply(res, content);
  });
  const agent = new LocalVlmAgent({ url: server.url + '/CHEMIN_PRIVE', model: MODEL, now: () => time, headers: { Authorization: SECRET } });
  const perception = new CodexPerception({ agent });
  t.after(() => perception.close());
  const segment = n => ({ id: 'moment-' + n, startMs: n * 8000, endMs: (n + 1) * 8000, frames: [],
    context: { activeTopic: { firstId: 'moment-0', recent: [] }, previousTopic: 'Sujet' } });
  const first = perception.observeVisual(segment(1));
  const firstResponse = await arrivals[0].promise;
  time = 20;
  const second = perception.observeVisual(segment(2));
  await tick();
  assert.equal(server.requests.length, 1);
  time = 70;
  reply(firstResponse, content, durations);
  const firstResult = await first;
  const secondResponse = await arrivals[1].promise;
  time = 100;
  reply(secondResponse, content, durations);
  const result = await second;
  assert.deepEqual(firstResult.metrics.clientTimings, { queueMs: 0, requestMs: 70 });
  assert.deepEqual(result.metrics.clientTimings, { queueMs: 50, requestMs: 30 });
  assert.deepEqual(result.metrics.providerTimings, { totalMs: 1100, loadMs: 500, promptEvalMs: 400, evalMs: 200, rawNs: durations });
  assert.deepEqual([result.metrics.modelState, result.metrics.coldStart, result.metrics.connectMs,
    firstResult.metrics.threadReset, result.metrics.threadReset, result.metrics.threadTurn], ['unknown', false, 0, false, false, 2]);
  assert.deepEqual(result.metrics.backend, { kind: 'ollama', model: MODEL, host: server.host });
  assert.doesNotMatch(JSON.stringify([firstResult.metrics, result.metrics]), /JETON_PRIVE|CHEMIN_PRIVE|usurpé/);
  const third = await perception.observeVisual(segment(3));
  assert.deepEqual([third.metrics.modelState, third.metrics.providerTimings, third.metrics.threadTurn, third.metrics.threadReset],
    ['unknown', {}, 3, false]);
});

test('cancelling a queued answer sends nothing for it and preserves serialization and timings for the next admissible call', async (t) => {
  let time = 0;
  const transport = heldTransport();
  const agent = new LocalVlmAgent({ url: 'http://127.0.0.1:9', model: MODEL, now: () => time, fetchImpl: transport.fetchImpl });
  t.after(() => agent.close());
  const first = agent.answer({ instructions: 'retenu' });
  await transport.calls[0].started.promise;
  time = 10;
  const caller = new AbortController(), reason = Error('Question annulée.');
  const refused = failure(agent.answer({ instructions: 'annulé en attente', signal: caller.signal }));
  caller.abort(reason);
  time = 20;
  const third = agent.answer({ instructions: 'admissible' });
  await tick();
  assert.equal(transport.sent(), 1);
  time = 70;
  transport.calls[0].headers.resolve();
  transport.calls[0].body.resolve(localBody());
  await first;
  assert.equal(await refused, reason);
  await transport.calls[1].started.promise;
  time = 90;
  transport.calls[1].headers.resolve();
  transport.calls[1].body.resolve(localBody());
  const result = await third;
  assert.equal(transport.sent(), 2, 'the cancelled queued answer never reaches fetch');
  assert.deepEqual(result.clientTimings, { queueMs: 50, requestMs: 20 });
});

test('seam: bodies delivered after caller cancellation, either deadline or closure never produce an observation or success metrics', async (t) => {
  let deadlines;
  t.mock.method(AbortSignal, 'timeout', delay => deadlines.get(delay).signal);
  const segment = { id: 'moment-1', startMs: 0, endMs: 8000, frames: [],
    context: { activeTopic: { firstId: 'moment-0', recent: [] } } };
  const content = { topic: 'Sujet', continuity: 'continue', summary: 'Résumé', visual: 'Image', uncertainty: '', topicSummary: 'Cumul' };
  for (const stage of ['headers', 'body']) {
    for (const mode of ['caller', 'localDeadline', 'visualDeadline', 'close']) {
      deadlines = new Map([[123, new AbortController()], [321, new AbortController()]]);
      const transport = heldTransport();
      const agent = new LocalVlmAgent({ url: 'http://127.0.0.1:9', model: MODEL, timeoutMs: 321, fetchImpl: transport.fetchImpl });
      const perception = new CodexPerception({ agent, timeoutMs: 123 });
      t.after(() => perception.close());
      const caller = new AbortController(), successes = [];
      const rejected = failure(perception.observeVisual({ ...segment, signal: caller.signal }).then(result => {
        successes.push(result);
        return result;
      }));
      const [one, two] = transport.calls;
      const signal = await one.started.promise;
      if (stage === 'body') {
        one.headers.resolve();
        await one.reading.promise;
      }
      const reason = new DOMException('Abandon piloté.', mode === 'caller' ? 'AbortError' : 'TimeoutError');
      if (mode === 'caller') caller.abort(reason);
      else if (mode === 'localDeadline') deadlines.get(321).abort(reason);
      else if (mode === 'visualDeadline') deadlines.get(123).abort(reason);
      else await perception.close();
      assert.equal(signal.aborted, true, mode + ': ' + stage);
      one.headers.resolve();
      await one.reading.promise;
      one.body.resolve(localBody(content, { load_duration: 9000000000 }));
      const error = await rejected;
      if (mode === 'visualDeadline') {
        assert.deepEqual([error.code, error.cause], ['TVLENS_VISION_TRANSIENT', reason]);
      } else if (mode === 'close') {
        assert.equal(error.code, 'TVLENS_LOCAL_VLM_CLOSED');
      } else assert.equal(error, reason);
      assert.deepEqual(successes, [], mode + ': no observation or success metrics after ' + stage);
      if (mode === 'close') {
        await assert.rejects(perception.observeVisual(segment), { code: 'TVLENS_LOCAL_VLM_CLOSED' });
        assert.equal(transport.sent(), 1);
      } else {
        deadlines = new Map([[123, new AbortController()], [321, new AbortController()]]);
        two.headers.resolve();
        two.body.resolve(localBody(content));
        const next = await perception.observeVisual(segment);
        assert.equal(next.observation.summary, 'Résumé');
        assert.deepEqual([next.metrics.modelState, next.metrics.threadTurn, next.metrics.threadReset], ['unknown', 2, false]);
        assert.equal(transport.sent(), 2);
      }
    }
  }
});
