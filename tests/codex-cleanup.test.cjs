const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { cleanupCodexContexts } = require('../runtime/codex-cleanup.cjs');
const { sweepStaleContexts } = require('../adapters/codex-confinement.cjs');
const { deferred } = require('./helpers/wait.cjs');

async function cleanupFixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tvlens-test-startup-cleanup-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const names = ['tvlens-verify-refused', 'tvlens-verify-removed'];
  const now = 1800000000000;
  const old = new Date(now - 25 * 3600000);
  for (const name of names) {
    const dir = path.join(root, name);
    await fs.mkdir(dir);
    await fs.writeFile(path.join(dir, 'owner'), '12345');
    await fs.utimes(dir, old, old);
  }
  const fileSystem = { ...fs, readdir: async () => names, rm: async (dir, options) => {
    if (dir === path.join(root, names[0])) throw Object.assign(Error('private content'), { code: 'EACCES' });
    return fs.rm(dir, options);
  } };
  const roots = [];
  const sweep = (injectedRoot, age, clock, options) => {
    roots.push(injectedRoot);
    return sweepStaleContexts(injectedRoot, age, now, {
      ...options, fileSystem, probe: () => { throw Object.assign(Error('dead'), { code: 'ESRCH' }); },
    });
  };
  return { root, names, sweep, roots };
}

test('the shared startup cleanup journals refusals and successful removals through the injected sweeper', async t => {
  const f = await cleanupFixture(t);
  const entries = [];
  const result = await cleanupCodexContexts({ sweep: f.sweep, root: f.root, log: line => entries.push(JSON.parse(line)) });
  assert.deepEqual(f.roots, [f.root]);
  assert.deepEqual(result, [f.names[1]]);
  assert.deepEqual(entries, [{
    code: 'TVLENS_CODEX_CLEANUP_REFUSED', candidate: path.join(f.root, f.names[0]), operation: 'rm', systemCode: 'EACCES',
  }, {
    code: 'TVLENS_CODEX_CLEANUP_REMOVED', candidate: path.join(f.root, f.names[1]),
  }]);
  await fs.access(path.join(f.root, f.names[0]));
  await assert.rejects(fs.access(path.join(f.root, f.names[1])), { code: 'ENOENT' });
  assert.ok(!JSON.stringify(entries).includes('private content'));
});

test('a throwing or rejecting startup journal cannot interrupt cleanup or change its usable result', async t => {
  for (const log of [() => { throw Error('journal unavailable'); }, async () => { throw Error('journal unavailable'); }]) {
    await t.test(log.constructor.name, async t => {
      const f = await cleanupFixture(t);
      assert.deepEqual(await cleanupCodexContexts({ sweep: f.sweep, root: f.root, log }), [f.names[1]]);
      assert.deepEqual(f.roots, [f.root]);
      await fs.access(path.join(f.root, f.names[0]));
      await assert.rejects(fs.access(path.join(f.root, f.names[1])), { code: 'ENOENT' });
    });
  }
});

test('startup cleanup awaits its injected sweep and absorbs a failed sweep even with a failed journal', async () => {
  const started = deferred(), answer = deferred();
  let settled = false;
  const pending = cleanupCodexContexts({
    root: '/isolated-test-root',
    sweep: () => { started.resolve(); return answer.promise; },
    log: () => { throw Error('journal unavailable'); },
  }).then(result => { settled = true; return result; });
  // Read the signal without waiting forever if the injected sweep was ignored.
  let called = false;
  started.promise.then(() => { called = true; });
  await Promise.resolve();
  assert.equal(called, true);
  assert.equal(settled, false);
  answer.reject(Object.assign(Error('private failure details'), { code: 'EIO' }));
  assert.deepEqual(await pending, []);
});
