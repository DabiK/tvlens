const { mediaEvidenceFields } = require('./shared/media-evidence.cjs');
// A compact account of the passages older than a question's recent window: their speech, and what the screen showed
// whenever the topic changed. It is built from the passages the question has already frozen, nothing is read again.
// The ceiling bounds what the local model reads, since a session's memory never expires.
const DIGEST_CEILING_CHARACTERS = 10000;
const VISUAL_EXCERPT_CHARACTERS = 300;
// The opening entries set the scene: they show their image even when the topic has not changed.
const OPENING_PICTURED_ENTRIES = 2;
// Thinning stops here: the two opening entries and the latest one.
const THINNING_FLOOR = 3;
const NO_SPEECH = '(pas de parole transcrite)';
const IMAGE_PREFIX = '\nImage : ';
// The value the local model read during the measurements that justified the digest.
const DIGEST_PRECISION = 'compact-journal';

function digestEntry(passage, pictured) {
  const transcript = passage.observation?.transcript?.trim();
  // The visual is taken raw, as in the measured prototype: any non-empty text earns its line.
  const visual = passage.observation?.visual;
  const text = (transcript || NO_SPEECH) + (pictured && visual ? IMAGE_PREFIX + visual.slice(0, VISUAL_EXCERPT_CHARACTERS) : '');
  return { id: passage.id, startMs: passage.startMs, endMs: passage.endMs, text, precision: DIGEST_PRECISION,
    available: Boolean(passage.available), ...mediaEvidenceFields(passage) };
}

// Removes entries from the middle until the digest fits, keeping its opening and its latest entry.
function thinned(entries) {
  const kept = [...entries];
  let length = kept.reduce((sum, entry) => sum + entry.text.length, 0);
  while (length > DIGEST_CEILING_CHARACTERS && kept.length > THINNING_FLOOR) {
    const [removed] = kept.splice(OPENING_PICTURED_ENTRIES + Math.floor((kept.length - THINNING_FLOOR) / 2), 1);
    length -= removed.text.length;
  }
  return kept;
}

// `passages`: usable question-tool passages older than the recent window, in chronological order.
function digestOlderPassages(passages) {
  let previousTopic;
  const entries = passages.map((passage, index) => {
    const topic = passage.observation?.topic ?? '';
    const pictured = index < OPENING_PICTURED_ENTRIES || topic !== previousTopic;
    previousTopic = topic;
    return digestEntry(passage, pictured);
  });
  return thinned(entries);
}

module.exports = { digestOlderPassages };
