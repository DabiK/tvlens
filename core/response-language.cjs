const { VISUAL_TEXT_FIELDS, visualObservationIssue } = require('./visual-observation.cjs');
const MIN_FOREIGN_MARKERS = 2;
// Indices lexicaux conservateurs : les noms propres et les textes trop courts restent indéterminés.
// Cette règle ne prétend pas identifier toutes les langues ni les phrases sans ces mots courants.
const MARKERS = {
  fr: 'le la les un une des du de est sont dans sur avec et mais qui que ce cette ces il elle ils elles au aux pas parle devant ' +
    'en son sa ses mon ma mes ton ta tes notre votre nos vos leur leurs',
  en: 'the is are was were this that these those with and but who which his her their it he she they not at about from to of',
  other: 'el los las una unos unas es son en con del por para que este esta der die das ein eine ist sind und mit auf im',
};
const FRENCH_WORDS = new Set(MARKERS.fr.split(' '));
// Un mot français ne constitue jamais une preuve de langue étrangère, même s'il existe ailleurs.
const WORDS = Object.fromEntries(Object.entries(MARKERS).map(([language, words]) =>
  [language, new Set(words.split(' ').filter(word => language === 'fr' || !FRENCH_WORDS.has(word)))]));

function withoutQuotes(text) {
  return text.replace(/"[^"]*"|«[^»]*»|“[^”]*”|‘(?:[^’]|’(?=\p{L}))*’|(?:^|\s)'(?:[^']|'(?=\p{L}))*'(?=\s|[.,;:!?]|$)/gu, ' ');
}

function judgeText(text) {
  const prose = withoutQuotes(text).toLowerCase();
  const words = prose.match(/\p{L}+/gu) || [];
  const score = Object.fromEntries(Object.entries(WORDS).map(([language, markers]) =>
    [language, words.filter(word => markers.has(word)).length]));
  // Un titre anglais bref reste détectable ; un nom d'émission dans une phrase française reste admissible.
  if (!score.fr && words.includes('the')) score.en++;
  if (score.en >= MIN_FOREIGN_MARKERS && score.en > score.fr && score.en >= score.other) return 'en';
  if (score.other >= MIN_FOREIGN_MARKERS && score.other > score.fr) return 'other';
  if (score.fr > 0) return 'fr';
  if (/[^\p{Script=Latin}\P{L}]{2}/u.test(prose)) return 'other';
  return 'und';
}

function judgeObservationLanguage(output) {
  // Une observation mal formée garde son chemin de refus, sans redemande pour la langue.
  if (visualObservationIssue(output)) return 'und';
  const languages = VISUAL_TEXT_FIELDS.map(field => judgeText(output[field]));
  return languages.find(language => language === 'en' || language === 'other') ||
    (languages.includes('fr') ? 'fr' : 'und');
}

module.exports = { judgeObservationLanguage };
