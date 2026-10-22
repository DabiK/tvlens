const { test } = require('node:test');
const assert = require('node:assert/strict');
const { MIN_PAGE_TEXT_CHARS, READABLE_ELEMENT_LIMIT, htmlPage } = require('../adapters/web/html-text.cjs');

// Facts, names and addresses are invented. The page is minified: no whitespace separates its blocks.
const PARAGRAPHS = [
  'Le funiculaire de Valbrume gravit 412 mètres en sept minutes depuis son ouverture en 1931.',
  'Ses deux voitures se croisent à mi-pente sur une voie unique dédoublée, avec un départ toutes les dix minutes.',
  'La station basse se trouve près du lac et la station haute au pied du belvédère, où les vélos montent sans supplément.',
];
const NAVIGATION = '<header><nav><ul><li><a href="/">NAV_LINK Accueil</a></li><li><a href="/tarifs">NAV_LINK Tarifs</a></li></ul></nav></header>';
const FOOTER = '<footer><p>FOOTER_NOTE Mentions légales du réseau de Valbrume.</p></footer>';
const content = (extra = '') => `<div class="content"><h1>Le funiculaire</h1>${PARAGRAPHS.map(text => `<p>${text}</p>`).join('')}${extra}</div>`;
const layoutPage = ({ before = '', extra = '' } = {}) =>
  `<!doctype html><html><head><title>Funiculaire de Valbrume</title></head><body>${NAVIGATION}${before}${content(extra)}${FOOTER}</body></html>`;
const NOISE = /NAV_LINK|FOOTER_NOTE/;

// The fallback reads the whole body: what it returns keeps the navigation that Readability leaves out.
function assertFallback(page) {
  assert.match(page.text, NOISE, 'the patterns read the body, navigation included');
  for (const text of PARAGRAPHS) assert.ok(page.text.includes(text), text);
  assert.ok(page.text.length >= MIN_PAGE_TEXT_CHARS, 'the fallback text is still usable');
  assert.equal(page.title, 'Funiculaire de Valbrume');
}

test('Readability gives the paragraphs of the page without navigation or footer, blocks apart and inline words joined', () => {
  const page = htmlPage(layoutPage({ extra: '<ul><li>Gare</li><li>Belvédère</li></ul><p>Valbru<b>me</b> en hiver</p>' }));
  assert.equal(page.title, 'Funiculaire de Valbrume');
  assert.doesNotMatch(page.text, NOISE);
  assert.ok(page.text.includes(PARAGRAPHS.join(' ')), page.text);
  assert.ok(page.text.includes(`${PARAGRAPHS[2]} Gare Belvédère Valbrume en hiver`), page.text);
  assert.doesNotMatch(page.text, /<|>|\s{2}/);
});

test('when Readability finds no article, the patterns read the original page', () => {
  assertFallback(htmlPage(layoutPage(), { extract: () => null }));
});

test('when Readability keeps no text, the patterns read the original page', () => {
  for (const empty of ['', ' \n\t ']) assertFallback(htmlPage(layoutPage(), { extract: () => empty }));
});

test('when the parse or Readability throws, the patterns read the original page and the error goes no further', () => {
  assertFallback(htmlPage(layoutPage(), { extract: () => { throw new Error('PARSE_FAILURE'); } }));
  // Without a body element the document gives Readability nothing to read.
  const bodyless = layoutPage().replace('<body>', '').replace('</body>', '');
  assertFallback(htmlPage(bodyless));
});

test('a Readability text shorter than the usable length gives way to the patterns, from that length on it is kept', () => {
  const hidden = 'Texte resté dans la page mais masqué au lecteur, que les motifs lisent quand même. '.repeat(3);
  const short = htmlPage(`<html><head><title>Col</title></head><body><article><p>Le col de Brumefer culmine à 1 874 mètres.</p>
    <div hidden><p>HIDDEN_TEXT ${hidden}</p></div></article></body></html>`);
  assert.match(short.text, /^Le col de Brumefer culmine à 1 874 mètres\. HIDDEN_TEXT/, 'Readability drops hidden text, the patterns do not');
  const exact = 'm'.repeat(MIN_PAGE_TEXT_CHARS);
  assert.equal(htmlPage(layoutPage(), { extract: () => ` ${exact} ` }).text, exact);
  assertFallback(htmlPage(layoutPage(), { extract: () => exact.slice(1) }));
});

test('a page with more elements than the limit is read by the patterns, a page at the limit by Readability', () => {
  const padded = count => layoutPage({ before: `<div hidden>${'<i></i>'.repeat(count)}</div>` });
  const elements = html => html.match(/<[a-z]/gi).length;
  const atLimit = padded(READABLE_ELEMENT_LIMIT - elements(padded(0)));
  assert.equal(elements(atLimit), READABLE_ELEMENT_LIMIT);
  assert.doesNotMatch(htmlPage(atLimit).text, NOISE);
  assertFallback(htmlPage(padded(READABLE_ELEMENT_LIMIT - elements(padded(0)) + 1)));
});

test('a page both paths leave short stays short, for the caller to exclude', () => {
  const page = htmlPage('<html><head><title>Courte</title></head><body><article><p>Trois mots seulement.</p></article></body></html>');
  assert.deepEqual(page, { title: 'Courte', text: 'Trois mots seulement.' });
  assert.ok(page.text.length < MIN_PAGE_TEXT_CHARS);
});
