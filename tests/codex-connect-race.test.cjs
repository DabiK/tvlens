const { test } = require('node:test');
const assert = require('node:assert/strict');
const { tick, deferred } = require('./helpers/wait.cjs');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { CodexSessionClient } = require('../adapters/codex-session-client.cjs');

const authHome = path.join(os.tmpdir(), 'tvlens-test-absent-codex-home');
// Other test files create session directories in the same temp root: follow only the ones made here.
function created(t) {
  const dirs = [], original = fs.mkdtemp;
  t.mock.method(fs, 'mkdtemp', async (...args) => { const dir = await original(...args); dirs.push(dir); return dir; });
  return async () => (await Promise.all(dirs.map(dir => fs.access(dir).then(() => dir, () => null)))).filter(Boolean);
}

// Fake App Server process: `gate` holds the named request until released.
function fixture(gate = {}) {
  const processes = [];
  const rpcFactory = options => {
    const process = { options, started: false, closed: false, requests: [] };
    processes.push(process);
    return { start() { process.started = true; }, send() {}, close() { process.closed = true; },
      async request(method) {
        process.requests.push(method);
        if (gate[method]) await gate[method];
        if (process.closed) throw Error('Connexion Codex interrompue.');
        return method === 'thread/start' ? { thread: { id: 'thread-' + processes.length + '-' + process.requests.length } } : {};
      } };
  };
  return { client: new CodexSessionClient({ authHome, rpcFactory }), processes };
}
const live = processes => processes.filter(p => p.started && !p.closed);

test('a close landing while the connection is being prepared leaves no process and no directory behind', async t => {
  const remaining = created(t);
  const f = fixture();
  const ready = f.client.prepare('s');
  await f.client.close(); // lands during the first filesystem await of connect()
  await assert.rejects(ready, /Connexion obsolète/);
  for (let i = 0; i < 5; i++) await tick();
  assert.equal(live(f.processes).length, 0, 'no App Server may outlive the close');
  assert.equal(f.client.rpc, null);
  assert.equal(f.client.ready, null);
  assert.deepEqual(await remaining(), []);
});

test('a close during the handshake closes that process, and the superseded connection cannot close its successor', async t => {
  const remaining = created(t);
  let release;
  const gate = { initialize: new Promise(resolve => { release = resolve; }) };
  const f = fixture(gate);
  const first = f.client.prepare('s');
  while (!f.processes[0]?.requests.includes('initialize')) await tick();
  await f.client.close();
  assert.equal(f.processes[0].closed, true);
  gate.initialize = null;
  const second = f.client.prepare('s'); // a new connection starts while the first still unwinds
  release();
  await assert.rejects(first);
  assert.ok(await second, 'the newer connection survives the failure of the older one');
  assert.equal(live(f.processes).length, 1);
  assert.equal(await f.client.ready, await second);
  assert.equal(f.client.threadId, await second);
  await f.client.close();
  assert.equal(live(f.processes).length, 0);
  assert.deepEqual(await remaining(), []);
});

async function cleanupClient(t, options = {}) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tvlens-test-close-cleanup-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const mkdtemp = fs.mkdtemp;
  t.mock.method(fs, 'mkdtemp', prefix => mkdtemp(path.join(root, path.basename(prefix))));
  let response = Promise.resolve(true);
  const client = new CodexSessionClient({
    authHome: path.join(root, 'absent-auth'),
    rpcFactory: () => ({
      start() {}, send() {}, close: () => response,
      request: async method => method === 'thread/start' ? { thread: { id: 'thread' } } : {},
    }),
    ...options,
  });
  t.after(() => client.close());
  await client.prepare('s');
  const [name] = await fs.readdir(root);
  return { client, dir: path.join(root, name), answer: value => { response = value; } };
}

test('shared closings keep an unconfirmed tree and diagnose a refused removal only after confirmation', async t => {
  const diagnostics = [];
  const f = await cleanupClient(t, { onCleanupDiagnostic: finding => {
    diagnostics.push(finding);
    throw Error('journal unavailable');
  } });
  const confirmation = deferred();
  f.answer(confirmation.promise);
  const failure = Object.assign(Error('private filesystem details'), { code: 'EACCES' });
  const removal = deferred(), removing = deferred();
  const rm = fs.rm;
  let removals = 0;
  t.mock.method(fs, 'rm', async (dir, options) => {
    if (dir !== f.dir) return rm(dir, options);
    removals++;
    removing.resolve();
    await removal.promise;
    throw failure;
  });
  const first = f.client.close(), second = f.client.close();
  await tick();
  assert.equal(removals, 0, 'the transport has not confirmed its group gone');
  confirmation.resolve(false);
  await Promise.all([first, second]);
  await fs.access(f.dir);
  assert.equal(removals, 0);
  f.answer(Promise.resolve(false));
  await assert.rejects(f.client.prepare('s'), /Arrêt du processus Codex précédent non confirmé/);
  assert.equal(removals, 0, 'a false answer still prevents removal and reconnection');
  assert.deepEqual(diagnostics, []);

  const gone = deferred();
  f.answer(gone.promise);
  const outcomes = [f.client.close(), f.client.close()].map(pending => pending.catch(error => error));
  await tick();
  assert.equal(removals, 0);
  gone.resolve(true);
  await removing.promise;
  outcomes.push(f.client.prepare('s').catch(error => error));
  removal.resolve();
  for (const error of await Promise.all(outcomes)) assert.equal(error, failure);
  assert.equal(removals, 1, 'overlapping calls share the same refused removal');
  assert.deepEqual(diagnostics, [{
    code: 'TVLENS_CODEX_CLEANUP_REFUSED', candidate: f.dir, operation: 'rm', systemCode: 'EACCES',
  }]);
  await fs.access(f.dir);
});

test('a refused client cleanup reaches the default journal even when the caller absorbs the close rejection', async t => {
  const f = await cleanupClient(t);
  const lines = [];
  t.mock.method(process.stderr, 'write', line => { lines.push(String(line)); return true; });
  const rm = fs.rm;
  t.mock.method(fs, 'rm', async (dir, options) => {
    if (dir === f.dir) throw Object.assign(Error('private credential details'), { code: 'EPERM' });
    return rm(dir, options);
  });
  await f.client.close().catch(() => {});
  assert.ok(lines.some(line => line.includes('TVLENS_CODEX_CLEANUP_REFUSED') && line.includes(f.dir)));
  assert.ok(lines.every(line => !line.includes('private credential details')));
  await fs.access(f.dir);
});
