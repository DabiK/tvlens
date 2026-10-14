'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const CLIENT = require.resolve('../adapters/codex-session-client.cjs');
const EXIT_BOUND_MS = 10000;

// A host of its own: a Codex client on a transport double that answers the turn request, then leaves the
// turn in flight, with no cancel, no close and no process.exit.
const HOST = `
  const { CodexSessionClient } = require(${JSON.stringify(CLIENT)});
  const rpcFactory = () => ({
    start() {}, send() {}, close() {},
    async request(method) {
      if (method === 'thread/start') return { thread: { id: 'thread-1' } };
      if (method === 'turn/start') {
        process.stdout.write('turn-started\\n');
        return { turn: { id: 'turn-1' } };
      }
      return {};
    },
  });
  const authHome = require('node:path').join(process.env.TMPDIR, 'absent-codex-home');
  const client = new CodexSessionClient({ authHome, rpcFactory });
  client.run({ jobId: 'job-1', sessionId: 'session-1', instructions: 'question', signal: new AbortController().signal })
    .catch(() => {});
`;

test('a host that leaves a turn in flight on a transport double still exits by itself', { skip: process.platform === 'win32' }, async t => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'tvlens-test-abandoned-'));
  const child = spawn(process.execPath, ['-e', HOST], { env: { PATH: process.env.PATH, TMPDIR: tmp }, stdio: ['ignore', 'pipe', 'pipe'] });
  t.after(async () => {
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    await fs.rm(tmp, { recursive: true, force: true });
  });
  let stdout = '';
  child.stdout.on('data', chunk => { stdout += chunk; });
  child.stderr.resume();

  const ended = await new Promise(resolve => {
    const bound = setTimeout(() => resolve({ code: null, signal: null, alive: true }), EXIT_BOUND_MS);
    // 'close' fires once the stdio pipes are drained; 'exit' can fire before the output is read.
    child.once('close', (code, signal) => {
      clearTimeout(bound);
      resolve({ code, signal, alive: false });
    });
  });

  assert.match(stdout, /turn-started/, 'the host asked for the turn');
  assert.equal(ended.alive, false, 'the host was still alive at the bound after leaving its turn');
  assert.equal(ended.signal, null);
  assert.equal(ended.code, 0);
});
