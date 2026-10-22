import { cleanError } from "./text.mjs";
import { describeArchive } from "./sessions-view.mjs";
import { describeSourceListing } from "./source-menu.mjs";

export function bindCaptureActions(dependencies) {
  return new CaptureActions(dependencies);
}

class CaptureActions {
  busy = false;
  pendingCapture = null;
  sourceReturnExpanded = false;

  constructor(dependencies) {
    Object.assign(this, dependencies);
    this.bind();
  }

  bind() {
    this.get("start").onclick = () => this.capture.startPreview();
    this.get("observe").onclick = () =>
      this.requestCapture(() => this.watchWithSelectedSource());
    this.get("stop").onclick = () =>
      this.capture.stop().catch((error) => this.notice(cleanError(error)));
    this.get("float-record").onclick = () => this.toggleRecording();
    this.get("float-source-change").onclick = async () => {
      await this.capture.stop();
      this.showDirect();
      await this.changeWindowMode(false);
      this.get("source").focus();
    };
    this.get("float-refresh").onclick = () => this.refreshFloatingSources();
    this.get("close-float-source").onclick = () =>
      this.get("float-source-dialog").close();
    this.get("float-source-dialog").onclose = () => {
      if (this.mode().floating)
        this.changeWindowMode(true, this.sourceReturnExpanded);
    };
    this.get("float-source-dialog").oncancel = (event) => {
      if (this.busy) event.preventDefault();
    };
    this.get("float-source-form").onsubmit = (event) =>
      this.launchFloating(event);
    this.get("archive-resume").onclick = () =>
      this.requestCapture(() => this.captureFromArchive());
    this.get("cancel-resume-session").onclick = () => {
      this.pendingCapture = null;
      this.get("resume-session-dialog").close();
    };
    this.get("confirm-resume-session").onclick = () => this.confirmResume();
    this.window.addEventListener("beforeunload", () =>
      this.capture.release().catch((error) => this.window.reportError(error)),
    );
  }

  openArchive(run) {
    if (this.capture.recording || this.capture.previewOpen) {
      return this.notice(
        "Mets la capture en pause avant d’ouvrir une autre session.",
      );
    }
    return run();
  }

  pauseIfUnavailable({ accepting, blocked }) {
    if (!this.capture.recording || this.capture.stopping) return;
    if (accepting !== false && !blocked) return;
    return this.capture
      .stop({ quiet: true })
      .catch((error) => this.notice(cleanError(error)));
  }

  async toggleRecording() {
    if (this.busy || this.capture.stopping) return;
    if (!this.capture.recording)
      return this.requestCapture(() => this.captureFromFloatingBar());
    this.busy = true;
    this.changed();
    try {
      await this.capture.stop();
    } catch (error) {
      this.notice(cleanError(error));
    } finally {
      this.busy = false;
      this.changed();
    }
  }

  async confirmResume() {
    const run = this.pendingCapture;
    this.pendingCapture = null;
    this.get("resume-session-dialog").close();
    try {
      await run?.();
    } catch (error) {
      this.notice(cleanError(error));
    }
  }

  async launchFloating(event) {
    event.preventDefault();
    if (this.busy || !this.configuration()?.canObserve) return;
    this.busy = true;
    this.changed();
    this.get("float-launch").disabled = true;
    this.get("close-float-source").disabled = true;
    this.get("float-refresh").disabled = true;
    this.get("float-source-error").textContent = "Démarrage…";
    try {
      if (!this.capture.previewOpen) {
        this.get("source").value = this.get("float-source").value;
        if (!(await this.capture.startPreview()))
          throw Error(this.get("state").textContent);
      }
      await this.capture.observe();
      if (!this.capture.recording)
        throw Error(
          this.get("notice").textContent || "L’observation n’a pas démarré.",
        );
      this.get("float-source-dialog").close();
    } catch (error) {
      this.get("float-source-error").textContent = cleanError(error);
    } finally {
      this.busy = false;
      this.get("float-launch").disabled = false;
      this.get("close-float-source").disabled = false;
      this.get("float-refresh").disabled = false;
      this.changed();
    }
  }

  async watchWithSelectedSource() {
    if (this.busy || this.capture.stopping || this.capture.recording) return;
    this.busy = true;
    this.changed();
    this.notice("");
    try {
      if (!this.capture.previewOpen && !(await this.capture.startPreview()))
        throw Error(this.get("state").textContent);
      await this.capture.observe();
      if (!this.capture.recording)
        throw Error(
          this.get("notice").textContent || "L’observation n’a pas démarré.",
        );
    } catch (error) {
      this.notice(cleanError(error));
    } finally {
      this.busy = false;
      this.changed();
    }
  }

  async refreshFloatingSources() {
    this.get("float-refresh").disabled = true;
    this.get("float-launch").disabled = true;
    this.get("float-source-error").textContent = "";
    try {
      const result = await this.sources();
      this.get("float-source").replaceChildren(
        ...result.sources.map((s) => new this.window.Option(s.name, s.id)),
      );
      this.setSources(result);
      if (this.get("source").value)
        this.get("float-source").value = this.get("source").value;
      if (!result.sources.length)
        this.get("float-source-error").textContent =
          "Aucune source disponible. Vérifie les autorisations de capture dans le mode complet.";
      this.get("float-launch").disabled =
        !result.sources.length || !this.configuration()?.canObserve;
      if (!this.configuration()?.canObserve)
        this.get("float-source-error").textContent =
          "Connecte ton compte Codex avant de lancer l’analyse.";
    } catch (e) {
      this.get("float-source-error").textContent = describeSourceListing({
        error: e,
      }).notice;
    } finally {
      this.get("float-refresh").disabled = false;
    }
  }

  async captureFromFloatingBar() {
    const previousSource = this.get("source").value;
    this.busy = true;
    this.changed();
    try {
      await this.refresh();
    } finally {
      this.busy = false;
      this.changed();
    }
    if (
      previousSource &&
      !Array.from(this.get("source").options).some(
        (option) => option.value === previousSource,
      )
    )
      this.get("source").value = "";
    if (this.get("source").value) {
      await this.watchWithSelectedSource();
      return;
    }
    this.sourceReturnExpanded = this.mode().expanded;
    await this.changeWindowMode(true, true);
    this.get("float-source-dialog").showModal();
    if (this.capture.previewOpen) {
      this.get("float-source").replaceChildren(
        new this.window.Option(
          this.get("source").selectedOptions[0]?.textContent ||
            "Source actuelle",
          this.get("source").value,
        ),
      );
      this.get("float-source").disabled = true;
      this.get("float-refresh").hidden = true;
      this.get("float-launch").disabled = !this.configuration()?.canObserve;
      this.get("float-source-error").textContent = this.configuration()
        ?.canObserve
        ? ""
        : "Connecte ton compte Codex dans le mode complet.";
    } else {
      this.get("float-source").disabled = false;
      this.get("float-refresh").hidden = false;
      await this.refreshFloatingSources();
    }
  }

  async requestCapture(run) {
    if (!this.session()?.readOnly) return run();
    this.get("resume-session-text").textContent = describeArchive(
      this.session(),
    ).resumeText;
    this.get("resume-session-error").textContent = "";
    this.pendingCapture = run;
    if (this.mode().floating && !this.mode().expanded)
      await this.changeWindowMode(true, true, { focus: false });
    if (!this.get("resume-session-dialog").open)
      this.get("resume-session-dialog").showModal();
  }

  async captureFromArchive() {
    if (this.mode().floating) return this.captureFromFloatingBar();
    this.showDirect();
    if (!this.get("source").value) {
      this.notice(
        "Choisis d’abord la fenêtre ou l’écran à regarder, puis reprends la capture.",
      );
      this.get("source").focus();
      return;
    }
    await this.watchWithSelectedSource();
  }
}
