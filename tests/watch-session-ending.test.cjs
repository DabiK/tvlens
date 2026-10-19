const { test } = require('node:test');
const assert = require('node:assert/strict');
const { WatchSession } = require('../core/session.cjs');
const { tick, deferred } = require('./helpers/wait.cjs');

function fixture() {
  const publications = [];
  const saves = [];
  const calls = [];
  const files = new Map();
  const provider = name => async () => {
    calls.push(name);
    return { observation: { summary: 'Un plateau.', transcript: 'Bonjour.' } };
  };
  const perception = { transcribe: provider('transcribe'), observeVisual: provider('observeVisual') };
  const watch = new WatchSession({
    id: 'session',
    now: () => 1000,
    perception,
    media: {
      put: async (id, input) => { files.set(id, input); },
      read: async id => files.get(id),
      remove: async id => { files.delete(id); },
    },
    archive: { save: async state => { saves.push(state); } },
    onInvalidate: () => publications.push(watch.snapshot()),
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

test('lifecycle reads cannot change the state owned by the memory', () => {
  const { watch, publications, saves } = fixture();
  const before = flags(watch);
  for (const flag of ['closed', 'ending', 'accepting', 'readOnly']) {
    assert.equal(Reflect.set(watch, flag, !before[flag]), false, flag);
  }
  const snapshot = watch.snapshot();
  snapshot.accepting = false;
  snapshot.readOnly = true;
  assert.deepEqual(flags(watch), before);
  assert.deepEqual([publications, saves], [[], []]);
});

test('restoration refusals preserve the memory and precede all effects', async () => {
  for (const state of ['closed', 'started', 'invalid archive']) {
    const { watch, publications, saves, calls, files } = fixture();
    if (state === 'closed') await watch.close();
    if (state === 'started') watch.restore({ id: 'session', segments: [{
      id: 'moment-1', startMs: 0, endMs: 1000, status: 'ready', observation: { summary: 'Un plateau.' },
    }] });
    const before = structuredClone(watch.snapshot());
    const previousFlags = flags(watch);
    const counts = [publications.length, saves.length];
    const events = [];
    watch.onEvents = pending => events.push(...pending);
    const archived = state === 'invalid archive' ? { id: 'session', segments: null } : { id: 'other', segments: [] };
    const code = state === 'invalid archive' ? 'TVLENS_ARCHIVE_INVALID' : 'TVLENS_MEMORY_RESTORE_REFUSED';

    assert.throws(() => watch.restore(archived), { code }, state);
    assert.deepEqual(watch.snapshot(), before, state);
    assert.deepEqual(flags(watch), previousFlags, state);
    assert.deepEqual([publications.length, saves.length], counts, state);
    assert.deepEqual([calls, files.size, events], [[], 0, []], state);
  }
});

test(`beginEnding silently keeps intake open and stores passages without analysis (audio and vision)`, async () => {
  const { watch, publications, saves, calls, files } = fixture();
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

test('beginEnding silently preserves every existing lifecycle flag across repeated calls', async () => {
  for (const state of ['intake-closed', 'paused', 'read-only', 'closed']) {
    const { watch, publications, saves } = fixture();
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
    const { watch, publications, saves, calls, files } = fixture();
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
    assert.deepEqual([watch.snapshot().segments, files.size, calls], [[], 0, []], state);
    assert.deepEqual([publications.length, saves.length], [published, saved], state);
  }
});

for (const ending of ['ending', 'closed']) {
  test(`question resumption starts no analysis or publication after ${ending} (audio and vision)`, async () => {
    const { watch, publications, calls } = fixture();
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

test('a question completion cannot reopen the intake closed silently during session teardown', async () => {
  const { watch, publications, calls, saves } = fixture();
  watch.setQuestionPending(true);
  watch.closeIntake();
  const published = publications.length;
  watch.setQuestionPending(false);
  await tick();
  assert.deepEqual([watch.snapshot().asking, watch.snapshot().accepting], [true, false]);
  await assert.rejects(watch.ingest(block()), { message: 'La session est arrêtée.' });
  assert.deepEqual([publications.length, calls, saves.length], [published, [], 0]);
  await watch.close();
});

for (const [lane, heldRead, expected] of [['audio', 1, []], ['vision', 2, ['transcribe']]]) {
  test(`ending during the ${lane} media read starts no new provider call`, async t => {
    const { watch, calls, files } = fixture();
    const entered = deferred(), release = deferred();
    const read = watch.media.read;
    let reads = 0;
    watch.media.read = async id => {
      if (++reads === heldRead) {
        entered.resolve();
        await release.promise;
      }
      return read(id);
    };
    t.after(() => watch.close());
    const landing = watch.ingest(block());
    await entered.promise;
    watch.beginEnding();
    release.resolve();
    await landing;
    await tick();
    assert.deepEqual(calls, expected, 'media returning during teardown cannot start an analysis');
    assert.equal(files.size, 1, 'the admitted media stay stored');
    assert.equal(watch.snapshot().apiCalls, 0);
  });
}
