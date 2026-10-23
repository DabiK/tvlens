import { createRendererWiring } from './ui/renderer-wiring.mjs';
import { buildLabel } from './ui/build-info.mjs';
import { bindSetup } from './ui/setup.mjs';
import { element as el, formatTime, action } from './ui/format.js';
import { ViewingShell } from './ui/shell.js';
import { createBrowserCaptureController } from './ui/browser-capture.mjs';
import { bindCaptureActions } from './ui/capture-actions.mjs';
import { bindMomentActions } from './ui/moment-actions.mjs';
import { renderCaptureControls } from './ui/capture-controls.mjs';
import { describeSourceListing } from './ui/source-menu.mjs';
import { cleanError, formatBytes, plural } from './ui/text.mjs';
import { clockLabel } from './ui/job-view.mjs';
import { isRestoring, INSTRUCTION_EXAMPLES } from './ui/surveillance-view.mjs';
import { describeSessions, describeStorage, describeArchive, describeDeletion, describeCoverage, mediaNote } from './ui/sessions-view.mjs';
import { CARD_DURATIONS_MS, DEFAULT_CARD_DURATION_MS } from './ui/card-queue.mjs';
import { KeyedList, tail, olderPassagesLabel, trimMap, settledCount } from './ui/list-view.mjs';
import { cardEntry, historyEntry, filterEntry, gapEntry } from './ui/surveillance-dom.js';
import { sessionEntry } from './ui/sessions-dom.js';
import { FALLBACK_MS } from './ui/state-delivery.mjs';
const $ = id => document.getElementById(id);
const shell = new ViewingShell();
const bridge = window.tvlens;
// Reversible display bounds: a film is hundreds of passages, the window draws the recent ones.
const RAIL_LIMIT = 40, PREVIEW_LIMIT = 60, HISTORY_STEP = 200, REGISTRY_EVERY_MS = 2000;
let configuration, pendingQuestion = '', pendingQuestionAt = 0;
const momentPreviews = new Map();
let shownError = '', forceBottom = false, settled = -1;
const cancelling = new Set();
const reason = error => cleanError(error);
const status = text => { $('state').textContent = text; $('live-state').textContent = text; };
// One notice, above every view: an error raised from Mémoire or Surveillance is no longer written off screen.
const notice = text => { $('notice').textContent = text || ''; };
// At most one drawing per frame, however many states arrive; the timer covers a window that is not painting.
function batched(run) {
  let queued = false, timer;
  const fire = () => { if (!queued) return; queued = false; clearTimeout(timer); run(); };
  return () => { if (queued) return; queued = true; timer = setTimeout(fire, FALLBACK_MS); requestAnimationFrame(fire); };
}

async function refresh() {
  $('refresh').disabled = true;
  try {
    const result = await window.capture.sources();
    setSources(result);
    $('start').disabled = !result.sources.length || capture.previewOpen;
    if (!capture.previewOpen) status(describeSourceListing({ result }).status);
  } catch (error) {
    // The sources listed before stay selectable: only the menu's first line, its placeholder, says the failure.
    const failed = describeSourceListing({ error });
    $('source').options[0].text = failed.placeholder;
    status(failed.status);
    sourcesNotice(failed.notice);
  }
  finally {
    $('refresh').disabled = capture.previewOpen;
    updateButtons();
  }
}
function setSources(result) {
  const listing = describeSourceListing({ result });
  const previous = $('source').value;
  const chosen = result.sources.some(source => source.id === previous) ? previous : result.preferredSourceId || (result.sources.length === 1 ? result.sources[0].id : '');
  $('source').replaceChildren(new Option(listing.placeholder, ''), ...result.sources.map(source => new Option(source.name, source.id)));
  $('source').value = chosen;
  sourcesNotice(listing.notice);
}
// The notice is shared with every view: a listing clears only the access notice it wrote itself.
let shownSourcesNotice = '';
function sourcesNotice(text) {
  if (text) notice(text);
  else if ($('notice').textContent === shownSourcesNotice) notice('');
  shownSourcesNotice = text;
}
function setConfig(value) {
  configuration = value;
  $('build-info').textContent = buildLabel(value.build);
  $('protected-settings-note').hidden = !value.protectedSettingsSkipped;
  wiring.receiveTranscription(value.transcription);
  $('provider').textContent = `Codex ${value.canObserve ? 'prêt' : 'indisponible'} · ${value.model.split('/').at(-1)}`;
  $('cloud-note').textContent = 'Images et transcription envoyées à Codex · audio transcrit sur ce Mac.';
  scheduleState(); updateButtons();
}
function updateButtons() {
  renderCaptureControls({
    get: $, shell, capture, session: wiring.session,
    captureBusy: captureActions.busy, quickBusy: momentActions.busy,
    configuration, verificationBusy: wiring.verificationState.busy, pendingQuestion,
  });
}
const capture = createBrowserCaptureController({
  bridge,
  source: () => $('source').value,
  video: $('preview'),
  session: () => wiring.session,
  view: {
    previewStarting: () => { $('start').disabled = true; },
    observing: () => {
      $('observe').disabled = true;
      notice('');
    },
    stopping: () => { $('stop').disabled = true; },
    preview: active => {
      document.body.classList.toggle('has-preview', active);
      $('stop').disabled = !active;
      $('source').disabled = active;
      $('refresh').disabled = active;
      if (!active) $('start').disabled = !$('source').value;
    },
    recording: () => {
      $('mode').textContent = 'EN DIRECT';
      $('mode').classList.add('cloud');
      $('source').disabled = true;
    },
    stopped: () => {
      $('mode').textContent = wiring.session?.id ? 'EN PAUSE' : 'PRÊT À REGARDER';
      $('mode').classList.remove('cloud');
    },
    changed: updateButtons,
    settled: () => {
      drawBanners();
      drawSessions();
    },
    status,
    error: (error, phase) => {
      if (phase === 'preview') status(`Capture interrompue : ${reason(error)}`);
      else if (phase !== 'recorder' || !diskFull()) notice(reason(error));
    },
    meter: value => { $('meter').value = value; },
    state: receiveState,
    segment: (id, preview, session) => {
      if (preview && wiring.session?.id === session.id) momentPreviews.set(id, preview);
      scheduleState();
    },
  },
});
const captureActions = bindCaptureActions({
  get: $, capture, bridge, window,
  sources: () => window.capture.sources(),
  openPermissions: () => window.capture.settings(),
  session: () => wiring.session,
  configuration: () => configuration,
  mode: () => ({ floating: floatingMode, expanded: floatingExpanded }),
  changeWindowMode,
  showDirect: () => shell.show('direct'),
  refresh, setSources, changed: updateButtons, notice,
});
const momentActions = bindMomentActions({
  get: $, capture, bridge,
  session: () => wiring.session,
  mode: () => ({ floating: floatingMode, expanded: floatingExpanded }),
  changeWindowMode, changed: updateButtons, notice,
  forceBottom: () => { forceBottom = true; },
});
const thumbnail = id => `tvlens-media://${wiring.session.id}/thumb/${id}`;
const previewOf = id => momentPreviews.get(id) || (wiring.passages.get(id)?.thumbnailAvailable ? thumbnail(id) : undefined);

// ---- Loaded session --------------------------------------------------------------------------
function receiveState(state) { wiring.receiveState(state); }
function adoptedState(state) {
  if (loadedSessionId !== state.id) {
    momentPreviews.clear(); cancelling.clear(); surveillanceRegistry = null; registryKey = ''; shownError = '';
  }
  loadedSessionId = state.id;
  if (state.storage) storageState = { ...storageState, ...state.storage };
  // Une pause imposée par l’hôte ou un disque plein arrête aussi le recorder qui ne peut plus livrer de passages.
  captureActions.pauseIfUnavailable({ accepting: state.accepting });
}
let loadedSessionId = null;
const PASSAGE_LABELS = { queued: 'En attente d’analyse', analyzing: 'Analyse en cours…', ready: 'Analysé', partial: 'Analyse partielle', skipped: 'Analyse sautée : file pleine', error: 'Analyse indisponible', expired: 'Vidéo expirée avant l’analyse' };
const timelineList = new KeyedList($('timeline'));
function drawSessionChrome() {
  const state = wiring.session;
  drawBanners();
  if (!state) { drawTimeline(); drawSurveillance(); updateButtons(); return; }
  $('elapsed').textContent = formatTime(state.elapsedMs);
  $('chat-coverage').textContent = describeCoverage(state);
  $('usage').textContent = `Perception Codex : ${plural(state.apiCalls, 'passage')}`;
  // Said once per message: a state arrives several times a second and must not overwrite a newer notice.
  if (state.lastError && state.lastError !== shownError && !diskFull()) notice(state.lastError);
  shownError = state.lastError || '';
  drawTimeline(); drawSurveillance(); updateButtons();
}
const wiring = createRendererWiring({
  bridge, window, document, get: $, shell,
  configuration: () => configuration, library: () => library, preview: previewOf,
  askChapter: chapter => {
    const question = $('question');
    const prompt = `À propos du chapitre « ${chapter.title || 'Chapitre'} » (${formatTime(chapter.startMs)} – ${formatTime(chapter.endMs)}) : `;
    question.value = question.value.trim() ? `${question.value}\n${prompt}` : prompt;
    question.focus();
    updateButtons();
  },
  chatOptions: () => ({ cancelling, pendingQuestion, pendingQuestionAt, forceBottom }),
  mode: () => ({ floating: floatingMode, expanded: floatingExpanded }),
  watchOptions: () => ({ registry: surveillanceRegistry, filter: watchFilter, historyLimit }),
  views: { adopted: adoptedState, session: drawSessionChrome, chat: chatDrawn, reset: resetSessionChrome,
    changed: updateButtons, surveillance: drawSurveillanceChrome },
  notice,
  time: {
    now: () => Date.now(), requestFrame: callback => requestAnimationFrame(callback), cancelFrame: id => cancelAnimationFrame(id),
    setTimer: (callback, delay) => setTimeout(callback, delay), clearTimer: id => clearTimeout(id),
  },
});
const scheduleState = () => wiring.scheduleState();
const drawState = () => wiring.drawState();
function drawTimeline() {
  const state = wiring.session, { items, olderCount } = tail(state?.segments, RAIL_LIMIT);
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
const diskFull = () => storageView.blocked || wiring.session?.storage?.state === 'blocked';
function drawBanners() {
  const archive = describeArchive(wiring.session);
  $('archive-banner').hidden = !archive;
  if (archive) { $('archive-label').textContent = archive.label.toUpperCase(); $('archive-text').textContent = `${archive.text}.`; $('archive-hint').textContent = archive.hint; }
  storageView = describeStorage(storageState, { capturing: capture.recording });
  $('storage-banner').hidden = !storageView.banner;
  if (storageView.banner) { $('storage-banner').dataset.state = storageView.banner.state; $('storage-banner-title').textContent = storageView.banner.title; $('storage-banner-text').textContent = storageView.banner.text; }
  $('storage-line').textContent = storageView.line; $('storage-line').dataset.state = storageView.state;
  // Out of room: capture stops and says so. Nothing is deleted, here or by the host.
  captureActions.pauseIfUnavailable({ blocked: storageView.blocked });
}
function receiveStorage(storage) { if (!storage) return; storageState = { ...storage }; drawBanners(); }

// ---- Conversation: one card per question, only what changed is redrawn -----------------------
const drawChat = () => wiring.drawChat();
function chatDrawn() {
  forceBottom = false;
  // The budget file is read again when a question finishes, not at each fragment of an answer.
  const finished = settledCount(wiring.deepState.jobs);
  if (finished !== settled) { settled = finished; refreshResearchBudget(); }
}
const scheduleChat = () => wiring.scheduleChat();
function refreshResearchBudget() { bridge.researchBudget().then(b => { $('research-usage').textContent = `OpenRouter (historique + embeddings) : ${b.spentUsd.toFixed(4)} $ comptabilisés${b.limitUsd==null?' · sans plafond local':` sur ${b.limitUsd} $`}${b.heldUsd ? ' · appels réservés en cours ou coût inconnu' : ''}`; }).catch(() => {}); }
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
const jobOf = id => wiring.deepState.jobs.find(job => job.id === id);
const actions = {
  'job-cancel': async data => { cancelling.add(data.id); drawChat(); try { await bridge.cancelDeep(data.id); } finally { cancelling.delete(data.id); scheduleChat(); } },
  'job-reask': data => { const job = jobOf(data.id); if (job) { $('question').value = job.question; $('question').focus(); updateButtons(); } },
  'job-reexamine': data => { const job = jobOf(data.id); return job && (job.intent ? bridge.reexamineMoment(job.id) : bridge.deepen(job.question)); },
  'chat-source': data => bridge.openChatSource(data.job, Number(data.index)),
  'verify-cancel': (data, target) => { target.disabled = true; return bridge.cancelVerification(); },
  'verify-source': data => bridge.openSource(data.job, Number(data.index)),
  'watch-dismiss': data => { cardQueue.dismiss(data.key); drawStack(); },
  'watch-show-lot': data => showLot(data.lot),
  'watch-retry': async data => receiveSurveillance(await bridge.retrySurveillanceClaim(data.id)),
  'watch-filter': data => { watchFilter = data.filter; historyLimit = HISTORY_STEP; drawSurveillance(); },
  'watch-example': data => { $('watch-instruction').value = data.instruction; $('watch-instruction').focus(); },
  'session-open': data => openArchive(data.id),
  'session-delete': data => askDeleteSession(data.id),
  'session-resume': () => captureActions.requestCapture(() => captureActions.captureFromArchive()),
};
$('source').onchange = updateButtons;
$('refresh').onclick = refresh;
$('settings').onclick = () => window.capture.settings().catch(error => notice(reason(error)));
$('import').onclick = () => bridge.importConfig().then(setConfig).catch(error => notice(reason(error)));
$('close-replay').onclick = () => $('replay-dialog').close();
$('replay-dialog').onclose = () => { $('replay').pause(); $('replay').removeAttribute('src'); $('replay').load(); };
$('replay').onvolumechange = () => { if (wiring.session?.accepting) $('replay').muted = true; };
$('replay').onerror = () => { $('replay-note').textContent = 'Ce passage ne peut pas être lu : sa vidéo n’est plus disponible.'; };
bridge.config().then(setConfig).catch(error => notice(reason(error)));

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
$('float-transcription-warning').onclick = () => changeWindowMode(true, true, { focus: false });
$('float-audio-warning').onclick = () => changeWindowMode(true, true, { focus: false });
$('float-full').onclick=()=>{shell.show('direct');return changeWindowMode(false);};
$('close-chat').onclick=()=>changeWindowMode(true,false);
$('float-menu-toggle').onclick=async()=>{
  if ($('float-menu').matches(':popover-open')) { $('float-menu').hidePopover(); return; }
  if (!floatingExpanded) await changeWindowMode(true,true);
  $('float-menu').showPopover();
};
$('float-watch').onclick=()=>showWatch();
$('float-memory').onclick=()=>openLibrary();
// In the floating window the surveillance takes the place of the chat: "Demander" brings the chat back.
$('float-chat').onclick=()=>{if(floatingExpanded&&shell.view==='watch'){shell.show('direct');$('question').focus();return;}return changeWindowMode(true,!floatingExpanded);};
// ---- Sessions: archives, explicit resume, deletion, disk --------------------------------------
let library = null, sessionsView = describeSessions(null), sessionsStale = true, deleteSessionId = null;
const sessionsList = new KeyedList($('sessions-list'));
function drawSessions() {
  sessionsView = describeSessions(library, { capturing: capture.recording, readOnly: Boolean(wiring.session?.readOnly) });
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
async function openArchive(id) {
  return captureActions.openArchive(async () => {
    notice('');
    await bridge.openSession(id);
    await wiring.pullSession();
    shell.show('direct');
  });
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
function resetSessionChrome() {
  momentActions.reset(); cancelling.clear(); loadedSessionId = null;
  surveillanceRegistry = null; registryKey = ''; shownError = '';
  $('recap-dialog').close(); $('moment-dialog').close(); $('attention-status').textContent = ''; notice(''); momentPreviews.clear();
  $('elapsed').textContent = '00:00'; $('mode').textContent = 'PRÊT À REGARDER'; $('mode').classList.remove('cloud');
  $('memory-status').textContent = 'Les passages apparaîtront après quelques secondes de capture.'; $('chat-coverage').textContent = '';
}

bridge.onSessionsChanged?.(sessionsChanged);
bridge.onStorage?.(receiveStorage);
bridge.storage?.().then(receiveStorage).catch(() => {});

async function keepRecent(){try{const saved=await bridge.keepMoment();notice(`Moment ${formatTime(saved.startMs)}–${formatTime(saved.endMs)} conservé jusqu’à suppression.`);shell.bookmarkFeedback(true);setTimeout(()=>shell.bookmarkFeedback(false),2000);await renderSavedRail();}catch(e){notice(reason(e));}}
$('keep-moment').onclick=keepRecent;$('float-keep').onclick=keepRecent;
let deleteSavedId;
function momentCard(moment, { savedId } = {}) {
  if (!savedId) return wiring.momentCard(moment);
  return wiring.momentCard(moment, {
    available: true,
    replay: () => {
      $('replay-title').textContent = 'Moment conservé';
      $('replay').src = `tvlens-saved://${savedId}/${moment.id}`;
      $('replay').onloadedmetadata = null;
      $('replay').muted = true;
      $('replay-note').textContent = 'Copie conservée sur ce Mac ; supprimer le moment efface aussi cette vidéo.';
      $('replay-dialog').showModal();
      $('replay').play().catch(() => {
        // Les contrôles du lecteur permettent une relance manuelle ; onerror présente une vidéo illisible.
      });
    },
  });
}
async function renderSaved(){const values=await bridge.savedMoments();$('saved-results').replaceChildren(...values.map(value=>{const group=el('section','saved-group');group.append(el('small','hint',new Date(value.createdAt).toLocaleString()+' · Conservé'));for(const m of value.moments)group.append(momentCard(m,{savedId:value.id}));const remove=el('button','link','Supprimer ce moment');remove.onclick=()=>{deleteSavedId=value.id;$('delete-saved-dialog').showModal();};group.append(remove);return group;}));if(!values.length)$('saved-results').append(el('p','hint','Aucun moment gardé.'));renderSavedRail(values);}
async function renderSavedRail(values){values ||= await bridge.savedMoments();const tiles=values.slice(0,5).map(value=>{const moment=value.moments[0],tile=el('button','saved-tile'),preview=el('img');preview.alt='Aperçu du moment gardé';if(moment?.preview)preview.src=moment.preview;const copy=el('span');copy.append(el('strong','',formatTime(value.startMs)),document.createTextNode(moment?.observation?.summary||'Moment gardé'));tile.append(preview,copy);tile.onclick=()=>openLibrary().catch(e=>notice(reason(e)));return tile;});$('saved-rail').replaceChildren(...(tiles.length?tiles:[el('p','placeholder','Garde un moment pour le retrouver ici.')]));}
async function openLibrary(){if(floatingMode)await changeWindowMode(true,true);$('library-dialog').showModal();await renderSaved();const settings=await bridge.viewingSettings();$('bookmark-shortcut').value=settings.bookmarkShortcut;$('shortcut-status').textContent=settings.shortcutRegistered?'Raccourci actif.':'Raccourci indisponible : choisis une autre combinaison.';}
$('open-library').onclick=()=>openLibrary().catch(e=>notice(reason(e)));$('close-library').onclick=()=>$('library-dialog').close();$('refresh-saved').onclick=()=>renderSaved().catch(e=>notice(reason(e)));
$('saved-all').onclick=$('open-library').onclick;
$('nav-saved').onclick=$('open-library').onclick;
$('nav-search').onclick=async()=>{await openLibrary();$('moment-query').focus();};
$('shortcut-form').onsubmit=async e=>{e.preventDefault();try{await bridge.saveViewingSettings({bookmarkShortcut:$('bookmark-shortcut').value.trim()});$('shortcut-status').textContent='Raccourci enregistré.';}catch(e){$('shortcut-status').textContent=reason(e);}};
$('cancel-delete-saved').onclick=()=>$('delete-saved-dialog').close();$('confirm-delete-saved').onclick=async()=>{try{await bridge.removeSaved(deleteSavedId);$('delete-saved-dialog').close();await renderSaved();}catch(e){notice(reason(e));}};
bridge.onSaved(()=>{notice('Moment conservé sur ce Mac jusqu’à suppression.');renderSavedRail().catch(()=>{});if($('library-dialog').open)renderSaved().catch(()=>{});});bridge.onSaveError(message=>notice(reason(message)));
renderSavedRail().catch(()=>{});
setInterval(()=>bridge.quota().then(q=>{$('quota-status').textContent=q.windows.length?'Codex : '+q.windows.map(w=>`${w.remainingPercent} % restants (${w.windowMinutes===10080?'semaine':w.windowMinutes+' min'})`).join(' · '):'Quota Codex : pas encore lu';}).catch(()=>{}),10000);

// ---- Surveillance: free instruction, discreet activity, sourced cards, history by state --------
const PREFERENCES = 'tvlens.surveillance.display';
function loadPreferences() {
  let saved = {};
  try {
    saved = JSON.parse(localStorage.getItem(PREFERENCES) || '{}') || {};
  } catch {
    // Stockage refusé ou JSON illisible : saved reste vide, seule la durée d'affichage prend sa valeur par défaut.
  }
  // The only display choice is how long a card stays. What may become a card is not one: sourced verifications only.
  return { cardDurationMs: CARD_DURATIONS_MS.includes(saved.cardDurationMs) ? saved.cardDurationMs : DEFAULT_CARD_DURATION_MS };
}
const preferences = loadPreferences();
const savePreferences = () => {
  try {
    localStorage.setItem(PREFERENCES, JSON.stringify(preferences));
  } catch {
    // La durée choisie est déjà appliquée à cardQueue et conservée en mémoire ; seule sa reprise après rechargement est perdue.
  }
};
let surveillanceRegistry = null, registryKey = '', registryAt = 0, registryBusy = false, registryTimer;
let watchFilter = 'all', historyLimit = HISTORY_STEP, syncedInstruction = '', watchBusy = false;
const cardQueue = wiring.cardQueue;
cardQueue.setDuration(preferences.cardDurationMs);
const resultsList = new KeyedList($('watch-results')), historyList = new KeyedList($('watch-history')), filtersList = new KeyedList($('watch-filters')), gapsList = new KeyedList($('watch-gaps-list'));
const receiveSurveillance = state => wiring.receiveSurveillance(state);
const drawSurveillance = () => wiring.drawSurveillance();
function drawSurveillanceChrome(view) {
  $('watch-start').textContent = view.form.startLabel; $('watch-start').disabled = !view.form.canStart || watchBusy;
  $('watch-stop').disabled = !view.form.canStop || watchBusy; $('watch-hint').textContent = view.form.hint;
  // The field shows the running instruction unless the viewer is writing another one.
  const field = $('watch-instruction');
  if (document.activeElement !== field && view.instruction && (!field.value || field.value === syncedInstruction)) field.value = view.instruction;
  syncedInstruction = view.instruction || syncedInstruction;
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
const scheduleSurveillance = () => wiring.scheduleSurveillance();
// The pushed state holds the most recent claims only: the whole registry is read when the panel is open and
// something changed, never more than once every two seconds.
function refreshRegistry() {
  if (shell.view !== 'watch' || !wiring.surveillanceState?.sessionId || registryBusy || !bridge.surveillanceHistory) return;
  const key = JSON.stringify([wiring.surveillanceState.sessionId, wiring.surveillanceState.totals, wiring.surveillanceState.counts]);
  if (key === registryKey) return;
  const wait = REGISTRY_EVERY_MS - (Date.now() - registryAt);
  clearTimeout(registryTimer);
  if (wait > 0) { registryTimer = setTimeout(refreshRegistry, wait); return; }
  registryBusy = true; registryAt = Date.now();
  bridge.surveillanceHistory().then(registry => { if (registry?.sessionId === wiring.surveillanceState?.sessionId) surveillanceRegistry = registry; }).catch(() => {})
    .finally(() => { registryBusy = false; registryKey = key; scheduleSurveillance(); });
}
const drawStack = () => wiring.drawStack();
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
    const pushed = wiring.watchPushes, state = await run();
    // An activation is answered at once, while the saved history is still being read ("restoring"); the state
    // that follows is pushed. Such an answer never replaces a state pushed since the command left.
    if (!(isRestoring(state) && wiring.watchPushes !== pushed)) receiveSurveillance(state?.activity ? state : await bridge.surveillanceState());
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
const renderRecap = () => wiring.renderRecap();
async function openRecap() {
  if (floatingMode) await changeWindowMode(true, true);
  renderRecap();
  if (!$('recap-dialog').open) $('recap-dialog').showModal();
}
$('open-recap').onclick = $('open-recap-all').onclick = () => openRecap().catch(error => notice(reason(error)));
$('close-recap').onclick = () => $('recap-dialog').close();
wiring.bind(actions);
drawState();
const installation = bindSetup({ bridge, get: $, refreshSources: refresh, prepare: async () => {
  $('models-dialog').close();
  if (floatingMode) await changeWindowMode(false);
} });
installation.start();
