const { test } = require('node:test');
const assert = require('node:assert/strict');
const { keeps } = require('../scripts/package-filter.cjs');
const { sourceFiles, copyFilter, ASSETS, SOURCE_ROOTS } = require('../scripts/package-filter.cjs');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const root = path.resolve(__dirname, '..');

test('the Mac package refuses research, tooling, other hosts and unknown root entries', () => {
  for (const name of ['docs', 'tests', 'film', 'promo', 'experiments', 'screenshots', 'design', 'scripts', 'server', 'mcp', 'tv',
    '.harness-state', '.agents', 'unknown', 'appendix', 'core-old']) {
    assert.equal(keeps('/' + name), false, name);
    assert.equal(keeps('/' + name + '/file.js'), false, name);
  }
});

test('private files and packager default exclusions remain excluded at any admitted depth', () => {
  for (const filename of ['.env', '.env.local', 'env.local', 'auth.json', 'auth.txt', 'device-token', 'connection.js',
    'private.ovpn', 'private.pem', 'provider.enc', 'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml',
    '.git/config', 'node_gyp_bins/python3', 'build/a.o', 'build/a.obj', 'sessions/session.json']) {
    for (const prefix of ['', '/app', '/adapters', '/node_modules/dependency']) {
      assert.equal(keeps(`${prefix}/${filename}`), false, `${prefix}/${filename}`);
    }
  }
  assert.equal(keeps('/node_modules/.bin/electron'), false);
  assert.equal(keeps('/node_modules/sharp/lib/index.js'), true);
  assert.equal(keeps('/node_modules/@img/sharp-darwin-arm64/lib/sharp-darwin-arm64.node'), true);
  assert.equal(keeps('/app/../../auth.json'), false);
});

test('the actual copy filter covers the app import graph, HTML assets and the audio worklet', async () => {
  const { packagerOptions } = await import('../scripts/package.mjs');
  const { ignore } = packagerOptions();
  const files = sourceFiles(root), admitted = new Set(files);
  for (const file of [...ASSETS, 'app/audio-worklet.js', 'app/main.cjs', 'app/preload.cjs']) {
    assert.ok(admitted.has(file), file);
  }
  // Packaging is a structural guard: every relative JavaScript import must survive the copy filter.
  for (const file of files.filter(file => /\.(?:cjs|mjs|js)$/.test(file))) {
    const source = fs.readFileSync(path.join(root, file), 'utf8');
    const imports = source.matchAll(/(?:\brequire\s*\(|\bimport\s*\(|\bfrom\s+|\bimport\s+)\s*['"]([^'"]+)['"]/g);
    for (const [, specifier] of imports) {
      if (!specifier.startsWith('.')) continue;
      const target = path.posix.normalize(path.posix.join(path.posix.dirname(file), specifier));
      assert.ok(admitted.has(target), `${file} imports missing ${target}`);
    }
    let name = '/' + file;
    while (name !== '/') {
      assert.equal(ignore(name), false, name);
      name = path.posix.dirname(name);
    }
  }
  assert.equal(ignore(''), false);
  assert.equal(ignore('/app/unknown-secret.json'), true);
  assert.equal(ignore('/build-info.json'), true, 'stale source identity is replaced in the copy hook');
  assert.equal(ignore('/node_modules/.bin/electron'), true);
  for (const entry of fs.readdirSync(root)) {
    if (SOURCE_ROOTS.includes(entry) || ['package.json', 'node_modules'].includes(entry)) continue;
    assert.equal(ignore('/' + entry), true, entry);
  }
});

test('the copy hook writes the supplied identity only in the build directory', async t => {
  const { packagerOptions } = await import('../scripts/package.mjs');
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'tvlens-package-copy-'));
  t.after(() => fs.rmSync(folder, { recursive: true, force: true }));
  const build = { name: 'tvlens', version: '0.1.0', commit: 'b'.repeat(40), commitDate: '2026-10-23T00:00:00Z', dirty: true };
  const options = packagerOptions({ build });
  const before = fs.readFileSync(path.join(root, 'package.json'));
  await options.afterCopy[0]({ buildPath: folder });
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(folder, 'build-info.json'))), build);
  assert.deepEqual(fs.readFileSync(path.join(root, 'package.json')), before);
  assert.equal(options.prune, true);
});

test('source links cannot pull files from outside the packaging roots', t => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'tvlens-package-links-'));
  t.after(() => fs.rmSync(folder, { recursive: true, force: true }));
  for (const directory of SOURCE_ROOTS) fs.mkdirSync(path.join(folder, directory));
  for (const asset of ASSETS) {
    fs.mkdirSync(path.dirname(path.join(folder, asset)), { recursive: true });
    fs.writeFileSync(path.join(folder, asset), 'fixture');
  }
  fs.writeFileSync(path.join(folder, 'outside.cjs'), 'private');
  fs.symlinkSync('../outside.cjs', path.join(folder, 'app/linked.cjs'));
  assert.throws(() => copyFilter(folder), { code: 'TVLENS_PACKAGE_SOURCE_LINK' });
});

test('packaging seals ad hoc builds and only enables distribution signing with an explicit identity', async () => {
  const { packagerOptions } = await import('../scripts/package.mjs');
  const local = packagerOptions().osxSign;
  assert.equal(local.identity, '-');
  assert.equal(local.identityValidation, false);
  assert.equal(local.continueOnError, false);
  assert.equal(local.preEmbedProvisioningProfile, false);
  assert.equal(local.optionsForFile().hardenedRuntime, false);
  const distribution = packagerOptions({ signingIdentity: 'Developer ID Application: Fixture' }).osxSign;
  assert.equal(distribution.identity, 'Developer ID Application: Fixture');
  assert.equal(distribution.identityValidation, true);
  assert.equal(distribution.continueOnError, false);
  assert.equal(distribution.optionsForFile().hardenedRuntime, true);
  assert.equal(distribution.optionsForFile().timestamp, undefined);
});

test('the protected settings window and its local styles and scripts survive packaging', async () => {
  const { EventEmitter } = require('node:events');
  const { showConfigWelcome } = require('../app/config-welcome.cjs');
  class BrowserWindow extends EventEmitter {
    constructor() {
      super();
      this.webContents = { mainFrame: {}, setWindowOpenHandler() {}, on() {} };
    }
    async loadFile(file) { this.file = file; }
  }
  const shown = showConfigWelcome({ BrowserWindow, ipcMain: { handle() {}, removeHandler() {} }, restore: async () => ({}) });
  const ignore = copyFilter(root);
  const page = path.relative(root, shown.window.file);
  assert.equal(ignore('/' + page), false, 'the actual window document must be included');
  const html = fs.readFileSync(shown.window.file, 'utf8');
  for (const [, reference] of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
    const resource = path.posix.join(path.posix.dirname(page), reference);
    assert.equal(ignore('/' + resource), false, `${page} needs ${resource}`);
  }
});
