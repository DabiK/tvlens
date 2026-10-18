const { test } = require('node:test');
const assert = require('node:assert/strict');
const { pause, tick, deferred } = require('./helpers/wait.cjs');
const path = require('node:path');
const os = require('node:os');
const { CodexSessionClient } = require('../adapters/codex-session-client.cjs');
const { CodexAnalysisAgent } = require('../adapters/codex-analysis-agent.cjs');
const { CodexPerception } = require('../adapters/codex-perception.cjs');
const { CodexQuota } = require('../adapters/codex-quota.cjs');

const never = () => new Promise(() => {});
// Never an existing directory: connect() must not link real credentials during tests.
const authHome = path.join(os.tmpdir(), 'tvlens-test-absent-codex-home');
const observation = { topic: 'Sujet', continuity: 'continue', summary: 'Résumé', visual: 'Image', uncertainty: '', topicSummary: 'Cumul' };

// Fake App Server: every factory call is one process. `handle` may answer a request itself (return a
// promise, or throw); returning undefined falls through to the default behaviour.
function fixture({ handle, answer = (params, id) => ({ ok: id }), ...options } = {}) {
  const requests = [], connections = [];
  let threads = 0, turns = 0;
  const rpcFactory = rpc => {
    const connection = { options: rpc, closed: false, n: connections.length + 1 };
    connections.push(connection);
    return { start() {}, send() {}, close() { connection.closed = true; },
      request(method, params) {
        requests.push({ method, params, connection: connection.n });
        const custom = handle?.(method, params, connection);
        if (custom !== undefined) return custom;
        if (method === 'thread/start') return Promise.resolve({ thread: { id: 'thread-' + (++threads) } });
        if (method === 'turn/start') {
          const id = 'turn-' + (++turns), threadId = params.threadId;
          setImmediate(async () => {
            const result = await answer(params, id, connection);
            rpc.onEvent('item/completed', { threadId, turnId: id, item: { type: 'agentMessage', text: JSON.stringify(result) } });
            rpc.onEvent('turn/completed', { threadId, turn: { id, status: 'completed' } });
          });
          return Promise.resolve({ turn: { id } });
        }
        return Promise.resolve({});
      } };
  };
  const client = new CodexSessionClient({ authHome, rpcFactory, ...options });
  const sent = method => requests.filter(r => r.method === method);
  const turn = (extra = {}) => client.answer({ sessionId: 's', instructions: 'Décris.', signal: AbortSignal.timeout(5000), ...extra });
  return { client, requests, connections, sent, turn };
}

test('rotation starts a new thread on the same process and ignores events from the old thread', async () => {
  const f = fixture({ answer: (params, id, connection) => {
    // A late event of the former thread must not be able to answer the new turn.
    if (id === 'turn-2') {
      connection.options.onEvent('item/completed', { threadId: 'thread-1', turnId: id, item: { type: 'agentMessage', text: JSON.stringify({ stale: true }) } });
      connection.options.onEvent('turn/completed', { threadId: 'thread-1', turn: { id, status: 'completed' } });
    }
    return { ok: id };
  } });
  try {
    const first = await f.turn();
    assert.equal(first.threadId, 'thread-1');
    f.client.opened.add('https://example.org/');
    await f.client.rotateThread();
    assert.equal(f.connections.length, 1);
    assert.equal(f.connections[0].closed, false);
    const starts = f.sent('thread/start');
    assert.equal(starts.length, 2);
    assert.deepEqual(starts[1].params, starts[0].params);
    assert.equal(f.client.threadId, 'thread-2');
    assert.equal(f.client.rotations, 1);
    assert.equal(f.client.opened.size, 0);
    assert.deepEqual(f.sent('thread/unsubscribe').map(r => r.params), [{ threadId: 'thread-1' }]);
    const second = await f.turn();
    assert.deepEqual([second.ok, second.stale, second.threadId], ['turn-2', undefined, 'thread-2']);
    assert.deepEqual(f.sent('turn/start').map(r => r.params.threadId), ['thread-1', 'thread-2']);
    assert.equal(f.sent('initialize').length, 1);
  } finally { await f.client.close(); }
});

test('thread/unsubscribe rejecting, never answering or throwing neither delays nor fails the rotation and the next turn', async () => {
  const modes = { reject: () => Promise.reject(Error('Method not found')), hang: never, throw: () => { throw Error('Codex déconnecté.'); } };
  for (const [mode, unsubscribe] of Object.entries(modes)) {
    const f = fixture({ handle: method => method === 'thread/unsubscribe' ? unsubscribe() : undefined });
    try {
      await f.turn();
      await f.client.rotateThread();
      assert.equal(f.sent('thread/unsubscribe').length, 1, mode);
      const next = await f.turn();
      assert.equal(next.threadId, 'thread-2', mode);
      assert.equal(next.coldStart, false, mode);
      assert.equal(f.connections.length, 1, mode);
    } finally { await f.client.close(); }
  }
});

test('a failed thread/start during rotation closes the client; the next turn reconnects and succeeds', async () => {
  const modes = { reject: () => Promise.reject(Error('Codex : requête refusée.')), malformed: () => Promise.resolve({}) };
  for (const [mode, failure] of Object.entries(modes)) {
    let starts = 0;
    const f = fixture({ handle: method => method === 'thread/start' && ++starts === 2 ? failure() : undefined });
    try {
      await f.turn();
      assert.equal(await f.client.rotateThread(), undefined, mode);
      assert.equal(f.connections[0].closed, true, mode);
      assert.deepEqual([f.client.rpc, f.client.ready, f.client.threadId, f.client.dir], [null, null, null, null], mode);
      assert.equal(f.sent('thread/unsubscribe').length, 0, mode);
      const next = await f.turn();
      assert.equal(f.connections.length, 2, mode);
      assert.equal(next.ok, 'turn-2', mode);
      assert.equal(next.coldStart, true, mode);
      assert.equal(f.sent('turn/start').at(-1).connection, 2, mode);
    } finally { await f.client.close(); }
  }
});

test('a rotation requested during a turn waits for it; a turn requested after the rotation runs on the new thread', async () => {
  const running = deferred(), release = deferred();
  const f = fixture({ answer: async (params, id) => { if (id === 'turn-1') { running.resolve(); await release.promise; } return { ok: id }; } });
  try {
    const first = f.turn(), rotation = f.client.rotateThread(), second = f.turn();
    await running.promise;
    for (let i = 0; i < 5; i++) await tick();
    assert.deepEqual(f.requests.map(r => r.method), ['initialize', 'thread/start', 'turn/start']);
    release.resolve();
    const results = await Promise.all([first, rotation, second]);
    assert.deepEqual(results.map(r => r?.threadId), ['thread-1', undefined, 'thread-2']);
    assert.deepEqual(f.requests.map(r => r.method + (r.params.threadId ? ' ' + r.params.threadId : '')),
      ['initialize', 'thread/start', 'turn/start thread-1', 'thread/start', 'thread/unsubscribe thread-1', 'turn/start thread-2']);
    assert.equal(f.connections.length, 1);
  } finally { await f.client.close(); }
});

test('maxRotations recycles the process and reconnects in the background; a turn arriving meanwhile waits for it', async () => {
  const connecting = deferred(), gate = deferred();
  const f = fixture({ maxRotations: 2, handle: (method, params, connection) => {
    if (method !== 'initialize' || connection.n !== 2) return undefined;
    connecting.resolve();
    return gate.promise;
  } });
  try {
    await f.turn();
    await f.client.rotateThread();
    await f.client.rotateThread();
    assert.deepEqual([f.client.rotations, f.client.threadId, f.connections.length], [2, 'thread-3', 1]);
    // The recycling rotation returns without waiting for the reconnect it started.
    await f.client.rotateThread();
    assert.equal(f.connections[0].closed, true);
    assert.equal(f.sent('thread/start').length, 3);
    assert.ok(f.client.ready, 'prepare is started in the background');
    assert.equal(f.client.threadId, null);
    const pending = f.turn();
    await connecting.promise;
    for (let i = 0; i < 5; i++) await tick();
    assert.equal(f.sent('turn/start').length, 1, 'the turn waits for the reconnect');
    gate.resolve({});
    const result = await pending;
    assert.equal(f.connections.length, 2, 'the turn reuses the background reconnect');
    assert.equal(f.sent('initialize').length, 2);
    assert.deepEqual([result.ok, result.threadId, result.coldStart], ['turn-2', 'thread-4', true]);
    assert.equal(f.sent('turn/start').at(-1).connection, 2);
    assert.equal(f.client.rotations, 0);
    await f.client.rotateThread();
    assert.deepEqual([f.client.rotations, f.client.threadId, f.connections.length], [1, 'thread-5', 2]);
  } finally { await f.client.close(); }
});

test('a failed background reconnect is swallowed and the next turn connects again', async () => {
  const f = fixture({ maxRotations: 0, handle: (method, params, connection) =>
    method === 'initialize' && connection.n === 2 ? Promise.reject(Error('Connexion Codex interrompue.')) : undefined });
  try {
    await f.turn();
    await f.client.rotateThread();
    await f.client.ready?.catch(() => {});
    for (let i = 0; i < 5; i++) await tick();
    assert.equal(f.client.ready, null);
    assert.deepEqual(f.connections.map(c => c.closed), [true, true]);
    const result = await f.turn();
    assert.deepEqual([result.ok, result.coldStart, f.connections.length], ['turn-2', true, 3]);
  } finally { await f.client.close(); }
});

test('rotateThread sends nothing when not connected, after close, or while the connection is still being established', async () => {
  const connecting = deferred(), gate = deferred();
  const f = fixture({ handle: method => { if (method !== 'initialize') return undefined; connecting.resolve(); return gate.promise; } });
  try {
    await f.client.rotateThread();
    assert.equal(f.connections.length, 0);
    assert.equal(f.requests.length, 0);
    const warming = f.client.prepare('s');
    await f.client.rotateThread();
    await connecting.promise;
    await f.client.rotateThread();
    assert.deepEqual(f.requests.map(r => r.method), ['initialize']);
    gate.resolve({});
    await warming;
    assert.deepEqual(f.requests.map(r => r.method), ['initialize', 'thread/start']);
    assert.equal((await f.turn()).threadId, 'thread-1');
    await f.client.close();
    const before = f.requests.length;
    await f.client.rotateThread();
    assert.equal(f.requests.length, before);
    assert.equal(f.connections.length, 1);
    assert.equal(f.client.rotations, 0);
  } finally { await f.client.close(); }
});

test('a thread/start answered after a close neither revives the old thread nor closes the next connection', async () => {
  for (const late of ['resolve', 'reject']) {
    const asked = deferred(), gate = deferred();
    let starts = 0;
    const f = fixture({ handle: method => { if (method !== 'thread/start' || ++starts !== 2) return undefined; asked.resolve(); return gate.promise; } });
    try {
      await f.turn();
      const rotation = f.client.rotateThread();
      await asked.promise;
      await f.client.close();
      await f.client.prepare('s');
      const current = f.client.threadId;
      if (late === 'resolve') gate.resolve({ thread: { id: 'thread-late' } }); else gate.reject(Error('Connexion Codex interrompue.'));
      await rotation;
      assert.deepEqual([f.client.threadId, f.client.rotations, f.sent('thread/unsubscribe').length], [current, 0, 0], late);
      assert.deepEqual(f.connections.map(c => c.closed), [true, false], late);
      const next = await f.turn();
      assert.deepEqual([next.threadId, next.coldStart, f.connections.length], [current, false, 2], late);
    } finally { await f.client.close(); }
  }
});

test('quota read is off the turn path: a pending read does not delay the turn, a failing one does not fail it', async () => {
  const pending = new CodexQuota();
  const slow = fixture({ quota: pending, handle: method => method === 'account/rateLimits/read' ? never() : undefined });
  try {
    assert.equal((await slow.turn()).ok, 'turn-1');
    assert.deepEqual(slow.requests.map(r => r.method), ['initialize', 'thread/start', 'account/rateLimits/read', 'turn/start']);
    assert.deepEqual(pending.snapshot().windows, []);
  } finally { await slow.client.close(); }
  const read = new CodexQuota();
  const fast = fixture({ quota: read, handle: method => method === 'account/rateLimits/read'
    ? Promise.resolve({ rateLimits: { limitId: 'codex', primary: { usedPercent: 40, windowDurationMins: 300 } } }) : undefined });
  try {
    await fast.turn();
    assert.equal(read.snapshot().windows[0].remainingPercent, 60);
  } finally { await fast.client.close(); }
  for (const check of [async () => { throw Error('Quota illisible'); }, () => { throw Error('Quota cassé'); }, () => null]) {
    const f = fixture({ quota: { check } });
    try { assert.equal((await f.turn()).ok, 'turn-1'); } finally { await f.client.close(); }
  }
});

test('run reports a cold start with its connection time, then warm turns', async () => {
  const f = fixture({ handle: method => method === 'initialize' ? pause(25).then(() => ({})) : undefined,
    answer: () => ({ coldStart: 'spoofed', connectMs: -1 }) });
  try {
    const first = await f.turn();
    assert.equal(first.coldStart, true);
    assert.ok(first.connectMs >= 20 && first.connectMs <= first.elapsedMs, `connectMs ${first.connectMs} within ${first.elapsedMs}`);
    const second = await f.turn();
    assert.deepEqual([second.coldStart, second.connectMs], [false, 0]);
    await f.client.rotateThread();
    const rotated = await f.turn();
    assert.deepEqual([rotated.coldStart, rotated.connectMs], [false, 0]);
    await f.client.close();
    await f.client.prepare('s');
    const prewarmed = await f.turn();
    assert.deepEqual([prewarmed.coldStart, prewarmed.connectMs], [false, 0]);
    const other = await f.turn({ sessionId: 'other' });
    assert.equal(other.coldStart, true);
    assert.equal(f.connections.length, 3);
  } finally { await f.client.close(); }
});

const segment = (n, firstId) => ({ id: 'moment-' + n, startMs: n * 8000, endMs: (n + 1) * 8000, frames: [],
  context: firstId ? { activeTopic: { firstId, recent: [] }, previousTopic: 'Sujet', previousTopicSummary: null } : undefined });
function fakeAgent({ reset = true } = {}) {
  const agent = { resets: 0, closes: 0, turns: 0, continuity: 'continue', extra: {},
    close: async () => { agent.closes++; },
    answer: async input => { agent.turns++; return input.outputSchema.properties.observations
      ? { observations: [], hypotheses: [], limits: [] } : { ...observation, continuity: agent.continuity, ...agent.extra }; } };
  if (reset) agent.reset = async () => { agent.resets++; };
  return agent;
}

test('perception resets the model context on topic change, discovered transition, inspect and the 20-call bound, never closing a resettable agent', async () => {
  for (const reset of [true, false]) {
    const agent = fakeAgent({ reset }), fresh = () => reset ? agent.resets : agent.closes;
    const perception = new CodexPerception({ agent, transcriber: { transcribe: async () => ({ text: '', limits: [] }) } });
    // First call: the context has served nothing (pre-warm), so it is kept.
    assert.equal((await perception.observeVisual(segment(1, 'moment-0'))).metrics.threadReset, false);
    assert.equal(fresh(), 0);
    assert.equal((await perception.observeVisual(segment(2, 'moment-0'))).metrics.threadReset, false);
    assert.equal(fresh(), 0);
    agent.continuity = 'change';
    assert.equal((await perception.observeVisual(segment(4, 'moment-4'))).metrics.threadReset, true);
    assert.equal(fresh(), 1);
    agent.continuity = 'continue';
    assert.equal((await perception.observeVisual(segment(5, 'moment-4'))).metrics.threadReset, true, 'transition discovered by the previous call');
    assert.equal(fresh(), 2);
    assert.equal((await perception.observeVisual(segment(6, 'moment-4'))).metrics.threadReset, false);
    assert.equal(fresh(), 2);
    await perception.inspect({ question: 'Que voit-on ?', segments: [] });
    assert.equal(fresh(), 3);
    await perception.inspect({ question: 'Et ensuite ?', segments: [] });
    assert.equal(fresh(), 4);
    assert.equal((await perception.observeVisual(segment(7, 'moment-4'))).metrics.threadReset, true, 'inspection invalidates the visual context');
    assert.equal(fresh(), 5);
    assert.equal(reset ? agent.closes : agent.resets, 0);

    const bounded = fakeAgent({ reset }), count = () => reset ? bounded.resets : bounded.closes;
    const long = new CodexPerception({ agent: bounded });
    const flags = [];
    for (let n = 1; n <= 41; n++) flags.push((await long.observeVisual(segment(n, 'moment-0'))).metrics.threadReset);
    assert.deepEqual(flags.flatMap((flag, i) => flag ? [i + 1] : []), [21, 41]);
    assert.equal(count(), 2);
    assert.equal(bounded.turns, 41);
    assert.equal(reset ? bounded.closes : bounded.resets, 0);
  }
});

test('a pre-warmed analysis agent keeps its process across topics: one thread per topic, no cold start', async () => {
  const f = fixture({ answer: () => observation });
  const agent = new CodexAnalysisAgent({ client: f.client });
  const perception = new CodexPerception({ agent, sessionId: 's' });
  try {
    await agent.prepare('s');
    const first = await perception.observeVisual(segment(1));
    const second = await perception.observeVisual(segment(2));
    const third = await perception.observeVisual(segment(3, 'moment-2'));
    assert.equal(f.connections.length, 1);
    assert.equal(f.connections[0].closed, false);
    assert.deepEqual(f.sent('turn/start').map(r => r.params.threadId), ['thread-1', 'thread-2', 'thread-2']);
    assert.deepEqual([first, second, third].map(r => [r.metrics.coldStart, r.metrics.connectMs, r.metrics.threadReset]),
      [[false, 0, false], [false, 0, true], [false, 0, false]]);
    assert.equal(first.observation.summary, 'Résumé');
    for (const key of ['backend', 'providerTimings']) assert.equal(key in first.metrics, false);
  } finally { await perception.close(); }
  assert.equal(f.connections[0].closed, true);
});

test('visual metrics carry the agent cold-start report and copy backend and provider timings as supplied', async () => {
  const agent = fakeAgent();
  const perception = new CodexPerception({ agent });
  const plain = (await perception.observeVisual(segment(1, 'moment-0'))).metrics;
  assert.deepEqual([plain.coldStart, plain.connectMs, plain.threadReset, plain.framesSent, plain.providerUsd], [false, 0, false, 0, null]);
  assert.equal('backend' in plain || 'providerTimings' in plain, false);
  agent.extra = { coldStart: true, connectMs: 1800, backend: { name: 'local-vlm', model: 'qwen' }, providerTimings: { loadMs: 12, evalMs: 340 } };
  const reported = (await perception.observeVisual(segment(2, 'moment-0'))).metrics;
  assert.deepEqual([reported.coldStart, reported.connectMs], [true, 1800]);
  assert.equal(reported.backend, agent.extra.backend);
  assert.equal(reported.providerTimings, agent.extra.providerTimings);
  agent.extra = { coldStart: 'yes', connectMs: 'slow', backend: 'local', providerTimings: 12 };
  const malformed = (await perception.observeVisual(segment(3, 'moment-0'))).metrics;
  assert.deepEqual([malformed.coldStart, malformed.connectMs, 'backend' in malformed, 'providerTimings' in malformed], [false, 0, false, false]);
});

test('transcribe marks a failed transcription explicitly; the legacy combined path stays tolerant', async () => {
  const unavailable = 'Transcription locale indisponible : vérifie Whisper et son modèle.';
  let result = { text: '', limits: [unavailable], metrics: { threads: 4, failed: true } };
  const perception = new CodexPerception({ agent: fakeAgent(), transcriber: { transcribe: async () => result } });
  const input = { ...segment(1, 'moment-0'), audio: new Uint8Array([1]) };
  const failed = await perception.transcribe(input);
  assert.equal(failed.failed, true);
  assert.equal(failed.error, unavailable);
  assert.deepEqual(failed.observation, { transcript: '', audio: 'Paroles indisponibles.', uncertainty: unavailable });
  assert.deepEqual(failed.metrics, { audioCacheHit: false, whisper: { threads: 4, failed: true } });
  assert.equal(failed.cost, 0);
  const combined = await perception.observe(input);
  assert.equal(combined.observation.summary, 'Résumé');
  assert.equal('failed' in combined || 'error' in combined, false);
  assert.equal(combined.metrics.whisper.failed, true);
  for (const ok of [{ text: 'Bonjour', limits: [], cacheHit: true, metrics: { threads: 4 } }, { text: '', limits: ['Aucune piste audio.'] }]) {
    result = ok;
    const spoken = await perception.transcribe(input);
    assert.equal('failed' in spoken || 'error' in spoken, false);
    assert.equal(spoken.observation.transcript, ok.text);
  }
});

test('visual metrics distinguish a cold connection, warm turns, context rotation and reconnection through the real Codex agent', async (t) => {
  let time = 0;
  t.mock.method(Date, 'now', () => time);
  const f = fixture({ handle: method => { if (method === 'initialize') time += 30; },
    answer: () => { time += 20; return { ...observation, coldStart: 'usurpé', connectMs: -1 }; } });
  const perception = new CodexPerception({ agent: new CodexAnalysisAgent({ client: f.client }), sessionId: 's' });
  t.after(() => perception.close());
  const reports = [];
  reports.push(await perception.observeVisual(segment(1, 'moment-0')));
  reports.push(await perception.observeVisual(segment(2, 'moment-0')));
  reports.push(await perception.observeVisual(segment(3, 'moment-3')));
  reports.push(await perception.observeVisual(segment(4, 'moment-3')));
  await f.client.close();
  reports.push(await perception.observeVisual(segment(5, 'moment-3')));
  reports.push(await perception.observeVisual(segment(6, 'moment-3')));
  assert.deepEqual(reports.map(({ metrics }) => [metrics.coldStart, metrics.connectMs, metrics.threadTurn, metrics.threadReset]), [
    [true, 30, 1, true], [false, 0, 2, false], [false, 0, 1, true], [false, 0, 2, false],
    [true, 30, 1, true], [false, 0, 2, false],
  ]);
  assert.deepEqual(f.sent('turn/start').map(request => request.params.threadId),
    ['thread-1', 'thread-1', 'thread-2', 'thread-2', 'thread-3', 'thread-3']);
  assert.equal(f.connections.length, 2);
  for (const { metrics } of reports) {
    assert.equal('clientTimings' in metrics || 'modelState' in metrics, false, 'local measurements are not invented on Codex');
  }
});
