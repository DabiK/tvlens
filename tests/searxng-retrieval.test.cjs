const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { inspect } = require('node:util');
const {
  SearxngRetrieval, TVLENS_WEB_SEARCH_UNAVAILABLE, SEARCH_TIMEOUT_MS, SEARCH_BYTE_LIMIT, PAGE_BYTE_LIMIT, PAGE_TIMEOUT_MS,
} = require('../adapters/web/searxng.cjs');
const { htmlPage, plainText } = require('../adapters/web/html-text.cjs');
const { WEB_PAGE_READ_MAX_CHARS } = require('../core/web-retrieval.cjs');
const { manualClock } = require('./helpers/clock.cjs');
const { deferred, bounded, failure, until } = require('./helpers/wait.cjs');

const SECRET_BODY = 'PRIVATE_SEARCH_BODY';
const PAGE_HOST = /^[a-z0-9-]+\.example\.org$/;

// One loopback server plays both SearXNG (/search) and every page (/site/<host><path>).
async function fakeWeb(t, { search, pages = {} }) {
  const requests = [];
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://fake');
    const site = /^\/site\/([^/]+)(\/.*)?$/.exec(url.pathname);
    const request = { host: site ? site[1] : 'searxng', path: site ? (site[2] ?? '/') + url.search : req.url,
      query: url.searchParams, headers: req.headers,
      closed: new Promise(resolve => res.on('close', () => resolve(res.writableFinished))) };
    requests.push(request);
    const handler = site ? pages[`${request.host}${request.path}`] : search;
    if (!handler) { res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('missing'); return; }
    handler(request, res);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const responses = [], escaped = [];
  // Public page addresses are routed to the loopback server; anything else would leave the machine and is refused.
  const fetchImpl = async (input, init) => {
    const target = new URL(input);
    let routed = target.href;
    if (target.protocol === 'https:' && PAGE_HOST.test(target.hostname)) routed = `${origin}/site/${target.hostname}${target.pathname}${target.search}`;
    else if (target.origin !== origin) { escaped.push(target.href); throw new TypeError('fetch failed'); }
    const response = await fetch(routed, init);
    responses.push({ url: target.href, status: response.status, location: response.headers.get('location'), init });
    return response;
  };
  return { origin, host: origin.slice('http://'.length), requests, responses, escaped, fetchImpl };
}

function json(res, value, status = 200) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(typeof value === 'string' ? value : JSON.stringify(value));
}

function retrievalFor(web, clock = manualClock(), url = web.origin) {
  return new SearxngRetrieval({ url, fetchImpl: web.fetchImpl, ...clock.io });
}

function assertUnavailable(error, web) {
  assert.equal(error.code, TVLENS_WEB_SEARCH_UNAVAILABLE);
  assert.equal(error.cause, undefined);
  assert.equal('cause' in error, false);
  const shown = `${error.message}\n${inspect(error)}`;
  assert.equal(shown.includes(web.host), false, 'the search address must not leak');
  assert.equal(shown.includes(SECRET_BODY), false, 'the search body must not leak');
  assert.equal(shown.includes('SECRET_PATH'), false);
}

test('the search asks SearXNG for JSON with a named user agent and is declared hybrid', async t => {
  const web = await fakeWeb(t, { search: (request, res) => json(res, { results: [] }) });
  const retrieval = retrievalFor(web, manualClock(), `${web.origin}/base/`);
  assert.equal(retrieval.residence, 'hybrid');
  const result = await retrieval.retrieve({ query: 'prix du ticket de métro' });
  assert.deepEqual(result, { documents: [], limits: [] });
  assert.equal(web.requests.length, 1);
  const [request] = web.requests;
  assert.match(request.path, /^\/base\/search\?/);
  assert.equal(request.query.get('q'), 'prix du ticket de métro');
  assert.equal(request.query.get('format'), 'json');
  assert.match(request.headers['user-agent'], /TVLens/);
});

test('a failing SearXNG rejects with a fixed unavailable error that carries neither its address nor its body', async t => {
  const replies = [
    res => json(res, `${SECRET_BODY} internal error`, 500),
    res => json(res, `{"results": [${SECRET_BODY}`),
    res => json(res, { results: [{ url: 'https://a.example.org/', title: 42, content: SECRET_BODY }] }),
    res => json(res, { results: `${SECRET_BODY}` }),
    res => json(res, { results: [], padding: `${SECRET_BODY}${'x'.repeat(SEARCH_BYTE_LIMIT)}` }),
  ];
  let reply;
  const web = await fakeWeb(t, { search: (request, res) => reply(res) });
  for (const [index, next] of replies.entries()) {
    reply = next;
    const error = await failure(retrievalFor(web, manualClock(), `${web.origin}/SECRET_PATH`).retrieve({ query: 'q' }),
      `reply ${index}`);
    assertUnavailable(error, web);
  }
  assert.equal(web.requests.length, replies.length);
});

test('an unreachable SearXNG rejects as unavailable without its address', async () => {
  const closed = http.createServer();
  await new Promise(resolve => closed.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${closed.address().port}`;
  await new Promise(resolve => closed.close(resolve));
  const retrieval = new SearxngRetrieval({ url: origin, fetchImpl: fetch, ...manualClock().io });
  const error = await failure(retrieval.retrieve({ query: 'q' }));
  assertUnavailable(error, { host: origin.slice('http://'.length) });
});

test('a search slower than its deadline rejects as unavailable and leaves no request in flight', async t => {
  const clock = manualClock(), entered = deferred();
  const web = await fakeWeb(t, { search: request => entered.resolve(request) });
  let settled = false;
  const pending = failure(retrievalFor(web, clock).retrieve({ query: 'q' })).finally(() => { settled = true; });
  const request = await entered.promise;
  await clock.advance(SEARCH_TIMEOUT_MS - 1);
  assert.equal(settled, false);
  await clock.advance(1);
  assertUnavailable(await bounded(pending), web);
  assert.equal(await bounded(request.closed), false);
  assert.equal(clock.armed, 0);
});

const PROSE = 'Le tramway de la ville transporte chaque jour des milliers de voyageurs entre la gare et le port. ';
const longText = (marker, repeat = 4) => `${marker} ${PROSE.repeat(repeat)}`.trim();
function page(res, body, { status = 200, type = 'text/html; charset=utf-8', headers = {} } = {}) {
  res.writeHead(status, { 'Content-Type': type, ...headers });
  res.end(body);
}
const article = (title, text) => `<!doctype html><html><head><title>${title}</title></head><body><article><p>${text}</p></article></body></html>`;
const servePage = (title, text) => (request, res) => page(res, article(title, text));
const searchFor = results => (request, res) => json(res, { results: results.map(([url, title = 'Résultat']) => ({ url, title, content: 'extrait' })) });

test('unsafe or repeated results are never opened and the first five candidates are opened together', async t => {
  const opened = [];
  const hold = (request, res) => opened.push({ request, release: () => page(res, article('Page', longText('lue'))) });
  const unsafe = ['http://plain.example.org/', 'https://192.168.1.10/', 'https://printer.local/', 'https://intranet.lan/',
    'https://user:pw@login.example.org/', 'https://shop.example.org:8443/', 'ftp://files.example.org/', 'pas une adresse'];
  const safe = ['https://one.example.org/a', 'https://two.example.org/b', 'https://three.example.org/c',
    'https://four.example.org/d', 'https://five.example.org/e', 'https://six.example.org/f'];
  const pages = Object.fromEntries(safe.map(url => [new URL(url).hostname + new URL(url).pathname, hold]));
  const web = await fakeWeb(t, { pages, search: searchFor([
    ...unsafe.map(url => [url]), [safe[0]], [`${safe[0]}#section`], ...safe.slice(1).map(url => [url]),
  ]) });
  const pending = retrievalFor(web).retrieve({ query: 'tramway' });
  await until(() => opened.length === 5, 'five pages opened at once');
  assert.deepEqual(opened.map(({ request }) => request.host).sort(), ['five', 'four', 'one', 'three', 'two'].map(name => `${name}.example.org`).sort(),
    'the five first safe and distinct results are all opened before any of them answers');
  opened.forEach(({ release }) => release());
  await bounded(pending);
  assert.deepEqual(web.escaped, []);
  assert.deepEqual(web.requests.filter(request => request.host !== 'searxng').map(request => request.host).sort(),
    ['five', 'four', 'one', 'three', 'two'].map(name => `${name}.example.org`).sort());
  assert.equal(opened[0].request.headers['user-agent'], web.requests[0].headers['user-agent']);
});

// Prose past the read length, so that the extracted text is cut.
const LONG_PROSE = PROSE.repeat(Math.ceil(WEB_PAGE_READ_MAX_CHARS / PROSE.length));
const NOISY_PAGE = `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><title>Tram &amp; m&eacute;tro</title>
<style>body { color: red } /* STYLE_NOISE */</style><script>window.SCRIPT_NOISE = "<p>faux</p>";</script></head>
<body><header><nav>NAV_NOISE accueil</nav></header><noscript>NOSCRIPT_NOISE</noscript>
<svg viewBox="0 0 1 1"><text>SVG_NOISE</text></svg><template><p>TEMPLATE_NOISE</p></template>
<article><h1>Le  tram&nbsp;de nuit</h1><script type="module">import('SCRIPT_NOISE')</script>
<p>Caf&eacute; &#233;t&#xE9; &laquo;&nbsp;cit&eacute;&nbsp;&raquo; &lt;b&gt; &#x1F68B; &#x110000; &#55296; &unknown;</p>
<STYLE>p { margin: 0 } STYLE_NOISE</STYLE><p>${LONG_PROSE}</p></article><footer>FOOTER_NOISE</footer></body></html>`;

test('a search reads the first three readable pages in result order with their extracted and bounded text', async t => {
  const releaseFirst = deferred();
  const web = await fakeWeb(t, { search: searchFor([
    ['https://one.example.org/tram', 'Résultat un'], ['https://two.example.org/plan.pdf'], ['https://three.example.org/main'],
    ['https://four.example.org/notes.txt', 'Notes de voyage'], ['https://five.example.org/extra'],
  ]), pages: {
    'one.example.org/tram': async (request, res) => { await releaseFirst.promise; page(res, NOISY_PAGE); },
    'two.example.org/plan.pdf': (request, res) => page(res, '%PDF-1.7 binary', { type: 'application/pdf' }),
    'three.example.org/main': (request, res) => page(res, `<html><head><title>Ligne 3</title></head><body><nav>NAV_NOISE</nav>
      <main><p>${longText('Ligne trois')}</p></main><footer>FOOTER_NOISE</footer></body></html>`),
    'four.example.org/notes.txt': (request, res) => page(res, `  ${longText('Notes')}\n\n  fin  `, { type: 'text/plain' }),
    'five.example.org/extra': servePage('Cinq', longText('Cinquième')),
  } });
  const pending = retrievalFor(web).retrieve({ query: 'tram de nuit' });
  await until(() => web.requests.filter(request => request.host !== 'searxng').length === 5, 'all candidates opened');
  await until(() => web.responses.length === 5, 'every other page answered before the first one');
  releaseFirst.resolve();
  const { documents, limits } = await bounded(pending);
  assert.deepEqual(documents.map(document => [document.url, document.title]), [
    ['https://one.example.org/tram', 'Tram & métro'],
    ['https://three.example.org/main', 'Ligne 3'],
    ['https://four.example.org/notes.txt', 'Notes de voyage'],
  ]);
  const [first, third, fourth] = documents;
  assert.equal(first.text.length, WEB_PAGE_READ_MAX_CHARS);
  assert.ok(first.text.startsWith('Le tram de nuit Café été « cité » <b> 🚋 � � &unknown; '), first.text.slice(0, 80));
  assert.doesNotMatch(first.text, /NOISE|accueil|color|window|import|\s{2}/);
  assert.equal(third.text, longText('Ligne trois'));
  assert.equal(fourth.text, `${longText('Notes')} fin`);
  assert.equal(limits.length, 1, 'only the unreadable PDF counts as a page that could not be read');
  assert.doesNotMatch(limits[0], /example|pdf|https?:|127\.0\.0\.1/);
});

// A page laid out with divisions only: neither article nor main marks its content, which sits among navigation, side
// links and a footer. Facts, names and addresses are invented.
const CENTRAL_FACT = 'Le funiculaire de Valbrume gravit 412 mètres en sept minutes depuis son ouverture en 1931.';
const LAYOUT_PAGE = `<!doctype html><html><head><title>Funiculaire de Valbrume</title></head><body>
<header><nav><ul>${['Accueil', 'Horaires', 'Tarifs', 'Contact'].map(name => `<li><a href="/${name}">NAV_LINK ${name}</a></li>`).join('')}</ul></nav></header>
<div class="layout"><div class="sidebar"><ul>${['Lignes', 'Plans', 'Archives', 'Presse', 'Boutique']
    .map(name => `<li><a href="/side/${name}">SIDE_LINK ${name} et toutes les actualités du réseau</a></li>`).join('')}</ul></div>
<div class="content"><h1>Le funiculaire de Valbrume</h1><p>${CENTRAL_FACT} Ses deux voitures se croisent à mi-pente sur une voie
unique dédoublée, ce qui permet un départ toutes les dix minutes en été comme en hiver.</p>
<p>La station basse se trouve près du lac, la station haute au pied du belvédère, et les voyageurs y montent avec leurs vélos
sans supplément, comme le prévoit le règlement du syndicat des transports de la vallée depuis plusieurs années.</p>
<p>Les cabines ont été remplacées une première fois après la guerre, puis rénovées au début des années deux mille, sans changer
leur capacité de soixante places ni le câble de traction, inspecté chaque printemps par les techniciens du réseau.</p></div></div>
<footer><p>FOOTER_NOTE Mentions légales, plan du site et conditions d'utilisation du réseau de Valbrume.</p></footer></body></html>`;

test('a page without article or main gives its central paragraphs without navigation, side links or footer', async t => {
  const web = await fakeWeb(t, { search: searchFor([['https://valbrume.example.org/funiculaire']]), pages: {
    'valbrume.example.org/funiculaire': (request, res) => page(res, LAYOUT_PAGE),
  } });
  const { documents } = await bounded(retrievalFor(web).retrieve({ query: 'funiculaire de Valbrume' }));
  assert.equal(documents.length, 1);
  assert.equal(documents[0].title, 'Funiculaire de Valbrume');
  assert.ok(documents[0].text.includes(CENTRAL_FACT), documents[0].text.slice(0, 200));
  assert.doesNotMatch(documents[0].text, /NAV_LINK|SIDE_LINK|FOOTER_NOTE/);
});

// Every active part a browser would run or load. Each one, if run, sets a global marker; each address, if requested,
// shows in the requests of the fake web or, through the global fetch, in the outside requests.
const ACTIVE_PAGE = `<!doctype html><html><head><title>Page active</title>
<link rel="stylesheet" href="https://assets.example.org/style.css"><link rel="preload" href="https://cdn.elsewhere.invalid/font.woff2">
<script>globalThis.TVLENS_INLINE_SCRIPT = true;</script><script src="https://assets.example.org/app.js"></script>
<script type="module" src="https://cdn.elsewhere.invalid/module.js"></script><style>@import url("https://assets.example.org/more.css");</style>
</head><body onload="globalThis.TVLENS_ONLOAD = true"><div class="content">
<p onclick="globalThis.TVLENS_ONCLICK = true">${CENTRAL_FACT} Les voitures partent de la gare basse toutes les dix minutes.</p>
<img src="https://images.example.org/photo.jpg" srcset="https://images.example.org/photo-2x.jpg 2x" onerror="globalThis.TVLENS_ONERROR = true">
<iframe src="https://frame.example.org/embed" onload="globalThis.TVLENS_FRAME = true"></iframe>
<object data="https://assets.example.org/plugin.swf"></object><video src="https://media.example.org/clip.mp4" poster="https://media.example.org/p.jpg"></video>
<p>${PROSE}</p><p>${PROSE.repeat(2)}</p></div><script>document.body.innerHTML = 'TVLENS_REWRITTEN';</script></body></html>`;

test('an active page runs no script and loads no resource: only SearXNG and the page itself are requested', async t => {
  const outside = [];
  const globalFetch = globalThis.fetch;
  globalThis.fetch = (input, init) => {
    if (!String(input).startsWith('http://127.0.0.1:')) outside.push(String(input));
    return globalFetch(input, init);
  };
  t.after(() => { globalThis.fetch = globalFetch; });
  // The first fetch of the process installs undici's dispatcher under a global symbol: that is the transport of the fake web.
  const ownGlobals = () => Reflect.ownKeys(globalThis).filter(key => !String(key).startsWith('Symbol(undici.'));
  const globals = ownGlobals();
  const web = await fakeWeb(t, { search: searchFor([['https://active.example.org/page']]), pages: {
    'active.example.org/page': (request, res) => page(res, ACTIVE_PAGE),
  } });
  const { documents } = await bounded(retrievalFor(web).retrieve({ query: 'funiculaire' }));
  assert.deepEqual(ownGlobals(), globals, 'no global was added');
  assert.deepEqual(web.requests.map(request => `${request.host}${request.path}`.replace(/\?.*$/, '')),
    ['searxng/search', 'active.example.org/page']);
  assert.deepEqual(web.escaped, []);
  assert.deepEqual(outside, []);
  assert.equal(documents.length, 1);
  assert.ok(documents[0].text.includes(CENTRAL_FACT), documents[0].text.slice(0, 200));
  assert.doesNotMatch(documents[0].text, /<|>|TVLENS_|globalThis|https?:|onerror|stylesheet|@import/);
});

test('a long plain text page is cut to the read length without splitting a surrogate pair', () => {
  assert.equal(plainText('a'.repeat(WEB_PAGE_READ_MAX_CHARS - 1) + '😀' + 'b'.repeat(500)), 'a'.repeat(WEB_PAGE_READ_MAX_CHARS - 1));
  assert.equal(plainText('a'.repeat(WEB_PAGE_READ_MAX_CHARS + 500)), 'a'.repeat(WEB_PAGE_READ_MAX_CHARS));
});

const redirect = location => (request, res) => { res.writeHead(302, { Location: location, 'Content-Type': 'text/html' }); res.end('<p>moved</p>'); };
// Every number in the limits is a count of pages that were opened but not read.
const unreadCount = limits => limits.join(' ').match(/\d+/g)?.map(Number).reduce((sum, count) => sum + count, 0) ?? 0;
function assertSafeLimits(limits, web) {
  assert.doesNotMatch(JSON.stringify(limits), /example|https?:|10\.0\.0\.1|127\.0\.0\.1/);
  assert.equal(JSON.stringify(limits).includes(web.host), false);
}

test('redirects are followed by hand up to three hops, refused targets are never requested and final pages count once', async t => {
  const web = await fakeWeb(t, { search: searchFor([
    ['https://a.example.org/start'], ['https://b.example.org/start'], ['https://c.example.org/start'],
    ['https://d.example.org/1'], ['https://e.example.org/alias'],
  ]), pages: {
    'a.example.org/start': redirect('/moved?step=2'),
    'a.example.org/moved?step=2': (request, res) => { res.writeHead(301, { Location: 'https://final.example.org/page#top' }); res.end(); },
    'final.example.org/page': servePage('Page finale', longText('Arrivée')),
    'b.example.org/start': redirect('https://10.0.0.1/admin'),
    'c.example.org/start': redirect('http://c.example.org/plain'),
    'd.example.org/1': redirect('/2'), 'd.example.org/2': redirect('/3'), 'd.example.org/3': redirect('/4'), 'd.example.org/4': redirect('/5'),
    'd.example.org/5': servePage('Trop loin', longText('Jamais atteinte')),
    'e.example.org/alias': redirect('https://final.example.org/page'),
  } });
  const { documents, limits } = await bounded(retrievalFor(web).retrieve({ query: 'redirections' }));
  assert.deepEqual(documents.map(document => [document.url, document.title]), [['https://final.example.org/page', 'Page finale']]);
  assert.equal(documents[0].text, longText('Arrivée'));
  assert.ok(web.responses.some(response => response.status === 302 && response.location === '/moved?step=2'),
    'the redirect itself reaches the adapter with a readable location');
  const pageResponses = web.responses.filter(response => response.url.startsWith('https://'));
  assert.ok(pageResponses.length > 0 && pageResponses.every(response => response.init.redirect === 'manual'));
  assert.deepEqual(web.escaped, [], 'a refused target is never requested');
  const paths = web.requests.map(request => `${request.host}${request.path}`);
  assert.equal(paths.includes('d.example.org/4'), true);
  assert.equal(paths.includes('d.example.org/5'), false, 'a fourth redirect is not followed');
  assert.equal(unreadCount(limits), 3, 'two refused redirects and one chain too long; the repeated final page is not a failure');
  assertSafeLimits(limits, web);
});

test('a missing, non textual, too short or untitled page is not returned and counts in the limits', async t => {
  const web = await fakeWeb(t, { search: searchFor([
    ['https://gone.example.org/'], ['https://data.example.org/'], ['https://short.example.org/'],
    ['https://untitled.example.org/', '  '], ['https://good.example.org/'],
  ]), pages: {
    'gone.example.org/': (request, res) => page(res, article('Absente', longText('Absente')), { status: 404 }),
    'data.example.org/': (request, res) => page(res, JSON.stringify({ text: longText('Données') }), { type: 'application/json' }),
    'short.example.org/': servePage('Courte', 'Trois mots seulement.'),
    'untitled.example.org/': (request, res) => page(res, `<body><main>${longText('Sans titre')}</main></body>`),
    'good.example.org/': servePage('Bonne', longText('Bonne page')),
  } });
  const { documents, limits } = await bounded(retrievalFor(web).retrieve({ query: 'pages' }));
  assert.deepEqual(documents.map(document => document.url), ['https://good.example.org/']);
  assert.equal(unreadCount(limits), 4);
  assertSafeLimits(limits, web);
});

const CHUNK_BYTES = 64 * 1024;
const BEFORE_THE_CAP = 'AVANT_LA_BORNE';
const AFTER_THE_CAP = 'APRES_LA_BORNE';
// The first marker fills the last bytes under the cap and the second starts on the cap itself. The padding in between
// is spaces, which collapse in the text, so both markers would reach the text if the page were read past the cap.
async function streamLargePage(res, totalPadding, onWritten) {
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  const opening = `<html><head><title>Grande page</title></head><body><article><p>${longText('Début')}</p>`;
  const filler = PAGE_BYTE_LIMIT - Buffer.byteLength(opening) - Buffer.byteLength(BEFORE_THE_CAP);
  const capped = Buffer.from(`${opening}${' '.repeat(filler)}${BEFORE_THE_CAP}${AFTER_THE_CAP}`);
  if (!res.write(capped)) await new Promise(resolve => { res.once('drain', resolve); res.once('close', resolve); });
  const padding = Buffer.alloc(CHUNK_BYTES, ' ');
  for (let written = 0; written < totalPadding && !res.destroyed; written += CHUNK_BYTES) {
    if (!res.write(padding)) await new Promise(resolve => { res.once('drain', resolve); res.once('close', resolve); });
    onWritten(written + CHUNK_BYTES);
  }
  if (!res.destroyed) res.end('<p>BEYOND_THE_CAP</p></article></body></html>');
}

test('a page larger than the byte cap is read exactly up to the cap and its download is cut', async t => {
  let served = 0;
  const totalPadding = PAGE_BYTE_LIMIT * 4;
  const web = await fakeWeb(t, { search: searchFor([['https://big.example.org/']]), pages: {
    'big.example.org/': (request, res) => streamLargePage(res, totalPadding, bytes => { served = bytes; }),
  } });
  const { documents, limits } = await bounded(retrievalFor(web).retrieve({ query: 'grande page' }));
  assert.deepEqual(documents.map(document => [document.title, document.text]),
    [['Grande page', `${longText('Début')} ${BEFORE_THE_CAP}`]]);
  assert.equal(documents[0].text.includes(AFTER_THE_CAP), false, 'nothing past the cap is read');
  assert.deepEqual(limits, []);
  const pageRequest = web.requests.find(request => request.host === 'big.example.org');
  assert.equal(await bounded(pageRequest.closed), false, 'the server never finished sending the page');
  assert.ok(served < totalPadding, `served ${served} of ${totalPadding} padding bytes`);
});

test('a page is decoded with the charset it declares, and as UTF-8 when the label is unknown', async t => {
  const latin = `Éléphant à Noël, café crème. ${PROSE.repeat(3)}`;
  const web = await fakeWeb(t, { search: searchFor([['https://latin.example.org/'], ['https://odd.example.org/', 'Étiquette']]), pages: {
    'latin.example.org/': (request, res) => page(res, Buffer.from(article('Résumé', latin), 'latin1'), { type: 'text/html; charset=ISO-8859-1' }),
    'odd.example.org/': (request, res) => page(res, Buffer.from(latin, 'utf8'), { type: 'text/plain; charset="x-not-a-charset"' }),
  } });
  const { documents } = await bounded(retrievalFor(web).retrieve({ query: 'encodage' }));
  assert.deepEqual(documents.map(document => [document.title, document.text]), [['Résumé', latin.trim()], ['Étiquette', latin.trim()]]);
});

test('a page slower than its deadline, redirects and body included, counts in the limits and releases its timer', async t => {
  const clock = manualClock();
  const web = await fakeWeb(t, { search: searchFor([
    ['https://silent.example.org/'], ['https://stalled.example.org/'], ['https://hop.example.org/'], ['https://quick.example.org/'],
  ]), pages: {
    'silent.example.org/': () => {},
    'stalled.example.org/': (request, res) => {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.write(`<html><head><title>Lente</title></head><body><article>${longText('Lente')}`);
    },
    'hop.example.org/': redirect('/then-silent'),
    'hop.example.org/then-silent': () => {},
    'quick.example.org/': servePage('Rapide', longText('Rapide')),
  } });
  let settled = false;
  const pending = retrievalFor(web, clock).retrieve({ query: 'lenteur' }).finally(() => { settled = true; });
  const waiting = () => web.requests.filter(request => ['silent.example.org', 'stalled.example.org'].includes(request.host)
    || request.path === '/then-silent');
  await until(() => waiting().length === 3 && web.responses.some(response => response.url === 'https://stalled.example.org/'),
    'slow pages reached');
  await clock.advance(PAGE_TIMEOUT_MS - 1);
  assert.equal(settled, false);
  await clock.advance(1);
  const outcome = await bounded(pending);
  assert.equal(typeof outcome, 'object', 'the page deadline ends the slow openings');
  const { documents, limits } = outcome;
  assert.deepEqual(documents.map(document => document.url), ['https://quick.example.org/']);
  assert.equal(unreadCount(limits), 3);
  assertSafeLimits(limits, web);
  for (const request of waiting()) assert.equal(await bounded(request.closed), false);
  assert.equal(clock.armed, 0);
});

test('a cancelled search rejects with the abort reason and leaves no request in flight', async t => {
  const clock = manualClock(), entered = deferred();
  const web = await fakeWeb(t, { search: request => entered.resolve(request) });
  const early = new AbortController();
  early.abort(new Error('already cancelled'));
  assert.equal(await failure(retrievalFor(web, clock).retrieve({ query: 'q', signal: early.signal })), early.signal.reason);
  assert.equal(web.requests.length, 0);
  const controller = new AbortController();
  const pending = failure(retrievalFor(web, clock).retrieve({ query: 'q', signal: controller.signal }));
  const request = await entered.promise;
  const reason = Object.assign(new Error('user left'), { code: 'CALLER_CANCELLED' });
  controller.abort(reason);
  assert.equal(await bounded(pending), reason);
  assert.equal(await bounded(request.closed), false);
  assert.equal(clock.armed, 0);
});

test('a cancellation during the page openings stops them all and returns only once every opening has settled', async t => {
  const clock = manualClock(), lateRelease = deferred();
  const hosts = ['first', 'second', 'late'].map(name => `${name}.example.org`);
  const web = await fakeWeb(t, { search: searchFor(hosts.map(host => [`https://${host}/`])),
    pages: Object.fromEntries(hosts.map(host => [`${host}/`, () => {}])) });
  // This page's transport is slow to notice the abort: the retrieval must wait for it all the same.
  const fetchImpl = async (input, init) => {
    const reply = web.fetchImpl(input, init);
    if (new URL(input).hostname !== 'late.example.org') return reply;
    try { return await reply; } finally { await lateRelease.promise; }
  };
  const controller = new AbortController();
  let settled = false;
  const pending = failure(new SearxngRetrieval({ url: web.origin, fetchImpl, ...clock.io })
    .retrieve({ query: 'q', signal: controller.signal })).finally(() => { settled = true; });
  await until(() => web.requests.filter(request => hosts.includes(request.host)).length === 3, 'every page requested');
  const reason = Object.assign(new Error('user left'), { code: 'CALLER_CANCELLED' });
  controller.abort(reason);
  const pages = web.requests.filter(request => hosts.includes(request.host));
  for (const request of pages) assert.equal(await bounded(request.closed), false, `${request.host} still in flight`);
  assert.equal(settled, false, 'an opening has not settled yet');
  lateRelease.resolve();
  assert.equal(await bounded(pending), reason, 'a cancellation is neither an unavailable search nor a limit');
  assert.equal(clock.armed, 0);
});

test('malformed markup still gives the readable text, without comments or an unclosed script', () => {
  const page = htmlPage(`<title>A &lt; B</title><!-- <article>COMMENT_NOISE</article> --><p>2 < 3 et ${longText('Texte')}
    <script>window.SCRIPT_NOISE = 1; never closed`);
  assert.equal(page.title, 'A < B');
  assert.equal(page.text, `2 < 3 et ${longText('Texte')}`);
});

test('a head left open ends where the content starts, as a browser closes it', () => {
  const opened = `<html><head><meta charset="utf-8"><title>Tête ouverte</title><style>p { color: red }</style>`;
  for (const content of [`<body><article><p>${longText('Corps')}</p></article></body></html>`, `<article><p>${longText('Corps')}</p></article>`]) {
    assert.deepEqual(htmlPage(`${opened}${content}`), { title: 'Tête ouverte', text: longText('Corps') }, content);
  }
});

test('an unclosed title runs to the end of the page, even when repeated over a page as large as the byte cap', () => {
  assert.deepEqual(htmlPage('<head><title>Titre jamais fermé <body><p>Suite de la page'),
    { title: 'Titre jamais fermé Suite de la page', text: '' });
  const repeated = htmlPage('<title>x '.repeat(Math.ceil(PAGE_BYTE_LIMIT / '<title>x '.length)));
  assert.equal(repeated.text, '');
  assert.match(repeated.title, /^x( x)+$/);
});
