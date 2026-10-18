const path = require('node:path');
const { readJson, sha256, loadCase, requireInput: check } = require('./perception-replay-input.cjs');
const { validateRemote } = require('../adapters/remote-media.cjs');
const { validateOllamaConfig } = require('../adapters/ollama/http-client.cjs');
const { validateEmbeddingTimeout } = require('../adapters/embeddings/ollama-embeddings.cjs');

const HASH = /^[a-f0-9]{64}$/;
const MAX_TIMER_MS = 2147483647;
// Contrats produit : server/http.cjs (SEGMENT_BODY_LIMIT) et core/deep-ask.cjs (DeepAsk.start).
const SEGMENT_BODY_LIMIT_BYTES = 13000000;
const QUESTION_MAX_CHARS = 2000;
const CONFIG_KEYS = ['perceptionBackend', 'questionsBackend', 'inspectionBackend', 'embeddingsBackend',
  'localVlm', 'localQuestions', 'localEmbeddings', 'visionDuringAsk', 'backgroundIndex'];
const positiveTime = value => Number.isFinite(value) && value > 0 && value <= MAX_TIMER_MS;
const relativeTime = value => Number.isFinite(value) && value >= 0 && value <= MAX_TIMER_MS;
async function referenced(base, reference) {
  check(reference && typeof reference.path === 'string' && !path.isAbsolute(reference.path)
    && !reference.path.split(/[\\/]/).includes('..') && HASH.test(reference.sha256), 'REFERENCE_INVALID');
  const file = await readJson(path.join(base, reference.path));
  check(file.sha256 === reference.sha256, 'HASH_MISMATCH');
  return file;
}
function validateConfig(config, models) {
  check(config && ['local', 'codex'].includes(config.perceptionBackend)
    && ['local', 'codex'].includes(config.questionsBackend)
    && ['local', 'codex'].includes(config.inspectionBackend)
    && ['local', 'openrouter', 'disabled'].includes(config.embeddingsBackend), 'BACKEND_REQUIRED');
  check(Object.keys(config).every(key => CONFIG_KEYS.includes(key)), 'CONFIG_INVALID');
  check(models && ['observationModel', 'inspectionModel', 'codexModel'].every(key =>
    typeof models[key] === 'string' && models[key].trim()), 'CONFIG_INVALID');
  if (config.perceptionBackend === 'local' || config.inspectionBackend === 'local') validateOllamaConfig(config.localVlm);
  if (config.questionsBackend === 'local') validateOllamaConfig(config.localQuestions);
  if (config.embeddingsBackend === 'local') {
    validateOllamaConfig(config.localEmbeddings);
    validateEmbeddingTimeout(config.localEmbeddings.timeoutMs);
  }
  // Les secrets appartiennent au fichier de configuration de l'hôte, jamais au scénario conservé.
  check(!JSON.stringify(config).match(/"(?:token|apiKey|codexAuthHome)"/), 'CONFIG_INVALID');
  check([true, false, undefined].includes(config.visionDuringAsk)
    && [true, false, undefined].includes(config.backgroundIndex), 'CONFIG_INVALID');
}
function questionsOf(scenario) {
  check(Array.isArray(scenario.questions), 'QUESTIONS_INVALID');
  const ids = new Set();
  return scenario.questions.map(item => {
    check(item && typeof item.id === 'string' && item.id.trim() && !ids.has(item.id), 'QUESTION_INVALID');
    ids.add(item.id);
    check(relativeTime(item.atMs) && item.atMs <= scenario.plannedDurationMs
      && typeof item.question === 'string' && item.question.trim() && item.question.length <= QUESTION_MAX_CHARS, 'QUESTION_INVALID');
    check(item.cancelAtMs === undefined || relativeTime(item.cancelAtMs) && item.cancelAtMs >= item.atMs
      && item.cancelAtMs <= scenario.plannedDurationMs, 'QUESTION_INVALID');
    return { ...item, plannedAtMs: item.atMs, status: 'planned', backend: scenario.config.questionsBackend,
      attempts: [], cancellation: item.cancelAtMs === undefined ? null : { plannedAtMs: item.cancelAtMs, status: 'planned' } };
  });
}
async function perceptionSource(body, reference, base) {
  if (!reference) return null;
  const manifest = await referenced(base, reference.manifest);
  const item = manifest.value.cases?.find(item => item.id === reference.caseId);
  const loaded = await loadCase(item, path.dirname(path.resolve(base, reference.manifest.path)));
  const indices = reference.frameIndices;
  check(Array.isArray(indices) && indices.length === body.frames.length && new Set(indices).size === indices.length, 'SELECTION_INVALID');
  check(item.startMs === body.startMs && item.endMs === body.endMs, 'INTERVAL_MISMATCH');
  for (const [i, index] of indices.entries()) {
    const frame = loaded.segment.frames[index];
    check(Number.isSafeInteger(index) && frame && frame.atMs === body.frames[i].atMs
      && frame.dataUrl.split(',')[1] === body.frames[i].data, 'SELECTION_INVALID');
  }
  check(loaded.input.audioSha256 === (body.audio ? sha256(Buffer.from(body.audio, 'base64')) : null), 'SELECTION_INVALID');
  return { ...reference, input: loaded.input, frames: indices.map(index => loaded.input.frames[index]) };
}
async function templateInput(body, entry, base) {
  const perception = await perceptionSource(body, entry.perception, base);
  return { body: entry.body, templateInterval: { startMs: body.startMs, endMs: body.endMs },
    sourceInterval: entry.sourceInterval || { startMs: body.startMs, endMs: body.endMs },
    provenance: entry.provenance ?? null, perception,
    frames: perception?.frames || body.frames.map((frame, index) => ({ index, atMs: frame.atMs,
      bytesSha256: sha256(Buffer.from(frame.data, 'base64')) })),
    audioSha256: body.audio ? sha256(Buffer.from(body.audio, 'base64')) : null };
}
async function templatesOf(index, base) {
  check(index.value?.version === 1 && index.value.complete === true
    && Array.isArray(index.value.blocks) && index.value.blocks.length > 0, 'INDEX_INVALID');
  const templates = [];
  for (const [i, entry] of index.value.blocks.entries()) {
    const { value: body } = await referenced(base, entry?.body);
    validateRemote(body);
    // Le même plafond que readJSON du transport HTTP reste applicable aux champs supplémentaires.
    check(Buffer.byteLength(JSON.stringify(body)) <= SEGMENT_BODY_LIMIT_BYTES, 'BODY_TOO_LARGE');
    templates.push({ body, caseId: entry.perception?.caseId || entry.caseId || 'video-' + (entry.sequence ?? i),
      input: await templateInput(body, entry, base) });
  }
  return templates;
}
function uploadsOf(scenario, templates) {
  check(Array.isArray(scenario.clips) && scenario.clips.length > 0, 'CLIPS_INVALID');
  const ids = new Set(), occurrences = new Set();
  let endMs = 0;
  return scenario.clips.map((clip, sequence) => {
    check(clip && typeof clip.id === 'string' && clip.id.trim() && !ids.has(clip.id), 'CLIP_INVALID');
    ids.add(clip.id);
    const template = templates[clip.block];
    check(Number.isSafeInteger(clip.block) && template && Number.isSafeInteger(clip.occurrence) && clip.occurrence >= 0, 'CLIP_INVALID');
    const key = clip.block + ':' + clip.occurrence;
    check(!occurrences.has(key), 'OCCURRENCE_INVALID');
    occurrences.add(key);
    check(['fr', 'en', 'auto'].includes(clip.language) && relativeTime(clip.atMs) && clip.atMs >= endMs, 'CLIP_INVALID');
    endMs = clip.atMs + template.body.endMs - template.body.startMs;
    check(endMs <= scenario.plannedDurationMs, 'INTERVAL_INVALID');
    return { ...clip, caseId: template.caseId, sequence, startMs: clip.atMs, endMs,
      plannedAtMs: endMs, input: template.input, status: 'planned', attempts: [], roles: {} };
  });
}
async function provenanceOf(scenario, base, index) {
  const provenance = scenario.provenance;
  check(provenance && ['tvlens-capture', 'converted-video', 'looped-corpus'].includes(provenance.kind)
    && typeof provenance.reference === 'string' && provenance.reference.trim(), 'PROVENANCE_INVALID');
  if (provenance.kind !== 'converted-video') return provenance;
  const { value: preparation } = await referenced(base, provenance.preparation);
  check(preparation.complete === true && preparation.index?.sha256 === index.sha256
    && HASH.test(preparation.source?.sha256) && positiveTime(preparation.convertedDurationMs), 'PREPARATION_INCOMPLETE');
  check(preparation.parameters && preparation.sourceInterval && preparation.timeOrigin, 'PROVENANCE_INVALID');
  return { ...provenance, preparation };
}
async function loadScenario(file) {
  const source = await readJson(file), scenario = source.value, base = path.dirname(file);
  check(scenario?.version === 1 && ['nominal', 'overload'].includes(scenario.kind)
    && positiveTime(scenario.plannedDurationMs) && positiveTime(scenario.finalWaitMs)
    && positiveTime(scenario.closeWaitMs), 'SCENARIO_INVALID');
  validateConfig(scenario.config, scenario.selectedModels);
  check(scenario.surveillance === undefined || typeof scenario.surveillance.instruction === 'string'
    && scenario.surveillance.instruction.trim(), 'CONFIG_INVALID');
  const index = await referenced(base, scenario.index);
  const provenance = await provenanceOf(scenario, base, index);
  const templates = await templatesOf(index, path.dirname(path.resolve(base, scenario.index.path)));
  const uploads = uploadsOf(scenario, templates);
  const repeated = new Set(uploads.map(item => item.block)).size < uploads.length;
  check(!repeated || provenance.kind === 'looped-corpus' || scenario.loop === true, 'LOOP_UNDECLARED');
  return { scenario, templates, uploads, questions: questionsOf(scenario), provenance,
    inputs: { scenarioSha256: source.sha256, indexSha256: index.sha256 } };
}
function bindBody(template, upload, sessionId) {
  const shift = upload.startMs - template.startMs;
  return { ...template, sessionId, sequence: upload.sequence, startMs: upload.startMs, endMs: upload.endMs,
    frames: template.frames.map(frame => ({ ...frame, atMs: frame.atMs + shift })) };
}
module.exports = { loadScenario, bindBody };
