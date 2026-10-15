import { cleanError } from "./text.mjs";
import { formatTime } from "./format.js";

export function bindMomentActions(dependencies) {
  return new MomentActions(dependencies);
}

class MomentActions {
  busy = false;
  selectedMoment = null;
  checkpoint = Promise.resolve();

  constructor(dependencies) {
    Object.assign(this, dependencies);
    this.bind();
  }

  bind() {
    this.get("float-explain").onclick = this.get("explain-moment").onclick =
      () => this.explainNow();
    this.get("close-moment").onclick = () => this.get("moment-dialog").close();
    this.get("moment-summarize").onclick = () => this.submitMoment("summarize");
    this.get("moment-explain").onclick = () => this.submitMoment("explain");
    this.get("moment-question-form").onsubmit = (event) => {
      event.preventDefault();
      if (this.get("moment-question").value.trim())
        this.submitMoment("explain", this.get("moment-question").value.trim());
    };
    this.bridge.onExplainMoment((frozen) => this.openMoment(frozen));
    this.get("catch-up").onclick = () => this.catchUp();
    this.get("mark-attention").onclick = () => this.markAttention();
    this.bridge
      .momentShortcuts()
      .then((value) => {
        const title = value.explainShortcutRegistered
          ? "Explique cet instant · Ctrl/Cmd + Maj + E"
          : "Explique cet instant · raccourci global indisponible, utilise ce bouton";
        this.get("float-explain").title = this.get("explain-moment").title =
          title;
      })
      .catch(() => {
        // The optional shortcut hint leaves the button usable when settings cannot be read.
      });
  }

  reset() {
    this.selectedMoment = null;
  }

  async catchUp() {
    if (this.busy) return;
    this.busy = true;
    this.changed();
    this.notice("");
    try {
      const frozen = await this.bridge.freezeMoment({ kind: "catch-up" });
      this.get("attention-status").textContent =
        `Je retrouve les passages de ${formatTime(frozen.startMs)} à ${formatTime(frozen.anchorMs)}…`;
      await this.capture.checkpoint(frozen.anchorMs);
      this.forceBottom();
      const result = await this.bridge.catchUp({ token: frozen.token });
      this.get("attention-status").textContent =
        `Rattrapage demandé : ${formatTime(result.startMs)}–${formatTime(result.endMs)}. ` +
        "Le repère avance après une réponse réussie.";
    } catch (error) {
      this.notice(cleanError(error));
    } finally {
      this.busy = false;
      this.changed();
    }
  }

  async markAttention() {
    if (this.busy) return;
    this.busy = true;
    this.changed();
    try {
      await this.capture.checkpoint();
      const marker = await this.bridge.markAttention();
      this.get("attention-status").textContent =
        `Tu reprends ici : ${formatTime(marker.atMs)}. Le prochain rattrapage partira de ce repère.`;
    } catch (error) {
      this.notice(cleanError(error));
    } finally {
      this.busy = false;
      this.changed();
    }
  }
  async openMoment(frozen) {
    if (this.busy || !this.session()?.id) return;
    this.busy = true;
    this.changed();
    this.notice("");
    try {
      this.selectedMoment =
        frozen || (await this.bridge.freezeMoment({ kind: "explain" }));
      const preview = this.get("moment-preview");
      preview.hidden = true;
      const image = this.capture.snapshot();
      if (image) {
        preview.src = image;
        preview.hidden = false;
      }
      if (this.mode().floating) await this.changeWindowMode(true, true);
      const captureNote = this.capture.recording
        ? "La vidéo continue."
        : "La capture est en pause.";
      this.get("moment-anchor").textContent =
        `Instant retenu à ${formatTime(this.selectedMoment.anchorMs)}. ${captureNote}`;
      this.get("moment-error").textContent = "";
      this.get("moment-question").value = "";
      if (!this.get("moment-dialog").open)
        this.get("moment-dialog").showModal();
      this.checkpoint = this.capture.checkpoint(this.selectedMoment.anchorMs);
      await this.checkpoint;
    } catch (error) {
      this.notice(cleanError(error));
      this.get("moment-error").textContent = cleanError(error);
    } finally {
      this.busy = false;
      this.changed();
    }
  }
  async submitMoment(intent, question) {
    if (!this.selectedMoment || this.busy) return;
    this.busy = true;
    this.changed();
    try {
      await this.checkpoint;
      await this.bridge.explainMoment({
        token: this.selectedMoment.token,
        intent,
        question,
      });
      this.get("moment-dialog").close();
      if (this.mode().floating) await this.changeWindowMode(true, true);
    } catch (error) {
      this.get("moment-error").textContent = cleanError(error);
    } finally {
      this.busy = false;
      this.changed();
    }
  }
  async explainNow() {
    if (this.busy || !this.session()?.id) return;
    this.busy = true;
    this.changed();
    this.notice("");
    try {
      const frozen = await this.bridge.freezeMoment({ kind: "explain" });
      if (this.mode().floating) await this.changeWindowMode(true, true);
      await this.capture.checkpoint(frozen.anchorMs);
      this.forceBottom();
      await this.bridge.explainMoment({
        token: frozen.token,
        intent: "explain",
      });
    } catch (error) {
      this.notice(cleanError(error));
    } finally {
      this.busy = false;
      this.changed();
    }
  }
}
