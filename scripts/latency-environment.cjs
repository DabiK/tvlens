const { readFileSync } = require("node:fs");
const vm = require("node:vm");
const { createRequire } = require("node:module");
const { manualClock } = require("../tests/helpers/clock.cjs");
const { deferred } = require("../tests/helpers/wait.cjs");

const SERVER_ORIGIN_MS = 1800000000000;
const CLIENT_ORIGIN_MS = 70000;

function createEnvironment() {
  const clock = manualClock({ turns: 2 });
  const owned = new Set();
  const setTimer = (fn, ms) => {
    const id = clock.io.setTimer(() => {
      owned.delete(id);
      fn();
    }, ms);
    owned.add(id);
    return id;
  };
  const clearTimer = (id) => {
    owned.delete(id);
    clock.io.clearTimer(id);
  };
  const io = { now: clock.io.now, setTimer, clearTimer };
  const waits = createWaits(io);
  return {
    clock,
    io,
    wait: waits.wait,
    cancelWaits: waits.cancel,
    serverNow: () => SERVER_ORIGIN_MS + io.now(),
    clientNow: () => CLIENT_ORIGIN_MS + io.now(),
    release: () => {
      waits.cancel();
      for (const id of owned) clearTimer(id);
    },
  };
}

function createWaits(io) {
  const pending = new Map();
  const cancelled = Object.assign(new Error("Scénario libéré."), {
    code: "SCENARIO_RELEASED",
  });
  let released = false;
  return {
    wait(ms) {
      if (released) return Promise.reject(cancelled);
      const gate = deferred();
      const timer = io.setTimer(() => {
        pending.delete(timer);
        gate.resolve();
      }, ms);
      pending.set(timer, gate.reject);
      return gate.promise;
    },
    cancel() {
      released = true;
      for (const [timer, reject] of pending) {
        io.clearTimer(timer);
        reject(cancelled);
      }
      pending.clear();
    },
  };
}

// DeepAsk conserve ses minuteries globales ; seule son instance de banc reçoit ce contexte.
function controlledModule(filename, globals) {
  const module = { exports: {} };
  vm.runInNewContext(
    readFileSync(require.resolve(filename), "utf8"),
    {
      module,
      require: createRequire(require.resolve(filename)),
      ...globals,
    },
    { filename },
  );
  return module.exports;
}
function controlledDeepAsk(io) {
  return controlledModule("../core/deep-ask.cjs", {
    AbortController,
    setTimeout: io.setTimer,
    clearTimeout: io.clearTimer,
  }).DeepAsk;
}
function controlledTvView(env, offsetMs) {
  class ClientDate extends Date {
    static now() {
      return SERVER_ORIGIN_MS + offsetMs + env.io.now();
    }
    constructor(...args) {
      super(...(args.length ? args : [ClientDate.now()]));
    }
  }
  return controlledModule("../tv/app/chat-view.js", { Date: ClientDate })
    .createChatView;
}

module.exports = {
  createEnvironment,
  controlledDeepAsk,
  controlledTvView,
  SERVER_ORIGIN_MS,
  CLIENT_ORIGIN_MS,
};
