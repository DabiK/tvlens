const { test } = require('node:test');
const assert = require('node:assert/strict');
const { DECISION_FORMAT, DECISION_SYSTEM_PROMPT, DECISION_RECENT_PASSAGES, DECISION_PASSAGE_MAX_CHARS,
  decisionMessages, readDecision } = require('../adapters/web-decision-prompt.cjs');

// The decision prompt measured on 102 questions; a change of wording is a change of behaviour.
const MEASURED_SYSTEM_PROMPT = 'Tu prépares la réponse d\'un compagnon de visionnage. Le spectateur pose une question pendant la vidéo. '
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

const passage = (index, text = `Passage ${index}`) => ({ id: `p${index}`, startMs: index * 8000 + 999, endMs: (index + 1) * 8000 + 500, text });

test('the decision asks for a boolean and a query, both required', () => {
  assert.deepEqual(DECISION_FORMAT, { type: 'object', properties: { web: { type: 'boolean' }, query: { type: 'string' } },
    required: ['web', 'query'] });
});

test('the decision messages are the measured system prompt and the question with the recent passages', () => {
  const messages = decisionMessages({ question: 'Quand ce film a-t-il été publié ?', passages: [passage(1, 'Tears of Steel commence.')] });
  assert.equal(DECISION_SYSTEM_PROMPT, MEASURED_SYSTEM_PROMPT);
  assert.deepEqual(messages, [
    { role: 'system', content: MEASURED_SYSTEM_PROMPT },
    { role: 'user', content: 'Question du spectateur : « Quand ce film a-t-il été publié ? »\n'
      + 'Passages récents de la vidéo (du plus ancien au plus récent) :\n- [8–16 s] Tears of Steel commence.' },
  ]);
});

test('a known source title comes between the question and the passages', () => {
  const [, user] = decisionMessages({ question: 'Qui joue ?', passages: [passage(0)], sourceTitle: 'Tears of Steel' });
  assert.equal(user.content, 'Question du spectateur : « Qui joue ? »\nTitre de la source : Tears of Steel\n'
    + 'Passages récents de la vidéo (du plus ancien au plus récent) :\n- [0–8 s] Passage 0');
});

test('only the most recent passages are kept, in order, each cut and on one line', () => {
  const long = 'a\nb' + 'x'.repeat(DECISION_PASSAGE_MAX_CHARS * 2);
  const passages = [passage(0), passage(1), passage(2), passage(3), { ...passage(4), text: long }, { ...passage(5), text: undefined }];
  const [, user] = decisionMessages({ question: 'Q', passages });
  const lines = user.content.split('\n').slice(2);
  assert.equal(lines.length, DECISION_RECENT_PASSAGES);
  assert.deepEqual(lines.map(line => line.slice(0, line.indexOf(']') + 1)), ['[24–32 s]', '[32–40 s]', '[40–48 s]'].map(t => `- ${t}`));
  assert.equal(lines[1], `- [32–40 s] ${long.slice(0, DECISION_PASSAGE_MAX_CHARS).replace('\n', ' ')}`);
  assert.equal(lines[2], '- [40–48 s] ');
});

test('without passages the header still closes the user message', () => {
  const [, user] = decisionMessages({ question: 'Q' });
  assert.equal(user.content, 'Question du spectateur : « Q »\nPassages récents de la vidéo (du plus ancien au plus récent) :\n');
});

test('a decision is read only when web is a boolean and query a string', () => {
  assert.deepEqual(readDecision('{"web":true,"query":"Tears of Steel date de sortie"}'), { web: true, query: 'Tears of Steel date de sortie' });
  assert.deepEqual(readDecision('{"web":false,"query":"","extra":1}'), { web: false, query: '' });
  for (const content of ['not json', '', undefined, 42, 'null', '[]', '{"web":"true","query":"x"}', '{"web":true}',
    '{"query":"x"}', '{"web":true,"query":3}'])
    assert.equal(readDecision(content), null, String(content));
});
