const { validSummary } = require('./topic-summary.cjs');
// Provider-independent, extractive context. It never manufactures new evidence or
// makes another model call. The original passages remain the source of truth.
const clipped = (value, limit) => String(value || '').slice(0, limit);
function observedTopic(passage) {
  return passage.status === 'ready' || passage.visionStatus === 'ready'
    ? clipped(passage.observation?.topic, 120) : '';
}
function perceptionContext(snapshot, current) {
  const previous = [...snapshot.history, ...snapshot.segments]
    .filter(p => p.id !== current.id && p.endMs <= current.startMs);
  const recent = previous.slice(-3).map(p => ({
    id: p.id, startMs: p.startMs, endMs: p.endMs, status: p.status,
    topic: observedTopic(p),
    summary: clipped(p.observation?.summary, 500),
    transcript: clipped(p.observation?.transcript, 800),
    uncertainty: clipped(p.observation?.uncertainty, 400),
  }));
  // An outline of the last eight topic runs, not a claim to remember the entire
  // session exhaustively. Preserve qualifications alongside each extract.
  const outline = [];
  for (const p of previous) {
    const topic = observedTopic(p);
    if (!topic) continue;
    let item = outline.at(-1);
    if (!item || item.topic !== topic || ['change', 'uncertain'].includes(p.observation?.topicContinuity) || p.startMs - item.endMs > 1000) {
      item = { topic, firstId: p.id, startMs: p.startMs };
      outline.push(item);
      if (outline.length > 8) outline.shift();
    }
    Object.assign(item, { lastId: p.id, endMs: p.endMs,
      summary: clipped(p.observation?.summary, 250),
      uncertainty: clipped(p.observation?.uncertainty, 250) });
  }
  const last = previous.at(-1);
  // A missing analysis or capture gap cannot prove subject continuity.
  const previousTopic = last && current.startMs - last.endMs <= 1000 ? observedTopic(last) : '';
  let activeFirst = null;
  if (previousTopic) {
    for (let i = previous.length - 1; i >= 0; i--) {
      const p = previous[i], next = previous[i + 1];
      if (observedTopic(p) !== previousTopic || (next && (next.startMs - p.endMs > 1000 ||
        ['change', 'uncertain'].includes(next.observation?.topicContinuity)))) break;
      activeFirst = p;
    }
  }
  const activeTopic = activeFirst ? { firstId: activeFirst.id, startMs: activeFirst.startMs,
    recent: recent.filter(p => p.startMs >= activeFirst.startMs) } : null;
  let previousTopicSummary = null;
  const pendingPassages = [];
  // Recover up to three rejected cumulative outputs from their intact current
  // observations. Never bridge a missing analysis, topic boundary or capture hole.
  if (previousTopic) for (let i = previous.length - 1; i >= 0 && pendingPassages.length <= 3; i--) {
    const p = previous[i], next = previous[i + 1], aggregate = p.topicSummary;
    if (observedTopic(p) !== previousTopic || (next && (next.startMs - p.endMs > 1000 ||
      ['change', 'uncertain'].includes(next.observation?.topicContinuity)))) break;
    if (aggregate && validSummary(aggregate.text) && aggregate.lastId === p.id && aggregate.endMs === p.endMs) {
      previousTopicSummary = { ...aggregate, pendingPassages };
      break;
    }
    pendingPassages.unshift({ id: p.id, startMs: p.startMs, endMs: p.endMs,
      summary: clipped(p.observation?.summary, 500), uncertainty: clipped(p.observation?.uncertainty, 400) });
  }
  return { kind: 'historical-unverified-context', previousTopic, previousTopicSummary, activeTopic,
    recent, sessionOutline: outline,
    limits: 'Extraits bornés et non exhaustifs ; les résumés, OCR et transcriptions peuvent être erronés. Aucune source externe vérifiée.' };
}
module.exports = { perceptionContext, observedTopic };
