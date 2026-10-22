const { test } = require('node:test');
const assert = require('node:assert/strict');

const policy = () => ({ baseline: { lignes_longues_prod: 2, cas_de_test_produit: 10 },
  suppressions: { 'app/main.cjs': { complexity: { count: 1 } } } });

test('CI refuses a relaxed or removed baseline and increased or new lint suppressions', async () => {
  const { compareQualityPolicy } = await import('../scripts/ci-policy.mjs');
  for (const mutate of [
    p => { p.baseline.lignes_longues_prod = 3; },
    p => { p.baseline.cas_de_test_produit = 9; },
    p => { delete p.baseline.lignes_longues_prod; },
    p => { p.suppressions['app/main.cjs'].complexity.count = 2; },
    p => { p.suppressions['new.cjs'] = { complexity: { count: 1 } }; },
    p => { p.baseline.unknown = 1; },
    p => { p.suppressions['app/main.cjs'].complexity.count = 'invalid'; },
  ]) {
    const current = policy(); mutate(current);
    assert.ok(compareQualityPolicy(policy(), current).length, JSON.stringify(current));
  }
});

test('CI accepts an unchanged or tightened quality policy', async () => {
  const { compareQualityPolicy } = await import('../scripts/ci-policy.mjs');
  assert.deepEqual(compareQualityPolicy(policy(), policy()), []);
  const current = policy();
  current.baseline.lignes_longues_prod = 1;
  current.baseline.cas_de_test_produit = 11;
  current.suppressions = {};
  assert.deepEqual(compareQualityPolicy(policy(), current), []);
});

function fullReport() {
  return { ok: true, steps: ['règles par fichier', 'format', 'lint', 'gel du lint', 'cliquet',
    'tests JS (156 fichier(s))', 'tests Python'].map(name => ({ name, status: 'ok' })) };
}

test('a green partial or skipped check is not a complete CI check', async () => {
  const { validateFullCheck } = await import('../scripts/ci-policy.mjs');
  assert.deepEqual(validateFullCheck(fullReport()), []);
  for (const mutate of [
    r => { r.steps[1].status = 'skip'; },
    r => { r.steps.pop(); },
    r => { r.steps[5].name = 'tests JS'; },
    r => { r.steps[5].name = 'tests JS (0 fichier(s))'; },
    r => { r.ok = false; },
  ]) {
    const report = fullReport(); mutate(report);
    assert.ok(validateFullCheck(report).length);
  }
});

test('CI compares a committed relaxation with its base even when the checkout is clean', async t => {
  const fs = require('node:fs/promises');
  const os = require('node:os');
  const path = require('node:path');
  const { execFileSync } = require('node:child_process');
  const { checkBasePolicy } = await import('../scripts/ci-check.mjs');
  const { checkBaseFiles } = await import('../scripts/ci-changes.mjs');
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tvlens-ci-policy-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const git = (...args) => execFileSync('git', ['-c', 'core.hooksPath=/dev/null', '-c', 'commit.gpgsign=false',
    '-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', ...args], { cwd: root, encoding: 'utf8' }).trim();
  const write = async value => {
    await fs.mkdir(path.join(root, 'scripts/quality'), { recursive: true });
    await fs.writeFile(path.join(root, 'scripts/quality/baseline.json'), JSON.stringify(value.baseline));
    await fs.writeFile(path.join(root, 'eslint-suppressions.json'), JSON.stringify(value.suppressions));
  };
  git('init', '-q'); await write(policy()); git('add', '.'); git('commit', '-qm', 'baseline');
  const base = git('rev-parse', 'HEAD');
  assert.deepEqual(await checkBasePolicy(root, base), []);
  assert.deepEqual(await checkBaseFiles(root, base), []);
  const relaxed = policy(); relaxed.baseline.lignes_longues_prod++;
  await write(relaxed); git('add', '.'); git('commit', '-qm', 'relaxed');
  assert.equal(git('status', '--porcelain'), '');
  assert.match((await checkBasePolicy(root, base)).join('\n'), /Plancher relâché/);
  await fs.writeFile(path.join(root, 'scripts/new.mjs'), '// ' + 'x'.repeat(170));
  git('add', '.'); git('commit', '-qm', 'new long line');
  assert.equal(git('status', '--porcelain'), '');
  assert.match((await checkBaseFiles(root, base)).join('\n'), /scripts\/new.mjs/);
  await assert.rejects(checkBasePolicy(root, '--help'), { code: 'TVLENS_CI_BASE_INVALID' });
  await assert.rejects(checkBasePolicy(root, '0'.repeat(40)), { code: 'TVLENS_CI_BASE_UNAVAILABLE' });
});
