const path = require("node:path");
const { readPage } = require("../tests/helpers/tv-document.cjs");
const { createMacDocument } = require("../tests/helpers/mac-document.cjs");
const { deferred } = require("../tests/helpers/wait.cjs");
const model = require("../tv/app/chat-model.js");
const text = require("../tv/app/text.js");
const { controlledTvView } = require("./latency-environment.cjs");
const { SIMULATED_TRANSPORT_REFUSAL } = require("./latency-fixture.cjs");
const { createPollController } = require("../tv/app/poll-controller.js");

const cardTexts = (nodes, key) =>
  Object.fromEntries(
    [...nodes].map((node) => [node.dataset[key], node.textContent]),
  );
const jobMarks = (state) => ({
  questionIds: state.jobs.map((job) => job.id),
  finishedIds: state.jobs
    .filter((job) => job.status === "done" || job.status === "error")
    .map((job) => job.id),
});

function createMacDraw({ env, document, state, draw }) {
  return () => {
    const previous = globalThis.document;
    globalThis.document = document;
    try {
      draw({
        deepState: state.deep,
        verificationState: { jobs: [] },
        context: {
          now: env.serverNow(),
          session: state.session,
          capturing: state.session.accepting,
          queuedIds: state.deep.jobs
            .filter((job) => job.status === "queued")
            .map((job) => job.id),
          passage: (id) => state.session.segments.find((p) => p.id === id),
          preview: () => null,
          cancelling: new Set(),
          verifyAvailable: false,
          verifyBusy: false,
        },
      });
    } finally {
      if (previous === undefined) delete globalThis.document;
      else globalThis.document = previous;
    }
  };
}

function createMacObserver({ record, emissions, current, el }) {
  return (kind, event) => {
    if (kind === "client.received") emissions.set(event.emissionId, current());
    const envelope = emissions.get(event.emissionId);
    record(
      kind,
      "client-monotonic",
      kind === "client.received" ? event.receivedAt : event.appliedAt,
      {
        client: "mac",
        source: event.source,
        emissionId: event.emissionId,
        publicationId: envelope.id,
        ...jobMarks(envelope.deep),
        text: el("message-list").textContent,
      },
    );
  };
}

function createFrames(env, delays) {
  const frames = new Map(),
    retained = [];
  let sequence = 0;
  return {
    frames,
    retained,
    requestFrame(fn) {
      const id = ++sequence;
      retained.push(fn);
      if (!delays.fallback) frames.set(id, env.io.setTimer(fn, delays.frameMs));
      return id;
    },
    cancelFrame(id) {
      env.io.clearTimer(frames.get(id));
      frames.delete(id);
    },
  };
}

function macSources(state) {
  return Object.fromEntries(
    ["session", "deep"].map((source) => [
      source,
      {
        group: source === "deep" ? "chat" : "session",
        adopt(value) {
          state[source] = value;
        },
      },
    ]),
  );
}

async function createViews({ env, delays, record }) {
  const { createStateDelivery } = await import("../app/ui/state-delivery.mjs");
  const { createChatView } = await import("../app/ui/chat-view.mjs");
  const document = createMacDocument();
  const el = (id) => document.getElementById(id);
  const draw = createChatView({
    list: el("message-list"),
    box: el("messages"),
    intro: el("intro"),
    queueStatus: el("queue"),
  });
  const state = { session: { segments: [] }, deep: { jobs: [] } };
  const { frames, retained, requestFrame, cancelFrame } = createFrames(
    env,
    delays,
  );
  const emissions = new Map();
  const pendingDeliveries = new Set();
  let current,
    released = false;
  const drawMac = createMacDraw({ env, document, state, draw });
  const observe = createMacObserver({
    record,
    emissions,
    current: () => current,
    el,
  });
  const delivery = createStateDelivery({
    ...env.io,
    now: env.clientNow,
    requestFrame,
    cancelFrame,
    sources: macSources(state),
    draws: { session: drawMac, chat: drawMac },
    onReceived: (e) => observe("client.received", e),
    onApplied: (e) => observe("view.applied", e),
  });
  const tv = createTv({ env, delays, record });
  return {
    tv,
    assertHealthy: () => tv.assertHealthy(),
    publish(envelope) {
      if (released) return;
      tv.publish(envelope);
      const timer = env.io.setTimer(() => {
        pendingDeliveries.delete(timer);
        if (released) return;
        current = envelope;
        delivery.receive(envelope.source, envelope[envelope.source]);
      }, delays.deliveryMs);
      pendingDeliveries.add(timer);
    },
    cards: () => ({ mac: el("message-list").textContent, tv: tv.cards() }),
    cardsByQuestion: () => ({
      mac: cardTexts(el("message-list").children, "id"),
      tv: tv.cardsByQuestion(),
    }),
    nodes: () => ({ mac: el("message-list").children.length, tv: tv.nodes() }),
    release() {
      released = true;
      for (const timer of pendingDeliveries) env.io.clearTimer(timer);
      pendingDeliveries.clear();
      delivery.release();
      tv.release();
    },
    async probeLate() {
      const before = el("message-list").textContent + tv.cards();
      for (const fn of retained) fn();
      delivery.receive("deep", { jobs: [] });
      await tv.probeLate();
      return {
        frames: frames.size,
        lateApplications: Number(
          before !== el("message-list").textContent + tv.cards(),
        ),
      };
    },
  };
}

function tvCallbacks(c) {
  return {
    onReceive(value, kind) {
      const next = model.mergeState(c.held, value, kind);
      const envelope = c.bodies.get(value.chat);
      c.receivedId = envelope.id;
      const metadata = {
        client: "tv",
        publicationId: envelope.id,
        emissionId: ++c.emission,
        ...jobMarks(value.chat),
      };
      c.record(
        "client.received",
        "client-monotonic",
        c.env.clientNow(),
        metadata,
      );
      c.view.receive(next, c.env.clientNow());
      c.held = next;
      c.poll.stats.renders++;
      c.record("view.applied", "client-monotonic", c.env.clientNow(), {
        ...metadata,
        text: c.el("conversation").textContent,
      });
    },
    onNotModified() {
      c.view.setOnline(true);
      c.view.tick();
      c.record(
        "transport.not-modified",
        "client-monotonic",
        c.env.clientNow(),
        {
          client: "tv",
          progress: c
            .el("conversation")
            .querySelectorAll(".job-progress")
            .map((n) => n.textContent),
        },
      );
    },
    onError(error) {
      if (error?.code !== SIMULATED_TRANSPORT_REFUSAL) {
        if (!c.failed) c.failure = error;
        c.failed = true;
        return;
      }
      c.record("transport.refused", "client-monotonic", c.env.clientNow(), {
        client: "tv",
        code: error.code,
      });
    },
  };
}
function tvClient(c, delays) {
  return {
    state: async () => {
      if (c.late) return c.late.promise;
      const envelope = c.latest;
      const unchanged = envelope.id === c.receivedId;
      const value = {
        session: envelope.session,
        chat: envelope.deep,
        serverNowMs: c.env.serverNow(),
        timeline: { cards: [] },
      };
      c.record("client.requested", "client-monotonic", c.env.clientNow(), {
        client: "tv",
        publicationId: envelope.id,
      });
      await awaitResponse(c, delays.deliveryMs);
      if (delays.refuse === "transport" && !c.refusalSent) {
        c.refusalSent = true;
        throw Object.assign(new Error("Transport simulé refusé."), {
          code: SIMULATED_TRANSPORT_REFUSAL,
        });
      }
      return { notModified: unchanged, value };
    },
  };
}
function awaitResponse(c, ms) {
  return new Promise((resolve) => {
    const timer = c.env.io.setTimer(() => {
      c.responses.delete(timer);
      resolve();
    }, ms);
    c.responses.set(timer, resolve);
  });
}
function releaseResponses(c) {
  for (const [timer, resolve] of c.responses) {
    c.env.io.clearTimer(timer);
    resolve();
  }
  c.responses.clear();
}
function createTv({ env, delays, record }) {
  const { document } = readPage(path.join(__dirname, "../tv/app"));
  const el = (id) => document.getElementById(id);
  const c = {
    env,
    record,
    el,
    held: null,
    receivedId: null,
    emission: 0,
    bodies: new WeakMap(),
    responses: new Map(),
  };
  const createTvView = controlledTvView(env, delays.tvWallOffsetMs || 0);
  c.view = createTvView({
    document,
    elements: el,
    model,
    text,
    now: env.clientNow,
    isReading: () => false,
    actions: {
      ask: async () => ({}),
      cancel: async () => ({}),
      kick() {},
      onSubmit() {},
    },
  });
  c.poll = createPollController({
    ...env.io,
    now: env.clientNow,
    getState: () => c.held,
    client: tvClient(c, delays),
    ...tvCallbacks(c),
  });
  return {
    publish(envelope) {
      c.bodies.set(envelope.deep, envelope);
      c.latest = envelope;
    },
    assertHealthy() {
      if (c.failed) throw c.failure;
    },
    start: () => c.poll.start(),
    request: () => c.poll.request(),
    stats: c.poll.stats,
    cards: () => el("conversation").textContent,
    cardsByQuestion: () => cardTexts(el("conversation").children, "job"),
    nodes: () => el("conversation").children.length,
    holdLate() {
      if (!c.latest) return;
      c.late = deferred();
      c.poll.request();
    },
    release() {
      c.poll.stop();
      releaseResponses(c);
      c.view.reset();
    },
    async probeLate() {
      if (c.latest)
        c.late?.resolve({
          notModified: false,
          value: {
            session: c.latest.session,
            chat: c.latest.deep,
            serverNowMs: env.serverNow(),
            timeline: { cards: [] },
          },
        });
      await env.clock.advance(0);
    },
  };
}
module.exports = { createViews };
