const {
  sessionTitle,
  MANIFEST_FORMAT,
  MANIFEST_VERSION,
} = require("../adapters/session-library.cjs");

// The manifest carries what a session list needs; during capture it is rewritten at most this often.
const MANIFEST_EVERY_MS = 30000,
  MANIFEST_MAX_CAPTURES = 100;

function sessionCreatedAt({ store, restore, captures, wallClock }) {
  return (
    store.manifest?.createdAt ??
    restore?.createdAt ??
    captures[0]?.startedAt ??
    wallClock()
  );
}

function firstTopicOf(passages) {
  return (
    passages.find((passage) => passage.observation?.topic)?.observation.topic ||
    null
  );
}

function buildManifest(facts, view, closed) {
  const { id, host, store, thumbnails, captures, wallClock } = facts;
  const passages = view.passages;
  const stored = view.coverage.replayablePassages;
  const createdAt = sessionCreatedAt(facts);
  return {
    format: MANIFEST_FORMAT,
    version: MANIFEST_VERSION,
    id,
    host: store.manifest?.host ?? host,
    createdAt,
    updatedAt: wallClock(),
    closedAt: closed ? (store.manifest?.closedAt ?? wallClock()) : null,
    state: closed ? "archived" : "live",
    title: store.manifest?.title || sessionTitle(createdAt),
    firstTopic: store.manifest?.firstTopic || firstTopicOf(passages),
    elapsedMs: view.clock.elapsedMs,
    capturedThroughMs: view.clock.capturedThroughMs,
    passages: passages.length,
    media: {
      stored,
      missing: passages.length - stored,
      bytes: store.bytes + thumbnails.bytes,
      retention: view.session.retention,
    },
    captures,
  };
}

function createSessionManifest({
  id,
  host,
  store,
  thumbnails,
  wallClock,
  readClock,
  restore = null,
  hasConfirmedEnd,
  readOnly,
  accepting,
  memory,
  readPublishedView = () => memory.view(),
}) {
  const captures = restore
    ? [...(restore.manifest?.captures || [])]
    : [{ startedAt: wallClock(), fromMs: 0 }];
  const facts = { id, host, store, thumbnails, wallClock, restore, captures };
  let manifestAt = -Infinity;
  let hasPassages = false;
  let unsubscribe;
  return {
    connect(events) {
      unsubscribe?.();
      // L'horloge bornée reconnaît aussi une archive dont tous les passages sont en history.
      hasPassages = memory.passages([]).clock.capturedThroughMs > 0;
      unsubscribe = events.subscribe(event => {
        if (event.sessionId === id && ['PassageReceived', 'PassageUpdated'].includes(event.type)) hasPassages = true;
        if (event.sessionId === id && event.type === 'MemoryInvalidated') this.publish();
      });
    },
    disconnect() {
      unsubscribe?.();
    },
    captureResumed(fromMs) {
      captures.push({ startedAt: wallClock(), fromMs });
      captures.splice(0, captures.length - MANIFEST_MAX_CAPTURES);
    },
    publish() {
      // First stored passage, then a bounded cadence: the manifest of a session cut short is at most this old.
      if (
        !readOnly() &&
        accepting() &&
        hasPassages &&
        readClock() - manifestAt >= MANIFEST_EVERY_MS
      )
        return this.record({}, false, readPublishedView);
    },
    // `final` vouches for the last states already on disk: it is the write that first says "archived".
    record(patch = {}, final = false, readView = () => memory.view()) {
      // Opening and closing a reopened archive without resuming must leave its directory intact.
      if (readOnly()) return Promise.resolve();
      manifestAt = readClock();
      // The runtime alone confirms this life's end after its final states and manifest have landed.
      // Once confirmed it stays: a late pause must not make it look interrupted again. A refused end
      // must not look archived, nor inherit confirmation from the manifest of an earlier life.
      return store
        .saveManifest({
          ...buildManifest(facts, readView(), final || hasConfirmedEnd()),
          ...patch,
        })
        .catch((error) => {
          // A current refusal only delays the list; the final refusal must reach archive().
          if (final) throw error;
        });
    },
  };
}

module.exports = { createSessionManifest, MANIFEST_EVERY_MS };
