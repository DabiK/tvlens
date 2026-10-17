const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { createSessionRuntime } = require('../runtime/session-runtime.cjs');

async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tvlens-memory-projection-'));
  const f = { time: 0 };
  f.runtime = createSessionRuntime({
    id: 'projection', sessionsRoot: root, userData: root, smoke: true, selectedModels: {},
    readClock: () => f.time, overrides: { perception: {} },
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

test('a complete read stays fresh while a changed availability waits for media removal before publication', async t => {
  const { deferred } = require('./helpers/wait.cjs');
  const { runtime } = await fixture(t);
  const { watch, memoryProjection } = runtime;
  const entered = deferred(), removal = deferred();
  t.after(() => removal.resolve());
  watch.beginEnding();
  watch.retentionMs = 1000;
  await watch.ingest({ startMs: 0, endMs: 1000, clip: new Uint8Array([1]), frames: [], audio: null });
  memoryProjection.read();
  const remove = runtime.store.remove.bind(runtime.store);
  t.mock.method(runtime.store, 'remove', async id => {
    entered.resolve();
    await removal.promise;
    return remove(id);
  });
  t.mock.method(watch, 'now', () => 5000);
  const pruning = watch.prune();
  await entered.promise;
  try {
    assert.deepStrictEqual(memoryProjection.read().session, watch.snapshot(), 'the full body observes the current consultation before the next publication');
  } finally {
    removal.resolve();
    await pruning;
  }
});

test('historical null flags, empty optional codes and extension names survive consultation normalization', async t => {
  const { runtime } = await fixture(t);
  const { watch, memoryProjection } = runtime;
  watch.segments.push({
    id: 'moment-1', startMs: 0, endMs: 1000, status: 'partial', observation: null,
    available: null, thumbnailAvailable: null, audioFailed: null, audioFailureCode: '',
    origin: 'extension', metadata: { custom: true }, fieldOrder: ['extension'],
  });
  const expected = watch.snapshot();
  const snapshot = t.mock.method(watch, 'snapshot', () => assert.fail('snapshot is forbidden'));
  try {
    assert.deepStrictEqual(memoryProjection.read().session, expected);
  } finally {
    snapshot.mock.restore();
  }
});
