const AUDIO_SAMPLE_RATE = 16000;
const AUDIO_FLUSH_TIMEOUT_MS = 500;
const METER_GAIN = 4;
const SNAPSHOT_WIDTH = 320;
const SNAPSHOT_HEIGHT = 180;
const SNAPSHOT_QUALITY = 0.7;

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
  #previewing;
  #generation = 0;
  #pending = new Set();
  #audioSource;
  #released = false;
  #releaseTask;
  #stopTask;
  #hostCapture = false;
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

  get recording() {
    return Boolean(this.#recorder);
  }

  get stopping() {
    return Boolean(this.#stopTask);
  }

  checkpoint(anchorMs) {
    if (this.#released) return Promise.resolve();
    return this.#recorder?.checkpoint(anchorMs) || Promise.resolve();
  }

  snapshot() {
    if (this.#released || !this.#stream || !this.video.videoWidth) return;
    const canvas = this.browser.createCanvas();
    canvas.width = SNAPSHOT_WIDTH;
    canvas.height = SNAPSHOT_HEIGHT;
    canvas
      .getContext("2d")
      .drawImage(this.video, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", SNAPSHOT_QUALITY);
  }

  #notify(name, ...args) {
    if (!this.#released) this.view[name](...args);
  }

  release() {
    if (!this.#releaseTask) {
      this.#released = true;
      // Stop synchronously marks the recorder inactive before resolving any pending audio flush.
      this.#releaseTask = this.stop({
        quiet: true,
        force: true,
        stopHost: this.#hostCapture,
      });
      this.#detachAudio();
    }
    return this.#releaseTask;
  }

  stop(options = {}) {
    if (!this.#stopTask) {
      this.#generation++;
      this.#stopTask = this.#stop(options)
        .catch((error) => {
          // Restore preview controls so Stop can be retried after a recorder refusal.
          // This re-enabling is new; the shell still hides Stop after a host refusal.
          this.#notify("preview", this.previewOpen);
          throw error;
        })
        .finally(() => {
          this.#stopTask = undefined;
          this.#notify("changed");
          this.#notify("settled");
        });
      this.#notify("stopping");
      this.#notify("changed");
    }
    return this.#stopTask;
  }

  #mustRelease(force) {
    return force || this.#released;
  }

  async #stop({ quiet = false, force = false, stopHost = true }) {
    // A host-initiated pause must not report the last refused partial passage a second time.
    if (quiet && this.#recorder) this.#recorder.onError = () => {};
    let failure;
    try {
      await this.#recorder?.stop();
    } catch (error) {
      if (!this.#mustRelease(force)) throw error;
      failure = error;
    }
    await Promise.allSettled([...this.#pending]);
    this.#recorder = undefined;
    try {
      if (stopHost) {
        await this.bridge.stop();
        this.#hostCapture = false;
      }
    } catch (error) {
      if (!this.#mustRelease(force)) throw error;
      failure ||= error;
    }
    await this.#releasePreview();
    if (failure) throw failure;
    this.#announceStopped();
  }

  #announceStopped() {
    this.#notify("stopped");
    this.#notify(
      "status",
      this.session()?.id
        ? "Capture en pause · Contexte et chat conservés"
        : "Capture inactive",
    );
  }

  #detachAudio() {
    if (this.#worklet) this.#worklet.port.onmessage = null;
    for (const complete of this.#flushes.values()) complete();
  }

  async #releasePreview() {
    this.#detachAudio();
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
      this.#audioSource?.disconnect?.();
      this.#audioSource = undefined;
      this.#worklet?.disconnect?.();
      this.#worklet?.port.close?.();
      this.#worklet = undefined;
      for (const complete of this.#flushes.values()) complete();
      this.video.srcObject = null;
      this.#notify("meter", 0);
      this.#notify("preview", false);
    }
  }

  #current(generation) {
    return !this.#released && generation === this.#generation;
  }

  async #runStartup(start, phase) {
    const task = start();
    this.#pending.add(task);
    try {
      return await task;
    } catch (error) {
      this.#pending.delete(task);
      await this.stop({ force: true }).catch((cause) =>
        this.#notify("error", cause, "stop"),
      );
      this.#notify("error", error, phase);
      return false;
    } finally {
      this.#pending.delete(task);
      this.#notify("changed");
    }
  }

  observe() {
    if (this.#released || this.stopping || this.#recorder)
      return Promise.resolve();
    if (!this.#observing) {
      const generation = this.#generation;
      this.#observing = this.#runStartup(
        () => this.#observe(generation),
        "observe",
      ).finally(() => {
        this.#observing = undefined;
      });
    }
    return this.#observing;
  }

  async #openCapture(generation) {
    if (!this.session()?.readOnly) return this.bridge.start();
    const resumed = await this.bridge.resumeSession();
    if (!this.#current(generation)) return;
    const state = await this.bridge.state();
    if (!this.#current(generation)) return;
    return state?.accepting ? resumed : this.bridge.start();
  }

  async #observe(generation) {
    this.#notify("observing");
    // Keep ownership until pause succeeds, including an opening or pause still in flight.
    this.#hostCapture = true;
    const session = await this.#openCapture(generation);
    if (!this.#current(generation)) return false;
    const state = await this.bridge.state();
    if (!this.#current(generation)) return false;
    this.#notify("state", state);
    if (!this.#current(generation)) return false;
    this.#recorder = this.createRecorder({
      stream: this.#stream,
      video: this.video,
      audioContext: this.#context,
      flushAudio: () => this.flushAudio(),
      session,
      onError: (error) => this.#notify("error", error, "recorder"),
      onSegment: (id, preview) => this.#notify("segment", id, preview, session),
    });
    this.#recorder.start();
    this.#notify("recording");
    this.#notify("status", "Capture + mémoire actives");
    this.#notify("settled");
  }

  flushAudio() {
    if (this.#released || !this.#worklet) return Promise.resolve();
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

  startPreview() {
    if (this.#released || this.stopping) return Promise.resolve(false);
    if (this.#previewing) return this.#previewing;
    if (this.#stream) return Promise.resolve(true);
    this.#notify("previewStarting");
    const generation = this.#generation;
    this.#previewing = this.#runStartup(
      () => this.#startPreview(generation),
      "preview",
    ).finally(() => {
      this.#previewing = undefined;
    });
    return this.#previewing;
  }

  async #startPreview(generation) {
    await this.selectSource(this.source());
    if (!this.#current(generation)) return false;
    this.#stream = await this.browser.getDisplayMedia({
      video: { frameRate: 10, width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: true,
    });
    if (!this.#current(generation)) return false;
    this.video.srcObject = this.#stream;
    await this.video.play();
    if (!this.#current(generation)) return false;
    this.#notify("preview", true);
    this.#stream.getVideoTracks()[0].onended = () =>
      this.stop().catch((error) => this.#notify("error", error, "stop"));
    const tracks = this.#stream
      .getAudioTracks()
      .filter((track) => track.readyState === "live");
    this.#notify(
      "status",
      tracks.length
        ? "Aperçu actif · Vérifie le son"
        : "Aperçu actif · Sans piste audio",
    );
    if (tracks.length) await this.#connectAudio(tracks, generation);
    if (!this.#current(generation)) return false;
    this.#notify("changed");
    return true;
  }

  async #connectAudio(tracks, generation) {
    this.#context = this.browser.createAudioContext({
      sampleRate: AUDIO_SAMPLE_RATE,
    });
    await this.#context.audioWorklet.addModule("./audio-worklet.js");
    if (!this.#current(generation)) return;
    await this.#context.resume();
    if (!this.#current(generation)) return;
    this.#worklet = this.browser.createWorkletNode(this.#context, "tvlens-pcm");
    this.#audioSource = this.#context.createMediaStreamSource(
      this.browser.createMediaStream(tracks),
    );
    this.#audioSource.connect(this.#worklet);
    // The worklet emits silence, so connecting its output cannot feed captured sound back into the source.
    this.#worklet.connect(this.#context.destination);
    const worklet = this.#worklet;
    this.#worklet.port.onmessage = ({ data }) => {
      if (this.#released || !this.#stream || this.#worklet !== worklet) return;
      if (data.type === "samples") {
        this.#notify("meter", Math.min(1, data.rms * METER_GAIN));
        this.#recorder?.samples(data.samples);
      }
      if (data.type === "flushed") this.#flushes.get(data.id)?.();
    };
  }
}
