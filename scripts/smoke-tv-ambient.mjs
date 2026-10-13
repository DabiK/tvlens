// Browser proof of the ambient TV page, outside `npm test`:
//   node scripts/smoke-tv-ambient.mjs [--out <dir>] [--app <dir>]
// Headless Chrome on a temporary copy of tv/app without connection.js. The local controller is intercepted
// (no port is opened), page time is driven by page.clock, window.close is a counter that closes nothing (the
// page stays, as on a TV where close() is slow or has no effect). Screenshots are taken
// with a transparent background and read back pixel by pixel. A desktop Chrome is not the TV engine and
// has no compositor: this proves the page, not the display on the TV.
import { chromium } from 'playwright-core';
import sharp from 'sharp';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { assemble } from './package-tv-ambient.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const option = name => { const index = process.argv.indexOf(name); return index > 0 && process.argv[index + 1] ? path.resolve(process.argv[index + 1]) : null; };
const out = option('--out') || fs.mkdtempSync(path.join(os.tmpdir(), 'tvlens-smoke-tv-ambient-'));
// --app points at another copy of the application: that is how a deliberately broken page is shown to fail here.
const app = option('--app') || path.join(root, 'tv', 'app');
const chrome = process.env.TVLENS_CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const CONTROL = 'http://127.0.0.1:8788';
const NONCE = '0123456789abcdef0123456789abcdef';
const BOXES = {
  'card-raised': { x: 48, y: 628, width: 760, height: 272 }, 'card-low': { x: 48, y: 768, width: 760, height: 272 },
  'pill-raised': { x: 48, y: 844, width: 440, height: 56 }, 'pill-low': { x: 48, y: 984, width: 440, height: 56 },
};
const TEXT = 'Le taux de chômage annoncé à 7,4 % concorde avec la dernière publication trimestrielle. La comparaison avec 2019 est juste, à deux dixièmes près.';
const launch = (extra = {}) => ({
  v: 1, nonce: NONCE, control: CONTROL, element: 'card', profile: 'relay', box: BOXES['card-raised'], displayMs: 14000,
  card: { id: 'lot-5', kind: 'verification', label: 'Sources consultées', text: TEXT, interval: { startMs: 776000, endMs: 784000 },
    sources: [{ title: 'Insee', host: 'insee.fr' }, { title: 'Le Monde', host: 'lemonde.fr' }, { title: 'Vie publique', host: 'vie-publique.fr' }], claimCount: 2, more: 1 },
  activity: { label: 'Vérification en cours…', waiting: 2, late: false }, ...extra,
});
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
const FOCUSABLE = 'a[href],area[href],button,input,select,textarea,summary,dialog,iframe,audio,video,embed,object,[tabindex],[contenteditable],[autofocus],[draggable="true"]';

fs.mkdirSync(out, { recursive: true });
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'tvlens-ambient-copy-'));
// Temporary copy, never the working tree: a real connection.js sitting in tv/app must not be loaded or read.
const copy = path.join(work, 'app');
fs.cpSync(app, copy, { recursive: true, filter: source => path.basename(source) !== 'connection.js' });
assert.equal(fs.existsSync(path.join(copy, 'connection.js')), false);
const probeDir = assemble({ dir: path.join(work, 'probe'), probe: true, appDir: app }).dir;

const results = [], shots = [];
let browser;
try {
  browser = await chromium.launch({ executablePath: chrome, headless: true });
} catch (error) {
  console.error(`Navigateur non lancé (${chrome}) : ${error.message.split('\n')[0]}\nPreuve navigateur NON exécutée.`);
  fs.rmSync(work, { recursive: true, force: true });
  process.exit(2);
}

// One page per scenario. handlers: {ack, wait, key}, each (route, url) => any; by default the grant is
// given, the long poll is held and the key report is accepted.
async function open({ params, raw, palm = null, handlers = {}, file = path.join(copy, 'ambient.html'), control = CONTROL } = {}) {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  const seen = { requests: [], foreign: [], errors: [] };
  page.on('pageerror', error => seen.errors.push(error.message));
  await page.addInitScript(({ value, palm }) => {
    window.__closed = 0;
    window.close = () => { window.__closed++; };
    window.__audio = 0;
    for (const name of ['AudioContext', 'webkitAudioContext', 'Audio']) {
      const Native = window[name];
      if (Native) window[name] = function (...args) { window.__audio++; return new Native(...args); };
    }
    window.__fetches = [];
    const nativeFetch = window.fetch.bind(window);
    window.fetch = (url, init = {}) => { window.__fetches.push({ url: String(url), method: init.method || 'GET', keepalive: init.keepalive === true, headers: 'headers' in init, body: 'body' in init }); return nativeFetch(url, init); };
    if (value !== undefined && !(palm && palm.carriesParams)) window.launchParams = value;
    if (palm) {
      window.__palm = [];
      window.PalmSystem = {
        launchParams: palm.carriesParams ? value : '',
        setInputRegion(region) { if (palm.throws) throw new Error('refused'); window.__palm.push(['setInputRegion', JSON.stringify(region)]); },
        window: { setFocus(flag) { if (palm.throws) throw new Error('refused'); window.__palm.push(['setFocus', flag]); } },
      };
    }
  }, { value: raw !== undefined ? raw : params === undefined ? undefined : JSON.stringify(params), palm });
  await page.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.protocol === 'file:') return route.continue();
    if (url.origin !== control) { seen.foreign.push(request.url()); return route.abort(); }
    const [, scope, name, nonce] = url.pathname.split('/');
    seen.requests.push({ method: request.method(), path: url.pathname, name, nonce, headers: Object.keys(request.headers()), body: request.postData() });
    if (scope !== 'ambient' || !['ack', 'wait', 'key'].includes(name)) return route.fulfill({ status: 404, json: {} });
    if (handlers[name]) return handlers[name](route, url);
    if (name === 'wait') return; // held, as the controller holds it
    return route.fulfill({ status: 200, json: {} });
  });
  await page.clock.install({ time: new Date('2026-10-13T04:00:00Z') });
  await page.clock.pauseAt(new Date('2026-10-13T04:00:01Z'));
  await page.goto(pathToFileURL(file).href);
  return {
    page, seen,
    // closed: whether the page asked to be closed (0 or 1). closes: how many times it asked; it asks again,
    // a bounded number of times, for as long as it is still there.
    closed: () => page.evaluate(() => (window.__closed ? 1 : 0)),
    closes: () => page.evaluate(() => window.__closed),
    painted: () => page.waitForFunction(() => !document.getElementById('ambient').hidden && document.getElementById('ambient').children.length > 0),
    until: (name, count = 1) => waitFor(() => seen.requests.filter(r => r.name === name).length >= count, `${count} requête(s) ${name}`),
    count: name => seen.requests.filter(r => r.name === name).length,
    done: async () => { assert.deepEqual(seen.errors, [], 'no page error'); assert.deepEqual(seen.foreign, [], 'no request leaves the loopback controller'); await page.close(); },
  };
}
async function waitFor(test, label, timeoutMs = 5000) {
  const started = Date.now();
  while (!(await test())) {
    if (Date.now() - started > timeoutMs) throw new Error(`Attente dépassée : ${label}`);
    await new Promise(resolve => setTimeout(resolve, 10));
  }
}
// Every pixel of the screen with a non-zero alpha, against the box it is allowed in.
async function pixels(page, box, name) {
  const png = await page.screenshot({ omitBackground: true, animations: 'disabled' });
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  assert.deepEqual([info.width, info.height, info.channels], [1920, 1080, 4]);
  const found = { painted: 0, outside: 0, magenta: 0, bounds: null };
  let left = Infinity, top = Infinity, right = -1, bottom = -1;
  for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) {
    const i = (y * info.width + x) * 4;
    if (!data[i + 3]) continue;
    found.painted++;
    if (data[i] > 230 && data[i + 1] < 40 && data[i + 2] > 230) found.magenta++;
    left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y);
    if (!box || x < box.x || x >= box.x + box.width || y < box.y || y >= box.y + box.height) found.outside++;
  }
  if (found.painted) found.bounds = { left, top, right, bottom };
  if (name) {
    // The transparent capture is what is measured; the composite over a fake video frame is only for the eye.
    fs.writeFileSync(path.join(out, `${name}.png`), png);
    const frame = await sharp({ create: { width: 1920, height: 1080, channels: 3, background: '#31506b' } }).composite([{ input: png }]).png().toBuffer();
    fs.writeFileSync(path.join(out, `${name}-sur-video.png`), frame);
    shots.push({ name: `${name}.png`, box, ...found });
  }
  return found;
}
const empty = async (page, label) => assert.deepEqual(await pixels(page), { painted: 0, outside: 0, magenta: 0, bounds: null }, label);
const key = (page, init) => page.evaluate(event => document.dispatchEvent(new KeyboardEvent('keydown', { ...event, bubbles: true })), init);
async function check(name, run) {
  try {
    await run();
    results.push({ name, ok: true });
    console.log(`ok   ${name}`);
  } catch (error) {
    results.push({ name, ok: false, error: error.message.split('\n').slice(0, 6).join(' | ') });
    console.log(`FAIL ${name}\n     ${error.message.split('\n').slice(0, 6).join('\n     ')}`);
  }
}

try {
  await check('sans paramètres : rien de peint, aucune requête, fermeture seule à 1,5 s', async () => {
    const s = await open({});
    await empty(s.page, 'nothing painted without parameters');
    await s.page.clock.runFor(1499);
    assert.equal(await s.closed(), 0);
    await s.page.clock.runFor(1);
    assert.equal(await s.closed(), 1);
    assert.deepEqual(s.seen.requests, []);
    await empty(s.page);
    await s.done();
  });

  await check('paramètres invalides, contrôleur hors bouclage, signalement, carte sans source : fermeture immédiate, rien de peint, aucune requête', async () => {
    const cases = {
      'nonce invalide': launch({ nonce: 'abc' }), 'version inconnue': launch({ v: 2 }), 'boîte hors écran': launch({ box: { x: 1400, y: 628, width: 760, height: 272 } }),
      'contrôleur distant': launch({ control: 'http://192.168.1.20:8788' }), 'contrôleur nommé': launch({ control: 'http://localhost:8788' }),
      'texte de 601 caractères': launch({ card: { ...launch().card, text: 'x'.repeat(601) } }),
      'carte de signalement (T7)': launch({ card: { ...launch().card, kind: 'signal', label: 'Repéré dans la vidéo', sources: [] } }),
      'signalement avec sources (T7)': launch({ card: { ...launch().card, kind: 'signal' } }),
      'carte sans source': launch({ card: { ...launch().card, sources: [] } }),
    };
    for (const [label, params] of Object.entries(cases)) {
      const s = await open({ params });
      assert.equal(await s.closed(), 1, `${label}: closed at once`);
      await empty(s.page, label);
      await s.page.clock.runFor(30000);
      assert.deepEqual(s.seen.requests, [], `${label}: no request`);
      assert.deepEqual(await s.page.evaluate(() => window.__fetches), [], `${label}: no fetch at all`);
      assert.equal(await s.closed(), 1);
      await s.done();
    }
    const garbled = await open({ raw: '{"v":1,' });
    assert.equal(await garbled.closed(), 1);
    assert.deepEqual(garbled.seen.requests, []);
    await garbled.done();
  });

  await check('accord : une demande ack sans en-tête ni corps, rien de peint avant la réponse 200, carte dans sa boîte ensuite, aucun élément focalisable', async () => {
    const grant = deferred();
    const s = await open({ params: launch(), handlers: { ack: async route => { await grant.promise; await route.fulfill({ status: 200, json: {} }); } } });
    await s.until('ack');
    await s.page.clock.runFor(1000);
    await empty(s.page, 'nothing painted while the grant is pending');
    assert.equal(await s.page.evaluate(() => document.getElementById('ambient').hidden), true);
    assert.equal(s.count('wait'), 0, 'no long poll before the grant');
    grant.resolve();
    await s.painted();
    const found = await pixels(s.page, BOXES['card-raised'], 'carte-relevee');
    assert.ok(found.painted > 50000, `card painted (${found.painted} px)`);
    assert.equal(found.outside, 0, 'every painted pixel is inside the box');
    assert.equal(found.magenta, 0);
    await s.until('wait');
    const [ack] = s.seen.requests;
    assert.deepEqual([ack.method, ack.path, ack.body], ['POST', `/ambient/ack/${NONCE}`, null]);
    assert.deepEqual(s.seen.requests.map(r => `${r.method} ${r.path}`), [`POST /ambient/ack/${NONCE}`, `GET /ambient/wait/${NONCE}`]);
    for (const request of s.seen.requests) assert.ok(!request.headers.some(h => ['authorization', 'content-type', 'cookie'].includes(h)), 'simple request: no credential, no preflight');
    assert.deepEqual(await s.page.evaluate(() => window.__fetches.map(f => [f.method, f.headers, f.body])), [['POST', false, false], ['GET', false, false]]);
    const dom = await s.page.evaluate(selector => ({
      focusable: document.querySelectorAll(selector).length, active: document.activeElement.tagName, media: document.querySelectorAll('audio,video').length, audio: window.__audio,
      scripts: [...document.scripts].map(script => script.getAttribute('src')), tags: [...new Set([...document.body.querySelectorAll('*')].map(n => n.tagName))].sort(),
      events: getComputedStyle(document.getElementById('ambient')).pointerEvents, text: document.getElementById('ambient').innerText,
      lines: Math.round(document.querySelector('.tvl-card-text').getBoundingClientRect().height / 36),
    }), FOCUSABLE);
    assert.deepEqual([dom.focusable, dom.active, dom.media, dom.audio, dom.events], [0, 'BODY', 0, 0, 'none']);
    assert.deepEqual(dom.scripts, ['surveillance-overlay.js', 'ambient.js'], 'neither connection.js nor remote-client.js');
    assert.deepEqual(dom.tags, ['DIV', 'SCRIPT']);
    assert.match(dom.text, /^Sources consultées · 12:56–13:04\n/);
    assert.match(dom.text, /Sources : insee\.fr · lemonde\.fr \+1/);
    assert.match(dom.text, /\+1 autre résultat · Rakuten · détails/);
    assert.doesNotMatch(dom.text, /https?:|www\.|vrai|faux/i);
    assert.ok(dom.lines <= 3, `text on three lines at most (${dom.lines})`);
    await s.page.keyboard.press('Tab');
    await waitFor(async () => (await s.closed()) === 1, 'Tab ferme comme toute touche');
    assert.equal(await s.page.evaluate(() => document.activeElement.tagName), 'BODY', 'Tab is a key like any other: it closes, it never moves a focus');
    await s.done();
  });

  await check('accord refusé (404) : rien de peint, fermeture, aucune attente ouverte', async () => {
    const s = await open({ params: launch(), handlers: { ack: route => route.fulfill({ status: 404, json: {} }) } });
    await waitFor(async () => (await s.closed()) === 1, 'fermeture après refus');
    await empty(s.page);
    await s.page.clock.runFor(30000);
    assert.equal(s.count('wait'), 0);
    assert.equal(await s.closed(), 1);
    await s.done();
  });

  await check('accord sans réponse : rien de peint, fermeture à 1,5 s, une réponse tardive ne peint rien', async () => {
    const late = deferred();
    const s = await open({ params: launch(), handlers: { ack: async route => { await late.promise; await route.fulfill({ status: 200, json: {} }).catch(() => {}); } } });
    await s.until('ack');
    await s.page.clock.runFor(1499);
    assert.equal(await s.closed(), 0);
    await empty(s.page);
    await s.page.clock.runFor(1);
    assert.equal(await s.closed(), 1);
    late.resolve();
    await new Promise(resolve => setTimeout(resolve, 150));
    await s.page.clock.runFor(30000);
    await empty(s.page, 'a late grant paints nothing');
    assert.equal(s.count('wait'), 0);
    await s.done();
  });

  await check('attente : close:false redemande, close:true ferme et efface', async () => {
    const replies = [deferred(), deferred()];
    let asked = 0;
    const s = await open({ params: launch(), handlers: { wait: async route => { const reply = replies[asked++]; await route.fulfill({ status: 200, json: await reply.promise }); } } });
    await s.painted();
    await s.until('wait');
    replies[0].resolve({ close: false });
    await new Promise(resolve => setTimeout(resolve, 100));
    assert.equal(s.count('wait'), 1, 'the next poll waits for its spacing');
    await s.page.clock.runFor(250);
    await s.until('wait', 2);
    assert.equal(await s.closed(), 0);
    replies[1].resolve({ close: true });
    await waitFor(async () => (await s.closed()) === 1, 'fermeture annoncée par wait');
    await empty(s.page);
    await s.done();
    const gone = await open({ params: launch(), handlers: { wait: route => route.fulfill({ status: 404, json: {} }) } });
    await waitFor(async () => (await gone.closed()) === 1, 'fermeture sur nonce inconnu');
    await empty(gone.page);
    await gone.done();
    const dead = await open({ params: launch(), handlers: { wait: route => route.abort() } });
    await waitFor(async () => (await dead.closed()) === 1, 'fermeture sur contrôleur injoignable');
    await dead.done();
  });

  await check('première touche : carte effacée, envoi key (keepalive), fermeture au plus tard 150 ms après', async () => {
    const s = await open({ params: launch(), handlers: { key: () => {} } }); // the report never completes
    await s.painted();
    await s.page.keyboard.down('ArrowRight');
    await s.until('key');
    await empty(s.page, 'the card leaves the screen at the key, before the page closes');
    assert.equal(await s.closed(), 0, 'the page waits for its report');
    await s.page.clock.runFor(149);
    assert.equal(await s.closed(), 0);
    await s.page.clock.runFor(1);
    assert.equal(await s.closed(), 1);
    await s.page.keyboard.up('ArrowRight');
    await key(s.page, { keyCode: 13 });
    assert.equal(s.count('key'), 1, 'one report, whatever the number of keys');
    assert.equal(await s.closed(), 1);
    assert.deepEqual(await s.page.evaluate(() => window.__fetches.filter(f => f.url.includes('/key/')).map(f => [f.method, f.keepalive, f.headers, f.body])), [['POST', true, false, false]]);
    assert.equal(s.seen.requests.find(r => r.name === 'key').path, `/ambient/key/${NONCE}`);
    await s.done();
    const quick = await open({ params: launch() });
    await quick.painted();
    await key(quick.page, { keyCode: 461 }); // webOS Back
    await waitFor(async () => (await quick.closed()) === 1, 'fermeture dès la fin de l’envoi');
    assert.equal(quick.count('key'), 1);
    await empty(quick.page);
    await quick.done();
    const release = await open({ params: launch() });
    await release.painted();
    await release.page.evaluate(() => document.dispatchEvent(new KeyboardEvent('keyup', { keyCode: 39, bubbles: true })));
    await waitFor(async () => (await release.closed()) === 1, 'fermeture sur relâchement seul');
    assert.equal(release.count('key'), 1);
    await release.done();
  });

  await check('touche pendant la demande d’accord : la page ne peint jamais, même si l’accord arrive ensuite', async () => {
    const grant = deferred();
    const s = await open({ params: launch(), handlers: { ack: async route => { await grant.promise; await route.fulfill({ status: 200, json: {} }).catch(() => {}); } } });
    await s.until('ack');
    await key(s.page, { keyCode: 39 });
    await waitFor(async () => (await s.closed()) === 1, 'fermeture après la touche');
    assert.equal(s.count('key'), 1);
    grant.resolve();
    await new Promise(resolve => setTimeout(resolve, 150));
    await s.page.clock.runFor(30000);
    await empty(s.page, 'a grant that arrives after a key paints nothing');
    assert.equal(s.count('wait'), 0);
    await s.done();
    const blank = await open({});
    await key(blank.page, { keyCode: 40 });
    assert.equal(await blank.closed(), 1, 'a key closes a page that has no parameters yet');
    assert.deepEqual(blank.seen.requests, []);
    await blank.done();
  });

  await check('échéance : fermeture seule à displayMs + 1,5 s, plafonnée à 21,5 s', async () => {
    const short = await open({ params: launch({ displayMs: 8000 }) });
    await short.painted();
    await short.page.clock.runFor(9499);
    assert.equal(await short.closed(), 0);
    await short.page.clock.runFor(1);
    assert.equal(await short.closed(), 1);
    await empty(short.page);
    await short.done();
    const capped = await open({ params: launch({ displayMs: 3600000 }) });
    await capped.painted();
    await capped.page.clock.runFor(21499);
    assert.equal(await capped.closed(), 0);
    await capped.page.clock.runFor(1);
    assert.equal(await capped.closed(), 1);
    await capped.done();
  });

  await check('fermeture sans effet : la touche, la relance et l’échéance redemandent chacune une fermeture bornée, rien n’est repeint, une seule touche signalée', async () => {
    // window.close closes nothing here. The card reaches its own deadline: first request, then three more, then silence.
    const s = await open({ params: launch({ displayMs: 8000 }), handlers: { key: () => {} } });
    await s.painted();
    await s.page.clock.runFor(9500);
    assert.equal(await s.closes(), 1);
    await empty(s.page, 'the box is emptied even though the page stays');
    await s.page.clock.runFor(1500);
    assert.equal(await s.closes(), 4, 'asked again three times, half a second apart');
    await s.page.clock.runFor(60000);
    assert.equal(await s.closes(), 4, 'bounded: no loop on a window that will not close');
    // The page is still there and holds the focus: a key is reported, and asks it to go again at once.
    await key(s.page, { keyCode: 39 });
    assert.equal(await s.closes(), 5, 'the key asks again without waiting for its report');
    await s.until('key');
    await s.page.clock.runFor(150);
    assert.equal(await s.closes(), 6);
    await s.page.clock.runFor(60000);
    assert.equal(await s.closes(), 9, 'bounded again');
    await key(s.page, { keyCode: 13 });
    await s.page.clock.runFor(60000);
    assert.deepEqual([await s.closes(), s.count('key')], [13, 1], 'every key asks again; the report is sent once');
    // Launched again for the next card: it paints nothing, asks for no grant, and asks to go once more.
    const next = { ...launch({ nonce: 'f'.repeat(32) }), card: { ...launch().card, id: 'lot-6', text: 'Second résultat sourcé.' } };
    for (const [event, expected] of [['webOSRelaunch', 17], ['webOSLaunch', 21]]) {
      await s.page.evaluate(([name, detail]) => document.dispatchEvent(new CustomEvent(name, { detail })), [event, next]);
      await s.page.clock.runFor(60000);
      assert.equal(await s.closes(), expected, `${event} asks again, bounded`);
    }
    await empty(s.page, 'a page that is leaving never paints again');
    assert.deepEqual([s.count('ack'), s.count('key')], [1, 1]);
    await s.done();
    // Same thing when the page was leaving before any card (grant refused): the key tripwire still reports.
    const refused = await open({ params: launch(), handlers: { ack: route => route.fulfill({ status: 404, json: {} }) } });
    await waitFor(async () => (await refused.closed()) === 1, 'fermeture après refus');
    await refused.page.clock.runFor(60000);
    assert.equal(await refused.closes(), 4);
    await key(refused.page, { keyCode: 39 });
    await refused.until('key');
    assert.equal(refused.seen.requests.find(r => r.name === 'key').path, `/ambient/key/${NONCE}`);
    await refused.page.clock.runFor(60000);
    assert.ok((await refused.closes()) > 4 && (await refused.closes()) <= 10, 'asked again, bounded');
    await empty(refused.page);
    await refused.done();
  });

  await check('page cachée : fermeture', async () => {
    const s = await open({ params: launch() });
    await s.painted();
    await s.page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange')); });
    assert.equal(await s.closed(), 1);
    await empty(s.page);
    await s.done();
  });

  await check('webOSLaunch et webOSRelaunch : paramètres reçus par évènement, contenu remplacé, nouvel accord, pas de double demande', async () => {
    const second = { ...launch({ nonce: 'f'.repeat(32), box: BOXES['card-low'], displayMs: 20000 }), card: { ...launch().card, id: 'lot-6', text: 'Second résultat sourcé.' } };
    const grants = { [NONCE]: deferred(), ['f'.repeat(32)]: deferred() };
    const s = await open({ handlers: { ack: async (route, url) => { await grants[url.pathname.split('/')[3]].promise; await route.fulfill({ status: 200, json: {} }); } } });
    await s.page.clock.runFor(500);
    await s.page.evaluate(detail => document.dispatchEvent(new CustomEvent('webOSLaunch', { detail })), launch());
    await s.until('ack');
    await s.page.clock.runFor(1200); // past the deadline of the page start: it no longer applies
    assert.equal(await s.closed(), 0);
    grants[NONCE].resolve();
    await s.painted();
    await s.page.evaluate(detail => document.dispatchEvent(new CustomEvent('webOSLaunch', { detail })), JSON.stringify(launch()));
    await new Promise(resolve => setTimeout(resolve, 100));
    assert.equal(s.count('ack'), 1, 'the same nonce is asked once');
    await s.page.clock.runFor(10000);
    await s.page.evaluate(detail => document.dispatchEvent(new CustomEvent('webOSRelaunch', { detail })), second);
    await s.until('ack', 2);
    await empty(s.page, 'the previous card is withdrawn until the new grant');
    grants['f'.repeat(32)].resolve();
    await s.painted();
    assert.match(await s.page.evaluate(() => document.getElementById('ambient').innerText), /Second résultat sourcé\./);
    const found = await pixels(s.page, BOXES['card-low'], 'carte-apres-relance');
    assert.ok(found.painted > 20000 && found.outside === 0);
    await s.page.clock.runFor(10000); // the first card's deadline (15,5 s after its grant) would have fired here
    assert.equal(await s.closed(), 0);
    await s.page.clock.runFor(11500);
    assert.equal(await s.closed(), 1);
    assert.deepEqual(s.seen.requests.filter(r => r.name === 'ack').map(r => r.nonce), [NONCE, 'f'.repeat(32)]);
    await s.done();
    const broken = await open({ params: launch() });
    await broken.painted();
    await broken.page.evaluate(() => document.dispatchEvent(new CustomEvent('webOSRelaunch', { detail: { v: 1, nonce: 'bad' } })));
    assert.equal(await broken.closed(), 1, 'an invalid relaunch closes');
    await empty(broken.page);
    await broken.done();
  });

  await check('pixels : tout pixel non transparent est dans la boîte reçue (quatre boîtes, texte de 600 caractères, avis)', async () => {
    const long = `${'Phrase très longue sans rapport avec la taille de la boîte, répétée pour dépasser trois lignes. '.repeat(7)}`.slice(0, 600);
    const many = Array.from({ length: 3 }, (_, i) => ({ host: `un-nom-de-domaine-particulierement-long-numero-${i}.exemple.fr` }));
    const cases = [
      ['carte-basse', launch({ box: BOXES['card-low'] }), BOXES['card-low']],
      ['carte-600-caracteres', launch({ card: { ...launch().card, text: long, sources: many, more: 99 } }), BOXES['card-raised']],
      ['carte-boite-etroite', launch({ box: { x: 48, y: 780, width: 420, height: 120 } }), { x: 48, y: 780, width: 420, height: 120 }],
      ['pastille-relevee', launch({ element: 'pill', card: undefined, box: BOXES['pill-raised'], displayMs: 4000 }), BOXES['pill-raised']],
      // The sentences the server really words for a lateness: shortened to fit the box whole, cause and number kept.
      ...[['Lecture des passages en échec : 12 passages non lus.', 0, true, 'Lecture en échec · 12 passages non lus'], ['Vérifications en retard : 12 affirmations en attente.', 12, true, 'Vérifications en retard · 12 en attente'],
        ['Lecture en retard : 12 passages à lire.', 0, true, 'Lecture en retard · 12 passages à lire'], ['Lecture rétablie : 12 passages n’ont pas pu être lus.', 0, true, 'Lecture rétablie · 12 passages non lus'],
        ['Lecture des nouveaux passages…', 12, false, 'Lecture des passages… · 12 en attente'],
        // One check running late with nothing queued behind it: the server words a 0, the pill never shows it.
        ['Vérifications en retard : 0 affirmation en attente.', 0, true, 'Vérification en cours · en retard']].map(([label, waiting, late, shown], index) =>
        [`pastille-etat-${index + 1}`, launch({ element: 'pill', card: undefined, box: BOXES['pill-raised'], displayMs: 4000, activity: { label, waiting, late } }), BOXES['pill-raised'], shown]),
      ['pastille-basse', launch({ element: 'pill', card: undefined, box: BOXES['pill-low'], displayMs: 4000, activity: { label: 'Vérifications en retard : 12 affirmations en attente depuis plusieurs minutes, lecture ralentie.', waiting: 12, late: true } }), BOXES['pill-low']],
      ['avis-fin-de-capture', launch({ element: 'notice', activity: undefined, card: { id: 'capture-stopped', kind: 'notice', text: 'Capture arrêtée : la surveillance ne reçoit plus rien. Rakuten pour la relancer.' } }), BOXES['card-raised']],
    ];
    for (const [name, params, box, shown] of cases) {
      const s = await open({ params });
      await s.painted();
      const found = await pixels(s.page, box, name);
      if (shown) {
        assert.equal(await s.page.evaluate(() => document.getElementById('ambient').innerText), shown);
        assert.ok(await s.page.evaluate(() => { const label = document.querySelector('.tvl-pill-label'); return label.scrollWidth <= label.clientWidth; }), `${name}: « ${shown} » tient dans la pastille sans être coupé`);
      }
      assert.ok(found.painted > 3000, `${name}: something is painted (${found.painted} px)`);
      assert.equal(found.outside, 0, `${name}: ${found.outside} px outside the box`);
      assert.equal(await s.page.evaluate(selector => document.querySelectorAll(selector).length, FOCUSABLE), 0);
      if (name === 'carte-600-caracteres') assert.ok(await s.page.evaluate(() => document.querySelector('.tvl-card-text').getBoundingClientRect().height) <= 108, 'three lines at most');
      if (name === 'avis-fin-de-capture') assert.equal(await s.page.evaluate(() => document.getElementById('ambient').innerText), 'TV Lens\nCapture arrêtée : la surveillance ne reçoit plus rien. Rakuten pour la relancer.');
      if (name === 'pastille-relevee') {
        assert.equal(await s.page.evaluate(() => document.getElementById('ambient').innerText), 'Vérification en cours… · 2 en attente');
        assert.ok(await s.page.evaluate(() => { const label = document.querySelector('.tvl-pill-label'); return label.scrollWidth <= label.clientWidth; }), 'the usual pill line is not cut (in this browser, with this font)');
      }
      await s.done();
    }
    // Control of the detector: with the clipping removed and the card pushed up, the same count sees pixels outside.
    const control = await open({ params: launch() });
    await control.painted();
    await control.page.addStyleTag({ content: '#ambient { overflow: visible !important; } .tvl-card { bottom: 200px !important; }' });
    const leaked = await pixels(control.page, BOXES['card-raised']);
    assert.ok(leaked.outside > 10000, `the pixel check sees a card that leaves its box (${leaked.outside} px)`);
    await control.done();
  });

  await check('PalmSystem : région d’entrée vide dans les deux profils, setFocus(false) en passthrough seulement, paramètres lus dans PalmSystem, aucune erreur s’il refuse', async () => {
    const relay = await open({ params: launch(), palm: { carriesParams: true } });
    await relay.painted();
    assert.deepEqual(await relay.page.evaluate(() => window.__palm), [['setInputRegion', '[]']]);
    await relay.done();
    const passthrough = await open({ params: launch({ profile: 'passthrough' }), palm: {} });
    await passthrough.painted();
    assert.deepEqual(await passthrough.page.evaluate(() => window.__palm), [['setInputRegion', '[]'], ['setFocus', false]]);
    await passthrough.done();
    const refusing = await open({ params: launch({ profile: 'passthrough' }), palm: { throws: true } });
    await refusing.painted();
    await refusing.done();
  });

  await check('production : les paramètres de mise au point sont ignorés (pas de peinture sans accord, fermeture à la touche, aucun pixel magenta)', async () => {
    const grant = deferred();
    const noisy = launch({ debug: true, marker: true, freeze: true, probe: { handshake: false, closeOnKey: false, marker: true, freeze: true, noFocus: true, lifeMs: 25000 } });
    const s = await open({ params: noisy, handlers: { ack: async route => { await grant.promise; await route.fulfill({ status: 200, json: {} }); } } });
    await s.until('ack');
    await s.page.clock.runFor(1000);
    await empty(s.page, 'handshake:false does not paint in production');
    grant.resolve();
    await s.painted();
    const found = await pixels(s.page, BOXES['card-raised']);
    assert.equal(found.magenta, 0);
    assert.equal(found.outside, 0);
    await s.page.clock.runFor(2000); // freeze would have blocked the page: its clock still answers
    assert.equal(await s.page.evaluate(() => 1 + 1), 2);
    await key(s.page, { keyCode: 39 });
    await waitFor(async () => (await s.closed()) === 1, 'fermeture à la première touche');
    await s.done();
  });

  await check('paquet de sonde : peint sans accord, compte les touches, marqueur dans la boîte, Retour ferme, fermeture forcée à 25 s', async () => {
    const file = path.join(probeDir, 'ambient-probe.html');
    const probe = { handshake: false, closeOnKey: false, marker: true, lifeMs: 999999 };
    const { control: _control, ...withoutControl } = launch({ displayMs: 20000, probe });
    const s = await open({ params: withoutControl, file });
    await s.painted();
    const found = await pixels(s.page, BOXES['card-raised'], 'sonde-marqueur');
    assert.equal(found.magenta, 48 * 48, 'the 48 px marker is whole');
    assert.equal(found.outside, 0, 'marker and key counter stay inside the box');
    await key(s.page, { keyCode: 39 });
    await key(s.page, { keyCode: 13 });
    assert.equal(await s.page.evaluate(() => document.querySelector('.probe-keys').textContent), 'Touches reçues : 2');
    assert.equal(await s.closed(), 0);
    assert.deepEqual(s.seen.requests, [], 'no controller is called without a handshake');
    await key(s.page, { keyCode: 461 });
    assert.equal(await s.closed(), 1, 'Back always closes the probe');
    await s.done();
    const bounded = await open({ params: withoutControl, file });
    await bounded.painted();
    await bounded.page.clock.runFor(24999);
    assert.equal(await bounded.closed(), 0);
    await bounded.page.clock.runFor(1);
    assert.equal(await bounded.closed(), 1, 'hard life of 25 s whatever lifeMs asks');
    await bounded.done();
    // With its default handshake the probe behaves as production does: nothing before the grant, close on key.
    const grant = deferred();
    const gated = await open({ params: launch({ probe: { marker: true } }), file, handlers: { ack: async route => { await grant.promise; await route.fulfill({ status: 200, json: {} }); } } });
    await gated.until('ack');
    await empty(gated.page, 'the probe with a handshake paints nothing before the grant');
    grant.resolve();
    await gated.painted();
    assert.equal((await pixels(gated.page, BOXES['card-raised'])).magenta, 48 * 48);
    await key(gated.page, { keyCode: 39 });
    await waitFor(async () => (await gated.closed()) === 1, 'fermeture de la sonde à la touche');
    assert.equal(gated.count('key'), 1);
    await gated.done();
  });

  await check('paquet de sonde : paramètres lus comme en production — sans rien au chargement, attente de webOSLaunch ou webOSRelaunch pendant 1,5 s, puis peinture', async () => {
    const file = path.join(probeDir, 'ambient-probe.html');
    const { control: _control, ...params } = launch({ displayMs: 20000, probe: { handshake: false, closeOnKey: false, marker: true } });
    for (const event of ['webOSLaunch', 'webOSRelaunch']) {
      // A TV that hands the parameters over with the event only: nothing at load, neither launchParams nor PalmSystem.
      const s = await open({ file });
      await s.page.clock.runFor(1000);
      assert.equal(await s.closed(), 0, `${event}: the probe waits for its parameters instead of concluding at load`);
      await empty(s.page, 'nothing painted while it waits');
      await s.page.evaluate(([name, detail]) => document.dispatchEvent(new CustomEvent(name, { detail })), [event, params]);
      await s.painted();
      assert.equal((await pixels(s.page, BOXES['card-raised'])).magenta, 48 * 48, `${event}: the probe paints what the event carried`);
      await s.page.clock.runFor(2000); // past the wait of the load: it no longer applies
      assert.equal(await s.closed(), 0);
      // The other event repeats the same launch: one start per nonce, the card and its life are not restarted.
      await s.page.evaluate(() => { window.__card = document.querySelector('.tvl-card'); });
      await s.page.evaluate(([name, detail]) => document.dispatchEvent(new CustomEvent(name, { detail })), [event === 'webOSLaunch' ? 'webOSRelaunch' : 'webOSLaunch', JSON.stringify(params)]);
      assert.equal(await s.page.evaluate(() => document.querySelector('.tvl-card') === window.__card), true, 'the card on screen was not redrawn');
      assert.deepEqual(s.seen.requests, []);
      await s.done();
    }
    // Nothing ever comes: same bounded wait as production, then the probe leaves with nothing painted.
    const silent = await open({ file });
    await silent.page.clock.runFor(1499);
    assert.equal(await silent.closed(), 0);
    await silent.page.clock.runFor(1);
    assert.equal(await silent.closed(), 1);
    await empty(silent.page);
    await silent.done();
    // An event without parameters is read like production reads it: there is nothing to draw, the probe leaves.
    const hollow = await open({ file });
    await hollow.page.evaluate(() => document.dispatchEvent(new CustomEvent('webOSLaunch', { detail: {} })));
    assert.equal(await hollow.closed(), 1);
    await hollow.done();
    // Parameters carried by PalmSystem at load are read at load, as before.
    const palm = await open({ params, file, palm: { carriesParams: true } });
    await palm.painted();
    await palm.done();
  });
} finally {
  const version = browser.version();
  await browser.close();
  fs.rmSync(work, { recursive: true, force: true });
  const failed = results.filter(result => !result.ok);
  fs.writeFileSync(path.join(out, 'smoke-tv-ambient.json'), JSON.stringify({ at: new Date().toISOString(), chrome: version, app, level: 'navigateur de bureau sur copie temporaire — pas la TV', passed: results.length - failed.length, failed: failed.length, results, shots }, null, 2) + '\n');
  console.log(`${failed.length ? 'FAIL' : 'PASS'}: ${results.length - failed.length}/${results.length} vérifications · Chrome ${version} · captures dans ${out}`);
  if (failed.length) process.exitCode = 1;
}
