const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { createSessionRuntime } = require('../runtime/session-runtime.cjs');
const { WatchSession } = require('../core/session.cjs');
const { MomentIndex } = require('../core/moment-index.cjs');
const { createEventPublisher } = require('../core/shared/events.cjs');
const memory = require('../core/memory/index.cjs');
const { VirtualClock } = require('./helpers/clock.cjs');
const { deferred, turns } = require('./helpers/wait.cjs');

async function fixture(t, { testClock, ...extra } = {}) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tvlens-consumers-'));
  const clock = testClock || new VirtualClock().install();
  const f = { root, clock, wall: 1000, hosts: 0, events: [], writes: [], embedded: [], diagnostics: [], cleanup: [] };
  const audio = deferred(), visual = deferred(), audioEntered = deferred(), visualEntered = deferred(), ready = deferred();
  const embeddings = {
    embedMany(texts, signal) {
      const result = deferred();
      const call = { texts, signal, ...result };
      f.embedded.push(call);
      f.onEmbedding?.(call);
      return result.promise;
    },
  };
  f.runtime = createSessionRuntime({
    id: 'session', sessionsRoot: path.join(root, 'sessions'), userData: root,
    selectedModels: {}, smoke: true, readClock: () => clock.t, wallClock: () => f.wall,
    onPublicationError: value => f.diagnostics.push(value),
    overrides: {
      embeddings,
      perception: {
        async transcribe() {
          audioEntered.resolve();
          await audio.promise;
          return { observation: { transcript: 'Paroles utiles' } };
        },
        async observeVisual() {
          visualEntered.resolve();
          await visual.promise;
          return { observation: { summary: 'Images utiles', topic: 'Énergie' } };
        },
      },
    },
    onChange(state) {
      f.hosts++;
      if (state.segments[0]?.visionStatus === 'ready') ready.resolve();
    },
    ...extra,
  });
  const runtime = f.runtime;
  runtime.events.subscribe(event => f.events.push(event));
  const saveManifest = runtime.store.saveManifest.bind(runtime.store);
  t.mock.method(runtime.store, 'saveManifest', value => {
    f.writes.push(structuredClone(value));
    return saveManifest(value);
  });
  t.after(async () => {
    audio.resolve();
    visual.resolve();
    for (const release of f.cleanup) release();
    await runtime.close();
    if (!testClock) clock.uninstall();
    await fs.rm(root, { recursive: true, force: true });
  });
  await runtime.search.index?.passageVector({ id: 'absent' });
  return Object.assign(f, { audio, visual, audioEntered, visualEntered, ready });
}

const block = n => ({
  startMs: n * 1000, endMs: (n + 1) * 1000,
  clip: Buffer.from('clip'), audio: new Uint8Array([1]), frames: [],
});

function constructionSpies(t) {
  const snapshot = t.mock.method(WatchSession.prototype, 'snapshot');
  const views = Object.fromEntries([
    'createMemoryView', 'readMemoryPassage', 'readMemoryPassages', 'recentMemoryPassages',
  ].map(name => [name, t.mock.method(memory, name)]));
  return () => ({ snapshot: snapshot.mock.callCount(),
    ...Object.fromEntries(Object.entries(views).map(([name, spy]) => [name, spy.mock.callCount()])) });
}

test('one passage with held analyses keeps cadence opportunities and reports construction counts', async t => {
  const counts = constructionSpies(t);
  const f = await fixture(t);
  const { runtime, clock } = f;
  await runtime.watch.ingest(block(0));
  await f.audioEntered.promise;
  assert.equal(f.writes.length, 1);
  assert.deepEqual([f.writes[0].passages, f.writes[0].firstTopic], [1, null]);
  clock.t = 29999;
  f.wall = 900000;
  runtime.watch.emit();
  assert.equal(f.writes.length, 1);
  clock.t = 30000;
  f.wall = 500;
  runtime.watch.emit();
  assert.equal(f.writes.length, 2);
  f.audio.resolve();
  await f.visualEntered.promise;
  f.visual.resolve();
  await f.ready.promise;
  await runtime.watch.persist();
  clock.t = 60000;
  runtime.watch.emit();
  assert.deepEqual(f.writes.map(value => [value.elapsedMs, value.firstTopic]), [[0, null], [30000, null], [60000, 'Énergie']]);
  const measured = { ...counts(), hosts: f.hosts,
    updates: f.events.filter(e => e.type === 'PassageUpdated').length, manifestRequests: f.writes.length };
  t.diagnostic(JSON.stringify(measured));
  assert.equal(measured.snapshot, 13);
  assert.equal(measured.hosts, 9);
  assert.equal(measured.createMemoryView, measured.manifestRequests, 'complete views are constructed only for manifest writes');
  assert.equal(measured.readMemoryPassage, measured.updates, 'at most the named passage is projected for each update');
  assert.equal(measured.readMemoryPassages, 1, 'manifest initialization projects no passage');
  assert.equal(measured.recentMemoryPassages, 1, 'index initialization reads only its bounded tail');
});

test('event consumers consult memory even when host snapshots omit passages', async t => {
  const snapshot = WatchSession.prototype.snapshot;
  t.mock.method(WatchSession.prototype, 'snapshot', function () {
    return { ...snapshot.call(this), history: [], segments: [], coverage: { passages: 0 } };
  });
  const f = await fixture(t);
  await f.runtime.watch.ingest(block(0));
  await f.audioEntered.promise;
  assert.equal(f.writes.length, 1, 'the first passage writes without snapshot content or usable evidence');
  f.audio.resolve();
  await f.visualEntered.promise;
  await f.clock.runUntil(30000);
  assert.deepEqual(f.embedded.map(call => call.texts), [['Paroles utiles']]);
});

test('partial and visual revisions use the real index and discard an older embedding in flight', async t => {
  const f = await fixture(t);
  const { runtime, clock } = f;
  const thumbnail = deferred(), thumbnailEntered = deferred(), cached = deferred();
  f.cleanup.push(() => thumbnail.resolve());
  t.mock.method(runtime.thumbnails, 'put', async () => {
    thumbnailEntered.resolve();
    await thumbnail.promise;
    runtime.thumbnails.bytes = 17;
  });
  const ingesting = runtime.watch.ingest(block(0));
  await thumbnailEntered.promise;
  await f.audioEntered.promise;
  f.audio.resolve();
  await f.visualEntered.promise;
  await clock.runUntil(30000);
  assert.deepEqual(f.embedded.map(call => call.texts), [['Paroles utiles']]);
  f.visual.resolve();
  await f.ready.promise;
  await turns(2);
  const putMany = runtime.search.index.cache.putMany.bind(runtime.search.index.cache);
  t.mock.method(runtime.search.index.cache, 'putMany', async items => {
    await putMany(items);
    cached.resolve(items);
  });
  f.embedded[0].resolve([[1, 0]]);
  await clock.runUntil(60000);
  assert.equal(runtime.search.index.status().stale, 1);
  assert.equal(await runtime.search.index.passageVector({ id: 'moment-1', observation: { transcript: 'Paroles utiles' } }), null);
  assert.deepEqual(f.embedded.map(call => call.texts), [['Paroles utiles'], ['Images utiles\nParoles utiles']]);
  f.embedded[1].resolve([[0, 1]]);
  assert.deepEqual((await cached.promise).map(item => [item.id, item.text]), [['moment-1', 'Images utiles\nParoles utiles']]);
  const latest = f.events.filter(event => event.type === 'PassageUpdated').at(-1);
  const read = t.mock.method(runtime.memory, 'passage');
  runtime.events.publish(latest);
  runtime.events.publish({ ...latest, sessionId: 'other' });
  assert.equal(read.mock.callCount(), 0, 'a repeated revision and another session do not reread memory');
  runtime.events.publish({ ...latest, revision: latest.revision + 100 });
  assert.equal(read.mock.callCount(), 1, 'a mismatching revision is checked against the current passage');
  thumbnail.resolve();
  await ingesting;
  await clock.runUntil(120000);
  assert.equal(f.embedded.length, 2, 'availability alone keeps the indexed text');
  assert.deepEqual(await runtime.search.index.passageVector(runtime.memory.passage('moment-1')), [0, 1]);
});

function restoredSession() {
  const passage = n => ({ id: `moment-${n}`, startMs: (n - 1) * 1000, endMs: n * 1000,
    available: true, revision: 2, status: 'ready', observation: { transcript: `Paroles ${n}` } });
  const segments = Array.from({ length: 60 }, (_, i) => passage(i + 3));
  segments[20].observation = {};
  segments[21].status = 'error';
  segments[21].observation = null;
  segments[22].status = 'partial';
  const history = [passage(1), passage(2)];
  return {
    snapshot: { id: 'session', elapsedMs: 62000, retention: 'until-deleted', history, segments },
    inventory: { ids: new Set(segments.map(p => p.id)), thumbs: new Set(), mediaBytes: 123, thumbBytes: 0 },
    manifest: { format: 'tvlens-session', version: 1, id: 'session', state: 'live', captures: [] },
  };
}

test('restoration is silent and resume initializes only the eligible retained tail before following new revisions', async t => {
  const restore = restoredSession();
  const observe = t.mock.method(MomentIndex.prototype, 'observe');
  const f = await fixture(t, { restore });
  const { runtime, clock } = f;
  runtime.watch.emit();
  runtime.watch.emit();
  await runtime.pause();
  await clock.runUntil(60000);
  assert.deepEqual([f.writes, f.events, f.embedded], [[], [], []]);
  assert.equal(runtime.search.index.status().pending, 0, 'read-only composition admits no delayed background work');
  assert.equal(observe.mock.callCount(), 0, 'the spy includes initialization during composition');
  await runtime.resume();
  const eligible = restore.snapshot.segments.slice(-48).filter(p => p.observation?.transcript);
  assert.deepEqual(observe.mock.calls.flatMap(call => call.arguments[0].map(p => p.id)), eligible.map(p => p.id));
  await clock.runUntil(90000);
  assert.equal(f.embedded[0].texts.length, 32);
  const secondBatch = deferred();
  f.onEmbedding = secondBatch.resolve;
  f.embedded[0].resolve(f.embedded[0].texts.map(() => [1, 0]));
  await secondBatch.promise;
  assert.deepEqual(f.embedded.flatMap(call => call.texts), eligible.map(p => p.observation.transcript));
  f.audio.resolve();
  f.visual.resolve();
  await runtime.watch.ingest(block(62));
  await f.visualEntered.promise;
  await runtime.watch.persist();
  assert.ok(observe.mock.calls.some(call => call.arguments[0].some(p => p.id === 'moment-63' && p.observation.transcript === 'Paroles utiles')));
  assert.equal(f.events.filter(event => event.type === 'PassageReceived').length, 1);
});

test('a resumed archive with history only keeps later cadence opportunities without replaying history to the index', async t => {
  const restore = restoredSession();
  restore.snapshot.history.push(...restore.snapshot.segments);
  restore.snapshot.segments = [];
  restore.inventory.ids.clear();
  const f = await fixture(t, { restore });
  await f.runtime.resume();
  const before = f.writes.length;
  f.clock.t = 30000;
  f.runtime.watch.emit();
  assert.equal(f.writes.length, before + 1, 'history still counts for periodic manifests after explicit resume');
  assert.equal(f.writes.at(-1).passages, 62);
  assert.equal(f.writes.at(-1).media.stored, 0);
  await f.clock.runUntil(60000);
  assert.deepEqual(f.embedded, []);
});

for (const mode of ['disabled', 'no-embeddings']) {
  test(`background indexing does no work when ${mode} while manifests keep their own eligibility`, async t => {
    const extra = mode === 'disabled' ? { config: { backgroundIndex: false } } : {
      overrides: { perception: {
        transcribe: async () => ({ observation: {} }),
        observeVisual: async () => ({ observation: {} }),
      } },
    };
    const f = await fixture(t, extra);
    f.audio.resolve();
    f.visual.resolve();
    await f.runtime.watch.ingest(block(0));
    await f.ready.promise;
    await f.clock.runUntil(60000);
    assert.deepEqual(f.embedded, []);
    assert.equal(f.runtime.search.index?.status().pending || 0, 0);
    assert.equal(f.writes[0].passages, 1);
  });
}

test('closing removes each consumer subscription and late events cannot feed a subsequent session', async t => {
  const publisher = createEventPublisher();
  const active = new Set();
  const events = {
    publish: publisher.publish,
    subscribe(listener) {
      active.add(listener);
      const unsubscribe = publisher.subscribe(listener);
      return () => {
        active.delete(listener);
        unsubscribe();
      };
    },
  };
  const first = await fixture(t, { events });
  await first.runtime.watch.ingest(block(0));
  await first.audioEntered.promise;
  first.audio.resolve();
  await first.visualEntered.promise;
  await first.clock.runUntil(30000);
  assert.equal(active.size, 3, 'one subscription per consumer and one host test observer');
  const late = first.events.find(event => event.type === 'PassageUpdated');
  await first.runtime.close();
  assert.equal(active.size, 1);
  const next = await fixture(t, { id: 'next', events, testClock: first.clock });
  const read = t.mock.method(next.runtime.memory, 'passage');
  events.publish(late);
  first.visual.resolve();
  first.embedded[0].resolve([[1, 0]]);
  await turns(2);
  await next.clock.runUntil(60000);
  next.runtime.watch.emit();
  assert.deepEqual([next.writes, next.embedded], [[], []]);
  assert.equal(read.mock.callCount(), 0);
  assert.equal(first.runtime.search.index.status().indexed, 0);
  await next.runtime.close();
  assert.equal(active.size, 2, 'only the two test observers remain');
});

test('a final manifest remains mandatory after every optional consumer subscriber rejects', async t => {
  const failures = [];
  const publisher = createEventPublisher({ onError: value => failures.push(value) });
  const events = {
    publish: publisher.publish,
    subscribe: () => publisher.subscribe(() => Promise.reject(Object.assign(Error('subscriber refused'), { code: 'OFFLINE' }))),
  };
  const f = await fixture(t, { events });
  await f.runtime.watch.ingest(block(0));
  await f.audioEntered.promise;
  await turns(2);
  assert.ok(failures.length >= 2);
  assert.ok(failures.every(value => value.code === 'TVLENS_EVENT_DELIVERY_FAILED'));
  const confirmed = await f.runtime.archive();
  assert.deepEqual([confirmed.state, confirmed.passages, confirmed.media.stored], ['archived', 1, 1]);
  assert.deepEqual(f.embedded, []);
});

test('manifest totals follow historical expired passages, enriched topics and a late thumbnail', async t => {
  const restore = restoredSession();
  restore.snapshot.history = restore.snapshot.history.slice(0, 1);
  restore.snapshot.segments = [];
  restore.snapshot.history.push({
    id: 'moment-2', startMs: 1000, endMs: 2000, revision: 2, status: 'partial', available: false,
    mediaReason: 'expired', observation: { transcript: 'Anciennes paroles' },
  });
  restore.snapshot.elapsedMs = 2000;
  restore.inventory.ids.clear();
  const f = await fixture(t, { restore });
  const { runtime, clock } = f;
  await runtime.resume();
  runtime.watch.emit();
  assert.equal(runtime.memory.passage('moment-2').origin, 'history');
  const thumbnail = deferred(), thumbnailEntered = deferred();
  f.cleanup.push(() => thumbnail.resolve());
  t.mock.method(runtime.thumbnails, 'put', async () => {
    thumbnailEntered.resolve();
    await thumbnail.promise;
    runtime.thumbnails.bytes = 17;
  });
  const capturing = runtime.watch.ingest(block(2));
  await thumbnailEntered.promise;
  await f.audioEntered.promise;
  f.audio.resolve();
  await f.visualEntered.promise;
  const partial = deferred();
  const removeObserver = runtime.events.subscribe(event => {
    if (event.type === 'PassageUpdated' && runtime.memory.passage(event.passageId)?.visionStatus === 'ready') partial.resolve();
  });
  f.visual.resolve();
  await partial.promise;
  removeObserver();
  clock.t = 30000;
  runtime.watch.emit();
  const beforeThumbnail = f.writes.at(-1);
  assert.deepEqual([beforeThumbnail.passages, beforeThumbnail.media.stored, beforeThumbnail.media.missing,
    beforeThumbnail.firstTopic, beforeThumbnail.media.retention], [3, 1, 2, 'Énergie', 'until-deleted']);
  thumbnail.resolve();
  await capturing;
  clock.t = 60000;
  runtime.watch.emit();
  assert.equal(f.writes.at(-1).media.bytes, beforeThumbnail.media.bytes + 17);
  const facts = f.writes.map(value => ({ elapsedMs: value.elapsedMs, passages: value.passages, firstTopic: value.firstTopic,
    media: value.media }));
  t.diagnostic(JSON.stringify({ manifestFacts: facts }));
});

test('a refused index initialization on resume cannot suppress the explicit capture manifest', async t => {
  const f = await fixture(t, { restore: restoredSession() });
  t.mock.method(f.runtime.search.index, 'observe', () => {
    throw Object.assign(Error('index initialization refused'), { code: 'OFFLINE' });
  });
  await assert.doesNotReject(f.runtime.resume());
  assert.equal(f.writes.at(-1).captures.length, 1);
  assert.equal(f.writes.at(-1).state, 'live');
  assert.equal(f.diagnostics[0].code, 'TVLENS_STATE_PUBLICATION_FAILED');
});

test('a late thumbnail update outside the retained tail never feeds the background index', async t => {
  const f = await fixture(t);
  const { runtime } = f;
  const observe = t.mock.method(runtime.search.index, 'observe');
  const thumbnail = deferred(), thumbnailEntered = deferred();
  f.cleanup.push(() => thumbnail.resolve());
  t.mock.method(runtime.thumbnails, 'put', async id => {
    if (id !== 'moment-1') return;
    thumbnailEntered.resolve();
    await thumbnail.promise;
  });
  f.audio.resolve();
  f.visual.resolve();
  const first = runtime.watch.ingest(block(0));
  await thumbnailEntered.promise;
  await f.ready.promise;
  const before = runtime.memory.passage('moment-1');
  assert.equal(before.usableObservation, true);
  for (let n = 1; n <= 48; n++) await runtime.watch.ingest(block(n));
  assert.equal(runtime.memory.recentPassages(48).some(p => p.id === before.id), false);
  const observed = observe.mock.callCount();
  thumbnail.resolve();
  await first;
  const after = runtime.memory.passage(before.id);
  assert.equal(after.origin, 'retained');
  assert.equal(after.thumbnailAvailable, true);
  assert.ok(after.revision > before.revision);
  assert.ok(f.events.some(event => event.type === 'PassageUpdated' && event.passageId === before.id && event.revision === after.revision));
  assert.deepEqual(observe.mock.calls.slice(observed).flatMap(call => call.arguments[0]).filter(p => p.id === before.id), []);
});

test('late passage facts cannot reintroduce historical passages into the background index', async t => {
  const restore = restoredSession();
  restore.inventory.ids.delete('moment-3');
  restore.snapshot.history.push({ ...restore.snapshot.segments.shift(), available: false, mediaReason: 'expired' });
  const f = await fixture(t, { restore });
  const { runtime } = f;
  await runtime.resume();
  runtime.watch.emit();
  const passage = runtime.memory.passage('moment-3');
  assert.equal(passage.origin, 'history');
  assert.equal(passage.usableObservation, true);
  const observe = t.mock.method(runtime.search.index, 'observe');
  const late = {
    sessionId: runtime.id, passageId: passage.id, revision: passage.revision,
    interval: { startMs: passage.startMs, endMs: passage.endMs },
  };
  runtime.events.publish({ ...late, type: 'PassageReceived' });
  runtime.events.publish({ ...late, type: 'PassageUpdated' });
  assert.equal(observe.mock.callCount(), 0, 'even delayed reception and update facts must consult the current origin');
});
