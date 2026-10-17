const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { ClipInspector } = require('../adapters/clip-inspector.cjs');
const { CodexPerception } = require('../adapters/codex-perception.cjs');
const { LocalTranscriber } = require('../adapters/local-transcriber.cjs');
const { CachedInspector } = require('../core/cached-inspector.cjs');
const { VideoTools } = require('../core/video-tools.cjs');
const { consultationFrom } = require('./helpers/memory-consultation.cjs');
const { videoToolDefinitions } = require('../core/video-tool-contracts.cjs');
const { mcpToolDefinitions } = require('../mcp/tool-definitions.cjs');

// 16 kHz mono 16-bit PCM with the LIST chunk ffmpeg writes before the samples.
function wav(seconds) {
  const data = Buffer.alloc(seconds * 32000);
  for (let i = 0; i < data.length; i += 2) data.writeInt16LE((i / 2) % 2000, i);
  const head = Buffer.alloc(36), text = Buffer.from('INFOISFT\x0e\x00\x00\x00Lavf62.12.101\x00', 'latin1'), list = Buffer.alloc(8), size = Buffer.alloc(8);
  list.write('LIST', 0, 'ascii'); list.writeUInt32LE(text.length, 4); size.write('data', 0, 'ascii'); size.writeUInt32LE(data.length, 4);
  head.write('RIFF', 0, 'ascii'); head.writeUInt32LE(28 + 8 + text.length + 8 + data.length, 4); head.write('WAVEfmt ', 8, 'ascii');
  head.writeUInt32LE(16, 16); head.writeUInt16LE(1, 20); head.writeUInt16LE(1, 22); head.writeUInt32LE(16000, 24); head.writeUInt32LE(32000, 28); head.writeUInt16LE(2, 32); head.writeUInt16LE(16, 34);
  return Buffer.concat([head, list, text, size, data]);
}

// The real inspection chain around two stand-ins: a Whisper that logs every process it is started as, and the model.
// One transcriber serves the background lane and the re-inspection, as in runtime/session-runtime.cjs.
// `passage` is the state of the one passage (8–16 s) when the question re-inspects 10–15 s of it.
async function bench(t, { passage = { audioStatus: 'ready', observation: { summary: 'Résumé.', transcript: 'paroles publiées' } }, observe, audio = wav(8) } = {}) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'tvlens-reuse-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const log = path.join(dir, 'launches.log'), mode = path.join(dir, 'mode'), model = path.join(dir, 'model.bin');
  const whisper = path.join(dir, 'whisper.cjs'), decoder = path.join(dir, 'decoder.cjs');
  await fs.writeFile(model, 'm');
  // Same flags as whisper-cli. `mode` holds "fail" (exit 1) or a delay in milliseconds.
  await fs.writeFile(whisper, `#!${process.execPath}
const fs = require('node:fs'), a = process.argv.slice(2), arg = n => a[a.indexOf(n) + 1], bytes = fs.readFileSync(arg('-f'));
const seconds = (bytes.length - bytes.indexOf('data') - 8) / 32000, mode = fs.existsSync(${JSON.stringify(mode)}) ? fs.readFileSync(${JSON.stringify(mode)}, 'utf8') : '';
fs.appendFileSync(${JSON.stringify(log)}, seconds + '\\n');
if (mode === 'fail') process.exit(1);
setTimeout(() => fs.writeFileSync(arg('-of') + '.json', JSON.stringify({ transcription: [{ text: ' paroles de ' + seconds + ' s ' }] })), Number(mode) || 0);
`, { mode: 0o755 });
  // Stands for ffmpeg frame extraction: one image where the requested pattern points.
  await fs.writeFile(decoder, "#!/usr/bin/env node\nrequire('node:fs').writeFileSync(process.argv.at(-1).replace('%03d','001'),'jpeg');\n", { mode: 0o755 });
  const stored = audio, prompts = [];
  const transcriber = new LocalTranscriber({ binary: whisper, model, threads: 2, getLanguage: () => 'fr' });
  const agent = { prepare: async () => {}, reset: async () => {}, close: async () => {},
    answer: async ({ instructions, outputSchema }) => {
      const described = JSON.parse(/ces passages : (\[.*\])\. Sépare/s.exec(instructions)[1]);
      prompts.push({ described, outputSchema });
      return { observations: observe ? observe(described) : described.map(p => ({ id: p.id, startMs: p.startMs, endMs: p.endMs, text: 'Geste visible.', basis: 'images' })), hypotheses: [], limits: [] };
    } };
  const lane = new CodexPerception({ agent, transcriber, sessionId: 'observe' });
  const inspector = new CachedInspector(new ClipInspector({ ffmpeg: decoder, model: new CodexPerception({ agent, transcriber, sessionId: 'inspect' }),
    media: { file: id => path.join(dir, id + '.webm'), read: async () => ({ frames: [], audio: stored }) },
    strategy: { name: 'test', diverse: false, prepare: async ({ segments }) => ({ segments, metadata: { warnings: [] }, cost: 0 }) } }));
  const tools = new VideoTools({ inspector, media: { lease: async () => async () => {} },
    consultation: consultationFrom({ id: 'session', elapsedMs: 20000, history: [],
      segments: [{ id: 'moment-1', startMs: 8000, endMs: 16000, status: 'ready', available: true, ...passage }] }) });
  return { tools, transcriber, prompts, inspector, setMode: value => fs.writeFile(mode, String(value)),
    // Seconds of sound given to each Whisper process started so far.
    launches: async () => (await fs.readFile(log, 'utf8').catch(() => '')).split('\n').filter(Boolean).map(Number),
    // What the background lane does for the passage: transcribe its stored bytes.
    background: () => lane.transcribe({ audio: stored }) };
}
const question = 'Que fait-il ?', excerpt = { startMs: 10000, endMs: 15000, question };
const pending = { status: 'analyzing', audioStatus: 'analyzing', observation: null };

test('a re-inspected excerpt reuses the published passage transcript: no Whisper, two distinct intervals', async t => {
  const f = await bench(t);
  await f.background();
  const result = await f.tools.call('inspect_clip', excerpt);
  assert.deepEqual(await f.launches(), [8], 'only the background lane ever started Whisper');
  assert.deepEqual([f.transcriber.hits, f.transcriber.misses], [0, 1], 'the re-inspection does not even ask the transcriber');
  // The model is told both intervals: images for the excerpt, speech for the whole passage.
  const [described] = f.prompts.at(-1).described;
  assert.deepEqual([described.startMs, described.endMs, described.transcript], [10000, 15000, 'paroles publiées']);
  assert.deepEqual(described.speech, { startMs: 8000, endMs: 16000 });
  // So is the chat agent, per passage, next to the unchanged requested interval.
  assert.deepEqual(result.inspected, { startMs: 10000, endMs: 15000 });
  assert.deepEqual(result.intervals, [{ id: 'moment-1', images: { startMs: 10000, endMs: 15000 }, speech: { startMs: 8000, endMs: 16000, precision: 'segment' } }]);
  assert.ok(result.limits.some(limit => /passage entier/.test(limit) && limit.includes('8,0–16,0 s')), 'the wider speech interval is stated as a limit');
  assert.deepEqual(result.observations.map(o => [o.startMs, o.endMs]), [[10000, 15000]]);
  assert.deepEqual(f.tools.toolMetrics.at(-1).speech, { passages: 1, reused: 1, cached: 0, failed: 0 });
});

test('a whole passage has one interval and no speech limit', async t => {
  const f = await bench(t);
  const result = await f.tools.call('inspect_clip', { startMs: 8000, endMs: 16000, question });
  assert.deepEqual(await f.launches(), []);
  assert.deepEqual(result.intervals, [{ id: 'moment-1', images: { startMs: 8000, endMs: 16000 }, speech: { startMs: 8000, endMs: 16000, precision: 'segment' } }]);
  assert.ok(!result.limits.some(limit => /passage entier/.test(limit)));
  assert.deepEqual(f.tools.transcriptEvidence, []);
});

test('a passage without an audio track announces no speech and accepts no observation resting on speech', async t => {
  const f = await bench(t, { audio: null, passage: { hasAudio: false, audioStatus: 'ready', observation: { summary: 'Images seules.', transcript: '' } },
    observe: ([p]) => [{ id: p.id, startMs: 11000, endMs: 12000, text: 'Personne ne parle.', basis: 'speech' }, { id: p.id, startMs: 11000, endMs: 12000, text: 'Il lève la main.', basis: 'images' }] });
  const result = await f.tools.call('inspect_clip', excerpt);
  assert.deepEqual(await f.launches(), []);
  assert.equal(f.prompts.at(-1).described[0].speech, undefined);
  assert.deepEqual(result.intervals, [{ id: 'moment-1', images: { startMs: 10000, endMs: 15000 } }]);
  assert.deepEqual(result.observations.map(o => o.text), ['Il lève la main.']);
  assert.ok(!result.limits.some(limit => /Paroles/.test(limit)));
});

test('an observation resting on speech carries the whole speech interval, never a narrower one', async t => {
  const f = await bench(t, { observe: ([p]) => [
    { id: p.id, startMs: 11000, endMs: 12000, text: 'Il lève la main.', basis: 'images' },
    { id: p.id, startMs: 11000, endMs: 12000, text: 'Il annonce un vote.', basis: 'speech' }] });
  const result = await f.tools.call('inspect_clip', excerpt);
  assert.deepEqual(result.observations.map(o => [o.basis, o.startMs, o.endMs]), [['images', 11000, 12000], ['speech', 8000, 16000]]);
  assert.deepEqual(f.prompts.at(-1).outputSchema.properties.observations.items.properties.basis.enum, ['images', 'speech']);
  // That observation is the evidence for a citation of the speech interval; nothing else is registered.
  assert.deepEqual(f.tools.observations.map(o => [o.startMs, o.endMs]), [[11000, 12000], [8000, 16000]]);
  assert.deepEqual(f.tools.transcriptEvidence, []);
});

test('speech is bounded by its own passage and by the anchor, and never narrowed by an observation', async () => {
  const ready = { status: 'ready', audioStatus: 'ready', available: true };
  const tools = answer => { const handed = []; return { handed, tools: new VideoTools({ media: { lease: async () => async () => {} },
    consultation: consultationFrom({ id: 's', elapsedMs: 2500, history: [], segments: [
      { id: 'm2', startMs: 1000, endMs: 2000, ...ready, observation: { summary: 'B', transcript: 'b' } },
      { id: 'm3', startMs: 2000, endMs: 3000, ...ready, observation: { summary: 'C', transcript: 'c' } }] }),
    inspector: { inspect: async ({ segments }) => { handed.push(...segments.map(s => [s.id, s.observation.transcript])); return answer; } } }) }; };
  // The request reaches into m3, which ends after the anchor: m3 is never handed over, and speech claimed past m2 is dropped.
  const beyond = tools({ speech: [{ id: 'm2', startMs: 1000, endMs: 3000 }, { id: 'm3', startMs: 2000, endMs: 3000 }],
    observations: [{ id: 'm2', startMs: 1000, endMs: 3000, text: 'Parole future.', basis: 'speech' }, { id: 'm2', startMs: 1200, endMs: 1800, text: 'Image.', basis: 'images' }] });
  const result = await beyond.tools.call('inspect_clip', { startMs: 1200, endMs: 2400, question });
  assert.deepEqual(beyond.handed, [['m2', 'b']]);
  assert.deepEqual(result.intervals, [{ id: 'm2', images: { startMs: 1200, endMs: 2000 } }]);
  assert.deepEqual(result.observations.map(o => o.text), ['Image.']);
  // With valid passage-level speech, an observation resting on it must carry that whole interval.
  const narrow = tools({ speech: [{ id: 'm2', startMs: 1000, endMs: 2000 }],
    observations: [{ id: 'm2', startMs: 1300, endMs: 1400, text: 'Parole située.', basis: 'speech' }, { id: 'm2', startMs: 1000, endMs: 2000, text: 'Parole du passage.', basis: 'speech' }] });
  assert.deepEqual((await narrow.tools.call('inspect_clip', { startMs: 1200, endMs: 1800, question })).observations.map(o => o.text), ['Parole du passage.']);
});

test('without a published transcript, one Whisper run on the stored passage serves the re-inspection and the lane', async t => {
  // The lane is still transcribing the passage: the re-inspection shares that process.
  const f = await bench(t, { passage: pending });
  await f.setMode(150);
  const [, joined] = await Promise.all([f.background(), f.tools.call('inspect_clip', excerpt)]);
  assert.deepEqual(await f.launches(), [8]);
  assert.equal(joined.intervals[0].speech.precision, 'segment');
  // Nothing transcribed yet: the stored passage is transcribed, not the 5 s slice, and the lane then finds it.
  const g = await bench(t, { passage: pending });
  await g.tools.call('inspect_clip', excerpt);
  assert.deepEqual(await g.launches(), [8]);
  assert.equal(g.prompts.at(-1).described[0].transcript, 'paroles de 8 s');
  assert.equal((await g.background()).metrics.audioCacheHit, true);
  assert.deepEqual(await g.launches(), [8]);
  assert.deepEqual(g.tools.toolMetrics.at(-1).speech, { passages: 1, reused: 0, cached: 0, failed: 0 });
});

test('a failed or shed transcription is not a transcript: it is retried and never taken for silence', async t => {
  // The transcriber reported its own failure: the lane keeps audioStatus "ready" with an empty transcript.
  const f = await bench(t, { passage: { audioStatus: 'ready', audioFailed: true, observation: { transcript: '' } } });
  await f.setMode('fail');
  const failed = await f.tools.call('inspect_clip', excerpt);
  assert.deepEqual(await f.launches(), [8]);
  assert.equal(f.prompts.at(-1).described[0].speech, undefined, 'the model is told of no speech interval');
  assert.deepEqual(failed.intervals, [{ id: 'moment-1', images: { startMs: 10000, endMs: 15000 } }], 'no speech interval without a transcription');
  assert.ok(failed.limits.some(limit => /Paroles indisponibles/.test(limit)));
  assert.deepEqual(f.tools.toolMetrics.at(-1).speech, { passages: 1, reused: 0, cached: 0, failed: 1 });
  await f.setMode(0);
  const retried = await f.tools.call('inspect_clip', { ...excerpt, question: 'Et maintenant ?' });
  assert.deepEqual(await f.launches(), [8, 8]);
  assert.equal(f.prompts.at(-1).described[0].transcript, 'paroles de 8 s');
  assert.equal(retried.intervals[0].speech.precision, 'segment');
  // A transcription shed under load leaves no transcript either.
  const g = await bench(t, { passage: { status: 'partial', audioStatus: 'skipped', observation: { summary: 'Images seules.' } } });
  await g.tools.call('inspect_clip', excerpt);
  assert.deepEqual(await g.launches(), [8]);
});

test('exactSpeech transcribes the excerpt itself and is a distinct inspection', async t => {
  const f = await bench(t);
  await assert.rejects(f.tools.call('inspect_clip', { ...excerpt, exactSpeech: 'oui' }), /exactSpeech/);
  await f.tools.call('inspect_clip', excerpt);
  const exact = await f.tools.call('inspect_clip', { ...excerpt, exactSpeech: true });
  assert.deepEqual(await f.launches(), [5]);
  assert.equal(f.inspector.hits, 0, 'not served from the passage-level result');
  assert.deepEqual(f.prompts.at(-1).described[0].speech, { startMs: 10000, endMs: 15000 });
  assert.deepEqual(exact.intervals, [{ id: 'moment-1', images: { startMs: 10000, endMs: 15000 }, speech: { startMs: 10000, endMs: 15000, precision: 'excerpt' } }]);
  assert.ok(!exact.limits.some(limit => /passage entier/.test(limit)));
  // Under one second Whisper invents words: such a sliver keeps the passage-level speech.
  const g = await bench(t);
  const sliver = await g.tools.call('inspect_clip', { startMs: 15400, endMs: 16000, question, exactSpeech: true });
  assert.deepEqual(await g.launches(), []);
  assert.equal(sliver.intervals[0].speech.precision, 'segment');
  // The option is declared to both transports and stays optional.
  const declared = videoToolDefinitions.find(tool => tool.name === 'inspect_clip').inputSchema;
  assert.deepEqual(declared.properties.exactSpeech, { type: 'boolean' });
  assert.deepEqual(declared.required, ['startMs', 'endMs', 'question']);
  assert.equal(mcpToolDefinitions.find(tool => tool.name === 'inspect_clip').inputSchema.exactSpeech.isOptional(), true);
});
