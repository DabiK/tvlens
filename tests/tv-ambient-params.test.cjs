const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { parseAmbientParams } = require('../tv/app/surveillance-overlay.js');

const nonce = '0123456789abcdef0123456789abcdef';
// The launch parameters of tv-ambient-design.md §5.3, as the native supervisor sends them.
const launch = (extra = {}) => ({
  v: 1, nonce, control: 'http://127.0.0.1:8788', element: 'card', profile: 'relay',
  box: { x: 48, y: 628, width: 760, height: 272 }, displayMs: 14000,
  card: { id: 'lot-5', kind: 'verification', label: 'Sources consultées', text: 'Le taux annoncé concorde avec la dernière publication.',
    interval: { startMs: 776000, endMs: 784000 }, sources: [{ title: 'Insee', host: 'insee.fr' }], claimCount: 2, more: 1 },
  activity: { label: 'Vérification en cours…', waiting: 2, late: false },
  ...extra,
});
const parsed = {
  v: 1, nonce, control: 'http://127.0.0.1:8788', element: 'card', profile: 'relay',
  box: { x: 48, y: 628, width: 760, height: 272 }, displayMs: 14000,
  card: { id: 'lot-5', kind: 'verification', label: 'Sources consultées', text: 'Le taux annoncé concorde avec la dernière publication.',
    interval: { startMs: 776000, endMs: 784000 }, sources: [{ host: 'insee.fr' }], claimCount: 2, more: 1 },
  activity: { label: 'Vérification en cours…', waiting: 2, late: false },
};

test('valid launch parameters are accepted as an object and as the JSON string webOS hands over', () => {
  assert.deepEqual(parseAmbientParams(launch()), parsed);
  assert.deepEqual(parseAmbientParams(JSON.stringify(launch())), parsed);
  assert.deepEqual(parseAmbientParams(launch({ profile: 'passthrough' })), { ...parsed, profile: 'passthrough' });
});

test('anything the page must not act on is refused as a whole: nothing to paint', () => {
  const refused = {
    'unknown version': launch({ v: 2 }), 'version as text': launch({ v: '1' }), 'no version': launch({ v: undefined }),
    'short nonce': launch({ nonce: nonce.slice(1) }), 'nonce with a path': launch({ nonce: '../../capture/start0000000000000000' }), 'nonce not hex': launch({ nonce: 'z'.repeat(32) }), 'nonce in capitals (the controller only compares lower case)': launch({ nonce: nonce.toUpperCase() }),
    'remote control': launch({ control: 'http://192.168.1.20:8788' }), 'named host': launch({ control: 'http://localhost:8788' }), 'https': launch({ control: 'https://127.0.0.1:8788' }),
    'no port': launch({ control: 'http://127.0.0.1' }), 'trailing path': launch({ control: 'http://127.0.0.1:8788/x' }), 'userinfo trick': launch({ control: 'http://127.0.0.1:8788@evil.example' }),
    'port zero': launch({ control: 'http://127.0.0.1:0' }), 'port too high': launch({ control: 'http://127.0.0.1:70000' }), 'no control': launch({ control: undefined }),
    'unknown element': launch({ element: 'toast' }), 'unknown profile': launch({ profile: 'off' }),
    'box off screen right': launch({ box: { x: 1200, y: 628, width: 760, height: 272 } }), 'box off screen bottom': launch({ box: { x: 48, y: 900, width: 760, height: 272 } }),
    'negative box': launch({ box: { x: -1, y: 628, width: 760, height: 272 } }), 'fractional box': launch({ box: { x: 48.5, y: 628, width: 760, height: 272 } }),
    'empty box': launch({ box: { x: 48, y: 628, width: 0, height: 272 } }), 'no box': launch({ box: null }),
    'text too long': launch({ card: { ...launch().card, text: 'x'.repeat(601) } }), 'empty text': launch({ card: { ...launch().card, text: '  ' } }), 'no card': launch({ card: null }),
    // T7: a video signal is never an overlay card, and a card without a source is not a result.
    'signal card': launch({ card: { ...launch().card, kind: 'signal', label: 'Repéré dans la vidéo' } }), 'unsourced card': launch({ card: { ...launch().card, sources: [] } }),
    'source without host': launch({ card: { ...launch().card, sources: [{ title: 'Insee' }] } }), 'notice dressed as a result': launch({ element: 'notice' }),
    'result dressed as a notice': launch({ card: { ...launch().card, kind: 'notice' } }), 'pill without activity': launch({ element: 'pill', activity: null }),
  };
  for (const [name, value] of Object.entries(refused)) {
    assert.equal(parseAmbientParams(value), null, name);
    assert.equal(parseAmbientParams(JSON.stringify(value)), null, `${name} (string)`);
  }
  for (const value of [undefined, null, '', '{}', '{', 'null', '[]', [], 42, JSON.stringify(launch()) + ' '.repeat(16000)]) assert.equal(parseAmbientParams(value), null);
});

test('bounds: the page caps the display time and takes a box that touches the screen edge', () => {
  const display = value => parseAmbientParams(launch({ displayMs: value })).displayMs;
  assert.equal(display(999999), 20000);
  assert.equal(display(20000), 20000);
  assert.equal(display(8000), 8000);
  assert.equal(display(4000), 4000, 'a brief pill keeps its own duration');
  assert.equal(display(10), 1000);
  assert.equal(display(-5), 14000);
  assert.equal(display('8000'), 14000, 'a mistyped setting falls back to the default');
  assert.equal(display(undefined), 14000);
  assert.deepEqual(parseAmbientParams(launch({ box: { x: 1160, y: 808, width: 760, height: 272 } })).box, { x: 1160, y: 808, width: 760, height: 272 });
  assert.equal(parseAmbientParams(launch({ box: { x: 1161, y: 808, width: 760, height: 272 } })), null);
  assert.equal(parseAmbientParams(launch({ card: { ...launch().card, text: 'x'.repeat(600) } })).card.text.length, 600);
  assert.equal(parseAmbientParams(launch({ control: 'http://127.0.0.1:65535' })).control, 'http://127.0.0.1:65535');
  const many = parseAmbientParams(launch({ card: { ...launch().card, sources: [{ host: 'www.Insee.fr' }, { host: 'https://lemonde.fr/article?id=3' }, { host: 'a.fr' }, { host: 'b.fr' }, { host: 'insee.fr' }] } }));
  assert.deepEqual(many.card.sources, [{ host: 'insee.fr' }, { host: 'lemonde.fr' }, { host: 'a.fr' }], 'hosts only, three at most');
});

test('pill and notice carry only what they draw', () => {
  const pill = parseAmbientParams(launch({ element: 'pill', card: undefined, box: { x: 48, y: 844, width: 440, height: 56 }, displayMs: 4000, activity: { label: 'Vérification en cours…', waiting: 3, late: false, state: 'verifying' } }));
  assert.deepEqual(pill, { v: 1, nonce, control: 'http://127.0.0.1:8788', element: 'pill', profile: 'relay', box: { x: 48, y: 844, width: 440, height: 56 }, displayMs: 4000, card: null,
    activity: { label: 'Vérification en cours…', waiting: 3, late: false } });
  const notice = parseAmbientParams(launch({ element: 'notice', activity: undefined, card: { id: 'capture-stopped', kind: 'notice', text: 'Capture arrêtée : la surveillance ne reçoit plus rien. Rakuten pour la relancer.', sources: [{ host: 'insee.fr' }] } }));
  assert.deepEqual(notice.card, { id: 'capture-stopped', kind: 'notice', label: '', text: 'Capture arrêtée : la surveillance ne reçoit plus rien. Rakuten pour la relancer.', interval: null, sources: [], claimCount: 0, more: 0 });
  assert.equal(notice.activity, null);
});

test('debug, marker, freeze, probe and every unknown field are dropped by the production parser', () => {
  const noisy = launch({ debug: true, marker: true, freeze: true, probe: { handshake: false, closeOnKey: false, marker: true, freeze: true, noFocus: true, lifeMs: 25000 },
    handshake: false, closeOnKey: false, token: 'secret-token', url: 'https://example.org',
    card: { ...launch().card, debug: true, marker: true, url: 'https://example.org/x', sources: [{ title: 'Insee', host: 'insee.fr', url: 'https://www.insee.fr/secret?token=1', marker: true }] },
    box: { x: 48, y: 628, width: 760, height: 272, marker: true }, activity: { label: 'Vérification en cours…', waiting: 2, late: false, freeze: true } });
  const out = parseAmbientParams(noisy);
  assert.deepEqual(out, parsed);
  assert.doesNotMatch(JSON.stringify(out), /debug|marker|freeze|probe|handshake|closeOnKey|token|example\.org|https:/);
});

test('the production package carries no probe file and the probe package never takes the production id', async t => {
  const { assemble, PRODUCTION_ID, PROBE_ID } = await import(pathToFileURL(path.resolve(__dirname, '../scripts/package-tv-ambient.mjs')).href);
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tvlens-ambient-pkg-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const production = assemble({ dir: path.join(root, 'production') });
  assert.equal(PRODUCTION_ID, 'org.tvlens.ambient');
  assert.deepEqual(fs.readdirSync(production.dir).sort(), ['ambient.css', 'ambient.html', 'ambient.js', 'appinfo.json', 'icon.png', 'surveillance-overlay.js']);
  const info = JSON.parse(fs.readFileSync(path.join(production.dir, 'appinfo.json'), 'utf8'));
  assert.deepEqual([info.id, info.main, info.defaultWindowType, info.transparent, info.visible], ['org.tvlens.ambient', 'ambient.html', 'overlay', true, false]);
  assert.notEqual(info.id, JSON.parse(fs.readFileSync(path.resolve(__dirname, '../tv/app/appinfo.json'), 'utf8')).id, 'never the panel application');
  for (const name of fs.readdirSync(production.dir).filter(n => /\.(js|html|css|json)$/.test(n)))
    assert.doesNotMatch(fs.readFileSync(path.join(production.dir, name), 'utf8'), /probe|marker|freeze|debug|handshake|closeOnKey|connection\.js|remote-client/i, `${name} carries no debugging path`);
  const probe = assemble({ dir: path.join(root, 'probe'), probe: true, windowType: 'floating', id: `${PROBE_ID}.floating` });
  assert.deepEqual(fs.readdirSync(probe.dir).sort(), ['ambient-probe.html', 'ambient-probe.js', 'ambient.css', 'appinfo.json', 'icon.png', 'surveillance-overlay.js']);
  const probeInfo = JSON.parse(fs.readFileSync(path.join(probe.dir, 'appinfo.json'), 'utf8'));
  assert.deepEqual([probeInfo.id, probeInfo.main, probeInfo.defaultWindowType], ['org.tvlens.ambientprobe.floating', 'ambient-probe.html', 'floating']);
  assert.match(fs.readFileSync(path.join(probe.dir, 'ambient-probe.js'), 'utf8'), /probe\.marker|closeOnKey/);
  assert.throws(() => assemble({ dir: path.join(root, 'a'), probe: true, id: PRODUCTION_ID }), /sonde/);
  assert.throws(() => assemble({ dir: path.join(root, 'b'), id: PROBE_ID }), /sonde/);
  assert.throws(() => assemble({ dir: path.join(root, 'c'), probe: true, id: 'org.tvlens.sidebarprobe' }), /sonde/);
  assert.throws(() => assemble({ dir: path.join(root, 'd'), windowType: 'popup' }), /fenêtre/);
  assert.throws(() => assemble({ dir: path.join(root, 'e'), id: 'org.tvlens.other' }), /identifiant/i);
});
