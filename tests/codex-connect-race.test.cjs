const { test } = require('node:test');
const assert = require('node:assert/strict');
const { tick } = require('./helpers/wait.cjs');
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
