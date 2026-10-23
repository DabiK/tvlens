const path = require('node:path');
const { inspectDesktop, accessible, PATH_KEYS } = require('../adapters/desktop-setup.cjs');
const { installSpeechModel } = require('../adapters/speech-model-download.cjs');
const { createSpeechSetup } = require('./mac-speech-setup.cjs');

const GOOD = new Set(['ready', 'present']);
const REQUIRED = ['codexBinary', 'codexAuthHome', 'screen'];
const LINKS = {
  homebrew: 'https://brew.sh/',
  codex: 'https://developers.openai.com/codex/cli/',
  permissions: 'x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture',
};
const failure = (code, message) => Object.assign(new Error(message), { code });

async function openSetupLink(name, { permission, requestScreen, simulated, openExternal }) {
  if (name === 'permissions' && !simulated && ['not-determined', 'unknown'].includes(permission())) {
    // A denied request still leads to the settings pane; the fresh diagnostic reports its actual state.
    await requestScreen().catch(() => null);
  }
  await openExternal(LINKS[name]);
}

function createMacSetup({ store, initial, resolvePaths, getConfig, environment, permission, requestScreen,
  choose, openExternal, quit, isBusy, userData, simulated = false, showOnStart = true },
{ inspect = inspectDesktop, access = accessible, install = installSpeechModel } = {}) {
  let settings = initial;
  let pending = false;
  let changed = false;
  const startup = resolvePaths(getConfig(), initial.paths);
  let startupReady = null;
  const startupPermission = simulated ? 'granted' : permission();

  const speech = createSpeechSetup({ userData, access, install, settings: () => settings, config: getConfig,
    save, resolvePaths, simulated });

  async function status() {
    const paths = resolvePaths(getConfig(), settings.paths);
    const checks = simulated
      ? [...PATH_KEYS.map(id => ({ id, state: id === 'whisperModel' ? 'present' : 'ready' })), { id: 'screen', state: 'ready' }]
      : await inspect({ paths, permission: permission(), environment });
    const ready = checks.every(check => GOOD.has(check.state));
    const toolsReady = checks.filter(check => check.id !== 'screen').every(check => GOOD.has(check.state));
    startupReady ??= toolsReady;
    const screenGranted = startupPermission !== 'granted' && checks.some(check => check.id === 'screen' && check.state === 'ready');
    const restartRequired = screenGranted || changed || PATH_KEYS.some(key => paths[key] !== startup[key]) || (!startupReady && toolsReady);
    return { firstLaunch: showOnStart && !settings.completed, checks, paths, ready,
      canObserve: checks.filter(check => REQUIRED.includes(check.id)).every(check => GOOD.has(check.state)),
      restartRequired, busy: pending, problem: initial.problem || null, speech: await speech.status(paths) };
  }

  async function mutate(work) {
    if (pending) throw failure('TVLENS_SETUP_BUSY', 'Une opération d’installation est déjà en cours.');
    if (isBusy()) throw failure('TVLENS_SETUP_SESSION_ACTIVE', 'Ferme la session en cours avant de modifier l’installation.');
    pending = true;
    try { await work(); } finally { pending = false; }
    return status();
  }

  async function save(paths, completed = false, language = settings.transcriptionLanguage) {
    const next = { paths, completed, ...(language === undefined ? {} : { transcriptionLanguage: language }) };
    await store.save(next);
    settings = next;
  }

  async function select(key) {
    if (!PATH_KEYS.includes(key)) throw failure('TVLENS_SETUP_PATH_INVALID', 'Ce réglage ne peut pas être modifié.');
    return mutate(async () => {
      const directory = key === 'codexAuthHome';
      const selected = await choose({ title: directory ? 'Choisir le dossier de connexion Codex' : 'Choisir le fichier installé',
        properties: [directory ? 'openDirectory' : 'openFile', 'showHiddenFiles'] });
      if (selected.canceled) return;
      const file = selected.filePaths[0];
      let kind = 'executable';
      if (directory) kind = 'directory';
      if (key === 'whisperModel') kind = 'file';
      if (typeof file !== 'string' || !path.isAbsolute(file) || !await access(file, kind))
        throw failure('TVLENS_SETUP_PATH_INVALID', 'Choisis un fichier lisible ou un outil exécutable adapté.');
      await save({ ...settings.paths, [key]: file });
      changed = true;
    });
  }

  async function action(name, value) {
    if (Object.hasOwn(LINKS, name)) {
      await openSetupLink(name, { permission, requestScreen, simulated, openExternal });
      return status();
    }
    if (name === 'finish') return mutate(async () => {
      const current = await status();
      if (!current.ready || current.restartRequired)
        throw failure('TVLENS_SETUP_INCOMPLETE', 'Termine les étapes indiquées, puis vérifie à nouveau.');
      await save(settings.paths, true);
    });
    if (name === 'quit') {
      if (pending || isBusy()) throw failure('TVLENS_SETUP_BUSY', 'Termine l’opération ou ferme la session avant de quitter.');
      quit();
      return null;
    }
    if (['download-model', 'speech-language'].includes(name)) return mutate(async () => {
      await speech.configure(name, value);
      changed = true;
    });
    throw failure('TVLENS_SETUP_ACTION_INVALID', 'Action d’installation inconnue.');
  }

  return { status, select, action };
}

module.exports = { createMacSetup };
