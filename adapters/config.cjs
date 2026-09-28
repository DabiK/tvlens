const fs = require('node:fs/promises');
const path = require('node:path');
const { parseEnv } = require('node:util');
const DEFAULT_MODEL = 'google/gemini-2.5-flash-lite';
const FREE_MODEL_WITH_UNVALIDATED_AUDIO = 'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free';
async function loadConfig({ configPath, userData, safeStorage }) {
  const cached = path.join(userData, 'provider.enc');
  if (configPath) {
    const env = parseEnv(await fs.readFile(configPath, 'utf8'));
    const model = env.OPENROUTER_MODEL?.trim() || DEFAULT_MODEL;
    const result = { apiKey: env.OPENROUTER_API_KEY?.trim() || '', model,
      audioInput: env.OPENROUTER_AUDIO_INPUT ? env.OPENROUTER_AUDIO_INPUT === 'true' : model !== FREE_MODEL_WITH_UNVALIDATED_AUDIO,
      codexAuthHome: env.TVLENS_CODEX_AUTH_HOME || process.env.CODEX_HOME || null,
      whisperModel: env.TVLENS_WHISPER_MODEL || null,
      whisperBinary: env.TVLENS_WHISPER_BINARY || '/opt/homebrew/bin/whisper-cli',
      ffmpeg: env.TVLENS_FFMPEG || '/opt/homebrew/bin/ffmpeg',
      inspectionModel: env.TVLENS_INSPECTION_MODEL || 'google/gemini-3.8-flash',
      inspectionStrategy: env.TVLENS_INSPECTION_STRATEGY || 'native-slow',
      researchBudgetFile: path.join(path.dirname(path.resolve(configPath)), '.local', 'research-budget.json'),
      budgetFile: path.join(path.dirname(path.resolve(configPath)), '.local', 'trial-budget.json') };
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
