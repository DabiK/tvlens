const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  WEB_DOCUMENT_LIMIT, WEB_TEXT_MAX_CHARS, WEB_QUERY_MAX_CHARS,
  WEB_PAGE_READ_MAX_CHARS, WEB_EXCERPT_HEAD_CHARS, WEB_EXCERPT_WINDOW_CHARS,
  normalizeText, callsForWeb, retrievalQuery, queryKey, clipText, searchTerms, pageExcerpt,
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

test('search terms are the distinct normalised words of the texts, without stop words or short words', () => {
  assert.deepEqual(searchTerms('Quelle est la HAUTEUR du volcan Etna ?', 'hauteur Étna mètres'), ['hauteur', 'volcan', 'etna', 'metres']);
  assert.deepEqual(searchTerms('Les des pour', null, undefined), []);
});

test('an excerpt is a head and a window that together fill the page length, read from a longer stretch of page', () => {
  assert.equal(WEB_PAGE_READ_MAX_CHARS, 20000);
  assert.equal(WEB_EXCERPT_HEAD_CHARS, 1000);
  assert.equal(WEB_EXCERPT_WINDOW_CHARS, 1500);
  assert.equal(WEB_EXCERPT_HEAD_CHARS + WEB_EXCERPT_WINDOW_CHARS, WEB_TEXT_MAX_CHARS);
});

// Filler of exactly `length` characters made of words that are never search terms; passages are joined with spaces.
const filler = length => 'neutre '.repeat(Math.ceil(length / 7)).slice(0, length);
// Filler that ends a sentence, as prose does before the passage that follows it.
const prose = length => `${filler(length - 1)}.`;
const pageOf = (...parts) => parts.join(' ');
const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;

test('a page that fits the page length comes back whole', () => {
  assert.equal(pageExcerpt('Le volcan Etna.', ['etna']), 'Le volcan Etna.');
  const exact = filler(WEB_TEXT_MAX_CHARS);
  assert.equal(pageExcerpt(exact, ['etna']), exact);
});

test('without a term in common the excerpt is the head followed by the first window, cut on a space', () => {
  const text = filler(12000);
  assert.equal(pageExcerpt(text, ['etna', 'hauteur']), 'neutre '.repeat(357).trimEnd());
  assert.equal(pageExcerpt(text, []), 'neutre '.repeat(357).trimEnd());
});

test('the window holding the most distinct terms is kept after the head, past an elision', () => {
  const single = 'Etna Etna Etna Etna Etna, encore Etna.';
  const fact = 'Hauteur du volcan Etna : 3 357 mètres.';
  const text = pageOf(prose(4000), single, prose(4000), fact, prose(6000));
  const excerpt = pageExcerpt(text, searchTerms('Quelle est la hauteur du volcan Etna ?'));
  assert.equal(excerpt.slice(0, WEB_EXCERPT_HEAD_CHARS), text.slice(0, WEB_EXCERPT_HEAD_CHARS));
  assert.ok(excerpt.includes(fact), 'the fact is in the excerpt');
  assert.equal(excerpt.includes(single), false);
  assert.equal(text.startsWith(excerpt), false, 'the window is not contiguous with the head');
  assert.ok(excerpt.length <= WEB_TEXT_MAX_CHARS);
});

test('the window opens on its first term', () => {
  const text = pageOf(prose(5000), 'La hauteur du volcan Etna atteint 3 357 mètres.', prose(5000));
  assert.match(pageExcerpt(text, ['hauteur', 'etna']).slice(WEB_EXCERPT_HEAD_CHARS), /^\W*hauteur du volcan/u);
});

test('two terms more than 1 200 characters apart are kept in one window even after a nearby sentence end', () => {
  const text = pageOf(prose(4750), filler(240), 'hauteur', filler(1290), 'etna', filler(6000));
  const excerpt = pageExcerpt(text, ['hauteur', 'etna']);
  assert.ok(excerpt.includes('hauteur'), 'the first term is in the excerpt');
  assert.ok(excerpt.includes('etna'), 'the second term is in the excerpt');
  assert.ok(excerpt.length <= WEB_TEXT_MAX_CHARS);
});

test('a matching window right after the head follows it without elision', () => {
  const text = pageOf(prose(WEB_EXCERPT_HEAD_CHARS + 20), 'Le volcan Etna gronde.', filler(10000));
  const excerpt = pageExcerpt(text, ['volcan', 'etna']);
  assert.ok(text.startsWith(excerpt));
  assert.ok(excerpt.includes('Le volcan Etna gronde.'));
});

test('between windows as rich as each other the one nearest the beginning wins', () => {
  const first = 'Volcan Etna, premier passage : il gronde.';
  const second = 'Volcan Etna, second passage : il dort.';
  const text = pageOf(prose(3000), first, prose(5000), second, prose(5000));
  const excerpt = pageExcerpt(text, ['volcan', 'etna']);
  assert.ok(excerpt.includes(first));
  assert.equal(excerpt.includes(second), false);
});

test('when no window holds every term, the first of the richest windows wins', () => {
  const first = 'Volcan Etna, premier passage : il gronde.';
  const second = 'Volcan Etna, second passage : il dort.';
  const third = 'Hauteur, troisième passage.';
  const text = pageOf(prose(3000), first, prose(5000), second, prose(6000), third, prose(5000));
  const excerpt = pageExcerpt(text, ['volcan', 'etna', 'hauteur']);
  assert.ok(excerpt.includes(first));
  assert.equal(excerpt.includes(second), false);
  assert.equal(excerpt.includes(third), false);
});

test('terms are matched whatever their case and accents', () => {
  const fact = 'HAUTEUR de l’ÉTNA : plus de trois mille mètres.';
  const text = pageOf(prose(5000), fact, prose(5000));
  assert.ok(pageExcerpt(text, searchTerms('hauteur etna')).includes(fact));
  assert.ok(pageExcerpt(text, ['Hauteur', 'Etna']).includes(fact));
});

test('nothing past the read length of a page is looked at', () => {
  const late = 'La hauteur du volcan Etna atteint 3 357 mètres.';
  const text = pageOf(filler(WEB_PAGE_READ_MAX_CHARS + 100), late, filler(1000));
  assert.equal(pageExcerpt(text, ['hauteur', 'volcan', 'etna']), 'neutre '.repeat(357).trimEnd());
});

test('an excerpt never passes the page length nor splits a surrogate pair, even without a space to cut on', () => {
  for (const prefix of ['', '.', 'a', 'a.']) {
    const text = prefix + '😀'.repeat(3000) + 'etna' + '😀'.repeat(3000);
    const excerpt = pageExcerpt(text, ['etna']);
    assert.ok(excerpt.length <= WEB_TEXT_MAX_CHARS, `length ${excerpt.length}`);
    assert.doesNotMatch(excerpt, LONE_SURROGATE);
    assert.ok(excerpt.includes('etna'));
  }
});
