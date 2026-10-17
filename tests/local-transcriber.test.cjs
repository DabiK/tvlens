const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { LocalTranscriber } = require('../adapters/local-transcriber.cjs');

async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tvlens-transcriber-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const binary = path.join(root, 'whisper');
  const model = path.join(root, 'model.bin');
  await fs.writeFile(model, 'model');
  const script = `#!${process.execPath}\nconst fs = require('node:fs'); const args = process.argv.slice(2);
fs.writeFileSync(args[args.indexOf('-of') + 1] + '.json', JSON.stringify({transcription: []}));\n`;
  await fs.writeFile(binary, script, { mode: 0o700 });
  return { root, binary, model, script };
}

test('a missing model is reported before any audio and failed audio carries a public cause until recovery', async t => {
  const f = await fixture(t), changed = [];
  await fs.rm(f.model);
  const transcriber = new LocalTranscriber({ ...f, onAvailability: state => changed.push(state) });
  assert.equal(typeof transcriber.availability, 'function');
  assert.deepEqual(transcriber.availability(), { available: false, code: 'TVLENS_WHISPER_MODEL_MISSING' });
  for (let i = 0; i < 2; i++) {
    const result = await transcriber.transcribe(Buffer.from('audio'));
    assert.equal(result.code, 'TVLENS_WHISPER_MODEL_MISSING');
    assert.equal(result.metrics.failed, true);
  }
  assert.deepEqual(changed, [], 'the same cause is never published repeatedly');
  assert.doesNotMatch(JSON.stringify(transcriber.availability()), new RegExp(f.root));
  await fs.writeFile(f.model, 'model');
  const result = await transcriber.transcribe(Buffer.from('audio'));
  assert.equal(result.text, '');
  assert.notEqual(result.metrics.failed, true);
  assert.deepEqual(transcriber.availability(), { available: true, code: null });
  assert.deepEqual(changed, [{ available: true, code: null }]);
});

test('a missing or nonexecutable binary is distinct from a missing model and can recover', async t => {
  const f = await fixture(t);
  await fs.rm(f.binary);
  const transcriber = new LocalTranscriber(f);
  assert.equal(typeof transcriber.availability, 'function');
  assert.equal(transcriber.availability().code, 'TVLENS_WHISPER_BINARY_MISSING');
  assert.equal((await transcriber.transcribe(Buffer.from('audio'))).code, 'TVLENS_WHISPER_BINARY_MISSING');
  await fs.writeFile(f.binary, f.script, { mode: 0o600 });
  assert.equal(new LocalTranscriber(f).availability().code, 'TVLENS_WHISPER_BINARY_MISSING');
  await fs.chmod(f.binary, 0o700);
  const result = await transcriber.transcribe(Buffer.from('audio'));
  assert.equal(result.text, '');
  assert.deepEqual(transcriber.availability(), { available: true, code: null });
});

test('availability reads use the startup measurement and resolve executable names through PATH', async t => {
  const f = await fixture(t);
  const binary = path.join(f.root, 'whisper-cli');
  await fs.writeFile(binary, f.script.replace('transcription: []', "transcription: [{text: 'Paroles du binaire factice.'}]"), { mode: 0o700 });
  const previousPath = process.env.PATH;
  t.after(() => {
    if (previousPath === undefined) delete process.env.PATH;
    else process.env.PATH = previousPath;
  });
  process.env.PATH = f.root + path.delimiter + (previousPath || '');
  const stat = t.mock.method(require('node:fs'), 'statSync');
  const transcriber = new LocalTranscriber({ model: f.model, binary: 'whisper-cli' });
  assert.deepEqual(transcriber.availability(), { available: true, code: null });
  const checks = stat.mock.callCount();
  transcriber.availability();
  transcriber.availability();
  assert.equal(stat.mock.callCount(), checks, 'polls never probe the filesystem again');
  assert.equal((await transcriber.transcribe(Buffer.from('audio'))).text, 'Paroles du binaire factice.');
});

for (const brokenDiagnostic of [false, true]) {
  test(`a refused availability notification preserves transcription and reaches its diagnostic (diagnostic throws: ${brokenDiagnostic})`, async t => {
    const f = await fixture(t), diagnostics = [], states = [];
    const refused = Object.assign(Error('Notification refusée.'), { code: 'DELIVERY_REFUSED' });
    const transcriber = new LocalTranscriber({
      ...f,
      onAvailability: state => { states.push(state); throw refused; },
      onPublicationError: diagnostic => {
        diagnostics.push(diagnostic);
        if (brokenDiagnostic) throw Error('Journal indisponible.');
      },
    });
    await fs.rm(f.model);
    for (let i = 0; i < 2; i++) {
      const result = await transcriber.transcribe(Buffer.from('audio'));
      assert.equal(result.metrics.failed, true);
      assert.equal(result.code, 'TVLENS_WHISPER_MODEL_MISSING');
    }
    assert.deepEqual(transcriber.availability(), { available: false, code: 'TVLENS_WHISPER_MODEL_MISSING' });
    assert.deepEqual(states, [transcriber.availability()]);
    assert.deepEqual(diagnostics, [{ code: 'TVLENS_STATE_PUBLICATION_FAILED', origin: 'local-transcriber', error: refused }]);
  });
}
