const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const Module = require('node:module');
const { EventEmitter } = require('node:events');
const { createHash, randomUUID } = require('node:crypto');
const sharp = require('sharp');

// The Mac host without Electron. First the contract read statically from the two files; then the real
// app/main.cjs and app/preload.cjs wired to each other through a stand-in for Electron (simulated agents,
// temporary user data, virtual timers). The native window, capture and renderer are not covered here.
const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const mainSource = read('app/main.cjs'), preloadSource = read('app/preload.cjs');
const realTimeout = globalThis.setTimeout;
const pause = ms => new Promise(resolve => realTimeout(resolve, ms));
const SESSION = '0f8fad5b-d9cb-469f-a165-70867728950e';

// Section 5.2 of the mission contract: bridge method, sample call, channel and payload sent to the host.
const CONTRACT_CALLS = [
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
// What the bridge already offered before the mission and still offers.
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

test('every bridge call has its handler, every event its listener, and the host no longer purges, preempts or knows Auto', () => {
  const all = (source, pattern) => [...new Set([...source.matchAll(pattern)].map(match => match[1]))].sort();
  const bridge = loadBridge();
  // Call every method once: the channels are those the preload really uses, not a reading of its text.
  for (const api of [bridge.tvlens, bridge.capture]) for (const method of Object.values(api)) method(() => {});
  const invoked = [...new Set(bridge.invoked.map(call => call.channel))].sort(), listened = [...bridge.listeners.keys()].sort();
  // handle('…') is the guarded IPC registration of the host (protocol.handle is not IPC); send('…') covers both
  // its guarded helper and direct webContents.send calls.
  const handled = all(mainSource, /(?<![.\w])handle\(\s*'([^']+)'/g), sent = all(mainSource, /\bsend\(\s*'([^']+)'/g);
  assert.deepEqual(invoked, handled, 'bridge calls and host handlers are the same set: no dead channel on either side');
  assert.deepEqual(sent, listened, 'host events and bridge listeners are the same set');
  for (const channel of [...handled, ...sent]) assert.doesNotMatch(channel, /^auto:/, channel);
  for (const channel of ['surveillance:state', 'surveillance:history', 'surveillance:start', 'surveillance:stop', 'surveillance:retry', 'surveillance:open-source',
    'sessions:list', 'sessions:open', 'sessions:resume', 'sessions:delete', 'sessions:storage']) assert.ok(handled.includes(channel), channel);
  for (const channel of ['surveillance:state', 'sessions:changed', 'storage:state', 'watch:state', 'watch:reset']) assert.ok(sent.includes(channel), channel);
  // Durable sessions: no general sweep at start, at a new session or at quit. Decision 8: nothing manual
  // suspends or cancels the surveillance, and a question no longer cancels the manual verification.
  for (const gone of ['cleanupRawMedia', 'prioritizeManual', 'auto-monitor', 'AutoMonitor', 'autoAgent', 'saveAuto', 'retentionMs: 300000', 'retentionMs:300000'])
    assert.ok(!mainSource.includes(gone), `app/main.cjs still contains ${gone}`);
  assert.equal(fs.existsSync(path.join(root, 'core', 'auto-monitor.cjs')), false, 'core/auto-monitor.cjs is removed');
  assert.equal([...mainSource.matchAll(/verifierAdapter\??\.cancel\?\.\(\)/g)].length, 2, 'the manual verification is cancelled by its own button and at quit, nowhere else');
  assert.match(mainSource, /handle\('verify:cancel', \(\) => verifierAdapter\.cancel\?\.\(\)\)/);
  assert.equal([...mainSource.matchAll(/surveillance\.stop\(/g)].length, 1, 'only the explicit stop channel stops the surveillance');
  assert.match(mainSource, /handle\('surveillance:stop', \(\) => surveillance\.stop\(/);
  // The surveillance agent is its own: never the chat agent, never the manual verification adapter.
  const composition = mainSource.slice(mainSource.indexOf('createSurveillanceRuntime({'), mainSource.indexOf('surveillanceTimer = setInterval'));
  assert.match(composition, /agent: smoke && [^,]*new SimulatedSurveillanceAgent\(/);
  assert.doesNotMatch(composition, /videoAgent|verifierAdapter/);
  assert.match(mainSource, /sweepStaleContexts\(\)\)\.catch\(/, 'stale Codex contexts are swept once at start, without failing it');
  // A question may run five minutes: like production, the simulated and the fallback configuration let vision go on meanwhile.
  assert.match(mainSource, /model: 'test\/fake', visionDuringAsk: true \}/);
  assert.match(mainSource, /audioInput: true, visionDuringAsk: process\.env\.TVLENS_VISION_DURING_ASK !== '0' \}/);
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

// Loads app/main.cjs in its own simulated mode with `electron` replaced. IPC goes through the real preload,
// structured-cloned both ways and with Electron's error prefix, as between two processes. Two things of the
// machine are kept out: the sweep of stale Codex contexts (a test run must not clean a real temporary directory)
// and, when `disk` is given, the free space measured by the real DiskGuard (its documented `freeBytes` option).
// `wrap` hands a test what the host composes ({ conversation, session }): to make an adapter fail, or to see it closed.
async function launch(userData, { env = {}, sweep = async () => [], disk = null, wrap = {} } = {}) {
  const handlers = new Map(), schemes = new Map(), opened = [], failures = [], sweeps = [];
  let bridge, finished, loaded;
  const quitting = new Promise(resolve => { finished = resolve; }), ready = new Promise(resolve => { loaded = resolve; });
  const webContents = { mainFrame: {}, setWindowOpenHandler() {}, on() {}, send: (channel, value) => bridge.deliver(channel, value === undefined ? undefined : structuredClone(value)) };
  class BrowserWindow {
    constructor() { this.webContents = webContents; }
    isDestroyed() { return false; } getBounds() { return { x: 0, y: 0, width: 1340, height: 920 }; } getContentBounds() { return { x: 0, y: 0, width: 1340, height: 892 }; }
    loadFile() { loaded(true); return Promise.resolve(); } show() {} focus() {} setMinimumSize() {} setAlwaysOnTop() {} setBounds() {}
  }
  const app = Object.assign(new EventEmitter(), { isPackaged: false, setName() {}, setPath() {}, getPath: () => userData, requestSingleInstanceLock: () => true, whenReady: () => Promise.resolve(),
    // As Electron does: quitting asks first, and a handler may hold it back until its own work is done.
    quit() { const event = { prevented: false, preventDefault() { this.prevented = true; } }; app.emit('before-quit', event); if (!event.prevented) { finished(); loaded(false); } } });
  const electron = { app, BrowserWindow, ipcMain: { handle: (channel, handler) => handlers.set(channel, handler) },
    protocol: { registerSchemesAsPrivileged() {}, handle: (scheme, handler) => schemes.set(scheme, handler) },
    globalShortcut: { register: () => true, unregister() {}, unregisterAll() {} }, desktopCapturer: { getSources: async () => [] },
    session: { defaultSession: { setDisplayMediaRequestHandler() {} } }, systemPreferences: { getMediaAccessStatus: () => 'granted' },
    shell: { openExternal: async url => { opened.push(url); } }, dialog: { showErrorBox() {}, showOpenDialog: async () => ({ canceled: true }) },
    safeStorage: { isEncryptionAvailable: () => false }, screen: { getDisplayMatching: () => ({ workArea: { x: 0, y: 0, width: 1920, height: 1080 } }) } };
  const sender = { sender: webContents, senderFrame: webContents.mainFrame };
  bridge = loadBridge(async (channel, ...args) => {
    try { const result = await handlers.get(channel)(sender, ...structuredClone(args)); return result === undefined ? undefined : structuredClone(result); }
    catch (error) { throw new Error(`Error invoking remote method '${channel}': ${error}`); }
  });
  const argv = [...process.argv], saved = Object.fromEntries(HOST_SETTINGS.map(name => [name, process.env[name]])), consoleError = console.error, load = Module._load;
  const restore = () => { process.argv.splice(0, process.argv.length, ...argv); for (const name of HOST_SETTINGS) if (saved[name] === undefined) delete process.env[name]; else process.env[name] = saved[name]; console.error = consoleError; };
  for (const name of HOST_SETTINGS) delete process.env[name];
  Object.assign(process.env, env); process.argv.push('--smoke-test');
  console.error = error => failures.push(String(error?.message || error));
  Module._load = function (request, parent, ...rest) {
    if (request === 'electron') return electron;
    const loaded = load.call(this, request, parent, ...rest);
    if (!parent?.filename?.endsWith(path.join('app', 'main.cjs'))) return loaded;
    if (request === '../adapters/codex-confinement.cjs') return { ...loaded, sweepStaleContexts: (...args) => { sweeps.push(args); return sweep(); } };
    // Measured afresh at every check, so that a change of free space is seen at once instead of five seconds later.
    if (request === '../adapters/disk-guard.cjs' && disk) return { ...loaded, DiskGuard: class extends loaded.DiskGuard { constructor(options) { super({ ...options, freeBytes: async () => disk.free, maxAgeMs: 0 }); } } };
    if (request === '../runtime/conversation-runtime.cjs' && wrap.conversation) return { ...loaded, createConversationRuntime: options => wrap.conversation(loaded.createConversationRuntime(options)) };
    if (request === '../runtime/session-runtime.cjs' && wrap.session) return { ...loaded, createSessionRuntime: options => wrap.session(loaded.createSessionRuntime(options)) };
    return loaded;
  };
  try { delete require.cache[require.resolve('../app/main.cjs')]; require('../app/main.cjs'); }
  catch (error) { restore(); throw error; }
  finally { Module._load = load; }
  const started = await ready;
  let stopped;
  const host = { ...bridge.tvlens, capture: bridge.capture, started, failures, opened, handlers, sweeps, events: [],
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
  t.after(async () => { for (const host of hosts) await host.quit().catch(() => {}); await fsp.rm(userData, { recursive: true, force: true }); });
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
async function capture(host, sessionId, { after = 0, frames = 1 } = {}) {
  jpeg ||= 'data:image/jpeg;base64,' + (await sharp({ create: { width: 64, height: 36, channels: 3, background: { r: 23, g: 57, b: 82 } } }).jpeg().toBuffer()).toString('base64');
  await pause(20);
  const state = await host.state(), startMs = Math.max(after, state.segments.at(-1)?.endMs ?? 0), endMs = Math.floor(state.elapsedMs), clip = `clip ${startMs}`;
  assert.ok(endMs > startMs, 'the session clock moved');
  const id = await host.ingest({ sessionId, startMs, endMs, clip: new Uint8Array(Buffer.from(clip)), audio: null, frames: Array.from({ length: frames }, () => ({ atMs: startMs, dataUrl: jpeg })) });
  return { id, startMs, endMs, clip };
}
const analysed = (host, count) => async () => { const state = await host.state(); return state?.segments.length === count && state.segments.every(s => s.status === 'ready' && s.thumbnailAvailable !== undefined) && state; };
const text = async response => Buffer.from(await response.arrayBuffer()).toString();

test('a Mac session is archived instead of purged, listed, reopened read-only without a write, resumed only explicitly, and deleted alone', async t => {
  const { folder, launch } = await stage(t), host = await launch();
  assert.equal(host.started, true, host.failures.join(' '));
  // An IPC call from anywhere but the main frame of the window is refused before any handler runs.
  assert.throws(() => host.handlers.get('watch:state')({ sender: {}, senderFrame: {} }), /Unauthorized/);
  const config = await host.config();
  assert.deepEqual([config.questionTimeoutMs, config.questionQueueLimit, config.retention, config.retentionMs], [300000, 5, 'until-deleted', null]);
  assert.equal(await host.state(), null);
  assert.deepEqual((await host.sessions()).sessions, [], 'nothing is created, and nothing swept, by starting the app');
  assert.deepEqual(host.sweeps, [[]], 'stale Codex contexts are swept once at start, in the default temporary directory');
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
  await until(t, async () => JSON.parse(await fsp.readFile(path.join(folder(a.id), 'deep-answers.json'), 'utf8')).jobs.at(-1).status === 'done', 'the answer saved in the archive');
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
  let host = await launch();
  assert.equal(host.started, true, host.failures.join(' '));
  await assert.rejects(host.startSurveillance({ instruction: 'Vérifie les chiffres annoncés.' }), /Démarre une session/);
  const session = await host.start();
  let watching = await host.startSurveillance({ instruction: 'Vérifie les chiffres annoncés.' });
  // The host answers at once, before the folder of the session has been read: the state says so ("restoring", no
  // activation number yet) instead of passing for a surveillance already at work. It is ready a moment later.
  assert.deepEqual([watching.enabled, watching.sessionId, watching.activity.state, watching.registry.ready, watching.activation.id], [true, session.id, 'restoring', false, null]);
  watching = await until(t, async () => { const s = await host.surveillanceState(); return s.registry.ready && s; }, 'the session folder read');
  assert.deepEqual([watching.enabled, watching.activity.state, watching.registry.status, watching.activation.id], [true, 'listening', 'ready', 'act-1']);
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
  // A question arrives meanwhile (the simulated chat agent takes 2.5 s).
  const asked = await host.ask('Que voit-on maintenant ?');
  await until(t, async () => (await host.deepState()).jobs.at(-1).status === 'running', 'a running question');
  watching = await host.surveillanceState();
  assert.deepEqual([watching.enabled, watching.activity.state, watching.counts.running, watching.counts.cancelled], [true, 'verifying', 1, 0], 'the question did not preempt the verification');
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
  await host.quit();
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

test('host settings come from the environment; a full disk stops capture, refuses start and resume and deletes nothing; a mistyped setting refuses the launch', async t => {
  const { folder: sessionFolder, launch } = await stage(t);
  // One archived passage to protect, captured with room to spare.
  let host = await launch({ env: { TVLENS_QUESTION_TIMEOUT_MS: '60000', TVLENS_MEDIA_RETENTION_MS: '300000' } });
  let config = await host.config();
  assert.deepEqual([config.questionTimeoutMs, config.retention, config.retentionMs], [60000, 'rolling', 300000], 'both rollbacks are read and published');
  const session = await host.start();
  await capture(host, session.id);
  const live = await until(t, analysed(host, 1), 'the passage');
  assert.deepEqual([live.retention, live.retentionMs], ['rolling', 300000]);
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
    ['TVLENS_SURVEILLANCE_WORKERS', '4', /surveillance\.workers invalide/], ['TVLENS_MEDIA_RETENTION_MS', '-1', /TVLENS_MEDIA_RETENTION_MS invalide/], ['TVLENS_DISK_MIN_FREE_MB', 'beaucoup', /TVLENS_DISK_MIN_FREE_MB invalide/],
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
  assert.deepEqual([config.retention, config.retentionMs], ['rolling', 50]);
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

  // The window of this host is real: a session born under it promised nothing and does expire.
  const b = await host.start();
  await capture(host, b.id);
  const rolling = await until(t, async () => { await pause(60); const s = await host.state(); return [...s.history, ...s.segments].some(p => p.id === 'moment-1' && !p.available) && s; }, 'the passage of a rolling session expires', 5000);
  assert.deepEqual([rolling.retention, rolling.retentionMs, (await host.sessions()).current.retention], ['rolling', 50, 'rolling']);
  assert.equal(fs.existsSync(path.join(folder(b.id), 'media', 'moment-1.webm')), false);
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
