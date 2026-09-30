const {
  sessionTimeline,
  momentDetail,
} = require("../core/session-timeline.cjs");
const { randomUUID } = require("node:crypto");
const {
  createSessionRuntime,
  validateSegment,
} = require("./session-runtime.cjs");
const { createConversationRuntime } = require("./conversation-runtime.cjs");
const { CodexQuota } = require("../adapters/codex-quota.cjs");

class HeadlessRuntime {
  constructor(options) {
    this.options = options;
    this.listeners = new Set();
    this.ingestions = new Set();
    this.quota = new CodexQuota();
    const conversation = createConversationRuntime({
      ...options,
      quota: this.quota,
      getSession: () => this.session,
      onChange: (state) => {
        if (this.session) {
          const watch = this.session.watch;
          const busy =
            this.closing ||
            state.jobs.some((j) => ["queued", "running"].includes(j.status));
          if (watch.asking !== busy) {
            watch.asking = busy;
            watch.emit();
            if (!busy) queueMicrotask(() => watch.drain());
          }
          this.session.store.saveResearch(state).catch(() => {});
        }
        this.emit();
      },
    });
    this.agent = conversation.agent;
    this.deep = conversation.deep;
    this.timer = setInterval(
      () => this.session?.watch.prune().catch(() => {}),
      5000,
    );
    this.timer.unref();
  }
  emit() {
    for (const listener of this.listeners) listener(this.snapshot());
  }
  snapshot() {
    const session = this.session?.watch.snapshot() || null;
    const captureGaps = [];
    let through = 0;
    for (const passage of [
      ...(session?.history || []),
      ...(session?.segments || []),
    ]) {
      if (passage.startMs - through > 1000)
        captureGaps.push({ startMs: through, endMs: passage.startMs });
      through = Math.max(through, passage.endMs);
    }
    return {
      session,
      timeline: sessionTimeline(session),
      chat: this.deep.snapshot(),
      captureGaps,
      quota: this.quota.snapshot(),
    };
  }
  async start() {
    if (this.ending) await this.ending;
    if (!this.session) {
      this.session = createSessionRuntime({
        ...this.options,
        id: randomUUID(),
        quota: this.quota,
        onChange: () => this.emit(),
      });
      this.agent.prepare?.(this.session.id).catch(() => {});
    } else if (!this.session.watch.accepting) await this.session.resume();
    this.emit();
    return {
      id: this.session.id,
      elapsedMs: this.session.watch.now(),
      retentionMs: this.session.watch.retentionMs,
    };
  }
  async pause() {
    await this.session?.pause();
    this.emit();
  }
  async ingest(input) {
    if (!this.session || input.sessionId !== this.session.id)
      throw Error("Session obsolète.");
    validateSegment(input, this.session.watch.now());
    if (this.ending || this.closing)
      throw Error("Session en cours de fermeture.");
    const work = this.session.watch.ingest(input);
    this.ingestions.add(work);
    try {
      return await work;
    } finally {
      this.ingestions.delete(work);
    }
  }
  ask({ question, sessionId, anchorMs, moment }) {
    if (this.ending) throw Error("Session en cours de fermeture.");
    if (!this.session || sessionId !== this.session.id)
      throw Error("Session obsolète.");
    if (
      !Number.isFinite(anchorMs) ||
      anchorMs < 0 ||
      anchorMs > this.session.watch.now() + 3000
    )
      throw Error("Ancrage invalide.");
    const snapshot = this.session.watch.snapshot();
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
    if (!this.session || this.session.id !== sessionId)
      throw Error("Session obsolète.");
    return momentDetail(this.session.watch.snapshot(), segmentIds || { firstId, lastId });
  }
  async end() {
    if (this.ending) return this.ending;
    this.ending = (async () => {
      await this.session?.pause();
      await Promise.allSettled([...this.ingestions]);
      this.deep.cancelAll("Session terminée.");
      await this.agent.close?.();
      await this.session?.close();
      this.session = null;
      this.deep.jobs = [];
      this.emit();
    })();
    try {
      await this.ending;
    } finally {
      this.ending = null;
    }
  }
  cancel(id) {
    this.deep.cancel("Question annulée.", id);
  }
  async close() {
    this.closing = true;
    clearInterval(this.timer);
    this.deep.cancelAll();
    await Promise.allSettled([...this.ingestions]);
    await this.agent.close?.();
    await this.session?.close();
  }
}
module.exports = { HeadlessRuntime };
