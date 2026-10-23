const { test } = require("node:test");
const assert = require("node:assert/strict");
const { deferred } = require("./helpers/wait.cjs");

async function fixture(overrides = {}) {
  const { bindCaptureActions } = await import("../app/ui/capture-actions.mjs");
  const nodes = new Map(),
    events = [],
    listeners = new Map(),
    navigation = [];
  const get = (id) => {
    if (!nodes.has(id))
      nodes.set(id, {
        value: "",
        textContent: "",
        hidden: false,
        disabled: false,
        open: false,
        options: [],
        selectedOptions: [],
        classList: { toggle() {} },
        showModal() {
          this.open = true;
        },
        close() {
          this.open = false;
          this.onclose?.();
        },
        focus() {
          navigation.push(["focus", id]);
        },
        replaceChildren(...options) {
          this.options = options;
          this.value = options[0]?.value || "";
        },
      });
    return nodes.get(id);
  };
  let state = { id: "session", segments: [], history: [], accepting: true };
  let mode = { floating: false, expanded: false };
  const checkpoint = deferred(),
    checkpointCalled = deferred();
  const capture = {
    previewOpen: false,
    recording: false,
    stopping: false,
    startPreview: async () => {
      events.push(["preview", get("source").value]);
      capture.previewOpen = true;
      return true;
    },
    observe: async () => {
      events.push(["observe"]);
      capture.recording = true;
    },
    stop: async (options) => {
      events.push(["stop", options]);
      capture.previewOpen = capture.recording = false;
    },
    release: async () => events.push(["release"]),
    checkpoint: (...args) => {
      events.push(["checkpoint", ...args]);
      checkpointCalled.resolve();
      return checkpoint.promise;
    },
    snapshot: () => {
      events.push(["snapshot"]);
      return "data:image/jpeg;current-preview";
    },
  };
  const bridge = {
    onExplainMoment: (fn) => listeners.set("moment", fn),
    freezeMoment: async (value) => {
      events.push(["freeze", value]);
      return { token: "frozen", anchorMs: 1234, startMs: 300 };
    },
    explainMoment: async (value) => events.push(["explain", value]),
    catchUp: async (value) => {
      events.push(["catchUp", value]);
      return { startMs: 300, endMs: 1234 };
    },
    markAttention: async () => {
      events.push(["attention"]);
      return { atMs: 1500 };
    },
    momentShortcuts: async () => ({ explainShortcutRegistered: true }),
  };
  const options = {
    get,
    capture,
    bridge,
    window: {
      addEventListener: (name, fn) => listeners.set(name, fn),
      Option: class {
        constructor(text, value) {
          this.textContent = text;
          this.value = value;
        }
      },
    },
    sources: async () => ({ sources: [{ id: "screen:1", name: "Écran" }] }),
    session: () => state,
    configuration: () => ({ canObserve: true }),
    mode: () => mode,
    changeWindowMode: async (floating, expanded) => {
      navigation.push(["mode", floating, expanded]);
      mode = { floating, expanded };
    },
    showDirect: () => events.push(["direct"]),
    refresh: async () => {},
    setSources: () => {},
    changed: () => {},
    notice: (text) => {
      get("notice").textContent = text;
    },
    forceBottom: () => {},
    ...overrides,
  };
  const actions = bindCaptureActions(options);
  const { bindMomentActions } = await import("../app/ui/moment-actions.mjs");
  const moments = bindMomentActions(options);
  get("source").value = "screen:1";
  get("source").options = [{ value: "screen:1" }];
  return {
    actions,
    moments,
    capture,
    bridge,
    events,
    get,
    listeners,
    navigation,
    checkpoint,
    checkpointCalled,
    setState: (value) => {
      state = value;
    },
    setMode: (value) => {
      mode = value;
    },
  };
}

test("direct observation, floating launch and confirmed archive resume use one injected controller", async () => {
  const f = await fixture();
  await f.get("observe").onclick?.();
  assert.deepEqual(f.events, [["preview", "screen:1"], ["observe"]]);
  await f.get("float-record").onclick();
  assert.deepEqual(f.events.at(-1), ["stop", undefined]);
  f.get("source").value = "";
  await f.get("float-record").onclick();
  assert.equal(f.get("float-source-dialog").open, true);
  f.get("float-source").value = "window:2";
  await f.get("float-source-form").onsubmit({ preventDefault() {} });
  assert.deepEqual(f.events.slice(-2), [["preview", "window:2"], ["observe"]]);
  await f.get("float-record").onclick();
  f.setMode({ floating: false, expanded: false });
  f.setState({ id: "archive", readOnly: true, segments: [], history: [] });
  const before = f.events.length;
  await f.get("archive-resume").onclick();
  assert.equal(f.get("resume-session-dialog").open, true);
  await f.get("cancel-resume-session").onclick();
  assert.equal(f.events.length, before);
  await f.get("archive-resume").onclick();
  await f.get("confirm-resume-session").onclick();
  assert.deepEqual(f.events.slice(-3), [
    ["direct"],
    ["preview", "window:2"],
    ["observe"],
  ]);
});

for (const action of [
  {
    name: "moment dialog",
    trigger: (f) =>
      f.listeners.get("moment")?.({ token: "frozen", anchorMs: 1234 }),
    anchor: [1234],
    dependent: "explain",
  },
  {
    name: "direct explanation",
    trigger: (f) => f.get("explain-moment").onclick?.(),
    anchor: [1234],
    dependent: "explain",
  },
  {
    name: "floating explanation",
    trigger: (f) => f.get("float-explain").onclick?.(),
    anchor: [1234],
    dependent: "explain",
  },
  {
    name: "catch up",
    trigger: (f) => f.get("catch-up").onclick?.(),
    anchor: [1234],
    dependent: "catchUp",
  },
  {
    name: "attention",
    trigger: (f) => f.get("mark-attention").onclick?.(),
    anchor: [],
    dependent: "attention",
  },
]) {
  test(`${action.name} waits for the injected controller checkpoint with its existing anchor`, async () => {
    const f = await fixture();
    const running = Promise.resolve(action.trigger(f));
    await Promise.race([f.checkpointCalled.promise, running]);
    assert.deepEqual(
      f.events.filter((event) => event[0] === "checkpoint"),
      [["checkpoint", ...action.anchor]],
    );
    assert.equal(
      f.events.some((event) => event[0] === action.dependent),
      false,
    );
    if (action.name === "moment dialog") {
      assert.equal(
        f.get("moment-preview").src,
        "data:image/jpeg;current-preview",
      );
      assert.equal(f.get("moment-preview").hidden, false);
      assert.equal(
        f.events.filter((event) => event[0] === "snapshot").length,
        1,
      );
      await f.get("moment-explain").onclick();
      assert.equal(
        f.events.some((event) => event[0] === "explain"),
        false,
      );
    }
    f.checkpoint.resolve();
    await running;
    if (action.name === "moment dialog")
      await f.get("moment-explain").onclick();
    assert.equal(
      f.events.filter((event) => event[0] === action.dependent).length,
      1,
    );
    if (action.dependent !== "attention")
      assert.equal(
        f.events.find((event) => event[0] === action.dependent)[1].token,
        "frozen",
      );
  });
}

test("page unload delegates and returns the controller release promise", async () => {
  const f = await fixture(),
    held = deferred();
  f.capture.release = async () => {
    f.events.push(["release"]);
    await held.promise;
  };
  let done = false;
  const unloading = f.listeners
    .get("beforeunload")()
    .then(() => {
      done = true;
    });
  assert.deepEqual(f.events, [["release"]]);
  await Promise.resolve();
  assert.equal(done, false);
  held.resolve();
  await unloading;
  assert.equal(done, true);
});

test("archive opening is blocked by either public capture status", async () => {
  const f = await fixture();
  let opened = 0;
  for (const status of [
    { recording: true, previewOpen: false },
    { recording: false, previewOpen: true },
  ]) {
    Object.assign(f.capture, status);
    await f.actions.openArchive?.(() => {
      opened++;
    });
    assert.equal(opened, 0);
    assert.match(f.get("notice").textContent, /pause/);
  }
  Object.assign(f.capture, { recording: false, previewOpen: false });
  await f.actions.openArchive(() => {
    opened++;
  });
  assert.equal(opened, 1);
});

test("host refusal or blocked storage commands a quiet pause through the same controller", async () => {
  const f = await fixture();
  f.capture.recording = true;
  await f.actions.pauseIfUnavailable?.({ accepting: false });
  assert.deepEqual(f.events, [["stop", { quiet: true }]]);
  f.capture.recording = true;
  await f.actions.pauseIfUnavailable({ blocked: true });
  assert.deepEqual(f.events.at(-1), ["stop", { quiet: true }]);
  f.capture.recording = true;
  f.capture.stopping = true;
  await f.actions.pauseIfUnavailable({ accepting: false });
  assert.equal(f.events.length, 2);
});

test("preview and stop buttons command the injected controller and show a refused pause", async () => {
  const f = await fixture();
  assert.equal(typeof f.get("start").onclick, "function");
  assert.equal(typeof f.get("stop").onclick, "function");
  await f.get("start").onclick();
  await f.get("stop").onclick();
  assert.deepEqual(f.events, [
    ["preview", "screen:1"],
    ["stop", undefined],
  ]);
  assert.equal(f.capture.previewOpen, false);
  const failure = Object.assign(new Error("La pause a été refusée."), {
    code: "STOP_REFUSED",
  });
  f.capture.stop = async () => {
    throw failure;
  };
  await f.get("stop").onclick();
  assert.equal(f.get("notice").textContent, "La pause a été refusée.");
});

test("changing the floating source waits for stop before returning to full mode and focusing the source", async () => {
  const f = await fixture(),
    stopped = deferred();
  f.setMode({ floating: true, expanded: true });
  f.capture.stop = async () => {
    f.events.push(["stop"]);
    await stopped.promise;
  };
  assert.equal(typeof f.get("float-source-change").onclick, "function");
  const changing = f.get("float-source-change").onclick();
  assert.deepEqual(f.events, [["stop"]]);
  assert.deepEqual(f.navigation, []);
  stopped.resolve();
  await changing;
  assert.deepEqual(f.events, [["stop"], ["direct"]]);
  assert.deepEqual(f.navigation, [
    ["mode", false, undefined],
    ["focus", "choose-source"],
  ]);
});

test("the floating bar says how to give screen access when the sources cannot be listed", async () => {
  const f = await fixture({
    sources: async () => {
      throw new Error("Failed to get sources.");
    },
  });
  await f.get("float-refresh").onclick();
  assert.match(f.get("float-source-error").textContent, /ne peut pas lister les fenêtres/);
  assert.match(f.get("float-source-error").textContent, /Enregistrement de l’écran/);
  assert.equal(f.get("float-refresh").disabled, false);
});

test("the audio warning opens the screen and system audio permissions, and a refusal reaches the notice", async () => {
  const opened = [];
  const f = await fixture({
    openPermissions: async () => {
      opened.push("permissions");
      if (opened.length > 1) throw new Error("Réglages indisponibles");
    },
  });
  await f.get("audio-warning-settings").onclick();
  assert.deepEqual(opened, ["permissions"]);
  assert.equal(f.get("notice").textContent, "");
  await f.get("audio-warning-settings").onclick();
  assert.equal(f.get("notice").textContent, "Réglages indisponibles");
});
