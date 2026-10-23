const fs = require('node:fs/promises');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { executable } = require('./system-paths.cjs');
const { validateTranscriptionLanguage } = require('../core/transcription-language.cjs');

const PATH_KEYS = ['codexBinary', 'codexAuthHome', 'ffmpeg', 'whisperBinary', 'whisperModel'];
const fail = code => Object.assign(new Error('Réglages d’installation illisibles ou invalides.'), { code });

function desktopPaths({ config, preferences, userData, packaged, environment, home }) {
  const selected = { ...config, ...preferences };
  const tool = (name, override) => executable(name, { override: override === name ? undefined : override, environment, home });
  return {
    codexBinary: tool('codex', selected.codexBinary),
    codexAuthHome: selected.codexAuthHome || environment.CODEX_HOME || path.join(home, '.codex'),
    ffmpeg: tool('ffmpeg', selected.ffmpeg),
    whisperBinary: tool('whisper-cli', selected.whisperBinary),
    whisperModel: selected.whisperModel || (packaged ? path.join(userData, 'models', 'ggml-base.bin')
      : path.resolve(__dirname, '../.local/models/ggml-base.bin')),
  };
}

class DesktopPreferences {
  constructor(userData) { this.file = path.join(userData, 'installation.json'); }

  async load() {
    let value;
    try { value = JSON.parse(await fs.readFile(this.file, 'utf8')); }
    catch (error) {
      if (error.code === 'ENOENT') return { paths: {}, completed: false };
      throw fail('TVLENS_SETUP_READ_FAILED');
    }
    if (!value || typeof value.completed !== 'boolean' || !value.paths || typeof value.paths !== 'object' || Array.isArray(value.paths))
      throw fail('TVLENS_SETUP_INVALID');
    for (const [key, file] of Object.entries(value.paths)) {
      if (!PATH_KEYS.includes(key) || typeof file !== 'string' || !path.isAbsolute(file) || file.includes('\0'))
        throw fail('TVLENS_SETUP_INVALID');
    }
    const language = value.transcriptionLanguage;
    if (language !== undefined) validateTranscriptionLanguage(language);
    return { paths: value.paths, completed: value.completed,
      ...(language === undefined ? {} : { transcriptionLanguage: language }) };
  }

  async save(value) {
    // Only non-secret, explicitly selected paths and the completion flag enter this file.
    const paths = Object.fromEntries(PATH_KEYS.filter(key => value.paths[key]).map(key => [key, value.paths[key]]));
    const language = value.transcriptionLanguage;
    if (language !== undefined) validateTranscriptionLanguage(language);
    const stored = { paths, completed: value.completed === true,
      ...(language === undefined ? {} : { transcriptionLanguage: language }) };
    const temporary = this.file + '.tmp';
    try {
      await fs.mkdir(path.dirname(this.file), { recursive: true, mode: 0o700 });
      await fs.writeFile(temporary, JSON.stringify(stored), { mode: 0o600 });
      await fs.rename(temporary, this.file);
    } catch (error) {
      // Preserve the original failure even when the temporary location cannot be cleaned.
      await fs.rm(temporary, { force: true }).catch(() => null);
      throw Object.assign(new Error('Impossible d’enregistrer les réglages d’installation.'), { code: 'TVLENS_SETUP_WRITE_FAILED', cause: error });
    }
  }
}

async function accessible(file, kind = 'file') {
  try {
    const stat = await fs.stat(file);
    if (kind === 'directory') return stat.isDirectory();
    if (!stat.isFile()) return false;
    await fs.access(file, kind === 'executable' ? fs.constants.X_OK : fs.constants.R_OK);
    return kind === 'executable' || stat.size > 0;
  } catch { return false; }
}

function commandStatus(binary, args, environment) {
  return new Promise(resolve => {
    const child = execFile(binary, args, {
      env: environment, timeout: 5000, killSignal: 'SIGKILL', maxBuffer: 65536, shell: false,
    }, error => {
      if (!error) return resolve('ready');
      resolve(error.killed ? 'timeout' : 'unavailable');
    });
    child.stdin?.end();
  });
}

async function inspectDesktop({ paths, permission, environment }, { run = commandStatus, access = accessible } = {}) {
  const checkBinary = async (id, args) => {
    if (!await access(paths[id], 'executable')) return { id, state: 'missing' };
    return { id, state: await run(paths[id], args, environment) };
  };
  const binaries = await Promise.all([
    checkBinary('codexBinary', ['--version']), checkBinary('ffmpeg', ['-version']), checkBinary('whisperBinary', ['--help']),
  ]);
  const auth = binaries[0].state === 'ready'
    ? await run(paths.codexBinary, ['login', 'status'], { ...environment, CODEX_HOME: paths.codexAuthHome }) : 'unavailable';
  return [...binaries, { id: 'codexAuthHome', state: auth },
    { id: 'whisperModel', state: await access(paths.whisperModel) ? 'present' : 'missing' },
    { id: 'screen', state: permission === 'granted' ? 'ready' : permission }];
}

module.exports = { desktopPaths, DesktopPreferences, inspectDesktop, accessible, PATH_KEYS };
