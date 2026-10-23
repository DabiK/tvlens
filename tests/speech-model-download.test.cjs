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
