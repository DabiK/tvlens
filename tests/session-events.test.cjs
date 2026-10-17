const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { WatchSession } = require('../core/session.cjs');
const { createEventPublisher } = require('../core/shared/events.cjs');
const { createSessionRuntime } = require('../runtime/session-runtime.cjs');
const { deferred, tick } = require('./helpers/wait.cjs');

const block = index => ({
  startMs: index * 1000, endMs: (index + 1) * 1000, clip: new Uint8Array([1]),
  audio: new Uint8Array([2]), frames: [],
});
const received = index => ({
  type: 'PassageReceived', sessionId: 'session', passageId: `moment-${index + 1}`, revision: 0,
  interval: { startMs: index * 1000, endMs: (index + 1) * 1000 },
});
const visionResult = { observation: { summary: 'Images privées' }, elapsedMs: 2 };
const audioResult = { observation: { transcript: 'Paroles privées' }, elapsedMs: 1 };

async function runtimeFixture(t, extra = {}) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tvlens-events-'));
  const f = { time: 0, states: [], saves: [], calls: [], audio: [deferred(), deferred()], vision: [deferred(), deferred()] };
  f.started = { audio: [deferred(), deferred()], vision: [deferred(), deferred()] };
  const perception = {
    transcribe: async input => {
      f.calls.push(['audio', input.id]);
      f.started.audio[Number(input.id.slice(7)) - 1].resolve(input);
      await f.audio[Number(input.id.slice(7)) - 1].promise;
      return audioResult;
    },
    observeVisual: async input => {
      f.calls.push(['vision', input.id]);
      f.started.vision[Number(input.id.slice(7)) - 1].resolve(input);
      await f.vision[Number(input.id.slice(7)) - 1].promise;
      return visionResult;
    },
  };
  const session = createSessionRuntime({
    id: 'session', sessionsRoot: root, userData: root, smoke: true, localInspection: true,
    selectedModels: {}, readClock: () => f.time, wallClock: () => 10000,
    overrides: { perception }, onPublicationError: () => {},
    onChange: state => { f.states.push(structuredClone(state)); f.onState?.(state); }, ...extra,
  });
  const save = session.store.save.bind(session.store);
  t.mock.method(session.store, 'save', state => { f.saves.push(structuredClone(state)); return save(state); });
  t.after(async () => { await session.close(); await fs.rm(root, { recursive: true, force: true }); });
  return Object.assign(f, { session, root, add: index => {
    f.time = (index + 1) * 1000;
    return session.watch.ingest(block(index));
  } });
}

test('memory records reception only after a complete admission and drains its facts independently of onChange', async t => {
  const writing = deferred(), entered = deferred(), batches = [], states = [], files = new Map();
  const watch = new WatchSession({
    id: 'session', now: () => 2000,
    perception: { transcribe: () => new Promise(() => {}), observeVisual: async () => visionResult },
    media: {
      put: async (id, input) => { entered.resolve(); await writing.promise; files.set(id, input); },
      read: async id => files.get(id), remove: async id => files.delete(id),
    },
    archive: { save: async () => {} },
    onEvents: events => { batches.push(events); states.push(watch.snapshot()); },
    onChange: () => { throw Error('state observer failed'); },
  });
  t.after(() => watch.close());
  const ingesting = watch.ingest(block(0));
  await entered.promise;
  assert.deepEqual(batches, []);
  assert.deepEqual(watch.snapshot().segments, []);
  writing.resolve();
  assert.equal(await ingesting, 'moment-1');
  assert.deepEqual(batches, [[received(0)]]);
  assert.deepEqual(states[0].segments.map(p => [p.id, p.revision, p.status]), [['moment-1', 0, 'queued']]);
  await watch.ingest(block(1));
  watch.emit();
  await watch.prune();
  assert.deepEqual(batches, [[received(0)], [received(1)]], 'later emissions do not replay drained facts');
});

test('an admitted write landing after core closure still delivers its received fact without reviving state publication', async () => {
  const writing = deferred(), entered = deferred(), events = [], saves = [], states = [];
  const watch = new WatchSession({
    id: 'session', now: () => 1000, perception: {},
    media: { put: async () => { entered.resolve(); await writing.promise; } },
    archive: { save: async state => saves.push(state) },
    onEvents: batch => events.push(...batch), onChange: state => states.push(state),
  });
  const ingesting = watch.ingest(block(0));
  await entered.promise;
  await watch.close();
  writing.resolve();
  assert.equal(await ingesting, 'moment-1');
  assert.deepEqual(events, [received(0)]);
  assert.deepEqual(states, []);
  assert.deepEqual(saves.at(-1).segments.map(p => [p.id, p.revision]), [['moment-1', 0]]);
  watch.emit();
  assert.equal(events.length, 1);
});

test('shared composition delivers each reception once while failed subscribers leave both lanes and saves running', async t => {
  const failures = [], delivered = [], completed = deferred();
  const events = createEventPublisher({ onError: failure => failures.push(failure) });
  events.subscribe(() => { throw Error('subscriber threw'); });
  events.subscribe(() => Promise.reject(Error('subscriber rejected')));
  events.subscribe(() => new Promise(() => {}));
  events.subscribe(event => delivered.push(event));
  const f = await runtimeFixture(t, { events });
  f.onState = state => {
    if (state.segments.length === 2 && state.segments.every(p => p.status === 'ready')) completed.resolve();
  };
  await f.add(0);
  await f.add(1);
  assert.deepEqual(delivered, [received(0), received(1)]);
  assert.deepEqual(f.session.watch.snapshot().segments.map(p => p.id), ['moment-1', 'moment-2']);
  assert.deepEqual(f.saves[0].segments.map(p => p.id), ['moment-1']);
  for (const gate of [...f.audio, ...f.vision]) gate.resolve();
  await completed.promise;
  await f.session.pause();
  await f.session.store.flush();
  await tick();
  const state = JSON.parse(await fs.readFile(path.join(f.root, 'session', 'session.json'), 'utf8'));
  assert.deepEqual(state.segments.map(p => [p.audioStatus, p.visionStatus, p.revision]), [
    ['ready', 'ready', 2], ['ready', 'ready', 2],
  ]);
  assert.deepEqual(f.calls, [['audio', 'moment-1'], ['vision', 'moment-1'], ['audio', 'moment-2'], ['vision', 'moment-2']]);
  assert.deepEqual([state.coverage.audioError, state.coverage.visionError, state.lastError], [0, 0, null]);
  assert.equal(failures.length, 4);
  assert.deepEqual(delivered, [received(0), received(1)], 'enrichment, pause and save outcomes add no reception');
  assert.equal(f.session.events, events, 'the public composition exposes its injected publisher');
});

for (const diagnostic of ['throws', 'rejects']) {
  test(`storage refusal suspends admission before delivery and saves despite a diagnostic that ${diagnostic}`, async t => {
    const failures = [], delivered = [], observed = [];
    const f = await runtimeFixture(t, { onPublicationError: failure => {
      failures.push(failure);
      if (diagnostic === 'throws') throw Error('diagnostic threw');
      return Promise.reject(Error('diagnostic rejected'));
    } });
    const { watch, store, events } = f.session;
    const refusal = Object.assign(Error('/private/media: volume plein'), { code: 'TVLENS_STORAGE_FULL' });
    t.mock.method(store, 'put', async () => { throw refusal; });
    events.subscribe(() => { throw Error('subscriber threw'); });
    events.subscribe(() => Promise.reject(Error('subscriber rejected')));
    events.subscribe(() => new Promise(() => {}));
    events.subscribe(event => {
      Reflect.set(event, 'passageId', 'phantom');
      Reflect.set(event.cause, 'code', 'changed');
    });
    events.subscribe(event => { delivered.push(event); observed.push(watch.snapshot()); });
    await assert.rejects(f.add(0), error => error === refusal);
    assert.deepEqual(delivered, [{
      type: 'AdmissionSuspended', sessionId: 'session', passageId: null, revision: null,
      cause: { code: 'TVLENS_STORAGE_FULL' }, interval: { startMs: 0, endMs: 1000 },
    }]);
    assert.deepEqual([observed[0].accepting, observed[0].segments], [false, []]);
    await store.flush();
    const saved = JSON.parse(await fs.readFile(path.join(f.root, 'session', 'session.json'), 'utf8'));
    assert.deepEqual([saved.accepting, saved.segments, saved.coverage.passages], [false, [], 0]);
    assert.deepEqual([refusal.code, refusal.message], ['TVLENS_STORAGE_FULL', '/private/media: volume plein']);
    await assert.rejects(f.add(1), { code: 'TVLENS_SESSION_STOPPED' });
    await tick();
    assert.equal(delivered.length, 1);
    assert.equal(failures.length, 2);
    assert.deepEqual(f.calls, [], 'no phantom passage reaches a provider');
  });
}

test('concurrent storage refusals preserve both original errors but suspend admission only once', async t => {
  const f = await runtimeFixture(t), delivered = [];
  const { watch, store, events } = f.session;
  const refusals = ['first', 'second'].map(message => Object.assign(Error(message), { code: 'TVLENS_STORAGE_FULL' }));
  const put = t.mock.method(store, 'put', async id => { throw refusals[Number(id.slice(7)) - 1]; });
  events.subscribe(event => delivered.push(event));
  const results = await Promise.allSettled([f.add(0), f.add(1)]);
  assert.equal(put.mock.callCount(), 2, 'both already admitted writes reach the store');
  assert.deepEqual(results.map(result => result.status), ['rejected', 'rejected']);
  for (let index = 0; index < refusals.length; index++) {
    assert.equal(results[index].reason, refusals[index]);
    assert.equal(results[index].reason.code, 'TVLENS_STORAGE_FULL');
  }
  assert.deepEqual(delivered, [{
    type: 'AdmissionSuspended', sessionId: 'session', passageId: null, revision: null,
    cause: { code: 'TVLENS_STORAGE_FULL' }, interval: { startMs: 0, endMs: 1000 },
  }]);
  const state = watch.snapshot();
  assert.deepEqual([state.accepting, state.segments, state.coverage.passages], [false, [], 0]);
  await store.flush();
  const saved = JSON.parse(await fs.readFile(path.join(f.root, 'session', 'session.json'), 'utf8'));
  assert.deepEqual([saved.accepting, saved.segments, saved.coverage.passages], [false, [], 0]);
  assert.deepEqual(f.calls, []);
});

for (const closingMethod of ['stop', 'closeIntake', 'close']) {
  test(`storage refusal after ${closingMethod} preserves its error and save without another suspension`, async t => {
    const writing = deferred(), entered = deferred(), delivered = [];
    t.after(() => writing.resolve());
    const f = await runtimeFixture(t);
    const { watch, store, events } = f.session;
    const refusal = Object.assign(Error('storage full during landing'), { code: 'TVLENS_STORAGE_FULL' });
    t.mock.method(store, 'put', async () => { entered.resolve(); await writing.promise; throw refusal; });
    events.subscribe(event => delivered.push(event));
    const ingesting = assert.rejects(f.add(0), error => error === refusal);
    await entered.promise;
    await watch[closingMethod]();
    writing.resolve();
    await ingesting;
    assert.deepEqual(delivered, []);
    const state = watch.snapshot();
    assert.deepEqual([state.accepting, state.segments, state.coverage.passages], [false, [], 0]);
    assert.equal(state.lastError, refusal.message);
    await store.flush();
    const saved = JSON.parse(await fs.readFile(path.join(f.root, 'session', 'session.json'), 'utf8'));
    assert.deepEqual([saved.accepting, saved.segments, saved.lastError], [false, [], refusal.message]);
    assert.deepEqual(f.calls, []);
  });
}

for (const lane of ['audio', 'vision']) {
  test(`closing before a late ${lane} result keeps the received revision and emits no enrichment`, async t => {
    const f = await runtimeFixture(t), delivered = [];
    f.session.events.subscribe(event => delivered.push(event));
    if (lane === 'vision') f.audio[0].resolve();
    await f.add(0);
    const input = await f.started[lane][0].promise;
    const passage = f.session.watch.snapshot().segments[0];
    await f.session.close();
    const published = f.states.length, saved = f.saves.length;
    f[lane][0].resolve();
    await tick();
    assert.equal(input.signal.aborted, true);
    const after = f.session.watch.snapshot().segments[0];
    assert.deepEqual([after.revision, after.observation], [passage.revision, passage.observation]);
    assert.deepEqual([f.states.length, f.saves.length], [published, saved]);
    assert.deepEqual(delivered, [received(0)]);
    assert.deepEqual(f.calls, lane === 'audio' ? [['audio', 'moment-1']] : [['audio', 'moment-1'], ['vision', 'moment-1']]);
  });
}

test('restoration never replays reception or changes historical revisions and only resumed ingestion emits a new fact', async t => {
  const events = createEventPublisher(), delivered = [];
  events.subscribe(event => delivered.push(event));
  const restore = {
    snapshot: {
      id: 'session', elapsedMs: 1000, retention: 'until-deleted',
      segments: [{ id: 'moment-1', startMs: 0, endMs: 1000, status: 'ready', revision: 7, observation: { summary: 'Conservé' } }],
    },
    inventory: { ids: new Set(['moment-1']), thumbs: new Set(), partial: [], mediaBytes: 0, thumbBytes: 0 },
    manifest: null,
  };
  const f = await runtimeFixture(t, { events, restore });
  assert.deepEqual([delivered, f.states, f.saves, f.calls], [[], [], [], []]);
  f.session.watch.emit();
  await f.session.pause();
  assert.deepEqual([delivered, f.saves, f.calls], [[], [], []]);
  assert.deepEqual([f.session.readOnly, f.session.watch.snapshot().segments[0].revision], [true, 7]);
  await f.session.resume();
  await f.add(1);
  assert.deepEqual(delivered, [received(1)]);
  assert.equal(f.session.watch.snapshot().segments[0].revision, 7);
});
