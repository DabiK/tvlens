const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { createConfigAccess } = require('../app/config-access.cjs');

async function fixture(t, options = {}) {
  const userData = await fs.mkdtemp(path.join(os.tmpdir(), 'tvlens-config-access-'));
  t.after(() => fs.rm(userData, { recursive: true, force: true }));
  const calls = [];
  const safeStorage = {
    isEncryptionAvailable() { calls.push('available'); return true; },
    encryptString(text) { calls.push('encrypt'); return Buffer.from(text).map(byte => byte ^ 90); },
    decryptString(bytes) { calls.push('decrypt'); return Buffer.from(bytes).map(byte => byte ^ 90).toString(); },
  };
  const cached = path.join(userData, 'provider.enc');
  const seed = async () => {
    await fs.writeFile(cached, safeStorage.encryptString(JSON.stringify({ apiKey: 'private-key', model: 'saved/model',
      switchEnv: { TVLENS_QUESTIONS_BACKEND: 'local', TVLENS_LOCAL_QUESTIONS_MODEL: 'saved-local' } })));
    calls.length = 0;
  };
  const access = createConfigAccess({ userData, environment: {},
    getStorage: () => { calls.push('storage'); return safeStorage; },
    chooseStored: async restore => { calls.push('choice'); return restore(); },
    explainImport: async () => 'save', ...options });
  return { userData, cached, calls, safeStorage, seed, access };
}

test('a fresh launch never obtains storage or opens an explanation and writes no cache', async t => {
  const f = await fixture(t);
  const config = await f.access.startup();
  assert.equal(config.apiKey, '');
  assert.deepEqual(f.calls, []);
  assert.deepEqual(await fs.readdir(f.userData), []);
});

test('saved configuration is decrypted only after the visible choice and retains its backend', async t => {
  let release;
  const selected = new Promise(resolve => { release = resolve; });
  let offer;
  const offered = new Promise(resolve => { offer = resolve; });
  const f = await fixture(t, { chooseStored: async restore => { offer(); await selected; return restore(); } });
  await f.seed();
  const pending = f.access.startup();
  // Wait for the filesystem check using the callback, not a wall-clock delay.
  await offered;
  assert.deepEqual(f.calls, []);
  release();
  const config = await pending;
  assert.equal(config.apiKey, 'private-key');
  assert.equal(config.questionsBackend, 'local');
  assert.equal(config.localQuestions.model, 'saved-local');
  assert.deepEqual(f.calls, ['storage', 'available', 'decrypt']);
});

test('continuing without saved settings preserves their bytes and never requests the keychain', async t => {
  const f = await fixture(t, { chooseStored: async () => null });
  await f.seed();
  const before = await fs.readFile(f.cached);
  const config = await f.access.startup();
  assert.equal(config.apiKey, '');
  assert.equal(config.protectedSettingsSkipped, true);
  assert.deepEqual(f.calls, []);
  assert.deepEqual(await fs.readFile(f.cached), before);
});

test('a startup env file is used for this launch without accessing or replacing saved settings', async t => {
  const f = await fixture(t);
  await f.seed();
  const before = await fs.readFile(f.cached);
  const configPath = path.join(f.userData, 'explicit.env');
  await fs.writeFile(configPath, 'OPENROUTER_API_KEY=temporary-key\n');
  assert.equal((await f.access.startup(configPath)).apiKey, 'temporary-key');
  assert.deepEqual(f.calls, []);
  assert.deepEqual(await fs.readFile(f.cached), before);
});

for (const choice of ['cancel', 'temporary', 'save']) {
  test(`import ${choice} respects the explanation before any protected access`, async t => {
    const f = await fixture(t, { explainImport: async () => { f.calls.push('explain'); return choice; } });
    const configPath = path.join(f.userData, 'import.env');
    await fs.writeFile(configPath, 'OPENROUTER_API_KEY=imported-secret\n');
    const config = await f.access.importFile(configPath);
    assert.equal(config?.apiKey, choice === 'cancel' ? undefined : 'imported-secret');
    assert.equal(f.calls[0], 'explain');
    if (choice !== 'save') {
      assert.deepEqual(f.calls, ['explain']);
      await assert.rejects(fs.access(f.cached), { code: 'ENOENT' });
    } else {
      assert.deepEqual(f.calls, ['explain', 'storage', 'available', 'encrypt']);
      assert.equal((await fs.readFile(f.cached)).includes('imported-secret'), false);
    }
  });
}

test('refused or corrupt protected reads preserve the cache and report a recoverable error', async t => {
  const f = await fixture(t);
  await f.seed();
  const before = await fs.readFile(f.cached);
  f.safeStorage.decryptString = () => { throw Error('private native error'); };
  await assert.rejects(f.access.startup(), error => error.code === 'TVLENS_CONFIG_LOCKED' && !error.message.includes('private'));
  assert.deepEqual(await fs.readFile(f.cached), before);
});

test('an unavailable keychain never claims an import was saved', async t => {
  const f = await fixture(t);
  f.safeStorage.isEncryptionAvailable = () => false;
  const configPath = path.join(f.userData, 'import.env');
  await fs.writeFile(configPath, 'OPENROUTER_API_KEY=secret\n');
  await assert.rejects(f.access.importFile(configPath), { code: 'TVLENS_CONFIG_LOCKED' });
  await assert.rejects(fs.access(f.cached), { code: 'ENOENT' });
});

test('a keyless import cannot replace unreadable previously protected credentials', async t => {
  const f = await fixture(t);
  await f.seed();
  const before = await fs.readFile(f.cached);
  const configPath = path.join(f.userData, 'import.env');
  await fs.writeFile(configPath, 'TVLENS_BACKGROUND_INDEX=0\n');
  f.safeStorage.decryptString = () => { throw Error('denied'); };
  await assert.rejects(f.access.importFile(configPath), { code: 'TVLENS_CONFIG_LOCKED' });
  assert.deepEqual(await fs.readFile(f.cached), before);
});

test('callers without protected storage do not read an existing cache', async t => {
  const f = await fixture(t);
  await fs.mkdir(f.cached);
  const { loadConfig } = require('../adapters/config.cjs');
  const config = await loadConfig({ userData: f.userData, environment: {}, safeStorage: { isEncryptionAvailable: () => false } });
  assert.equal(config.apiKey, '');
});
