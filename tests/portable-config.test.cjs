const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const {executable} = require('../adapters/system-paths.cjs');
const {loadConfig} = require('../adapters/config.cjs');

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
