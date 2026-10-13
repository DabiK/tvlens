// Shared representation for retrieval and evidence summaries.
function passageText(segment) {
  // An archived passage without description falls back to its transcript as summary:
  // the same words must not appear twice, nor change the text an index already holds.
  return [
    ...new Set(
      [
        segment.observation?.summary || segment.summary,
        segment.observation?.visual,
        segment.observation?.transcript,
      ].filter(Boolean),
    ),
  ]
    .join("\n")
    .slice(0, 1200);
}
function hasUsableObservation(segment) {
  // A successful but empty lane is not evidence: archived fallback summaries
  // such as “Passage non analysé” must never become grounded context.
  const laneEvidence = (segment.audioStatus === 'ready' || segment.visionStatus === 'ready') &&
    Boolean(passageText({ observation: segment.observation }).trim());
  return Boolean(passageText(segment).trim()) && (!segment.status || ['ready', 'partial'].includes(segment.status) || laneEvidence);
}
module.exports = { passageText, hasUsableObservation };
