const { passageText } = require("./shared/passage-text.cjs");

const RETRY_BASE_MS = 2000,
  RETRY_MAX_MS = 60000;
const utf8Bytes = (text) => new TextEncoder().encode(text).length;

// Owns embedding creation and reuse. No ranking or temporal selection here.
// Passages are embedded in the background, as evidence is published (observe)
// or when a question needs them (request): one batch in flight, a bounded queue
// and one pending entry per passage id. ensure() remains the blocking catch-up.
class MomentIndex {
  // Options are accepted inline or as a second argument.
  constructor({ embeddings, cache, ...inline }, options = {}) {
    const {
      batchSize = 32,
      batchBytes = 48000,
      maxPending = 256,
      holdMs = 6000,
      flushMs = 0,
      maxAttempts = 3,
      now = () => Date.now(),
      setTimer = (fn, ms) => setTimeout(fn, ms),
      clearTimer = (timer) => clearTimeout(timer),
    } = { ...inline, ...options };
    Object.assign(this, {
      embeddings,
      cache,
      batchSize,
      batchBytes,
      maxPending,
      holdMs,
      flushMs,
      maxAttempts,
      now,
      setTimer,
      clearTimer,
    });
    this.pending = new Map(); // id -> entry, oldest first
    this.flying = new Map(); // id -> entry of the batch in flight
    this.exhausted = new Map(); // id -> text given up after maxAttempts
    this.calls = new Map(); // text -> provider call shared by embedCached
    this.waiters = new Set();
    this.intake = Promise.resolve();
    this.lifetime = new AbortController();
    this.counts = { indexed: 0, coalesced: 0, dropped: 0, failed: 0, stale: 0 };
    this.requests = 0;
    this.lastIndexedAtMs = 0;
    this.running = false;
    this.closed = false;
    this.timer = null;
    this.failures = 0;
    this.pausedUntil = 0;
  }

  async ensure(segments, signal) {
    for (const segment of segments) {
      signal?.throwIfAborted();
      const text = passageText(segment);
      if (text) await this.embedCached(segment.id, text, signal);
    }
  }

  async embedCached(id, text, signal) {
    const cached = await this.cache.get(id, text);
    if (cached) return cached;
    signal?.throwIfAborted();
    const vector = await this.embedShared(text, signal);
    signal?.throwIfAborted();
    this.lifetime.signal.throwIfAborted();
    await this.cache.put(id, text, vector);
    return vector;
  }

  // One provider call per distinct text, shared by concurrent callers and
  // aborted only once every caller has given up or the index is closed.
  embedShared(text, signal) {
    this.lifetime.signal.throwIfAborted();
    let call = this.calls.get(text);
    if (!call) {
      const controller = new AbortController();
      const forget = () =>
        this.calls.get(text) === call && this.calls.delete(text);
      call = { controller, forget, waiting: 0 };
      this.calls.set(text, call);
      call.vector = (async () =>
        this.embeddings.embed(text, controller.signal))().finally(forget);
      call.vector.catch(() => {});
    }
    call.waiting++;
    return new Promise((resolve, reject) => {
      const leave = () => {
        if (--call.waiting === 0) {
          call.forget();
          call.controller.abort(signal.reason);
        }
        reject(signal.reason);
      };
      if (signal?.aborted) return leave();
      signal?.addEventListener("abort", leave, { once: true });
      call.vector
        .then(resolve, reject)
        .finally(() => signal?.removeEventListener("abort", leave));
    });
  }

  queryVector(query, signal) {
    return this.embedCached("__query__", query, signal);
  }
  passageVector(segment) {
    return this.cache.get(segment.id, passageText(segment));
  }

  // Background indexing of published evidence. Never throws, never awaited.
  observe(passages) {
    this.admit(passages, false);
  }
  // Same, for passages a question is waiting for: no hold, processed first.
  request(passages) {
    this.admit(passages, true);
  }

  admit(passages, priority) {
    if (this.closed) return;
    let items;
    try {
      items = [...passages]
        .map((passage) => ({ id: passage.id, text: passageText(passage) }))
        .filter((item) => item.text.trim());
    } catch {
      return;
    }
    if (!items.length) return;
    if (priority) this.requests++;
    // Serialised: two revisions of one passage are applied in call order.
    this.intake = this.intake
      .then(async () => {
        try {
          const cached = await Promise.all(
            items.map(async ({ id, text }) => {
              try {
                return await this.cache.get(id, text);
              } catch {
                return null;
              }
            }),
          );
          if (this.closed) return;
          items.forEach(({ id, text }, i) =>
            this.enqueue(id, text, priority, Boolean(cached[i])),
          );
        } finally {
          if (priority) this.requests--;
          this.wake();
          this.pump();
        }
      })
      .catch(() => {});
  }

  // Published evidence waits holdMs for a fuller text, then for the next flushMs boundary so that
  // a steady stream is sent as a few passages per request. A question never waits for either.
  eligibleAt(now) {
    const at = now + this.holdMs;
    return this.flushMs > 0 ? Math.ceil(at / this.flushMs) * this.flushMs : at;
  }

  enqueue(id, text, priority, cached) {
    const flying = this.flying.get(id),
      queued = this.pending.get(id),
      now = this.now();
    // A text already indexed needs nothing, and must not disturb a newer one on its way.
    if (cached && flying?.text !== text && queued?.text !== text) return;
    // The result of an older text must not be written over a newer one.
    if (flying) flying.latest = text;
    if (cached || flying?.text === text) {
      if (queued) {
        this.pending.delete(id);
        if (queued.text !== text) this.counts.coalesced++;
      }
      if (priority && flying?.text === text) flying.priority = true;
      return;
    }
    if (priority) this.exhausted.delete(id);
    // Published evidence does not re-arm a text given up; a question does.
    else if (this.exhausted.get(id) === text) return;
    if (queued) {
      if (queued.text !== text) {
        // A question waiting for the replaced text no longer waits for it.
        Object.assign(queued, {
          text,
          priority: false,
          attempts: 0,
          readyAt: this.eligibleAt(now),
        });
        this.counts.coalesced++;
      }
      if (priority) Object.assign(queued, { priority, readyAt: now });
      return;
    }
    this.exhausted.delete(id);
    this.pending.set(id, {
      id,
      text,
      priority,
      attempts: 0,
      readyAt: priority ? now : this.eligibleAt(now),
    });
    this.bound();
  }

  // Overflow drops background entries first, oldest first; each one is counted.
  bound() {
    while (this.pending.size > this.maxPending) {
      let victim;
      for (const entry of this.pending.values()) {
        victim ??= entry;
        if (!entry.priority) {
          victim = entry;
          break;
        }
      }
      this.pending.delete(victim.id);
      this.counts.dropped++;
    }
  }

  // At most one batch in flight; otherwise one timer for the next eligible one.
  pump() {
    if (this.closed || this.running) return;
    this.clearTimer(this.timer);
    this.timer = null;
    let next = Infinity;
    for (const entry of this.pending.values())
      next = Math.min(next, entry.readyAt);
    if (next === Infinity) return;
    // After a failed batch nothing is sent before the shared pause ends, question or not.
    next = Math.max(next, this.pausedUntil);
    const now = this.now();
    if (next <= now) return void this.run(now).catch(() => {});
    this.timer = this.setTimer(() => {
      this.timer = null;
      this.pump();
    }, next - now);
    this.timer?.unref?.();
  }

  async run(now) {
    this.running = true;
    const ready = [...this.pending.values()].filter((e) => e.readyAt <= now);
    // Without embedMany a passage is its own call: a failure costs one passage.
    const size = this.embeddings.embedMany ? this.batchSize : 1;
    const batch = [];
    let bytes = 0;
    for (const entry of [
      ...ready.filter((e) => e.priority),
      ...ready.filter((e) => !e.priority),
    ]) {
      bytes += utf8Bytes(entry.text);
      if (batch.length && (batch.length >= size || bytes > this.batchBytes))
        break;
      batch.push(entry);
    }
    for (const entry of batch) {
      this.pending.delete(entry.id);
      entry.latest = entry.text;
      this.flying.set(entry.id, entry);
    }
    let work = batch;
    try {
      const texts = batch.map((e) => e.text),
        signal = this.lifetime.signal;
      const vectors = this.embeddings.embedMany
        ? await this.embeddings.embedMany(texts, signal)
        : [await this.embeddings.embed(texts[0], signal)];
      if (this.closed) return;
      if (
        !Array.isArray(vectors) ||
        vectors.length !== batch.length ||
        !vectors.every(Array.isArray)
      )
        throw new Error("Réponse d’embeddings incomplète.");
      // Stale: a newer text was observed or requested for this id meanwhile.
      const items = [];
      batch.forEach(({ id, text, latest }, i) => {
        if (latest === text) items.push({ id, text, vector: vectors[i] });
      });
      work = batch.filter((e) => e.latest === e.text);
      this.counts.stale += batch.length - work.length;
      if (items.length) {
        if (this.cache.putMany) await this.cache.putMany(items);
        else
          for (const { id, text, vector } of items) {
            if (this.closed) return;
            await this.cache.put(id, text, vector);
          }
        if (this.closed) return;
        this.counts.indexed += work.length;
        this.lastIndexedAtMs = this.now();
      }
      this.failures = 0;
      this.pausedUntil = 0;
    } catch {
      if (!this.closed) {
        // An outage or a refused key costs one request per backoff step, however many searches ask.
        this.pausedUntil =
          this.now() +
          Math.min(RETRY_MAX_MS, RETRY_BASE_MS * 2 ** this.failures++);
        this.retry(work);
      }
    } finally {
      for (const entry of batch)
        if (this.flying.get(entry.id) === entry) this.flying.delete(entry.id);
      this.running = false;
      this.wake();
      this.pump();
    }
  }

  retry(entries) {
    const now = this.now();
    for (const entry of entries) {
      this.counts.failed++;
      // Superseded meanwhile: the newer text is already queued or cached.
      if (entry.latest !== entry.text) continue;
      if (++entry.attempts >= this.maxAttempts) {
        this.counts.dropped++;
        this.exhausted.set(entry.id, entry.text);
        if (this.exhausted.size > this.maxPending)
          this.exhausted.delete(this.exhausted.keys().next().value);
        continue;
      }
      // A question never waits for a backoff.
      entry.priority = false;
      entry.readyAt =
        now +
        Math.min(RETRY_MAX_MS, RETRY_BASE_MS * 2 ** (entry.attempts - 1));
      this.pending.set(entry.id, entry);
    }
    this.bound();
  }

  urgent() {
    const priority = (entry) => entry.priority;
    return (
      !this.closed &&
      (this.requests > 0 ||
        [...this.pending.values()].some(priority) ||
        [...this.flying.values()].some(priority))
    );
  }
  // Requested passages that cannot be sent before `deadline`: the shared pause outlasts it and
  // nothing requested is in flight or being admitted. Waiting for them would be waiting for nothing.
  stalled(deadline) {
    return (
      this.requests === 0 &&
      this.pausedUntil > this.now() &&
      this.pausedUntil >= deadline &&
      ![...this.flying.values()].some((entry) => entry.priority)
    );
  }
  wake() {
    const urgent = this.urgent();
    for (const waiter of [...this.waiters])
      if (!urgent) waiter(true);
      else if (this.stalled(waiter.deadline)) waiter(false);
  }

  // true once nothing requested is pending or in flight, false after budgetMs, or at once when a
  // pause after a provider failure outlasts the budget.
  // Only the wait is bounded or aborted: background work carries on.
  settle(budgetMs = 0, signal) {
    return new Promise((resolve, reject) => {
      if (signal?.aborted) return reject(signal.reason);
      if (!this.urgent()) return resolve(true);
      const deadline = this.now() + Math.max(0, budgetMs);
      if (this.stalled(deadline)) return resolve(false);
      let timer;
      const leave = (finish, value) => {
        this.waiters.delete(waiter);
        this.clearTimer(timer);
        signal?.removeEventListener("abort", abort);
        finish(value);
      };
      const waiter = (value = true) => leave(resolve, value);
      waiter.deadline = deadline;
      const abort = () => leave(reject, signal.reason);
      const expire = () => leave(resolve, false);
      this.waiters.add(waiter);
      signal?.addEventListener("abort", abort, { once: true });
      if (Number.isFinite(budgetMs))
        timer = this.setTimer(expire, Math.max(0, budgetMs));
    });
  }

  // Session end: pending and in-flight work is abandoned (counted as dropped)
  // and a late provider response is never written.
  close() {
    if (this.closed) return;
    this.closed = true;
    this.clearTimer(this.timer);
    this.timer = null;
    const reason = new Error("Index fermé.");
    this.lifetime.abort(reason);
    for (const call of this.calls.values()) call.controller.abort(reason);
    this.calls.clear();
    this.counts.dropped += this.pending.size + this.flying.size;
    this.pending.clear();
    this.flying.clear();
    this.exhausted.clear();
    for (const waiter of [...this.waiters]) waiter();
  }

  status() {
    return {
      ...this.counts,
      pending: this.pending.size,
      inFlight: this.flying.size,
      lastIndexedAtMs: this.lastIndexedAtMs,
      pausedUntilMs: this.pausedUntil,
      closed: this.closed,
    };
  }
}
module.exports = { MomentIndex };
