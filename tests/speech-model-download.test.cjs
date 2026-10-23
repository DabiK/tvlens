const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { installSpeechModel, MODEL_URL } = require('../adapters/speech-model-download.cjs');

async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tvlens-model-download-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  return { root, file: path.join(root, 'base.bin'), expected: createHash('sha256').update('valid model').digest('hex') };
}

test('a verified download is stored atomically and a matching model is reused without network', async t => {
  const { root, file, expected } = await fixture(t);
  let requests = 0;
  const fetchModel = async url => { requests++; assert.equal(url, MODEL_URL); return new Response('valid model'); };
  assert.equal(await installSpeechModel(file, { expected, fetchModel }), file);
  assert.equal(await fs.readFile(file, 'utf8'), 'valid model');
  assert.equal((await fs.stat(file)).mode & 0o777, 0o600);
  await installSpeechModel(file, { expected, fetchModel });
  assert.equal(requests, 1);
  assert.deepEqual(await fs.readdir(root), ['base.bin']);
});

test('a wrong digest leaves the previous model intact and removes partial files', async t => {
  const { root, file, expected } = await fixture(t);
  await fs.writeFile(file, 'previous');
  await assert.rejects(installSpeechModel(file, { expected, fetchModel: async () => new Response('wrong') }),
    { code: 'TVLENS_MODEL_HASH_MISMATCH' });
  assert.equal(await fs.readFile(file, 'utf8'), 'previous');
  assert.deepEqual(await fs.readdir(root), ['base.bin']);
});

test('network errors and cancelled downloads leave no model and no partial files', async t => {
  const { root, file, expected } = await fixture(t);
  await assert.rejects(installSpeechModel(file, { expected, fetchModel: async () => { throw Error('private details'); } }),
    { code: 'TVLENS_MODEL_DOWNLOAD_FAILED' });
  const controller = new AbortController(); controller.abort();
  await assert.rejects(installSpeechModel(file, { expected, signal: controller.signal, fetchModel: async () => new Response('valid model') }),
    { code: 'TVLENS_MODEL_DOWNLOAD_FAILED' });
  assert.deepEqual(await fs.readdir(root), []);
});

test('an unusable destination returns a coded message without internal disk paths', async t => {
  const { root } = await fixture(t);
  const blocker = path.join(root, 'not-a-directory');
  await fs.writeFile(blocker, 'keep');
  await assert.rejects(installSpeechModel(path.join(blocker, 'base.bin')), error => {
    assert.equal(error.code, 'TVLENS_MODEL_DOWNLOAD_FAILED');
    assert.equal(error.message.includes(root), false);
    return true;
  });
});

test('a selected variant uses its pinned URL and hash validation without replacing another model', async t => {
  const { root, file, expected } = await fixture(t);
  const { whisperModel } = require('../adapters/whisper-model-catalog.cjs');
  const modelId = 'large-v3-turbo-q5_0';
  const other = path.join(root, 'small.bin');
  await fs.writeFile(other, 'keep');
  await installSpeechModel(file, { modelId, expected, fetchModel: async url => {
    assert.equal(url, whisperModel(modelId).url);
    assert.match(url, /\/resolve\/[0-9a-f]{40}\//);
    return new Response('valid model');
  } });
  assert.equal(await fs.readFile(other, 'utf8'), 'keep');
  assert.equal(await fs.readFile(file, 'utf8'), 'valid model');
});

test('unknown variants never trigger network requests or create files', async t => {
  const { root, file } = await fixture(t);
  await assert.rejects(installSpeechModel(file, { modelId: '../bad', fetchModel: () => assert.fail('network') }),
    { code: 'TVLENS_SPEECH_MODEL_INVALID' });
  assert.deepEqual(await fs.readdir(root), []);
});

test('streamed model data is bounded by the selected variant size and partial files are removed', async t => {
  const { root, file } = await fixture(t);
  const { whisperModel } = require('../adapters/whisper-model-catalog.cjs');
  const modelId = 'tiny-q5_1';
  const stream = new ReadableStream({ start(controller) {
    controller.enqueue(new Uint8Array(whisperModel(modelId).bytes + 1));
    controller.close();
  } });
  await assert.rejects(installSpeechModel(file, { modelId, fetchModel: async () => new Response(stream) }),
    { code: 'TVLENS_MODEL_DOWNLOAD_FAILED' });
  assert.deepEqual(await fs.readdir(root), []);
});
