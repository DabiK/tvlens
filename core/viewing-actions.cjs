// Tokens capture the viewer's intent before the recorder seals its current clip.
class ViewingActions {
  constructor({ makeId }) { this.makeId = makeId; this.reset(); }
  reset() { this.sessionId = null; this.markerMs = 0; this.tokens = new Map(); }
  // Every action reads a memory view: its session identity, its clock and how far capture went.
  sync(view) {
    if (!view) throw Error('Lance TVLens sur une vidéo pour utiliser cette action.');
    if (this.sessionId !== view.session.id) { this.reset(); this.sessionId = view.session.id; }
  }
  freeze(view, { kind = 'explain' } = {}) {
    this.sync(view);
    if (!['explain', 'catch-up'].includes(kind)) throw Error('Action inconnue.');
    const anchorMs = view.clock.elapsedMs;
    if (!Number.isFinite(anchorMs)) throw Error('Instant indisponible.');
    const value = { token: this.makeId(), sessionId: view.session.id, kind, anchorMs,
      startMs: kind === 'catch-up' ? this.markerMs : Math.max(0, anchorMs - 20000), endMs: anchorMs };
    this.tokens.set(value.token, value);
    while (this.tokens.size > 30) this.tokens.delete(this.tokens.keys().next().value);
    return { ...value };
  }
  resolve(view, token, kind) {
    this.sync(view);
    const value = this.tokens.get(token);
    if (!value || value.sessionId !== view.session.id || value.kind !== kind) throw Error('Cet instant a expiré. Sélectionne à nouveau le moment.');
    return { ...value };
  }
  mark(view) {
    this.sync(view);
    // The marker follows a complete captured segment so no half-segment is silently lost.
    this.markerMs = view.clock.capturedThroughMs || 0;
    return { sessionId: this.sessionId, atMs: this.markerMs };
  }
  // The finished moment action kept its consultation: the re-examination reads it again, same session, instant and
  // interval, never the passages captured since.
  reexamination(job, view) {
    this.sync(view);
    const kept = job?.intent && job.sessionId === view.session.id && typeof job.tools?.consultationScope === 'function'
      ? job.tools.consultationScope() : null;
    if (!kept || kept.sessionId !== view.session.id) throw Error('Ce moment n’est plus disponible dans cette session.');
    const anchorMs = job.anchorMs, startMs = kept.startMs ?? 0;
    return {
      question: job.question,
      options: { mode: 'inspect', intent: job.intent, anchorMs, startMs,
        consultation: { sessionId: kept.sessionId, anchorMs, startMs,
          passages: kept.passages.filter(p => p.startMs >= startMs && p.endMs <= anchorMs) } }
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
