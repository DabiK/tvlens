const {
  sessionTimeline,
  momentDetail,
} = require("../core/session-timeline.cjs");
const { randomUUID, randomBytes } = require("node:crypto");
const {
  createSessionRuntime,
  openArchivedSession,
} = require("./session-runtime.cjs");
const { createConversationRuntime, hasPendingQuestion } = require("./conversation-runtime.cjs");
const { createPublicationDiagnostic } = require("./publication-diagnostic.cjs");
const { publishState } = require("../core/state-publication.cjs");
const { createSurveillanceRuntime, tickSurveillance } = require("./surveillance-runtime.cjs");
const { createHeadlessSessionLifecycle } = require("./headless-session-lifecycle.cjs");
const { createQuestionCheckpoint } = require("./question-checkpoint.cjs");
const { warmUp } = require("./session-warm-up.cjs");
const { activeInstruction } = require("./active-instruction.cjs");
const { sessionRows } = require("./session-rows.cjs");
const { CodexQuota } = require("../adapters/codex-quota.cjs");
const { DiskGuard } = require("../adapters/disk-guard.cjs");
const { createCaptureIntake, READ_ONLY } = require("./capture-intake.cjs");
const { refusal } = require("./errors.cjs");
const { SessionLibrary } = require("../adapters/session-library.cjs");
const {
  SimulatedSurveillanceAgent,
} = require("../adapters/simulated-surveillance-agent.cjs");

const {
  VIEWS,
  active,
  captureGapsOf,
  surveillanceHistory,
  surveillanceDetail,
  deriveStateViews,
  stateView,
  overlayView,
} = require("./state-views.cjs");

const SESSIONS_LISTED = 50;

function createHeadlessIntake(host) {
  return createCaptureIntake({
    getSession: () => host.session,
    getCaptureEpoch: () => host.captureEpoch,
    isMoving: () => host.moving(),
    storage: () => host.storage(),
    publish: () => host.emit(),
    preparationWaitMs: host.options.preparationWaitMs,
    setTimer: host.options.setPreparationTimer,
    clearTimer: host.options.clearPreparationTimer,
  });
}

function createHeadlessLifecycle(host, conversation) {
  return createHeadlessSessionLifecycle({
    library: host.library,
    createSession: () => createSessionRuntime({ ...host.sessionOptions(), id: randomUUID() }),
    openSession: (id, archive) => openArchivedSession({
      ...host.sessionOptions(),
      id,
      library: { root: host.library.root, read: async () => archive },
    }),
    conversation,
    surveillance: host.surveillance,
    checkpoint: host.questionSaves,
    // Les sondes de la façade observent encore les mêmes frontières de fermeture.
    intake: {
      get ingestions() { return host.ingestions; },
      cancelPreparations: () => host.cancelPreparations(),
      settleIngestions: (cancelled) => host.settleIngestions(cancelled),
    },
    warmUp,
    guard: host.guard,
    onAdopt: (_session, state) => {
      host.sessionState = state;
      host.emit();
    },
    publish: () => host.emit(),
    log: (line) => host.log(line),
  });
}

class HeadlessRuntime {
  constructor(options) {
    this.options = options;
    this.listeners = new Set();
    this.quota = new CodexQuota();
    // Wall clock of the host. Injected by tests only: question stamps, surveillance and serverNowMs then
    // sit on the same clock, so a client can subtract one from the other.
    this.wallClock = options.wallClock || Date.now;
    // An entity tag names this process too: after a restart, a tag of the former process never gets 304.
    this.boot = randomBytes(4).toString("hex");
    this.revision = 0;
    this.auxRevision = 0;
    // Journal of the host; a test hands its own.
    this.log = options.log || ((line) => console.error(line));
    this.onPublicationError = options.onPublicationError || createPublicationDiagnostic(line => this.log(line));
    this.sessionState = null;
    this.derived = null;
    // When the questions of the session in memory reach its folder (runtime/question-checkpoint.cjs).
    const { setTimer, clearTimer } = options;
    this.questionSaves = createQuestionCheckpoint({ setTimer, clearTimer });
    this.captureIntake = createHeadlessIntake(this);
    // One guard for the host: the sessions it creates and the library that lists and deletes them
    // decide on the same measurement. A simulated run has none unless it is handed one.
    this.guard =
      options.guard === undefined
        ? options.smoke
          ? null
          : new DiskGuard({ path: options.sessionsRoot })
        : options.guard;
    this.library = new SessionLibrary({
      root: options.sessionsRoot,
      guard: this.guard,
    });
    const conversation = createConversationRuntime({
      ...options,
      onPublicationError: this.onPublicationError,
      quota: this.quota,
      getSession: () => this.session,
      // The viewer's standing instruction reaches a chat turn as a trusted field (late-bound: the
      // surveillance is composed just below).
      getInstruction: () =>
        activeInstruction(this.surveillance, this.session?.id),
      onChange: (state) => {
        const session = this.session;
        if (session) {
          const watch = session.watch;
          // Manual questions only. Surveillance never goes through this queue and never sets this flag:
          // a question does not hold it back, and its work does not hold a question back.
          const busy = this.closing || hasPendingQuestion(state.jobs, session.id);
          watch.setQuestionPending(busy);
          // The questions in memory are those of this session and no other: adopt() replaces both together.
          this.questionSaves.checkpoint(session.store, state);
        }
        this.emit();
      },
    });
    this.agent = conversation.agent;
    this.deep = conversation.deep;
    if (options.wallClock) this.deep.now = options.wallClock;
    // Shared composition with the Mac host. Never the chat agent: the simulated role stands in for
    // the provider in smoke mode, and a test may hand its own.
    this.surveillance = createSurveillanceRuntime({
      getSession: () => this.session,
      agent:
        options.surveillanceAgent ||
        (options.smoke ? new SimulatedSurveillanceAgent() : undefined),
      codexBinary: options.codexBinary,
      config: options.config,
      selectedModels: options.selectedModels,
      quota: this.quota,
      now: this.wallClock,
      onPublicationError: this.onPublicationError,
      onChange: () => this.emit(),
      // Informative overlap counter only: nothing in the surveillance decides on it.
      probe: () => ({ chatBusy: this.deep.jobs.some(active) }),
    });
    this.lifecycle = createHeadlessLifecycle(this, conversation);
    this.timer = setInterval(() => {
      const watch = this.session?.watch;
      // Durable retention has nothing to sweep between two passages (each ingest sweeps): an idle
      // session publishes nothing, so its polls are answered 304.
      if (watch && (Number.isFinite(watch.retentionMs) || watch.unremoved?.size))
        watch.prune().catch(() => {});
    }, 5000);
    this.timer.unref();
    this.ticker = setInterval(() => this.tick(), 1000);
    this.ticker.unref();
    // One measurement at start, off the critical path: the state says more than "unknown" before the
    // first session. check() never rejects.
    this.guard?.check();
    this.storageKey = JSON.stringify(this.storage());
    this.auxKey = this.auxiliary();
  }
  async setTranscriptionLanguage(language) {
    if (this.savingLanguage) throw refusal(400, "Réglage en cours, réessaie.", "language-setting-busy");
    this.savingLanguage = true;
    try {
      await this.options.transcriptionSettings.save(language);
      this.options.config.transcriptionLanguage = language;
      this.emit();
      return { language };
    } finally { this.savingLanguage = false; }
  }
  // Lectures de compatibilité : le coordinateur reste l'unique propriétaire de ces faits.
  get session() {
    return this.lifecycle?.session ?? null;
  }
  get captureEpoch() {
    return this.lifecycle?.captureEpoch ?? 0;
  }
  get lastEnd() {
    return this.lifecycle.lastEnd;
  }
  get closing() {
    return this.lifecycle?.closing ?? false;
  }
  get fresh() {
    return this.lifecycle.fresh;
  }
  get ending() {
    return this.lifecycle.ending;
  }
  get releasing() {
    return this.lifecycle.releasing;
  }
  get closed() {
    return this.lifecycle.closed;
  }
  get transition() {
    return this.lifecycle.transition;
  }
  exclusive(work) {
    return this.lifecycle.exclusive(work);
  }
  // Every second, without waiting for anything: surveillance deadlines and grace periods, then the
  // figures that move without an event of their own.
  tick() {
    tickSurveillance(this.surveillance, this.onPublicationError, {
      origin: "headless-runtime", sessionId: this.session?.id,
    });
    const aux = this.auxiliary();
    if (aux !== this.auxKey) {
      this.auxKey = aux;
      this.auxRevision++;
    }
    // While capture is refused for lack of room, the measurement is refreshed so that the state says
    // when room is back. The guard keeps a measurement for a few seconds: never one per poll, and
    // capture itself only comes back on an explicit start or resume.
    if (this.guard?.snapshot().state === "blocked") this.guard.check();
    if (JSON.stringify(this.storage()) !== this.storageKey) this.emit();
  }
  // Counters of the complete state that move without publishing anything.
  auxiliary() {
    return JSON.stringify([
      this.quota.snapshot(),
      this.session?.search.index?.status?.() || null,
    ]);
  }
  emit() {
    // One revision per published change, never one per second: a poll that already holds it is
    // answered without a body.
    this.revision++;
    this.storageKey = JSON.stringify(this.storage());
    for (const listener of this.listeners) {
      publishState(() => listener(this.snapshot()), this.onPublicationError, {
        origin: "headless-runtime", sessionId: this.session?.id, revision: this.revision,
      });
    }
  }
  // Session onChange. A session that is no longer the one in memory publishes nothing.
  published(state) {
    if (this.session?.id !== state.id) return;
    this.sessionState = state;
    this.surveillance.observe(state);
    this.emit();
  }
  // Figures already in memory (last measurement of the guard, volume written by this session): a
  // state poll never becomes a filesystem call.
  storage() {
    if (this.session) return this.session.storage();
    const disk = this.guard?.snapshot();
    return {
      state: disk?.state || "unknown",
      freeBytes: disk?.freeBytes ?? null,
      minFreeBytes: disk?.minFreeBytes ?? null,
      sessionBytes: 0,
      bytesPerMinute: null,
      remainingMinutes: null,
    };
  }
  viewName(view) {
    if (view === undefined) return "full";
    if (!VIEWS.includes(view)) throw refusal(400, "Vue d’état inconnue.", "unknown-view");
    return view;
  }
  // Entity tag of a state resource, from counters only: answering 304 builds no snapshot. The complete
  // state also carries index and quota counters, which move without publishing.
  etag(view) {
    const name = view === "overlay" ? view : this.viewName(view);
    return `"${this.boot}-${name}-${this.revision}${name === "full" ? "." + this.auxRevision : ""}"`;
  }
  snapshot(view) {
    if (this.viewName(view) !== "full") return this.view(view);
    const session = this.session?.watch.snapshot() || null;
    if (session) session.title = this.session.manifest()?.title || null;
    return {
      session,
      transcription: { language: this.options.config?.transcriptionLanguage || "fr" },
      timeline: sessionTimeline(session),
      chat: { ...this.deep.snapshot(), timeoutMs: this.deep.timeoutMs },
      captureGaps: captureGapsOf([
        ...(session?.history || []),
        ...(session?.segments || []),
      ]),
      // Counters only: background indexing that fails or falls behind must be visible somewhere.
      index: this.session?.search.index?.status?.() || null,
      quota: this.quota.snapshot(),
      // Compact: activity, counters and cards. The whole registry has its own route.
      surveillance: this.surveillance.snapshot({ brief: true }),
      storage: this.storage(),
      // Clock of the question stamps: elapsed time of a running question is serverNowMs - startedAt.
      serverNowMs: this.wallClock(),
      revision: this.revision,
    };
  }
  // Everything of a view that only moves with a published change, computed once per revision from
  // the last state the session published: a poll never copies or walks the passages again.
  derive() {
    const sessionId = this.session?.id || null;
    if (
      this.derived?.revision === this.revision &&
      this.derived.sessionId === sessionId
    )
      return this.derived;
    const state = sessionId ? this.sessionState : null;
    return (this.derived = {
      revision: this.revision,
      sessionId,
      ...deriveStateViews({
        state,
        jobs: this.deep.snapshot().jobs,
        title: state ? this.session.manifest()?.title || null : null,
      }),
    });
  }
  view(name) {
    const derived = this.derive(),
      watch = this.session?.watch;
    // What moves without a publication is read live: the clock, and the flags a closing does not announce.
    return stateView(name, derived, {
      liveSession: derived.header && {
        accepting: watch.accepting,
        asking: watch.asking,
        readOnly: watch.readOnly,
        elapsedMs: watch.now(),
        storage: this.session.storage(),
      },
      timeoutMs: this.deep.timeoutMs,
      revision: this.revision,
      serverNowMs: this.wallClock(),
      transcriptionLanguage: this.options.config?.transcriptionLanguage,
      surveillance: this.surveillance.snapshot({ brief: true }),
      storage: this.storage(),
    });
  }
  // What the ambient display polls with the panel closed: a few kilobytes, memory only.
  overlay() {
    const state = this.surveillance.snapshot({ brief: true }),
      watch = this.session?.watch;
    return overlayView({
      sessionId: this.session?.id,
      surveillance: state,
      accepting: watch?.accepting,
      readOnly: watch?.readOnly,
      elapsedMs: watch?.now(),
      storage: this.storage(),
      revision: this.revision,
      serverNowMs: this.wallClock(),
    });
  }
  described(session) {
    return this.lifecycle.described(session);
  }
  sessionOptions() {
    return {
      host: "server",
      ...this.options,
      guard: this.guard,
      quota: this.quota,
      onChange: (state) => this.published(state),
      log: (line) => this.log(line),
      onPublicationError: this.onPublicationError,
    };
  }
  adopt(session, jobs) {
    return this.lifecycle.adopt(session, jobs);
  }
  moving() {
    return this.lifecycle.moving();
  }
  loaded(sessionId) {
    if (!this.session || sessionId !== this.session.id)
      throw refusal(400, "Session obsolète.", "stale-session");
    return this.session;
  }
  start() {
    return this.lifecycle.start();
  }
  pause() {
    return this.lifecycle.pause();
  }
  // Les bancs lisent les ensembles du propriétaire, jamais une copie de l'état d'ingestion.
  get admitted() {
    return this.captureIntake.admitted;
  }
  get ingestions() {
    return this.captureIntake.ingestions;
  }
  admit(sessionId) {
    return this.captureIntake.admit(sessionId);
  }
  accept(sessionId) {
    return this.captureIntake.accept(sessionId);
  }
  current(operation) {
    return this.captureIntake.current(operation);
  }
  finish(operation) {
    return this.captureIntake.finish(operation);
  }
  cancelPreparations() {
    return this.captureIntake.cancelPreparations();
  }
  settleIngestions(cancelled) {
    return this.captureIntake.settleIngestions(cancelled);
  }
  ingest(input, operation) {
    return this.captureIntake.ingest(input, operation);
  }
  ask({ question, sessionId, anchorMs, moment }) {
    if (this.moving()) throw refusal(400, "Session en cours de fermeture.", "session-closing");
    const session = this.loaded(sessionId);
    if (
      !Number.isFinite(anchorMs) ||
      anchorMs < 0 ||
      anchorMs > session.watch.now() + 3000
    )
      throw refusal(400, "Ancrage invalide.", "invalid-anchor");
    const snapshot = session.watch.snapshot();
    const selected = moment ? momentDetail(snapshot, moment.segmentIds || moment) : null;
    return this.deep.start(question, {
      mode: "chat",
      anchorMs: selected ? selected.endMs : anchorMs,
      ...(selected
        ? { startMs: selected.startMs, intent: "explain-moment" }
        : {}),
      snapshot,
    });
  }
  detail({ sessionId, segmentIds, firstId, lastId }) {
    const session = this.loaded(sessionId);
    return momentDetail(session.watch.snapshot(), segmentIds || { firstId, lastId });
  }
  // The real outcome: a question already finished, or unknown, was not cancelled.
  cancel(id) {
    const job = this.deep.jobs.find((item) => item.id === id),
      cancelled = Boolean(job && active(job));
    if (cancelled) this.deep.cancel("Question annulée.", id);
    return { cancelled, status: job?.status ?? null };
  }
  leave(session, reason, remove) {
    return this.lifecycle.leave(session, reason, remove);
  }
  release(reason) {
    return this.lifecycle.release(reason);
  }
  end() {
    return this.lifecycle.end();
  }
  located(id) {
    return this.lifecycle.located(id);
  }
  capturing(session = this.session) {
    return this.lifecycle.capturing(session);
  }
  sessionListingRead() {
    const loaded = this.session;
    if (!loaded) return { current: null, snapshot: null, capturing: false, storage: null };
    // L'état publié et la référence sont transférés ensemble ; aucun objet mutable ne traverse l'attente.
    const state = this.sessionState?.id === loaded.id ? this.sessionState : loaded.watch.snapshot();
    return {
      current: { ...this.described(loaded), title: loaded.manifest()?.title || null },
      snapshot: {
        id: loaded.id,
        coverage: { passages: state.coverage.passages },
        segments: state.segments.map(segment => ({ available: segment.available })),
      },
      capturing: this.capturing(loaded),
      storage: { ...loaded.storage() },
    };
  }
  // Listing reads manifests only, never a saved state. The session in memory is shown from its live
  // figures: its manifest is up to 30 s old, and absent before its first passage.
  sessions() {
    return this.listSessions(this.sessionListingRead());
  }
  async listSessions(read) {
    const listed = await this.library.list({ current: read.current?.id || null });
    const projected = sessionRows(listed, read.snapshot, {
      current: read.current,
      capturing: read.capturing,
      fallback: {
        title: read.current?.title || "Session en cours",
        host: "server", createdAt: null, updatedAt: null,
      },
      live: read.current ? { elapsedMs: read.current.elapsedMs, sessionBytes: read.storage.sessionBytes } : {},
    });
    const sessions = projected.sessions;
    return {
      current: projected.current,
      sessions: sessions.slice(0, SESSIONS_LISTED),
      total: sessions.length,
      storage: await this.library.usage(sessions),
    };
  }
  async storageUsage() {
    const read = this.sessionListingRead();
    const { storage } = await this.listSessions(read);
    return { ...storage, session: read.storage };
  }
  open(id) {
    return this.lifecycle.open(id);
  }
  resume(id) {
    return this.lifecycle.resume(id);
  }
  remove(id) {
    return this.lifecycle.remove(id);
  }
  startSurveillance({ sessionId, instruction } = {}) {
    if (this.moving()) throw refusal(400, "Session en cours de fermeture.", "session-closing");
    const session = this.loaded(sessionId);
    // An archive that is only being read receives no new passage: there is nothing to watch.
    if (session.readOnly)
      throw refusal(
        409,
        "Session ouverte en lecture seule : reprends la capture avant d’activer la surveillance.",
        "read-only",
      );
    this.surveillance.start({ instruction });
    return { surveillance: this.surveillance.snapshot({ brief: true }) };
  }
  stopSurveillance({ sessionId } = {}) {
    this.loaded(sessionId);
    this.surveillance.stop("Surveillance arrêtée.");
    return { surveillance: this.surveillance.snapshot({ brief: true }) };
  }
  // Explicit only: a claim in error or cancelled, or a passage whose reading failed, is tried again.
  retrySurveillance({ sessionId, id } = {}) {
    this.loaded(sessionId);
    this.surveillance.retry(id);
    return { surveillance: this.surveillance.snapshot({ brief: true }) };
  }
  // The whole registry of the session in memory, archive included: on request, never in a poll.
  surveillanceRegistry() {
    return this.surveillance.snapshot({ full: true });
  }
  surveillanceHistory({ sessionId, beforeSeq, limit } = {}) {
    this.loaded(sessionId);
    return surveillanceHistory(this.surveillanceRegistry(), { beforeSeq, limit });
  }
  surveillanceDetail({ sessionId, id } = {}) {
    this.loaded(sessionId);
    return surveillanceDetail(this.surveillanceRegistry(), id);
  }
  close() {
    clearInterval(this.timer);
    clearInterval(this.ticker);
    return this.lifecycle.close();
  }
}
module.exports = {
  HeadlessRuntime,
  surveillanceHistory,
  surveillanceDetail,
  READ_ONLY,
};
