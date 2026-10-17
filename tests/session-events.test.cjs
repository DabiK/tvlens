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
const updated = (index, revision) => ({ ...received(index), type: 'PassageUpdated', revision });
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

test('shared composition delivers each passage version while failed subscribers leave both lanes and saves running', async t => {
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
  f.audio[0].resolve();
  await f.started.audio[1].promise;
  await f.started.vision[0].promise;
  f.audio[1].resolve();
  await tick();
  f.vision[0].resolve();
  await f.started.vision[1].promise;
  f.vision[1].resolve();
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
  assert.deepEqual(delivered, [
    received(0), received(1), updated(0, 1), updated(1, 1), updated(0, 2), updated(1, 2),
  ]);
  assert.equal(failures.length, delivered.length * 2);
  assert.deepEqual(delivered.filter(event => event.type === 'PassageReceived'), [received(0), received(1)]);
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
    const before = structuredClone(delivered);
    assert.deepEqual(before, lane === 'audio' ? [received(0)] : [received(0), updated(0, 1)]);
    await f.session.close();
    const published = f.states.length, saved = f.saves.length;
    f[lane][0].resolve();
    await tick();
    assert.equal(input.signal.aborted, true);
    const after = f.session.watch.snapshot().segments[0];
    assert.deepEqual([after.revision, after.observation], [passage.revision, passage.observation]);
    assert.deepEqual([f.states.length, f.saves.length], [published, saved]);
    assert.deepEqual(delivered, before);
    assert.deepEqual(f.calls, lane === 'audio' ? [['audio', 'moment-1']] : [['audio', 'moment-1'], ['vision', 'moment-1']]);
  });
}

for (const lane of ['ready', 'audio', 'vision']) {
  test(`restoration of ${lane} never replays facts or changes revisions and only resumed ingestion emits a new fact`, async t => {
    const events = createEventPublisher(), delivered = [];
    events.subscribe(event => delivered.push(event));
    const passage = { id: 'moment-1', startMs: 0, endMs: 1000, status: 'ready', revision: 7, observation: { summary: 'Conservé' } };
    if (lane !== 'ready') {
      passage.status = 'analyzing';
      passage[`${lane}Status`] = 'analyzing';
      if (lane === 'audio') passage.observation = null;
    }
    const losses = [2 + Number(lane === 'audio'), 3 + Number(lane === 'vision')];
    const restore = {
      snapshot: {
        id: 'session', elapsedMs: 1000, retention: 'until-deleted',
        segments: [passage], coverage: { audioError: 2, visionError: 3 },
      },
      inventory: { ids: new Set(['moment-1']), thumbs: new Set(), partial: [], mediaBytes: 0, thumbBytes: 0 },
      manifest: null,
    };
    const f = await runtimeFixture(t, { events, restore });
    assert.deepEqual([delivered, f.states, f.saves, f.calls], [[], [], [], []]);
    assert.deepEqual([f.session.memory.view().losses.audioError, f.session.memory.view().losses.visionError], losses);
    if (lane !== 'ready') assert.equal(f.session.memory.passage('moment-1')[`${lane}Status`], 'error');
    f.session.watch.emit();
    await f.session.pause();
    assert.deepEqual([delivered, f.saves, f.calls], [[], [], []]);
    assert.deepEqual([f.session.readOnly, f.session.watch.snapshot().segments[0].revision], [true, 7]);
    await f.session.resume();
    assert.deepEqual([delivered, f.calls], [[], []], 'resuming does not publish the decoded interruption as a new loss');
    assert.deepEqual([f.session.memory.view().losses.audioError, f.session.memory.view().losses.visionError], losses);
    await f.add(1);
    assert.deepEqual(delivered, [received(1)]);
    assert.equal(f.session.watch.snapshot().segments[0].revision, 7);
  });
}

test('storage refusal of an unreadable clip emits only suspension without a phantom availability or lane loss', async t => {
  const f = await runtimeFixture(t), delivered = [];
  const { watch, store, events } = f.session;
  const refusal = Object.assign(Error('storage full'), { code: 'TVLENS_STORAGE_FULL' });
  t.mock.method(store, 'put', async () => { throw refusal; });
  events.subscribe(event => delivered.push(event));
  await assert.rejects(watch.ingest({ ...block(0), clip: new Uint8Array() }), error => error === refusal);
  assert.deepEqual(delivered, [{
    type: 'AdmissionSuspended', sessionId: 'session', passageId: null, revision: null,
    cause: { code: 'TVLENS_STORAGE_FULL' }, interval: { startMs: 0, endMs: 1000 },
  }]);
  assert.deepEqual(watch.memoryView().passages, []);
  assert.equal(watch.memoryView().losses.videoUnreadable, undefined);
  assert.ok(Object.values(watch.memoryView().losses).every(value => value === 0));
  await store.flush();
  const saved = JSON.parse(await fs.readFile(path.join(f.root, 'session', 'session.json'), 'utf8'));
  assert.deepEqual([saved.accepting, saved.coverage.passages, saved.segments, f.calls], [false, 0, [], []]);
});

function coreFixture(t, options = {}) {
  const f = { time: 0, events: [], seen: [], saves: [], states: [], files: new Map() };
  const watch = new WatchSession({
    id: 'session', now: () => f.time,
    perception: { transcribe: async () => audioResult, observeVisual: async () => visionResult },
    media: {
      put: async (id, input) => { f.files.set(id, input); },
      read: async id => {
        if (!f.files.has(id)) throw Error('missing');
        return f.files.get(id);
      },
      remove: async id => { f.files.delete(id); },
    },
    archive: { save: async state => { f.saves.push(structuredClone(state)); } },
    onEvents: batch => {
      f.events.push(...batch);
      for (const event of batch) f.seen.push({
        event, passage: watch.memoryPassage(event.passageId), losses: watch.memoryView().losses,
      });
    },
    onChange: state => { f.states.push(structuredClone(state)); }, ...options,
  });
  t.after(() => watch.close());
  return Object.assign(f, { watch, add: async index => {
    f.time = Math.max(f.time, (index + 1) * 1000);
    const id = await watch.ingest(block(index));
    await tick();
    return id;
  } });
}

const lost = (index, revision, lane, code) => ({
  ...received(index), type: 'PassageLost', revision, lane, cause: { code },
});

for (const failure of ['reported audio', 'thrown audio', 'thrown vision']) {
  test(`a ${failure} failure publishes one terminal loss and an already coherent passage version`, async t => {
    const terminal = deferred(), visual = deferred();
    const lane = failure.endsWith('audio') ? 'audio' : 'vision';
    const f = coreFixture(t, { perception: {
      transcribe: async () => {
        if (lane === 'vision') return audioResult;
        await terminal.promise;
        if (failure === 'reported audio') return { ...audioResult, failed: true, code: 'PRIVATE_PROVIDER_CODE' };
        throw Error('/private/provider/audio');
      },
      observeVisual: async () => {
        await visual.promise;
        if (lane === 'vision') throw Error('/private/provider/vision');
        return visionResult;
      },
    } });
    await f.add(0);
    if (lane === 'audio') terminal.resolve();
    else visual.resolve();
    await tick();
    const revision = lane === 'audio' ? 1 : 2;
    const prefix = lane === 'audio' ? [received(0)] : [received(0), updated(0, 1)];
    assert.deepEqual(f.events, [...prefix, updated(0, revision), lost(0, revision, lane, 'error')]);
    const seen = f.seen.at(-1);
    assert.equal(seen.passage.revision, revision);
    assert.equal(seen.losses[`${lane}Error`], 1);
    assert.equal(seen.passage[`${lane}Status`], failure === 'reported audio' ? 'ready' : 'error');
    assert.equal(seen.passage.audioFailed, failure === 'reported audio');
    assert.equal(seen.passage.status, failure === 'thrown audio' ? 'analyzing' : 'partial');
    const events = structuredClone(f.events), losses = f.watch.memoryView().losses;
    f.watch.emit();
    await f.watch.prune();
    assert.deepEqual(f.events, events);
    assert.deepEqual(f.watch.memoryView().losses, losses);
    assert.equal(f.watch.memoryPassage('moment-1').revision, revision);
    assert.ok(f.saves.some(state => state.segments[0].revision === revision));
  });
}

for (const recovered of [true, false]) {
  test(`a visual retry publishes only its final ${recovered ? 'success' : 'loss'} at one new revision`, async t => {
    const first = deferred(), second = deferred(), calls = [];
    const transient = () => Object.assign(Error('/private/transient'), { code: 'TVLENS_VISION_TRANSIENT' });
    const f = coreFixture(t, { perception: {
      transcribe: async () => audioResult,
      observeVisual: async input => {
        calls.push(input.id);
        if (calls.length === 1) { await first.promise; throw transient(); }
        await second.promise;
        if (!recovered) throw transient();
        return visionResult;
      },
    } });
    const read = t.mock.method(f.watch.media, 'read', f.watch.media.read);
    await f.add(0);
    assert.deepEqual(f.events, [received(0), updated(0, 1)]);
    first.resolve();
    await tick();
    assert.deepEqual(calls, ['moment-1', 'moment-1']);
    assert.equal(read.mock.callCount(), 3, 'the retry rereads media');
    assert.deepEqual(f.events, [received(0), updated(0, 1)]);
    assert.equal(f.watch.memoryPassage('moment-1').revision, 1);
    assert.equal(f.watch.memoryPassage('moment-1').visionStatus, 'analyzing');
    second.resolve();
    await tick();
    const expected = [received(0), updated(0, 1), updated(0, 2)];
    if (!recovered) expected.push(lost(0, 2, 'vision', 'error'));
    assert.deepEqual(f.events, expected);
    assert.equal(f.seen.at(-1).passage.visionStatus, recovered ? 'ready' : 'error');
    const losses = f.watch.memoryView().losses;
    assert.deepEqual([losses.visionRetried, losses.visionRecovered, losses.visionError], [1, recovered ? 1 : undefined, recovered ? 0 : 1]);
    f.watch.emit();
    await tick();
    assert.deepEqual(calls, ['moment-1', 'moment-1']);
    assert.deepEqual(f.events, expected);
    assert.equal(f.saves.at(-1).segments[0].revision, 2);
  });
}

function assertCountedLosses(f) {
  const losses = f.watch.memoryView().losses;
  const counted = [
    ['audioSkipped', 'audio', 'backlog'], ['audioExpired', 'audio', 'expired'], ['audioError', 'audio', 'error'],
    ['visionSkippedBacklog', 'vision', 'backlog'], ['visionSkippedAsking', 'vision', 'asking'],
    ['visionExpired', 'vision', 'expired'], ['visionError', 'vision', 'error'],
  ];
  const delivered = f.events.filter(event => event.type === 'PassageLost');
  for (const [counter, lane, code] of counted) {
    assert.equal(delivered.filter(event => event.lane === lane && event.cause.code === code).length, losses[counter], counter);
  }
  assert.equal(delivered.length, counted.reduce((total, [counter]) => total + losses[counter], 0));
  assert.equal(new Set(delivered.map(event => `${event.passageId}:${event.lane}`)).size, delivered.length);
}

test('bounded audio overload announces every shed lane and whole passage drop exactly once', async t => {
  const audio = deferred();
  const f = coreFixture(t, { perception: {
    transcribe: async () => { await audio.promise; return audioResult; }, observeVisual: async () => visionResult,
  } });
  for (let index = 0; index < 9; index++) await f.add(index);
  assert.deepEqual(f.events.filter(event => event.type === 'PassageLost'), [
    lost(1, 1, 'audio', 'backlog'), lost(2, 1, 'audio', 'backlog'), lost(3, 1, 'audio', 'backlog'),
    lost(4, 1, 'audio', 'backlog'), lost(5, 1, 'audio', 'backlog'), lost(1, 2, 'vision', 'backlog'),
    lost(6, 1, 'audio', 'backlog'), lost(2, 2, 'vision', 'backlog'),
  ]);
  assertCountedLosses(f);
  const seen = f.seen.find(item => item.event.type === 'PassageLost' && item.event.lane === 'vision');
  assert.deepEqual([seen.passage.status, seen.passage.audioStatus, seen.passage.visionStatus], ['skipped', 'skipped', 'skipped']);
  const before = structuredClone(f.events);
  f.watch.emit();
  await f.watch.prune();
  assert.deepEqual(f.events, before);
  audio.resolve();
  await tick();
  assertCountedLosses(f);
});

for (const held of [true, false]) {
  test(`vision overload attributes its counted loss to ${held ? 'asking' : 'backlog'} after restoring the lane`, async t => {
    const visual = deferred();
    const f = coreFixture(t, { perception: {
      transcribe: async () => audioResult,
      observeVisual: async () => { await visual.promise; return visionResult; },
    } });
    if (held) f.watch.setQuestionPending(true);
    await f.add(0);
    if (!held) f.watch.setQuestionPending(true);
    for (let index = 1; index < (held ? 3 : 4); index++) await f.add(index);
    const index = held ? 0 : 1;
    assert.deepEqual(f.events.filter(event => event.type === 'PassageLost'), [lost(index, 2, 'vision', held ? 'asking' : 'backlog')]);
    const seen = f.seen.at(-1);
    assert.deepEqual([seen.passage.status, seen.passage.audioStatus, seen.passage.visionStatus], ['partial', 'ready', 'skipped']);
    assert.equal(seen.passage.observation.transcript, audioResult.observation.transcript);
    assert.equal(seen.passage.revision, 2);
    assertCountedLosses(f);
    f.watch.setQuestionPending(false);
    visual.resolve();
    await tick();
    assertCountedLosses(f);
  });
}

test('a shed audio passage reaching a full vision queue announces its own loss without adding a spoken eviction', async t => {
  const audio = deferred(), vision = deferred();
  const f = coreFixture(t, { perception: {
    transcribe: async input => { if (input.id === 'moment-4') await audio.promise; return audioResult; },
    observeVisual: async () => { await vision.promise; return visionResult; },
  } });
  for (let index = 0; index < 7; index++) await f.add(index);
  assert.deepEqual(f.events.filter(event => event.type === 'PassageLost'), [lost(4, 1, 'audio', 'backlog')]);
  audio.resolve();
  await tick();
  assert.deepEqual(f.events.filter(event => event.type === 'PassageLost'), [
    lost(4, 1, 'audio', 'backlog'), lost(1, 2, 'vision', 'backlog'), lost(4, 2, 'vision', 'backlog'),
    lost(2, 2, 'vision', 'backlog'), lost(3, 2, 'vision', 'backlog'),
  ]);
  assert.deepEqual(f.watch.memoryView().passages.filter(p => p.visionStatus === 'queued').map(p => p.id), ['moment-6', 'moment-7']);
  assertCountedLosses(f);
  vision.resolve();
  await tick();
});

test('expiry announces only the queued lane losses and the later handoff loss of the active transcription', async t => {
  const audio = deferred();
  const f = coreFixture(t, { retentionMs: 2500, perception: {
    transcribe: async () => { await audio.promise; return audioResult; }, observeVisual: async () => visionResult,
  } });
  for (let index = 0; index < 4; index++) await f.add(index);
  assert.deepEqual(f.events.filter(event => event.passageId === 'moment-1'), [received(0), updated(0, 1)]);
  const prior = f.events.length;
  f.time = 6000;
  await f.watch.prune();
  assert.deepEqual(f.events.slice(prior), [
    updated(1, 2), lost(1, 2, 'vision', 'expired'),
    updated(2, 1), lost(2, 1, 'audio', 'expired'), lost(2, 1, 'vision', 'expired'),
  ]);
  assert.deepEqual(f.watch.memoryView().passages.slice(0, 3).map(p => [p.revision, p.availability.reason]), [
    [1, 'expired'], [2, 'expired'], [1, 'expired'],
  ]);
  assertCountedLosses(f);
  const before = structuredClone(f.events);
  await f.watch.prune();
  f.watch.emit();
  assert.deepEqual(f.events, before);
  audio.resolve();
  await tick();
  assert.deepEqual(f.events.filter(event => event.passageId === 'moment-1'), [
    received(0), updated(0, 1), updated(0, 2), lost(0, 2, 'vision', 'expired'),
  ]);
  assertCountedLosses(f);
  await f.watch.prune();
  const first = f.watch.memoryPassage('moment-1');
  assert.deepEqual([first.origin, first.revision, first.observation.transcript], ['history', 2, audioResult.observation.transcript]);
  await f.watch.stop();
  assert.equal(f.saves.at(-1).history[0].revision, 2);
});

test('a transcription finishing during media removal gets its own revision after the consultable expiry', async t => {
  const audio = deferred(), removal = deferred(), removing = deferred();
  t.after(() => removal.resolve());
  const f = coreFixture(t, { retentionMs: 1000, perception: {
    transcribe: async () => { await audio.promise; return audioResult; },
    observeVisual: async () => visionResult,
  } });
  const remove = f.watch.media.remove;
  t.mock.method(f.watch.media, 'remove', async id => {
    removing.resolve();
    await removal.promise;
    return remove(id);
  });
  await f.add(0);
  f.time = 5000;
  const published = f.states.length;
  const pruning = f.watch.prune();
  await removing.promise;
  const expired = f.watch.memoryPassage('moment-1');
  assert.deepEqual([expired.revision, expired.availability.reason, expired.observation], [1, 'expired', null]);
  assert.equal(f.states.length, published, 'closing the fact batch does not add an onChange publication');
  audio.resolve();
  await tick();
  const transcribed = f.watch.memoryPassages(['moment-1']).passages[0];
  assert.equal(transcribed.revision, 2, 'the already consultable expiry and the transcript are distinct versions');
  assert.equal(transcribed.observation.transcript, audioResult.observation.transcript);
  assert.deepEqual(f.events, [received(0), updated(0, 1), updated(0, 2), lost(0, 2, 'vision', 'expired')]);
  assert.deepEqual([f.seen[1].passage.revision, f.seen[1].passage.observation], [1, null]);
  assert.equal(f.seen[2].passage.observation.transcript, audioResult.observation.transcript);
  assertCountedLosses(f);
  removal.resolve();
  await pruning;
  assert.deepEqual([f.watch.memoryPassage('moment-1').origin, f.watch.memoryPassage('moment-1').revision], ['history', 2]);
  await f.watch.stop();
  assert.equal(f.saves.at(-1).history[0].revision, 2);
});

test('expired queued vision and active enrichment keep their final versions in history without repeating removal losses', async t => {
  const vision = deferred();
  const f = coreFixture(t, { retentionMs: 1000, perception: {
    transcribe: async () => audioResult, observeVisual: async () => { await vision.promise; return visionResult; },
  } });
  const remove = f.watch.media.remove;
  let refused = true;
  t.mock.method(f.watch.media, 'remove', async id => {
    if (refused) throw Error('EPERM /private/media');
    return remove(id);
  });
  await f.add(0);
  await f.add(1);
  const prior = f.events.length;
  f.time = 5000;
  await f.watch.prune();
  assert.deepEqual(f.events.slice(prior), [updated(0, 2), updated(1, 2), lost(1, 2, 'vision', 'expired')]);
  assertCountedLosses(f);
  assert.deepEqual(f.seen.at(-1).passage.availability, { replayable: false, reason: 'expired', images: false, audio: false });
  assert.equal(f.seen.at(-1).passage.visionStatus, 'expired');
  const before = structuredClone(f.events);
  refused = false;
  await f.watch.prune();
  assert.deepEqual(f.events, before);
  vision.resolve();
  await tick();
  await f.watch.prune();
  assert.deepEqual(f.events.slice(prior), [updated(0, 2), updated(1, 2), lost(1, 2, 'vision', 'expired'), updated(0, 3)]);
  assert.deepEqual(f.watch.memoryView().passages.map(p => [p.origin, p.revision, p.visionStatus]), [
    ['history', 3, 'ready'], ['history', 2, 'expired'],
  ]);
  assertCountedLosses(f);
  await f.watch.stop();
  assert.deepEqual(f.saves.at(-1).history.map(p => p.revision), [3, 2]);
});

for (const available of [true, false]) {
  test(`a late ${available ? 'available' : 'failed'} thumbnail keeps the same passage version in history and storage`, async t => {
    const thumbnail = deferred(), entered = deferred();
    const f = coreFixture(t, { retentionMs: 500, thumbnails: { put: async () => {
      entered.resolve();
      await thumbnail.promise;
      if (!available) throw Error('missing thumbnail');
    } } });
    f.time = 1000;
    const ingesting = f.watch.ingest(block(0));
    await entered.promise;
    await tick();
    assert.deepEqual(f.events, [received(0), updated(0, 1), updated(0, 2)]);
    f.time = 5000;
    await f.watch.prune();
    assert.equal(f.watch.memoryPassage('moment-1').origin, 'history');
    assert.equal(f.watch.memoryPassage('moment-1').revision, 3);
    thumbnail.resolve();
    assert.equal(await ingesting, 'moment-1');
    const revision = available ? 4 : 3;
    assert.deepEqual(f.events, [received(0), updated(0, 1), updated(0, 2), updated(0, 3), ...(available ? [updated(0, 4)] : [])]);
    const passage = f.watch.memoryPassage('moment-1');
    assert.deepEqual([passage.revision, passage.thumbnailAvailable, passage.availability.reason], [revision, available, 'expired']);
    assertCountedLosses(f);
    f.watch.emit();
    await f.watch.prune();
    assert.equal(f.events.length, available ? 5 : 4);
    await f.watch.stop();
    assert.deepEqual([f.saves.at(-1).history[0].revision, f.saves.at(-1).history[0].thumbnailAvailable], [revision, available]);
  });
}

test('a received unreadable video publishes its availability without inventing a lost audio or vision lane', async t => {
  const audio = deferred(), vision = deferred();
  const f = coreFixture(t, { perception: {
    transcribe: async () => { await audio.promise; return audioResult; },
    observeVisual: async () => { await vision.promise; return visionResult; },
  } });
  const clip = await fs.readFile(path.join(__dirname, 'fixtures', 'chromium-webm-no-frame.webm'));
  f.time = 1000;
  await f.watch.ingest({ ...block(0), clip });
  assert.deepEqual(f.events, [received(0), updated(0, 1)]);
  assert.deepEqual([f.seen[1].passage.revision, f.seen[1].passage.availability.reason, f.seen[1].losses.videoUnreadable], [1, 'unreadable', 1]);
  assertCountedLosses(f);
  audio.resolve();
  await tick();
  vision.resolve();
  await tick();
  assert.deepEqual(f.events, [received(0), updated(0, 1), updated(0, 2), updated(0, 3)]);
  assert.deepEqual([f.watch.memoryPassage('moment-1').status, f.watch.memoryPassage('moment-1').availability.reason], ['ready', 'unreadable']);
  assertCountedLosses(f);
  assert.equal(f.saves.at(-1).segments[0].revision, 3);
});

test('passage events precede snapshot construction and both lanes finish while their archive writes are retained', async t => {
  const disk = deferred();
  t.after(() => disk.resolve());
  const f = await runtimeFixture(t), delivered = [], seen = [], trace = [], pending = [];
  const { watch, store, events } = f.session;
  await f.add(0);
  await f.add(1);
  const save = store.save.bind(store), snapshot = watch.snapshot.bind(watch);
  t.mock.method(store, 'save', async state => {
    pending.push(structuredClone(state));
    await disk.promise;
    return save(state);
  });
  t.mock.method(watch, 'snapshot', () => { trace.push('snapshot'); return snapshot(); });
  events.subscribe(() => { throw Error('failed observer'); });
  events.subscribe(() => Promise.reject(Error('rejected observer')));
  events.subscribe(() => new Promise(() => {}));
  events.subscribe(event => {
    trace.push('event');
    delivered.push(event);
    seen.push(f.session.memory.passage(event.passageId));
  });
  for (const [lane, index] of [['audio', 0], ['audio', 1], ['vision', 0], ['vision', 1]]) {
    await f.started[lane][index].promise;
    trace.length = 0;
    f[lane][index].resolve();
    await tick();
    assert.equal(trace[0], 'event', 'recording and delivering a fact never builds its content from the snapshot');
    assert.equal(seen.at(-1)[`${lane}Status`], 'ready');
    assert.equal(seen.at(-1).revision, delivered.at(-1).revision);
  }
  assert.deepEqual(delivered, [updated(0, 1), updated(1, 1), updated(0, 2), updated(1, 2)]);
  assert.deepEqual(watch.memoryView().passages.map(p => [p.status, p.revision]), [['ready', 2], ['ready', 2]]);
  assert.equal(pending.length, 4, 'each completed lane has requested its save before the disk returns');
  assert.deepEqual(pending.at(-1).segments.map(p => p.revision), [2, 2]);
  disk.resolve();
  await f.session.pause();
  await store.flush();
  const saved = JSON.parse(await fs.readFile(path.join(f.root, 'session', 'session.json'), 'utf8'));
  assert.deepEqual(saved.segments.map(p => [p.status, p.revision]), [['ready', 2], ['ready', 2]]);
  assert.equal(delivered.length, 4, 'save completion and pause do not invent a version');
});
