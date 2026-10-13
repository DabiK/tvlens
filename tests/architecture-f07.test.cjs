const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const Module = require('node:module');
const { EventEmitter } = require('node:events');
const { createHash } = require('node:crypto');
const sharp = require('sharp');
const { HeadlessRuntime } = require('../runtime/headless-runtime.cjs');
const { RemoteServer } = require('../server/http.cjs');

// F07: the end of a loaded session follows one protocol on both hosts (runtime/session-closing.cjs). First the
// protocol alone, on doubles. Then the same scenarios on the two real compositions, each behind its own adapter: the
// real app/main.cjs and app/preload.cjs through a stand-in for Electron (IPC), and a real HeadlessRuntime behind a real
// RemoteServer on the loopback (HTTP). Offline: simulated providers, temporary directories, no window, no capture, no
// TV. Answers, files, journal lines and the order of closing steps are compared: nothing here measures a latency.
const root = path.join(__dirname, '..');
const protocol = () => require('../runtime/session-closing.cjs');
// Real time, whatever a test does to the timers of the host it runs.
const realTimeout = globalThis.setTimeout;
const pause = ms => new Promise(resolve => realTimeout(resolve, ms));
const tick = () => new Promise(resolve => setImmediate(resolve));
// Real sockets and files are on the way: wait for the fact itself, and fail instead of hanging.
const until = async (check, what, rounds = 600) => { for (let i = 0; i < rounds; i++) { const value = await check(); if (value) return value; await pause(5); } assert.fail('never reached: ' + what); };
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
const there = target => fsp.access(target).then(() => true, () => false);
// Every file under a directory with the hash of its content: equal only when nothing was added, removed or rewritten.
async function tree(dir, base = dir) {
  const rows = [];
  for (const entry of (await fsp.readdir(dir, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
    const target = path.join(dir, entry.name), name = path.relative(base, target);
    if (entry.isDirectory()) rows.push([name, 'dir'], ...await tree(target, base));
    else rows.push([name, createHash('sha256').update(await fsp.readFile(target)).digest('hex')]);
  }
  return rows;
}
let frame;
const jpeg = async () => (frame ||= (await sharp({ create: { width: 64, height: 36, channels: 3, background: '#264136' } }).jpeg().toBuffer()).toString('base64'));
// A chat agent the test drives. It answers at once unless `hold` is set for the next question: the draft of that one
// moves when the test says so, and its answer comes when the test hands it, or when its question is given up.
function chatDouble() {
  const chat = { hold: false, turn: null };
  chat.answer = input => {
    if (!chat.hold) return Promise.resolve({ answer: 'Réponse à : ' + input.question, kind: 'explanation', citations: [], limits: [] });
    chat.hold = false;
    return new Promise((resolve, reject) => {
      chat.turn = { progress: input.onProgress, finish: () => resolve({ answer: 'Réponse tardive', kind: 'explanation', citations: [], limits: [] }) };
      input.signal.addEventListener('abort', () => reject(input.signal.reason), { once: true });
    });
  };
  return chat;
}
// The closing work of a host says when it is entered, under the name of its step.
const recorded = (order, target, method, step) => { const original = target[method].bind(target); target[method] = (...args) => { order.push(step); return original(...args); }; };

// ---- The protocol alone, on doubles ---------------------------------------------------------------------------------

// A session runtime and a library that only say what they were asked, and what a host hands over when it has nothing
// particular to say.
function stage({ archive, seal, remove, onDisk = true, closeErrors = [] } = {}) {
  const calls = [], journal = [];
  const session = { id: 'session-1', watch: { ending: false }, closeErrors,
    archive: async () => { calls.push('archive'); if (archive) throw archive; },
    seal: async () => { calls.push('seal'); if (seal) throw seal; } };
  const library = { folder: async id => { calls.push('folder ' + id); if (!onDisk) throw new Error('Session introuvable.'); return '/sessions/' + id; },
    remove: async id => { calls.push('remove ' + id); if (remove) throw remove; return { id, freedBytes: 42 }; } };
  const host = { session, library, empty: () => false, begin: ['début', () => { calls.push('begin'); }], steps: [], letGo: () => { calls.push('letGo'); }, log: line => journal.push(line) };
  return { calls, journal, session, host };
}
const LINE = (errors, id = 'session-1') => `TVLens — fermeture incomplète de la session ${id} : ${errors.join(' ; ')}`;
const outcome = (fields = {}) => ({ id: 'session-1', archived: false, freedBytes: 0, errors: [], refused: null, ...fields });

test('the closing protocol raises the end of the session and runs what its host must not delay before anything is awaited, then every step in the order of the host, and only then decides what becomes of the session', async () => {
  const { closeSession } = protocol(), s = stage();
  const closing = closeSession({ ...s.host,
    empty: () => { s.calls.push('empty?'); return false; },
    begin: ['début', () => { s.calls.push('begin, ending ' + s.session.watch.ending); }],
    steps: [['un', () => { s.calls.push('un'); }], ['deux', async () => { await tick(); s.calls.push('deux'); }], ['trois', () => { s.calls.push('trois'); }]] });
  // The call has come back and nothing was awaited yet: the first step is entered in that same turn.
  const atOnce = [...s.calls];
  assert.deepEqual({ atOnce, ended: await closing, calls: s.calls, journal: s.journal }, {
    atOnce: ['begin, ending true', 'un'], ended: outcome({ archived: true }),
    calls: ['begin, ending true', 'un', 'deux', 'trois', 'empty?', 'archive', 'letGo'], journal: [] });
});

test('a closing step that fails stops nothing: what the host must not delay, a step that throws and one that rejects are each kept under the name of their step, in a bounded text, the others are attempted, the session is archived, and one line of the journal says it all with what the runtime failed to close', async () => {
  const { closeSession } = protocol(), s = stage({ closeErrors: ['perception : perception bloquée'] });
  const ended = await closeSession({ ...s.host,
    begin: ['début', () => { s.calls.push('begin'); throw new Error('révocation impossible'); }],
    steps: [['un', () => { s.calls.push('un'); throw new Error('levée'); }], ['deux', async () => { s.calls.push('deux'); await tick(); throw new Error('x'.repeat(300)); }],
      ['trois', () => { s.calls.push('trois'); return Promise.reject('refus sans erreur'); }], ['quatre', () => { s.calls.push('quatre'); }]] });
  const errors = ['début : révocation impossible', 'un : levée', 'deux : ' + 'x'.repeat(200), 'trois : refus sans erreur', 'perception : perception bloquée'];
  assert.deepEqual({ calls: s.calls, ended, journal: s.journal }, { calls: ['begin', 'un', 'deux', 'trois', 'quatre', 'archive', 'letGo'], ended: outcome({ archived: true, errors }), journal: [LINE(errors)] });
});

test('what becomes of a session that ends: archived, and never said archived when its archive is refused; when its host finds it empty, sealed, let go, and only then erased if it ever reached the disk, a seal or an erasure that fails being said without holding the host back', async () => {
  const { closeSession } = protocol(), empty = { empty: () => true };
  const run = async (doubles, host) => { const s = stage(doubles); return { ended: await closeSession({ ...s.host, ...host }), calls: s.calls, journal: s.journal }; };
  const refused = ['archive : Écriture refusée par le disque (session.json) : EIO'];
  assert.deepEqual(await run({ archive: new Error('Écriture refusée par le disque (session.json) : EIO') }), { ended: outcome({ errors: refused }), calls: ['begin', 'archive', 'letGo'], journal: [LINE(refused)] });
  assert.deepEqual(await run({}, empty), { ended: outcome({ freedBytes: 42 }), calls: ['begin', 'seal', 'letGo', 'folder session-1', 'remove session-1'], journal: [] });
  assert.deepEqual(await run({ onDisk: false }, empty), { ended: outcome(), calls: ['begin', 'seal', 'letGo', 'folder session-1'], journal: [] }, 'a session that never reached the disk has nothing to erase');
  assert.deepEqual(await run({ seal: new Error('store occupé') }, empty), { ended: outcome({ errors: ['scellement : store occupé'] }), calls: ['begin', 'seal', 'letGo'], journal: [LINE(['scellement : store occupé'])] }, 'nothing is erased unless the store is really sealed');
  assert.deepEqual(await run({ remove: new Error('EACCES: permission denied') }, empty), { ended: outcome({ errors: ['effacement : EACCES: permission denied'] }), calls: ['begin', 'seal', 'letGo', 'folder session-1', 'remove session-1'], journal: [LINE(['effacement : EACCES: permission denied'])] });
});

test('an explicit deletion erases nothing unless the store is really sealed: refused, the host is let go of the session all the same, the journal says it with what the runtime failed to close, and the very error of the refusal is handed back for whoever asked', async () => {
  const { closeSession } = protocol(), deletion = { remove: true, empty: () => assert.fail('an explicit deletion does not ask whether the session is empty') };
  const deleted = stage();
  assert.deepEqual({ ended: await closeSession({ ...deleted.host, ...deletion }), calls: deleted.calls, journal: deleted.journal }, { ended: outcome({ freedBytes: 42 }), calls: ['begin', 'seal', 'letGo', 'folder session-1', 'remove session-1'], journal: [] });
  const sealing = new Error('scellement refusé'), unsealed = stage({ seal: sealing, closeErrors: ['perception : perception bloquée'] });
  const kept = await closeSession({ ...unsealed.host, ...deletion }), said = ['scellement : scellement refusé', 'perception : perception bloquée'];
  assert.equal(kept.refused, sealing, 'the error itself, not a copy of it');
  assert.deepEqual({ ended: { ...kept, refused: null }, calls: unsealed.calls, journal: unsealed.journal }, { ended: outcome({ errors: said }), calls: ['begin', 'seal', 'letGo'], journal: [LINE(said)] });
  const erasing = new Error('EACCES: permission denied'), stuck = stage({ remove: erasing });
  const left = await closeSession({ ...stuck.host, ...deletion });
  assert.equal(left.refused, erasing);
  assert.deepEqual({ ended: { ...left, refused: null }, calls: stuck.calls, journal: stuck.journal }, { ended: outcome({ errors: ['effacement : EACCES: permission denied'] }), calls: ['begin', 'seal', 'letGo', 'folder session-1', 'remove session-1'], journal: [LINE(['effacement : EACCES: permission denied'])] });
});

test('a callback of the host that fails neither stops what follows nor replaces why a deletion was refused; a session whose host cannot say whether it is empty is kept; with no session loaded only the steps of the host are run', async () => {
  const { closeSession } = protocol();
  // The host fails to let go and its journal fails too, during a deletion the seal refuses.
  const sealing = new Error('scellement refusé'), a = stage({ seal: sealing });
  const refused = await closeSession({ ...a.host, remove: true, letGo: () => { a.calls.push('letGo'); throw new Error('hôte occupé'); }, log: line => { a.journal.push(line); throw new Error('journal fermé'); } });
  assert.equal(refused.refused, sealing);
  assert.deepEqual({ errors: refused.errors, calls: a.calls, journal: a.journal }, { errors: ['scellement : scellement refusé', 'hôte : hôte occupé'], calls: ['begin', 'seal', 'letGo'], journal: [LINE(['scellement : scellement refusé', 'hôte : hôte occupé'])] });
  // The host fails to let go of an empty session: sealed, its folder is erased all the same.
  const b = stage();
  assert.deepEqual({ ended: await closeSession({ ...b.host, empty: () => true, letGo: () => { throw new Error('hôte occupé'); } }), calls: b.calls }, { ended: outcome({ freedBytes: 42, errors: ['hôte : hôte occupé'] }), calls: ['begin', 'seal', 'folder session-1', 'remove session-1'] });
  const c = stage();
  assert.deepEqual({ ended: await closeSession({ ...c.host, empty: () => { throw new Error('état illisible'); } }), calls: c.calls }, { ended: outcome({ archived: true, errors: ['archive : état illisible'] }), calls: ['begin', 'archive', 'letGo'] });
  const d = stage();
  const none = await closeSession({ ...d.host, session: null, steps: [['agent de chat', () => { d.calls.push('agent de chat'); throw new Error('EBUSY'); }]] });
  assert.deepEqual({ ended: none, calls: d.calls, journal: d.journal }, { ended: outcome({ id: null, errors: ['agent de chat : EBUSY'] }), calls: ['begin', 'agent de chat', 'letGo'], journal: [LINE(['agent de chat : EBUSY'], '(aucune)')] });
});

test('settling the questions cancels them with the reason of the end, waits for each to reach its final state, and hands over what still waited to be saved, whatever the cancellation did', async () => {
  const { settleQuestions } = protocol(), seen = [], running = deferred();
  const deep = { jobs: [{ done: running.promise }, { done: Promise.reject(new Error('interrompue')) }], cancelAll: reason => { seen.push('cancelAll ' + reason); } };
  const settling = settleQuestions(deep, 'Session terminée.', () => seen.push('save')).then(() => seen.push('settled'));
  await tick();
  const waiting = [...seen];
  running.resolve(); await settling;
  const refused = [];
  await assert.rejects(settleQuestions({ jobs: [], cancelAll: () => { throw new Error('annulation impossible'); } }, 'Session terminée.', () => refused.push('save')), /annulation impossible/);
  assert.deepEqual({ waiting, seen, refused }, { waiting: ['cancelAll Session terminée.'], seen: ['cancelAll Session terminée.', 'save', 'settled'], refused: ['save'] });
});

// ---- The server host: a real HeadlessRuntime behind a real RemoteServer on the loopback -----------------------------
// As tests/server-sessions.test.cjs builds them: simulated providers, a temporary root, a clock and a journal held by
// the test. The assembly of a block is a double: no media tool runs.
async function serverHost(t) {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'tvlens-f07-server-')), sessionsRoot = path.join(dir, 'sessions');
  const journal = [], order = [], chat = chatDouble(), token = '7'.repeat(64), image = await jpeg();
  let clock = 0, sequence = 0, stopped;
  const agent = { answer: input => chat.answer(input), close: async () => { order.push('agent de chat'); } };
  const media = { assemble: async input => ({ ...input, clip: Buffer.from('clip ' + input.startMs), frames: [{ atMs: input.startMs, dataUrl: 'data:image/jpeg;base64,' + image }], audio: null }) };
  const runtime = new HeadlessRuntime({ userData: dir, sessionsRoot, config: {}, selectedModels: {}, smoke: true, agent, readClock: () => clock, log: line => journal.push(line) });
  const server = await new RemoteServer({ runtime, media, token }).listen(0, '127.0.0.1');
  // What a stop of the service runs, in its order (server/main.cjs): the server, then the runtime.
  const stop = () => (stopped ||= (async () => { await server.close(); await runtime.close(); })());
  t.after(async () => { chat.turn?.finish(); await stop(); await fsp.rm(dir, { recursive: true, force: true }); });
  recorded(order, runtime, 'cancelPreparations', 'préparations'); recorded(order, runtime.surveillance, 'reset', 'surveillance'); recorded(order, runtime.deep, 'cancelAll', 'questions');
  const req = async (route, body) => {
    const res = await fetch(server.url + route, { method: body === undefined ? 'GET' : 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: res.status, value: await res.json() };
  };
  return { name: 'server', journal, order, chat, agent, folder: id => path.join(sessionsRoot, id), runtime: () => runtime.session, lastEnd: () => runtime.lastEnd,
    // The reason this adapter gives a session it ends, and the order this host keeps for its closing steps.
    reason: 'Session terminée.', closing: { paused: ['préparations', 'capture', 'questions', 'surveillance', 'agent de chat', 'archive'], capturing: ['préparations', 'capture', 'questions', 'surveillance', 'agent de chat', 'archive'] },
    start: async () => { const { value } = await req('/v1/session/start', {}); recorded(order, runtime.session, 'pause', 'capture'); recorded(order, runtime.session, 'archive', 'archive'); return value.id; },
    // One captured block of 8 s after the last one, sent once the session clock has reached its end.
    send: async id => {
      const { session } = (await req('/v1/state')).value, startMs = session.segments.at(-1)?.endMs ?? 0, endMs = startMs + 8000;
      clock += Math.max(0, endMs - session.elapsedMs);
      const sent = await req('/v1/segments', { sessionId: id, sequence: ++sequence, startMs, endMs, frames: [{ atMs: startMs, data: 'YQ==' }] });
      return sent.value.id ?? sent.value.error;
    },
    pause: () => req('/v1/session/pause', {}),
    end: () => req('/v1/session/end', {}),
    endAnswer: ({ id, archived, errors = [] }) => ({ status: 200, value: { ended: true, id, archived, ...(errors.length ? { errors } : {}) } }),
    remove: async id => { const answer = await req(`/v1/sessions/${id}/delete`, {}); return answer.status === 200 && answer.value.deleted ? 'deleted' : answer.value.error; },
    open: async id => (await req(`/v1/sessions/${id}/open`, {})).value.readOnly,
    ask: async (id, question) => (await req('/v1/questions', { sessionId: id, question, anchorMs: 0 })).value.id,
    jobs: async () => (await req('/v1/state')).value.chat.jobs,
    state: async () => (await req('/v1/state')).value.session,
    rows: async () => (await req('/v1/sessions')).value.sessions.map(s => [s.id, s.state, s.passages, s.media.stored]),
    stopHost: stop };
}

// ---- The Mac host: the real app/main.cjs behind the real app/preload.cjs, without Electron --------------------------
// The harness of tests/mac-ipc-contract.test.cjs, reduced to what this file needs: simulated agents (no provider, no
// capture, no window), a user-data directory of its own, and the timers of the host held still, so that its recap, its
// surveillance and its sweeps write nothing while a scenario compares a folder.
const HOST_SETTINGS = ['TVLENS_QUESTION_TIMEOUT_MS', 'TVLENS_SURVEILLANCE_WORKERS', 'TVLENS_MEDIA_RETENTION_MS', 'TVLENS_DISK_MIN_FREE_MB', 'TVLENS_DISK_WARN_FREE_MB', 'TVLENS_VISION_DURING_ASK'];
function loadPreload(invoke) {
  const exposed = {}, listeners = new Map();
  const ipcRenderer = { invoke, on: (channel, callback) => { listeners.set(channel, [...(listeners.get(channel) || []), callback]); }, removeListener() {} };
  new Function('require', fs.readFileSync(path.join(root, 'app', 'preload.cjs'), 'utf8'))(() => ({ contextBridge: { exposeInMainWorld: (key, api) => { exposed[key] = api; } }, ipcRenderer }));
  return { ...exposed, deliver: (channel, value) => (listeners.get(channel) || []).forEach(callback => callback({}, value)) };
}
async function macHost(t) {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
  const userData = await fsp.mkdtemp(path.join(os.tmpdir(), 'tvlens-f07-mac-')), handlers = new Map(), journal = [], runtimes = [], order = [], chat = chatDouble(), built = {};
  let preload, finished, loaded, stopped;
  const quitting = new Promise(resolve => { finished = resolve; }), ready = new Promise(resolve => { loaded = resolve; });
  const webContents = { mainFrame: {}, setWindowOpenHandler() {}, on() {}, send: (channel, value) => preload.deliver(channel, value === undefined ? undefined : structuredClone(value)) };
  class BrowserWindow {
    constructor() { this.webContents = webContents; }
    isDestroyed() { return false; } getBounds() { return { x: 0, y: 0, width: 1340, height: 920 }; } getContentBounds() { return { x: 0, y: 0, width: 1340, height: 892 }; }
    loadFile() { loaded(true); return Promise.resolve(); } show() {} focus() {} setMinimumSize() {} setAlwaysOnTop() {} setBounds() {}
  }
  const app = Object.assign(new EventEmitter(), { isPackaged: false, setName() {}, setPath() {}, getPath: () => userData, requestSingleInstanceLock: () => true, whenReady: () => Promise.resolve(),
    // As Electron does: quitting asks first, and a handler may hold it back until its own work is done.
    quit() { const event = { prevented: false, preventDefault() { this.prevented = true; } }; app.emit('before-quit', event); if (!event.prevented) { finished(); loaded(false); } } });
  const electron = { app, BrowserWindow, ipcMain: { handle: (channel, handler) => handlers.set(channel, handler) },
    protocol: { registerSchemesAsPrivileged() {}, handle() {} },
    globalShortcut: { register: () => true, unregister() {}, unregisterAll() {} }, desktopCapturer: { getSources: async () => [] },
    session: { defaultSession: { setDisplayMediaRequestHandler() {} } }, systemPreferences: { getMediaAccessStatus: () => 'granted' },
    shell: { openExternal: async () => {} }, dialog: { showErrorBox() {}, showOpenDialog: async () => ({ canceled: true }) },
    safeStorage: { isEncryptionAvailable: () => false }, screen: { getDisplayMatching: () => ({ workArea: { x: 0, y: 0, width: 1920, height: 1080 } }) } };
  const sender = { sender: webContents, senderFrame: webContents.mainFrame };
  // Structured-cloned both ways and with Electron's error prefix, as between two processes.
  preload = loadPreload(async (channel, ...args) => {
    try { const result = await handlers.get(channel)(sender, ...structuredClone(args)); return result === undefined ? undefined : structuredClone(result); }
    catch (error) { throw new Error(`Error invoking remote method '${channel}': ${error}`); }
  });
  const argv = [...process.argv], saved = Object.fromEntries(HOST_SETTINGS.map(name => [name, process.env[name]])), consoleError = console.error, load = Module._load;
  const restore = () => { process.argv.splice(0, process.argv.length, ...argv); for (const name of HOST_SETTINGS) if (saved[name] === undefined) delete process.env[name]; else process.env[name] = saved[name]; console.error = consoleError; };
  for (const name of HOST_SETTINGS) delete process.env[name];
  process.argv.push('--smoke-test');
  // The journal of this host.
  console.error = error => journal.push(String(error?.message || error));
  // What the host composes is handed to the test: the chat agent is the double, and each closing work says when it is entered.
  Module._load = function (request, parent, ...rest) {
    if (request === 'electron') return electron;
    const module = load.call(this, request, parent, ...rest);
    if (!parent?.filename?.endsWith(path.join('app', 'main.cjs'))) return module;
    // A test run sweeps no temporary directory of the machine.
    if (request === '../adapters/codex-confinement.cjs') return { ...module, sweepStaleContexts: async () => [] };
    if (request === '../adapters/video-bridge.cjs') return { ...module, VideoBridge: class extends module.VideoBridge { revoke(...args) { order.push('contextes MCP'); return super.revoke(...args); } } };
    if (request === '../runtime/conversation-runtime.cjs') return { ...module, createConversationRuntime: options => {
      const conversation = built.conversation = module.createConversationRuntime(options);
      conversation.agent.answer = input => chat.answer(input); conversation.agent.close = async () => { order.push('agent de chat'); };
      recorded(order, conversation.deep, 'cancelAll', 'questions');
      return conversation;
    } };
    if (request === '../runtime/surveillance-runtime.cjs') return { ...module, createSurveillanceRuntime: options => { const surveillance = module.createSurveillanceRuntime(options); recorded(order, surveillance, 'reset', 'surveillance'); return surveillance; } };
    if (request === '../runtime/session-runtime.cjs') return { ...module, createSessionRuntime: options => {
      const runtime = module.createSessionRuntime(options);
      runtimes.push(runtime); recorded(order, runtime, 'pause', 'capture'); recorded(order, runtime, 'archive', 'archive');
      return runtime;
    } };
    return module;
  };
  try { delete require.cache[require.resolve('../app/main.cjs')]; require('../app/main.cjs'); }
  catch (error) { restore(); throw error; }
  finally { Module._load = load; }
  const started = await ready, host = preload.tvlens;
  const quit = () => (stopped ||= (async () => { app.quit(); await quitting; restore(); })());
  if (!started) restore();
  // Always quit before its directory is removed: a failed assertion must not leave a host writing into a deleted folder.
  t.after(async () => { chat.turn?.finish(); await quit().catch(() => {}); await fsp.rm(userData, { recursive: true, force: true }); });
  assert.equal(started, true, journal.join(' '));
  return { name: 'Mac', journal, order, chat, host, folder: id => path.join(userData, 'sessions', id), runtime: () => runtimes.at(-1), get agent() { return built.conversation.agent; },
    // The reason this adapter gives a session it ends, and the order this host keeps for its closing steps.
    reason: 'Nouvelle session.', closing: { paused: ['contextes MCP', 'surveillance', 'questions', 'agent de chat', 'archive'], capturing: ['contextes MCP', 'surveillance', 'questions', 'agent de chat', 'capture', 'archive'] },
    start: async () => (await host.start()).id,
    // One passage of a simulated capture, from the end of the previous one up to the session clock.
    send: async id => {
      await pause(20);
      const state = await host.state(), startMs = state.segments.at(-1)?.endMs ?? 0, endMs = Math.floor(state.elapsedMs);
      assert.ok(endMs > startMs, 'the session clock moved');
      return host.ingest({ sessionId: id, startMs, endMs, clip: new Uint8Array(Buffer.from('clip ' + startMs)), audio: null, frames: [{ atMs: startMs, dataUrl: 'data:image/jpeg;base64,' + await jpeg() }] });
    },
    pause: () => host.stop(),
    // "Nouvelle session": the window answers true, whatever the end of the former one had to report.
    end: () => host.newSession(),
    endAnswer: () => true,
    remove: id => host.deleteSession(id).then(answer => (answer.deleted ? 'deleted' : answer), error => error.message),
    open: async id => (await host.openSession(id)).readOnly,
    ask: async (id, question) => (await host.ask(question)).id,
    jobs: async () => (await host.deepState()).jobs,
    state: () => host.state(),
    rows: async () => (await host.sessions()).sessions.map(s => [s.id, s.state, s.passages, s.media.stored]),
    stopHost: quit };
}

// ---- The same scenarios on both compositions ------------------------------------------------------------------------
// Each scenario speaks to its host through the gestures both adapters offer: start, one passage, pause, end, delete,
// open, ask. What an adapter words in its own way (the answer to an end, the reason it gives) is asked of it.
const HOSTS = [['Mac host (IPC)', macHost], ['server host (HTTP)', serverHost]];
const onBothHosts = (title, scenario) => { for (const [name, boot] of HOSTS) test(`${name} — ${title}`, async t => scenario(t, await boot(t))); };
const saved = async (h, id, name) => JSON.parse(await fsp.readFile(path.join(h.folder(id), name), 'utf8'));
const passages = async h => (await h.state()).segments.map(p => [p.id, p.status, p.available, p.error]);
// One passage stored, then its analysis left to finish.
async function passage(h, id) {
  const stored = await h.send(id);
  await until(async () => (await h.state()).segments.every(p => p.status === 'ready' && p.thumbnailAvailable !== undefined), 'the passage is analysed');
  return stored;
}

onBothHosts('a question still running when its session ends reaches its final state with the reason of the end and its last draft, on disk before the session is said archived, and nothing of it is written afterwards', async (t, h) => {
  const id = await h.start();
  await passage(h, id);
  h.chat.hold = true;
  await h.ask(id, 'Que voit-on maintenant ?');
  await until(() => h.chat.turn, 'the question reached the agent');
  h.chat.turn.progress({ message: 'Rédaction de la réponse…', preview: 'brouillon en cours' });
  await h.pause();
  const answer = await h.end(), last = (await saved(h, id, 'deep-answers.json')).jobs.at(-1), closed = await tree(h.folder(id));
  const written = async name => (await fsp.stat(path.join(h.folder(id), name), { bigint: true })).mtimeNs;
  // The agent answers at last, long after its question was given up.
  h.chat.turn.finish(); await pause(60);
  assert.deepEqual({ answer, question: [last.status, last.message, last.preview], manifest: (await saved(h, id, 'manifest.json')).state, inOrder: await written('deep-answers.json') <= await written('manifest.json'),
    state: await h.state(), jobs: await h.jobs(), journal: h.journal, later: await tree(h.folder(id)) }, {
    answer: h.endAnswer({ id, archived: true }), question: ['cancelled', h.reason, 'brouillon en cours'], manifest: 'archived', inOrder: true, state: null, jobs: [], journal: [], later: closed });
});

onBothHosts('a passage whose storage has begun when its session ends lands first: the end waits for it, the archive holds it, no analysis is started for it only to be given up, and it reopens replayable and honestly unanalysed', async (t, h) => {
  const id = await h.start();
  await passage(h, id);
  // The second passage is held in mid-write, as on a slow disk, and whatever is analysed from here on is counted.
  const live = h.runtime(), put = live.store.put.bind(live.store), observe = live.perception.observe.bind(live.perception), entered = deferred(), onDisk = deferred(), analysed = [];
  live.store.put = async (stored, input) => { if (stored === 'moment-2') { entered.resolve(); await onDisk.promise; } return put(stored, input); };
  live.perception.observe = async input => { analysed.push(input.id); return observe(input); };
  try {
    const second = h.send(id);
    await entered.promise;
    await h.pause();
    let over = false;
    const ending = h.end().then(answer => { over = true; return answer; });
    await pause(150);
    const waited = !over;
    onDisk.resolve();
    const stored = await second, answer = await ending;
    await pause(50);
    const state = await saved(h, id, 'session.json'), manifest = await saved(h, id, 'manifest.json');
    assert.deepEqual({ waited, stored, answer, analysed, saved: state.segments.map(p => [p.id, p.status, p.available]), manifest: [manifest.state, manifest.passages, manifest.media.stored], journal: h.journal }, {
      waited: true, stored: 'moment-2', answer: h.endAnswer({ id, archived: true }), analysed: [], saved: [['moment-1', 'ready', true], ['moment-2', 'queued', true]], manifest: ['archived', 2, 2], journal: [] });
    assert.deepEqual([await h.open(id), await passages(h)], [true, [['moment-1', 'ready', true, undefined], ['moment-2', 'error', true, 'Analyse interrompue à la fermeture de la session.']]]);
  } finally { onDisk.resolve(); }
});

onBothHosts('a session whose final state the disk refuses is never said archived: the journal names the file, the runtime is closed and the host lets go all the same, the session is listed as cut short, reopens on its last confirmed state, and a new one starts', async (t, h) => {
  const id = await h.start();
  await passage(h, id);
  await h.pause();
  const live = h.runtime(), file = path.join(h.folder(id), 'session.json'), confirmed = await fsp.readFile(file, 'utf8'), writeFile = fsp.writeFile;
  // The disk refuses session.json, as on EIO: its temporary file is never written, so the file keeps what it held.
  const refusing = t.mock.method(fsp, 'writeFile', async (target, ...rest) => {
    if (String(target).endsWith('session.json.tmp')) throw Object.assign(new Error(`EIO: i/o error, write '${target}'`), { code: 'EIO' });
    return writeFile(target, ...rest);
  });
  const answer = await h.end();
  refusing.mock.restore();
  const refusal = 'archive : Écriture refusée par le disque (session.json) : EIO';
  assert.deepEqual({ answer, journal: h.journal, closed: live.watch.closed, manifest: (await saved(h, id, 'manifest.json')).state, kept: await fsp.readFile(file, 'utf8') === confirmed, state: await h.state(), rows: await h.rows() }, {
    answer: h.endAnswer({ id, archived: false, errors: [refusal] }), journal: [`TVLens — fermeture incomplète de la session ${id} : ${refusal}`], closed: true, manifest: 'live', kept: true, state: null, rows: [[id, 'interrupted', 1, 1]] });
  // Reopened read-only on what the disk confirmed; closing it again has nothing to write, hence nothing to report.
  assert.deepEqual([await h.open(id), await passages(h)], [true, [['moment-1', 'ready', true, undefined]]]);
  await h.end();
  const next = await h.start();
  assert.deepEqual([next !== id, await passage(h, next), h.journal.length], [true, 'moment-1', 1]);
});

onBothHosts('deleting the loaded session is refused while it captures; a deletion whose seal is refused erases nothing, says why to whoever asked and in the journal, and leaves the host without a session: the folder is what it was, listed as cut short and reopenable, and a new session starts; deleted for good with a question running, the question is given up and nothing brings the folder back', async (t, h) => {
  const id = await h.start();
  await passage(h, id);
  const capturing = await h.remove(id);
  await h.pause();
  // The seal is not confirmed, as when the closing of the runtime fails under it: the store is sealed, the runtime
  // is closed, nothing more is written, and the deletion must not go on.
  const live = h.runtime(), seal = live.seal.bind(live), before = await tree(h.folder(id));
  live.seal = async () => { await seal(); throw new Error('scellement refusé (simulé)'); };
  const refused = await h.remove(id), said = 'scellement : scellement refusé (simulé)';
  assert.deepEqual({ capturing, refused, intact: await tree(h.folder(id)), closed: live.watch.closed, state: await h.state(), jobs: await h.jobs(), rows: await h.rows(), journal: h.journal, lastEnd: h.lastEnd?.() }, {
    capturing: 'Arrête la capture avant de supprimer cette session.', refused: 'scellement refusé (simulé)', intact: before, closed: true, state: null, jobs: [], rows: [[id, 'interrupted', 1, 1]],
    journal: [`TVLens — fermeture incomplète de la session ${id} : ${said}`], lastEnd: h.lastEnd && { id, archived: false, errors: [said] } });
  // The host is free: another session starts, captures and is archived.
  const other = await h.start();
  assert.deepEqual([other !== id, await passage(h, other)], [true, 'moment-1']);
  await h.pause(); await h.end();
  const neighbour = await tree(h.folder(other));
  // What the refused deletion left is reopened, read-only, on its passage; then deleted for good, a question running.
  assert.deepEqual([await h.open(id), await passages(h)], [true, [['moment-1', 'ready', true, undefined]]]);
  h.chat.hold = true;
  await h.ask(id, 'Longue question ?');
  await until(() => h.chat.turn, 'the question reached the agent');
  const removed = await h.remove(id);
  // Everything that could still try to write: the agent answering late.
  h.chat.turn.finish(); await pause(60);
  assert.deepEqual({ removed, folder: await there(h.folder(id)), state: await h.state(), jobs: await h.jobs(), rows: await h.rows(), neighbour: await tree(h.folder(other)), journal: h.journal.length }, {
    removed: 'deleted', folder: false, state: null, jobs: [], rows: [[other, 'archived', 1, 1]], neighbour, journal: 1 });
});

onBothHosts('ending a session archives it and closes its runtime even when adapters fail to close: every closing is attempted, the failures go to the journal under the name of their step, and a new session starts', async (t, h) => {
  const closed = [], id = await h.start();
  await passage(h, id);
  const live = h.runtime(), inspection = live.inspectorModel.close?.bind(live.inspectorModel);
  // The chat agent fails to close, as when its private directory is still busy; so does the perception.
  h.agent.close = async () => { closed.push('agent de chat'); throw new Error('EBUSY: resource busy (simulé)'); };
  live.perception.close = async () => { closed.push('perception'); throw new Error('perception bloquée (simulé)'); };
  live.inspectorModel.close = async () => { closed.push('modèle d’inspection'); return inspection?.(); };
  await h.pause();
  const answer = await h.end(), errors = ['agent de chat : EBUSY: resource busy (simulé)', 'perception : perception bloquée (simulé)'];
  assert.deepEqual({ answer, closed, runtime: live.watch.closed, journal: h.journal, manifest: (await saved(h, id, 'manifest.json')).state, state: await h.state(), rows: await h.rows() }, {
    answer: h.endAnswer({ id, archived: true, errors }), closed: ['agent de chat', 'perception', 'modèle d’inspection'], runtime: true,
    journal: [`TVLens — fermeture incomplète de la session ${id} : ${errors.join(' ; ')}`], manifest: 'archived', state: null, rows: [[id, 'archived', 1, 1]] });
  const next = await h.start();
  assert.deepEqual([next !== id, await passage(h, next)], [true, 'moment-1']);
});

onBothHosts('a session that received neither a passage nor a question leaves nothing and says nothing; one that only received a question is kept; an empty one whose folder cannot be erased is said in the journal, and the host goes on', async (t, h) => {
  const nothing = await h.start();
  await h.pause();
  const discarded = await h.end();
  assert.deepEqual({ discarded, folder: await there(h.folder(nothing)), rows: await h.rows(), journal: h.journal }, { discarded: h.endAnswer({ id: nothing, archived: false }), folder: false, rows: [], journal: [] });
  const asked = await h.start();
  await h.ask(asked, 'Une question ?');
  await until(async () => (await h.jobs()).every(job => !['queued', 'running'].includes(job.status)), 'the question is answered');
  await h.pause();
  const kept = await h.end();
  assert.deepEqual({ kept, rows: (await h.rows()).map(([id, state]) => [id, state]), journal: h.journal }, { kept: h.endAnswer({ id: asked, archived: true }), rows: [[asked, 'archived']], journal: [] });
  // The system refuses to erase the folder of the next empty session.
  const stuck = await h.start();
  await h.pause();
  const rm = fsp.rm, refusing = t.mock.method(fsp, 'rm', async (target, ...rest) => {
    if (String(target) === h.folder(stuck)) throw Object.assign(new Error('EACCES: permission denied (simulé)'), { code: 'EACCES' });
    return rm(target, ...rest);
  });
  const answer = await h.end();
  refusing.mock.restore();
  const said = 'effacement : EACCES: permission denied (simulé)';
  assert.deepEqual({ answer, journal: h.journal, state: await h.state(), folder: await there(h.folder(stuck)) }, {
    answer: h.endAnswer({ id: stuck, archived: false, errors: [said] }), journal: [`TVLens — fermeture incomplète de la session ${stuck} : ${said}`], state: null, folder: true });
  const next = await h.start();
  assert.deepEqual([typeof next, next !== stuck, (await h.state()).id], ['string', true, next]);
});

onBothHosts('the closing steps of a session are entered in the order this host keeps for itself, after a pause and when the host stops while it captures', async (t, h) => {
  const id = await h.start();
  await passage(h, id);
  await h.pause();
  h.order.length = 0;
  await h.end();
  const paused = [...h.order], next = await h.start();
  await passage(h, next);
  h.order.length = 0;
  await h.stopHost();
  assert.deepEqual({ paused, capturing: h.order, archived: [(await saved(h, id, 'manifest.json')).state, (await saved(h, next, 'manifest.json')).state] }, { ...h.closing, archived: ['archived', 'archived'] });
});

// ---- What only the Mac host has --------------------------------------------------------------------------------------

test('Mac host (IPC) — a passage search still running is told that its session ends as the end begins, with the reason of that end; completed late, its answer is still refused, and the next session searches again', async t => {
  const h = await macHost(t), id = await h.start();
  await passage(h, id);
  // The search of this session is held, as a slow ranking holds it; the end is held half-way, at its chat agent.
  const live = h.runtime(), search = live.search.search.bind(live.search), entered = deferred(), release = deferred(), agentClose = deferred(), seen = { ending: 0 };
  live.search.search = async input => { seen.signal = input.signal; entered.resolve(); await release.promise; return search(input); };
  h.agent.close = async () => { seen.ending++; await agentClose.promise; };
  try {
    const late = h.host.searchMoments('cercle').then(found => found.sessionId, error => error.message);
    await entered.promise;
    await h.pause();
    const ending = h.end();
    await until(() => seen.ending === 1, 'the end of the session is under way');
    const during = { aborted: seen.signal.aborted, reason: seen.signal.reason?.message };
    agentClose.resolve();
    const ended = await ending;
    release.resolve();
    const answered = await late, next = await h.start();
    await passage(h, next);
    const again = await h.host.searchMoments('cercle');
    assert.deepEqual({ during, ended, answered, again: [again.sessionId, again.moments.map(m => m.id)] }, { during: { aborted: true, reason: 'Nouvelle session.' }, ended: true, answered: 'Session obsolète.', again: [next, ['moment-1']] });
  } finally { agentClose.resolve(); release.resolve(); }
});

// ---- Supplement, read from the sources -------------------------------------------------------------------------------
// Not a proof of parity: the scenarios above are. This only pins that the duplication the protocol replaces is gone.

test('both hosts end a session through the shared protocol, which alone words the journal of an incomplete end and how a failed step is said, and which loads nothing', () => {
  const read = file => fs.readFileSync(path.join(root, file), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const hosts = ['app/main.cjs', 'runtime/headless-runtime.cjs'], shared = 'runtime/session-closing.cjs';
  const sources = Object.fromEntries([...hosts, shared, 'server/main.cjs', 'server/http.cjs'].map(file => [file, read(file)]));
  for (const host of hosts) {
    assert.match(sources[host], /require\(["'][./]+(?:runtime\/)?session-closing\.cjs["']\)/, host + ' loads the protocol');
    assert.match(sources[host], /\bcloseSession\(\{/, host + ' ends a session through it');
    assert.match(sources[host], /\bsettleQuestions\(/, host + ' settles its questions through it');
    assert.doesNotMatch(sources[host], /\.slice\(0, 200\)/, host + ' no longer words a failed step itself');
  }
  assert.doesNotMatch(sources['runtime/headless-runtime.cjs'], /^\s*async (?:attempt|settleQuestions)\(/m, 'the server host keeps no closing helper of its own');
  assert.deepEqual(Object.keys(sources).filter(file => sources[file].includes('fermeture incomplète de la session')), [shared]);
  assert.doesNotMatch(sources[shared], /\brequire\(|\b(?:setTimeout|setInterval|process|fetch)\b/, 'the protocol loads nothing: no disk, no timer, no transport');
});
