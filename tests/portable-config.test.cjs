const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const {executable} = require('../adapters/system-paths.cjs');
const {loadConfig} = require('../adapters/config.cjs');
const { createConversationRuntime } = require('../runtime/conversation-runtime.cjs');
const { HeadlessRuntime } = require('../runtime/headless-runtime.cjs');

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
