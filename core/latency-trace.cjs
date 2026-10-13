// Latency arithmetic over passage timelines stamped on the session clock.
// Pure and total: a missing or non-finite stamp yields null, never an exception.
const span = (to, from) => Number.isFinite(to) && Number.isFinite(from) ? to - from : null;
function passageLatency(p) {
  p = p || {};
  return { blockMs: span(p.endMs, p.startMs), arrivalMs: span(p.receivedMs, p.endMs),
    audioWaitMs: span(p.audioStartedMs, p.receivedMs), audioMs: span(p.audioMs, 0),
    visionWaitMs: span(p.visionStartedMs, p.visionQueuedMs), visionMs: span(p.visionMs, 0),
    transcriptAfterCloseMs: span(p.transcriptPublishedMs, p.endMs),
    readyAfterCloseMs: p.status === 'ready' ? span(p.visionPublishedMs, p.endMs) : null };
}
function latencySummary(passages, limit = 40) {
  const rows = (Array.isArray(passages) && limit > 0 ? passages.slice(-limit) : []).map(passageLatency);
  const summary = { passages: rows.length };
  for (const key of Object.keys(passageLatency())) {
    const values = rows.map(row => row[key]).filter(value => value !== null);
    summary[key] = values.length ? { n: values.length, mean: Math.round(values.reduce((sum, value) => sum + value, 0) / values.length), max: Math.round(Math.max(...values)) } : { n: 0 };
  }
  return summary;
}
module.exports = { passageLatency, latencySummary };
