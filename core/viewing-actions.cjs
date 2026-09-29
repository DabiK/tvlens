// Tokens capture the viewer's intent before the recorder seals its current clip.
class ViewingActions {
  constructor({ makeId }) { this.makeId = makeId; this.reset(); }
  reset() { this.sessionId = null; this.markerMs = 0; this.tokens = new Map(); }
  sync(snapshot) {
    if (!snapshot) throw Error('Lance TVLens sur une vidéo pour utiliser cette action.');
    if (this.sessionId !== snapshot.id) { this.reset(); this.sessionId = snapshot.id; }
  }
  freeze(snapshot, { kind = 'explain' } = {}) {
    this.sync(snapshot);
    if (!['explain', 'catch-up'].includes(kind)) throw Error('Action inconnue.');
    const anchorMs = snapshot.elapsedMs;
    if (!Number.isFinite(anchorMs)) throw Error('Instant indisponible.');
    const value = { token: this.makeId(), sessionId: snapshot.id, kind, anchorMs,
      startMs: kind === 'catch-up' ? this.markerMs : Math.max(0, anchorMs - 20000), endMs: anchorMs };
    this.tokens.set(value.token, value);
    while (this.tokens.size > 30) this.tokens.delete(this.tokens.keys().next().value);
    return { ...value };
  }
  resolve(snapshot, token, kind) {
    this.sync(snapshot);
    const value = this.tokens.get(token);
    if (!value || value.sessionId !== snapshot.id || value.kind !== kind) throw Error('Cet instant a expiré. Sélectionne à nouveau le moment.');
    return { ...value };
  }
  mark(snapshot) {
    this.sync(snapshot);
    // The marker follows a complete captured segment so no half-segment is silently lost.
    this.markerMs = snapshot.capturedThroughMs || 0;
    return { sessionId: this.sessionId, atMs: this.markerMs };
  }
  reexamination(job, snapshot) {
    this.sync(snapshot);
    if (!job?.intent || job.sessionId !== snapshot.id || !job.tools?.segments) throw Error('Ce moment n’est plus disponible dans cette session.');
    const anchorMs = job.anchorMs, startMs = job.tools.startMs ?? 0;
    return {
      question: job.question,
      options: { mode: 'inspect', intent: job.intent, anchorMs, startMs,
        snapshot: { id: job.sessionId, elapsedMs: anchorMs, history: [],
          segments: JSON.parse(JSON.stringify(job.tools.segments)).filter(s => s.startMs >= startMs && s.endMs <= anchorMs) } }
    };
  }
  acknowledgeResult(value, job, segments) {
    if (job.status !== 'done' || !job.result?.citations?.length) return;
    const covered = s => job.result.citations.some(c => c.id === s.id && c.startMs <= s.startMs && c.endMs >= s.endMs);
    const citedThroughMs = Math.max(value.startMs, ...job.result.citations.map(c => c.endMs));
    const ready = segments.filter(s => s.endMs <= citedThroughMs && (s.status === 'ready' || covered(s)));
    const pending = segments.filter(s => s.status !== 'ready' && !covered(s));
    // Keep unanalyzed gaps in the next recap, even if later summaries are already ready.
    const endMs = Math.min(Math.max(value.startMs, ...ready.map(s => s.endMs)), ...pending.map(s => s.startMs));
    this.acknowledge({ ...value, endMs });
  }
  acknowledge(value) {
    if (this.sessionId === value.sessionId) this.markerMs = Math.max(this.markerMs, value.endMs);
  }
}
module.exports = { ViewingActions };
