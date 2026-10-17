const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const { createMacDocument } = require("./mac-document.cjs");
const { manualClock } = require("./clock.cjs");
const { deferred, turns } = require("./wait.cjs");

async function rendererHarness(t, overrides = {}) {
  const { createRendererWiring } =
    await import("../../app/ui/renderer-wiring.mjs");
  const html = fs.readFileSync(
    path.join(__dirname, "../../app/index.html"),
    "utf8",
  );
  const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]);
  const document = createMacDocument({ ids });
  const previous = global.document;
  global.document = document;
  t.after(() => {
    if (previous === undefined) delete global.document;
    else global.document = previous;
  });
  const get = (id) => document.getElementById(id);
  get("search-status").textContent = "Cherche un passage.";
  const listeners = new Map(),
    removed = [],
    reads = [],
    calls = [],
    draws = [],
    badges = [],
    frames = new Map();
  const bridge = {};
  for (const name of [
    "onState",
    "onDeepState",
    "onVerificationState",
    "onReset",
    "onRecap",
    "onSurveillance",
  ]) {
    bridge[name] = (callback) => {
      listeners.set(name, callback);
      return () => {
        removed.push(name);
        listeners.delete(name);
      };
    };
  }
  for (const name of [
    "state",
    "deepState",
    "verificationState",
    "recapState",
    "surveillanceState",
    "searchMoments",
  ]) {
    bridge[name] = (...args) => {
      const held = deferred();
      reads.push({ name, args, ...held });
      return held.promise;
    };
  }
  for (const name of ["ask", "verify", "openSurveillanceSource"]) {
    bridge[name] = async (...args) => {
      calls.push([name, ...args]);
    };
  }
  Object.assign(bridge, overrides.bridge);
  const window = document.createElement("window");
  const clock = manualClock();
  let sequence = 0;
  const wiring = createRendererWiring({
    bridge,
    window,
    document,
    get,
    configuration: () => ({
      verificationAvailable: true,
      retentionMs: 123,
      ...overrides.configuration,
    }),
    library: () => overrides.library || null,
    preview: () => null,
    chatOptions: () => ({ cancelling: new Set() }),
    mode: () => ({ floating: false, expanded: false }),
    shell: { view: "direct", watchBadge: (badge) => badges.push(badge) },
    views: {
      session: () => draws.push("session"),
      chat: () => draws.push("chat"),
      adopted: (state) => draws.push(["adopted", state.id]),
      reset: () => draws.push("reset"),
      surveillance: () => draws.push("surveillance"),
      changed: () => draws.push("buttons"),
    },
    notice: (text) => {
      get("notice").textContent = text || "";
    },
    time: {
      ...clock.io,
      now: () => 1_760_000_000_000 + clock.io.now(),
      requestFrame: (fn) => {
        frames.set(++sequence, fn);
        return sequence;
      },
      cancelFrame: (id) => frames.delete(id),
    },
  });
  wiring.bind();
  t.after(() => {
    wiring.release();
    assert.equal(clock.armed, 0);
    assert.equal(frames.size, 0);
  });
  const frame = () => {
    const pending = [...frames.values()];
    frames.clear();
    for (const fn of pending) fn();
  };
  const publish = (name, state) => {
    assert.equal(typeof listeners.get(name), "function", `${name} subscribed`);
    listeners.get(name)(state);
  };
  const click = async (node) => {
    node.dispatchEvent({ type: "click", bubbles: true });
    await turns(1);
  };
  const submit = (node) => node.onsubmit({ preventDefault() {} });
  return {
    wiring,
    window,
    document,
    get,
    bridge,
    listeners,
    removed,
    reads,
    calls,
    draws,
    badges,
    frames,
    clock,
    frame,
    publish,
    click,
    submit,
  };
}
module.exports = { rendererHarness };
