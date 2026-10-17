import { element as el, formatTime } from "./format.js";
import { createSearchController } from "./search-controller.mjs";
import { replayTarget } from "./search-view.mjs";
import {
  claimFrom,
  withoutVerifyPrefix,
  deepenRequest,
} from "./chat-requests.mjs";
import { cleanError, plural, agreeText } from "./text.mjs";
import { mediaNote } from "./sessions-view.mjs";

const REPLAY_END_MARGIN_SECONDS = 0.1;

// Les callbacks lisent l'état ouvert au moment de l'action ; les cartes de recherche conservent leur propre session.
export function createRendererCommands(dependencies) {
  return new RendererCommands(dependencies);
}

class RendererCommands {
  constructor(dependencies) {
    Object.assign(this, dependencies);
  }

  bind(actions) {
    this.bindSearch();
    this.bindChat();
    this.bindActions(actions);
  }

  bindSearch() {
    const get = this.get,
      searchIntro = get("search-status").textContent;
    // Les résultats appartiennent à leur session et à la dernière requête : un reset ou une réponse dépassée ne redessine rien.
    this.search = createSearchController({
      search: (query) => this.bridge.searchMoments(query),
      session: this.session,
      onStart: () => {
        get("search-status").textContent = "Recherche dans la session…";
      },
      onResult: (cards, found) => {
        get("search-results").replaceChildren(
          ...cards.map((moment) => this.momentCard(moment)),
        );
        get("search-status").textContent =
          `${plural(found.moments.length, "passage")} · ${found.mode}. ${agreeText(found.warnings.join(" "))}`;
      },
      onClear: () => {
        get("search-results").replaceChildren();
        get("search-status").textContent = searchIntro;
      },
      onFailure: (error) => {
        get("search-status").textContent = cleanError(error);
      },
    });
    get("moment-search-form").onsubmit = (event) => {
      event.preventDefault();
      return this.search.submit(get("moment-query").value);
    };
  }

  momentCard(
    moment,
    {
      available = moment.available,
      replay = () => this.replay(moment.id, 0, moment),
    } = {},
  ) {
    const card = el("article", "moment-card");
    if (moment.preview) {
      const image = el("img");
      image.src = moment.preview;
      image.alt = "Aperçu du passage";
      card.append(image);
    }
    const content = el("div");
    content.append(
      el(
        "strong",
        "",
        `${formatTime(moment.startMs)}–${formatTime(moment.endMs)}`,
      ),
    );
    content.append(
      el(
        "p",
        "",
        moment.text ||
          moment.observation?.transcript ||
          moment.observation?.summary ||
          "Transcription indisponible.",
      ),
    );
    const play = el(
      "button",
      "secondary",
      available ? "Revoir ↗" : `Texte conservé · ${mediaNote(moment).short}`,
    );
    play.disabled = !available;
    play.onclick = replay;
    content.append(play);
    card.append(content);
    return card;
  }

  replay(id, offset = 0, card) {
    const get = this.get;
    // Session et passage sont vérifiés avant toute URL : un ID réutilisé ailleurs ne doit pas relire une autre vidéo.
    const { segment, url, refusal } = replayTarget(
      { id, sessionId: card ? card.sessionId : this.session()?.id },
      this.session(),
    );
    if (refusal) return this.notice(refusal);
    get("replay-title").textContent =
      `Passage ${formatTime(segment.startMs)} — ${formatTime(segment.endMs)}`;
    get("replay").muted = true;
    get("replay").src = url;
    get("replay").onloadedmetadata = () => {
      get("replay").currentTime = Math.min(
        offset,
        Math.max(0, get("replay").duration - REPLAY_END_MARGIN_SECONDS),
      );
    };
    get("replay-note").textContent = this.session().accepting
      ? "Relecture muette pendant l’observation pour ne pas recapturer son audio."
      : "Tu peux activer le son : l’observation est arrêtée.";
    get("replay-dialog").showModal();
    get("replay")
      .play()
      .catch(() => {
        // Les contrôles du lecteur permettent une relance manuelle ; son événement error signale une vidéo illisible.
      });
  }

  // Une citation ou une origine de surveillance démarre à son timecode, à l’intérieur de son passage.
  replayAt(id, startMs) {
    const segment = this.passage(id);
    this.replay(
      id,
      segment && Number.isFinite(startMs)
        ? Math.max(0, (startMs - segment.startMs) / 1000)
        : 0,
    );
  }

  openVerification(text = "") {
    const get = this.get;
    if (this.verificationState().busy)
      return this.notice(
        "Une vérification est déjà en cours. Tu peux toujours poser une question sur la vidéo.",
      );
    if (!this.configuration()?.verificationAvailable)
      return this.notice("Codex CLI est introuvable sur ce Mac.");
    get("claim").value = claimFrom(text);
    get("verify-error").textContent = "";
    get("verify-dialog").showModal();
    get("claim").focus();
  }

  bindChat() {
    const get = this.get;
    get("verify").onclick = () => this.openVerification(get("question").value);
    get("close-verify").onclick = () => get("verify-dialog").close();
    get("verify-form").onsubmit = async (event) => {
      event.preventDefault();
      const claim = get("claim").value.trim();
      if (!claim || this.verificationState().busy) return;
      get("verify-dialog").close();
      this.notice("");
      if (withoutVerifyPrefix(get("question").value) === claim)
        get("question").value = "";
      try {
        await this.bridge.verify(claim);
      } catch (error) {
        this.notice(cleanError(error));
      }
    };
  }

  bindActions(actions) {
    const jobOf = (id) => this.deepState().jobs.find((job) => job.id === id);
    const commands = {
      ...actions,
      replay: (data) =>
        this.replayAt(
          data.id,
          data.start === undefined ? NaN : Number(data.start),
        ),
      "watch-source": (data) =>
        this.bridge.openSurveillanceSource(data.lot, Number(data.index)),
      "job-more": (data) => {
        const job = jobOf(data.id);
        return job?.result && this.bridge.ask(deepenRequest(job.result.answer));
      },
      "job-verify": (data) => {
        const job = jobOf(data.id);
        if (job?.result) this.openVerification(job.result.answer);
      },
      "verify-retry": (data) => {
        const job = this.verificationState().jobs.find(
          (item) => item.id === data.id,
        );
        if (job) this.openVerification(job.claim);
      },
    };
    this.click = (event) => {
      const target = event.target.closest?.("[data-action]");
      const run = target && !target.disabled && commands[target.dataset.action];
      if (run)
        Promise.resolve()
          .then(() => run(target.dataset, target))
          .catch((error) => this.notice(cleanError(error)));
    };
    this.document.addEventListener("click", this.click);
  }

  release() {
    this.document.removeEventListener("click", this.click);
    this.search.clear();
  }
}
