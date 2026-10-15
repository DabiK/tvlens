const AUDIO_SAMPLE_RATE = 16000;
const AUDIO_FLUSH_TIMEOUT_MS = 500;
const METER_GAIN = 4;

// All effects come from the composition; importing this module never touches the page or browser APIs.
export function createCaptureController(dependencies) {
  return new CaptureController(dependencies);
}

class CaptureController {
  #stream;
  #context;
  #worklet;
  #recorder;
  #observing;
  #stopTask;
  #flushes = new Map();

  constructor({
    bridge,
    selectSource,
    source,
    browser,
    createRecorder,
    timers,
    uuid,
    video,
    session,
    view,
  }) {
    Object.assign(this, {
      bridge,
      selectSource,
      source,
      browser,
      createRecorder,
      timers,
      uuid,
      video,
      session,
      view,
    });
  }

  get previewOpen() {
    return Boolean(this.#stream);
  }

  // Checkpoints and unload still use these references until all renderer commands migrate.
  get stream() {
    return this.#stream;
  }

  get recorder() {
    return this.#recorder;
  }

  get recording() {
    return Boolean(this.#recorder);
  }

  get stopping() {
    return Boolean(this.#stopTask);
  }

  stop(options = {}) {
    if (!this.#stopTask) {
      this.#stopTask = Promise.resolve()
        .then(() => this.#stop(options))
        .catch((error) => {
          // Restore preview controls so Stop can be retried after a recorder refusal.
          // This re-enabling is new; the shell still hides Stop after a host refusal.
          this.view.preview(this.previewOpen);
          throw error;
        })
        .finally(() => {
          this.#stopTask = undefined;
          this.view.changed();
          this.view.settled();
        });
      this.view.stopping();
      this.view.changed();
    }
    return this.#stopTask;
  }

  async #stop({ quiet = false }) {
    // A host-initiated pause must not report the last refused partial passage a second time.
    if (quiet && this.#recorder) this.#recorder.onError = () => {};
    await this.#recorder?.stop();
    this.#recorder = undefined;
    await this.bridge.stop();
    await this.#releasePreview();
    this.view.stopped();
    this.view.status(
      this.session()?.id
        ? "Capture en pause · Contexte et chat conservés"
        : "Capture inactive",
    );
  }

  async #releasePreview() {
    const stream = this.#stream;
    this.#stream = undefined;
    stream?.getTracks().forEach((track) => {
      track.onended = null;
      track.stop();
    });
    try {
      await this.#context?.close();
    } finally {
      this.#context = undefined;
      if (this.#worklet) this.#worklet.port.onmessage = null;
      this.#worklet = undefined;
      for (const complete of this.#flushes.values()) complete();
      this.video.srcObject = null;
      this.view.meter(0);
      this.view.preview(false);
    }
  }

  observe() {
    if (this.#recorder) return Promise.resolve();
    if (!this.#observing)
      this.#observing = this.#observe().finally(() => {
        this.#observing = undefined;
      });
    return this.#observing;
  }

  async openCapture() {
    if (!this.session()?.readOnly) return this.bridge.start();
    const resumed = await this.bridge.resumeSession();
    return (await this.bridge.state())?.accepting
      ? resumed
      : this.bridge.start();
  }

  async #observe() {
    this.view.observing();
    try {
      const session = await this.openCapture();
      this.view.state(await this.bridge.state());
      this.#recorder = this.createRecorder({
        stream: this.#stream,
        video: this.video,
        audioContext: this.#context,
        flushAudio: () => this.flushAudio(),
        session,
        onError: (error) => this.view.error(error, "recorder"),
        onSegment: (id, preview) => this.view.segment(id, preview, session),
      });
      this.#recorder.start();
      this.view.recording();
      this.view.status("Capture + mémoire actives");
      this.view.settled();
    } catch (error) {
      this.#recorder = undefined;
      await this.bridge.stop().catch((cause) => this.view.error(cause, "stop"));
      this.view.error(error, "observe");
    } finally {
      this.view.changed();
    }
  }

  flushAudio() {
    if (!this.#worklet) return Promise.resolve();
    return new Promise((resolve) => {
      const id = this.uuid();
      const complete = () => {
        this.timers.clearTimeout(timeout);
        this.#flushes.delete(id);
        resolve();
      };
      const timeout = this.timers.setTimeout(complete, AUDIO_FLUSH_TIMEOUT_MS);
      this.#flushes.set(id, complete);
      this.#worklet.port.postMessage({ type: "flush", id });
    });
  }

  async startPreview() {
    this.view.previewStarting();
    try {
      return await this.#startPreview();
    } catch (error) {
      await this.stop().catch(async (cause) => {
        // A failed acquisition has no usable preview to retain, even if the host refuses the pause.
        await this.#releasePreview();
        this.view.error(cause, "stop");
      });
      this.view.error(error, "preview");
      return false;
    }
  }

  async #startPreview() {
    await this.selectSource(this.source());
    this.#stream = await this.browser.getDisplayMedia({
      video: { frameRate: 10, width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: true,
    });
    this.video.srcObject = this.#stream;
    await this.video.play();
    this.view.preview(true);
    this.#stream.getVideoTracks()[0].onended = () =>
      this.stop().catch((error) => this.view.error(error, "stop"));
    const tracks = this.#stream
      .getAudioTracks()
      .filter((track) => track.readyState === "live");
    this.view.status(
      tracks.length
        ? "Aperçu actif · Vérifie le son"
        : "Aperçu actif · Sans piste audio",
    );
    if (tracks.length) await this.#connectAudio(tracks);
    this.view.changed();
    return true;
  }

  async #connectAudio(tracks) {
    this.#context = this.browser.createAudioContext({
      sampleRate: AUDIO_SAMPLE_RATE,
    });
    await this.#context.audioWorklet.addModule("./audio-worklet.js");
    await this.#context.resume();
    this.#worklet = this.browser.createWorkletNode(this.#context, "tvlens-pcm");
    this.#context
      .createMediaStreamSource(this.browser.createMediaStream(tracks))
      .connect(this.#worklet);
    // The worklet emits silence, so connecting its output cannot feed captured sound back into the source.
    this.#worklet.connect(this.#context.destination);
    this.#worklet.port.onmessage = ({ data }) => {
      if (data.type === "samples") {
        this.view.meter(Math.min(1, data.rms * METER_GAIN));
        this.#recorder?.samples(data.samples);
      }
      if (data.type === "flushed") this.#flushes.get(data.id)?.();
    };
  }
}
