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

function buildManifest(facts, state, closed) {
  const { id, host, store, thumbnails, captures, wallClock } = facts;
  const passages = [...state.history, ...state.segments];
  const stored = state.segments.filter((segment) => segment.available).length;
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
    elapsedMs: state.elapsedMs,
    capturedThroughMs: state.capturedThroughMs,
    passages: passages.length,
    media: {
      stored,
      missing: passages.length - stored,
      bytes: store.bytes + thumbnails.bytes,
      retention: state.retention,
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
}) {
  const captures = restore
    ? [...(restore.manifest?.captures || [])]
    : [{ startedAt: wallClock(), fromMs: 0 }];
  const facts = { id, host, store, thumbnails, wallClock, restore, captures };
  let manifestAt = -Infinity;
  return {
    captureResumed(fromMs) {
      captures.push({ startedAt: wallClock(), fromMs });
      captures.splice(0, captures.length - MANIFEST_MAX_CAPTURES);
    },
    publish(state) {
      // First stored passage, then a bounded cadence: the manifest of a session cut short is at most this old.
      if (
        !state.readOnly &&
        state.accepting &&
        state.coverage.passages &&
        readClock() - manifestAt >= MANIFEST_EVERY_MS
      )
        return this.record(state);
    },
    // `final` vouches for the last states already on disk: it is the write that first says "archived".
    record(state, patch = {}, final = false) {
      // Opening and closing a reopened archive without resuming must leave its directory intact.
      if (readOnly()) return Promise.resolve();
      manifestAt = readClock();
      // The runtime alone confirms this life's end after its final states and manifest have landed.
      // Once confirmed it stays: a late pause must not make it look interrupted again. A refused end
      // must not look archived, nor inherit confirmation from the manifest of an earlier life.
      return store
        .saveManifest({
          ...buildManifest(facts, state, final || hasConfirmedEnd()),
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
