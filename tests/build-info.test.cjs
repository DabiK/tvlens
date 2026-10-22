const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const identity = {
  name: 'tvlens', version: '0.1.0', commit: 'a'.repeat(40),
  commitDate: '2026-10-23T10:00:00+02:00', dirty: false,
};

async function directory(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tvlens-build-test-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  return root;
}

test('build identity comes from package metadata and the commit, not the build clock', async t => {
  const { describeBuild } = await import('../scripts/build-info.mjs');
  const root = await directory(t);
  await fs.writeFile(path.join(root, 'package.json'), JSON.stringify({ name: identity.name, version: identity.version }));
  const replies = { 'rev-parse': identity.commit, log: identity.commitDate, status: '' };
  const git = args => ({ code: 0, out: replies[args[0]] });
  assert.deepEqual(await describeBuild({ root, git }), identity);
});

test('untracked changes mark the build dirty and a Git failure refuses identification', async t => {
  const { describeBuild } = await import('../scripts/build-info.mjs');
  const root = await directory(t);
  await fs.writeFile(path.join(root, 'package.json'), JSON.stringify(identity));
  const replies = { 'rev-parse': identity.commit, log: identity.commitDate, status: '?? new.cjs' };
  const actual = await describeBuild({ root, git: args => ({ code: 0, out: replies[args[0]] }) });
  assert.equal(actual.dirty, true);
  await assert.rejects(describeBuild({ root, git: () => ({ code: 1, out: '' }) }), { code: 'TVLENS_BUILD_GIT_FAILED' });
});

test('missing construction is unknown, while corrupt metadata and disk errors are not hidden', async t => {
  const { readBuildInfo } = require('../adapters/build-info.cjs');
  const root = await directory(t), file = path.join(root, 'build-info.json');
  assert.equal(await readBuildInfo(root), null);
  for (const value of ['{', JSON.stringify({ ...identity, commit: 'short' }), JSON.stringify({ ...identity, dirty: 'false' })]) {
    await fs.writeFile(file, value);
    await assert.rejects(readBuildInfo(root), error => error.code === 'TVLENS_BUILD_INVALID' && error.message.includes(file));
  }
  await fs.rm(file); await fs.mkdir(file);
  await assert.rejects(readBuildInfo(root), { code: 'EISDIR' });
});

test('writing and reading construction exposes only the immutable public schema', async t => {
  const { writeBuildInfo } = await import('../scripts/build-info.mjs');
  const { readBuildInfo, parseBuildInfo } = require('../adapters/build-info.cjs');
  const root = await directory(t);
  await writeBuildInfo(root, { ...identity, token: 'must-not-be-written', privatePath: '/private' });
  const actual = await readBuildInfo(root);
  assert.deepEqual(actual, identity);
  assert.ok(Object.isFrozen(actual));
  assert.deepEqual(JSON.parse(await fs.readFile(path.join(root, 'build-info.json'), 'utf8')), identity);
  for (const value of [null, { ...identity, commitDate: 'invalid' }, { ...identity, version: ' ' }]) {
    assert.throws(() => parseBuildInfo(value), { code: 'TVLENS_BUILD_INVALID' });
  }
});

test('the build CLI writes stable metadata outside a clean repository without changing it', async t => {
  const { execFileSync, spawnSync } = require('node:child_process');
  const root = await directory(t), output = await directory(t);
  const git = (...args) => execFileSync('git', ['-c', 'core.hooksPath=/dev/null', '-c', 'commit.gpgsign=false',
    '-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', ...args], { cwd: root, encoding: 'utf8' }).trim();
  await fs.writeFile(path.join(root, 'package.json'), JSON.stringify({ name: identity.name, version: identity.version }));
  git('init', '-q'); git('add', '.'); git('commit', '-qm', 'fixture');
  const cli = path.resolve(__dirname, '../scripts/build-info.mjs');
  for (const name of ['first', 'second']) execFileSync(process.execPath, [cli, '--out', path.join(output, name)], { cwd: root });
  const first = await fs.readFile(path.join(output, 'first/build-info.json'), 'utf8');
  assert.equal(first, await fs.readFile(path.join(output, 'second/build-info.json'), 'utf8'));
  assert.equal(JSON.parse(first).commit, git('rev-parse', 'HEAD'));
  assert.equal(JSON.parse(first).dirty, false);
  assert.equal(git('status', '--porcelain'), '');
  assert.equal(spawnSync(process.execPath, [cli], { cwd: root }).status, 2);
});
