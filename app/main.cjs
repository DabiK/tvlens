const {CachedInspector}=require('../core/cached-inspector.cjs');
const {AutoMonitor}=require('../core/auto-monitor.cjs');
const {SavedMoments}=require('../core/saved-moments.cjs');
const {SavedMomentStore}=require('../adapters/saved-moment-store.cjs');
const {ViewingSettings}=require('../adapters/viewing-settings.cjs');
const {CodexQuota}=require('../adapters/codex-quota.cjs');
const { app, BrowserWindow, globalShortcut, desktopCapturer, ipcMain, session, systemPreferences, shell, protocol, dialog, safeStorage, screen } = require('electron');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { WatchSession } = require('../core/session.cjs');
const { CodexPerception } = require('../adapters/codex-perception.cjs');
const { LocalTranscriber } = require('../adapters/local-transcriber.cjs');
const { SessionClock } = require('../core/session-clock.cjs');
const { LocalSessionStore, cleanupRawMedia } = require('../adapters/local-store.cjs');
const { ModelSettings, modelChoices } = require('../adapters/model-settings.cjs');
const { loadConfig } = require('../adapters/config.cjs');
const { TrialBudget, ResearchBudget } = require('../adapters/trial-budget.cjs');
const { VerificationService } = require('../core/verification.cjs');
const { CodexVerifier } = require('../adapters/codex-verifier.cjs');
const { VerificationArchive } = require('../adapters/verification-archive.cjs');
const { safeExternalUrl } = require('../adapters/external-links.cjs');
const { MomentSearch } = require('../core/moment-search.cjs');
const { VideoTools } = require('../core/video-tools.cjs');
const { DeepAsk } = require('../core/deep-ask.cjs');
const { EmbeddingStore } = require('../adapters/embedding-store.cjs');
const { OpenRouterEmbeddings, EMBEDDING_MODEL } = require('../adapters/openrouter-embeddings.cjs');
const { ClipInspector } = require('../adapters/clip-inspector.cjs');
const { inspectionStrategy } = require('../adapters/inspection-strategies.cjs');
const { VideoBridge } = require('../adapters/video-bridge.cjs');
const { CodexSessionAgent } = require('../adapters/codex-session-agent.cjs');
const fs = require('node:fs/promises');
const os = require('node:os');
let verifierAdapter, verification;
let auto,autoAgent,autoTimer;
let deep, bridge, search, inspector, videoAgent, perception, inspectorModel, sessionClock;
let window, watch, store, pruneTimer, config, sessionsRoot, closing = false;
let sources = [], selectedId;
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
  await cleanupRawMedia(sessionsRoot);
  const arg = process.argv.find(x => x.startsWith('--config='))?.slice('--config='.length);
  const configPath = arg || (!app.isPackaged && (!smoke || liveInspection) ? path.join(__dirname, '..', '.env.local') : undefined);
  config = smoke && !liveInspection ? { apiKey: '', model: 'test/fake' } : await loadConfig({ configPath, userData: app.getPath('userData'), safeStorage }).catch(() => ({ apiKey: '', model: 'google/gemini-2.5-flash-lite', audioInput: true }));
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
  const savedArchive=new SavedMomentStore(path.join(app.getPath('userData'),'saved-moments'));
  const saved=new SavedMoments({archive:savedArchive,makeId:randomUUID});
  const keepMoment=async()=>{if(!watch)throw Error('Démarre une observation.');const value=await saved.keep({snapshot:watch.snapshot(),media:store});window.webContents.send('saved:changed');return value;};
  handle('saved:keep',keepMoment);handle('saved:list',()=>saved.list());handle('saved:remove',id=>saved.remove(id));
  const viewingSettings=new ViewingSettings(path.join(app.getPath('userData'),'viewing-settings.json'));
  let viewing=await viewingSettings.load(),registeredShortcut;
  const registerShortcut=value=>{if(smoke&&!process.argv.includes('--live-shortcut'))return;if(!globalShortcut.register(value,()=>keepMoment().catch(e=>window.webContents.send('saved:error',e.message))))throw Error('Raccourci indisponible : choisis une autre combinaison.');if(registeredShortcut&&registeredShortcut!==value)globalShortcut.unregister(registeredShortcut);registeredShortcut=value;};
  try{registerShortcut(viewing.bookmarkShortcut);}catch{}
  handle('viewing:get',()=>({...viewing,shortcutRegistered:(smoke&&!process.argv.includes('--live-shortcut'))||Boolean(registeredShortcut)}));
  handle('viewing:save',async value=>{if(typeof value?.bookmarkShortcut!=='string'||value.bookmarkShortcut.length>100)throw Error('Raccourci invalide.');if(value.bookmarkShortcut!==registeredShortcut)registerShortcut(value.bookmarkShortcut);viewing=await viewingSettings.save(value);return viewing;});
  let searchController;
  handle('moments:search',async query=>{
   if(!watch||!search)throw Error('Démarre une observation.');searchController?.abort();searchController=new AbortController();const signal=AbortSignal.any([searchController.signal,AbortSignal.timeout(15000)]);
   const state=watch.snapshot(),all=[...state.history,...state.segments];const found=await search.search({query,segments:all,anchorMs:state.capturedThroughMs,signal,limit:6});
   return {...found,sessionId:state.id,moments:await Promise.all(found.moments.map(async m=>({...m,preview:m.available?(await store.read(m.id).catch(()=>null))?.frames?.[0]?.dataUrl:null})))};
  });
  protocol.handle('tvlens-saved',request=>{try{const url=new URL(request.url);return savedArchive.response(url.hostname,url.pathname.slice(1),request.headers.get('range'));}catch{return new Response('Passage indisponible.',{status:404});}});
  let fullBounds = window.getBounds(), floating = false;
  handle('window:mode', value => {
    if(!value || typeof value.floating!=='boolean' || typeof value.expanded!=='boolean')throw new Error('Mode de fenêtre invalide.');
    if(value.floating){
      if(!floating)fullBounds=window.getBounds();
      window.setMinimumSize(360,80); window.setAlwaysOnTop(true,'floating');
      const area=screen.getDisplayMatching(window.getBounds()).workArea;
      const height=value.expanded?Math.min(600,area.height):92;
      const old=window.getBounds();
      window.setBounds({x:Math.max(area.x,Math.min(floating?old.x:area.x+area.width-440,area.x+area.width-420)),y:Math.max(area.y,Math.min(floating?old.y:area.y+60,area.y+area.height-height)),width:420,height});
    }else{window.setAlwaysOnTop(false);window.setMinimumSize(1000,720);window.setBounds(fullBounds);}
    floating=value.floating;return value;
  });
  const codexBinary = await findCodex();
  const makeTools = (signal, onProgress) => {
    if (!watch || !search || !inspector) throw new Error('Démarre une observation dans TVLens.');
    return new VideoTools({ snapshot: watch.snapshot(), search, inspector, media: store, signal, onProgress });
  };
  bridge = await new VideoBridge({ descriptor: path.join(app.getPath('userData'), 'mcp-bridge.json'), makeTools }).start();
  const quota=new CodexQuota();
  videoAgent = smoke && !process.argv.includes('--live-video-agent') ? {
    answer: async ({ question, tools, signal }) => {
      const found = await tools.call('search_moments', { query: question });
      await new Promise((resolve, reject) => { const timer = setTimeout(resolve, 2500); signal.addEventListener('abort', () => { clearTimeout(timer); reject(signal.reason); }, { once: true }); });
      const moment = found.moments[0];
      const result = await tools.call('inspect_clip', { startMs: moment.startMs, endMs: moment.endMs, question });
      return { answer: result.observations.map(o => o.text).join(' '), kind: 'observation', citations: result.observations.map(({ id, startMs, endMs }) => ({ id, startMs, endMs })), limits: [] };
    }
  } : new CodexSessionAgent({ binary: codexBinary || 'codex', authHome: config.codexAuthHome, model:selectedModels.codexModel, bridge, quota });
  deep = new DeepAsk({ makeTools, agent: videoAgent, onChange: state => {
    if(watch){const busy=state.jobs.some(j=>j.sessionId===watch.id&&['running','queued'].includes(j.status));if(watch.asking!==busy){watch.asking=busy;watch.emit();if(!busy)queueMicrotask(()=>watch?.drain());}}
    if (!window.isDestroyed()) window.webContents.send('deep:state', state);
    store?.saveResearch(state).catch(() => {});
  } });
  autoAgent=smoke&&!process.argv.includes('--live-video-agent')?videoAgent:new CodexSessionAgent({binary:codexBinary||'codex',authHome:config.codexAuthHome,model:selectedModels.codexModel,quota});
  auto=new AutoMonitor({onChange:state=>{if(!window.isDestroyed())window.webContents.send('auto:state',state);store?.saveAuto?.(state).catch(()=>{});},evaluate:async({instruction,snapshot,signal,recent,onProgress})=>{
   const runner=new DeepAsk({agent:{answer:input=>autoAgent.answer({...input,question:`Surveillance Auto : ${input.question}. Seulement les nouveaux passages fournis ; aucun fait antérieur à l’activation. Relie toute alerte à ses citations vidéo. Si rien ne répond à la consigne, kind=insufficient. Évite les doublons avec ${JSON.stringify(recent)}. Vérifie sur le web si demandé, sans transformer une accusation en fait établi.`})},makeTools:(sig,progress)=>new VideoTools({snapshot,search,inspector,media:store,signal:sig,onProgress:progress}),onChange:state=>{const j=state.jobs.at(-1);if(j)onProgress(j.message);}});
   const abort=()=>runner.cancelAll('Auto suspendu : priorité manuelle.');signal.addEventListener('abort',abort,{once:true});
   try{if(signal.aborted)throw signal.reason;runner.start(instruction,{mode:'chat'});await runner.jobs[0].done;signal.throwIfAborted();return runner.jobs[0].result;}finally{signal.removeEventListener('abort',abort);}
  }});
  autoTimer=setInterval(()=>auto.tick(watch?.snapshot(),deep.jobs.some(j=>['queued','running'].includes(j.status))).catch(()=>{}),1000);
  handle('auto:state',()=>auto.snapshot());handle('auto:start',async input=>{if(!watch)throw Error('Démarre une session.');auto.stop();if(autoAgent!==videoAgent)await autoAgent.close?.();auto.configure(input,watch.snapshot());return auto.snapshot();});handle('auto:stop',()=>auto.stop());
  handle('auto:open-source',({id,index})=>{const url=safeExternalUrl(auto.results.find(r=>r.id===id)?.result?.sources?.[index]?.url);if(!url)throw Error('Source indisponible.');return shell.openExternal(url);});
  handle('deep:open-source', ({jobId,index}) => {
    const source=deep.jobs.find(j=>j.id===jobId)?.result?.sources?.[index];
    const url=safeExternalUrl(source?.url); if(!url)throw new Error('Source indisponible.'); return shell.openExternal(url);
  });
  handle('deep:state', () => deep.snapshot());
  handle('codex:quota',()=>quota.snapshot());
  handle('deep:budget', () => new ResearchBudget(config.researchBudgetFile || path.join(app.getPath('userData'), 'research-budget.json')).snapshot());
  handle('deep:cancel', id => deep.cancel('Recherche annulée.',id));
  handle('deep:ask', question => {auto?.prioritizeManual();return deep.start(question);});
  verifierAdapter = smoke && !process.argv.includes('--live-verifier') ? {
    verify: async ({ claim }) => {
      await new Promise(resolve => setTimeout(resolve, 2500));
      if (claim === 'FAIL_TEST') throw new Error('Recherche indisponible (test).');
      return { normalizedClaim: claim, assessment: 'contradicted', conclusion: 'Apollo 11 a aluni en 1969, selon la NASA.',
        sources: [{ url: 'https://www.nasa.gov/mission/apollo-11/', title: 'Apollo 11', publisher: 'NASA', publishedAt: null, evidence: 'La NASA date la mission de juillet 1969.', relation: 'contradicts' }], limitations: [], research: { provider: 'test/fake', webSearches: 1, elapsedMs: 2500 } };
    }
  } : new CodexVerifier({ binary: codexBinary || 'codex', authHome: config.codexAuthHome, model:selectedModels.codexModel });
  verification = new VerificationService({ verifier: {verify:async input=>{if(!smoke||process.argv.includes('--live-verifier')){await videoAgent.prepare(watch?.id||'verify-only');await quota.check(videoAgent.rpc);}return verifierAdapter.verify(input);}},
    archive: new VerificationArchive(path.join(app.getPath('userData'), 'verifications')),
    onChange: state => { if (!window.isDestroyed()) window.webContents.send('verify:state', state); } });
  handle('verify:run', input => {
    if (!input || typeof input.claim !== 'string') throw new Error('Écris l’affirmation à vérifier.');
    auto?.prioritizeManual();return verification.verify({ claim: input.claim, context: 'Affirmation saisie ou corrigée explicitement par le spectateur. Elle peut provenir d’une transcription ou d’une réponse IA non vérifiée; rechercher des preuves indépendantes.' });
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
  const configuration = () => ({ hasKey:Boolean(config.apiKey),canObserve:Boolean(codexBinary)||smoke, model: config.model, codexModel:selectedModels.codexModel, audioInput: Boolean(config.audioInput) || smoke, verificationAvailable: Boolean(codexBinary) || smoke, segmentMs: smoke && !process.argv.includes('--live-observation') ? 1800 : 8000, retentionMs: 300000 });
  handle('app:config', configuration);
  handle('models:get', () => selectedModels);
  handle('models:choices',()=>modelChoices(config.codexAuthHome));
  handle('models:save', async value => {
    selectedModels=await modelSettings.save(value);
    // In-flight jobs retain their invocation/model; new questions use the new selection.
    videoAgent.model=selectedModels.codexModel; verifierAdapter.model=selectedModels.codexModel;if(autoAgent)autoAgent.model=selectedModels.codexModel;
    config.model=selectedModels.observationModel; config.inspectionModel=selectedModels.inspectionModel;
    return {settings:selectedModels,configuration:configuration()};
  });
  handle('app:import-config', async () => {
    const result = await dialog.showOpenDialog(window, { title: 'Sélectionner .env.local', properties: ['openFile', 'showHiddenFiles'] });
    if (!result.canceled) { config = await loadConfig({ configPath: result.filePaths[0], userData: app.getPath('userData'), safeStorage }); config.model=selectedModels.observationModel;config.inspectionModel=selectedModels.inspectionModel;videoAgent.authHome=config.codexAuthHome;verifierAdapter.authHome=config.codexAuthHome; }
    return configuration();
  });
  handle('capture:sources', async () => {
    if (smoke) return { permission: 'granted', sources: [{ id: 'test-source', name: 'Synthetic test video' }] };
    sources = await desktopCapturer.getSources({ types: ['window', 'screen'], thumbnailSize: { width: 0, height: 0 } });
    return { permission: systemPreferences.getMediaAccessStatus('screen'), sources: sources.filter(s => s.name !== 'TVLens').map(s => ({ id: s.id, name: s.name })) };
  });
  handle('capture:select', id => {
    if (smoke && id === 'test-source') return;
    if (!sources.some(s => s.id === id && s.name !== 'TVLens')) throw new Error('Source indisponible');
    selectedId = id;
  });
  handle('capture:settings', () => shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture'));
  handle('watch:start', async () => {
    if (watch?.accepting) throw new Error('Une session est déjà active.');
    if(watch){sessionClock.resume();await watch.resume();return {id:watch.id,elapsedMs:watch.now(),segmentMs:configuration().segmentMs};}
    if (!codexBinary && !smoke) throw new Error('Installe Codex et connecte ton compte.');
    clearInterval(pruneTimer);
    deep.cancelAll('Changement de session.');
    if (store) await cleanupRawMedia(sessionsRoot);
    const id = randomUUID();
    store = new LocalSessionStore(path.join(sessionsRoot, id));
    const researchBudget = new ResearchBudget(config.researchBudgetFile || path.join(app.getPath('userData'), 'research-budget.json'));
    search = new MomentSearch({ embeddings: (smoke && !liveInspection)||!config.apiKey ? null : new OpenRouterEmbeddings({ apiKey: config.apiKey, budget: researchBudget }), cache: new EmbeddingStore(path.join(store.root, 'embeddings.json'), EMBEDDING_MODEL) });
    const transcriber=new LocalTranscriber({binary:config.whisperBinary,model:config.whisperModel||path.join(path.dirname(config.researchBudgetFile||path.join(process.cwd(),'.local','research-budget.json')),'models','ggml-base.bin')});
    saved.transcriber=transcriber;
    const inspectionModel = inspectorModel = localInspection ? {
      inspect: async ({segments}) => ({observations:segments.map(s=>({id:s.id,startMs:s.startMs,endMs:s.endMs,text:'Un cercle est visible dans les planches du test.'})),hypotheses:[],limits:['Modèle simulé pour le test local.'],cost:0}),
      selectRegion: async () => ({region:{x:0.1,y:0.1,width:0.8,height:0.8},reason:'Rectangle de test, sans inférence.',cost:0})
    } : new CodexPerception({binary:codexBinary,authHome:config.codexAuthHome,model:selectedModels.inspectionModel,transcriber,quota,sessionId:id+'-inspect'});
    inspector = smoke && !liveInspection && !localInspection ? { inspect: async ({ segments, startMs, endMs }) => ({ observations: segments.map(s => ({ id: s.id, startMs: Math.max(startMs, s.startMs), endMs: Math.min(endMs, s.endMs), text: 'Le cercle effectue un bref saut entre deux images.' })), hypotheses: [], limits: [], sampledFrames: 12 }) }
      : new ClipInspector({ media: store, model: inspectionModel, ffmpeg: config.ffmpeg, strategy: inspectionStrategy(smoke ? process.argv.find(a=>a.startsWith('--inspection-strategy='))?.split('=')[1] || 'sheets-diverse' : 'sheets-diverse') });
    inspector=new CachedInspector(inspector);
    sessionClock=new SessionClock(()=>performance.now());
    const adapter = perception = smoke && !process.argv.includes('--live-observation') ? {
      observe: async input => ({ observation: { summary: 'Un cercle se déplace sur un fond bleu.', visual: `${input.frames.length} images reçues.`, audio: input.audio ? 'Audio reçu.' : 'Pas d’audio.', transcript: '', uncertainty: '' }, cost: 0 }),
      ask: async input => ({ answer: 'Un cercle se déplace sur un fond bleu.', kind: 'observation', citations: [input.context.at(-1).id], limits: [], cost: 0 })
    } : new CodexPerception({binary:codexBinary,authHome:config.codexAuthHome,model:selectedModels.observationModel,transcriber,quota,sessionId:id+'-observe'});
    watch = new WatchSession({ id, retentionMs:smoke?Number(process.argv.find(x=>x.startsWith('--retention-ms='))?.split('=')[1]||300000):300000, now: () => sessionClock.now(), perception: adapter, answer: adapter, media: store, archive: store,
      onChange: state => { if (!window.isDestroyed()) window.webContents.send('watch:state', state); } });
    pruneTimer = setInterval(() => watch.prune().catch(() => {}), 5000);
    watch.emit();
    videoAgent.prepare?.(id).catch(()=>{});
    perception.agent?.prepare(id+'-observe').catch(()=>{});
    return { id, elapsedMs: watch.now(), segmentMs: configuration().segmentMs };
  });
  handle('watch:ingest', async input => {
    if (!watch || input.sessionId !== watch.id) throw new Error('Session obsolète.');
    validateSegment(input, watch.now());
    return watch.ingest(input);
  });
  handle('watch:stop', async () => {sessionClock?.pause();await watch?.stop();});
  handle('watch:new',async()=>{
    if(watch?.accepting||watch?.running)throw new Error('Arrête la capture et attends la fin de son analyse.');
    auto?.stop();await autoAgent?.close?.();deep.cancelAll('Nouvelle session.');await videoAgent.close?.();await perception?.close?.();await inspectorModel?.close?.();
    clearInterval(pruneTimer);await cleanupRawMedia(sessionsRoot);watch=null;store=null;search=null;inspector=null;deep.jobs=[];deep.emit();
    window.webContents.send('watch:reset');return true;
  });
  handle('watch:ask', question => {
    if (!watch) throw new Error('Démarre une session avant de poser une question.');
    verifierAdapter.cancel?.();
    auto?.prioritizeManual();return deep.start(question, {mode:'chat'});
  });
  handle('watch:state', () => watch?.snapshot() || null);
  protocol.handle('tvlens-media', request => {
    const url = new URL(request.url);
    const id = url.pathname.slice(1);
    if (!watch || url.hostname !== watch.id || !/^moment-\d+$/.test(id) || !watch.segments.some(s => s.id === id && s.available)) return new Response('Passage expiré.', { status: 404 });
    return store.response(id, request.headers.get('range'));
  });
  session.defaultSession.setDisplayMediaRequestHandler((request, callback) => {
    const source = sources.find(s => s.id === selectedId);
    selectedId = undefined;
    if (!source || request.frame !== window.webContents.mainFrame) return callback({});
    callback({ video: source, audio: 'loopback' });
  });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', event => event.preventDefault());
  await window.loadFile(path.join(__dirname, 'index.html'));
});
function validateSegment(input, now) {
  if (!input || !Number.isFinite(input.startMs) || !Number.isFinite(input.endMs) || input.endMs > now + 3000) throw new Error('Horodatage de capture invalide.');
  if (!(input.clip instanceof Uint8Array) || input.clip.byteLength < 1 || input.clip.byteLength > 20000000) throw new Error('Segment vidéo trop volumineux ou vide.');
  if (input.audio && (!(input.audio instanceof Uint8Array) || input.audio.byteLength > 2100000)) throw new Error('Audio invalide.');
  if (!Array.isArray(input.frames) || input.frames.length < 1 || input.frames.length > 8 || input.frames.some(f => typeof f.dataUrl !== 'string' || f.dataUrl.length > 1000000 || !/^data:image\/jpeg;base64,[A-Za-z0-9+/]+=*$/.test(f.dataUrl) || !Number.isFinite(f.atMs) || f.atMs < input.startMs - 100 || f.atMs > input.endMs + 100)) throw new Error('Images de capture invalides.');
}
async function findCodex() {
  const candidates = [path.join(os.homedir(), '.local', 'bin', 'codex'), '/opt/homebrew/bin/codex', '/usr/local/bin/codex', ...(process.env.PATH || '').split(path.delimiter).filter(Boolean).map(dir => path.join(dir, 'codex'))];
  for (const candidate of candidates) { try { await fs.access(candidate, require('node:fs').constants.X_OK); return candidate; } catch {} }
  return null;
}
app.on('window-all-closed', () => app.quit());
app.on('before-quit', event => {
  if (closing) return;
  event.preventDefault(); closing = true; clearInterval(pruneTimer);clearInterval(autoTimer);auto?.stop();
  globalShortcut.unregisterAll();
  verifierAdapter?.cancel?.();
  deep?.cancelAll();
  Promise.all([autoAgent?.close?.(),videoAgent?.close?.(),perception?.close?.(),inspectorModel?.close?.(),bridge?.close()]).then(() => watch?.stop()).then(() => sessionsRoot && cleanupRawMedia(sessionsRoot)).finally(() => app.quit());
});
