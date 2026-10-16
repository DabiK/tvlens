const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { HeadlessRuntime } = require("../runtime/headless-runtime.cjs");
const { createCaptureIntake } = require("../runtime/capture-intake.cjs");
const { STORAGE_FULL } = require("../adapters/disk-guard.cjs");
const { SessionClock } = require("../core/session-clock.cjs");
const { manualClock } = require("./helpers/clock.cjs");
const { deferred, until, turns } = require("./helpers/wait.cjs");

const WAIT_MS = 40;
const CLOSING = { status: 503, code: "session-closing", message: "Session en cours de fermeture." };
const late = (ms) => `arrêt non confirmé après ${ms} ms, bloc refusé, préparation suivante en attente`;

function fixture(options = {}) {
  const clock = manualClock();
  const f = { epoch: 1, moving: false, disk: "ok", writes: [], publications: [] };
  f.makeSession = (id = "session") => ({
    id,
    readOnly: false,
    watch: {
      accepting: true,
      now: () => 8000,
      ingest: (input) => {
        f.writes.push(input);
        return Promise.resolve("moment-1");
      },
    },
    pause: async () => { f.session.watch.accepting = false; },
  });
  f.session = f.makeSession();
  f.intake = createCaptureIntake({
    getSession: () => f.session,
    getCaptureEpoch: () => f.epoch,
    isMoving: () => f.moving,
    storage: () => ({ state: f.disk }),
    publish: () => f.publications.push({ accepting: f.session.watch.accepting }),
    preparationWaitMs: WAIT_MS,
    setTimer: clock.io.setTimer,
    clearTimer: clock.io.clearTimer,
    ...options,
  });
  f.clock = clock;
  f.input = () => ({
    sessionId: f.session.id,
    startMs: 0,
    endMs: 8000,
    clip: new Uint8Array([1]),
    frames: [{ atMs: 0, dataUrl: "data:image/jpeg;base64,YQ==" }],
  });
  return f;
}

test("admission refuses stale sessions before preparation", () => {
  const f = fixture();
  assert.throws(() => f.intake.admit("former-session"), { message: "Session obsolète." });
  f.session = null;
  assert.throws(() => f.intake.admit("session"), { message: "Session obsolète." });
  assert.deepEqual(f.writes, []);
});

test("admission preserves archive, stopped capture and disk refusal reasons before preparation", () => {
  const f = fixture();
  const id = f.session.id;
  f.session.readOnly = true;
  assert.throws(() => f.intake.admit(id), {
    status: 409,
    code: "read-only",
    message: "Session ouverte en lecture seule. Choisis Reprendre la capture ou Nouvelle session.",
  });
  f.session.readOnly = false;
  f.session.watch.accepting = false;
  assert.throws(() => f.intake.admit(id), { message: "La session est arrêtée." });
  f.disk = "blocked";
  assert.throws(() => f.intake.admit(id), {
    code: STORAGE_FULL,
    message: "Espace disque insuffisant : la capture est suspendue pour ne rien supprimer.",
  });
  f.session.watch.storageError = "Espace disque insuffisant : libère 1 Go.";
  assert.throws(() => f.intake.admit(id), { code: STORAGE_FULL, message: f.session.watch.storageError });
  assert.deepEqual(f.writes, []);
  f.session.watch.accepting = true;
  assert.equal(f.intake.admit(id), f.session);
});

test("accept refuses a departing session before owning or preparing a block", () => {
  const f = fixture();
  f.moving = true;
  assert.throws(() => f.intake.accept(f.session.id), CLOSING);
  assert.equal(f.intake.admitted.size, 0);
  assert.deepEqual(f.writes, []);
});

test("an accepted operation belongs to its session object and capture until finish", async () => {
  const f = fixture();
  const original = f.session;
  const operation = f.intake.accept(original.id);
  assert.ok(operation, "accept returns the owned operation");
  assert.ok(operation.controller.signal instanceof AbortSignal);
  assert.equal(f.intake.admitted.size, 1);
  assert.equal(f.intake.current(operation), true);
  f.epoch++;
  assert.equal(f.intake.current(operation), false);
  f.epoch--;
  f.session = f.makeSession(original.id);
  assert.equal(f.intake.current(operation), false, "same identifier and epoch, different session object");
  f.session = original;
  assert.equal(f.intake.current(operation), true, "the owner only reads the host generation");
  f.intake.finish(operation);
  await operation.settled;
  assert.equal(f.intake.admitted.size, 0);
  assert.deepEqual(f.writes, []);
});

test("deaf preparations stay owned and permanently refused after every bounded wait until finish", async () => {
  const f = fixture();
  const operations = [f.intake.accept(f.session.id), f.intake.accept(f.session.id)];
  const input = f.input();
  let signals = 0;
  for (const operation of operations)
    operation.controller.signal.addEventListener("abort", () => { signals++; });
  const cancelled = f.intake.cancelPreparations();
  assert.equal(signals, 2, "every preparation is cancelled synchronously");
  for (const operation of operations) {
    assert.equal(f.intake.current(operation), false);
    assert.deepEqual(
      { status: operation.controller.signal.reason.status, code: operation.controller.signal.reason.code },
      { status: 503, code: "session-closing" },
    );
  }
  // Three successive closing callers, ending with a host that has no loaded session.
  for (const session of [f.session, f.makeSession(f.session.id), null]) {
    f.session = session;
    const preparations = f.intake.cancelPreparations();
    assert.equal(preparations.length, cancelled.length);
    const waiting = assert.rejects(f.intake.settleIngestions(preparations), { message: late(WAIT_MS) });
    await until(() => f.clock.armed === 1, "the preparation wait is armed");
    await f.clock.advance(WAIT_MS - 1);
    assert.equal(f.clock.armed, 1);
    await f.clock.advance(1);
    await waiting;
    assert.equal(f.clock.armed, 0, "each expired wait releases its timer");
    assert.equal(f.intake.admitted.size, 2, "expiry releases no operation");
    assert.equal(signals, 2, "a later end does not cancel twice");
    for (const operation of operations)
      await assert.rejects(f.intake.ingest(input, operation), CLOSING);
  }
  for (const operation of operations) {
    assert.equal(f.intake.current(operation), false);
    f.intake.finish(operation);
  }
  await f.intake.settleIngestions(f.intake.cancelPreparations());
  assert.equal(f.clock.armed, 0);
  assert.equal(f.intake.admitted.size, 0);
});

test("finish releases a preparation wait and clears its timer before the ceiling", async () => {
  const f = fixture();
  const operation = f.intake.accept(f.session.id);
  const waiting = f.intake.settleIngestions(f.intake.cancelPreparations());
  await until(() => f.clock.armed === 1, "the preparation wait is armed");
  f.intake.finish(operation);
  await waiting;
  assert.equal(f.clock.armed, 0);
  assert.equal(f.intake.admitted.size, 0);
  await f.clock.advance(WAIT_MS);
});

test("ingest refuses an operation from an older capture or session object without storing", async () => {
  const f = fixture();
  const input = f.input();
  const operation = f.intake.accept(input.sessionId);
  f.epoch++;
  await assert.rejects(f.intake.ingest(input, operation), { status: 409, code: "capture-changed" });
  f.epoch--;
  f.session = f.makeSession(input.sessionId);
  await assert.rejects(f.intake.ingest(input, operation), { status: 409, code: "capture-changed" });
  f.intake.cancelPreparations();
  await assert.rejects(f.intake.ingest(input, operation), CLOSING);
  f.intake.finish(operation);
  assert.deepEqual(f.writes, []);
});

test("ingest without an operation validates the block and session before storing", async () => {
  const f = fixture();
  await assert.rejects(f.intake.ingest({ ...f.input(), sessionId: "stale" }), { message: "Session obsolète." });
  await assert.rejects(f.intake.ingest({ ...f.input(), clip: null }), { message: "Segment vidéo trop volumineux ou vide." });
  await assert.rejects(f.intake.ingest({ ...f.input(), endMs: 12000 }), { message: "Horodatage de capture invalide." });
  f.moving = true;
  await assert.rejects(f.intake.ingest(f.input()), CLOSING);
  assert.deepEqual(f.writes, []);
  f.moving = false;
  const input = f.input();
  assert.equal(await f.intake.ingest(input), "moment-1");
  assert.deepEqual(f.writes, [input]);
});

test("storage becomes uncancellable in the validation turn and closing waits for media and thumbnail", async (t) => {
  const f = fixture();
  const media = deferred(), thumbnail = deferred(), thumbnailEntered = deferred();
  const landed = [];
  t.after(() => {
    media.resolve();
    thumbnail.resolve();
  });
  f.session.watch.ingest = async () => {
    await media.promise;
    landed.push("media");
    thumbnailEntered.resolve();
    await thumbnail.promise;
    landed.push("thumbnail");
    return "moment-1";
  };
  const operation = f.intake.accept(f.session.id);
  const storing = f.intake.ingest(f.input(), operation);
  // No asynchronous gap may let a closing cancel a block whose storage has just been admitted.
  f.moving = true;
  const cancelled = f.intake.cancelPreparations();
  assert.equal(operation.controller.signal.aborted, false);
  assert.deepEqual(cancelled, []);
  assert.equal(f.intake.ingestions.size, 1);
  let ended = false;
  const ending = f.intake.settleIngestions(cancelled).then(() => { ended = true; });
  await turns(1);
  assert.deepEqual([ended, landed, f.clock.armed], [false, [], 0]);
  media.resolve();
  await thumbnailEntered.promise;
  await turns(1);
  assert.deepEqual([ended, landed], [false, ["media"]]);
  thumbnail.resolve();
  assert.equal(await storing, "moment-1");
  await ending;
  assert.deepEqual([ended, landed, f.intake.ingestions.size], [true, ["media", "thumbnail"], 0]);
  f.intake.finish(operation);
});

test("a storage failure propagates and releases the tracked write so closing can settle", async () => {
  const f = fixture();
  const disk = deferred();
  const refused = Object.assign(new Error("Écriture refusée."), { code: "EIO" });
  f.session.watch.ingest = () => disk.promise;
  const storing = f.intake.ingest(f.input());
  assert.equal(f.intake.ingestions.size, 1);
  const failed = assert.rejects(storing, (error) => error === refused);
  const settled = f.intake.settleIngestions([]);
  disk.reject(refused);
  await failed;
  await settled;
  assert.equal(f.intake.ingestions.size, 0);
  assert.equal(f.clock.armed, 0);
  assert.deepEqual(f.publications, []);
});

test("a full disk pauses the whole current session including its clock and publishes the reason", async () => {
  const f = fixture();
  let time = 0;
  const sessionClock = new SessionClock(() => time);
  time = 8000;
  const refused = Object.assign(new Error("Espace disque insuffisant : libère 1 Go."), { code: STORAGE_FULL });
  f.session.watch.now = () => sessionClock.now();
  f.session.watch.ingest = async () => {
    f.disk = "blocked";
    f.session.watch.storageError = refused.message;
    throw refused;
  };
  f.session.pause = async () => {
    sessionClock.pause();
    f.session.watch.accepting = false;
  };
  await assert.rejects(f.intake.ingest(f.input()), (error) => error === refused);
  assert.deepEqual(f.publications, [{ accepting: false }]);
  time += 60000;
  assert.equal(sessionClock.now(), 8000);
  assert.throws(() => f.intake.admit(f.session.id), { code: STORAGE_FULL, message: refused.message });
  assert.equal(f.intake.ingestions.size, 0);
});

test("a full disk in a former session cannot pause or publish into its replacement", async () => {
  const f = fixture();
  const disk = deferred();
  let pauses = 0;
  const former = f.session;
  former.watch.ingest = () => disk.promise;
  former.pause = async () => { pauses++; };
  const refused = Object.assign(new Error("Disque plein."), { code: STORAGE_FULL });
  const failed = assert.rejects(f.intake.ingest(f.input()), (error) => error === refused);
  f.session = f.makeSession(former.id);
  disk.reject(refused);
  await failed;
  assert.deepEqual([pauses, f.publications, f.session.watch.accepting], [0, [], true]);
  assert.equal(f.intake.ingestions.size, 0);
});

test("a failed disk pause still publishes and keeps the original storage refusal", async () => {
  const f = fixture();
  const refused = Object.assign(new Error("Disque plein."), { code: STORAGE_FULL });
  f.session.watch.ingest = async () => { throw refused; };
  f.session.pause = async () => { throw Object.assign(new Error("Sauvegarde refusée."), { code: "EIO" }); };
  await assert.rejects(f.intake.ingest(f.input()), (error) => error === refused);
  assert.equal(f.publications.length, 1);
  assert.equal(f.intake.ingestions.size, 0);
});

test("the default preparation ceiling is one second on the injected clock", async () => {
  for (const preparationWaitMs of [undefined, null]) {
    const f = fixture({ preparationWaitMs });
    const operation = f.intake.accept(f.session.id);
    const waiting = f.intake.settleIngestions(f.intake.cancelPreparations()).catch((error) => error);
    await until(() => f.clock.armed === 1, "the default wait is armed");
    await f.clock.advance(999);
    assert.equal(f.clock.armed, 1);
    await f.clock.advance(1);
    assert.equal((await waiting)?.message, late(1000));
    assert.equal(f.clock.armed, 0);
    f.intake.finish(operation);
  }
});

test("headless closing uses preparation timers again without a session and keeps exposing owned operations", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "tvlens-capture-intake-"));
  const clock = manualClock();
  const runtime = new HeadlessRuntime({
    userData: root,
    sessionsRoot: path.join(root, "sessions"),
    config: {},
    selectedModels: {},
    smoke: true,
    agent: { answer: async () => ({}) },
    preparationWaitMs: WAIT_MS,
    setPreparationTimer: clock.io.setTimer,
    clearPreparationTimer: clock.io.clearTimer,
    log: () => {},
  });
  let operation;
  t.after(async () => {
    if (operation) runtime.finish(operation);
    await runtime.close();
    await fs.rm(root, { recursive: true, force: true });
  });
  const session = await runtime.start();
  operation = runtime.accept(session.id);
  const admitted = runtime.admitted, ingestions = runtime.ingestions;
  const ending = runtime.end();
  await until(() => clock.armed || runtime.session === null, "closing reaches its preparation barrier");
  assert.equal(clock.armed, 1, "the host delegates the wait to its injected preparation timer");
  await clock.advance(WAIT_MS);
  const ended = await ending;
  assert.deepEqual(ended.errors, ["préparation média : " + late(WAIT_MS)]);
  assert.equal(runtime.session, null);
  assert.equal(runtime.admitted, admitted);
  assert.equal(runtime.ingestions, ingestions);
  assert.equal(admitted.size, 1);
  const closing = runtime.close();
  await until(() => clock.armed === 1, "stopping without a session waits again");
  await clock.advance(WAIT_MS);
  await closing;
  assert.deepEqual(runtime.lastEnd.errors, [ended.errors[0], ended.errors[0]]);
  assert.equal(clock.armed, 0);
  runtime.finish(operation);
  operation = null;
  assert.equal(admitted.size, 0);
});
