// End-to-end simulation of the ambient display, without a TV:
//   node scripts/simulate-tv-ambient.mjs [--out <dir>] [--only off,relay,passthrough] [--native <dir>] [--keep]
// The REAL tv/controller.py and tv/ambient.py run on an ephemeral port in a temporary run directory. This
// script plays what the TV provides: a fake `luna-send` ahead in PATH (it logs every call), webOS itself
// (each `launch` opens the real ambient page in headless Chrome with its launch parameters, each
// `closeByAppId` closes it), the mapper relay (key state and status files) and the inference server (two
// sourced cards). The page talks to the real controller with no interception: this is the proof of the
// interface between the native side and the page. It says nothing of the real compositor, focus or remote.
import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const option = name => { const index = process.argv.indexOf(name); return index > 0 ? process.argv[index + 1] : null; };
const out = option('--out') ? path.resolve(option('--out')) : fs.mkdtempSync(path.join(os.tmpdir(), 'tvlens-simulate-tv-ambient-'));
const native = path.resolve(option('--native') || path.join(root, 'tv'));
const only = (option('--only') || 'off,relay,passthrough').split(',');
const keep = process.argv.includes('--keep');
const python = process.env.TVLENS_PYTHON || 'python3';
const chrome = process.env.TVLENS_CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const APP = 'org.tvlens.ambient';
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(test, label, timeoutMs) {
  const started = Date.now();
  for (;;) {
    const value = await test();
    if (value) return value;
    if (Date.now() - started > timeoutMs) throw new Error(`Attente dépassée (${Math.round(timeoutMs / 1000)} s) : ${label}`);
    await sleep(50);
  }
}
const readJson = file => { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; } };
const freePort = () => new Promise((resolve, reject) => { const probe = net.createServer(); probe.once('error', reject); probe.listen(0, '127.0.0.1', () => { const { port } = probe.address(); probe.close(() => resolve(port)); }); });

// Stand-in for the TV's luna-send. Every call is appended to one log; whether the ambient window is "listed"
// is read back from that same log (launch opens it, closeByAppId or the page closing itself removes it).
const FAKE_LUNA = `#!/usr/bin/env python3
import json, os, sys, time
log = os.environ['TVLENS_FAKE_LUNA_LOG']
args = sys.argv[1:]
endpoint = next((a[len('luna://'):] for a in args if a.startswith('luna://')), '')
try: payload = json.loads(args[-1]) if args else {}
except ValueError: payload = {}
listed = set()
try:
    with open(log) as lines:
        for line in lines:
            try: event = json.loads(line)
            except ValueError: continue
            if event['endpoint'].endswith('/launch'): listed.add(event['payload'].get('id'))
            elif event['endpoint'].endswith('/closeByAppId') or event['endpoint'] == 'page-closed': listed.discard(event['payload'].get('id'))
except OSError: pass
with open(log, 'a') as lines:
    lines.write(json.dumps({'at': time.time(), 'mono': time.monotonic(), 'endpoint': endpoint, 'payload': payload}) + '\\n')
if endpoint == 'com.webos.service.videooutput/getStatus':
    full = {'x': 0, 'y': 0, 'width': 3840, 'height': 2160}
    reply = {'returnValue': True, 'video': [{'sink': 'MAIN', 'appId': 'youtube.leanback.v4', 'connected': True, 'context': 'pipeline-1', 'fullScreen': True,
        'displayOutput': full, 'appOutput': full, 'width': 1920, 'height': 1080, 'sourceInput': {'x': 0, 'y': 0, 'width': 1920, 'height': 1080}}]}
elif endpoint == 'com.webos.surfacemanager/getForegroundWindowInfo':
    reply = {'returnValue': True, 'windows': [{'appId': 'youtube.leanback.v4', 'windowType': '_WEBOS_WINDOW_TYPE_CARD'}] + [{'appId': app, 'windowType': '_WEBOS_WINDOW_TYPE_OVERLAY'} for app in sorted(a for a in listed if a)]}
elif endpoint in ('com.webos.applicationManager/launch', 'com.webos.surfacemanager/closeByAppId'):
    reply = {'returnValue': True}
else:
    reply = {'returnValue': False, 'errorText': 'Unknown method'}
# Same shape as the TV: timing mode, answer on stderr, JSON printed across several lines.
sys.stderr.write('timingServiceResponse: ' + json.dumps(reply, indent=4) + '\\n')
`;
// Stand-in for the mapper relay: a live status, a quiet key state, and on request the notice of intent the
// real relay writes at the first key, as soon as it reads a closed gate.
const FAKE_MAPPER = `import json, os, sys, time, uuid
run, status = sys.argv[1], sys.argv[2]
def write(path, value):
    temporary = path + '.' + uuid.uuid4().hex + '.tmp'
    with open(temporary, 'w') as out: out.write(json.dumps(value))
    os.replace(temporary, path)
quiet = time.monotonic() - 60
write(os.path.join(run, 'tvlens-ambient-keys.json'), {'v': 1, 'pid': os.getpid(), 'startedMono': quiet, 'seq': 0, 'down': {}, 'lastEventMono': quiet, 'synDropped': 0})
answered = set()
while True:
    write(status, {'active': True, 'pid': os.getpid(), 'ambientRelay': 2, 'panelYield': 1, 'updatedMono': time.monotonic(), 'updatedAt': time.time()})
    for _ in range(20):
        trigger = os.path.join(run, 'sim-intent-next')
        if os.path.exists(trigger):
            try:
                with open(os.path.join(run, 'tvlens-ambient-gate.json')) as source: gate = json.load(source)
            except (OSError, ValueError): gate = {}
            if gate.get('state') == 'armed' and gate.get('nonce') not in answered:
                answered.add(gate['nonce'])
                write(os.path.join(run, 'tvlens-ambient-dismiss-relay.json'), {'nonce': gate['nonce'], 'phase': 'intent', 'atMono': time.monotonic(), 'code': 106})
                os.remove(trigger)
        time.sleep(.01)
`;

function inferenceServer(token) {
  const state = { polls: 0, cards: [], seq: 0, revision: 1, sessionId: crypto.randomUUID() };
  const server = http.createServer((request, response) => {
    const send = (status, body, headers = {}) => { response.writeHead(status, { 'Content-Type': 'application/json', ...headers }); response.end(body === null ? '' : JSON.stringify(body)); };
    if (request.headers.authorization !== `Bearer ${token}`) return send(401, { error: 'Appareil non authentifié.' });
    if (request.method !== 'GET' || new URL(request.url, 'http://server').pathname !== '/v1/surveillance/overlay') return send(404, { error: 'Route inconnue.' });
    state.polls++;
    const etag = `"sim-overlay-${state.revision}"`;
    if (request.headers['if-none-match'] === etag) return send(304, null, { ETag: etag });
    send(200, { sessionId: state.sessionId, enabled: true, accepting: true, readOnly: false, elapsedMs: 600000,
      activity: { state: 'listening', label: 'Surveillance active.', detecting: false, running: 0, waiting: 0, late: false },
      overlay: { seq: state.seq, cards: state.cards.slice(-5) }, signals: { seq: 0, cards: [] }, storage: { state: 'ok' }, revision: state.revision, serverNowMs: Date.now() }, { ETag: etag });
  });
  const publish = text => {
    const seq = ++state.seq;
    state.cards.push({ id: `lot-${seq}`, kind: 'verification', label: 'Sources consultées', seq, text, claimIds: [`claim-${seq}`], interval: { startMs: seq * 60000, endMs: seq * 60000 + 8000 },
      sources: [{ url: `https://www.insee.fr/fr/statistiques/${seq}`, title: 'Insee', publisher: 'Insee' }, { url: 'https://www.vie-publique.fr/fiches', title: 'Vie publique', publisher: 'Vie publique' }],
      origin: [], assessments: [{ claimId: `claim-${seq}`, assessment: 'supported', label: 'Concorde avec les sources' }], publishedAtMs: 600000, finishedAt: Date.now() });
    state.revision++;
    return `lot-${seq}`;
  };
  return { server, state, publish };
}

async function pass(profile, browser, copy) {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), `tvlens-ambient-sim-${profile}-`));
  const run = path.join(work, 'run'), conf = path.join(work, 'conf'), bin = path.join(work, 'bin'), log = path.join(work, 'luna.log');
  for (const dir of [run, conf, bin]) fs.mkdirSync(dir, { mode: 0o700 });
  fs.writeFileSync(log, '');
  fs.writeFileSync(path.join(bin, 'luna-send'), FAKE_LUNA, { mode: 0o755 });
  fs.writeFileSync(path.join(work, 'mapper.py'), FAKE_MAPPER);
  const token = crypto.randomBytes(32).toString('hex');
  const inference = inferenceServer(token);
  await new Promise(resolve => inference.server.listen(0, '127.0.0.1', resolve));
  const port = await freePort(), control = `http://127.0.0.1:${port}`;
  fs.writeFileSync(path.join(conf, 'connection.json'), JSON.stringify({ url: `http://127.0.0.1:${inference.server.address().port}`, token }), { mode: 0o600 });
  fs.writeFileSync(path.join(conf, 'ambient.json'), JSON.stringify({ focus: profile, fallback: 'off', app: APP, settleMs: 700, closeVia: 'surface', trial: false, mapperStatus: path.join(run, 'mapper-status.json') }), { mode: 0o600 });
  const env = { ...process.env, PATH: `${bin}${path.delimiter}${process.env.PATH}`, TVLENS_AMBIENT_RUN: run, TVLENS_FAKE_LUNA_LOG: log, PYTHONDONTWRITEBYTECODE: '1' };
  const errors = fs.openSync(path.join(work, 'controller.stderr.txt'), 'w');
  const children = [];
  const controller = spawn(python, [path.join(native, 'controller.py'), '--config', path.join(conf, 'connection.json'), '--port', String(port),
    '--capture-report', path.join(run, 'capture-report.json'), '--capture-lock', path.join(run, 'capture.lock')], { env, stdio: ['ignore', 'ignore', errors] });
  children.push(controller);
  const api = async (route, method = 'GET') => {
    const response = await fetch(control + route, { method, headers: { Authorization: `Bearer ${token}` } });
    return { status: response.status, body: await response.json() };
  };
  const events = () => fs.readFileSync(log, 'utf8').split('\n').filter(Boolean).map(line => { try { return JSON.parse(line); } catch { return null; } }).filter(Boolean);
  const gate = () => readJson(path.join(run, 'tvlens-ambient-gate.json')) || { state: 'absent' };
  const launches = [], foreign = [], notes = [];
  let handled = 0, stop = false, opened = null, generation = '';
  const closePage = async (record, by) => {
    if (!record || record.closedBy) return;
    record.closedBy = by;
    record.closedAt = Date.now();
    if (by === 'page') fs.appendFileSync(log, JSON.stringify({ at: Date.now() / 1000, endpoint: 'page-closed', payload: { id: APP } }) + '\n');
    await record.page.close().catch(() => {});
    if (opened === record) opened = null;
  };
  // webOS, played by this script: one page per launch, closed when the surface manager is asked to.
  const webos = (async () => {
    while (!stop) {
      const all = events();
      for (; handled < all.length; handled++) {
        const event = all[handled];
        if (event.endpoint === 'com.webos.applicationManager/launch') {
          const params = event.payload.params || {}, armed = gate();
          const record = { nonce: params.nonce, element: params.element, id: params.card ? params.card.id : null, profile: params.profile, box: params.box, displayMs: params.displayMs, control: params.control,
            launchMono: event.mono, gateAtLaunch: { state: armed.state, nonce: armed.nonce, armedMono: armed.armedMono }, painted: null, ack: null, requests: [], palm: [], closedBy: null };
          launches.push(record);
          if (opened) await closePage(opened, 'relaunch');
          const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
          record.page = page;
          opened = record;
          await page.exposeFunction('__tvlensClose', () => { closePage(record, 'page'); });
          await page.exposeFunction('__tvlensPainted', text => {
            if (record.painted) return;
            const now = gate();
            record.painted = { text, gate: { state: now.state, nonce: now.nonce, shownMono: now.shownMono, armedMono: now.armedMono } };
            // Once the entry animation is over; the page may already be gone if a close came first.
            record.shot = `simulation-${profile}-${launches.indexOf(record) + 1}.png`;
            setTimeout(() => { page.screenshot({ path: path.join(out, record.shot), omitBackground: true }).catch(() => { record.shot = null; }); }, 400);
          });
          await page.exposeFunction('__tvlensPalm', call => { record.palm.push(call); });
          page.on('request', request => { const url = request.url(); if (url.startsWith('file:')) return; if (url.startsWith(`${control}/ambient/`)) record.requests.push(`${request.method()} ${new URL(url).pathname.split('/').slice(0, 3).join('/')}`); else foreign.push(url); });
          page.on('response', response => { if (response.url().startsWith(`${control}/ambient/ack/`)) record.ack = response.status(); });
          page.on('pageerror', error => notes.push(`erreur de page (${record.id || record.element}) : ${error.message}`));
          await page.addInitScript(value => {
            window.launchParams = value;
            window.close = () => window.__tvlensClose();
            window.PalmSystem = { launchParams: value, setInputRegion: region => window.__tvlensPalm('setInputRegion ' + JSON.stringify(region)), window: { setFocus: flag => window.__tvlensPalm('setFocus ' + flag) } };
            document.addEventListener('DOMContentLoaded', () => {
              const node = document.getElementById('ambient');
              const look = () => { if (!node.hidden && node.children.length) window.__tvlensPainted(node.innerText); };
              new MutationObserver(look).observe(node, { childList: true, attributes: true, subtree: true });
              look();
            });
          }, JSON.stringify(params));
          await page.goto(pathToFileURL(path.join(copy, 'ambient.html')).href).catch(() => {});
        } else if (event.endpoint === 'com.webos.surfacemanager/closeByAppId' && event.payload.id === APP) {
          // The request is dated even when the page has already left by itself (its long poll answers first).
          const target = launches.at(-1);
          if (target && target.closeMono === undefined) target.closeMono = event.mono;
          if (opened) await closePage(opened, 'closeByAppId');
        }
      }
      await sleep(40);
    }
  })();
  const result = { profile, checks: [], launches: [], state: null, luna: {} };
  const check = (name, test) => { try { test(); result.checks.push({ name, ok: true }); } catch (error) { result.checks.push({ name, ok: false, error: error.message.split('\n').slice(0, 4).join(' | ') }); } };
  try {
    await until(async () => { try { return (await api('/ambient')).status === 200; } catch { return false; } }, 'contrôleur local prêt', 15000);
    const mapper = profile === 'off' ? null : spawn(python, [path.join(work, 'mapper.py'), run, path.join(run, 'mapper-status.json')], { env, stdio: 'ignore' });
    if (mapper) children.push(mapper);
    assert.equal((await api('/ambient/display/8', 'POST')).status, 200);
    const started = await api('/ambient/start', 'POST');
    assert.equal(started.status, 200);
    // Read while the supervisor lives: it names the detached watchdog to look for at the end.
    generation = await until(() => { try { return fs.readFileSync(path.join(run, 'tvlens-ambient-generation'), 'utf8').trim(); } catch { return ''; } }, 'superviseur démarré', 15000);
    // First reading of the session: the supervisor places its cursor. The cards are published after it.
    await until(() => inference.state.polls >= 1, 'première lecture du serveur par le superviseur', 20000);
    await sleep(300);
    inference.publish('Le taux annoncé concorde avec la dernière publication trimestrielle.');
    inference.publish('La comparaison avec 2019 est juste, à deux dixièmes près.');
    const counts = async () => { const state = (await api('/ambient')).body.state || {}; return { ...(state.counts || {}), status: state.status, reason: state.reason, queue: state.queue }; };
    if (profile === 'off') {
      await until(async () => (await counts()).notShown === 2, 'deux cartes comptées non montrées (lecture toutes les 10 s en profil off)', 45000);
      const test = await api('/ambient/test', 'POST');
      await sleep(1500);
      const status = (await api('/ambient')).body, luna = events();
      check('profil off : aucun lancement, aucune fermeture demandée', () => assert.deepEqual(luna.filter(e => /launch|closeByAppId|createToast/.test(e.endpoint)), []));
      check('profil off : deux cartes comptées non montrées, aucune affichée', () => assert.deepEqual([status.state.counts.notShown, status.state.counts.shown], [2, 0]));
      check('profil off : état désactivé, raison profile-off, message en clair', () => { assert.deepEqual([status.state.status, status.state.reason, status.state.focus], ['disabled', 'profile-off', 'off']); assert.match(status.state.message, /validation native/); });
      check('profil off : la porte n’est jamais fermée', () => assert.ok(['absent', 'clear'].includes(gate().state)));
      check('profil off : carte d’essai refusée', () => assert.deepEqual(test.body, { queued: false, reason: 'profile-off' }));
      // Declarations of the panel, through the real route and the real file. Done right after a reading of the
      // server by the supervisor, so that the next one (ten seconds later) cannot fall in the middle.
      const polls = inference.state.polls, other = crypto.randomUUID(), session = inference.state.sessionId;
      await until(() => inference.state.polls > polls, 'lecture suivante du serveur', 30000);
      // A late word of another session, and the route of an earlier panel (no session): both name a number
      // this session is about to reach.
      const strangers = [await api(`/ambient/seen/${other}/overlay/5`, 'POST'), await api('/ambient/seen/overlay/5', 'POST')];
      for (const text of ['Troisième résultat.', 'Quatrième résultat.', 'Cinquième résultat.']) inference.publish(text);
      // The panel of this session showed the third and the fourth itself.
      const declared = await api(`/ambient/seen/${session}/overlay/4`, 'POST');
      await until(async () => ((await api('/ambient')).body.state.cursor || {}).overlay === 5, 'curseur sur le cinquième résultat', 45000);
      const after = (await api('/ambient')).body.state, file = readJson(path.join(run, 'tvlens-ambient-seen.json')) || {};
      check('déclarations : routes acceptées (200), chacune rangée sous sa session, rien d’écrit sans session', () => {
        assert.deepEqual([...strangers, declared].map(answer => [answer.status, answer.body]), [[200, {}], [200, {}], [200, {}]]);
        assert.deepEqual(Object.fromEntries(Object.entries(file.sessions || {}).map(([id, record]) => [id, record.overlay])), { [other]: 5, [session]: 4 });
      });
      check('déclarations : celle de la session lue est crue (3 et 4 non comptés), celle d’une autre session et celle sans session ne masquent rien (5 compté)', () =>
        assert.deepEqual([after.sessionId, after.cursor.overlay, after.counts.notShown, after.counts.shown], [session, 5, 3, 0]));
    } else {
      await until(async () => { const c = await counts(); return c.shown === 2 && c.status !== 'showing' && c.status !== 'arming'; }, 'deux cartes affichées puis refermées', 120000);
      await until(() => gate().state === 'clear' && !opened, 'porte rouverte après la seconde carte', 20000);
      if (profile === 'relay') {
        // A key during the flight of a launch: the relay's notice exists before the page asks, so the page is never granted.
        fs.writeFileSync(path.join(run, 'sim-intent-next'), '');
        inference.publish('Troisième résultat, publié pendant une touche.');
        await until(async () => (await counts()).shown === 3 && !opened && gate().state === 'clear', 'lancement abandonné sur avis du relais, puis carte réaffichée', 120000);
      }
      const shownIds = launches.filter(l => l.painted && l.element === 'card').map(l => l.id);
      check('les cartes publiées sont affichées dans l’ordre, une fois chacune', () => assert.deepEqual(shownIds, profile === 'relay' ? ['lot-1', 'lot-2', 'lot-3'] : ['lot-1', 'lot-2']));
      check('porte fermée avant chaque lancement (armed, même nonce, armedMono ≤ launch)', () => { for (const l of launches) { assert.equal(l.gateAtLaunch.nonce, l.nonce); assert.ok(['armed', 'shown', 'closing'].includes(l.gateAtLaunch.state), `${l.id}: ${l.gateAtLaunch.state}`); assert.ok(l.gateAtLaunch.armedMono <= l.launchMono); } });
      check('la page ne peint qu’après l’accord du vrai contrôleur (ack 200, porte shown pour son nonce)', () => { for (const l of launches.filter(l => l.painted)) { assert.equal(l.ack, 200, `${l.id}: ack ${l.ack}`); assert.deepEqual([l.painted.gate.state, l.painted.gate.nonce], ['shown', l.nonce]); assert.ok(l.painted.gate.shownMono >= l.launchMono); } });
      check('durée : fermeture demandée entre displayMs et displayMs + 3 s après l’accord', () => { for (const l of launches.filter(l => l.painted)) { assert.ok(l.closeMono !== undefined, `${l.id}: aucune fermeture demandée`); const shown = l.closeMono - l.painted.gate.shownMono; assert.ok(shown >= l.displayMs / 1000 - 0.3 && shown <= l.displayMs / 1000 + 3, `${l.id}: ${shown.toFixed(2)} s pour ${l.displayMs} ms`); } });
      check('chaque page n’appelle que le contrôleur local : ack puis wait', () => { assert.deepEqual(foreign, []); for (const l of launches.filter(l => l.painted)) assert.deepEqual(l.requests.slice(0, 2), ['POST /ambient/ack', 'GET /ambient/wait']); });
      check('contenu : hôtes seulement, jamais d’URL ni de verdict', () => { for (const l of launches.filter(l => l.painted && l.element === 'card')) { assert.match(l.painted.text, /Sources : insee\.fr · vie-publique\.fr/); assert.doesNotMatch(l.painted.text, /https?:|www\.|Concorde|Contredit/); } });
      check(profile === 'passthrough' ? 'passthrough : setInputRegion([]) et setFocus(false) demandés' : 'relay : setInputRegion([]) demandé, jamais setFocus', () => { for (const l of launches.filter(l => l.painted)) assert.deepEqual(l.palm, profile === 'passthrough' ? ['setInputRegion []', 'setFocus false'] : ['setInputRegion []']); });
      if (profile === 'relay') {
        const aborted = launches.filter(l => !l.painted);
        check('touche pendant le lancement : accord refusé par le vrai contrôleur, page jamais peinte, fermée seule ou par le superviseur', () => { assert.ok(aborted.length >= 1, 'un lancement abandonné attendu'); for (const l of aborted) { assert.notEqual(l.ack, 200); assert.ok(l.closedBy, `${l.id} encore ouverte`); } assert.equal(aborted.at(-1).id, 'lot-3'); });
      }
      const status = (await api('/ambient')).body;
      check('aucune anomalie de focus déclarée, aucune touche perdue', () => assert.deepEqual([status.state.sticky, status.state.counts.keysLostToPage, status.state.counts.closedUnexpectedly, status.state.counts.unconfirmed], [null, 0, 0, 0]));
    }
    const stopped = await api('/ambient/stop', 'POST');
    assert.equal(stopped.status, 200);
    await until(async () => !(await api('/ambient')).body.active, 'superviseur arrêté', 20000);
    check('arrêt : porte rouverte, aucune page à l’écran', () => { assert.ok(['absent', 'clear'].includes(gate().state), gate().state); assert.equal(opened, null); });
    result.state = (await api('/ambient')).body.state;
  } catch (error) {
    result.checks.push({ name: 'déroulé de la passe', ok: false, error: error.message.split('\n').slice(0, 4).join(' | ') });
    result.state = readJson(path.join(run, 'tvlens-ambient-state.json'));
  } finally {
    stop = true;
    await webos.catch(() => {});
    if (opened) await closePage(opened, 'end');
    for (const child of children.reverse()) { child.kill('SIGTERM'); }
    await Promise.all(children.map(child => new Promise(resolve => { if (child.exitCode !== null || child.signalCode) return resolve(); const timer = setTimeout(() => { child.kill('SIGKILL'); resolve(); }, 20000); child.once('exit', () => { clearTimeout(timer); resolve(); }); })));
    fs.closeSync(errors);
    await new Promise(resolve => inference.server.close(resolve));
    // The watchdog is detached on purpose; it leaves by itself once the supervisor has gone. It is looked for by its exact command line.
    const watchdog = () => (generation ? spawnSync('ps', ['-axo', 'pid=,command='], { encoding: 'utf8' }).stdout.split('\n').filter(line => line.includes(`ambient.py watchdog ${generation}`)) : []);
    await until(() => watchdog().length === 0, 'chien de garde sorti', 25000).catch(() => { for (const line of watchdog()) { notes.push(`chien de garde encore vivant, arrêté : ${line.trim()}`); process.kill(Number(line.trim().split(/\s+/)[0]), 'SIGTERM'); } });
    const luna = events();
    for (const event of luna) result.luna[event.endpoint] = (result.luna[event.endpoint] || 0) + 1;
    result.launches = launches.map(({ page, ...rest }) => rest);
    result.notes = notes;
    const stderr = fs.readFileSync(path.join(work, 'controller.stderr.txt'), 'utf8').trim();
    if (stderr) result.controllerStderr = stderr.split('\n').slice(-12);
    if (keep) result.work = work; else fs.rmSync(work, { recursive: true, force: true });
  }
  result.passed = result.checks.length > 0 && result.checks.every(c => c.ok);
  return result;
}

for (const file of ['controller.py', 'ambient.py', 'luna.py']) {
  if (!fs.existsSync(path.join(native, file))) { console.error(`Lot natif absent (${path.join(native, file)}) : simulation NON exécutée.`); process.exit(2); }
}
fs.mkdirSync(out, { recursive: true });
const staging = fs.mkdtempSync(path.join(os.tmpdir(), 'tvlens-ambient-sim-app-'));
// Temporary copy of the application, without the pairing secret.
const copy = path.join(staging, 'app');
fs.cpSync(path.join(root, 'tv', 'app'), copy, { recursive: true, filter: source => path.basename(source) !== 'connection.js' });
let browser;
try {
  browser = await chromium.launch({ executablePath: chrome, headless: true });
} catch (error) {
  console.error(`Navigateur non lancé (${chrome}) : ${error.message.split('\n')[0]}\nSimulation NON exécutée.`);
  fs.rmSync(staging, { recursive: true, force: true });
  process.exit(2);
}
const passes = [];
try {
  for (const profile of ['off', 'relay', 'passthrough'].filter(name => only.includes(name))) {
    console.log(`— passe ${profile} —`);
    const result = await pass(profile, browser, copy);
    passes.push(result);
    for (const item of result.checks) console.log(`${item.ok ? 'ok  ' : 'FAIL'} ${item.name}${item.ok ? '' : `\n     ${item.error}`}`);
    for (const note of result.notes || []) console.log(`     note : ${note}`);
  }
} finally {
  const version = browser.version();
  await browser.close();
  fs.rmSync(staging, { recursive: true, force: true });
  const failed = passes.filter(result => !result.passed);
  fs.writeFileSync(path.join(out, 'simulate-tv-ambient.json'), JSON.stringify({ at: new Date().toISOString(), chrome: version, native, level: 'simulation : vrai contrôleur et vrai superviseur, faux Luna, faux mapper, faux serveur, Chrome de bureau — pas la TV', passes }, null, 2) + '\n');
  console.log(`${failed.length || !passes.length ? 'FAIL' : 'PASS'}: ${passes.length - failed.length}/${passes.length} passes · rapport ${path.join(out, 'simulate-tv-ambient.json')}`);
  if (failed.length || !passes.length) process.exitCode = 1;
}
