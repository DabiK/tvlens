const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { tick, until } = require('./helpers/wait.cjs');
const { HeadlessRuntime } = require('../runtime/headless-runtime.cjs');
const { RemoteServer } = require('../server/http.cjs');
const { SimulatedSurveillanceAgent } = require('../adapters/simulated-surveillance-agent.cjs');

const token = 'v'.repeat(64);
const SURVEILLANCE_TIMEOUT_MS = 15000;
const gate = () => { let open; const gated = { closed: true, promise: new Promise(resolve => { open = resolve; }) }; gated.open = () => { gated.closed = false; open(); }; return gated; };
const aborted = signal => new Promise((resolve, reject) => { if (signal.aborted) reject(signal.reason); signal.addEventListener('abort', () => reject(signal.reason), { once: true }); });
const digest = async file => createHash('sha256').update(await fs.readFile(file)).digest('hex') + ':' + (await fs.stat(file)).mtimeMs;

const SPOKEN = {
  'moment-1': 'Le chômage des jeunes est à 17 % en France.',
  'moment-2': 'Le déficit atteint 154 milliards d’euros.',
  'moment-3': 'Il est 20 h 30, restez avec nous après la pause.',
  'moment-4': 'La dette dépasse 3 000 milliards d’euros.',
  'moment-5': 'La croissance atteint 2 % cette année.',
  'moment-6': 'Le budget augmente de 4 milliards d’euros.',
};

test('chat and surveillance overlap on the server host: neither holds the other back, their measures stay apart, and the registry ends in final states', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tvlens-server-surveillance-')), sessionsRoot = path.join(root, 'sessions');
  let clock = 0, wall = 1790000000000, chatGate = gate(), verifyGate = null, assembled = 0;
  // Split perception, as in production: speech is published first, the description follows.
  const perception = {
    transcribe: async passage => ({ observation: { transcript: SPOKEN[passage.id] || '' }, elapsedMs: 5 }),
    observeVisual: async () => ({ observation: { topic: 'Économie', topicContinuity: 'continue', summary: 'Débat en plateau.', visual: 'Deux invités face à face.' }, elapsedMs: 4 }),
  };
  const chat = { answer: async ({ question, signal }) => { if (question === 'Question longue') await Promise.race([chatGate.promise, aborted(signal)]); return { answer: 'Réponse à : ' + question, kind: 'explanation', citations: [], limits: [] }; } };
  // The simulated role, with a verification that the test can hold: a lot stays "running" until released.
  const surveillanceAgent = new SimulatedSurveillanceAgent({ verdict: () => 'supported', verifyDelayMs: 1,
    wait: (ms, signal) => (ms && verifyGate?.closed ? Promise.race([verifyGate.promise, aborted(signal)]) : Promise.resolve()) });
  const boot = async () => {
    const runtime = new HeadlessRuntime({ userData: root, sessionsRoot, config: {}, selectedModels: {}, smoke: true, agent: chat, surveillanceAgent, readClock: () => clock, wallClock: () => wall, overrides: { perception } });
    const server = await new RemoteServer({ runtime, token, media: { assemble: async input => { assembled++; return { ...input, clip: Buffer.from('fixture'), frames: [{ atMs: input.startMs, dataUrl: 'data:image/jpeg;base64,YQ==' }], audio: null }; } } }).listen(0, '127.0.0.1');
    return { runtime, server };
  };
  let { runtime, server } = await boot();
  t.after(async () => { chatGate.open(); verifyGate?.open(); await server.close(); await runtime.close(); await fs.rm(root, { recursive: true, force: true }); });
  const req = async (route, body) => {
    const res = await fetch(server.url + route, { method: body === undefined ? 'GET' : 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: res.status, value: await res.json() };
  };
  const state = async () => (await req('/v1/state')).value;
  const block = async n => { clock = n * 8000; wall += 8000; return req('/v1/segments', { sessionId: id, sequence: n, startMs: (n - 1) * 8000, endMs: n * 8000, frames: [{ atMs: (n - 1) * 8000, data: 'YQ==' }] }); };
  const job = questionId => runtime.deep.jobs.find(item => item.id === questionId);

  // Routes: nothing to watch without a session, with a stale session or without an instruction.
  const stale = await req('/v1/surveillance/start', { sessionId: 'x', instruction: 'Vérifie les chiffres.' });
  assert.deepEqual([stale.status, stale.value], [400, { error: 'Session obsolète.' }]);
  const id = (await req('/v1/session/start', {})).value.id, dir = path.join(sessionsRoot, id);
  assert.equal((await req('/v1/surveillance/start', { sessionId: id, instruction: '' })).status, 400);
  assert.deepEqual([(await state()).surveillance.enabled, (await state()).surveillance.activity.state], [false, 'idle']);
  const started = (await req('/v1/surveillance/start', { sessionId: id, instruction: 'Vérifie tous les chiffres qui sont balancés.' })).value.surveillance;
  assert.deepEqual([started.enabled, started.sessionId, started.activation.t0Ms, started.claims, started.lots], [true, id, 0, undefined, undefined], 'the polled block is the compact one');

  // A long question is running. Blocks are still accepted, and the surveillance works through them.
  const long = (await req('/v1/questions', { sessionId: id, question: 'Question longue', anchorMs: 0 })).value.id;
  await until(
    () => job(long).status === 'running',
    'question running',
    { timeoutMs: SURVEILLANCE_TIMEOUT_MS },
  );
  for (const n of [1, 2, 3]) assert.equal((await block(n)).status, 200, 'block ' + n + ' accepted during the question');
  await until(
    () => runtime.session.watch.segments.every(s => s.audioStatus === 'ready'),
    'speech published',
    { timeoutMs: SURVEILLANCE_TIMEOUT_MS },
  );
  // With the description held back by the question, a passage is read on its words after the grace period.
  wall += 10000; runtime.tick();
  await until(
    () => runtime.surveillance.snapshot().counts.sourced === 2 && !runtime.surveillance.snapshot().activity.running,
    'lots finished during the question',
    { timeoutMs: SURVEILLANCE_TIMEOUT_MS },
  );
  let seen = await state();
  assert.deepEqual([seen.chat.jobs[0].status, seen.session.asking], ['running', true]);
  assert.ok(seen.session.segments.some(s => s.visionStatus !== 'ready'), 'descriptions were still held back by the question');
  assert.deepEqual([seen.surveillance.enabled, seen.surveillance.counts.sourced, seen.surveillance.coverage.total, seen.surveillance.coverage.scanned + seen.surveillance.coverage.rescan], [true, 2, 3, 3]);
  assert.ok(seen.surveillance.overlay.cards.length >= 1 && seen.surveillance.overlay.cards.every(card => card.kind === 'verification' && card.sources.length));
  let registry = (await req('/v1/surveillance')).value;
  assert.deepEqual(registry.claims.map(c => [c.origin.passageId, c.status]), [['moment-1', 'sourced'], ['moment-2', 'sourced']], 'the clock time of moment-3 is not a claim');
  assert.ok(registry.metrics.overlap.detectsDuringChat >= 1 && registry.metrics.overlap.lotsStartedDuringChat >= 1, 'counted as overlap, used for no decision');
  assert.equal(job(long).status, 'running', 'the surveillance did not end or cancel the question');

  // The question ends: only then is the flag lowered. Descriptions arrive, each passage is read once more at most.
  chatGate.open(); await job(long).done;
  await until(
    () => runtime.session.watch.segments.every(s => !['queued', 'analyzing'].includes(s.visionStatus))
      && !runtime.surveillance.snapshot().activity.detecting,
    'descriptions published',
    { timeoutMs: SURVEILLANCE_TIMEOUT_MS },
  );
  seen = await state();
  // The oldest description was shed while the question held the lane: it stays a passage read on its words.
  assert.deepEqual(seen.session.segments.map(s => [s.id, s.status, s.visionStatus]), [['moment-1', 'partial', 'skipped'], ['moment-2', 'ready', 'ready'], ['moment-3', 'ready', 'ready']]);
  assert.deepEqual([seen.session.asking, seen.surveillance.counts.sourced, seen.surveillance.totals.claims, seen.surveillance.coverage.scanned, seen.surveillance.coverage.rescan], [false, 2, 2, 3, 0], 'the second reading found nothing new');

  // Reciprocal: a verification lot is stuck, a question is asked and answered at once.
  verifyGate = gate();
  assert.equal((await block(4)).status, 200);
  await until(
    () => runtime.surveillance.snapshot().activity.running === 1,
    'lot stuck',
    { timeoutMs: SURVEILLANCE_TIMEOUT_MS },
  );
  assert.equal((await state()).session.asking, false, 'surveillance work never raises the question flag');
  const quick = (await req('/v1/questions', { sessionId: id, question: 'Question rapide', anchorMs: 0 })).value.id;
  await job(quick).done;
  seen = await state();
  assert.deepEqual([job(quick).status, job(quick).metrics.waitMs, job(quick).metrics.totalMs], ['done', 0, 0], 'no wait behind the stuck lot, on the host clock');
  assert.deepEqual([seen.surveillance.activity.state, seen.surveillance.activity.running, seen.surveillance.counts.running], ['verifying', 1, 1], 'and the question did not cancel the lot');
  // Two sets of measures, never merged: the question knows nothing of the lots, and the reverse.
  registry = (await req('/v1/surveillance')).value;
  assert.deepEqual(Object.keys(job(quick).metrics).filter(key => /lot|claim|verify|detect/i.test(key)), []);
  assert.deepEqual([registry.metrics.verify.lots, registry.metrics.verify.sourced, registry.metrics.verify.claimToResultMs.n, registry.metrics.detect.claimsAccepted], [3, 2, 2, 3]);
  assert.deepEqual([Object.keys(registry.metrics).sort(), registry.metrics.verify.waitMs.n], [['detect', 'overlap', 'verify'], 3]);

  // The ambient display polls this alone: small, and revalidated like the state.
  const overlay = await fetch(server.url + '/v1/surveillance/overlay', { headers: { Authorization: 'Bearer ' + token } });
  const shown = JSON.parse(await overlay.text());
  assert.deepEqual(Object.keys(shown).sort(), ['accepting', 'activity', 'elapsedMs', 'enabled', 'overlay', 'readOnly', 'registry', 'revision', 'serverNowMs', 'sessionId', 'signals', 'storage'].sort());
  assert.deepEqual([shown.registry, typeof shown.registry.ready, typeof shown.registry.persisted], [seen.surveillance.registry, 'boolean', 'boolean'], 'the overlay route says how the registry is kept, as the state does');
  assert.deepEqual([shown.sessionId, shown.enabled, shown.accepting, shown.activity.state, shown.overlay.cards.length, shown.signals.cards, shown.storage, shown.serverNowMs], [id, true, true, 'verifying', seen.surveillance.overlay.cards.length, [], { state: 'unknown' }, wall]);
  assert.ok(JSON.stringify(shown).length < 8000);
  assert.equal((await fetch(server.url + '/v1/surveillance/overlay', { headers: { Authorization: 'Bearer ' + token, 'If-None-Match': overlay.headers.get('etag') } })).status, 304);

  // History and detail come from memory: grouped results, then every claim that is in none of them.
  await req('/v1/surveillance/stop', { sessionId: id });
  verifyGate.open(); await tick();
  const stopped = (await state()).surveillance;
  assert.deepEqual([stopped.enabled, stopped.activity.state, stopped.counts.cancelled, stopped.counts.sourced, stopped.counts.running + stopped.counts.queued + stopped.counts.detected], [false, 'stopped', 1, 2, 0]);
  const history = (await req('/v1/surveillance/history', { sessionId: id })).value;
  assert.deepEqual(history.items.map(item => [item.kind, item.status, item.overlay, item.claimCount]), [['claim', 'cancelled', false, 1], ['lot', 'sourced', true, 1], ['lot', 'sourced', true, 1]]);
  assert.deepEqual([history.items[0].text.includes('3 000 milliards'), history.items[0].startMs, history.items[0].endMs, history.items[0].reason, history.nextBeforeSeq], [true, 24000, 32000, 'Surveillance arrêtée.', null]);
  const page = (await req('/v1/surveillance/history', { sessionId: id, limit: 1 })).value;
  assert.deepEqual([page.items.length, page.nextBeforeSeq], [1, history.items[0].seq]);
  assert.deepEqual((await req('/v1/surveillance/history', { sessionId: id, limit: 50, beforeSeq: page.nextBeforeSeq })).value.items, history.items.slice(1));
  const lotId = history.items.at(-1).id, detail = (await req('/v1/surveillance/detail', { sessionId: id, id: lotId })).value;
  assert.deepEqual([detail.kind, detail.lot.id, detail.lot.kind, detail.claims.map(c => c.status), detail.claims[0].sources.length > 0, detail.lot.text.length > 0], ['lot', lotId, 'verification', detail.lot.claimIds.map(() => 'sourced'), true, true]);
  assert.equal((await req('/v1/surveillance/detail', { sessionId: id, id: 'lot-99' })).status, 404);
  assert.equal((await req('/v1/surveillance/detail', { sessionId: id, id: '../session' })).status, 400);

  // An instruction that asks to be told, not to check: a video observation, kept apart from the web
  // checks in the state and typed as such in the history.
  await req('/v1/surveillance/start', { sessionId: id, instruction: 'Préviens-moi quand ils parlent de croissance.' });
  assert.equal((await block(5)).status, 200);
  await until(
    () => runtime.surveillance.snapshot().signals.cards.length === 1,
    'signal noted',
    { timeoutMs: SURVEILLANCE_TIMEOUT_MS },
  );
  const followed = (await state()).surveillance;
  assert.deepEqual([followed.signals.cards.map(card => [card.kind, card.label, card.sources, 'assessments' in card, card.interval]), followed.overlay.cards.every(card => card.kind === 'verification'), followed.overlay.cards.length, followed.counts.noted],
    [[['signal', 'Repéré dans la vidéo', [], false, { startMs: 32000, endMs: 40000 }]], true, stopped.overlay.cards.length, 1]);
  const noted = (await req('/v1/surveillance/history', { sessionId: id, limit: 1 })).value.items[0];
  assert.deepEqual([noted.kind, noted.cardKind, noted.status, noted.label, noted.overlay, noted.sourceCount, noted.startMs, noted.endMs], ['lot', 'signal', 'noted', 'Repéré dans la vidéo', false, 0, 32000, 40000]);

  // Another activation is still working when the session ends: its last states are written before
  // the session closes, and nothing stays "running" in the file.
  verifyGate = gate();
  await req('/v1/surveillance/start', { sessionId: id, instruction: 'Vérifie tous les chiffres qui sont balancés.' });
  assert.equal((await block(6)).status, 200);
  await until(
    () => runtime.surveillance.snapshot().activity.running === 1,
    'last activation working',
    { timeoutMs: SURVEILLANCE_TIMEOUT_MS },
  );
  // Nothing is relaunched by itself: the claim cancelled by the earlier stop goes back to the queue on request.
  const retried = await req('/v1/surveillance/retry', { sessionId: id, id: history.items[0].id });
  assert.deepEqual([retried.status, retried.value.surveillance.counts.cancelled, retried.value.surveillance.counts.queued + retried.value.surveillance.counts.detected], [200, 0, 1]);
  assert.equal((await req('/v1/surveillance/retry', { sessionId: id, id: 'claim-1' })).status, 400, 'a sourced claim is not checked again');
  assert.deepEqual((await req('/v1/session/end', {})).value, { ended: true, id, archived: true });
  verifyGate.open();
  const written = await fs.readFile(path.join(dir, 'surveillance.json'), 'utf8'), saved = JSON.parse(written);
  assert.equal(written, JSON.stringify(saved), 'the registry is rewritten often and grows large: it is written without indentation');
  assert.deepEqual([saved.enabled, saved.sessionId, saved.activation.id, saved.activation.stopReason], [false, id, 'act-3', 'Session terminée.']);
  assert.deepEqual(saved.claims.map(c => [c.origin.passageId, c.status, c.reason]), [['moment-1', 'sourced', null], ['moment-2', 'sourced', null], ['moment-4', 'cancelled', 'Session terminée.'], ['moment-5', 'noted', null], ['moment-6', 'cancelled', 'Session terminée.']]);
  assert.deepEqual([...new Set(saved.lots.map(lot => lot.status))].sort(), ['cancelled', 'done']);
  assert.deepEqual((await state()).surveillance.activity.state, 'idle', 'the ended session takes its registry with it');
  assert.deepEqual(JSON.parse(await fs.readFile(path.join(dir, 'deep-answers.json'), 'utf8')).jobs.map(j => [j.question, j.status]), [['Question longue', 'done'], ['Question rapide', 'done']]);

  // Restart and opening: the registry is shown as it ended, read-only, and its file is not rewritten.
  await server.close(); await runtime.close();
  ({ runtime, server } = await boot());
  const before = await digest(path.join(dir, 'surveillance.json'));
  assert.equal((await req(`/v1/sessions/${id}/open`, {})).status, 200);
  const reopened = (await req('/v1/surveillance')).value;
  assert.deepEqual([reopened.restored, reopened.enabled, reopened.sessionId, reopened.claims.map(c => c.status), reopened.overlay.cards.length, reopened.signals.cards.length], [true, false, id, ['sourced', 'sourced', 'cancelled', 'noted', 'cancelled'], saved.overlay.cards.length, 1]);
  assert.equal((await state()).surveillance.activity.state, 'stopped');
  wall += 5000; runtime.tick(); await tick();
  assert.equal((await req('/v1/sessions/close', {})).value.archived, true);
  assert.equal(await digest(path.join(dir, 'surveillance.json')), before);
});

test('a published surveillance card invalidates the entity tags of the polled views and of the ambient overlay, while a second that merely passes is still answered 304', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tvlens-surveillance-etag-')), sessionsRoot = path.join(root, 'sessions');
  let clock = 0, wall = 1790000000000;
  const verifyGate = gate();
  const perception = {
    transcribe: async passage => ({ observation: { transcript: SPOKEN[passage.id] || '' }, elapsedMs: 5 }),
    observeVisual: async () => ({ observation: { topic: 'Économie', topicContinuity: 'continue', summary: 'Débat en plateau.', visual: 'Deux invités face à face.' }, elapsedMs: 4 }),
  };
  // The verification of the only claim is held until the test lets it finish: until then nothing moves but the clock.
  const surveillanceAgent = new SimulatedSurveillanceAgent({ verdict: () => 'supported', verifyDelayMs: 1,
    wait: (ms, signal) => (ms && verifyGate.closed ? Promise.race([verifyGate.promise, aborted(signal)]) : Promise.resolve()) });
  const runtime = new HeadlessRuntime({ userData: root, sessionsRoot, config: { visionDuringAsk: true }, selectedModels: {}, smoke: true, surveillanceAgent, readClock: () => clock, wallClock: () => wall, overrides: { perception },
    agent: { answer: async () => ({ answer: 'ok', kind: 'explanation', citations: [], limits: [] }) } });
  const server = await new RemoteServer({ runtime, token, media: { assemble: async input => ({ ...input, clip: Buffer.from('fixture'), frames: [{ atMs: input.startMs, dataUrl: 'data:image/jpeg;base64,YQ==' }], audio: null }) } }).listen(0, '127.0.0.1');
  t.after(async () => { verifyGate.open(); await server.close(); await runtime.close(); await fs.rm(root, { recursive: true, force: true }); });
  const post = async (route, body) => (await fetch(server.url + route, { method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, body: JSON.stringify(body) })).json();
  // The three resources a client polls, each asked again with the entity tag it holds.
  const polled = async held => Object.fromEntries(await Promise.all(['/v1/state?view=chat', '/v1/state?view=panel', '/v1/surveillance/overlay'].map(async route => {
    const res = await fetch(server.url + route, { headers: { Authorization: 'Bearer ' + token, ...(held ? { 'If-None-Match': held[route].etag } : {}) } }), text = await res.text();
    return [route, { status: res.status, etag: res.headers.get('etag'), bytes: Buffer.byteLength(text), value: text ? JSON.parse(text) : null }];
  })));
  const second = async () => { clock += 1000; wall += 1000; runtime.tick(); for (let i = 0; i < 10; i++) await tick(); };
  const cards = reply => (reply.value ? (reply.value.surveillance || reply.value).overlay.cards : null);

  const { id } = await post('/v1/session/start', {});
  await post('/v1/surveillance/start', { sessionId: id, instruction: 'Vérifie tous les chiffres qui sont balancés.' });
  clock = 8000; wall += 8000;
  assert.equal((await post('/v1/segments', { sessionId: id, sequence: 1, startMs: 0, endMs: 8000, frames: [{ atMs: 0, data: 'YQ==' }] })).id, 'moment-1');
  // Passage analysed and saved, claim found, its verification stuck at the gate.
  await until(
    () => runtime.session.watch.segments[0].status === 'ready' && !runtime.session.watch.running && runtime.surveillance.snapshot().activity.running === 1,
    'verification under way',
    { timeoutMs: SURVEILLANCE_TIMEOUT_MS },
  );
  await runtime.session.store.serial; await runtime.surveillance.flush(); for (let i = 0; i < 10; i++) await tick();

  const waiting = await polled();
  assert.deepEqual(Object.values(waiting).map(reply => [reply.status, cards(reply).length]), Array(3).fill([200, 0]));
  await second();
  assert.deepEqual(Object.values(await polled(waiting)).map(reply => [reply.status, reply.bytes]), Array(3).fill([304, 0]), 'a second passed, nothing was published');

  // The lot ends: a sourced card is published. Every tag held is refused, and each body carries the card.
  verifyGate.open();
  await until(
    () => runtime.surveillance.snapshot().overlay.cards.length === 1 && !runtime.surveillance.snapshot().activity.running,
    'card published',
    { timeoutMs: SURVEILLANCE_TIMEOUT_MS },
  );
  for (let i = 0; i < 10; i++) await tick();
  const published = await polled(waiting);
  for (const [route, reply] of Object.entries(published))
    assert.deepEqual([reply.status, reply.etag !== waiting[route].etag, reply.bytes > 0, cards(reply)?.map(card => [card.kind, card.sources.length > 0])], [200, true, true, [['verification', true]]], route);
  await second();
  assert.deepEqual(Object.values(await polled(published)).map(reply => [reply.status, reply.bytes]), Array(3).fill([304, 0]), 'and the new tags hold while only the clock moves');
});
