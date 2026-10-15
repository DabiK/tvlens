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
  recorderStart,
  recorderFactory,
  recorderStopError,
  contextClose,
  checkpoint,
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
    displayRequested = deferred(),
    audioLoading = deferred();
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
        audioLoading.resolve();
        await audioModule;
      },
    },
    resume: async () => events.push("audio.resume"),
    createMediaStreamSource: (input) => {
      events.push(["audio.source", input]);
      return {
        connect: (node) => events.push(["audio.connect", node]),
        disconnect: () => events.push(["audio.disconnect"]),
      };
    },
    destination: {},
    close: async () => {
      events.push("audio.close");
      await contextClose;
    },
  };
  const messages = [],
    worklet = {
      port: {
        postMessage: (message) => messages.push(message),
        close: () => events.push(["port.close"]),
      },
      disconnect: () => events.push(["worklet.disconnect"]),
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
      createCanvas: () => ({
        getContext: () => ({
          drawImage: (...args) => events.push(["snapshot", ...args]),
        }),
        toDataURL: (...args) => {
          events.push(["snapshot.encoding", ...args]);
          return "data:image/jpeg;moment";
        },
      }),
      createMediaStream: (tracks) => {
        events.push(["audio.tracks", tracks]);
        return { tracks };
      },
    },
    createRecorder: (options) => {
      events.push("recorder.create");
      if (recorderFactory) {
        const recorder = recorderFactory(options);
        recorders.push(recorder);
        return recorder;
      }
      const recorder = {
        ...options,
        start: () => {
          events.push("recorder.start");
          recorderStart?.(recorder);
        },
        stop: async () => {
          events.push("recorder.stop");
          recorderStopping.resolve();
          await recorderStop;
          if (recorderStopError) throw recorderStopError;
          events.push("recorder.stopped");
        },
        checkpoint: async (...args) => {
          events.push(["checkpoint", recorder, args]);
          await checkpoint;
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
    audioLoading,
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

test("a refused host opening releases capture and reports the observation error", async () => {
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
  assert.equal(f.controller.previewOpen, false);
  assert.equal(f.video.srcObject, null);
  assert.equal(f.worklet.port.onmessage, null);
  assert.equal(f.videoTrack.onended, null);
  assert.equal(f.events.filter((event) => event === "host.stop").length, 1);
  assert.ok(f.events.includes("audio.close"));
  assert.ok(f.events.includes("audio.stop"));
  assert.ok(f.events.includes("video.stop"));
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

test("checkpoints use the current recorder and wait for its ingestion before returning", async () => {
  const ingestion = deferred();
  const f = await fixture({ checkpoint: ingestion.promise });
  await f.controller.startPreview();
  await f.controller.observe();
  let done = false;
  const pending = Promise.resolve(f.controller.checkpoint?.(1250)).then(() => {
    done = true;
  });
  assert.deepEqual(
    f.events.filter((event) => event[0] === "checkpoint"),
    [["checkpoint", f.recorders[0], [1250]]],
  );
  await Promise.resolve();
  assert.equal(done, false);
  ingestion.resolve();
  await pending;
  assert.equal(done, true);
  await f.controller.stop();
  await f.controller.startPreview();
  await f.controller.observe();
  await f.controller.checkpoint();
  assert.deepEqual(
    f.events.filter((event) => event[0] === "checkpoint").at(-1),
    ["checkpoint", f.recorders[1], [undefined]],
  );
  await f.controller.stop();
  await f.controller.checkpoint();
  assert.equal(f.events.filter((event) => event[0] === "checkpoint").length, 2);
});

test("release is repeatable, drains flushes and detaches audio callbacks without touching the released page", async () => {
  let released = false;
  const pageCalls = [];
  const f = await fixture({
    view: {
      meter: (value) => {
        if (released) pageCalls.push(["meter", value]);
      },
      changed: () => {
        if (released) pageCalls.push("changed");
      },
      status: (text) => {
        if (released) pageCalls.push(["status", text]);
      },
      segment: () => {
        if (released) pageCalls.push("segment");
      },
    },
  });
  await f.controller.startPreview();
  await f.controller.observe();
  const audioCallback = f.worklet.port.onmessage;
  const pending = f.controller.flushAudio();
  released = true;
  await f.controller.release?.();
  assert.equal(f.controller.previewOpen, false);
  assert.equal(f.controller.recording, false);
  assert.equal(f.timers.size, 0);
  await pending;
  assert.equal(f.video.srcObject, null);
  assert.equal(f.worklet.port.onmessage, null);
  assert.equal(f.videoTrack.onended, null);
  for (const event of [
    "audio.disconnect",
    "worklet.disconnect",
    "port.close",
  ]) {
    assert.equal(
      f.events.filter((value) => value[0] === event).length,
      1,
      event,
    );
  }
  await f.controller.release();
  audioCallback({
    data: { type: "samples", samples: new Float32Array([1]), rms: 1 },
  });
  audioCallback({ data: { type: "flushed", id: "flush-1" } });
  f.recorders[0].onSegment("late", "image");
  await f.controller.startPreview();
  await f.controller.observe();
  await f.controller.flushAudio();
  await f.controller.checkpoint();
  assert.equal(f.recorders.length, 1);
  assert.equal(f.timers.size, 0);
  assert.deepEqual(f.samples, []);
  assert.deepEqual(pageCalls, []);
  assert.equal(f.events.filter((event) => event === "host.stop").length, 1);
  for (const event of ["video.stop", "audio.stop", "audio.close"]) {
    assert.equal(f.events.filter((value) => value === event).length, 1, event);
  }
});

test("release waits for a pending display acquisition and stops late tracks without attaching them", async () => {
  const display = deferred();
  const f = await fixture({ display: display.promise });
  const opening = f.controller.startPreview();
  await f.displayRequested.promise;
  let done = false;
  const release = f.controller.release().then(() => {
    done = true;
  });
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(done, false);
  display.resolve();
  await Promise.all([opening, release]);
  assert.equal(f.video.srcObject, null);
  assert.equal(f.controller.previewOpen, false);
  assert.equal(f.events.includes("video.play"), false);
  assert.equal(f.events.filter((event) => event === "host.stop").length, 0);
  assert.equal(f.events.filter((event) => event === "video.stop").length, 1);
  assert.equal(f.events.filter((event) => event === "audio.stop").length, 1);
});

test("release during audio setup closes the context without constructing a late worklet", async () => {
  const audioModule = deferred();
  const f = await fixture({ audioModule: audioModule.promise });
  const opening = f.controller.startPreview();
  await f.audioLoading.promise;
  const release = f.controller.release();
  audioModule.resolve();
  await Promise.all([opening, release]);
  assert.equal(
    f.events.some((event) => event[0] === "worklet"),
    false,
  );
  assert.equal(f.events.includes("audio.resume"), false);
  assert.equal(f.events.filter((event) => event === "audio.close").length, 1);
  assert.equal(f.video.srcObject, null);
  assert.equal(f.timers.size, 0);
});

test("stop during host opening waits for it and prevents a recorder from starting after release", async () => {
  const f = await fixture();
  await f.controller.startPreview();
  const opened = deferred(),
    requested = deferred();
  f.bridge.start = () => {
    requested.resolve();
    return opened.promise;
  };
  const observation = f.controller.observe();
  await requested.promise;
  const stopped = f.controller.stop();
  opened.resolve(f.session);
  await Promise.all([observation, stopped]);
  assert.equal(f.recorders.length, 0);
  assert.equal(f.events.filter((event) => event === "host.stop").length, 1);
  assert.equal(f.controller.previewOpen, false);
  assert.equal(f.controller.recording, false);
});

test("moment snapshots sample only the controller's current preview", async () => {
  const f = await fixture();
  f.video.videoWidth = 1280;
  assert.equal(f.controller.snapshot?.(), undefined);
  await f.controller.startPreview();
  const image = f.controller.snapshot?.();
  assert.equal(image, "data:image/jpeg;moment");
  assert.deepEqual(
    f.events.find((event) => event[0] === "snapshot"),
    ["snapshot", f.video, 0, 0, 320, 180],
  );
  assert.deepEqual(
    f.events.find((event) => event[0] === "snapshot.encoding"),
    ["snapshot.encoding", "image/jpeg", 0.7],
  );
  await f.controller.stop();
  assert.equal(f.controller.snapshot(), undefined);
});

test("a partially started recorder is stopped and capture is released even if the recorder refuses cleanup", async () => {
  const failure = new Error("recording start refused");
  const cleanupFailure = new Error("partial recorder refused stop");
  let flush;
  const f = await fixture({
    recorderStart: (recorder) => {
      flush = recorder.flushAudio();
      throw failure;
    },
    recorderStopError: cleanupFailure,
  });
  await f.controller.startPreview();
  await f.controller.observe();
  assert.deepEqual(f.errors, [
    { error: cleanupFailure, phase: "stop" },
    { error: failure, phase: "observe" },
  ]);
  await flush;
  assert.equal(f.controller.recording, false);
  assert.equal(f.controller.previewOpen, false);
  assert.equal(f.video.srcObject, null);
  assert.equal(f.worklet.port.onmessage, null);
  assert.equal(f.timers.size, 0);
  for (const event of [
    "recorder.stop",
    "host.stop",
    "video.stop",
    "audio.stop",
    "audio.close",
  ]) {
    assert.equal(f.events.filter((value) => value === event).length, 1, event);
  }
});

test("release returns the same promise and waits for audio context closure", async () => {
  const closing = deferred();
  const f = await fixture({ contextClose: closing.promise });
  await f.controller.startPreview();
  const first = f.controller.release?.();
  const second = f.controller.release?.();
  assert.equal(f.worklet.port.onmessage, null);
  assert.equal(first, second);
  let done = false;
  const release = Promise.resolve(first).then(() => {
    done = true;
  });
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(done, false);
  closing.resolve();
  await release;
  assert.equal(f.video.srcObject, null);
  assert.equal(f.events.filter((event) => event === "audio.close").length, 1);
});

test("release prevents the real recorder from restarting an anchored rotation whose audio flush is pending", async () => {
  const { RollingRecorder } = await import("../app/recording.js");
  const stopped = deferred(),
    media = [],
    timers = new Map();
  let now = 0,
    nextTimer = 0;
  class MediaRecorderStub {
    static isTypeSupported() {
      return true;
    }
    constructor() {
      this.state = "inactive";
      media.push(this);
    }
    start() {
      this.state = "recording";
    }
    stop() {
      this.state = "inactive";
      queueMicrotask(() => {
        this.ondataavailable({ data: new Blob(["clip"]) });
        this.onstop();
        stopped.resolve();
      });
    }
  }
  const drawing = {
    drawImage() {},
    getImageData: () => ({ data: new Uint8ClampedArray(64 * 36 * 4) }),
  };
  const env = {
    performance: { now: () => now },
    MediaRecorder: MediaRecorderStub,
    Blob,
    document: {
      createElement: () => ({
        getContext: () => drawing,
        toDataURL: () => "data:image/jpeg;frame",
      }),
    },
    setTimeout: (fn) => {
      const id = ++nextTimer;
      timers.set(id, fn);
      return id;
    },
    setInterval: (fn) => {
      const id = ++nextTimer;
      timers.set(id, fn);
      return id;
    },
    clearTimeout: (id) => timers.delete(id),
    clearInterval: (id) => timers.delete(id),
    ingest: async () => "moment-1",
  };
  const f = await fixture({
    recorderFactory: (options) => new RollingRecorder({ ...options, env }),
  });
  f.video.videoWidth = 1280;
  f.video.videoHeight = 720;
  f.context.sampleRate = 16000;
  await f.controller.startPreview();
  await f.controller.observe();
  now = 1000;
  const rotation = f.controller.checkpoint(1000);
  await stopped.promise;
  assert.equal(f.timers.size, 1);
  await Promise.all([f.controller.release(), rotation]);
  assert.equal(media.length, 1);
  assert.equal(timers.size, 0);
  assert.equal(f.timers.size, 0);
  assert.equal(f.controller.recording, false);
});

test("a late audio callback after stopping preview cannot update the page or create a flush timer", async () => {
  const f = await fixture();
  await f.controller.startPreview();
  await f.controller.observe();
  const callback = f.worklet.port.onmessage;
  await f.controller.stop();
  const meters = [...f.meters];
  callback({
    data: { type: "samples", samples: new Float32Array([1]), rms: 1 },
  });
  callback({ data: { type: "flushed", id: "flush-1" } });
  assert.deepEqual(f.meters, meters);
  assert.deepEqual(f.samples, []);
  assert.equal(f.timers.size, 0);
});

for (const path of [
  { name: "normal stop", run: (f) => f.controller.stop() },
  { name: "quiet stop", run: (f) => f.controller.stop({ quiet: true }) },
  { name: "track end", run: (f) => f.videoTrack.onended() },
  { name: "partial start", partial: true, run: (f) => f.controller.observe() },
]) {
  test(`shared capture cleanup drains a pending flush after ${path.name}`, async () => {
    const failure = Object.assign(new Error("recording start refused"), {
      code: "RECORDING_START_REFUSED",
    });
    const f = await fixture({
      recorderStart: path.partial
        ? () => {
            throw failure;
          }
        : undefined,
    });
    await f.controller.startPreview();
    if (!path.partial) await f.controller.observe();
    const audioCallback = f.worklet.port.onmessage;
    let flushed = false;
    const flush = f.controller.flushAudio().then(() => {
      flushed = true;
    });
    assert.equal(f.timers.size, 1);
    assert.equal(flushed, false);
    await path.run(f);
    assert.equal(f.events.filter((event) => event === "host.stop").length, 1);
    for (const event of ["video.stop", "audio.stop", "audio.close"]) {
      assert.equal(
        f.events.filter((value) => value === event).length,
        1,
        event,
      );
    }
    assert.equal(f.controller.recording, false);
    assert.equal(f.controller.previewOpen, false);
    assert.equal(f.video.srcObject, null);
    assert.equal(f.videoTrack.onended, null);
    assert.equal(f.worklet.port.onmessage, null);
    assert.equal(f.timers.size, 0);
    await flush;
    assert.equal(flushed, true);
    for (const event of [
      "audio.disconnect",
      "worklet.disconnect",
      "port.close",
    ]) {
      assert.equal(
        f.events.filter((value) => value[0] === event).length,
        1,
        event,
      );
    }
    const meters = [...f.meters];
    audioCallback({
      data: { type: "samples", samples: new Float32Array([1]), rms: 1 },
    });
    audioCallback({ data: { type: "flushed", id: "flush-1" } });
    assert.deepEqual(f.meters, meters);
    assert.deepEqual(f.samples, []);
    assert.equal(f.timers.size, 0);
    assert.deepEqual(
      f.errors,
      path.partial ? [{ error: failure, phase: "observe" }] : [],
    );
  });
}

for (const preview of [false, true]) {
  test(`release leaves an unowned host untouched with ${preview ? "preview only" : "an idle page"}`, async () => {
    const f = await fixture();
    if (preview) await f.controller.startPreview();
    await f.controller.release();
    await f.controller.release();
    assert.equal(f.events.filter((event) => event === "host.stop").length, 0);
    assert.equal(f.controller.previewOpen, false);
    assert.equal(f.video.srcObject, null);
    assert.equal(f.timers.size, 0);
    if (preview) {
      assert.equal(f.worklet.port.onmessage, null);
      for (const event of ["video.stop", "audio.stop", "audio.close"]) {
        assert.equal(
          f.events.filter((value) => value === event).length,
          1,
          event,
        );
      }
    }
  });
}

test("release of an observation still opening waits for the host and pauses its capture once", async () => {
  const f = await fixture(),
    opened = deferred(),
    requested = deferred();
  await f.controller.startPreview();
  f.bridge.start = () => {
    requested.resolve();
    return opened.promise;
  };
  const observation = f.controller.observe();
  await requested.promise;
  const released = f.controller.release();
  assert.equal(f.events.filter((event) => event === "host.stop").length, 0);
  opened.resolve(f.session);
  await Promise.all([observation, released]);
  assert.equal(f.events.filter((event) => event === "host.stop").length, 1);
  assert.equal(f.recorders.length, 0);
  assert.equal(f.controller.previewOpen, false);
  assert.equal(f.video.srcObject, null);
  assert.equal(f.timers.size, 0);
});

test("release retries a host pause that was refused after its recorder stopped", async () => {
  const f = await fixture();
  const failure = Object.assign(new Error("host stop refused"), {
    code: "HOST_STOP_REFUSED",
  });
  let calls = 0;
  f.bridge.stop = async () => {
    if (++calls === 1) throw failure;
  };
  await f.controller.startPreview();
  await f.controller.observe();
  await assert.rejects(f.controller.stop(), (error) => error === failure);
  assert.equal(f.controller.recording, false);
  assert.equal(f.controller.previewOpen, true);
  await f.controller.release();
  await f.controller.release();
  assert.equal(calls, 2);
  assert.equal(f.controller.previewOpen, false);
  assert.equal(f.video.srcObject, null);
});

test("release after a completed pause does not pause the host a second time", async () => {
  const f = await fixture();
  await f.controller.startPreview();
  await f.controller.observe();
  await f.controller.stop();
  await f.controller.release();
  assert.equal(f.events.filter((event) => event === "host.stop").length, 1);
  assert.equal(f.controller.previewOpen, false);
  assert.equal(f.controller.recording, false);
});
