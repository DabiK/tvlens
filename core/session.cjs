const { domainError } = require('./shared/domain-error.cjs');
const TVLENS_CAPTURE_TIME_INVALID = 'TVLENS_CAPTURE_TIME_INVALID';
const TVLENS_CAPTURE_ORDER_INVALID = 'TVLENS_CAPTURE_ORDER_INVALID';
const TVLENS_SESSION_STOPPED = 'TVLENS_SESSION_STOPPED';
const { perceptionContext } = require('./perception-context.cjs');
const { hasUsableObservation } = require('./passage-text.cjs');
const { latencySummary } = require('./latency-trace.cjs');
const { holdsMedia } = require('./clip-container.cjs');
const { publishState } = require('./state-publication.cjs');
const { PassageEvents } = require('./passage-events.cjs');
const memory = require('./memory/index.cjs');
const STORAGE_FULL = 'TVLENS_STORAGE_FULL', INTERRUPTED = 'Analyse interrompue à la fermeture de la session.';
const LANE_LOSSES = {
  audio: { backlog: 'audioSkipped', expired: 'audioExpired', error: 'audioError' },
  vision: { backlog: 'visionSkippedBacklog', held: 'visionSkippedAsking', expired: 'visionExpired', error: 'visionError' },
};
const unfinished = status => status === 'queued' || status === 'analyzing';
// The files of a passage are there, whether or not its video plays: a recorder that received no frame leaves a
// container without a single image (mediaReason 'unreadable'), next to the images and the sound kept at capture.
// `available` only says that the video can be replayed.
const UNREADABLE = 'unreadable', stored = segment => Boolean(segment.available) || segment.mediaReason === UNREADABLE;
// A passage known only by its media on disk: its analysis never reached the saved state. It takes its
// place on the session clock, replayable and unanalysed; nothing is analysed again.
const recoveredPassage = ({ id, startMs, endMs, hasAudio = false }) => ({ id, startMs, endMs, status: 'error', error: INTERRUPTED, hasAudio: Boolean(hasAudio), available: true, observation: null, revision: 0 });
function capturedModalities(input, hasAudio) {
  return {
    audio: hasAudio ? 'present' : 'absent',
    images: input.frames?.length ? 'present' : 'absent',
    video: input.clip?.byteLength ? 'present' : 'absent',
  };
}

// Portable application core: no Electron, filesystem or provider dependency.
class WatchSession {
  #questionPending = false;
  #questionIntakeClosed = false;
  #events;
  #lanes;
  #modalities = new Map();

  constructor({ id, now, perception, media, archive, thumbnails, storage,
    onChange = () => {}, onEvents = () => {}, onPublicationError = () => {},
    retentionMs = Infinity, maxPending = 2, visionDuringAsk = false }) {
    // La durée reste une API historique du cœur ; les hôtes utilisent la conservation sans expiration.
    // Un état sauvegardé porte null (JSON ne connaît pas Infinity), normalisé avant tout calcul.
    retentionMs = Number.isFinite(retentionMs) && retentionMs > 0 ? retentionMs : Infinity;
    Object.assign(this, { id, now, perception, media, archive, thumbnails, storage,
      onChange, onEvents, onPublicationError, retentionMs, maxPending, visionDuringAsk });
    this.#events = new PassageEvents(id);
    this.segments = [];
    this.history = [];
    this.questions = [];
    this.closed = false;
    // Raised by a host that is ending the session and still waits for a write under way: from then on no
    // analysis is started, since close() would abandon it at once.
    this.ending = false;
    // Counted where the event happens, never recomputed from the passages. Two more only exist once they
    // happened: visionRetried, the second descriptions started, and visionRecovered, those that succeeded.
    // visionError stays what was lost for good.
    this.losses = { audioSkipped: 0, audioExpired: 0, visionSkippedBacklog: 0, visionSkippedAsking: 0, visionExpired: 0, audioError: 0, visionError: 0 };
    this.unremoved = new Set();
    this.sequence = 0;
    this.accepting = true;
    this.readOnly = false; this.storageError = null;
    // Set by a save the archive refused and cleared only by a save that lands: no analysis, however
    // successful, says that the state is on disk.
    this.saveError = null;
    // Ingests under way, and media found on disk at reopening that no passage could be made of.
    this.landing = new Set(); this.unplacedMedia = 0;
    this.apiCalls = 0; this.apiCost = 0; this.lastError = null; this.pruneChain = Promise.resolve(); this.ingestChain = Promise.resolve();
    this.#lanes = new memory.PerceptionLanes({
      maxPending,
      now: () => this.now(),
      readMedia: passageId => this.media.read(passageId),
      transcribe: input => this.perception.transcribe(input),
      observeVisual: input => this.perception.observeVisual(input),
      hasMedia: stored,
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
    this.ending = true;
  }

  // Empêche une nouvelle question ou un nouveau passage pendant l'attente des écritures déjà admises.
  closeIntake() {
    // Le refus des questions survit à une notification de fin arrivée pendant la fermeture.
    this.#questionIntakeClosed = true;
    this.#questionPending = true;
    this.#syncVisionPolicy();
    this.accepting = false;
  }

  async ingest(input) {
    if (!this.accepting) throw domainError(TVLENS_SESSION_STOPPED, 'La session est arrêtée.');
    if (!Number.isFinite(input.startMs) || !Number.isFinite(input.endMs) || input.startMs < 0
      || input.endMs <= input.startMs || input.endMs - input.startMs > 60000)
      throw domainError(TVLENS_CAPTURE_TIME_INVALID, 'Horodatage invalide.');
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
      if (this.closed) throw domainError(TVLENS_SESSION_STOPPED, 'La session est arrêtée.');
      // Against the last passage known, archived ones included: once a rolling window has emptied the list,
      // a block replayed by its capture must still be refused, never stored a second time.
      const previous = this.segments.at(-1) ?? this.history.at(-1);
      if (previous && input.startMs < previous.endMs - 100)
        throw domainError(TVLENS_CAPTURE_ORDER_INVALID, 'Les segments doivent suivre l’ordre d’observation.');
      const segment = { id: `moment-${++this.sequence}`, startMs: input.startMs, endMs: input.endMs, status: 'queued', hasAudio: Boolean(input.audio?.byteLength), available: true, observation: null, receivedMs, revision: 0 };
      // A container without a media block is kept as it came, analysed from its images and its sound, and never
      // announced as a video that can be replayed. Reading the container must never cost the passage.
      let empty = false;
      try { empty = holdsMedia(input.clip) === false; } catch { /* nothing is claimed about this clip */ }
      if (empty) { segment.available = false; segment.mediaReason = UNREADABLE; }
      const assembleMs = input.ingest && typeof input.ingest === 'object' && !Array.isArray(input.ingest) ? input.ingest.assembleMs : null;
      if (Number.isFinite(assembleMs) && assembleMs >= 0) segment.ingest = { assembleMs };
      try { await this.media.put(segment.id, input); }
      catch (error) {
        // Out of room: nothing was stored, so no passage exists. Capture stops; nothing is deleted to make space.
        if (error?.code === STORAGE_FULL) {
          const admissionWasOpen = this.accepting;
          this.accepting = false;
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
      if (empty) {
        this.losses.videoUnreadable = (this.losses.videoUnreadable || 0) + 1;
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
    // Analysis is already running: the thumbnail and the retention sweep no longer delay it.
    if (this.thumbnails) {
      let available;
      try {
        await this.thumbnails.put(segment.id, input.frames?.[0]?.dataUrl);
        available = true;
      }
      catch { available = false; }
      if (Boolean(segment.thumbnailAvailable) !== available) this.#events.update(segment);
      segment.thumbnailAvailable = available;
      // The passage may already have been archived: its card must still find the thumbnail.
      const archived = this.history.find(item => item.id === segment.id);
      if (archived) Object.assign(archived, { thumbnailAvailable: available, revision: segment.revision });
      this.emit();
    }
    await this.prune();
    return segment.id;
  }

  prune() {
    // A rejected step must not poison later sweeps or ingests.
    this.pruneChain = this.pruneChain.catch(() => {}).then(async () => {
      // A reopened archive is never swept: a host set to a rolling window must not erase it by opening it.
      if (this.readOnly) return;
      const cutoff = this.now() - this.retentionMs;
      for (const segment of this.segments) {
        if (stored(segment) && segment.endMs < cutoff) {
          segment.available = false; segment.mediaReason = 'expired';
          this.#events.update(segment);
          // Still waiting for its transcription: neither lane will ever see it.
          if (this.#lanes.remove(segment)) {
            if (segment.audioStatus !== 'skipped') {
              this.losses.audioExpired++;
              this.#events.update(segment, 'audio', 'expired');
            }
            segment.visionStatus = 'expired'; this.losses.visionExpired++;
            this.#events.update(segment, 'vision', 'expired');
          }
          if (segment.visionStatus === 'queued') {
            segment.visionStatus = 'expired'; this.losses.visionExpired++;
            segment.status = hasUsableObservation(segment) ? 'partial' : 'expired';
            this.#events.update(segment, 'vision', 'expired');
          }
          if (segment.status === 'queued') segment.status = 'expired';
          // The passage stays unavailable: a failed removal must not stop the sweep or the archival.
          this.unremoved.add(segment.id);
        }
      }
      // La version expirée est déjà consultable : une analyse terminant pendant le retrait doit avoir la sienne.
      this.#events.publish(events => this.onEvents(events), this.onPublicationError);
      // A removal that failed is tried again at every sweep: no raw media beyond the rolling window.
      for (const id of [...this.unremoved]) {
        try { await this.media.remove(id); this.unremoved.delete(id); }
        catch { this.lastError = 'Impossible de supprimer un média expiré.'; }
      }
      // Keep summaries for the session, but no raw media beyond the rolling window.
      while (this.segments.length && !stored(this.segments[0]) && this.segments[0].status !== 'analyzing' && this.segments[0].audioStatus !== 'analyzing' && this.segments[0].visionStatus !== 'analyzing') {
        const item = this.segments.shift();
        this.history.push({ id: item.id, startMs: item.startMs, endMs: item.endMs, topicSummary: item.topicSummary, summary: item.observation?.summary || item.observation?.transcript || 'Passage non analysé.', observation: item.observation, status: item.status, thumbnailAvailable: item.thumbnailAvailable, audioStatus: item.audioStatus, visionStatus: item.visionStatus, audioError: item.audioError, visionError: item.visionError, audioMs: item.audioMs, visionMs: item.visionMs, transcriptPublishedMs: item.transcriptPublishedMs,
          // Stamps stay with the archived passage; bulky per-call metrics do not: the whole history is sent at every state poll.
          receivedMs: item.receivedMs, audioStartedMs: item.audioStartedMs, visionQueuedMs: item.visionQueuedMs, visionStartedMs: item.visionStartedMs, visionPublishedMs: item.visionPublishedMs, revision: item.revision, ingest: item.ingest, visionSkipReason: item.visionSkipReason, audioFailed: item.audioFailed, audioFailureCode: item.audioFailureCode,
          // Why the media cannot be replayed stays with the summary: expired, missing or never kept.
          mediaReason: item.mediaReason });
      }
      this.emit();
    });
    return this.pruneChain;
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
    this.closed = true;
    this.accepting = false;
    this.#lanes.close();
    await this.persist();
  }

  async resume() {
    if (this.closed) throw domainError(TVLENS_SESSION_STOPPED, 'Session fermée.');
    // The only way out of a reopened archive, and of a capture stopped for lack of room.
    this.readOnly = false; this.storageError = null;
    // Published at once, like the pause below, and settled only once the state has been saved or refused:
    // whoever awaits a resume or a pause waits for the disk, whoever watches the state does not.
    this.accepting = true; this.emit(); this.drain(); await this.persist();
  }
  async stop() { this.accepting = false; this.emit(); await this.persist(); }
  // Reopens a saved session stopped, at its archived instant. Synchronous and silent: nothing is written,
  // analysed or sent anywhere, and capture only comes back through an explicit resume().
  restore(archived, { hasMedia = () => false, hasThumbnail, orphans = [] } = {}) {
    if (this.closed || this.sequence || this.segments.length || this.history.length || this.questions.length) throw new Error('Session déjà commencée : restauration impossible.');
    if (!archived || archived.id !== this.id) throw new Error('Archive incompatible avec cette session.');
    // Decoded before anything is restored: a historical document comes back as saved, a versioned one without its markers.
    const saved = memory.fromArchive(archived);
    // Saved before durable retention existed: its raw media were never meant to be kept.
    const formerFormat = saved.retention === undefined;
    const reopen = (source, kept) => {
      const passage = { ...source };
      // Availability is what the disk says now, not what the session believed when it stopped.
      const present = kept && Boolean(hasMedia(passage.id));
      // A container known to hold no image stays unreadable for as long as its files are there; once they are
      // gone it is missing like any other.
      const unreadable = source.mediaReason === UNREADABLE;
      passage.available = present && !unreadable;
      if (passage.available) delete passage.mediaReason;
      else passage.mediaReason = unreadable ? (present ? UNREADABLE : 'missing') : source.mediaReason || (formerFormat ? 'not-kept' : source.available ? 'missing' : 'expired');
      if (hasThumbnail) passage.thumbnailAvailable = Boolean(hasThumbnail(passage.id));
      // No analysis is resumed: what was in flight is closed as partial evidence or as an explicit failure.
      if (unfinished(passage.audioStatus)) { passage.audioStatus = 'error'; passage.audioError = INTERRUPTED; this.losses.audioError++; }
      if (unfinished(passage.visionStatus)) { passage.visionStatus = 'error'; passage.visionError = INTERRUPTED; this.losses.visionError++; }
      if (unfinished(passage.status)) {
        passage.status = hasUsableObservation({ ...passage, status: 'partial' }) ? 'partial' : 'error';
        if (passage.status === 'error') passage.error = INTERRUPTED;
      }
      if (passage.stage) passage.stage = null;
      return passage;
    };
    for (const key of Object.keys(this.losses)) if (Number.isFinite(saved.coverage?.[key])) this.losses[key] = saved.coverage[key];
    // Counted only where it happened: a session without such a passage keeps the counters it always had.
    if (saved.coverage?.videoUnreadable > 0) this.losses.videoUnreadable = saved.coverage.videoUnreadable;
    // Likewise, and only as counts this session can have written: one second description per passage at most, and
    // no more recoveries than second descriptions.
    const counted = (value, most) => Number.isInteger(value) && value > 0 && value <= most ? value : 0;
    const retried = counted(saved.coverage?.visionRetried, saved.segments.length + (saved.history?.length || 0)), recovered = counted(saved.coverage?.visionRecovered, retried);
    if (retried) this.losses.visionRetried = retried;
    if (recovered) this.losses.visionRecovered = recovered;
    if (Number.isFinite(saved.coverage?.visionBlockedMs)) this.#lanes.restoreHeldMs(saved.coverage.visionBlockedMs);
    // A summary whose media is gone stays a summary: only passages still listed with their media can be replayed.
    this.history = (saved.history || []).map(passage => { const { available, ...summary } = reopen(passage, false); return summary; });
    this.segments = saved.segments.map(passage => reopen(passage, true));
    this.questions = (saved.questions || []).map(question => ({ ...question }));
    this.apiCalls = Number.isFinite(saved.apiCalls) ? saved.apiCalls : 0; this.apiCost = Number.isFinite(saved.apiCost) ? saved.apiCost : 0;
    // Past every number already used, including media left on disk by an interrupted ingest: never overwritten.
    this.sequence = Math.max(0, ...[...this.history, ...this.segments].map(passage => passage.id).concat(orphans).map(id => Number(/^moment-(\d+)$/.exec(id)?.[1]) || 0));
    // Counted and reported, never shown as a passage: nothing says where they belong on the session clock.
    this.unplacedMedia = orphans.length || 0;
    // Les motifs historiques sont décodés avant ce changement : l'absence de retention signifie
    // encore « non conservé ». Aucune archive rouverte ne réactive ensuite une fenêtre d'élagage.
    this.retentionMs = Infinity;
    this.accepting = false; this.readOnly = true; this.lastError = null;
  }
  memoryView() {
    return memory.createMemoryView(this, this.#modalities);
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
    const all=[...this.history,...this.segments],now=this.now(),capturedThroughMs=all.at(-1)?.endMs||0,analyzedThroughMs=all.filter(s=>s.status==='ready').at(-1)?.endMs||0;
    const lanes = this.perceptionState(now);
    return { id: this.id, accepting: this.accepting, asking: this.asking, analyzing: lanes.analyzing,
      elapsedMs: now, capturedThroughMs, analyzedThroughMs, analysisLagMs:Math.max(0,capturedThroughMs-analyzedThroughMs), contextThroughMs:all.filter(hasUsableObservation).at(-1)?.endMs||0, gaps:all.filter(s=>['error','skipped','expired'].includes(s.status)).map(({id,startMs,endMs,status})=>({id,startMs,endMs,status})), retentionMs: Number.isFinite(this.retentionMs) ? this.retentionMs : null, retention: Number.isFinite(this.retentionMs) ? 'rolling' : 'until-deleted', readOnly: this.readOnly, unplacedMedia: this.unplacedMedia, apiCalls: this.apiCalls, apiCost: this.apiCost,
      pending: lanes.pending, audioPending: lanes.audioPending, visionPending: lanes.visionPending,
      // A capture stopped for lack of room keeps saying so, and so does a state that was not saved: a late
      // analysis must not clear the reason.
      // Lists of their own, like the passages below: an archive may hold a state for a while before writing
      // it, and a sweep that moves a passage into the history meanwhile must not show it there too.
      lastError: this.storageError || this.saveError || this.lastError, history: [...this.history], questions: [...this.questions],
      latency: latencySummary(all), coverage: { passages: all.length, ...this.losses, visionBlockedMs: lanes.visionBlockedMs },
      audioGaps: all.filter(s => s.audioFailed || (s.status === 'partial' && ['skipped', 'error'].includes(s.audioStatus))).map(s => ({ id: s.id, startMs: s.startMs, endMs: s.endMs, audioStatus: s.audioFailed ? 'failed' : s.audioStatus, ...(s.audioFailureCode ? { code: s.audioFailureCode } : {}) })),
      visionGaps: all.filter(s => s.status === 'partial' && ['skipped', 'expired', 'error'].includes(s.visionStatus)).map(s => ({ id: s.id, startMs: s.startMs, endMs: s.endMs, visionStatus: s.visionStatus, ...(s.visionSkipReason && { reason: s.visionSkipReason }) })),
      // Cached figures supplied by the host (free space, volume of this session): never measured here.
      storage: this.storage ? this.storage() : null,
      segments: this.segments.map(s => ({ ...s })) };
  }
  emit() {
    this.#events.publish(events => this.onEvents(events), this.onPublicationError);
    if (this.closed) return;
    publishState(() => this.onChange(this.snapshot()), this.onPublicationError, { origin: 'watch-session', sessionId: this.id });
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

module.exports = { WatchSession, recoveredPassage, TVLENS_CAPTURE_TIME_INVALID, TVLENS_CAPTURE_ORDER_INVALID, TVLENS_SESSION_STOPPED };
