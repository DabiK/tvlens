const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  createHeadlessSessionLifecycle,
} = require("../runtime/headless-session-lifecycle.cjs");
const { createCaptureIntake } = require("../runtime/capture-intake.cjs");
const { warmUp } = require("../runtime/session-warm-up.cjs");

const { deferred } = require("./helpers/wait.cjs");

test("transitions wait for their predecessor and continue after its rejection", async () => {
  assert.equal(typeof createHeadlessSessionLifecycle, "function");
  const lifecycle = createHeadlessSessionLifecycle({});
  const gate = deferred(),
    entered = deferred(),
    calls = [];
  const refused = Object.assign(new Error("transition refusée"), {
    code: "TRANSITION_FAILED",
  });
  const first = lifecycle.exclusive(async () => {
    calls.push("first");
    entered.resolve();
    await gate.promise;
    throw refused;
  });
  const rejected = assert.rejects(first, (error) => error === refused);
  const second = lifecycle.exclusive(() => {
    calls.push("second");
    return 42;
  });
  await entered.promise;
  assert.deepEqual(calls, ["first"]);
  gate.resolve();
  await rejected;
  assert.equal(await second, 42);
  assert.deepEqual(calls, ["first", "second"]);
});

function fixture() {
  const f = {
    calls: [],
    publications: [],
    journal: [],
    archives: new Map(),
    created: [],
    restored: [],
  };
  const record = (name) => {
    f.calls.push(name);
  };
  const deep = {
    jobs: [],
    restore(jobs) {
      if (deep.jobs.some((job) => job.status === "running"))
        throw Object.assign(new Error("question active"), {
          code: "QUESTION_ACTIVE",
        });
      record("restore");
      deep.jobs = jobs;
    },
    cancelAll() {
      record("questions");
      f.questionsEntered?.resolve();
      if (f.cancelError) throw f.cancelError;
      for (const job of deep.jobs) job.status = "cancelled";
    },
  };
  const makeSession = (id, readOnly = false) => {
    const watch = {
      accepting: !readOnly,
      readOnly,
      questions: [],
      now: () => 8000,
      retentionMs: Infinity,
      snapshot: () => ({ id, coverage: { passages: f.passages ?? 1 } }),
      beginEnding: () => record("ending"),
      ingest: async () => {
        record("store");
        await f.storeGate?.promise;
        record("stored");
        return { id: "moment-1" };
      },
    };
    return {
      id,
      watch,
      get readOnly() {
        return watch.readOnly;
      },
      pause: async () => {
        record("pause");
        f.pauseEntered?.resolve();
        await f.pauseGate?.promise;
        watch.accepting = false;
      },
      resume: async () => {
        record("resume");
        watch.readOnly = false;
        watch.accepting = true;
      },
      archive: async () => {
        record("archive");
        if (f.archiveError) throw f.archiveError;
      },
      seal: async () => {
        record("seal");
      },
      perception: { agent: { prepare: (id) => record("observe " + id) } },
    };
  };
  const agent = {
    prepare: (id) => record("chat " + id),
    close: async () => {
      record("chat close");
    },
  };
  const checkpoint = {
    forget: () => record("forget"),
    flush: () => record("checkpoint"),
  };
  const surveillance = {
    reset: async () => {
      record("surveillance reset");
    },
    restore: (saved) => {
      f.restored.push(saved);
    },
    close: async () => {
      record("surveillance close");
      if (f.closeError) throw f.closeError;
    },
  };
  const library = {
    root: "/memory",
    dir: (id) => {
      if (!id)
        throw Object.assign(new Error("identifiant invalide"), {
          code: "INVALID_ID",
        });
    },
    folder: async (id) => {
      if (f.missing) throw new Error("absente");
      return id;
    },
    read: async (id) => {
      record("read " + id);
      if (f.readError) throw f.readError;
      return (
        f.archives.get(id) || {
          chat: { jobs: [] },
          surveillance: { sessionId: id },
        }
      );
    },
    remove: async (id) => {
      record("remove " + id);
      return { freedBytes: 42 };
    },
  };
  let lifecycle;
  const intake = createCaptureIntake({
    getSession: () => lifecycle.session,
    getCaptureEpoch: () => lifecycle.captureEpoch,
    isMoving: () => lifecycle.moving(),
    storage: () => ({ state: "ok" }),
    publish: () => record("intake publish"),
    preparationWaitMs: 17,
    setTimer: (fn) => {
      f.waitEntered?.resolve();
      f.expire = fn;
      return fn;
    },
    clearTimer: () => {
      f.expire = null;
    },
  });
  lifecycle = createHeadlessSessionLifecycle({
    library,
    conversation: { agent, deep },
    surveillance,
    checkpoint,
    warmUp,
    intake: {
      ...intake,
      settleIngestions: (cancelled) => {
        f.settleEntered?.resolve();
        return intake.settleIngestions(cancelled);
      },
    },
    guard: {
      assertRoom: async () => {
        record("room");
        f.guardEntered?.resolve();
        await f.guardGate?.promise;
        if (f.guardError) throw f.guardError;
      },
    },
    createSession: () => {
      const session = makeSession("session-" + (f.created.length + 1));
      f.created.push(session);
      return session;
    },
    openSession: async (id, archive) => {
      f.openedArchive = archive;
      const session = makeSession(id, true);
      return { session };
    },
    onAdopt: (session, state) => {
      f.publications.push({
        session,
        state,
        jobs: [...deep.jobs],
        epoch: lifecycle.captureEpoch,
      });
    },
    publish: () => record("publish"),
    log: (line) => {
      f.journal.push(line);
      if (f.logError) throw f.logError;
    },
  });
  return Object.assign(f, { lifecycle, intake, deep });
}

test("starting renews capture even while capturing and a pause and restart keep the same session", async () => {
  const f = fixture(),
    life = f.lifecycle;
  assert.equal(typeof life.start, "function");
  const first = await life.start(),
    session = life.session,
    epoch = life.captureEpoch;
  assert.deepEqual(first, {
    id: session.id,
    elapsedMs: 8000,
    retentionMs: null,
    retention: "until-deleted",
    readOnly: false,
    accepting: true,
  });
  assert.deepEqual(f.calls, [
    "room",
    "forget",
    "restore",
    "chat session-1",
    "observe session-1-observe",
  ]);
  assert.equal(f.publications[0].session, session);
  assert.equal(f.publications[0].state.id, session.id);
  await life.start();
  assert.equal(life.session, session);
  assert.equal(life.captureEpoch, epoch + 1);
  await life.pause();
  assert.equal(session.watch.accepting, false);
  await life.start();
  assert.equal(life.session, session);
  assert.equal(life.captureEpoch, epoch + 2);
  assert.equal(session.watch.accepting, true);
  assert.equal(f.created.length, 1);
});

test("coalesced ends refuse admission immediately and cancel preparation before awaiting capture", async () => {
  const f = fixture(),
    life = f.lifecycle;
  await life.start();
  assert.equal(typeof life.end, "function");
  const operation = f.intake.accept(life.session.id),
    blocked = deferred(),
    entered = deferred();
  const holding = life.exclusive(() => {
    entered.resolve();
    return blocked.promise;
  });
  await entered.promise;
  f.pauseGate = deferred();
  f.pauseEntered = deferred();
  const ending = life.end();
  assert.equal(life.end(), ending);
  assert.equal(life.moving(), true);
  assert.throws(() => f.intake.accept(life.session.id), {
    code: "session-closing",
    status: 503,
  });
  assert.equal(f.intake.admitted.size, 1);
  blocked.resolve();
  await holding;
  await f.pauseEntered.promise;
  assert.equal(operation.controller.signal.aborted, true);
  assert.equal(life.session.id, "session-1");
  f.intake.finish(operation);
  f.pauseGate.resolve();
  const ended = await ending;
  assert.deepEqual(ended, { id: "session-1", archived: true });
  assert.equal(life.lastEnd, ended);
  assert.equal(life.session, null);
  assert.equal(life.moving(), false);
  assert.deepEqual(f.calls.slice(5), [
    "ending",
    "pause",
    "questions",
    "checkpoint",
    "surveillance reset",
    "chat close",
    "archive",
    "forget",
    "restore",
  ]);
  assert.deepEqual(f.journal, []);
});

test("a refused archive remains unconfirmed in the last end and the shared journal", async () => {
  const f = fixture(),
    life = f.lifecycle;
  await life.start();
  f.archiveError = Object.assign(new Error("disque refusé"), { code: "EIO" });
  assert.equal(typeof life.end, "function");
  const ended = await life.end();
  assert.deepEqual(ended, {
    id: "session-1",
    archived: false,
    errors: ["archive : disque refusé"],
  });
  assert.equal(life.lastEnd, ended);
  assert.equal(life.session, null);
  assert.deepEqual(f.journal, [
    "TVLens — fermeture incomplète de la session session-1 : archive : disque refusé",
  ]);
});

test("opening restores one archive read-only without writes or warm-up and explicit resume renews its capture", async () => {
  const f = fixture(),
    life = f.lifecycle;
  const archive = {
    chat: { jobs: [{ sessionId: "saved", status: "done" }] },
    surveillance: { sessionId: "saved" },
  };
  f.archives.set("saved", archive);
  assert.equal(typeof life.open, "function");
  const opened = await life.open("saved"),
    session = life.session,
    epoch = life.captureEpoch;
  assert.equal(opened.readOnly, true);
  assert.equal(opened.accepting, false);
  assert.equal(f.openedArchive, archive);
  assert.deepEqual(f.calls, ["read saved", "forget", "restore"]);
  assert.deepEqual(f.restored, [archive.surveillance]);
  assert.deepEqual(f.publications, [
    {
      session,
      state: session.watch.snapshot(),
      jobs: archive.chat.jobs,
      epoch,
    },
  ]);
  await assert.rejects(life.start(), { code: "read-only", status: 409 });
  assert.equal(life.captureEpoch, epoch);
  await life.open("saved");
  assert.equal(life.session, session);
  assert.equal(life.captureEpoch, epoch);
  const resumed = await life.resume("saved");
  assert.equal(resumed.id, "saved");
  assert.equal(resumed.accepting, true);
  assert.equal(resumed.readOnly, false);
  assert.equal(life.session, session);
  assert.equal(life.captureEpoch, epoch + 1);
  assert.deepEqual(f.calls.slice(3), [
    "resume",
    "chat saved",
    "observe saved-observe",
    "publish",
  ]);
});

test("an unreadable archive keeps the loaded session and adoption publishes only its own questions", async () => {
  const f = fixture(),
    life = f.lifecycle;
  await life.start();
  await life.pause();
  const session = life.session;
  f.deep.jobs = [{ sessionId: session.id, status: "done" }];
  const unreadable = Object.assign(new Error("archive illisible"), {
    code: "UNREADABLE",
  });
  f.readError = unreadable;
  assert.equal(typeof life.open, "function");
  await assert.rejects(life.open("saved"), (error) => error === unreadable);
  assert.equal(life.session, session);
  assert.equal(f.deep.jobs[0].sessionId, session.id);
  f.readError = null;
  f.archives.set("saved", {
    chat: { jobs: [{ sessionId: "saved", status: "done" }] },
  });
  await life.open("saved");
  for (const publication of f.publications) {
    assert.equal(
      publication.state?.id ?? null,
      publication.session?.id ?? null,
    );
    assert.ok(
      publication.jobs.every(
        (job) => job.sessionId === publication.session?.id,
      ),
    );
  }
  assert.equal(life.session.id, "saved");
});

test("empty sessions created here are discarded while empty opened archives are kept", async () => {
  const f = fixture(),
    life = f.lifecycle;
  f.passages = 0;
  await life.start();
  const ended = await life.end();
  assert.deepEqual(ended, { id: "session-1", archived: false });
  assert.ok(f.calls.includes("seal"));
  assert.ok(f.calls.includes("remove session-1"));
  await life.open("saved");
  f.calls.length = 0;
  assert.deepEqual(await life.end(), { id: "saved", archived: true });
  assert.ok(f.calls.includes("archive"));
  assert.ok(!f.calls.includes("seal"));
});

test("deletion refuses capture, skips pause when loaded and deletes only an unloaded target", async () => {
  const f = fixture(),
    life = f.lifecycle;
  await life.start();
  assert.equal(typeof life.remove, "function");
  await assert.rejects(life.remove(life.session.id), {
    code: "capturing",
    status: 409,
  });
  await life.pause();
  f.calls.length = 0;
  assert.deepEqual(await life.remove(life.session.id), {
    deleted: true,
    id: "session-1",
    freedBytes: 42,
  });
  assert.deepEqual(f.calls, [
    "ending",
    "questions",
    "checkpoint",
    "surveillance reset",
    "chat close",
    "seal",
    "forget",
    "restore",
    "remove session-1",
    "publish",
  ]);
  await life.start();
  const held = life.session;
  f.calls.length = 0;
  assert.deepEqual(await life.remove("other"), {
    deleted: true,
    id: "other",
    freedBytes: 42,
  });
  assert.equal(life.session, held);
  assert.deepEqual(f.calls, ["remove other", "publish"]);
});

for (const action of ["end", "remove"]) {
  test(`${action} refuses release when questions cannot be cancelled and a later attempt can succeed`, async () => {
    const f = fixture(),
      life = f.lifecycle;
    await life.start();
    await life.pause();
    const held = life.session;
    f.deep.jobs = [
      { sessionId: held.id, status: "running", done: Promise.resolve() },
    ];
    f.cancelError = Object.assign(new Error("annulation refusée"), {
      code: "CANCEL_FAILED",
    });
    assert.equal(typeof life[action], "function");
    await assert.rejects(life[action](held.id), { code: "QUESTION_ACTIVE" });
    assert.equal(life.session, held);
    assert.equal(f.deep.jobs[0].status, "running");
    assert.equal(life.moving(), false);
    assert.ok(!f.calls.includes("remove " + held.id));
    assert.deepEqual(life.lastEnd, {
      id: held.id,
      archived: action === "end",
      errors: ["questions : annulation refusée", "hôte : question active"],
    });
    assert.deepEqual(f.journal, [
      "TVLens — fermeture incomplète de la session session-1 : questions : annulation refusée ; hôte : question active",
    ]);
    f.cancelError = null;
    await life[action](held.id);
    assert.equal(life.session, null);
    assert.deepEqual(f.deep.jobs, []);
    assert.equal(f.calls.includes("remove " + held.id), action === "remove");
  });
}

test("shutdown without a session coalesces and retains surveillance failure even if logging fails", async () => {
  const f = fixture(),
    life = f.lifecycle;
  f.closeError = Object.assign(new Error("arrêt refusé"), {
    code: "CLOSE_FAILED",
  });
  assert.equal(typeof life.close, "function");
  f.logError = Object.assign(new Error("journal refusé"), { code: "EIO" });
  const first = life.close();
  assert.equal(life.close(), first);
  assert.equal(life.moving(), true);
  await first;
  assert.deepEqual(life.lastEnd, {
    id: null,
    archived: false,
    errors: ["surveillance : arrêt refusé"],
  });
  assert.deepEqual(f.calls, ["surveillance close"]);
  assert.deepEqual(f.journal, [
    "TVLens — arrêt incomplet de l’hôte : surveillance : arrêt refusé",
  ]);
});

test("shutdown attempts surveillance close after a refused session release and retains both failures", async () => {
  const f = fixture(),
    life = f.lifecycle;
  await life.start();
  f.deep.jobs = [
    { sessionId: life.session.id, status: "running", done: Promise.resolve() },
  ];
  f.cancelError = Object.assign(new Error("annulation refusée"), {
    code: "CANCEL_FAILED",
  });
  f.closeError = Object.assign(new Error("arrêt refusé"), {
    code: "CLOSE_FAILED",
  });
  assert.equal(typeof life.close, "function");
  const first = life.close();
  assert.equal(life.close(), first);
  await assert.rejects(first, { code: "QUESTION_ACTIVE" });
  assert.equal(life.session.id, "session-1");
  assert.equal(f.calls.at(-1), "surveillance close");
  assert.deepEqual(life.lastEnd.errors, [
    "questions : annulation refusée",
    "hôte : question active",
    "surveillance : arrêt refusé",
  ]);
  assert.equal(f.journal.length, 2);
});

const block = (sessionId) => ({
  sessionId,
  startMs: 0,
  endMs: 8000,
  clip: Buffer.from("clip"),
  audio: null,
  frames: [{ atMs: 0, dataUrl: "data:image/jpeg;base64,YQ==" }],
});

test("ending waits for admitted storage and final questions before archiving", async () => {
  const f = fixture(),
    life = f.lifecycle;
  await life.start();
  f.storeGate = deferred();
  f.settleEntered = deferred();
  f.questionsEntered = deferred();
  const operation = f.intake.accept(life.session.id);
  const storing = f.intake.ingest(block(life.session.id), operation);
  const questionDone = deferred();
  f.deep.jobs = [
    {
      sessionId: life.session.id,
      status: "running",
      done: questionDone.promise,
    },
  ];
  const ended = [];
  const ending = life.end().then((result) => {
    ended.push(result);
    return result;
  });
  await f.settleEntered.promise;
  assert.equal(operation.controller.signal.aborted, false);
  assert.equal(f.intake.ingestions.size, 1);
  assert.ok(!f.calls.includes("questions"));
  f.storeGate.resolve();
  await storing;
  f.intake.finish(operation);
  await f.questionsEntered.promise;
  assert.deepEqual(ended, []);
  assert.ok(!f.calls.includes("archive"));
  assert.ok(!f.calls.includes("checkpoint"));
  questionDone.resolve();
  assert.deepEqual(await ending, { id: "session-1", archived: true });
  assert.deepEqual(f.calls.slice(5), [
    "store",
    "ending",
    "pause",
    "stored",
    "questions",
    "checkpoint",
    "surveillance reset",
    "chat close",
    "archive",
    "forget",
    "restore",
  ]);
});

test("late preparation stays owned across ends and shutdown without a session and can never readopt it", async () => {
  const f = fixture(),
    life = f.lifecycle;
  await life.start();
  const id = life.session.id,
    operation = f.intake.accept(id);
  f.waitEntered = deferred();
  const ending = life.end();
  await f.waitEntered.promise;
  assert.equal(operation.controller.signal.aborted, true);
  assert.equal(f.intake.admitted.size, 1);
  f.expire();
  const failure =
    "préparation média : arrêt non confirmé après 17 ms, bloc refusé, préparation suivante en attente";
  assert.deepEqual(await ending, { id, archived: true, errors: [failure] });
  await life.open(id);
  const reopened = life.session;
  await life.resume(id);
  assert.equal(f.intake.current(operation), false);
  await assert.rejects(f.intake.ingest(block(id), operation), {
    code: "session-closing",
  });
  assert.equal(life.session, reopened);
  f.waitEntered = deferred();
  const second = life.end();
  await f.waitEntered.promise;
  assert.equal(f.intake.admitted.size, 1);
  f.expire();
  assert.deepEqual(await second, { id, archived: true, errors: [failure] });
  f.waitEntered = deferred();
  const closing = life.close();
  await f.waitEntered.promise;
  assert.equal(f.intake.admitted.size, 1);
  f.expire();
  await closing;
  assert.deepEqual(life.lastEnd, {
    id,
    archived: true,
    errors: [failure, failure],
  });
  const publications = f.publications.length;
  await assert.rejects(f.intake.ingest(block(id), operation), {
    code: "session-closing",
  });
  f.intake.finish(operation);
  assert.equal(f.intake.admitted.size, 0);
  assert.equal(life.session, null);
  assert.equal(f.publications.length, publications);
  assert.equal(f.journal.length, 3);
  assert.equal(f.expire, null);
});

test("a queued pause waits for a refused start and later session transitions can still succeed", async () => {
  const f = fixture(),
    life = f.lifecycle;
  f.guardEntered = deferred();
  f.guardGate = deferred();
  f.guardError = Object.assign(new Error("disque plein"), {
    code: "STORAGE_FULL",
  });
  const starting = life.start();
  const refused = assert.rejects(starting, { code: "STORAGE_FULL" });
  const pausing = life.pause();
  await f.guardEntered.promise;
  assert.deepEqual(f.calls, ["room"]);
  assert.equal(life.session, null);
  assert.deepEqual(f.created, []);
  f.guardGate.resolve();
  await refused;
  await pausing;
  assert.deepEqual(f.calls, ["room", "publish"]);
  f.guardError = null;
  assert.equal((await life.start()).id, "session-1");
  assert.equal(f.created.length, 1);
});
