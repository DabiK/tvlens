import { ViewingShell } from './ui/shell.js';
import { RollingRecorder } from './recording.js';
const $ = id => document.getElementById(id);
const shell = new ViewingShell();
let stream, context, worklet, recorder, configuration, currentState, stopping = false, pendingQuestion = '', lastChatSignature = '';
let verificationState = { busy: false, jobs: [] }, sessionEpoch = Date.now(), pendingQuestionAt = 0;
let deepState = { jobs: [] };
let recapState = null, recapRevision = 0;
let floatingCaptureBusy = false, sourceReturnExpanded = false;
const momentPreviews = new Map();
let quickBusy = false, selectedMoment = null, momentCheckpoint = Promise.resolve();
const verifyPrefix = /^(?:\/verify\b|v[ée]rifie(?:r)?\b(?:\s+(?:que|si))?|fact[- ]?check\b)\s*[:—-]?\s*/i;
const flushes = new Map();
const status = text => { $('state').textContent = text; $('live-state').textContent = text; };
const notice = text => { $('notice').textContent = text; $('quick-notice').textContent = text; };
const formatTime = ms => `${String(Math.floor(ms / 60000)).padStart(2, '0')}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}`;
const el = (tag, className, text) => { const node = document.createElement(tag); if (className) node.className = className; if (text !== undefined) node.textContent = text; return node; };

async function refresh() {
  $('refresh').disabled = true;
  try {
    const result = await window.capture.sources();
    setSources(result);
    $('start').disabled = !result.sources.length || Boolean(stream);
    if (!stream) status(result.permission === 'granted' ? 'Écran autorisé · Choisis une source' : `Autorisation écran : ${result.permission} · Vérifie les autorisations`);
  } catch (error) { status(`Capture indisponible : ${error.message}`); }
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
  updateButtons();
}
function updateButtons() {
  shell.observation(currentState, Boolean(recorder));
  $('float-status').textContent = recorder ? 'En direct' : currentState?.id ? 'En pause' : 'Prêt';
  $('new-session').disabled=Boolean(stream)||Boolean(currentState?.analyzing)||stopping;
  $('float-record').disabled = floatingCaptureBusy || stopping;
  $('float-record').classList.toggle('recording',Boolean(recorder));
  $('float-record').title = recorder ? 'Mettre en pause ; mémoire et fil Codex conservés' : 'Choisir une source puis lancer la capture et l’analyse';
  $('observe').disabled = !configuration?.canObserve || !$('source').value || Boolean(recorder) || floatingCaptureBusy || stopping;
  $('observe').textContent = recorder ? 'Analyse en cours' : currentState?.id ? 'Reprendre l’analyse' : 'Lancer l’observation';
  const canAsk = Boolean(currentState?.segments.length || currentState?.history.length);
  for (const id of ['float-explain', 'explain-moment', 'catch-up', 'mark-attention']) $(id).disabled = !currentState?.id || stopping || quickBusy;
  for (const id of ['moment-summarize', 'moment-explain', 'moment-send']) $(id).disabled = quickBusy;
  $('keep-moment').disabled = $('float-keep').disabled = !currentState?.segments.some(segment => segment.available) || stopping;
  $('question').disabled = false;
  $('verify').disabled = !configuration?.verificationAvailable || verificationState.busy;
  $('send').disabled = !canAsk || Boolean(pendingQuestion);
  $('ask-status').textContent = currentState?.asking ? 'Réponse en cours · Tu peux ajouter une question.' : canAsk ? 'Entrée pour envoyer · Maj+Entrée pour une ligne' : currentState?.id ? 'Les premiers passages arrivent bientôt.' : 'Choisis une source et lance TVLens.';
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
    stream.getVideoTracks()[0].onended = () => stop().catch(error => notice(error.message));
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
  } catch (error) { await stop(); status(`Capture interrompue : ${error.message}`); return false; }
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
async function observe() {
  $('observe').disabled = true; notice('');
  try {
    const session = await window.tvlens.start();
    renderState(await window.tvlens.state());
    recorder = new RollingRecorder({ stream, video: $('preview'), audioContext: context, flushAudio, session, onError: notice, onSegment: (id, preview) => {
      if (preview && currentState?.id === session.id) momentPreviews.set(id, preview);
      if (currentState) renderState(currentState);
    } });
    recorder.start();
    $('mode').textContent = 'EN DIRECT'; $('mode').classList.add('cloud');
    $('source').disabled = true;
    status('Capture + mémoire actives');
    updateButtons();
  } catch (error) { recorder = undefined; await window.tvlens.stop(); notice(error.message); updateButtons(); }
}
async function stop() {
  if (stopping) return;
  stopping = true; $('stop').disabled = true; updateButtons();
  try {
    await recorder?.stop(); recorder = undefined;
    await window.tvlens.stop();
    const old = stream; stream = undefined;
    old?.getTracks().forEach(track => track.stop());
    await context?.close(); context = undefined; worklet = undefined;
    $('preview').srcObject = null; $('meter').value = 0;
    document.body.classList.remove('has-preview');
    $('start').disabled = !$('source').value; $('source').disabled = false; $('refresh').disabled = false;
    $('mode').textContent = currentState?.id ? 'EN PAUSE' : 'PRÊT À REGARDER'; $('mode').classList.remove('cloud');
    status(currentState?.id ? 'Capture en pause · Contexte et chat conservés' : 'Capture inactive');
  } finally { stopping = false; updateButtons(); }
}
function replay(id, offset = 0) {
  const segment = currentState?.segments.find(s => s.id === id && s.available);
  if (!segment) return notice('Le média de ce passage a expiré. Son résumé reste disponible.');
  $('replay-title').textContent = `Passage ${formatTime(segment.startMs)} — ${formatTime(segment.endMs)}`;
  $('replay').muted = true;
  $('replay').src = `tvlens-media://${currentState.id}/${segment.id}`;
  $('replay').onloadedmetadata = () => { $('replay').currentTime = Math.min(offset, Math.max(0, $('replay').duration - 0.1)); };
  $('replay-note').textContent = currentState.accepting ? 'Relecture muette pendant l’observation pour ne pas recapturer son audio.' : 'Tu peux activer le son : l’observation est arrêtée.';
  $('replay-dialog').showModal();
  $('replay').play().catch(() => {});
}
function renderState(state) {
  if (currentState?.id !== state.id) { sessionEpoch = Date.now() - state.elapsedMs; lastChatSignature = ''; momentPreviews.clear(); }
  currentState = state;
  if (recapState?.sessionId && recapState.sessionId !== state.id) recapState = null;
  renderRecap();
  $('elapsed').textContent = formatTime(state.elapsedMs);
  $('chat-coverage').textContent=`Capturé ${formatTime(state.capturedThroughMs||0)} · Analysé ${formatTime(state.analyzedThroughMs||0)} · ${state.pending||0} en attente · ${(state.gaps||[]).length} lacune(s)`;
  $('usage').textContent = `Perception Codex : ${state.apiCalls} passage${state.apiCalls > 1 ? 's' : ''}`;
  const available = state.segments.filter(s => s.available);
  const analyzed = available.filter(s => s.status === 'ready').length;
  const gaps = state.segments.filter(s => ['error', 'skipped', 'expired'].includes(s.status)).length;
  $('memory-status').textContent = `${available.length} passage${available.length > 1 ? 's' : ''} récent${available.length > 1 ? 's' : ''} · ${analyzed} analysé${analyzed > 1 ? 's' : ''}${state.pending ? ` · ${state.pending} en attente` : ''}${gaps ? ` · ${gaps} sans analyse` : ''} · Mémoire vidéo de 5 min, résumés conservés pour la session`;
  if (state.lastError) notice(state.lastError);
  const labels = { queued: 'En attente d’analyse', analyzing: 'Analyse en cours…', ready: 'Analysé', skipped: 'Analyse sautée : file pleine', error: 'Analyse indisponible', expired: 'Média expiré' };
  // Ingest completion can arrive before its state event: absence is not expiration.
  for (const segment of state.history || []) momentPreviews.delete(segment.id);
  const moments = state.segments.slice().reverse().map(segment => {
    const row = el('article', 'moment');
    const imageUrl = momentPreviews.get(segment.id);
    const preview = el(imageUrl ? 'img' : 'div', 'moment-image');
    if (imageUrl) { preview.alt = `Aperçu du passage à ${formatTime(segment.startMs)}`; preview.src = imageUrl; }
    else { preview.setAttribute('role', 'img'); preview.setAttribute('aria-label', 'Aperçu indisponible'); }
    const button = el('button', 'moment-time', formatTime(segment.startMs));
    button.disabled = !segment.available; button.title = 'Revoir ce passage'; button.onclick = () => replay(segment.id);
    const detail = el('div');
    detail.append(el('p', '', segment.observation?.summary || labels[segment.status]));
    detail.append(el('small', segment.status === 'error' ? 'error' : '', `${formatTime(segment.startMs)}–${formatTime(segment.endMs)} · ${segment.error || segment.stage || labels[segment.status]}${segment.hasAudio ? '' : ' · Sans audio'}`));
    row.append(preview, button, detail); return row;
  });
  $('timeline').replaceChildren(...(moments.length ? moments : [el('p', 'placeholder', 'Les moments observés apparaîtront ici.')]));
  renderChat(); updateButtons();
}
function renderChat() {
  const waiting=deepState.jobs.filter(j=>j.status==='queued').length;$('queue-status').textContent=waiting?`${waiting} question(s) dans la file · traitement dans l’ordre`:'';
  const questions = currentState?.questions || [];
  const pending = pendingQuestion && questions.at(-1)?.question !== pendingQuestion;
  const signature = JSON.stringify([questions, pending ? pendingQuestion : '', verificationState, deepState]);
  if (signature === lastChatSignature || (!questions.length && !pendingQuestion && !verificationState.jobs.length && !deepState.jobs.length)) return;
  lastChatSignature = signature;
  const nodes = [];
  const entries = [
    ...questions.map(response => ({ type: 'ask', at: sessionEpoch + response.atMs, response })),
    ...verificationState.jobs.map(job => ({ type: 'verify', at: job.createdAt, job })),
    ...deepState.jobs.map(job => ({ type: 'deep', at: job.createdAt, job })),
    ...(pending ? [{ type: 'pending', at: pendingQuestionAt }] : [])
  ].sort((a, b) => a.at - b.at);
  for (const entry of entries) {
    if (entry.type === 'verify') { nodes.push(renderVerification(entry.job)); continue; }
    if (entry.type === 'deep') { nodes.push(renderDeep(entry.job)); continue; }
    if (entry.type === 'pending') { nodes.push(el('div', 'chat-question', pendingQuestion), el('p', 'pending', 'Je retrouve les passages utiles…')); continue; }
    const response = entry.response;
    nodes.push(el('div', 'chat-question', response.question));
    nodes.push(el('div', 'answer-kind', { observation: 'OBSERVATION', explanation: 'EXPLICATION', insufficient: 'CONTEXTE INSUFFISANT' }[response.kind]));
    nodes.push(el('div', 'chat-answer', response.answer));
    if (response.limits.length) nodes.push(el('p', 'answer-limits', response.limits.join(' ')));
    const references = el('div', 'references');
    for (const citation of response.citations) {
      const available = currentState.segments.some(s => s.id === citation.id && s.available);
      const button = el('button', 'reference', `${formatTime(citation.startMs)}–${formatTime(citation.endMs)}${available ? ' ↗' : ' · résumé seul'}`);
      button.disabled = !available; button.onclick = () => replay(citation.id); references.append(button);
    }
    nodes.push(references);
    const deepen = el('button', 'secondary deepen', 'Revoir le passage plus précisément');
    deepen.onclick = () => window.tvlens.deepen(response.question).catch(error => notice(error.message));
    nodes.push(deepen);
    const verify = el('button', 'secondary verify-again', 'Vérifier une affirmation de cette réponse');
    verify.disabled = verificationState.busy || !configuration?.verificationAvailable;
    verify.onclick = () => openVerification(response.answer);
    nodes.push(verify);
  }
  $('messages').replaceChildren(...nodes); $('messages').scrollTop = $('messages').scrollHeight;
}
function renderDeep(job) {
  const node = el('article', 'verification-message deep-message');
  node.dataset.status = job.status;
  node.append(el('div', 'chat-question', job.question));
  const metadata = el('details', 'response-details');
  metadata.append(el('summary', 'hint', 'Détails du traitement'), el('small','hint',`Question ancrée à ${formatTime(job.anchorMs||0)}${job.startedAt ? ` · Attente ${((job.startedAt-job.createdAt)/1000).toFixed(1)} s` : ''}`));
  if(job.status==='queued'){
    node.append(el('p','pending',`En attente · position ${deepState.jobs.filter(j=>j.status==='queued').findIndex(j=>j.id===job.id)+1} dans la file.`));
    const cancel=el('button','secondary cancel-deep','Retirer cette question');cancel.onclick=()=>window.tvlens.cancelDeep(job.id).catch(error=>notice(error.message));node.append(cancel);
  } else if (job.status === 'running') {
    const elapsed=el('span','job-elapsed');elapsed.dataset.started=job.startedAt||job.createdAt;elapsed.textContent=Math.floor((Date.now()-(job.startedAt||job.createdAt))/1000)+' s';node.append(elapsed);
    const steps=el('ol','activity-list');for(const step of (job.activity||[]).slice(-5))steps.append(el('li','',step.message));node.append(steps);
    if(job.provisional)node.append(el('div','answer-kind','PROVISOIRE · OBSERVATIONS À CONFIRMER'),el('p','chat-provisional',job.provisional));
    if(job.memoryPreview){
      const rail=el('div','preview-passages');
      for(const passage of job.memoryPreview.passages){
        const button=el('button','preview-passage');
        if(momentPreviews.has(passage.id)){const image=el('img');image.src=momentPreviews.get(passage.id);image.alt='Passage retrouvé';button.append(image);}
        button.append(document.createTextNode(formatTime(passage.startMs)+' ↗'));
        button.disabled=currentState?.id!==job.sessionId||!currentState?.segments.some(s=>s.id===passage.id&&s.available);
        button.onclick=()=>replay(passage.id);rail.append(button);
      }
      node.append(rail);
      if(job.memoryPreview.unanalyzedTailMs>0)node.append(el('p','hint','Les dernières secondes ne sont pas encore entièrement analysées.'));
    }
    if(job.preview)node.append(el('p','hint','Réponse en cours · pas encore validée'),el('p','chat-preview',job.preview));
    node.append(el('p', 'pending', job.message), el('small', '', `${currentState?.accepting?'La capture continue':'Capture en pause'} · maximum 60 secondes. Les nouvelles questions restent en attente.`));
    const cancel = el('button', 'secondary cancel-deep', 'Annuler la recherche');
    cancel.onclick = () => window.tvlens.cancelDeep(job.id).catch(error => notice(error.message)); node.append(cancel);
  } else {
    if(job.finishedAt){const details=el('details','activity-history');details.append(el('summary','hint',`${((job.finishedAt-(job.startedAt||job.createdAt))/1000).toFixed(1)} s · Étapes de la réponse`));const list=el('ol','activity-list');for(const step of job.activity||[])list.append(el('li','',step.message));details.append(list);metadata.append(details);}
    if (job.status !== 'done') node.append(el('p', 'answer-limits', job.message));
    const result = job.result;
    if (result) {
      node.append(el('div','answer-kind',({observation:'OBSERVÉ DANS LA VIDÉO',external:'RÉPONSE AVEC SOURCES EXTERNES',explanation:'EXPLICATION GÉNÉRALE',insufficient:'PREUVES INSUFFISANTES'})[result.kind]||'RÉPONSE'),el('p', 'chat-answer', result.answer));
      if (result.hypotheses?.length) node.append(el('div', 'answer-kind', 'HYPOTHÈSES · NON ÉTABLIES'), el('p', '', result.hypotheses.join(' ')));
      if (result.limits?.length) node.append(el('p', 'answer-limits', result.limits.join(' ')));
      const refs = el('div', 'references');
      for (const c of result.citations || []) {
        const segment = currentState?.id === job.sessionId && currentState.segments.find(s => s.id === c.id && s.available);
        const button = el('button', 'reference', `${formatTime(c.startMs)}–${formatTime(c.endMs)}${segment ? ' ↗' : ' · média expiré'}`);
        button.disabled = !segment; button.onclick = () => replay(c.id, Math.max(0, (c.startMs - segment.startMs) / 1000)); refs.append(button);
      }
      node.append(refs);
      if(job.intent && result.citations?.length){
        const rail=el('div','preview-passages');
        for(const c of result.citations.slice(0,3)){
          const button=el('button','preview-passage');
          if(momentPreviews.has(c.id)){const image=el('img');image.src=momentPreviews.get(c.id);image.alt='Passage cité';button.append(image);}
          button.append(document.createTextNode(formatTime(c.startMs)+' ↗'));
          const segment=currentState?.id===job.sessionId&&currentState.segments.find(s=>s.id===c.id&&s.available);
          button.disabled=!segment;button.onclick=()=>replay(c.id,Math.max(0,(c.startMs-segment.startMs)/1000));rail.append(button);
        }
        node.append(rail);
      }
      if(job.metrics){const timing=el('details','activity-history');timing.append(el('summary','hint','Temps de réponse'),el('p','hint',`Première information : ${job.metrics.firstUsefulMs===null?'indisponible':(job.metrics.firstUsefulMs/1000).toFixed(2)+' s'} · Attente : ${(job.metrics.waitMs/1000).toFixed(2)} s · Total : ${(job.metrics.endToEndMs/1000).toFixed(2)} s`));metadata.append(timing);}
      if(result.sources?.length)node.append(el('div','answer-kind','SOURCES WEB'));
      for(const [index,source] of (result.sources||[]).entries()) {
        const link=el('button','source-link',source.title+' ↗');
        link.onclick=()=>window.tvlens.openChatSource(job.id,index).catch(error=>notice(error.message));
        node.append(link,el('p','hint',source.evidence));
      }
    }
    if(result?.answer&&result.kind!=='insufficient'&&!job.intent){const more=el('button','secondary','Approfondir');more.onclick=()=>window.tvlens.ask('Approfondis cette réponse : '+result.answer.slice(0,1200)).catch(e=>notice(e.message));node.append(more);if(/\d/.test(result.answer)){const check=el('button','secondary','Vérifier un chiffre');check.onclick=()=>{$('claim').value=result.answer.slice(0,2000);$('verify-dialog').showModal();};node.append(check);}}
    node.append(metadata);
    const retry = el('button', 'secondary deepen', 'Réexaminer le passage'); retry.onclick = () => (job.intent ? window.tvlens.reexamineMoment(job.id) : window.tvlens.deepen(job.question)).catch(error => notice(error.message)); node.append(retry);
  }
  return node;
}
function renderVerification(job) {
  const node = el('article', 'verification-message');
  node.append(el('div', 'chat-question', job.claim), el('div', 'verification-label', 'VÉRIFICATION EXTERNE · CODEX'));
  if (job.status === 'running') {
    node.append(el('p', 'pending', 'Recherche de sources et comparaison des preuves…'), el('p', 'verification-status', 'Tu peux continuer à poser des questions sur la vidéo.'));
    const cancel = el('button', 'secondary cancel-verification', 'Annuler la recherche');
    cancel.onclick = () => { cancel.disabled = true; window.tvlens.cancelVerification().catch(error => notice(error.message)); };
    node.append(cancel); return node;
  }
  if (job.status === 'error') {
    node.append(el('p', 'verify-error', job.error));
    const retry = el('button', 'secondary verify-again', 'Réessayer'); retry.disabled = verificationState.busy;
    retry.onclick = () => openVerification(job.claim); node.append(retry); return node;
  }
  const result = job.result;
  node.append(el('h4', '', { supported: 'Les sources concordent', contradicted: 'Les sources contredisent l’affirmation', mixed: 'Les preuves appellent des nuances', insufficient: 'Preuves insuffisantes' }[result.assessment]));
  node.append(el('p', 'chat-answer', result.conclusion));
  for (const [index, source] of result.sources.entries()) {
    const card = el('div', 'source-card');
    const link = el('button', 'source-link', `${source.title} ↗`);
    link.onclick = () => window.tvlens.openSource(job.id, index).catch(error => notice(error.message));
    card.append(link, el('small', '', [source.publisher, source.publishedAt].filter(Boolean).join(' · ')), el('p', '', source.evidence));
    node.append(card);
  }
  if (result.limitations.length) node.append(el('p', 'answer-limits', result.limitations.join(' ')));
  if (job.archiveError) node.append(el('p', 'verify-error', job.archiveError));
  const seconds = Math.round((result.research?.elapsedMs || job.finishedAt - job.createdAt) / 1000);
  node.append(el('p', 'verification-status', `${result.sources.length} source(s) · ${seconds} s · Compte Codex, séparé du budget OpenRouter`));
  return node;
}
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
  try { await window.tvlens.verify(claim); }
  catch (error) { notice(error.message); }
};
window.tvlens.onVerificationState(state => { verificationState = state; renderChat(); updateButtons(); });
function refreshResearchBudget() { window.tvlens.researchBudget().then(b => { $('research-usage').textContent = `OpenRouter (historique + embeddings) : ${b.spentUsd.toFixed(4)} $ comptabilisés${b.limitUsd==null?' · sans plafond local':` sur ${b.limitUsd} $`}${b.heldUsd ? ' · appels réservés en cours ou coût inconnu' : ''}`; }).catch(() => {}); }
window.tvlens.onDeepState(state => { deepState = state; renderChat(); updateButtons(); refreshResearchBudget(); });
refreshResearchBudget();
window.tvlens.deepState().then(state => { deepState = state; renderChat(); }).catch(error => notice(error.message));
window.tvlens.verificationState().then(state => { verificationState = state; renderChat(); updateButtons(); }).catch(error => notice(error.message));
$('ask-form').onsubmit = async event => {
  event.preventDefault(); const question = $('question').value.trim();
  if (!question || pendingQuestion) return;
  pendingQuestion = question; pendingQuestionAt = Date.now(); $('question').value = ''; notice(''); renderChat(); updateButtons();
  try {
    const response = await window.tvlens.ask(question);
    if (!currentState?.questions.length && response.kind === 'insufficient') notice(response.answer);
  } catch (error) { notice(error.message); $('question').value = question; }
  finally { pendingQuestion = ''; lastChatSignature = ''; renderChat(); updateButtons(); $('question').focus(); }
};
$('question').onkeydown = event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); $('ask-form').requestSubmit(); } };
$('question').oninput = updateButtons;
for (const button of document.querySelectorAll('.suggestion')) button.onclick = () => { $('question').value = button.dataset.question; $('question').focus(); };
$('start').onclick = startPreview;
$('observe').onclick = () => watchWithSelectedSource();
$('source').onchange = updateButtons;
$('refresh').onclick = refresh;
$('stop').onclick = () => stop().catch(error => notice(error.message));
$('settings').onclick = () => window.capture.settings().catch(error => notice(error.message));
$('import').onclick = () => window.tvlens.importConfig().then(setConfig).catch(error => notice(error.message));
$('close-replay').onclick = () => $('replay-dialog').close();
$('replay-dialog').onclose = () => { $('replay').pause(); $('replay').removeAttribute('src'); $('replay').load(); };
$('replay').onvolumechange = () => { if (currentState?.accepting) $('replay').muted = true; };
$('replay').onerror = () => { $('replay-note').textContent = 'Ce passage a expiré ou ne peut pas être lu.'; };
window.addEventListener('beforeunload', () => stream?.getTracks().forEach(track => track.stop()));
window.tvlens.onState(renderState);
window.tvlens.config().then(setConfig).catch(error => notice(error.message));
refresh();

$('models').onclick=async()=>{try{const value=await window.tvlens.models();const choices=await window.tvlens.modelChoices();$('codex-models').replaceChildren(...choices.map(m=>new Option(m.name,m.id)));$('codex-model').value=value.codexModel;$('observation-model').value=value.observationModel;$('inspection-model').value=value.inspectionModel;$('models-status').textContent='';$('models-dialog').showModal();}catch(e){notice(e.message);}};
$('close-models').onclick=()=>$('models-dialog').close();
$('models-form').onsubmit=async event=>{event.preventDefault();try{const result=await window.tvlens.saveModels({codexModel:$('codex-model').value.trim(),observationModel:$('observation-model').value.trim(),inspectionModel:$('inspection-model').value.trim()});setConfig(result.configuration);$('models-status').textContent='Enregistré · Codex prêt pour la prochaine question.';}catch(e){$('models-status').textContent=e.message;}};

let floatingMode=false, floatingExpanded=false;
async function changeWindowMode(floating,expanded=false){
  const priorFloating=floatingMode, priorExpanded=floatingExpanded;
  const paint=()=>shell.windowMode(floatingMode,floatingExpanded);
  floatingMode=floating;floatingExpanded=expanded;paint();
  try{await window.tvlens.windowMode({floating,expanded});if(expanded)$('question').focus();}
  catch(e){floatingMode=priorFloating;floatingExpanded=priorExpanded;paint();notice(e.message);}
}
$('float-mode').onclick=()=>changeWindowMode(true);
$('float-full').onclick=()=>{shell.show('direct');return changeWindowMode(false);};
$('close-chat').onclick=()=>changeWindowMode(true,false);
$('float-menu-toggle').onclick=async()=>{
  if ($('float-menu').matches(':popover-open')) { $('float-menu').hidePopover(); return; }
  if (!floatingExpanded) await changeWindowMode(true,true);
  $('float-menu').showPopover();
};
$('float-auto').onclick=()=>$('open-auto').click();
$('float-memory').onclick=()=>openLibrary();
$('float-source-change').onclick=async()=>{await stop();shell.show('direct');await changeWindowMode(false);$('source').focus();};
$('float-chat').onclick=()=>changeWindowMode(true,!floatingExpanded);
async function watchWithSelectedSource() {
  if (floatingCaptureBusy || stopping || recorder) return;
  floatingCaptureBusy = true; updateButtons(); notice('');
  try {
    if (!stream && !await startPreview()) throw Error($('state').textContent);
    await observe();
    if (!recorder) throw Error($('notice').textContent || 'L’analyse n’a pas démarré.');
  } catch (error) { notice(error.message); }
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
  }catch(e){$('float-source-error').textContent=e.message;}
  finally{$('float-refresh').disabled=false;}
}
$('float-record').onclick=async()=>{
  if(floatingCaptureBusy||stopping)return;
  if(recorder){floatingCaptureBusy=true;updateButtons();try{await stop();}catch(e){notice(e.message);}finally{floatingCaptureBusy=false;updateButtons();}return;}
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
    if(!recorder)throw Error($('notice').textContent||'L’analyse n’a pas démarré.');
    $('float-source-dialog').close();
  }catch(e){$('float-source-error').textContent=e.message;}
  finally{floatingCaptureBusy=false;$('float-launch').disabled=false;$('close-float-source').disabled=false;$('float-refresh').disabled=false;updateButtons();}
};

$('new-session').onclick=async()=>{try{await window.tvlens.newSession();}catch(e){notice(e.message);}};
window.tvlens.onReset(()=>{recapRevision++;recapState=null;currentState=null;$('recap-dialog').close();renderRecap();deepState={jobs:[]};selectedMoment=null;$('moment-dialog').close();$('attention-status').textContent='';notice('');momentPreviews.clear();lastChatSignature='';$('timeline').replaceChildren(el('p','placeholder','Les moments observés apparaîtront ici.'));$('messages').replaceChildren();$('elapsed').textContent='00:00';$('mode').textContent='PRÊT À REGARDER';$('memory-status').textContent='Les passages apparaîtront après quelques secondes de capture.';updateButtons();});
setInterval(()=>{for(const node of document.querySelectorAll('.job-elapsed'))node.textContent=Math.floor((Date.now()-Number(node.dataset.started))/1000)+' s';},1000);

async function keepRecent(){try{const saved=await window.tvlens.keepMoment();notice(`Moment ${formatTime(saved.startMs)}–${formatTime(saved.endMs)} conservé jusqu’à suppression.`);shell.bookmarkFeedback(true);setTimeout(()=>shell.bookmarkFeedback(false),2000);await renderSavedRail();}catch(e){notice(e.message);}}
$('keep-moment').onclick=keepRecent;$('float-keep').onclick=keepRecent;
let deleteSavedId;
function momentCard(moment,{savedId}={}){
 const card=el('article','moment-card');if(moment.preview){const image=el('img');image.src=moment.preview;image.alt='Aperçu du passage';card.append(image);}
 const content=el('div');content.append(el('strong','',`${formatTime(moment.startMs)}–${formatTime(moment.endMs)}`));content.append(el('p','',moment.text||moment.observation?.transcript||moment.observation?.summary||'Transcription indisponible.'));
 const available=savedId||moment.available;const play=el('button','secondary',available?'Revoir ↗':'Média expiré · texte conservé');play.disabled=!available;
 play.onclick=()=>{if(!savedId)return replay(moment.id);$('replay-title').textContent='Moment conservé';$('replay').src=`tvlens-saved://${savedId}/${moment.id}`;$('replay').onloadedmetadata=null;$('replay').muted=true;$('replay-note').textContent='Copie conservée sur ce Mac ; supprimer le moment efface aussi cette vidéo.';$('replay-dialog').showModal();$('replay').play().catch(()=>{});};content.append(play);card.append(content);return card;
}
async function renderSaved(){const values=await window.tvlens.savedMoments();$('saved-results').replaceChildren(...values.map(value=>{const group=el('section','saved-group');group.append(el('small','hint',new Date(value.createdAt).toLocaleString()+' · Conservé'));for(const m of value.moments)group.append(momentCard(m,{savedId:value.id}));const remove=el('button','link','Supprimer ce moment');remove.onclick=()=>{deleteSavedId=value.id;$('delete-saved-dialog').showModal();};group.append(remove);return group;}));if(!values.length)$('saved-results').append(el('p','hint','Aucun moment gardé.'));renderSavedRail(values);}
async function renderSavedRail(values){values ||= await window.tvlens.savedMoments();const tiles=values.slice(0,5).map(value=>{const moment=value.moments[0],tile=el('button','saved-tile'),preview=el('img');preview.alt='Aperçu du moment gardé';if(moment?.preview)preview.src=moment.preview;const copy=el('span');copy.append(el('strong','',formatTime(value.startMs)),document.createTextNode(moment?.observation?.summary||'Moment gardé'));tile.append(preview,copy);tile.onclick=()=>openLibrary().catch(e=>notice(e.message));return tile;});$('saved-rail').replaceChildren(...(tiles.length?tiles:[el('p','placeholder','Garde un moment pour le retrouver ici.')]));}
async function openLibrary(){if(floatingMode)await changeWindowMode(true,true);$('library-dialog').showModal();await renderSaved();const settings=await window.tvlens.viewingSettings();$('bookmark-shortcut').value=settings.bookmarkShortcut;$('shortcut-status').textContent=settings.shortcutRegistered?'Raccourci actif.':'Raccourci indisponible : choisis une autre combinaison.';}
$('open-library').onclick=()=>openLibrary().catch(e=>notice(e.message));$('close-library').onclick=()=>$('library-dialog').close();$('refresh-saved').onclick=()=>renderSaved().catch(e=>notice(e.message));
$('saved-all').onclick=$('open-library').onclick;
$('nav-saved').onclick=$('open-library').onclick;
$('nav-search').onclick=async()=>{await openLibrary();$('moment-query').focus();};
$('moment-search-form').onsubmit=async e=>{e.preventDefault();$('search-status').textContent='Recherche dans la session…';try{const found=await window.tvlens.searchMoments($('moment-query').value);$('search-results').replaceChildren(...found.moments.map(m=>momentCard(m)));$('search-status').textContent=`${found.moments.length} passage(s) · ${found.mode}. ${found.warnings.join(' ')}`;}catch(e){$('search-status').textContent=e.message;}};
$('shortcut-form').onsubmit=async e=>{e.preventDefault();try{await window.tvlens.saveViewingSettings({bookmarkShortcut:$('bookmark-shortcut').value.trim()});$('shortcut-status').textContent='Raccourci enregistré.';}catch(e){$('shortcut-status').textContent=e.message;}};
$('cancel-delete-saved').onclick=()=>$('delete-saved-dialog').close();$('confirm-delete-saved').onclick=async()=>{try{await window.tvlens.removeSaved(deleteSavedId);$('delete-saved-dialog').close();await renderSaved();}catch(e){notice(e.message);}};
window.tvlens.onSaved(()=>{notice('Moment conservé sur ce Mac jusqu’à suppression.');renderSavedRail().catch(()=>{});if($('library-dialog').open)renderSaved().catch(()=>{});});window.tvlens.onSaveError(notice);
renderSavedRail().catch(()=>{});
setInterval(()=>window.tvlens.quota().then(q=>{$('quota-status').textContent=q.windows.length?'Codex : '+q.windows.map(w=>`${w.remainingPercent} % restants (${w.windowMinutes===10080?'semaine':w.windowMinutes+' min'})`).join(' · '):'Quota Codex : pas encore lu';}).catch(()=>{}),10000);

function renderAuto(state){$('auto-status').textContent=state.enabled?`Surveillance auto · ${state.instruction} · dès ${formatTime(state.activationMs)} · toutes les ${state.frequencySeconds} s`:'Surveillance auto désactivée';$('auto-detail').textContent=state.message;$('auto-results').replaceChildren(...state.results.slice().reverse().map(item=>{const card=el('article','moment-card');const body=el('div');body.append(el('small','hint',`${formatTime(item.startMs)}–${formatTime(item.endMs)} · ${item.instruction}`),el('p','',item.result.answer));for(const c of item.result.citations||[]){const button=el('button','reference',`${formatTime(c.startMs)} ↗`);button.disabled=currentState?.id!==item.sessionId||!currentState?.segments.some(s=>s.id===c.id&&s.available);button.onclick=()=>replay(c.id,Math.max(0,(c.startMs-currentState.segments.find(s=>s.id===c.id).startMs)/1000));body.append(button);}for(const [index,source]of (item.result.sources||[]).entries()){const button=el('button','source-link',source.title+' ↗');button.onclick=()=>window.tvlens.openAutoSource(item.id,index).catch(e=>notice(e.message));body.append(button);}if(item.result.limits?.length)body.append(el('small','hint',item.result.limits.join(' ')));card.append(body);return card;}));}
$('open-auto').onclick=async()=>{try{renderAuto(await window.tvlens.autoState());$('auto-dialog').showModal();}catch(e){notice(e.message);}};$('close-auto').onclick=()=>$('auto-dialog').close();$('auto-form').onsubmit=async e=>{e.preventDefault();try{renderAuto(await window.tvlens.startAuto({instruction:$('auto-instruction').value,frequencySeconds:Number($('auto-frequency').value)}));}catch(e){$('auto-detail').textContent=e.message;}};$('stop-auto').onclick=()=>window.tvlens.stopAuto().catch(e=>notice(e.message));window.tvlens.onAuto(renderAuto);

async function openMoment(frozen) {
  if (quickBusy || !currentState?.id) return;
  quickBusy = true; updateButtons(); notice('');
  try {
    selectedMoment = frozen || await window.tvlens.freezeMoment({kind:'explain'});
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
  } catch(error) { notice(error.message); $('moment-error').textContent=error.message; }
  finally { quickBusy=false; updateButtons(); }
}
async function submitMoment(intent, question) {
  if (!selectedMoment || quickBusy) return;
  quickBusy=true; updateButtons();
  try {
    await momentCheckpoint;
    await window.tvlens.explainMoment({token:selectedMoment.token,intent,question});
    $('moment-dialog').close();
    if(floatingMode) await changeWindowMode(true,true);
  } catch(error) { $('moment-error').textContent=error.message; }
  finally { quickBusy=false; updateButtons(); }
}
async function explainNow() {
  if (quickBusy || !currentState?.id) return;
  quickBusy=true; updateButtons(); notice('');
  try {
    const frozen=await window.tvlens.freezeMoment({kind:'explain'});
    if(floatingMode) await changeWindowMode(true,true);
    await recorder?.checkpoint(frozen.anchorMs);
    await window.tvlens.explainMoment({token:frozen.token,intent:'explain'});
  } catch(error) { notice(error.message); }
  finally { quickBusy=false;updateButtons(); }
}
$('float-explain').onclick=$('explain-moment').onclick=explainNow;
$('close-moment').onclick=()=>$('moment-dialog').close();
$('moment-summarize').onclick=()=>submitMoment('summarize');
$('moment-explain').onclick=()=>submitMoment('explain');
$('moment-question-form').onsubmit=event=>{event.preventDefault();if($('moment-question').value.trim())submitMoment('explain',$('moment-question').value.trim());};
window.tvlens.onExplainMoment(frozen=>openMoment(frozen));
$('catch-up').onclick=async()=>{
  if(quickBusy)return;
  quickBusy=true; updateButtons(); notice('');
  try {
    const frozen=await window.tvlens.freezeMoment({kind:'catch-up'});
    $('attention-status').textContent=`Je retrouve les passages de ${formatTime(frozen.startMs)} à ${formatTime(frozen.anchorMs)}…`;
    await recorder?.checkpoint(frozen.anchorMs);
    const result=await window.tvlens.catchUp({token:frozen.token});
    $('attention-status').textContent=`Rattrapage demandé : ${formatTime(result.startMs)}–${formatTime(result.endMs)}. Le repère avance après une réponse réussie.`;
  } catch(error){notice(error.message);}
  finally{quickBusy=false;updateButtons();}
};
$('mark-attention').onclick=async()=>{
  if(quickBusy)return;
  quickBusy=true;updateButtons();
  try{await recorder?.checkpoint();const marker=await window.tvlens.markAttention();$('attention-status').textContent=`Tu reprends ici : ${formatTime(marker.atMs)}. Le prochain rattrapage partira de ce repère.`;}
  catch(error){notice(error.message);}finally{quickBusy=false;updateButtons();}
};
window.tvlens.momentShortcuts().then(value=>{
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
function recapSource(source) {
  if (!recapState?.sessionId || recapState.sessionId !== currentState?.id || source.available === false) return null;
  return currentState.segments.find(segment => segment.id === source.id && segment.available);
}
function renderRecap() {
  const state = recapState;
  const chapters = state?.chapters || [];
  const hasContent = Boolean(state?.overview || chapters.length);
  let statusText = !currentState?.id && !hasContent ? 'Lance une vidéo : son résumé et ses chapitres apparaîtront ici.' : 'Le résumé se construit au fil des passages analysés.';
  if (state?.status === 'updating') statusText = hasContent ? 'Mise à jour en cours · Le résumé précédent reste disponible.' : 'Préparation du premier résumé…';
  else if (state?.status === 'error') statusText = hasContent ? 'Mise à jour indisponible · Le dernier résumé reste disponible.' : 'Le résumé est momentanément indisponible.';
  else if (hasContent) statusText = 'Résumé automatique des passages analysés.';
  if (state?.pendingCount) statusText += ` ${state.pendingCount} passage${state.pendingCount > 1 ? 's' : ''} en attente d’intégration au résumé.`;
  for (const [target, expanded] of [[$('recap-content'), false], [$('recap-dialog-content'), true]]) {
    const expandedSources = new Set([...target.querySelectorAll('.recap-extra-sources[open]')].map(node => node.dataset.chapterId));
    const statusNode = el('p', 'hint recap-status', statusText);
    statusNode.setAttribute('role', 'status');
    const nodes = [statusNode];
    if (state?.error) nodes.push(el('p', 'recap-error', state.error));
    if (state?.overview) nodes.push(el('p', 'recap-overview', state.overview));
    const rail = el('div', 'recap-chapters');
    for (const chapter of expanded ? chapters : chapters.slice(-3)) {
      const card = el('article', 'recap-chapter');
      const sources = chapter.sources || [];
      const firstPlayable = sources.find(source => recapSource(source));
      const title = `${formatTime(chapter.startMs)} · ${chapter.title || 'Chapitre'}`;
      const heading = el('h3');
      if (firstPlayable) {
        const button = el('button', 'recap-chapter-link', title + (firstPlayable.startMs > chapter.startMs ? ` · Revoir dès ${formatTime(firstPlayable.startMs)} ↗` : ' ↗'));
        button.title = `Revoir le premier passage disponible à ${formatTime(firstPlayable.startMs)}`;
        button.onclick = () => {
          const segment = recapSource(firstPlayable);
          if (segment) replay(firstPlayable.id, Math.max(0, (firstPlayable.startMs - segment.startMs) / 1000));
          else notice('La vidéo de ce passage a expiré. Son résumé reste disponible.');
        };
        heading.append(button);
      } else heading.textContent = title;
      card.append(heading, el('p', 'recap-summary', chapter.summary || ''));
      const references = el('div', 'recap-sources');
      const extraSources = el('details', 'recap-extra-sources');
      extraSources.dataset.chapterId = chapter.id;
      extraSources.open = expandedSources.has(chapter.id);
      extraSources.append(el('summary', '', `${Math.max(0, sources.length - 3)} autres passages`));
      const extraReferences = el('div', 'recap-sources');
      for (const [sourceIndex, source] of sources.entries()) {
        const available = Boolean(recapSource(source));
        const button = el('button', 'reference recap-source', `${formatTime(source.startMs)}${available ? ' ↗' : ' · résumé'}`);
        button.disabled = !available;
        button.title = available ? `Revoir le passage de ${formatTime(source.startMs)} à ${formatTime(source.endMs)}` : 'Vidéo expirée · Résumé conservé';
        button.onclick = () => {
          const segment = recapSource(source);
          if (segment) replay(source.id, Math.max(0, (source.startMs - segment.startMs) / 1000));
          else notice('La vidéo de ce passage a expiré. Son résumé reste disponible.');
        };
        (sourceIndex < 3 ? references : extraReferences).append(button);
      }
      if (sources.length > 3) { extraSources.append(extraReferences); references.append(extraSources); }
      if (!firstPlayable) card.append(el('small', 'hint recap-expired', 'Résumé conservé · Vidéo indisponible'));
      card.append(references); rail.append(card);
    }
    if (chapters.length) nodes.push(rail);
    if (state?.limits?.length) nodes.push(el('p', 'hint recap-limits', state.limits.join(' ')));
    target.replaceChildren(...nodes);
  }
}
async function openRecap() {
  if (floatingMode) await changeWindowMode(true, true);
  renderRecap();
  if (!$('recap-dialog').open) $('recap-dialog').showModal();
}
$('open-recap').onclick = $('open-recap-all').onclick = () => openRecap().catch(error => notice(error.message));
$('close-recap').onclick = () => $('recap-dialog').close();
window.tvlens.onRecap(receiveRecap);
const initialRecapRevision = recapRevision;
window.tvlens.recapState().then(state => { if (recapRevision === initialRecapRevision) receiveRecap(state); }).catch(() => {
  if (recapRevision === initialRecapRevision) receiveRecap({ sessionId: currentState?.id, status: 'error', chapters: [], overview: '' });
});
renderRecap();
