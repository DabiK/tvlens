const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const {executable} = require('../adapters/system-paths.cjs');
const {loadConfig} = require('../adapters/config.cjs');
const { createConversationRuntime } = require('../runtime/conversation-runtime.cjs');
const { HeadlessRuntime } = require('../runtime/headless-runtime.cjs');
const { createSessionTranscriber } = require('../runtime/session-providers.cjs');

async function whisperConfigFixture(t, apiKey) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tvlens-whisper-cache-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const safeStorage = {
    isEncryptionAvailable: () => true,
    encryptString: text => Buffer.from(text).map(byte => byte ^ 0x5a),
    decryptString: bytes => Buffer.from(bytes).map(byte => byte ^ 0x5a).toString(),
  };
  const configPath = path.join(root, 'speech.env');
  await fs.writeFile(configPath, [
    `OPENROUTER_API_KEY=${apiKey}`, 'OPENROUTER_MODEL=file/provider',
    'TVLENS_WHISPER_MODEL=/file/model.bin', 'TVLENS_WHISPER_BINARY=/file/whisper',
    'TVLENS_WHISPER_THREADS=3', 'TVLENS_WHISPER_AUDIO_CTX=512',
    'TVLENS_BACKGROUND_INDEX=0', 'TVLENS_FFMPEG=/file/ffmpeg',
  ].join('\n'));
  return { configPath, safeStorage, cached: path.join(root, 'provider.enc'), root,
    load: options => loadConfig({ userData: root, safeStorage, environment: {}, ...options }) };
}

function assertWhisperComposition(config, environment) {
  class RecordedTranscriber {
    constructor(options) { this.options = options; }
  }
  const { options } = createSessionTranscriber({ config, packaged: true }, { LocalTranscriber: RecordedTranscriber });
  assert.equal(options.model, environment.TVLENS_WHISPER_MODEL);
  assert.equal(options.binary, environment.TVLENS_WHISPER_BINARY);
}

for (const apiKey of ['imported-key', '']) {
  test(`cached Whisper paths accept temporary startup overrides (provider key: ${Boolean(apiKey)})`, async t => {
    const f = await whisperConfigFixture(t, apiKey);
    await f.load({ configPath: f.configPath });
    const baseline = await f.load();
    assert.equal(baseline.whisperModel, apiKey ? '/file/model.bin' : undefined);
    assert.equal(baseline.whisperBinary, apiKey ? '/file/whisper' : undefined);
    const bytes = await fs.readFile(f.cached);
    const writes = t.mock.method(fs, 'writeFile');
    const environment = { TVLENS_WHISPER_MODEL: '/environment/model.bin', TVLENS_WHISPER_BINARY: '/environment/whisper' };
    const overridden = await f.load({ environment });
    assert.deepEqual(overridden, { ...baseline, whisperModel: environment.TVLENS_WHISPER_MODEL, whisperBinary: environment.TVLENS_WHISPER_BINARY });
    assert.equal(overridden.apiKey, apiKey);
    assertWhisperComposition(overridden, environment);
    for (const [selected, expected] of [
      [{}, baseline],
      [{ TVLENS_WHISPER_MODEL: '', TVLENS_WHISPER_BINARY: '' }, baseline],
      [{ TVLENS_WHISPER_MODEL: environment.TVLENS_WHISPER_MODEL }, { ...baseline, whisperModel: environment.TVLENS_WHISPER_MODEL }],
      [{ TVLENS_WHISPER_BINARY: environment.TVLENS_WHISPER_BINARY }, { ...baseline, whisperBinary: environment.TVLENS_WHISPER_BINARY }],
      [{ ...environment, TVLENS_WHISPER_MODEL: '' }, { ...baseline, whisperBinary: environment.TVLENS_WHISPER_BINARY }],
      [{ ...environment, TVLENS_WHISPER_BINARY: '' }, { ...baseline, whisperModel: environment.TVLENS_WHISPER_MODEL }],
    ]) {
      assert.deepEqual(await f.load({ environment: selected }), expected);
    }
    assert.deepEqual(await f.load(), baseline);
    assert.equal(writes.mock.callCount(), 0, 'cached starts never write, including when overridden');
    assert.deepEqual(await fs.readFile(f.cached), bytes);
  });
}

for (const apiKey of ['imported-key', '']) {
  test(`Whisper imports retain their path precedence and persistence (provider key: ${Boolean(apiKey)})`, async t => {
    const f = await whisperConfigFixture(t, apiKey);
    for (const [environment, expected] of [
      [{}, { TVLENS_WHISPER_MODEL: '/file/model.bin', TVLENS_WHISPER_BINARY: '/file/whisper' }],
      [{ TVLENS_WHISPER_MODEL: '/environment/model.bin', TVLENS_WHISPER_BINARY: '/environment/whisper' },
        { TVLENS_WHISPER_MODEL: '/environment/model.bin', TVLENS_WHISPER_BINARY: '/environment/whisper' }],
      [{ TVLENS_WHISPER_MODEL: '', TVLENS_WHISPER_BINARY: '' },
        { TVLENS_WHISPER_MODEL: null, TVLENS_WHISPER_BINARY: executable('whisper-cli', { environment: {} }) }],
    ]) {
      const imported = await f.load({ configPath: f.configPath, environment });
      assert.equal(imported.apiKey, apiKey);
      assert.equal(imported.whisperModel, expected.TVLENS_WHISPER_MODEL);
      assert.equal(imported.whisperBinary, expected.TVLENS_WHISPER_BINARY);
      if (expected.TVLENS_WHISPER_MODEL) assertWhisperComposition(imported, expected);
      const stored = JSON.parse(f.safeStorage.decryptString(await fs.readFile(f.cached)));
      assert.deepEqual(stored.switchEnv, { TVLENS_WHISPER_AUDIO_CTX: '512', TVLENS_BACKGROUND_INDEX: '0' });
      if (apiKey) {
        assert.equal(stored.whisperModel, expected.TVLENS_WHISPER_MODEL);
        assert.equal(stored.whisperBinary, expected.TVLENS_WHISPER_BINARY);
      } else {
        assert.deepEqual(Object.keys(stored), ['switchEnv'], 'keyless imports still persist switches only');
      }
      const restored = await f.load();
      assert.equal(restored.apiKey, apiKey);
      assert.equal(restored.whisperModel, apiKey ? expected.TVLENS_WHISPER_MODEL : undefined);
      assert.equal(restored.whisperBinary, apiKey ? expected.TVLENS_WHISPER_BINARY : undefined);
    }
  });
}

test('explicit Whisper paths reach packaged transcription without a cache or a provider key and write nothing', async t => {
  const f = await whisperConfigFixture(t, '');
  const userData = path.join(f.root, 'uncached');
  const environment = { TVLENS_WHISPER_MODEL: '/environment/model.bin', TVLENS_WHISPER_BINARY: '/environment/whisper' };
  const writes = t.mock.method(fs, 'writeFile');
  const config = await f.load({ userData, environment });
  assert.equal(config.apiKey, '');
  assert.equal(config.whisperModel, environment.TVLENS_WHISPER_MODEL);
  assert.equal(config.whisperBinary, environment.TVLENS_WHISPER_BINARY);
  assertWhisperComposition(config, environment);
  const fresh = await f.load({ userData });
  const { whisperModel, whisperBinary, ...otherSettings } = config;
  assert.deepEqual(fresh, otherSettings);
  assert.deepEqual(await f.load({ userData, environment: { TVLENS_WHISPER_MODEL: '', TVLENS_WHISPER_BINARY: '' } }), fresh);
  assert.equal(writes.mock.callCount(), 0);
  await assert.rejects(fs.access(userData), { code: 'ENOENT' });
});

test('dedicated inspection settings persist independently while tokens and environment overrides remain temporary', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tvlens-inspection-model-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const safeStorage = { isEncryptionAvailable: () => true, encryptString: text => Buffer.from(text), decryptString: bytes => bytes.toString() };
  const configPath = path.join(root, 'inspection.env');
  const environment = { TVLENS_INSPECTION_BACKEND: 'local', TVLENS_LOCAL_VLM_MODEL: 'modele-a',
    TVLENS_LOCAL_INSPECTION_URL: 'http://127.0.0.1:9/private', TVLENS_LOCAL_INSPECTION_MODEL: 'modele-b',
    TVLENS_LOCAL_INSPECTION_NUM_CTX: '16384', TVLENS_LOCAL_INSPECTION_KEEP_ALIVE: '2m',
    TVLENS_LOCAL_INSPECTION_TOKEN: 'FILE_SECRET', TVLENS_LOCAL_INSPECTION_THINK: 'off' };
  await fs.writeFile(configPath, Object.entries(environment).map(([key, value]) => `${key}=${value}`).join('\n'));
  const load = options => loadConfig({ userData: root, safeStorage, environment: {}, ...options });
  const expected = { url: environment.TVLENS_LOCAL_INSPECTION_URL, model: 'modele-b', numCtx: 16384,
    keepAlive: '2m', token: 'FILE_SECRET', think: 'off' };
  const bare = await load({ safeStorage: { isEncryptionAvailable: () => false }, environment });
  assert.deepEqual(bare.localInspectionVlm, expected);
  assert.equal(Object.hasOwn(bare, 'localInspection'), false);
  const imported = await load({ configPath, environment: { TVLENS_LOCAL_INSPECTION_MODEL: 'env-model',
    TVLENS_LOCAL_INSPECTION_TOKEN: 'ENV_SECRET', TVLENS_LOCAL_INSPECTION_THINK: 'on' } });
  assert.deepEqual(imported.localInspectionVlm, { ...expected, model: 'env-model', token: 'ENV_SECRET', think: 'on' });
  assert.equal(imported.localVlm.model, 'modele-a');
  assert.doesNotMatch(await fs.readFile(path.join(root, 'provider.enc'), 'utf8'), /FILE_SECRET|ENV_SECRET|env-model/);
  const restored = await load();
  assert.deepEqual(restored.localInspectionVlm, { ...expected, token: null });
  const empty = await load({ environment: { TVLENS_LOCAL_INSPECTION_MODEL: '', TVLENS_LOCAL_INSPECTION_THINK: '' } });
  assert.deepEqual(empty.localInspectionVlm, restored.localInspectionVlm);
  const defaults = await load({ safeStorage: { isEncryptionAvailable: () => false } });
  assert.deepEqual(defaults.localInspectionVlm, { url: null, model: null, numCtx: undefined, keepAlive: undefined, token: null });
});

test('local thinking settings persist independently while startup overrides remain temporary', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tvlens-thinking-config-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const safeStorage = { isEncryptionAvailable: () => true, encryptString: text => Buffer.from(text), decryptString: bytes => bytes.toString() };
  const configPath = path.join(root, 'roles.env');
  await fs.writeFile(configPath, 'TVLENS_LOCAL_VLM_THINK=off\nTVLENS_LOCAL_QUESTIONS_THINK=on\n');
  const load = options => loadConfig({ userData: root, safeStorage, environment: {}, ...options });
  const imported = await load({ configPath, environment: { TVLENS_LOCAL_VLM_THINK: 'on', TVLENS_LOCAL_QUESTIONS_THINK: 'off' } });
  assert.deepEqual([imported.localVlm.think, imported.localQuestions.think], ['on', 'off']);
  const restored = await load();
  assert.deepEqual([restored.localVlm.think, restored.localQuestions.think], ['off', 'on']);
  const defaults = await load({ environment: { TVLENS_LOCAL_VLM_THINK: 'default', TVLENS_LOCAL_QUESTIONS_THINK: 'default' } });
  assert.deepEqual([defaults.localVlm.think, defaults.localQuestions.think], ['default', 'default']);
  const empty = await load({ environment: { TVLENS_LOCAL_VLM_THINK: '', TVLENS_LOCAL_QUESTIONS_THINK: '' } });
  assert.deepEqual([empty.localVlm.think, empty.localQuestions.think], ['off', 'on']);
});

test('invalid local thinking settings survive loading and refuse shared startup by name from every configuration source', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tvlens-thinking-invalid-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const safeStorage = { isEncryptionAvailable: () => true, encryptString: text => Buffer.from(text), decryptString: bytes => bytes.toString() };
  const configPath = path.join(root, 'roles.env');
  const base = { OPENROUTER_API_KEY: 'IMPORTED_PROVIDER_KEY', TVLENS_PERCEPTION_BACKEND: 'local',
    TVLENS_INSPECTION_BACKEND: 'local', TVLENS_QUESTIONS_BACKEND: 'local',
    TVLENS_LOCAL_VLM_URL: 'http://127.0.0.1:9', TVLENS_LOCAL_VLM_MODEL: 'vision-local',
    TVLENS_LOCAL_QUESTIONS_URL: 'http://127.0.0.1:9', TVLENS_LOCAL_QUESTIONS_MODEL: 'questions-local' };
  const started = [];
  t.after(() => Promise.allSettled(started.map(runtime => runtime.close())));
  const checkStartup = async (options, setting, value) => {
    let fallbackUsed = false;
    const pending = loadConfig({ userData: root, safeStorage, environment: {}, ...options });
    const config = await pending.catch(() => { fallbackUsed = true; return {}; });
    assert.equal(fallbackUsed, false, 'the Mac loading fallback must never swallow a mistyped runtime switch');
    const role = setting === 'TVLENS_LOCAL_VLM_THINK' ? 'localVlm' : 'localQuestions';
    assert.equal(config[role].think, value);
    assert.deepEqual([config.perceptionBackend, config.inspectionBackend, config.questionsBackend], ['local', 'local', 'local']);
    if (options.configPath || !options.environment) assert.equal(config.apiKey, 'IMPORTED_PROVIDER_KEY');
    const rejectsSetting = error => error.code === 'TVLENS_LOCAL_THINK_INVALID'
      && error.message.includes(setting) && !error.message.includes('PRIVATE_INVALID_VALUE');
    for (const selected of [config, { ...config, perceptionBackend: 'codex', inspectionBackend: 'codex', questionsBackend: 'codex' }]) {
      assert.throws(() => createConversationRuntime({ config: selected, agent: {} }), rejectsSetting);
      assert.throws(() => started.push(new HeadlessRuntime({ config: selected, agent: {}, smoke: true,
        userData: root, sessionsRoot: path.join(root, 'sessions'), transcriber: {} })), rejectsSetting);
    }
  };
  for (const setting of ['TVLENS_LOCAL_VLM_THINK', 'TVLENS_LOCAL_QUESTIONS_THINK']) {
    for (const value of ['true', 'false', 'ON', '0', ' ', 'PRIVATE_INVALID_VALUE']) {
      await checkStartup({ safeStorage: { isEncryptionAvailable: () => false }, environment: { ...base, [setting]: value } }, setting, value);
      await fs.writeFile(configPath, Object.entries({ ...base, [setting]: value }).map(([key, text]) => `${key}="${text}"`).join('\n'));
      await checkStartup({ configPath }, setting, value);
      await checkStartup({}, setting, value);
    }
  }
});

test('malformed cached switches keep configuration import available', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tvlens-malformed-switches-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const safeStorage = { isEncryptionAvailable: () => true, decryptString: bytes => bytes.toString() };
  await fs.writeFile(path.join(root, 'provider.enc'), JSON.stringify({ switchEnv: null }));
  const pending = loadConfig({ userData: root, safeStorage, environment: {} });
  await assert.doesNotReject(pending);
  const config = await pending;
  assert.equal(config.apiKey, '');
  assert.equal(config.questionsBackend, 'codex');
});

test('executable resolution handles PATH entries with spaces and explicit overrides', async t => {
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'tvlens path '));
  t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const binary=path.join(root,'tvlens-test-tool');
  await fs.writeFile(binary,'#!/bin/sh\nexit 0\n',{mode:0o700});
  assert.equal(executable('tvlens-test-tool',{environment:{PATH:root}}),binary);
  assert.equal(executable('tvlens-test-tool',{override:'/explicit/tool',environment:{PATH:root}}),'/explicit/tool');
  await fs.chmod(binary,0o600);
  assert.equal(executable('tvlens-test-tool',{environment:{PATH:root},home:root}),'tvlens-test-tool');
});
test('fresh installation works without an optional env file and keeps writable usage separate',async t=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'tvlens-config-'));
  t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const configPath=path.join(root,'missing.env');
  const opts={configPath,userData:root,safeStorage:{isEncryptionAvailable:()=>false},environment:{TVLENS_FFMPEG:'/usr/bin/ffmpeg',TVLENS_USAGE_DIR:path.join(root,'data')}};
  const c=await loadConfig(opts);
  assert.equal(c.apiKey,'');
  assert.equal(c.ffmpeg,'/usr/bin/ffmpeg');
  assert.equal(c.researchBudgetFile,path.join(root,'data','research-budget.json'));
  await fs.writeFile(configPath,'TVLENS_FFMPEG=/file/ffmpeg\nTVLENS_WHISPER_BINARY=/custom/whisper\n');
  const d=await loadConfig(opts);
  assert.equal(d.ffmpeg,'/usr/bin/ffmpeg');
  assert.equal(d.whisperBinary,'/custom/whisper');
  await assert.rejects(loadConfig({...opts,configPath:root}),{code:'EISDIR'});
});

test('explicit Whisper environment overrides win with and without an imported configuration', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tvlens-whisper-config-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const configPath = path.join(root, 'speech.env');
  await fs.writeFile(configPath, 'TVLENS_WHISPER_MODEL=/file/model.bin\nTVLENS_WHISPER_BINARY=/file/whisper\n');
  const environment = { TVLENS_WHISPER_MODEL: '/environment/model.bin', TVLENS_WHISPER_BINARY: '/environment/whisper' };
  for (const imported of [configPath, undefined]) {
    const config = await loadConfig({ configPath: imported, userData: root, safeStorage: { isEncryptionAvailable: () => false }, environment });
    assert.equal(config.whisperModel, environment.TVLENS_WHISPER_MODEL);
    assert.equal(config.whisperBinary, environment.TVLENS_WHISPER_BINARY);
  }
});

test('question backend imports persist while startup overrides and tokens stay out of the cache', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tvlens-questions-config-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const safeStorage = {
    isEncryptionAvailable: () => true,
    encryptString: text => Buffer.from(text),
    decryptString: bytes => bytes.toString(),
  };
  const configPath = path.join(root, 'questions.env');
  await fs.writeFile(configPath, [
    'TVLENS_QUESTIONS_BACKEND=local', 'TVLENS_LOCAL_QUESTIONS_URL=http://127.0.0.1:11434/private',
    'TVLENS_LOCAL_QUESTIONS_MODEL=local-file', 'TVLENS_LOCAL_QUESTIONS_NUM_CTX=8192',
    'TVLENS_LOCAL_QUESTIONS_KEEP_ALIVE=30m', 'TVLENS_LOCAL_QUESTIONS_TOKEN=FILE_SECRET',
  ].join('\n'));
  const load = options => loadConfig({ userData: root, safeStorage, environment: {}, ...options });
  const imported = await load({ configPath, environment: { TVLENS_LOCAL_QUESTIONS_MODEL: 'local-env',
    TVLENS_LOCAL_QUESTIONS_TOKEN: 'ENV_SECRET' } });
  assert.equal(imported.questionsBackend, 'local');
  assert.equal(imported.perceptionBackend, 'codex');
  assert.equal(imported.localVlm.model, null);
  assert.deepEqual(imported.localQuestions, { url: 'http://127.0.0.1:11434/private', model: 'local-env',
    numCtx: 8192, keepAlive: '30m', token: 'ENV_SECRET' });
  const cached = await fs.readFile(path.join(root, 'provider.enc'), 'utf8');
  assert.doesNotMatch(cached, /FILE_SECRET|ENV_SECRET|local-env/);
  const restored = await load();
  assert.deepEqual(restored.localQuestions, { ...imported.localQuestions, model: 'local-file', token: null });
  assert.equal(restored.questionsBackend, 'local');
  assert.equal((await load({ environment: { TVLENS_QUESTIONS_BACKEND: 'codex' } })).questionsBackend, 'codex');
  assert.equal((await load({ configPath, environment: { TVLENS_LOCAL_QUESTIONS_MODEL: '' } })).localQuestions.model, 'local-file');
  const bare = await loadConfig({ userData: root, safeStorage: { isEncryptionAvailable: () => false }, environment: {} });
  assert.equal(bare.questionsBackend, 'codex');
  assert.deepEqual(bare.localQuestions, { url: null, model: null, numCtx: undefined, keepAlive: undefined, token: null });
});

test('embedding backend imports persist independently and never persist local tokens or startup overrides', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tvlens-embedding-config-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const safeStorage = { isEncryptionAvailable: () => true, encryptString: text => Buffer.from(text), decryptString: bytes => bytes.toString() };
  const configPath = path.join(root, 'embeddings.env');
  await fs.writeFile(configPath, [
    'TVLENS_EMBEDDINGS_BACKEND=local', 'TVLENS_LOCAL_EMBEDDINGS_URL=http://127.0.0.1:11434/private',
    'TVLENS_LOCAL_EMBEDDINGS_MODEL=file-model', 'TVLENS_LOCAL_EMBEDDINGS_TOKEN=FILE_SECRET',
  ].join('\n'));
  const load = options => loadConfig({ userData: root, safeStorage, environment: {}, ...options });
  const imported = await load({ configPath, environment: {
    TVLENS_LOCAL_EMBEDDINGS_MODEL: 'env-model', TVLENS_LOCAL_EMBEDDINGS_TOKEN: 'ENV_SECRET',
  } });
  assert.equal(imported.embeddingsBackend, 'local');
  assert.deepEqual(imported.localEmbeddings, { url: 'http://127.0.0.1:11434/private', model: 'env-model', token: 'ENV_SECRET' });
  assert.deepEqual([imported.questionsBackend, imported.perceptionBackend], ['codex', 'codex']);
  assert.doesNotMatch(await fs.readFile(path.join(root, 'provider.enc'), 'utf8'), /FILE_SECRET|ENV_SECRET|env-model/);
  const restored = await load();
  assert.equal(restored.embeddingsBackend, 'local');
  assert.deepEqual(restored.localEmbeddings, { ...imported.localEmbeddings, model: 'file-model', token: null });
  for (const backend of ['disabled', 'openrouter', 'invalid']) {
    assert.equal((await load({ environment: { TVLENS_EMBEDDINGS_BACKEND: backend } })).embeddingsBackend, backend);
  }
  assert.equal((await load({ configPath, environment: { TVLENS_LOCAL_EMBEDDINGS_MODEL: '' } })).localEmbeddings.model, 'file-model');
  const bare = await loadConfig({ userData: root, safeStorage: { isEncryptionAvailable: () => false }, environment: {} });
  assert.equal(bare.embeddingsBackend, undefined);
  assert.deepEqual(bare.localEmbeddings, { url: null, model: null, token: null });
});

test('inspection backend persists file selection while environment wins without persisting local secrets', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tvlens-inspection-config-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const safeStorage = { isEncryptionAvailable: () => true, encryptString: text => Buffer.from(text), decryptString: bytes => bytes.toString() };
  const configPath = path.join(root, 'inspection.env');
  await fs.writeFile(configPath, [
    'TVLENS_INSPECTION_BACKEND=local', 'TVLENS_LOCAL_VLM_URL=http://127.0.0.1:9/private',
    'TVLENS_LOCAL_VLM_MODEL=file-model', 'TVLENS_LOCAL_VLM_TOKEN=FILE_SECRET',
  ].join('\n'));
  const load = extra => loadConfig({ userData: root, safeStorage, environment: {}, ...extra });
  const imported = await load({ configPath, environment: {
    TVLENS_INSPECTION_BACKEND: 'codex', TVLENS_LOCAL_VLM_MODEL: 'env-model', TVLENS_LOCAL_VLM_TOKEN: 'ENV_SECRET',
  } });
  assert.equal(imported.inspectionBackend, 'codex');
  assert.equal(imported.localVlm.model, 'env-model');
  assert.equal(imported.localVlm.token, 'ENV_SECRET');
  assert.doesNotMatch(await fs.readFile(path.join(root, 'provider.enc'), 'utf8'), /FILE_SECRET|ENV_SECRET|env-model/);
  const restored = await load();
  assert.equal(restored.inspectionBackend, 'local');
  assert.equal(restored.localVlm.model, 'file-model');
  assert.equal(restored.localVlm.token, null);
  assert.deepEqual([restored.questionsBackend, restored.perceptionBackend], ['codex', 'codex']);
  assert.equal((await load({ environment: { TVLENS_INSPECTION_BACKEND: 'invalid' } })).inspectionBackend, 'invalid');
  assert.equal((await load({ configPath, environment: { TVLENS_INSPECTION_BACKEND: '' } })).inspectionBackend, 'local');
  const bare = await loadConfig({ userData: root, environment: {}, safeStorage: { isEncryptionAvailable: () => false } });
  assert.equal(bare.inspectionBackend, 'codex');
});

test('local embedding deadlines persist from imports while startup overrides remain temporary', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tvlens-embedding-deadline-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const safeStorage = { isEncryptionAvailable: () => true, encryptString: text => Buffer.from(text), decryptString: bytes => bytes.toString() };
  const configPath = path.join(root, 'embeddings.env');
  await fs.writeFile(configPath, 'TVLENS_LOCAL_EMBEDDINGS_TIMEOUT_MS=45000\n');
  const load = options => loadConfig({ userData: root, safeStorage, environment: {}, ...options });
  const imported = await load({ configPath, environment: { TVLENS_LOCAL_EMBEDDINGS_TIMEOUT_MS: '60000' } });
  assert.equal(imported.localEmbeddings.timeoutMs, 60000);
  assert.equal((await load()).localEmbeddings.timeoutMs, 45000);
  assert.equal((await load({ environment: { TVLENS_LOCAL_EMBEDDINGS_TIMEOUT_MS: '1' } })).localEmbeddings.timeoutMs, 1);
  const bare = await loadConfig({ userData: root, safeStorage: { isEncryptionAvailable: () => false },
    environment: { TVLENS_LOCAL_EMBEDDINGS_TIMEOUT_MS: '25000' } });
  assert.equal(bare.localEmbeddings.timeoutMs, 25000);
});

test('local web retrieval is absent unless its backend is set, and imports persist while startup overrides win', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tvlens-local-web-config-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const safeStorage = { isEncryptionAvailable: () => true, encryptString: text => Buffer.from(text), decryptString: bytes => bytes.toString() };
  const bareStorage = { isEncryptionAvailable: () => false };
  const load = options => loadConfig({ userData: root, safeStorage, environment: {}, ...options });
  assert.equal(Object.hasOwn(await loadConfig({ userData: root, safeStorage: bareStorage, environment: {} }), 'localWeb'), false);
  const unset = await loadConfig({ userData: root, safeStorage: bareStorage,
    environment: { TVLENS_LOCAL_WEB_BACKEND: '', TVLENS_LOCAL_WEB_CORPUS: '/corpus', TVLENS_LOCAL_WEB_TRIGGER: 'always' } });
  assert.equal(Object.hasOwn(unset, 'localWeb'), false);
  const fromEnvironment = await loadConfig({ userData: root, safeStorage: bareStorage,
    environment: { TVLENS_LOCAL_WEB_BACKEND: 'searxng', TVLENS_LOCAL_WEB_URL: 'http://127.0.0.1:8888' } });
  assert.deepEqual(fromEnvironment.localWeb, { backend: 'searxng', url: 'http://127.0.0.1:8888' });
  const decidedByModel = await loadConfig({ userData: root, safeStorage: bareStorage,
    environment: { TVLENS_LOCAL_WEB_BACKEND: 'corpus', TVLENS_LOCAL_WEB_CORPUS: '/corpus', TVLENS_LOCAL_WEB_TRIGGER: 'model' } });
  assert.deepEqual(decidedByModel.localWeb, { backend: 'corpus', corpus: '/corpus', trigger: 'model' });
  const configPath = path.join(root, 'web.env');
  await fs.writeFile(configPath, 'TVLENS_LOCAL_WEB_BACKEND=corpus\nTVLENS_LOCAL_WEB_CORPUS=/file/corpus\nTVLENS_LOCAL_WEB_TRIGGER=auto\n');
  const imported = await load({ configPath, environment: { TVLENS_LOCAL_WEB_TRIGGER: 'always' } });
  assert.deepEqual(imported.localWeb, { backend: 'corpus', corpus: '/file/corpus', trigger: 'always' });
  assert.deepEqual((await load()).localWeb, { backend: 'corpus', corpus: '/file/corpus', trigger: 'auto' });
  const overridden = await load({ environment: { TVLENS_LOCAL_WEB_BACKEND: 'searxng', TVLENS_LOCAL_WEB_URL: 'http://127.0.0.1:8888' } });
  assert.deepEqual(overridden.localWeb, { backend: 'searxng', corpus: '/file/corpus', url: 'http://127.0.0.1:8888', trigger: 'auto' });
  assert.deepEqual((await load()).localWeb, { backend: 'corpus', corpus: '/file/corpus', trigger: 'auto' });
});
