const { test } = require("node:test");
const assert = require("node:assert/strict");
const { deferred } = require("./helpers/wait.cjs");

test("the controller imports without window, document or navigator", async () => {
  const names = ["window", "document", "navigator"];
  const descriptors = names.map((name) =>
    Object.getOwnPropertyDescriptor(globalThis, name),
  );
  try {
    for (const name of names)
      Object.defineProperty(globalThis, name, {
        value: undefined,
        configurable: true,
      });
    const { createCaptureController } =
      await import("../app/ui/capture-controller.mjs?without-browser");
    assert.equal(typeof createCaptureController, "function");
  } finally {
    names.forEach((name, index) => {
      if (descriptors[index])
        Object.defineProperty(globalThis, name, descriptors[index]);
      else delete globalThis[name];
    });
  }
});

async function fixture({
  audio = true,
  select,
  display,
  audioModule,
  recorderStop,
  view = {},
} = {}) {
  const { createCaptureController } =
    await import("../app/ui/capture-controller.mjs");
  const events = [],
    errors = [],
    statuses = [],
    meters = [],
    states = [],
    segments = [];
  const recorderStopping = deferred(),
    displayRequested = deferred();
  const track = (name) => ({
    readyState: "live",
    stop: () => events.push(`${name}.stop`),
  });
  const videoTrack = track("video"),
    audioTrack = track("audio"),
    endedAudio = { readyState: "ended" };
  const stream = {
    getVideoTracks: () => [videoTrack],
    getAudioTracks: () => (audio ? [endedAudio, audioTrack] : [endedAudio]),
    getTracks: () => (audio ? [videoTrack, audioTrack] : [videoTrack]),
  };
  const video = {
    srcObject: null,
    play: async () => events.push("video.play"),
  };
  const context = {
    audioWorklet: {
      addModule: async (url) => {
        events.push(["audio.module", url]);
        await audioModule;
      },
    },
    resume: async () => events.push("audio.resume"),
    createMediaStreamSource: (input) => {
      events.push(["audio.source", input]);
      return { connect: (node) => events.push(["audio.connect", node]) };
    },
    destination: {},
    close: async () => events.push("audio.close"),
  };
  const messages = [],
    worklet = {
      port: { postMessage: (message) => messages.push(message) },
      connect: (destination) => events.push(["worklet.connect", destination]),
    };
  let nextTimer = 0,
    nextId = 0;
  const timers = new Map();
  const clock = {
    setTimeout: (fn, ms) => {
      const id = ++nextTimer;
      timers.set(id, { fn, ms });
      return id;
    },
    clearTimeout: (id) => timers.delete(id),
  };
  const session = { id: "session", elapsedMs: 0, segmentMs: 8000 };
  let currentState = { id: session.id, accepting: true };
  const bridge = {
    start: async () => {
      events.push("host.start");
      return session;
    },
    resumeSession: async () => {
      events.push("host.resume");
      return session;
    },
    state: async () => {
      events.push("host.state");
      return currentState;
    },
    stop: async () => events.push("host.stop"),
  };
  const recorders = [],
    samples = [];
  const controller = createCaptureController({
    bridge,
    selectSource: async (id) => {
      events.push(["select", id]);
      await select;
    },
    source: () => "screen:1",
    browser: {
      getDisplayMedia: async (options) => {
        events.push(["display", options]);
        displayRequested.resolve();
        await display;
        return stream;
      },
      createAudioContext: (options) => {
        events.push(["audio.context", options]);
        return context;
      },
      createWorkletNode: (ctx, name) => {
        events.push(["worklet", ctx, name]);
        return worklet;
      },
      createMediaStream: (tracks) => {
        events.push(["audio.tracks", tracks]);
        return { tracks };
      },
    },
    createRecorder: (options) => {
      events.push("recorder.create");
      const recorder = {
        ...options,
        start: () => events.push("recorder.start"),
        stop: async () => {
          events.push("recorder.stop");
          recorderStopping.resolve();
          await recorderStop;
          events.push("recorder.stopped");
        },
        samples: (value) => samples.push(value),
      };
      recorders.push(recorder);
      return recorder;
    },
    timers: clock,
    uuid: () => `flush-${++nextId}`,
    video,
    session: () => currentState,
    view: {
      previewStarting() {},
      observing() {},
      stopping() {},
      changed() {},
      settled() {},
      preview: (active) => events.push(["preview", active]),
      recording: () => events.push("view.recording"),
      stopped: () => events.push("view.stopped"),
      status: (text) => statuses.push(text),
      error: (error, phase) => errors.push({ error, phase }),
      meter: (value) => meters.push(value),
      state: (state) => states.push(state),
      segment: (...args) => segments.push(args),
      ...view,
    },
  });
  return {
    controller,
    events,
    errors,
    statuses,
    meters,
    states,
    segments,
    videoTrack,
    audioTrack,
    stream,
    video,
    context,
    worklet,
    messages,
    timers,
    clock,
    bridge,
    session,
    recorders,
    samples,
    recorderStopping,
    displayRequested,
    setState: (state) => {
      currentState = state;
    },
  };
}

test("preview waits for source selection, then opens video and connects only live audio", async () => {
  const select = deferred(),
    display = deferred();
  const f = await fixture({ select: select.promise, display: display.promise });
  const preview = f.controller.startPreview();
  assert.deepEqual(f.events, [["select", "screen:1"]]);
  select.resolve();
  await f.displayRequested.promise;
  assert.deepEqual(f.events[1], [
    "display",
    {
      video: { frameRate: 10, width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: true,
    },
  ]);
  display.resolve();
  assert.equal(await preview, true);
  assert.equal(f.video.srcObject, f.stream);
  assert.equal(f.controller.previewOpen, true);
  assert.ok(f.events.includes("video.play"));
  assert.deepEqual(
    f.events.find((event) => event[0] === "audio.context"),
    ["audio.context", { sampleRate: 16000 }],
  );
  assert.deepEqual(
    f.events.find((event) => event[0] === "audio.tracks"),
    ["audio.tracks", [f.audioTrack]],
  );
  assert.deepEqual(
    f.events.find((event) => event[0] === "audio.module"),
    ["audio.module", "./audio-worklet.js"],
  );
  assert.ok(f.events.includes("audio.resume"));
  assert.deepEqual(
    f.events.find((event) => event[0] === "audio.connect"),
    ["audio.connect", f.worklet],
  );
  assert.deepEqual(
    f.events.find((event) => event[0] === "worklet.connect"),
    ["worklet.connect", f.context.destination],
  );
  assert.equal(f.statuses.at(-1), "Aperçu actif · Vérifie le son");
  assert.deepEqual(f.errors, []);
});

test("recording starts once after the host opens and passes capture resources and session to the recorder", async () => {
  const f = await fixture(),
    opened = deferred();
  await f.controller.startPreview();
  f.bridge.start = async () => {
    f.events.push("host.start");
    return opened.promise;
  };
  const first = f.controller.observe(),
    second = f.controller.observe();
  assert.equal(f.recorders.length, 0);
  opened.resolve(f.session);
  await Promise.all([first, second]);
  assert.equal(f.recorders.length, 1);
  const [recorder] = f.recorders;
  assert.equal(recorder.stream, f.stream);
  assert.equal(recorder.video, f.video);
  assert.equal(recorder.audioContext, f.context);
  assert.equal(recorder.session, f.session);
  assert.equal(typeof recorder.flushAudio, "function");
  assert.deepEqual(
    f.events.filter(
      (event) => typeof event === "string" && /^(host|recorder)\./.test(event),
    ),
    ["host.start", "host.state", "recorder.create", "recorder.start"],
  );
  assert.deepEqual(f.states, [{ id: "session", accepting: true }]);
  assert.equal(f.controller.recording, true);
  assert.equal(f.statuses.at(-1), "Capture + mémoire actives");
  recorder.onSegment("moment-1", "preview");
  assert.deepEqual(f.segments, [["moment-1", "preview", f.session]]);
});

test("video capture without live audio creates no audio context and still records", async () => {
  const f = await fixture({ audio: false });
  assert.equal(await f.controller.startPreview(), true);
  assert.equal(f.statuses.at(-1), "Aperçu actif · Sans piste audio");
  await f.controller.observe();
  assert.equal(f.recorders.length, 1);
  assert.equal(f.recorders[0].audioContext, undefined);
  assert.equal(
    f.events.some((event) => event[0] === "audio.context"),
    false,
  );
});

test("simultaneous stops wait for the recorder before stopping the host and releasing tracks and audio", async () => {
  const held = deferred(),
    f = await fixture({ recorderStop: held.promise });
  await f.controller.startPreview();
  await f.controller.observe();
  f.events.length = 0;
  const first = f.controller.stop(),
    second = f.controller.stop();
  assert.equal(f.controller.stopping, true);
  await f.recorderStopping.promise;
  assert.deepEqual(f.events, ["recorder.stop"]);
  assert.equal(f.controller.recording, true);
  held.resolve();
  await Promise.all([first, second]);
  assert.deepEqual(
    f.events.filter((event) => typeof event === "string"),
    [
      "recorder.stop",
      "recorder.stopped",
      "host.stop",
      "video.stop",
      "audio.stop",
      "audio.close",
      "view.stopped",
    ],
  );
  assert.equal(f.controller.previewOpen, false);
  assert.equal(f.controller.recording, false);
  assert.equal(f.controller.stopping, false);
  assert.equal(f.video.srcObject, null);
  assert.equal(f.meters.at(-1), 0);
  assert.equal(
    f.statuses.at(-1),
    "Capture en pause · Contexte et chat conservés",
  );
});

test("track end joins the same pending stop and quiet mode suppresses the last recorder error", async () => {
  const held = deferred(),
    f = await fixture({ recorderStop: held.promise });
  await f.controller.startPreview();
  await f.controller.observe();
  assert.equal(typeof f.videoTrack.onended, "function");
  const stopped = f.controller.stop({ quiet: true });
  await f.recorderStopping.promise;
  const ended = f.videoTrack.onended();
  f.recorders[0].onError(new Error("last partial passage"));
  assert.deepEqual(f.errors, []);
  held.resolve();
  await Promise.all([stopped, ended]);
  assert.equal(f.events.filter((event) => event === "recorder.stop").length, 1);
  assert.equal(f.events.filter((event) => event === "host.stop").length, 1);
});

test("a refused recorder stop preserves capture without pausing the host and can be retried", async () => {
  const f = await fixture();
  await f.controller.startPreview();
  await f.controller.observe();
  const recorder = f.recorders[0],
    stop = recorder.stop;
  const failure = new Error("recorder stop refused"),
    statuses = [...f.statuses];
  recorder.stop = async () => {
    f.events.push("recorder.stop");
    throw failure;
  };
  f.events.length = 0;
  await assert.rejects(f.controller.stop(), (error) => error === failure);
  assert.equal(f.controller.recording, true);
  assert.equal(f.controller.previewOpen, true);
  assert.equal(f.controller.stopping, false);
  assert.equal(f.video.srcObject, f.stream);
  assert.deepEqual(f.events, ["recorder.stop", ["preview", true]]);
  assert.deepEqual(f.statuses, statuses);
  recorder.stop = stop;
  await f.controller.stop();
  assert.equal(f.controller.recording, false);
  assert.equal(f.controller.previewOpen, false);
  assert.equal(f.events.filter((event) => event === "host.stop").length, 1);
  assert.equal(
    f.statuses.at(-1),
    "Capture en pause · Contexte et chat conservés",
  );
});

test("a refused host stop preserves preview and status so the host pause can be retried", async () => {
  const f = await fixture();
  await f.controller.startPreview();
  await f.controller.observe();
  const stop = f.bridge.stop,
    failure = new Error("host stop refused"),
    statuses = [...f.statuses];
  f.bridge.stop = async () => {
    f.events.push("host.stop");
    throw failure;
  };
  f.events.length = 0;
  await assert.rejects(f.controller.stop(), (error) => error === failure);
  assert.equal(f.controller.recording, false);
  assert.equal(f.controller.previewOpen, true);
  assert.equal(f.controller.stopping, false);
  assert.equal(f.video.srcObject, f.stream);
  assert.deepEqual(f.events, [
    "recorder.stop",
    "recorder.stopped",
    "host.stop",
    ["preview", true],
  ]);
  assert.deepEqual(f.statuses, statuses);
  f.bridge.stop = stop;
  f.events.length = 0;
  await f.controller.stop();
  assert.equal(f.events.includes("recorder.stop"), false);
  assert.equal(f.events.filter((event) => event === "host.stop").length, 1);
  assert.equal(f.controller.previewOpen, false);
  assert.equal(
    f.statuses.at(-1),
    "Capture en pause · Contexte et chat conservés",
  );
});

test("an audio setup failure releases capture even when the host refuses to stop", async () => {
  const refused = deferred(),
    failure = new Error("audio setup refused"),
    stopFailure = new Error("host stop refused");
  const f = await fixture({ audioModule: refused.promise });
  f.bridge.stop = async () => {
    f.events.push("host.stop");
    throw stopFailure;
  };
  const opened = f.controller.startPreview();
  refused.reject(failure);
  assert.equal(await opened, false);
  assert.equal(f.controller.previewOpen, false);
  assert.equal(f.video.srcObject, null);
  assert.deepEqual(f.errors, [
    { error: stopFailure, phase: "stop" },
    { error: failure, phase: "preview" },
  ]);
  assert.deepEqual(
    f.events.filter(
      (event) => typeof event === "string" && /stop|close/.test(event),
    ),
    ["host.stop", "video.stop", "audio.stop", "audio.close"],
  );
  assert.equal(
    f.statuses.includes("Capture en pause · Contexte et chat conservés"),
    false,
  );
});

test("stop refusal re-enables Stop but the shell only shows it while the recorder is retained", async (t) => {
  const { ViewingShell } = await import("../app/ui/shell.js");
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "document");
  t.after(() => {
    if (descriptor) Object.defineProperty(globalThis, "document", descriptor);
    else delete globalThis.document;
  });
  const node = () => ({
    hidden: false,
    disabled: false,
    dataset: {},
    classList: { toggle() {} },
    setAttribute() {},
    removeAttribute() {},
    replaceChildren() {},
    insertBefore() {},
    addEventListener() {},
    append() {},
  });
  for (const refusal of ["recorder", "host"]) {
    const elements = new Map();
    const page = {
      body: node(),
      querySelector: () => node(),
      createElementNS: () => node(),
      createTextNode: (text) => ({ textContent: text }),
      getElementById: (id) => {
        if (!elements.has(id)) elements.set(id, node());
        return elements.get(id);
      },
    };
    Object.defineProperty(globalThis, "document", {
      configurable: true,
      value: page,
    });
    const shell = new ViewingShell(page),
      button = page.getElementById("stop");
    const state = { id: "session", segments: [], history: [] };
    let f;
    f = await fixture({
      view: {
        stopping: () => {
          button.disabled = true;
        },
        preview: (active) => {
          button.disabled = !active;
        },
        changed: () => shell.observation(state, f.controller.recording),
      },
    });
    await f.controller.startPreview();
    await f.controller.observe();
    assert.equal(button.hidden, false, refusal);
    const failure = new Error("stop refused");
    const target = refusal === "recorder" ? f.recorders[0] : f.bridge;
    t.mock.method(target, "stop", async () => {
      throw failure;
    });
    const stopped = f.controller.stop();
    assert.equal(button.disabled, true, refusal);
    await assert.rejects(stopped, (error) => error === failure);
    assert.equal(button.disabled, false, refusal);
    assert.equal(button.hidden, refusal === "host", refusal);
  }
});

test("a refused display request reports its error and resets the preview without creating audio", async () => {
  const refused = deferred(),
    failure = new Error("display refused");
  const f = await fixture({ display: refused.promise });
  const opened = f.controller
    .startPreview()
    .catch((error) => ({ rejected: error }));
  refused.reject(failure);
  assert.equal(await opened, false);
  assert.deepEqual(f.errors, [{ error: failure, phase: "preview" }]);
  assert.equal(f.controller.previewOpen, false);
  assert.equal(f.video.srcObject, null);
  assert.equal(
    f.events.some((event) => event[0] === "audio.context"),
    false,
  );
  assert.equal(f.events.includes("host.stop"), true);
});

test("track end initiates the shared stop and keeps the host open until the recorder finishes", async () => {
  const held = deferred(),
    f = await fixture({ recorderStop: held.promise });
  await f.controller.startPreview();
  await f.controller.observe();
  const ended = f.videoTrack.onended();
  assert.equal(f.controller.stopping, true);
  await f.recorderStopping.promise;
  assert.equal(f.events.includes("host.stop"), false);
  held.resolve();
  await ended;
  assert.equal(f.events.filter((event) => event === "host.stop").length, 1);
  assert.equal(f.controller.previewOpen, false);
});

test("a failed audio connection reports its error and releases the acquired tracks and context", async () => {
  const refused = deferred(),
    failure = new Error("audio module refused");
  const f = await fixture({ audioModule: refused.promise });
  const opened = f.controller
    .startPreview()
    .catch((error) => ({ rejected: error }));
  refused.reject(failure);
  assert.equal(await opened, false);
  assert.deepEqual(f.errors, [{ error: failure, phase: "preview" }]);
  assert.equal(f.controller.previewOpen, false);
  assert.equal(f.video.srcObject, null);
  assert.deepEqual(
    f.events.filter(
      (event) => typeof event === "string" && /stop|close/.test(event),
    ),
    ["host.stop", "video.stop", "audio.stop", "audio.close", "view.stopped"],
  );
});

test("a refused host opening keeps the preview and reports the observation error", async () => {
  const f = await fixture(),
    failure = new Error("host refused");
  await f.controller.startPreview();
  f.bridge.start = async () => {
    throw failure;
  };
  await f.controller.observe().catch(() => {});
  assert.deepEqual(f.errors, [{ error: failure, phase: "observe" }]);
  assert.equal(f.recorders.length, 0);
  assert.equal(f.controller.recording, false);
  assert.equal(f.controller.previewOpen, true);
  assert.equal(f.events.includes("host.stop"), true);
});

test("worklet samples reach the meter and recorder and only the matching flush acknowledgement resolves", async () => {
  const f = await fixture();
  await f.controller.startPreview();
  await f.controller.observe();
  assert.equal(typeof f.worklet.port.onmessage, "function");
  const samples = new Float32Array([0.25, -0.5]);
  f.worklet.port.onmessage({ data: { type: "samples", samples, rms: 0.5 } });
  assert.deepEqual(f.samples, [samples]);
  assert.deepEqual(f.meters, [1]);
  let firstDone = false,
    secondDone = false;
  const first = f.controller.flushAudio().then(() => {
    firstDone = true;
  });
  const second = f.controller.flushAudio().then(() => {
    secondDone = true;
  });
  assert.deepEqual(f.messages, [
    { type: "flush", id: "flush-1" },
    { type: "flush", id: "flush-2" },
  ]);
  assert.equal(f.timers.size, 2);
  assert.deepEqual(
    [...f.timers.values()].map((timer) => timer.ms),
    [500, 500],
  );
  f.worklet.port.onmessage({ data: { type: "flushed", id: "unknown" } });
  await Promise.resolve();
  assert.deepEqual([firstDone, secondDone, f.timers.size], [false, false, 2]);
  f.worklet.port.onmessage({ data: { type: "flushed", id: "flush-2" } });
  await second;
  assert.deepEqual([firstDone, secondDone, f.timers.size], [false, true, 1]);
  f.worklet.port.onmessage({ data: { type: "flushed", id: "flush-1" } });
  await first;
  assert.equal(f.timers.size, 0);
});

test("flush resolves at its injected deadline and leaves no timer after a late acknowledgement", async () => {
  const f = await fixture();
  await f.controller.startPreview();
  const pending = f.controller.flushAudio();
  assert.equal(f.timers.size, 1);
  const [timer] = f.timers.values();
  timer.fn();
  await pending;
  assert.equal(f.timers.size, 0);
  f.worklet.port.onmessage({ data: { type: "flushed", id: "flush-1" } });
  assert.equal(f.timers.size, 0);
});

test("releasing preview completes a pending flush without waiting for its deadline", async () => {
  const f = await fixture();
  await f.controller.startPreview();
  let completed = false;
  const pending = f.controller.flushAudio().then(() => {
    completed = true;
  });
  assert.equal(f.timers.size, 1);
  assert.equal(completed, false);
  await f.controller.stop();
  assert.equal(f.timers.size, 0);
  assert.equal(completed, true);
  await pending;
  assert.deepEqual(f.messages, [{ type: "flush", id: "flush-1" }]);
  assert.equal(f.controller.previewOpen, false);
});

test("stopping preview without a loaded session reports capture inactive", async () => {
  const f = await fixture();
  f.setState(null);
  await f.controller.startPreview();
  await f.controller.stop();
  assert.equal(f.statuses.at(-1), "Capture inactive");
  assert.equal(f.controller.previewOpen, false);
  assert.equal(f.controller.recording, false);
  assert.equal(f.video.srcObject, null);
  assert.equal(f.events.includes("view.stopped"), true);
});

test("an archive resumes explicitly and records with the resumed session when the host accepts", async () => {
  const f = await fixture(),
    resumed = { ...f.session, id: "archive" };
  f.setState({ id: "archive", readOnly: true, accepting: false });
  f.bridge.resumeSession = async () => {
    f.events.push("host.resume");
    f.setState({ id: "archive", readOnly: false, accepting: true });
    return resumed;
  };
  await f.controller.startPreview();
  await f.controller.observe();
  assert.equal(f.events.includes("host.resume"), true);
  assert.equal(f.events.includes("host.start"), false);
  assert.equal(f.recorders[0].session, resumed);
  assert.deepEqual(
    f.events.filter(
      (event) => typeof event === "string" && /^host\./.test(event),
    ),
    ["host.resume", "host.state", "host.state"],
  );
});

test("an archive whose resumed host is not accepting falls back to start", async () => {
  const f = await fixture();
  f.setState({ id: "archive", readOnly: true, accepting: false });
  await f.controller.startPreview();
  await f.controller.observe();
  assert.deepEqual(
    f.events.filter(
      (event) => typeof event === "string" && /^host\./.test(event),
    ),
    ["host.resume", "host.state", "host.start", "host.state"],
  );
  assert.equal(f.recorders[0].session, f.session);
});
