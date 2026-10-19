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
  #updatedPassages = new Set();
  #sessionId;

  constructor(sessionId) {
    this.#sessionId = sessionId;
  }

  received(passage) {
    this.#pending.push(passageEvent('PassageReceived', this.#sessionId, passage));
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
  update(passage, lane, code) {
    const changed = !this.#updatedPassages.has(passage);
    if (changed) {
      passage.revision++;
      this.#updatedPassages.add(passage);
    }
    const event = passageEvent('PassageUpdated', this.#sessionId, passage);
    if (changed) this.#pending.push(event);
    if (lane) this.#pending.push({ ...event, type: 'PassageLost', lane, cause: { code } });
  }

  publish(onEvents, onPublicationError) {
    const pending = this.#pending;
    this.#pending = [];
    this.#updatedPassages.clear();
    if (!pending.length) return;
    publishState(() => onEvents(pending), onPublicationError, {
      origin: 'watch-session-events',
      sessionId: this.#sessionId,
    });
  }
}

module.exports = { PassageEvents };
