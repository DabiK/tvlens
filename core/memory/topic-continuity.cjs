const CAPTURE_GAP_MS = 1000;

// Chaque projection prépare son identité : cette décision ne normalise aucun libellé.
function continuesTopic({ previousTopic, topic, continuity, gapMs }) {
  return Boolean(previousTopic && topic && previousTopic === topic &&
    !['change', 'uncertain'].includes(continuity) && gapMs <= CAPTURE_GAP_MS);
}

module.exports = { continuesTopic, CAPTURE_GAP_MS };
