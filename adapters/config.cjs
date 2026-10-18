const fs = require('node:fs/promises');
const path = require('node:path');
const { parseEnv } = require('node:util');
const { executable } = require('./system-paths.cjs');
const DEFAULT_MODEL = 'google/gemini-2.5-flash-lite';
const FREE_MODEL_WITH_UNVALIDATED_AUDIO = 'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free';
async function loadConfig({ configPath, userData, safeStorage, environment = process.env }) {
  const cached = path.join(userData, 'provider.enc');
  if (configPath) {
    const contents = await fs.readFile(configPath, 'utf8').catch(error => { if (error.code === 'ENOENT') return ''; throw error; });
    const file = parseEnv(contents), env = { ...file, ...environment };
    const model = env.OPENROUTER_MODEL?.trim() || DEFAULT_MODEL;
    const result = { apiKey: env.OPENROUTER_API_KEY?.trim() || '', model,
      audioInput: env.OPENROUTER_AUDIO_INPUT ? env.OPENROUTER_AUDIO_INPUT === 'true' : model !== FREE_MODEL_WITH_UNVALIDATED_AUDIO,
      codexAuthHome: env.TVLENS_CODEX_AUTH_HOME || env.CODEX_HOME || null,
      whisperModel: env.TVLENS_WHISPER_MODEL || null,
      whisperThreads: env.TVLENS_WHISPER_THREADS ? Number(env.TVLENS_WHISPER_THREADS) : undefined,
      whisperBinary: executable('whisper-cli', {override:env.TVLENS_WHISPER_BINARY, environment}),
      ffmpeg: executable('ffmpeg', {override:env.TVLENS_FFMPEG, environment}),
      inspectionModel: env.TVLENS_INSPECTION_MODEL || 'google/gemini-3.8-flash',
      inspectionStrategy: env.TVLENS_INSPECTION_STRATEGY || 'native-slow',
      researchBudgetFile: path.join(env.TVLENS_USAGE_DIR || path.join(path.dirname(path.resolve(configPath)), '.local'), 'research-budget.json'),
      budgetFile: path.join(env.TVLENS_USAGE_DIR || path.join(path.dirname(path.resolve(configPath)), '.local'), 'trial-budget.json') };
    // The switches written in the file are kept with it: a later start without the file (packaged app
    // opened from the Finder) must not silently drop an opt-out or an imported backend. They are kept
    // whether or not the file brings a provider key; without one, the provider settings already stored
    // stay as they are and only the switches are replaced.
    const switchEnv = set(file);
    if (safeStorage.isEncryptionAvailable()) {
      const prior = result.apiKey ? null : await stored(cached, safeStorage);
      // Nothing to keep and nothing kept before: no file is created, as before.
      if (result.apiKey || prior || Object.keys(switchEnv).length) {
        await fs.mkdir(userData, { recursive: true, mode: 0o700 });
        await fs.writeFile(cached, safeStorage.encryptString(JSON.stringify({ ...(result.apiKey ? result : prior), switchEnv })), { mode: 0o600 });
      }
    }
    return { ...result, ...switches({ ...switchEnv, ...set(environment), ...set(env, LOCAL_TOKENS) }) };
  }
  if (safeStorage.isEncryptionAvailable()) {
    try {
      const { switchEnv = {}, ...provider } = JSON.parse(safeStorage.decryptString(await fs.readFile(cached)));
      // A cache written by an import without a key holds switches only.
      return { ...(provider.apiKey ? provider : { apiKey: '', model: DEFAULT_MODEL }),
        ...switches({ ...set(switchEnv), ...set(environment, [...SWITCHES, ...LOCAL_TOKENS]) }) };
    }
    catch { /* Import remains available when no encrypted credentials exist. */ }
  }
  return { apiKey: '', model: DEFAULT_MODEL, ...switches(environment) };
}
// What the cache already holds apart from its switches: the provider settings of the last import that
// brought a key, or nothing. null when there is no readable cache.
async function stored(cached, safeStorage) {
  try { const { switchEnv, ...provider } = JSON.parse(safeStorage.decryptString(await fs.readFile(cached))); return provider; }
  catch { return null; }
}
// Runtime switches, resolved at every start on every path: those of the imported file, then the
// environment of this start, which wins and is never stored. The local-model token is never stored
// either. A mistyped value is kept as typed: the session runtime refuses it at start instead of
// running under another setting than intended.
const SWITCHES = ['TVLENS_WHISPER_AUDIO_CTX', 'TVLENS_VISION_DURING_ASK', 'TVLENS_BACKGROUND_INDEX', 'TVLENS_PERCEPTION_BACKEND',
  'TVLENS_INSPECTION_BACKEND', 'TVLENS_LOCAL_VLM_URL', 'TVLENS_LOCAL_VLM_MODEL', 'TVLENS_LOCAL_VLM_NUM_CTX', 'TVLENS_LOCAL_VLM_KEEP_ALIVE',
  'TVLENS_QUESTIONS_BACKEND', 'TVLENS_LOCAL_QUESTIONS_URL', 'TVLENS_LOCAL_QUESTIONS_MODEL',
  'TVLENS_LOCAL_QUESTIONS_NUM_CTX', 'TVLENS_LOCAL_QUESTIONS_KEEP_ALIVE',
  'TVLENS_EMBEDDINGS_BACKEND', 'TVLENS_LOCAL_EMBEDDINGS_URL', 'TVLENS_LOCAL_EMBEDDINGS_MODEL', 'TVLENS_LOCAL_EMBEDDINGS_TIMEOUT_MS'];
const LOCAL_TOKENS = ['TVLENS_LOCAL_VLM_TOKEN', 'TVLENS_LOCAL_QUESTIONS_TOKEN', 'TVLENS_LOCAL_EMBEDDINGS_TOKEN'];
// Only what a source really sets: an empty variable must not undo a setting written elsewhere.
const set = (env, names = SWITCHES) => Object.fromEntries(names.filter(name => typeof env[name] === 'string' && env[name] !== '').map(name => [name, env[name]]));
function switches(env) {
  const flag = (value, fallback) => value === undefined || value === '' ? fallback : value === '1' ? true : value === '0' ? false : value;
  return {
    ...(env.TVLENS_WHISPER_MODEL ? { whisperModel: env.TVLENS_WHISPER_MODEL } : {}),
    ...(env.TVLENS_WHISPER_BINARY ? { whisperBinary: env.TVLENS_WHISPER_BINARY } : {}),
    whisperAudioCtx: env.TVLENS_WHISPER_AUDIO_CTX ? (env.TVLENS_WHISPER_AUDIO_CTX === 'auto' ? 'auto' : Number(env.TVLENS_WHISPER_AUDIO_CTX)) : undefined,
    // On by default: a question may now run five minutes and must not withhold the visual description of
    // the passages captured meanwhile. Still one visual call at a time. TVLENS_VISION_DURING_ASK=0 restores the gate.
    visionDuringAsk: flag(env.TVLENS_VISION_DURING_ASK, true),
    backgroundIndex: flag(env.TVLENS_BACKGROUND_INDEX, true),
    ...embeddingsConfig(env),
    questionsBackend: env.TVLENS_QUESTIONS_BACKEND || 'codex',
    localQuestions: localQuestionsConfig(env),
    perceptionBackend: env.TVLENS_PERCEPTION_BACKEND || 'codex',
    inspectionBackend: env.TVLENS_INSPECTION_BACKEND || 'codex',
    localVlm: { url: env.TVLENS_LOCAL_VLM_URL || null, model: env.TVLENS_LOCAL_VLM_MODEL || null,
      numCtx: env.TVLENS_LOCAL_VLM_NUM_CTX ? Number(env.TVLENS_LOCAL_VLM_NUM_CTX) : undefined,
      keepAlive: env.TVLENS_LOCAL_VLM_KEEP_ALIVE || undefined, token: env.TVLENS_LOCAL_VLM_TOKEN || null } };
}
function localQuestionsConfig(env) {
  return { url: env.TVLENS_LOCAL_QUESTIONS_URL || null, model: env.TVLENS_LOCAL_QUESTIONS_MODEL || null,
    numCtx: env.TVLENS_LOCAL_QUESTIONS_NUM_CTX ? Number(env.TVLENS_LOCAL_QUESTIONS_NUM_CTX) : undefined,
    keepAlive: env.TVLENS_LOCAL_QUESTIONS_KEEP_ALIVE || undefined, token: env.TVLENS_LOCAL_QUESTIONS_TOKEN || null };
}
function embeddingsConfig(env) {
  const timeout = env.TVLENS_LOCAL_EMBEDDINGS_TIMEOUT_MS;
  return { embeddingsBackend: env.TVLENS_EMBEDDINGS_BACKEND || undefined,
    localEmbeddings: { url: env.TVLENS_LOCAL_EMBEDDINGS_URL || null,
      ...(timeout ? { timeoutMs: integerSetting(timeout) } : {}),
      model: env.TVLENS_LOCAL_EMBEDDINGS_MODEL || null, token: env.TVLENS_LOCAL_EMBEDDINGS_TOKEN || null } };
}
function integerSetting(value) {
  return /^\d+$/.test(value) ? Number(value) : NaN;
}
module.exports = { loadConfig };
