const { memoryOf } = require('./helpers/memory-consultation.cjs');
const viewOf = state => memoryOf(state).view();
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises"),
  path = require("node:path"),
  os = require("node:os");
const sharp = require("sharp");
const { deferred } = require("./helpers/wait.cjs");
const {
  sessionTimeline,
  momentDetail,
} = require("../core/session-timeline.cjs");
const { WatchSession } = require("../core/session.cjs");
const { SessionThumbnails } = require("../adapters/session-thumbnails.cjs");
const { LocalSessionStore } = require("../adapters/local-store.cjs");
const passage = (id, start, topic, status = "ready") => ({
  id: "moment-" + id,
  startMs: start,
  endMs: start + 8000,
  status,
  available: true,
  thumbnailAvailable: true,
  observation:
    status === "ready"
      ? { topic, summary: "Résumé " + id, transcript: "Paroles " + id }
      : null,
});
test("timeline groups only contiguous known subjects and retains unanalysed/failed passages", () => {
  const snapshot = {
    id: "session",
    history: [],
    segments: [
      passage(1, 0, "Énergie"),
      passage(2, 8000, "Énergie"),
      passage(3, 16000, "", "analyzing"),
      passage(4, 24000, "Énergie"),
      passage(5, 40000, "Énergie"),
      passage(6, 48000, "", "error"),
    ],
  };
  const result = sessionTimeline(viewOf(snapshot));
  assert.equal(result.cards.length, 5);
  assert.deepEqual(result.cards[0].segmentIds, ["moment-1", "moment-2"]);
  assert.equal(result.cards[0].endMs, 16000);
  assert.equal(result.cards[1].status, "pending");
  assert.equal(result.cards[4].status, "error");
  snapshot.segments[2] = passage(3, 16000, "Énergie");
  const updated = sessionTimeline(viewOf(snapshot));
  assert.equal(updated.cards[0].id, "moment-1");
  assert.equal(updated.cards[0].endMs, 32000);
  assert.equal(updated.cards[1].startMs, 40000);
});
test("selected moments resolve from archived observations without pretending raw media is available", () => {
  const a = passage(1, 0, "Énergie"),
    b = passage(2, 8000, "Énergie"),
    c = passage(3, 16000, "Autre");
  delete a.available;
  const snapshot = { id: "session", history: [a], segments: [b, c] };
  const result = momentDetail(viewOf(snapshot), ["moment-1", "moment-2"]);
  assert.equal(result.startMs, 0);
  assert.equal(result.endMs, 16000);
  assert.equal(result.passages[0].available, false);
  assert.equal(result.passages[0].transcript, "Paroles 1");
  assert.throws(
    () => momentDetail(viewOf(snapshot), ["moment-1", "moment-3"]),
    /discontinu/,
  );
  assert.throws(() => momentDetail(viewOf(snapshot), ["moment-99"]), /absent/);
});
test("thumbnail exists before analysis, survives raw expiry, pause and the end of the session; only an explicit purge removes it", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "tvlens-thumbnails-"));
  const dir = path.join(root, "session");
  const thumbnails = new SessionThumbnails(path.join(dir, "thumbnails"));
  const media = new LocalSessionStore(dir);
  const jpeg = await sharp({
    create: { width: 640, height: 360, channels: 3, background: "#173952" },
  })
    .jpeg()
    .toBuffer();
  let now = 8000;
  const audio = deferred(), described = deferred();
  const watch = new WatchSession({
    id: "session",
    now: () => now,
    media,
    archive: media,
    thumbnails,
    perception: {
      transcribe: async () => { await audio.promise; return { observation: {} }; },
      observeVisual: async () => ({ observation: { summary: "Résumé conservé." } }),
    },
    onChange: state => {
      if (state.segments[0]?.status === "ready") described.resolve();
    },
    retentionMs: 10000,
  });
  watch.setQuestionPending(true);
  try {
    await watch.ingest({
      startMs: 0,
      endMs: 8000,
      clip: Buffer.from("raw"),
      frames: [
        {
          atMs: 0,
          dataUrl: "data:image/jpeg;base64," + jpeg.toString("base64"),
        },
      ],
    });
    assert.equal(watch.segments[0].status, "analyzing");
    assert.equal(watch.segments[0].observation, null);
    assert.equal(watch.segments[0].thumbnailAvailable, true);
    assert.equal(
      (await sharp(await thumbnails.read("moment-1")).metadata()).width,
      320,
    );
    audio.resolve();
    watch.setQuestionPending(false);
    await described.promise;
    assert.equal(watch.snapshot().segments[0].observation.summary, "Résumé conservé.");
    await watch.stop();
    await watch.resume();
    now = 30000;
    await watch.prune();
    assert.equal(watch.history[0].thumbnailAvailable, true);
    await assert.rejects(media.read("moment-1"));
    assert.ok((await thumbnails.read("moment-1")).length);
    // End of the session: no later write, and the image stays on disk for the archive.
    await thumbnails.close();
    await assert.rejects(
      thumbnails.put(
        "moment-2",
        "data:image/jpeg;base64," + jpeg.toString("base64"),
      ),
      /terminée/,
    );
    const reopened = new SessionThumbnails(path.join(dir, "thumbnails"));
    assert.ok((await reopened.read("moment-1")).length);
    await reopened.clear();
    await assert.rejects(
      new SessionThumbnails(path.join(dir, "thumbnails")).read("moment-1"),
    );
  } finally {
    audio.resolve();
    await watch.close();
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('long topics use compact immutable boundaries without including newly appended passages', () => {
  const segments = Array.from({length:1201}, (_, i) => passage(i+1,i*8000,'Conférence'));
  const selection = {firstId:'moment-1',lastId:'moment-1200'};
  assert.ok(JSON.stringify(selection).length < 100);
  const detail = momentDetail(viewOf({id:'long',history:[],segments}),selection);
  assert.equal(detail.passages.length,1200);
  assert.equal(detail.endMs,9600000);
  assert.equal(detail.passages.at(-1).id,'moment-1200');
  assert.throws(()=>momentDetail(viewOf({id:'long',history:[],segments}),{firstId:'moment-3',lastId:'moment-1'}),/invalides/);
});

for (const [condition, selection, code, message] of [
  ['empty selection', [], 'TVLENS_MOMENT_SELECTION_INVALID', 'Sélection de moments invalide.'],
  ['duplicate selection', ['moment-1', 'moment-1'], 'TVLENS_MOMENT_SELECTION_INVALID', 'Sélection de moments invalide.'],
  ['reversed boundaries', { firstId: 'moment-2', lastId: 'moment-1' }, 'TVLENS_MOMENT_SELECTION_INVALID', 'Bornes de moment invalides.'],
  ['missing moment', ['moment-99'], 'TVLENS_MOMENT_MISSING', 'Moment absent de cette session.'],
  ['noncontiguous interval', ['moment-1', 'moment-3'], 'TVLENS_MOMENT_INTERVAL_DISCONTINUOUS', 'Intervalle discontinu.'],
]) {
  test(`moment refusals expose ${code} for ${condition}`, () => {
    const snapshot = { id: 's', history: [], segments: [1, 2, 3].map(n => passage(n, (n - 1) * 8000, 'Sujet')) };
    assert.throws(() => momentDetail(viewOf(snapshot), selection), error => {
      assert.equal(error.code, code);
      assert.equal(require('../core/session-timeline.cjs')[code], code);
      assert.equal(error.message, message);
      assert.equal(error.status, undefined);
      return true;
    });
  });
}

test('timeline and selected details project the consultation contract with the frozen historical behavior', () => {
  const source = require('./fixtures/state-view-memory.json');
  const expected = require('./fixtures/state-view-responses.json');
  const view = memoryOf(source).view();
  let timeline;
  assert.doesNotThrow(() => { timeline = sessionTimeline(view); });
  assert.deepStrictEqual(timeline, expected['/v1/state'].timeline);
  const detail = momentDetail(view, { firstId: 'moment-1', lastId: 'moment-56' });
  assert.deepStrictEqual(JSON.parse(JSON.stringify(detail)), expected['/v1/moments/detail']);
  assert.deepStrictEqual(momentDetail(view, view.passages.map(p => p.id)), detail);
  const first = momentDetail(view, { firstId: 'moment-1', lastId: 'moment-3' });
  assert.equal(first.summaryKind, 'cumulative');
  assert.equal(first.summary, timeline.cards[0].summary);
  assert.equal(momentDetail(view, ['moment-2', 'moment-3']).summaryKind, 'bounded-excerpts');
});

test('a late thumbnail enriches a pending consultation card without changing its identity or media availability', () => {
  const source = { id: 's', history: [], segments: [{ ...passage(1, 0, '', 'queued'), thumbnailAvailable: false }] };
  let before;
  assert.doesNotThrow(() => { before = sessionTimeline(memoryOf(source).view()).cards[0]; });
  assert.deepEqual([before.id, before.status, before.thumbnailId, before.mediaAvailable], ['moment-1', 'pending', null, true]);
  source.segments[0].thumbnailAvailable = true;
  const after = sessionTimeline(memoryOf(source).view()).cards[0];
  assert.deepEqual(after, { ...before, thumbnailId: 'moment-1' });
});
