const { hasUsableObservation } = require('../passage-text.cjs');
const { domainError } = require('../shared/domain-error.cjs');
const TVLENS_MEMORY_LIMIT_INVALID = 'TVLENS_MEMORY_LIMIT_INVALID';
const NULLABLE_FIELDS = [
  'revision', 'status', 'audioStatus', 'visionStatus', 'error', 'audioError', 'visionError',
  'visionSkipReason', 'stage', 'summary',
];
const CAPTURE_JITTER_MS = 250;
const interval = ({ id, startMs, endMs }) => ({ id, startMs, endMs });

function passageGaps(passages) {
  const captureGaps = [];
  let through = 0;
  for (const passage of passages) {
    if (passage.startMs - through > CAPTURE_JITTER_MS) captureGaps.push({ startMs: through, endMs: passage.startMs });
    through = Math.max(through, passage.endMs);
  }
  return {
    captureGaps,
    gaps: passages.filter(p => ['error', 'skipped', 'expired'].includes(p.status))
      .map(p => ({ ...interval(p), status: p.status })),
    audioGaps: passages.filter(p => p.audioFailed || (p.status === 'partial' && ['skipped', 'error'].includes(p.audioStatus)))
      .map(p => ({ ...interval(p), audioStatus: p.audioFailed ? 'failed' : p.audioStatus })),
    visionGaps: passages.filter(p => p.status === 'partial' && ['skipped', 'expired', 'error'].includes(p.visionStatus))
      .map(p => ({ ...interval(p), visionStatus: p.visionStatus, reason: p.visionSkipReason })),
  };
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
    audioFailed: Boolean(passage.audioFailed),
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
  const rolling = Number.isFinite(memory.retentionMs);
  const passages = [
    ...memory.history.map(p => passageView(p, 'history', modalities.get(p.id))),
    ...memory.segments.map(p => passageView(p, 'retained', modalities.get(p.id))),
  ];
  const capturedThroughMs = passages.at(-1)?.endMs || 0;
  const analyzedThroughMs = passages.filter(p => p.status === 'ready').at(-1)?.endMs || 0;
  const contextThroughMs = passages.filter(p => p.usableObservation).at(-1)?.endMs || 0;
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
      passages: passages.length,
      retainedPassages: memory.segments.length,
      historyPassages: memory.history.length,
      replayablePassages: passages.filter(p => p.availability.replayable).length,
      startMs: passages[0]?.startMs ?? null,
      throughMs: capturedThroughMs,
      pending: memory.queue.length + memory.visionQueue.length,
      audioPending: memory.queue.length,
      visionPending: memory.visionQueue.length,
      analyzing: memory.running,
      ...passageGaps(passages),
      visionBlockedMs: memory.visionBlockedMs +
        (memory.visionHeldSince === null ? 0 : Math.max(0, elapsedMs - memory.visionHeldSince)),
    },
    losses: { ...memory.losses },
  };
}

/** @returns {import('./ports.cjs').MemoryPassage|null} */
function readMemoryPassage(memory, id, modalities = new Map()) {
  const retained = memory.segments.find(p => p.id === id);
  if (retained) return passageView(retained, 'retained', modalities.get(id));
  const historical = memory.history.find(p => p.id === id);
  return historical ? passageView(historical, 'history', modalities.get(id)) : null;
}

/** @returns {import('./ports.cjs').MemoryPassage[]} */
function recentMemoryPassages(memory, limit, modalities = new Map()) {
  if (!Number.isSafeInteger(limit) || limit < 0) {
    throw domainError(TVLENS_MEMORY_LIMIT_INVALID, 'Nombre de passages invalide.');
  }
  if (limit === 0) return [];
  return memory.segments.slice(-limit).map(p => passageView(p, 'retained', modalities.get(p.id)));
}

module.exports = { createMemoryView, readMemoryPassage, recentMemoryPassages, TVLENS_MEMORY_LIMIT_INVALID };
