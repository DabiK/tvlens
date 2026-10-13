const { test } = require('node:test');
const assert = require('node:assert/strict');
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const childProcess = require('node:child_process');
const { EventEmitter } = require('node:events');
const { createHash } = require('node:crypto');
const sharp = require('sharp');
const { HeadlessRuntime, READ_ONLY } = require('../runtime/headless-runtime.cjs');
const { RemoteServer } = require('../server/http.cjs');
const { RemoteMedia } = require('../adapters/remote-media.cjs');

// F06: a block the transport has accepted belongs to the host from before its media are prepared until it is answered
// and what prepared it has let go. The end of its session, its deletion and a stop of the host cancel what is still
// being prepared and wait, within a bound, for it to let go; what is already being stored lands as before. Offline: a
// real HeadlessRuntime on simulated providers behind a real RemoteServer on the loopback, with an assembly the test
// holds, or the real assembler on Node programs that stand for FFmpeg. Answers, signals, processes and directories are
// counted: nothing here measures a latency, and no TV, network or real FFmpeg is involved.
const token = '6'.repeat(64), JPEG = 'data:image/jpeg;base64,YQ==';
const CLOSING = { error: 'Session en cours de fermeture.', code: 'session-closing' };
const CHANGED = { error: 'La capture a changé pendant la préparation de ce bloc.', code: 'capture-changed' };
const UNAVAILABLE = 'media-unavailable';
const LATE = ms => `préparation média : arrêt non confirmé après ${ms} ms, bloc refusé, préparation suivante en attente`;
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const tick = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
// Real sockets, files and processes are on the way: wait for the fact itself, and fail instead of hanging.
const until = async (check, what, rounds = 600) => { for (let i = 0; i < rounds; i++) { if (await check()) return; await pause(5); } assert.fail('never reached: ' + what); };
// Whether it came true within the bound: for a fact a test reports with the others instead of stopping on it.
const eventually = async (check, rounds = 300) => { for (let i = 0; i < rounds; i++) { if (await check()) return true; await pause(5); } return false; };
// A promise that never settles is reported as such instead of holding its test.
const bounded = (promise, ms = 5000) => new Promise((resolve, reject) => {
  const timer = setTimeout(() => resolve(`nothing after ${ms} ms`), ms);
  promise.then(value => { clearTimeout(timer); resolve(value); }, error => { clearTimeout(timer); reject(error); });
});
const failure = promise => promise.then(() => assert.fail('should have failed'), error => error);
const alive = pid => { try { process.kill(pid, 0); return true; } catch (error) { return error.code !== 'ESRCH'; } };
// What the owner of a block did with its signal: null when the assembly was handed none.
const cancelled = call => (call.signal ? call.signal.aborted : null);
function wav() {
  const b = Buffer.alloc(44 + 3200);
  b.write('RIFF'); b.writeUInt32LE(b.length - 8, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
  b.writeUInt32LE(16000, 24); b.writeUInt32LE(32000, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(3200, 40);
  return b.toString('base64');
}
const image = async () => (await sharp({ create: { width: 32, height: 32, channels: 3, background: '#336699' } }).jpeg().toBuffer()).toString('base64');
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

// The temporary directories the assembler makes during a test, and which of them are still there. Other test files
// share the temp root: only those made here are followed. `refuse` makes the next ones fail as the system would;
// `once` runs when the next one exists, before the assembler is handed it.
function scratch(t) {
  const made = [], original = fsp.mkdtemp, seen = { made, refuse: null, once: null };
  t.mock.method(fsp, 'mkdtemp', async (prefix, ...rest) => {
    const mine = path.basename(String(prefix)).startsWith('tvlens-ingest-');
    if (mine && seen.refuse) throw seen.refuse;
    const dir = await original(prefix, ...rest);
    if (mine) { made.push(dir); const once = seen.once; seen.once = null; once?.(); }
    return dir;
  });
  seen.left = async () => (await Promise.all(made.map(dir => fsp.access(dir).then(() => dir, () => null)))).filter(Boolean);
  return seen;
}

// A private directory and the Node programs that stand for FFmpeg behind the real assembler, each under the name it is
// run by. `hang` writes its pid and never ends by itself; `write` writes the file it was asked for, its last
// argument, and leaves; `fail` says "boom" and leaves with 1. Whatever a test proved, what it started is killed when
// it ends, before anything else is closed or removed.
async function bench(t) {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'tvlens-f06-')), pids = path.join(root, 'tool-pids'), b = { root, closing: [] };
  b.started = async () => (await fsp.readFile(pids, 'utf8').catch(() => '')).split('\n').filter(Boolean).map(Number);
  t.after(async () => {
    for (const pid of await b.started()) try { process.kill(pid, 'SIGKILL'); } catch {}
    for (const close of b.closing) await close();
    await fsp.rm(root, { recursive: true, force: true });
  });
  const script = async (name, body) => { const file = path.join(root, name); await fsp.writeFile(file, `#!${process.execPath}\n${body}`, { mode: 0o700 }); return file; };
  b.hang = await script('ffmpeg-hang', `require('node:fs').appendFileSync(${JSON.stringify(pids)},process.pid+'\\n');setInterval(()=>{},1000);`);
  b.write = await script('ffmpeg-write', `require('node:fs').copyFileSync(${JSON.stringify(path.join(__dirname, 'fixtures', 'ffmpeg-webm-head.webm'))},process.argv.at(-1));`);
  b.fail = await script('ffmpeg-fail', `process.stderr.write('boom');process.exit(1);`);
  return b;
}

// The assembly of a block as the test holds it. A block passes straight through unless `hold` is set for the next
// one. A held one says what it was given and settles when the test lets it, or when its signal fires unless it is
// held 'deaf': a preparation that ignores its owner.
function assembly() {
  const m = { calls: [], held: [], hold: null };
  const made = input => ({ ...input, clip: Buffer.from('fixture ' + input.startMs), frames: [{ atMs: input.startMs, dataUrl: JPEG }], audio: null });
  m.assemble = (input, options = {}) => {
    const mode = m.hold, call = { input, signal: options.signal ?? null, ...deferred() };
    m.hold = null; m.calls.push(call);
    if (!mode) return Promise.resolve(made(input));
    m.held.push(call);
    call.finish = () => call.resolve(made(input));
    if (mode !== 'deaf') call.signal?.addEventListener('abort', () => call.reject(call.signal.reason), { once: true });
    return call.promise;
  };
  return m;
}

// A real HeadlessRuntime behind a real RemoteServer on an ephemeral port, as tests/server-sessions.test.cjs builds
// them: simulated providers, a temporary root, a clock and a journal held by the test.
async function host(t, { media = assembly(), runtimeOptions = {} } = {}) {
  const b = await bench(t), f = Object.assign(b, { sessionsRoot: path.join(b.root, 'sessions'), clock: 0, journal: [], media });
  const agent = { answer: async ({ question }) => ({ answer: question, kind: 'explanation', citations: [], limits: [] }) };
  f.runtime = new HeadlessRuntime({ userData: f.root, sessionsRoot: f.sessionsRoot, config: {}, selectedModels: {}, smoke: true, agent, readClock: () => f.clock, log: line => f.journal.push(line), ...runtimeOptions });
  // What a stop of the service runs, in its order (server/main.cjs): the server, then the runtime.
  f.stop = () => (f.stopped ||= (async () => { await f.server?.close(); await f.runtime.close(); })());
  // Nothing a test still holds may keep the host from stopping.
  f.closing.push(async () => { for (const call of media.held || []) call.finish(); await f.stop(); });
  f.server = await new RemoteServer({ runtime: f.runtime, media, token }).listen(0, '127.0.0.1');
  f.req = async (route, body) => {
    const res = await fetch(f.server.url + route, { method: body === undefined ? 'GET' : 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: res.status, value: await res.json() };
  };
  // One captured block of 8 s ending at `endMs` on the session clock.
  f.body = (sessionId, sequence, endMs, extra = {}) => ({ sessionId, sequence, startMs: endMs - 8000, endMs, frames: [{ atMs: endMs - 8000, data: 'YQ==' }], ...extra });
  // Sent once the session clock has reached its end; answered once it is stored or refused.
  f.send = body => { f.clock += Math.max(0, body.endMs - (f.runtime.session?.watch.now() ?? body.endMs)); return f.req('/v1/segments', body); };
  // The analysis is left to finish, and its save to land.
  f.settled = async () => { do { await tick(); } while (f.runtime.session?.watch.running); await f.runtime.session?.store.serial; };
  f.block = async (...args) => { const sent = await f.send(f.body(...args)); await f.settled(); return sent; };
  f.start = async () => (await f.req('/v1/session/start', {})).value.id;
  f.passages = async () => (await f.req('/v1/state')).value.session?.segments.map(s => s.id) ?? null;
  f.saved = async (id, name) => JSON.parse(await fsp.readFile(path.join(f.sessionsRoot, id, name), 'utf8'));
  return f;
}

// ---- The end of a session, its deletion and a stop of the host ------------------------------------------------------

test('a block still being prepared when its session ends is cancelled through its signal and answered that the session is closing; the end waits for it to let go, and the next session prepares its first block at once', async t => {
  const media = assembly(), f = await host(t, { media });
  const A = await f.start();
  assert.deepEqual(await f.block(A, 1, 8000), { status: 200, value: { id: 'moment-1', duplicate: false } });
  media.hold = 'held';
  const order = [];
  const sent = f.send(f.body(A, 2, 16000)).then(answer => { order.push('block'); return answer; });
  await until(() => media.held.length === 1, 'the assembly of the second block');
  const call = media.held[0];
  const ended = await bounded(f.req('/v1/session/end', {}).then(answer => { order.push('end'); return answer; }));
  const refused = await bounded(sent, 1000);
  const B = await f.start(), first = await f.block(B, 1, 8000);
  assert.deepEqual({ handed: call.signal instanceof AbortSignal, cancelled: cancelled(call), block: refused, end: ended, order, other: B !== A, first, kept: (await f.saved(A, 'session.json')).segments.map(s => s.id), journal: f.journal }, {
    handed: true, cancelled: true, block: { status: 503, value: CLOSING }, end: { status: 200, value: { ended: true, id: A, archived: true } },
    // The block is answered, and what prepared it has let go, before the end of its session answers.
    order: ['block', 'end'], other: true, first: { status: 200, value: { id: 'moment-1', duplicate: false } }, kept: ['moment-1'], journal: [] });
});

test('stopping the host while the real assembler runs its media tool kills that tool and no other, removes its temporary directory, and archives the session before the stop returns', async t => {
  const dirs = scratch(t), media = { assemble: (input, options) => media.current.assemble(input, options) }, f = await host(t, { media });
  const frames = endMs => ({ frames: [{ atMs: endMs - 8000, data: f.jpeg }] });
  f.jpeg = await image();
  const A = await f.start();
  media.current = new RemoteMedia({ ffmpeg: f.write });
  assert.deepEqual((await f.send(f.body(A, 1, 8000, frames(8000)))).value, { id: 'moment-1', duplicate: false });
  await f.settled();
  assert.deepEqual(await dirs.left(), [], 'a block that was stored left no temporary directory');
  // The sound is resampled first: the tool is running, in its directory, when the host is stopped.
  media.current = new RemoteMedia({ ffmpeg: f.hang });
  const sent = f.send(f.body(A, 2, 16000, { ...frames(16000), audio: wav() })).then(() => 'answered', () => 'connection closed');
  await until(async () => (await f.started()).length === 1, 'the media tool of the second block');
  const [pid] = await f.started(), running = await dirs.left();
  assert.deepEqual([alive(pid), running.length], [true, 1]);
  const stopped = await bounded(f.stop().then(() => 'stopped'));
  // Read as soon as the stop returns: what it waited for is over, not merely asked for.
  const facts = { stopped, toolAlive: alive(pid), left: await dirs.left(), lastEnd: f.runtime.lastEnd };
  await eventually(() => !alive(pid));
  assert.deepEqual({ ...facts, client: await bounded(sent), state: (await f.saved(A, 'manifest.json')).state, kept: (await f.saved(A, 'session.json')).segments.map(s => s.id), journal: f.journal }, {
    stopped: 'stopped', toolAlive: false, left: [], lastEnd: { id: A, archived: true }, client: 'connection closed', state: 'archived', kept: ['moment-1'], journal: [] });
});

test('a preparation that outlives the wait of an end is said, stays owned and keeps the next one waiting; resolved late in the same session reopened and resumed, its block is refused and marks nothing', async t => {
  const media = assembly(), f = await host(t, { media, runtimeOptions: { preparationWaitMs: 40 } });
  const A = await f.start();
  await f.block(A, 1, 8000);
  media.hold = 'deaf';
  const body = f.body(A, 2, 16000), sent = f.send(body);
  await until(() => media.held.length === 1, 'the assembly of the second block');
  const call = media.held[0];
  const ended = await bounded(f.req('/v1/session/end', {}));
  // The same identifier comes back as another life of the session: opened as an archive, then resumed.
  const opened = (await f.req(`/v1/sessions/${A}/open`, {})).value, resumed = (await f.req(`/v1/sessions/${A}/resume`, {})).value;
  const before = await tree(path.join(f.sessionsRoot, A, 'media'));
  // The preparation of the former life has not let go: no other block is prepared meanwhile.
  const waiting = await f.send(f.body(A, 3, 24000));
  call.finish();
  const late = await bounded(sent);
  const after = await f.passages(), untouched = JSON.stringify(await tree(path.join(f.sessionsRoot, A, 'media'))) === JSON.stringify(before);
  // Sent again byte for byte, it is a block of the resumed capture like any other: nothing of the former life answers for it.
  const again = await f.send(body), replay = await f.send(body);
  assert.deepEqual({ cancelled: cancelled(call), ended, journal: f.journal, lives: [opened.readOnly, resumed.accepting], waiting, late, after, untouched, again, replay }, {
    cancelled: true, ended: { status: 200, value: { ended: true, id: A, archived: true, errors: [LATE(40)] } }, journal: [`TVLens — fermeture incomplète de la session ${A} : ${LATE(40)}`],
    lives: [true, true], waiting: { status: 429, value: { error: 'Préparation du passage précédent.' } }, late: { status: 503, value: CLOSING }, after: ['moment-1'], untouched: true,
    again: { status: 200, value: { id: 'moment-2', duplicate: false } }, replay: { status: 200, value: { id: 'moment-2', duplicate: true } } });
});

test('with the default wait of one second, a preparation resolved after the next session started stores nothing there, leaves the archive of its own session as it was, and frees the transport only when it really ends', async t => {
  const media = assembly(), f = await host(t, { media });
  const A = await f.start();
  await f.block(A, 1, 8000);
  media.hold = 'deaf';
  const sent = f.send(f.body(A, 7, 16000));
  await until(() => media.held.length === 1, 'the assembly of the second block');
  const call = media.held[0];
  const ended = await bounded(f.req('/v1/session/end', {}));
  const archive = await tree(path.join(f.sessionsRoot, A));
  const B = await f.start();
  const waiting = await f.send(f.body(B, 7, 8000));
  call.finish();
  const late = await bounded(sent);
  const inB = await f.passages(), same = JSON.stringify(await tree(path.join(f.sessionsRoot, A))) === JSON.stringify(archive);
  // The same number in the other session is a block of that session, new.
  const freed = await f.block(B, 7, 8000);
  assert.deepEqual({ cancelled: cancelled(call), ended, journal: f.journal, other: B !== A, waiting: waiting.status, late, inB, same, freed }, {
    cancelled: true, ended: { status: 200, value: { ended: true, id: A, archived: true, errors: [LATE(1000)] } }, journal: [`TVLens — fermeture incomplète de la session ${A} : ${LATE(1000)}`],
    other: true, waiting: 429, late: { status: 503, value: CLOSING }, inB: [], same: true, freed: { status: 200, value: { id: 'moment-1', duplicate: false } } });
});

test('deleting a paused session cancels the block still being prepared for it before its folder is erased', async t => {
  const media = assembly(), f = await host(t, { media });
  const A = await f.start(), dir = path.join(f.sessionsRoot, A);
  await f.block(A, 1, 8000);
  media.hold = 'held';
  const sent = f.send(f.body(A, 2, 16000));
  await until(() => media.held.length === 1, 'the assembly of the second block');
  const call = media.held[0];
  assert.deepEqual(await f.req('/v1/session/pause', {}), { status: 200, value: { paused: true } });
  const removed = await bounded(f.req(`/v1/sessions/${A}/delete`, {}));
  const refused = await bounded(sent, 1000);
  assert.deepEqual({ cancelled: cancelled(call), removed: [removed.status, removed.value.deleted, removed.value.id], block: refused, folder: await fsp.access(dir).then(() => 'there', () => 'gone'), lastEnd: f.runtime.lastEnd, listed: (await f.req('/v1/sessions')).value.total, journal: f.journal }, {
    cancelled: true, removed: [200, true, A], block: { status: 503, value: CLOSING }, folder: 'gone', lastEnd: { id: A, archived: false }, listed: 0, journal: [] });
});

test('a block whose storage has begun when its session ends is not cancelled: the end waits for it to land, and the archive holds it', async t => {
  const media = assembly(), f = await host(t, { media });
  const A = await f.start();
  await f.block(A, 1, 8000);
  // The disk takes its time with the second passage: its preparation is over, its storage under way.
  const store = f.runtime.session.store, put = store.put.bind(store), putting = deferred(), disk = deferred();
  store.put = async (...args) => { putting.resolve(); await disk.promise; return put(...args); };
  const sent = f.send(f.body(A, 2, 16000));
  assert.equal(await bounded(putting.promise.then(() => 'storing')), 'storing');
  const ending = f.req('/v1/session/end', {});
  const meanwhile = await Promise.race([ending.then(() => 'ended'), sent.then(() => 'answered'), pause(150).then(() => 'both wait')]);
  const given = cancelled(media.calls.at(-1));
  disk.resolve();
  const stored = await bounded(sent), ended = await bounded(ending);
  assert.deepEqual({ meanwhile, cancelled: given === true, stored, ended, kept: (await f.saved(A, 'session.json')).segments.map(s => s.id), files: (await fsp.readdir(path.join(f.sessionsRoot, A, 'media'))).filter(name => name.startsWith('moment-2')).length > 0, state: (await f.saved(A, 'manifest.json')).state }, {
    meanwhile: 'both wait', cancelled: false, stored: { status: 200, value: { id: 'moment-2', duplicate: false } }, ended: { status: 200, value: { ended: true, id: A, archived: true } }, kept: ['moment-1', 'moment-2'], files: true, state: 'archived' });
});

// ---- The life a block was accepted in --------------------------------------------------------------------------------

test('a block prepared across a restart of its capture on the same session is refused when it comes to be stored, stores nothing and marks nothing in the new capture', async t => {
  const media = assembly(), f = await host(t, { media });
  const A = await f.start();
  await f.block(A, 1, 8000);
  media.hold = 'held';
  const body = f.body(A, 2, 16000), sent = f.send(body);
  await until(() => media.held.length === 1, 'the assembly of the second block');
  const call = media.held[0];
  // The TV restarted its capture without a pause: the same session, still capturing, numbered anew.
  const again = (await f.req('/v1/session/start', {})).value;
  // A start ends no session: nothing is cancelled, the block is refused when its preparation comes back.
  const given = cancelled(call);
  call.finish();
  const stale = await bounded(sent), after = await f.passages();
  const fresh = await f.send(body), replay = await f.send(body);
  assert.deepEqual({ same: [again.id === A, again.accepting], cancelled: given === true, stale, after, fresh, replay }, {
    same: [true, true], cancelled: false, stale: { status: 409, value: CHANGED }, after: ['moment-1'],
    fresh: { status: 200, value: { id: 'moment-2', duplicate: false } }, replay: { status: 200, value: { id: 'moment-2', duplicate: true } } });
});

test('a block that arrives while the end of its session is asked for is refused before any media work', async t => {
  const media = assembly(), f = await host(t, { media });
  const A = await f.start();
  await f.block(A, 1, 8000);
  // Session changes run one at a time: this one holds the line, so the end that follows is asked for and has not begun.
  const line = deferred(), holding = f.runtime.exclusive(() => line.promise);
  const ending = f.req('/v1/session/end', {});
  await until(() => f.runtime.moving(), 'the end of the session to be asked for');
  const prepared = media.calls.length;
  const refused = await f.send(f.body(A, 2, 16000));
  const work = media.calls.length - prepared;
  line.resolve(); await holding;
  assert.deepEqual({ refused, work, ended: await bounded(ending) }, { refused: { status: 503, value: CLOSING }, work: 0, ended: { status: 200, value: { ended: true, id: A, archived: true } } });
});

// ---- What is the host's and what is the block's ----------------------------------------------------------------------

test('a media tool that does not end in time, cannot be started, or has no temporary directory is answered 503 with a code and no path of the host, and the same block is admitted again; a block that is itself wrong stays 400 with its message', async t => {
  const dirs = scratch(t), media = { assemble: (input, options) => media.current.assemble(input, options) }, f = await host(t, { media });
  const jpeg = await image(), sound = wav(), A = await f.start();
  let sequence = 0;
  const block = extra => f.body(A, ++sequence, 8000, { frames: [{ atMs: 0, data: jpeg }], ...extra });
  const answers = {};
  // Killed by its time limit, as tests/server-ingest-path.test.cjs shows on the assembler alone.
  media.current = new RemoteMedia({ ffmpeg: f.hang, timeoutMs: 150 });
  const slow = block({ audio: sound });
  answers.slow = await f.send(slow); answers.slowAgain = await f.send(slow);
  media.current = new RemoteMedia({ ffmpeg: path.join(f.root, 'no-such-ffmpeg') });
  answers.absent = await f.send(block());
  media.current = new RemoteMedia({ ffmpeg: f.write });
  dirs.refuse = Object.assign(new Error(`ENOSPC: no space left on device, mkdtemp '${path.join(os.tmpdir(), 'tvlens-ingest-XXXXXX')}'`), { code: 'ENOSPC' });
  answers.noRoom = await f.send(block());
  dirs.refuse = null;
  // The block's own doing: refused as before, in the same words, and not sent again by its capture.
  answers.notWav = await f.send(block({ audio: Buffer.from('not wave').toString('base64') }));
  answers.notAnImage = await f.send(block({ frames: [{ atMs: 0, data: Buffer.from('not an image').toString('base64') }] }));
  answers.incoherent = await f.send(block({ overlay: { cropped: 3, withheld: 0 } }));
  media.current = new RemoteMedia({ ffmpeg: f.fail });
  answers.toolRefused = await f.send(block());
  answers.notAnImage.value.error = answers.notAnImage.value.error.replace(/^.*(unsupported image format).*$/s, '$1');
  const unavailable = error => ({ status: 503, value: { error, code: UNAVAILABLE } }), invalid = error => ({ status: 400, value: { error } });
  assert.deepEqual({ ...answers, paths: JSON.stringify(answers).includes(os.tmpdir()), stored: await f.passages(), left: await dirs.left() }, {
    slow: unavailable('Préparation média trop longue.'), slowAgain: unavailable('Préparation média trop longue.'), absent: unavailable('Outil média indisponible.'), noRoom: unavailable('Espace temporaire média indisponible.'),
    notWav: invalid('Audio WAV requis.'), notAnImage: invalid('unsupported image format'), incoherent: invalid('Déclaration d’images masquées incohérente.'), toolRefused: invalid('Préparation média échouée : boom'),
    paths: false, stored: [], left: [] });
  // Nothing above cost the session its capture: the next block is prepared and stored.
  media.current = new RemoteMedia({ ffmpeg: f.write });
  assert.deepEqual(await f.send(block()), { status: 200, value: { id: 'moment-1', duplicate: false } });
});

test('the assembler given a signal makes nothing once it has fired, starts no tool when it fires between two steps, kills its own tool when it fires meanwhile, and settles only once that tool has left and its directory is removed', async t => {
  const dirs = scratch(t), b = await bench(t), jpeg = await image();
  const input = () => ({ sessionId: 's', sequence: 1, startMs: 0, endMs: 100, frames: [{ atMs: 0, data: jpeg }], audio: wav() });
  const reason = Object.assign(new Error('given up by its owner'), { status: 503, code: 'test' });
  const before = new AbortController(); before.abort(reason);
  const refused = await bounded(failure(new RemoteMedia({ ffmpeg: b.hang }).assemble(input(), { signal: before.signal })), 2000);
  const untouched = { error: refused === reason, dirs: dirs.made.length, tools: (await b.started()).length };
  // Given up while its directory was being made: the directory goes, and no tool is started in it.
  const between = new AbortController(); dirs.once = () => between.abort(reason);
  const early = await bounded(failure(new RemoteMedia({ ffmpeg: b.hang }).assemble(input(), { signal: between.signal })), 2000);
  const skipped = { error: early === reason, tools: (await b.started()).length - untouched.tools, left: await dirs.left() };
  const tools = (await b.started()).length;
  const during = new AbortController(), pending = failure(new RemoteMedia({ ffmpeg: b.hang }).assemble(input(), { signal: during.signal }));
  await until(async () => (await b.started()).length > tools, 'the media tool');
  const pid = (await b.started()).at(-1);
  during.abort(reason);
  const stopped = await bounded(pending, 2000);
  assert.deepEqual({ untouched, skipped, stopped: stopped === reason, toolAlive: alive(pid), left: await dirs.left() }, {
    untouched: { error: true, dirs: 0, tools: 0 }, skipped: { error: true, tools: 0, left: [] }, stopped: true, toolAlive: false, left: [] });
});

// The assembler on a spawn of the test's. It binds `spawn` when it is loaded: a copy of the module of its own.
function assemblerOn(t, spawn) {
  const file = require.resolve('../adapters/remote-media.cjs'), loaded = require.cache[file];
  const mock = t.mock.method(childProcess, 'spawn', spawn);
  delete require.cache[file];
  try { return require(file).RemoteMedia; } finally { require.cache[file] = loaded; mock.mock.restore(); }
}

test('a spawn the system refuses is a refusal of the host, heard: a child without pid or pipes that says so on the next tick, and a spawn that throws', async t => {
  const dirs = scratch(t), jpeg = await image(), heard = [];
  const input = () => ({ sessionId: 's', sequence: 1, startMs: 0, endMs: 100, frames: [{ atMs: 0, data: jpeg }], audio: wav() });
  // What Node hands back when the system is out of descriptors (lib/internal/child_process.js): no pid, no pipes,
  // and the error on the next tick. Unheard, that error would end the host: the double only tells whether it was.
  const starved = () => {
    const child = Object.assign(new EventEmitter(), { kill: () => false });
    process.nextTick(() => { heard.push(child.listenerCount('error') > 0); if (heard.at(-1)) child.emit('error', Object.assign(new Error('spawn EMFILE'), { code: 'EMFILE' })); });
    return child;
  };
  const shape = error => [error.status, error.code, error.message];
  const without = shape(await bounded(failure(new (assemblerOn(t, starved))({ ffmpeg: 'ffmpeg' }).assemble(input())), 2000));
  const thrown = shape(await bounded(failure(new (assemblerOn(t, () => { throw Object.assign(new Error(`spawn ${os.tmpdir()}/ffmpeg EINVAL`), { code: 'EINVAL' }); }))({ ffmpeg: 'ffmpeg' }).assemble(input())), 2000));
  assert.deepEqual({ without, heard, thrown, left: await dirs.left() }, { without: [503, UNAVAILABLE, 'Outil média indisponible.'], heard: [true], thrown: [503, UNAVAILABLE, 'Outil média indisponible.'], left: [] });
});

// ---- What was already guaranteed --------------------------------------------------------------------------------------

test('a client that leaves while its block is prepared cancels nothing: the block is stored once, and sent again it is answered as a duplicate', async t => {
  const media = assembly(), f = await host(t, { media });
  const A = await f.start(), body = f.body(A, 1, 8000), gone = deferred();
  f.clock = 8000; media.hold = 'held';
  f.server.server.once('request', (req, res) => res.once('close', gone.resolve));
  const client = new AbortController();
  const sent = fetch(f.server.url + '/v1/segments', { method: 'POST', signal: client.signal, headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(() => 'answered', error => error.name);
  await until(() => media.held.length === 1, 'the assembly of the block');
  const call = media.held[0];
  client.abort();
  assert.equal(await bounded(sent), 'AbortError');
  await bounded(gone.promise);
  for (let i = 0; i < 10; i++) await tick();
  const given = cancelled(call);
  call.finish();
  await until(async () => (await f.passages()).length === 1, 'the block to be stored');
  assert.deepEqual({ cancelled: given === true, again: await f.send(body), stored: await f.passages(), prepared: media.calls.length }, {
    cancelled: false, again: { status: 200, value: { id: 'moment-1', duplicate: true } }, stored: ['moment-1'], prepared: 1 });
});

test('what the transport already guaranteed stays: one preparation at a time, duplicates and old numbers answered without media work, bounded bodies, a pause that refuses the block it interrupts, and an archive that receives no capture', async t => {
  const media = assembly(), f = await host(t, { media });
  const A = await f.start(), first = f.body(A, 1, 8000);
  const facts = { stored: await f.send(first) };
  await f.settled();
  facts.duplicate = await f.send(first);
  facts.otherContent = await f.send({ ...first, endMs: 7000 });
  facts.oldNumber = await f.send(f.body(A, 0, 16000));
  facts.preparedOnce = media.calls.length;
  // A second block while the first is prepared: refused for now, to be sent again.
  media.hold = 'held';
  const second = f.send(f.body(A, 2, 16000));
  await until(() => media.held.length === 1, 'the assembly of the second block');
  facts.busy = await f.send(f.body(A, 3, 24000));
  media.held[0].finish();
  facts.second = await bounded(second);
  await f.settled();
  // A body announced beyond the bound is refused on its announcement.
  facts.tooLarge = await bounded(new Promise((resolve, reject) => {
    const url = new URL(f.server.url);
    const req = http.request({ host: url.hostname, port: url.port, path: '/v1/segments', method: 'POST', agent: false, headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json', 'Content-Length': 13000001 } }, res => {
      let text = ''; res.on('data', chunk => { text += chunk; }); res.on('end', () => { resolve({ status: res.statusCode, value: JSON.parse(text) }); req.destroy(); });
    });
    req.on('error', reject); req.flushHeaders();
  }));
  // A pause ends no session and cancels nothing: the block it interrupts is refused as before (kept out of F06).
  media.hold = 'held';
  const third = f.send(f.body(A, 4, 24000));
  await until(() => media.held.length === 2, 'the assembly of the third block');
  await f.req('/v1/session/pause', {});
  facts.pauseCancels = cancelled(media.held[1]) === true;
  media.held[1].finish();
  facts.paused = await bounded(third);
  // Ended, then opened as an archive: read-only, and refused before anything is prepared.
  await f.req('/v1/session/end', {});
  await f.req(`/v1/sessions/${A}/open`, {});
  const prepared = media.calls.length;
  facts.archive = await f.send(f.body(A, 5, 24000));
  facts.archivePrepared = media.calls.length - prepared;
  assert.deepEqual(facts, { stored: { status: 200, value: { id: 'moment-1', duplicate: false } }, duplicate: { status: 200, value: { id: 'moment-1', duplicate: true } },
    otherContent: { status: 409, value: { error: 'Séquence déjà utilisée avec un autre contenu.' } }, oldNumber: { status: 409, value: { error: 'Séquence ancienne.' } }, preparedOnce: 1,
    busy: { status: 429, value: { error: 'Préparation du passage précédent.' } }, second: { status: 200, value: { id: 'moment-2', duplicate: false } },
    tooLarge: { status: 413, value: { error: 'Requête trop volumineuse.' } }, pauseCancels: false, paused: { status: 400, value: { error: 'La session est arrêtée.' } },
    archive: { status: 409, value: { error: READ_ONLY, code: 'read-only' } }, archivePrepared: 0 });
});
