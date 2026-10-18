// Cumulative narrative is historical context, never evidence for an eight-second passage.
const MAX_TOPIC_SUMMARY = 1600;
function validSummary(value) {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= MAX_TOPIC_SUMMARY;
}
function completeTopicSummary(segment, result, context) {
  const observation = result.observation || {};
  const continues = observation.topicContinuity === 'continue' && context.previousTopic &&
    observation.topic === context.previousTopic;
  if (continues) {
    const previous = context.previousTopicSummary;
    if (!previous || !validSummary(result.topicSummary)) return null;
    return { text: result.topicSummary.trim(), firstId: previous.firstId, startMs: previous.startMs,
      lastId: segment.id, endMs: segment.endMs };
  }
  // At a boundary, the current passage is the entire new topic. Do not import a
  // provider's attempted cumulative answer from an unrelated historical subject.
  if (!observation.topic || !validSummary(observation.summary)) return null;
  return { text: observation.summary.trim(), firstId: segment.id, lastId: segment.id,
    startMs: segment.startMs, endMs: segment.endMs };
}
function summaryForPassages(passages) {
  const first = passages[0], last = passages.at(-1), aggregate = last?.topicSummary;
  if (aggregate && validSummary(aggregate.text) && aggregate.firstId === first.id &&
      aggregate.lastId === last.id && aggregate.startMs === first.startMs && aggregate.endMs === last.endMs) {
    return { summary: aggregate.text, summaryKind: 'cumulative',
      summaryLimits: 'Résumé cumulatif automatique, condensé et non vérifié ; consulter les paroles pour les détails.' };
  }
  const extracts = [...new Set(passages.map(p => p.observation?.summary || p.observation?.transcript).filter(Boolean))];
  return { summary: extracts.slice(-2).join(' ').slice(0, 900), summaryKind: 'bounded-excerpts',
    summaryLimits: 'Extraits récents uniquement : aucun résumé cumulatif disponible pour cet intervalle.' };
}
module.exports = { MAX_TOPIC_SUMMARY, validSummary, completeTopicSummary, summaryForPassages };
