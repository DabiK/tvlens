const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { ASSETS, SOURCE_ROOTS } = require('../scripts/package-filter.cjs');
const build = { name: 'tvlens', version: '0.1.0', commit: 'a'.repeat(40), commitDate: '2026-10-23T00:00:00Z', dirty: false };

async function fixture(t, mutate = async () => {}) {
  const { createPackage } = await import('@electron/asar');
  const folder = await fs.mkdtemp(path.join(os.tmpdir(), 'tvlens-asar-test-'));
  t.after(() => fs.rm(folder, { recursive: true, force: true }));
  const root = path.join(folder, 'source'), copy = path.join(folder, 'copy');
  const write = async (base, file, value) => {
    await fs.mkdir(path.dirname(path.join(base, file)), { recursive: true });
    await fs.writeFile(path.join(base, file), value);
  };
  for (const dir of SOURCE_ROOTS) await fs.mkdir(path.join(root, dir), { recursive: true });
  for (const dir of SOURCE_ROOTS) await write(root, `${dir}/fixture.cjs`, 'fixture');
  for (const file of [...ASSETS, 'app/main.cjs']) await write(root, file, 'fixture');
  await write(root, 'package.json', JSON.stringify({ name: 'tvlens', version: '0.1.0', main: 'app/main.cjs' }));
  await write(root, 'package-lock.json', JSON.stringify({ packages: { 'node_modules/electron': { dev: true } } }));
  await fs.cp(root, copy, { recursive: true });
  await fs.rm(path.join(copy, 'package-lock.json'));
  await write(copy, 'build-info.json', JSON.stringify(build));
  await mutate({ root, copy, write });
  const archive = path.join(folder, 'app.asar');
  await createPackage(copy, archive);
  return { archive, root };
}

test('the archive verifier reads construction and verifies every shipped source byte', async t => {
  const { inspectArchive } = await import('../scripts/verify-package.mjs');
  const { archive, root } = await fixture(t);
  const report = await inspectArchive(archive, { root, expectedBuild: build });
  assert.deepEqual(report.build, build);
  assert.ok(report.files.includes('app/main.cjs'));
});

test('the archive verifier refuses leaked files, dev dependencies, missing assets, drift and stale identity', async t => {
  const { inspectArchive } = await import('../scripts/verify-package.mjs');
  const cases = [
    ({ copy, write }) => write(copy, 'docs/private.txt', 'private'),
    ({ copy, write }) => write(copy, 'node_modules/electron/package.json', '{}'),
    ({ copy }) => fs.rm(path.join(copy, ASSETS[0])),
    ({ copy, write }) => write(copy, 'app/main.cjs', 'changed'),
    ({ copy, write }) => write(copy, 'build-info.json', JSON.stringify({ ...build, commit: 'b'.repeat(40) })),
    ({ copy, write }) => write(copy, 'node_modules/unknown/package.json', '{}'),
  ];
  for (const mutate of cases) {
    const { archive, root } = await fixture(t, mutate);
    await assert.rejects(inspectArchive(archive, { root, expectedBuild: build }), { code: 'TVLENS_PACKAGE_INVALID' });
  }
});

test('the archive verifier refuses stray files next to unpacked native modules', async t => {
  const { inspectArchive } = await import('../scripts/verify-package.mjs');
  const { archive, root } = await fixture(t);
  await fs.mkdir(archive + '.unpacked');
  await fs.writeFile(path.join(archive + '.unpacked', 'private.txt'), 'private');
  await assert.rejects(inspectArchive(archive, { root, expectedBuild: build }), { code: 'TVLENS_PACKAGE_INVALID' });
});

test('signature verification refuses a broken bundle before it can be installed', async () => {
  const { verifySignature } = await import('../scripts/verify-package.mjs');
  assert.throws(() => verifySignature('/tmp/TVLens.app', () => ({ status: 1, stderr: 'invalid resources' })),
    { code: 'TVLENS_PACKAGE_SIGNATURE_INVALID' });
  assert.deepEqual(verifySignature('/tmp/TVLens.app', () => ({ status: 0 })), { valid: true });
});
