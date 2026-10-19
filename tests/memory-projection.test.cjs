const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { createSessionRuntime } = require('../runtime/session-runtime.cjs');

async function fixture(t, extra = {}) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tvlens-memory-projection-'));
  const f = { time: 0, root };
  f.runtime = createSessionRuntime({
    id: 'projection', sessionsRoot: root, userData: root, smoke: true, selectedModels: {},
    readClock: () => f.time, overrides: { perception: {} }, ...extra,
  });
  t.after(async () => {
    await f.runtime.close();
    await fs.rm(root, { recursive: true, force: true });
  });
  return f;
}

test('public publication ports expose detached status, historical questions and acquired usage without a snapshot', async t => {
  const { runtime } = await fixture(t);
  const { memory, watch } = runtime;
  for (const name of ['readPublicationStatus', 'readHistoricalQuestions', 'readUsage']) {
    assert.equal(typeof memory[name], 'function', name);
  }
  watch.questions.push({ question: 'Pourquoi ?', result: { sources: ['Source'] } });
  watch.apiCalls = 7;
  watch.apiCost = 0.125;
  watch.unplacedMedia = 2;
  watch.setQuestionPending(true);
  watch.lastError = 'Traitement';
  watch.saveError = 'Sauvegarde';
  watch.storageError = 'Stockage';
  const snapshot = t.mock.method(watch, 'snapshot', () => assert.fail('snapshot is forbidden to public readers'));
  assert.deepStrictEqual(memory.readPublicationStatus(), {
    accepting: true, readOnly: false, unplacedMedia: 2, retention: 'until-deleted', retentionMs: null,
    asking: true, analyzing: false, pending: 0, audioPending: 0, visionPending: 0,
    lastError: 'Stockage', visionBlockedMs: 0,
  });
  watch.storageError = null;
  assert.equal(memory.readPublicationStatus().lastError, 'Sauvegarde');
  watch.saveError = null;
  assert.equal(memory.readPublicationStatus().lastError, 'Traitement');
  const questions = memory.readHistoricalQuestions();
  questions[0].result.sources.push('Mutation');
  assert.deepStrictEqual(memory.readHistoricalQuestions(), [{ question: 'Pourquoi ?', result: { sources: ['Source'] } }]);
  const usage = memory.readUsage();
  assert.deepStrictEqual(usage, { apiCalls: 7, apiCost: 0.125 });
  usage.apiCalls = 0;
  assert.equal(memory.readUsage().apiCalls, 7);
  assert.equal('asking' in memory.view().session, false);
  assert.equal('questions' in memory.view(), false);
  assert.equal(snapshot.mock.callCount(), 0);
  snapshot.mock.restore();
});

test('the shared projection preserves every published field and optional passage metadata without a snapshot fallback', async t => {
  const { runtime } = await fixture(t);
  assert.equal(typeof runtime.memoryProjection?.read, 'function');
  const { watch, memoryProjection } = runtime;
  watch.restore({
    id: runtime.id, retention: 'until-deleted', apiCalls: 5, apiCost: 0.25,
    history: [{ id: 'moment-1', startMs: 0, endMs: 1000, status: 'expired', summary: 'Historique',
      observation: null, audioError: null, audioMs: undefined, receivedMs: 1100, thumbnailAvailable: false }],
    segments: [{ id: 'moment-2', startMs: 2000, endMs: 3000, status: 'ready', available: true, hasAudio: false,
      observation: { topic: 'Sujet', summary: 'Résumé', notes: ['Note'] }, revision: 3,
      audioStatus: null, audioFailed: false, receivedMs: 3100, audioStartedMs: 3110, audioMs: 40,
      visionQueuedMs: 3150, visionStartedMs: 3160, visionMs: 50, visionPublishedMs: 3210,
      transcriptPublishedMs: 3150, ingest: { assembleMs: 12 }, metrics: { calls: [1] },
      extension: { historical: true } }],
    questions: [{ question: 'Historique ?', answer: { text: 'Conservée' } }],
  }, { hasMedia: () => true, orphans: ['moment-3'] });
  const expected = watch.snapshot();
  const snapshot = t.mock.method(watch, 'snapshot', () => assert.fail('projection cannot use snapshot'));
  const published = memoryProjection.read();
  assert.deepStrictEqual(published.session, expected);
  assert.equal(JSON.stringify(published.session), JSON.stringify(expected), 'historical field order is preserved');
  assert.deepStrictEqual(memoryProjection.read().session, expected);
  published.session.segments[0].metrics.calls.push(2);
  published.session.questions[0].answer.text = 'Modifiée';
  assert.deepStrictEqual(memoryProjection.read().session, expected, 'each publication detaches all values from the owner');
  assert.equal(snapshot.mock.callCount(), 0);
  snapshot.mock.restore();
});

test('a complete read observes unreadable media from its fact before the host publishes the passage', async t => {
  const { runtime } = await fixture(t);
  const { watch, memoryProjection } = runtime;
  watch.beginEnding();
  const before = memoryProjection.read().session;
  const onChange = t.mock.method(watch, 'onInvalidate');
  const observed = [];
  runtime.events.subscribe(event => {
    if (event.type !== 'PassageUpdated') return;
    observed.push({ current: memoryProjection.read().session, expected: watch.snapshot(), publications: onChange.mock.callCount() });
  });
  await watch.ingest({ startMs: 0, endMs: 1000, clip: new Uint8Array(), frames: [], audio: null });
  assert.equal(before.segments.length, 0);
  assert.equal(observed.length, 1);
  assert.equal(observed[0].publications, 0);
  assert.equal(observed[0].current.segments[0].mediaReason, 'unreadable');
  assert.deepStrictEqual(observed[0].current, observed[0].expected);
});

test('historical null flags, empty optional codes and extension names survive consultation normalization', async t => {
  const { runtime } = await fixture(t);
  const { watch, memoryProjection } = runtime;
  watch.restore({ id: runtime.id, retention: 'until-deleted', segments: [{
    id: 'moment-1', startMs: 0, endMs: 1000, status: 'partial', observation: null,
    available: null, thumbnailAvailable: null, audioFailed: null, audioFailureCode: '',
    origin: 'extension', metadata: { custom: true }, fieldOrder: ['extension'],
  }] });
  const expected = watch.snapshot();
  const snapshot = t.mock.method(watch, 'snapshot', () => assert.fail('snapshot is forbidden'));
  try {
    assert.deepStrictEqual(memoryProjection.read().session, expected);
  } finally {
    snapshot.mock.restore();
  }
});

test('a held passage with null flags, an empty optional code and extension names is published as held, field for field', async t => {
  const { createMemoryView } = require('../core/memory/index.cjs');
  const { memoryState } = require('../scripts/memory-fixture.cjs');
  const { runtime } = await fixture(t);
  const held = {
    id: 'moment-1', startMs: 0, endMs: 1000, status: 'partial', observation: null,
    available: null, thumbnailAvailable: null, audioFailed: null, audioFailureCode: '',
    origin: 'extension', metadata: { custom: true }, fieldOrder: ['extension'],
  };
  // Restoring normalizes `available`; the consultation of a memory that holds a null is what the projection must keep.
  t.mock.method(runtime.memory, 'view', () => createMemoryView(memoryState({ id: runtime.id, segments: [structuredClone(held)] })));
  const [published] = runtime.memoryProjection.read().session.segments;
  assert.deepStrictEqual(published, held);
  assert.equal(JSON.stringify(published), JSON.stringify(held), 'the held field order is preserved');
});

test('three memory invalidations share each delivery regardless of zero, one or three host listeners', async t => {
  const { HeadlessRuntime } = require('../runtime/headless-runtime.cjs');
  const counts = [];
  for (const listeners of [0, 1, 3]) {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tvlens-publication-cost-'));
    const host = new HeadlessRuntime({
      sessionsRoot: root, userData: root, smoke: true, selectedModels: {}, readClock: () => 0,
      agent: { answer: async () => ({}) }, overrides: { perception: {} },
    });
    try {
      await host.start();
      const { watch, memory, memoryProjection } = host.session;
      watch.restore({
        id: watch.id, retention: 'until-deleted',
        history: [{ id: 'moment-1', startMs: 0, endMs: 1000, status: 'ready', observation: { summary: 'Historique' } }],
        segments: [{ id: 'moment-2', startMs: 1000, endMs: 2000, status: 'ready', available: true,
          observation: { summary: 'Images', transcript: 'Paroles' } }],
      }, { hasMedia: () => true });
      const snapshot = t.mock.method(watch, 'snapshot');
      const complete = t.mock.method(memory, 'view');
      const bounded = ['passage', 'passages', 'recentPassages'].map(name => t.mock.method(memory, name));
      const projected = t.mock.method(memoryProjection, 'read');
      const received = Array.from({ length: listeners }, () => []);
      for (const states of received) host.listeners.add(state => states.push(state));
      watch.setQuestionPending(true);
      watch.setQuestionPending(false);
      watch.setQuestionPending(true);
      counts.push({ listeners, snapshots: snapshot.mock.callCount(), complete: complete.mock.callCount(),
        bounded: bounded.reduce((total, spy) => total + spy.mock.callCount(), 0), projections: projected.mock.callCount() });
      for (const states of received) {
        assert.deepEqual(states.map(state => state.session.asking), [true, false, true]);
        assert.equal(states.at(-1).session.history[0].observation.summary, 'Historique');
        assert.equal(states.at(-1).session.segments[0].observation.transcript, 'Paroles');
        assert.equal(states.at(-1), received[0].at(-1), 'the delivered object is shared');
      }
      for (const spy of [snapshot, complete, ...bounded, projected]) spy.mock.restore();
    } finally {
      await host.close();
      await fs.rm(root, { recursive: true, force: true });
    }
  }
  t.diagnostic(JSON.stringify(counts));
  assert.deepEqual(counts, [0, 1, 3].map(listeners => ({ listeners, snapshots: 0, complete: 3, bounded: 0, projections: 3 })));
});

test('deferred surveillance reuses the consultation already built for the host publication', async t => {
  const { HeadlessRuntime } = require('../runtime/headless-runtime.cjs');
  const { deferred } = require('./helpers/wait.cjs');
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tvlens-shared-consultation-'));
  const audio = deferred(), entered = deferred();
  const host = new HeadlessRuntime({
    sessionsRoot: root, userData: root, smoke: true, selectedModels: {}, readClock: () => 1000,
    agent: { answer: async () => ({}) }, surveillanceAgent: { detect: async () => ({ claims: [] }) },
    overrides: { perception: {
      transcribe: async () => { entered.resolve(); return audio.promise; },
      observeVisual: () => new Promise(() => {}),
    } },
  });
  t.after(async () => { await host.close(); await fs.rm(root, { recursive: true, force: true }); });
  await host.start();
  host.startSurveillance({ sessionId: host.session.id, instruction: 'Vérifie les faits.' });
  await host.surveillance.flush();
  const { watch, memory, memoryProjection } = host.session;
  const read = t.mock.method(memory, 'view');
  const projection = t.mock.method(memoryProjection, 'read');
  await watch.ingest({ startMs: 0, endMs: 1000, clip: new Uint8Array([1]), frames: [], audio: null });
  await entered.promise;
  // Le tour différé de l'observateur est remis avant le stockage complet de l'ingestion.
  assert.equal(read.mock.callCount(), projection.mock.callCount(), 'specialized subscriptions add no complete consultation');
  read.mock.restore();
  projection.mock.restore();
});

test('bounded invalidations expose lane progress, hold, pause, storage and save outcomes despite a failed first subscriber and diagnostic', async t => {
  const { createEventPublisher } = require('../core/shared/events.cjs');
  const { deferred } = require('./helpers/wait.cjs');
  const audio = deferred(), audioEntered = deferred(), vision = deferred(), visionEntered = deferred();
  const queued = deferred(), finished = deferred();
  let diagnostics = 0, runtime, progress;
  const events = createEventPublisher({ onError: () => { diagnostics++; throw Error('diagnostic refused'); } });
  events.subscribe(() => { throw Error('subscriber refused'); });
  const states = [], invalidations = [], facts = [];
  events.subscribe(event => {
    if (event.type === 'MemoryInvalidated') invalidations.push(event);
    else facts.push(event);
  });
  const f = await fixture(t, {
    events,
    overrides: { perception: {
      transcribe: async () => { audioEntered.resolve(); return audio.promise; },
      observeVisual: async input => { progress = input.onProgress; visionEntered.resolve(); return vision.promise; },
    } },
    onInvalidate: () => {
      const state = runtime.memoryProjection.published().session;
      states.push(state);
      if (state.visionPending === 1 && !state.analyzing) queued.resolve(state);
      if (state.segments[0]?.visionStatus === 'error') finished.resolve(state);
    },
  });
  runtime = f.runtime;
  const { watch, store } = runtime;
  watch.setQuestionPending(true);
  f.time = 1000;
  await watch.ingest({ startMs: 0, endMs: 1000, clip: new Uint8Array([1]), frames: [], audio: null });
  await audioEntered.promise;
  assert.equal(states.at(-1).analyzing, true);
  audio.resolve({ observation: {}, elapsedMs: 1 });
  assert.equal((await queued.promise).asking, true);
  assert.equal(states.at(-1).segments[0].observation.transcript, undefined);
  await runtime.pause();
  assert.equal(states.at(-1).accepting, false);
  f.time = 2000;
  await runtime.resume();
  assert.equal(states.at(-1).accepting, true);
  watch.setQuestionPending(false);
  await visionEntered.promise;
  assert.equal(states.at(-1).visionPending, 0);
  for (const stage of ['Préparation', 'Lecture', 'Description']) progress(stage);
  assert.deepEqual(states.slice(-3).map(state => state.segments[0].stage), ['Préparation', 'Lecture', 'Description']);
  vision.reject(Object.assign(Error('Traitement refusé'), { code: 'PERCEPTION_FAILED' }));
  assert.equal((await finished.promise).analyzing, false);
  await store.flush();
  assert.equal(states.at(-1).coverage.visionError, 1);
  assert.ok(facts.some(event => event.type === 'PassageLost' && event.cause.code === 'error'));
  const save = t.mock.method(store, 'save', async () => { throw Object.assign(Error('disk refused'), { code: 'EIO' }); });
  await watch.persist();
  assert.equal(states.at(-1).lastError, watch.saveError);
  assert.ok(watch.saveError);
  save.mock.restore();
  await watch.persist();
  assert.equal(watch.saveError, null);
  assert.equal(states.at(-1).lastError, 'Traitement refusé');
  const put = t.mock.method(store, 'put', async () => {
    throw Object.assign(Error('Stockage plein'), { code: 'TVLENS_STORAGE_FULL' });
  });
  await assert.rejects(watch.ingest({ startMs: 1000, endMs: 2000, clip: new Uint8Array([1]), frames: [] }),
    { code: 'TVLENS_STORAGE_FULL' });
  assert.deepEqual([states.at(-1).accepting, states.at(-1).lastError, states.at(-1).segments.length], [false, 'Stockage plein', 1]);
  put.mock.restore();
  await runtime.resume();
  assert.deepEqual([states.at(-1).accepting, states.at(-1).lastError], [true, 'Traitement refusé']);
  assert.equal(diagnostics, invalidations.length + facts.length);
  assert.ok(invalidations.length > 10);
  for (const event of invalidations) assert.deepEqual(event, { type: 'MemoryInvalidated', sessionId: runtime.id });
  const confirmed = await runtime.archive();
  assert.equal(confirmed.state, 'archived');
  const saved = await store.load();
  assert.deepEqual([saved.format, saved.version, saved.segments[0].visionStatus], ['tvlens-viewing-memory', 1, 'error']);
  const before = states.length;
  events.publish({ type: 'MemoryInvalidated', sessionId: runtime.id });
  assert.equal(states.length, before, 'closing detaches the host publication subscriber');
});

test('headless adoption detaches an earlier runtime even when its persistent identity is reused', async t => {
  const { HeadlessRuntime } = require('../runtime/headless-runtime.cjs');
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tvlens-publication-replacement-'));
  const host = new HeadlessRuntime({
    sessionsRoot: root, userData: root, smoke: true, selectedModels: {}, readClock: () => 0,
    agent: { answer: async () => ({}) }, overrides: { perception: {} },
  });
  await host.start();
  const first = host.session;
  t.after(async () => {
    await first.close();
    await host.close();
    await fs.rm(root, { recursive: true, force: true });
  });
  const second = createSessionRuntime({ ...host.sessionOptions(), id: first.id });
  host.adopt(second);
  const revision = host.revision;
  first.watch.emit();
  assert.equal(host.revision, revision, 'an old runtime cannot invalidate a new life with the same id');
  second.watch.setQuestionPending(true);
  assert.equal(host.sessionState.asking, true);
  assert.equal(host.revision, revision + 1);
});

test('headless archive restoration stays silent until adoption and publishes resume before its retained save', async t => {
  const { HeadlessRuntime } = require('../runtime/headless-runtime.cjs');
  const { openArchivedSession } = require('../runtime/session-runtime.cjs');
  const { createEventPublisher } = require('../core/shared/events.cjs');
  const { deferred } = require('./helpers/wait.cjs');
  t.mock.timers.enable({ apis: ['setInterval'] });
  const writing = deferred(), release = deferred(), ready = deferred();
  t.after(() => release.resolve());
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tvlens-reopened-publication-'));
  let clock = 0, second;
  const host = new HeadlessRuntime({
    sessionsRoot: root, userData: root, smoke: true, selectedModels: {}, readClock: () => clock,
    agent: { answer: async () => ({}) }, overrides: { perception: {
      transcribe: async () => ({ observation: { transcript: 'Paroles conservées' } }),
      observeVisual: async () => ({ observation: { summary: 'Images conservées' } }),
    } },
  });
  t.after(async () => {
    await host.close();
    await second?.close();
    await fs.rm(root, { recursive: true, force: true });
  });
  await host.start();
  const first = host.session;
  host.listeners.add(state => {
    if (state.session?.segments[0]?.status === 'ready') ready.resolve(state.session.segments);
  });
  clock = 1000;
  await first.watch.ingest({ startMs: 0, endMs: 1000, clip: new Uint8Array([1]), frames: [], audio: null });
  const acquired = await ready.promise;
  assert.equal((await host.end()).archived, true);
  const revision = host.revision, events = createEventPublisher(), delivered = [];
  events.subscribe(event => delivered.push(event));
  ({ session: second } = await openArchivedSession({ ...host.sessionOptions(), library: host.library, id: first.id, events }));
  assert.deepEqual(delivered, [], 'restoring an archive emits neither facts nor invalidations');
  assert.equal(host.revision, revision);
  assert.equal(host.sessionState, null);
  assert.equal(second.readOnly, true);
  host.adopt(second);
  assert.equal(host.revision, revision + 1, 'adoption publishes the restored state without a new passage');
  assert.deepEqual([host.sessionState.id, host.sessionState.readOnly, host.sessionState.accepting], [first.id, true, false]);
  const facts = passages => passages.map(({ id, revision, observation }) => ({ id, revision, observation }));
  assert.deepEqual(facts(host.sessionState.segments), facts(acquired));
  assert.deepEqual(delivered, [], 'adoption is a host publication, not a replay from memory');
  const assertOldIsInert = () => {
    const before = host.revision, state = host.sessionState;
    first.watch.onInvalidate({ type: 'MemoryInvalidated', sessionId: first.id });
    host.published(first);
    assert.equal(host.revision, before);
    assert.equal(host.sessionState, state);
  };
  assertOldIsInert();
  const save = second.store.save.bind(second.store);
  const retained = t.mock.method(second.store, 'save', async state => {
    writing.resolve();
    await release.promise;
    return save(state);
  });
  const resuming = host.resume(second.id);
  try {
    await writing.promise;
    assert.equal(host.revision, revision + 2, 'the resumed state is delivered before its save completes');
    assert.deepEqual([host.sessionState.readOnly, host.sessionState.accepting], [false, true]);
    assert.deepEqual(facts(host.sessionState.segments), facts(acquired));
    assert.deepEqual(delivered, [{ type: 'MemoryInvalidated', sessionId: second.id }]);
    assertOldIsInert();
  } finally {
    release.resolve();
    await resuming;
    retained.mock.restore();
  }
  second.watch.setQuestionPending(true);
  assert.equal(host.sessionState.asking, true);
  assert.equal(host.sessionState.segments.length, 1);
});
