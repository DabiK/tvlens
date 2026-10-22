const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  WEB_DOCUMENT_LIMIT, WEB_TEXT_MAX_CHARS, WEB_QUERY_MAX_CHARS,
  normalizeText, callsForWeb, retrievalQuery, queryKey, clipText,
} = require('../core/web-retrieval.cjs');

test('questions that need the web are recognised', () => {
  for (const question of [
    'Quelle est la population actuelle du Japon ?',
    'Le chiffre annoncé dans la vidéo est-il exact ?',
    'C’est vrai ce qu’il dit ?',
    'Trouve-moi l’article dont il parle',
    'Qui est le ministre cité ?',
    'Où en est la mission Artemis II aujourd’hui ?',
  ]) assert.equal(callsForWeb(question), true, question);
});

test('questions about the video itself stay on the video', () => {
  for (const question of [
    'Que dit-elle ?',
    'Qu’est-ce qu’on voit à l’écran ?',
    'Résume les deux dernières minutes',
    'De quelle couleur est sa veste ?',
    'Il dit quoi juste avant la pause ?',
  ]) assert.equal(callsForWeb(question), false, question);
});

test('an explicit web or verification request wins over a reference to the video', () => {
  assert.equal(callsForWeb('Dans la vidéo, il dit que c’est vrai, tu peux vérifier ?'), true);
  assert.equal(callsForWeb('Cherche sur internet ce qu’il dit dans la vidéo'), true);
  assert.equal(callsForWeb('Est-ce vrai ce qu’on voit à l’écran ?'), true);
});

test('a reference to the video wins over an outside-fact cue', () => {
  assert.equal(callsForWeb('Dans la vidéo, quel est le prix affiché ?'), false);
  assert.equal(callsForWeb('Il dit quoi sur la population ?'), false);
});

test('words are matched whole, not inside longer words', () => {
  assert.equal(callsForWeb('Comment se passe la visite ?'), false);
  assert.equal(callsForWeb('Le client attend dehors ?'), false);
  assert.equal(callsForWeb('Que montre cette image ?'), false);
  assert.equal(callsForWeb('Il parle vraiment fort'), false);
});

test('case, accents and the typographic apostrophe do not change the answer', () => {
  assert.equal(callsForWeb('QUI EST LE MINISTRE ?'), true);
  assert.equal(callsForWeb('Où en est la mission AUJOURD\'HUI ?'), true);
  assert.equal(callsForWeb('Où en est la mission aujourd’hui ?'), true);
  assert.equal(callsForWeb('En quelle année est-ce sorti ?'), true);
  assert.equal(callsForWeb('Quel âge a-t-il ?'), true);
  assert.equal(callsForWeb('C\'est vrai ?'), true);
});

test('a plausible year is an outside fact but another four-digit number is not', () => {
  assert.equal(callsForWeb('Que s’est-il passé en 1969 ?'), true);
  assert.equal(callsForWeb('Que s’est-il passé en 2031 ?'), true);
  assert.equal(callsForWeb('Il y a 3500 personnes dans la salle ?'), false);
  assert.equal(callsForWeb('Il y a 1000 personnes dans la salle ?'), false);
  assert.equal(callsForWeb('La salle porte le numéro 19690 ?'), false);
});

test('anything that is not a question does not call the web', () => {
  for (const value of ['', '   ', null, undefined, 42]) assert.equal(callsForWeb(value), false, String(value));
});

test('the retrieval query is the question with its spaces reduced', () => {
  assert.equal(retrievalQuery('  Quelle   est la\n population\tdu Japon ?  '), 'Quelle est la population du Japon ?');
  assert.equal(retrievalQuery(null), '');
});

test('the retrieval query is bounded by the named length', () => {
  const long = 'population '.repeat(200);
  assert.ok(retrievalQuery(long).length <= WEB_QUERY_MAX_CHARS);
  assert.equal(retrievalQuery('a'.repeat(WEB_QUERY_MAX_CHARS + 50)).length, WEB_QUERY_MAX_CHARS);
});

test('the retrieval query never ends on half of a surrogate pair', () => {
  const clipped = retrievalQuery('a'.repeat(WEB_QUERY_MAX_CHARS - 1) + '😀😀');
  assert.equal(clipped, 'a'.repeat(WEB_QUERY_MAX_CHARS - 1));
});

test('two spellings of a query share one key', () => {
  assert.equal(queryKey('  Quelle est la POPULATION du Japon ? '), queryKey('quelle est la population du japon ?'));
  assert.equal(queryKey('Où en est la mission ?'), queryKey('ou en est la mission ?'));
  assert.notEqual(queryKey('population du Japon'), queryKey('population de la France'));
});

test('normalising removes accents, case and typographic apostrophes', () => {
  assert.equal(normalizeText('Écran d’Été'), 'ecran d\'ete');
});

test('the page limits are the agreed ones', () => {
  assert.equal(WEB_DOCUMENT_LIMIT, 3);
  assert.equal(WEB_TEXT_MAX_CHARS, 2500);
});

test('clipping a text keeps it whole when it fits and never splits a surrogate pair', () => {
  assert.equal(clipText('court', 10), 'court');
  assert.equal(clipText('abc😀def', 4), 'abc');
  assert.equal(clipText('abc😀def', 5), 'abc😀');
});
