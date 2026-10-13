const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { inspect } = require('node:util');
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
  assert.deepEqual(result.providerTimings, { totalMs: 2500, loadMs: 1200, promptEvalMs: 800, evalMs: 500, promptTokens: 321, evalTokens: 42 });
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
  const controller = new AbortController(), reason = Error('Nouvelle question');
  const pending = agent.answer({ instructions: 'lent', signal: controller.signal });
  pending.catch(() => {});
  const request = await inFlight;
  const abortedAt = Date.now();
  controller.abort(reason);
  await assert.rejects(pending, (error) => error === reason);
  assert.ok(Date.now() - abortedAt < 1000, 'rejection does not wait for the backend or the timeout');
  assert.equal(await request.closed, false, 'the backend sees the connection close before any response');
  await assert.rejects(agent.answer({ instructions: 'jamais envoyé', signal: controller.signal }), (error) => error === reason);
  assert.equal(server.requests.length, 1);
  assert.equal((await agent.answer({ instructions: 'suite' })).ok, true);
});

test('timeout, HTTP error and dropped connection reject with stable messages', { timeout: 10000 }, async (t) => {
  const server = await backend(t, (request, res) => {
    const mode = request.body.messages[0].content;
    if (mode === '500') { res.writeHead(500, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'détail interne ' + request.headers.authorization })); }
    else if (mode === 'coupure') res.socket.destroy();
  });
  const impatient = new LocalVlmAgent({ url: server.url, model: MODEL, timeoutMs: 40 });
  await assert.rejects(impatient.answer({ instructions: 'silence' }), { name: 'TimeoutError' });
  assert.equal(await server.requests[0].closed, false, 'the timed-out request is dropped, not left pending on the backend');
  const agent = new LocalVlmAgent({ url: server.url, model: MODEL, headers: { Authorization: SECRET } });
  await assert.rejects(agent.answer({ instructions: '500' }), (error) => error.message === 'Backend local indisponible (HTTP 500).');
  await assert.rejects(agent.answer({ instructions: 'coupure' }), (error) => error.message === 'Backend local injoignable.' && error.cause === undefined);
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
    await assert.rejects(agent.answer({ instructions: 'x', mediaInput: [image('QUJD'), item] }), (error) => error.message === 'Backend local : image invalide.', JSON.stringify(item));
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
  await assert.rejects(pending, (error) => error.message === 'Backend local fermé.');
  await assert.rejects(queued, (error) => error.message === 'Backend local fermé.');
  assert.equal(await request.closed, false);
  await assert.rejects(agent.answer({ instructions: 'après' }), (error) => error.message === 'Backend local fermé.');
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
