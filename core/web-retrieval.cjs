// Pure rules shared by the web retrieval adapters and the agent that consumes them.
const WEB_DOCUMENT_LIMIT = 3;
const WEB_TEXT_MAX_CHARS = 2500;
const WEB_QUERY_MAX_CHARS = 300;
// A page is read this far; what reaches the model is its head plus the window that best matches the search, which
// together make WEB_TEXT_MAX_CHARS.
const WEB_PAGE_READ_MAX_CHARS = 20000;
const WEB_EXCERPT_HEAD_CHARS = 1000;
const WEB_EXCERPT_WINDOW_CHARS = 1500;
// Taken out of the window's length, so that an excerpt never passes WEB_TEXT_MAX_CHARS.
const EXCERPT_ELISION = ' […] ';
// A word of the original text, accents written as combining marks included.
const TEXT_WORD = /[\p{L}\p{M}\p{N}]+/gu;

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
// Words shorter than this, and stop words, say nothing about what a page or a passage is about.
const MIN_WORD_LENGTH = 3;
const STOP_WORDS = new Set([
  'les', 'des', 'une', 'que', 'qui', 'est', 'sont', 'dans', 'sur', 'pour', 'par', 'avec', 'sans', 'pas', 'ses', 'son',
  'ces', 'cette', 'quel', 'quelle', 'quels', 'quelles', 'quoi', 'comment', 'pourquoi', 'aux', 'elle', 'elles', 'ils',
  'nous', 'vous', 'mais', 'donc', 'aussi', 'plus', 'tout', 'tous', 'ont', 'etre', 'avoir', 'peut', 'cela', 'leur', 'leurs',
]);
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

function wordsOf(value) {
  return normalizeText(value).match(/[a-z0-9]+/g) ?? [];
}

// The distinct words of the texts that can tell a page or a passage apart, in order of first appearance.
function searchTerms(...texts) {
  const words = texts.flatMap(wordsOf);
  return [...new Set(words.filter(word => word.length >= MIN_WORD_LENGTH && !STOP_WORDS.has(word)))];
}

// Positions, in the original text, of the words that are search terms. Normalising changes lengths, so each word is
// normalised on its own and the positions stay those of the text.
function termOccurrences(text, terms) {
  const occurrences = [];
  for (const match of text.matchAll(TEXT_WORD)) {
    const found = wordsOf(match[0]).filter(word => terms.has(word));
    if (found.length) occurrences.push({ start: match.index, end: match.index + match[0].length, terms: found });
  }
  return occurrences;
}

// A passage ends on a space when it has one, otherwise on a character boundary.
function passageEnd(text, start, maxChars) {
  const limit = start + maxChars;
  if (limit >= text.length) return text.length;
  if (/\s/.test(text[limit])) return limit;
  const lastSpace = text.slice(start, limit).search(/\s\S*$/);
  if (lastSpace > 0) return start + lastSpace;
  return start + clipText(text.slice(start), maxChars).length;
}

function distinctTermsIn(occurrences, span) {
  const found = new Set();
  for (const occurrence of occurrences) {
    if (occurrence.start >= span.end) break;
    if (occurrence.start >= span.start && occurrence.end <= span.end) occurrence.terms.forEach(term => found.add(term));
  }
  return found.size;
}

// A window opens on a term; when only spaces separate it from the head, it follows the head instead, without elision.
function windowAt(text, contentStart, headEnd, anchor) {
  const elided = anchor > contentStart;
  const start = elided ? anchor : headEnd;
  const end = passageEnd(text, start, WEB_EXCERPT_WINDOW_CHARS - (elided ? EXCERPT_ELISION.length : 0));
  return { start, end, elided };
}

// Any window can slide forward to its first term without losing one, so the window that follows the head and the
// windows opening on a term are enough; the first one found keeps a tie nearest the beginning, and the search stops
// once a window holds every term left.
function bestWindow(text, headEnd, occurrences) {
  const afterHead = text.slice(headEnd).search(/\S/);
  const contentStart = afterHead === -1 ? text.length : headEnd + afterHead;
  const later = occurrences.filter(occurrence => occurrence.start >= headEnd);
  const reachable = new Set(later.flatMap(occurrence => occurrence.terms)).size;
  let best = null;
  for (const anchor of [headEnd, ...later.map(occurrence => occurrence.start)]) {
    const span = windowAt(text, contentStart, headEnd, anchor);
    const score = distinctTermsIn(occurrences, span);
    if (!best || score > best.score) best = { ...span, score };
    if (best.score === reachable) break;
  }
  return best;
}

// The head of a page and the window of its first WEB_PAGE_READ_MAX_CHARS characters that holds the most distinct
// search terms (case and accents ignored), the one nearest the beginning on a tie, in at most WEB_TEXT_MAX_CHARS
// characters.
function pageExcerpt(text, terms) {
  if (text.length <= WEB_TEXT_MAX_CHARS) return text;
  const read = clipText(text, WEB_PAGE_READ_MAX_CHARS);
  const head = clipText(read, WEB_EXCERPT_HEAD_CHARS);
  const termSet = new Set((terms ?? []).flatMap(wordsOf));
  const span = bestWindow(read, head.length, termOccurrences(read, termSet));
  return head + (span.elided ? EXCERPT_ELISION : '') + read.slice(span.start, span.end);
}

// The key under which two spellings of the same query are compared.
const queryKey = question => normalizeText(retrievalQuery(question));

// A work's title, or the name of a captured window, fits well within this; longer, it is no title any more, and it would
// outweigh a decision message of a few hundred characters.
const SOURCE_TITLE_MAX_CHARS = 200;

// The title of what is watched comes from a window name or from a client: it is held to one line, a control character
// counting as a space and an invisible format character (bidi, zero width) as nothing. Empty, there is no title.
function cleanSourceTitle(value) {
  if (typeof value !== 'string') return null;
  const cleaned = value.replace(/\p{Cc}/gu, ' ').replace(/\p{Cf}/gu, '').replace(/\s+/g, ' ').trim();
  return clipText(cleaned, SOURCE_TITLE_MAX_CHARS).trim() || null;
}

module.exports = {
  WEB_DOCUMENT_LIMIT, WEB_TEXT_MAX_CHARS, WEB_QUERY_MAX_CHARS,
  WEB_PAGE_READ_MAX_CHARS, WEB_EXCERPT_HEAD_CHARS, WEB_EXCERPT_WINDOW_CHARS,
  SOURCE_TITLE_MAX_CHARS,
  normalizeText, callsForWeb, retrievalQuery, queryKey, clipText, wordsOf, searchTerms, pageExcerpt, cleanSourceTitle,
};
