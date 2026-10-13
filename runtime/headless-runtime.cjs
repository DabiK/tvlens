const {
  sessionTimeline,
  momentDetail,
} = require("../core/session-timeline.cjs");
const { CARD_LABELS } = require("../core/surveillance.cjs");
const { randomUUID, randomBytes } = require("node:crypto");
const {
  createSessionRuntime,
  openArchivedSession,
  validateSegment,
} = require("./session-runtime.cjs");
const { createConversationRuntime } = require("./conversation-runtime.cjs");
const { createSurveillanceRuntime } = require("./surveillance-runtime.cjs");
const { CodexQuota } = require("../adapters/codex-quota.cjs");
const { DiskGuard, STORAGE_FULL } = require("../adapters/disk-guard.cjs");
const { SessionLibrary } = require("../adapters/session-library.cjs");
const {
  SimulatedSurveillanceAgent,
} = require("../adapters/simulated-surveillance-agent.cjs");

const READ_ONLY =
  "Session ouverte en lecture seule. Choisis Reprendre la capture ou Nouvelle session.";
// Light views of the state. With durable sessions the complete state weighs megabytes after a film:
// a poll gets a view that never carries the texts of every passage.
const VIEWS = ["chat", "panel"];
const PANEL_SEGMENTS = 40,
  PANEL_JOBS = 30,
  CHAT_JOBS = 8,
  PANEL_FULL_CARDS = 12,
  CARD_EXCERPT = 240,
  GAPS_TAIL = 20,
  SESSIONS_LISTED = 50,
  HISTORY_PAGE = 20,
  HISTORY_MAX = 50;
// Allow-list, not "everything but the lists": a field added to the session state later cannot make a
// polled view grow with the session.
const HEADER = [
  "id",
  "accepting",
  "asking",
  "analyzing",
  "elapsedMs",
  "capturedThroughMs",
  "analyzedThroughMs",
  "analysisLagMs",
  "contextThroughMs",
  "retentionMs",
  "retention",
  "readOnly",
  "pending",
  "audioPending",
  "visionPending",
  "lastError",
  "coverage",
];
const active = (job) => job.status === "queued" || job.status === "running";
// The transport turns `status` into the HTTP status and `code` into a reason a client can act on.
const refusal = (status, message, code) =>
  Object.assign(new Error(message), { status, code });
const clip = (value, max) =>
  typeof value === "string" && value.length > max
    ? value.slice(0, max).trimEnd() + "…"
    : value;
const ordinal = (id) => Number(String(id).split("-").pop()) || 0;

// Passage of the panel view: what a card label or a citation needs, never the transcript.
const lightPassage = (p) => ({
  id: p.id,
  startMs: p.startMs,
  endMs: p.endMs,
  status: p.status,
  audioStatus: p.audioStatus,
  visionStatus: p.visionStatus,
  available: Boolean(p.available),
  ...(p.mediaReason ? { mediaReason: p.mediaReason } : {}),
  thumbnailAvailable: Boolean(p.thumbnailAvailable),
  observation: p.observation
    ? { topic: p.observation.topic, summary: clip(p.observation.summary, 600) }
    : null,
});
// Question of a polled view: everything a card shows, whatever a later change adds to a job. The
// diagnostics named here stay in the complete state, and a finished answer no longer travels with
// the draft it replaced.
function lightJob(job) {
  const {
    audit,
    memoryPreview,
    validation,
    evidenceAtStart,
    contextReadyAt,
    firstProgressAt,
    firstUsefulAt,
    firstAgentAt,
    firstTextAt,
    sourcesReused,
    metrics,
    result,
    ...rest
  } = job;
  const light = { ...rest };
  if (metrics) {
    const { tools, evidence, ...figures } = metrics;
    light.metrics = figures;
  }
  if (result)
    light.result = {
      ...result,
      observations: (result.observations || []).map(
        ({ id, startMs, endMs }) => ({ id, startMs, endMs }),
      ),
    };
  if (job.status === "done" && result) {
    delete light.preview;
    delete light.provisional;
    delete light.activity;
  }
  return light;
}
function captureGapsOf(passages) {
  const gaps = [];
  let through = 0;
  for (const passage of passages) {
    if (passage.startMs - through > 1000)
      gaps.push({ startMs: through, endMs: passage.startMs });
    through = Math.max(through, passage.endMs);
  }
  return gaps;
}

// History of a surveillance registry, most recent first, read from memory only. One item per grouped
// result (a lot with sourced claims, or a lot of signals) and one per claim that is in no such result:
// waiting, undetermined, failed and cancelled claims stay listed with their video origin. `seq` is
// stable for an item, so a page never shifts while the registry moves.
function surveillanceHistory(registry, { beforeSeq, limit = HISTORY_PAGE } = {}) {
  if (
    beforeSeq !== undefined &&
    beforeSeq !== null &&
    !(Number.isInteger(beforeSeq) && beforeSeq > 0)
  )
    throw refusal(400, "Curseur d’historique invalide.");
  if (!Number.isInteger(limit) || limit < 1)
    throw refusal(400, "Limite d’historique invalide.");
  const items = [],
    grouped = new Set();
  for (const lot of registry.lots || []) {
    const ids = lot.kind === "signal" ? lot.claimIds : lot.sourcedClaimIds;
    if (lot.status !== "done" || !ids?.length) continue;
    for (const id of ids) grouped.add(id);
    items.push({
      seq: Math.max(...ids.map(ordinal)) * 2 + 1,
      id: lot.id,
      kind: "lot",
      cardKind: lot.kind,
      label: CARD_LABELS[lot.kind],
      status: lot.kind === "signal" ? "noted" : "sourced",
      late: false,
      startMs: Math.min(...lot.origin.map((o) => o.startMs)),
      endMs: Math.max(...lot.origin.map((o) => o.endMs)),
      text: lot.text,
      claimCount: ids.length,
      sourceCount: lot.sources.length,
      overlay: Boolean(lot.overlay),
      publishedAtMs: lot.publishedAtMs,
      finishedAt: lot.finishedAt,
    });
  }
  for (const claim of registry.claims || []) {
    if (grouped.has(claim.id)) continue;
    items.push({
      seq: ordinal(claim.id) * 2,
      id: claim.id,
      kind: "claim",
      action: claim.action,
      status: claim.status,
      late: Boolean(claim.late),
      startMs: claim.origin?.startMs ?? null,
      endMs: claim.origin?.endMs ?? null,
      text: claim.statement,
      quote: claim.origin?.quote || "",
      reason: claim.reason || claim.error || null,
      claimCount: 1,
      sourceCount: 0,
      overlay: false,
      lotId: claim.lotId,
      detectedAt: claim.detectedAt,
      finishedAt: claim.finishedAt,
    });
  }
  items.sort((a, b) => b.seq - a.seq);
  const rest = beforeSeq ? items.filter((item) => item.seq < beforeSeq) : items,
    page = rest.slice(0, Math.min(limit, HISTORY_MAX));
  return {
    sessionId: registry.sessionId,
    items: page,
    nextBeforeSeq: rest.length > page.length ? page.at(-1).seq : null,
    counts: registry.counts,
    totals: { ...registry.totals, items: items.length },
  };
}
// One result or one claim in full: text, claims, video origins, sources, uncertainties, delays.
function surveillanceDetail(registry, id) {
  if (typeof id !== "string" || !/^(?:lot|claim)-\d+$/.test(id))
    throw refusal(400, "Identifiant de surveillance invalide.");
  const lot = registry.lots.find((item) => item.id === id),
    claim = registry.claims.find((item) => item.id === id);
  if (!lot && !claim)
    throw refusal(404, "Élément de surveillance introuvable.", "not-found");
  const ids = lot ? lot.claimIds : [claim.id];
  return {
    sessionId: registry.sessionId,
    id,
    kind: lot ? "lot" : "claim",
    lot: lot || registry.lots.find((item) => item.id === claim.lotId) || null,
    claims: registry.claims.filter((item) => ids.includes(item.id)),
  };
}

class HeadlessRuntime {
  constructor(options) {
    this.options = options;
    this.listeners = new Set();
    this.ingestions = new Set();
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
      getInstruction: () => this.activeInstruction(),
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
          session.store.saveResearch(state).catch(() => {});
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
    } catch {}
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
  // The instruction of the surveillance active on the loaded session, or nothing. Never throws.
  activeInstruction() {
    try {
      const state = this.surveillance?.snapshot?.({ brief: true });
      return state?.enabled && state.sessionId === this.session?.id
        ? state.activation?.instruction
        : undefined;
    } catch {
      return undefined;
    }
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
    const state = sessionId ? this.sessionState : null,
      jobs = this.deep.snapshot().jobs,
      derived = { revision: this.revision, sessionId, jobTotal: jobs.length };
    // Every question still moving, then the most recent ones: a client merges by id and never reads
    // an absence as a deletion.
    const recent = (count) =>
      jobs
        .filter((job, i) => active(job) || i >= jobs.length - count)
        .map(lightJob);
    derived.chatJobs = recent(CHAT_JOBS);
    derived.panelJobs = recent(PANEL_JOBS);
    if (!state)
      return (this.derived = {
        ...derived,
        header: null,
        timeline: sessionTimeline(null),
        captureGaps: [],
        captureGapCount: 0,
      });
    const all = [...state.history, ...state.segments],
      gaps = captureGapsOf(all),
      timeline = sessionTimeline(state),
      full = timeline.cards.length - PANEL_FULL_CARDS;
    // Older cards keep their place, title, interval and thumbnail, with an excerpt of their summary:
    // the whole text comes back with the detail of the moment.
    timeline.cards = timeline.cards.map((card, i) => {
      if (i >= full || !card.summary || card.summary.length <= CARD_EXCERPT)
        return card;
      const { summaryLimits, ...light } = card;
      return {
        ...light,
        summary: clip(card.summary, CARD_EXCERPT),
        summaryClipped: true,
      };
    });
    return (this.derived = {
      ...derived,
      header: {
        ...Object.fromEntries(HEADER.map((key) => [key, state[key]])),
        title: this.session.manifest()?.title || null,
        passages: all.length,
        gapCount: state.gaps.length,
        gaps: state.gaps.slice(-GAPS_TAIL),
        audioGapCount: state.audioGaps.length,
        visionGapCount: state.visionGaps.length,
      },
      segments: state.segments.slice(-PANEL_SEGMENTS).map(lightPassage),
      // History entries are summaries without media; everything else is replayable unless listed here.
      unavailableIds: [
        ...state.history.map((p) => p.id),
        ...state.segments.filter((p) => !p.available).map((p) => p.id),
      ],
      timeline,
      captureGaps: gaps.slice(-GAPS_TAIL),
      captureGapCount: gaps.length,
    });
  }
  view(name) {
    const derived = this.derive(),
      watch = this.session?.watch;
    // What moves without a publication is read live: the clock, and the flags a closing does not announce.
    const session = derived.header && {
      ...derived.header,
      accepting: watch.accepting,
      asking: Boolean(watch.asking),
      readOnly: watch.readOnly,
      elapsedMs: watch.now(),
      storage: this.session.storage(),
    };
    const chat = (jobs) => ({
      jobs,
      total: derived.jobTotal,
      timeoutMs: this.deep.timeoutMs,
    });
    const common = {
      view: name,
      revision: this.revision,
      serverNowMs: this.wallClock(),
      transcription: { language: this.options.config?.transcriptionLanguage || "fr" },
      surveillance: this.surveillance.snapshot({ brief: true }),
      storage: this.storage(),
    };
    if (name === "chat")
      return { ...common, session, chat: chat(derived.chatJobs) };
    return {
      ...common,
      session: session && {
        ...session,
        segments: derived.segments,
        unavailableIds: derived.unavailableIds,
      },
      timeline: derived.timeline,
      captureGaps: derived.captureGaps,
      captureGapCount: derived.captureGapCount,
      chat: chat(derived.panelJobs),
    };
  }
  // What the ambient display polls with the panel closed: a few kilobytes, memory only.
  overlay() {
    const state = this.surveillance.snapshot({ brief: true }),
      watch = this.session?.watch;
    return {
      sessionId: this.session?.id || null,
      enabled: state.enabled,
      accepting: Boolean(watch?.accepting),
      readOnly: Boolean(watch?.readOnly),
      elapsedMs: watch ? watch.now() : null,
      activity: state.activity,
      // How the registry is kept: the ambient display tells a restoration from a session without results.
      registry: state.registry || null,
      overlay: state.overlay,
      signals: state.signals,
      storage: { state: this.storage().state },
      revision: this.revision,
      serverNowMs: this.wallClock(),
    };
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
    this.deep.restore(jobs);
    this.session = session;
    this.sessionState = session ? session.watch.snapshot() : null;
    this.fresh = false;
    this.captureEpoch++;
    this.emit();
  }
  // Same warm-up as the Mac host: the first answer and the first description should not pay the
  // connection. Never for an archive that is only being read.
  warmUp(session) {
    this.agent.prepare?.(session.id).catch(() => {});
    Promise.resolve(
      session.perception?.agent?.prepare?.(session.id + "-observe"),
    ).catch(() => {});
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
        this.warmUp(session);
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
  async ingest(input) {
    const session = this.admit(input?.sessionId);
    validateSegment(input, session.watch.now());
    if (this.moving()) throw Error("Session en cours de fermeture.");
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
  async settleQuestions(reason) {
    this.deep.cancelAll(reason);
    // The last state of each question is published, hence saved, before its promise settles.
    await Promise.allSettled(this.deep.jobs.map((job) => job.done));
  }
  // One closing step of the session in memory. It is attempted whatever the steps before it did, and a
  // failure is kept in `errors` instead of stopping the end of the session half-way: an adapter that
  // fails to close neither keeps the session from being archived nor leaves the others open.
  async attempt(errors, step, work) {
    try {
      return await work();
    } catch (error) {
      errors.push(`${step} : ${String(error?.message || error).slice(0, 200)}`);
    }
  }
  // Closing failures are never swallowed: kept as the outcome of the last end, and written to the journal.
  ended(outcome) {
    this.lastEnd = outcome;
    if (outcome.errors?.length)
      try {
        this.log(
          `TVLens — fermeture incomplète de la session ${outcome.id} : ${outcome.errors.join(" ; ")}`,
        );
      } catch {}
    return outcome;
  }
  // Ends the work on the session in memory and keeps it whole on disk. The order matters: capture
  // stops, writes in flight land, questions and surveillance reach their final states and are written,
  // and only then is the session closed.
  async release(reason = "Session terminée.") {
    const session = this.session;
    if (!session) return { id: null, archived: false };
    this.releasing = true;
    const errors = [];
    try {
      // The session is ending: a passage still landing is stored and saved, but no analysis is started
      // for it only to be given up a moment later. Set before waiting for the ingestions in flight.
      session.watch.ending = true;
      await this.attempt(errors, "capture", () => session.pause());
      await Promise.allSettled([...this.ingestions]);
      const asked = this.deep.jobs.length > 0 || session.watch.questions.length > 0;
      await this.attempt(errors, "questions", () => this.settleQuestions(reason));
      await this.attempt(errors, "surveillance", () =>
        this.surveillance.reset(reason),
      );
      await this.attempt(errors, "agent de chat", () => this.agent.close?.());
      // A session that saw no passage and no question is not an archive worth listing. Only one this
      // host started itself: an archive that was opened is never discarded for being short.
      const empty =
        this.fresh && !asked && !session.watch.snapshot().coverage.passages;
      // Neither announced as archived nor erased unless the step itself came back: archive() rejects
      // when the disk refused one of the last states or the manifest. The folder then keeps what was
      // last confirmed, and the list goes on showing the session as the manifest on disk says: cut
      // short when that manifest was written during a capture.
      let kept = false,
        sealed = false;
      await this.attempt(errors, empty ? "scellement" : "archive", async () => {
        if (empty) await session.seal();
        else await session.archive();
        kept = !empty;
        sealed = empty;
      });
      errors.push(...(session.closeErrors || []));
      // Whatever failed above, the host lets go of this session: a new one can start.
      this.adopt(null);
      if (sealed) await this.library.remove(session.id).catch(() => {});
      return this.ended({
        id: session.id,
        archived: kept,
        ...(errors.length ? { errors } : {}),
      });
    } finally {
      this.releasing = false;
    }
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
        this.warmUp(session);
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
      this.releasing = true;
      const errors = [];
      try {
        // Same rule as an end: nothing new is analysed for a session that is going away.
        session.watch.ending = true;
        await Promise.allSettled([...this.ingestions]);
        // Same rule as an end: an adapter that fails to close does not keep the session from going.
        await this.attempt(errors, "questions", () =>
          this.settleQuestions("Session supprimée."),
        );
        await this.attempt(errors, "surveillance", () =>
          this.surveillance.reset("Session supprimée."),
        );
        await this.attempt(errors, "agent de chat", () => this.agent.close?.());
        // Not attempted "whatever happens": nothing is erased unless the store is really sealed.
        await session.seal();
        errors.push(...(session.closeErrors || []));
        this.ended({ id, archived: false, ...(errors.length ? { errors } : {}) });
        this.adopt(null);
        // A session that never reached the disk has nothing to erase; any other failure is reported.
        const onDisk = await this.library.folder(id).then(
          () => true,
          () => false,
        );
        const removed = onDisk
          ? await this.library.remove(id)
          : { freedBytes: 0 };
        this.emit();
        return { deleted: true, id, freedBytes: removed.freedBytes };
      } finally {
        this.releasing = false;
      }
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
      try {
        await this.release();
      } finally {
        // The surveillance role releases its provider processes whatever the end of the session did.
        const errors = [];
        await this.attempt(errors, "surveillance", () =>
          this.surveillance.close(),
        );
        if (errors.length) {
          this.lastEnd = {
            id: null,
            archived: false,
            ...this.lastEnd,
            errors: [...(this.lastEnd?.errors || []), ...errors],
          };
          try {
            this.log(`TVLens — arrêt incomplet de l’hôte : ${errors.join(" ; ")}`);
          } catch {}
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
  VIEWS,
};
