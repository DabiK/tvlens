const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises"),
  path = require("node:path"),
  os = require("node:os");
const sharp = require("sharp");
const {
  sessionTimeline,
  momentDetail,
} = require("../core/session-timeline.cjs");
const { WatchSession } = require("../core/session.cjs");
const { SessionThumbnails } = require("../adapters/session-thumbnails.cjs");
const {
  LocalSessionStore,
  cleanupRawMedia,
} = require("../adapters/local-store.cjs");
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
  const result = sessionTimeline(snapshot);
  assert.equal(result.cards.length, 5);
  assert.deepEqual(result.cards[0].segmentIds, ["moment-1", "moment-2"]);
  assert.equal(result.cards[0].endMs, 16000);
  assert.equal(result.cards[1].status, "pending");
  assert.equal(result.cards[4].status, "error");
  snapshot.segments[2] = passage(3, 16000, "Énergie");
  const updated = sessionTimeline(snapshot);
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
  const result = momentDetail(snapshot, ["moment-1", "moment-2"]);
  assert.equal(result.startMs, 0);
  assert.equal(result.endMs, 16000);
  assert.equal(result.passages[0].available, false);
  assert.equal(result.passages[0].transcript, "Paroles 1");
  assert.throws(
    () => momentDetail(snapshot, ["moment-1", "moment-3"]),
    /discontinu/,
  );
  assert.throws(() => momentDetail(snapshot, ["moment-99"]), /absent/);
});
test("thumbnail exists before analysis, survives raw expiry and pause, and is removed at session cleanup", async () => {
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
  const watch = new WatchSession({
    id: "session",
    now: () => now,
    media,
    archive: media,
    thumbnails,
    perception: {},
    retentionMs: 10000,
  });
  watch.asking = true;
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
    assert.equal(watch.segments[0].status, "queued");
    assert.equal(watch.segments[0].thumbnailAvailable, true);
    assert.equal(
      (await sharp(await thumbnails.read("moment-1")).metadata()).width,
      320,
    );
    await watch.stop();
    await watch.resume();
    now = 30000;
    await watch.prune();
    assert.equal(watch.history[0].thumbnailAvailable, true);
    await assert.rejects(media.read("moment-1"));
    assert.ok((await thumbnails.read("moment-1")).length);
    await cleanupRawMedia(root);
    await assert.rejects(thumbnails.read("moment-1"));
    await thumbnails.clear();
    await assert.rejects(
      thumbnails.put(
        "moment-2",
        "data:image/jpeg;base64," + jpeg.toString("base64"),
      ),
      /terminée/,
    );
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('long topics use compact immutable boundaries without including newly appended passages', () => {
  const segments = Array.from({length:1201}, (_, i) => passage(i+1,i*8000,'Conférence'));
  const selection = {firstId:'moment-1',lastId:'moment-1200'};
  assert.ok(JSON.stringify(selection).length < 100);
  const detail = momentDetail({id:'long',history:[],segments},selection);
  assert.equal(detail.passages.length,1200);
  assert.equal(detail.endMs,9600000);
  assert.equal(detail.passages.at(-1).id,'moment-1200');
  assert.throws(()=>momentDetail({id:'long',history:[],segments},{firstId:'moment-3',lastId:'moment-1'}),/invalides/);
});
