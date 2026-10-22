// Pure rules shared by the web retrieval adapters and the agent that consumes them.
const WEB_DOCUMENT_LIMIT = 3;
const WEB_TEXT_MAX_CHARS = 2500;
const WEB_QUERY_MAX_CHARS = 300;

// Spellings are given in normalised form (see normalizeText); a space also matches a hyphen.
const EXPLICIT_REQUESTS = [
  'web', 'internet', 'en ligne', 'cherche', 'chercher', 'cherches', 'cherchez', 'source', 'sources', 'lien', 'liens',
  'article', 'articles', 'site', 'sites', 'wikipedia',
];
const VERIFICATION_REQUESTS = [
  'c\'est vrai', 'est ce vrai', 'est il vrai', 'est elle vraie', 'verifier', 'verifie', 'verifies', 'verifiez', 'verification',
  'confirmer', 'confirme', 'confirmes', 'confirmez', 'confirmation', 'exact', 'exacte', 'faux', 'fausse', 'fake',
];
const VIDEO_REFERENCES = [
  'dans la video', 'il dit', 'elle dit', 'dit il', 'dit elle', 'on voit', 'a l\'ecran', 'ce passage',
];
const OUTSIDE_FACT_CUES = [
  'actualite', 'actualites', 'aujourd\'hui', 'en ce moment', 'actuellement', 'actuel', 'actuelle', 'actuels', 'actuelles',
  'recemment', 'cette annee', 'qui est', 'en quelle annee', 'date', 'dates', 'age', 'population', 'prix', 'record',
  'officiel', 'officielle', 'officiels', 'officielles',
];
// 1500 to 2099: a bare four-digit number (an amount, a quantity) is not a year.
const PLAUSIBLE_YEAR = /\b(?:1[5-9]|20)\d{2}\b/;

// Lower case, no accents, straight apostrophes and single spaces: the form every comparison is made on.
function normalizeText(value) {
  return String(value ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[‘’ʼ]/g, '\'')
    .replace(/\s+/g, ' ')
    .trim();
}

function wholeWords(list) {
  const alternatives = list.map(entry => entry.replace(/ /g, '[\\s-]+'));
  return new RegExp(`\\b(?:${alternatives.join('|')})\\b`);
}
const EXPLICIT_PATTERN = wholeWords([...EXPLICIT_REQUESTS, ...VERIFICATION_REQUESTS]);
const VIDEO_PATTERN = wholeWords(VIDEO_REFERENCES);
const OUTSIDE_FACT_PATTERN = wholeWords(OUTSIDE_FACT_CUES);

const asksExplicitly = text => EXPLICIT_PATTERN.test(text);
const refersToVideo = text => VIDEO_PATTERN.test(text);
const asksOutsideFact = text => OUTSIDE_FACT_PATTERN.test(text) || PLAUSIBLE_YEAR.test(text);

// Order matters: an explicit request wins even about the video, then the video, then a cue for an outside fact.
function callsForWeb(question) {
  if (typeof question !== 'string') return false;
  const text = normalizeText(question);
  if (asksExplicitly(text)) return true;
  if (refersToVideo(text)) return false;
  return asksOutsideFact(text);
}

// Cuts at a length in UTF-16 units without leaving half of a surrogate pair at the end.
function clipText(text, maxChars) {
  if (text.length <= maxChars) return text;
  const lastKept = text.charCodeAt(maxChars - 1);
  const splitsPair = lastKept >= 0xd800 && lastKept <= 0xdbff;
  return text.slice(0, splitsPair ? maxChars - 1 : maxChars);
}

function retrievalQuery(question) {
  if (typeof question !== 'string') return '';
  const cleaned = question.replace(/\s+/g, ' ').trim();
  return clipText(cleaned, WEB_QUERY_MAX_CHARS).trim();
}

// The key under which two spellings of the same query are compared.
const queryKey = question => normalizeText(retrievalQuery(question));

module.exports = {
  WEB_DOCUMENT_LIMIT, WEB_TEXT_MAX_CHARS, WEB_QUERY_MAX_CHARS,
  normalizeText, callsForWeb, retrievalQuery, queryKey, clipText,
};
