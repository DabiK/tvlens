const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { spawnSync, execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { createHash } = require('node:crypto');
const sharp = require('sharp');
const { RemoteMedia } = require('../adapters/remote-media.cjs');
const { LocalTranscriber, autoAudioCtx } = require('../adapters/local-transcriber.cjs');
const { loadConfig } = require('../adapters/config.cjs');

// 16-bit PCM behind a canonical 44-byte header; the low default rate keeps long clips to a few kB.
function wav(seconds, { rate = 1000, channels = 1 } = {}) {
 const block = channels * 2, b = Buffer.alloc(44 + Math.round(seconds * rate) * block);
 b.write('RIFF'); b.writeUInt32LE(b.length - 8, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(channels, 22);
 b.writeUInt32LE(rate, 24); b.writeUInt32LE(rate * block, 28); b.writeUInt16LE(block, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(b.length - 44, 40);
 return b;
}
async function script(dir, name, body) {
 const file = path.join(dir, name);
 await fs.writeFile(file, `#!${process.execPath}\n${body}`, { mode: 0o700 });
 return file;
}
// os.tmpdir() follows TMPDIR. A private one makes the leak check exact while other test runs share the machine.
async function privateTmp(t) {
 const previous = process.env.TMPDIR, root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'tvlens-media-asr-')));
 process.env.TMPDIR = root;
 t.after(async () => { if (previous === undefined) delete process.env.TMPDIR; else process.env.TMPDIR = previous; await fs.rm(root, { recursive: true, force: true }); });
 assert.equal(os.tmpdir(), root);
 return async () => (await fs.readdir(os.tmpdir())).filter(name => name.startsWith('tvlens-ingest-'));
}
const solid = background => sharp({ create: { width: 1280, height: 720, channels: 3, background } }).png().toBuffer();

const ffmpegAvailable = spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' }).status === 0;
test('parallel assembly keeps frame order, the exact frame pipeline and normalized audio, and measures itself', { skip: !ffmpegAvailable && 'ffmpeg indisponible' }, async t => {
 const leftovers = await privateTmp(t);
 const images = await Promise.all(['#ff0000', '#00ff00', '#0000ff'].map(solid));
 const input = { sessionId: 'test', sequence: 3, startMs: 100, endMs: 4100, audio: wav(4, { rate: 8000, channels: 2 }).toString('base64'), ingest: { assembleMs: -1 },
  frames: images.map((image, i) => ({ atMs: 100 + i * 1500, data: image.toString('base64'), crop: { x: 0, y: 90, width: 960, height: 540 } })) };
 const result = await new RemoteMedia().assemble(input);
 const expected = [];
 for (const [i, image] of images.entries()) {
  const jpeg = await sharp(image, { limitInputPixels: 1920 * 1080 }).extract({ left: 0, top: 90, width: 960, height: 540 }).resize({ width: 1280, height: 720, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 75 }).toBuffer();
  expected.push({ atMs: 100 + i * 1500, dataUrl: 'data:image/jpeg;base64,' + jpeg.toString('base64') });
 }
 assert.equal(new Set(expected.map(frame => frame.dataUrl)).size, 3);
 assert.deepEqual(result.frames, expected);
 assert.equal(result.audio.toString('ascii', 0, 4), 'RIFF'); assert.equal(result.audio.toString('ascii', 8, 12), 'WAVE');
 assert.equal(result.audio.readUInt16LE(22), 1); assert.equal(result.audio.readUInt32LE(24), 16000);
 // ffmpeg writes a LIST chunk before the samples: the duration still comes out of the header (4 s).
 assert.equal(autoAudioCtx(result.audio), 312);
 assert.equal(result.clip.subarray(0, 4).toString('hex'), '1a45dfa3'); assert.ok(result.clip.length > 100);
 assert.ok(Number.isInteger(result.ingest.assembleMs) && result.ingest.assembleMs >= 0);
 assert.deepEqual(Object.keys(result).sort(), [...Object.keys(input), 'clip'].sort());
 for (const key of ['sessionId', 'sequence', 'startMs', 'endMs']) assert.equal(result[key], input[key]);
 assert.deepEqual(await leftovers(), []);
});
test('a non-WAV sound keeps its message and leaves no temporary directory', async t => {
 const leftovers = await privateTmp(t);
 const data = (await solid('#808080')).toString('base64');
 const input = { sessionId: 'test', sequence: 1, startMs: 0, endMs: 1000, frames: [0, 500].map(atMs => ({ atMs, data })), audio: Buffer.from('not wave').toString('base64') };
 assert.deepEqual(await leftovers(), []);
 await assert.rejects(new RemoteMedia().assemble(input), { message: 'Audio WAV requis.' });
 assert.deepEqual(await leftovers(), []);
});
test('a failed frame waits for the running audio child before cleanup and stays the reported error', async t => {
 const leftovers = await privateTmp(t), log = path.join(os.tmpdir(), 'ffmpeg.log');
 const ffmpeg = await script(os.tmpdir(), 'ffmpeg', `const fs=require('node:fs');setTimeout(()=>{fs.appendFileSync(${JSON.stringify(log)},'settled\\n');process.stderr.write('boom');process.exit(1);},150);`);
 const good = (await solid('#808080')).toString('base64'), bad = Buffer.from('not an image').toString('base64');
 const input = { sessionId: 'test', sequence: 1, startMs: 0, endMs: 1000, frames: [{ atMs: 0, data: good }, { atMs: 500, data: bad }], audio: wav(1).toString('base64') };
 const media = new RemoteMedia({ ffmpeg });
 await assert.rejects(media.assemble(input), /unsupported image format/);
 assert.equal(await fs.readFile(log, 'utf8'), 'settled\n');
 assert.deepEqual(await leftovers(), []);
 await assert.rejects(media.assemble({ ...input, audio: Buffer.from('not wave').toString('base64') }), /unsupported image format/);
 await assert.rejects(media.assemble({ ...input, frames: [input.frames[0]] }), /Préparation média échouée : /);
 assert.deepEqual(await leftovers(), []);
});

test('automatic audio context follows the WAV duration and falls back to the full context on a doubtful header', () => {
 assert.deepEqual([8, 5, 2, 0.5, 20, 27.76, 30, 60].map(seconds => autoAudioCtx(wav(seconds))), [512, 362, 256, 256, 1112, 1500, 1500, 1500]);
 assert.equal(autoAudioCtx(new Uint8Array(wav(8))), 512);
 const eight = wav(8), list = Buffer.from('LIST\x05\x00\x00\x00INFO!\x00', 'latin1');
 assert.equal(autoAudioCtx(Buffer.concat([eight.subarray(0, 36), list, eight.subarray(36)])), 512);
 const truncated = eight.subarray(0, eight.length - 2), noRate = Buffer.from(eight), noData = Buffer.from(eight), empty = wav(0);
 noRate.writeUInt32LE(0, 28); noData.write('junk', 36);
 for (const broken of [Buffer.alloc(0), Buffer.from('fixture'), eight.subarray(0, 30), eight.subarray(0, 44), truncated, noRate, noData, empty, Buffer.concat([eight.subarray(0, 12), eight.subarray(36)])]) assert.equal(autoAudioCtx(broken), 0);
});
const ARGS_AS_TEXT = `const fs=require('node:fs'),path=require('node:path');const a=process.argv.slice(2);process.stderr.write('whisper_print_timings:   encode time =    12.50 ms\\n');fs.writeFileSync(a[a.indexOf('-of')+1]+'.json',JSON.stringify({transcription:[{text:a.map(v=>path.isAbsolute(v)?path.basename(v):v).join(' ')}]}));`;
test('Whisper receives a reduced context only on request; auto derives it from the clip', async t => {
 const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'tvlens-audio-ctx-test-'));
 t.after(() => fs.rm(dir, { recursive: true, force: true }));
 const binary = await script(dir, 'whisper', ARGS_AS_TEXT), base = '-m whisper -f audio.wav -l auto -oj -of speech -t 2';
 for (const audioCtx of [-1, 1, 63, 1501, 1.5, NaN, Infinity, '512', 'AUTO', '', null, true]) assert.throws(() => new LocalTranscriber({ audioCtx }), { message: 'Whisper : contexte audio invalide (0, auto ou 64–1500).' });
 for (const audioCtx of [undefined, 0, 64, 1500, 'auto']) assert.equal(new LocalTranscriber({ audioCtx }).audioCtx, audioCtx ?? 0);
 const full = await new LocalTranscriber({ binary, model: binary, threads: 2 }).transcribe(wav(8));
 assert.equal(full.text, base); assert.equal(full.metrics.audioCtx, 0); assert.equal(full.metrics.encodeMs, 12.5);
 const fixed = await new LocalTranscriber({ binary, model: binary, threads: 2, audioCtx: 512 }).transcribe(wav(2));
 assert.equal(fixed.text, base + ' -ac 512'); assert.equal(fixed.metrics.audioCtx, 512);
 const auto = new LocalTranscriber({ binary, model: binary, threads: 2, audioCtx: 'auto' });
 for (const [seconds, expected] of [[8, 512], [5, 362], [2, 256]]) {
  const result = await auto.transcribe(wav(seconds));
  assert.equal(result.text, `${base} -ac ${expected}`); assert.equal(result.metrics.audioCtx, expected);
 }
 const broken = await auto.transcribe(wav(8).subarray(0, 30));
 assert.equal(broken.text, base); assert.equal(broken.metrics.audioCtx, 0);
 const failed = await new LocalTranscriber({ binary, model: path.join(dir, 'missing.bin'), threads: 2, audioCtx: 512 }).transcribe(wav(2));
 assert.equal(failed.text, ''); assert.equal(failed.metrics.failed, true); assert.equal(failed.metrics.audioCtx, 512);
});
test('a full-context transcript and a reduced-context one never answer for each other', async t => {
 const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'tvlens-audio-ctx-cache-test-'));
 t.after(() => fs.rm(dir, { recursive: true, force: true }));
 const binary = await script(dir, 'whisper', ARGS_AS_TEXT), audio = wav(8), base = '-m whisper -f audio.wav -l fr -oj -of speech -t 2';
 const transcriber = new LocalTranscriber({ binary, model: binary, threads: 2, getLanguage: () => 'fr' });
 const full = await transcriber.transcribe(audio);
 assert.equal(full.cacheHit, false); assert.equal(full.text, base);
 // The default key is unchanged: language then audio bytes.
 assert.deepEqual([...transcriber.cache.keys()], [createHash('sha256').update('fr').update(audio).digest('hex')]);
 transcriber.audioCtx = 512;
 const reduced = await transcriber.transcribe(audio);
 assert.equal(reduced.cacheHit, false); assert.equal(reduced.text, base + ' -ac 512'); assert.equal(transcriber.misses, 2);
 const again = await transcriber.transcribe(audio);
 assert.equal(again.cacheHit, true); assert.equal(again.text, base + ' -ac 512'); assert.equal(again.metrics.audioCtx, 512); assert.equal(again.metrics.encodeMs, undefined);
 transcriber.audioCtx = 768;
 assert.equal((await transcriber.transcribe(audio)).text, base + ' -ac 768');
 transcriber.audioCtx = 0;
 const back = await transcriber.transcribe(audio);
 assert.equal(back.cacheHit, true); assert.equal(back.text, base); assert.equal(back.metrics.audioCtx, 0);
 assert.equal(transcriber.misses, 3); assert.equal(transcriber.hits, 2);
});

test('configuration exposes the latency switches with safe defaults and leaves existing fields alone', async t => {
 const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tvlens-switches-'));
 t.after(() => fs.rm(root, { recursive: true, force: true }));
 const configPath = path.join(root, 'config', 'tvlens.env'), userData = path.join(root, 'data');
 await fs.mkdir(path.dirname(configPath));
 const load = (environment, safeStorage = { isEncryptionAvailable: () => false }) => loadConfig({ configPath, userData, safeStorage, environment: { TVLENS_FFMPEG: '/usr/bin/ffmpeg', TVLENS_WHISPER_BINARY: '/usr/bin/whisper-cli', ...environment } });
 const added = ({ whisperAudioCtx, visionDuringAsk, backgroundIndex, perceptionBackend, localVlm }) => ({ whisperAudioCtx, visionDuringAsk, backgroundIndex, perceptionBackend, localVlm });
 const existing = ({ whisperAudioCtx, visionDuringAsk, backgroundIndex, perceptionBackend, localVlm, ...rest }) => rest;
 const bare = await load({});
 // Vision during a question is on by default since questions may run five minutes (rollback: TVLENS_VISION_DURING_ASK=0).
 assert.deepEqual(added(bare), { whisperAudioCtx: undefined, visionDuringAsk: true, backgroundIndex: true, perceptionBackend: 'codex', localVlm: { url: null, model: null, numCtx: undefined, keepAlive: undefined, token: null } });
 assert.deepEqual(existing(bare), { apiKey: '', model: 'google/gemini-2.5-flash-lite', audioInput: true, codexAuthHome: null, whisperModel: null, whisperThreads: undefined, whisperBinary: '/usr/bin/whisper-cli', ffmpeg: '/usr/bin/ffmpeg',
  inspectionModel: 'google/gemini-3.8-flash', inspectionStrategy: 'native-slow', researchBudgetFile: path.join(root, 'config', '.local', 'research-budget.json'), budgetFile: path.join(root, 'config', '.local', 'trial-budget.json') });
 await fs.writeFile(configPath, ['OPENROUTER_API_KEY=key', 'TVLENS_WHISPER_AUDIO_CTX=auto', 'TVLENS_VISION_DURING_ASK=1', 'TVLENS_BACKGROUND_INDEX=0', 'TVLENS_PERCEPTION_BACKEND=local', 'TVLENS_LOCAL_VLM_URL=http://127.0.0.1:11434',
  'TVLENS_LOCAL_VLM_MODEL=qwen', 'TVLENS_LOCAL_VLM_NUM_CTX=8192', 'TVLENS_LOCAL_VLM_KEEP_ALIVE=30m', 'TVLENS_LOCAL_VLM_TOKEN=secret-token', ''].join('\n'));
 const sealed = [];
 const set = await load({}, { isEncryptionAvailable: () => true, encryptString: text => { sealed.push(text); return Buffer.from(text).map(byte => byte ^ 0x5a); } });
 assert.deepEqual(added(set), { whisperAudioCtx: 'auto', visionDuringAsk: true, backgroundIndex: false, perceptionBackend: 'local', localVlm: { url: 'http://127.0.0.1:11434', model: 'qwen', numCtx: 8192, keepAlive: '30m', token: 'secret-token' } });
 assert.deepEqual(existing(set), { ...existing(bare), apiKey: 'key' });
 // The token only ever reaches disk through the encrypted provider cache.
 assert.equal(sealed.length, 1); assert.deepEqual(await fs.readdir(userData), ['provider.enc']);
 assert.equal((await fs.readFile(path.join(userData, 'provider.enc'))).includes('secret-token'), false);
 const overridden = await load({ TVLENS_WHISPER_AUDIO_CTX: '512', TVLENS_VISION_DURING_ASK: 'true', TVLENS_BACKGROUND_INDEX: 'false', TVLENS_LOCAL_VLM_NUM_CTX: '8k' });
 // Mistyped switches are kept as typed so that the session runtime refuses them instead of running under a default.
 assert.deepEqual(added(overridden), { ...added(set), whisperAudioCtx: 512, visionDuringAsk: 'true', backgroundIndex: 'false', localVlm: { ...set.localVlm, numCtx: NaN } });
 assert.equal((await load({ TVLENS_WHISPER_AUDIO_CTX: '0' })).whisperAudioCtx, 0);
 assert.equal((await load({ TVLENS_LOCAL_VLM_NUM_CTX: '4096.5' })).localVlm.numCtx, 4096.5);
 // An empty variable does not undo the opt-out written in the file; an explicit one does.
 assert.deepEqual([(await load({ TVLENS_BACKGROUND_INDEX: '' })).backgroundIndex, (await load({ TVLENS_BACKGROUND_INDEX: '1' })).backgroundIndex], [false, true]);
 // A mistyped context is not silently ignored: the transcriber refuses it.
 const mistyped = await load({ TVLENS_WHISPER_AUDIO_CTX: 'fast' });
 assert.throws(() => new LocalTranscriber({ audioCtx: mistyped.whisperAudioCtx }), /contexte audio invalide/);
});

test('the Whisper bench alternates runs, passes the context flags and compares each transcript with the full context', async t => {
 const dir = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'tvlens-bench-whisper-test-')));
 t.after(() => fs.rm(dir, { recursive: true, force: true }));
 const calls = path.join(dir, 'calls.log'), clip = path.join(dir, 'clip.wav'), out = path.join(dir, 'report.json'), tmp = path.join(dir, 'tmp');
 await fs.mkdir(tmp); await fs.writeFile(clip, wav(2));
 // Threads 2 reproduces the full transcript at 512; threads 1 only changes case and punctuation; the shortest context loses the last word;
 // context 700 exits cleanly without writing anything.
 const binary = await script(dir, 'whisper', `const fs=require('node:fs');const a=process.argv.slice(2);fs.appendFileSync(${JSON.stringify(calls)},JSON.stringify(a)+'\\n');const ac=a.includes('-ac')?a[a.indexOf('-ac')+1]:'0',t=a[a.indexOf('-t')+1];if(ac==='700')process.exit(0);
process.stderr.write('private words\\nwhisper_print_timings:   encode time =    12.50 ms\\n');
const text=ac==='0'||(ac==='512'&&t==='2')?'Bonsoir à tous, le débat porte sur le budget.':ac==='512'?'bonsoir à tous le débat porte sur le budget':'Bonsoir à tous, le débat porte sur le';
fs.writeFileSync(a[a.indexOf('-of')+1]+'.json',JSON.stringify({transcription:[{text:' '+text}]}));`);
 const bench = args => promisify(execFile)(process.execPath, [path.join(__dirname, '..', 'scripts', 'bench-whisper.cjs'), ...args], { env: { ...process.env, TMPDIR: tmp } });
 const { stdout } = await bench(['--model', binary, '--binary', binary, '--threads', '1,2', '--audio-ctx', '0,512,auto', '--repeats', '2', '--no-gpu', '--out', out, clip]);
 const report = JSON.parse(await fs.readFile(out, 'utf8'));
 const order = [[1, 0], [1, 512], [1, 'auto'], [2, 0], [2, 512], [2, 'auto']];
 assert.deepEqual(report.rows.map(row => [row.repeat, row.threads, row.requested]), [...order.map(item => [0, ...item]), ...order.toReversed().map(item => [1, ...item])]);
 assert.ok(report.rows.every(row => row.code === 0 && row.wallMs > 0 && row.timings.encodeMs === 12.5 && !JSON.stringify(row.timings).includes('private')));
 const argv = (await fs.readFile(calls, 'utf8')).trim().split('\n').map(line => JSON.parse(line));
 assert.equal(argv.length, 12);
 const speech = argv[0][8];
 assert.equal(path.dirname(path.dirname(speech)), tmp); assert.match(path.basename(path.dirname(speech)), /^tvlens-whisper-bench-/);
 assert.deepEqual(argv.slice(0, 3), [[], ['-ac', '512'], ['-ac', '256']].map(context => ['-m', binary, '-f', clip, '-l', 'fr', '-oj', '-of', speech, '-t', '1', ...context, '-ng']));
 const pick = (threads, requested) => report.summary.find(row => row.threads === threads && row.requested === requested);
 assert.equal(report.summary.length, 6);
 assert.equal(pick(1, 0).identical, undefined); assert.equal(pick(1, 0).text, 'Bonsoir à tous, le débat porte sur le budget.'); assert.equal(pick(1, 0).runs, 2); assert.equal(pick(1, 0).failed, 0);
 assert.deepEqual([pick(1, 512).identical, pick(1, 512).differingWords, pick(1, 512).referenceWords], [false, 0, 9]);
 assert.deepEqual([pick(2, 512).identical, pick(2, 512).differingWords], [true, 0]);
 assert.deepEqual([pick(1, 'auto').audioCtx, pick(1, 'auto').identical, pick(1, 'auto').differingWords, pick(1, 'auto').referenceWords, pick(1, 'auto').stable], [256, false, 1, 9, true]);
 assert.ok(pick(2, 'auto').wallMs.median > 0 && pick(2, 'auto').speedup > 0 && pick(2, 'auto').encodeMs === 12.5);
 assert.match(stdout, /^fichier\s+threads\s+ctx/); assert.match(stdout, /clip\.wav\s+1\s+auto→256\s+2\/2/); assert.match(stdout, /clip\.wav\s+2\s+512\s.*oui\s+0\/9/);
 assert.deepEqual(await fs.readdir(tmp), []);
 const noGpuDefault = await bench(['--model', binary, '--binary', binary, '--threads', '2', '--audio-ctx', '0', '--repeats', '1', clip]);
 assert.equal(JSON.parse(noGpuDefault.stdout.slice(noGpuDefault.stdout.indexOf('{'))).noGpu, false);
 assert.deepEqual(JSON.parse((await fs.readFile(calls, 'utf8')).trim().split('\n').at(-1)).slice(9), ['-t', '2']);
 for (const [args, message] of [[['--model', path.join(dir, 'absent.bin'), '--binary', binary, clip], /Modèle Whisper introuvable/], [['--model', binary, '--binary', binary, path.join(dir, 'absent.wav')], /Fichier audio introuvable/],
  [['--model', binary, '--binary', binary, '--audio-ctx', '32', clip], /contexte audio invalide/], [['--binary', binary, clip], /Modèle requis/], [['--model', binary, '--binary', binary], /Aucun fichier audio/],
  [['--model', binary, '--binary', path.join(dir, 'absent-whisper'), clip], /Whisper indisponible/]]) {
  await assert.rejects(bench(args), error => error.code === 1 && message.test(error.stderr));
 }
 assert.equal((await fs.readFile(calls, 'utf8')).trim().split('\n').length, 13);
 // A run without transcript is counted as lost, never filled with the previous run's output.
 await assert.rejects(bench(['--model', binary, '--binary', binary, '--threads', '1', '--audio-ctx', '0,700', '--repeats', '1', '--out', out, clip]),
  error => error.code === 1 && /1 exécution\(s\) Whisper en échec sur 2/.test(error.stderr) && /clip\.wav\s+1\s+700\s+0\/1\s+—/.test(error.stdout));
 const lossy = JSON.parse(await fs.readFile(out, 'utf8'));
 assert.deepEqual(lossy.rows.map(row => row.text), ['Bonsoir à tous, le débat porte sur le budget.', null]);
 assert.deepEqual([lossy.summary[1].failed, lossy.summary[1].text, lossy.summary[1].identical], [1, null, undefined]);
 // On real speech the report must hold numbers only: --no-text keeps the comparison and drops every transcript, in the file and on stdout.
 for (const target of [[], ['--out', out]]) {
  const numeric = await bench(['--model', binary, '--binary', binary, '--threads', '1', '--audio-ctx', '0,auto', '--repeats', '1', '--no-text', ...target, clip]);
  const raw = target.length ? await fs.readFile(out, 'utf8') : numeric.stdout.slice(numeric.stdout.indexOf('{'));
  assert.ok(![numeric.stdout, numeric.stderr, raw].some(text => /bonsoir|budget|débat|"text"/i.test(text)), 'no transcript and no text field anywhere');
  const silent = JSON.parse(raw);
  assert.deepEqual(silent.rows.map(row => row.words), [9, 8]);
  assert.deepEqual([silent.noText, silent.summary[0].words, silent.summary[1].words, silent.summary[1].differingWords, silent.summary[1].referenceWords, silent.summary[1].identical], [true, 9, 8, 1, 9, false]);
 }
 assert.deepEqual(await fs.readdir(tmp), []);
});
