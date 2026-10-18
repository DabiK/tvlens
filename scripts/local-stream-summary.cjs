function unionOf(intervals, window) {
  const sorted = intervals.map(({ startMs, endMs }) => ({
    startMs: Math.max(window.startMs, startMs), endMs: Math.min(window.endMs, endMs),
  })).filter(row => row.endMs > row.startMs).sort((a, b) => a.startMs - b.startMs);
  const merged = [];
  for (const row of sorted) {
    const last = merged.at(-1);
    if (last && row.startMs <= last.endMs) last.endMs = Math.max(last.endMs, row.endMs);
    else merged.push({ ...row });
  }
  return merged;
}
function coverageOf(intervals, window) {
  const received = unionOf(intervals, window), missing = [];
  let through = window.startMs;
  for (const row of received) {
    if (row.startMs > through) missing.push({ startMs: through, endMs: row.startMs });
    through = row.endMs;
  }
  if (through < window.endMs) missing.push({ startMs: through, endMs: window.endMs });
  const plannedMs = window.endMs - window.startMs;
  const coveredMs = received.reduce((sum, row) => sum + row.endMs - row.startMs, 0);
  return { intervals: received, missing, plannedMs, coveredMs, percent: plannedMs > 0 ? coveredMs / plannedMs * 100 : null };
}
function laneLosses(report, lane) {
  const losses = report.journal.losses.filter(loss => loss.lane === lane), byCause = {};
  for (const loss of losses) byCause[loss.cause.code] = (byCause[loss.cause.code] || 0) + 1;
  const intervals = unionOf(losses.map(loss => loss.interval), report.plannedInterval);
  return { count: losses.length, byCause, intervals, lostMs: intervals.reduce((sum, row) => sum + row.endMs - row.startMs, 0) };
}
function summarize(report) {
  const revisions = report.journal.revisions.map(row => row.passage);
  const audio = revisions.filter(p => p.audioStatus === 'ready' && !p.audioFailed);
  const vision = revisions.filter(p => p.visionStatus === 'ready');
  const lossCounts = { audio: 0, vision: 0 };
  for (const loss of report.journal.losses) lossCounts[loss.lane]++;
  return {
    status: report.status,
    roles: Object.entries(report.roles).map(([role, details]) => ({ role, ...structuredClone(details) })),
    coverage: { capture: coverageOf(revisions, report.plannedInterval), audio: coverageOf(audio, report.plannedInterval),
      vision: coverageOf(vision, report.plannedInterval) },
    passages: new Set(revisions.map(p => p.id)).size,
    observedRevisions: revisions.length,
    publications: { audio: new Set(audio.map(p => p.id)).size, vision: new Set(vision.map(p => p.id)).size },
    lossCounts, losses: { audio: laneLosses(report, 'audio'), vision: laneLosses(report, 'vision') },
    lossCounters: report.consultation?.losses ?? null,
    questions: { successful: report.questions.filter(q => q.acquired && q.status === 'done').length,
      cancelled: report.questions.filter(q => q.status === 'cancelled').length,
      outcomes: report.questions.map(q => ({ id: q.id, status: q.status, acquired: Boolean(q.acquired), latency: q.latency ?? null })) },
    samples: report.journal.samples.length,
    remaining: structuredClone(report.remaining),
    unavailable: ['attente effective de l’agent', 'premier token', 'réseau pur', 'qualité des textes', 'télémétrie GPU'],
  };
}
module.exports = { summarize };
