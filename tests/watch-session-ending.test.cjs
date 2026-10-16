const { test } = require('node:test');
const assert = require('node:assert/strict');
const { WatchSession } = require('../core/session.cjs');
const { tick, deferred } = require('./helpers/wait.cjs');

function fixture(split) {
  const publications = [];
  const saves = [];
  const calls = [];
  const files = new Map();
  const provider = name => async () => {
    calls.push(name);
    return { observation: { summary: 'Un plateau.', transcript: 'Bonjour.' } };
  };
  const perception = split
    ? { transcribe: provider('transcribe'), observeVisual: provider('observeVisual') }
    : { observe: provider('observe') };
  const watch = new WatchSession({
    id: 'session',
    now: () => 1000,
    perception,
    answer: { ask: provider('ask') },
    media: {
      put: async (id, input) => { files.set(id, input); },
      read: async id => files.get(id),
      remove: async id => { files.delete(id); },
    },
    archive: { save: async state => { saves.push(state); } },
    onChange: state => publications.push(state),
    visionDuringAsk: true,
  });
  return { watch, publications, saves, calls, files };
}

const flags = watch => ({
  ending: watch.ending,
  accepting: watch.accepting,
  asking: watch.asking,
  readOnly: watch.readOnly,
  closed: watch.closed,
});
const block = () => ({
  startMs: 0,
  endMs: 1000,
  clip: new Uint8Array([1]),
  audio: new Uint8Array([1]),
  frames: [],
});

for (const split of [false, true]) {
  test(`beginEnding silently keeps intake open and stores passages without analysis (${split ? 'split' : 'single'} perception)`, async () => {
    const { watch, publications, saves, calls, files } = fixture(split);
    assert.equal(typeof watch.beginEnding, 'function');
    const before = watch.snapshot();
    for (let repeat = 0; repeat < 2; repeat++) {
      assert.equal(watch.beginEnding(), undefined);
      assert.deepEqual(flags(watch), { ending: true, accepting: true, asking: false, readOnly: false, closed: false });
      assert.deepEqual(watch.snapshot(), before);
      assert.deepEqual([publications.length, saves.length], [0, 0]);
    }

    const input = block();
    assert.equal(await watch.ingest(input), 'moment-1');
    assert.equal(files.get('moment-1'), input);
    const state = watch.snapshot();
    assert.deepEqual(state.segments.map(segment => [segment.id, segment.status, segment.available]), [['moment-1', 'queued', true]]);
    assert.deepEqual([state.pending, state.audioPending, state.visionPending, state.analyzing, state.apiCalls], [0, 0, 0, false, 0]);
    assert.deepEqual(calls, []);
    assert.ok(publications.length > 0, 'ingestion still publishes its passage');
    assert.deepEqual(saves.at(-1).segments.map(segment => segment.id), ['moment-1']);
  });
}

test('beginEnding silently preserves every existing lifecycle flag across repeated calls', async () => {
  for (const state of ['intake-closed', 'paused', 'read-only', 'closed']) {
    const { watch, publications, saves } = fixture(true);
    if (state === 'intake-closed') watch.closeIntake();
    if (state === 'paused') await watch.stop();
    if (state === 'read-only') watch.restore({ id: 'session', segments: [], retention: 'until-deleted', elapsedMs: 1000 });
    if (state === 'closed') await watch.close();
    const before = flags(watch);
    const snapshot = watch.snapshot();
    const published = publications.length;
    const saved = saves.length;

    for (let repeat = 0; repeat < 2; repeat++) {
      assert.equal(watch.beginEnding(), undefined, state);
      assert.deepEqual(flags(watch), { ...before, ending: true }, state);
      assert.deepEqual(watch.snapshot(), snapshot, state);
      assert.deepEqual([publications.length, saves.length], [published, saved], state);
    }
  }
});

test('closeIntake silently refuses new passages and questions while preserving the other flags', async () => {
  for (const state of ['live', 'ending', 'read-only', 'closed']) {
    const { watch, publications, saves, calls, files } = fixture(true);
    assert.equal(typeof watch.closeIntake, 'function');
    if (state === 'ending') watch.beginEnding();
    if (state === 'read-only') watch.restore({ id: 'session', segments: [], retention: 'until-deleted', elapsedMs: 1000 });
    if (state === 'closed') await watch.close();
    const before = flags(watch);
    const published = publications.length;
    const saved = saves.length;

    for (let repeat = 0; repeat < 2; repeat++) {
      assert.equal(watch.closeIntake(), undefined);
      assert.deepEqual(flags(watch), { ...before, asking: true, accepting: false }, state);
      assert.deepEqual([publications.length, saves.length], [published, saved], state);
    }

    await assert.rejects(watch.ingest(block()), { message: 'La session est arrêtée.' });
    await assert.rejects(watch.ask('Que voit-on ?'), { message: 'Une réponse est déjà en cours.' });
    assert.deepEqual([watch.snapshot().segments, files.size, calls], [[], 0, []], state);
    assert.deepEqual([publications.length, saves.length], [published, saved], state);
  }
});

for (const split of [false, true]) {
  for (const ending of ['ending', 'closed']) {
    test(`question resumption starts no analysis or publication after ${ending} (${split ? 'split' : 'single'} perception)`, async () => {
      const { watch, publications, calls } = fixture(split);
      watch.visionDuringAsk = false;
      watch.setQuestionPending(true);
      await watch.ingest(block());
      await tick();
      const before = calls.slice();
      watch.setQuestionPending(false);
      if (ending === 'ending') watch.beginEnding();
      const closing = ending === 'closed' ? watch.close() : null;
      const published = publications.length;
      await tick();
      assert.deepEqual(calls, before, 'the deferred resumption cannot start a provider');
      assert.equal(publications.length, published);
      watch.setQuestionPending(true);
      assert.equal(watch.snapshot().asking, true, 'late notifications still update the readable state');
      watch.setQuestionPending(false);
      assert.equal(watch.snapshot().asking, false);
      await tick();
      assert.equal(publications.length, published, 'late question notifications stay silent');
      assert.deepEqual(calls, before);
      await closing;
      await watch.close();
    });
  }
}

test('a question completion cannot reopen the intake closed silently during session teardown', async () => {
  const { watch, publications, calls, saves } = fixture(true);
  watch.setQuestionPending(true);
  watch.closeIntake();
  const published = publications.length;
  watch.setQuestionPending(false);
  await tick();
  assert.deepEqual([watch.snapshot().asking, watch.snapshot().accepting], [true, false]);
  await assert.rejects(watch.ask('Que voit-on ?'), { message: 'Une réponse est déjà en cours.' });
  await assert.rejects(watch.ingest(block()), { message: 'La session est arrêtée.' });
  assert.deepEqual([publications.length, calls, saves.length], [published, [], 0]);
  await watch.close();
});

test('an ending session still refuses a second question while its first answer is pending', async t => {
  const { watch } = fixture(false), reply = deferred();
  t.after(() => watch.close());
  await watch.ingest(block());
  await tick();
  watch.answer.ask = async () => {
    await reply.promise;
    return { answer: 'Ok.', kind: 'explanation', citations: [], limits: [] };
  };
  watch.beginEnding();
  const first = watch.ask('Que voit-on ?');
  try {
    assert.equal(watch.snapshot().asking, true);
    await assert.rejects(watch.ask('Une autre question ?'), { message: 'Une réponse est déjà en cours.' });
  } finally {
    reply.resolve();
    await first;
  }
  assert.equal(watch.snapshot().asking, false);
});
