const { publishState } = require('./state-publication.cjs');

function passageEvent(type, sessionId, { id: passageId, revision, startMs, endMs }) {
  return {
    type,
    sessionId,
    passageId,
    revision,
    interval: { startMs, endMs },
  };
}

class PassageEvents {
  #pending = [];
  #updated = new Set();
  #sessionId;

  constructor(sessionId) {
    this.#sessionId = sessionId;
  }

  received(segment) {
    this.#pending.push(passageEvent('PassageReceived', this.#sessionId, segment));
  }

  suspended({ startMs, endMs }, code) {
    this.#pending.push({
      type: 'AdmissionSuspended',
      sessionId: this.#sessionId,
      passageId: null,
      revision: null,
      cause: { code },
      interval: { startMs, endMs },
    });
  }

  // Plusieurs pertes acquises sans attente partagent une seule version consultable.
  update(segment, lane, code) {
    const changed = !this.#updated.has(segment);
    if (changed) {
      segment.revision++;
      this.#updated.add(segment);
    }
    const event = passageEvent('PassageUpdated', this.#sessionId, segment);
    if (changed) this.#pending.push(event);
    if (lane) this.#pending.push({ ...event, type: 'PassageLost', lane, cause: { code } });
  }

  publish(onEvents, onPublicationError) {
    const pending = this.#pending;
    this.#pending = [];
    this.#updated.clear();
    if (!pending.length) return;
    publishState(() => onEvents(pending), onPublicationError, {
      origin: 'watch-session-events',
      sessionId: this.#sessionId,
    });
  }
}

module.exports = { PassageEvents };
