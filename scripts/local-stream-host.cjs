const fs = require('node:fs/promises');
const path = require('node:path');
const { randomBytes } = require('node:crypto');
const { HeadlessRuntime } = require('../runtime/headless-runtime.cjs');
const { RemoteServer } = require('../server/http.cjs');
const { RemoteMedia } = require('../adapters/remote-media.cjs');
const { TranscriptionSettings } = require('../adapters/transcription-settings.cjs');
const { loadConfig } = require('../adapters/config.cjs');
const { bounded, REQUEST_MS } = require('./local-stream-transport.cjs');
const { createWebRetrieval } = require('../runtime/local-web-retrieval.cjs');
const { webSettingsOf } = require('./local-stream-web.cjs');

const realClock = { now: () => performance.now(), setTimer: (fn, ms) => setTimeout(fn, ms), clearTimer: timer => clearTimeout(timer) };
// The scenario's corpus is a path below its own folder; the imported one is kept as configured. Merged field by field
// like the local roles, and only when one of them declares it: no empty setting is invented.
function mergedWeb(imported, scenarioWeb, scenarioPath) {
  if (!imported.localWeb && !scenarioWeb) return {};
  const corpus = scenarioWeb?.corpus === undefined ? {} : { corpus: path.resolve(path.dirname(scenarioPath), scenarioWeb.corpus) };
  return { localWeb: { ...imported.localWeb, ...scenarioWeb, ...corpus } };
}
// The report keeps what the composed retrieval really is, never its path or address.
function observedWebRetrieval(report, config, factory = createWebRetrieval) {
  report.webRetrieval = webSettingsOf(config);
  return localWeb => {
    const port = factory(localWeb);
    if (report.webRetrieval) report.webRetrieval.residence = port?.residence ?? null;
    return port;
  };
}
// A client that knows nothing of the source starts with an empty body, as the TV does.
const startBody = ({ sourceTitle }) => (sourceTitle === undefined ? '{}' : JSON.stringify({ sourceTitle }));
async function createHost(options, dependencies, loaded, report) {
  const root = path.join(options.outputDir, 'data'), sourceClock = dependencies.clock || realClock;
  await fs.mkdir(root, { mode: 0o700 });
  const imported = dependencies.config || await loadConfig({ configPath: options.configPath || path.resolve('.env'), userData: root,
    safeStorage: { isEncryptionAvailable: () => false } });
  const config = { ...imported, ...loaded.scenario.config, researchBudgetFile: path.join(root, 'research-budget.json'),
    budgetFile: path.join(root, 'trial-budget.json') };
  for (const role of ['localVlm', 'localQuestions', 'localEmbeddings'])
    config[role] = { ...imported[role], ...loaded.scenario.config[role] };
  delete config.localWeb;
  Object.assign(config, mergedWeb(imported, loaded.scenario.config.localWeb, options.scenarioPath));
  let origin = null, wallOrigin = null;
  const wallClock = dependencies.wallClock || Date.now;
  const readClock = () => {
    if (origin === null) { origin = sourceClock.now(); wallOrigin = wallClock(); }
    return sourceClock.now();
  };
  const runtimeOptions = dependencies.runtimeOptions || {};
  let diagnosticsOpen = true;
  const runtime = new HeadlessRuntime({ ...runtimeOptions, config, userData: root, sessionsRoot: path.join(root, 'sessions'),
    createWebRetrieval: observedWebRetrieval(report, config, runtimeOptions.createWebRetrieval),
    selectedModels: loaded.scenario.selectedModels, smoke: false, readClock, wallClock,
    transcriptionSettings: new TranscriptionSettings(path.join(root, 'transcription.json')),
    log: line => {
      if (diagnosticsOpen) report.diagnostics.push({ atMs: sourceClock.now() - (origin ?? sourceClock.now()), message: String(line) });
    },
    onTrace: () => {} });
  const token = randomBytes(32).toString('hex');
  const server = new RemoteServer({ runtime, token, media: dependencies.media || new RemoteMedia({ ffmpeg: config.ffmpeg }),
    logError: ({ error }) => { if (diagnosticsOpen) report.diagnostics.push({ code: error.code || 'TVLENS_REPLAY_HTTP_ERROR' }); } });
  const exchange = async (route, { raw, signal }) => {
    const response = await fetch(server.url + route, { method: raw === undefined ? 'GET' : 'POST', signal,
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, body: raw });
    return { status: response.status, value: await response.json() };
  };
  try {
    await server.listen(0, '127.0.0.1');
    const start = await bounded(signal => exchange('/v1/session/start', { raw: startBody(loaded.scenario), signal }), REQUEST_MS, sourceClock, options.signal);
    if (start.status !== 200) throw Object.assign(Error('Démarrage de session refusé.'), { code: start.value.code });
    report.sessionId = start.value.id;
    report.clocks = { monotonicOriginMs: origin, wallOriginMs: wallOrigin, sessionOriginMs: 0,
      relation: 'temps relatif = monotone − origine ; mural serveur = origine murale + temps relatif, hors ajustement système',
      fields: { plannedAtMs: 'session', submittedAtMs: 'session', finishedAtMs: 'session', anchorMs: 'session',
        'questions.metrics': 'durées murales produit' } };
    return { runtime, server, runtimeOptions, sourceClock, sealDiagnostics: () => { diagnosticsOpen = false; },
      clock: { ...sourceClock, now: () => sourceClock.now() - origin },
      exchange: dependencies.exchange ? (route, input) => dependencies.exchange(route, input, exchange) : exchange };
  } catch (error) {
    await server.close();
    await runtime.close();
    throw error;
  }
}
module.exports = { createHost };
