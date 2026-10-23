const { test } = require('node:test');
const assert = require('node:assert/strict');
const { pause, deferred, until: waitUntil, bounded, tick } = require('./helpers/wait.cjs');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const Module = require('node:module');
const { EventEmitter } = require('node:events');
const { createHash, randomUUID } = require('node:crypto');
const sharp = require('sharp');
const { shape } = require('./helpers/source-shape.cjs');
const { emptyArchive } = require('./helpers/empty-archive.cjs');
const { createCaptureSources } = require('../app/capture-sources.cjs');

// Le vrai hôte et le vrai preload communiquent avec Electron simulé : agents contrôlés, disque temporaire
// et minuteries virtuelles. La fenêtre native, la capture matérielle et le renderer ne sont pas exercés.
const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const mainSource = read('app/main.cjs'), preloadSource = read('app/preload.cjs');
const SESSION = '0f8fad5b-d9cb-469f-a165-70867728950e';

// Section 5.2 of the mission contract: bridge method, sample call, channel and payload sent to the host.
const CONTRACT_CALLS = [
  ['setupStatus', [], 'setup:status', []],
  ['setupChoose', ['whisperModel'], 'setup:choose', ['whisperModel']],
  ['setupAction', ['permissions'], 'setup:action', ['permissions']],
  ['surveillanceState', [], 'surveillance:state', []],
  ['surveillanceHistory', [], 'surveillance:history', []],
  ['startSurveillance', [{ instruction: 'Vérifie les chiffres annoncés.', frequencySeconds: 30 }], 'surveillance:start', [{ instruction: 'Vérifie les chiffres annoncés.' }]],
  ['stopSurveillance', [], 'surveillance:stop', []],
  ['retrySurveillanceClaim', ['claim-3'], 'surveillance:retry', ['claim-3']],
  ['openSurveillanceSource', ['lot-2', 1], 'surveillance:open-source', [{ lotId: 'lot-2', index: 1 }]],
  ['sessions', [], 'sessions:list', []],
  ['openSession', [SESSION], 'sessions:open', [SESSION]],
  ['resumeSession', [], 'sessions:resume', []],
  ['deleteSession', [SESSION], 'sessions:delete', [SESSION]],
  ['storage', [], 'sessions:storage', []],
];
const CONTRACT_EVENTS = { onSurveillance: 'surveillance:state', onSessionsChanged: 'sessions:changed', onStorage: 'storage:state' };
const RETIRED = ['autoState', 'startAuto', 'stopAuto', 'openAutoSource', 'onAuto'];
// Méthodes que le pont doit continuer d’offrir : référence du contrat pour les canaux conservés.
const KEPT = ['freezeMoment', 'explainMoment', 'reexamineMoment', 'catchUp', 'markAttention', 'momentShortcuts', 'onExplainMoment', 'recapState', 'onRecap',
  'keepMoment', 'savedMoments', 'removeSaved', 'searchMoments', 'viewingSettings', 'saveViewingSettings', 'quota', 'onSaved', 'onSaveError', 'windowMode', 'modelChoices',
  'models', 'saveModels', 'openChatSource', 'config', 'importConfig', 'newSession', 'onReset', 'start', 'ingest', 'stop', 'ask', 'deepen', 'deepState', 'researchBudget',
  'cancelDeep', 'onDeepState', 'verify', 'verificationState', 'cancelVerification', 'openSource', 'onVerificationState', 'state', 'onState'];

// The real preload, given a contextBridge and an ipcRenderer of ours.
function loadBridge(invoke = async () => undefined) {
  const exposed = {}, invoked = [], listeners = new Map();
  const ipcRenderer = {
    invoke: (channel, ...args) => { invoked.push({ channel, args }); return invoke(channel, ...args); },
    on: (channel, callback) => { listeners.set(channel, [...(listeners.get(channel) || []), callback]); },
    removeListener: (channel, callback) => { listeners.set(channel, (listeners.get(channel) || []).filter(item => item !== callback)); },
  };
  new Function('require', preloadSource)(name => {
    assert.equal(name, 'electron');
    return { contextBridge: { exposeInMainWorld: (key, api) => { exposed[key] = api; } }, ipcRenderer };
  });
  return { ...exposed, invoked, listeners, deliver: (channel, value) => (listeners.get(channel) || []).forEach(callback => callback({ sender: 'ipc-event' }, value)) };
}

test('the bridge exposes exactly the names of the contract, on its channels, and says errors in the host’s own words', async () => {
  const bridge = loadBridge();
  assert.deepEqual(Object.keys(bridge.tvlens).sort(), [...KEPT, ...CONTRACT_CALLS.map(([name]) => name), ...Object.keys(CONTRACT_EVENTS)].sort());
  assert.deepEqual(Object.keys(bridge.capture).sort(), ['select', 'settings', 'sources']);
  for (const name of RETIRED) assert.equal(bridge.tvlens[name], undefined, name);
  for (const [name, args, channel, payload] of CONTRACT_CALLS) {
    bridge.invoked.length = 0;
    await bridge.tvlens[name](...args);
    assert.deepEqual(bridge.invoked, [{ channel, args: payload }], name);
  }
  for (const [name, channel] of Object.entries(CONTRACT_EVENTS)) {
    const received = [], unsubscribe = bridge.tvlens[name](value => received.push(value));
    bridge.deliver(channel, { seq: 1 });
    assert.deepEqual(received, [{ seq: 1 }], `${name} receives the payload, never the IPC event`);
    assert.equal(typeof unsubscribe, 'function', name);
    unsubscribe(); bridge.deliver(channel, { seq: 2 });
    assert.equal(received.length, 1, `${name} hands back its own removal`);
  }
  // Electron prefixes every rejection of a handler in English: the viewer must read the French message alone.
  const refusing = loadBridge(async channel => { throw new Error(`Error invoking remote method '${channel}': Error: Session ouverte en lecture seule. Choisis Reprendre la capture ou Nouvelle session.`); });
  await assert.rejects(refusing.tvlens.start(), error => error.message === 'Session ouverte en lecture seule. Choisis Reprendre la capture ou Nouvelle session.');
  const typed = loadBridge(async channel => { throw new Error(`Error invoking remote method '${channel}': StorageFullError: Espace disque insuffisant.`); });
  await assert.rejects(typed.tvlens.resumeSession(), error => error.message === 'Espace disque insuffisant.');
  const untouched = loadBridge(async () => { throw new Error('Détail : Error: conservé tel quel.'); });
  await assert.rejects(untouched.tvlens.sessions(), error => error.message === 'Détail : Error: conservé tel quel.');
});

function bridgeChannels() {
  const bridge = loadBridge();
  // Les appels découvrent le protocole du vrai preload, sans envoyer d'arguments factices aux commandes de l'hôte.
  for (const api of [bridge.tvlens, bridge.capture]) for (const method of Object.values(api)) method(() => {});
  return { invoked: [...new Set(bridge.invoked.map(call => call.channel))].sort(), listened: [...bridge.listeners.keys()].sort() };
}

// Le balayeur neutralisé reçoit les dépendances du raccord partagé sans accéder à cette racine.
function assertStartupSweep(sweeps) {
  assert.equal(sweeps.length, 1, 'only the injected sweep is called, once');
  const args = sweeps[0];
  assert.equal(args.length, 4);
  assert.deepEqual(args.slice(0, 3), [os.tmpdir(), undefined, undefined]);
  assert.deepEqual(Object.keys(args[3]), ['onDiagnostic']);
  assert.equal(typeof args[3].onDiagnostic, 'function');
  return args;
}

test('every bridge call has its handler, every event its listener, and the host no longer purges, preempts or knows Auto', async t => {
  const { launch } = await stage(t), sweeping = deferred(), sweepEntered = deferred();
  t.after(() => sweeping.resolve([]));
  const host = await launch({
    shortcuts: true, sweep: (...args) => { sweepEntered.resolve(args); return sweeping.promise; },
    wrap: { verifier: adapter => ({ ...adapter, verify: async input => {
      // Une entrée différée interdit au scénario de dépendre de l'armement synchrone du délai simulé.
      await tick();
      return adapter.verify(input);
    } }) },
  });
  assert.equal(host.started, true, host.failures.join(' '));
  const sweepArgs = await bounded(sweepEntered.promise);
  assert.deepEqual(host.sweeps, [sweepArgs], 'the controlled sweep starts without delaying the window');
  assertStartupSweep(host.sweeps);
  sweeping.reject(Object.assign(new Error('Balayage refusé.'), { code: 'EACCES' }));
  assert.equal(await host.state(), null, 'a failed Codex sweep does not fail the host');
  await waitUntil(() => host.failures.length === 1, 'the refused sweep reaches the host journal');
  assert.deepEqual(host.failures.map(line => JSON.parse(line)), [{
    code: 'TVLENS_CODEX_CLEANUP_FAILED', candidate: os.tmpdir(), operation: 'sweep', systemCode: 'EACCES',
  }]);
  const { invoked, listened } = bridgeChannels(), handled = [...host.handlers.keys()].sort();
  assert.deepEqual(invoked, handled, 'bridge calls and host handlers are the same set: no dead channel on either side');
  // Les deux raccourcis sont les callbacks enregistrés auprès de notre doublure, sans accès au clavier du Mac.
  host.pressShortcut((await host.viewingSettings()).bookmarkShortcut);
  await waitUntil(() => host.sent.includes('saved:error'), 'the bookmark shortcut reports the missing session');
  const session = await host.start();
  await capture(host, session.id);
  await waitUntil(analysed(host, 1), 'the passage ready for bookmark and explanation');
  await host.keepMoment();
  host.pressShortcut((await host.momentShortcuts()).explainShortcut);
  await host.startSurveillance({ instruction: 'Vérifie les chiffres annoncés.' });
  await waitUntil(async () => (await host.surveillanceState()).registry.ready, 'surveillance ready to stop');
  assert.equal((await host.stopSurveillance()).enabled, false, 'the explicit stop channel stops surveillance');
  const verifying = host.verify('Apollo 11 a aluni en 1970.');
  await until(t, async () => (await host.verificationState()).jobs.at(-1)?.status === 'done', 'the simulated verification completes', 500);
  assert.equal((await bounded(verifying)).assessment, 'contradicted');
  await host.stop();
  await host.newSession();
  await host.deleteSession(session.id);
  await waitUntil(() => host.sent.includes('storage:state'), 'storage published after deletion');
  await host.quit();
  assert.deepEqual(host.sweeps, [sweepArgs], 'session commands and quit do not repeat the initial Codex sweep');
  const sent = [...new Set(host.sent)].sort();
  assert.deepEqual(sent, listened, 'host events and bridge listeners are the same set');
  for (const channel of [...handled, ...sent]) assert.doesNotMatch(channel, /^auto:/, channel);
  for (const channel of ['surveillance:state', 'surveillance:history', 'surveillance:start', 'surveillance:stop', 'surveillance:retry', 'surveillance:open-source',
    'sessions:list', 'sessions:open', 'sessions:resume', 'sessions:delete', 'sessions:storage']) assert.ok(handled.includes(channel), channel);
  for (const channel of ['surveillance:state', 'sessions:changed', 'storage:state', 'watch:state', 'watch:reset']) assert.ok(sent.includes(channel), channel);
  assert.equal(fs.existsSync(path.join(root, 'core', 'auto-monitor.cjs')), false, 'core/auto-monitor.cjs is removed');
  // Seule exception de contenu : launch force smoke ; ce repli exige live-inspection et une configuration illisible.
  const has = fragment => shape(mainSource).includes(shape(fragment));
  assert.ok(has("audioInput: true, visionDuringAsk: process.env.TVLENS_VISION_DURING_ASK !== '0' }"), 'the fallback configuration lets vision go on');
});

// ---- The real main process behind the real bridge, without Electron ----------------------------------

// Content and identity of every file of a directory: a rewrite with the same bytes is still seen as a write.
const digest = async dir => {
  const out = [];
  const walk = async at => { for (const entry of (await fsp.readdir(at, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
    const target = path.join(at, entry.name);
    if (entry.isDirectory()) { await walk(target); continue; }
    const stats = await fsp.stat(target, { bigint: true });
    out.push(`${path.relative(dir, target)}:${createHash('sha256').update(await fsp.readFile(target)).digest('hex')}:${stats.ino}:${stats.mtimeNs}`);
  } };
  await walk(dir);
  return out;
};
const HOST_SETTINGS = ['TVLENS_QUESTION_TIMEOUT_MS', 'TVLENS_SURVEILLANCE_WORKERS', 'TVLENS_MEDIA_RETENTION_MS', 'TVLENS_DISK_MIN_FREE_MB', 'TVLENS_DISK_WARN_FREE_MB', 'TVLENS_VISION_DURING_ASK'];

function commandLineStub(disabledFeatures) {
  const switches = new Map(disabledFeatures ? [['disable-features', disabledFeatures]] : []);
  return {
    switches,
    commandLine: { getSwitchValue: name => switches.get(name) || '', appendSwitch: (name, value) => switches.set(name, value) },
  };
}

function wrapClosingModule(loaded, wrapClosing) {
  if (!wrapClosing) return loaded;
  return { ...loaded, closeSession: options => wrapClosing(loaded.closeSession, options) };
}

function wrapProvider(factory, wrap) {
  if (!wrap) return factory;
  return (...args) => wrap(factory(...args));
}

function wrapSimulatedProviders(loaded, wrap) {
  return {
    ...loaded,
    simulatedVerifier: wrapProvider(loaded.simulatedVerifier, wrap.verifier),
    simulatedRecap: wrapProvider(loaded.simulatedRecap, wrap.recap),
  };
}

// Loads app/main.cjs in its own simulated mode with `electron` replaced. IPC goes through the real preload,
// structured-cloned both ways and with Electron's error prefix, as between two processes. Two things of the
// machine are kept out: the sweep of stale Codex contexts (a test run must not clean a real temporary directory)
// and, when `disk` is given, the free space measured by the real DiskGuard (its documented `freeBytes` option).
// `wrap` expose les compositions et leur diagnostic pour injecter une panne aux frontières du vrai hôte.
async function launch(userData, {
  env = {}, sweep = async () => [], disk = null, wrap = {}, shortcuts = false, flags = [], readClock,
  platform = process.platform, disabledFeatures = '',
  dialogSelection, dialogChoice, storageAccess,
} = {}) {
  const handlers = new Map(), schemes = new Map(), opened = [], failures = [], sweeps = [], sent = [];
  const registeredShortcuts = new Map();
  const { switches, commandLine } = commandLineStub(disabledFeatures);
  let startupSwitches;
  let bridge, finished, loaded;
  const quitting = new Promise(resolve => { finished = resolve; }), ready = new Promise(resolve => { loaded = resolve; });
  const webContents = { mainFrame: {}, setWindowOpenHandler() {}, on() {}, send: (channel, value) => {
    sent.push(channel);
    bridge.deliver(channel, value === undefined ? undefined : structuredClone(value));
  } };
  class BrowserWindow {
    constructor() { this.webContents = webContents; }
    isDestroyed() { return false; } getBounds() { return { x: 0, y: 0, width: 1340, height: 920 }; } getContentBounds() { return { x: 0, y: 0, width: 1340, height: 892 }; }
    loadFile() { loaded(true); return Promise.resolve(); } show() {} focus() {} setMinimumSize() {} setAlwaysOnTop() {} setBounds() {}
  }
  const app = Object.assign(new EventEmitter(), { isPackaged: false, setName() {}, setPath() {}, getPath: () => userData,
    requestSingleInstanceLock: () => true,
    commandLine,
    whenReady: () => { startupSwitches = Object.fromEntries(switches); return Promise.resolve(); },
    // As Electron does: quitting asks first, and a handler may hold it back until its own work is done.
    quit() { const event = { prevented: false, preventDefault() { this.prevented = true; } }; app.emit('before-quit', event); if (!event.prevented) { finished(); loaded(false); } } });
  const electron = { app, BrowserWindow, ipcMain: { handle: (channel, handler) => handlers.set(channel, handler) },
    protocol: { registerSchemesAsPrivileged() {}, handle: (scheme, handler) => schemes.set(scheme, handler) },
    globalShortcut: {
      register: (key, callback) => { registeredShortcuts.set(key, callback); return true; },
      unregister: key => registeredShortcuts.delete(key), unregisterAll: () => registeredShortcuts.clear(),
    }, desktopCapturer: { getSources: async () => [] },
    session: { defaultSession: { setDisplayMediaRequestHandler() {} } }, systemPreferences: { getMediaAccessStatus: () => 'granted' },
    shell: { openExternal: async url => { opened.push(url); } },
    dialog: { showErrorBox() {}, showOpenDialog: async () => dialogSelection || { canceled: true },
      showMessageBox: async () => ({ response: dialogChoice ?? 1 }) },
    safeStorage: { isEncryptionAvailable: () => { storageAccess?.(); return false; } },
    screen: { getDisplayMatching: () => ({ workArea: { x: 0, y: 0, width: 1920, height: 1080 } }) } };
  const sender = { sender: webContents, senderFrame: webContents.mainFrame };
  const invoke = async (channel, ...args) => {
    try { const result = await handlers.get(channel)(sender, ...structuredClone(args)); return result === undefined ? undefined : structuredClone(result); }
    catch (error) { throw new Error(`Error invoking remote method '${channel}': ${error}`); }
  };
  bridge = loadBridge(invoke);
  const argv = [...process.argv], saved = Object.fromEntries(HOST_SETTINGS.map(name => [name, process.env[name]])), consoleError = console.error, load = Module._load;
  const restore = () => { process.argv.splice(0, process.argv.length, ...argv); for (const name of HOST_SETTINGS) if (saved[name] === undefined) delete process.env[name]; else process.env[name] = saved[name]; console.error = consoleError; };
  for (const name of HOST_SETTINGS) delete process.env[name];
  Object.assign(process.env, env); process.argv.push('--smoke-test', ...flags);
  if (shortcuts) process.argv.push('--live-shortcut');
  console.error = error => failures.push(String(error?.message || error));
  Module._load = function (request, parent, ...rest) {
    if (request === 'electron') return electron;
    const loaded = load.call(this, request, parent, ...rest);
    if (!parent?.filename?.endsWith(path.join('app', 'main.cjs'))) return loaded;
    if (request === '../adapters/codex-confinement.cjs') return { ...loaded, sweepStaleContexts: (...args) => { sweeps.push(args); return sweep(...args); } };
    if (request === '../runtime/session-closing.cjs') return wrapClosingModule(loaded, wrap.closing);
    if (request === '../adapters/simulated-providers.cjs') return wrapSimulatedProviders(loaded, wrap);
    // Measured afresh at every check, so that a change of free space is seen at once instead of five seconds later.
    if (request === '../adapters/disk-guard.cjs' && disk) return { ...loaded, DiskGuard: class extends loaded.DiskGuard { constructor(options) { super({ ...options, freeBytes: async () => disk.free, maxAgeMs: 0 }); } } };
    if (request === '../runtime/session-runtime.cjs' && readClock) return { ...loaded, createSessionRuntime: options => {
      const runtime = loaded.createSessionRuntime({ ...options, readClock });
      return wrap.session ? wrap.session(runtime, options) : runtime;
    } };
    const factories = {
      '../runtime/conversation-runtime.cjs': ['createConversationRuntime', wrap.conversation],
      '../runtime/session-runtime.cjs': ['createSessionRuntime', wrap.session],
      '../runtime/surveillance-runtime.cjs': ['createSurveillanceRuntime', wrap.surveillance],
      '../runtime/publication-diagnostic.cjs': ['createPublicationDiagnostic', wrap.diagnostic],
      './capture-sources.cjs': ['createCaptureSources', wrap.captureSources],
    };
    const factory = factories[request];
    if (factory?.[1]) {
      const [name, wrapFactory] = factory;
      return { ...loaded, [name]: (...args) => wrapFactory(loaded[name](...args), ...args) };
    }
    return loaded;
  };
  const platformDescriptor = Object.getOwnPropertyDescriptor(process, 'platform');
  Object.defineProperty(process, 'platform', { value: platform });
  try { delete require.cache[require.resolve('../app/main.cjs')]; require('../app/main.cjs'); }
  catch (error) { restore(); throw error; }
  finally { Module._load = load; Object.defineProperty(process, 'platform', platformDescriptor); }
  const started = await ready;
  let stopped;
  const host = { ...bridge.tvlens, capture: bridge.capture, invoke, started, failures, opened, handlers, sweeps, sent, startupSwitches, events: [],
    pressShortcut: key => registeredShortcuts.get(key)(),
    fetch: (url, headers = {}) => schemes.get('tvlens-media')(new Request(url, { headers })),
    quit: () => (stopped ||= (async () => { app.quit(); await quitting; restore(); })()) };
  if (!started) restore();
  // What the renderer would have received, in order.
  for (const [name, channel] of [['onState', 'watch:state'], ['onReset', 'watch:reset'], ['onDeepState', 'deep:state'], ['onRecap', 'recap:state'], ['onSurveillance', 'surveillance:state'], ['onSessionsChanged', 'sessions:changed'], ['onStorage', 'storage:state']])
    bridge.tvlens[name](value => host.events.push({ channel, value }));
  return host;
}
// One temporary user-data directory per test, virtual timers, and hosts that are always quit before their
// directory is removed: a failed assertion must not leave a host writing into a deleted folder.
async function stage(t) {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
  const userData = await fsp.mkdtemp(path.join(os.tmpdir(), 'tvlens-mac-host-')), hosts = [];
  t.after(async () => {
    try {
      for (const host of hosts) await host.quit().catch(() => {
        // Un refus ne doit pas laisser les hôtes suivants actifs sur le dossier qui va être supprimé.
      });
      const { listened } = bridgeChannels();
      for (const host of hosts) {
        for (const channel of new Set(host.sent)) {
          assert.ok(listened.includes(channel), `published host event has a preload listener: ${channel}`);
          assert.doesNotMatch(channel, /^auto:/, channel);
        }
      }
    } finally { await fsp.rm(userData, { recursive: true, force: true }); }
  });
  return { userData, folder: id => path.join(userData, 'sessions', id), launch: async options => { const host = await launch(userData, options); hosts.push(host); return host; } };
}
// Virtual time moves in steps while real I/O (disk, images) settles in between: bounded on both clocks.
async function until(t, check, label, stepMs = 0) {
  for (let i = 0; i < 600; i++) {
    const value = await check();
    if (value) return value;
    if (stepMs) t.mock.timers.tick(stepMs);
    await pause(5);
  }
  assert.fail(`never happened: ${label}`);
}
let jpeg;
// One passage of a simulated capture, from the end of the previous one up to the session clock: it lies in
// the past of any question asked afterwards, as a real capture does (no evidence ever comes from the future).
async function capture(host, sessionId, { after = 0, frames = 1, audio = null } = {}) {
  jpeg ||= 'data:image/jpeg;base64,' + (await sharp({ create: { width: 64, height: 36, channels: 3, background: { r: 23, g: 57, b: 82 } } }).jpeg().toBuffer()).toString('base64');
  await pause(20);
  const state = await host.state(), startMs = Math.max(after, state.segments.at(-1)?.endMs ?? 0), endMs = Math.floor(state.elapsedMs), clip = `clip ${startMs}`;
  assert.ok(endMs > startMs, 'the session clock moved');
  const id = await host.ingest({ sessionId, startMs, endMs, clip: new Uint8Array(Buffer.from(clip)), audio, frames: Array.from({ length: frames }, () => ({ atMs: startMs, dataUrl: jpeg })) });
  return { id, startMs, endMs, clip };
}
const analysed = (host, count) => async () => { const state = await host.state(); return state?.segments.length === count && state.segments.every(s => s.status === 'ready' && s.thumbnailAvailable !== undefined) && state; };
const text = async response => Buffer.from(await response.arrayBuffer()).toString();

test('the Mac host keeps CoreAudio Tap on and the disabled features it is given as they are on each platform', async t => {
  const { launch } = await stage(t);
  for (const [platform, disabledFeatures] of [
    ['darwin', ''],
    ['darwin', 'OtherFeature,AnotherFeature'],
    // An explicit choice of ScreenCaptureKit on the command line stays the start's own.
    ['darwin', 'OtherFeature,MacCatapLoopbackAudioForScreenShare'],
    ['linux', ''],
    ['win32', 'OtherFeature'],
  ]) {
    const host = await launch({ platform, disabledFeatures });
    assert.equal(host.started, true, host.failures.join(' '));
    assert.deepEqual(host.startupSwitches, disabledFeatures ? { 'disable-features': disabledFeatures } : {}, platform);
    await host.quit();
  }
});

test('retired Mac retention options cannot expire media and capture refreshes the manifest before analysis finishes', async t => {
  const { launch, folder } = await stage(t), gate = deferred();
  let clock = 0, runtime;
  t.after(() => gate.resolve({ observation: { transcript: 'Paroles conservées.' } }));
  const host = await launch({
    env: { TVLENS_MEDIA_RETENTION_MS: '1' }, flags: ['--retention-ms=1'], readClock: () => clock,
    wrap: { session: built => {
      runtime = built;
      built.perception.transcribe = () => gate.promise;
      return built;
    } },
  });
  assert.equal(host.started, true);
  const config = await host.config();
  assert.deepEqual([config.retention, config.retentionMs], ['until-deleted', null]);
  const { id } = await host.start();
  clock = 1000;
  await host.ingest({ sessionId: id, startMs: 0, endMs: 1000, clip: new Uint8Array([1]),
    frames: [{ atMs: 0, dataUrl: 'data:image/jpeg;base64,YQ==' }] });
  await runtime.store.flush();
  const manifest = () => JSON.parse(fs.readFileSync(path.join(folder(id), 'manifest.json'), 'utf8'));
  const initial = manifest().elapsedMs;
  host.events.length = 0;
  clock = 3600000;
  t.mock.timers.tick(5000);
  await runtime.store.flush();
  const state = await host.state();
  assert.deepEqual([state.elapsedMs, state.segments[0].available, state.segments[0].audioStatus], [clock, true, 'analyzing']);
  assert.ok(host.events.some(event => event.channel === 'watch:state' && event.value.elapsedMs === clock));
  assert.ok(manifest().elapsedMs > initial, 'manifest cadence does not wait for a ready passage');
  await host.stop();
  host.events.length = 0;
  const before = await digest(folder(id));
  clock += 3600000;
  t.mock.timers.tick(3600000);
  await runtime.store.flush();
  assert.equal(host.events.filter(event => event.channel === 'watch:state').length, 0);
  assert.deepEqual(await digest(folder(id)), before);
  assert.deepEqual([(await host.state()).elapsedMs, (await host.state()).segments[0].available], [3600000, true]);
});

test('invalid retired Mac retention values are ignored at startup', async t => {
  const { launch } = await stage(t);
  for (const value of ['abc', '-1', '0']) {
    const host = await launch({ env: { TVLENS_MEDIA_RETENTION_MS: value }, flags: ['--retention-ms=' + value] });
    assert.equal(host.started, true, value);
    assert.deepEqual([(await host.config()).retention, (await host.config()).retentionMs], ['until-deleted', null]);
    await host.quit();
  }
});

test('the Mac IPC host publishes both default smoke lanes with the simulated observations', async t => {
  const { launch } = await stage(t), host = await launch();
  assert.equal(host.started, true, host.failures.join(' '));
  const session = await host.start(), finished = deferred(), published = [];
  host.onState(state => {
    const passage = state?.segments[0];
    if (!passage) return;
    published.push(passage);
    if (['ready', 'error'].includes(passage.visionStatus) || ['ready', 'error'].includes(passage.status)) finished.resolve();
  });
  const image = 'data:image/jpeg;base64,' + (await sharp({
    create: { width: 64, height: 36, channels: 3, background: '#173952' },
  }).jpeg().toBuffer()).toString('base64');
  assert.equal(await host.ingest({
    sessionId: session.id, startMs: 0, endMs: 1, clip: new Uint8Array([1]),
    audio: new Uint8Array([1]), frames: [{ atMs: 0, dataUrl: image }],
  }), 'moment-1');
  await finished.promise;
  const state = await host.state(), passage = state.segments[0];
  assert.deepEqual(passage.observation, {
    transcript: 'Un cercle se déplace sur un fond bleu.', audio: 'Audio reçu.', uncertainty: '',
    summary: 'Un cercle se déplace sur un fond bleu.', visual: '1 images reçues.',
  });
  assert.deepEqual([passage.id, passage.startMs, passage.endMs, passage.status, passage.audioStatus, passage.visionStatus],
    ['moment-1', 0, 1, 'ready', 'ready', 'ready']);
  assert.ok(published.some(p => p.audioStatus === 'ready' && p.visionStatus === 'queued' && !p.observation.summary));
  assert.equal(state.apiCost, 0);
});

test('the Mac surveillance interval diagnoses a refused runtime tick and calls the next tick even if its journal throws', async t => {
  for (const failingDiagnostic of [false, true]) await t.test(`throwing diagnostic: ${failingDiagnostic}`, async t => {
    const { launch } = await stage(t);
    let calls = 0;
    const host = await launch({ wrap: {
      surveillance: built => {
        const tick = built.tick.bind(built);
        built.tick = () => {
          calls++;
          if (calls === 1) throw Object.assign(new Error('tick refusé'), { code: 'RUNTIME_TICK_FAILED' });
          return tick();
        };
        return built;
      },
      diagnostic: report => event => {
        report(event);
        if (failingDiagnostic) throw Error('journal indisponible');
      },
    } });
    assert.equal(host.started, true, host.failures.join(' '));
    const session = await host.start();
    assert.doesNotThrow(() => t.mock.timers.tick(1000), 'the real periodic callback absorbs the failure');
    const diagnostics = host.failures.map(line => JSON.parse(line));
    assert.deepEqual(diagnostics.map(({ code, origin, sessionId, error }) => [code, origin, sessionId, error.code]), [
      ['TVLENS_SURVEILLANCE_TICK_FAILED', 'mac', session.id, 'RUNTIME_TICK_FAILED'],
    ]);
    assert.doesNotThrow(() => t.mock.timers.tick(1000));
    assert.equal(calls, 2, 'no immediate retry, and the next interval still runs');
    assert.equal(host.failures.length, 1);
    assert.equal((await host.surveillanceState()).error, null);
  });
});

test('the Mac composition journals a refused surveillance state and delivers its current state after the window recovers', async t => {
  const { launch } = await stage(t);
  let surveillance;
  const host = await launch({ wrap: { surveillance: built => { surveillance = built; return built; } } });
  assert.equal(host.started, true, host.failures.join(' '));
  const session = await host.start(), received = [];
  const unsubscribe = host.onSurveillance(() => {
    throw Object.assign(new Error('fenêtre indisponible'), { code: 'WINDOW_UNAVAILABLE' });
  });
  host.onSurveillance(state => received.push(state));
  await host.startSurveillance({ instruction: 'Vérifie les chiffres.' });
  await surveillance.ready();
  await surveillance.flush();
  assert.deepEqual(received, []);
  const diagnostics = host.failures.map(line => JSON.parse(line));
  assert.ok(diagnostics.length > 0);
  assert.ok(diagnostics.every(event => event.code === 'TVLENS_STATE_PUBLICATION_FAILED'
    && event.origin === 'surveillance-runtime' && event.sessionId === session.id && event.error.code === 'WINDOW_UNAVAILABLE'));
  unsubscribe();
  assert.doesNotThrow(() => t.mock.timers.tick(1000));
  assert.deepEqual(received.map(state => [state.sessionId, state.enabled, state.registry.status]), [[session.id, true, 'ready']]);
  t.mock.timers.tick(1000);
  assert.equal(received.length, 1);
  assert.equal((await host.surveillanceState()).error, null);
});

for (const resume of [false, true]) {
  test(`an empty Mac archive survives closing ${resume ? 'after explicit resume and pause' : 'without resume or archive writes'}`, async t => {
    const { userData, launch } = await stage(t);
    const archive = await emptyArchive(path.join(userData, 'sessions'), 'mac');
    const before = await digest(archive.dir);
    const host = await launch();
    assert.equal(host.started, true, host.failures.join(' '));
    assert.equal((await host.openSession(archive.id)).readOnly, true);
    assert.deepEqual((await host.state()).questions, []);
    if (resume) {
      assert.equal((await host.resumeSession()).id, archive.id);
      await host.stop();
      assert.equal((await host.state()).accepting, false);
    }
    await host.newSession();
    assert.equal(fs.existsSync(archive.dir), true, 'the pre-existing archive directory survives');
    for (const name of archive.files) assert.equal(fs.existsSync(path.join(archive.dir, name)), true, name);
    assert.deepEqual((await host.sessions()).sessions.map(row => [row.id, row.state, row.passages]), [[archive.id, 'archived', 0]]);
    if (!resume) assert.deepEqual(await digest(archive.dir), before, 'read-only closing writes nothing');
    assert.deepEqual(host.failures, []);
  });
}

test('Mac state IPC ignores renderer arguments and reads its own current projection', async t => {
  const { launch } = await stage(t);
  const host = await launch({ readClock: () => 0 });
  assert.equal(host.started, true, host.failures.join(' '));
  await host.start();
  const expected = await host.state();
  for (const argument of [{ session: { id: 'renderer-supplied' } }, null, {}]) {
    assert.deepEqual(await host.invoke('watch:state', argument), expected);
  }
});

test('a Mac session is archived instead of purged, listed, reopened read-only without a write, resumed only explicitly, and deleted alone', async t => {
  const { folder, launch } = await stage(t), host = await launch();
  assert.equal(host.started, true, host.failures.join(' '));
  // An IPC call from anywhere but the main frame of the window is refused before any handler runs.
  assert.throws(() => host.handlers.get('watch:state')({ sender: {}, senderFrame: {} }), /Unauthorized/);
  const config = await host.config();
  assert.deepEqual([config.questionTimeoutMs, config.questionQueueLimit, config.retention, config.retentionMs], [300000, 5, 'until-deleted', null]);
  assert.equal(await host.state(), null);
  assert.deepEqual((await host.sessions()).sessions, [], 'nothing is created, and nothing swept, by starting the app');
  assertStartupSweep(host.sweeps);
  // The simulated verifier declares the page it cites as opened, as a real one does: its source survives the
  // strict filter instead of being discarded as a recollection of the model.
  const verifying = host.verify('Apollo 11 a aluni en 1970.');
  await until(t, async () => (await host.verificationState()).jobs.at(-1)?.status === 'done', 'the simulated verification', 500);
  const verified = await verifying;
  assert.deepEqual([verified.assessment, verified.sources.map(source => source.url), verified.limitations], ['contradicted', ['https://www.nasa.gov/mission/apollo-11/'], []]);

  // Session A: an answered question, a recap of its first two passages, a kept moment, then a third passage.
  await host.capture.sources(); await host.capture.select('test-source');
  const a = await host.start();
  assert.equal(a.segmentMs, 1800);
  const a1 = await capture(host, a.id), a2 = await capture(host, a.id);
  assert.deepEqual([a1.id, a2.id], ['moment-1', 'moment-2']);
  let state = await until(t, analysed(host, 2), 'two analysed passages');
  assert.match(state.title, /^Vidéo de démonstration · \d{1,2} \S+ \d{4}, \d{2}:\d{2}$/, 'additive title: captured source and start date');
  assert.deepEqual([state.readOnly, state.retention, state.retentionMs, state.accepting], [false, 'until-deleted', null, true]);
  assert.equal(typeof state.storage.sessionBytes, 'number');
  await until(t, async () => (await host.recapState()).overview, 'a first recap', 1000);
  await host.ask('Que voit-on maintenant ?');
  const answered = await until(t, async () => { const job = (await host.deepState()).jobs.at(-1); return job.status === 'done' && job; }, 'an answered question', 500);
  assert.equal(answered.sessionId, a.id); assert.ok(answered.result.citations.length);
  const kept = await host.keepMoment();
  // Captured after the last synthesis and never summarised (virtual time stands still): pending in the recap.
  const a3 = await capture(host, a.id);
  await until(t, analysed(host, 3), 'a third analysed passage');
  await until(t, async () => (await host.recapState()).pendingCount === 1, 'one passage waiting for the recap');
  let listed = await host.sessions();
  assert.deepEqual([listed.current.id, listed.current.readOnly, listed.current.accepting], [a.id, false, true]);
  assert.deepEqual(listed.sessions.map(s => [s.id, s.state, s.current, s.capturing, s.passages, s.media.stored]), [[a.id, 'live', true, true, 3, 3]], 'the live row carries the figures in memory');
  await assert.rejects(host.newSession(), /Arrête la capture/);
  await host.stop();
  host.events.length = 0;
  assert.equal(await host.newSession(), true);
  assert.equal(await host.state(), null); assert.deepEqual((await host.deepState()).jobs, []);
  assert.ok(host.events.some(e => e.channel === 'watch:reset') && host.events.some(e => e.channel === 'sessions:changed'));
  // "Nouvelle session" archived: every media, thumbnail and text of A is still on disk.
  assert.equal(await fsp.readFile(path.join(folder(a.id), 'media', 'moment-1.webm'), 'utf8'), a1.clip);
  assert.equal(await fsp.readFile(path.join(folder(a.id), 'media', 'moment-2.webm'), 'utf8'), a2.clip);
  assert.ok((await fsp.stat(path.join(folder(a.id), 'thumbs', 'moment-1.jpg'))).size > 0);
  const manifest = JSON.parse(await fsp.readFile(path.join(folder(a.id), 'manifest.json'), 'utf8'));
  assert.deepEqual([manifest.state, manifest.host, manifest.title, manifest.passages, manifest.media.stored, manifest.media.retention], ['archived', 'mac', state.title, 3, 3, 'until-deleted']);
  assert.equal(JSON.parse(await fsp.readFile(path.join(folder(a.id), 'deep-answers.json'), 'utf8')).jobs.length, 1);

  // Session B: one passage and its own question. A session that received nothing is not kept at all.
  const b = await host.start();
  await capture(host, b.id);
  await until(t, analysed(host, 1), 'one analysed passage');
  await assert.rejects(host.openSession(a.id), /Arrête la capture/, 'an archive is never opened over a running capture');
  await host.ask('Que voit-on maintenant ?');
  await until(t, async () => (await host.deepState()).jobs.at(-1).status === 'done', 'the question of B', 500);
  assert.deepEqual((await host.deepState()).jobs.map(j => j.sessionId), [b.id], 'the questions of A left with A');
  await host.stop(); await host.newSession();
  const empty = await host.start(); await host.stop(); await host.newSession();
  assert.equal(fs.existsSync(folder(empty.id)), false, 'an empty session leaves no archive');
  listed = await host.sessions();
  assert.equal(listed.current, null);
  assert.deepEqual(listed.sessions.map(s => [s.id, s.state, s.passages, s.media.stored, s.media.missing, s.current]).sort(), [[a.id, 'archived', 3, 3, 0, false], [b.id, 'archived', 1, 1, 0, false]].sort());
  assert.equal(listed.sessions.find(s => s.id === a.id).title, state.title);
  assert.ok(listed.storage.bytes > 0); assert.equal(listed.storage.sessions, 2); assert.equal(listed.storage.state, 'unknown', 'a simulated run does not measure the disk of its machine');

  // Opening A: read-only, restored through the same states, and its directory is byte for byte what it was.
  const before = await digest(folder(a.id));
  await assert.rejects(host.openSession('../' + b.id), error => error.message === 'Identifiant de session invalide.');
  await assert.rejects(host.openSession(randomUUID()), error => error.message === 'Session introuvable.');
  host.events.length = 0;
  assert.deepEqual(await host.openSession(a.id).then(({ elapsedMs, ...rest }) => [rest, elapsedMs > 0]), [{ id: a.id, readOnly: true }, true]);
  state = await host.state();
  assert.deepEqual([state.id, state.readOnly, state.accepting, state.title, state.segments.map(s => [s.id, s.available, s.thumbnailAvailable])], [a.id, true, false, manifest.title, [['moment-1', true, true], ['moment-2', true, true], ['moment-3', true, true]]]);
  assert.deepEqual(host.events.filter(e => e.channel === 'watch:state').at(-1).value.readOnly, true, 'the archive is pushed like a live state');
  const restoredJobs = (await host.deepState()).jobs;
  assert.deepEqual(restoredJobs.map(j => [j.id, j.sessionId, j.status, j.question]), [[answered.id, a.id, 'done', 'Que voit-on maintenant ?']], 'the questions of A only, never those of B');
  const recap = await host.recapState();
  assert.equal(recap.sessionId, a.id); assert.ok(recap.overview); assert.ok(recap.chapters[0].available, 'replay availability comes from the disk');
  assert.deepEqual([recap.pendingCount, recap.sourceCount, recap.overviewSourceIds], [1, 3, ['moment-1', 'moment-2']], 'the recap is restored as it was, its unsummarised passage included');
  assert.deepEqual([(await host.surveillanceState()).enabled, (await host.sessions()).current.readOnly], [false, true]);
  // Ten virtual seconds of the host's own timers (recap, surveillance, sweep): still nothing written.
  for (let i = 0; i < 10; i++) { t.mock.timers.tick(1000); await pause(5); }
  assert.deepEqual(await digest(folder(a.id)), before, 'opening and showing an archive never writes into it');
  assert.deepEqual([(await host.recapState()).updatedAt, (await host.recapState()).pendingCount], [recap.updatedAt, 1], 'no synthesis while an archive is only read, even with a passage waiting');
  assert.ok(!host.events.some(e => e.channel === 'recap:state' && e.value.status === 'updating'));
  // The private protocol serves every passage of the loaded session and its thumbnail, and nothing else.
  assert.equal(await text(await host.fetch(`tvlens-media://${a.id}/moment-1`)), a1.clip);
  const ranged = await host.fetch(`tvlens-media://${a.id}/moment-2`, { range: 'bytes=0-3' });
  assert.deepEqual([ranged.status, await text(ranged)], [206, 'clip']);
  const thumb = await host.fetch(`tvlens-media://${a.id}/thumb/moment-1`);
  assert.deepEqual([thumb.status, thumb.headers.get('content-type'), (await thumb.arrayBuffer()).byteLength > 0], [200, 'image/jpeg', true]);
  for (const url of [`tvlens-media://${b.id}/moment-1`, `tvlens-media://${a.id}/moment-9`, `tvlens-media://${a.id}/thumb/moment-9`, `tvlens-media://${a.id}/thumb/moment-1/x`, `tvlens-media://${a.id}/manifest.json`])
    assert.equal((await host.fetch(url)).status, 404, url);
  // Capture never restarts inside an archive without the explicit gesture; the refusal arrives in French.
  await assert.rejects(host.start(), error => error.message === 'Session ouverte en lecture seule. Choisis Reprendre la capture ou Nouvelle session.');
  await assert.rejects(host.startSurveillance({ instruction: 'Vérifie les chiffres.' }), /lecture seule/);
  assert.deepEqual(await host.openSession(a.id).then(r => [r.id, r.readOnly]), [a.id, true], 'opening the open archive again changes nothing');
  assert.deepEqual(await digest(folder(a.id)), before);
  // A question on the open archive is allowed: answered from its restored passages and the media on disk,
  // saved with that session and with nothing else; the session stays read-only.
  await host.ask('Que voit-on maintenant ?');
  const again = await until(t, async () => { const job = (await host.deepState()).jobs.at(-1); return job.status === 'done' && job; }, 'an answer on the archive', 500);
  assert.deepEqual([again.sessionId, again.result.citations.length > 0, new Set([answered.id, again.id]).size], [a.id, true, 2]);
  // A finished question is written twice, its answer then its figures. The folder is read once that last write
  // is there: the first one is on disk while the second is still on its way, its temporary file in the folder.
  await until(t, async () => { const job = JSON.parse(await fsp.readFile(path.join(folder(a.id), 'deep-answers.json'), 'utf8')).jobs.at(-1); return job.status === 'done' && Boolean(job.metrics); }, 'the answer saved in the archive');
  const asked = await digest(folder(a.id)), apart = lines => lines.filter(line => !line.startsWith('deep-answers.json:'));
  assert.deepEqual(apart(asked), apart(before), 'an explicit question writes its answer and nothing else');
  assert.deepEqual(JSON.parse(await fsp.readFile(path.join(folder(a.id), 'deep-answers.json'), 'utf8')).jobs.map(j => j.sessionId), [a.id, a.id]);
  assert.equal((await host.state()).readOnly, true);

  // Deleting B, which is not loaded: B alone goes; A and the kept moment stay.
  const removed = await host.deleteSession(b.id);
  assert.equal(removed.deleted, true); assert.ok(removed.freedBytes > 0);
  assert.equal(fs.existsSync(folder(b.id)), false); assert.deepEqual(await digest(folder(a.id)), asked, 'the other session is untouched');
  await assert.rejects(host.deleteSession(b.id), error => error.message === 'Session introuvable.');

  // Explicit resume: same session, clock at its archived instant, numbering continued.
  const resumed = await host.resumeSession();
  assert.deepEqual([resumed.id, resumed.segmentMs, resumed.elapsedMs >= state.elapsedMs], [a.id, 1800, true]);
  const a4 = await capture(host, a.id);
  assert.deepEqual([a4.id, a4.startMs], ['moment-4', a3.endMs], 'the resumed capture continues after the archived passages');
  state = await until(t, analysed(host, 4), 'the resumed passage');
  assert.deepEqual([state.readOnly, state.accepting], [false, true]);
  // The recap works again, and only now: what waited since the archive is finally summarised.
  await until(t, async () => { const r = await host.recapState(); return r.pendingCount === 0 && r.overviewSourceIds.length === 4; }, 'the recap catches up after the resume', 1000);
  await assert.rejects(host.resumeSession(), /Aucune session ouverte en lecture seule/);
  await assert.rejects(host.deleteSession(a.id), error => error.message === 'Arrête la capture avant de supprimer cette session.');
  await host.stop();
  host.events.length = 0;
  const gone = await host.deleteSession(a.id);
  assert.equal(gone.deleted, true); assert.ok(gone.freedBytes > 0);
  assert.equal(fs.existsSync(folder(a.id)), false, 'the loaded session is sealed, then removed whole');
  assert.equal(await host.state(), null); assert.ok(host.events.some(e => e.channel === 'watch:reset'));
  for (let i = 0; i < 3; i++) { t.mock.timers.tick(1000); await pause(5); }
  assert.equal(fs.existsSync(folder(a.id)), false, 'no late write brings a deleted session back');
  assert.deepEqual((await host.sessions()).sessions, []);
  assert.deepEqual((await host.savedMoments()).map(m => m.id), [kept.id], 'kept moments are not deleted with their session');
});

test('a question neither suspends nor cancels the surveillance; quitting archives, and the next start finds the session and its registry', async t => {
  const { folder: sessionFolder, launch } = await stage(t);
  const manualTurns = [], cancellations = [];
  let host = await launch({ wrap: { verifier: adapter => ({
    ...adapter,
    verify: input => {
      const turn = { ...deferred(), claim: input.claim };
      manualTurns.push(turn);
      return turn.promise;
    },
    cancel: () => {
      cancellations.push(manualTurns.length);
      manualTurns.at(-1)?.reject(new Error('Vérification annulée.'));
    },
  }) } });
  assert.equal(host.started, true, host.failures.join(' '));
  await assert.rejects(host.startSurveillance({ instruction: 'Vérifie les chiffres annoncés.' }), /Démarre une session/);
  const session = await host.start();
  let watching = await host.startSurveillance({ instruction: 'Vérifie les chiffres annoncés.' });
  // The host answers at once, before the folder of the session has been read: the state says so ("restoring", no
  // activation number yet) instead of passing for a surveillance already at work. It is ready a moment later.
  assert.deepEqual([watching.enabled, watching.sessionId, watching.activity.state, watching.registry.ready, watching.activation.id], [true, session.id, 'restoring', false, null]);
  watching = await until(t, async () => { const s = await host.surveillanceState(); return s.registry.ready && s; }, 'the session folder read');
  assert.deepEqual([watching.enabled, watching.activity.state, watching.registry.status, watching.activation.id], [true, 'listening', 'ready', 'act-1']);
  const verifying = host.verify('Apollo 11 a aluni en 1970.').then(result => ({ result }), error => ({ error }));
  await waitUntil(() => manualTurns.length === 1, 'the controlled manual verifier entered');
  assert.equal((await host.verificationState()).busy, true);
  // The simulated perception describes a passage by its number of images and the simulated research derives a
  // stable verdict from the claim: take a number whose verdict has a source (one in five has none).
  const { SimulatedSurveillanceAgent } = require('../adapters/simulated-surveillance-agent.cjs'), simulated = new SimulatedSurveillanceAgent();
  let frames = 0;
  for (let n = 1; n <= 8 && !frames; n++) {
    const { claims } = await simulated.detect({ instruction: 'Vérifie les chiffres annoncés.', passages: [{ id: 'moment-1', transcript: '', summary: '', visual: `${n} images reçues.`, uncertainty: '' }] });
    const { verdicts } = await simulated.verify({ claims: claims.map((claim, i) => ({ id: `claim-${i + 1}`, ...claim })) });
    if (verdicts.length === 1 && verdicts[0].assessment !== 'insufficient') frames = n;
  }
  assert.ok(frames, 'the simulated agent sources at least one of eight figures');
  // Only what starts after the activation is read.
  const first = await capture(host, session.id, { after: Math.ceil(watching.activation.t0Ms) + 1, frames });
  await until(t, analysed(host, 1), 'the passage');
  // The simulated agent takes 200 ms to read and 1.5 s to check: a verification lot is now in flight.
  watching = await until(t, async () => { const s = await host.surveillanceState(); return s.activity.running === 1 && s; }, 'a verification in flight', 100);
  assert.deepEqual([watching.activity.state, watching.counts.running, watching.overlay.cards.length], ['verifying', 1, 0]);
  assert.equal((await host.state()).asking, false, 'surveillance alone never marks a question pending');
  // A question arrives meanwhile (the simulated chat agent takes 2.5 s).
  const asked = await host.ask('Que voit-on maintenant ?');
  await until(t, async () => (await host.deepState()).jobs.at(-1).status === 'running', 'a running question');
  watching = await host.surveillanceState();
  assert.deepEqual([watching.enabled, watching.activity.state, watching.counts.running, watching.counts.cancelled], [true, 'verifying', 1, 0], 'the question did not preempt the verification');
  assert.deepEqual([(await host.verificationState()).busy, cancellations], [true, []], 'capture, surveillance and question leave manual verification running');
  manualTurns[0].resolve({
    normalizedClaim: manualTurns[0].claim, assessment: 'insufficient', conclusion: 'Recherche terminée sans preuve.', sources: [], limitations: [],
  });
  assert.equal((await bounded(verifying)).result?.assessment, 'insufficient', 'manual verification finishes normally during the question');
  assert.deepEqual((await host.verificationState()).jobs.map(job => job.status), ['done']);
  assert.equal((await host.deepState()).jobs.at(-1).status, 'running');
  const cancelled = assert.rejects(host.verify('Une autre affirmation.'), /Vérification annulée/);
  await waitUntil(() => manualTurns.length === 2, 'another manual verification entered');
  await host.cancelVerification();
  assert.equal(await bounded(cancelled), undefined);
  assert.deepEqual([(await host.verificationState()).busy, cancellations], [false, [2]], 'the explicit cancel channel reaches the manual verifier');
  assert.equal((await host.surveillanceState()).enabled, true, 'manual cancellation leaves surveillance enabled');
  assert.equal((await host.deepState()).jobs.at(-1).status, 'running', 'manual cancellation leaves the question running');
  // The verification completes while the question is still running: both really overlap.
  const withCard = await until(t, async () => { const s = await host.surveillanceState(); return s.overlay.cards.length === 1 && s; }, 'a sourced card', 100);
  assert.equal((await host.deepState()).jobs.at(-1).status, 'running', 'the card arrived during the question');
  const card = withCard.overlay.cards[0];
  assert.deepEqual([card.kind, card.label, card.sources.length > 0, withCard.counts.sourced, withCard.counts.cancelled], ['verification', 'Sources consultées', true, 1, 0]);
  assert.ok(host.events.some(e => e.channel === 'surveillance:state' && e.value.overlay.cards.length === 1), 'results are pushed, not polled');
  // A source is opened by lot and index, and only if it is a public https page: a simulated one never is.
  await assert.rejects(host.openSurveillanceSource(card.id, 0), error => error.message === 'Source indisponible.');
  await assert.rejects(host.openSurveillanceSource('lot-404', 0), error => error.message === 'Source indisponible.');
  assert.deepEqual(host.opened, []);
  const done = await until(t, async () => { const job = (await host.deepState()).jobs.at(-1); return job.status === 'done' && job; }, 'the answer', 500);
  assert.equal(done.id, asked.id); assert.ok(done.result.citations.length);
  assert.equal((await host.surveillanceState()).enabled, true, 'still watching after the answer');
  const history = await host.surveillanceHistory();
  assert.deepEqual(history.claims.map(c => [c.status, c.origin.passageId]), [['sourced', 'moment-1']]);
  assert.ok(history.passages.length >= 1, 'the full registry carries the cursor');
  await assert.rejects(host.retrySurveillanceClaim('claim-1'), /ne peut pas être relancé/);

  // Quit while capturing: the session is archived whole, with the last surveillance states.
  const cancelledAtQuit = assert.rejects(host.verify('Encore une affirmation.'), /Vérification annulée/);
  await waitUntil(() => manualTurns.length === 3, 'a manual verification still running at quit');
  await host.quit();
  assert.equal(await bounded(cancelledAtQuit), undefined);
  assert.deepEqual(cancellations, [2, 3], 'manual verification is cancelled by its own button and at quit, nowhere else');
  const folder = sessionFolder(session.id);
  assert.equal(JSON.parse(await fsp.readFile(path.join(folder, 'manifest.json'), 'utf8')).state, 'archived');
  assert.equal(await fsp.readFile(path.join(folder, 'media', 'moment-1.webm'), 'utf8'), first.clip);
  const registry = JSON.parse(await fsp.readFile(path.join(folder, 'surveillance.json'), 'utf8'));
  assert.deepEqual([registry.enabled, registry.activation.stopReason, registry.claims.map(c => c.status)], [false, 'Application fermée.', ['sourced']]);
  const written = async name => (await fsp.stat(path.join(folder, name), { bigint: true })).mtimeNs;
  assert.ok(await written('surveillance.json') <= await written('manifest.json'), 'the last surveillance write precedes the closing of the session');
  const before = await digest(folder);

  // Next start of the app: nothing is swept, the session is listed as an archive and opens with its registry.
  host = await launch();
  assert.deepEqual(await digest(folder), before, 'starting the app cleans nothing');
  assert.deepEqual((await host.sessions()).sessions.map(s => [s.id, s.state, s.media.stored]), [[session.id, 'archived', 1]]);
  await host.openSession(session.id);
  const reopened = await host.surveillanceState();
  assert.deepEqual([reopened.enabled, reopened.restored, reopened.sessionId, reopened.overlay.cards.map(c => c.id), reopened.counts.sourced], [false, true, session.id, [card.id], 1]);
  assert.deepEqual((await host.deepState()).jobs.map(j => [j.id, j.status]), [[asked.id, 'done']]);
  for (let i = 0; i < 5; i++) { t.mock.timers.tick(1000); await pause(5); }
  assert.deepEqual(await digest(folder), before, 'the reopened registry is shown, never rewritten');
  // Leaving the archive: the registry goes with its session, and the folder is still what it was.
  await host.newSession();
  const idle = await host.surveillanceState();
  assert.deepEqual([idle.enabled, idle.sessionId, idle.restored, idle.overlay.cards.length, idle.activity.state], [false, null, false, 0, 'idle']);
  assert.deepEqual(await digest(folder), before, 'closing an archive that was only read leaves it untouched');
});

for (const code of ['EIO', 'TVLENS_STORAGE_FULL']) {
  test(`Mac ingestion keeps its original ${code} refusal when the full-disk pause cannot save`, async t => {
    const { launch } = await stage(t);
    const gate = deferred(), publication = deferred();
    const refusal = Object.assign(new Error(`Bloc refusé : ${code}.`), { code });
    let pauses = 0;
    const host = await launch({ wrap: { session: runtime => {
      runtime.watch.ingest = () => gate.promise;
      const pause = runtime.pause;
      runtime.pause = async () => {
        pauses++;
        await pause();
        throw Object.assign(new Error('Sauvegarde de pause refusée.'), { code: 'EIO' });
      };
      return runtime;
    } } });
    assert.equal(host.started, true, host.failures.join(' '));
    const session = await host.start();
    host.onStorage(state => publication.resolve(state));
    const rejected = assert.rejects(host.ingest({
      sessionId: session.id, startMs: 0, endMs: 1, clip: new Uint8Array([1]),
      frames: [{ atMs: 0, dataUrl: 'data:image/jpeg;base64,YQ==' }],
    }), error => error.message === refusal.message);
    gate.reject(refusal);
    await rejected;
    assert.equal(pauses, code === 'TVLENS_STORAGE_FULL' ? 1 : 0);
    assert.equal((await host.state()).accepting, code !== 'TVLENS_STORAGE_FULL');
    if (code === 'TVLENS_STORAGE_FULL') await publication.promise;
    assert.equal(host.events.filter(event => event.channel === 'storage:state').length, code === 'TVLENS_STORAGE_FULL' ? 1 : 0);
  });
}

test('a Mac disk refusal still pending in the pause of A cannot pause the newly loaded B', async t => {
  const storage = deferred(), paused = deferred(), pauseSave = deferred();
  t.after(() => pauseSave.resolve());
  const { launch } = await stage(t);
  const refusal = Object.assign(new Error('Bloc de A refusé faute de place.'), { code: 'TVLENS_STORAGE_FULL' });
  let first = true;
  const host = await launch({ wrap: { session: runtime => {
    if (!first) return runtime;
    first = false;
    runtime.watch.ingest = () => storage.promise;
    const pause = runtime.pause;
    runtime.pause = async () => {
      await pause();
      paused.resolve();
      await pauseSave.promise;
    };
    return runtime;
  } } });
  assert.equal(host.started, true, host.failures.join(' '));
  const a = await host.start();
  const failed = assert.rejects(host.ingest({
    sessionId: a.id, startMs: 0, endMs: 1, clip: new Uint8Array([1]),
    frames: [{ atMs: 0, dataUrl: 'data:image/jpeg;base64,YQ==' }],
  }), error => error.message === refusal.message);
  storage.reject(refusal);
  await paused.promise;
  await host.newSession();
  const b = await host.start();
  assert.notEqual(b.id, a.id);
  pauseSave.reject(Object.assign(new Error('Sauvegarde tardive de A refusée.'), { code: 'EIO' }));
  await failed;
  const state = await host.state();
  assert.deepEqual([state.id, state.accepting], [b.id, true]);
});

test('host settings come from the environment; a full disk stops capture, refuses start and resume and deletes nothing; a mistyped setting refuses the launch', async t => {
  const { folder: sessionFolder, launch } = await stage(t);
  // One archived passage to protect, captured with room to spare.
  let host = await launch({ env: { TVLENS_QUESTION_TIMEOUT_MS: '60000', TVLENS_MEDIA_RETENTION_MS: '300000' } });
  let config = await host.config();
  assert.deepEqual([config.questionTimeoutMs, config.retention, config.retentionMs], [60000, 'until-deleted', null], 'the question ceiling changes, the retired retention does not');
  const session = await host.start();
  await capture(host, session.id);
  const live = await until(t, analysed(host, 1), 'the passage');
  assert.deepEqual([live.retention, live.retentionMs], ['until-deleted', null]);
  await host.ask('Que voit-on maintenant ?');
  assert.equal((await host.deepState()).jobs[0].timeoutMs, 60000, 'the lowered ceiling is the one enforced');
  await host.cancelDeep((await host.deepState()).jobs[0].id);
  await host.quit();
  const folder = sessionFolder(session.id), before = await digest(folder);

  // A disk with room, then low, then under the floor. A sweep that fails is not a reason not to start.
  const GIB = 1024 ** 3, disk = { free: 10 * GIB }, refusal = error => /^Espace disque insuffisant : la capture est suspendue pour ne rien supprimer\./.test(error.message);
  host = await launch({ env: { TVLENS_DISK_MIN_FREE_MB: '1024', TVLENS_DISK_WARN_FREE_MB: '2048' }, disk, sweep: async () => { throw new Error('EACCES'); } });
  assert.deepEqual([host.started, host.sweeps.length], [true, 1], host.failures.join(' '));
  config = await host.config();
  assert.deepEqual([config.questionTimeoutMs, config.retention, config.retentionMs], [300000, 'until-deleted', null]);
  let storage = await host.storage();
  assert.deepEqual([storage.state, storage.freeBytes, storage.minFreeBytes, storage.warnFreeBytes, storage.sessions], ['ok', 10 * GIB, GIB, 2 * GIB, 1]);
  const second = await host.start();
  const kept = await capture(host, second.id);
  await until(t, analysed(host, 1), 'a passage stored with room to spare');
  // Low: said once, when the state changes, from the host's own five-second check. Capture goes on.
  // The publication lists the sessions: made slow here, so that several checks pass while it is still under way.
  const readdir = fsp.readdir, listing = t.mock.method(fsp, 'readdir', async (...args) => { await pause(15); return readdir(...args); });
  disk.free = 1.5 * GIB; host.events.length = 0;
  await until(t, () => host.events.some(e => e.channel === 'storage:state' && e.value.state === 'low'), 'the low state is pushed', 5000);
  for (let i = 0; i < 4; i++) { t.mock.timers.tick(5000); await pause(20); }
  listing.mock.restore();
  assert.equal(host.events.filter(e => e.channel === 'storage:state').length, 1, 'pushed on a change, not on every check, however long the publication takes');
  assert.equal((await host.state()).accepting, true);
  // Under the floor: the next passage is refused before anything is written, capture and its clock stop,
  // and nothing is deleted to make room.
  disk.free = 0.5 * GIB;
  await assert.rejects(capture(host, second.id), refusal);
  let state = await host.state();
  assert.deepEqual([state.accepting, state.storage.state, state.segments.map(s => s.id), refusal({ message: state.lastError })], [false, 'blocked', ['moment-1'], true], 'no passage was created, and the session says why');
  await until(t, () => host.events.some(e => e.channel === 'storage:state' && e.value.state === 'blocked'), 'the blocked state is pushed');
  await pause(20);
  assert.equal((await host.state()).elapsedMs, state.elapsedMs, 'the session clock stopped with the capture');
  assert.equal(await fsp.readFile(path.join(sessionFolder(second.id), 'media', 'moment-1.webm'), 'utf8'), kept.clip);
  assert.deepEqual(await digest(folder), before);
  // Neither the paused session nor an archive can be captured into while the disk is blocked; reading goes on.
  await assert.rejects(host.start(), refusal);
  const question = await host.ask('Que sait-on du passage conservé ?');
  await until(t, async () => (await host.deepState()).jobs.find(job => job.id === question.id)?.status === 'done',
    'questions remain available while capture is blocked', 500);
  await host.openSession(session.id);
  state = await host.state();
  assert.deepEqual([state.readOnly, state.storage.state], [true, 'blocked'], 'the state of the loaded session carries the disk state');
  await assert.rejects(host.resumeSession(), refusal);
  state = await host.state();
  assert.deepEqual([state.readOnly, state.accepting], [true, false]);
  assert.deepEqual(await digest(folder), before);
  await host.newSession();
  await assert.rejects(host.start(), refusal);
  assert.equal(await host.state(), null, 'no new session is created under the floor');
  assert.deepEqual((await host.sessions()).sessions.map(s => [s.id, s.media.stored]).sort(), [[session.id, 1], [second.id, 1]].sort(), 'both sessions are still whole');
  // Room again (the viewer deleted something elsewhere): capture comes back by the same explicit gestures.
  disk.free = 10 * GIB;
  await host.openSession(second.id);
  const resumed = await host.resumeSession();
  assert.equal(resumed.id, second.id);
  assert.equal((await capture(host, second.id)).id, 'moment-2');
  storage = await host.storage();
  assert.deepEqual([storage.state, storage.sessionBytes > 0], ['ok', true]);
  await host.quit();
  assert.deepEqual(await digest(folder), before, 'the archive that was only read is byte for byte what it was');

  // Mistyped settings: the app says so and quits instead of running under another value.
  for (const [name, value, message] of [['TVLENS_QUESTION_TIMEOUT_MS', 'abc', /questionTimeoutMs invalide/], ['TVLENS_QUESTION_TIMEOUT_MS', '300001', /questionTimeoutMs invalide/],
    ['TVLENS_SURVEILLANCE_WORKERS', '4', /surveillance\.workers invalide/], ['TVLENS_DISK_MIN_FREE_MB', 'beaucoup', /TVLENS_DISK_MIN_FREE_MB invalide/],
    ['TVLENS_DISK_WARN_FREE_MB', '-5', /TVLENS_DISK_WARN_FREE_MB invalide/]]) {
    const refused = await launch({ env: { [name]: value } });
    assert.equal(refused.started, false, `${name}=${value}`);
    assert.match(refused.failures.join(' '), message);
  }
  assert.deepEqual(await digest(folder), before);
});

test('an archive kept until deletion keeps that contract on a Mac host set to a rolling window: reopened, resumed and swept, its start is still there and can be re-examined', async t => {
  const { folder, launch } = await stage(t);
  let host = await launch();
  assert.equal(host.started, true, host.failures.join(' '));
  const a = await host.start();
  const a1 = await capture(host, a.id), a2 = await capture(host, a.id);
  await until(t, analysed(host, 2), 'two analysed passages');
  await host.stop(); await host.newSession(); await host.quit();
  const media = name => path.join(folder(a.id), 'media', name);
  assert.deepEqual([await fsp.readFile(media('moment-1.webm'), 'utf8'), await fsp.readFile(media('moment-2.webm'), 'utf8')], [a1.clip, a2.clip]);

  // The same data under a host set back to a rolling window, far shorter than the real time that follows.
  host = await launch({ env: { TVLENS_MEDIA_RETENTION_MS: '50' } });
  const config = await host.config();
  assert.deepEqual([config.retention, config.retentionMs], ['until-deleted', null]);
  await host.openSession(a.id);
  let state = await host.state();
  assert.deepEqual([state.readOnly, state.retention, state.retentionMs, (await host.sessions()).current.retention], [true, 'until-deleted', null, 'until-deleted'], 'the archive states its own contract, not the setting of the host');
  await host.resumeSession();
  // Well past the window on the session clock, then the host's own five-second sweep.
  const sweep = async () => { await pause(150); t.mock.timers.tick(5000); await pause(30); };
  await sweep();
  state = await host.state();
  assert.deepEqual([state.readOnly, state.retention, state.history.length, state.segments.map(s => [s.id, s.available])], [false, 'until-deleted', 0, [['moment-1', true], ['moment-2', true]]]);
  assert.equal(await fsp.readFile(media('moment-1.webm'), 'utf8'), a1.clip);
  assert.equal(await text(await host.fetch(`tvlens-media://${a.id}/moment-1`)), a1.clip);
  // Re-examined by the tools of a question: only the two old passages exist, and the lease finds their real files.
  await host.ask('Que voit-on maintenant ?');
  const answered = await until(t, async () => { const job = (await host.deepState()).jobs.at(-1); return job.status === 'done' && job; }, 'an answer from the start of the archive', 500);
  assert.ok(answered.result.citations.length && answered.result.citations.every(citation => ['moment-1', 'moment-2'].includes(citation.id)));
  // Capture goes on in the resumed archive, and the sweeps that follow still erase nothing of it.
  const a3 = await capture(host, a.id);
  assert.equal(a3.id, 'moment-3');
  await sweep();
  state = await host.state();
  assert.deepEqual([state.history.length, state.segments.map(s => [s.id, s.available])], [0, [['moment-1', true], ['moment-2', true], ['moment-3', true]]]);
  await host.stop(); await host.newSession();

  // Le paramètre retiré reste sans effet sur les nouvelles captures.
  const b = await host.start();
  await capture(host, b.id);
  await until(t, analysed(host, 1), 'the new passage finishes');
  await sweep();
  const durable = await host.state();
  assert.deepEqual([durable.retention, durable.retentionMs, (await host.sessions()).current.retention],
    ['until-deleted', null, 'until-deleted']);
  assert.equal(fs.existsSync(path.join(folder(b.id), 'media', 'moment-1.webm')), true);
  assert.deepEqual([await fsp.readFile(media('moment-1.webm'), 'utf8'), await fsp.readFile(media('moment-3.webm'), 'utf8')], [a1.clip, a3.clip], 'while the archive is still whole');
});

test('ending a Mac session archives it and closes its runtime even when adapters fail to close: the failure goes to the journal and a new session starts', async t => {
  const { folder, launch } = await stage(t), runtimes = [], closed = [];
  const host = await launch({ wrap: {
    // The chat agent fails to close, as when its private directory is still busy.
    conversation: built => { built.agent.close = async () => { closed.push('agent de chat'); throw new Error('EBUSY: resource busy (simulé)'); }; return built; },
    session: runtime => {
      runtimes.push(runtime);
      runtime.perception.close = async () => { closed.push('perception'); throw new Error('perception bloquée (simulé)'); };
      const inspection = runtime.inspectorModel.close?.bind(runtime.inspectorModel);
      runtime.inspectorModel.close = async () => { closed.push('modèle d’inspection'); return inspection?.(); };
      return runtime;
    } } });
  assert.equal(host.started, true, host.failures.join(' '));
  const a = await host.start();
  const a1 = await capture(host, a.id);
  await until(t, analysed(host, 1), 'one analysed passage');
  await host.stop();
  host.events.length = 0;
  assert.equal(await host.newSession(), true, 'the failure of an adapter is not thrown at the viewer');
  assert.deepEqual([closed, runtimes.length, runtimes[0].watch.closed], [['agent de chat', 'perception', 'modèle d’inspection'], 1, true], 'the runtime was closed, every closing attempted');
  assert.deepEqual(host.failures, [`TVLens — fermeture incomplète de la session ${a.id} : agent de chat : EBUSY: resource busy (simulé) ; perception : perception bloquée (simulé)`], 'kept in the journal, not swallowed');
  // Archived whole: listed as an archive, never as a session cut short.
  assert.equal(JSON.parse(await fsp.readFile(path.join(folder(a.id), 'manifest.json'), 'utf8')).state, 'archived');
  assert.equal(await fsp.readFile(path.join(folder(a.id), 'media', 'moment-1.webm'), 'utf8'), a1.clip);
  assert.deepEqual([await host.state(), (await host.sessions()).sessions.map(s => [s.id, s.state, s.passages, s.media.stored])], [null, [[a.id, 'archived', 1, 1]]]);
  assert.ok(host.events.some(e => e.channel === 'watch:reset') && host.events.some(e => e.channel === 'sessions:changed'));

  // A new session starts and captures; quitting archives it the same way, with the same adapters still failing.
  const b = await host.start();
  assert.notEqual(b.id, a.id);
  assert.equal((await capture(host, b.id)).id, 'moment-1');
  await until(t, analysed(host, 1), 'the passage of the new session');
  await host.quit();
  assert.deepEqual([JSON.parse(await fsp.readFile(path.join(folder(b.id), 'manifest.json'), 'utf8')).state, runtimes.length, runtimes[1].watch.closed, host.failures.length], ['archived', 2, true, 2]);
});

test('a Mac session whose final state the disk refuses is not left as an archive that lies: the journal names the file, the runtime is closed, the session is listed as cut short and reopens on its last confirmed state, and a new one starts', async t => {
  const { folder, launch } = await stage(t), runtimes = [];
  const host = await launch({ wrap: { session: runtime => { runtimes.push(runtime); return runtime; } } });
  assert.equal(host.started, true, host.failures.join(' '));
  // The disk refuses session.json, as on EIO or in a directory that is no longer writable: its temporary file
  // is never written, so the file keeps what it held. Media, thumbnails and the manifest still land.
  const writeFile = fsp.writeFile;
  const refusing = () => t.mock.method(fsp, 'writeFile', async (file, ...rest) => {
    if (String(file).endsWith('session.json.tmp')) throw Object.assign(new Error(`EIO: i/o error, write '${file}'`), { code: 'EIO' });
    return writeFile(file, ...rest);
  });
  const journal = id => `TVLens — fermeture incomplète de la session ${id} : archive : Écriture refusée par le disque (session.json) : EIO`;
  const saved = async (id, name) => JSON.parse(await fsp.readFile(path.join(folder(id), name), 'utf8'));
  const a = await host.start();
  await capture(host, a.id);
  await until(t, analysed(host, 1), 'one analysed passage');
  await host.stop();
  const confirmed = await fsp.readFile(path.join(folder(a.id), 'session.json'), 'utf8');
  host.events.length = 0;
  let refused = refusing();
  assert.equal(await host.newSession(), true, 'the host lets go of the session whatever its disk did');
  refused.mock.restore();
  assert.deepEqual(host.failures, [journal(a.id)], 'said in the journal, not swallowed');
  assert.deepEqual([runtimes.length, runtimes[0].watch.closed], [1, true], 'the runtime was closed all the same');
  assert.deepEqual([(await saved(a.id, 'manifest.json')).state, await fsp.readFile(path.join(folder(a.id), 'session.json'), 'utf8') === confirmed], ['live', true], 'nothing on disk says archived, and the state is the last one confirmed');
  assert.deepEqual([await host.state(), (await host.sessions()).sessions.map(s => [s.id, s.state, s.passages, s.media.stored])], [null, [[a.id, 'interrupted', 1, 1]]]);
  assert.ok(host.events.some(e => e.channel === 'watch:reset') && host.events.some(e => e.channel === 'sessions:changed'));

  // Reopened read-only on what the disk confirmed; closing it again has nothing to write, hence nothing to report.
  assert.deepEqual([(await host.openSession(a.id)).readOnly, (await host.state()).segments.map(s => [s.id, s.status, s.available])], [true, [['moment-1', 'ready', true]]]);
  assert.equal(await host.newSession(), true);
  assert.equal(host.failures.length, 1);

  // A new session starts and captures; quitting while the disk refuses again is said the same way.
  const b = await host.start();
  assert.notEqual(b.id, a.id);
  assert.equal((await capture(host, b.id)).id, 'moment-1');
  await until(t, analysed(host, 1), 'the passage of the new session');
  refused = refusing();
  await host.quit();
  refused.mock.restore();
  assert.deepEqual([host.failures, runtimes.length, runtimes[2].watch.closed, (await saved(b.id, 'manifest.json')).state], [[journal(a.id), journal(b.id)], 3, true, 'live']);
});

test('a passage search belongs to the session that asked: its thumbnails are that session’s, and an answer that arrives once another session is loaded is refused', async t => {
  const { launch } = await stage(t);
  // The search of every session can be held back, as a slow semantic ranking holds it.
  let hold = null, entered = 0;
  const host = await launch({ wrap: { session: runtime => {
    const search = runtime.search.search.bind(runtime.search);
    runtime.search.search = async input => { entered++; await hold; return search(input); };
    return runtime;
  } } });
  assert.equal(host.started, true, host.failures.join(' '));
  const holdSearches = () => { let release; hold = new Promise(resolve => { release = resolve; }); return () => { hold = null; release(); }; };
  const image = async background => 'data:image/jpeg;base64,' + (await sharp({ create: { width: 64, height: 36, channels: 3, background } }).jpeg().toBuffer()).toString('base64');
  const imageA = await image({ r: 200, g: 40, b: 40 }), imageB = await image({ r: 40, g: 40, b: 200 });
  assert.notEqual(imageA, imageB);
  // The first passage of a session: moment-1 in each of them, told apart by its image and its clip.
  const first = async (sessionId, dataUrl, clip) => {
    await pause(20);
    const endMs = Math.floor((await host.state()).elapsedMs);
    assert.equal(await host.ingest({ sessionId, startMs: 0, endMs, clip: new Uint8Array(Buffer.from(clip)), audio: null, frames: [{ atMs: 0, dataUrl }] }), 'moment-1');
    await until(t, analysed(host, 1), `the passage of ${clip}`);
  };
  // What a search answer says: the session it is for, and whose image each of its cards carries.
  const seen = found => ({ sessionId: found.sessionId, moments: found.moments.map(m => [m.id, m.preview === imageA ? 'image of A' : m.preview === imageB ? 'image of B' : m.preview]) });
  const search = () => host.searchMoments('cercle').then(seen, error => error.message);

  // B first, archived with its moment-1; then A, live, with a moment-1 of its own.
  const b = await host.start();
  await first(b.id, imageB, 'clip de B');
  await host.stop(); await host.newSession();
  const a = await host.start();
  await first(a.id, imageA, 'clip de A');
  assert.deepEqual(await search(), { sessionId: a.id, moments: [['moment-1', 'image of A']] });

  // Asked in A and still running when the viewer opens B, which also holds a moment-1.
  let release = holdSearches(), before = entered;
  const late = search();
  await until(t, () => entered > before, 'the search of A under way');
  await host.stop();
  await host.openSession(b.id);
  assert.deepEqual(await host.state().then(state => [state.id, state.segments.map(s => [s.id, s.available])]), [b.id, [['moment-1', true]]]);
  release();
  const refused = await late;
  // Asked in B, the same words find the passage of B with the image of B.
  assert.deepEqual(await search(), { sessionId: b.id, moments: [['moment-1', 'image of B']] });
  // A card is replayed at the address of its own session: the moment-1 of A is not served while B is loaded.
  assert.equal((await host.fetch(`tvlens-media://${a.id}/moment-1`)).status, 404);
  assert.equal(await text(await host.fetch(`tvlens-media://${b.id}/moment-1`)), 'clip de B');

  // Asked in B and still running when the session is left: no session is loaded when the answer is ready.
  release = holdSearches(); before = entered;
  const orphan = search();
  await until(t, () => entered > before, 'the search of B under way');
  await host.newSession();
  assert.equal(await host.state(), null);
  release();
  // Neither answer is handed over: not with the thumbnails of the session opened meanwhile, not as a failure of the host.
  assert.deepEqual({ otherSessionLoaded: refused, noSessionLoaded: await orphan }, { otherSessionLoaded: 'Session obsolète.', noSessionLoaded: 'Session obsolète.' });
});

test('the loaded Mac session is pushed every five seconds while it captures, and not at all once a durable session is paused; the retired setting cannot expire paused media', async t => {
  const { folder, launch } = await stage(t);
  let host = await launch();
  assert.equal(host.started, true, host.failures.join(' '));
  const pushed = () => host.events.filter(e => e.channel === 'watch:state');
  // Five seconds of the host's own timer, then the real time its work needs.
  const sweep = async () => { t.mock.timers.tick(5000); await pause(20); };
  const quiet = async () => { await pause(40); host.events.length = 0; };
  const a = await host.start();
  await capture(host, a.id);
  await until(t, analysed(host, 1), 'one analysed passage');
  await quiet();
  for (let i = 0; i < 3; i++) await sweep();
  const clock = pushed().map(e => e.value.elapsedMs);
  assert.deepEqual([clock.length, clock.every((ms, i) => !i || ms > clock[i - 1])], [3, true], 'while it captures, the clock of the session reaches the window at each sweep');
  // Paused: the state shown is the one that holds, for as long as nothing happens.
  await host.stop();
  await quiet();
  for (let i = 0; i < 5; i++) await sweep();
  assert.deepEqual([pushed().length, (await host.state()).accepting, (await host.state()).retention], [0, false, 'until-deleted'], 'paused and kept until deletion: nothing moves, nothing is pushed');
  // Capturing again, pushed again.
  await host.start();
  await quiet();
  await sweep();
  assert.equal(pushed().length, 1);
  await host.stop(); await host.newSession(); await host.quit();

  // Même avec l'ancien réglage, la pause reste silencieuse et les médias restent présents.
  host = await launch({ env: { TVLENS_MEDIA_RETENTION_MS: '50' } });
  const b = await host.start();
  await capture(host, b.id);
  await until(t, analysed(host, 1), 'the passage finishes before pause');
  await host.stop();
  await quiet();
  for (let i = 0; i < 5; i++) await sweep();
  const paused = await host.state();
  assert.deepEqual([paused.accepting, paused.retention, pushed().length], [false, 'until-deleted', 0]);
  assert.equal(fs.existsSync(path.join(folder(b.id), 'media', 'moment-1.webm')), true);

});

test('on the Mac host the draft of an answer reaches the window each time it moves and the disk at most once a second, its last state included when the answer stalls; ending the session saves the final state at once and leaves nothing to write later', async t => {
  const { folder, launch } = await stage(t), turn = {};
  // A chat agent the test drives: its draft moves when the test says so.
  const host = await launch({ wrap: { conversation: built => {
    built.agent.answer = input => new Promise((resolve, reject) => { Object.assign(turn, { progress: input.onProgress, finish: resolve }); input.signal.addEventListener('abort', () => reject(input.signal.reason), { once: true }); });
    return built;
  } } });
  assert.equal(host.started, true, host.failures.join(' '));
  const a = await host.start();
  await capture(host, a.id);
  await until(t, analysed(host, 1), 'one analysed passage');
  const writeFile = fsp.writeFile; let writes = 0;
  t.mock.method(fsp, 'writeFile', async (file, ...rest) => { if (String(file).endsWith('deep-answers.json.tmp')) writes++; return writeFile(file, ...rest); });
  const saved = async id => JSON.parse(await fsp.readFile(path.join(folder(id), 'deep-answers.json'), 'utf8')).jobs.at(-1);
  const draft = words => 'mot '.repeat(words).trim(), moving = words => turn.progress({ message: 'Rédaction de la réponse…', preview: draft(words) });
  await host.ask('Que voit-on maintenant ?');
  await until(t, async () => (await saved(a.id).catch(() => null))?.status === 'running', 'the question saved as soon as it runs');
  await pause(30);
  let before = writes; host.events.length = 0;
  for (let words = 1; words <= 50; words++) moving(words);
  const pushes = host.events.filter(e => e.channel === 'deep:state');
  assert.deepEqual([pushes.length, pushes.at(-1).value.jobs.at(-1).preview], [50, draft(50)], 'each draft reaches the window as it moves');
  await pause(30);
  assert.deepEqual([writes - before, (await saved(a.id)).preview], [0, ''], 'and none of them the disk before its second is over');
  t.mock.timers.tick(1000);
  await until(t, async () => (await saved(a.id)).preview === draft(50), 'the draft the answer stalled on, saved one second later');
  assert.equal(writes - before, 1, 'fifty drafts, one write');
  // The answer moves again, then the session ends with that draft still waiting for its second.
  before = writes; moving(60);
  await host.stop();
  assert.equal(await host.newSession(), true);
  const last = await saved(a.id);
  assert.deepEqual([last.status, last.message, last.preview, JSON.parse(await fsp.readFile(path.join(folder(a.id), 'manifest.json'), 'utf8')).state, host.failures], ['cancelled', 'Nouvelle session.', draft(60), 'archived', []],
    'the final state is on disk before the session is said archived');
  const closed = await digest(folder(a.id)), ended = writes;
  const b = await host.start();
  for (let i = 0; i < 3; i++) { t.mock.timers.tick(1000); await pause(10); }
  assert.deepEqual([await digest(folder(a.id)), writes - ended, fs.existsSync(path.join(folder(b.id), 'deep-answers.json'))], [closed, 0, false], 'no late save: not into the archive, not into the session started since');
});

test('a question is at rest on disk once the write that carries its figures has landed, not as soon as it is published or said finished: held, that write leaves its temporary file in the folder and the store unsettled; landed, the archive holds the answer and nothing else new, and no save follows', async t => {
  const runtimes = [];
  const { folder, launch } = await stage(t), host = await launch({ wrap: { session: runtime => { runtimes.push(runtime); return runtime; } } });
  assert.equal(host.started, true, host.failures.join(' '));
  const a = await host.start();
  await capture(host, a.id);
  await until(t, analysed(host, 1), 'one analysed passage');
  await host.stop(); await host.newSession();
  await host.openSession(a.id);
  const dir = folder(a.id), before = await digest(dir), store = runtimes.at(-1).store;
  const saved = async () => JSON.parse(await fsp.readFile(path.join(dir, 'deep-answers.json'), 'utf8')).jobs.at(-1);
  const temporary = async () => (await fsp.readdir(dir)).filter(name => name.endsWith('.tmp'));
  const apart = lines => lines.filter(line => !line.startsWith('deep-answers.json:'));
  const seconds = async count => { for (let i = 0; i < count; i++) { t.mock.timers.tick(1000); await pause(5); } };
  // The last write of a question, the one that carries its figures, is held between its temporary file and its rename.
  const writeFile = fsp.writeFile, rename = fsp.rename; let writes = 0, figures = false, held = false, release;
  const gate = new Promise(resolve => { release = resolve; });
  t.mock.method(fsp, 'writeFile', async (file, data, ...rest) => {
    if (String(file).endsWith('deep-answers.json.tmp')) { writes++; figures = Boolean(JSON.parse(String(data)).jobs.at(-1).metrics); }
    return writeFile(file, data, ...rest);
  });
  t.mock.method(fsp, 'rename', async (from, to) => {
    if (String(from).endsWith('deep-answers.json.tmp') && figures) { held = true; await gate; }
    return rename(from, to);
  });
  await host.ask('Que voit-on maintenant ?');
  const published = await until(t, async () => { const job = (await host.deepState()).jobs.at(-1); return job.status === 'done' && job.metrics && job; }, 'the question published finished, with its figures', 500);
  await until(t, () => held, 'the last write on its way to the disk');
  let settled = false;
  store.serial.then(() => { settled = true; }, () => { settled = true; });
  await pause(20);
  assert.deepEqual([published.sessionId, Boolean((await saved()).metrics), await temporary(), settled, apart(await digest(dir)).length - apart(before).length], [a.id, false, ['deep-answers.json.tmp'], false, 1],
    'published finished, and not at rest: the figures are not on disk, a temporary file is in the folder, the store has not settled');
  t.diagnostic(`pendant la retenue de la dernière écriture, le fichier sur disque dit déjà : ${(await saved()).status}`);
  // Seconds pass: nothing else is handed to the disk. The save timer has nothing left of this question.
  const handed = writes;
  await seconds(3);
  assert.equal(writes, handed);
  release();
  await store.serial;
  const landed = await digest(dir), last = await saved();
  assert.deepEqual([last.status, Boolean(last.metrics), await temporary(), apart(landed), (await host.state()).readOnly], ['done', true, [], apart(before), true],
    'at rest: the answer with its figures, no temporary file, and nothing else of the archive touched');
  await seconds(3);
  assert.deepEqual([writes, await digest(dir)], [handed, landed], 'and no save follows');
});

const CHAT_ANSWER = { answer: 'Ok.', kind: 'explanation', citations: [], limits: [] };

test('Mac chat overlap still counts an active question of another session without raising asking', async t => {
  const { launch } = await stage(t);
  let deep;
  const host = await launch({ wrap: {
    conversation: built => { deep = built.deep; return built; },
    surveillance: built => { built.agent.detect = async () => ({ claims: [] }); return built; },
  } });
  assert.equal(host.started, true, host.failures.join(' '));
  const session = await host.start();
  const watching = await host.startSurveillance({ instruction: 'Vérifie les chiffres annoncés.' });
  await until(t, async () => (await host.surveillanceState()).registry.ready, 'the surveillance registry read');
  deep.jobs.push({ id: 'foreign', sessionId: 'other-session', status: 'running' });
  try {
    await capture(host, session.id, { after: Math.ceil(watching.activation.t0Ms) + 1 });
    const state = await until(t, async () => {
      const seen = await host.surveillanceState();
      return seen.metrics.detect.calls === 1 && seen;
    }, 'a surveillance reading while the foreign question is active');
    assert.equal(state.metrics.overlap.detectsDuringChat, 1, 'the informative overlap counts every active question');
    assert.equal((await host.state()).asking, false);
  } finally {
    deep.jobs = [];
  }
});

test('Mac question publications only mark the identified session as pending', async t => {
  const { launch } = await stage(t);
  let publish;
  const host = await launch({ wrap: {
    conversation: built => { publish = built.deep.onChange; return built; },
  } });
  assert.equal(host.started, true, host.failures.join(' '));
  const session = await host.start();
  for (const status of ['queued', 'running']) {
    publish({ jobs: [{ id: 'foreign', sessionId: 'other-session', status }] });
    assert.equal((await host.state()).asking, false);
    publish({ jobs: [{ id: 'historical', status }] });
    assert.equal((await host.state()).asking, false);
    publish({ jobs: [{ id: 'own', sessionId: session.id, status }] });
    assert.equal((await host.state()).asking, true);
    publish({ jobs: [{ id: 'own', sessionId: session.id, status: 'done' }] });
    assert.equal((await host.state()).asking, false);
  }
});

test('releasing a Mac question keeps its deferred resumption on A after the host adopts B', async t => {
  const { launch } = await stage(t), runtimes = [], scheduled = [];
  let publish;
  const host = await launch({ wrap: {
    conversation: built => { publish = built.deep.onChange; return built; },
    session: runtime => { runtimes.push(runtime); return runtime; },
  } });
  assert.equal(host.started, true, host.failures.join(' '));
  const a = await host.start();
  publish({ jobs: [{ id: 'own', sessionId: a.id, status: 'running' }] });
  assert.equal((await host.state()).asking, true);
  const microtasks = t.mock.method(globalThis, 'queueMicrotask', callback => scheduled.push(callback));
  publish({ jobs: [] });
  microtasks.mock.restore();
  assert.equal((await host.state()).asking, false);
  assert.equal(scheduled.length, 1);
  await host.stop();
  await host.newSession();
  const b = await host.start();
  assert.notEqual(b.id, a.id);
  assert.equal(runtimes[0].watch.closed, true);
  const drain = t.mock.method(runtimes[1].watch, 'drain');
  scheduled.shift()();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(drain.mock.callCount(), 0, 'A cannot ask the newly adopted B to drain');
  assert.equal((await host.state()).id, b.id);
});

test('the Mac composition journals failed state deliveries and still saves completed questions', async t => {
  const { launch } = await stage(t), saves = [];
  const host = await launch({ wrap: {
    conversation: built => {
      built.agent.answer = async input => { input.onProgress({ message: 'Recherche…' }); return CHAT_ANSWER; };
      return built;
    },
    session: runtime => {
      runtime.perception.observeVisual = async input => {
        input.onProgress('Description…');
        return { observation: { summary: 'Un plateau.', transcript: 'Bonjour.' } };
      };
      const save = runtime.store.saveResearch.bind(runtime.store);
      runtime.store.saveResearch = state => { saves.push(structuredClone(state)); return save(state); };
      return runtime;
    },
  } });
  assert.equal(host.started, true, host.failures.join(' '));
  const unwatch = host.onState(() => { throw Error('fenêtre indisponible pour la session'); });
  const unchat = host.onDeepState(() => { throw Error('fenêtre indisponible pour les questions'); });
  const session = await host.start();
  await capture(host, session.id);
  await until(t, analysed(host, 1), 'analysis completed despite failed state delivery');
  const { id } = await host.ask('Une question ?');
  await until(t, async () => (await host.deepState()).jobs[0]?.status === 'done', 'answer completed despite failed state delivery');
  assert.ok(saves.some(state => state.jobs[0]?.status === 'done' && state.jobs[0]?.metrics), 'the final answer is handed to storage');
  assert.equal((await host.state()).asking, false);
  await host.stop();
  assert.equal(await host.newSession(), true);
  assert.deepEqual((await host.deepState()).jobs, []);
  const diagnostics = host.failures.map(line => JSON.parse(line));
  assert.ok(diagnostics.some(event => event.code === 'TVLENS_EVENT_DELIVERY_FAILED'
    && event.event?.type === 'MemoryInvalidated' && event.event.sessionId === session.id));
  assert.ok(diagnostics.some(event => event.code === 'TVLENS_STATE_PUBLICATION_FAILED'
    && event.origin === 'deep-ask' && event.sessionId === session.id && event.jobId === id));
  assert.ok(diagnostics.every(event => (event.sessionId || event.event?.sessionId) === session.id), 'reset diagnostics still identify the session being left');
  unwatch();
  unchat();
});

for (const visionDuringAsk of [false, true]) {
  test(`a Mac question raises asking while audio continues and vision follows its setting (${visionDuringAsk})`, async t => {
    const { launch } = await stage(t), turn = {}, entered = deferred();
    const audioPublished = deferred(), completed = deferred(), released = deferred();
    const host = await launch({ wrap: {
      conversation: built => {
        built.agent.answer = input => new Promise((resolve, reject) => {
          turn.finish = resolve;
          input.signal.addEventListener('abort', () => reject(input.signal.reason), { once: true });
          entered.resolve();
        });
        return built;
      },
      session: runtime => {
        if (!visionDuringAsk) runtime.watch.visionDuringAsk = false;
        return runtime;
      },
    } });
    assert.equal(host.started, true, host.failures.join(' '));
    const session = await host.start();
    await capture(host, session.id);
    await until(t, analysed(host, 1), 'one analysed passage');
    assert.equal((await host.state()).asking, false, 'no question, no flag');
    host.onState(state => {
      const passage = state?.segments[1];
      if (!passage) return;
      if (passage.audioStatus === 'ready') audioPublished.resolve();
      if (['ready', 'error'].includes(passage.status) || passage.visionStatus === 'error') completed.resolve();
      if (!state.asking) released.resolve();
    });
    await host.ask('Que voit-on maintenant ?');
    await entered.promise;
    assert.equal((await host.state()).asking, true);
    await capture(host, session.id, { audio: new Uint8Array([1]) });
    await audioPublished.promise;
    if (visionDuringAsk) assert.equal(await bounded(completed.promise), undefined, 'vision completes during the pending question');
    const during = await host.state(), passage = during.segments[1];
    assert.equal(during.asking, true, 'perception never finishes the pending question');
    assert.deepEqual([passage.id, passage.status, passage.audioStatus, passage.visionStatus],
      ['moment-2', visionDuringAsk ? 'ready' : 'partial', 'ready', visionDuringAsk ? 'ready' : 'queued']);
    assert.equal(passage.observation.transcript, 'Un cercle se déplace sur un fond bleu.');
    turn.finish(CHAT_ANSWER);
    await released.promise;
    await completed.promise;
    const after = await host.state();
    assert.equal(after.asking, false);
    assert.deepEqual(after.segments.map(s => [s.id, s.status, s.audioStatus, s.visionStatus]),
      [['moment-1', 'ready', 'ready', 'ready'], ['moment-2', 'ready', 'ready', 'ready']]);
  });
}

test('on the Mac host a question reaches the chat agent with the instruction of the surveillance active on the session, and none otherwise', async t => {
  const { launch } = await stage(t), seen = [];
  const host = await launch({ wrap: { conversation: built => {
    built.agent.answer = async input => { seen.push([input.question, input.instruction]); return CHAT_ANSWER; };
    return built;
  } } });
  assert.equal(host.started, true, host.failures.join(' '));
  const a = await host.start();
  await capture(host, a.id);
  await until(t, analysed(host, 1), 'one analysed passage');
  const question = async text => {
    const { id } = await host.ask(text);
    await until(t, async () => (await host.deepState()).jobs.find(job => job.id === id)?.status === 'done', `the answer to: ${text}`);
  };
  const instruction = 'Vérifie tous les chiffres annoncés.';
  await question('Avant toute consigne ?');
  await host.startSurveillance({ instruction });
  await until(t, async () => (await host.surveillanceState()).registry.ready, 'the session folder read by the surveillance');
  await question('Pendant la surveillance ?');
  assert.equal((await host.stopSurveillance()).enabled, false, 'the explicit stop channel stops surveillance');
  await question('Après l’arrêt ?');
  assert.deepEqual(seen, [['Avant toute consigne ?', undefined], ['Pendant la surveillance ?', instruction], ['Après l’arrêt ?', undefined]]);
});

// The host and the source title it gives its conversation. Given windows, the real capture sources list them, as
// desktopCapturer would, instead of the single source of the simulated mode.
async function sourceTitleHost(launch, windows) {
  let getSourceTitle;
  const wrap = {
    conversation: (built, options) => {
      getSourceTitle = options.getSourceTitle;
      return built;
    },
  };
  if (windows) {
    const desktopCapturer = { getSources: async () => windows };
    wrap.captureSources = (built, options) => createCaptureSources({ ...options, smoke: false, desktopCapturer });
  }
  const host = await launch({ wrap });
  assert.equal(host.started, true, host.failures.join(' '));
  assert.equal(typeof getSourceTitle, 'function');
  return { host, getSourceTitle };
}
// As the renderer does before each start or resume: the list of sources first, then the choice.
async function chooseSource(host, id) {
  await host.capture.sources();
  await host.capture.select(id);
}
const WINDOWS = [{ id: 'window:1', name: 'Sintel' }, { id: 'window:2', name: 'Cosmos Laundromat' }];

test('on the Mac host questions are told the captured source name for the loaded session only, never for an archive or without capture', async t => {
  const { launch } = await stage(t);
  const { host, getSourceTitle } = await sourceTitleHost(launch);
  const uncaptured = await host.start();
  assert.equal(getSourceTitle(uncaptured.id), null, 'no source was chosen');
  await host.stop();
  await host.newSession();
  await chooseSource(host, 'test-source');
  const a = await host.start();
  assert.equal(getSourceTitle(a.id), 'Vidéo de démonstration');
  assert.equal(getSourceTitle(uncaptured.id), null, 'another session');
  assert.equal(getSourceTitle(undefined), null);
  await capture(host, a.id);
  await until(t, analysed(host, 1), 'one analysed passage');
  await host.stop();
  assert.equal(getSourceTitle(a.id), 'Vidéo de démonstration', 'a stopped session keeps its source');
  await host.newSession();
  assert.equal(getSourceTitle(a.id), null, 'no session is loaded');
  assert.equal((await host.openSession(a.id)).readOnly, true);
  assert.equal(getSourceTitle(a.id), null, 'an archive opened again has no source');
});

test('on the Mac host a session paused then resumed on another window gives its questions the name of that window', async t => {
  const { launch } = await stage(t);
  const { host, getSourceTitle } = await sourceTitleHost(launch, WINDOWS);
  await chooseSource(host, 'window:1');
  const session = await host.start();
  assert.equal(getSourceTitle(session.id), 'Sintel');
  await host.stop();
  await chooseSource(host, 'window:2');
  assert.equal(getSourceTitle(session.id), 'Sintel', 'a choice alone captures nothing yet');
  assert.equal((await host.start()).id, session.id, 'the same session resumes');
  assert.equal(getSourceTitle(session.id), 'Cosmos Laundromat');
});

test('on the Mac host an archive has no source title until its capture resumes, then the name of the window chosen for it', async t => {
  const { launch } = await stage(t);
  const { host, getSourceTitle } = await sourceTitleHost(launch, WINDOWS);
  await chooseSource(host, 'window:1');
  const session = await host.start();
  await capture(host, session.id);
  await until(t, analysed(host, 1), 'one analysed passage');
  await host.stop();
  await host.newSession();
  assert.equal((await host.openSession(session.id)).readOnly, true);
  assert.equal(getSourceTitle(session.id), null, 'an archive only read has captured nothing');
  await chooseSource(host, 'window:2');
  assert.equal(getSourceTitle(session.id), null, 'a choice alone captures nothing yet');
  assert.equal((await host.resumeSession()).id, session.id);
  assert.equal(getSourceTitle(session.id), 'Cosmos Laundromat');
});

test('on the Mac host both agents are warmed up with the id of the session when it starts or resumes, never when an archive is only read', async t => {
  const calls = [], warming = { rejects: false };
  const prepare = agent => async id => { calls.push(`${agent}:${id}`); if (warming.rejects) throw new Error('warm-up refused'); };
  // Only the pairs matter: the chat agent and the observation agent, each called once, whatever their order.
  const took = () => calls.splice(0).sort();
  const { launch } = await stage(t), host = await launch({ wrap: {
    conversation: built => { built.agent.prepare = prepare('chat'); return built; },
    session: runtime => { runtime.perception.agent = { prepare: prepare('observe') }; return runtime; },
  } });
  assert.equal(host.started, true, host.failures.join(' '));
  const a = await host.start();
  assert.deepEqual(took(), [`chat:${a.id}`, `observe:${a.id}-observe`], 'start warms both agents once, for the new session');
  await capture(host, a.id);
  await until(t, analysed(host, 1), 'one analysed passage');
  await host.stop(); await host.newSession();
  assert.equal((await host.openSession(a.id)).readOnly, true);
  assert.deepEqual(took(), [], 'a passage, stop, a new session and an archive opened read-only warm nothing');
  await host.resumeSession();
  assert.deepEqual(took(), [`chat:${a.id}`, `observe:${a.id}-observe`], 'resume warms both again, for the same session');
  // A warm-up that fails is the provider’s business: neither the resume nor the start is refused for it.
  warming.rejects = true;
  await host.stop(); await host.newSession();
  await host.openSession(a.id);
  assert.equal((await host.resumeSession()).id, a.id);
  assert.deepEqual(took(), [`chat:${a.id}`, `observe:${a.id}-observe`], 'the rejecting warm-ups were asked all the same');
  await host.stop(); await host.newSession();
  const b = await host.start();
  assert.deepEqual([took(), host.failures], [[`chat:${b.id}`, `observe:${b.id}-observe`], []], 'a rejecting warm-up fails neither start nor the host');
});

test('Mac IPC reads and pushes share the public projection without legacy snapshots', async t => {
  const { launch } = await stage(t);
  let runtime, clock = 0;
  const host = await launch({ readClock: () => clock, wrap: { session: built => {
    runtime = built;
    return built;
  } } });
  assert.equal(host.started, true, host.failures.join(' '));
  await host.capture.sources();
  await host.capture.select('test-source');
  const session = await host.start();
  const legacy = runtime.watch.snapshot.bind(runtime.watch);
  const snapshot = t.mock.method(runtime.watch, 'snapshot');
  const projection = t.mock.method(runtime.memoryProjection, 'read');
  const received = [[], []];
  const subscriptions = received.map(values => host.onState(state => values.push(state)));
  try {
    clock = 1000;
    const read = await host.state();
    assert.equal(snapshot.mock.callCount(), 0, 'IPC reads never construct the domain snapshot');
    assert.equal(projection.mock.callCount(), 1);
    assert.match(read.title, /^Vidéo de démonstration · /);
    const expected = () => ({ ...legacy(), title: read.title, transcription: runtime.transcriber.availability() });
    assert.deepStrictEqual(read, expected());
    runtime.watch.emit();
    assert.equal(snapshot.mock.callCount(), 0, 'the domain invalidation builds no snapshot');
    assert.equal(projection.mock.callCount(), 2, 'one projection serves the pushed state');
    for (const values of received) assert.deepStrictEqual(values, [expected()]);
    assert.deepStrictEqual(await host.state(), received[0][0]);
    assert.equal(snapshot.mock.callCount(), 0, 'reading the pushed state adds no legacy work');
    assert.equal(projection.mock.callCount(), 3, 'an explicit read consults fresh public ports');
    assert.equal(read.id, session.id);
  } finally {
    for (const unsubscribe of subscriptions) unsubscribe();
    snapshot.mock.restore();
    projection.mock.restore();
  }
});

test('Mac projection retains textless queues, acquired usage, save failures, history and storage through IPC', async t => {
  const audio = deferred(), visual = deferred(), audioEntered = deferred(), visionEntered = deferred();
  const partial = deferred(), complete = deferred();
  t.after(() => {
    audio.resolve({ observation: { transcript: 'Paroles' }, elapsedMs: 20, cost: 0.125 });
    visual.resolve({ observation: { summary: 'Images' }, elapsedMs: 30, cost: 0.25 });
  });
  const { launch } = await stage(t);
  let runtime, publishQuestion, clock = 0;
  const host = await launch({ readClock: () => clock, wrap: {
    conversation: built => { publishQuestion = built.deep.onChange; return built; },
    session: built => {
      runtime = built;
      built.watch.visionDuringAsk = false;
      built.perception.transcribe = () => { audioEntered.resolve(); return audio.promise; };
      built.perception.observeVisual = () => { visionEntered.resolve(); return visual.promise; };
      return built;
    },
  } });
  assert.equal(host.started, true, host.failures.join(' '));
  const session = await host.start();
  const legacy = runtime.watch.snapshot.bind(runtime.watch);
  const title = (await host.state()).title;
  host.onState(state => {
    if (state.segments[0]?.audioStatus === 'ready') partial.resolve();
    if (state.segments[0]?.status === 'ready') complete.resolve();
  });
  const latest = async () => {
    const state = await host.state();
    assert.deepStrictEqual(state, { ...legacy(), title, transcription: runtime.transcriber.availability() });
    return state;
  };
  const pushed = () => host.events.filter(event => event.channel === 'watch:state').at(-1).value;
  runtime.watch.history.push({ id: 'moment-0', startMs: 0, endMs: 1000, status: 'expired', summary: 'Début conservé' });
  runtime.watch.questions.push({ question: 'Question historique', answer: { text: 'Réponse conservée' } });
  publishQuestion({ jobs: [{ id: 'own', sessionId: session.id, status: 'running' }] });
  clock = 2000;
  await host.ingest({ sessionId: session.id, startMs: 1000, endMs: 2000,
    clip: new Uint8Array([1]), audio: new Uint8Array([1]), frames: [{ atMs: 1000, dataUrl: 'data:image/jpeg;base64,YQ==' }] });
  await audioEntered.promise;
  assert.deepStrictEqual(pushed(), await latest());
  audio.resolve({ observation: { transcript: 'Paroles' }, elapsedMs: 20, cost: 0.125 });
  await bounded(partial.promise);
  const waiting = await latest();
  assert.deepEqual([waiting.asking, waiting.analyzing, waiting.pending, waiting.audioPending, waiting.visionPending], [true, false, 1, 0, 1]);
  assert.equal(waiting.apiCost, 0.125);
  assert.equal(waiting.coverage.passages, 2);
  assert.deepStrictEqual(pushed(), waiting);
  publishQuestion({ jobs: [] });
  await visionEntered.promise;
  const active = await latest();
  assert.deepEqual([active.asking, active.analyzing, active.visionPending, active.apiCalls], [false, true, 0, 1]);
  assert.equal(active.segments[0].observation.summary, undefined, 'activity changes before new text exists');
  assert.equal(pushed().apiCalls, 0, 'an explicit read observes acquired usage before the next publication');
  visual.resolve({ observation: { summary: 'Images' }, elapsedMs: 30, cost: 0.25 });
  await bounded(complete.promise);
  await runtime.store.flush();
  const ready = await latest();
  assert.deepStrictEqual(pushed(), ready);
  assert.deepEqual([ready.apiCalls, ready.apiCost, ready.latency.audioMs.mean, ready.latency.visionMs.mean], [1, 0.375, 20, 30]);
  assert.equal(ready.storage.sessionBytes > 0, true);
  assert.equal(ready.history[0].summary, 'Début conservé');
  assert.equal(ready.questions[0].answer.text, 'Réponse conservée');
  const saving = t.mock.method(runtime.store, 'save', async () => { throw Object.assign(Error('refus'), { code: 'EIO' }); });
  await runtime.watch.persist();
  assert.ok((await latest()).lastError);
  assert.deepStrictEqual(pushed(), await latest());
  saving.mock.restore();
  await runtime.watch.persist();
  assert.equal((await latest()).lastError, null);
  assert.deepStrictEqual(pushed(), await latest());
  assert.equal('asking' in runtime.memory.view().session, false);
  assert.equal('questions' in runtime.memory.view(), false);
});

test('Mac session switching detaches publications before draining and before reopening the same identity', async t => {
  const draining = deferred(), release = deferred(), runtimes = [], publications = [];
  t.after(() => release.resolve());
  const { launch } = await stage(t);
  const host = await launch({ wrap: {
    session: (built, options) => {
      runtimes.push(built);
      publications.push(options.onInvalidate);
      return built;
    },
    closing: (close, options) => close({ ...options, steps: options.steps.map(([name, work]) => [name, async () => {
      if (name === 'capture') {
        draining.resolve();
        await release.promise;
      }
      return work();
    }]) }),
  } });
  assert.equal(host.started, true, host.failures.join(' '));
  const a = await host.start();
  runtimes[0].watch.questions.push({ question: 'Question historique', answer: { text: 'Conservée' } });
  await host.stop();
  const late = runtimes[0].watch.onInvalidate;
  const old = runtimes[0].watch.snapshot();
  const invalidation = { type: 'MemoryInvalidated', sessionId: a.id };
  host.events.length = 0;
  late(invalidation);
  assert.equal(host.events.filter(event => event.channel === 'watch:state').length, 1, 'the live relay reaches the host');
  const opening = host.openSession(a.id);
  try {
    await draining.promise;
    host.events.length = 0;
    late(invalidation);
    assert.deepEqual(host.events.filter(event => event.channel === 'watch:state'), [], 'no state is pushed while switching');
  } finally {
    release.resolve();
    await opening;
  }
  assert.equal(runtimes.length, 2);
  assert.equal((await host.state()).readOnly, true);
  assert.deepEqual((await host.state()).questions, old.questions);
  host.events.length = 0;
  late(invalidation);
  assert.deepEqual(host.events.filter(event => event.channel === 'watch:state'), [], 'an old runtime cannot publish into a new one with the same id');
  // Le callback retenu éprouve l'identité même après détachement de son relais.
  publications[0](invalidation);
  assert.deepEqual(host.events.filter(event => event.channel === 'watch:state'), [], 'the host also rejects a retained callback of the same id');
  runtimes[1].watch.emit();
  const reopened = host.events.filter(event => event.channel === 'watch:state');
  assert.equal(reopened.length, 1, 'the reopened runtime has its own live subscription');
  assert.equal(reopened[0].value.readOnly, true);
  await host.newSession();
  const b = await host.start();
  assert.notEqual(b.id, a.id);
  host.events.length = 0;
  late(invalidation);
  publications[0](invalidation);
  assert.deepEqual(host.events.filter(event => event.channel === 'watch:state'), [], 'A cannot publish after B is adopted');
  assert.equal((await host.state()).id, b.id);
  assert.deepEqual((await host.state()).questions, []);
  await host.quit();
  host.events.length = 0;
  late(invalidation);
  publications[0](invalidation);
  assert.deepEqual(host.events.filter(event => event.channel === 'watch:state'), [], 'a closed window receives no late state');
});

test('Mac startup exposes transcription availability before capture and publishes its coded cause with session states', async t => {
  const { launch, userData } = await stage(t);
  const configFile = path.join(userData, 'speech.env');
  await fsp.writeFile(configFile, 'TVLENS_WHISPER_MODEL=/missing/private-model.bin\nTVLENS_WHISPER_BINARY=/missing/whisper\n');
  const host = await launch({ flags: ['--live-inspection', '--config=' + configFile] });
  assert.equal(host.started, true, host.failures.join(' '));
  const availability = (await host.config()).transcription;
  assert.deepEqual(availability, { available: false, code: 'TVLENS_WHISPER_MODEL_MISSING' });
  const session = await host.start();
  assert.equal((await host.state()).id, session.id);
  assert.deepEqual((await host.state()).transcription, availability);
  assert.deepEqual(host.events.filter(event => event.channel === 'watch:state').at(-1).value.transcription, availability);
});

test('Mac recap follows passage events without session state publications and waits for both lanes', async t => {
  const visual = deferred(), visionEntered = deferred(), complete = deferred();
  let runtime;
  const { launch } = await stage(t);
  const host = await launch({ wrap: { session: built => {
    runtime = built;
    built.watch.onInvalidate = () => {};
    built.perception.transcribe = async () => ({ observation: { transcript: 'Paroles seules' } });
    built.perception.observeVisual = async () => {
      visionEntered.resolve();
      await visual.promise;
      return { observation: { summary: 'Images et paroles' } };
    };
    built.events.subscribe(event => {
      if (event.type === 'PassageUpdated' && built.memory.passage(event.passageId)?.status === 'ready') complete.resolve(event);
    });
    return built;
  } } });
  assert.equal(host.started, true, host.failures.join(' '));
  const session = await host.start();
  await capture(host, session.id, { audio: new Uint8Array([1]) });
  await visionEntered.promise;
  t.mock.timers.tick(1000);
  const partial = await host.recapState();
  assert.equal(partial.sourceCount, 0);
  assert.ok(partial.limits.includes('1 passage(s) avec une analyse partielle, non inclus dans le résumé.'));
  visual.resolve();
  const event = await complete.promise;
  await tick();
  assert.equal((await host.recapState()).sourceCount, 1);
  t.mock.timers.tick(1000);
  await until(t, async () => (await host.recapState()).status === 'ready', 'recap synthesized from the passage event');
  const ready = await host.recapState();
  assert.deepEqual(ready.overviewSourceIds, ['moment-1']);
  assert.match(ready.sourcePassages[0].text, /Images et paroles/);
  runtime.events.publish(event);
  await tick();
  assert.deepEqual(await host.recapState(), ready);
});

test('Mac closing detaches recap before capture drains and preserves the archived chapters through a late analysis', async t => {
  const visual = deferred(), visionEntered = deferred(), thumbnail = deferred(), thumbnailEntered = deferred();
  const captureEntered = deferred();
  let runtime, saves = 0;
  const { launch, folder } = await stage(t);
  t.after(() => {
    visual.resolve();
    thumbnail.resolve();
  });
  const host = await launch({ wrap: {
    closing: (close, options) => close({ ...options, steps: options.steps.map(([name, work]) => [name, () => {
      if (name === 'capture') captureEntered.resolve();
      return work();
    }]) }),
    session: built => {
      runtime = built;
      built.perception.transcribe = async () => ({ observation: { transcript: 'Paroles' } });
      built.perception.observeVisual = async input => {
        if (input.id === 'moment-2') {
          visionEntered.resolve();
          await visual.promise;
        }
        return { observation: { summary: 'Sujet ' + input.id } };
      };
      const save = built.store.saveRecap.bind(built.store);
      built.store.saveRecap = state => {
        saves++;
        return save(state);
      };
      const put = built.thumbnails.put.bind(built.thumbnails);
      built.thumbnails.put = async (id, ...args) => {
        if (id === 'moment-2') {
          thumbnailEntered.resolve();
          await thumbnail.promise;
        }
        return put(id, ...args);
      };
      return built;
    },
  } });
  assert.equal(host.started, true, host.failures.join(' '));
  const session = await host.start();
  await capture(host, session.id);
  await until(t, async () => (await host.state()).segments[0]?.status === 'ready', 'first complete passage');
  t.mock.timers.tick(1000);
  await until(t, async () => (await host.recapState()).status === 'ready', 'first chapter');
  const ready = await host.recapState();
  const ingesting = capture(host, session.id);
  await thumbnailEntered.promise;
  await visionEntered.promise;
  const delivered = deferred();
  runtime.events.subscribe(event => {
    if (event.type === 'PassageUpdated' && runtime.memory.passage(event.passageId)?.status === 'ready') delivered.resolve(event);
  });
  const beforeClosing = saves;
  const ending = host.quit();
  await captureEntered.promise;
  assert.equal((await host.recapState()).sessionId, null, 'recap reset precedes the capture step');
  visual.resolve();
  const event = await delivered.promise;
  await tick();
  assert.equal((await host.recapState()).sessionId, null, 'late passage events cannot rebind the recap during capture');
  assert.equal(saves, beforeClosing, 'late analysis requests no recap save while capture is draining');
  thumbnail.resolve();
  await ingesting;
  await ending;
  const archived = JSON.parse(await fsp.readFile(path.join(folder(session.id), 'living-recap.json'), 'utf8'));
  assert.deepEqual(archived.chapters, ready.chapters);
  const empty = await host.recapState();
  runtime.events.publish({ ...event, revision: event.revision + 1 });
  await tick();
  assert.equal(saves, beforeClosing);
  assert.deepEqual(await host.recapState(), empty);
});

test('Mac quitting saves a completed synthesis while session closing waits for the current transition', async t => {
  const synthesis = deferred();
  const synthesisEntered = deferred();
  const pauseEntered = deferred();
  const pauseReleased = deferred();
  const recapReady = deferred();
  let runtime;
  const { launch, folder } = await stage(t);
  const host = await launch({ wrap: {
    recap: adapter => ({ ...adapter, summarize: input => {
      synthesisEntered.resolve(input);
      return synthesis.promise;
    } }),
    session: built => {
      runtime = built;
      const pause = built.pause;
      built.pause = async () => {
        pauseEntered.resolve();
        await pauseReleased.promise;
        return pause();
      };
      return built;
    },
  } });
  assert.equal(host.started, true, host.failures.join(' '));
  host.onRecap(state => {
    if (state.status === 'ready') recapReady.resolve(state);
  });
  const session = await host.start();
  await capture(host, session.id);
  await until(t, analysed(host, 1), 'complete passage before synthesis');
  t.mock.timers.tick(1000);
  const input = await synthesisEntered.promise;
  const stopping = host.stop();
  let quitting;
  let ready;
  try {
    await pauseEntered.promise;
    quitting = host.quit();
    synthesis.resolve({
      overview: 'Synthèse achevée pendant la fermeture.',
      chapters: [{ title: 'Sujet observé', summary: 'Chapitre conservé.', sourceIds: input.sourcePassages.map(p => p.id) }],
    });
    ready = await recapReady.promise;
    assert.equal(ready.sessionId, session.id, 'the queued closing has not reset the recap');
    await runtime.store.flush();
    const saved = JSON.parse(await fsp.readFile(path.join(folder(session.id), 'living-recap.json'), 'utf8'));
    assert.equal(saved.pendingCount, 0, 'a completed synthesis is saved even after before-quit');
    assert.deepEqual(saved.chapters, ready.chapters);
  } finally {
    pauseReleased.resolve();
    await stopping;
    await quitting;
  }
  const archived = JSON.parse(await fsp.readFile(path.join(folder(session.id), 'living-recap.json'), 'utf8'));
  assert.deepEqual(archived.chapters, ready.chapters);
  assert.equal(archived.pendingCount, 0);
});

test('Mac configuration imports keep the same persisted account in diagnostics and provider clients', async t => {
  const { launch, userData } = await stage(t);
  const authHome = path.join(userData, 'chosen-account');
  const configFile = path.join(userData, 'import.env');
  await fsp.mkdir(authHome);
  await fsp.writeFile(configFile, 'OPENROUTER_MODEL=example/model\n');
  await fsp.writeFile(path.join(userData, 'installation.json'), JSON.stringify({ paths: { codexAuthHome: authHome }, completed: true }));
  let client;
  const host = await launch({ dialogSelection: { canceled: false, filePaths: [configFile] },
    wrap: { conversation: built => { client = built.agent; return built; } } });
  assert.equal(host.started, true, host.failures.join(' '));
  await host.importConfig();
  assert.equal((await host.setupStatus()).paths.codexAuthHome, authHome);
  assert.equal(client.authHome, authHome);
});


test('Mac startup and cancelled or temporary imports never probe the keychain', async t => {
  const { launch, userData } = await stage(t);
  const configFile = path.join(userData, 'optional.env');
  await fsp.writeFile(configFile, 'OPENROUTER_API_KEY=temporary-secret\n');
  for (const dialogChoice of [2, 1]) {
    let accesses = 0;
    const host = await launch({ dialogSelection: { canceled: false, filePaths: [configFile] },
      dialogChoice, storageAccess: () => { accesses++; } });
    assert.equal(host.started, true, host.failures.join(' '));
    assert.equal(accesses, 0);
    const config = await host.importConfig();
    assert.equal(config.hasKey, dialogChoice === 1);
    assert.equal(accesses, 0);
    await assert.rejects(fsp.access(path.join(userData, 'provider.enc')), { code: 'ENOENT' });
    await host.quit();
  }
});

test('capture preview requests cross preload and host as an explicit boolean without starting a session', async t => {
  const { launch } = await stage(t);
  const requests = [];
  const host = await launch({ wrap: { captureSources: async built => {
    const adapter = await built;
    return { ...adapter, sources: options => {
      requests.push(options);
      return adapter.sources(options);
    } };
  } } });
  assert.equal(host.started, true, host.failures.join(' '));
  await host.capture.sources();
  const preview = await host.capture.sources({ previews: true, width: 9000 });
  await host.capture.sources({ previews: 'yes' });
  assert.deepEqual(requests.slice(-3), [{ previews: false }, { previews: true }, { previews: false }]);
  assert.equal(preview.sources[0].thumbnail, undefined, 'smoke mode does not manufacture a source screenshot');
  assert.equal(await host.state(), null);
});
