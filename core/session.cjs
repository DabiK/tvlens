const { domainError } = require('./shared/domain-error.cjs');
const TVLENS_CAPTURE_TIME_INVALID = 'TVLENS_CAPTURE_TIME_INVALID';
const TVLENS_CAPTURE_ORDER_INVALID = 'TVLENS_CAPTURE_ORDER_INVALID';
const TVLENS_SESSION_STOPPED = 'TVLENS_SESSION_STOPPED';
const { completeTopicSummary } = require('./topic-summary.cjs');
const { perceptionContext } = require('./perception-context.cjs');
const { hasUsableObservation } = require('./passage-text.cjs');
const { latencySummary } = require('./latency-trace.cjs');
const { holdsMedia } = require('./clip-container.cjs');
const { publishState } = require('./state-publication.cjs');
const STORAGE_FULL = 'TVLENS_STORAGE_FULL', INTERRUPTED = 'Analyse interrompue à la fermeture de la session.';
// Set as `code` by a perception adapter on a failed description it knows to be passing (a connection that gave
// way, its own deadline): the only failure a passage may be described a second time for.
const VISION_TRANSIENT = 'TVLENS_VISION_TRANSIENT';
const unfinished = status => status === 'queued' || status === 'analyzing';
// The files of a passage are there, whether or not its video plays: a recorder that received no frame leaves a
// container without a single image (mediaReason 'unreadable'), next to the images and the sound kept at capture.
// `available` only says that the video can be replayed.
const UNREADABLE = 'unreadable', stored = segment => Boolean(segment.available) || segment.mediaReason === UNREADABLE;
// A saved state restore() can read without guessing: a file that parses but has another shape is refused
// in plain words instead of failing half-way on a TypeError.
const passageLike = passage => Boolean(passage) && typeof passage === 'object' && typeof passage.id === 'string' && /^moment-\d+$/.test(passage.id) && Number.isFinite(passage.startMs) && Number.isFinite(passage.endMs);
const listOf = (value, valid) => value == null || (Array.isArray(value) && value.every(valid));
const restorable = saved => Boolean(saved) && typeof saved === 'object' && typeof saved.id === 'string' && Array.isArray(saved.segments) && saved.segments.every(passageLike)
  && listOf(saved.history, passageLike) && listOf(saved.questions, question => Boolean(question) && typeof question === 'object');
// A passage known only by its media on disk: its analysis never reached the saved state. It takes its
// place on the session clock, replayable and unanalysed; nothing is analysed again.
const recoveredPassage = ({ id, startMs, endMs, hasAudio = false }) => ({ id, startMs, endMs, status: 'error', error: INTERRUPTED, hasAudio: Boolean(hasAudio), available: true, observation: null, revision: 0 });
// Portable application core: no Electron, filesystem or provider dependency.
class WatchSession {
  #questionPending = false;
  #questionIntakeClosed = false;
  #events = [];

  constructor({ id, now, perception, media, archive, thumbnails, storage,
    onChange = () => {}, onEvents = () => {}, onPublicationError = () => {},
    retentionMs = Infinity, maxPending = 2, visionDuringAsk = false }) {
    // Media are kept until the session is deleted unless a host asks for a rolling window. A saved state
    // carries null for "no expiry" (JSON has no Infinity): it is normalised here, never used in arithmetic.
    retentionMs = Number.isFinite(retentionMs) && retentionMs > 0 ? retentionMs : Infinity;
    Object.assign(this, { id, now, perception, media, archive, thumbnails, storage,
      onChange, onEvents, onPublicationError, retentionMs, maxPending, visionDuringAsk });
    this.segments = []; this.history = []; this.questions = []; this.queue = [];
    this.visionQueue = []; this.audioRunning = false; this.visionRunning = false;
    this.closed = false; this.controller = new AbortController();
    // Raised by a host that is ending the session and still waits for a write under way: from then on no
    // analysis is started, since close() would abandon it at once.
    this.ending = false;
    // Counted where the event happens, never recomputed from the passages. Two more only exist once they
    // happened: visionRetried, the second descriptions started, and visionRecovered, those that succeeded.
    // visionError stays what was lost for good.
    this.losses = { audioSkipped: 0, audioExpired: 0, visionSkippedBacklog: 0, visionSkippedAsking: 0, visionExpired: 0, audioError: 0, visionError: 0 };
    this.unremoved = new Set();
    this.visionBlockedMs = 0; this.visionHeldSince = null;
    this.sequence = 0; this.accepting = true; this.running = false;
    this.readOnly = false; this.storageError = null;
    // Set by a save the archive refused and cleared only by a save that lands: no analysis, however
    // successful, says that the state is on disk.
    this.saveError = null;
    // Ingests under way, and media found on disk at reopening that no passage could be made of.
    this.landing = new Set(); this.unplacedMedia = 0;
    this.apiCalls = 0; this.apiCost = 0; this.lastError = null; this.pruneChain = Promise.resolve(); this.ingestChain = Promise.resolve();
  }

  get asking() { return this.#questionPending; }

  setQuestionPending(busy) {
    if (this.#questionIntakeClosed || this.#questionPending === busy) return;
    this.#questionPending = busy;
    if (!busy) this.endVisionHold();
    if (this.closed || this.ending) return;
    this.emit();
    if (!busy) queueMicrotask(() => this.drain());
  }

  endVisionHold() {
    if (this.visionHeldSince === null) return;
    this.visionBlockedMs += Math.max(0, this.now() - this.visionHeldSince); this.visionHeldSince = null;
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
          if (admissionWasOpen) this.#events.push({
            type: 'AdmissionSuspended', sessionId: this.id, passageId: null, revision: null,
            cause: { code: STORAGE_FULL }, interval: { startMs: input.startMs, endMs: input.endMs },
          });
          this.emit();
          await this.persist();
        }
        throw error;
      }
      this.segments.push(segment);
      this.#events.push({
        type: 'PassageReceived', sessionId: this.id, passageId: segment.id, revision: segment.revision,
        interval: { startMs: segment.startMs, endMs: segment.endMs },
      });
      // Counted once the passage exists: a refused write leaves no passage and no count.
      if (empty) this.losses.videoUnreadable = (this.losses.videoUnreadable || 0) + 1;
      // A write that was under way when the session closed still lands, but nothing is queued for analysis.
      // Nor while its host is ending it: the passage is kept, replayable, and reopens as unanalysed.
      if (!this.closed && !this.ending) { this.queue.push(segment); this.shed(); }
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
      try { await this.thumbnails.put(segment.id, input.frames?.[0]?.dataUrl); segment.thumbnailAvailable = true; }
      catch { segment.thumbnailAvailable = false; }
      // The passage may already have been archived: its card must still find the thumbnail.
      const archived = this.history.find(item => item.id === segment.id);
      if (archived) archived.thumbnailAvailable = segment.thumbnailAvailable;
      this.emit();
    }
    await this.prune();
    return segment.id;
  }

  // Overload sheds the transcription only: the passage keeps its place in the lane, so its images
  // still reach vision in observation order. Past a bounded lane the oldest passage is dropped whole.
  shed() {
    const waiting = this.queue.filter(s => s.audioStatus !== 'skipped');
    for (const s of waiting.slice(0, Math.max(0, waiting.length - this.maxPending))) {
      s.audioStatus = 'skipped';
      this.losses.audioSkipped++;
    }
    while (this.queue.length > this.maxPending * 3) {
      const dropped = this.queue.shift();
      Object.assign(dropped, { status: 'skipped', visionStatus: 'skipped', visionSkipReason: 'backlog' });
      this.losses.visionSkippedBacklog++;
    }
  }

  // A question is the cause of a skip only while it alone keeps the lane waiting.
  skipVision(segment) {
    const reason = this.asking && !this.visionDuringAsk && !this.visionRunning ? 'asking' : 'backlog';
    segment.visionStatus = 'skipped'; segment.visionSkipReason = reason;
    segment.status = hasUsableObservation(segment) ? 'partial' : 'skipped';
    this.losses[reason === 'asking' ? 'visionSkippedAsking' : 'visionSkippedBacklog']++;
  }

  // Hands a passage over to the vision lane, or records why it will not be described.
  toVision(segment) {
    segment.status = hasUsableObservation(segment) ? 'partial' : 'analyzing';
    if (stored(segment)) {
      // A passage without speech only takes a free place: it never evicts a spoken one waiting for its images.
      if (segment.audioStatus === 'skipped' && this.visionQueue.length >= this.maxPending) return this.skipVision(segment);
      segment.visionStatus = 'queued'; segment.visionQueuedMs = this.now(); this.visionQueue.push(segment);
      while (this.visionQueue.length > this.maxPending) this.skipVision(this.visionQueue.shift());
    } else {
      segment.visionStatus = 'expired'; this.losses.visionExpired++;
      segment.status = hasUsableObservation(segment) ? 'partial' : 'expired';
    }
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
          // Still waiting for its transcription: neither lane will ever see it.
          if (this.queue.includes(segment)) {
            if (segment.audioStatus !== 'skipped') this.losses.audioExpired++;
            segment.visionStatus = 'expired'; this.losses.visionExpired++;
          }
          this.queue = this.queue.filter(item => item !== segment);
          this.visionQueue = this.visionQueue.filter(item => item !== segment);
          if (!this.visionQueue.length) this.endVisionHold();
          if (segment.visionStatus === 'queued') {
            segment.visionStatus = 'expired'; this.losses.visionExpired++;
            segment.status = hasUsableObservation(segment) ? 'partial' : 'expired';
          }
          if (segment.status === 'queued') segment.status = 'expired';
          // The passage stays unavailable: a failed removal must not stop the sweep or the archival.
          this.unremoved.add(segment.id);
        }
      }
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
          receivedMs: item.receivedMs, audioStartedMs: item.audioStartedMs, visionQueuedMs: item.visionQueuedMs, visionStartedMs: item.visionStartedMs, visionPublishedMs: item.visionPublishedMs, revision: item.revision, ingest: item.ingest, visionSkipReason: item.visionSkipReason, audioFailed: item.audioFailed,
          // Why the media cannot be replayed stays with the summary: expired, missing or never kept.
          mediaReason: item.mediaReason });
      }
      this.emit();
    });
    return this.pruneChain;
  }

  drain() {
    if (this.closed || this.ending) return;
    this.drainAudio();
    this.drainVision();
  }

  // Each lane owns one call and a bounded FIFO of segment references, never raw media.
  async drainAudio() {
    if (this.closed || this.ending || this.audioRunning) return;
    // A passage whose transcription was shed moves on as soon as the passages before it have.
    if (this.queue[0]?.audioStatus === 'skipped') {
      // One at a time, letting an idle vision lane take each before the next arrives.
      while (this.queue[0]?.audioStatus === 'skipped') { this.toVision(this.queue.shift()); this.drainVision(); }
      this.emit();
    }
    if (!this.queue.length) return;
    this.audioRunning = true; this.running = true;
    const segment = this.queue.shift();
    segment.status = 'analyzing'; segment.audioStatus = 'analyzing'; segment.audioStartedMs = this.now(); this.emit();
    try {
      const evidence = await this.media.read(segment.id);
      if (this.closed) return;
      const result = await this.perception.transcribe({ ...segment, ...evidence, signal: this.controller.signal });
      if (this.closed) return;
      segment.analysisMs = result.elapsedMs; segment.audioMs = result.elapsedMs;
      segment.metrics = result.metrics; this.apiCost += result.cost || 0;
      // A transcriber that reports its own failure is counted and flagged, never hidden as plain silence.
      // The passage keeps its statuses: a host without Whisper still gets complete visual passages.
      if (result.failed === true) { segment.audioFailed = true; this.losses.audioError++; }
      segment.observation = result.observation; segment.revision++;
      segment.audioStatus = 'ready'; segment.transcriptPublishedMs = this.now();
    } catch (error) {
      if (this.closed) return;
      segment.audioStatus = 'error'; segment.audioError = error.message;
      this.lastError = error.message; this.losses.audioError++;
    } finally {
      this.audioRunning = false; this.running = this.visionRunning;
      if (!this.closed) {
        this.toVision(segment);
        // Publish speech before waiting for persistence or vision. An idle vision lane takes this
        // passage before the passages shed behind it are handed over.
        this.emit(); this.drainVision(); this.drain(); await this.persist();
      }
    }
  }

  // A second description needs a failure marked as passing, a session that is neither ending, closed nor read-only,
  // media still kept, and a lane nobody waits for: no passage queued behind, no question holding vision back.
  retriesVision(segment, error) {
    return error?.code === VISION_TRANSIENT && !this.closed && !this.ending && !this.readOnly && stored(segment)
      && !this.visionQueue.length && !(this.asking && !this.visionDuringAsk);
  }

  async drainVision() {
    if (this.closed || this.ending || this.visionRunning || !this.visionQueue.length) return;
    // Only the time during which a question alone keeps queued vision waiting is charged to the gate.
    if (this.asking && !this.visionDuringAsk) { this.visionHeldSince ??= this.now(); return; }
    this.endVisionHold();
    this.visionRunning = true; this.running = true;
    const segment = this.visionQueue.shift();
    segment.visionStatus = 'analyzing'; segment.visionStartedMs = this.now(); this.emit();
    try {
      let evidence = await this.media.read(segment.id);
      if (this.closed) return;
      let context, result, retried = false;
      // Every call made is counted, the second one of a passage included.
      const describe = () => {
        this.apiCalls++;
        context = perceptionContext(this, segment);
        return this.perception.observeVisual({ ...segment, ...evidence,
          context, signal: this.controller.signal, lightweight: this.visionQueue.length > 0,
          onProgress: message => { if (!this.closed) { segment.stage = message; this.emit(); } } });
      };
      try { result = await describe(); }
      catch (error) {
        // A failure its adapter marked as passing is tried once more, here and now: the passage stays in analysis,
        // nothing is published as lost meanwhile, and nothing is queued or delayed for it. Its media are read again,
        // and what allows the second call is checked again once they are. A description that ran into its deadline
        // during a continuous capture will seldom find the lane free, and is then lost as before.
        if (!this.retriesVision(segment, error)) throw error;
        // Media that cannot be read any more leave the first failure as the reason, in its own words.
        try { evidence = await this.media.read(segment.id); } catch { throw error; }
        if (!this.retriesVision(segment, error)) throw error;
        this.losses.visionRetried = (this.losses.visionRetried || 0) + 1; retried = true;
        result = await describe();
      }
      if (this.closed) return;
      segment.observation = { ...segment.observation, ...result.observation };
      segment.topicSummary = completeTopicSummary(segment, result, context);
      segment.visionStatus = 'ready'; segment.visionMs = result.elapsedMs;
      segment.visionPublishedMs = this.now(); segment.revision++;
      segment.status = segment.audioStatus === 'ready' ? 'ready' : 'partial';
      segment.analysisMs = (segment.analysisMs || 0) + (result.elapsedMs || 0);
      segment.metrics = { ...segment.metrics, ...result.metrics };
      this.apiCost += result.cost || 0;
      if (retried) this.losses.visionRecovered = (this.losses.visionRecovered || 0) + 1;
      // A completed passage recovers older failures, but cannot clear a newer
      // audio failure that arrived while this vision call was in flight.
      const outstanding = this.segments.slice().reverse().find(s =>
        s.endMs >= segment.endMs && (s.audioError || s.visionError));
      this.lastError = outstanding?.visionError || outstanding?.audioError || null;
    } catch (error) {
      if (this.closed) return;
      segment.visionStatus = 'error'; segment.visionError = error.message;
      segment.status = hasUsableObservation(segment) ? 'partial' : 'error';
      this.lastError = error.message; this.losses.visionError++;
    } finally {
      this.visionRunning = false; this.running = this.audioRunning;
      segment.stage = null;
      if (!this.closed) { this.emit(); this.drain(); await this.persist(); }
    }
  }

  // Does not wait for a write still under way, which may never return: that passage is saved when it
  // lands (see land). A host that wants one final saved state waits on landed() first, as the shared runtime does.
  async close() {
    this.closed = true; this.accepting = false; this.endVisionHold();
    this.controller.abort(new Error('Session fermée.'));
    this.queue = []; this.visionQueue = [];
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
  restore(saved, { hasMedia = () => false, hasThumbnail, orphans = [] } = {}) {
    if (this.closed || this.sequence || this.segments.length || this.history.length || this.questions.length) throw new Error('Session déjà commencée : restauration impossible.');
    if (!saved || saved.id !== this.id) throw new Error('Archive incompatible avec cette session.');
    if (!restorable(saved)) throw new Error('Archive illisible.');
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
    if (Number.isFinite(saved.coverage?.visionBlockedMs)) this.visionBlockedMs = saved.coverage.visionBlockedMs;
    // A summary whose media is gone stays a summary: only passages still listed with their media can be replayed.
    this.history = (saved.history || []).map(passage => { const { available, ...summary } = reopen(passage, false); return summary; });
    this.segments = saved.segments.map(passage => reopen(passage, true));
    this.questions = (saved.questions || []).map(question => ({ ...question }));
    this.apiCalls = Number.isFinite(saved.apiCalls) ? saved.apiCalls : 0; this.apiCost = Number.isFinite(saved.apiCost) ? saved.apiCost : 0;
    // Past every number already used, including media left on disk by an interrupted ingest: never overwritten.
    this.sequence = Math.max(0, ...[...this.history, ...this.segments].map(passage => passage.id).concat(orphans).map(id => Number(/^moment-(\d+)$/.exec(id)?.[1]) || 0));
    // Counted and reported, never shown as a passage: nothing says where they belong on the session clock.
    this.unplacedMedia = orphans.length || 0;
    // The retention contract belongs to the session, not to the host that reopens it: media promised
    // until deletion stay so on a host set to a rolling window, after an explicit resume as well.
    if (saved.retention === 'until-deleted') this.retentionMs = Infinity;
    this.accepting = false; this.readOnly = true; this.lastError = null;
  }
  snapshot() {
    const all=[...this.history,...this.segments],now=this.now(),capturedThroughMs=all.at(-1)?.endMs||0,analyzedThroughMs=all.filter(s=>s.status==='ready').at(-1)?.endMs||0;
    return { id: this.id, accepting: this.accepting, asking: this.asking, analyzing: this.running,
      elapsedMs: now, capturedThroughMs, analyzedThroughMs, analysisLagMs:Math.max(0,capturedThroughMs-analyzedThroughMs), contextThroughMs:all.filter(hasUsableObservation).at(-1)?.endMs||0, gaps:all.filter(s=>['error','skipped','expired'].includes(s.status)).map(({id,startMs,endMs,status})=>({id,startMs,endMs,status})), retentionMs: Number.isFinite(this.retentionMs) ? this.retentionMs : null, retention: Number.isFinite(this.retentionMs) ? 'rolling' : 'until-deleted', readOnly: this.readOnly, unplacedMedia: this.unplacedMedia, apiCalls: this.apiCalls, apiCost: this.apiCost,
      pending: this.queue.length + this.visionQueue.length, audioPending: this.queue.length, visionPending: this.visionQueue.length,
      // A capture stopped for lack of room keeps saying so, and so does a state that was not saved: a late
      // analysis must not clear the reason.
      // Lists of their own, like the passages below: an archive may hold a state for a while before writing
      // it, and a sweep that moves a passage into the history meanwhile must not show it there too.
      lastError: this.storageError || this.saveError || this.lastError, history: [...this.history], questions: [...this.questions],
      latency: latencySummary(all), coverage: { passages: all.length, ...this.losses, visionBlockedMs: this.visionBlockedMs + (this.visionHeldSince === null ? 0 : Math.max(0, now - this.visionHeldSince)) },
      audioGaps: all.filter(s => s.audioFailed || (s.status === 'partial' && ['skipped', 'error'].includes(s.audioStatus))).map(s => ({ id: s.id, startMs: s.startMs, endMs: s.endMs, audioStatus: s.audioFailed ? 'failed' : s.audioStatus })),
      visionGaps: all.filter(s => s.status === 'partial' && ['skipped', 'expired', 'error'].includes(s.visionStatus)).map(s => ({ id: s.id, startMs: s.startMs, endMs: s.endMs, visionStatus: s.visionStatus, ...(s.visionSkipReason && { reason: s.visionSkipReason }) })),
      // Cached figures supplied by the host (free space, volume of this session): never measured here.
      storage: this.storage ? this.storage() : null,
      segments: this.segments.map(s => ({ ...s })) };
  }
  emit() {
    if (this.#events.length) {
      const events = this.#events;
      this.#events = [];
      publishState(() => this.onEvents(events), this.onPublicationError, { origin: 'watch-session-events', sessionId: this.id });
    }
    if (this.closed) return;
    publishState(() => this.onChange(this.snapshot()), this.onPublicationError, { origin: 'watch-session', sessionId: this.id });
  }
  async persist() {
    // Opening, pausing or closing a reopened archive leaves its files untouched.
    if (this.readOnly) return;
    // Never rejects: an analysis or a pause must not fail for it. A host that needs the state confirmed on
    // disk, as before saying a session archived, asks its archive (see the shared runtime).
    let refused = null;
    try { await this.archive.save(this.snapshot()); }
    catch { refused = 'Impossible de sauvegarder le résumé de session.'; }
    // States are published before they are saved: what the save answered is said when it changes what the
    // state says, a refusal or its end, and only then. Compared when the answer comes, not when it was asked
    // for: several saves may be under way.
    const changed = refused !== this.saveError;
    this.saveError = refused;
    if (changed) this.emit();
  }
}

module.exports = { WatchSession, restorable, recoveredPassage, TVLENS_CAPTURE_TIME_INVALID, TVLENS_CAPTURE_ORDER_INVALID, TVLENS_SESSION_STOPPED };
