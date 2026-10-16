const { test } = require("node:test");
const assert = require("node:assert/strict");
const { WatchSession } = require("../core/session.cjs");
const { SessionClock } = require("../core/session-clock.cjs");
const { RevocableInspector } = require("../core/revocable-inspector.cjs");
const { createSessionManifest } = require("../runtime/session-manifest.cjs");
const { createSessionLifecycle } = require("../runtime/session-lifecycle.cjs");

const deferred = () => Promise.withResolvers();
const ioError = () => Object.assign(new Error("Écriture refusée."), { code: "EIO" });

function fixture({ restore = null } = {}) {
  const f = {
    time: 0,
    wall: 1000,
    events: [],
    saves: [],
    writes: [],
    indexed: [],
    analysed: [],
    adoptions: [],
    files: new Map(),
    closed: [],
    closeRefusals: new Map(),
  };
  const resource = (name) => ({
    async close() {
      f.closed.push(name);
      if (f.closeRefusals.has(name)) throw f.closeRefusals.get(name);
    },
  });
  const store = {
    bytes: 0,
    manifest: null,
    confirmed: null,
    adopt(...args) {
      f.adoptions.push(args);
      store.bytes = args[0].mediaBytes;
      store.manifest = store.confirmed = args[2];
    },
    async put(id, input) {
      f.putEntered?.resolve();
      await f.putGate?.promise;
      f.files.set(id, input);
    },
    read: async (id) => f.files.get(id),
    async save(state) {
      if (f.sealed) return;
      f.events.push("state requested");
      f.saveEntered?.resolve();
      await f.saveGate?.promise;
      if (f.saveRefusal) throw f.saveRefusal;
      f.saves.push(state);
      f.events.push("state saved");
    },
    async flush() {
      f.events.push("flush requested");
      f.flushEntered?.resolve();
      await f.flushGate?.promise;
      if (f.flushRefusal) throw f.flushRefusal;
      f.events.push("flushed");
    },
    async saveManifest(value) {
      if (f.sealed) return;
      store.manifest = structuredClone(value);
      f.events.push("manifest requested");
      f.manifestEntered?.resolve();
      await f.manifestGate?.promise;
      if (f.manifestRefusal) throw f.manifestRefusal;
      store.confirmed = structuredClone(value);
      f.writes.push(store.confirmed);
      f.events.push("manifest saved");
    },
    async clearRaw() {
      f.events.push("raw cleared");
      f.files.clear();
      store.bytes = 0;
    },
    async seal() {
      f.events.push("store sealed");
      f.sealed = true;
      await f.storeSealGate?.promise;
    },
  };
  const thumbnails = {
    bytes: 0,
    ...resource("thumbnails"),
    async clear() {
      f.events.push("thumbnails cleared");
      thumbnails.bytes = 0;
    },
  };
  const vectors = {
    async seal() {
      f.events.push("vectors sealed");
      await f.vectorSealGate?.promise;
    },
  };
  const perception = {
    ...resource("perception"),
    async observe(input) {
      f.analysed.push(input.id);
      return { observation: { summary: "Résumé conservé" } };
    },
  };
  const sessionClock = new SessionClock(
    () => f.time,
    restore ? { elapsedMs: restore.snapshot.elapsedMs, paused: true } : {},
  );
  let watch, lifecycle;
  const manifest = createSessionManifest({
    id: "session",
    host: "server",
    store,
    thumbnails,
    restore,
    readClock: () => f.time,
    wallClock: () => f.wall,
    readOnly: () => watch.readOnly,
    hasConfirmedEnd: () => lifecycle.hasConfirmedEnd(),
  });
  watch = new WatchSession({
    id: "session",
    now: () => sessionClock.now(),
    perception,
    media: store,
    archive: store,
    onChange(state) {
      if (!state.readOnly) f.indexed.push(state);
      manifest.publish(state);
    },
  });
  const guard = {
    async assertRoom() {
      f.events.push("guard requested");
      f.guardEntered?.resolve();
      await f.guardGate?.promise;
      if (f.guardRefusal) throw f.guardRefusal;
    },
  };
  const inspector = new RevocableInspector({ inspect: async () => ({}) }, "Révoqué.");
  lifecycle = createSessionLifecycle({
    watch,
    store,
    sessionClock,
    manifest,
    thumbnails,
    vectors,
    perception,
    guard,
    inspector,
    inspectorModel: resource("inspection"),
    index: resource("index"),
    restore,
  });
  return Object.assign(f, { lifecycle, watch, sessionClock, store, thumbnails, inspector });
}

function archiveFacts(extraInventory = {}) {
  return {
    snapshot: {
      id: "session",
      elapsedMs: 24000,
      retention: "until-deleted",
      history: [{ id: "moment-1", startMs: 0, endMs: 8000, status: "ready" }],
      segments: [
        {
          id: "moment-2", startMs: 8000, endMs: 16000, status: "ready", available: true,
          observation: { summary: "Résumé conservé" },
        },
        { id: "moment-3", startMs: 16000, endMs: 24000, status: "queued", available: true },
      ],
    },
    inventory: {
      ids: new Set(["moment-2", "moment-8"]),
      thumbs: new Set(["moment-2"]),
      partial: ["moment-9"],
      mediaBytes: 100,
      thumbBytes: 25,
      ...extraInventory,
    },
    manifest: { state: "archived", captures: [{ startedAt: 10, fromMs: 0 }] },
  };
}

test("restoration adopts inventory and thumbnails without writing, indexing or analysing, and passes missing media and orphans to the core", () => {
  for (const inventory of [{}, { orphans: ["moment-12"] }]) {
    const restore = archiveFacts(inventory);
    const f = fixture({ restore });
    f.time = 900000;
    const state = f.watch.snapshot();
    assert.deepEqual([state.readOnly, state.accepting, state.elapsedMs], [true, false, 24000]);
    assert.deepEqual(f.adoptions, [[restore.inventory, 8000, restore.manifest]]);
    assert.deepEqual([f.store.bytes, f.thumbnails.bytes], [100, 25]);
    assert.deepEqual(
      state.segments.map((p) => [p.id, p.available, p.thumbnailAvailable, p.mediaReason, p.status]),
      [
        ["moment-2", true, true, undefined, "ready"],
        ["moment-3", false, false, "missing", "error"],
      ],
    );
    assert.equal(state.unplacedMedia, inventory.orphans ? 1 : 2);
    assert.deepEqual([f.events, f.indexed, f.analysed], [[], [], []]);
  }
});

test("an explicit resume waits for disk admission before changing the archive and records the capture offset; pause freezes the clock", async () => {
  const f = fixture({ restore: archiveFacts() });
  assert.equal(typeof f.lifecycle.resume, "function");
  f.time = 900000;
  f.wall = 2000;
  f.guardGate = deferred();
  const resuming = f.lifecycle.resume();
  assert.deepEqual(f.events, ["guard requested"]);
  assert.deepEqual(
    [f.watch.snapshot().readOnly, f.watch.snapshot().accepting, f.sessionClock.now()],
    [true, false, 24000],
  );
  f.time += 10000;
  f.guardGate.resolve();
  await resuming;
  assert.deepEqual(
    [f.watch.snapshot().readOnly, f.watch.snapshot().accepting, f.sessionClock.now()],
    [false, true, 24000],
  );
  assert.deepEqual(f.store.confirmed.captures, [
    { startedAt: 10, fromMs: 0 },
    { startedAt: 2000, fromMs: 24000 },
  ]);
  f.time += 400;
  await f.lifecycle.pause();
  f.time += 20000;
  assert.deepEqual(
    [f.watch.snapshot().accepting, f.sessionClock.now(), f.saves.at(-1).elapsedMs, f.store.confirmed.state],
    [false, 24400, 24400, "live"],
  );
});

test("a refused resume keeps the archive stopped, its clock and its capture list untouched", async () => {
  const f = fixture({ restore: archiveFacts() });
  assert.equal(typeof f.lifecycle.resume, "function");
  f.guardRefusal = ioError();
  await assert.rejects(f.lifecycle.resume(), (error) => error === f.guardRefusal);
  f.time = 900000;
  await f.lifecycle.pause();
  assert.deepEqual(
    [f.watch.snapshot().readOnly, f.watch.snapshot().accepting, f.sessionClock.now()],
    [true, false, 24000],
  );
  assert.deepEqual([f.events, f.saves, f.writes], [["guard requested"], [], []]);
});

test("overlapping closes revoke inspection before waiting and release resources once after the admitted passage lands without analysis", async () => {
  const f = fixture();
  assert.equal(typeof f.lifecycle.close, "function");
  f.time = 1000;
  f.putEntered = deferred();
  f.putGate = deferred();
  const writing = f.watch.ingest({ startMs: 0, endMs: 1000, frames: [] });
  await f.putEntered.promise;
  const first = f.lifecycle.close();
  const second = f.lifecycle.close();
  await assert.rejects(f.inspector.inspect({}), { message: "Révoqué." });
  await assert.rejects(f.watch.ingest({ startMs: 1000, endMs: 2000, frames: [] }), /arrêtée/);
  assert.deepEqual([f.closed, f.saves, f.analysed], [[], [], []]);
  f.putGate.resolve();
  assert.equal(await writing, "moment-1");
  await Promise.all([first, second]);
  assert.deepEqual(f.closed, ["index", "thumbnails", "perception", "inspection"]);
  assert.deepEqual(f.analysed, []);
  assert.deepEqual(
    f.saves.at(-1).segments.map((p) => [p.id, p.available, p.status]),
    [["moment-1", true, "queued"]],
  );
});

test("each resource is attempted after earlier failures and closeErrors returns a copy with bounded messages", async (t) => {
  const f = fixture();
  assert.equal(typeof f.lifecycle.close, "function");
  const close = f.watch.close.bind(f.watch);
  t.mock.method(f.watch, "close", async () => {
    await close();
    throw new Error("s".repeat(250));
  });
  f.closeRefusals.set("index", new Error("i".repeat(250)));
  f.closeRefusals.set("thumbnails", "indisponible");
  f.closeRefusals.set("perception", new Error("perception occupée"));
  f.closeRefusals.set("inspection", new Error("inspection occupée"));
  await f.lifecycle.close();
  const expected = [
    `session : ${"s".repeat(200)}`,
    `index : ${"i".repeat(200)}`,
    "miniatures : indisponible",
    "perception : perception occupée",
    "modèle d’inspection : inspection occupée",
  ];
  assert.deepEqual(f.closed, ["index", "thumbnails", "perception", "inspection"]);
  assert.deepEqual(f.lifecycle.closeErrors, expected);
  f.lifecycle.closeErrors.length = 0;
  assert.deepEqual(f.lifecycle.closeErrors, expected);
  assert.equal((await f.lifecycle.archive()).state, "archived");
  assert.deepEqual(f.closed, ["index", "thumbnails", "perception", "inspection"]);
});

test("the final state lands before flush and the final manifest, and only a landed manifest confirms this life", async () => {
  const f = fixture();
  f.saveEntered = deferred();
  f.saveGate = deferred();
  f.flushEntered = deferred();
  f.flushGate = deferred();
  f.manifestEntered = deferred();
  f.manifestGate = deferred();
  const closing = f.lifecycle.close();
  await f.saveEntered.promise;
  assert.deepEqual([f.events, f.closed, f.lifecycle.hasConfirmedEnd()], [["state requested"], [], false]);
  f.saveGate.resolve();
  const next = await Promise.race([
    f.flushEntered.promise.then(() => "flush"),
    closing.then(() => "closed"),
  ]);
  assert.equal(next, "flush", "closing waits for the disk barrier after the final state");
  assert.deepEqual(f.closed, ["index", "thumbnails", "perception", "inspection"]);
  assert.equal(f.saves.at(-1).accepting, false);
  assert.deepEqual(f.writes, []);
  f.flushGate.resolve();
  await f.manifestEntered.promise;
  assert.equal(f.lifecycle.hasConfirmedEnd(), false);
  assert.equal(f.store.confirmed, null);
  assert.equal(f.store.manifest.state, "archived");
  f.manifestGate.resolve();
  await closing;
  assert.deepEqual(f.events, [
    "state requested", "state saved", "flush requested", "flushed", "manifest requested", "manifest saved",
  ]);
  assert.equal(f.lifecycle.hasConfirmedEnd(), true);
  await f.lifecycle.pause();
  assert.equal(f.store.confirmed.state, "archived", "a late pause preserves the confirmed end");
});

for (const [step, refused] of [
  ["state save", "saveRefusal"],
  ["disk barrier", "flushRefusal"],
  ["final manifest", "manifestRefusal"],
]) {
  test(`archive rejects a refused ${step} after resource release and retries without closing them again`, async () => {
    const f = fixture();
    assert.equal(typeof f.lifecycle.archive, "function");
    f[refused] = ioError();
    await assert.rejects(
      f.lifecycle.archive(),
      (error) => refused === "saveRefusal" ? error.message === f.watch.saveError : error === f[refused],
    );
    assert.deepEqual(f.closed, ["index", "thumbnails", "perception", "inspection"]);
    assert.deepEqual(f.lifecycle.closeErrors, []);
    assert.equal(f.lifecycle.hasConfirmedEnd(), false);
    assert.equal(f.store.confirmed, null);
    await assert.doesNotReject(f.lifecycle.close());
    const savedBeforeRetry = f.saves.length;
    f[refused] = null;
    const confirmed = await f.lifecycle.archive();
    assert.equal(confirmed, f.store.confirmed);
    assert.equal(confirmed.state, "archived");
    assert.ok(f.saves.length > savedBeforeRetry, "a refused end saves its state again");
    assert.equal(f.lifecycle.hasConfirmedEnd(), true);
    assert.deepEqual(f.closed, ["index", "thumbnails", "perception", "inspection"]);
  });
}

test("a resumed archive confirms only its own end even when the earlier manifest already said archived, including a late pause after refusal", async () => {
  for (const recoverBeforeEnd of [false, true]) {
    const restore = archiveFacts();
    const f = fixture({ restore });
    assert.equal(typeof f.lifecycle.archive, "function");
    f.manifestRefusal = ioError();
    await f.lifecycle.resume();
    assert.equal(f.store.confirmed, restore.manifest);
    assert.equal(f.lifecycle.hasConfirmedEnd(), false);
    if (recoverBeforeEnd) f.manifestRefusal = null;
    else {
      await assert.rejects(f.lifecycle.archive(), { code: "EIO" });
      assert.equal(f.store.confirmed, restore.manifest);
      f.manifestRefusal = null;
      await f.lifecycle.pause();
      assert.equal(f.store.confirmed.state, "live");
      assert.equal(f.lifecycle.hasConfirmedEnd(), false);
    }
    const confirmed = await f.lifecycle.archive();
    assert.deepEqual(
      [confirmed.state, confirmed.passages, confirmed.captures.length, f.closed],
      ["archived", 3, 2, ["index", "thumbnails", "perception", "inspection"]],
    );
    assert.equal(restore.manifest.captures.length, 1);
  }
});

test("seal seals store and vectors before final writes and waits for both seals; late saves stay inert", async () => {
  for (const [released, pending] of [
    ["storeSealGate", "vectorSealGate"],
    ["vectorSealGate", "storeSealGate"],
  ]) {
    const f = fixture();
    assert.equal(typeof f.lifecycle.seal, "function");
    f.storeSealGate = deferred();
    f.vectorSealGate = deferred();
    f.flushEntered = deferred();
    let finished = false;
    const sealing = f.lifecycle.seal().then(() => { finished = true; });
    assert.deepEqual(f.events, ["store sealed", "vectors sealed"]);
    await f.flushEntered.promise;
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(finished, false, "both seals are still pending after close has settled");
    f[released].resolve();
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(finished, false, `${pending} is still pending after the other seal has settled`);
    f[pending].resolve();
    await sealing;
    assert.deepEqual([f.saves, f.writes], [[], []]);
    await f.lifecycle.pause();
    await f.lifecycle.close();
    await f.store.save(f.watch.snapshot());
    await f.store.saveManifest({ state: "live" });
    assert.deepEqual([f.saves, f.writes], [[], []]);
    assert.deepEqual(f.closed, ["index", "thumbnails", "perception", "inspection"]);
  }
});

test("seal releases resources and resolves even when the final disk barrier refuses", async () => {
  const f = fixture();
  assert.equal(typeof f.lifecycle.seal, "function");
  f.flushRefusal = ioError();
  await assert.doesNotReject(f.lifecycle.seal());
  assert.deepEqual(f.closed, ["index", "thumbnails", "perception", "inspection"]);
  assert.deepEqual(f.lifecycle.closeErrors, []);
});

test("purge refuses a read-only archive before revocation, closing or erasure", async () => {
  const f = fixture({ restore: archiveFacts() });
  f.files.set("moment-2", "média conservé");
  await assert.rejects(f.lifecycle.close({ purge: true }), /lecture seule/);
  await assert.doesNotReject(f.inspector.inspect({}));
  assert.deepEqual([f.events, f.closed, f.files.size, f.thumbnails.bytes], [[], [], 1, 25]);
});

test("purge after capture erases media and thumbnails but keeps text and records all missing passages even after an earlier archive", async () => {
  const f = fixture({ restore: archiveFacts() });
  f.files.set("moment-2", "média conservé");
  await f.lifecycle.resume();
  await f.lifecycle.archive();
  const text = f.saves.at(-1).segments[0].observation;
  await f.lifecycle.close({ purge: true });
  assert.deepEqual([f.files.size, f.thumbnails.bytes], [0, 0]);
  assert.deepEqual(f.saves.at(-1).segments[0].observation, text);
  assert.deepEqual(f.store.confirmed.media, {
    stored: 0, missing: 3, bytes: 0, retention: "until-deleted",
  });
  assert.deepEqual(f.closed, ["index", "thumbnails", "perception", "inspection"]);
});

test("pausing and archiving an archive that was only read preserves its confirmed manifest and writes no state or manifest", async () => {
  const restore = archiveFacts();
  const f = fixture({ restore });
  f.time = 900000;
  await f.lifecycle.pause();
  const confirmed = await f.lifecycle.archive();
  assert.equal(confirmed, restore.manifest);
  assert.deepEqual(f.events, ["flush requested", "flushed"]);
  assert.deepEqual([f.saves, f.writes, f.indexed, f.analysed], [[], [], [], []]);
  assert.deepEqual(
    [f.watch.snapshot().readOnly, f.watch.snapshot().accepting, f.sessionClock.now()],
    [true, false, 24000],
  );
});
