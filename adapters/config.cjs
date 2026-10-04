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
    const env = { ...parseEnv(contents), ...environment };
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
    if (result.apiKey && safeStorage.isEncryptionAvailable()) {
      await fs.mkdir(userData, { recursive: true, mode: 0o700 });
      await fs.writeFile(cached, safeStorage.encryptString(JSON.stringify(result)), { mode: 0o600 });
    }
    return result;
  }
  if (safeStorage.isEncryptionAvailable()) {
    try { return JSON.parse(safeStorage.decryptString(await fs.readFile(cached))); }
    catch { /* Import remains available when no encrypted credentials exist. */ }
  }
  return { apiKey: '', model: DEFAULT_MODEL };
}
module.exports = { loadConfig };
