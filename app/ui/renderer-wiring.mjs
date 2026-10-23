import { renderTranscriptionWarning } from "./transcription-view.mjs";
import { createRendererCommands } from "./renderer-commands.mjs";
import { describeMemory } from "./sessions-view.mjs";
import { cleanError } from "./text.mjs";
import {
  describeSurveillance,
  nextSeen,
  sequences,
} from "./surveillance-view.mjs";
import { CardQueue } from "./card-queue.mjs";
import { KeyedList } from "./list-view.mjs";
import { cardEntry } from "./surveillance-dom.js";
import { reduceRecap } from "./recap-state.mjs";
import { renderRecapView } from "./recap-view.js";
import { createStateDelivery, bindPushedStates } from "./state-delivery.mjs";
import { createChatView } from "./chat-view.mjs";
import { createFreshness } from "./freshness.mjs";
import { createSurveillanceChat } from "./surveillance-chat.mjs";

const STACK_MIN_DELAY_MS = 50;
const STACK_TIMER_MARGIN_MS = 20;

// La page et le banc partagent les adoptions, les dessins et les commandes, sans accès global au chargement.
export function createRendererWiring(options) {
  return new RendererWiring(options);
}

class RendererWiring {
  constructor(dependencies) {
    Object.assign(this, dependencies);
    const { get, time } = dependencies;
    this.commands = createRendererCommands({
      bridge: this.bridge,
      document: this.document,
      get,
      configuration: this.configuration,
      notice: this.notice,
      session: () => this.session,
      deepState: () => this.deepState,
      verificationState: () => this.verificationState,
      passage: (id) => this.passages.get(id),
    });
    this.archiveBottom = false;
    this.watchPushes = 0;
    this.cardQueue = new CardQueue();
    this.stackList = new KeyedList(get("watch-stack"));
    this.seen = { overlay: 0, signal: 0 };
    this.surveillanceState = null;
    this.surveillanceChat = createSurveillanceChat({
      readHistory: this.bridge.surveillanceHistory?.bind(this.bridge),
      changed: () => { if (!this.released) this.scheduleChat(); },
    });
    this.recapState = null;
    this.recapRevision = 0;
    this.recapKey = "";
    this.session = null;
    this.sessionFreshness = createFreshness();
    this.sessionGeneration = 0;
    this.deepState = { jobs: [] };
    this.verificationState = { busy: false, jobs: [] };
    this.passages = new Map();
    this.drawChatCards = createChatView({
      list: get("message-list"),
      box: get("messages"),
      intro: get("chat-intro"),
      queueStatus: get("queue-status"),
    });
    this.delivery = createStateDelivery({
      ...time,
      sources: {
        session: { group: "session", adopt: (state) => this.adoptState(state) },
        deep: {
          group: "chat",
          adopt: (state) => {
            this.deepState = state;
          },
        },
        verification: {
          group: "chat",
          adopt: (state) => {
            this.verificationState = state;
          },
        },
      },
      draws: {
        session: () => this.drawState(),
        chat: () => this.drawChat(),
        surveillance: () => this.drawSurveillance(),
      },
    });
  }

  adoptState(state) {
    this.sessionFreshness.pushed();
    if (this.session?.id !== state.id) {
      this.sessionGeneration++;
      this.recapKey = "";
      this.commands.search.clear();
    }
    this.session = state;
    this.transcription = state.transcription || this.transcription;
    // Indexer une fois par état évite de parcourir tous les passages pour chaque carte ou citation.
    this.passages = new Map();
    for (const list of [state.history || [], state.segments])
      for (const passage of list) this.passages.set(passage.id, passage);
    this.views.adopted(state);
  }

  receiveTranscription(state) {
    this.transcription = state;
    this.scheduleState();
  }

  receiveState(state) {
    if (state) this.delivery.receive("session", state);
  }

  scheduleState() {
    this.delivery.schedule("session");
  }
  scheduleChat() {
    this.delivery.schedule("chat");
  }

  drawState() {
    renderTranscriptionWarning(this.get, this.transcription || this.configuration()?.transcription);
    if (this.session) {
      if (
        this.recapState?.sessionId &&
        this.recapState.sessionId !== this.session.id
      )
        this.recapState = null;
      this.renderRecap();
      // Une archive garde sa rétention propre (snapshot ou bibliothèque), même sur un autre hôte.
      this.get("memory-status").textContent = describeMemory(this.session, {
        library: this.library(),
      });
      this.get("memory-status").title = this.get("memory-status").textContent;
    }
    this.views.session();
    this.drawChat();
  }

  drawChat() {
    const config = this.configuration();
    const context = {
      now: this.time.now(),
      timeoutMs: config?.questionTimeoutMs ?? null,
      queuedIds: this.deepState.jobs
        .filter((job) => job.status === "queued")
        .map((job) => job.id),
      capturing: Boolean(this.session?.accepting),
      session: this.session,
      passage: (id) => this.passages.get(id),
      preview: this.preview,
      cancelling: this.chatOptions().cancelling,
      verifyAvailable: Boolean(config?.verificationAvailable),
      verifyBusy: this.verificationState.busy,
    };
    const options = this.chatOptions();
    this.drawChatCards({
      ...options,
      forceBottom: options.forceBottom || this.archiveBottom,
      context,
      deepState: this.deepState,
      verificationState: this.verificationState,
      surveillanceCards: this.surveillanceChat.results(this.session?.id),
      limit: config?.questionQueueLimit,
    });
    this.archiveBottom = false;
    this.views.chat();
  }

  bind(actions = {}) {
    this.commands.bind(actions);
    this.unload = () => this.release();
    this.window.addEventListener("beforeunload", this.unload);
    this.pushed = bindPushedStates({
      bridge: this.bridge,
      delivery: this.delivery,
      changed: this.views.changed,
      onError: (error) => this.notice(cleanError(error)),
    });
    this.subscriptions = [
      this.bridge.onReset(() => this.clearSession()),
      this.bridge.onRecap((state) => this.receiveRecap(state)),
      this.bridge.onSurveillance?.((state) => {
        this.watchPushes = (this.watchPushes || 0) + 1;
        this.receiveSurveillance(state);
      }),
    ];
    // Au rechargement, la fenêtre retrouve la session que l’hôte détient encore.
    const sessionIsFresh = this.sessionFreshness.beginRead();
    this.bridge
      .state()
      .then((state) => {
        if (!this.released && sessionIsFresh()) this.receiveState(state);
      })
      .catch(() => {
        // La fenêtre peut rester sans session ; une publication ultérieure la remettra à jour.
      });
    this.bridge
      .surveillanceState?.()
      .then((state) => this.receiveSurveillance(state))
      .catch(() => {
        // Cet état initial est facultatif : les publications de surveillance pourront encore alimenter la vue.
      });
    const revision = this.recapRevision;
    this.bridge
      .recapState()
      .then((state) => {
        if (this.recapRevision === revision) this.receiveRecap(state);
      })
      .catch(() => {
        if (this.recapRevision === revision)
          this.receiveRecap({
            sessionId: this.session?.id,
            status: "error",
            chapters: [],
            overview: "",
          });
      });
  }

  async pullSession() {
    const generationBeforeRead = this.sessionGeneration;
    const sessionIsFresh = this.sessionFreshness.beginRead();
    const state = await this.bridge.state();
    if (this.released || generationBeforeRead !== this.sessionGeneration) return;
    // Une poussée de la même session remplace sa lecture, pas le chargement de l'archive.
    if (sessionIsFresh()) {
      if (!state) return this.clearSession();
      this.receiveState(state);
    }
    const generation = this.sessionGeneration;
    const deepIsFresh = this.pushed.beginDeepRead();
    const [deep, recap, surveillance] = await Promise.all([
      this.bridge.deepState(),
      this.bridge.recapState().catch(() => null),
      this.bridge.surveillanceState?.().catch(() => null),
    ]);
    if (this.released || generation !== this.sessionGeneration) return;
    // Une autre lecture peut retenir le lot après la réponse deep : vérifier seulement ici.
    if (deepIsFresh()) this.deepState = deep;
    if (recap) this.receiveRecap(recap);
    if (surveillance) this.receiveSurveillance(surveillance);
    this.archiveBottom = true;
    this.scheduleState();
  }

  receiveRecap(state) {
    if (this.released) return;
    const next = reduceRecap(this.recapState, state, this.session?.id);
    if (next === undefined) return;
    this.recapRevision++;
    this.recapState = next;
    this.renderRecap();
  }

  // Une synthèse stable n’est reconstruite que si son contenu ou la disponibilité de ses citations change.
  renderRecap() {
    const cited = (this.recapState?.chapters || []).flatMap(
      (chapter) => chapter.sources || [],
    );
    const key = [
      this.recapRevision,
      this.session?.id,
      this.recapState?.sessionId,
      cited
        .map((source) => (this.passages.get(source.id)?.available ? 1 : 0))
        .join(""),
    ].join("|");
    if (key === this.recapKey) return;
    this.recapKey = key;
    renderRecapView({
      state: this.recapState,
      session: this.session,
      targets: [
        [this.get("recap-content"), false],
        [this.get("recap-dialog-content"), true],
      ],
      replay: (...args) => this.replay(...args),
      notice: this.notice,
    });
  }

  clearSession() {
    if (this.released) return;
    this.sessionFreshness.pushed();
    this.sessionGeneration++;
    this.recapRevision++;
    this.recapState = null;
    this.session = null;
    this.passages = new Map();
    this.deepState = { jobs: [] };
    this.commands.search.clear();
    this.surveillanceChat.clear();
    this.views.reset();
    this.renderRecap();
    this.drawState();
  }

  receiveSurveillance(state) {
    if (this.released || !state || typeof state !== "object" || !state.activity)
      return;
    this.surveillanceState = state;
    this.surveillanceChat.receive(state);
    this.scheduleChat();
    // La restauration ne livre pas encore les séquences finales : prendre la référence du badge au premier état prêt.
    ({ seen: this.seen, seenFor: this.seenFor } = nextSeen(
      { seen: this.seen, seenFor: this.seenFor },
      state,
    ));
    // La pile reçoit les vérifications sourcées ; les signaux se lisent dans le panneau.
    // Un registre restauré est de l’historique : amorcer la file sans faire surgir ses anciennes cartes.
    this.cardQueue.offer(this.surveillanceView().cards, {
      sessionId: state.sessionId,
      now: this.time.now(),
      prime: Boolean(state.restored),
    });
    this.scheduleSurveillance();
  }

  surveillanceView() {
    return describeSurveillance(this.surveillanceState, {
      ...this.watchOptions?.(),
      session: this.session,
      seen: this.seen,
      banner: true,
    });
  }

  scheduleSurveillance() {
    this.delivery.schedule("surveillance");
  }

  drawSurveillance() {
    const get = this.get,
      { floating, expanded } = this.mode();
    if (
      this.shell.view === "watch" &&
      !(floating && !expanded) &&
      this.document.visibilityState === "visible"
    )
      this.seen = sequences(this.surveillanceState);
    const view = this.surveillanceView();
    this.shell.watchBadge(view.badge);
    const chip = get("watch-chip");
    chip.hidden = !view.chip.visible;
    chip.textContent = view.chip.text;
    chip.dataset.state = view.chip.state;
    get("watch-activity").textContent = [
      view.activity.text,
      view.activity.detail && `${view.activity.detail}.`,
      view.activity.error && `Incident : ${view.activity.error}`,
    ]
      .filter(Boolean)
      .join(" ");
    get("watch-activity").dataset.state = view.status;
    // Cette bannière persistante n’offre aucune suppression du registre, même si son enregistrement a échoué.
    const unsaved = view.notice?.text || "";
    get("watch-notice").hidden = !unsaved;
    get("watch-notice").dataset.tone = view.notice?.tone || "";
    if (get("watch-notice-text").textContent !== unsaved)
      get("watch-notice-text").textContent = unsaved;
    this.drawStack();
    this.views.surveillance(view);
  }

  drawStack() {
    const now = this.time.now(),
      { floating, expanded } = this.mode();
    const collapsed = floating && !expanded,
      shown = this.document.visibilityState === "visible";
    // Le panneau ouvert montre déjà les résultats : éviter de superposer les mêmes cartes.
    if (shown && !collapsed && this.shell.view === "watch")
      this.cardQueue.clear();
    const visible = this.cardQueue.visible(now, { displayable: shown });
    this.stackList.sync(
      collapsed
        ? []
        : visible.map((card) => cardEntry(card, { compact: true })),
    );
    // La fenêtre repliée tient sur une barre : condenser la carte en une ligne qui permet de l’ouvrir.
    const first = collapsed ? visible[0] : null,
      toast = this.get("float-toast");
    toast.hidden = !first;
    this.document.body.classList.toggle("has-float-toast", Boolean(first));
    if (first) {
      toast.textContent = `${first.label} · ${first.intervalLabel} — ${first.text}`;
      toast.title = "Ouvrir pour lire le résultat et ses sources";
    }
    this.time.clearTimer(this.stackTimer);
    const next = this.cardQueue.nextChangeAt();
    if (next !== null)
      this.stackTimer = this.time.setTimer(
        () => this.drawStack(),
        Math.max(
          STACK_MIN_DELAY_MS,
          next - this.time.now() + STACK_TIMER_MARGIN_MS,
        ),
      );
  }

  replay(...args) {
    return this.commands.replay(...args);
  }
  momentCard(moment, options) {
    return this.commands.momentCard(moment, options);
  }

  release() {
    if (this.released) return;
    this.released = true;
    this.pushed.release();
    for (const unsubscribe of this.subscriptions) unsubscribe?.();
    this.window.removeEventListener("beforeunload", this.unload);
    this.time.clearTimer(this.stackTimer);
    this.commands.release();
  }
}
