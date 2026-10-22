// The short call in which the local question model decides whether a question needs the web and writes its query.
// The wording was measured on 102 questions: a change of text is a change of behaviour to measure again.
const { clipText } = require('../core/web-retrieval.cjs');

const DECISION_RECENT_PASSAGES = 3;
const DECISION_PASSAGE_MAX_CHARS = 600;
const DECISION_FORMAT = {
  type: 'object',
  properties: { web: { type: 'boolean' }, query: { type: 'string' } },
  required: ['web', 'query'],
};
const DECISION_SYSTEM_PROMPT = 'Tu prépares la réponse d\'un compagnon de visionnage. Le spectateur pose une question pendant la vidéo. '
  + 'Décide si une bonne réponse a besoin d\'une recherche sur le web.\n'
  + '- web = true si la réponse demande un fait absent de la vidéo : culture générale, histoire, science, identité d\'une '
  + 'personne ou d\'une œuvre, date de publication, actualité ou état actuel (« aujourd\'hui », « dernière version »), '
  + 'chiffre officiel, vérification d\'une affirmation. Une question qui mêle un fait de la vidéo et un fait extérieur '
  + 'demande aussi web = true.\n'
  + '- web = false si la réponse se trouve dans ce qui est dit ou montré dans la vidéo, même dans un passage ancien, ou si '
  + 'la question porte sur l\'image (cadrage, couleur, objet ou texte à l\'écran).\n'
  + 'Si web = true, écris dans query une requête de recherche autonome de 3 à 12 mots-clés, dans la langue la plus utile, '
  + 'qui nomme explicitement le sujet (titre de l\'œuvre, nom de la personne, de la mission, du lieu) au lieu de « ce film », '
  + '« il » ou « cette nuit-là ». N\'y mets pas d\'année que tu supposes. Si web = false, query est vide.';

const seconds = ms => Math.floor(ms / 1000);

function passageLine({ startMs, endMs, text }) {
  const clipped = clipText(typeof text === 'string' ? text : '', DECISION_PASSAGE_MAX_CHARS).replace(/\n/g, ' ');
  return `- [${seconds(startMs)}–${seconds(endMs)} s] ${clipped}`;
}

// The passages are the recent context of the question; the title is optional and given only when the host knows it.
function decisionMessages({ question, passages = [], sourceTitle }) {
  const lines = passages.slice(-DECISION_RECENT_PASSAGES).map(passageLine);
  const user = `Question du spectateur : « ${question} »\n`
    + (sourceTitle ? `Titre de la source : ${sourceTitle}\n` : '')
    + 'Passages récents de la vidéo (du plus ancien au plus récent) :\n'
    + lines.join('\n');
  return [{ role: 'system', content: DECISION_SYSTEM_PROMPT }, { role: 'user', content: user }];
}

// Anything else than a boolean web and a string query is no decision.
function readDecision(content) {
  let value;
  try { value = JSON.parse(content); } catch {
    return null;
  }
  if (typeof value?.web !== 'boolean' || typeof value.query !== 'string') return null;
  return { web: value.web, query: value.query };
}

module.exports = { DECISION_FORMAT, DECISION_SYSTEM_PROMPT, DECISION_RECENT_PASSAGES, DECISION_PASSAGE_MAX_CHARS,
  decisionMessages, readDecision };
