const { test } = require('node:test');
const assert = require('node:assert/strict');
const { PerceptionLanes, MemoryLifecycleState } = require('../core/memory/index.cjs');
const { deferred, tick } = require('./helpers/wait.cjs');

test('removing references reports queued audio and ends a generic vision hold at the last removal', async t => {
  let now = 0;
  const audio = deferred(), handedOver = deferred(), descriptions = [];
  const first = { id: 'first', status: 'queued', available: true };
  const second = { id: 'second', status: 'queued', available: true };
  const lanes = new PerceptionLanes({
    maxPending: 2,
    now: () => now,
    readMedia: async () => ({}),
    transcribe: async () => {
      await audio.promise;
      return { observation: { transcript: 'Paroles conservées.' } };
    },
    observeVisual: async passage => {
      descriptions.push(passage.id);
      return { observation: {} };
    },
    hasMedia: passage => passage.available,
    isEnding: () => false,
    isReadOnly: () => false,
    contextFor: () => ({}),
    update: () => {},
    addUsage: () => {},
    count: () => {},
    setError: () => {},
    clearErrorThrough: () => {},
    publish: () => { if (first.visionStatus === 'queued') handedOver.resolve(); },
    persist: async () => {},
  });
  t.after(() => lanes.close());
  lanes.setVisionHeld(true);
  lanes.enqueue(first);
  lanes.drain();
  lanes.enqueue(second);
  assert.equal(lanes.remove(second), true, 'the root can count the unprocessed audio as expired');
  assert.equal(lanes.state().audioPending, 0);
  audio.resolve();
  await handedOver.promise;
  now = 1200;
  assert.deepEqual(lanes.state(), { pending: 1, audioPending: 0, visionPending: 1, analyzing: false, heldMs: 1200 });
  assert.equal(lanes.remove(first), false, 'completed audio must not be counted as lost');
  assert.equal(lanes.remove(first), false, 'removing an absent reference is idempotent');
  now = 4000;
  assert.deepEqual(lanes.state(), { pending: 0, audioPending: 0, visionPending: 0, analyzing: false, heldMs: 1200 });
  lanes.setVisionHeld(false);
  lanes.drain();
  await tick();
  assert.deepEqual(descriptions, [], 'releasing cannot resurrect removed references');
});

test('read-only memory refuses a visual retry before and after the second media read', async t => {
  for (const stage of ['failure', 'reread']) {
    let lifecycle = new MemoryLifecycleState(), calls = 0, reads = 0;
    const entered = deferred(), release = deferred(), finished = deferred();
    const retried = [], losses = [];
    const refusal = Object.assign(Error('Connexion coupée'), { code: 'TVLENS_VISION_TRANSIENT' });
    const passage = { id: 'moment-1', status: 'queued', available: true };
    const lanes = new PerceptionLanes({
      maxPending: 2,
      now: () => 0,
      readMedia: async () => {
        if (++reads === 3 && stage === 'reread') {
          entered.resolve();
          await release.promise;
        }
        return {};
      },
      transcribe: async () => ({ observation: { transcript: 'Paroles conservées.' } }),
      observeVisual: async () => {
        calls++;
        if (stage === 'failure') {
          entered.resolve();
          await release.promise;
        }
        throw refusal;
      },
      hasMedia: () => true,
      isEnding: () => lifecycle.ending,
      isReadOnly: () => lifecycle.readOnly,
      contextFor: () => ({}),
      update: (segment, lane, cause) => { if (cause) losses.push([lane, cause]); },
      addUsage: () => {},
      count: name => retried.push(name),
      setError: () => {},
      clearErrorThrough: () => {},
      publish: () => {},
      persist: async () => { if (passage.visionStatus === 'error') finished.resolve(); },
    });
    t.after(() => lanes.close());
    lanes.enqueue(passage);
    lanes.drain();
    await entered.promise;
    lifecycle = lifecycle.restore();
    release.resolve();
    await finished.promise;
    assert.deepEqual([calls, reads, retried, losses], [1, stage === 'failure' ? 2 : 3, [], [['vision', 'error']]], stage);
    assert.deepEqual([passage.status, passage.visionStatus, passage.visionError], ['partial', 'error', refusal.message], stage);
  }
});
