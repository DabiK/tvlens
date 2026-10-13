const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { CodexRpc } = require('../adapters/codex-rpc.cjs');

test('an accented character split across two pipe chunks reaches the client intact', async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'tvlens-rpc-decoding-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  // Stands for the App Server: one notification whose "é" (2 bytes) is cut between two writes.
  const binary = path.join(dir, 'server.cjs');
  await fs.writeFile(binary, `#!/usr/bin/env node
const line = Buffer.from(JSON.stringify({ method: 'note', params: { text: 'Débat sur la santé' } }) + '\\n');
const cut = line.indexOf(0xc3) + 1;
process.stdout.write(line.subarray(0, cut));
setTimeout(() => { process.stdout.write(line.subarray(cut)); setTimeout(() => process.exit(0), 20); }, 40);
`, { mode: 0o755 });
  const received = [];
  let closed;
  const done = new Promise(resolve => { closed = resolve; });
  const rpc = new CodexRpc({ binary, args: [], cwd: dir, env: process.env, onEvent: (method, params) => { if (method === 'connection/closed') closed(); else received.push(params.text); } });
  rpc.start();
  await done;
  assert.deepEqual(received, ['Débat sur la santé']);
});
