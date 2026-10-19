const { test } = require("node:test");
const assert = require("node:assert/strict");
const { manualClock } = require("./helpers/clock.cjs");
const { createMacDocument } = require("./helpers/mac-document.cjs");

const question = (answer, id = "deep-1") => ({
  id,
  sessionId: "session",
  status: "running",
  createdAt: 1,
  startedAt: 1,
  question: "Qui parle ?",
  preview: answer,
});

async function fixture(t) {
  const { createStateDelivery } = await import("../app/ui/state-delivery.mjs");
  const { createChatView } = await import("../app/ui/chat-view.mjs");
  const document = createMacDocument();
  const previous = global.document;
  global.document = document;
  t.after(() => {
    if (previous === undefined) delete global.document;
    else global.document = previous;
  });
  const get = (id) => document.getElementById(id);
  const clock = manualClock();
  const frames = new Map(),
    allFrames = [],
    allTimers = [],
    events = [],
    draws = [];
  let sequence = 0;
  const state = {
    session: { id: "session", accepting: true },
    deep: { jobs: [] },
    verification: { busy: false, jobs: [] },
  };
  const drawCards = createChatView({
    list: get("message-list"),
    box: get("messages"),
    intro: get("chat-intro"),
    queueStatus: get("queue-status"),
  });
  const drawChat = () => {
    draws.push("chat");
    drawCards({
      deepState: state.deep,
      verificationState: state.verification,
      context: {
        now: clock.io.now(),
        session: state.session,
        capturing: Boolean(state.session.accepting),
        queuedIds: state.deep.jobs
          .filter((job) => job.status === "queued")
          .map((job) => job.id),
        passage: (id) =>
          state.session.segments?.find((passage) => passage.id === id) || null,
        preview: () => null,
        cancelling: new Set(),
        verifyAvailable: true,
        verifyBusy: state.verification.busy,
      },
    });
  };
  const io = {
    ...clock.io,
    setTimer: (fn, ms) => {
      allTimers.push(fn);
      return clock.io.setTimer(fn, ms);
    },
    requestFrame: (fn) => {
      frames.set(++sequence, fn);
      allFrames.push(fn);
      return sequence;
    },
    cancelFrame: (id) => frames.delete(id),
  };
  const delivery = createStateDelivery({
    ...io,
    sources: {
      session: {
        group: "session",
        adopt: (value) => {
          state.session = value;
        },
      },
      deep: {
        group: "chat",
        adopt: (value) => {
          state.deep = value;
        },
      },
      verification: {
        group: "chat",
        adopt: (value) => {
          state.verification = value;
        },
      },
    },
    draws: {
      chat: drawChat,
      session: () => {
        draws.push("session");
        get("elapsed").textContent = String(state.session.elapsedMs);
        drawChat();
      },
    },
    onReceived: (event) =>
      events.push({
        kind: "received",
        ...event,
        text: get("message-list").textContent,
      }),
    onApplied: (event) =>
      events.push({
        kind: "applied",
        ...event,
        text: get("message-list").textContent,
      }),
  });
  t.after(() => {
    delivery.release();
    assert.equal(clock.armed, 0);
    assert.equal(frames.size, 0);
  });
  return {
    delivery,
    clock,
    frames,
    allFrames,
    allTimers,
    events,
    draws,
    get,
    state,
    frame: () => {
      const pending = [...frames.values()];
      frames.clear();
      for (const fn of pending) fn();
    },
  };
}

test("a burst adopts immediately and draws only its last real card before reporting application", async (t) => {
  const f = await fixture(t);
  f.delivery.receive("deep", { jobs: [question("Ancien brouillon")] });
  await f.clock.advance(7);
  f.delivery.receive("deep", { jobs: [question("Dernier brouillon")] });
  assert.equal(f.state.deep.jobs[0]?.preview, "Dernier brouillon");
  assert.equal(f.get("message-list").children.length, 0);
  assert.equal(f.frames.size, 1);
  f.frame();
  assert.deepEqual(f.draws, ["chat"]);
  assert.equal(f.get("message-list").children.length, 1);
  assert.equal(
    f.get("message-list").querySelectorAll(".chat-preview")[0].textContent,
    "Dernier brouillon",
  );
  assert.deepEqual(
    f.events.map((e) => [e.kind, e.source, e.emissionId, e.receivedAt]),
    [
      ["received", "deep", 1, 0],
      ["received", "deep", 2, 7],
      ["applied", "deep", 2, 7],
    ],
  );
  assert.equal(f.events[2].appliedAt, 7);
  assert.match(f.events[2].text, /Dernier brouillon/);
  assert.equal(f.events[0].text, "");
  assert.equal(f.clock.armed, 0);
});

for (const first of ["frame", "timer"]) {
  test(`the ${first} wins once, cancels its competitor and preserves real card nodes`, async (t) => {
    const f = await fixture(t);
    f.delivery.receive("deep", { jobs: [question("Première réponse")] });
    if (first === "timer") {
      await f.clock.advance(99);
      assert.equal(f.get("message-list").children.length, 0);
      await f.clock.advance(1);
    } else {
      await f.clock.advance(20);
      f.frame();
    }
    assert.deepEqual(f.draws, ["chat"]);
    const card = f.get("message-list").children[0];
    const preview = card.querySelectorAll(".chat-preview")[0];
    assert.equal(preview.textContent, "Première réponse");
    assert.equal(f.clock.armed, 0);
    assert.equal(f.frames.size, 0);
    const oldFrame = f.allFrames[0],
      oldTimer = f.allTimers[0];
    f.delivery.receive("deep", { jobs: [question("Réponse complétée")] });
    assert.equal(typeof oldTimer, "function");
    oldFrame();
    oldTimer();
    assert.deepEqual(
      f.draws,
      ["chat"],
      "old callbacks must not consume a new batch",
    );
    f.frame();
    assert.deepEqual(f.draws, ["chat", "chat"]);
    assert.equal(f.get("message-list").children[0], card);
    assert.equal(card.querySelectorAll(".chat-preview")[0], preview);
    assert.equal(preview.textContent, "Réponse complétée");
    await f.clock.advance(100);
    assert.equal(typeof oldTimer, "function");
    oldFrame();
    oldTimer();
    assert.deepEqual(f.draws, ["chat", "chat"]);
    assert.equal(f.clock.armed, 0);
  });
}

test("release cancels every group and makes retained callbacks and further receipts inert", async (t) => {
  const f = await fixture(t);
  f.delivery.receive("deep", { jobs: [question("Ne doit pas apparaître")] });
  f.delivery.receive("session", { id: "session", elapsedMs: 400 });
  assert.equal(f.clock.armed, 2);
  assert.equal(f.frames.size, 2);
  f.delivery.release();
  f.delivery.release();
  assert.equal(f.clock.armed, 0);
  assert.equal(f.frames.size, 0);
  for (const fn of [...f.allFrames, ...f.allTimers]) fn();
  f.delivery.receive("deep", { jobs: [question("Trop tard")] });
  f.delivery.schedule("chat");
  await f.clock.advance(100);
  assert.deepEqual(f.draws, []);
  assert.equal(f.get("message-list").textContent, "");
  assert.equal(f.events.length, 2);
  assert.equal(f.clock.armed, 0);
});

async function connected(t) {
  const f = await fixture(t);
  const { bindPushedStates } = await import("../app/ui/state-delivery.mjs");
  const { deferred } = require("./helpers/wait.cjs");
  const listeners = new Map(),
    reads = [],
    changed = [],
    errors = [];
  const bridge = {};
  for (const name of ["onState", "onDeepState", "onVerificationState"]) {
    bridge[name] = (fn) => {
      listeners.set(name, fn);
      return () => listeners.delete(name);
    };
  }
  for (const name of ["deepState", "verificationState"]) {
    bridge[name] = () => {
      const held = deferred();
      reads.push({ name, ...held });
      return held.promise;
    };
  }
  const binding = bindPushedStates({
    bridge,
    delivery: f.delivery,
    changed: () => changed.push("changed"),
    onError: (e) => errors.push(e),
  });
  t.after(() => binding.release());
  return { ...f, binding, bridge, listeners, reads, changed, errors };
}

test("the minimal page receives a bridge question through the real binding and draws its real card after the frame", async (t) => {
  const f = await connected(t);
  assert.equal(typeof f.listeners.get("onDeepState"), "function");
  f.listeners.get("onDeepState")({ jobs: [question("Réponse poussée")] });
  assert.equal(f.get("message-list").children.length, 0);
  assert.deepEqual(f.changed, ["changed"]);
  f.frame();
  assert.equal(f.get("message-list").children[0].dataset.id, "deep-1");
  assert.equal(
    f.get("message-list").querySelectorAll(".chat-preview")[0].textContent,
    "Réponse poussée",
  );
});

const verification = {
  busy: true,
  jobs: [
    {
      id: "check-1",
      status: "running",
      createdAt: 2,
      claim: "Un chiffre à vérifier",
    },
  ],
};

for (const first of ["frame", "timer"]) {
  test(`three session pushes adopt immediately and the ${first} draws the latest state only once`, async t => {
    const f = await connected(t);
    for (const elapsedMs of [1, 2, 3]) {
      const state = { id: "session", elapsedMs, segments: [] };
      f.listeners.get("onState")(state);
      assert.equal(f.state.session, state);
      assert.equal(f.frames.size, 1);
      assert.deepEqual(f.draws, []);
    }
    const oldFrame = f.allFrames[0], oldTimer = f.allTimers[0];
    if (first === "frame") f.frame();
    else await f.clock.advance(100);
    assert.equal(f.get("elapsed").textContent, "3");
    assert.deepEqual(f.draws, ["session", "chat"]);
    oldFrame();
    oldTimer();
    await f.clock.advance(100);
    assert.deepEqual(f.draws, ["session", "chat"]);
    assert.deepEqual(f.events.filter(event => event.kind === "applied").map(event => event.emissionId), [3]);
    assert.equal(f.frames.size, 0);
    assert.equal(f.clock.armed, 0);
  });
}

test("session, deep and verification pushes retain independent effects on one page and reject both stale initial reads", async (t) => {
  const f = await connected(t);
  assert.deepEqual(
    f.reads.map((r) => r.name),
    ["deepState", "verificationState"],
  );
  f.listeners.get("onState")({
    id: "session",
    accepting: false,
    elapsedMs: 42,
  });
  f.listeners.get("onDeepState")({ jobs: [question("Réponse récente")] });
  f.listeners.get("onVerificationState")(verification);
  f.frame();
  assert.equal(f.get("elapsed").textContent, "42");
  assert.equal(f.get("message-list").children.length, 2);
  const [card, check] = f.get("message-list").children;
  assert.equal(card.dataset.id, "deep-1");
  assert.match(check.textContent, /Un chiffre à vérifier/);
  assert.equal(
    f.get("message-list").querySelectorAll(".chat-preview")[0].textContent,
    "Réponse récente",
  );
  const before = f.events.length;
  f.reads[0].resolve({ jobs: [question("Vieille lecture")] });
  f.reads[1].resolve({ busy: false, jobs: [] });
  await f.clock.advance(100);
  assert.equal(
    f.events.length,
    before,
    "stale reads neither enter delivery nor schedule drawing",
  );
  assert.equal(f.get("message-list").children[0], card);
  assert.equal(f.get("message-list").children[1], check);
  assert.deepEqual(
    f.events.filter((e) => e.kind === "applied").map((e) => e.source),
    ["session", "deep", "verification"],
  );
});

test("initial reads remain independent, keep their button updates and report refusals", async (t) => {
  const f = await connected(t);
  assert.equal(f.reads.length, 2);
  f.listeners.get("onVerificationState")(verification);
  f.reads[0].resolve({ jobs: [question("Lecture initiale")] });
  const error = new Error("read refused");
  f.reads[1].reject(error);
  await f.clock.advance(0);
  f.frame();
  assert.match(f.get("message-list").textContent, /Lecture initiale/);
  assert.match(f.get("message-list").textContent, /Un chiffre à vérifier/);
  assert.deepEqual(
    f.changed,
    ["changed"],
    "the initial deep read does not update buttons",
  );
  assert.deepEqual(f.errors, [error]);
});

test("an archive deep-read guard is overtaken by a later deep read or deep push, not by a verification push", async (t) => {
  const f = await connected(t);
  const old = f.binding.beginDeepRead();
  const latest = f.binding.beginDeepRead();
  assert.equal(old(), false);
  f.listeners.get("onVerificationState")(verification);
  assert.equal(latest(), true);
  f.listeners.get("onDeepState")({
    jobs: [question("Poussée pendant la lecture des archives")],
  });
  assert.equal(latest(), false);
  const afterPush = f.binding.beginDeepRead();
  assert.equal(afterPush(), true);
  f.frame();
  assert.match(
    f.get("message-list").textContent,
    /Poussée pendant la lecture des archives/,
  );
});

test("an absent session push is ignored without adopting or scheduling it", async (t) => {
  const f = await connected(t);
  f.listeners.get("onState")(null);
  assert.equal(f.state.session?.id, "session");
  assert.equal(f.clock.armed, 0);
  assert.equal(f.events.length, 0);
});

test("releasing the binding revokes pending reads, removes subscriptions and cancels all drawing", async (t) => {
  const f = await connected(t);
  const callbacks = [...f.listeners.values()];
  const guard = f.binding.beginDeepRead();
  f.listeners.get("onDeepState")({ jobs: [question("En attente de dessin")] });
  f.binding.release();
  f.binding.release();
  assert.equal(f.listeners.size, 0);
  assert.equal(guard(), false);
  assert.equal(f.clock.armed, 0);
  assert.equal(f.frames.size, 0);
  for (const fn of callbacks) fn({ jobs: [] });
  f.reads[0].resolve({ jobs: [question("Lecture tardive")] });
  f.reads[1].resolve(verification);
  await f.clock.advance(100);
  for (const fn of [...f.allFrames, ...f.allTimers]) fn();
  assert.deepEqual(f.draws, []);
  assert.equal(f.events.length, 1);
  assert.deepEqual(f.changed, ["changed"]);
});

test("a later session redraw updates real citation availability without replacing the question card", async (t) => {
  const f = await fixture(t);
  const passage = { id: "moment-1", startMs: 0, endMs: 1000, available: true };
  f.delivery.receive("session", {
    id: "session",
    accepting: false,
    segments: [passage],
  });
  f.delivery.receive("deep", {
    jobs: [
      {
        ...question(""),
        status: "done",
        result: {
          kind: "observation",
          answer: "Un intervenant.",
          citations: [passage],
          hypotheses: [],
          limits: [],
        },
      },
    ],
  });
  f.frame();
  const card = f.get("message-list").children[0];
  assert.equal(card.querySelectorAll(".reference")[0].disabled, false);
  f.delivery.receive("session", {
    id: "session",
    accepting: false,
    segments: [{ ...passage, available: false, mediaReason: "expired" }],
  });
  f.frame();
  assert.equal(f.get("message-list").children[0], card);
  assert.equal(card.querySelectorAll(".reference")[0].disabled, true);
  assert.match(card.querySelectorAll(".reference")[0].textContent, /expirée/);
  assert.equal(f.clock.armed, 0);
});

test("application is never reported when the real card drawing throws", async (t) => {
  const f = await fixture(t);
  const error = new Error("DOM unavailable");
  f.get("message-list").insertBefore = () => {
    throw error;
  };
  f.delivery.receive("deep", { jobs: [question("Non dessiné")] });
  assert.throws(
    () => f.frame(),
    (cause) => cause === error,
  );
  assert.deepEqual(
    f.events.map((event) => event.kind),
    ["received"],
  );
  assert.equal(f.clock.armed, 0);
});

test("a fresh initial verification read draws its card and updates buttons", async (t) => {
  const f = await connected(t);
  f.reads[0].resolve({ jobs: [] });
  f.reads[1].resolve(verification);
  await f.clock.advance(0);
  assert.deepEqual(f.changed, ["changed"]);
  f.frame();
  assert.equal(f.get("message-list").children.length, 1);
  assert.match(f.get("message-list").textContent, /Un chiffre à vérifier/);
  assert.equal(f.clock.armed, 0);
});
