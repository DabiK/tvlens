const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { desktopPaths } = require('../adapters/desktop-setup.cjs');
const fs = require('node:fs/promises');
const os = require('node:os');
const { DesktopPreferences, inspectDesktop } = require('../adapters/desktop-setup.cjs');

test('a Finder launch stores its default speech model under application data rather than the working directory', () => {
  const paths = desktopPaths({ config: {}, preferences: {}, userData: '/Users/viewer/Library/Application Support/TVLens',
    packaged: true, environment: {}, home: '/Users/viewer' });
  assert.equal(paths.whisperModel, '/Users/viewer/Library/Application Support/TVLens/models/ggml-base.bin');
  assert.equal(paths.codexAuthHome, path.join('/Users/viewer', '.codex'));
});

test('tools installed after a missing first check can be discovered from a Finder compatible search path', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tvlens-setup-path-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.writeFile(path.join(root, 'codex'), '#!/bin/sh\nexit 0', { mode: 0o700 });
  const paths = desktopPaths({ config: { codexBinary: 'codex' }, preferences: {}, userData: root,
    packaged: true, environment: { PATH: root }, home: root });
  assert.equal(paths.codexBinary, path.join(root, 'codex'));
});

test('installation preferences survive a fresh launch without persisting provider credentials', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tvlens-setup-store-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const store = new DesktopPreferences(root);
  assert.deepEqual(await store.load(), { paths: {}, completed: false });
  await store.save({ paths: { whisperModel: '/my models/base.bin', apiKey: 'secret' }, completed: true });
  const stored = await new DesktopPreferences(root).load();
  assert.deepEqual(stored, { paths: { whisperModel: '/my models/base.bin' }, completed: true });
  assert.equal((await fs.stat(store.file)).mode & 0o777, 0o600);
  assert.doesNotMatch(await fs.readFile(store.file, 'utf8'), /secret|apiKey/);
  await fs.writeFile(store.file, '{');
  await assert.rejects(store.load(), { code: 'TVLENS_SETUP_READ_FAILED' });
});

test('diagnosis distinguishes absent tools, unsuccessful login, model presence and denied screen access', async () => {
  const paths = { codexBinary: '/tools/codex', codexAuthHome: '/chosen account', ffmpeg: '/tools/ffmpeg',
    whisperBinary: '/tools/whisper-cli', whisperModel: '/models/base.bin' };
  const calls = [];
  const checks = await inspectDesktop({ paths, permission: 'denied', environment: { PATH: '/tools' } }, {
    access: async file => file !== paths.ffmpeg,
    run: async (binary, args, environment) => {
      calls.push({ binary, args, environment });
      return args[0] === 'login' ? 'unavailable' : 'ready';
    },
  });
  const states = Object.fromEntries(checks.map(check => [check.id, check.state]));
  assert.equal(states.codexBinary, 'ready');
  assert.equal(states.codexAuthHome, 'unavailable');
  assert.equal(states.ffmpeg, 'missing');
  assert.equal(states.whisperModel, 'present');
  assert.equal(states.screen, 'denied');
  assert.equal(calls.find(call => call.args[0] === 'login').environment.CODEX_HOME, paths.codexAuthHome);
  assert.equal(calls.length, 3);
});

test('saving preferences into an unusable directory returns a coded message without internal paths', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tvlens-setup-disk-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const blocked = path.join(root, 'private-destination');
  await fs.writeFile(blocked, 'existing file');
  const store = new DesktopPreferences(blocked);
  await assert.rejects(store.save({ paths: {}, completed: true }), error => {
    assert.equal(error.code, 'TVLENS_SETUP_WRITE_FAILED');
    assert.ok(!error.message.includes(root));
    return true;
  });
  assert.equal(await fs.readFile(blocked, 'utf8'), 'existing file');
});
