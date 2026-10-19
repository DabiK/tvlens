const {
  simulatedVideoAgent,
  simulatedVerifier,
  simulatedRecap,
} = require("../adapters/simulated-providers.cjs");
const { createConversationRuntime, hasPendingQuestion } = require('../runtime/conversation-runtime.cjs');
const { createSessionTranscriber } = require('../runtime/session-providers.cjs');
const { createSessionRuntime, validateSegment } = require('../runtime/session-runtime.cjs');
const { createSurveillanceRuntime, tickSurveillance } = require('../runtime/surveillance-runtime.cjs');
const { closeSession, settleQuestions } = require('../runtime/session-closing.cjs');
const { isEmptySession } = require('../runtime/empty-session.cjs');
const { shouldPauseForStorageFull } = require('../runtime/capture-storage.cjs');
const { createQuestionCheckpoint } = require('../runtime/question-checkpoint.cjs');
const { createPublicationDiagnostic } = require('../runtime/publication-diagnostic.cjs');
const { warmUp } = require('../runtime/session-warm-up.cjs');
const { activeInstruction } = require('../runtime/active-instruction.cjs');
const { LivingRecap } = require('../core/living-recap.cjs');
const { createLivingRecapRuntime } = require('../runtime/memory/living-recap-runtime.cjs');
const { CodexRecap } = require('../adapters/codex-recap.cjs');
const { ViewingActions } = require('../core/viewing-actions.cjs');
const {SavedMoments}=require('../core/saved-moments.cjs');
const {SavedMomentStore}=require('../adapters/saved-moment-store.cjs');
const {ViewingSettings}=require('../adapters/viewing-settings.cjs');
const {CodexQuota}=require('../adapters/codex-quota.cjs');
const { app, BrowserWindow, globalShortcut, desktopCapturer, ipcMain, session, systemPreferences, shell, protocol, dialog, safeStorage, screen } = require('electron');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { SessionLibrary, sessionTitle } = require('../adapters/session-library.cjs');
const { DiskGuard } = require('../adapters/disk-guard.cjs');
const { SimulatedSurveillanceAgent } = require('../adapters/simulated-surveillance-agent.cjs');
const { sweepStaleContexts } = require('../adapters/codex-confinement.cjs');
const { cleanupCodexContexts } = require('../runtime/codex-cleanup.cjs');
const { ModelSettings, modelChoices } = require('../adapters/model-settings.cjs');
const { loadConfig } = require('../adapters/config.cjs');
const { UsageLedger } = require('../adapters/trial-budget.cjs');
const { VerificationService } = require('../core/verification.cjs');
const { CodexVerifier } = require('../adapters/codex-verifier.cjs');
const { VerificationArchive } = require('../adapters/verification-archive.cjs');
const { safeExternalUrl } = require('../adapters/external-links.cjs');
const { VideoBridge } = require('../adapters/video-bridge.cjs');
const { createWindowMode } = require('./window-mode.cjs');
const { createCaptureSources } = require('./capture-sources.cjs');
const { createMomentActions } = require('./moment-actions.cjs');
const { sessionRows: buildSessionRows } = require('./session-rows.cjs');
const fs = require('node:fs/promises');
const os = require('node:os');
if (process.platform === 'darwin') {
  // CoreAudio Tap peut livrer un flux muet sans erreur sous macOS 14.2+ ; ce repli ne vaut qu'en Electron 39–44.
  // Avant Electron 45, il faudra accorder et vérifier la permission Tap, ou choisir une autre voie de capture.
  const feature = 'MacCatapLoopbackAudioForScreenShare';
  const disabled = app.commandLine.getSwitchValue('disable-features').split(',').filter(Boolean);
  app.commandLine.appendSwitch('disable-features', [...new Set([...disabled, feature])].join(','));
}
// Mirrors the bound DeepAsk enforces on waiting questions; published so that the renderer carries no literal.
const QUESTION_QUEUE_LIMIT = 5;
let verifierAdapter, verification;
let surveillance, surveillanceTimer, storageTimer;
let recap, recapAdapter, recapTimer, recapConsumer, switching = false;
let deep, bridge, videoAgent;
let window, captureRefreshTimer, config, sessionsRoot, archiveOnQuit, closing = false;
let loaded = null;
const viewingActions = new ViewingActions({ makeId: randomUUID });
const smoke = !app.isPackaged && process.argv.includes('--smoke-test');
const liveInspection = smoke && process.argv.includes('--live-inspection');
const localInspection = smoke && process.argv.includes('--local-inspection');
app.setName('TVLens');
if (smoke) app.setPath('userData', path.join(require('node:os').tmpdir(), `tvlens-smoke-${process.pid}`));
protocol.registerSchemesAsPrivileged([{ scheme: 'tvlens-media', privileges: { standard: true, secure: true, stream: true } },{scheme:'tvlens-saved',privileges:{standard:true,secure:true,stream:true}}]);
if (!app.requestSingleInstanceLock()) app.quit();
else app.on('second-instance', () => { window?.show(); window?.focus(); });
app.whenReady().then(async () => {
  sessionsRoot = path.join(app.getPath('userData'), 'sessions');
  // A crash leaves private Codex trees behind, each holding links to the credentials. Swept once, off the
  // start path: it neither delays nor fails the launch. Saved sessions are never cleaned at start any more.
  void cleanupCodexContexts({ sweep: sweepStaleContexts, root: os.tmpdir(), log: line => console.error(line) });
  const arg = process.argv.find(x => x.startsWith('--config='))?.slice('--config='.length);
  const configPath = arg || (!app.isPackaged && (!smoke || liveInspection) ? path.join(__dirname, '..', '.env.local') : undefined);
  // The simulated and the fallback configuration keep the production default: a question may run five
  // minutes and must not withhold the visual description of what is captured meanwhile.
  config = smoke && !liveInspection ? { apiKey: '', model: 'test/fake', visionDuringAsk: true } : await loadConfig({ configPath, userData: app.getPath('userData'), safeStorage }).catch(() => ({ apiKey: '', model: 'google/gemini-2.5-flash-lite', audioInput: true, visionDuringAsk: process.env.TVLENS_VISION_DURING_ASK !== '0' }));
  // Reversible host settings, read from the environment of this start. Absent: the product default.
  // Mistyped: refused at start by the composition that uses it, never run under another value.
  const setting = name => process.env[name] ? Number(process.env[name]) : undefined;
  const megabytes = name => { const value = setting(name); if (value !== undefined && !(Number.isFinite(value) && value >= 0)) throw new Error(`Réglage ${name} invalide : nombre de mégaoctets positif ou nul attendu.`); return value === undefined ? undefined : value * 1024 ** 2; };
  config.questionTimeoutMs = setting('TVLENS_QUESTION_TIMEOUT_MS');
  const workers = setting('TVLENS_SURVEILLANCE_WORKERS');
  config.surveillance = { ...config.surveillance, ...(workers === undefined ? {} : { workers }) };
  // Durable retention never deletes to make room: below the floor, capture is refused and says why.
  // A simulated run only depends on the free space of its machine when a threshold is set for it.
  const guard = smoke && !process.env.TVLENS_DISK_MIN_FREE_MB && !process.env.TVLENS_DISK_WARN_FREE_MB ? null
    : new DiskGuard({ path: sessionsRoot, minFreeBytes: megabytes('TVLENS_DISK_MIN_FREE_MB'), warnFreeBytes: megabytes('TVLENS_DISK_WARN_FREE_MB') });
  const library = new SessionLibrary({ root: sessionsRoot, guard });
  const modelSettings = new ModelSettings(path.join(app.getPath('userData'),'models.json'));
  let selectedModels = await modelSettings.load({observationModel:'gpt-6-luna',inspectionModel:'gpt-6-luna',codexModel:config.codexModel||''});
  for(const key of ['observationModel','inspectionModel'])if(selectedModels[key].includes('/'))selectedModels[key]='gpt-6-luna';
  await modelSettings.save(selectedModels);
  config.model=selectedModels.observationModel; config.inspectionModel=selectedModels.inspectionModel;
  window = new BrowserWindow({
    width: 1340, height: 920, minWidth: 1000, minHeight: 720,
    backgroundColor: '#141716', title: 'TVLens',
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false }
  });
  const trusted = event => event.sender === window.webContents && event.senderFrame === window.webContents.mainFrame;
  const handle = (channel, fn) => ipcMain.handle(channel, (event, ...args) => {
    if (!trusted(event)) throw new Error('Unauthorized');
    return fn(...args);
  });
  const send = (channel, value) => { if (!window.isDestroyed()) window.webContents.send(channel, value); };
  const onPublicationError = createPublicationDiagnostic(line => console.error(line));
  const makeTranscriber = () => createSessionTranscriber({
    config, packaged: app.isPackaged, onPublicationError,
    onAvailability: () => publishSessionState(),
  });
  let transcriber = makeTranscriber();
  // Session transitions (start, pause, new, open, resume, delete, quit) never interleave: each one sees
  // the state the previous one left.
  let transition = Promise.resolve();
  const exclusive = fn => (...args) => { const run = transition.then(() => fn(...args)); transition = run.catch(() => {}); return run; };
  const savedArchive=new SavedMomentStore(path.join(app.getPath('userData'),'saved-moments'));
  const saved=new SavedMoments({archive:savedArchive,makeId:randomUUID});
  const keepMoment = async () => {
    if (!loaded) throw Error('Démarre une observation.');
    const value = await saved.keep({ snapshot: loaded.runtime.watch.snapshot(), media: loaded.runtime.store });
    window.webContents.send('saved:changed');
    return value;
  };
  handle('saved:keep',keepMoment);handle('saved:list',()=>saved.list());handle('saved:remove',id=>saved.remove(id));
  const viewingSettings=new ViewingSettings(path.join(app.getPath('userData'),'viewing-settings.json'));
  let viewing=await viewingSettings.load(),registeredShortcut;
  const registerShortcut=value=>{if(smoke&&!process.argv.includes('--live-shortcut'))return;if(!globalShortcut.register(value,()=>keepMoment().catch(e=>window.webContents.send('saved:error',e.message))))throw Error('Raccourci indisponible : choisis une autre combinaison.');if(registeredShortcut&&registeredShortcut!==value)globalShortcut.unregister(registeredShortcut);registeredShortcut=value;};
  try {
    registerShortcut(viewing.bookmarkShortcut);
  } catch {
    // Le raccourci peut être occupé : viewing:get expose shortcutRegistered=false et la bibliothèque permet de le changer.
  }
  handle('viewing:get',()=>({...viewing,shortcutRegistered:(smoke&&!process.argv.includes('--live-shortcut'))||Boolean(registeredShortcut)}));
  handle('viewing:save',async value=>{if(typeof value?.bookmarkShortcut!=='string'||value.bookmarkShortcut.length>100)throw Error('Raccourci invalide.');if(value.bookmarkShortcut!==registeredShortcut)registerShortcut(value.bookmarkShortcut);viewing=await viewingSettings.save(value);return viewing;});
  protocol.handle('tvlens-saved',request=>{try{const url=new URL(request.url);return savedArchive.response(url.hostname,url.pathname.slice(1),request.headers.get('range'));}catch{return new Response('Passage indisponible.',{status:404});}});
  const windowMode = createWindowMode({ window, screen });
  handle('window:mode', value => windowMode(value));
  const codexBinary = await findCodex();
  const quota=new CodexQuota();
  videoAgent = smoke && !process.argv.includes('--live-video-agent') ? simulatedVideoAgent() : undefined;
  const questionPending = () => deep.jobs.some(j => ['queued', 'running'].includes(j.status));
  // A question accepted while its session is being closed would be orphaned: it is refused for that instant.
  const ask = (question, options) => { if (switching) throw new Error('Changement de session en cours. Réessaie dans un instant.'); return deep.start(question, options); };
  // Durability of the questions, apart from their publication. A question that appears, leaves or changes
  // status is saved at once, final states included. Between two of those, the draft of a running answer is
  // pushed to the window each time and saved at most once a second, the latest state after that delay even
  // when the answer then stops moving. What waits is kept with the store of its own session: a save that
  // comes late never reaches the session loaded since, nor a sealed one.
  const questionSaves = createQuestionCheckpoint({
    setTimer: (fn, ms) => setTimeout(fn, ms),
    clearTimer: handle => clearTimeout(handle),
  });
  const conversation = createConversationRuntime({
    getSession: () => loaded?.runtime,
    // The viewer's standing instruction reaches a chat turn as a trusted field (late-bound: the surveillance is composed below).
    getInstruction: () => activeInstruction(surveillance, loaded?.runtime.watch.id),
    agent: videoAgent, codexBinary, config, selectedModels, quota,
    onPublicationError,
    onChange: state => {
      try {
        const watch = loaded?.runtime.watch;
        if (watch) watch.setQuestionPending(hasPendingQuestion(state.jobs, watch.id));
        if (state.jobs.some(j => ['running', 'queued'].includes(j.status))) recap?.tick({ busy: true });
        if (!window.isDestroyed()) window.webContents.send('deep:state', state);
      } finally {
        // La sauvegarde est tentée même quand la fenêtre refuse la notification.
        // Only the questions of the loaded session go into its folder: nothing leaks from one session to another.
        if (loaded) questionSaves.checkpoint(loaded.runtime.store, {
          ...state,
          jobs: state.jobs.filter(j => j.sessionId === undefined || j.sessionId === loaded.runtime.watch.id),
        });
      }
    },
  });
  videoAgent = conversation.agent;
  deep = conversation.deep;
  const momentActions = createMomentActions({ getSession: () => loaded, ask, viewingActions, deep });
  handle('moments:search', query => momentActions.search(query));
  // An external MCP context is opened on the loaded session, never on one that is being closed: the contexts of a
  // session are revoked as its end begins (endSession), and none may be opened on it again while that end is awaited.
  bridge = await new VideoBridge({ descriptor: path.join(app.getPath('userData'), 'mcp-bridge.json'), makeTools: (...input) => { if (switching) throw new Error('Changement de session en cours. Réessaie dans un instant.'); return conversation.makeTools(...input); } }).start();
  // Same factory as the server host. Its agent is never the chat agent nor the manual verification adapter:
  // a shared client would let a question serialise or cancel the surveillance. Questions and surveillance
  // run side by side; `probe` only feeds an informative overlap counter.
  surveillance = createSurveillanceRuntime({
    getSession: () => loaded?.runtime ?? null,
    agent: smoke && !process.argv.includes('--live-surveillance') ? new SimulatedSurveillanceAgent({ detectDelayMs: 200, verifyDelayMs: 1500 }) : undefined,
    codexBinary, config, selectedModels, quota,
    probe: () => ({ chatBusy: questionPending() }),
    onPublicationError,
    onChange: state => send('surveillance:state', state),
  });
  // The surveillance role owns its Codex clients; a new thread picks up a changed model or account.
  const surveillanceClients = () => [surveillance.agent.detector, ...(surveillance.agent.researchers || []).map(worker => worker.client)].filter(Boolean);
  surveillanceTimer = setInterval(() => tickSurveillance(surveillance, onPublicationError, {
    origin: 'mac', sessionId: loaded?.runtime.id,
  }), 1000);
  handle('surveillance:state', () => surveillance.snapshot());
  handle('surveillance:history', () => surveillance.snapshot({ full: true }));
  // Queued behind any session transition: an activation never binds to a session that is being closed.
  handle('surveillance:start', exclusive(input => {
    if (!loaded) throw new Error('Démarre une session avant d’activer la surveillance.');
    // A reopened archive receives no new passage: its registry is shown, not extended.
    if (loaded.runtime.readOnly) throw new Error('Session ouverte en lecture seule : reprends la capture pour activer la surveillance.');
    return surveillance.start({ instruction: input?.instruction });
  }));
  handle('surveillance:stop', () => surveillance.stop('Surveillance arrêtée.'));
  handle('surveillance:retry', claimId => surveillance.retry(claimId));
  handle('surveillance:open-source', input => {
    // Only a source the core kept on this lot, and only if it is a public https page.
    const url = safeExternalUrl(surveillance.surveillance.lots.find(lot => lot.id === input?.lotId)?.sources?.[input?.index]?.url);
    if (!url) throw new Error('Source indisponible.'); return shell.openExternal(url);
  });
  recap = new LivingRecap({throttleMs:smoke?1000:25000,
    summarize: input => recapAdapter.summarize(input),
    onChange: state => {
      if (!window.isDestroyed()) window.webContents.send('recap:state',state);
      // A reopened archive is displayed, never rewritten.
      if (state.sessionId && state.sessionId === loaded?.runtime.watch.id && !loaded.runtime.readOnly)
        loaded.runtime.store.saveRecap(state).catch(() => {});
    }
  });
  // No synthesis while an archive is only being read: a provider is called again after an explicit resume.
  recapTimer = setInterval(() => {
    if (loaded && !loaded.runtime.readOnly && !closing && !switching)
      recap.tick({ busy: Boolean(verification?.busy) || questionPending() }).catch(() => {});
  }, 1000);
  handle('recap:state',()=>recap.snapshot());
  handle('deep:open-source', ({jobId,index}) => {
    const source=deep.jobs.find(j=>j.id===jobId)?.result?.sources?.[index];
    const url=safeExternalUrl(source?.url); if(!url)throw new Error('Source indisponible.'); return shell.openExternal(url);
  });
  handle('deep:state', () => deep.snapshot());
  handle('codex:quota',()=>quota.snapshot());
  handle('deep:budget', () => new UsageLedger(config.researchBudgetFile || path.join(app.getPath('userData'), 'research-budget.json')).snapshot());
  handle('deep:cancel', id => deep.cancel('Recherche annulée.',id));
  handle('deep:ask', question => ask(question));
  verifierAdapter = smoke && !process.argv.includes('--live-verifier')
    ? simulatedVerifier()
    : new CodexVerifier({
        binary: codexBinary || 'codex',
        authHome: config.codexAuthHome,
        model: selectedModels.codexModel,
      });
  verification = new VerificationService({
    verifier: { verify: async input => {
      if (!smoke || process.argv.includes('--live-verifier')) {
        await videoAgent.prepare(loaded?.runtime.watch.id || 'verify-only');
        await quota.check(videoAgent.rpc);
      }
      return verifierAdapter.verify(input);
    } },
    archive: new VerificationArchive(path.join(app.getPath('userData'), 'verifications')),
    onChange: state => { if(state.busy)recap?.tick({busy:true});if (!window.isDestroyed()) window.webContents.send('verify:state', state); } });
  handle('verify:run', input => {
    if (!input || typeof input.claim !== 'string') throw new Error('Écris l’affirmation à vérifier.');
    return verification.verify({ claim: input.claim, context: 'Affirmation saisie ou corrigée explicitement par le spectateur. Elle peut provenir d’une transcription ou d’une réponse IA non vérifiée; rechercher des preuves indépendantes.' });
  });
  handle('verify:state', () => verification.snapshot());
  handle('verify:cancel', () => verifierAdapter.cancel?.());
  handle('verify:open-source', async input => {
    const job = verification.jobs.find(job => job.id === input?.jobId);
    const source = job?.result?.sources[input?.index];
    const url = safeExternalUrl(source?.url);
    if (!url) throw new Error('Ce lien de source ne peut pas être ouvert.');
    return shell.openExternal(url);
  });
  const segmentMs = smoke && !process.argv.includes('--live-observation') ? 1800 : 8000;
  // The ceiling really enforced and the retention really applied: the renderer derives its texts from them.
  const configuration = () => ({ hasKey:Boolean(config.apiKey),canObserve:Boolean(codexBinary)||smoke, model: config.model, codexModel:selectedModels.codexModel, audioInput: Boolean(config.audioInput) || smoke, verificationAvailable: Boolean(codexBinary) || smoke, segmentMs,
    transcription: (loaded?.runtime.transcriber || transcriber).availability(),
    questionTimeoutMs: deep.timeoutMs, questionQueueLimit: QUESTION_QUEUE_LIMIT, retention: 'until-deleted', retentionMs: null });
  handle('app:config', configuration);
  handle('models:get', () => selectedModels);
  handle('models:choices',()=>modelChoices(config.codexAuthHome));
  handle('models:save', async value => {
    selectedModels=await modelSettings.save(value);
    // In-flight jobs retain their invocation/model; new questions use the new selection.
    videoAgent.model=selectedModels.codexModel; verifierAdapter.model=selectedModels.codexModel;
    if(config.surveillance?.model===undefined)for(const client of surveillanceClients())client.model=selectedModels.codexModel;
    config.model=selectedModels.observationModel; config.inspectionModel=selectedModels.inspectionModel;
    return {settings:selectedModels,configuration:configuration()};
  });
  handle('app:import-config', async () => {
    const result = await dialog.showOpenDialog(window, { title: 'Sélectionner .env.local', properties: ['openFile', 'showHiddenFiles'] });
    if (!result.canceled) { const host = { questionTimeoutMs: config.questionTimeoutMs, surveillance: config.surveillance }; config = await loadConfig({ configPath: result.filePaths[0], userData: app.getPath('userData'), safeStorage }); Object.assign(config, host); config.model=selectedModels.observationModel;config.inspectionModel=selectedModels.inspectionModel;videoAgent.authHome=config.codexAuthHome;verifierAdapter.authHome=config.codexAuthHome;for(const client of surveillanceClients())client.authHome=config.codexAuthHome; }
    if (!result.canceled) transcriber = makeTranscriber();
    return configuration();
  });
  const captureSources = await createCaptureSources({
    smoke, desktopCapturer, systemPreferences, shell,
    preferenceFile: path.join(app.getPath('userData'), 'last-source.json'),
  });
  handle('capture:sources', () => captureSources.sources());
  handle('capture:select', id => captureSources.select(id));
  handle('capture:settings', () => captureSources.settings());
  // ---- Loaded session: one at a time, live or reopened read-only -------------------------------
  let storageShown = null;
  const ingestions = new Set();
  // La lecture explicite et le push partagent la projection ; une lecture garde ses ports publics frais.
  const sessionState = () => (loaded ? {
    ...loaded.runtime.memoryProjection.read().session, title: loaded.title, transcription: loaded.runtime.transcriber.availability(),
  } : null);
  const publishSessionState = () => {
    if (loaded && !closing && !switching) send('watch:state', sessionState());
  };
  const newRecapAdapter = () => smoke && !process.argv.includes('--live-recap')
    ? simulatedRecap()
    : new CodexRecap({
        binary: codexBinary || 'codex',
        authHome: config.codexAuthHome,
        model: selectedModels.observationModel,
        quota,
      });
  // One composition for a new session and for a reopened archive (`restore`): same layout, same guard.
  const compose = (id, restore) => {
    const runtime = createSessionRuntime({
      id, sessionsRoot, userData: app.getPath('userData'), config, selectedModels, codexBinary, quota, host: 'mac', guard, restore,
      transcriber, smoke, liveInspection, localInspection, liveObservation: process.argv.includes('--live-observation'),
      strategy: process.argv.find(a => a.startsWith('--inspection-strategy='))?.split('=')[1] || 'sheets-diverse',
      log: line => console.error(line),
      onPublicationError,
      onChange: () => {
        // Une invalidation appartient à cette vie de session, même si une archive reprend le même identifiant.
        if (loaded?.runtime === runtime) publishSessionState();
      },
    });
    return runtime;
  };
  const adopt = (runtime, name, at, fresh = false) => {
    loaded = { runtime, title: name, startedAt: at, fresh };
    saved.transcriber = runtime.transcriber;
    recapConsumer?.close();
    recapConsumer = createLivingRecapRuntime({
      id: runtime.id, recap,
      readView: runtime.memory.view,
      subscribe: runtime.events.subscribe,
      schedule: queueMicrotask,
      isBlocked: () => closing || switching || loaded?.runtime !== runtime,
      onError: onPublicationError,
      silent: runtime.readOnly,
    });
  };
  // L'horloge et la cadence du manifeste avancent même sans analyse prête.
  // En pause, aucun de ces faits ne change : la fenêtre garde le dernier état publié.
  const refreshCapture = () => {
    if (loaded?.runtime.watch.accepting) loaded.runtime.watch.emit();
  };
  // Same shape as the server host. The manifest of the session in memory is up to thirty seconds old, or
  // not written yet: its row carries the figures in memory instead.
  const sessionRows = async () => {
    const id = loaded?.runtime.watch.id || null;
    const sessions = await library.list({ current: loaded?.runtime.readOnly ? null : id });
    return buildSessionRows(sessions, loaded, Date.now());
  };
  // Disk state shared by sessions:list, sessions:storage and the storage:state event: what the library
  // measures, plus the pace of the loaded session. Nothing is ever deleted to make room.
  const storageInfo = async sessions => {
    const usage = await library.usage(sessions || (await sessionRows()).sessions);
    const { sessionBytes = 0, bytesPerMinute = null, remainingMinutes = null } = loaded?.runtime.storage() || {};
    storageShown = usage.state;
    return { ...usage, sessionBytes, bytesPerMinute, remainingMinutes };
  };
  // A publication that failed announced nothing: the next check publishes again.
  const publishStorage = () => storageInfo().then(storage => send('storage:state', storage)).catch(() => { storageShown = null; });
  // Pushed when the state changes (ok, low, blocked), from a cached measurement: never a tick of its own.
  // Marked as announced before the publication, which lists the sessions: a slow listing is not announced twice.
  if (guard) storageTimer = setInterval(async () => { const { state } = await guard.check(); if (state !== storageShown) { storageShown = state; publishStorage(); } }, 5000);
  // End of the loaded session for this host, by the protocol the server host follows too (session-closing.cjs):
  // its work stops in the order of this host, then it is archived whole. Nothing is purged, here or at quit;
  // `remove` is the explicit deletion of this one session and of nothing else. Every closing step is attempted
  // whatever the others did: an adapter that fails to close (recap, chat agent, surveillance, and inside the
  // runtime perception, inspection model, index) neither keeps the session from being archived nor leaves a
  // provider process behind. What failed goes to the journal, an archive the disk refused included: its folder
  // keeps what was last confirmed, and the list goes on showing the session as the manifest on disk says, cut
  // short when it was written during a capture.
  const endSession = async (reason, { remove = false } = {}) => {
    const ended = loaded?.runtime;
    switching = true;
    // A passage search still running ends with the session it was asked in: told through its signal as the end
    // begins, with the reason of this end. Its answer is refused once that session is no longer the one loaded.
    momentActions.cancelSearch(reason);
    try {
      const { freedBytes, refused } = await closeSession({
        session: ended, library, remove,
        empty: () => isEmptySession({
          fresh: loaded.fresh, jobs: deep.jobs.length, questions: ended.watch.questions.length,
          passages: ended.watch.snapshot().coverage.passages,
        }),
        // The external MCP contexts opened on this session end here, before anything is awaited: a call that arrives
        // while the session closes finds none of them, and one still running is refused instead of answered.
        begin: ['contextes MCP', () => ended && bridge?.revoke(ended.id)],
        steps: [
          ['résumé vivant', async () => {
            clearInterval(captureRefreshTimer);
            recapConsumer?.close();
            recapConsumer = null;
            try {
              recap.reset();
              await recapAdapter?.close?.();
            } finally {
              recapAdapter = null;
            }
          }],
          // The last surveillance states reach the session folder before the session closes.
          ['surveillance', () => surveillance.reset(reason)],
          // Final states are saved as they are published; whatever still waited for its second is handed over too,
          // before the session is archived or sealed.
          ['questions', () => settleQuestions(deep, reason, () => questionSaves.flush())],
          ['agent de chat', () => videoAgent.close?.()],
          // A passage being stored lands first; only a capture still running is stopped.
          ['capture', async () => { await Promise.allSettled([...ingestions]); if (ended?.watch.accepting) await ended.pause(); }],
        ],
        // Whatever happened above, the host is left without a session.
        letGo: () => {
          loaded = null;
          // Nothing of this session waits past this point: a timer left behind would have nothing to write.
          questionSaves.forget();
          viewingActions.reset();
          deep.jobs = [];
          deep.emit({ sessionId: ended?.id });
          recap.reset();
        },
        log: line => console.error(line),
      });
      // An explicit deletion that did not happen, and an end this host could not let go of its session for, are said
      // to whoever asked; an empty session or an archive the disk refused never blocks the host.
      if (refused) throw refused;
      return { freedBytes };
    } finally {
      // Whatever happened, the renderer is told that the host is left without a session.
      switching = false;
      send('watch:reset'); send('sessions:changed');
    }
  };
  archiveOnQuit = exclusive(() => endSession('Application fermée.'));
  handle('watch:start', exclusive(async () => {
    if (loaded?.runtime.watch.accepting) throw new Error('Une session est déjà active.');
    // Capture never restarts inside an archive without the explicit gesture.
    if (loaded?.runtime.readOnly) throw new Error('Session ouverte en lecture seule. Choisis Reprendre la capture ou Nouvelle session.');
    // Start and resume are refused on a fresh measurement while the disk is blocked, before anything changes.
    if (loaded) {
      await loaded.runtime.resume().catch(error => {
        publishStorage();
        throw error;
      });
      send('sessions:changed');
      return { id: loaded.runtime.watch.id, elapsedMs: loaded.runtime.watch.now(), segmentMs };
    }
    if (!codexBinary && !smoke) throw new Error('Installe Codex et connecte ton compte.');
    await guard?.assertRoom().catch(error => { publishStorage(); throw error; });
    const id = randomUUID(), at = Date.now(), runtime = compose(id);
    // Additive title: the captured source and the start date are what a viewer recognises in a list. Set
    // in memory only: the first manifest written by the runtime carries it.
    const sourceName = captureSources.capturedSourceName();
    const name = sourceName ? `${sourceName.slice(0, 80)} · ${sessionTitle(at).replace(/^Session du /, '')}` : sessionTitle(at);
    runtime.store.manifest = { ...runtime.store.manifest, title: name };
    recap.reset(id); recapAdapter = newRecapAdapter();
    adopt(runtime, name, at, true);
    captureRefreshTimer = setInterval(refreshCapture, 5000);
    loaded.runtime.watch.emit();
    // Never for an archive that is only being read: opening one warms nothing up.
    warmUp({ chat: videoAgent, perception: loaded.runtime.perception, sessionId: id });
    send('sessions:changed');
    return { id, elapsedMs: loaded.runtime.watch.now(), segmentMs };
  }));
  handle('watch:ingest', async input => {
    if (!loaded || input?.sessionId !== loaded.runtime.watch.id) throw new Error('Session obsolète.');
    validateSegment(input, loaded.runtime.watch.now());
    const session = loaded.runtime;
    const work = loaded.runtime.watch.ingest(input);
    ingestions.add(work);
    try { return await work; }
    catch (error) {
      // Out of room: nothing was stored and nothing is deleted. The session clock stops with the capture.
      if (shouldPauseForStorageFull({ code: error?.code, session, currentSession: loaded?.runtime })) {
        await session.pause().catch(() => {});
        publishStorage();
      }
      throw error;
    } finally { ingestions.delete(work); }
  });
  handle('watch:stop', exclusive(async () => {
    if (!loaded) return;
    await loaded.runtime.pause();
    send('sessions:changed');
  }));
  handle('watch:new', exclusive(async () => {
    if (loaded?.runtime.watch.accepting || loaded?.runtime.watch.running)
      throw new Error('Arrête la capture et attends la fin de son analyse.');
    await endSession('Nouvelle session.');
    return true;
  }));
  handle('sessions:list', async () => { const listed = await sessionRows(); return { ...listed, storage: await storageInfo(listed.sessions) }; });
  handle('sessions:storage', () => storageInfo());
  handle('sessions:open', exclusive(async id => {
    // Same conditions as a new session: never while capturing or analysing.
    if (loaded?.runtime.watch.accepting || loaded?.runtime.watch.running)
      throw new Error('Arrête la capture et attends la fin de son analyse.');
    if (loaded?.runtime.readOnly && id === loaded.runtime.watch.id)
      return { id, readOnly: true, elapsedMs: loaded.runtime.watch.now() };
    // Read before anything is closed: an unknown or unreadable archive leaves the loaded session as it is.
    let archive = id === loaded?.runtime.watch.id ? (library.dir(id), null) : await library.read(id);
    await endSession('Changement de session.');
    archive ||= await library.read(id);
    const runtime = compose(id, { snapshot: archive.snapshot, inventory: archive.inventory, manifest: archive.manifest, createdAt: archive.summary.createdAt });
    // Silent restores: opening writes nothing and calls no provider. The questions in memory are replaced
    // by those of this archive, so none can leak into another session.
    deep.restore(archive.chat?.jobs || []);
    recap.restore(archive.recap?.sessionId === id ? archive.recap : { sessionId: id });
    adopt(runtime, archive.summary.title, archive.summary.createdAt);
    surveillance.restore(archive.surveillance?.sessionId === id ? archive.surveillance : null);
    // The renderer shows an archive through the same states as a live session.
    loaded.runtime.watch.emit();
    send('deep:state', deep.snapshot());
    send('recap:state', recap.snapshot());
    send('surveillance:state', surveillance.snapshot());
    send('sessions:changed');
    return { id, readOnly: true, elapsedMs: loaded.runtime.watch.now() };
  }));
  handle('sessions:resume', exclusive(async () => {
    if (!loaded?.runtime.readOnly) throw new Error('Aucune session ouverte en lecture seule à reprendre.');
    if (!codexBinary && !smoke) throw new Error('Installe Codex et connecte ton compte.');
    // Ready before the session stops being read-only: the next recap tick may run at once.
    recapAdapter ||= newRecapAdapter();
    // The explicit gesture that lets capture write into this archive again; refused while the disk is blocked.
    await loaded.runtime.resume().catch(error => {
      publishStorage();
      throw error;
    });
    clearInterval(captureRefreshTimer); captureRefreshTimer = setInterval(refreshCapture, 5000);
    // Same as at the start: never for an archive that is only being read.
    warmUp({ chat: videoAgent, perception: loaded.runtime.perception, sessionId: loaded.runtime.watch.id });
    send('sessions:changed');
    return { id: loaded.runtime.watch.id, elapsedMs: loaded.runtime.watch.now(), segmentMs };
  }));
  handle('sessions:delete', exclusive(async id => {
    library.dir(id);
    let freedBytes;
    if (id === loaded?.runtime.watch.id) {
      if (loaded.runtime.watch.accepting) throw new Error('Arrête la capture avant de supprimer cette session.');
      // Kept moments and past verifications live outside the session folder and are not deleted with it.
      ({ freedBytes } = await endSession('Session supprimée.', { remove: true }));
    } else { ({ freedBytes } = await library.remove(id)); send('sessions:changed'); }
    publishStorage();
    return { deleted: true, freedBytes };
  }));
  handle('watch:ask', question => {
    if (!loaded) throw new Error('Démarre une session avant de poser une question.');
    return ask(question, {mode:'chat'});
  });
  handle('moments:freeze', value => momentActions.freeze(value));
  handle('moments:mark', () => momentActions.mark());
  handle('moments:explain', input => momentActions.explain(input));
  handle('moments:catch-up', input => momentActions.catchUp(input));
  handle('moments:reexamine', jobId => momentActions.reexamine(jobId));
  const explainShortcut = 'CommandOrControl+Shift+E';
  let explainShortcutRegistered = false;
  if (!smoke || process.argv.includes('--live-shortcut')) {
    explainShortcutRegistered = globalShortcut.register(explainShortcut, () => {
      try {
        const frozen = viewingActions.freeze(loaded?.runtime.memory.view());
        window.show();
        window.webContents.send('moments:explain-requested', frozen);
      } catch (error) { window.webContents.send('saved:error', error.message); }
    });
  }
  handle('moments:shortcuts', () => ({ explainShortcut, explainShortcutRegistered }));
  handle('watch:state', sessionState);
  // tvlens-media://<session>/<moment-N> serves any passage of the loaded session whose media exists, archive
  // included; tvlens-media://<session>/thumb/<moment-N> serves its thumbnail, which outlives the media.
  protocol.handle('tvlens-media', async request => {
    const gone = () => new Response('Passage indisponible.', { status: 404 });
    try {
      const url = new URL(request.url), [first, second, extra] = url.pathname.slice(1).split('/');
      if (!loaded || url.hostname !== loaded.runtime.watch.id || extra !== undefined) return gone();
      if (first === 'thumb') {
        if (!/^moment-\d+$/.test(second) ||
          ![...loaded.runtime.watch.history, ...loaded.runtime.watch.segments].some(s => s.id === second && s.thumbnailAvailable)) return gone();
        return new Response(await loaded.runtime.thumbnails.read(second), { headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'no-store' } });
      }
      if (second !== undefined || !/^moment-\d+$/.test(first) ||
        !loaded.runtime.watch.segments.some(s => s.id === first && s.available)) return gone();
      return loaded.runtime.store.response(first, request.headers.get('range'));
    } catch { return gone(); }
  });
  session.defaultSession.setDisplayMediaRequestHandler((request, callback) => {
    const source = captureSources.takeSelectedSource();
    if (!source || request.frame !== window.webContents.mainFrame) return callback({});
    callback({ video: source, audio: 'loopback' });
  });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', event => event.preventDefault());
  await window.loadFile(path.join(__dirname, 'index.html'));
}).catch(error => {
  // A refused setting, like any failed start, is said in plain words instead of leaving a blank window.
  console.error(error);
  if (!smoke) dialog.showErrorBox('TVLens ne peut pas démarrer', String(error?.message || error));
  app.quit();
});
async function findCodex() {
  const candidates = [path.join(os.homedir(), '.local', 'bin', 'codex'), '/opt/homebrew/bin/codex', '/usr/local/bin/codex', ...(process.env.PATH || '').split(path.delimiter).filter(Boolean).map(dir => path.join(dir, 'codex'))];
  for (const candidate of candidates) {
    try {
      await fs.access(candidate, require('node:fs').constants.X_OK);
      return candidate;
    } catch {
      // Un chemin absent ou non exécutable n'épuise pas la recherche ; sans candidat accessible, null désactive Codex dans l'interface.
    }
  }
  return null;
}
app.on('window-all-closed', () => app.quit());
app.on('before-quit', event => {
  if (closing) return;
  event.preventDefault(); closing = true;
  for (const timer of [captureRefreshTimer, recapTimer, surveillanceTimer, storageTimer]) clearInterval(timer);
  globalShortcut.unregisterAll();
  verifierAdapter?.cancel?.();
  // Quitting archives the loaded session like "Nouvelle session" does: nothing is purged, now or at the next start.
  Promise.resolve().then(() => archiveOnQuit?.()).catch(() => {}).then(() => Promise.allSettled([surveillance?.close('Application fermée.'), bridge?.close()])).finally(() => app.quit());
});
