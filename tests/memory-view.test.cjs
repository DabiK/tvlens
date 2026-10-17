const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { WatchSession } = require('../core/session.cjs');
const { createSessionRuntime } = require('../runtime/session-runtime.cjs');
const { deferred } = require('./helpers/wait.cjs');

function fixture(t, perception = {}) {
  const f = { time: 0, effects: [], files: new Map() };
  f.watch = new WatchSession({
    id: 'session', now: () => f.time, perception,
    media: {
      put: async (id, input) => {
        f.effects.push('put');
        f.files.set(id, input);
      },
      read: async id => {
        f.effects.push('read');
        return f.files.get(id);
      },
      remove: async id => {
        f.effects.push('remove');
        f.files.delete(id);
      },
    },
    archive: { save: async () => { f.effects.push('save'); } },
    storage: () => {
      f.effects.push('storage');
      return null;
    },
    onChange: state => {
      f.effects.push('emit');
      f.onState?.(state);
    },
    onEvents: () => f.effects.push('event'),
  });
  t.after(() => f.watch.close());
  return f;
}

function keys(value, expected) {
  assert.deepEqual(Object.keys(value).sort(), expected.split(' ').sort());
}

function contract(view) {
  keys(view, 'session clock passages coverage losses');
  keys(view.session, 'id accepting asking readOnly retention retentionMs unplacedMedia lastError');
  keys(view.clock, 'elapsedMs capturedThroughMs analyzedThroughMs contextThroughMs analysisLagMs');
  keys(view.coverage, 'passages retainedPassages historyPassages replayablePassages startMs throughMs pending ' +
    'audioPending visionPending analyzing gaps audioGaps visionGaps captureGaps visionBlockedMs');
  assert.equal(typeof view.session.id, 'string');
  for (const key of ['accepting', 'asking', 'readOnly']) assert.equal(typeof view.session[key], 'boolean');
  for (const value of Object.values(view.clock)) assert.equal(typeof value, 'number');
  for (const value of Object.values(view.losses)) assert.equal(typeof value, 'number');
  assert.ok(['rolling', 'until-deleted'].includes(view.session.retention));
  assert.ok(view.session.retentionMs === null || typeof view.session.retentionMs === 'number');
  assert.equal(typeof view.session.unplacedMedia, 'number');
  assert.ok(view.session.lastError === null || typeof view.session.lastError === 'string');
  coverageContract(view.coverage);
  for (const p of view.passages) {
    keys(p, 'id startMs endMs revision status audioStatus visionStatus error audioError visionError audioFailed ' +
      'visionSkipReason stage observation topicSummary summary explicitNulls thumbnailAvailable origin modalities availability usableObservation');
    assert.equal(typeof p.id, 'string');
    for (const key of ['startMs', 'endMs']) assert.equal(typeof p[key], 'number');
    assert.ok(p.revision === null || Number.isInteger(p.revision));
    for (const key of ['status', 'audioStatus', 'visionStatus', 'error', 'audioError', 'visionError', 'visionSkipReason', 'stage', 'summary']) {
      assert.ok(p[key] === null || typeof p[key] === 'string', key);
    }
    for (const key of ['audioFailed', 'thumbnailAvailable', 'usableObservation']) assert.equal(typeof p[key], 'boolean');
    assert.ok(['history', 'retained'].includes(p.origin));
    keys(p.modalities, 'audio images video');
    assert.ok(Object.values(p.modalities).every(value => ['present', 'absent', 'unknown'].includes(value)));
    keys(p.availability, 'replayable reason images audio');
    assert.equal(typeof p.availability.replayable, 'boolean');
    assert.ok([null, 'expired', 'missing', 'not-kept', 'unreadable'].includes(p.availability.reason));
    for (const key of ['images', 'audio']) assert.ok([true, false, null].includes(p.availability[key]));
    assert.ok(p.observation === null || typeof p.observation === 'object');
    assert.ok(p.topicSummary === null || typeof p.topicSummary === 'object');
  }
}

function coverageContract(coverage) {
  for (const key of ['passages', 'retainedPassages', 'historyPassages', 'replayablePassages', 'throughMs',
    'pending', 'audioPending', 'visionPending', 'visionBlockedMs']) assert.equal(typeof coverage[key], 'number');
  assert.ok(coverage.startMs === null || typeof coverage.startMs === 'number');
  assert.equal(typeof coverage.analyzing, 'boolean');
  for (const key of ['gaps', 'audioGaps', 'visionGaps', 'captureGaps']) assert.ok(Array.isArray(coverage[key]));
}

test('empty memory publishes a detached consultation contract without snapshot or effects', t => {
  const f = fixture(t);
  assert.equal(typeof f.watch.memoryView, 'function');
  const snapshot = t.mock.method(f.watch, 'snapshot', () => assert.fail('full snapshot is forbidden'));
  const view = f.watch.memoryView();
  contract(view);
  assert.deepEqual(view.session, {
    id: 'session', accepting: true, asking: false, readOnly: false, retention: 'until-deleted', retentionMs: null,
    unplacedMedia: 0, lastError: null,
  });
  assert.deepEqual(view.clock, {
    elapsedMs: 0, capturedThroughMs: 0, analyzedThroughMs: 0, contextThroughMs: 0, analysisLagMs: 0,
  });
  assert.deepEqual(view.passages, []);
  assert.equal(view.coverage.startMs, null);
  assert.equal(view.coverage.passages, 0);
  assert.deepEqual(view.coverage.captureGaps, []);
  assert.deepEqual(f.effects, []);
  assert.equal(snapshot.mock.callCount(), 0);
  snapshot.mock.restore();
});

const block = (startMs = 0, extra = {}) => ({
  startMs, endMs: startMs + 1000, clip: new Uint8Array([1]), audio: new Uint8Array([2]),
  frames: [{ atMs: startMs, dataUrl: 'data:image/jpeg;base64,YQ==' }], ...extra,
});
const audioResult = { observation: { transcript: 'Paroles', uncertainty: 'Texte automatique' }, elapsedMs: 1 };
const visualResult = { observation: {
  topic: 'Sujet', topicContinuity: 'change', summary: 'Résumé propre', visual: 'Image',
}, elapsedMs: 2 };

test('audio then visual publication keeps passage identity and revisions with the needs of all readers', async t => {
  const audio = deferred(), vision = deferred(), visualStarted = deferred(), completed = deferred();
  const f = fixture(t, {
    transcribe: () => audio.promise,
    observeVisual: async () => {
      visualStarted.resolve();
      return vision.promise;
    },
  });
  f.onState = state => { if (state.segments[0]?.status === 'ready') completed.resolve(); };
  f.time = 1500;
  await f.watch.ingest(block());
  let view = f.watch.memoryView();
  contract(view);
  assert.equal(view.passages.length, 1);
  const initial = view.passages[0];
  assert.deepEqual([initial.id, initial.startMs, initial.endMs, initial.revision], ['moment-1', 0, 1000, 0]);
  assert.deepEqual(initial.modalities, { audio: 'present', images: 'present', video: 'present' });
  audio.resolve(audioResult);
  await visualStarted.promise;
  view = f.watch.memoryView();
  contract(view);
  const partial = view.passages[0];
  assert.deepEqual([partial.revision, partial.status, partial.audioStatus, partial.visionStatus], [1, 'partial', 'ready', 'analyzing']);
  assert.equal(partial.observation.transcript, 'Paroles', 'surveillance and index can consult speech before ready');
  assert.equal(partial.usableObservation, true);
  assert.equal(partial.topicSummary, null);
  assert.deepEqual([view.clock.analyzedThroughMs, view.clock.contextThroughMs, view.coverage.analyzing], [0, 1000, true]);
  vision.resolve(visualResult);
  await completed.promise;
  view = f.watch.memoryView();
  contract(view);
  const ready = view.passages[0];
  assert.deepEqual([ready.id, ready.startMs, ready.endMs, ready.revision], ['moment-1', 0, 1000, 2]);
  assert.equal(ready.status, 'ready', 'living recap can select ready passages');
  assert.deepEqual(ready.observation, { ...audioResult.observation, ...visualResult.observation });
  assert.deepEqual(ready.topicSummary, { text: 'Résumé propre', firstId: 'moment-1', lastId: 'moment-1', startMs: 0, endMs: 1000 });
  assert.equal(ready.observation.topicContinuity, 'change', 'timeline and detail retain subject continuity');
  assert.deepEqual(ready.availability, { replayable: true, reason: null, images: true, audio: true });
  assert.deepEqual(view.clock, {
    elapsedMs: 1500, capturedThroughMs: 1000, analyzedThroughMs: 1000, contextThroughMs: 1000, analysisLagMs: 0,
  });
  assert.deepEqual([view.coverage.passages, view.coverage.retainedPassages, view.coverage.historyPassages,
    view.coverage.replayablePassages], [1, 1, 0, 1], 'manifest totals and TV headers have independent counts');
  assert.deepEqual(view.coverage.gaps, []);
  assert.equal(view.losses.audioError, 0);
});

test('lane losses and capture holes remain distinct from coverage and source modalities', async t => {
  const completed = [deferred(), deferred()];
  const f = fixture(t, {
    transcribe: async input => {
      if (input.id === 'moment-1') throw Error('Transcription indisponible');
      return { observation: { transcript: '' }, failed: true };
    },
    observeVisual: async input => {
      if (input.id === 'moment-2') throw Error('Vision indisponible');
      return visualResult;
    },
  });
  f.onState = state => {
    for (let i = 0; i < completed.length; i++) {
      if (['ready', 'error'].includes(state.segments[i]?.visionStatus)) completed[i].resolve();
    }
  };
  f.time = 1000;
  await f.watch.ingest(block());
  await completed[0].promise;
  f.time = 4000;
  await f.watch.ingest(block(3000));
  await completed[1].promise;
  const view = f.watch.memoryView();
  contract(view);
  assert.deepEqual(view.coverage.audioGaps.map(p => [p.id, p.audioStatus]), [['moment-1', 'error'], ['moment-2', 'failed']]);
  assert.deepEqual(view.coverage.visionGaps.map(p => [p.id, p.visionStatus]), []);
  assert.deepEqual(view.coverage.gaps, [{ id: 'moment-2', startMs: 3000, endMs: 4000, status: 'error' }]);
  assert.deepEqual(view.coverage.captureGaps, [{ startMs: 1000, endMs: 3000 }]);
  assert.deepEqual([view.losses.audioError, view.losses.visionError], [2, 1]);
  assert.deepEqual(view.passages.map(p => p.modalities.audio), ['present', 'present'], 'a failed transcript is never silence');
  assert.equal(view.passages[0].audioError, 'Transcription indisponible');
  assert.equal(view.passages[1].audioFailed, true);
  assert.equal(view.passages[1].visionError, 'Vision indisponible');
  assert.deepEqual([view.clock.capturedThroughMs, view.clock.contextThroughMs, view.clock.analysisLagMs], [4000, 1000, 4000]);
});

const savedPassage = (number, extra = {}) => ({
  id: `moment-${number}`, startMs: (number - 1) * 1000, endMs: number * 1000,
  status: 'ready', revision: 7, available: true, thumbnailAvailable: true,
  observation: { transcript: `Paroles ${number}`, topic: 'Sujet', summary: `Résumé ${number}`, notes: ['Prudence'] },
  topicSummary: { text: 'Cumul', firstId: 'moment-1', lastId: `moment-${number}`, startMs: 0, endMs: number * 1000 },
  ...extra,
});

test('bounded reads project only one passage or the requested retained tail without the complete view', t => {
  const f = fixture(t);
  assert.equal(typeof f.watch.memoryPassage, 'function');
  assert.equal(typeof f.watch.recentMemoryPassages, 'function');
  const saved = {
    id: 'session', elapsedMs: 55000, retention: 'until-deleted', history: [savedPassage(1)],
    segments: Array.from({ length: 54 }, (_, i) => savedPassage(i + 2,
      i === 53 ? { status: 'partial', audioStatus: 'ready', visionStatus: 'error', visionError: 'Perte' } : {})),
  };
  let unrequestedReads = 0;
  Object.defineProperty(saved.segments[0].observation, 'visual', {
    enumerable: true,
    get() {
      unrequestedReads++;
      return 'Image hors demande';
    },
  });
  f.watch.restore(saved, { hasMedia: () => true });
  const memory = require('../core/memory/index.cjs');
  const complete = t.mock.method(memory, 'createMemoryView', () => assert.fail('full view is forbidden'));
  const snapshot = t.mock.method(f.watch, 'snapshot', () => assert.fail('snapshot is forbidden'));
  const single = f.watch.memoryPassage('moment-1');
  assert.equal(single.origin, 'history');
  assert.equal(single.availability.replayable, false);
  assert.equal(single.revision, 7);
  const tail = f.watch.recentMemoryPassages(48);
  assert.deepEqual(tail.map(p => p.id), Array.from({ length: 48 }, (_, i) => `moment-${i + 8}`));
  assert.equal(tail.at(-1).status, 'partial', 'index tail includes usable passages before ready');
  assert.equal(tail.at(-1).usableObservation, true);
  assert.equal(tail.at(-1).visionError, 'Perte');
  assert.equal(unrequestedReads, 0, 'bounded reads never project an unrequested passage');
  assert.equal(f.watch.recentMemoryPassages(100).length, 54, 'history never joins the retained tail');
  assert.deepEqual(f.watch.recentMemoryPassages(0), []);
  assert.equal(f.watch.memoryPassage('absent'), null);
  for (const invalid of [-1, 1.5, NaN, Infinity, '48']) {
    assert.throws(() => f.watch.recentMemoryPassages(invalid), { code: 'TVLENS_MEMORY_LIMIT_INVALID' });
  }
  single.observation.notes.push('Modifié');
  single.topicSummary.text = 'Modifié';
  tail.at(-1).observation.summary = 'Modifié';
  tail.pop();
  assert.deepEqual(f.watch.memoryPassage('moment-1').observation.notes, ['Prudence']);
  assert.equal(f.watch.memoryPassage('moment-1').topicSummary.text, 'Cumul');
  assert.equal(f.watch.memoryPassage('moment-55').observation.summary, 'Résumé 55');
  assert.deepEqual(f.effects, []);
  assert.equal(complete.mock.callCount(), 0);
  assert.equal(snapshot.mock.callCount(), 0);
  complete.mock.restore();
  snapshot.mock.restore();
});

test('a bounded read by identifiers publishes the identity, the clock and the requested passages without the complete view', t => {
  const f = fixture(t);
  assert.equal(typeof f.watch.memoryPassages, 'function');
  f.watch.restore({
    id: 'session', retention: 'until-deleted', history: [savedPassage(1)],
    segments: [
      savedPassage(2), savedPassage(3, { mediaReason: 'unreadable', available: false }),
      savedPassage(4, { revision: undefined, status: 'partial', audioStatus: 'ready', visionStatus: 'analyzing' }),
      savedPassage(5, { status: 'error', observation: null, summary: null }),
    ],
  }, { hasMedia: () => true });
  f.time = 7000;
  const expected = f.watch.memoryView();
  let unrequestedReads = 0;
  Object.defineProperty(f.watch.segments[0].observation, 'visual', {
    enumerable: true,
    get() {
      unrequestedReads++;
      return 'Image hors demande';
    },
  });
  const memory = require('../core/memory/index.cjs');
  const complete = t.mock.method(memory, 'createMemoryView', () => assert.fail('full view is forbidden'));
  const snapshot = t.mock.method(f.watch, 'snapshot', () => assert.fail('snapshot is forbidden'));
  f.effects.length = 0;
  const read = f.watch.memoryPassages(['moment-4', 'absent', 'moment-1', 'moment-3']);
  keys(read, 'session clock passages');
  keys(read.session, 'id');
  assert.deepEqual(read.session, { id: 'session' });
  assert.deepEqual(read.clock, expected.clock, 'the clock is the one the complete view publishes');
  const byId = new Map(expected.passages.map(p => [p.id, p]));
  assert.deepEqual(read.passages, ['moment-4', 'moment-1', 'moment-3'].map(id => byId.get(id)),
    'requested order, unknown identifiers omitted, same passage projection');
  assert.deepEqual(read.passages.map(p => [p.origin, p.revision, p.availability.reason]),
    [['retained', null, null], ['history', 7, 'missing'], ['retained', 7, 'unreadable']]);
  assert.equal(unrequestedReads, 0, 'a passage that is neither requested nor needed by the clock is never projected');
  assert.deepEqual(f.watch.memoryPassages([]), { session: { id: 'session' }, clock: expected.clock, passages: [] });
  for (const invalid of [undefined, 'moment-1', [1], new Set(['moment-1'])]) {
    assert.throws(() => f.watch.memoryPassages(invalid), { code: 'TVLENS_MEMORY_IDS_INVALID' });
  }
  read.passages[0].observation.summary = 'Modifié';
  read.clock.elapsedMs = 0;
  read.session.id = 'foreign';
  const again = f.watch.memoryPassages(['moment-4']);
  assert.deepEqual([again.session.id, again.clock.elapsedMs, again.passages[0].observation.summary], ['session', 7000, 'Résumé 4']);
  assert.deepEqual(f.effects, []);
  assert.equal(complete.mock.callCount(), 0);
  assert.equal(snapshot.mock.callCount(), 0);
  complete.mock.restore();
  snapshot.mock.restore();
});

test('full views own their lists, observations, summaries and coverage and perform no reads or publications', t => {
  const f = fixture(t);
  f.watch.restore({
    id: 'session', retention: 'until-deleted', segments: [savedPassage(3, {
      status: 'partial', audioStatus: 'ready', visionStatus: 'skipped', visionSkipReason: 'asking',
    })], history: [savedPassage(1, { mediaReason: 'expired' })],
  }, { hasMedia: () => true });
  f.time = 4000;
  const before = structuredClone(f.watch.snapshot());
  const snapshot = t.mock.method(f.watch, 'snapshot', () => assert.fail('snapshot is forbidden'));
  f.effects.length = 0;
  const first = f.watch.memoryView(), second = f.watch.memoryView(), expected = structuredClone(second);
  contract(first);
  assert.deepEqual(first.coverage.visionGaps, [{ id: 'moment-3', startMs: 2000, endMs: 3000, visionStatus: 'skipped', reason: 'asking' }]);
  assert.equal(first.passages[1].thumbnailAvailable, true);
  first.session.id = 'foreign';
  first.clock.elapsedMs = 90000;
  first.passages[0].observation.notes.push('Modifié');
  first.passages[0].topicSummary.text = 'Modifié';
  first.passages[0].modalities.audio = 'absent';
  first.passages[1].availability.replayable = false;
  first.passages.pop();
  first.coverage.visionGaps[0].reason = 'Modifié';
  first.coverage.captureGaps.push({ startMs: 0, endMs: 9999 });
  first.losses.audioError = 100;
  assert.deepEqual(second, expected);
  assert.deepEqual(f.watch.memoryView(), expected);
  assert.deepEqual(f.effects, []);
  assert.equal(snapshot.mock.callCount(), 0);
  snapshot.mock.restore();
  assert.deepEqual(f.watch.snapshot(), before, 'the legacy snapshot contract is unchanged by consultation');
});

test('historical reasons and unknown modalities survive restoration without rediscovering history media', t => {
  const f = fixture(t), reasons = ['expired', 'missing', 'not-kept', 'unreadable'];
  f.watch.restore({
    id: 'session', retention: 'until-deleted', history: [savedPassage(1, { mediaReason: 'unreadable' })],
    segments: [
      ...reasons.map((mediaReason, i) => savedPassage(i + 2, { mediaReason, available: false })),
      savedPassage(6, { revision: undefined }), savedPassage(7, { hasAudio: false }),
      savedPassage(8, { hasAudio: true, audioFailed: true }),
    ],
    questions: [{ question: 'Historique', answer: 'Conservé' }],
  }, { hasMedia: id => ['moment-1', 'moment-5', 'moment-6', 'moment-7', 'moment-8'].includes(id) });
  const view = f.watch.memoryView();
  contract(view);
  assert.deepEqual(view.passages.slice(1, 5).map(p => p.availability.reason), reasons);
  assert.deepEqual(view.passages[0].availability, { replayable: false, reason: 'missing', images: false, audio: false });
  assert.deepEqual(view.passages[5].modalities, { audio: 'unknown', video: 'unknown', images: 'unknown' });
  assert.equal(view.passages[5].revision, null, 'unversioned archives do not invent a revision');
  assert.deepEqual(view.passages[5].availability, { replayable: true, reason: null, images: null, audio: null });
  assert.equal(view.passages[6].modalities.audio, 'absent');
  assert.equal(view.passages[7].modalities.audio, 'present');
  assert.equal(view.passages[7].audioFailed, true);
  assert.equal(view.passages[7].availability.audio, true, 'transcription failure does not remove captured sound');
  assert.equal(view.session.readOnly, true);
  assert.deepEqual([view.coverage.passages, view.coverage.historyPassages, view.coverage.replayablePassages], [8, 1, 3]);
  assert.deepEqual(f.effects, [], 'restoration and consultation are silent');
  assert.deepEqual(f.watch.snapshot().questions, [{ question: 'Historique', answer: 'Conservé' }]);
});

test('unreadable capture keeps known stills and absent audio without changing the persisted passage shape', async t => {
  const completed = deferred();
  const f = fixture(t, { transcribe: async () => ({ observation: {} }), observeVisual: async () => visualResult });
  f.onState = state => { if (state.segments[0]?.status === 'ready') completed.resolve(); };
  f.time = 1000;
  await f.watch.ingest(block(0, { clip: new Uint8Array(), audio: null }));
  await completed.promise;
  const view = f.watch.memoryView(), passage = view.passages[0];
  contract(view);
  assert.deepEqual(passage.modalities, { audio: 'absent', images: 'present', video: 'absent' });
  assert.deepEqual(passage.availability, { replayable: false, reason: 'unreadable', images: true, audio: false });
  assert.equal(view.losses.videoUnreadable, 1);
  const saved = f.watch.snapshot();
  assert.equal('modalities' in saved.segments[0], false);
  const reopened = fixture(t);
  reopened.watch.restore(saved, { hasMedia: () => true });
  assert.deepEqual(reopened.watch.memoryView().passages[0].modalities, { audio: 'absent', images: 'unknown', video: 'unknown' });
});

test('a frozen question prefix can reread newer evidence without widening identity, anchor or intervals', async t => {
  const vision = deferred(), visualStarted = deferred(), ready = deferred();
  const f = fixture(t, {
    transcribe: async () => audioResult,
    observeVisual: async () => {
      visualStarted.resolve();
      return vision.promise;
    },
  });
  f.onState = state => { if (state.segments[0]?.status === 'ready') ready.resolve(); };
  f.time = 2000;
  await f.watch.ingest(block(1000));
  await visualStarted.promise;
  const initial = f.watch.memoryView();
  const question = { sessionId: initial.session.id, anchorMs: initial.clock.elapsedMs,
    passages: initial.passages.filter(p => p.endMs <= initial.clock.elapsedMs) };
  assert.equal(question.passages[0].revision, 1);
  assert.deepEqual(initial.coverage.captureGaps, [{ startMs: 0, endMs: 1000 }]);
  vision.resolve(visualResult);
  await ready.promise;
  f.time = 9000;
  await f.watch.ingest(block(5000));
  const refreshed = question.passages.map(p => {
    const fresh = f.watch.memoryPassage(p.id);
    assert.equal(fresh.startMs, p.startMs);
    assert.equal(fresh.endMs, p.endMs);
    return fresh;
  });
  assert.equal(refreshed[0].revision, 2);
  assert.equal(refreshed[0].observation.summary, 'Résumé propre');
  assert.deepEqual([question.sessionId, question.anchorMs, refreshed.map(p => p.id)], ['session', 2000, ['moment-1']]);
  assert.equal(question.passages[0].revision, 1, 'the frozen consultation remains detached');
  assert.deepEqual([initial.coverage.startMs, initial.coverage.throughMs], [1000, 2000]);
  assert.equal(f.watch.memoryView().passages.length, 2);
});

async function runtimeFixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tvlens-memory-view-'));
  const runtime = createSessionRuntime({
    id: 'session', sessionsRoot: root, userData: root, selectedModels: {}, smoke: true,
    localInspection: true, readClock: () => 0, wallClock: () => 10000,
    overrides: { perception: {} },
  });
  t.after(async () => {
    await runtime.close();
    await fs.rm(root, { recursive: true, force: true });
  });
  return runtime;
}

test('composition binds read capabilities to its session and defers explicit deletion until the last lease is returned once', async t => {
  const runtime = await runtimeFixture(t);
  assert.equal(typeof runtime.memory?.view, 'function');
  assert.equal(typeof runtime.memoryMedia?.read, 'function');
  assert.equal(typeof runtime.memoryMedia?.lease, 'function');
  keys(runtime.memory, 'view passage passages recentPassages');
  keys(runtime.memoryMedia, 'read lease');
  runtime.watch.beginEnding();
  await runtime.watch.ingest(block(0, { clip: new Uint8Array() }));
  const view = runtime.memory.view();
  contract(view);
  assert.equal(view.session.id, runtime.id);
  assert.equal(runtime.memory.passage('moment-1').revision, 1);
  assert.deepEqual(runtime.memory.passages(['moment-1', 'absent']), { session: { id: runtime.id }, clock: view.clock, passages: view.passages });
  assert.deepEqual(runtime.memory.passage('moment-1').availability,
    { replayable: false, reason: 'unreadable', images: true, audio: true });
  assert.equal(runtime.memory.recentPassages(1)[0].id, 'moment-1');
  assert.equal(typeof view.passages[0].file, 'undefined');
  const first = await runtime.memoryMedia.lease(['moment-1']);
  const second = await runtime.memoryMedia.lease(['moment-1']);
  const removed = t.mock.method(runtime.store, 'remove');
  await runtime.store.remove('moment-1');
  assert.equal(await runtime.store.has('moment-1'), true, 'remove explicitly waits for active usage');
  await assert.rejects(runtime.memoryMedia.lease(['moment-1']), { code: 'TVLENS_MEMORY_MEDIA_UNAVAILABLE' });
  const evidence = await runtime.memoryMedia.read('moment-1');
  keys(evidence, 'frames audio');
  assert.deepEqual(evidence.frames, block().frames);
  assert.ok(evidence.audio instanceof Uint8Array);
  assert.deepEqual([...evidence.audio], [2]);
  assert.equal(typeof evidence.audio.path, 'undefined');
  const firstReturn = first();
  assert.equal(first(), firstReturn, 'concurrent release shares the same completion');
  await firstReturn;
  assert.equal(await runtime.store.has('moment-1'), true, 'the other usage still holds the media');
  await second();
  await second();
  assert.equal(await runtime.store.has('moment-1'), false);
  assert.equal(removed.mock.callCount(), 2, 'one requested remove and one effective remove');
  await assert.rejects(runtime.memoryMedia.read('moment-1'), error => {
    assert.equal(error.code, 'TVLENS_MEMORY_MEDIA_UNAVAILABLE');
    assert.equal(error.status, undefined);
    assert.equal(error.cause, undefined);
    assert.ok(!error.message.includes(runtime.store.root));
    assert.ok(!error.stack.includes(runtime.store.root));
    return true;
  });
});

test('a refused partial lease returns every acquired medium and never exposes adapter paths or HTTP status', async t => {
  const runtime = await runtimeFixture(t);
  assert.equal(typeof runtime.memoryMedia?.lease, 'function');
  await runtime.store.put('moment-1', block());
  await assert.rejects(runtime.memoryMedia.lease(['moment-1', 'moment-2']), { code: 'TVLENS_MEMORY_MEDIA_UNAVAILABLE' });
  await runtime.store.remove('moment-1');
  assert.equal(await runtime.store.has('moment-1'), false, 'the acquired prefix was released on refusal');
  await runtime.store.put('moment-2', block(1000));
  await runtime.store.remove('moment-2');
  assert.equal(await runtime.store.has('moment-2'), false, 'the missing medium did not retain a lease either');
  const fault = Object.assign(Error('/private/path/provider-secret'), { status: 404 });
  t.mock.method(runtime.store, 'read', async () => { throw fault; });
  t.mock.method(runtime.store, 'lease', async () => { throw fault; });
  for (const read of [() => runtime.memoryMedia.read('moment-1'), () => runtime.memoryMedia.lease(['moment-1'])]) {
    await assert.rejects(read(), error => {
      assert.equal(error.code, 'TVLENS_MEMORY_MEDIA_UNAVAILABLE');
      assert.equal(error.status, undefined);
      assert.equal(error.cause, undefined);
      assert.doesNotMatch(error.message, /private|provider-secret/);
      return true;
    });
  }
});

test('processing header exposes held vision, pending counts and blocked duration for session views', async t => {
  const audioPublished = deferred();
  const f = fixture(t, { transcribe: async () => audioResult, observeVisual: async () => visualResult });
  f.onState = state => { if (state.segments[0]?.visionStatus === 'queued') audioPublished.resolve(); };
  f.watch.setQuestionPending(true);
  f.time = 1000;
  await f.watch.ingest(block());
  await audioPublished.promise;
  f.time = 4000;
  const view = f.watch.memoryView();
  assert.equal(view.session.asking, true);
  assert.deepEqual([view.coverage.pending, view.coverage.audioPending, view.coverage.visionPending,
    view.coverage.analyzing, view.coverage.visionBlockedMs], [1, 0, 1, false, 3000]);
  assert.deepEqual([view.clock.elapsedMs, view.clock.contextThroughMs], [4000, 1000]);
});

test('consultation distinguishes explicit null metadata from absent metadata for historical projections', t => {
  const f = fixture(t);
  f.watch.segments.push(
    savedPassage(1),
    savedPassage(2, { audioStatus: null, visionStatus: null, audioError: null, visionError: null }),
  );
  const view = f.watch.memoryView();
  assert.deepEqual(view.passages.map(p => p.explicitNulls), [[], ['audioStatus', 'visionStatus', 'audioError', 'visionError']]);
  view.passages[1].explicitNulls.push('summary');
  assert.deepEqual(f.watch.memoryPassage('moment-2').explicitNulls, ['audioStatus', 'visionStatus', 'audioError', 'visionError']);
  assert.deepEqual(f.watch.recentMemoryPassages(1)[0], f.watch.memoryPassage('moment-2'));
});

test('mixed historical and retained losses keep intervals, causes and acquired counters across archive round trips', t => {
  const f = fixture(t);
  const coverage = { audioSkipped: 8, audioExpired: 2, audioError: 3, visionSkippedBacklog: 4, visionSkippedAsking: 1,
    visionExpired: 2, visionError: 3, visionBlockedMs: 700, visionRetried: 2, visionRecovered: 1, videoUnreadable: 1 };
  f.watch.restore({
    id: 'session', retention: 'rolling', retentionMs: 1000, coverage,
    history: [
      savedPassage(1, { status: 'expired' }),
      savedPassage(2, { status: 'partial', audioStatus: 'error', visionStatus: 'ready' }),
      savedPassage(3, { status: 'partial', audioStatus: 'ready', visionStatus: 'expired' }),
    ],
    segments: [
      savedPassage(4, { audioStatus: 'ready', audioFailed: true, audioFailureCode: 'NO_TRANSCRIPT' }),
      savedPassage(5, { status: 'partial', visionStatus: 'skipped', visionSkipReason: 'asking' }),
      savedPassage(6, { status: 'partial', visionStatus: 'error', visionSkipReason: null }),
      savedPassage(7, { status: 'partial', visionStatus: 'skipped', visionSkipReason: '' }),
    ],
  }, { hasMedia: () => true });
  const snapshot = f.watch.snapshot();
  const view = f.watch.memoryView();
  assert.deepEqual(snapshot.coverage, { passages: 7, ...coverage });
  const { visionBlockedMs, ...losses } = coverage;
  assert.deepEqual(view.losses, losses);
  assert.equal(view.coverage.visionBlockedMs, visionBlockedMs);
  assert.deepEqual(view.coverage.gaps, [{ id: 'moment-1', startMs: 0, endMs: 1000, status: 'expired' }]);
  assert.deepEqual(view.coverage.audioGaps, [
    { id: 'moment-2', startMs: 1000, endMs: 2000, audioStatus: 'error' },
    { id: 'moment-4', startMs: 3000, endMs: 4000, audioStatus: 'failed', code: 'NO_TRANSCRIPT' },
  ]);
  assert.deepEqual(view.coverage.visionGaps, [
    { id: 'moment-3', startMs: 2000, endMs: 3000, visionStatus: 'expired', reason: null },
    { id: 'moment-5', startMs: 4000, endMs: 5000, visionStatus: 'skipped', reason: 'asking' },
    { id: 'moment-6', startMs: 5000, endMs: 6000, visionStatus: 'error', reason: null },
    { id: 'moment-7', startMs: 6000, endMs: 7000, visionStatus: 'skipped', reason: '' },
  ]);
  assert.deepEqual(snapshot.gaps, view.coverage.gaps);
  assert.deepEqual(snapshot.audioGaps, view.coverage.audioGaps);
  assert.deepEqual(snapshot.visionGaps, [
    { id: 'moment-3', startMs: 2000, endMs: 3000, visionStatus: 'expired' },
    { id: 'moment-5', startMs: 4000, endMs: 5000, visionStatus: 'skipped', reason: 'asking' },
    { id: 'moment-6', startMs: 5000, endMs: 6000, visionStatus: 'error' },
    { id: 'moment-7', startMs: 6000, endMs: 7000, visionStatus: 'skipped' },
  ]);
  const { toArchive } = require('../core/memory/index.cjs');
  const reopened = fixture(t);
  reopened.watch.restore(JSON.parse(JSON.stringify(toArchive(snapshot))), { hasMedia: () => true });
  for (const watch of [f.watch, reopened.watch]) {
    for (let read = 0; read < 3; read++) {
      assert.deepEqual(watch.snapshot().coverage, snapshot.coverage);
      assert.deepEqual(watch.memoryView().coverage, view.coverage);
      assert.deepEqual(watch.memoryView().losses, view.losses);
    }
  }
  assert.deepEqual(f.effects, Array(4).fill('storage'), 'only explicit snapshots consult host storage');
  assert.deepEqual(reopened.effects, Array(3).fill('storage'));
});
