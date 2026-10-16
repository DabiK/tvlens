const { RECORDER_SEGMENT_MS } = require("./latency-fixture.cjs");

async function createCapture({ env, session, ingest, record }) {
  const { createCaptureController } =
    await import("../app/ui/capture-controller.mjs");
  const { RollingRecorder } = await import("../app/recording.js");
  const { io } = env;
  const recorderEnv = createRecorderEnvironment(io, record);
  const { browser, worklet } = createBrowser();
  const canvas = () => ({
    getContext: () => ({
      drawImage() {},
      getImageData: () => ({ data: new Uint8ClampedArray(64 * 36 * 4) }),
    }),
    toDataURL: () => "data:image/jpeg;base64,c2ltdWxl",
  });
  const controller = createCaptureController({
    bridge: {
      start: async () => ({
        id: session.id,
        elapsedMs: io.now(),
        segmentMs: RECORDER_SEGMENT_MS,
      }),
      state: async () => session.snapshot(),
      stop: () => session.stop(),
    },
    selectSource: async () => {},
    source: () => "simulated",
    browser,
    timers: { setTimeout: io.setTimer, clearTimeout: io.clearTimer },
    uuid: () => "flush-1",
    video: { videoWidth: 1280, videoHeight: 720, play: async () => {} },
    session: () => session.snapshot(),
    view: new Proxy({}, { get: () => () => {} }),
    createRecorder: (options) => {
      const recorder = new RollingRecorder({
        ...options,
        env: {
          performance: { now: io.now },
          document: { createElement: canvas },
          ...recorderEnv,
          ingest,
          setTimeout: io.setTimer,
          clearTimeout: io.clearTimer,
        },
      });
      // Le navigateur simulé remet un échantillon au même port que le worklet réel.
      const start = recorder.start.bind(recorder);
      recorder.start = () => {
        start();
        worklet.port.onmessage({
          data: { type: "samples", samples: new Float32Array([0.1]), rms: 0.1 },
        });
      };
      return recorder;
    },
  });
  return controller;
}
function createRecorderEnvironment(io, record) {
  const intervals = new Map();
  let sequence = 0;
  const setInterval = (fn, ms) => {
    const id = ++sequence;
    const fire = () => {
      fn();
      if (intervals.has(id)) intervals.set(id, io.setTimer(fire, ms));
    };
    intervals.set(id, io.setTimer(fire, ms));
    return id;
  };
  const clearInterval = (id) => {
    io.clearTimer(intervals.get(id));
    intervals.delete(id);
  };
  class Recorder {
    static isTypeSupported() {
      return true;
    }
    start() {
      this.state = "recording";
    }
    stop() {
      this.state = "inactive";
      record("capture.closed", "session", io.now());
      queueMicrotask(() => {
        this.ondataavailable({ data: { size: 4 } });
        this.onstop();
      });
    }
  }
  class MediaBlob {
    async arrayBuffer() {
      return new Uint8Array([1, 2, 3, 4]).buffer;
    }
  }
  return {
    MediaRecorder: Recorder,
    Blob: MediaBlob,
    setInterval,
    clearInterval,
  };
}
function createBrowser() {
  const track = {
    readyState: "live",
    stop() {
      this.readyState = "ended";
    },
  };
  const audioTrack = {
    readyState: "live",
    stop() {
      this.readyState = "ended";
    },
  };
  const stream = {
    getTracks: () => [track, audioTrack],
    getVideoTracks: () => [track],
    getAudioTracks: () => [audioTrack],
  };
  const worklet = {
    connect() {},
    disconnect() {},
    port: {
      close() {},
      postMessage: ({ id }) =>
        queueMicrotask(() =>
          worklet.port.onmessage?.({ data: { type: "flushed", id } }),
        ),
    },
  };
  const browser = {
    getDisplayMedia: async () => stream,
    createMediaStream: () => stream,
    createAudioContext: () => ({
      sampleRate: 16000,
      audioWorklet: { addModule: async () => {} },
      resume: async () => {},
      close: async () => {},
      createMediaStreamSource: () => ({ connect() {}, disconnect() {} }),
    }),
    createWorkletNode: () => worklet,
  };
  return { browser, worklet };
}
module.exports = { createCapture };
