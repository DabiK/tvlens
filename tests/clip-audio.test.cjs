const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { ClipInspector, trimWav } = require('../adapters/clip-inspector.cjs');

// 16 kHz mono 16-bit PCM; `extra` is inserted between fmt and data like ffmpeg's LIST chunk.
function wav(seconds, extra = Buffer.alloc(0)) {
  const data = Buffer.alloc(seconds * 32000);
  for (let i = 0; i < data.length; i += 2) data.writeInt16LE((i / 2) % 2000, i);
  const head = Buffer.alloc(36);
  head.write('RIFF', 0, 'ascii'); head.writeUInt32LE(28 + extra.length + 8 + data.length, 4); head.write('WAVEfmt ', 8, 'ascii');
  head.writeUInt32LE(16, 16); head.writeUInt16LE(1, 20); head.writeUInt16LE(1, 22); head.writeUInt32LE(16000, 24); head.writeUInt32LE(32000, 28); head.writeUInt16LE(2, 32); head.writeUInt16LE(16, 34);
  const size = Buffer.alloc(8); size.write('data', 0, 'ascii'); size.writeUInt32LE(data.length, 4);
  return Buffer.concat([head, extra, size, data]);
}
function list() {
  const text = Buffer.from('INFOISFT\x0e\x00\x00\x00Lavf62.12.101\x00', 'latin1');
  const chunk = Buffer.alloc(8); chunk.write('LIST', 0, 'ascii'); chunk.writeUInt32LE(text.length, 4);
  return Buffer.concat([chunk, text]);
}

test('a canonical WAV is trimmed on sample boundaries and a whole interval reproduces its bytes', () => {
  const source = wav(8);
  const middle = trimWav(source, 2, 5);
  assert.equal(middle.length, 44 + 3 * 32000);
  assert.equal(middle.readUInt32LE(40), 3 * 32000);
  assert.equal(middle.readUInt32LE(4), 3 * 32000 + 36);
  assert.deepEqual(middle.subarray(44, 48), source.subarray(44 + 2 * 32000, 48 + 2 * 32000));
  assert.deepEqual(trimWav(source, 0, 8), source);
});

test('audio assembled by ffmpeg keeps its speech when trimmed although a LIST chunk precedes the samples', () => {
  const source = wav(8, list());
  assert.equal(source.toString('ascii', 36, 40), 'LIST');
  const trimmed = trimWav(source, 1, 3);
  assert.ok(trimmed, 'the samples must be found after the LIST chunk');
  assert.equal(trimmed.toString('ascii', 36, 40), 'data');
  assert.equal(trimmed.length, 44 + 2 * 32000);
  assert.equal(trimmed.readUInt32LE(28), 32000);
  assert.deepEqual(trimmed.subarray(44, 52), wav(8).subarray(44 + 32000, 52 + 32000));
});

test('an interval beyond the samples is clamped and malformed audio yields no track', () => {
  assert.equal(trimWav(wav(2), 1, 9).length, 44 + 32000);
  assert.equal(trimWav(null, 0, 1), null);
  assert.equal(trimWav(Buffer.from('not a wav file, definitely not a wav file at all'), 0, 1), null);
  assert.equal(trimWav(wav(1).subarray(0, 40), 0, 1), null);
});

test('inspection hands over the stored bytes of a whole passage and trimmed audio for a sub-interval', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'tvlens-clip-audio-'));
  try {
    // Stands for ffmpeg frame extraction: writes one image where the requested pattern points.
    const decoder = path.join(dir, 'decoder.cjs');
    await fs.writeFile(decoder, "#!/usr/bin/env node\nrequire('node:fs').writeFileSync(process.argv.at(-1).replace('%03d','001'),'jpeg');\n", { mode: 0o755 });
    const stored = wav(8, list()), seen = [];
    const inspector = new ClipInspector({ ffmpeg: decoder,
      media: { file: id => path.join(dir, id + '.webm'), read: async () => ({ frames: [], audio: stored }) },
      strategy: { name: 'test', diverse: false, prepare: async ({ segments }) => ({ segments, metadata: { warnings: [] }, cost: 0 }) },
      model: { inspect: async ({ segments }) => { seen.push(...segments); return { observations: [], hypotheses: [], limits: [], cost: 0 }; } } });
    const passage = { id: 'moment-1', startMs: 8000, endMs: 16000 };
    await inspector.inspect({ question: 'Que dit-il ?', startMs: 8000, endMs: 16000, segments: [passage] });
    await inspector.inspect({ question: 'Que dit-il ?', startMs: 10000, endMs: 13000, segments: [passage] });
    assert.equal(seen[0].audio, stored, 'identical bytes let the transcriber reuse the passage transcription');
    assert.equal(seen[1].audio.length, 44 + 3 * 32000);
    assert.notEqual(seen[1].audio, stored);
    // The excerpt keeps its own samples; its speech is the stored passage, on the passage interval.
    assert.equal(seen[1].speech.audio, stored);
    assert.deepEqual([seen[1].speech.startMs, seen[1].speech.endMs, seen[1].startMs, seen[1].endMs], [8000, 16000, 10000, 13000]);
    // A published transcript replaces the audio as speech source; exactSpeech hands over the excerpt alone.
    const published = { ...passage, audioStatus: 'ready', observation: { transcript: 'Bonsoir.' } };
    await inspector.inspect({ question: 'Que dit-il ?', startMs: 10000, endMs: 13000, segments: [published] });
    await inspector.inspect({ question: 'Que dit-il ?', startMs: 10000, endMs: 13000, segments: [published], exactSpeech: true });
    assert.deepEqual(seen[2].speech, { transcript: 'Bonsoir.', startMs: 8000, endMs: 16000 });
    assert.equal(seen[3].speech, undefined);
    assert.equal(seen[3].audio.length, 44 + 3 * 32000);
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});
