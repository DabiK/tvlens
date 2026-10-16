const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { until, bounded } = require('./helpers/wait.cjs');
const { heldWhisper } = require('./helpers/held-whisper.cjs');
const { LocalTranscriber } = require('../adapters/local-transcriber.cjs');

// Stands for whisper-cli: logs each start, waits, then writes the transcript where -of points.
async function fixture(t, delayMs = 250) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'tvlens-shared-asr-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const log = path.join(dir, 'starts.log'), model = path.join(dir, 'model.bin'), binary = path.join(dir, 'whisper.cjs');
  await fs.writeFile(model, 'm');
  await fs.writeFile(binary, `#!${process.execPath}
const fs = require('node:fs'), args = process.argv.slice(2), out = args[args.indexOf('-of') + 1];
fs.appendFileSync(${JSON.stringify(log)}, 'start\\n');
setTimeout(() => { fs.writeFileSync(out + '.json', JSON.stringify({ transcription: [{ text: ' Bonjour ' }] })); fs.appendFileSync(${JSON.stringify(log)}, 'end\\n'); }, ${delayMs});
`, { mode: 0o700 });
  const events = async () => (await fs.readFile(log, 'utf8').catch(() => '')).trim().split('\n').filter(Boolean);
  return { transcriber: new LocalTranscriber({ binary, model, threads: 1, getLanguage: () => 'fr' }), events };
}
const audio = Buffer.from('same eight seconds of sound');

test('the background lane and a re-inspection asking for the same audio share one Whisper run', async t => {
  const f = await fixture(t);
  const [first, second] = await Promise.all([f.transcriber.transcribe(audio), f.transcriber.transcribe(audio)]);
  assert.deepEqual([first.text, second.text], ['Bonjour', 'Bonjour']);
  assert.deepEqual(await f.events(), ['start', 'end'], 'one process, not two competing for the same CPU');
  assert.equal(f.transcriber.misses, 1);
  assert.equal((await f.transcriber.transcribe(audio)).cacheHit, true);
  assert.equal(f.transcriber.running.size, 0);
});

test('a caller giving up does not take the shared run away from the other one', async t => {
  const f = await fixture(t);
  const leaving = new AbortController();
  const gone = f.transcriber.transcribe(audio, leaving.signal), staying = f.transcriber.transcribe(audio);
  await until(async () => (await f.events()).includes('start'), 'Whisper process started');
  leaving.abort(new Error('Question annulée.'));
  await assert.rejects(gone, /Question annulée/);
  assert.equal((await staying).text, 'Bonjour');
  assert.deepEqual(await f.events(), ['start', 'end']);
});

test('a run abandoned by every caller is killed, and a later request starts its own', async t => {
  const f = await heldWhisper(t);
  const a = new AbortController(), b = new AbortController();
  const first = f.transcriber.transcribe(audio, a.signal), second = f.transcriber.transcribe(audio, b.signal);
  const abandonedPid = await f.started(1);
  a.abort(new Error('A'));
  b.abort(new Error('B'));
  await assert.rejects(bounded(first), /A/);
  await assert.rejects(bounded(second), /B/);
  const fresh = f.transcriber.transcribe(audio);
  const freshPid = await f.started(2);
  assert.notEqual(freshPid, abandonedPid);
  await f.exited(abandonedPid);
  assert.deepEqual((await f.records()).map(row => row.event), ['start', 'start'], 'the new child is still held');
  await f.release(freshPid);
  const result = await bounded(fresh);
  assert.equal(result.text, 'Bonjour');
  assert.equal(result.cacheHit, false);
  await f.exited(freshPid);
  assert.deepEqual((await f.records()).map(row => row.event), ['start', 'start', 'end'],
    'the abandoned process never finished; the new request ran its own');
});
