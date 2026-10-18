const { latencySummary } = require('../../core/memory/index.cjs');

// Les omissions et l'ordre historiques appartiennent au fil ; les lecteurs métier gardent la consultation.
function publishedPassage(passage) {
  return Object.fromEntries(passage.fieldOrder.map(key => {
    let value = passage[key];
    if (Object.hasOwn(passage.metadata, key)) value = passage.metadata[key];
    if (key === 'available') value = passage.availability.replayable;
    if (passage.explicitNulls.includes(key)) value = null;
    if (passage.undefinedFields.includes(key)) value = undefined;
    return [key, value];
  }));
}

function projectSession(memory, status, questions, usage, storage) {
  const { session, clock, coverage, losses } = memory;
  const history = [], segments = [];
  for (const passage of memory.passages) {
    const target = passage.origin === 'history' ? history : segments;
    target.push(publishedPassage(passage));
  }
  return {
    id: session.id, accepting: status.accepting, asking: status.asking, analyzing: status.analyzing,
    elapsedMs: clock.elapsedMs, capturedThroughMs: clock.capturedThroughMs, analyzedThroughMs: clock.analyzedThroughMs,
    analysisLagMs: clock.analysisLagMs, contextThroughMs: clock.contextThroughMs,
    gaps: coverage.gaps,
    retentionMs: status.retentionMs, retention: status.retention,
    readOnly: status.readOnly, unplacedMedia: status.unplacedMedia, ...usage,
    pending: status.pending, audioPending: status.audioPending, visionPending: status.visionPending,
    lastError: status.lastError, history, questions,
    latency: latencySummary([...history, ...segments]),
    coverage: { passages: coverage.passages, ...losses, visionBlockedMs: status.visionBlockedMs },
    audioGaps: coverage.audioGaps,
    visionGaps: coverage.visionGaps.map(({ reason, ...gap }) => ({ ...gap, ...(reason ? { reason } : {}) })),
    storage, segments,
  };
}

function createMemoryProjection({ memory, now, storage }) {
  return {
    read() {
      const view = memory.view();
      return {
        memory: view,
        session: projectSession(view, memory.readPublicationStatus(), memory.readHistoricalQuestions(), memory.readUsage(), storage()),
      };
    },
    live() {
      const { accepting, asking, readOnly } = memory.readPublicationStatus();
      return { accepting, asking, readOnly, elapsedMs: now(), storage: storage() };
    },
  };
}

module.exports = { createMemoryProjection };
