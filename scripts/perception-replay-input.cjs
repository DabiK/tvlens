const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { validateContext } = require('./perception-replay-context.cjs');

const MAX_PASSAGE_MS = 60000;
const HASH = /^[a-f0-9]{64}$/;
const IMAGE = /^data:image\/[\w.+-]+;base64,[A-Za-z0-9+/]+=*$/;
const sha256 = value => createHash('sha256').update(value).digest('hex');
function requireInput(condition, code = 'INPUT_INVALID') {
  if (!condition) throw Object.assign(Error('Entrée de rejeu refusée.'), { code: 'TVLENS_REPLAY_' + code });
}
async function readBytes(file) {
  try { return await fs.readFile(file); }
  catch { throw Object.assign(Error('Fichier de rejeu indisponible.'), { code: 'TVLENS_REPLAY_FILE_UNAVAILABLE' }); }
}
async function readJson(file) {
  const raw = await readBytes(file);
  let value;
  try { value = JSON.parse(raw); }
  catch { throw Object.assign(Error('JSON de rejeu invalide.'), { code: 'TVLENS_REPLAY_JSON_INVALID' }); }
  return { value, sha256: sha256(raw) };
}
function interval(value) {
  return value && Number.isFinite(value.startMs) && Number.isFinite(value.endMs)
    && value.startMs >= 0 && value.endMs > value.startMs;
}
function validateProvenance(provenance) {
  requireInput(provenance && ['tvlens-capture', 'converted-video'].includes(provenance.kind), 'PROVENANCE_INVALID');
  if (provenance.kind === 'tvlens-capture') {
    requireInput(typeof provenance.sessionId === 'string' && provenance.sessionId.trim(), 'PROVENANCE_INVALID');
    requireInput(typeof provenance.passageId === 'string' && provenance.passageId.trim(), 'PROVENANCE_INVALID');
    return;
  }
  requireInput(HASH.test(provenance.sourceSha256) && interval(provenance.sourceInterval), 'PROVENANCE_INVALID');
  const conversion = provenance.conversion;
  requireInput(conversion?.tool === 'ffmpeg' && typeof conversion.version === 'string'
    && Array.isArray(conversion.arguments) && conversion.arguments.every(value => typeof value === 'string'), 'PROVENANCE_INVALID');
}
function validateTranscript(transcript) {
  requireInput(transcript && typeof transcript.text === 'string'
    && ['known', 'unknown', 'absent'].includes(transcript.availability)
    && typeof transcript.limits === 'string' && transcript.limits.trim(), 'TRANSCRIPT_INVALID');
  if (transcript.text || transcript.availability === 'known') {
    requireInput(['input-trace', 'archive-observation', 'operator'].includes(transcript.provenance?.kind)
      && typeof transcript.provenance.reference === 'string' && transcript.provenance.reference.trim(), 'TRANSCRIPT_INVALID');
    requireInput(transcript.availability !== 'absent', 'TRANSCRIPT_INVALID');
    requireInput(transcript.availability !== 'known' || transcript.provenance.kind !== 'archive-observation', 'TRANSCRIPT_INVALID');
  }
  // Les limites de la transcription finale ne prouvent pas la limite audio au départ de la vision.
  if (transcript.audioLimit !== undefined) {
    requireInput(typeof transcript.audioLimit === 'string' && transcript.provenance?.kind === 'input-trace', 'TRANSCRIPT_INVALID');
  }
}
function validateMedia(media, item) {
  requireInput(interval(item) && item.endMs - item.startMs <= MAX_PASSAGE_MS, 'INTERVAL_INVALID');
  requireInput(interval(media) && media.startMs === item.startMs && media.endMs === item.endMs, 'INTERVAL_MISMATCH');
  requireInput(Array.isArray(media.frames), 'FRAMES_INVALID');
  let previousTime = item.startMs;
  for (const frame of media.frames) {
    requireInput(frame && Number.isFinite(frame.atMs) && frame.atMs >= previousTime
      && frame.atMs >= item.startMs && frame.atMs <= item.endMs && IMAGE.test(frame.dataUrl), 'FRAMES_INVALID');
    previousTime = frame.atMs;
  }
  requireInput(media.audio === null || media.audio === undefined
    || (typeof media.audio === 'string' && /^[A-Za-z0-9+/]+=*$/.test(media.audio)), 'AUDIO_INVALID');
}
async function loadCase(item, base) {
  requireInput(item && typeof item.id === 'string' && item.id.trim(), 'CASE_INVALID');
  requireInput(item.media && typeof item.media.path === 'string' && HASH.test(item.media.sha256), 'MEDIA_INVALID');
  requireInput(!path.isAbsolute(item.media.path) && !item.media.path.split(/[\\/]/).includes('..'), 'MEDIA_INVALID');
  const media = await readJson(path.resolve(base, item.media.path));
  requireInput(media.sha256 === item.media.sha256, 'HASH_MISMATCH');
  validateMedia(media.value, item);
  validateProvenance(item.provenance);
  validateTranscript(item.transcript);
  validateContext(item.context, item, requireInput);
  requireInput(typeof item.lightweight?.value === 'boolean'
    && ['saved-metrics', 'explicit-default'].includes(item.lightweight.source)
    && (item.lightweight.source !== 'explicit-default' || item.lightweight.value === false), 'LIGHTWEIGHT_INVALID');
  const frames = media.value.frames.map(({ atMs, dataUrl }, index) => ({ index, atMs, sha256: sha256(dataUrl) }));
  const input = { startMs: item.startMs, endMs: item.endMs, media: item.media, provenance: item.provenance,
    transcript: item.transcript, context: item.context, lightweight: item.lightweight, frames,
    audioSha256: media.value.audio ? sha256(Buffer.from(media.value.audio, 'base64')) : null };
  return { input, segment: { id: item.id, startMs: item.startMs, endMs: item.endMs, frames: media.value.frames,
    observation: { transcript: item.transcript.text, uncertainty: item.transcript.audioLimit || '' },
    context: item.context.value || {}, lightweight: item.lightweight.value } };
}
module.exports = { sha256, readBytes, readJson, loadCase, requireInput };
