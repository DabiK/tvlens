import { renderRecapView } from './ui/recap-view.js';
import { element as el, formatTime, action } from './ui/format.js';
import { ViewingShell } from './ui/shell.js';
import { RollingRecorder } from './recording.js';
import { agree, agreeText, cleanError, formatBytes, plural } from './ui/text.mjs';
import { clockLabel } from './ui/job-view.mjs';
import { describeSurveillance, isRestoring, INSTRUCTION_EXAMPLES } from './ui/surveillance-view.mjs';
import { describeSessions, describeStorage, describeArchive, describeDeletion, describeCoverage, describeMemory, mediaNote } from './ui/sessions-view.mjs';
import { replayTarget } from './ui/search-view.mjs';
import { createSearchController } from './ui/search-controller.mjs';
import { CardQueue, CARD_DURATIONS_MS, DEFAULT_CARD_DURATION_MS } from './ui/card-queue.mjs';
import { KeyedList, isNearBottom, tail, olderPassagesLabel, trimMap, settledCount } from './ui/list-view.mjs';
import { jobEntry, verificationEntry, pendingEntry } from './ui/job-card.js';
import { cardEntry, historyEntry, filterEntry, gapEntry } from './ui/surveillance-dom.js';
import { sessionEntry } from './ui/sessions-dom.js';
const $ = id => document.getElementById(id);
const shell = new ViewingShell();
const bridge = window.tvlens;
// Reversible display bounds: a film is hundreds of passages, the window draws the recent ones.
const RAIL_LIMIT = 40, PREVIEW_LIMIT = 60, STICK_PX = 80, HISTORY_STEP = 200, REGISTRY_EVERY_MS = 2000;
let stream, context, worklet, recorder, configuration, currentState = null, stopping = false, pendingQuestion = '';
let verificationState = { busy: false, jobs: [] }, pendingQuestionAt = 0;
let deepState = { jobs: [] };
let recapState = null, recapRevision = 0, recapKey = '';
let floatingCaptureBusy = false, sourceReturnExpanded = false;
const momentPreviews = new Map();
// Passages of the loaded session by id, rebuilt once per state: cards and citations look them up, never scan.
let passages = new Map(), shownError = '', forceBottom = false, settled = -1;
let quickBusy = false, selectedMoment = null, momentCheckpoint = Promise.resolve();
const cancelling = new Set();
const verifyPrefix = /^(?:\/verify\b|v[ée]rifie(?:r)?\b(?:\s+(?:que|si))?|fact[- ]?check\b)\s*[:—-]?\s*/i;
const flushes = new Map();
const reason = error => cleanError(error);
const status = text => { $('state').textContent = text; $('live-state').textContent = text; };
// One notice, above every view: an error raised from Mémoire or Surveillance is no longer written off screen.
const notice = text => { $('notice').textContent = text || ''; };
// At most one drawing per frame, however many states arrive; the timer covers a window that is not painting.
function batched(run) {
  let queued = false, timer;
  const fire = () => { if (!queued) return; queued = false; clearTimeout(timer); run(); };
  return () => { if (queued) return; queued = true; timer = setTimeout(fire, 100); requestAnimationFrame(fire); };
}

async function refresh() {
  $('refresh').disabled = true;
  try {
    const result = await window.capture.sources();
    setSources(result);
    $('start').disabled = !result.sources.length || Boolean(stream);
    if (!stream) status(result.permission === 'granted' ? 'Écran autorisé · Choisis une source' : `Autorisation écran : ${result.permission} · Vérifie les autorisations`);
  } catch (error) { status(`Capture indisponible : ${reason(error)}`); }
  finally { $('refresh').disabled = Boolean(stream); updateButtons(); }
}
function setSources(result) {
  const previous = $('source').value;
  const chosen = result.sources.some(source => source.id === previous) ? previous : result.preferredSourceId || (result.sources.length === 1 ? result.sources[0].id : '');
  $('source').replaceChildren(new Option('Choisir une fenêtre ou un écran…', ''), ...result.sources.map(source => new Option(source.name, source.id)));
  $('source').value = chosen;
}
function setConfig(value) {
  configuration = value;
  $('provider').textContent = `Codex ${value.canObserve ? 'prêt' : 'indisponible'} · ${value.model.split('/').at(-1)}`;
  $('cloud-note').textContent = 'Images et transcription envoyées à Codex · audio transcrit sur ce Mac.';
  scheduleState(); updateButtons();
}
function updateButtons() {
  const archive = Boolean(currentState?.readOnly);
  shell.observation(currentState, Boolean(recorder));
  $('float-status').textContent = recorder ? 'En direct' : archive ? 'Archive en lecture seule' : currentState?.id ? 'En pause' : 'Prêt';
  $('new-session').disabled=Boolean(stream)||Boolean(currentState?.analyzing)||stopping;
  $('float-record').disabled = floatingCaptureBusy || stopping;
  $('float-record').classList.toggle('recording',Boolean(recorder));
  $('float-record').title = recorder ? 'Mettre en pause ; mémoire et fil Codex conservés' : archive ? 'Reprendre la capture dans cette archive' : 'Choisir une source puis lancer la capture et l’analyse';
  $('observe').disabled = !configuration?.canObserve || !$('source').value || Boolean(recorder) || floatingCaptureBusy || stopping;
  $('observe').textContent = recorder ? 'Observation en cours' : archive ? 'Reprendre la capture…' : currentState?.id ? 'Reprendre l’observation' : 'Lancer l’observation';
  $('archive-resume').disabled = Boolean(recorder) || floatingCaptureBusy || stopping;
  $('archive-new').disabled = $('new-session').disabled;
  const canAsk = Boolean(currentState?.segments.length || currentState?.history.length);
  for (const id of ['float-explain', 'explain-moment', 'catch-up', 'mark-attention']) $(id).disabled = !currentState?.id || stopping || quickBusy;
  for (const id of ['moment-summarize', 'moment-explain', 'moment-send']) $(id).disabled = quickBusy;
  $('keep-moment').disabled = $('float-keep').disabled = !currentState?.segments.some(segment => segment.available) || stopping;
  $('question').disabled = false;
  $('verify').disabled = !configuration?.verificationAvailable || verificationState.busy;
  $('send').disabled = !canAsk || Boolean(pendingQuestion);
  $('ask-status').textContent = currentState?.asking ? 'Réponse en cours · Tu peux ajouter une question.' : archive && canAsk ? 'Archive · Tu peux poser des questions sur ce qui a été enregistré.' : canAsk ? 'Entrée pour envoyer · Maj+Entrée pour une ligne' : currentState?.id ? 'Les premiers passages arrivent bientôt.' : 'Choisis une source et lance TVLens.';
}
async function startPreview() {
  $('start').disabled = true;
  try {
    await window.capture.select($('source').value);
    stream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 10, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: true });
    $('preview').srcObject = stream;
    await $('preview').play();
    document.body.classList.add('has-preview');
    $('stop').disabled = false; $('source').disabled = true; $('refresh').disabled = true;
    stream.getVideoTracks()[0].onended = () => stop().catch(error => notice(reason(error)));
    const tracks = stream.getAudioTracks().filter(track => track.readyState === 'live');
    status(tracks.length ? 'Aperçu actif · Vérifie le son' : 'Aperçu actif · Sans piste audio');
    if (tracks.length) {
      context = new AudioContext({ sampleRate: 16000 });
      await context.audioWorklet.addModule('./audio-worklet.js');
      await context.resume();
      worklet = new AudioWorkletNode(context, 'tvlens-pcm');
      context.createMediaStreamSource(new MediaStream(tracks)).connect(worklet);
      worklet.connect(context.destination); // Worklet output is silence: no feedback loop.
      worklet.port.onmessage = ({ data }) => {
        if (data.type === 'samples') { $('meter').value = Math.min(1, data.rms * 4); recorder?.samples(data.samples); }
        if (data.type === 'flushed') { flushes.get(data.id)?.(); flushes.delete(data.id); }
      };
    }
    updateButtons();
    return true;
  } catch (error) { await stop(); status(`Capture interrompue : ${reason(error)}`); return false; }
}
function flushAudio() {
  if (!worklet) return Promise.resolve();
  return new Promise(resolve => {
    const id = crypto.randomUUID();
    const timeout = setTimeout(() => { flushes.delete(id); resolve(); }, 500);
    flushes.set(id, () => { clearTimeout(timeout); resolve(); });
    worklet.port.postMessage({ type: 'flush', id });
  });
}
// An archive is only written to again through the explicit resume of the bridge; a live session starts or resumes as before.
async function openCapture() {
  if (!currentState?.readOnly) return bridge.start();
  const resumed = await bridge.resumeSession();
  return (await bridge.state())?.accepting ? resumed : bridge.start();
}
async function observe() {
  $('observe').disabled = true; notice('');
  try {
    const session = await openCapture();
    receiveState(await bridge.state());
    recorder = new RollingRecorder({ stream, video: $('preview'), audioContext: context, flushAudio, session, onError: error => { if (!diskFull()) notice(reason(error)); }, onSegment: (id, preview) => {
      if (preview && currentState?.id === session.id) momentPreviews.set(id, preview);
      scheduleState();
    } });
    recorder.start();
    $('mode').textContent = 'EN DIRECT'; $('mode').classList.add('cloud');
    $('source').disabled = true;
    status('Capture + mémoire actives');
    updateButtons(); drawSessions();
  } catch (error) { recorder = undefined; await bridge.stop().catch(() => {}); notice(reason(error)); updateButtons(); }
}
// `quiet`: the session stopped accepting passages by itself (disk full): the last partial passage is not reported again.
async function stop({ quiet = false } = {}) {
  if (stopping) return;
  stopping = true; $('stop').disabled = true; updateButtons();
  try {
    if (quiet && recorder) recorder.onError = () => {};
    await recorder?.stop(); recorder = undefined;
    await bridge.stop();
    const old = stream; stream = undefined;
    old?.getTracks().forEach(track => track.stop());
    await context?.close(); context = undefined; worklet = undefined;
    $('preview').srcObject = null; $('meter').value = 0;
    document.body.classList.remove('has-preview');
    $('start').disabled = !$('source').value; $('source').disabled = false; $('refresh').disabled = false;
    $('mode').textContent = currentState?.id ? 'EN PAUSE' : 'PRÊT À REGARDER'; $('mode').classList.remove('cloud');
    status(currentState?.id ? 'Capture en pause · Contexte et chat conservés' : 'Capture inactive');
  } finally { stopping = false; updateButtons(); drawBanners(); drawSessions(); }
}
// `card` is a search result, which names the session it was searched in; a citation is only drawn for the loaded one.
function replay(id, offset = 0, card) {
  // Session and passage are both checked before any address is built; the refusal says why (another session,
  // video not kept, missing, expired).
  const { segment, url, refusal } = replayTarget({ id, sessionId: card ? card.sessionId : currentState?.id }, currentState);
  if (refusal) return notice(refusal);
  $('replay-title').textContent = `Passage ${formatTime(segment.startMs)} — ${formatTime(segment.endMs)}`;
  $('replay').muted = true;
  $('replay').src = url;
  $('replay').onloadedmetadata = () => { $('replay').currentTime = Math.min(offset, Math.max(0, $('replay').duration - 0.1)); };
  $('replay-note').textContent = currentState.accepting ? 'Relecture muette pendant l’observation pour ne pas recapturer son audio.' : 'Tu peux activer le son : l’observation est arrêtée.';
  $('replay-dialog').showModal();
  $('replay').play().catch(() => {});
}
// A citation or a surveillance origin starts inside its passage, at its own time code.
function replayAt(id, startMs) {
  const segment = passages.get(id);
  replay(id, segment && Number.isFinite(startMs) ? Math.max(0, (startMs - segment.startMs) / 1000) : 0);
}
const thumbnail = id => `tvlens-media://${currentState.id}/thumb/${id}`;
const previewOf = id => momentPreviews.get(id) || (passages.get(id)?.thumbnailAvailable ? thumbnail(id) : undefined);

// ---- Loaded session --------------------------------------------------------------------------
function receiveState(state) {
  if (!state) return;
  if (currentState?.id !== state.id) { momentPreviews.clear(); cancelling.clear(); surveillanceRegistry = null; registryKey = ''; recapKey = ''; shownError = ''; search.clear(); }
  currentState = state;
  passages = new Map();
  for (const list of [state.history || [], state.segments]) for (const passage of list) passages.set(passage.id, passage);
  if (state.storage) storageState = { ...storageState, ...state.storage };
  // The session no longer accepts passages (disk full, pause decided by the host): the recorder stops with it.
  if (recorder && !stopping && state.accepting === false) stop({ quiet: true }).catch(error => notice(reason(error)));
  scheduleState();
}
const PASSAGE_LABELS = { queued: 'En attente d’analyse', analyzing: 'Analyse en cours…', ready: 'Analysé', partial: 'Analyse partielle', skipped: 'Analyse sautée : file pleine', error: 'Analyse indisponible', expired: 'Vidéo expirée avant l’analyse' };
const timelineList = new KeyedList($('timeline'));
function drawState() {
  const state = currentState;
  drawBanners();
  if (!state) { drawTimeline(); drawChat(); drawSurveillance(); updateButtons(); return; }
  if (recapState?.sessionId && recapState.sessionId !== state.id) recapState = null;
  renderRecap();
  $('elapsed').textContent = formatTime(state.elapsedMs);
  $('chat-coverage').textContent = describeCoverage(state);
  $('usage').textContent = `Perception Codex : ${plural(state.apiCalls, 'passage')}`;
  // The retention shown is the loaded session's own (its state, else its entry in the library), never the setting
  // of this host: an archive kept until deletion says so wherever it is opened. No duration is written here.
  $('memory-status').textContent = describeMemory(state, { library });
  $('memory-status').title = $('memory-status').textContent;
  // Said once per message: a state arrives several times a second and must not overwrite a newer notice.
  if (state.lastError && state.lastError !== shownError && !diskFull()) notice(state.lastError);
  shownError = state.lastError || '';
  drawTimeline(); drawChat(); drawSurveillance(); updateButtons();
}
const scheduleState = batched(drawState);
function drawTimeline() {
  const state = currentState, { items, olderCount } = tail(state?.segments, RAIL_LIMIT);
  const entries = items.slice().reverse().map(segment => {
    const memory = momentPreviews.get(segment.id), image = memory || (segment.thumbnailAvailable ? thumbnail(segment.id) : '');
    const text = segment.observation?.summary || segment.observation?.transcript || PASSAGE_LABELS[segment.status];
    const detail = `${formatTime(segment.startMs)}–${formatTime(segment.endMs)} · ${segment.error || segment.stage || PASSAGE_LABELS[segment.status]}${segment.hasAudio ? '' : ' · Sans audio'}${segment.available ? '' : ` · ${mediaNote(segment).short}`}`;
    return { id: segment.id, signature: [memory ? 'memory' : image, segment.available, segment.status, text, detail].join('|'), render: () => {
      const row = el('article', 'moment'), placeholder = () => { const empty = el('div', 'moment-image'); empty.setAttribute('role', 'img'); empty.setAttribute('aria-label', 'Aperçu indisponible'); return empty; };
      let preview = placeholder();
      if (image) { preview = el('img', 'moment-image'); preview.alt = `Aperçu du passage à ${formatTime(segment.startMs)}`; preview.src = image; preview.onerror = () => preview.replaceWith(placeholder()); }
      const button = action('moment-time', formatTime(segment.startMs), 'replay', { id: segment.id });
      button.disabled = !segment.available; button.title = segment.available ? 'Revoir ce passage' : mediaNote(segment).long;
      const body = el('div');
      body.append(el('p', '', text), el('small', segment.status === 'error' ? 'error' : '', detail));
      row.append(preview, button, body); return row;
    } };
  });
  timelineList.sync(entries.length ? entries : [{ id: 'empty', signature: '', render: () => el('p', 'placeholder', 'Les moments observés apparaîtront ici.') }]);
  $('timeline-older').hidden = !olderCount; $('timeline-older').textContent = olderPassagesLabel(olderCount);
  // In-memory previews only serve the passages on screen; older ones come from the session thumbnails.
  trimMap(momentPreviews, PREVIEW_LIMIT, new Set(items.map(segment => segment.id)));
}
let storageState = null, storageView = describeStorage(null);
// Out of room, the persistent banner says it all: the same reason is not repeated as a notice at every refused passage.
const diskFull = () => storageView.blocked || currentState?.storage?.state === 'blocked';
function drawBanners() {
  const archive = describeArchive(currentState);
  $('archive-banner').hidden = !archive;
  if (archive) { $('archive-label').textContent = archive.label.toUpperCase(); $('archive-text').textContent = `${archive.text}.`; $('archive-hint').textContent = archive.hint; }
  storageView = describeStorage(storageState, { capturing: Boolean(recorder) });
  $('storage-banner').hidden = !storageView.banner;
  if (storageView.banner) { $('storage-banner').dataset.state = storageView.banner.state; $('storage-banner-title').textContent = storageView.banner.title; $('storage-banner-text').textContent = storageView.banner.text; }
  $('storage-line').textContent = storageView.line; $('storage-line').dataset.state = storageView.state;
  // Out of room: capture stops and says so. Nothing is deleted, here or by the host.
  if (storageView.blocked && recorder && !stopping) stop({ quiet: true }).catch(error => notice(reason(error)));
}
function receiveStorage(storage) { if (!storage) return; storageState = { ...storage }; drawBanners(); }

// ---- Conversation: one card per question, only what changed is redrawn -----------------------
const chatList = new KeyedList($('message-list'));
function chatContext() {
  return { now: Date.now(), timeoutMs: configuration?.questionTimeoutMs ?? null, queuedIds: deepState.jobs.filter(job => job.status === 'queued').map(job => job.id),
    capturing: Boolean(currentState?.accepting), session: currentState, passage: id => passages.get(id), preview: previewOf, cancelling,
    verifyAvailable: Boolean(configuration?.verificationAvailable), verifyBusy: verificationState.busy };
}
function drawChat() {
  const context = chatContext(), waiting = context.queuedIds.length, limit = configuration?.questionQueueLimit;
  $('queue-status').textContent = waiting ? `${plural(waiting, 'question')} en attente · ${agree(waiting, 'traitée')} dans l’ordre${limit ? `, ${limit} au plus` : ''}` : '';
  // The echo covers the instant between sending and the host accepting the question.
  const echo = pendingQuestion && !deepState.jobs.some(job => job.question === pendingQuestion && job.createdAt >= pendingQuestionAt - 1000);
  const entries = [
    ...verificationState.jobs.map(job => ({ at: job.createdAt, entry: verificationEntry(job, context) })),
    ...deepState.jobs.map(job => ({ at: job.createdAt, entry: jobEntry(job, context) })),
    ...(echo ? [{ at: pendingQuestionAt, entry: pendingEntry(pendingQuestion) }] : []),
  ].sort((a, b) => a.at - b.at).map(item => item.entry);
  // Follow the answer only if the reader was at the bottom: reading an earlier answer is never interrupted.
  const box = $('messages'), stick = forceBottom || isNearBottom(box, STICK_PX);
  const changes = chatList.sync(entries);
  $('chat-intro').hidden = entries.length > 0;
  if (stick && (forceBottom || changes.created || changes.updated || changes.removed)) box.scrollTop = box.scrollHeight;
  forceBottom = false;
  // The budget file is read again when a question finishes, not at each fragment of an answer.
  const finished = settledCount(deepState.jobs);
  if (finished !== settled) { settled = finished; refreshResearchBudget(); }
}
const scheduleChat = batched(drawChat);
function openVerification(text = '') {
  if (verificationState.busy) return notice('Une vérification est déjà en cours. Tu peux toujours poser une question sur la vidéo.');
  if (!configuration?.verificationAvailable) return notice('Codex CLI est introuvable sur ce Mac.');
  let claim = text.trim().replace(verifyPrefix, '').trim();
  if (/^(?:ça|cela|cette affirmation|ce qu['’]il vient de dire)[.!?]?$/i.test(claim)) claim = '';
  $('claim').value = claim.slice(0, 2000); $('verify-error').textContent = '';
  $('verify-dialog').showModal(); $('claim').focus();
}
$('verify').onclick = () => openVerification($('question').value);
$('close-verify').onclick = () => $('verify-dialog').close();
$('verify-form').onsubmit = async event => {
  event.preventDefault(); const claim = $('claim').value.trim();
  if (!claim || verificationState.busy) return;
  $('verify-dialog').close(); notice('');
  if ($('question').value.trim().replace(verifyPrefix, '').trim() === claim) $('question').value = '';
  try { await bridge.verify(claim); }
  catch (error) { notice(reason(error)); }
};
bridge.onVerificationState(state => { verificationState = state; scheduleChat(); updateButtons(); });
function refreshResearchBudget() { bridge.researchBudget().then(b => { $('research-usage').textContent = `OpenRouter (historique + embeddings) : ${b.spentUsd.toFixed(4)} $ comptabilisés${b.limitUsd==null?' · sans plafond local':` sur ${b.limitUsd} $`}${b.heldUsd ? ' · appels réservés en cours ou coût inconnu' : ''}`; }).catch(() => {}); }
bridge.onDeepState(state => { deepState = state; scheduleChat(); updateButtons(); });
bridge.deepState().then(state => { deepState = state; scheduleChat(); }).catch(error => notice(reason(error)));
bridge.verificationState().then(state => { verificationState = state; scheduleChat(); updateButtons(); }).catch(error => notice(reason(error)));
$('ask-form').onsubmit = async event => {
  event.preventDefault(); const question = $('question').value.trim();
  // Enter goes through the same gate as the button: no request the host can only refuse.
  if (!question || pendingQuestion || $('send').disabled) return;
  pendingQuestion = question; pendingQuestionAt = Date.now(); $('question').value = ''; notice(''); forceBottom = true; drawChat(); updateButtons();
  try { await bridge.ask(question); }
  catch (error) { notice(reason(error)); $('question').value = question; }
  finally { pendingQuestion = ''; scheduleChat(); updateButtons(); $('question').focus(); }
};
$('question').onkeydown = event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); $('ask-form').requestSubmit(); } };
$('question').oninput = updateButtons;
for (const button of document.querySelectorAll('.suggestion[data-question]')) button.onclick = () => { $('question').value = button.dataset.question; $('question').focus(); updateButtons(); };
// Elapsed / ceiling of running questions, once a second, from the attributes of their own card.
setInterval(() => {
  const now = Date.now();
  for (const node of document.querySelectorAll('.job-clock')) {
    const elapsed = now - Number(node.dataset.started), ceiling = Number(node.dataset.timeout) || null;
    node.textContent = clockLabel(elapsed, ceiling);
    if (ceiling && node.previousElementSibling) node.previousElementSibling.value = Math.min(1, elapsed / ceiling);
  }
}, 1000);

// ---- One click handler for every card: a button keeps working when its card is redrawn -------
const jobOf = id => deepState.jobs.find(job => job.id === id);
const actions = {
  replay: data => replayAt(data.id, data.start === undefined ? NaN : Number(data.start)),
  'job-cancel': async data => { cancelling.add(data.id); drawChat(); try { await bridge.cancelDeep(data.id); } finally { cancelling.delete(data.id); scheduleChat(); } },
  'job-reask': data => { const job = jobOf(data.id); if (job) { $('question').value = job.question; $('question').focus(); updateButtons(); } },
  'job-more': data => { const job = jobOf(data.id); return job?.result && bridge.ask(`Approfondis cette réponse : ${job.result.answer.slice(0, 1200)}`); },
  'job-verify': data => { const job = jobOf(data.id); if (job?.result) openVerification(job.result.answer); },
  'job-reexamine': data => { const job = jobOf(data.id); return job && (job.intent ? bridge.reexamineMoment(job.id) : bridge.deepen(job.question)); },
  'chat-source': data => bridge.openChatSource(data.job, Number(data.index)),
  'verify-cancel': (data, target) => { target.disabled = true; return bridge.cancelVerification(); },
  'verify-retry': data => { const job = verificationState.jobs.find(item => item.id === data.id); if (job) openVerification(job.claim); },
  'verify-source': data => bridge.openSource(data.job, Number(data.index)),
  'watch-source': data => bridge.openSurveillanceSource(data.lot, Number(data.index)),
  'watch-dismiss': data => { cardQueue.dismiss(data.key); drawStack(); },
  'watch-show-lot': data => showLot(data.lot),
  'watch-retry': async data => receiveSurveillance(await bridge.retrySurveillanceClaim(data.id)),
  'watch-filter': data => { watchFilter = data.filter; historyLimit = HISTORY_STEP; drawSurveillance(); },
  'watch-example': data => { $('watch-instruction').value = data.instruction; $('watch-instruction').focus(); },
  'session-open': data => openArchive(data.id),
  'session-delete': data => askDeleteSession(data.id),
  'session-resume': () => requestCapture(captureFromArchive),
};
document.addEventListener('click', event => {
  const target = event.target.closest?.('[data-action]');
  const run = target && !target.disabled && actions[target.dataset.action];
  if (run) Promise.resolve().then(() => run(target.dataset, target)).catch(error => notice(reason(error)));
});

$('start').onclick = startPreview;
$('observe').onclick = () => requestCapture(watchWithSelectedSource);
$('source').onchange = updateButtons;
$('refresh').onclick = refresh;
$('stop').onclick = () => stop().catch(error => notice(reason(error)));
$('settings').onclick = () => window.capture.settings().catch(error => notice(reason(error)));
$('import').onclick = () => bridge.importConfig().then(setConfig).catch(error => notice(reason(error)));
$('close-replay').onclick = () => $('replay-dialog').close();
$('replay-dialog').onclose = () => { $('replay').pause(); $('replay').removeAttribute('src'); $('replay').load(); };
$('replay').onvolumechange = () => { if (currentState?.accepting) $('replay').muted = true; };
$('replay').onerror = () => { $('replay-note').textContent = 'Ce passage ne peut pas être lu : sa vidéo n’est plus disponible.'; };
window.addEventListener('beforeunload', () => stream?.getTracks().forEach(track => track.stop()));
bridge.onState(receiveState);
bridge.config().then(setConfig).catch(error => notice(reason(error)));
// A reloaded window finds the session the host still holds.
bridge.state().then(receiveState).catch(() => {});
refresh();

$('models').onclick=async()=>{try{const value=await bridge.models();const choices=await bridge.modelChoices();$('codex-models').replaceChildren(...choices.map(m=>new Option(m.name,m.id)));$('codex-model').value=value.codexModel;$('observation-model').value=value.observationModel;$('inspection-model').value=value.inspectionModel;$('models-status').textContent='';$('models-dialog').showModal();}catch(e){notice(reason(e));}};
$('close-models').onclick=()=>$('models-dialog').close();
$('models-form').onsubmit=async event=>{event.preventDefault();try{const result=await bridge.saveModels({codexModel:$('codex-model').value.trim(),observationModel:$('observation-model').value.trim(),inspectionModel:$('inspection-model').value.trim()});setConfig(result.configuration);$('models-status').textContent='Enregistré · Codex prêt pour la prochaine question.';}catch(e){$('models-status').textContent=reason(e);}};

let floatingMode=false, floatingExpanded=false;
async function changeWindowMode(floating,expanded=false,{focus=true}={}){
  const priorFloating=floatingMode, priorExpanded=floatingExpanded;
  const paint=()=>{shell.windowMode(floatingMode,floatingExpanded);drawStack();};
  floatingMode=floating;floatingExpanded=expanded;paint();
  try{await bridge.windowMode({floating,expanded});if(expanded&&focus&&shell.view!=='watch')$('question').focus();}
  catch(e){floatingMode=priorFloating;floatingExpanded=priorExpanded;paint();notice(reason(e));}
}
$('float-mode').onclick=()=>changeWindowMode(true);
$('float-full').onclick=()=>{shell.show('direct');return changeWindowMode(false);};
$('close-chat').onclick=()=>changeWindowMode(true,false);
$('float-menu-toggle').onclick=async()=>{
  if ($('float-menu').matches(':popover-open')) { $('float-menu').hidePopover(); return; }
  if (!floatingExpanded) await changeWindowMode(true,true);
  $('float-menu').showPopover();
};
$('float-watch').onclick=()=>showWatch();
$('float-memory').onclick=()=>openLibrary();
$('float-source-change').onclick=async()=>{await stop();shell.show('direct');await changeWindowMode(false);$('source').focus();};
// In the floating window the surveillance takes the place of the chat: "Demander" brings the chat back.
$('float-chat').onclick=()=>{if(floatingExpanded&&shell.view==='watch'){shell.show('direct');$('question').focus();return;}return changeWindowMode(true,!floatingExpanded);};
async function watchWithSelectedSource() {
  if (floatingCaptureBusy || stopping || recorder) return;
  floatingCaptureBusy = true; updateButtons(); notice('');
  try {
    if (!stream && !await startPreview()) throw Error($('state').textContent);
    await observe();
    if (!recorder) throw Error($('notice').textContent || 'L’observation n’a pas démarré.');
  } catch (error) { notice(reason(error)); }
  finally { floatingCaptureBusy = false; updateButtons(); }
}

async function refreshFloatingSources(){
  $('float-refresh').disabled=true; $('float-launch').disabled=true; $('float-source-error').textContent='';
  try{
    const result=await window.capture.sources();
    $('float-source').replaceChildren(...result.sources.map(s=>new Option(s.name,s.id)));
    setSources(result);
    if ($('source').value) $('float-source').value=$('source').value;
    if(!result.sources.length)$('float-source-error').textContent='Aucune source disponible. Vérifie les autorisations de capture dans le mode complet.';
    $('float-launch').disabled=!result.sources.length||!configuration?.canObserve;
    if(!configuration?.canObserve)$('float-source-error').textContent='Connecte ton compte Codex avant de lancer l’analyse.';
  }catch(e){$('float-source-error').textContent=reason(e);}
  finally{$('float-refresh').disabled=false;}
}
async function captureFromFloatingBar(){
  const previousSource=$('source').value;
  floatingCaptureBusy=true; updateButtons();
  try { await refresh(); } finally { floatingCaptureBusy=false; updateButtons(); }
  if (previousSource && !Array.from($('source').options).some(option=>option.value===previousSource)) $('source').value='';
  if ($('source').value) { await watchWithSelectedSource(); return; }
  sourceReturnExpanded=floatingExpanded;
  await changeWindowMode(true,true);
  $('float-source-dialog').showModal();
  if(stream){
    $('float-source').replaceChildren(new Option($('source').selectedOptions[0]?.textContent||'Source actuelle',$('source').value));
    $('float-source').disabled=true;$('float-refresh').hidden=true;
    $('float-launch').disabled=!configuration?.canObserve;
    $('float-source-error').textContent=configuration?.canObserve?'':'Connecte ton compte Codex dans le mode complet.';
  }else{$('float-source').disabled=false;$('float-refresh').hidden=false;await refreshFloatingSources();}
}
$('float-record').onclick=async()=>{
  if(floatingCaptureBusy||stopping)return;
  if(recorder){floatingCaptureBusy=true;updateButtons();try{await stop();}catch(e){notice(reason(e));}finally{floatingCaptureBusy=false;updateButtons();}return;}
  await requestCapture(captureFromFloatingBar);
};
$('float-refresh').onclick=refreshFloatingSources;
$('close-float-source').onclick=()=>$('float-source-dialog').close();
$('float-source-dialog').onclose=()=>{if(floatingMode)changeWindowMode(true,sourceReturnExpanded);};
$('float-source-dialog').oncancel=event=>{if(floatingCaptureBusy)event.preventDefault();};
$('float-source-form').onsubmit=async event=>{
  event.preventDefault();if(floatingCaptureBusy||!configuration?.canObserve)return;
  floatingCaptureBusy=true;updateButtons();$('float-launch').disabled=true;$('close-float-source').disabled=true;$('float-refresh').disabled=true;$('float-source-error').textContent='Démarrage…';
  try{
    if(!stream){$('source').value=$('float-source').value;if(!await startPreview())throw Error($('state').textContent);}
    await observe();
    if(!recorder)throw Error($('notice').textContent||'L’observation n’a pas démarré.');
    $('float-source-dialog').close();
  }catch(e){$('float-source-error').textContent=reason(e);}
  finally{floatingCaptureBusy=false;$('float-launch').disabled=false;$('close-float-source').disabled=false;$('float-refresh').disabled=false;updateButtons();}
};

// ---- Sessions: archives, explicit resume, deletion, disk --------------------------------------
let library = null, sessionsView = describeSessions(null), sessionsStale = true, deleteSessionId = null, pendingCapture = null;
const sessionsList = new KeyedList($('sessions-list'));
function drawSessions() {
  sessionsView = describeSessions(library, { capturing: Boolean(recorder), readOnly: Boolean(currentState?.readOnly) });
  sessionsList.sync(sessionsView.rows.map(sessionEntry));
  $('sessions-empty').hidden = !sessionsView.empty; $('sessions-empty').textContent = sessionsView.empty || '';
}
async function refreshSessions() {
  if (!bridge.sessions) return;
  sessionsStale = false;
  try { library = await bridge.sessions(); if (library?.storage) storageState = { ...library.storage }; }
  catch (error) { sessionsStale = true; return notice(reason(error)); }
  drawSessions(); drawBanners();
}
// Listing reads the disk: it is done when the panel is on screen, and otherwise remembered as due.
const sessionsChanged = () => { if (shell.view === 'memory' && !document.body.classList.contains('floating')) refreshSessions(); else sessionsStale = true; };
// Capture never restarts inside an archive by a plain click: the viewer confirms, then the bridge resumes it.
async function requestCapture(run) {
  if (!currentState?.readOnly) return run();
  $('resume-session-text').textContent = describeArchive(currentState).resumeText; $('resume-session-error').textContent = '';
  pendingCapture = run;
  if (floatingMode && !floatingExpanded) await changeWindowMode(true, true, { focus: false });
  if (!$('resume-session-dialog').open) $('resume-session-dialog').showModal();
}
async function captureFromArchive() {
  if (floatingMode) return captureFromFloatingBar();
  shell.show('direct');
  if (!$('source').value) { notice('Choisis d’abord la fenêtre ou l’écran à regarder, puis reprends la capture.'); $('source').focus(); return; }
  await watchWithSelectedSource();
}
$('archive-resume').onclick = () => requestCapture(captureFromArchive);
$('cancel-resume-session').onclick = () => { pendingCapture = null; $('resume-session-dialog').close(); };
$('confirm-resume-session').onclick = async () => { const run = pendingCapture; pendingCapture = null; $('resume-session-dialog').close(); try { await run?.(); } catch (error) { notice(reason(error)); } };
async function pullSession() {
  const state = await bridge.state();
  if (!state) return clearSession();
  receiveState(state);
  const [deep, recap, surveillance] = await Promise.all([bridge.deepState(), bridge.recapState().catch(() => null), bridge.surveillanceState?.().catch(() => null)]);
  deepState = deep;
  if (recap) receiveRecap(recap);
  if (surveillance) receiveSurveillance(surveillance);
  forceBottom = true; scheduleState();
}
async function openArchive(id) {
  if (recorder || stream) return notice('Mets la capture en pause avant d’ouvrir une autre session.');
  notice('');
  await bridge.openSession(id);
  await pullSession();
  shell.show('direct');
}
function askDeleteSession(id) {
  const row = sessionsView.rows.find(item => item.id === id);
  if (!row) return;
  if (!row.canDelete) return notice(row.deleteBlockedReason);
  const text = describeDeletion(row);
  deleteSessionId = id;
  $('delete-session-title').textContent = text.title; $('delete-session-subject').textContent = text.subject;
  $('delete-session-removed').textContent = text.removed; $('delete-session-kept').textContent = text.kept;
  $('delete-session-warning').textContent = text.warning || ''; $('delete-session-error').textContent = '';
  $('confirm-delete-session').textContent = text.confirmLabel;
  $('delete-session-dialog').showModal();
}
$('cancel-delete-session').onclick = () => $('delete-session-dialog').close();
$('confirm-delete-session').onclick = async () => {
  $('confirm-delete-session').disabled = true;
  try {
    const result = await bridge.deleteSession(deleteSessionId);
    $('delete-session-dialog').close();
    notice(`Session supprimée${formatBytes(result?.freedBytes) ? ` · ${formatBytes(result.freedBytes)} libérés` : ''}. Les moments gardés sont conservés.`);
    await refreshSessions();
  } catch (error) { $('delete-session-error').textContent = reason(error); }
  finally { $('confirm-delete-session').disabled = false; }
};
$('refresh-sessions').onclick = () => refreshSessions();
$('storage-banner-open').onclick = async () => { if (floatingMode) await changeWindowMode(false); shell.show('memory'); $('sessions-panel').scrollIntoView({ block: 'start' }); };
const startNewSession = async () => { try { await bridge.newSession(); } catch (e) { notice(reason(e)); } };
$('new-session').onclick = $('archive-new').onclick = startNewSession;
function clearSession() {
  recapRevision++; recapState = null; currentState = null; passages = new Map(); deepState = { jobs: [] }; selectedMoment = null; cancelling.clear();
  surveillanceRegistry = null; registryKey = ''; shownError = '';
  $('recap-dialog').close(); $('moment-dialog').close(); $('attention-status').textContent = ''; notice(''); momentPreviews.clear(); search.clear();
  renderRecap();
  $('elapsed').textContent = '00:00'; $('mode').textContent = 'PRÊT À REGARDER'; $('mode').classList.remove('cloud');
  $('memory-status').textContent = 'Les passages apparaîtront après quelques secondes de capture.'; $('chat-coverage').textContent = '';
  drawState();
}
bridge.onReset(clearSession);
bridge.onSessionsChanged?.(sessionsChanged);
bridge.onStorage?.(receiveStorage);
bridge.storage?.().then(receiveStorage).catch(() => {});

async function keepRecent(){try{const saved=await bridge.keepMoment();notice(`Moment ${formatTime(saved.startMs)}–${formatTime(saved.endMs)} conservé jusqu’à suppression.`);shell.bookmarkFeedback(true);setTimeout(()=>shell.bookmarkFeedback(false),2000);await renderSavedRail();}catch(e){notice(reason(e));}}
$('keep-moment').onclick=keepRecent;$('float-keep').onclick=keepRecent;
let deleteSavedId;
function momentCard(moment,{savedId}={}){
 const card=el('article','moment-card');if(moment.preview){const image=el('img');image.src=moment.preview;image.alt='Aperçu du passage';card.append(image);}
 const content=el('div');content.append(el('strong','',`${formatTime(moment.startMs)}–${formatTime(moment.endMs)}`));content.append(el('p','',moment.text||moment.observation?.transcript||moment.observation?.summary||'Transcription indisponible.'));
 const available=savedId||moment.available;const play=el('button','secondary',available?'Revoir ↗':`Texte conservé · ${mediaNote(moment).short}`);play.disabled=!available;
 play.onclick=()=>{if(!savedId)return replay(moment.id,0,moment);$('replay-title').textContent='Moment conservé';$('replay').src=`tvlens-saved://${savedId}/${moment.id}`;$('replay').onloadedmetadata=null;$('replay').muted=true;$('replay-note').textContent='Copie conservée sur ce Mac ; supprimer le moment efface aussi cette vidéo.';$('replay-dialog').showModal();$('replay').play().catch(()=>{});};content.append(play);card.append(content);return card;
}
async function renderSaved(){const values=await bridge.savedMoments();$('saved-results').replaceChildren(...values.map(value=>{const group=el('section','saved-group');group.append(el('small','hint',new Date(value.createdAt).toLocaleString()+' · Conservé'));for(const m of value.moments)group.append(momentCard(m,{savedId:value.id}));const remove=el('button','link','Supprimer ce moment');remove.onclick=()=>{deleteSavedId=value.id;$('delete-saved-dialog').showModal();};group.append(remove);return group;}));if(!values.length)$('saved-results').append(el('p','hint','Aucun moment gardé.'));renderSavedRail(values);}
async function renderSavedRail(values){values ||= await bridge.savedMoments();const tiles=values.slice(0,5).map(value=>{const moment=value.moments[0],tile=el('button','saved-tile'),preview=el('img');preview.alt='Aperçu du moment gardé';if(moment?.preview)preview.src=moment.preview;const copy=el('span');copy.append(el('strong','',formatTime(value.startMs)),document.createTextNode(moment?.observation?.summary||'Moment gardé'));tile.append(preview,copy);tile.onclick=()=>openLibrary().catch(e=>notice(reason(e)));return tile;});$('saved-rail').replaceChildren(...(tiles.length?tiles:[el('p','placeholder','Garde un moment pour le retrouver ici.')]));}
async function openLibrary(){if(floatingMode)await changeWindowMode(true,true);$('library-dialog').showModal();await renderSaved();const settings=await bridge.viewingSettings();$('bookmark-shortcut').value=settings.bookmarkShortcut;$('shortcut-status').textContent=settings.shortcutRegistered?'Raccourci actif.':'Raccourci indisponible : choisis une autre combinaison.';}
$('open-library').onclick=()=>openLibrary().catch(e=>notice(reason(e)));$('close-library').onclick=()=>$('library-dialog').close();$('refresh-saved').onclick=()=>renderSaved().catch(e=>notice(reason(e)));
$('saved-all').onclick=$('open-library').onclick;
$('nav-saved').onclick=$('open-library').onclick;
$('nav-search').onclick=async()=>{await openLibrary();$('moment-query').focus();};
// Search results belong to the session they were searched in and to the latest request: a reset or another session
// empties them, and an answer or a refusal still on its way is dropped instead of being drawn in the new session.
const searchIntro = $('search-status').textContent;
const search = createSearchController({
  search: query => bridge.searchMoments(query),
  session: () => currentState,
  onStart: () => { $('search-status').textContent = 'Recherche dans la session…'; },
  onResult: (cards, found) => {
    $('search-results').replaceChildren(...cards.map(m => momentCard(m)));
    $('search-status').textContent = `${plural(found.moments.length, 'passage')} · ${found.mode}. ${agreeText(found.warnings.join(' '))}`;
  },
  onClear: () => { $('search-results').replaceChildren(); $('search-status').textContent = searchIntro; },
  onFailure: e => { $('search-status').textContent = reason(e); },
});
$('moment-search-form').onsubmit = e => { e.preventDefault(); search.submit($('moment-query').value); };
$('shortcut-form').onsubmit=async e=>{e.preventDefault();try{await bridge.saveViewingSettings({bookmarkShortcut:$('bookmark-shortcut').value.trim()});$('shortcut-status').textContent='Raccourci enregistré.';}catch(e){$('shortcut-status').textContent=reason(e);}};
$('cancel-delete-saved').onclick=()=>$('delete-saved-dialog').close();$('confirm-delete-saved').onclick=async()=>{try{await bridge.removeSaved(deleteSavedId);$('delete-saved-dialog').close();await renderSaved();}catch(e){notice(reason(e));}};
bridge.onSaved(()=>{notice('Moment conservé sur ce Mac jusqu’à suppression.');renderSavedRail().catch(()=>{});if($('library-dialog').open)renderSaved().catch(()=>{});});bridge.onSaveError(message=>notice(reason(message)));
renderSavedRail().catch(()=>{});
setInterval(()=>bridge.quota().then(q=>{$('quota-status').textContent=q.windows.length?'Codex : '+q.windows.map(w=>`${w.remainingPercent} % restants (${w.windowMinutes===10080?'semaine':w.windowMinutes+' min'})`).join(' · '):'Quota Codex : pas encore lu';}).catch(()=>{}),10000);

// ---- Surveillance: free instruction, discreet activity, sourced cards, history by state --------
const PREFERENCES = 'tvlens.surveillance.display';
function loadPreferences() {
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(PREFERENCES) || '{}') || {}; } catch {}
  // The only display choice is how long a card stays. What may become a card is not one: sourced verifications only.
  return { cardDurationMs: CARD_DURATIONS_MS.includes(saved.cardDurationMs) ? saved.cardDurationMs : DEFAULT_CARD_DURATION_MS };
}
const preferences = loadPreferences();
const savePreferences = () => { try { localStorage.setItem(PREFERENCES, JSON.stringify(preferences)); } catch {} };
let surveillanceState = null, surveillanceRegistry = null, registryKey = '', registryAt = 0, registryBusy = false, registryTimer;
let watchFilter = 'all', historyLimit = HISTORY_STEP, seen = { overlay: 0, signal: 0 }, seenFor, syncedInstruction = '', watchBusy = false, stackTimer, watchPushes = 0;
const cardQueue = new CardQueue({ durationMs: preferences.cardDurationMs });
const stackList = new KeyedList($('watch-stack')), resultsList = new KeyedList($('watch-results')), historyList = new KeyedList($('watch-history')), filtersList = new KeyedList($('watch-filters')), gapsList = new KeyedList($('watch-gaps-list'));
const sequences = state => ({ overlay: state?.overlay?.seq || 0, signal: state?.signals?.seq || 0 });
// banner: the notice "history not saved" has its own place above every view (#watch-notice), written once.
const surveillanceView = () => describeSurveillance(surveillanceState, { registry: surveillanceRegistry, session: currentState ? { id: currentState.id, readOnly: currentState.readOnly } : null,
  seen, filter: watchFilter, historyLimit, banner: true });
function receiveSurveillance(state) {
  if (!state || typeof state !== 'object' || !state.activity) return;
  surveillanceState = state;
  // First state of a session: what it already holds is history, not news for the tab badge. A state still
  // restoring holds nothing final (sequences at zero): the reference is taken once the saved history is read.
  if (seenFor !== state.sessionId) { const restoring = isRestoring(state); seen = sequences(restoring ? null : state); if (!restoring) seenFor = state.sessionId; }
  // A restored registry (reopened archive) never pops up; otherwise freshness decides what is still news.
  // view.cards holds sourced verifications only: a signal is counted on the tab and read in the panel.
  cardQueue.offer(surveillanceView().cards, { sessionId: state.sessionId, now: Date.now(), prime: Boolean(state.restored) });
  scheduleSurveillance();
}
function drawSurveillance() {
  const open = shell.view === 'watch' && !(floatingMode && !floatingExpanded) && document.visibilityState === 'visible';
  if (open) seen = sequences(surveillanceState);
  const view = surveillanceView();
  shell.watchBadge(view.badge);
  const chip = $('watch-chip');
  chip.hidden = !view.chip.visible; chip.textContent = view.chip.text; chip.dataset.state = view.chip.state;
  $('watch-activity').textContent = [view.activity.text, view.activity.detail && `${view.activity.detail}.`, view.activity.error && `Incident : ${view.activity.error}`].filter(Boolean).join(' ');
  $('watch-activity').dataset.state = view.status;
  // History kept in memory only: said above every view for as long as the state says it, in its own words.
  // The banner carries no action: nothing here ever offers to remove the registry on disk.
  const unsaved = view.notice?.text || '';
  $('watch-notice').hidden = !unsaved; $('watch-notice').dataset.tone = view.notice?.tone || '';
  if ($('watch-notice-text').textContent !== unsaved) $('watch-notice-text').textContent = unsaved;
  $('watch-start').textContent = view.form.startLabel; $('watch-start').disabled = !view.form.canStart || watchBusy;
  $('watch-stop').disabled = !view.form.canStop || watchBusy; $('watch-hint').textContent = view.form.hint;
  // The field shows the running instruction unless the viewer is writing another one.
  const field = $('watch-instruction');
  if (document.activeElement !== field && view.instruction && (!field.value || field.value === syncedInstruction)) field.value = view.instruction;
  syncedInstruction = view.instruction || syncedInstruction;
  drawStack();
  if (shell.view !== 'watch') return;
  resultsList.sync(view.results.map(card => cardEntry(card)));
  $('watch-results-empty').hidden = view.results.length > 0;
  $('watch-results-empty').textContent = view.resultsEmpty;
  $('watch-counts').textContent = view.history.countsLine;
  filtersList.sync(view.history.filters.length > 1 ? view.history.filters.map(filter => filterEntry(filter, filter.key === view.history.filter)) : []);
  historyList.sync(view.history.rows.map(historyEntry));
  $('watch-history-empty').hidden = !view.history.empty; $('watch-history-empty').textContent = view.history.empty || '';
  $('watch-bound').hidden = !view.history.bound.label; $('watch-bound').textContent = view.history.bound.label || '';
  $('watch-more').hidden = !view.history.hiddenByLimit; $('watch-more').textContent = view.history.moreLabel;
  $('watch-gaps').hidden = !view.gaps.rows.length; $('watch-gaps-summary').textContent = `${plural(view.gaps.total, 'passage')} à signaler dans la lecture`;
  gapsList.sync(view.gaps.rows.map(gapEntry));
  refreshRegistry();
}
const scheduleSurveillance = batched(drawSurveillance);
// The pushed state holds the most recent claims only: the whole registry is read when the panel is open and
// something changed, never more than once every two seconds.
function refreshRegistry() {
  if (shell.view !== 'watch' || !surveillanceState?.sessionId || registryBusy || !bridge.surveillanceHistory) return;
  const key = JSON.stringify([surveillanceState.sessionId, surveillanceState.totals, surveillanceState.counts]);
  if (key === registryKey) return;
  const wait = REGISTRY_EVERY_MS - (Date.now() - registryAt);
  clearTimeout(registryTimer);
  if (wait > 0) { registryTimer = setTimeout(refreshRegistry, wait); return; }
  registryBusy = true; registryAt = Date.now();
  bridge.surveillanceHistory().then(registry => { if (registry?.sessionId === surveillanceState?.sessionId) surveillanceRegistry = registry; }).catch(() => {})
    .finally(() => { registryBusy = false; registryKey = key; scheduleSurveillance(); });
}
// Bottom-left stack, for sourced verifications only (the queue refuses any other kind). Nothing here focuses
// anything: a card appears, stays its time and leaves.
function drawStack() {
  const now = Date.now(), collapsed = floatingMode && !floatingExpanded, shown = document.visibilityState === 'visible';
  // With the surveillance panel open the results are already listed under the viewer's eyes: no card on top of them.
  if (shown && !collapsed && shell.view === 'watch') cardQueue.clear();
  const visible = cardQueue.visible(now, { displayable: shown });
  stackList.sync(collapsed ? [] : visible.map(card => cardEntry(card, { compact: true })));
  // The collapsed floating window is one bar high: the card is condensed to a line that opens the window.
  const first = collapsed ? visible[0] : null, toast = $('float-toast');
  toast.hidden = !first; document.body.classList.toggle('has-float-toast', Boolean(first));
  if (first) { toast.textContent = `${first.label} · ${first.intervalLabel} — ${first.text}`; toast.title = 'Ouvrir pour lire le résultat et ses sources'; }
  clearTimeout(stackTimer);
  const next = cardQueue.nextChangeAt();
  if (next !== null) stackTimer = setTimeout(drawStack, Math.max(50, next - Date.now() + 20));
}
const scheduleStack = batched(drawStack);
function showLot(lotId) {
  return showWatch().then(() => {
    drawSurveillance();
    const node = [...$('watch-results').children].find(child => child.dataset.lot === lotId);
    if (!node) return;
    node.scrollIntoView({ block: 'center' }); node.classList.add('flash'); setTimeout(() => node.classList.remove('flash'), 1600);
  });
}
async function showWatch() {
  if (floatingMode && !floatingExpanded) await changeWindowMode(true, true, { focus: false });
  shell.show('watch');
}
for (const example of INSTRUCTION_EXAMPLES) $('watch-examples').append(action('suggestion watch-example', example.label, 'watch-example', { instruction: example.instruction }));
$('watch-duration').replaceChildren(...CARD_DURATIONS_MS.map(ms => new Option(`${ms / 1000} secondes`, String(ms))));
$('watch-duration').value = String(preferences.cardDurationMs);
$('watch-duration').onchange = () => { preferences.cardDurationMs = Number($('watch-duration').value); cardQueue.setDuration(preferences.cardDurationMs); savePreferences(); };
async function commandSurveillance(run) {
  watchBusy = true; $('watch-error').textContent = ''; drawSurveillance();
  try {
    const pushed = watchPushes, state = await run();
    // An activation is answered at once, while the saved history is still being read ("restoring"); the state
    // that follows is pushed. Such an answer never replaces a state pushed since the command left.
    if (!(isRestoring(state) && watchPushes !== pushed)) receiveSurveillance(state?.activity ? state : await bridge.surveillanceState());
  }
  catch (error) { $('watch-error').textContent = reason(error); }
  finally { watchBusy = false; drawSurveillance(); }
}
$('watch-form').onsubmit = event => {
  event.preventDefault();
  const instruction = $('watch-instruction').value.trim();
  if (!instruction) { $('watch-error').textContent = 'Écris d’abord ce que je dois surveiller.'; $('watch-instruction').focus(); return; }
  commandSurveillance(() => bridge.startSurveillance({ instruction }));
};
$('watch-stop').onclick = () => commandSurveillance(() => bridge.stopSurveillance());
$('watch-more').onclick = () => { historyLimit += HISTORY_STEP; drawSurveillance(); };
$('watch-chip').onclick = () => showWatch();
$('close-watch').onclick = () => { shell.show('direct'); if (floatingMode) $('question').focus(); };
$('float-toast').onclick = async () => { const now = Date.now(); for (const card of cardQueue.visible(now)) cardQueue.release(card.key, now, cardQueue.durationMs); await changeWindowMode(true, true, { focus: false }); };
// A card under the pointer or holding the keyboard focus does not vanish while it is being read.
const heldCard = event => (event.target.classList?.contains('watch-card') ? event.target.dataset.key : null);
$('watch-stack').addEventListener('pointerenter', event => { const key = heldCard(event); if (key) cardQueue.hold(key); }, true);
$('watch-stack').addEventListener('pointerleave', event => { const key = heldCard(event); if (key) { cardQueue.release(key, Date.now()); scheduleStack(); } }, true);
// Keyboard focus only: a mouse click also focuses its button, and must not pin the card for ever.
$('watch-stack').addEventListener('focusin', event => { const key = event.target.matches?.(':focus-visible') && event.target.closest('.watch-card')?.dataset.key; if (key) cardQueue.hold(key); });
// Never redrawn from inside the event: a card removed while focused fires this very handler.
$('watch-stack').addEventListener('focusout', event => { const key = event.target.closest('.watch-card')?.dataset.key; if (key) { cardQueue.release(key, Date.now()); scheduleStack(); } });
document.addEventListener('visibilitychange', () => { drawStack(); scheduleSurveillance(); });
shell.onShow = view => { if (view === 'memory' && sessionsStale) refreshSessions(); if (view === 'watch') registryKey = ''; drawSurveillance(); };
bridge.onSurveillance?.(state => { watchPushes++; receiveSurveillance(state); });
bridge.surveillanceState?.().then(receiveSurveillance).catch(() => {});

async function openMoment(frozen) {
  if (quickBusy || !currentState?.id) return;
  quickBusy = true; updateButtons(); notice('');
  try {
    selectedMoment = frozen || await bridge.freezeMoment({kind:'explain'});
    const preview = $('moment-preview'); preview.hidden = true;
    if ($('preview').videoWidth) {
      const canvas = document.createElement('canvas'); canvas.width=320; canvas.height=180;
      canvas.getContext('2d').drawImage($('preview'),0,0,320,180);
      preview.src=canvas.toDataURL('image/jpeg',.7); preview.hidden=false;
    }
    if (floatingMode) await changeWindowMode(true,true);
    $('moment-anchor').textContent = `Instant retenu à ${formatTime(selectedMoment.anchorMs)}. ${recorder ? 'La vidéo continue.' : 'La capture est en pause.'}`;
    $('moment-error').textContent=''; $('moment-question').value='';
    if (!$('moment-dialog').open) $('moment-dialog').showModal();
    momentCheckpoint = recorder?.checkpoint(selectedMoment.anchorMs) || Promise.resolve();
    await momentCheckpoint;
  } catch(error) { notice(reason(error)); $('moment-error').textContent=reason(error); }
  finally { quickBusy=false; updateButtons(); }
}
async function submitMoment(intent, question) {
  if (!selectedMoment || quickBusy) return;
  quickBusy=true; updateButtons();
  try {
    await momentCheckpoint;
    await bridge.explainMoment({token:selectedMoment.token,intent,question});
    $('moment-dialog').close();
    if(floatingMode) await changeWindowMode(true,true);
  } catch(error) { $('moment-error').textContent=reason(error); }
  finally { quickBusy=false; updateButtons(); }
}
async function explainNow() {
  if (quickBusy || !currentState?.id) return;
  quickBusy=true; updateButtons(); notice('');
  try {
    const frozen=await bridge.freezeMoment({kind:'explain'});
    if(floatingMode) await changeWindowMode(true,true);
    await recorder?.checkpoint(frozen.anchorMs);
    forceBottom = true;
    await bridge.explainMoment({token:frozen.token,intent:'explain'});
  } catch(error) { notice(reason(error)); }
  finally { quickBusy=false;updateButtons(); }
}
$('float-explain').onclick=$('explain-moment').onclick=explainNow;
$('close-moment').onclick=()=>$('moment-dialog').close();
$('moment-summarize').onclick=()=>submitMoment('summarize');
$('moment-explain').onclick=()=>submitMoment('explain');
$('moment-question-form').onsubmit=event=>{event.preventDefault();if($('moment-question').value.trim())submitMoment('explain',$('moment-question').value.trim());};
bridge.onExplainMoment(frozen=>openMoment(frozen));
$('catch-up').onclick=async()=>{
  if(quickBusy)return;
  quickBusy=true; updateButtons(); notice('');
  try {
    const frozen=await bridge.freezeMoment({kind:'catch-up'});
    $('attention-status').textContent=`Je retrouve les passages de ${formatTime(frozen.startMs)} à ${formatTime(frozen.anchorMs)}…`;
    await recorder?.checkpoint(frozen.anchorMs);
    forceBottom = true;
    const result=await bridge.catchUp({token:frozen.token});
    $('attention-status').textContent=`Rattrapage demandé : ${formatTime(result.startMs)}–${formatTime(result.endMs)}. Le repère avance après une réponse réussie.`;
  } catch(error){notice(reason(error));}
  finally{quickBusy=false;updateButtons();}
};
$('mark-attention').onclick=async()=>{
  if(quickBusy)return;
  quickBusy=true;updateButtons();
  try{await recorder?.checkpoint();const marker=await bridge.markAttention();$('attention-status').textContent=`Tu reprends ici : ${formatTime(marker.atMs)}. Le prochain rattrapage partira de ce repère.`;}
  catch(error){notice(reason(error));}finally{quickBusy=false;updateButtons();}
};
bridge.momentShortcuts().then(value=>{
  const title=value.explainShortcutRegistered ? 'Explique cet instant · Ctrl/Cmd + Maj + E' : 'Explique cet instant · raccourci global indisponible, utilise ce bouton';
  $('float-explain').title=$('explain-moment').title=title;
}).catch(()=>{});


function receiveRecap(state) {
  if (state?.sessionId && currentState?.id && state.sessionId !== currentState.id) return;
  recapRevision++;
  const sameSession = state?.sessionId && state.sessionId === recapState?.sessionId;
  const keepPrevious = sameSession && ['updating', 'error'].includes(state.status);
  recapState = state ? { ...state,
    overview: state.overview || (keepPrevious ? recapState.overview : ''),
    chapters: state.chapters?.length ? state.chapters : keepPrevious ? recapState.chapters : []
  } : null;
  renderRecap();
}
// Redrawn when the recap or the availability of a cited passage changes, not at every session state.
function renderRecap() {
  const cited = (recapState?.chapters || []).flatMap(chapter => chapter.sources || []);
  const key = [recapRevision, currentState?.id, recapState?.sessionId, cited.map(source => (passages.get(source.id)?.available ? 1 : 0)).join('')].join('|');
  if (key === recapKey) return;
  recapKey = key;
  renderRecapView({
    state: recapState, session: currentState,
    targets: [[$('recap-content'), false], [$('recap-dialog-content'), true]],
    replay, notice
  });
}
async function openRecap() {
  if (floatingMode) await changeWindowMode(true, true);
  renderRecap();
  if (!$('recap-dialog').open) $('recap-dialog').showModal();
}
$('open-recap').onclick = $('open-recap-all').onclick = () => openRecap().catch(error => notice(reason(error)));
$('close-recap').onclick = () => $('recap-dialog').close();
bridge.onRecap(receiveRecap);
const initialRecapRevision = recapRevision;
bridge.recapState().then(state => { if (recapRevision === initialRecapRevision) receiveRecap(state); }).catch(() => {
  if (recapRevision === initialRecapRevision) receiveRecap({ sessionId: currentState?.id, status: 'error', chapters: [], overview: '' });
});
drawState();
