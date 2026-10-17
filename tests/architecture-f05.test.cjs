const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { pause, tick, turns, deferred, until, bounded, failure } = require('./helpers/wait.cjs');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const Module = require('node:module');
const childProcess = require('node:child_process');
const { EventEmitter } = require('node:events');
const sharp = require('sharp');
const { CodexRpc } = require('../adapters/codex-rpc.cjs');
const { CodexSessionClient } = require('../adapters/codex-session-client.cjs');
const { CodexSurveillanceAgent } = require('../adapters/codex-surveillance-agent.cjs');
const { VideoBridge } = require('../adapters/video-bridge.cjs');
const { SessionLibrary } = require('../adapters/session-library.cjs');
const { VideoTools, consultationOf } = require('../core/video-tools.cjs');
const { createSessionRuntime, openArchivedSession } = require('../runtime/session-runtime.cjs');
const { createSurveillanceRuntime } = require('../runtime/surveillance-runtime.cjs');

// F05: a Codex process group has one owner until it is gone, a reconnection waits for the group it replaces, and the
// end of a session revokes what was opened on it. Offline: Node children stand for Codex behind the real transport, a
// fake App Server stands behind the real client, the real runtimes and the real Mac main process run on simulated
// agents. Processes, signals and refusals are counted: nothing here measures a latency, nor what the real Codex does
// when it is closed.
const win32 = process.platform === 'win32';
const STILL_THERE = 'Arrêt du processus Codex précédent non confirmé : connexion refusée.';
const REVOKED = 'Session terminée : ses passages ne peuvent plus être réexaminés.';
const CONTEXT_REVOKED = 'Contexte MCP révoqué : session terminée.';
const OPEN_FIRST = 'Commence par search_moments pour ouvrir un contexte de 5 minutes.';
const alive = pid => { try { process.kill(pid, 0); return true; } catch (error) { return error.code !== 'ESRCH'; } };
// Never an existing directory: connect() must not link real credentials during tests.
const authHome = path.join(os.tmpdir(), 'tvlens-test-absent-codex-home');
// Other test files create trees in the same temp root: follow only the ones made here.
function created(t) {
  const dirs = [], original = fsp.mkdtemp;
  t.mock.method(fsp, 'mkdtemp', async (...args) => { const dir = await original(...args); dirs.push(dir); return dir; });
  return async () => (await Promise.all(dirs.map(dir => fsp.access(dir).then(() => dir, () => null)))).filter(Boolean);
}
// What the client reports goes to stderr: kept out of the test output, and readable here.
const write = process.stderr.write, journal = [];
before(() => { process.stderr.write = (chunk, ...rest) => (String(chunk).startsWith('TVLens :') ? (journal.push(String(chunk)), true) : write.call(process.stderr, chunk, ...rest)); });
after(() => { process.stderr.write = write; });
// The removal of a client's private tree: counted, and held for as long as the test says.
function treeRemovals(t) {
  const rm = fsp.rm, seen = { removed: [], gate: null };
  t.mock.method(fsp, 'rm', async (target, ...rest) => {
    if (path.basename(String(target)).startsWith('tvlens-codex-session-')) { seen.removed.push(String(target)); await seen.gate?.promise; }
    return rm(target, ...rest);
  });
  seen.hold = () => { seen.gate = deferred(); };
  seen.release = () => { const gate = seen.gate; seen.gate = null; gate?.resolve(); };
  return seen;
}

// ---- The transport and the process group it starts -----------------------------------------------------------------

const node = (code, options = {}) => new CodexRpc({ binary: process.execPath, args: ['-e', code], cwd: os.tmpdir(), env: { PATH: process.env.PATH }, onEvent() {}, onRequest() {}, ...options }).start();
const printed = (child, text) => new Promise(resolve => child.stdout.on('data', chunk => { if (String(chunk).includes(text)) resolve(); }));
// Whatever a test proved, what it started is killed when it ends.
const reap = (t, pid, group = true) => t.after(() => { try { process.kill(group ? -pid : pid, 'SIGKILL'); } catch {} });

test('closing a transport answers once its process group is gone: at once for a Codex that ends on SIGTERM, after the kill for one that ignores it', { skip: win32 }, async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const polite = node("setInterval(() => {}, 1000); console.log('ready');"), first = polite.child;
  reap(t, first.pid);
  assert.equal(await bounded(printed(first, 'ready')), undefined);
  const left = polite.close();
  assert.equal(typeof left?.then, 'function', 'close() hands back the exit of the group it started');
  assert.equal(await bounded(left), true);
  assert.deepEqual([first.signalCode, alive(first.pid)], ['SIGTERM', false]);

  const stubborn = node("process.on('SIGTERM', () => console.log('term')); setInterval(() => {}, 1000); console.log('ready');"), child = stubborn.child;
  reap(t, child.pid);
  assert.equal(await bounded(printed(child, 'ready')), undefined);
  const ignored = printed(child, 'term');
  let answer = 'pending';
  const closing = stubborn.close();
  closing.then(value => { answer = value; });
  assert.equal(await bounded(ignored), undefined);
  t.mock.timers.tick(2999);
  await pause(30);
  assert.deepEqual([answer, alive(child.pid)], ['pending', true], 'not answered while the group is still there');
  t.mock.timers.tick(1);
  assert.equal(await bounded(closing), true);
  assert.deepEqual([child.signalCode, alive(child.pid)], ['SIGKILL', false]);
  // Asked again, or of a transport that never started: the same answer, and nothing is sent to anyone.
  const kill = t.mock.method(process, 'kill', () => true);
  assert.deepEqual([await stubborn.close(), await polite.close(), await new CodexRpc({ binary: 'x', args: [], onEvent() {} }).close()], [true, true, true]);
  t.mock.timers.tick(60000);
  assert.equal(kill.mock.callCount(), 0);
  kill.mock.restore();
});

test('a launcher that dies leaves what it started to the owner of its group: SIGTERM at once, the kill after the bound, and nothing once the group is gone', { skip: win32 }, async t => {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'tvlens-f05-launcher-'));
  t.after(() => fsp.rm(dir, { recursive: true, force: true }));
  const ready = path.join(dir, 'ready'), term = path.join(dir, 'term');
  // What the launcher leaves behind in its group: it records the SIGTERM it receives, and goes on.
  const survivor = `const fs = require('node:fs'); process.on('SIGTERM', () => fs.writeFileSync(${JSON.stringify(term)}, 'received')); setInterval(() => {}, 1000); fs.writeFileSync(${JSON.stringify(ready)}, 'ready');`;
  // The launcher starts it, says its pid once it listens, and ends by itself.
  const launcher = `const fs = require('node:fs'), child = require('node:child_process').spawn(process.execPath, ['-e', process.argv[1]], { stdio: 'ignore' });
    const timer = setInterval(() => { if (!fs.existsSync(${JSON.stringify(ready)})) return; clearInterval(timer); process.stdout.write(child.pid + '\\n', () => process.exit(0)); }, 5);`;
  const events = [];
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const rpc = new CodexRpc({ binary: process.execPath, args: ['-e', launcher, survivor], cwd: dir, env: { PATH: process.env.PATH }, onEvent: method => events.push(method), onRequest() {} }).start();
  const child = rpc.child;
  reap(t, child.pid);
  let said = '';
  child.stdout.on('data', chunk => { said += chunk; });
  assert.equal(await bounded(new Promise(resolve => child.once('exit', code => resolve(code)))), 0, 'the launcher ended by itself');
  await until(() => said.endsWith('\n'), 'the launcher said what it started');
  const pid = Number(said);
  reap(t, pid, false);
  assert.ok(pid > 0 && alive(pid), 'what it started outlives it');
  assert.deepEqual(events, ['connection/closed'], 'the connection is told closed, as it always was');
  // Nobody closed anything: the exit of the launcher alone makes the owner of the group end what is left of it.
  await until(() => fs.existsSync(term), 'SIGTERM reaches what the launcher left behind');
  assert.equal(alive(pid), true, 'which ignores it');
  t.mock.timers.tick(2999);
  await pause(50);
  assert.equal(alive(pid), true, 'and is left the whole bound');
  t.mock.timers.tick(1);
  await until(() => !alive(pid), 'killed once the bound has passed');
  // With its launcher gone the group is looked at on a timer: close() answers once it is seen empty.
  let answer = 'pending';
  rpc.close().then(value => { answer = value; });
  for (let i = 0; i < 40 && answer === 'pending'; i++) { t.mock.timers.tick(50); await pause(5); }
  assert.equal(answer, true);
  const kill = t.mock.method(process, 'kill', () => true);
  t.mock.timers.tick(60000);
  assert.equal(await rpc.close(), true);
  assert.equal(kill.mock.callCount(), 0, 'no timer is left, and a group seen gone is never signalled again');
  kill.mock.restore();
});

// A group number that is nobody's: whatever happens to a test, no signal of it can reach a real process.
const NOBODY = 0x7ffffff0;
// The transport on a spawn of the test's. It binds `spawn` when it is loaded: a copy of the module of its own.
function transportOn(t, spawn) {
  const file = require.resolve('../adapters/codex-rpc.cjs'), loaded = require.cache[file];
  const mock = t.mock.method(childProcess, 'spawn', spawn);
  delete require.cache[file];
  try { return require(file).CodexRpc; } finally { require.cache[file] = loaded; mock.mock.restore(); }
}
const pipe = () => Object.assign(new EventEmitter(), { writable: true, write: () => true, setEncoding() {} });

test('a group still there after the kill is said as such, within the bound; asked again it is looked at, never signalled, and no timer is left', async t => {
  const child = Object.assign(new EventEmitter(), { pid: NOBODY, exitCode: null, signalCode: null, stdin: pipe(), stdout: pipe(), stderr: pipe(), kill: () => true });
  const Transport = transportOn(t, () => child), sent = [];
  let present = true;
  // No signal leaves this test: `process.kill` answers for the group.
  t.mock.method(process, 'kill', (pid, signal) => { sent.push([pid, signal]); if (!present) throw Object.assign(new Error('kill ESRCH'), { code: 'ESRCH' }); return true; });
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const rpc = new Transport({ binary: 'codex', args: [], onEvent() {} }).start();
  let answer = 'pending';
  Promise.resolve(rpc.close()).then(value => { answer = value; });
  assert.deepEqual(sent, [[-NOBODY, 'SIGTERM']], 'SIGTERM is sent before close() returns, to the group it owns');
  t.mock.timers.tick(2999);
  await turns(10);
  assert.deepEqual([sent.length, answer], [1, 'pending']);
  t.mock.timers.tick(1);
  await turns(10);
  assert.deepEqual([sent.at(-1), answer], [[-NOBODY, 'SIGKILL'], 'pending']);
  t.mock.timers.tick(1000);
  await turns(10);
  assert.equal(answer, false, 'not seen gone: said so, never passed off as an exit');
  const signalled = sent.length;
  t.mock.timers.tick(600000);
  assert.equal(await rpc.close(), false);
  assert.equal(sent.length, signalled, 'nothing is armed and nothing is sent again');
  // Its launcher ends at last and nothing is left of the group: asked again, the transport says so.
  present = false; child.exitCode = 0; child.emit('exit', 0, null);
  assert.equal(await rpc.close(), true);
  assert.deepEqual(sent.slice(signalled), [[-NOBODY, 0]], 'looked at once, with the signal that sends nothing');
  assert.equal(await rpc.close(), true);
  assert.equal(sent.length, signalled + 1, 'and never again once it was seen gone');
});

test('a spawn the system refuses ends as a closed connection, never as an exception of the host: a child without pid or pipes, a spawn that throws, a binary that is not there', async t => {
  // What Node hands back when it ran out of descriptors (EMFILE, ENFILE): no pid, no stdio, the error on the next tick.
  const bare = () => Object.assign(new EventEmitter(), { kill: () => false });
  const child = bare(), events = [];
  const rpc = new (transportOn(t, () => child))({ binary: 'codex', args: [], onEvent: method => events.push(method) });
  assert.doesNotThrow(() => rpc.start(), 'no pipe is read before it is known to exist');
  const disconnected = await failure(rpc.request('initialize'));
  assert.equal(disconnected.message, 'Codex déconnecté.');
  assert.equal(disconnected.code, 'TVLENS_CODEX_DISCONNECTED');
  assert.doesNotThrow(() => child.emit('error', Object.assign(new Error('spawn EMFILE'), { code: 'EMFILE' })), 'the refusal reported afterwards is heard');
  assert.deepEqual(events, ['connection/closed']);
  assert.equal(await rpc.close(), true);
  // A spawn that throws is its caller's to hear, as before; the transport it leaves is closed without harm.
  const thrown = new (transportOn(t, () => { throw Object.assign(new Error('spawn EINVAL'), { code: 'EINVAL' }); }))({ binary: 'codex', args: [], onEvent() {} });
  assert.throws(() => thrown.start(), /EINVAL/);
  const invalidSpawn = await failure(thrown.request('initialize'));
  assert.deepEqual([invalidSpawn.message, await thrown.close()], ['Codex déconnecté.', true]);
  assert.equal(invalidSpawn.code, 'TVLENS_CODEX_DISCONNECTED');
  // The real spawn of a binary that is not there: pipes, no pid, the error on the next tick.
  const seen = [], absent = new CodexRpc({ binary: path.join(os.tmpdir(), 'tvlens-f05-absent-codex'), args: [], cwd: os.tmpdir(), env: {}, onEvent: method => seen.push(method) }).start();
  await until(() => seen.length, 'the refusal is reported');
  const absentBinary = await failure(absent.request('initialize'));
  assert.deepEqual([[...seen], absentBinary.message, await absent.close()], [['connection/closed'], 'Codex déconnecté.', true]);
  assert.equal(absentBinary.code, 'TVLENS_CODEX_DISCONNECTED');
  // Behind the client: the connection is refused in the words of a lost one, and neither a process nor a private tree is left.
  const remaining = created(t), Transport = transportOn(t, bare);
  const client = new CodexSessionClient({ authHome, rpcFactory: options => new Transport(options) });
  const clientError = await failure(client.prepare('s'));
  assert.equal(clientError.message, 'Codex déconnecté.');
  assert.equal(clientError.code, 'TVLENS_CODEX_DISCONNECTED');
  assert.deepEqual([client.rpc, client.ready, await remaining()], [null, null, []]);
});

// ---- The client: one process group at a time -----------------------------------------------------------------------

// Fake App Server. One factory call is one process; like the real transport, closing it tells the connection closed
// and answers with the exit of its process group, which is the test's to give: `exit.resolve(true)` once it is gone,
// `exit.resolve(false)` when it is still there after the bound. `script(turn)` plays a turn; without one it answers.
function appServer({ script, interrupted = end => end() } = {}) {
  const processes = [];
  let threads = 0, turns = 0, released = false;
  const rpcFactory = rpc => {
    const child = { options: rpc, started: false, closed: 0, requests: [], exit: deferred() };
    if (released) child.exit.resolve(true);
    processes.push(child);
    return { start() { child.started = true; }, send() {},
      close() { child.closed++; rpc.onEvent('connection/closed', {}); return child.exit.promise; },
      async request(method, params) {
        child.requests.push(method);
        if (child.closed) throw Error('Connexion Codex interrompue.');
        if (method === 'thread/start') return { thread: { id: 'thread-' + ++threads } };
        if (method === 'turn/interrupt') { interrupted(() => rpc.onEvent('turn/completed', { threadId: params.threadId, turn: { id: params.turnId, status: 'interrupted' } })); return {}; }
        if (method !== 'turn/start') return {};
        const id = 'turn-' + ++turns, threadId = params.threadId;
        setImmediate(async () => {
          rpc.onEvent('turn/started', { threadId, turn: { id } });
          const result = script ? await script({ id, threadId, rpc }) : { ok: id };
          rpc.onEvent('item/completed', { threadId, turnId: id, item: { type: 'agentMessage', text: JSON.stringify(result) } });
          rpc.onEvent('turn/completed', { threadId, turn: { id, status: 'completed' } });
        });
        return { turn: { id } };
      } };
  };
  return { rpcFactory, processes, started: () => processes.filter(child => child.started).length,
    // Nothing is left waiting: every exit a test did not give is given, and the ones still to come too.
    release: () => { released = true; for (const child of processes) child.exit.resolve?.(true); } };
}
// The real client on that server. Whatever the test did, its processes are let go and it is closed when the test ends.
function connection(t, { script, interrupted, ...options } = {}) {
  const server = appServer({ script, interrupted }), client = new CodexSessionClient({ authHome, rpcFactory: server.rpcFactory, ...options });
  t.after(async () => { server.release(); await client.close(); });
  return { ...server, client, turn: (extra = {}) => client.answer({ sessionId: 's', instructions: 'Décris.', signal: new AbortController().signal, ...extra }) };
}

test('a reconnection waits for the process group of the connection it replaces: close then prepare, another session, a process recycled after its rotations', async t => {
  const remaining = created(t), f = connection(t);
  await f.client.prepare('s');
  const [first] = f.processes;
  // close() then prepare(): the new connection waits for the closing of the one it replaces, and starts nothing meanwhile.
  const closing = f.client.close(), next = f.client.prepare('s');
  await pause(30);
  assert.deepEqual([f.started(), (await remaining()).length], [1, 1], 'no second process, and the tree of the first is kept, while its group is not seen gone');
  first.exit.resolve(true);
  await closing;
  assert.ok(await next);
  assert.deepEqual([f.started(), (await remaining()).length, f.client.threadId], [2, 1, 'thread-2']);
  // Another session on the same client.
  const [, second] = f.processes, other = f.client.prepare('other');
  await until(() => second.closed === 1 || f.started() === 3, 'the client leaves the former session');
  await pause(30);
  assert.equal(f.started(), 2);
  second.exit.resolve(true);
  assert.ok(await other);
  assert.deepEqual([f.started(), (await remaining()).length], [3, 1]);
  // A process that served its rotations is recycled: the rotation closes it, and the reconnection it starts waits too.
  const recycled = connection(t, { maxRotations: 0 });
  await recycled.turn();
  const [old] = recycled.processes, rotation = recycled.client.rotateThread(), turn = recycled.turn();
  await until(() => old.closed === 1 || recycled.started() === 2, 'the rotation closes the process');
  await pause(30);
  assert.equal(recycled.started(), 1);
  old.exit.resolve(true);
  await rotation;
  const result = await turn;
  assert.deepEqual([recycled.started(), result.coldStart, result.ok], [2, true, 'turn-2']);
});

test('every way a transport is left holds the reconnection until its group is gone: a foreign thread, a refused turn that never ends, a cancelled turn that does not stop', async t => {
  const held = async (f, process, turn) => {
    await until(() => process.closed >= 2 || f.started() === 2, 'the next turn reaches the process that was closed');
    await pause(30);
    assert.equal(f.started(), 1, 'no second process while the first is not seen gone');
    process.exit.resolve(true);
    assert.deepEqual([(await turn).ok, f.started()], ['turn-2', 2]);
  };
  // A thread the host did not open: the guard closes the process between two turns.
  const guarded = connection(t);
  await guarded.turn();
  const [first] = guarded.processes;
  first.options.onEvent('thread/started', { thread: { id: 'sub-agent' } });
  assert.equal(first.closed, 1, 'closed by the guard');
  await held(guarded, first, guarded.turn());

  // A turn the guard refused and whose end Codex never reports: its process goes after the drain.
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  let refuse = true;
  const drained = connection(t, { interrupted: () => {}, script: ({ id, threadId, rpc }) => {
    if (!refuse) return { ok: id };
    refuse = false;
    rpc.onEvent('item/started', { threadId, turnId: id, item: { type: 'commandExecution' } });
    return new Promise(() => {});
  } });
  const refused = drained.turn(), queued = drained.turn();
  await assert.rejects(refused, /hors du périmètre TVLens/);
  await turns(10);
  const [stuck] = drained.processes;
  assert.equal(stuck.closed, 0, 'left the time to report the end of the refused turn');
  t.mock.timers.tick(3000);
  await held(drained, stuck, queued);

  // A cancelled turn that Codex does not stop: the watchdog closes its process three seconds after the cancellation.
  let hang = true;
  const watched = connection(t, { interrupted: () => {}, script: ({ id }) => { if (!hang) return { ok: id }; hang = false; return new Promise(() => {}); } });
  const cancel = new AbortController(), cancelled = failure(watched.turn({ signal: cancel.signal }));
  await until(() => watched.processes[0]?.requests.includes('turn/start'), 'the turn is running');
  await turns(10);
  cancel.abort(Error('Question annulée.'));
  for (let i = 0; i < 4; i++) {
    t.mock.timers.tick(1000);
    await turns(10);
  }
  assert.ok((await bounded(cancelled)) instanceof Error, 'the cancelled turn is answered');
  assert.equal(watched.processes[0].closed, 1, 'closed by the watchdog');
  await held(watched, watched.processes[0], watched.turn());
});

test('a close landing while a reconnection waits leaves neither a process nor a tree, and the client connects again later', async t => {
  const remaining = created(t), f = connection(t);
  await f.client.prepare('s');
  const [first] = f.processes, closing = f.client.close(), waiting = failure(f.client.prepare('s'));
  await pause(30);
  const again = f.client.close();
  first.exit.resolve(true);
  await Promise.all([closing, again]);
  assert.equal((await waiting).message, 'Connexion obsolète.');
  await turns(10);
  assert.deepEqual([f.started(), f.client.rpc, f.client.ready, await remaining()], [1, null, null, []]);
  assert.ok(await f.client.prepare('s'));
  assert.deepEqual([f.started(), (await remaining()).length], [2, 1], 'closing is a recycling: the same client connects again');
});

test('closings that overlap are one closing: each waits for the process to be gone and for its private tree to be removed, once; a reconnection waits for it too', async t => {
  const remaining = created(t), trees = treeRemovals(t), f = connection(t);
  try {
    await f.client.prepare('s');
    const [first] = f.processes, over = [];
    trees.hold();
    const one = f.client.close().then(() => over.push('first')), two = f.client.close().then(() => over.push('second'));
    await pause(30);
    assert.deepEqual([over, first.closed, trees.removed.length], [[], 1, 0], 'neither is over while the process is not seen gone');
    first.exit.resolve(true);
    await until(() => trees.removed.length === 1, 'its private tree is being removed');
    await pause(30);
    assert.deepEqual([over, (await remaining()).length], [[], 1], 'nor while its private tree is still there');
    trees.release();
    await Promise.all([one, two]);
    assert.deepEqual([over.sort(), first.closed, trees.removed.length, await remaining()], [['first', 'second'], 1, 1, []], 'the process was asked to end once, and its tree removed once');
    // A reconnection arriving meanwhile makes nothing of its own, tree or process, before that closing is over.
    assert.ok(await f.client.prepare('s'));
    const [, second] = f.processes;
    trees.hold();
    const closing = f.client.close(), also = f.client.close(), next = f.client.prepare('s');
    second.exit.resolve(true);
    await until(() => trees.removed.length === 2, 'the tree of the former connection is being removed');
    await pause(30);
    assert.deepEqual([f.started(), (await remaining()).length], [2, 1], 'no tree and no process of its own while the former tree is still there');
    trees.release();
    await Promise.all([closing, also]);
    assert.ok(await next);
    assert.deepEqual([f.started(), second.closed, trees.removed.length, (await remaining()).length], [3, 1, 2, 1], 'one closing for the three of them, then the connection');
  } finally { trees.release(); }
});

test('a process group that is not seen gone keeps its private tree: the closing returns and the journal says so, nothing is removed or started, and the tree goes, once, before the next connection when the group is gone at last', async t => {
  const remaining = created(t), trees = treeRemovals(t), f = connection(t, { role: 'analysis' });
  const said = () => journal.filter(line => /« analysis » non confirmé/.test(line)).length;
  try {
    await f.client.prepare('s');
    const [stuck] = f.processes, tree = f.client.dir;
    // Still there after the bound of the transport: the closing returns all the same, so that a session can be archived.
    stuck.exit.resolve(false);
    await f.client.close();
    assert.deepEqual([await remaining(), trees.removed, f.client.dir, f.client.rpc, said()], [[tree], [], null, null, 1],
      'the tree is kept, never removed under a group that may still be running, and the journal says it');
    // Asked again by a later closing and by connections: still there.
    await f.client.close();
    for (let i = 0; i < 2; i++) assert.equal((await failure(f.client.prepare('s'))).message, STILL_THERE);
    assert.deepEqual([f.started(), await remaining(), trees.removed, said(), f.client.ready], [1, [tree], [], 1, null], 'nothing is started next to it, nothing is removed, and the journal said it once');
    // Gone at last. Two closings and a connection find it out together: the tree is removed once, before anything is made for the connection.
    const asked = stuck.closed;
    stuck.exit = { promise: Promise.resolve(true) };
    trees.hold();
    const one = f.client.close(), two = f.client.close(), next = f.client.prepare('s');
    await until(() => trees.removed.length === 1, 'the tree is removed at last');
    await pause(30);
    assert.deepEqual([f.started(), await remaining(), stuck.closed - asked], [1, [tree], 1], 'asked once more for the three of them, and nothing made for the connection while the tree is still there');
    trees.release();
    await Promise.all([one, two]);
    assert.ok(await next);
    assert.deepEqual([trees.removed, f.started(), (await remaining()).length, said()], [[tree], 2, 1, 1], 'removed exactly once, then the connection');
  } finally { trees.release(); }
});

// A real launcher that dies and what it leaves behind, as two Node programs. The launcher stands for the App Server: it
// answers the handshake and a thread. Started as "mortal", it starts the survivor in its own group, detached from
// every pipe of the host, and ends by itself once the file `die` exists and the survivor has said its pid. The
// survivor records the SIGTERM it receives in the file `term` and only leaves once the file `go` exists: how long
// it outlives its launcher is the test's to say, on no clock. Past the bound of the transport it is killed anyway.
function orphaning(dir) {
  const at = name => path.join(dir, name), file = name => JSON.stringify(at(name));
  return { at, read: name => fs.readFileSync(at(name), 'utf8'), exists: name => fs.existsSync(at(name)),
    survivor: `const fs = require('node:fs'); process.on('SIGTERM', () => { fs.writeFileSync(${file('term')}, 'received'); setInterval(() => { if (fs.existsSync(${file('go')})) process.exit(0); }, 5); });
      setInterval(() => {}, 1000); fs.writeFileSync(${file('pid')}, String(process.pid));`,
    server: `const fs = require('node:fs'); let buffer = '';
      process.stdin.on('data', chunk => { buffer += chunk; for (let at; (at = buffer.indexOf('\\n')) >= 0;) {
        const message = JSON.parse(buffer.slice(0, at)); buffer = buffer.slice(at + 1);
        if (message.id !== undefined) process.stdout.write(JSON.stringify({ id: message.id, result: message.method === 'thread/start' ? { thread: { id: 'thread-' + process.pid } } : {} }) + '\\n');
      } });
      if (process.argv[2] === 'mortal') { require('node:child_process').spawn(process.execPath, ['-e', process.argv[1]], { stdio: 'ignore' });
        const timer = setInterval(() => { if (fs.existsSync(${file('die')}) && fs.existsSync(${file('pid')})) { clearInterval(timer); process.exit(0); } }, 5); }` };
}

test('the real client on the real transport: a Codex whose launcher died is not replaced before what it left behind is gone', { skip: win32 }, async t => {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'tvlens-f05-orphan-'));
  t.after(() => fsp.rm(dir, { recursive: true, force: true }));
  const { at, read, exists, survivor, server } = orphaning(dir), started = [];
  const rpcFactory = options => {
    const rpc = new CodexRpc({ ...options, binary: process.execPath, args: ['-e', server, survivor, started.length ? 'plain' : 'mortal'] }), start = rpc.start.bind(rpc);
    rpc.start = () => { start(); reap(t, rpc.child.pid); return rpc; };
    started.push(rpc);
    return rpc;
  };
  const client = new CodexSessionClient({ authHome, rpcFactory });
  t.after(() => client.close());
  const first = await bounded(client.prepare('s'));
  assert.match(String(first), /^thread-\d+$/);
  // The launcher ends by itself: the client is told that the connection closed, as it always was.
  fs.writeFileSync(at('die'), 'now');
  await until(() => client.ready === null, 'the client is told the connection closed');
  const pid = Number(read('pid'));
  reap(t, pid, false);
  let answered = false;
  const next = client.prepare('s');
  next.then(() => { answered = true; }, () => { answered = true; });
  await until(() => exists('term'), 'what the launcher left behind is asked to end');
  await pause(150);
  assert.deepEqual([started.length, answered, alive(pid)], [1, false, true], 'no second process, and no answer, next to what the first one left behind');
  // It leaves at last: the connection is made.
  fs.writeFileSync(at('go'), 'now');
  const second = await bounded(next);
  assert.deepEqual([started.length, /^thread-\d+$/.test(String(second)), second !== first, alive(pid)], [2, true, true, false], 'the connection is made once the group is gone');
  await client.close();
  assert.deepEqual([client.rpc, started.every(rpc => rpc.child === null)], [null, true]);
});

test('a host with nothing else to do is still there once the group it waits for is gone: its private tree is removed, and what it does next is done', { skip: win32 }, async t => {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'tvlens-f05-host-'));
  t.after(() => fsp.rm(dir, { recursive: true, force: true }));
  const { at, read, exists, survivor, server } = orphaning(dir);
  t.after(() => { try { process.kill(Number(read('pid')), 'SIGKILL'); } catch {} });
  // A host of its own, as server/main.cjs ends: it awaits the closing of its client, then does what comes next. Nothing
  // else keeps it alive: no server, no timer of its own, no other child, and its launcher has ended by itself.
  const host = `
    const fs = require('node:fs');
    const { CodexRpc } = require(${JSON.stringify(require.resolve('../adapters/codex-rpc.cjs'))});
    const { CodexSessionClient } = require(${JSON.stringify(require.resolve('../adapters/codex-session-client.cjs'))});
    let rpc;
    const client = new CodexSessionClient({ authHome: ${JSON.stringify(authHome)}, rpcFactory: options => (rpc = new CodexRpc({ ...options, binary: process.execPath, args: ['-e', process.argv[1], process.argv[2], 'mortal'] })) });
    client.prepare('s').then(async () => {
      const left = new Promise(resolve => rpc.child.once('exit', resolve));
      fs.writeFileSync(${JSON.stringify(at('die'))}, 'now');
      await left;
      fs.writeFileSync(${JSON.stringify(at('host'))}, JSON.stringify({ tree: client.dir }));
      await client.close();
      fs.writeFileSync(${JSON.stringify(at('closed'))}, 'the host was still there');
    });`;
  let child;
  const ended = new Promise(resolve => { child = childProcess.execFile(process.execPath, ['-e', host, server, survivor], { timeout: 20000 }, (error, stdout, stderr) => resolve(error ? `${error.code ?? error.signal} ${stderr}` : 0)); });
  let waiting;
  await until(() => { try { waiting = JSON.parse(read('host')); return exists('term'); } catch { return false; } }, 'the host awaits the end of what its dead launcher left behind');
  const pid = Number(read('pid'));
  t.after(() => fsp.rm(waiting.tree, { recursive: true, force: true }));
  // Left the time to end by itself, were nothing to keep it there: longer than the grace an exiting host gives what it closed.
  await pause(600);
  assert.deepEqual([child.exitCode, alive(pid), fs.existsSync(waiting.tree)], [null, true, true], 'the host is still there, waiting, and so is what it waits for');
  fs.writeFileSync(at('go'), 'now');
  assert.equal(await bounded(ended, 15000), 0);
  await until(() => !alive(pid), 'what the launcher left behind is gone');
  assert.deepEqual([exists('closed'), fs.existsSync(waiting.tree)], [true, false], 'it was still there once the group was gone: its private tree is removed, and what came next was done');
});

test('a surveillance stopped and started again starts no Codex process while the ones it stopped are not seen gone', async t => {
  const server = appServer(), session = { watch: { snapshot: () => ({ id: 'session-f05', elapsedMs: 0, history: [], segments: [] }) }, store: {} };
  const runtime = createSurveillanceRuntime({ getSession: () => session, config: { surveillance: { workers: 2 } },
    agent: new CodexSurveillanceAgent({ authHome, workers: 2, rpcFactory: server.rpcFactory }) });
  t.after(async () => { server.release(); await runtime.close(); });
  const connected = () => server.processes.filter(child => child.requests.includes('thread/start')).length;
  runtime.start({ instruction: 'Vérifie les chiffres annoncés.' });
  await until(() => connected() === 2, 'the reading role and the first verification worker are warmed up');
  const stopped = server.processes.slice(0, 2);
  runtime.stop('Surveillance arrêtée.');
  await until(() => stopped.every(child => child.closed), 'both processes are asked to end');
  runtime.start({ instruction: 'Vérifie les chiffres annoncés.' });
  await pause(50);
  assert.equal(server.started(), 2, 'no process is started next to the ones still ending');
  stopped[0].exit.resolve(true);
  await until(() => server.started() === 3, 'a role reconnects once its own former process is gone');
  await pause(30);
  assert.equal(server.started(), 3, 'the other one still waits for its own');
  stopped[1].exit.resolve(true);
  await until(() => connected() === 4, 'both roles are back');
  server.release();
  await runtime.close();
  assert.deepEqual(server.processes.map(child => child.closed > 0), [true, true, true, true], 'closing the runtime leaves none of them');
});

// ---- The end of a session revokes what was opened on it ------------------------------------------------------------

test('the external MCP contexts opened on a session are revoked at once: a call in flight and a late call are refused, another session keeps its context, capabilities and authentication are untouched', async t => {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'tvlens-f05-bridge-')), gate = deferred(), calls = [];
  let loaded = 'a';
  const bridge = await new VideoBridge({ descriptor: path.join(dir, 'bridge.json'), makeTools: () => {
    const sessionId = loaded;
    return { sessionId, call: async name => { calls.push(`${sessionId} ${name}`); if (name === 'inspect_clip') await gate.promise; return { sessionId, name }; } };
  } }).start();
  t.after(async () => { gate.resolve(); await bridge.close(); await fsp.rm(dir, { recursive: true, force: true }); });
  const post = async (headers, name = 'search_moments') => { const response = await fetch(bridge.url, { method: 'POST', headers, body: JSON.stringify({ name, args: {} }) }); return [response.status, await response.json()]; };
  const call = (client, name) => post({ Authorization: `Bearer ${bridge.master}`, 'X-TVLens-Client': client }, name);
  assert.deepEqual(await call('client-a', 'search_moments'), [200, { sessionId: 'a', name: 'search_moments' }]);
  loaded = 'b';
  assert.deepEqual(await call('client-b', 'search_moments'), [200, { sessionId: 'b', name: 'search_moments' }]);
  // Tools that name no session: their context cannot be told from one of the session that ends.
  loaded = undefined;
  assert.deepEqual(await call('client-x', 'search_moments'), [200, { name: 'search_moments' }]);
  loaded = 'b';
  const cap = path.join(dir, 'cap.json'), question = new AbortController();
  await bridge.register({ call: async () => ({ scoped: true }) }, question.signal, cap);
  const capability = { Authorization: `Bearer ${JSON.parse(await fsp.readFile(cap, 'utf8')).token}` };
  const flying = call('client-a', 'inspect_clip');
  flying.catch(() => {});
  await until(() => calls.includes('a inspect_clip'), 'a call of the first session is in flight');
  assert.equal(typeof bridge.revoke, 'function', 'the bridge can be told that a session ended');
  bridge.revoke('a');
  assert.deepEqual([...bridge.external.keys()], ['client-b'], 'the contexts of that session go, with the one that names none; another session keeps its own, and nothing is kept of them');
  gate.resolve();
  assert.deepEqual(await flying, [400, { error: CONTEXT_REVOKED }], 'the call in flight is not answered with what it read');
  assert.deepEqual(await call('client-a', 'get_transcript'), [400, { error: OPEN_FIRST }]);
  assert.deepEqual(await call('client-b', 'get_transcript'), [200, { sessionId: 'b', name: 'get_transcript' }]);
  // A context opened afterwards is one of the session loaded then.
  assert.deepEqual(await call('client-a', 'search_moments'), [200, { sessionId: 'b', name: 'search_moments' }]);
  // What a question was handed, and who may call at all, are as they were.
  bridge.revoke('b');
  assert.deepEqual(await post(capability), [200, { scoped: true }]);
  question.abort();
  assert.deepEqual([(await post(capability))[0], (await post({}))[0], (await post({ Authorization: `Bearer ${bridge.master}`, Origin: 'http://localhost' }))[0], await call('pas un client', 'search_moments')],
    [401, 401, 403, [400, { error: 'Client MCP invalide.' }]]);
  assert.equal(bridge.external.size, 0);
});

let still;
const jpeg = async () => (still ||= 'data:image/jpeg;base64,' + (await sharp({ create: { width: 64, height: 36, channels: 3, background: { r: 23, g: 57, b: 82 } } }).jpeg().toBuffer()).toString('base64'));

test('a closed session runtime re-examines nothing more: a late call is refused before its cache and its inspector, one in flight is told and leaves nothing behind, a reopened archive inspects again', async t => {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'tvlens-f05-runtime-')), sessionsRoot = path.join(root, 'sessions'), opened = [], gate = deferred();
  let clock = 0;
  const options = { userData: root, config: {}, selectedModels: {}, smoke: true, readClock: () => clock };
  t.after(async () => { gate.resolve(); for (const session of opened) await session.close(); await fsp.rm(root, { recursive: true, force: true }); });
  const live = createSessionRuntime({ sessionsRoot, ...options });
  opened.push(live);
  clock = 8000;
  assert.equal(await live.watch.ingest({ startMs: 0, endMs: 8000, clip: Buffer.from('clip 0'), frames: [{ atMs: 0, dataUrl: await jpeg() }], audio: null }), 'moment-1');
  do { await tick(); } while (live.watch.running);
  // The inspector of the simulated runtime, as the real one behaves: decoding first, then the stop it marks on the
  // signal it was given, then the inspection model. `deaf` ignores that signal and brings its result back anyway.
  const inner = live.inspector.inner, simulated = inner.inspect.bind(inner), seen = { reached: 0, model: 0 };
  let hold = null;
  inner.inspect = async input => {
    seen.reached++;
    if (hold) { await hold.promise; if (!/sourd/.test(input.question)) input.signal?.throwIfAborted(); }
    seen.model++;
    return simulated(input);
  };
  const ask = (session, question) => new VideoTools({ consultation: consultationOf(session.memory.view()), search: session.search, inspector: session.inspector, media: session.memoryMedia })
    .call('inspect_clip', { startMs: 0, endMs: 8000, question });
  // While the runtime lives: served, then served from its cache.
  assert.equal((await ask(live, 'Que voit-on ?')).observations.length, 1);
  await ask(live, 'Que voit-on ?');
  assert.deepEqual([live.inspector.hits, live.inspector.cache.size, seen], [1, 1, { reached: 1, model: 1 }]);
  // Two re-examinations are in flight when the runtime closes.
  hold = gate;
  const flying = [failure(ask(live, 'Et ensuite ?')), failure(ask(live, 'Et ensuite, sourd ?'))];
  await until(() => seen.reached === 3, 'two re-examinations are in flight');
  await live.close();
  assert.equal(live.inspector.cache.size, 0, 'what was cached goes with the runtime');
  // Late calls: one that was cached, one that was not.
  for (const question of ['Que voit-on ?', 'Autre chose ?']) assert.equal((await failure(ask(live, question))).message, REVOKED);
  assert.deepEqual([seen, live.inspector.hits], [{ reached: 3, model: 1 }, 1], 'neither the cache nor the inspector was reached');
  gate.resolve();
  assert.deepEqual((await Promise.all(flying)).map(error => error.message), [REVOKED, REVOKED]);
  assert.deepEqual([seen.model, live.inspector.cache.size, live.store.leases.size], [2, 0, 0], 'the one that marks the stop never reaches the model; what the other brings back is neither answered nor cached; both leases are given back');
  assert.equal((await failure(ask(live, 'Et ensuite, sourd ?'))).message, REVOKED, 'nothing was left in the cache for a later call');
  // The same session reopened is a runtime of its own, and inspects.
  const { session } = await openArchivedSession({ library: new SessionLibrary({ root: sessionsRoot }), id: live.id, ...options });
  opened.push(session);
  assert.deepEqual([session.readOnly, (await ask(session, 'Que voit-on ?')).observations.length, session.inspector.cache.size], [true, 1, 1]);
});

// ---- The real Mac main process behind the real preload, without Electron -------------------------------------------
// The harness of tests/mac-ipc-contract.test.cjs, reduced to what this file needs: simulated agents (no provider, no
// capture, no window), a user-data directory of its own and real timers.
const HOST_SETTINGS = ['TVLENS_QUESTION_TIMEOUT_MS', 'TVLENS_SURVEILLANCE_WORKERS', 'TVLENS_MEDIA_RETENTION_MS', 'TVLENS_DISK_MIN_FREE_MB', 'TVLENS_DISK_WARN_FREE_MB', 'TVLENS_VISION_DURING_ASK'];
function loadPreload(invoke) {
  const exposed = {}, listeners = new Map();
  const ipcRenderer = { invoke, on: (channel, callback) => { listeners.set(channel, [...(listeners.get(channel) || []), callback]); }, removeListener() {} };
  new Function('require', fs.readFileSync(path.join(__dirname, '..', 'app', 'preload.cjs'), 'utf8'))(() => ({ contextBridge: { exposeInMainWorld: (key, api) => { exposed[key] = api; } }, ipcRenderer }));
  return { ...exposed, deliver: (channel, value) => (listeners.get(channel) || []).forEach(callback => callback({}, value)) };
}
// `wrap` hands the test what the host composes ({ conversation, session }): to hold a closing step, or to reach a runtime.
async function launchMac(t, wrap = {}) {
  const userData = await fsp.mkdtemp(path.join(os.tmpdir(), 'tvlens-f05-mac-')), handlers = new Map(), failures = [];
  let preload, finished, loaded, stopped;
  const quitting = new Promise(resolve => { finished = resolve; }), ready = new Promise(resolve => { loaded = resolve; });
  const webContents = { mainFrame: {}, setWindowOpenHandler() {}, on() {}, send: (channel, value) => preload.deliver(channel, value === undefined ? undefined : structuredClone(value)) };
  class BrowserWindow {
    constructor() { this.webContents = webContents; }
    isDestroyed() { return false; } getBounds() { return { x: 0, y: 0, width: 1340, height: 920 }; } getContentBounds() { return { x: 0, y: 0, width: 1340, height: 892 }; }
    loadFile() { loaded(true); return Promise.resolve(); } show() {} focus() {} setMinimumSize() {} setAlwaysOnTop() {} setBounds() {}
  }
  const app = Object.assign(new EventEmitter(), { isPackaged: false, setName() {}, setPath() {}, getPath: () => userData, requestSingleInstanceLock: () => true, whenReady: () => Promise.resolve(),
    commandLine: { getSwitchValue: () => '', appendSwitch() {} },
    // As Electron does: quitting asks first, and a handler may hold it back until its own work is done.
    quit() { const event = { prevented: false, preventDefault() { this.prevented = true; } }; app.emit('before-quit', event); if (!event.prevented) { finished(); loaded(false); } } });
  const electron = { app, BrowserWindow, ipcMain: { handle: (channel, handler) => handlers.set(channel, handler) },
    protocol: { registerSchemesAsPrivileged() {}, handle() {} },
    globalShortcut: { register: () => true, unregister() {}, unregisterAll() {} }, desktopCapturer: { getSources: async () => [] },
    session: { defaultSession: { setDisplayMediaRequestHandler() {} } }, systemPreferences: { getMediaAccessStatus: () => 'granted' },
    shell: { openExternal: async () => {} }, dialog: { showErrorBox() {}, showOpenDialog: async () => ({ canceled: true }) },
    safeStorage: { isEncryptionAvailable: () => false }, screen: { getDisplayMatching: () => ({ workArea: { x: 0, y: 0, width: 1920, height: 1080 } }) } };
  const sender = { sender: webContents, senderFrame: webContents.mainFrame };
  preload = loadPreload(async (channel, ...args) => {
    try { const result = await handlers.get(channel)(sender, ...structuredClone(args)); return result === undefined ? undefined : structuredClone(result); }
    catch (error) { throw new Error(`Error invoking remote method '${channel}': ${error}`); }
  });
  const argv = [...process.argv], saved = Object.fromEntries(HOST_SETTINGS.map(name => [name, process.env[name]])), consoleError = console.error, load = Module._load;
  const restore = () => { process.argv.splice(0, process.argv.length, ...argv); for (const name of HOST_SETTINGS) if (saved[name] === undefined) delete process.env[name]; else process.env[name] = saved[name]; console.error = consoleError; };
  for (const name of HOST_SETTINGS) delete process.env[name];
  process.argv.push('--smoke-test');
  console.error = error => failures.push(String(error?.message || error));
  Module._load = function (request, parent, ...rest) {
    if (request === 'electron') return electron;
    const module = load.call(this, request, parent, ...rest);
    if (!parent?.filename?.endsWith(path.join('app', 'main.cjs'))) return module;
    // A test run sweeps no temporary directory of the machine.
    if (request === '../adapters/codex-confinement.cjs') return { ...module, sweepStaleContexts: async () => [] };
    if (request === '../runtime/conversation-runtime.cjs' && wrap.conversation) return { ...module, createConversationRuntime: options => wrap.conversation(module.createConversationRuntime(options)) };
    if (request === '../runtime/session-runtime.cjs' && wrap.session) return { ...module, createSessionRuntime: options => wrap.session(module.createSessionRuntime(options)) };
    return module;
  };
  try { delete require.cache[require.resolve('../app/main.cjs')]; require('../app/main.cjs'); }
  catch (error) { restore(); throw error; }
  finally { Module._load = load; }
  const host = { ...preload.tvlens, userData, failures, started: await ready, quit: () => (stopped ||= (async () => { app.quit(); await quitting; restore(); })()) };
  if (!host.started) restore();
  // Always quit before its directory is removed: a failed assertion must not leave a host writing into a deleted folder.
  t.after(async () => { await host.quit().catch(() => {}); await fsp.rm(userData, { recursive: true, force: true }); });
  return host;
}
// One passage of a simulated capture, from the end of the previous one up to the session clock, then its analysis.
async function captured(host, sessionId) {
  await pause(20);
  const state = await host.state(), startMs = state.segments.at(-1)?.endMs ?? 0, endMs = Math.floor(state.elapsedMs);
  assert.ok(endMs > startMs, 'the session clock moved');
  await host.ingest({ sessionId, startMs, endMs, clip: new Uint8Array(Buffer.from(`clip ${startMs}`)), audio: null, frames: [{ atMs: startMs, dataUrl: await jpeg() }] });
  await until(async () => (await host.state()).segments.every(passage => passage.status === 'ready'), 'the passage is analysed');
  return { startMs, endMs };
}

test('the Mac host revokes the external MCP contexts of a session as its end begins: a call in flight and late calls are refused, none is opened on it while it closes, the next session and the archive reopened get their own', async t => {
  const runtimes = [], agentClose = deferred(), held = deferred(), seen = { ending: 0, reached: 0, model: 0 };
  const host = await launchMac(t, {
    // The end of a session is held half-way, at the closing of its chat agent: its archive is still to come.
    conversation: built => { built.agent.close = async () => { seen.ending++; await agentClose.promise; }; return built; },
    session: runtime => { runtimes.push(runtime); return runtime; } });
  try {
    assert.equal(host.started, true, host.failures.join(' '));
    // What mcp/server.cjs does for an external client: the descriptor of the host, its token, a client identifier.
    const descriptor = JSON.parse(await fsp.readFile(path.join(host.userData, 'mcp-bridge.json'), 'utf8'));
    const mcp = async (name, args) => { const response = await fetch(descriptor.url, { method: 'POST', headers: { Authorization: `Bearer ${descriptor.token}`, 'X-TVLens-Client': 'client-1' }, body: JSON.stringify({ name, args }) }); return [response.status, await response.json()]; };
    const a = await host.start(), a1 = await captured(host, a.id);
    await host.stop();
    const [opening, found] = await mcp('search_moments', { query: 'cercle' });
    assert.deepEqual([opening, found.sessionId], [200, a.id], 'an external context is opened on the session loaded');
    // A re-examination asked through that context is in flight: decoding, then the stop marked on its signal, then the model.
    const [first] = runtimes, inner = first.inspector.inner, simulated = inner.inspect.bind(inner);
    inner.inspect = async input => { seen.reached++; await held.promise; input.signal?.throwIfAborted(); seen.model++; return simulated(input); };
    const flying = mcp('inspect_clip', { ...a1, question: 'Que voit-on ?' });
    flying.catch(() => {});
    await until(() => seen.reached === 1, 'the re-examination is in flight');
    const ending = host.newSession();
    await until(() => seen.ending === 1, 'the end of the session is under way');
    // While the session closes: its context is gone, and none can be opened on it.
    assert.deepEqual(await mcp('get_transcript', a1), [400, { error: OPEN_FIRST }], 'revoked as the end begins, before anything is awaited');
    assert.deepEqual(await mcp('search_moments', { query: 'cercle' }), [400, { error: 'Changement de session en cours. Réessaie dans un instant.' }]);
    held.resolve();
    assert.deepEqual(await flying, [400, { error: CONTEXT_REVOKED }]);
    assert.equal(seen.model, 0, 'the call in flight never reached the inspection model');
    agentClose.resolve();
    assert.equal(await ending, true);
    // Once it has ended: nothing is loaded, and whoever kept the inspector of that runtime is refused by the runtime itself.
    assert.deepEqual([first.watch.closed, await mcp('get_transcript', a1), await mcp('search_moments', { query: 'cercle' })], [true, [400, { error: OPEN_FIRST }], [400, { error: 'Démarre une session.' }]]);
    const late = { question: 'Et maintenant ?', startMs: a1.startMs, endMs: a1.endMs, segments: [{ id: 'moment-1', ...a1 }] };
    assert.equal((await failure(first.inspector.inspect(late))).message, REVOKED);
    assert.deepEqual([seen.reached, seen.model], [1, 0], 'no late call reached the inspector, nor what stands for the model behind it');
    // The next session gets a context of its own.
    const b = await host.start(), b1 = await captured(host, b.id);
    const [again, fresh] = await mcp('search_moments', { query: 'cercle' });
    assert.deepEqual([again, fresh.sessionId], [200, b.id]);
    const [inspected, shown] = await mcp('inspect_clip', { ...b1, question: 'Que voit-on ?' });
    assert.deepEqual([inspected, shown.observations.length], [200, 1]);
    // Reopening the first one ends that session in turn, and the archive is a runtime of its own: the one that closed stays closed.
    await host.stop();
    assert.equal((await host.openSession(a.id)).readOnly, true);
    assert.deepEqual(await mcp('get_transcript', b1), [400, { error: OPEN_FIRST }]);
    const [reopened, archive] = await mcp('search_moments', { query: 'cercle' });
    assert.deepEqual([reopened, archive.sessionId, runtimes.length], [200, a.id, 3]);
    const [replayed, old] = await mcp('inspect_clip', { ...a1, question: 'Que voit-on ?' });
    assert.deepEqual([replayed, old.observations.length], [200, 1]);
    assert.equal((await failure(first.inspector.inspect(late))).message, REVOKED);
    assert.deepEqual([seen.reached, seen.model, host.failures], [1, 0, []], 'and nothing failed to close');
  } finally { held.resolve(); agentClose.resolve(); }
});
