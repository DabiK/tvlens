const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { createHash } = require('node:crypto');
const { promisify } = require('node:util');
const { execFile } = require('node:child_process');
const { convertVideo } = require('../adapters/media/video-file-source.cjs');
const { validateRemote } = require('../adapters/remote-media.cjs');
const { runReplay } = require('../scripts/replay-local-perception.cjs');
const execute = promisify(execFile);
const cli = path.resolve(__dirname, '../scripts/prepare-video-replay.cjs');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');

async function fixture(t, settings = {}) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tvlens-video-source-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const jpeg = await require('sharp')({ create: { width: 64, height: 36, channels: 3, background: '#369' } }).jpeg().toBuffer();
  const wav = Buffer.alloc(364);
  wav.write('RIFF');
  wav.writeUInt32LE(wav.length - 8, 4);
  wav.write('WAVEfmt ', 8);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(16000, 24);
  wav.writeUInt32LE(32000, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write('data', 36);
  wav.writeUInt32LE(wav.length - 44, 40);
  const file = path.join(root, 'source video.json');
  await fs.writeFile(file, JSON.stringify({ durationMs: 23500, audio: true, ...settings }));
  await fs.writeFile(path.join(root, 'frame.jpg'), jpeg);
  await fs.writeFile(path.join(root, 'audio.wav'), wav);
  const binary = path.join(root, 'ffmpeg-double');
  await fs.writeFile(binary, `#!${process.execPath}
const fs = require('node:fs'), path = require('node:path');
const args = process.argv.slice(2), root = __dirname;
fs.appendFileSync(path.join(root, 'calls.jsonl'), JSON.stringify(args) + '\\n');
const input = args[args.indexOf('-i') + 1];
const s = input.endsWith('.json') ? JSON.parse(fs.readFileSync(input)) : {};
if (s.decodeFailure) process.exit(1);
if (args.includes('-f') && args[args.indexOf('-f') + 1] === 'null') {
  const sec = s.durationMs / 1000;
  const time = s.unknownDuration ? 'N/A' : new Date(sec * 1000).toISOString().slice(11, 23);
  process.stderr.write('ffmpeg version fixture-1\\nInput #0, fixture, from source:\\n  Duration: ' + time + ', start: 0.000000\\n'
    + '  Stream #0:0: Video: fixture\\n' + (s.audio ? '  Stream #0:1: Audio: fixture\\n' : '') + 'Output #0, null\\n');
} else {
  const target = args.at(-1);
  if (s.outputDir) {
    const blocks = path.join(s.outputDir, 'blocks');
    const publishedBlocks = fs.readdirSync(blocks).filter(name => fs.statSync(path.join(blocks, name)).isDirectory()).length;
    fs.appendFileSync(path.join(root, 'delivery-observations.jsonl'), JSON.stringify({ args, publishedBlocks }) + '\\n');
  }
  const kind = target.endsWith('.jpg') ? 'image' : 'audio';
  if (s.missingOutput === kind) return;
  const atMs = Number(args[args.indexOf('-ss') + 1]) * 1000;
  if (atMs >= s.failAtMs || (s.audioFailure && target.endsWith('.wav'))) process.exit(1);
  if (atMs >= s.holdAtMs) {
    fs.writeFileSync(target, 'truncated');
    const req = require('node:http').request(s.holdUrl, { method: 'POST' });
    req.end(JSON.stringify({ pid: process.pid, target }));
    setInterval(() => {}, 60000);
    return;
  }
  if (target.endsWith('.jpg')) {
    const position = Math.floor(atMs);
    const background = { r: Math.floor(position / 65536) % 256, g: Math.floor(position / 256) % 256, b: position % 256 };
    const image = require(${JSON.stringify(require.resolve('sharp'))})({ create: {
      width: s.width || 64, height: s.height || 36, channels: 3, background } });
    const encoded = s.nonJpeg ? image.png() : image.jpeg({ quality: 100, chromaSubsampling: '4:4:4' });
    encoded.toBuffer().then(bytes => {
        fs.writeFileSync(target, bytes);
        if (s.oversize === 'image') fs.appendFileSync(target, Buffer.alloc(1500001));
        if (s.invalidImage) fs.writeFileSync(target, 'undecodable image');
        if (s.unreadableOutput === 'image') fs.chmodSync(target, 0);
      });
  }
  else if (target.endsWith('.wav')) {
    fs.copyFileSync(path.join(root, 'audio.wav'), target);
    if (s.oversize === 'audio') fs.appendFileSync(target, Buffer.alloc(2100001));
    if (s.invalidWav) fs.writeFileSync(target, 'invalid audio');
    if (s.unreadableOutput === 'audio') fs.chmodSync(target, 0);
    if (s.emptyWav) {
      const bytes = fs.readFileSync(target).subarray(0, 44);
      bytes.writeUInt32LE(36, 4);
      bytes.writeUInt32LE(0, 40);
      fs.writeFileSync(target, Buffer.concat([bytes, Buffer.from('LISTpadding')]));
    }
  }
  else fs.writeFileSync(target, 'fixture clip');
}
`, { mode: 0o700 });
  return { root, file, binary, jpeg, wav,
    options: { file, outputDir: path.join(root, 'prepared'), startMs: 0, blockMs: 10000, framesPerBlock: 2, jpegQuality: 3 },
    dependencies: { config: { ffmpeg: binary } } };
}
const readJson = async file => JSON.parse(await fs.readFile(file, 'utf8'));

test('conversion preserves the source and publishes contiguous validated blocks with a partial ending', async t => {
  const f = await fixture(t);
  f.options.startMs = 1000;
  const before = await fs.readFile(f.file);
  const result = await convertVideo(f.options, f.dependencies);
  assert.equal(result.complete, true);
  const index = await readJson(path.join(f.options.outputDir, 'blocks.json'));
  assert.equal(index.blocks.length, 3);
  const bodies = [];
  for (const entry of index.blocks) {
    const raw = await fs.readFile(path.join(f.options.outputDir, entry.body.path));
    assert.equal(hash(raw), entry.body.sha256);
    const body = JSON.parse(raw);
    validateRemote(body);
    assert.equal(body.frames.length, 2);
    for (const frame of body.frames) {
      assert.ok(frame.atMs >= body.startMs && frame.atMs < body.endMs);
      assert.ok(Buffer.from(frame.data, 'base64').length <= 1500000);
      const metadata = await require('sharp')(Buffer.from(frame.data, 'base64')).metadata();
      assert.ok(metadata.width <= 1280 && metadata.height <= 720);
    }
    const audio = Buffer.from(body.audio, 'base64');
    assert.ok(audio.length <= 2100000);
    assert.equal(audio.toString('ascii', 0, 4), 'RIFF');
    assert.equal(audio.toString('ascii', 8, 12), 'WAVE');
    bodies.push(body);
  }
  assert.deepEqual(bodies.map(b => [b.sequence, b.startMs, b.endMs]), [[0, 0, 10000], [1, 10000, 20000], [2, 20000, 22500]]);
  const calls = (await fs.readFile(path.join(f.root, 'calls.jsonl'), 'utf8')).trim().split('\n').map(JSON.parse);
  const imageCalls = calls.filter(args => args.at(-1).endsWith('.jpg'));
  assert.equal(imageCalls.length, 6);
  for (const args of imageCalls) {
    assert.ok(args.includes("scale=w='min(1280,iw)':h='min(720,ih)':force_original_aspect_ratio=decrease"));
    assert.equal(args[args.indexOf('-frames:v') + 1], '1');
  }
  const positions = bodies.flatMap(body => body.frames.map(frame => (f.options.startMs + frame.atMs) / 1000));
  assert.deepEqual(imageCalls.map(args => Number(args[args.indexOf('-ss') + 1])), positions);
  const audioCalls = calls.filter(args => args.at(-1).endsWith('.wav'));
  assert.deepEqual(audioCalls.map(args => [Number(args[args.indexOf('-ss') + 1]), Number(args[args.indexOf('-t') + 1])]),
    bodies.map(body => [(f.options.startMs + body.startMs) / 1000, (body.endMs - body.startMs) / 1000]));
  assert.deepEqual(await fs.readFile(f.file), before);
});

test('CLI help performs no work and conversion validates its two distinct output contracts without ffmpeg on validation', async t => {
  const { main } = require('../scripts/prepare-video-replay.cjs');
  let stdout = '';
  const status = await main(['--help'], { stdout: { write: text => { stdout += text; } },
    stderr: { write: () => assert.fail('help must succeed') } });
  assert.equal(status, 0);
  assert.match(stdout, /manifest.json/);
  assert.match(stdout, /blocks.json/);
  const f = await fixture(t);
  const result = await execute(process.execPath, [cli, '--file', f.file, '--out', f.options.outputDir,
    '--start-ms', '0', '--block-ms', '10000', '--frames', '2', '--jpeg-quality', '3'],
  { env: { ...process.env, TVLENS_FFMPEG: f.binary } });
  assert.match(result.stdout, /complète/);
  const calls = await fs.readFile(path.join(f.root, 'calls.jsonl'));
  await execute(process.execPath, [cli, '--validate', '--out', f.options.outputDir],
    { env: { ...process.env, TVLENS_FFMPEG: '/missing' } });
  assert.deepEqual(await fs.readFile(path.join(f.root, 'calls.jsonl')), calls);
  const index = await readJson(path.join(f.options.outputDir, 'blocks.json'));
  await fs.appendFile(path.join(f.options.outputDir, index.blocks[0].body.path), ' ');
  const invalid = await execute(process.execPath, [cli, '--validate', '--out', f.options.outputDir]).catch(error => error);
  assert.equal(invalid.code, 1);
  assert.match(invalid.stderr, /TVLENS_VIDEO_HASH_MISMATCH/);
});

test('a later decoder failure keeps the first acquired block and an incomplete manifest cannot run a campaign', async t => {
  const f = await fixture(t, { failAtMs: 10000 });
  await assert.rejects(convertVideo(f.options, f.dependencies), { code: 'FFMPEG_DECODE' });
  const state = await readJson(path.join(f.options.outputDir, 'preparation.json'));
  const manifestPath = path.join(f.options.outputDir, 'manifest.json');
  assert.equal(state.complete, false);
  assert.equal(state.convertedDurationMs, 10000);
  assert.equal(state.error.code, 'FFMPEG_DECODE');
  const index = await readJson(path.join(f.options.outputDir, 'blocks.json'));
  assert.equal(index.blocks.length, 1);
  assert.equal(hash(await fs.readFile(path.join(f.options.outputDir, index.blocks[0].body.path))), index.blocks[0].body.sha256);
  assert.deepEqual((await fs.readdir(f.options.outputDir)).filter(name => name.startsWith('.work-')), []);
  const report = await runReplay({ manifestPath, outputDir: path.join(f.root, 'invalid-campaign'), backend: 'local' })
    .catch(error => ({ code: error.code }));
  assert.equal(report.code, 'TVLENS_REPLAY_PREPARATION_INCOMPLETE');
  const validation = await execute(process.execPath, [cli, '--validate', '--out', f.options.outputDir]).catch(error => error);
  assert.equal(validation.code, 1);
  assert.match(validation.stderr, /TVLENS_VIDEO_PREPARATION_INCOMPLETE/);
});

test('generated media traverses real perception with doubled Ollama and preserves image order and empty input limits', async t => {
  const f = await fixture(t);
  f.options.startMs = 1000;
  await convertVideo(f.options, f.dependencies);
  const requests = [];
  const server = require('node:http').createServer((req, res) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk)).on('end', () => {
      requests.push(JSON.parse(Buffer.concat(chunks)));
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ message: { content: JSON.stringify({ topic: 'Plateau', summary: 'Deux personnes.',
        visual: 'Deux intervenants.', uncertainty: '', continuity: 'continue', topicSummary: 'Une discussion.' }) } }));
    });
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
  const manifestPath = path.join(f.options.outputDir, 'manifest.json');
  const manifest = await readJson(manifestPath);
  const index = await readJson(path.join(f.options.outputDir, 'blocks.json'));
  const validation = await runReplay({ manifestPath, outputDir: path.join(f.root, 'validation'), backend: 'local' });
  assert.equal(validation.complete, true);
  assert.ok(validation.cases.every(item => item.status === 'validated'));
  const report = await runReplay({ manifestPath, outputDir: path.join(f.root, 'execution'), backend: 'local', execute: true,
    url: 'http://127.0.0.1:' + server.address().port, model: 'fixture-no-provider' });
  assert.equal(report.complete, true);
  assert.equal(requests.length, manifest.cases.length);
  assert.equal(report.annotationsSha256, null);
  assert.equal(report.g2Eligible, false);
  for (const [i, item] of report.cases.entries()) {
    assert.equal(item.status, 'succeeded');
    assert.equal(item.input.provenance.kind, 'converted-video');
    assert.equal(item.input.provenance.sourceSha256, hash(await fs.readFile(f.file)));
    assert.deepEqual(item.input.provenance.sourceInterval,
      { startMs: item.input.startMs + 1000, endMs: item.input.endMs + 1000 });
    assert.equal(item.input.provenance.conversion.version, 'fixture-1');
    assert.equal(item.input.transcript.text, '');
    assert.ok(item.input.transcript.limits);
    assert.equal(item.input.context.value, null);
    assert.ok(item.input.context.limits);
    assert.deepEqual(item.input.lightweight, { value: false, source: 'explicit-default' });
    const media = await readJson(path.join(f.options.outputDir, manifest.cases[i].media.path));
    const body = await readJson(path.join(f.options.outputDir, index.blocks[i].body.path));
    const images = body.frames.map(frame => frame.data);
    assert.equal(new Set(images).size, images.length, 'different seek positions must produce distinguishable images');
    assert.deepEqual(media.frames.map(frame => frame.dataUrl), images.map(data => 'data:image/jpeg;base64,' + data));
    assert.deepEqual(media.frames.map(frame => frame.atMs), body.frames.map(frame => frame.atMs));
    assert.deepEqual(requests[i].messages[0].images, images);
    assert.deepEqual(item.request.frames.map(frame => frame.atMs), media.frames.map(frame => frame.atMs));
    assert.equal(item.result.observation.transcript, '');
  }
});

test('a generated template is refused until bound to a test session and then crosses HTTP ingestion and real RemoteMedia', async t => {
  const { HeadlessRuntime } = require('../runtime/headless-runtime.cjs');
  const { RemoteServer } = require('../server/http.cjs');
  const { RemoteMedia } = require('../adapters/remote-media.cjs');
  const f = await fixture(t);
  await convertVideo(f.options, f.dependencies);
  const index = await readJson(path.join(f.options.outputDir, 'blocks.json'));
  const template = await readJson(path.join(f.options.outputDir, index.blocks[0].body.path));
  let clock = 0;
  const runtime = new HeadlessRuntime({ userData: path.join(f.root, 'runtime'), sessionsRoot: path.join(f.root, 'sessions'),
    config: {}, selectedModels: { observationModel: 'test', inspectionModel: 'test', codexModel: 'test' },
    smoke: true, readClock: () => clock,
    agent: { answer: async () => ({ answer: 'ok', kind: 'explanation', citations: [], limits: [] }) } });
  const assembled = [], media = new RemoteMedia({ ffmpeg: f.binary });
  const token = 'c'.repeat(64);
  const server = await new RemoteServer({ runtime, token, media: { assemble: async (...args) => {
    const result = await media.assemble(...args);
    assembled.push(result);
    return result;
  } } }).listen(0, '127.0.0.1');
  t.after(async () => { await server.close(); await runtime.close(); });
  const post = async (route, body) => {
    const res = await fetch(server.url + route, { method: 'POST',
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    return { status: res.status, value: await res.json() };
  };
  const session = (await post('/v1/session/start', {})).value;
  clock = 15000;
  const refused = await post('/v1/segments', template);
  assert.equal(refused.status, 400);
  assert.equal(refused.value.code, 'stale-session');
  assert.equal(assembled.length, 0);
  const offset = 3000;
  const body = { ...template, sessionId: session.id, sequence: 17, startMs: template.startMs + offset,
    endMs: template.endMs + offset, frames: template.frames.map(frame => ({ ...frame, atMs: frame.atMs + offset })) };
  const accepted = await post('/v1/segments', body);
  assert.equal(accepted.status, 200);
  assert.equal(assembled.length, 1);
  assert.equal(assembled[0].sequence, 17);
  assert.equal(assembled[0].audio.toString('ascii', 8, 12), 'WAVE');
  assert.deepEqual(assembled[0].frames.map(frame => frame.atMs), body.frames.map(frame => frame.atMs));
  const stored = await runtime.session.store.read(accepted.value.id);
  assert.deepEqual(stored.frames, assembled[0].frames);
  assert.equal(runtime.session.watch.snapshot().segments[0].receivedMs, clock);
  assert.equal(template.sessionId, 'video-template-validation-only');
});

for (const [name, settings, code] of [
  ['unknown duration', { unknownDuration: true }, 'TVLENS_VIDEO_DURATION_UNKNOWN'],
  ['decoder failure', { decodeFailure: true }, 'FFMPEG_DECODE'],
  ['audio extraction failure', { audioFailure: true }, 'FFMPEG_DECODE'],
  ['oversized image', { oversize: 'image' }, 'TVLENS_MEDIA_BLOCK_INVALID'],
  ['oversized audio', { oversize: 'audio' }, 'TVLENS_MEDIA_BLOCK_INVALID'],
  ['missing image output', { missingOutput: 'image' }, 'TVLENS_VIDEO_IMAGE_MISSING'],
  ['missing audio output', { missingOutput: 'audio' }, 'TVLENS_VIDEO_AUDIO_MISSING'],
  ['unreadable image output', { unreadableOutput: 'image' }, 'TVLENS_VIDEO_IMAGE_UNAVAILABLE'],
  ['unreadable audio output', { unreadableOutput: 'audio' }, 'TVLENS_VIDEO_AUDIO_UNAVAILABLE'],
  ['undecodable image output', { invalidImage: true }, 'TVLENS_VIDEO_IMAGE_INVALID'],
  ['image dimensions', { width: 1281, height: 720 }, 'TVLENS_VIDEO_IMAGE_INVALID'],
  ['non-JPEG image', { nonJpeg: true }, 'TVLENS_VIDEO_IMAGE_INVALID'],
  ['invalid WAV', { invalidWav: true }, 'TVLENS_VIDEO_AUDIO_INVALID'],
  ['WAV without samples', { emptyWav: true }, 'TVLENS_VIDEO_AUDIO_INVALID'],
]) {
  test(`conversion identifies ${name} and persists an incomplete preparation without fallback`, async t => {
    const f = await fixture(t, settings);
    await assert.rejects(convertVideo(f.options, f.dependencies), { code });
    const state = await readJson(path.join(f.options.outputDir, 'preparation.json'));
    assert.equal(state.complete, false);
    assert.equal(state.error.code, code);
    assert.equal(state.convertedDurationMs, 0);
    const manifest = await readJson(path.join(f.options.outputDir, 'manifest.json'));
    assert.equal(manifest.cases.length, 0);
    assert.equal(manifest.preparation.complete, false);
    assert.deepEqual(await fs.readdir(path.join(f.options.outputDir, 'blocks')).catch(() => []), []);
    assert.deepEqual((await fs.readdir(f.options.outputDir)).filter(name => name.startsWith('.work-')), []);
  });
}

test('a video with no audio declares absence and does not attempt audio extraction or invent a transcript', async t => {
  const f = await fixture(t, { audio: false, audioFailure: true });
  await convertVideo(f.options, f.dependencies);
  const index = await readJson(path.join(f.options.outputDir, 'blocks.json'));
  for (const block of index.blocks) {
    assert.equal(block.audio, 'absent');
    const body = await readJson(path.join(f.options.outputDir, block.body.path));
    assert.equal(body.audio, undefined);
    validateRemote(body);
  }
  const calls = await fs.readFile(path.join(f.root, 'calls.jsonl'), 'utf8');
  assert.ok(calls.trim().split('\n').map(JSON.parse).every(args => !args.includes('0:a:0')));
  const manifest = await readJson(path.join(f.options.outputDir, 'manifest.json'));
  assert.ok(manifest.cases.every(item => item.transcript.text === '' && item.transcript.availability === 'unknown'));
});

test('missing unreadable and non-file sources differ from an unavailable ffmpeg binary', async t => {
  for (const kind of ['missing', 'unreadable', 'directory', 'binary']) {
    const f = await fixture(t);
    if (kind === 'missing') await fs.rm(f.file);
    if (kind === 'unreadable') await fs.chmod(f.file, 0);
    if (kind === 'directory') f.options.file = f.root;
    if (kind === 'binary') f.dependencies.config.ffmpeg = path.join(f.root, 'missing-tool');
    await assert.rejects(convertVideo(f.options, f.dependencies), {
      code: kind === 'binary' ? 'FFMPEG_MISSING' : 'TVLENS_VIDEO_SOURCE_UNAVAILABLE',
    });
    const state = await readJson(path.join(f.options.outputDir, 'preparation.json'));
    assert.equal(state.complete, false);
    assert.equal(state.convertedDurationMs, 0);
  }
});

test('cancellation kills a held decoder before cleaning its partial output and preserves acquired blocks', async t => {
  const f = await fixture(t, { holdAtMs: 10000 });
  const controller = new AbortController();
  let arrived;
  const held = new Promise(resolve => { arrived = resolve; });
  const listener = require('node:http').createServer((req, res) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk)).on('end', () => {
      arrived(JSON.parse(Buffer.concat(chunks)));
      res.end();
    });
  });
  await new Promise(resolve => listener.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { listener.closeAllConnections(); listener.close(resolve); }));
  await fs.writeFile(f.file, JSON.stringify({ durationMs: 23500, audio: true, holdAtMs: 10000,
    holdUrl: 'http://127.0.0.1:' + listener.address().port }));
  const pending = convertVideo(f.options, { ...f.dependencies, signal: controller.signal });
  const rejected = assert.rejects(pending, { code: 'TVLENS_VIDEO_CANCELLED' });
  const child = await held;
  assert.equal(await fs.readFile(child.target, 'utf8'), 'truncated');
  process.kill(child.pid, 0);
  const before = await readJson(path.join(f.options.outputDir, 'preparation.json'));
  assert.equal(before.complete, false);
  assert.equal(before.convertedDurationMs, 10000);
  controller.abort(Object.assign(Error('Abandon piloté.'), { code: 'TVLENS_VIDEO_CANCELLED' }));
  await rejected;
  assert.throws(() => process.kill(child.pid, 0), { code: 'ESRCH' });
  await assert.rejects(fs.access(path.dirname(child.target)), { code: 'ENOENT' });
  const state = await readJson(path.join(f.options.outputDir, 'preparation.json'));
  assert.equal(state.error.code, 'TVLENS_VIDEO_CANCELLED');
  assert.equal(state.complete, false);
  assert.equal(state.convertedDurationMs, 10000);
  const manifestPath = path.join(f.options.outputDir, 'manifest.json');
  assert.equal((await readJson(manifestPath)).cases.length, 1);
  await assert.rejects(runReplay({ manifestPath, outputDir: path.join(f.root, 'cancelled-campaign'), backend: 'local' }),
    { code: 'TVLENS_REPLAY_PREPARATION_INCOMPLETE' });
});

test('thirty minutes are prepared incrementally with exact coverage, source offsets and output fingerprints', async t => {
  const f = await fixture(t, { durationMs: 1805000, audio: false });
  f.options = { ...f.options, startMs: 5000, durationMs: 1800000, framesPerBlock: 1 };
  await fs.writeFile(f.file, JSON.stringify({ durationMs: 1805000, audio: false, outputDir: f.options.outputDir }));
  const result = await convertVideo(f.options, f.dependencies);
  assert.equal(result.complete, true);
  assert.equal(result.convertedDurationMs, 1800000);
  assert.equal(result.plannedDurationMs, 1800000);
  assert.equal(result.source.sha256, hash(await fs.readFile(f.file)));
  assert.deepEqual(result.sourceInterval, { startMs: 5000, endMs: 1805000 });
  assert.deepEqual(result.timeOrigin, { kind: 'relative-to-source-interval', sourceStartMs: 5000 });
  assert.equal(result.parameters.framesPerBlock, 1);
  assert.equal(result.parameters.blockMs, 10000);
  assert.equal(result.parameters.jpegQuality, 3);
  const index = await readJson(path.join(f.options.outputDir, 'blocks.json'));
  const manifest = await readJson(path.join(f.options.outputDir, 'manifest.json'));
  assert.equal(index.blocks.length, 180);
  assert.equal(manifest.cases.length, 180);
  const observations = await fs.readFile(path.join(f.root, 'delivery-observations.jsonl'), 'utf8')
    .then(raw => raw.trim().split('\n').map(JSON.parse)).catch(error => {
      if (error.code === 'ENOENT') return [];
      throw error;
    });
  assert.equal(observations.length, 180);
  assert.deepEqual(observations.map(item => item.publishedBlocks), Array.from({ length: 180 }, (_, i) => i));
  assert.deepEqual(observations.map(item => Number(item.args[item.args.indexOf('-ss') + 1])),
    index.blocks.map(block => (f.options.startMs + block.startMs) / 1000));
  let endMs = 0, total = 0;
  for (const [sequence, entry] of index.blocks.entries()) {
    assert.equal(entry.sequence, sequence);
    assert.equal(entry.startMs, endMs);
    total += entry.endMs - entry.startMs;
    endMs = entry.endMs;
    for (const output of entry.outputs)
      assert.equal(hash(await fs.readFile(path.join(f.options.outputDir, output.path))), output.sha256);
    const body = await readJson(path.join(f.options.outputDir, entry.body.path));
    validateRemote(body);
    assert.deepEqual(entry.sourceInterval, { startMs: body.startMs + 5000, endMs: body.endMs + 5000 });
    assert.equal(manifest.cases[sequence].provenance.sourceSha256, result.source.sha256);
    assert.deepEqual(manifest.cases[sequence].provenance.sourceInterval, entry.sourceInterval);
  }
  assert.equal(total, 1800000);
  assert.equal(endMs, 1800000);
  const { validatePreparation } = require('../scripts/prepare-video-replay.cjs');
  assert.equal((await validatePreparation(f.options.outputDir)).complete, true);
});

test('CLI reports a stable missing extraction code and never exposes a temporary path', async t => {
  const f = await fixture(t, { missingOutput: 'image' });
  const result = await execute(process.execPath, [cli, '--file', f.file, '--out', f.options.outputDir,
    '--start-ms', '0', '--block-ms', '10000', '--frames', '2', '--jpeg-quality', '3'],
  { env: { ...process.env, TVLENS_FFMPEG: f.binary } }).catch(error => error);
  assert.equal(result.code, 1);
  assert.equal(result.stderr, 'Préparation refusée : TVLENS_VIDEO_IMAGE_MISSING.\n');
  const state = await readJson(path.join(f.options.outputDir, 'preparation.json'));
  assert.equal(state.error.code, 'TVLENS_VIDEO_IMAGE_MISSING');
  assert.equal(state.complete, false);
});

test('synthetic video exercises the configured ffmpeg probe, seeking, scaling and real WAV extraction', async t => {
  const { executable } = require('../adapters/system-paths.cjs');
  const { run } = require('../adapters/ffmpeg.cjs');
  const binary = executable('ffmpeg');
  try { await run(binary, ['-version']); }
  catch (error) {
    if (error.code !== 'FFMPEG_MISSING') throw error;
    t.skip('ffmpeg absent : complément synthétique non lancé ; preuves principales sur double conservées.');
    return;
  }
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tvlens-synthetic-video-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const file = path.join(root, 'synthetic.mkv'), outputDir = path.join(root, 'prepared');
  await run(binary, ['-nostdin', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=1600x900:rate=10:duration=2.5',
    '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000:duration=2.5',
    '-c:v', 'mpeg4', '-q:v', '3', '-c:a', 'pcm_s16le', file]);
  const sourceHash = hash(await fs.readFile(file));
  const state = await convertVideo({ file, outputDir, startMs: 250, blockMs: 1000, framesPerBlock: 2, jpegQuality: 3 },
    { config: { ffmpeg: binary } });
  assert.equal(state.complete, true);
  assert.equal(state.convertedDurationMs, 2250);
  assert.equal(state.source.sha256, sourceHash);
  assert.deepEqual(state.sourceInterval, { startMs: 250, endMs: 2500 });
  const index = await readJson(path.join(outputDir, 'blocks.json'));
  assert.deepEqual(index.blocks.map(block => [block.startMs, block.endMs]), [[0, 1000], [1000, 2000], [2000, 2250]]);
  for (const entry of index.blocks) {
    const body = await readJson(path.join(outputDir, entry.body.path));
    validateRemote(body);
    for (const frame of body.frames) {
      const image = await require('sharp')(Buffer.from(frame.data, 'base64')).metadata();
      assert.equal(image.format, 'jpeg');
      assert.equal(image.width, 1280);
      assert.equal(image.height, 720);
    }
    const wav = Buffer.from(body.audio, 'base64');
    assert.equal(wav.toString('ascii', 0, 4), 'RIFF');
    assert.equal(wav.toString('ascii', 8, 12), 'WAVE');
    const fmt = wav.indexOf(Buffer.from('fmt ')) + 8;
    assert.equal(wav.readUInt16LE(fmt), 1);
    assert.equal(wav.readUInt16LE(fmt + 2), 1);
    assert.equal(wav.readUInt32LE(fmt + 4), 16000);
    assert.equal(wav.readUInt16LE(fmt + 14), 16);
    const samples = wav.indexOf(Buffer.from('data')) + 4;
    assert.equal(wav.readUInt32LE(samples), (body.endMs - body.startMs) * 32);
  }
  const { validatePreparation } = require('../scripts/prepare-video-replay.cjs');
  assert.equal((await validatePreparation(outputDir)).complete, true);
  const report = await runReplay({ manifestPath: path.join(outputDir, 'manifest.json'),
    outputDir: path.join(root, 'validation'), backend: 'local' });
  assert.equal(report.complete, true);
  assert.ok(report.cases.every(item => item.status === 'validated'));
  assert.equal(hash(await fs.readFile(file)), sourceHash);
});
