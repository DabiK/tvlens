const {
  sessionTimeline,
  momentDetail,
} = require("../core/session-timeline.cjs");
const { randomUUID, randomBytes } = require("node:crypto");
const {
  createSessionRuntime,
  openArchivedSession,
  validateSegment,
} = require("./session-runtime.cjs");
const { createConversationRuntime } = require("./conversation-runtime.cjs");
const { createSurveillanceRuntime } = require("./surveillance-runtime.cjs");
const {
  closeSession,
  settleQuestions,
  attempt,
} = require("./session-closing.cjs");
const { createQuestionCheckpoint } = require("./question-checkpoint.cjs");
const { warmUp } = require("./session-warm-up.cjs");
const { activeInstruction } = require("./active-instruction.cjs");
const { CodexQuota } = require("../adapters/codex-quota.cjs");
const { DiskGuard, STORAGE_FULL } = require("../adapters/disk-guard.cjs");
const { SessionLibrary } = require("../adapters/session-library.cjs");
const {
  SimulatedSurveillanceAgent,
} = require("../adapters/simulated-surveillance-agent.cjs");

const {
  VIEWS,
  active,
  refusal,
  captureGapsOf,
  surveillanceHistory,
  surveillanceDetail,
  deriveStateViews,
  stateView,
  overlayView,
} = require("./state-views.cjs");

const READ_ONLY =
  "Session ouverte en lecture seule. Choisis Reprendre la capture ou Nouvelle session.";
const SESSIONS_LISTED = 50;
// A block that arrives, or is still being prepared, while its session goes away is not a bad request: its
// capture is answered 503 and asks the session again, instead of counting a block refused for its content.
const closing = () =>
  refusal(503, "Session en cours de fermeture.", "session-closing");
// How long the end of a session waits for a preparation it cancelled to let go of its media tool and its
// temporary files. A ceiling on that wait, never a promise about the cleanup itself.
const PREPARATION_WAIT_MS = 1000;

class HeadlessRuntime {
  constructor(options) {
    this.options = options;
    this.listeners = new Set();
    this.ingestions = new Set();
    // Blocks the transport has accepted and not handed back yet, from before their media are prepared
    // (see accept): what the end of their session cancels, or waits for once their storage has begun.
    this.admitted = new Set();
    this.preparationWaitMs = options.preparationWaitMs ?? PREPARATION_WAIT_MS;
    this.quota = new CodexQuota();
    // Wall clock of the host. Injected by tests only: question stamps, surveillance and serverNowMs then
    // sit on the same clock, so a client can subtract one from the other.
    this.wallClock = options.wallClock || Date.now;
    // An entity tag names this process too: after a restart, a tag of the former process never gets 304.
    this.boot = randomBytes(4).toString("hex");
    this.revision = 0;
    this.auxRevision = 0;
    // Grows whenever the capture that numbers its blocks may have changed (new session, opening,
    // resume, every start, end, deletion): the transport forgets the former numbering.
    this.captureEpoch = 0;
    // Outcome of the last end of a session, closing failures included: { id, archived, errors }.
    this.lastEnd = null;
    // Journal of the host; a test hands its own.
    this.log = options.log || ((line) => console.error(line));
    this.transition = Promise.resolve();
    this.session = null;
    this.sessionState = null;
    this.derived = null;
    this.fresh = false;
    // When the questions of the session in memory reach its folder (runtime/question-checkpoint.cjs).
    const { setTimer, clearTimer } = options;
    this.questionSaves = createQuestionCheckpoint({ setTimer, clearTimer });
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
          const busy = this.closing || state.jobs.some(active);
          if (watch.asking !== busy) {
            watch.asking = busy;
            watch.emit();
            if (!busy) queueMicrotask(() => watch.drain());
          }
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
      onChange: () => this.emit(),
      // Informative overlap counter only: nothing in the surveillance decides on it.
      probe: () => ({ chatBusy: this.deep.jobs.some(active) }),
    });
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
    if (this.savingLanguage) throw Error("Réglage en cours, réessaie.");
    this.savingLanguage = true;
    try {
      await this.options.transcriptionSettings.save(language);
      this.options.config.transcriptionLanguage = language;
      this.emit();
      return { language };
    } finally { this.savingLanguage = false; }
  }
  // Session changes run one at a time: an opening never interleaves with an ending or a deletion.
  exclusive(work) {
    const run = this.transition.then(work);
    this.transition = run.catch(() => {});
    return run;
  }
  // Every second, without waiting for anything: surveillance deadlines and grace periods, then the
  // figures that move without an event of their own.
  tick() {
    try {
      this.surveillance.tick();
    } catch {
      // Quota et disque doivent encore être actualisés. Le tick de surveillance a pu rester partiel, sans diagnostic ni reprise garantie.
    }
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
    for (const listener of this.listeners) listener(this.snapshot());
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
    if (!VIEWS.includes(view)) throw refusal(400, "Vue d’état inconnue.");
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
    const watch = session.watch;
    return {
      id: session.id,
      elapsedMs: watch.now(),
      retentionMs: Number.isFinite(watch.retentionMs) ? watch.retentionMs : null,
      retention: Number.isFinite(watch.retentionMs) ? "rolling" : "until-deleted",
      readOnly: watch.readOnly,
      accepting: watch.accepting,
    };
  }
  sessionOptions() {
    return {
      host: "server",
      ...this.options,
      guard: this.guard,
      quota: this.quota,
      onChange: (state) => this.published(state),
    };
  }
  // One synchronous step: the questions in memory always belong to the session in memory (R4: a late
  // save can never write the answers of one session into another), and the transport is told that the
  // block numbering may start again (R8).
  adopt(session, jobs = []) {
    // Nothing of the former session waits past this point: what it had to save was handed over when its
    // questions were settled, and a timer left behind would have nothing to write.
    this.questionSaves.forget();
    this.deep.restore(jobs);
    this.session = session;
    this.sessionState = session ? session.watch.snapshot() : null;
    this.fresh = false;
    this.captureEpoch++;
    this.emit();
  }
  moving() {
    return Boolean(this.ending || this.releasing || this.closing);
  }
  loaded(sessionId) {
    if (!this.session || sessionId !== this.session.id)
      throw Error("Session obsolète.");
    return this.session;
  }
  start() {
    return this.exclusive(async () => {
      if (this.closing) throw Error("Session en cours de fermeture.");
      let session = this.session;
      // Looking at an archive never adds capture to it: it is resumed explicitly, or left for a new one.
      if (session?.readOnly) throw refusal(409, READ_ONLY, "read-only");
      if (!session) {
        // Refused on a fresh measurement, before a directory or a provider connection exists.
        await this.guard?.assertRoom();
        session = createSessionRuntime({
          ...this.sessionOptions(),
          id: randomUUID(),
        });
        this.adopt(session);
        this.fresh = true;
        // The first answer and the first description should not pay the connection. Never for an archive
        // that is only being read.
        warmUp({
          chat: this.agent,
          perception: session.perception,
          sessionId: session.id,
        });
      } else {
        const stopped = !session.watch.accepting;
        if (stopped) await session.resume();
        // Every successful start, even on a session that was still capturing: a TV that restarted its
        // capture without sending a pause numbers its blocks from a lower origin. A block of the former
        // capture replayed afterwards is still refused by the session, on observation order.
        this.captureEpoch++;
        if (stopped) this.emit();
      }
      return this.described(session);
    });
  }
  pause() {
    return this.exclusive(async () => {
      await this.session?.pause();
      this.emit();
    });
  }
  // Asked by the transport before a block is prepared, so that a refusal costs no media work: an
  // archive that is only being read never receives capture, and a session stopped for lack of room
  // keeps saying why instead of looking merely stopped.
  admit(sessionId) {
    const session = this.loaded(sessionId);
    if (session.readOnly) throw refusal(409, READ_ONLY, "read-only");
    if (session.watch.accepting) return session;
    if (this.storage().state === "blocked")
      throw Object.assign(
        new Error(
          session.watch.storageError ||
            "Espace disque insuffisant : la capture est suspendue pour ne rien supprimer.",
        ),
        { code: STORAGE_FULL },
      );
    throw Error("La session est arrêtée.");
  }
  // A block the transport has accepted belongs to the host from here, before anything is prepared for
  // it, until the transport hands it back (finish): the session and the capture it was accepted in, and
  // the signal that stops its preparation when that session ends, is deleted, or the host stops.
  // Refused while a session is going away, before any media work.
  accept(sessionId) {
    const session = this.admit(sessionId);
    if (this.moving()) throw closing();
    const operation = {
      session,
      epoch: this.captureEpoch,
      controller: new AbortController(),
      storing: false,
    };
    operation.settled = new Promise((resolve) => {
      operation.settle = resolve;
    });
    this.admitted.add(operation);
    return operation;
  }
  // Still the life it was accepted in: the session itself, not its identifier, which an archive opened
  // and resumed shares with its former life; and the capture, which every start and resume renews.
  current(operation) {
    return (
      !operation.controller.signal.aborted &&
      operation.session === this.session &&
      operation.epoch === this.captureEpoch
    );
  }
  // Handed back once the block is answered and what prepared it has let go, however late that is.
  finish(operation) {
    this.admitted.delete(operation);
    operation.settle();
  }
  // First thing when the session in memory goes away: a block still being prepared is cancelled, its
  // media tool stopped and its capture told that the session is closing. One whose storage has begun is
  // left to land. Hands back what settleIngestions() then waits for: every preparation that has not let
  // go, one cancelled by an earlier end included. That one is not cancelled twice, and stays owned.
  cancelPreparations() {
    const cancelled = [];
    for (const operation of this.admitted)
      if (!operation.storing) {
        if (!operation.controller.signal.aborted)
          operation.controller.abort(closing());
        cancelled.push(operation.settled);
      }
    return cancelled;
  }
  // What is being stored lands whole, as before. What was cancelled is then given preparationWaitMs to
  // let go. Past that the session goes away all the same and says so, as the failure of this closing step
  // ("préparation média"): the block stays owned and refused, and the transport prepares no other, until
  // its preparation has really settled.
  async settleIngestions(cancelled) {
    await Promise.allSettled([...this.ingestions]);
    if (!cancelled.length) return;
    let timer;
    const late = await Promise.race([
      Promise.all(cancelled).then(() => false),
      new Promise((resolve) => {
        timer = setTimeout(resolve, this.preparationWaitMs, true);
      }),
    ]);
    clearTimeout(timer);
    if (late)
      throw new Error(
        `arrêt non confirmé après ${this.preparationWaitMs} ms, bloc refusé, préparation suivante en attente`,
      );
  }
  // `operation` is what accept() handed the transport for this block; a host that prepares nothing
  // (a probe, a test) ingests without one.
  async ingest(input, operation) {
    // Stored in the life it was accepted in and no other, whatever happened while it was prepared.
    if (operation && !this.current(operation))
      throw operation.controller.signal.aborted
        ? operation.controller.signal.reason
        : refusal(
            409,
            "La capture a changé pendant la préparation de ce bloc.",
            "capture-changed",
          );
    const session = this.admit(input?.sessionId);
    validateSegment(input, session.watch.now());
    if (this.moving()) throw closing();
    // Its storage starts in this very step: from here an end waits for it to land instead of
    // cancelling it.
    if (operation) operation.storing = true;
    const work = session.watch.ingest(input);
    this.ingestions.add(work);
    try {
      return await work;
    } catch (error) {
      // Out of room: the passage was refused before any write. The whole session is paused, clock
      // included, and says why; nothing is deleted to make space, and it stays open to questions.
      if (error?.code === STORAGE_FULL && this.session === session) {
        await session.pause().catch(() => {});
        this.emit();
      }
      throw error;
    } finally {
      this.ingestions.delete(work);
    }
  }
  ask({ question, sessionId, anchorMs, moment }) {
    if (this.moving()) throw Error("Session en cours de fermeture.");
    const session = this.loaded(sessionId);
    if (
      !Number.isFinite(anchorMs) ||
      anchorMs < 0 ||
      anchorMs > session.watch.now() + 3000
    )
      throw Error("Ancrage invalide.");
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
  // The end of the session in memory, by the protocol the Mac host follows too (session-closing.cjs):
  // every closing step is attempted, the host lets go of the session whatever happened, and what failed
  // is never swallowed: kept as the outcome of this end, and written to the journal. The order is this
  // host's own, and it matters: capture stops, writes in flight land, questions and surveillance reach
  // their final states and are written, and only then is the session archived. Neither announced as
  // archived nor erased unless that step itself came back: the folder then keeps what was last confirmed,
  // and the list goes on showing the session as the manifest on disk says, cut short when that manifest
  // was written during a capture. `remove` is the explicit deletion: sealed, and only then erased.
  async leave(session, reason, remove = false) {
    this.releasing = true;
    let cancelled = [];
    try {
      const outcome = await closeSession({
        session,
        library: this.library,
        remove,
        // A session that saw no passage and no question is not an archive worth listing. Only one this
        // host started itself: an archive that was opened is never discarded for being short.
        empty: () =>
          this.fresh &&
          !this.deep.jobs.length &&
          !session.watch.questions.length &&
          !session.watch.snapshot().coverage.passages,
        // Before anything is awaited: a block whose preparation ends meanwhile is not stored in passing.
        begin: [
          "préparation média",
          () => {
            cancelled = this.cancelPreparations();
          },
        ],
        steps: [
          // A deletion is refused while its session captures: it has no capture left to stop.
          ...(remove ? [] : [["capture", () => session.pause()]]),
          ["préparation média", () => this.settleIngestions(cancelled)],
          [
            "questions",
            () =>
              settleQuestions(this.deep, reason, () =>
                this.questionSaves.flush(),
              ),
          ],
          ["surveillance", () => this.surveillance.reset(reason)],
          ["agent de chat", () => this.agent.close?.()],
        ],
        // Whatever failed above, the host lets go of this session: a new one can start.
        letGo: () => this.adopt(null),
        log: (line) => this.log(line),
      });
      const { id, archived, errors } = outcome;
      this.lastEnd = { id, archived, ...(errors.length ? { errors } : {}) };
      return outcome;
    } finally {
      this.releasing = false;
    }
  }
  // Ends the work on the session in memory and keeps it whole on disk: nothing is purged. A session this
  // host could not let go of is not said ended: whoever asked is told why, as the journal already is.
  async release(reason = "Session terminée.") {
    const session = this.session;
    if (!session) return { id: null, archived: false };
    const { refused } = await this.leave(session, reason);
    if (refused) throw refused;
    return this.lastEnd;
  }
  // "Terminer la session" archives: nothing is purged. Coalesced: a second request shares the outcome.
  end() {
    return (this.ending ||= this.exclusive(() => this.release()).finally(
      () => {
        this.ending = null;
      },
    ));
  }
  // After dir() accepted the identifier, the only way folder() fails is a session that is not there.
  async located(id) {
    this.library.dir(id);
    await this.library.folder(id).catch(() => {
      throw refusal(404, "Session introuvable.", "not-found");
    });
  }
  capturing(session = this.session) {
    return Boolean(
      session && ((session.watch.accepting && !session.readOnly) || this.ingestions.size),
    );
  }
  // Listing reads manifests only, never a saved state. The session in memory is shown from its live
  // figures: its manifest is up to 30 s old, and absent before its first passage.
  async sessions() {
    const loaded = this.session,
      current = loaded?.id || null,
      listed = await this.library.list({ current });
    let sessions = listed.map((summary) => ({
      ...summary,
      current: summary.id === current,
      readOnly: summary.id === current && loaded.readOnly,
      capturing: summary.id === current && this.capturing(loaded),
    }));
    if (loaded && !loaded.readOnly && this.sessionState) {
      const state = this.sessionState,
        stored = state.segments.filter((p) => p.available).length,
        live = {
          state: "live",
          elapsedMs: loaded.watch.now(),
          passages: state.coverage.passages,
          media: {
            stored,
            missing: state.coverage.passages - stored,
            bytes: loaded.storage().sessionBytes,
          },
        };
      if (sessions.some((summary) => summary.current))
        sessions = sessions.map((summary) =>
          summary.current ? { ...summary, ...live } : summary,
        );
      else
        sessions.unshift({
          id: current,
          title: loaded.manifest()?.title || "Session en cours",
          firstTopic: null,
          host: "server",
          createdAt: null,
          updatedAt: null,
          closedAt: null,
          legacy: false,
          current: true,
          readOnly: false,
          capturing: this.capturing(loaded),
          ...live,
        });
    }
    return {
      current: loaded
        ? { ...this.described(loaded), title: loaded.manifest()?.title || null }
        : null,
      sessions: sessions.slice(0, SESSIONS_LISTED),
      total: sessions.length,
      storage: await this.library.usage(sessions),
    };
  }
  async storageUsage() {
    const { storage } = await this.sessions();
    return { ...storage, session: this.session ? this.session.storage() : null };
  }
  // Opens an archive stopped and read-only. Nothing is written into its directory, no provider is
  // called (no warm-up, no indexing), and capture only comes back through resume().
  open(id) {
    return this.exclusive(async () => {
      if (this.closing) throw Error("Session en cours de fermeture.");
      this.library.dir(id);
      const loaded = this.session;
      if (loaded?.id === id && loaded.readOnly) return this.described(loaded);
      if (loaded?.id !== id) await this.located(id);
      if (this.capturing(loaded))
        throw refusal(
          409,
          "Arrête la capture avant d’ouvrir une autre session.",
          "capturing",
        );
      // Read before the session in memory is let go: an unreadable archive changes nothing. The
      // session in memory itself is read once it is closed, so its last state is the one reopened.
      let archive = loaded?.id === id ? null : await this.library.read(id);
      await this.release("Session fermée.");
      if (!archive) {
        await this.located(id);
        archive = await this.library.read(id);
      }
      // Same reopening as the Mac host, on the archive already read.
      const { session } = await openArchivedSession({
        ...this.sessionOptions(),
        id,
        library: { root: this.library.root, read: async () => archive },
      });
      this.adopt(session, archive.chat?.jobs || []);
      // Read-only registry: what was still moving is shown cancelled, nothing is relaunched or rewritten.
      this.surveillance.restore(archive.surveillance);
      return this.described(session);
    });
  }
  // Explicit resume of the session in memory: an opened archive leaves read-only and captures again,
  // on its own clock and numbering.
  resume(id) {
    return this.exclusive(async () => {
      if (this.closing) throw Error("Session en cours de fermeture.");
      this.library.dir(id);
      const session = this.session;
      if (session?.id !== id) {
        await this.located(id);
        throw refusal(
          409,
          "Ouvre cette session avant de reprendre la capture.",
          "not-open",
        );
      }
      if (!session.watch.accepting) {
        // Refused by the guard, with its message, while the disk is below its floor.
        await session.resume();
        this.captureEpoch++;
        // Same as at the start: never for an archive that is only being read.
        warmUp({
          chat: this.agent,
          perception: session.perception,
          sessionId: session.id,
        });
        this.emit();
      }
      return this.described(session);
    });
  }
  // Deletes one session and nothing else. The one in memory is refused while it captures; otherwise its
  // questions and surveillance are cancelled and its store is sealed before anything is erased, so
  // that no late save, vector or thumbnail can bring the directory back.
  remove(id) {
    return this.exclusive(async () => {
      this.library.dir(id);
      const session = this.session;
      if (session?.id !== id) {
        await this.located(id);
        const removed = await this.library.remove(id);
        this.emit();
        return { deleted: true, id, freedBytes: removed.freedBytes };
      }
      if (this.capturing(session))
        throw refusal(
          409,
          "Arrête la capture avant de supprimer cette session.",
          "capturing",
        );
      // Same rules as an end: nothing new is analysed for a session that is going away, a block still
      // being prepared for it is cancelled before its folder is erased, and an adapter that fails to
      // close does not keep the session from going.
      const { freedBytes, refused } = await this.leave(
        session,
        "Session supprimée.",
        true,
      );
      // Not erased "whatever happens": nothing is unless the store is really sealed and this host has
      // let go of the session. Otherwise its folder keeps what it held, and whoever asked is told why.
      if (refused) throw refused;
      this.emit();
      return { deleted: true, id, freedBytes };
    });
  }
  startSurveillance({ sessionId, instruction } = {}) {
    if (this.moving()) throw Error("Session en cours de fermeture.");
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
  // Stopping the host keeps the session whole: it is found archived at the next start.
  close() {
    this.closing = true;
    clearInterval(this.timer);
    clearInterval(this.ticker);
    return (this.closed ||= this.exclusive(async () => {
      const errors = [];
      try {
        const ended = await this.release();
        // No session to end, yet a preparation cancelled by an earlier end may still not have let go:
        // the host does not leave under it without the same bounded wait, and says so below.
        if (ended.id === null)
          await attempt(errors, "préparation média", () =>
            this.settleIngestions(this.cancelPreparations()),
          );
      } finally {
        // The surveillance role releases its provider processes whatever the end of the session did.
        await attempt(errors, "surveillance", () => this.surveillance.close());
        if (errors.length) {
          this.lastEnd = {
            id: null,
            archived: false,
            ...this.lastEnd,
            errors: [...(this.lastEnd?.errors || []), ...errors],
          };
          try {
            this.log(`TVLens — arrêt incomplet de l’hôte : ${errors.join(" ; ")}`);
          } catch {
            // lastEnd.errors contient déjà les échecs d'arrêt ; un journal indisponible ne doit pas remplacer ce résultat.
          }
        }
      }
    }));
  }
}
module.exports = {
  HeadlessRuntime,
  surveillanceHistory,
  surveillanceDetail,
  READ_ONLY,
};
