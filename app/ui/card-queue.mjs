/**
 * Display queue of the discreet result cards (Mac equivalent of the TV overlay). Pure: the clock is passed in.
 *
 * - a card is shown for `durationMs`, then leaves by itself; nothing here ever takes the focus;
 * - a card is shown once: offered again by a later state (the host keeps publishing the last ones), it is ignored;
 * - a card that could not be shown while it was fresh is not shown late: it stays in the history only;
 * - only a sourced verification enters: a video signal is read in the panel and in the history, never here,
 *   whoever offers it.
 * Durations are a local, reversible choice of the viewer (same three values as on TV).
 */
export const CARD_DURATIONS_MS = Object.freeze([8000, 14000, 20000]);
export const DEFAULT_CARD_DURATION_MS = 14000;
// How long a finished result is still news. Unrelated to the ceiling of a question: a display choice of this window.
export const CARD_FRESH_MS = 60000;

const moment = (card, now) => (Number.isFinite(card.finishedAt) ? card.finishedAt : now);

export class CardQueue {
  constructor({ durationMs = DEFAULT_CARD_DURATION_MS, freshMs = CARD_FRESH_MS, maxVisible = 3, graceMs = 4000 } = {}) {
    Object.assign(this, { durationMs, freshMs, maxVisible, graceMs });
    this.reset(null);
  }
  /** A queue belongs to one session: another session starts from nothing. */
  reset(sessionId = null) {
    this.sessionId = sessionId; this.seen = new Set(); this.pending = []; this.shown = []; this.stale = 0;
  }
  setDuration(durationMs) { if (CARD_DURATIONS_MS.includes(durationMs)) this.durationMs = durationMs; }

  /**
   * Cards of a published state. `prime` marks them all as already seen (reopened archive, restored registry):
   * old results are history, not news. Returns how many cards entered the queue.
   */
  offer(cards, { sessionId = null, now, prime = false } = {}) {
    if (sessionId !== this.sessionId) this.reset(sessionId);
    let accepted = 0;
    for (const card of Array.isArray(cards) ? cards : []) {
      if (!card || typeof card.key !== 'string' || card.kind !== 'verification' || this.seen.has(card.key)) continue;
      this.seen.add(card.key);
      if (prime) continue;
      if (now - moment(card, now) > this.freshMs) { this.stale++; continue; }
      this.pending.push(card); accepted++;
    }
    return accepted;
  }

  /**
   * Cards to draw now. `displayable: false` (window hidden) starts no timer: a card is never used up unseen,
   * it simply stops being news once it is no longer fresh.
   */
  visible(now, { displayable = true } = {}) {
    this.shown = this.shown.filter(entry => entry.held || now < entry.expiresAt);
    this.pending = this.pending.filter(card => { const fresh = now - moment(card, now) <= this.freshMs; if (!fresh) this.stale++; return fresh; });
    while (displayable && this.shown.length < this.maxVisible && this.pending.length) {
      const card = this.pending.shift();
      this.shown.push({ card, shownAt: now, expiresAt: now + this.durationMs, held: false });
    }
    return this.shown.map(entry => ({ ...entry.card, remainingMs: Math.max(0, entry.expiresAt - now) }));
  }
  /** When to look again: the next card to leave, or null when nothing is on screen. */
  nextChangeAt() {
    const times = this.shown.filter(entry => !entry.held).map(entry => entry.expiresAt);
    return times.length ? Math.min(...times) : null;
  }
  get waiting() { return this.pending.length; }

  /** The results are on screen elsewhere (surveillance panel open): nothing left to pop up, nothing shown twice. */
  clear() { this.pending = []; this.shown = []; }
  dismiss(key) {
    this.shown = this.shown.filter(entry => entry.card.key !== key);
    this.pending = this.pending.filter(card => card.key !== key);
  }
  /** Pointer over a card: it does not vanish under the hand. */
  hold(key) { const entry = this.shown.find(item => item.card.key === key); if (entry) entry.held = true; }
  release(key, now, graceMs = this.graceMs) {
    const entry = this.shown.find(item => item.card.key === key);
    if (entry) Object.assign(entry, { held: false, expiresAt: Math.max(entry.expiresAt, now + graceMs) });
  }
}
