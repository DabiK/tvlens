const { domainError } = require('./shared/domain-error.cjs');
const TVLENS_CAPTURE_TIME_INVALID = 'TVLENS_CAPTURE_TIME_INVALID';
const TVLENS_CAPTURE_ORDER_INVALID = 'TVLENS_CAPTURE_ORDER_INVALID';
const TVLENS_CAPTURE_AUDIO_REQUIRED = 'TVLENS_CAPTURE_AUDIO_REQUIRED';
const { perceptionContext } = require('./perception-context.cjs');
const { hasUsableObservation } = require('./shared/passage-text.cjs');
const { latencySummary } = require('./latency-trace.cjs');
const { holdsMedia } = require('./clip-container.cjs');
const { publishState } = require('./state-publication.cjs');
const { PassageEvents } = require('./passage-events.cjs');
const memory = require('./memory/index.cjs');
const { TVLENS_SESSION_STOPPED } = memory;
const STORAGE_FULL = 'TVLENS_STORAGE_FULL', INTERRUPTED = 'Analyse interrompue à la fermeture de la session.';
const LANE_LOSSES = {
  audio: { backlog: 'audioSkipped', expired: 'audioExpired', error: 'audioError' },
  vision: { backlog: 'visionSkippedBacklog', held: 'visionSkippedAsking', expired: 'visionExpired', error: 'visionError' },
};
const unfinished = status => status === 'queued' || status === 'analyzing';
// The files of a passage are there, whether or not its video plays: a recorder that received no frame leaves a
// container without a single image (mediaReason 'unreadable'), next to the images and the sound kept at capture.
// `available` only says that the video can be replayed.
const UNREADABLE = 'unreadable', IMAGES_ABSENT = 'images-absent';
const stored = segment => Boolean(segment.available) || [UNREADABLE, IMAGES_ABSENT].includes(segment.mediaReason);
// A passage known only by its media on disk: its analysis never reached the saved state. It takes its
// place on the session clock, unanalysed, with its declared media; nothing is analysed again.
const recoveredPassage = ({ id, startMs, endMs, hasAudio = false, media }) => ({
  id, startMs, endMs, status: 'error', error: INTERRUPTED, hasAudio: Boolean(hasAudio),
  ...capturedMedia({ media }), observation: null, revision: 0,
});
function capturedModalities(input, hasAudio) {
  return {
    audio: hasAudio ? 'present' : 'absent',
    images: input.media?.video !== false && input.frames?.length ? 'present' : 'absent',
    video: input.media?.video !== false && input.clip?.byteLength ? 'present' : 'absent',
  };
}

function capturedMedia(input) {
  if (input.media?.video === false) {
    return { available: false, mediaReason: IMAGES_ABSENT, hasImages: false, visionStatus: 'absent' };
  }
  // Un refus de lecture du conteneur ne prouve pas l'absence du média.
  try {
    if (holdsMedia(input.clip) === false) return { available: false, mediaReason: UNREADABLE };
  } catch { /* aucune conclusion sur ce clip */ }
  return { available: true };
}

function fallbackMediaReason(source, formerFormat) {
  if (formerFormat) return 'not-kept';
  return source.available ? 'missing' : 'expired';
}

function reopenedPassage(source, { kept, hasMedia, hasThumbnail, formerFormat }, losses) {
  const passage = { ...source };
  // Availability is what the disk says now, not what the session believed when it stopped.
  const present = kept && Boolean(hasMedia(passage.id));
  // Une absence déclarée survit au disque ; la disparition des fichiers ne retire que leur disponibilité.
  const reason = source.hasImages === false ? IMAGES_ABSENT : source.mediaReason;
  const withoutVideo = [UNREADABLE, IMAGES_ABSENT].includes(reason);
  passage.available = present && !withoutVideo;
  if (passage.available) delete passage.mediaReason;
  else if (withoutVideo) passage.mediaReason = present ? reason : 'missing';
  else passage.mediaReason = source.mediaReason || fallbackMediaReason(source, formerFormat);
  if (hasThumbnail) passage.thumbnailAvailable = Boolean(hasThumbnail(passage.id));
  // No analysis is resumed: what was in flight is closed as partial evidence or as an explicit failure.
  if (unfinished(passage.audioStatus)) {
    passage.audioStatus = 'error';
    passage.audioError = INTERRUPTED;
    losses.audioError++;
  }
  if (unfinished(passage.visionStatus)) {
    passage.visionStatus = 'error';
    passage.visionError = INTERRUPTED;
    losses.visionError++;
  }
  if (unfinished(passage.status)) {
    passage.status = hasUsableObservation({ ...passage, status: 'partial' }) ? 'partial' : 'error';
    if (passage.status === 'error') passage.error = INTERRUPTED;
  }
  if (passage.stage) passage.stage = null;
  return passage;
}

// Portable application core: no Electron, filesystem or provider dependency.
class WatchSession {
  #lifecycle = new memory.MemoryLifecycleState();
  #questionPending = false;
  #questionIntakeClosed = false;
  #events;
  #lanes;
  #modalities = new Map();

  constructor({ id, now, perception, media, archive, thumbnails, storage,
    onInvalidate = () => {}, onEvents = () => {}, onPublicationError = () => {},
    maxPending = 2, visionDuringAsk = false }) {
    Object.assign(this, { id, now, perception, media, archive, thumbnails, storage,
      onInvalidate, onEvents, onPublicationError, maxPending, visionDuringAsk });
    this.#events = new PassageEvents(id);
    this.segments = [];
    this.history = [];
    this.questions = [];
    // Counted where the event happens, never recomputed from the passages. Two more only exist once they
    // happened: visionRetried, the second descriptions started, and visionRecovered, those that succeeded.
    // visionError stays what was lost for good.
    this.losses = { audioSkipped: 0, audioExpired: 0, visionSkippedBacklog: 0, visionSkippedAsking: 0, visionExpired: 0, audioError: 0, visionError: 0 };
    this.sequence = 0;
    this.storageError = null;
    // Set by a save the archive refused and cleared only by a save that lands: no analysis, however
    // successful, says that the state is on disk.
    this.saveError = null;
    // Ingests under way, and media found on disk at reopening that no passage could be made of.
    this.landing = new Set(); this.unplacedMedia = 0;
    this.apiCalls = 0; this.apiCost = 0; this.lastError = null; this.ingestChain = Promise.resolve();
    this.#lanes = new memory.PerceptionLanes({
      maxPending,
      now: () => this.now(),
      readMedia: passageId => this.media.read(passageId),
      transcribe: input => this.perception.transcribe(input),
      observeVisual: input => this.perception.observeVisual(input),
      hasMedia: stored,
      hasImages: segment => segment.hasImages !== false,
      isEnding: () => this.ending,
      isReadOnly: () => this.readOnly,
      contextFor: segment => perceptionContext(this, segment),
      update: (segment, lane, cause) => this.#updateLane(segment, lane, cause),
      addUsage: ({ calls = 0, cost = 0 }) => {
        this.apiCalls += calls;
        this.apiCost += cost;
      },
      count: name => { this.losses[name] = (this.losses[name] || 0) + 1; },
      setError: message => { this.lastError = message; },
      clearErrorThrough: segment => this.#clearErrorThrough(segment),
      publish: () => this.emit(),
      persist: () => this.persist(),
    });
  }

  get asking() { return this.#questionPending; }
  get running() { return this.perceptionState().analyzing; }
  get closed() { return this.#lifecycle.closed; }
  get ending() { return this.#lifecycle.ending; }
  get accepting() { return this.#lifecycle.accepting; }
  get readOnly() { return this.#lifecycle.readOnly; }

  perceptionState(now = this.now()) {
    const { heldMs, ...state } = this.#lanes.state(now);
    return { ...state, visionBlockedMs: heldMs };
  }

  #updateLane(segment, lane, cause) {
    const code = cause === 'held' ? 'asking' : cause;
    if (cause) {
      this.losses[LANE_LOSSES[lane][cause]]++;
      if (lane === 'vision' && ['held', 'backlog'].includes(cause)) segment.visionSkipReason = code;
    }
    this.#events.update(segment, lane, code);
  }

  #clearErrorThrough(segment) {
    // Un succès ancien ne masque pas l'échec audio d'un passage arrivé pendant son appel vision.
    const outstanding = this.segments.slice().reverse().find(s =>
      s.endMs >= segment.endMs && (s.audioError || s.visionError));
    this.lastError = outstanding?.visionError || outstanding?.audioError || null;
  }

  setQuestionPending(busy) {
    if (this.#questionIntakeClosed || this.#questionPending === busy) return;
    this.#questionPending = busy;
    this.#syncVisionPolicy();
    if (this.closed || this.ending) return;
    this.emit();
    if (!busy) queueMicrotask(() => this.drain());
  }

  // Empêche de lancer une analyse qui serait abandonnée à la fermeture, sans fermer l'admission des passages.
  beginEnding() {
    this.#lifecycle = this.#lifecycle.beginEnding();
  }

  // Empêche une nouvelle question ou un nouveau passage pendant l'attente des écritures déjà admises.
  closeIntake() {
    // Le refus des questions survit à une notification de fin arrivée pendant la fermeture.
    this.#questionIntakeClosed = true;
    this.#questionPending = true;
    this.#syncVisionPolicy();
    this.#lifecycle = this.#lifecycle.closeIntake();
  }

  async ingest(input) {
    if (!this.accepting) throw domainError(TVLENS_SESSION_STOPPED, 'La session est arrêtée.');
    if (!Number.isFinite(input.startMs) || !Number.isFinite(input.endMs) || input.startMs < 0
      || input.endMs <= input.startMs || input.endMs - input.startMs > 60000)
      throw domainError(TVLENS_CAPTURE_TIME_INVALID, 'Horodatage invalide.');
    if (input.media?.audio === false || (input.media?.video === false && !input.audio?.byteLength))
      throw domainError(TVLENS_CAPTURE_AUDIO_REQUIRED, 'Le passage déclaré doit contenir du son.');
    // Tracked until it has landed whole (media, passage, thumbnail): a host ending the session waits on landed().
    const landing = this.land(input, this.now());
    this.landing.add(landing);
    try { return await landing; } finally { this.landing.delete(landing); }
  }
  // Settles once every ingest already admitted has landed or failed. Never rejects.
  landed() { return Promise.allSettled([...this.landing]); }
  async land(input, receivedMs) {
    // Overlapping calls are admitted in call order; a rejected one must not block the next.
    const admitted = this.ingestChain = this.ingestChain.catch(() => {}).then(async () => {
      const segment = this.#preparePassage(input, receivedMs);
      try { await this.media.put(segment.id, input); }
      catch (error) {
        // Out of room: nothing was stored, so no passage exists. Capture stops; nothing is deleted to make space.
        if (error?.code === STORAGE_FULL) {
          const admissionWasOpen = this.accepting;
          this.#lifecycle = this.#lifecycle.suspendAdmission();
          this.storageError = error.message;
          if (admissionWasOpen) this.#events.suspended(input, STORAGE_FULL);
          this.emit();
          await this.persist();
        }
        throw error;
      }
      this.#modalities.set(segment.id, capturedModalities(input, segment.hasAudio));
      this.segments.push(segment);
      this.#events.received(segment);
      // Counted once the passage exists: a refused write leaves no passage and no count.
      const captureLoss = segment.hasImages === false ? 'imagesAbsent' : null;
      const loss = captureLoss || (segment.mediaReason === UNREADABLE ? 'videoUnreadable' : null);
      if (loss) {
        this.losses[loss] = (this.losses[loss] || 0) + 1;
        this.#events.update(segment);
      }
      // A write that was under way when the session closed still lands, but nothing is queued for analysis.
      // Nor while its host is ending it: the passage is kept, replayable, and reopens as unanalysed.
      this.#lanes.enqueue(segment);
      // The very first passage, and one landing after close(), are saved before their identifier is handed
      // back: a session cut during its first analysis reopens, and closing never leaves media the saved
      // state does not know. Queued ahead of the publication, without delaying the analysis.
      const saving = this.closed || this.segments.length + this.history.length === 1 ? this.persist() : null;
      this.emit(); this.drain();
      if (saving) await saving;
      return segment;
    });
    const segment = await admitted;
    // La miniature ne retarde pas le départ des analyses ; son écriture reste attendue par l’ingestion.
    if (this.thumbnails && segment.hasImages !== false) {
      let available;
      try {
        await this.thumbnails.put(segment.id, input.frames?.[0]?.dataUrl);
        available = true;
      }
      catch { available = false; }
      if (Boolean(segment.thumbnailAvailable) !== available) this.#events.update(segment);
      segment.thumbnailAvailable = available;
      this.emit();
    }
    return segment.id;
  }

  #preparePassage(input, receivedMs) {
    if (this.closed) throw domainError(TVLENS_SESSION_STOPPED, 'La session est arrêtée.');
    // Les passages historiques comptent aussi : reprendre une archive ne permet pas de rejouer son dernier bloc.
    const previous = this.segments.at(-1) ?? this.history.at(-1);
    if (previous && input.startMs < previous.endMs - 100)
      throw domainError(TVLENS_CAPTURE_ORDER_INVALID, 'Les segments doivent suivre l’ordre d’observation.');
    const segment = {
      id: `moment-${++this.sequence}`, startMs: input.startMs, endMs: input.endMs,
      status: 'queued', hasAudio: Boolean(input.audio?.byteLength), ...capturedMedia(input),
      observation: null, receivedMs, revision: 0,
    };
    const assembleMs = input.ingest && typeof input.ingest === 'object' && !Array.isArray(input.ingest) ? input.ingest.assembleMs : null;
    if (Number.isFinite(assembleMs) && assembleMs >= 0) segment.ingest = { assembleMs };
    return segment;
  }

  #syncVisionPolicy() {
    this.#lanes.setVisionHeld(this.asking && !this.visionDuringAsk);
  }

  drain() {
    this.#syncVisionPolicy();
    this.#lanes.drain();
  }

  // Does not wait for a write still under way, which may never return: that passage is saved when it
  // lands (see land). A host that wants one final saved state waits on landed() first, as the shared runtime does.
  async close() {
    this.#lifecycle = this.#lifecycle.close();
    this.#lanes.close();
    await this.persist();
  }

  async resume() {
    // The only way out of a reopened archive, and of a capture stopped for lack of room.
    this.#lifecycle = this.#lifecycle.resume();
    this.storageError = null;
    // Published at once, like the pause below, and settled only once the state has been saved or refused:
    // whoever awaits a resume or a pause waits for the disk, whoever watches the state does not.
    this.emit();
    this.drain();
    await this.persist();
  }
  async stop() {
    this.#lifecycle = this.#lifecycle.pause();
    this.emit();
    await this.persist();
  }
  // Reopens a saved session stopped, at its archived instant. Synchronous and silent: nothing is written,
  // analysed or sent anywhere, and capture only comes back through an explicit resume().
  restore(archived, { hasMedia = () => false, hasThumbnail, orphans = [] } = {}) {
    const restoredLifecycle = this.#lifecycle.restore();
    if (this.sequence || this.segments.length || this.history.length || this.questions.length) throw memory.restorationRefusal();
    if (!archived || archived.id !== this.id) throw new Error('Archive incompatible avec cette session.');
    // Decoded before anything is restored: a historical document comes back as saved, a versioned one without its markers.
    const saved = memory.fromArchive(archived);
    // Saved before durable retention existed: its raw media were never meant to be kept.
    const formerFormat = saved.retention === undefined;
    const reopen = (source, kept) => reopenedPassage(source, { kept, hasMedia, hasThumbnail, formerFormat }, this.losses);
    this.#restoreLosses(saved);
    // A summary whose media is gone stays a summary: only passages still listed with their media can be replayed.
    this.history = (saved.history || []).map(passage => { const { available, ...summary } = reopen(passage, false); return summary; });
    this.segments = saved.segments.map(passage => reopen(passage, true));
    this.questions = (saved.questions || []).map(question => ({ ...question }));
    this.apiCalls = Number.isFinite(saved.apiCalls) ? saved.apiCalls : 0; this.apiCost = Number.isFinite(saved.apiCost) ? saved.apiCost : 0;
    // Past every number already used, including media left on disk by an interrupted ingest: never overwritten.
    this.sequence = Math.max(0, ...[...this.history, ...this.segments].map(passage => passage.id).concat(orphans).map(id => Number(/^moment-(\d+)$/.exec(id)?.[1]) || 0));
    // Counted and reported, never shown as a passage: nothing says where they belong on the session clock.
    this.unplacedMedia = orphans.length || 0;
    this.#lifecycle = restoredLifecycle;
    this.lastError = null;
  }

  #restoreLosses(saved) {
    for (const key of Object.keys(this.losses)) if (Number.isFinite(saved.coverage?.[key])) this.losses[key] = saved.coverage[key];
    // Counted only where it happened: a session without such a passage keeps the counters it always had.
    if (saved.coverage?.videoUnreadable > 0) this.losses.videoUnreadable = saved.coverage.videoUnreadable;
    if (saved.coverage?.imagesAbsent > 0) this.losses.imagesAbsent = saved.coverage.imagesAbsent;
    // Likewise, and only as counts this session can have written: one second description per passage at most, and
    // no more recoveries than second descriptions.
    const counted = (value, most) => Number.isInteger(value) && value > 0 && value <= most ? value : 0;
    const passageCount = saved.segments.length + (saved.history || []).length;
    const retried = counted(saved.coverage?.visionRetried, passageCount);
    const recovered = counted(saved.coverage?.visionRecovered, retried);
    if (retried) this.losses.visionRetried = retried;
    if (recovered) this.losses.visionRecovered = recovered;
    if (Number.isFinite(saved.coverage?.visionBlockedMs)) this.#lanes.restoreHeldMs(saved.coverage.visionBlockedMs);
  }
  memoryView() {
    return memory.createMemoryView(this, this.#modalities);
  }

  readPublicationStatus() {
    const lanes = this.perceptionState();
    return {
      accepting: this.accepting, readOnly: this.readOnly, unplacedMedia: this.unplacedMedia,
      retention: 'until-deleted', retentionMs: null,
      asking: this.asking, analyzing: lanes.analyzing,
      pending: lanes.pending, audioPending: lanes.audioPending, visionPending: lanes.visionPending,
      lastError: this.storageError || this.saveError || this.lastError,
      visionBlockedMs: lanes.visionBlockedMs,
    };
  }

  readHistoricalQuestions() {
    return structuredClone(this.questions);
  }

  readUsage() {
    return { apiCalls: this.apiCalls, apiCost: this.apiCost };
  }

  memoryPassage(id) {
    return memory.readMemoryPassage(this, id, this.#modalities);
  }

  memoryPassages(ids) {
    return memory.readMemoryPassages(this, ids, this.#modalities);
  }

  recentMemoryPassages(limit) {
    return memory.recentMemoryPassages(this, limit, this.#modalities);
  }

  snapshot() {
    const all = [...this.history, ...this.segments], now = this.now();
    const capturedThroughMs = all.at(-1)?.endMs || 0;
    const analyzedThroughMs = all.filter(s => s.status === 'ready').at(-1)?.endMs || 0;
    const lanes = this.perceptionState(now);
    const { gaps, audioGaps, visionGaps, coverage } = memory.calculateCoverage({
      passages: all, losses: this.losses, visionBlockedMs: lanes.visionBlockedMs,
    });
    return {
      id: this.id, accepting: this.accepting, asking: this.asking, analyzing: lanes.analyzing,
      elapsedMs: now, capturedThroughMs, analyzedThroughMs,
      analysisLagMs: Math.max(0, capturedThroughMs - analyzedThroughMs),
      contextThroughMs: all.filter(hasUsableObservation).at(-1)?.endMs || 0,
      gaps,
      retentionMs: null,
      retention: 'until-deleted',
      readOnly: this.readOnly, unplacedMedia: this.unplacedMedia, apiCalls: this.apiCalls, apiCost: this.apiCost,
      pending: lanes.pending, audioPending: lanes.audioPending, visionPending: lanes.visionPending,
      // A capture stopped for lack of room keeps saying so, and so does a state that was not saved: a late
      // analysis must not clear the reason.
      lastError: this.storageError || this.saveError || this.lastError,
      // Les ajouts ultérieurs ne doivent pas modifier les listes d'un état en attente d'écriture.
      history: [...this.history], questions: [...this.questions],
      latency: latencySummary(all), coverage, audioGaps,
      // Le snapshot historique omet une cause vide ; la consultation conserve ses causes nulles explicites.
      visionGaps: visionGaps.map(({ reason, ...gap }) => ({ ...gap, ...(reason ? { reason } : {}) })),
      // Cached figures supplied by the host (free space, volume of this session): never measured here.
      storage: this.storage ? this.storage() : null,
      segments: this.segments.map(s => ({ ...s })),
    };
  }
  emit() {
    this.#events.publish(events => this.onEvents(events), this.onPublicationError);
    if (this.closed) return;
    publishState(() => this.onInvalidate({ type: 'MemoryInvalidated', sessionId: this.id }),
      this.onPublicationError, { origin: 'watch-session', sessionId: this.id });
  }
  async persist() {
    // Opening, pausing or closing a reopened archive leaves its files untouched.
    if (this.readOnly) return;
    // Never rejects: an analysis or a pause must not fail for it. A host that needs the state confirmed on
    // disk, as before saying a session archived, asks its archive (see the shared runtime).
    let refused = null;
    try { await this.archive.save(memory.toArchive(this.snapshot())); }
    catch { refused = 'Impossible de sauvegarder le résumé de session.'; }
    // States are published before they are saved: what the save answered is said when it changes what the
    // state says, a refusal or its end, and only then. Compared when the answer comes, not when it was asked
    // for: several saves may be under way.
    const changed = refused !== this.saveError;
    this.saveError = refused;
    if (changed) this.emit();
  }
}

module.exports = {
  WatchSession, recoveredPassage, TVLENS_CAPTURE_TIME_INVALID, TVLENS_CAPTURE_ORDER_INVALID, TVLENS_CAPTURE_AUDIO_REQUIRED, TVLENS_SESSION_STOPPED,
};
