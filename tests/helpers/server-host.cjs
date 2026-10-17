const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { HeadlessRuntime } = require("../../runtime/headless-runtime.cjs");
const { RemoteServer } = require("../../server/http.cjs");
const { RemoteClient } = require("../../tv/app/remote-client.js");
const { simulatedPerception } = require("../../adapters/simulated-providers.cjs");
const { manualClock } = require("./clock.cjs");
const { deferred } = require("./wait.cjs");

const WALL_EPOCH_MS = 1790000000000;
const TOKEN = "w".repeat(64);

function recordingFetch(trace, caller) {
  return async (url, init = {}) => {
    const address = new URL(url);
    const row = {
      caller,
      method: init.method || "GET",
      route: address.pathname + address.search,
      headers: new Headers(init.headers),
      body: init.body === undefined ? undefined : JSON.parse(init.body),
    };
    trace.push(row);
    const response = await fetch(url, init);
    const text = await response.clone().text();
    Object.assign(row, {
      status: response.status,
      etag: response.headers.get("etag"),
      bytes: Buffer.byteLength(text),
      value: text ? JSON.parse(text) : null,
    });
    return response;
  };
}

function controlledPerception() {
  const simulated = simulatedPerception();
  const gates = [];
  const pending = [];
  return {
    hold() {
      const entered = deferred();
      const released = deferred();
      const gate = { entered, released };
      gates.push(gate);
      pending.push(gate);
      return { started: entered.promise, release: released.resolve };
    },
    releaseAll: () => gates.forEach((gate) => gate.released.resolve()),
    provider: {
      ...simulated,
      async observeVisual(input) {
        const gate = pending.shift();
        if (gate) {
          gate.entered.resolve();
          await gate.released.promise;
        }
        return simulated.observeVisual(input);
      },
    },
  };
}

function publication(runtime, predicate) {
  const next = deferred();
  const listen = (state) => {
    if (!predicate(state)) return;
    runtime.listeners.delete(listen);
    next.resolve(state);
  };
  runtime.listeners.add(listen);
  listen(runtime.snapshot());
  return next.promise;
}

function createProducer(server, trace) {
  const send = recordingFetch(trace, "producer");
  return async (route, body) => {
    const response = await send(server.url + route, {
      method: body === undefined ? "GET" : "POST",
      headers: { Authorization: "Bearer " + TOKEN, "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: response.status, value: await response.json() };
  };
}

async function createServerHost(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "tvlens-server-host-"));
  const clock = manualClock();
  let runtime, server;
  const trace = [];
  const assembled = [];
  const analysis = controlledPerception();
  t.after(async () => {
    analysis.releaseAll();
    try {
      await server?.close();
    } finally {
      try {
        await runtime?.close();
      } finally {
        await fs.rm(root, { recursive: true, force: true });
      }
    }
  });
  runtime = new HeadlessRuntime({
    userData: root,
    sessionsRoot: path.join(root, "sessions"),
    config: {},
    selectedModels: {},
    smoke: true,
    readClock: clock.io.now,
    wallClock: () => WALL_EPOCH_MS + clock.io.now(),
    setTimer: clock.io.setTimer,
    clearTimer: clock.io.clearTimer,
    agent: { answer: async () => ({ answer: "Réponse simulée.", citations: [], limits: [] }) },
    overrides: { perception: analysis.provider },
  });
  const media = { assemble: async (input) => {
    assembled.push(input);
    return {
      ...input,
      clip: Buffer.from("fixture"),
      frames: input.frames.map((frame) => ({ atMs: frame.atMs, dataUrl: "data:image/jpeg;base64," + frame.data })),
      audio: input.audio ? Buffer.from(input.audio, "base64") : null,
    };
  } };
  server = await new RemoteServer({ runtime, media, token: TOKEN }).listen(0, "127.0.0.1");
  const client = new RemoteClient({ url: server.url, token: TOKEN }, recordingFetch(trace, "panel"));
  return {
    root, runtime, server, client, clock, trace, analysis, assembled,
    producer: createProducer(server, trace),
    clientWithToken: (token) => new RemoteClient({ url: server.url, token }, recordingFetch(trace, "panel")),
    published: (predicate) => publication(runtime, predicate),
  };
}

module.exports = { createServerHost };
