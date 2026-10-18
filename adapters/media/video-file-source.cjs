const fs = require('node:fs/promises');
const { createReadStream } = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const sharp = require('sharp');
const { run } = require('../ffmpeg.cjs');
const { validateRemote } = require('../remote-media.cjs');

const VALIDATION_SESSION = 'video-template-validation-only';
const FRAME_WIDTH = 1280, FRAME_HEIGHT = 720, MAX_INPUT_PIXELS = 1920 * 1080;
const AUDIO = { codec: 'pcm_s16le', sampleRate: 16000, channels: 1, bitDepth: 16 };
const SCALE = `scale=w='min(${FRAME_WIDTH},iw)':h='min(${FRAME_HEIGHT},ih)':force_original_aspect_ratio=decrease`;
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const failure = code => Object.assign(Error('Préparation vidéo refusée.'), { code: 'TVLENS_VIDEO_' + code });
function requireValue(value, code) {
  if (!value) throw failure(code);
}
async function fingerprint(file, signal) {
  const digest = createHash('sha256');
  for await (const bytes of createReadStream(file, { signal })) digest.update(bytes);
  return digest.digest('hex');
}
async function writeJson(file, value) {
  const raw = JSON.stringify(value, null, 2) + '\n';
  await fs.writeFile(file + '.tmp', raw, { mode: 0o600 });
  await fs.rename(file + '.tmp', file);
  return hash(raw);
}
function settings(options) {
  const { startMs, durationMs, blockMs, framesPerBlock, jpegQuality } = options;
  requireValue(Number.isSafeInteger(startMs) && startMs >= 0, 'OPTIONS_INVALID');
  requireValue(durationMs === undefined || (Number.isSafeInteger(durationMs) && durationMs > 0), 'OPTIONS_INVALID');
  requireValue(Number.isInteger(jpegQuality) && jpegQuality >= 2 && jpegQuality <= 31, 'OPTIONS_INVALID');
  // Le contrat distant reste la seule autorité pour les bornes de bloc et d'images.
  validateRemote({ sessionId: VALIDATION_SESSION, sequence: 0, startMs: 0, endMs: blockMs,
    frames: Number.isInteger(framesPerBlock) && framesPerBlock > 0 && framesPerBlock < 100
      ? Array.from({ length: framesPerBlock }, () => ({ atMs: 0, data: 'YQ==' })) : [] });
  return { startMs, durationMs, blockMs, framesPerBlock, jpegQuality, scale: SCALE,
    audio: { ...AUDIO }, sampling: 'equidistant-block-start' };
}
async function inspect(file, binary, signal) {
  const args = ['-nostdin', '-i', file, '-map', '0:v:0', '-t', '0', '-f', 'null', '-'];
  const diagnostic = await run(binary, args, signal, { captureStderr: true });
  requireValue(!diagnostic.truncated, 'METADATA_INVALID');
  const input = diagnostic.stderr.split(/Output #0/)[0];
  const duration = /Duration: (\d+):(\d{2}):(\d{2}(?:\.\d+)?)/.exec(input);
  requireValue(duration, 'DURATION_UNKNOWN');
  const durationMs = Math.round((Number(duration[1]) * 3600 + Number(duration[2]) * 60 + Number(duration[3])) * 1000);
  requireValue(durationMs > 0 && Number.isSafeInteger(durationMs), 'DURATION_UNKNOWN');
  const version = /^ffmpeg version (\S+)/m.exec(input)?.[1];
  requireValue(version && /Stream #.*Video:/.test(input), 'METADATA_INVALID');
  return { durationMs, hasAudio: /Stream #.*Audio:/.test(input), version, arguments: args };
}
function extractArgs(file, atMs) {
  return ['-nostdin', '-v', 'error', '-xerror', '-ss', String(atMs / 1000), '-i', file];
}
async function readOutput(file, kind) {
  try { return await fs.readFile(file); }
  catch (cause) {
    const suffix = cause.code === 'ENOENT' ? '_MISSING' : '_UNAVAILABLE';
    throw Object.assign(failure(kind + suffix), { cause });
  }
}
async function readImage(file) {
  const bytes = await readOutput(file, 'IMAGE');
  let image;
  try { image = await sharp(bytes, { limitInputPixels: MAX_INPUT_PIXELS }).metadata(); }
  catch (cause) { throw Object.assign(failure('IMAGE_INVALID'), { cause }); }
  requireValue(image.format === 'jpeg' && image.width <= FRAME_WIDTH && image.height <= FRAME_HEIGHT, 'IMAGE_INVALID');
  return bytes;
}
function validateWav(bytes) {
  const valid = value => requireValue(value, 'AUDIO_INVALID');
  valid(bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WAVE');
  let format = false, samples = false;
  for (let offset = 12; offset + 8 <= bytes.length;) {
    const kind = bytes.toString('ascii', offset, offset + 4), size = bytes.readUInt32LE(offset + 4);
    const start = offset + 8;
    valid(start + size <= bytes.length);
    if (kind === 'fmt ') {
      valid(size >= 16);
      format = bytes.readUInt16LE(start) === 1 && bytes.readUInt16LE(start + 2) === AUDIO.channels
        && bytes.readUInt32LE(start + 4) === AUDIO.sampleRate && bytes.readUInt16LE(start + 14) === AUDIO.bitDepth;
    }
    if (kind === 'data') samples = size >= 2 && size % 2 === 0;
    offset = start + size + size % 2;
  }
  // Une en-tête seule, même suivie de métadonnées, ne prouve aucune extraction audio réussie.
  valid(format && samples);
}
async function extractBlock(options, config, meta, sequence, startMs, endMs, work, signal) {
  const { file, startMs: sourceStart, framesPerBlock, jpegQuality } = options;
  const body = { sessionId: VALIDATION_SESSION, sequence, startMs, endMs, frames: [] };
  const outputs = [], commands = [];
  for (let i = 0; i < framesPerBlock; i++) {
    signal?.throwIfAborted();
    const atMs = startMs + (endMs - startMs) * i / framesPerBlock;
    const name = `frame-${i}.jpg`, target = path.join(work, name);
    const args = [...extractArgs(file, sourceStart + atMs), '-map', '0:v:0', '-frames:v', '1', '-vf', SCALE,
      '-q:v', String(jpegQuality), '-an', target];
    commands.push(args);
    await run(config.ffmpeg, args, signal);
    const bytes = await readImage(target);
    body.frames.push({ atMs, data: bytes.toString('base64') });
    outputs.push({ path: name, sha256: hash(bytes) });
  }
  if (meta.hasAudio) {
    const target = path.join(work, 'audio.wav');
    const args = [...extractArgs(file, sourceStart + startMs), '-map', '0:a:0', '-t', String((endMs - startMs) / 1000),
      '-vn', '-c:a', AUDIO.codec, '-ar', String(AUDIO.sampleRate), '-ac', String(AUDIO.channels), target];
    commands.push(args);
    await run(config.ffmpeg, args, signal);
    const bytes = await readOutput(target, 'AUDIO');
    validateWav(bytes);
    body.audio = bytes.toString('base64');
    outputs.push({ path: 'audio.wav', sha256: hash(bytes) });
  }
  validateRemote(body);
  return { body, outputs, commands };
}
async function publishBlock(options, state, manifest, index, meta, sequence, startMs, endMs, work, dependencies) {
  const { body, outputs, commands } = await extractBlock(options, dependencies.config, meta,
    sequence, startMs, endMs, work, dependencies.signal);
  dependencies.signal?.throwIfAborted();
  const directory = `blocks/${String(sequence).padStart(6, '0')}`;
  const bodyHash = await writeJson(path.join(work, 'body.json'), body);
  const media = { startMs, endMs, audio: body.audio || null,
    frames: body.frames.map(frame => ({ atMs: frame.atMs, dataUrl: 'data:image/jpeg;base64,' + frame.data })) };
  const mediaHash = await writeJson(path.join(work, 'media.json'), media);
  outputs.push({ path: 'body.json', sha256: bodyHash }, { path: 'media.json', sha256: mediaHash });
  await fs.rename(work, path.join(options.outputDir, directory));
  const sourceInterval = { startMs: options.startMs + startMs, endMs: options.startMs + endMs };
  index.blocks.push({ sequence, startMs, endMs, sourceInterval, audio: meta.hasAudio ? 'present' : 'absent',
    body: { path: directory + '/body.json', sha256: bodyHash },
    outputs: outputs.map(output => ({ ...output, path: directory + '/' + output.path })) });
  manifest.cases.push({ id: `video-${sequence}`, startMs, endMs,
    media: { path: directory + '/media.json', sha256: mediaHash },
    provenance: { kind: 'converted-video', sourceSha256: state.source.sha256, sourceInterval,
      conversion: { tool: 'ffmpeg', version: meta.version, arguments: commands.flat(), parameters: state.parameters } },
    transcript: { text: '', availability: 'unknown', limits: 'Aucune transcription effectuée ; paroles inconnues.' },
    context: { value: null, limits: 'Aucun contexte historique fourni ni reconstruit.' },
    lightweight: { value: false, source: 'explicit-default' } });
  state.convertedDurationMs = endMs;
}
async function savePreparation(outputDir, state, manifest, index) {
  manifest.preparation = { complete: state.complete };
  index.complete = state.complete;
  state.manifest = { path: 'manifest.json', sha256: await writeJson(path.join(outputDir, 'manifest.json'), manifest) };
  state.index = { path: 'blocks.json', sha256: await writeJson(path.join(outputDir, 'blocks.json'), index) };
  await writeJson(path.join(outputDir, 'preparation.json'), state);
}
async function sourceIdentity(file, signal) {
  try {
    const stat = await fs.stat(file);
    requireValue(stat.isFile(), 'SOURCE_UNAVAILABLE');
    return { sha256: await fingerprint(file, signal), bytes: stat.size };
  } catch (error) {
    if (signal?.aborted) throw signal.reason;
    throw Object.assign(failure('SOURCE_UNAVAILABLE'), { cause: error });
  }
}
async function prepareBlocks(options, state, manifest, index, dependencies) {
  const { config, signal } = dependencies;
  state.source = await sourceIdentity(options.file, signal);
  const meta = await inspect(options.file, config.ffmpeg, signal);
  state.source.durationMs = meta.durationMs;
  state.conversion = { tool: 'ffmpeg', version: meta.version, inspectionArguments: meta.arguments };
  requireValue(options.startMs < meta.durationMs, 'INTERVAL_INVALID');
  const available = meta.durationMs - options.startMs;
  const durationMs = options.durationMs === undefined ? available : Math.min(available, options.durationMs);
  state.sourceInterval = { startMs: options.startMs, endMs: options.startMs + durationMs };
  state.plannedDurationMs = durationMs;
  await fs.mkdir(path.join(options.outputDir, 'blocks'), { mode: 0o700 });
  for (let startMs = 0, sequence = 0; startMs < durationMs; startMs += options.blockMs, sequence++) {
    signal?.throwIfAborted();
    const work = await fs.mkdtemp(path.join(options.outputDir, '.work-'));
    try {
      await publishBlock(options, state, manifest, index, meta, sequence, startMs,
        Math.min(startMs + options.blockMs, durationMs), work, dependencies);
    } finally {
      // run() attend close : aucun processus ne peut encore écrire dans ce dossier.
      await fs.rm(work, { recursive: true, force: true });
    }
    await savePreparation(options.outputDir, state, manifest, index);
  }
  signal?.throwIfAborted();
  requireValue(await fingerprint(options.file, signal) === state.source.sha256, 'SOURCE_CHANGED');
  state.complete = true;
}
async function convertVideo(options, dependencies) {
  const parameters = settings(options);
  requireValue(typeof dependencies?.config?.ffmpeg === 'string', 'CONFIG_INVALID');
  options = { ...options, file: path.resolve(options.file), outputDir: path.resolve(options.outputDir) };
  const state = { version: 1, complete: false, convertedDurationMs: 0, parameters,
    timeOrigin: { kind: 'relative-to-source-interval', sourceStartMs: options.startMs },
    templateSessionId: VALIDATION_SESSION, sessionBinding: 'required-per-occurrence' };
  const manifest = { version: 1, cases: [] }, index = { version: 1, usage: '/v1/segments templates', blocks: [] };
  await fs.mkdir(options.outputDir, { mode: 0o700 });
  await savePreparation(options.outputDir, state, manifest, index);
  try {
    await prepareBlocks(options, state, manifest, index, dependencies);
    await savePreparation(options.outputDir, state, manifest, index);
    return state;
  } catch (error) {
    state.complete = false;
    state.error = { code: dependencies.signal?.aborted ? 'TVLENS_VIDEO_CANCELLED' : error.code || 'TVLENS_VIDEO_PREPARATION_FAILED' };
    await savePreparation(options.outputDir, state, manifest, index);
    throw error;
  }
}
module.exports = { convertVideo };
