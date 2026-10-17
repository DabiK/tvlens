const { hasUsableObservation } = require('../passage-text.cjs');
const { domainError } = require('../shared/domain-error.cjs');
const { calculateCoverage } = require('./coverage.cjs');
const TVLENS_MEMORY_LIMIT_INVALID = 'TVLENS_MEMORY_LIMIT_INVALID';
const TVLENS_MEMORY_IDS_INVALID = 'TVLENS_MEMORY_IDS_INVALID';
const NULLABLE_FIELDS = [
  'revision', 'status', 'audioStatus', 'visionStatus', 'error', 'audioError', 'visionError',
  'visionSkipReason', 'stage', 'summary',
];
const CAPTURE_JITTER_MS = 250;

function captureGapsOf(passages) {
  const captureGaps = [];
  let through = 0;
  for (const passage of passages) {
    if (passage.startMs - through > CAPTURE_JITTER_MS) captureGaps.push({ startMs: through, endMs: passage.startMs });
    through = Math.max(through, passage.endMs);
  }
  return captureGaps;
}

function historicalModalities(passage) {
  let audio = 'unknown';
  if (typeof passage.hasAudio === 'boolean') audio = passage.hasAudio ? 'present' : 'absent';
  return { audio, images: 'unknown', video: 'unknown' };
}

function passageView(passage, origin, known) {
  const modalities = known || historicalModalities(passage);
  const replayable = origin === 'retained' && Boolean(passage.available);
  const reason = replayable ? null : passage.mediaReason || 'expired';
  const kept = origin === 'retained' && (replayable || reason === 'unreadable');
  const available = modality => {
    if (!kept || modality === 'absent') return false;
    return modality === 'present' ? true : null;
  };
  return {
    id: passage.id,
    startMs: passage.startMs,
    endMs: passage.endMs,
    ...Object.fromEntries(NULLABLE_FIELDS.map(key => [key, passage[key] ?? null])),
    explicitNulls: NULLABLE_FIELDS.filter(key => passage[key] === null),
    audioFailed: Boolean(passage.audioFailed),
    ...(passage.audioFailureCode ? { audioFailureCode: passage.audioFailureCode } : {}),
    observation: passage.observation ? structuredClone(passage.observation) : null,
    topicSummary: passage.topicSummary ? structuredClone(passage.topicSummary) : null,
    thumbnailAvailable: Boolean(passage.thumbnailAvailable),
    origin,
    modalities: { ...modalities },
    availability: { replayable, reason, images: available(modalities.images), audio: available(modalities.audio) },
    usableObservation: hasUsableObservation(passage),
  };
}

// Cette lecture ne demande ni snapshot d'hôte, ni stockage, ni fournisseur.
/** @returns {import('./ports.cjs').MemoryView} */
function createMemoryView(memory, modalities = new Map()) {
  const elapsedMs = memory.now();
  const lanes = memory.perceptionState(elapsedMs);
  const rolling = Number.isFinite(memory.retentionMs);
  const passages = [
    ...memory.history.map(p => passageView(p, 'history', modalities.get(p.id))),
    ...memory.segments.map(p => passageView(p, 'retained', modalities.get(p.id))),
  ];
  const capturedThroughMs = passages.at(-1)?.endMs || 0;
  const analyzedThroughMs = passages.filter(p => p.status === 'ready').at(-1)?.endMs || 0;
  const contextThroughMs = passages.filter(p => p.usableObservation).at(-1)?.endMs || 0;
  const { coverage, ...gaps } = calculateCoverage({ passages, losses: memory.losses, visionBlockedMs: lanes.visionBlockedMs });
  const { passages: passageCount, visionBlockedMs, ...losses } = coverage;
  return {
    session: {
      id: memory.id,
      accepting: memory.accepting,
      asking: memory.asking,
      readOnly: memory.readOnly,
      retention: rolling ? 'rolling' : 'until-deleted',
      retentionMs: rolling ? memory.retentionMs : null,
      unplacedMedia: memory.unplacedMedia,
      lastError: memory.storageError || memory.saveError || memory.lastError,
    },
    clock: { elapsedMs, capturedThroughMs, analyzedThroughMs, contextThroughMs,
      analysisLagMs: Math.max(0, capturedThroughMs - analyzedThroughMs) },
    passages,
    coverage: {
      passages: passageCount,
      retainedPassages: memory.segments.length,
      historyPassages: memory.history.length,
      replayablePassages: passages.filter(p => p.availability.replayable).length,
      startMs: passages[0]?.startMs ?? null,
      throughMs: capturedThroughMs,
      pending: lanes.pending,
      audioPending: lanes.audioPending,
      visionPending: lanes.visionPending,
      analyzing: lanes.analyzing,
      ...gaps,
      captureGaps: captureGapsOf(passages),
      visionBlockedMs,
    },
    losses,
  };
}

/** @returns {import('./ports.cjs').MemoryPassage|null} */
function readMemoryPassage(memory, id, modalities = new Map()) {
  const retained = memory.segments.find(p => p.id === id);
  if (retained) return passageView(retained, 'retained', modalities.get(id));
  const historical = memory.history.find(p => p.id === id);
  return historical ? passageView(historical, 'history', modalities.get(id)) : null;
}

function* newestFirst(memory) {
  for (let index = memory.segments.length - 1; index >= 0; index--) yield [memory.segments[index], 'retained'];
  for (let index = memory.history.length - 1; index >= 0; index--) yield [memory.history[index], 'history'];
}

// Each bound is set by the newest passage that meets it, as the complete view takes the last one in observation order.
function settleClock(bounds, passage) {
  bounds.capturedThroughMs ??= passage.endMs || 0;
  if (bounds.analyzedThroughMs === null && passage.status === 'ready') bounds.analyzedThroughMs = passage.endMs || 0;
  if (bounds.contextThroughMs === null && hasUsableObservation(passage)) bounds.contextThroughMs = passage.endMs || 0;
}

// A question rereads its own passages at every consultation boundary: it needs the session identity and the
// clock of the complete view, never the projection of every passage. One backward pass from the newest passage:
// the clock is settled by the latest analysed and usable passages, the others are only compared by identifier.
/** @returns {import('./ports.cjs').MemoryPassageRead} */
function readMemoryPassages(memory, ids, modalities = new Map()) {
  if (!Array.isArray(ids) || ids.some(id => typeof id !== 'string')) {
    throw domainError(TVLENS_MEMORY_IDS_INVALID, 'Identifiants de passages invalides.');
  }
  const wanted = new Set(ids), found = new Map();
  const bounds = { capturedThroughMs: null, analyzedThroughMs: null, contextThroughMs: null };
  for (const [passage, origin] of newestFirst(memory)) {
    settleClock(bounds, passage);
    // A retained passage wins over a history entry of the same identifier, as for a single passage read.
    if (wanted.has(passage.id) && !found.has(passage.id)) found.set(passage.id, [passage, origin]);
  }
  const clock = { elapsedMs: memory.now(), capturedThroughMs: bounds.capturedThroughMs ?? 0,
    analyzedThroughMs: bounds.analyzedThroughMs ?? 0, contextThroughMs: bounds.contextThroughMs ?? 0 };
  clock.analysisLagMs = Math.max(0, clock.capturedThroughMs - clock.analyzedThroughMs);
  return {
    session: { id: memory.id },
    clock,
    passages: ids.filter(id => found.has(id)).map(id => {
      const [passage, origin] = found.get(id);
      return passageView(passage, origin, modalities.get(id));
    }),
  };
}

/** @returns {import('./ports.cjs').MemoryPassage[]} */
function recentMemoryPassages(memory, limit, modalities = new Map()) {
  if (!Number.isSafeInteger(limit) || limit < 0) {
    throw domainError(TVLENS_MEMORY_LIMIT_INVALID, 'Nombre de passages invalide.');
  }
  if (limit === 0) return [];
  return memory.segments.slice(-limit).map(p => passageView(p, 'retained', modalities.get(p.id)));
}

module.exports = {
  createMemoryView, readMemoryPassage, readMemoryPassages, recentMemoryPassages,
  TVLENS_MEMORY_LIMIT_INVALID, TVLENS_MEMORY_IDS_INVALID,
};
