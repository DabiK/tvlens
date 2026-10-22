const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { FrozenCorpusRetrieval, TVLENS_WEB_CORPUS_INVALID } = require('../adapters/web/frozen-corpus.cjs');
const { WEB_DOCUMENT_LIMIT, WEB_PAGE_READ_MAX_CHARS } = require('../core/web-retrieval.cjs');

// Invented pages: nothing here comes from a real site.
const ETNA = {
  url: 'https://www.example.org/volcans/etna',
  title: 'Le volcan Etna',
  publisher: 'Revue de géologie imaginaire',
  publishedAt: '2024-03-02',
  file: 'pages/etna.txt',
  queries: ['Quelle est la hauteur du volcan Etna ?'],
};
const ATLANTIQUE = { url: 'https://sciences.example.com/mers/atlantique', title: 'Courants de l’Atlantique nord', file: 'pages/atlantique.txt' };
const AURORE = { url: 'https://encyclopedie.example.org/espace/aurore', title: 'Mission Aurore : calendrier', file: 'pages/aurore.txt' };
const BLE = { url: 'https://actualites.example.com/economie/ble#prix', title: 'Marché du blé', file: 'pages/ble.txt' };
const TEXTS = {
  'pages/etna.txt': 'Le volcan Etna domine la plaine. Ses cratères sommitaux changent à chaque éruption.',
  'pages/atlantique.txt': 'Les courants marins transportent la chaleur vers le nord. Un volcan sous-marin les perturbe parfois.',
  'pages/aurore.txt': 'La mission lunaire Aurore suit un calendrier serré. Le bouclier protège la capsule de la chaleur.',
  'pages/ble.txt': 'Le cours du blé a gagné quelques points cette semaine sur le marché de Chicago.',
};

async function corpusDirectory(t, manifest, texts = TEXTS) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'tvlens-web-corpus-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const raw = typeof manifest === 'string' ? manifest : JSON.stringify(manifest);
  await fs.writeFile(path.join(directory, 'corpus.json'), raw);
  for (const [file, text] of Object.entries(texts)) {
    await fs.mkdir(path.dirname(path.join(directory, file)), { recursive: true });
    await fs.writeFile(path.join(directory, file), text);
  }
  return directory;
}
const corpusOf = documents => ({ version: 1, documents });
const fourPages = () => corpusOf([ETNA, ATLANTIQUE, AURORE, BLE]);
const urls = result => result.documents.map(page => page.url);

test('a declared query returns exactly the pages that declare it, whatever its case, accents or spacing', async t => {
  const directory = await corpusDirectory(t, fourPages());
  const corpus = new FrozenCorpusRetrieval({ directory });
  const result = await corpus.retrieve({ query: '  quelle est la HAUTEUR du volcan etna  ?' });
  assert.deepEqual(result.documents, [{
    url: ETNA.url,
    title: ETNA.title,
    text: TEXTS['pages/etna.txt'],
    publisher: ETNA.publisher,
    publishedAt: ETNA.publishedAt,
  }]);
  assert.equal(corpus.residence, 'local');
});

test('a query that is not declared is ranked by the words it shares with the pages', async t => {
  const directory = await corpusDirectory(t, fourPages());
  const result = await new FrozenCorpusRetrieval({ directory }).retrieve({ query: 'Le calendrier de la mission lunaire, la chaleur et le volcan ?' });
  assert.deepEqual(urls(result), [AURORE.url, ATLANTIQUE.url]);
});

test('ranking ignores case, accents and stop words, and a page needs enough words in common', async t => {
  const directory = await corpusDirectory(t, fourPages());
  const corpus = new FrozenCorpusRetrieval({ directory });
  assert.deepEqual(urls(await corpus.retrieve({ query: 'CRATÈRES de l’ETNA' })), [ETNA.url]);
  const weak = await corpus.retrieve({ query: 'Un volcan à Hawaï ?' });
  assert.deepEqual(weak.documents, []);
  assert.equal(weak.limits.length, 1);
});

test('stop words of three letters or more do not make a page relevant', async t => {
  const filler = { url: 'https://www.example.com/jardin/saisons', title: 'Le jardin', file: 'pages/jardin.txt' };
  const texts = { ...TEXTS, 'pages/jardin.txt': 'Les légumes des saisons arrivent pour tous les jardiniers.' };
  const directory = await corpusDirectory(t, corpusOf([filler, ETNA]), texts);
  const result = await new FrozenCorpusRetrieval({ directory }).retrieve({ query: 'Les des pour volcan' });
  assert.deepEqual(urls(result), [ETNA.url]);
});

test('a word repeated in the query counts once towards the shared words', async t => {
  const directory = await corpusDirectory(t, fourPages());
  const corpus = new FrozenCorpusRetrieval({ directory });
  const repeated = await corpus.retrieve({ query: 'volcan volcan hawaï' });
  assert.deepEqual(repeated.documents, []);
  assert.deepEqual(urls(await corpus.retrieve({ query: 'volcan Etna' })), [ETNA.url]);
});

test('a one-word query can still match, and an empty query matches nothing', async t => {
  const directory = await corpusDirectory(t, fourPages());
  const corpus = new FrozenCorpusRetrieval({ directory });
  assert.deepEqual(urls(await corpus.retrieve({ query: 'Chicago' })), ['https://actualites.example.com/economie/ble']);
  const empty = await corpus.retrieve({ query: '   ' });
  assert.deepEqual(empty.documents, []);
  assert.equal(empty.limits.length, 1);
});

test('at most three pages are returned, in corpus order when they tie, and the cut is announced', async t => {
  const names = ['a', 'b', 'c', 'd', 'e'];
  const documents = names.map(name => ({ url: `https://www.example.org/volcans/${name}`, title: 'Volcan', file: `pages/${name}.txt` }));
  const texts = Object.fromEntries(names.map(name => [`pages/${name}.txt`, 'Un volcan et son cratère.']));
  const directory = await corpusDirectory(t, corpusOf(documents), texts);
  const result = await new FrozenCorpusRetrieval({ directory }).retrieve({ query: 'volcan cratère' });
  assert.equal(WEB_DOCUMENT_LIMIT, 3);
  assert.deepEqual(urls(result), ['a', 'b', 'c'].map(name => `https://www.example.org/volcans/${name}`));
  assert.equal(result.limits.length, 1);
});

test('declared pages are capped like ranked pages', async t => {
  const names = ['a', 'b', 'c', 'd'];
  const documents = names.map(name => ({ url: `https://www.example.org/p/${name}`, title: name, file: `${name}.txt`, queries: ['même question'] }));
  const texts = Object.fromEntries(names.map(name => [`${name}.txt`, `page ${name}`]));
  const directory = await corpusDirectory(t, corpusOf(documents), texts);
  const result = await new FrozenCorpusRetrieval({ directory }).retrieve({ query: 'Même question' });
  assert.equal(result.documents.length, WEB_DOCUMENT_LIMIT);
  assert.deepEqual(result.documents.map(page => page.title), ['a', 'b', 'c']);
});

test('a long page is cut to the bound without splitting a surrogate pair, and the cut is announced', async t => {
  const long = 'a'.repeat(WEB_PAGE_READ_MAX_CHARS - 1) + '😀' + 'b'.repeat(500);
  const directory = await corpusDirectory(t, corpusOf([{ ...ETNA, file: 'long.txt' }]), { 'long.txt': long });
  const result = await new FrozenCorpusRetrieval({ directory }).retrieve({ query: ETNA.queries[0] });
  assert.equal(result.documents[0].text, 'a'.repeat(WEB_PAGE_READ_MAX_CHARS - 1));
  assert.equal(result.limits.length, 1);
  assert.match(result.limits[0], new RegExp(`\\b${WEB_PAGE_READ_MAX_CHARS}\\b`));
  const whole = await corpusDirectory(t, corpusOf([{ ...ETNA, file: 'short.txt' }]), { 'short.txt': 'Court.' });
  assert.deepEqual((await new FrozenCorpusRetrieval({ directory: whole }).retrieve({ query: ETNA.queries[0] })).limits, []);
});

test('unsafe addresses are dropped, duplicates keep their first occurrence and urls come back without fragment', async t => {
  const documents = [
    { ...ETNA, url: 'http://www.example.org/volcans/etna', file: 'a.txt', queries: ['volcan'] },
    { ...ETNA, url: 'https://93.184.216.34/etna', file: 'a.txt', queries: ['volcan'] },
    { ...ETNA, url: 'https://nas.local/etna', file: 'a.txt', queries: ['volcan'] },
    { ...ETNA, url: 'https://www.example.org/volcans/etna#cratere', title: 'Première occurrence', file: 'a.txt', queries: ['volcan'] },
    { ...ETNA, url: 'https://www.example.org/volcans/etna', title: 'Doublon', file: 'b.txt', queries: ['volcan'] },
    { ...ATLANTIQUE, file: 'b.txt', queries: ['volcan'] },
  ];
  const directory = await corpusDirectory(t, corpusOf(documents), { 'a.txt': 'Texte A.', 'b.txt': 'Texte B.' });
  const result = await new FrozenCorpusRetrieval({ directory }).retrieve({ query: 'Volcan' });
  assert.deepEqual(result.documents.map(page => [page.url, page.title]), [
    ['https://www.example.org/volcans/etna', 'Première occurrence'],
    [ATLANTIQUE.url, ATLANTIQUE.title],
  ]);
});

test('a page whose text is empty is not a page that was read', async t => {
  const directory = await corpusDirectory(t, corpusOf([{ ...ETNA, file: 'vide.txt' }, { ...ATLANTIQUE, file: 'a.txt', queries: ETNA.queries }]),
    { 'vide.txt': ' \n ', 'a.txt': 'Texte.' });
  const result = await new FrozenCorpusRetrieval({ directory }).retrieve({ query: ETNA.queries[0] });
  assert.deepEqual(urls(result), [ATLANTIQUE.url]);
});

test('two identical calls give the same answer', async t => {
  const directory = await corpusDirectory(t, fourPages());
  const corpus = new FrozenCorpusRetrieval({ directory });
  const query = 'mission lunaire chaleur volcan';
  assert.deepEqual(await corpus.retrieve({ query }), await corpus.retrieve({ query }));
  assert.deepEqual(await new FrozenCorpusRetrieval({ directory }).retrieve({ query }), await corpus.retrieve({ query }));
});

test('the corpus and every page are read once, even for concurrent first calls', async t => {
  const directory = await corpusDirectory(t, fourPages());
  const reads = [];
  const readFile = (file, encoding) => { reads.push(file); return fs.readFile(file, encoding); };
  const corpus = new FrozenCorpusRetrieval({ directory, readFile });
  await Promise.all([corpus.retrieve({ query: 'volcan' }), corpus.retrieve({ query: 'blé' }), corpus.retrieve({ query: 'mission lunaire' })]);
  await corpus.retrieve({ query: 'chaleur' });
  assert.equal(reads.length, 1 + 4);
  assert.equal(new Set(reads).size, reads.length);
});

test('a cancelled retrieval stops with the cancellation reason', async t => {
  const directory = await corpusDirectory(t, fourPages());
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(new FrozenCorpusRetrieval({ directory }).retrieve({ query: 'volcan', signal: controller.signal }), { name: 'AbortError' });
});

const REFUSED_CORPORA = {
  'unreadable json': 'not json {',
  'a list instead of an object': '[]',
  'an unknown version': { version: 2, documents: [] },
  'no version': { documents: [] },
  'no document list': { version: 1 },
  'a document without url': corpusOf([{ title: 'T', file: 'pages/etna.txt' }]),
  'a document without title': corpusOf([{ url: ETNA.url, file: 'pages/etna.txt' }]),
  'a document without file': corpusOf([{ url: ETNA.url, title: 'T' }]),
  'a document that is not an object': corpusOf(['pages/etna.txt']),
  'an empty file path': corpusOf([{ ...ETNA, file: '' }]),
  'an absolute file path': corpusOf([{ ...ETNA, file: '/etc/hosts' }]),
  'a file path going up': corpusOf([{ ...ETNA, file: '../etna.txt' }]),
  'a file path going up in the middle': corpusOf([{ ...ETNA, file: 'pages/../../etna.txt' }]),
  'a file path with a backslash': corpusOf([{ ...ETNA, file: 'pages\\etna.txt' }]),
  'the corpus folder itself as a file path': corpusOf([{ ...ETNA, file: '.' }]),
  'a missing page file': corpusOf([{ ...ETNA, file: 'pages/absent.txt' }]),
  'queries that are not a list': corpusOf([{ ...ETNA, queries: 'volcan' }]),
};

for (const [name, manifest] of Object.entries(REFUSED_CORPORA)) {
  test(`a corpus with ${name} is refused with the stable code and no path in the message`, async t => {
    const directory = await corpusDirectory(t, manifest);
    const corpus = new FrozenCorpusRetrieval({ directory });
    await assert.rejects(corpus.retrieve({ query: 'volcan' }), error => {
      assert.equal(error.code, TVLENS_WEB_CORPUS_INVALID);
      assert.ok(!error.message.includes(directory), error.message);
      assert.ok(!error.message.includes(path.basename(directory)), error.message);
      return true;
    });
    await assert.rejects(corpus.retrieve({ query: 'volcan' }), { code: TVLENS_WEB_CORPUS_INVALID });
  });
}

test('a folder without corpus.json is refused with the stable code', async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'tvlens-web-corpus-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  await assert.rejects(new FrozenCorpusRetrieval({ directory }).retrieve({ query: 'volcan' }), { code: TVLENS_WEB_CORPUS_INVALID });
});

test('an adapter without a folder is refused with the stable code', () => {
  assert.throws(() => new FrozenCorpusRetrieval({}), { code: TVLENS_WEB_CORPUS_INVALID });
});
