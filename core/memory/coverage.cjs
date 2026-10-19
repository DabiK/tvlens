const TOTAL_GAP_STATUSES = new Set(['error', 'skipped', 'expired']);
const AUDIO_GAP_STATUSES = new Set(['skipped', 'error']);
const VISION_GAP_STATUSES = new Set(['skipped', 'expired', 'error']);
const interval = ({ id, startMs, endMs }) => ({ id, startMs, endMs });

// Les pertes restent acquises chez leur propriétaire, même quand les passages ne sont plus présents.
function calculateCoverage({ passages, losses = {}, visionBlockedMs = 0 }) {
  return {
    gaps: passages.filter(p => TOTAL_GAP_STATUSES.has(p.status))
      .map(p => ({ ...interval(p), status: p.status })),
    audioGaps: passages.filter(p => p.audioFailed || (p.status === 'partial' && AUDIO_GAP_STATUSES.has(p.audioStatus)))
      .map(p => ({ ...interval(p), audioStatus: p.audioFailed ? 'failed' : p.audioStatus,
        ...(p.audioFailureCode ? { code: p.audioFailureCode } : {}) })),
    visionGaps: passages.filter(p => p.visionStatus === 'absent' || (p.status === 'partial' && VISION_GAP_STATUSES.has(p.visionStatus)))
      .map(p => ({ ...interval(p), visionStatus: p.visionStatus,
        reason: p.visionStatus === 'absent' ? 'images-absent' : p.visionSkipReason })),
    coverage: { passages: passages.length, ...losses, visionBlockedMs },
  };
}

// La voie décide quand ouvrir et consolider une retenue ; une projection ne la consolide jamais.
function heldDuration({ acquiredMs, heldSince, now }) {
  return acquiredMs + (heldSince === null ? 0 : Math.max(0, now - heldSince));
}

module.exports = { calculateCoverage, heldDuration };
