import { createCaptureController } from "./capture-controller.mjs";
import { RollingRecorder } from "../recording.js";

export function createBrowserCaptureController(
  options,
  environment = globalThis,
) {
  const timers = {
    setTimeout: (callback, delay) => environment.setTimeout(callback, delay),
    clearTimeout: (id) => environment.clearTimeout(id),
    setInterval: (callback, delay) => environment.setInterval(callback, delay),
    clearInterval: (id) => environment.clearInterval(id),
  };
  return createCaptureController({
    selectSource: (id) => environment.window.capture.select(id),
    browser: {
      getDisplayMedia: (options) =>
        environment.navigator.mediaDevices.getDisplayMedia(options),
      createAudioContext: (options) => new environment.AudioContext(options),
      createWorkletNode: (context, name) =>
        new environment.AudioWorkletNode(context, name),
      createMediaStream: (tracks) => new environment.MediaStream(tracks),
      createCanvas: () => environment.document.createElement("canvas"),
    },
    createRecorder: (capture) =>
      new RollingRecorder({
        ...capture,
        env: {
          ...timers,
          performance: environment.performance,
          document: environment.document,
          MediaRecorder: environment.MediaRecorder,
          Blob: environment.Blob,
          ingest: (passage) => options.bridge.ingest(passage),
        },
      }),
    timers,
    uuid: () => environment.crypto.randomUUID(),
    ...options,
  });
}
