const { perceptionContext } = require('./perception-context.cjs');
const { hasUsableObservation } = require('./passage-text.cjs');
// Portable application core: no Electron, filesystem or provider dependency.
class WatchSession {
  constructor({ id, now, perception, answer, media, archive, thumbnails, onChange = () => {}, retentionMs = 300000, maxPending = 2 }) {
    Object.assign(this, { id, now, perception, answer, media, archive, thumbnails, onChange, retentionMs, maxPending });
    this.segments = []; this.history = []; this.questions = []; this.queue = [];
    this.visionQueue = []; this.audioRunning = false; this.visionRunning = false;
    this.closed = false; this.controller = new AbortController();
    this.splitPerception = typeof perception.transcribe === 'function' && typeof perception.observeVisual === 'function';
    this.sequence = 0; this.accepting = true; this.running = false; this.asking = false;
    this.apiCalls = 0; this.apiCost = 0; this.lastError = null; this.pruneChain = Promise.resolve();
  }

  async ingest(input) {
    if (!this.accepting) throw new Error('La session est arrêtée.');
    if (!Number.isFinite(input.startMs) || !Number.isFinite(input.endMs) || input.startMs < 0 || input.endMs <= input.startMs || input.endMs - input.startMs > 60000) throw new Error('Horodatage invalide.');
    const previous = this.segments.at(-1);
    if (previous && input.startMs < previous.endMs - 100) throw new Error('Les segments doivent suivre l’ordre d’observation.');
    const segment = { id: `moment-${++this.sequence}`, startMs: input.startMs, endMs: input.endMs, status: 'queued', hasAudio: Boolean(input.audio?.byteLength), available: true, observation: null };
    await this.media.put(segment.id, input);
    if (this.thumbnails) {
      try { await this.thumbnails.put(segment.id, input.frames?.[0]?.dataUrl); segment.thumbnailAvailable = true; }
      catch { segment.thumbnailAvailable = false; }
    }
    this.segments.push(segment);
    this.queue.push(segment);
    while (this.queue.length > this.maxPending) this.queue.shift().status = 'skipped';
    await this.prune();
    this.emit(); this.drain();
    return segment.id;
  }

  prune() {
    this.pruneChain = this.pruneChain.then(async () => {
      const cutoff = this.now() - this.retentionMs;
      for (const segment of this.segments) {
        if (segment.available && segment.endMs < cutoff) {
          segment.available = false;
          this.queue = this.queue.filter(item => item !== segment);
          this.visionQueue = this.visionQueue.filter(item => item !== segment);
          if (segment.visionStatus === 'queued') {
            segment.visionStatus = 'expired';
            segment.status = hasUsableObservation(segment) ? 'partial' : 'expired';
          }
          if (segment.status === 'queued') segment.status = 'expired';
          await this.media.remove(segment.id);
        }
      }
      // Keep summaries for the session, but no raw media beyond the rolling window.
      while (this.segments.length && !this.segments[0].available && this.segments[0].status !== 'analyzing' && this.segments[0].audioStatus !== 'analyzing' && this.segments[0].visionStatus !== 'analyzing') {
        const item = this.segments.shift();
        this.history.push({ id: item.id, startMs: item.startMs, endMs: item.endMs, summary: item.observation?.summary || item.observation?.transcript || 'Passage non analysé.', observation: item.observation, status: item.status, thumbnailAvailable: item.thumbnailAvailable, audioStatus: item.audioStatus, visionStatus: item.visionStatus, audioError: item.audioError, visionError: item.visionError, audioMs: item.audioMs, visionMs: item.visionMs, transcriptPublishedMs: item.transcriptPublishedMs });
      }
      this.emit();
    });
    return this.pruneChain;
  }

  async drain() {
    if (this.closed) return;
    if (this.splitPerception) { this.drainAudio(); this.drainVision(); return; }
    if (this.running || this.asking || !this.queue.length) return;
    this.running = true;
    const segment = this.queue.shift();
    segment.status = 'analyzing'; this.emit();
    try {
      const evidence = await this.media.read(segment.id);
      if (this.closed) return;
      this.apiCalls++;
      const result = await this.perception.observe({ ...segment, ...evidence, context: perceptionContext(this, segment), signal:this.controller.signal, lightweight:this.queue.length>0, onProgress:message=>{segment.stage=message;this.emit();} });
      if (this.closed) return;
      segment.analysisMs=result.elapsedMs;segment.metrics=result.metrics;segment.stage=null;
      segment.observation = result.observation;
      segment.status = 'ready';
      this.apiCost += result.cost || 0;
      this.lastError = null;
    } catch (error) {
      if (this.closed) return;
      segment.status = 'error';
      segment.error = error.message;
      this.lastError = error.message;
    } finally {
      this.running = false;
      if (!this.closed) { await this.persist(); this.emit(); this.drain(); }
    }
  }

  // Each lane owns one call and a bounded FIFO of segment references, never raw media.
  async drainAudio() {
    if (this.closed || this.audioRunning || !this.queue.length) return;
    this.audioRunning = true; this.running = true;
    const segment = this.queue.shift();
    segment.status = 'analyzing'; segment.audioStatus = 'analyzing'; this.emit();
    try {
      const evidence = await this.media.read(segment.id);
      if (this.closed) return;
      const result = await this.perception.transcribe({ ...segment, ...evidence, signal: this.controller.signal });
      if (this.closed) return;
      segment.observation = result.observation;
      segment.audioStatus = 'ready'; segment.analysisMs = result.elapsedMs;
      segment.audioMs = result.elapsedMs; segment.transcriptPublishedMs = this.now();
      segment.metrics = result.metrics; this.apiCost += result.cost || 0;
    } catch (error) {
      if (this.closed) return;
      segment.audioStatus = 'error'; segment.audioError = error.message;
      this.lastError = error.message;
    } finally {
      this.audioRunning = false; this.running = this.visionRunning;
      if (!this.closed) {
        segment.status = hasUsableObservation(segment) ? 'partial' : 'analyzing';
        if (segment.available) {
          segment.visionStatus = 'queued'; this.visionQueue.push(segment);
          while (this.visionQueue.length > this.maxPending) {
            const skipped = this.visionQueue.shift();
            skipped.visionStatus = 'skipped';
            skipped.status = hasUsableObservation(skipped) ? 'partial' : 'skipped';
          }
        } else {
          segment.visionStatus = 'expired';
          segment.status = hasUsableObservation(segment) ? 'partial' : 'expired';
        }
        // Publish speech before waiting for persistence or vision.
        this.emit(); this.drain(); await this.persist();
      }
    }
  }

  async drainVision() {
    if (this.closed || this.asking || this.visionRunning || !this.visionQueue.length) return;
    this.visionRunning = true; this.running = true;
    const segment = this.visionQueue.shift();
    segment.visionStatus = 'analyzing'; this.emit();
    try {
      const evidence = await this.media.read(segment.id);
      if (this.closed) return;
      this.apiCalls++;
      const result = await this.perception.observeVisual({ ...segment, ...evidence,
        context: perceptionContext(this, segment), signal: this.controller.signal, lightweight: this.visionQueue.length > 0,
        onProgress: message => { if (!this.closed) { segment.stage = message; this.emit(); } } });
      if (this.closed) return;
      segment.observation = { ...segment.observation, ...result.observation };
      segment.visionStatus = 'ready'; segment.visionMs = result.elapsedMs;
      segment.status = segment.audioStatus === 'ready' ? 'ready' : 'partial';
      segment.analysisMs = (segment.analysisMs || 0) + (result.elapsedMs || 0);
      segment.metrics = { ...segment.metrics, ...result.metrics };
      this.apiCost += result.cost || 0;
      // A completed passage recovers older failures, but cannot clear a newer
      // audio failure that arrived while this vision call was in flight.
      const outstanding = this.segments.slice().reverse().find(s =>
        s.endMs >= segment.endMs && (s.audioError || s.visionError));
      this.lastError = outstanding?.visionError || outstanding?.audioError || null;
    } catch (error) {
      if (this.closed) return;
      segment.visionStatus = 'error'; segment.visionError = error.message;
      segment.status = hasUsableObservation(segment) ? 'partial' : 'error';
      this.lastError = error.message;
    } finally {
      this.visionRunning = false; this.running = this.audioRunning;
      segment.stage = null;
      if (!this.closed) { this.emit(); this.drain(); await this.persist(); }
    }
  }

  async close() {
    this.closed = true; this.accepting = false;
    this.controller.abort(new Error('Session fermée.'));
    this.queue = []; this.visionQueue = [];
    await this.persist();
  }

  async ask(question) {
    if (typeof question !== 'string' || !question.trim() || question.length > 2000) throw new Error('Écris une question de 1 à 2 000 caractères.');
    if (this.asking) throw new Error('Une réponse est déjà en cours.');
    this.asking = true; this.emit();
    try {
      await this.prune();
      const anchorMs = this.segments.at(-1)?.endMs ?? this.history.at(-1)?.endMs ?? 0;
      const context = this.segments.map(s => ({ ...s, observation: s.observation ? { ...s.observation } : null }));
      if (!context.length && !this.history.length) return { answer: 'Je n’ai pas encore de passage enregistré. Laisse la vidéo jouer quelques secondes.', kind: 'insufficient', citations: [], limits: [] };
      const targetMs = resolveTemporalTarget(question, [...this.history, ...context], anchorMs);
      const focusIds = targetMs === undefined ? null : [...this.history, ...context].filter(s => targetMs >= s.startMs && targetMs <= s.endMs).map(s => s.id);
      const chosen = selectEvidence(question, context.filter(s => s.available), anchorMs, targetMs);
      const evidence = [];
      for (const segment of chosen) {
        try { evidence.push({ ...segment, ...await this.media.read(segment.id) }); }
        catch { /* Retention can expire during a question: text context remains explicit. */ }
      }
      this.apiCalls++; this.emit();
      const result = await this.answer.ask({ question: question.trim(), anchorMs, targetMs, focusIds, context, history: this.history.slice(-120), evidence, conversation: this.questions.slice(-4) });
      this.apiCost += result.cost || 0;
      const examined = new Set(evidence.map(s => s.id));
      const known = new Map([...context.filter(s => hasUsableObservation(s) || examined.has(s.id)), ...this.history.filter(hasUsableObservation)].map(s => [s.id, s]));
      const citations = [...new Set(result.citations)].filter(id => known.has(id) && (!focusIds || focusIds.includes(id))).map(id => {
        const segment = known.get(id);
        return { id, startMs: segment.startMs, endMs: segment.endMs, available: Boolean(segment.available) && this.now() - segment.endMs <= this.retentionMs };
      });
      const response = { question: question.trim(), answer: result.answer, kind: result.kind, limits: result.limits, citations, atMs: this.now() };
      // A confident-looking answer with invented/missing evidence must not be presented as grounded.
      if (!citations.length && result.kind === 'observation') {
        response.kind = 'insufficient';
        response.answer = 'Je ne peux pas relier cette réponse à un passage observé. Reformule la question ou attends que le contexte soit analysé.';
      }
      this.questions.push(response);
      await this.persist();
      return response;
    } finally {
      this.asking = false; this.emit(); this.drain();
    }
  }

  async resume() { if (this.closed) throw new Error('Session fermée.'); this.accepting = true; await this.persist(); this.emit(); this.drain(); }
  async stop() { this.accepting = false; await this.persist(); this.emit(); }
  snapshot() {
    const all=[...this.history,...this.segments],capturedThroughMs=all.at(-1)?.endMs||0,analyzedThroughMs=all.filter(s=>s.status==='ready').at(-1)?.endMs||0;
    return { id: this.id, accepting: this.accepting, asking: this.asking, analyzing: this.running,
      elapsedMs: this.now(), capturedThroughMs, analyzedThroughMs, analysisLagMs:Math.max(0,capturedThroughMs-analyzedThroughMs), contextThroughMs:all.filter(hasUsableObservation).at(-1)?.endMs||0, gaps:all.filter(s=>['error','skipped','expired'].includes(s.status)).map(({id,startMs,endMs,status})=>({id,startMs,endMs,status})), retentionMs: this.retentionMs, apiCalls: this.apiCalls, apiCost: this.apiCost,
      pending: this.queue.length + this.visionQueue.length, audioPending: this.queue.length, visionPending: this.visionQueue.length, lastError: this.lastError, history: this.history, questions: this.questions,
      segments: this.segments.map(s => ({ ...s })) };
  }
  emit() { if (!this.closed) this.onChange(this.snapshot()); }
  async persist() {
    try { await this.archive.save(this.snapshot()); }
    catch { this.lastError = 'Impossible de sauvegarder le résumé de session.'; }
  }
}

function resolveTemporalTarget(question, segments, anchorMs) {
  const q = question.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const numbers = { une: 1, un: 1, deux: 2, trois: 3, quatre: 4, cinq: 5, six: 6, sept: 7, huit: 8, neuf: 9, dix: 10, quinze: 15, vingt: 20, trente: 30, quarante: 40, cinquante: 50 };
  const relative = q.match(/(?:il y a|y a|depuis)\s+(\d+(?:[.,]\d+)?|une?|deux|trois|quatre|cinq|six|sept|huit|neuf|dix|quinze|vingt|trente|quarante|cinquante)\s*(minute|seconde|min|sec)/);
  const absolute = q.match(/(?:a|vers|moment)\s+(\d{1,3}):(\d{2})/);
  let target;
  if (relative) target = anchorMs - (numbers[relative[1]] ?? Number(relative[1].replace(',', '.'))) * (relative[2].startsWith('min') ? 60000 : 1000);
  if (absolute) target = (Number(absolute[1]) * 60 + Number(absolute[2])) * 1000;
  if (target !== undefined) return target;
  if (/premier passage|tout debut/.test(q) && segments.length) return segments[0].startMs + 1;
}
function selectEvidence(question, segments, anchorMs, targetMs) {
  const target = targetMs ?? resolveTemporalTarget(question, segments, anchorMs);
  if (target !== undefined) return segments.filter(s => target >= s.startMs && target <= s.endMs).slice(0, 1);
  const q = question.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (/vient|maintenant|actuellement|dernier|cette scene|ce moment/.test(q)) return segments.slice(-1);
  const stop = new Set(['quoi', 'quel', 'quelle', 'comment', 'pourquoi', 'dans', 'avec', 'elle', 'cette', 'cest', 'etait', 'avait', 'plus', 'moins', 'estce', 'peux', 'vous', 'nous', 'film']);
  const terms = q.match(/[a-z]{4,}/g)?.filter(t => !stop.has(t)) || [];
  const ranked = segments.map(s => {
    const text = JSON.stringify(s.observation || {}).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    return { segment: s, score: terms.filter(t => text.includes(t)).length };
  }).sort((a, b) => b.score - a.score || b.segment.endMs - a.segment.endMs);
  return ranked.slice(0, 2).map(item => item.segment);
}

module.exports = { WatchSession, selectEvidence, resolveTemporalTarget };
