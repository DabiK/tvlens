const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { HeadlessRuntime } = require('../runtime/headless-runtime.cjs');

async function host(t, options = {}) {
  t.mock.timers.enable({ apis: ['setInterval'] });
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tvlens-host-errors-'));
  const runtime = new HeadlessRuntime({
    userData: root,
    sessionsRoot: path.join(root, 'sessions'),
    smoke: true,
    config: {},
    selectedModels: {},
    wallClock: () => 0,
    readClock: () => 0,
    ...options,
  });
  t.after(async () => {
    await runtime.close();
    await fs.rm(root, { recursive: true, force: true });
  });
  return runtime;
}

test('a failed surveillance tick still refreshes quota and blocked storage; the next host tick tries surveillance again', async t => {
  let freeBytes = 0, checks = 0, attempts = 0;
  const guard = {
    snapshot: () => ({ state: 'blocked', freeBytes }),
    check: () => { checks++; },
  };
  const runtime = await host(t, { guard });
  t.mock.method(runtime.surveillance, 'tick', () => {
    attempts++;
    if (attempts === 1) throw Object.assign(new Error('tick refusé'), { code: 'TICK_FAILED' });
  });
  const full = runtime.etag(), panel = runtime.etag('panel');
  t.mock.method(runtime.quota, 'snapshot', () => ({ windows: [{ remainingPercent: 42 }] }));
  freeBytes = 1024;
  const before = checks;
  assert.doesNotThrow(() => runtime.tick());
  assert.equal(checks, before + 1);
  assert.notEqual(runtime.etag(), full);
  assert.notEqual(runtime.etag('panel'), panel);
  assert.equal(runtime.snapshot().quota.windows[0].remainingPercent, 42);
  assert.equal(runtime.snapshot().storage.freeBytes, 1024);
  runtime.tick();
  assert.deepEqual([attempts, checks], [2, before + 2]);
});

test('a failed end journal preserves closing errors and releases the session so another one can start', async t => {
  let logs = 0;
  const runtime = await host(t, {
    agent: { close: async () => { throw Object.assign(new Error('fermeture refusée'), { code: 'EBUSY' }); } },
    log: () => { logs++; throw Object.assign(new Error('journal fermé'), { code: 'EIO' }); },
  });
  const first = await runtime.start();
  const ended = await runtime.end();
  assert.deepEqual(ended, { id: first.id, archived: false, errors: ['agent de chat : fermeture refusée'] });
  assert.deepEqual(runtime.lastEnd, ended);
  assert.equal(logs, 1);
  assert.equal(runtime.snapshot().session, null);
  const next = await runtime.start();
  assert.notEqual(next.id, first.id);
  assert.equal(runtime.snapshot().session.id, next.id);
});

test('a failed shutdown journal leaves the shutdown failure accessible in the last end result', async t => {
  let logs = 0;
  const runtime = await host(t, {
    log: () => { logs++; throw Object.assign(new Error('journal fermé'), { code: 'EIO' }); },
  });
  t.mock.method(runtime.surveillance, 'close', async () => {
    throw Object.assign(new Error('arrêt refusé'), { code: 'EBUSY' });
  });
  await runtime.close();
  assert.deepEqual(runtime.lastEnd, { id: null, archived: false, errors: ['surveillance : arrêt refusé'] });
  assert.equal(runtime.snapshot().session, null);
  assert.equal(logs, 1);
});
