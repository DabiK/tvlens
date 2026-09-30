// Shared representation for retrieval and evidence summaries.
function passageText(segment) {
  return [
    segment.observation?.summary || segment.summary,
    segment.observation?.visual,
    segment.observation?.transcript,
  ]
    .filter(Boolean)
    .join("\n")
    .slice(0, 1200);
}
module.exports = { passageText };
