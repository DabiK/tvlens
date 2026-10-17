import { _electron as electron } from 'playwright-core';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const liveVerifier = process.argv.includes('--live-verifier');
const liveVideoAgent = process.argv.includes('--live-video-agent');
const liveInspection = process.argv.includes('--live-inspection');
const localOptions = process.argv.slice(2).filter(a=>a==='--local-inspection'||a.startsWith('--inspection-strategy='));
const launchArgs = ['.', '--smoke-test', ...localOptions, ...(liveVerifier ? ['--live-verifier'] : []), ...(liveVideoAgent ? ['--live-video-agent'] : []), ...(liveInspection ? ['--live-inspection'] : [])];
const app = await electron.launch({ args: launchArgs, executablePath: require('electron') });
let userData, stateTimeoutMs = 65000;
// What keeping a moment transcribes, as core/saved-moments.cjs decides it: the window it keeps and the ceiling it gives
// each passage. The core does not export them, so they are repeated here; the wait for the kept moment follows them.
const keptWindowMs = 30000, transcriptionCeilingMs = 15000;
// Passages that arrive between reading the state and the click (one every 1.8 s, more on a loaded machine).
const keptMomentMarginPassages = 2;
const withoutFrame = {}, archivedVolume = {};
const { holdsMedia } = require('../core/clip-container.cjs');
const clock = ms => { const total = Math.floor(ms / 1000), two = value => String(value).padStart(2, '0'); return total >= 3600 ? `${Math.floor(total / 3600)}:${two(Math.floor(total / 60) % 60)}:${two(total % 60)}` : `${two(Math.floor(total / 60))}:${two(total % 60)}`; };
const exists = file => fs.access(file).then(() => true, () => false);
try {
  userData = await app.evaluate(({ app }) => app.getPath('userData'));
  const page = await app.firstWindow();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', msg => { if (msg.type() === 'error') console.log('Renderer error:', msg.text()); });
  await page.waitForFunction(() => document.querySelector('#source').value === 'test-source');
  assert.equal(await page.locator('.preview-empty h1').textContent(), 'Qu’est-ce qu’on regarde ?');
  assert.equal(await page.locator('#mode').textContent(), 'PRÊT À REGARDER');
  assert.equal(await page.locator('#float-conversation h2').textContent(), 'Conversation');
  assert.equal(await page.locator('#nav-memory').isVisible(), true);
  assert.equal(await page.locator('#nav-watch').isVisible(), true, 'Surveillance has its own tab');
  assert.equal(await page.locator('#chat-intro .suggestion').count(), 3, 'An empty conversation offers questions to start from');
  // The ceiling of a question and the retention are read from the host: nothing on screen states them by itself.
  const configuration = await page.evaluate(() => window.tvlens.config());
  assert.ok(configuration.questionTimeoutMs > 0, 'The host publishes the question ceiling');
  assert.deepEqual([configuration.retention, configuration.retentionMs], ['until-deleted', null]);
  if (liveVideoAgent) stateTimeoutMs = configuration.questionTimeoutMs + 5000;
  assert.doesNotMatch(await page.locator('body').innerText(), /60 secondes|Mémoire vidéo de 5 min|Surveillance auto/);
  await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(1000,720));
  await page.waitForTimeout(150);
  assert.equal(await page.locator('#ask-form').evaluate(el=>el.getBoundingClientRect().bottom<=innerHeight),true,'Composer remains visible at minimum window size');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'Minimum full window has no horizontal overflow');
  await page.screenshot({path:'/tmp/tvlens-minimum.png'});
  await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(1340,920));
  await page.screenshot({path:'/tmp/tvlens-home.png',fullPage:true});
  await installFixture(page, { firstPassageWithoutFrame: true });
  await page.locator('#models').click();
  await page.locator('#codex-model').fill('test-model');
  await page.locator('#models-form button[type=submit]').click();
  await page.waitForFunction(()=>document.querySelector('#models-status').textContent.includes('Enregistré'));
  assert.equal(JSON.parse(await fs.readFile(path.join(userData,'models.json'),'utf8')).codexModel,'test-model');
  await page.locator('#codex-model').fill('');
  await page.locator('#models-form button[type=submit]').click();
  await waitState(page,async()=>!(await window.tvlens.models()).codexModel);
  await page.locator('#close-models').click();
  const launchAt=Date.now();
  await page.locator('#observe').click();
  await page.waitForFunction(()=>document.querySelector('#float-record').getAttribute('aria-label')==='Mettre TVLens en pause');
  assert.equal(await page.evaluate(()=>document.body.classList.contains('floating')),false,'Starting observation preserves the selected full mode');
  await page.locator('#float-mode').click();
  await page.waitForFunction(()=>document.body.classList.contains('floating'));
  assert.equal(await page.locator('#float-source-dialog').evaluate(el=>el.open),false,'Chosen source starts without a second confirmation');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true,'Compact mode fits its window');
  assert.equal(await page.locator('#float-bar').evaluate(el=>el.getBoundingClientRect().bottom<=window.innerHeight),true,'Compact toolbar stays inside the visible window');
  await page.waitForFunction(() => document.querySelector('#preview').videoWidth > 0 && document.querySelector('#meter').value > 0);
  await page.waitForFunction(()=>document.querySelectorAll('.moment').length>0);
  const firstCaptureMs=Date.now()-launchAt;
  assert.match(await page.locator('#float-record').getAttribute('aria-label'),/pause/);
  assert.equal(await page.locator('#float-status').textContent(), 'En direct');
  await page.screenshot({path:'/tmp/tvlens-floating-record.png'});
  await menuClick(page,'float-full');
  await page.waitForFunction(() => document.querySelectorAll('.moment').length >= 2, { timeout: 15000 });
  // The first passage is the captured case. Its file is kept as it came, its video is said unreadable instead of
  // available, and it is analysed from its images like any other passage.
  await waitState(page, async () => (await window.tvlens.state()).segments.find(s => s.id === 'moment-1')?.status === 'ready');
  const early = await page.evaluate(() => window.tvlens.state()), firstPassage = early.segments.find(s => s.id === 'moment-1');
  assert.deepEqual([firstPassage.available, firstPassage.mediaReason, Boolean(firstPassage.observation), early.coverage.videoUnreadable], [false, 'unreadable', true, 1]);
  const mediaDir = path.join(userData, 'sessions', early.id, 'media'), firstClip = await fs.readFile(path.join(mediaDir, 'moment-1.webm'));
  assert.equal(holdsMedia(firstClip), false, 'The first clip is a container without a media block');
  assert.equal(holdsMedia(await fs.readFile(path.join(mediaDir, 'moment-2.webm'))), true, 'The next clip holds media');
  assert.ok(JSON.parse(await fs.readFile(path.join(mediaDir, 'moment-1.json'), 'utf8')).frames.length > 0, 'Its images are kept next to it');
  const unreadableRow = page.locator('#timeline .moment').filter({ hasText: 'vidéo illisible' });
  assert.equal(await unreadableRow.count(), 1, 'One passage, and only one, is said unreadable');
  assert.equal(await unreadableRow.locator('.moment-time').isDisabled(), true, 'No replay is offered for it');
  assert.match(await unreadableRow.locator('.moment-time').getAttribute('title'), /ne contient aucune image/);
  assert.equal(await page.locator('#timeline .moment .moment-time:not([disabled])').count() > 0, true, 'The other passages stay replayable');
  Object.assign(withoutFrame, { id: 'moment-1', bytes: firstClip.length, holdsMedia: false, announced: 'vidéo illisible', analysed: true, replayOffered: false });
  // The newest row may still be waiting for its preview: the rail as a whole shows what was captured.
  await page.waitForFunction(()=>[...document.querySelectorAll('img.moment-image')].some(img=>img.getAttribute('src')?.startsWith('data:image/jpeg')));
  assert.equal(await page.locator('#timeline').evaluate(el=>getComputedStyle(el).display),'flex','Recent moments use a horizontal rail');
  // The passages the conservation will transcribe one after the other, picked as the core picks them.
  const passagesToTranscribe = await page.evaluate(async windowMs => {
    const { segments } = await window.tvlens.state();
    const anchorMs = segments.at(-1)?.endMs || 0;
    return segments.filter(s => s.available && s.endMs > anchorMs - windowMs && s.endMs <= anchorMs && !s.observation?.transcript).length;
  }, keptWindowMs);
  const keptMomentBoundMs = (passagesToTranscribe + keptMomentMarginPassages) * transcriptionCeilingMs;
  await page.locator('#keep-moment').click();
  await page.locator('#nav-memory').click();
  assert.equal(await page.locator('.hero').isVisible(),false,'Memory is a separate view');
  assert.equal(await page.locator('#nav-memory').getAttribute('aria-current'),'page');
  try {
    await page.waitForSelector('#saved-rail .saved-tile', { timeout: keptMomentBoundMs });
  } catch (error) {
    throw new Error(`The kept moment (moment gardé) did not appear within ${keptMomentBoundMs} ms: ${passagesToTranscribe} passages to `
      + `transcribe, ${transcriptionCeilingMs} ms each at most`, { cause: error });
  }
  assert.match(await page.locator('#saved-rail .saved-tile').first().textContent(),/00:/);
  await page.locator('#saved-rail .saved-tile').first().click();
  assert.equal(await page.locator('#library-dialog').evaluate(el=>el.open),true);
  await page.locator('#close-library').click();
  // The session being captured is listed, and cannot be deleted while it captures.
  await page.waitForSelector('#sessions-list .session-row[data-current]');
  assert.equal(await page.locator('#sessions-list .session-row[data-current] [data-action=session-delete]').isDisabled(),true,'A session being captured cannot be deleted');
  assert.match(await page.locator('#sessions-list .session-row[data-current]').innerText(),/En cours de capture/);
  await page.locator('#nav-live').click();
  assert.equal(await page.locator('#memory-section').isVisible(),false);
  const beforeFloating=(await page.evaluate(()=>window.tvlens.state())).segments.length;
  await page.locator('#float-mode').click();
  await page.waitForFunction(()=>document.body.classList.contains('floating'));
  assert.equal(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].isAlwaysOnTop()),true);
  await page.locator('#float-chat').click();
  await page.waitForFunction(()=>document.body.classList.contains('floating-expanded'));
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true,'Expanded compact mode fits its window');
  assert.equal(await page.locator('#float-conversation h2').textContent(),'Conversation');
  await waitState(page,async count=>(await window.tvlens.state()).segments.length>count,beforeFloating);
  // The one-line result of the collapsed bar is hidden until there is a result to show.
  const heights=await page.locator('#float-bar button:not([hidden])').evaluateAll(nodes=>nodes.map(n=>n.getBoundingClientRect().height));
  assert.equal(new Set(heights).size,1,'All floating actions have the same height');
  await page.locator('#question').fill('Brouillon conservé');
  await page.locator('#close-chat').click();
  await page.locator('#float-chat').click();
  assert.equal(await page.locator('#question').inputValue(),'Brouillon conservé');
  assert.equal(await page.locator('#question').evaluate(n=>n===document.activeElement),true);
  await page.locator('#question').fill('');
  await page.screenshot({path:'/tmp/tvlens-floating.png'});
  await waitState(page,async()=>Boolean((await window.tvlens.recapState()).overview));
  await menuClick(page,'open-recap');
  assert.equal(await page.locator('#recap-dialog').evaluate(el=>el.open),true);
  assert.equal(await page.locator('#recap-dialog').evaluate(el=>el.scrollWidth<=el.clientWidth),true,'Compact recap fits its dialog');
  await page.screenshot({path:'/tmp/tvlens-recap-small.png'});
  await page.locator('#close-recap').click();
  await menuClick(page,'float-full');
  await page.waitForFunction(()=>!document.body.classList.contains('floating'));
  assert.equal(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].isAlwaysOnTop()),false);
  let state = await page.evaluate(() => window.tvlens.state());
  assert.ok(state.segments.some(s => s.status === 'ready' && s.hasAudio));
  const living=await page.evaluate(()=>window.tvlens.recapState());
  assert.equal(living.sessionId,state.id);
  assert.ok(living.chapters.length>0);
  for(const chapter of living.chapters)for(const source of chapter.sources)assert.ok(state.segments.some(s=>s.id===source.id),'Recap citations refer to actual source passages');
  await page.locator('#nav-memory').click();
  // Replay goes through the media protocol. The recap offers none for the passage recorded without a frame, and
  // every source it does offer has to play: a failure here is a defect, reported with what the disk holds.
  const recapSources=page.locator('#recap-panel .recap-source');
  assert.ok(await recapSources.evaluateAll(nodes=>nodes.some(node=>node.disabled&&/résumé/.test(node.textContent))),'The passage without a frame is offered as a summary, not as a video');
  await page.locator('#recap-panel .recap-source:not([disabled])').first().click();
  try {
    await page.waitForFunction(()=>document.querySelector('#replay').readyState>=2);
  } catch (error) {
    const replay=await page.evaluate(async()=>{const video=document.querySelector('#replay'),id=video.currentSrc.split('/').pop(),state=await window.tvlens.state(),segment=state.segments.find(s=>s.id===id);return {src:video.currentSrc,readyState:video.readyState,networkState:video.networkState,error:video.error?{code:video.error.code,message:video.error.message}:null,note:document.querySelector('#replay-note').textContent,sessionId:state.id,segment:segment?{status:segment.status,available:segment.available,mediaReason:segment.mediaReason||null}:null,listed:state.segments.map(s=>`${s.id}:${s.available?'video':s.mediaReason||'no-video'}`)};});
    const folder=path.join(userData,'sessions',replay.sessionId,'media'),sizes={};
    for(const name of (await fs.readdir(folder).catch(()=>[])).filter(n=>n.endsWith('.webm')).sort((a,b)=>parseInt(a.slice(7))-parseInt(b.slice(7))).slice(0,8)){const bytes=await fs.readFile(path.join(folder,name));sizes[name]={bytes:bytes.length,holdsMedia:holdsMedia(bytes)};}
    console.error('Replay diagnostics:', {...replay,sizes});
    throw error;
  }
  assert.notEqual(await page.locator('#replay').evaluate(video=>video.currentSrc.split('/').pop()),'moment-1','The passage without a frame is never replayed');
  await page.locator('#close-replay').click();
  const archive=JSON.parse(await fs.readFile(path.join(userData,'sessions',state.id,'living-recap.json'),'utf8'));
  assert.equal(archive.sessionId,state.id);
  assert.ok(archive.sourcePassages.length>0);
  await page.waitForFunction(()=>[...document.querySelectorAll('.moment-image')].filter(img=>img.complete&&img.naturalWidth>0).length>=2);
  // The retention shown is the loaded session's own (its state), not the setting of the host.
  assert.match(await page.locator('#memory-status').textContent(), /jusqu’à la suppression de la session$/, 'Retention text comes from the session state');
  await page.screenshot({path:'/tmp/tvlens-recap.png',fullPage:true});
  await page.locator('#nav-live').click();
  // Media of a session live in its media/ folder, kept until the session is deleted.
  // The sound format is read on a passage that has sound. The first, 2 s passage may have none when the audio
  // capture starts late (seen on a saturated machine): the state then says so, and the run reports it.
  const stored = async id => JSON.parse(await fs.readFile(path.join(userData, 'sessions', state.id, 'media', id + '.json'), 'utf8'));
  const firstStored = await stored('moment-1'), firstState = state.segments.find(s => s.id === 'moment-1');
  assert.equal(Boolean(firstStored.audio), firstState.hasAudio, 'The state says whether the first passage has sound');
  assert.ok(firstStored.frames.length >= 1);
  withoutFrame.hasAudio = firstState.hasAudio;
  const metadata = await stored(state.segments.find(s => s.status === 'ready' && s.hasAudio && s.available).id);
  assert.ok(metadata.frames.length >= 2);
  const wav = Buffer.from(metadata.audio, 'base64');
  assert.equal(wav.toString('ascii', 0, 4), 'RIFF'); assert.equal(wav.readUInt32LE(24), 16000); assert.ok(wav.length > 1000);
  await page.locator('#question').fill('Que voit-on maintenant ?');
  await page.locator('#send').click();
  // A running question shows elapsed / ceiling, the ceiling being the one the host enforces.
  await page.waitForSelector('.deep-message[data-status="running"] .job-clock');
  assert.match(await page.locator('.deep-message[data-status="running"] .job-clock').textContent(), new RegExp(`^\\d\\d:\\d\\d / ${clock(configuration.questionTimeoutMs)}$`));
  assert.ok((await page.evaluate(()=>window.tvlens.deepState())).jobs.at(-1).timeoutMs === configuration.questionTimeoutMs, 'The ceiling travels with the question');
  await page.waitForFunction(() => document.querySelector('.chat-answer')?.textContent.includes('cercle'));
  await page.locator('#messages .reference').first().click();
  await page.waitForFunction(() => document.querySelector('#replay').readyState >= 2);
  assert.equal(await page.locator('#replay-dialog').evaluate(el => el.open), true);
  await page.locator('#close-replay').click();
  // Rendering by card: this first answer keeps its node and its open detail block through everything that follows.
  await page.locator('.deep-message').first().locator('details.response-details > summary').click();
  await page.evaluate(() => { document.querySelector('.deep-message').__firstCard = true; });
  // Freshness of a finished question: one short time code above the answer. The whole sentence (last passage
  // received, analysis still pending) stays on hover and in the detail block, from what the core froze for it.
  const available = (await page.evaluate(()=>window.tvlens.deepState())).jobs[0].availability;
  assert.ok(available, 'The question carries what was consultable when it froze');
  const fresh = page.locator('.deep-message').first().locator('.job-fresh');
  assert.equal(await fresh.textContent(), available.lastPassage ? `Mémoire jusqu’à ${clock(available.throughMs)}` : 'Aucun passage reçu à l’envoi', 'A finished answer shows the short freshness label');
  const sentence = available.lastPassage ? `Mémoire disponible jusqu’à ${clock(available.throughMs)} au moment de l’envoi` : 'Aucun passage n’était encore reçu au moment de l’envoi';
  assert.ok((await fresh.getAttribute('title')).startsWith(sentence), 'The whole sentence stays one hover away');
  const freshDetail = await page.locator('.deep-message').first().locator('details.response-details .job-fresh-detail').textContent();
  assert.ok(freshDetail.startsWith(sentence), 'The detail block keeps the whole sentence');
  if (available.lastPassage) assert.ok(freshDetail.includes(`dernier passage reçu : ${clock(available.lastPassage.startMs)}–${clock(available.lastPassage.endMs)}`), 'The detail block names the last passage received');
  const beforeVerification = state.segments.length;
  await page.locator('#question').fill('Vérifie : Le premier alunissage habité a eu lieu en 1972.');
  await page.locator('#verify').click();
  assert.equal(await page.locator('#verify-dialog').evaluate(el => el.open), true);
  assert.equal(await page.locator('#claim').inputValue(), 'Le premier alunissage habité a eu lieu en 1972.');
  await page.locator('#launch-verify').click();
  await page.waitForFunction(() => document.querySelector('.verification-message .pending'));
  await page.waitForFunction(() => document.querySelector('.source-link'), null, { timeout: liveVerifier ? 190000 : 10000 });
  const verification = await page.evaluate(() => window.tvlens.verificationState());
  assert.equal(verification.jobs[0].status, 'done');
  assert.ok(verification.jobs[0].result.sources.length > 0);
  assert.ok(verification.jobs[0].result.research.webSearches > 0);
  await page.locator('#question').fill('Que voit-on maintenant ?');
  await page.locator('#send').click();
  await waitState(page,async()=> (await window.tvlens.deepState()).jobs.filter(j=>j.status==='done').length===2);
  state = await page.evaluate(() => window.tvlens.state());
  assert.ok(state.segments.length > beforeVerification, 'Capture must continue during external verification');
  assert.equal((await page.evaluate(()=>window.tvlens.deepState())).jobs.filter(j=>j.status==='done').length,2,'All Ask uses the Codex agent port');
  assert.deepEqual(await page.evaluate(() => { const card = document.querySelector('.deep-message'); return [card.__firstCard === true, card.querySelector('details.response-details').open]; }), [true, true], 'An earlier answer keeps its node and its open detail block while later answers are written');
  const archived = await fs.readdir(path.join(userData, 'verifications'));
  assert.equal(archived.filter(name => name.endsWith('.json')).length, 1);
  if (liveVerifier) {
    await fs.writeFile('docs/verification-ui-live.json', JSON.stringify({ date: new Date().toISOString(), result: verification.jobs[0].result, captureContinued: true, askContinued: true }, null, 2));
  } else {
    await page.locator('#question').fill('FAIL_TEST');
    await page.locator('#verify').click();
    await page.locator('#launch-verify').click();
    await page.waitForFunction(() => document.querySelector('.verification-message .verify-error'));
    assert.equal((await page.evaluate(() => window.tvlens.verificationState())).busy, false);
  }
  const beforeDeep = (await page.evaluate(() => window.tvlens.state())).segments.length;
  await page.evaluate(()=>window.tvlens.deepen('Comment le cercle se déplace-t-il ?'));
  await page.waitForSelector('.deep-message[data-status="running"]');
  await waitState(page,async()=> (await window.tvlens.deepState()).jobs.at(-1)?.status==='done');
  let deep = await page.evaluate(() => window.tvlens.deepState());
  assert.ok(deep.jobs[2].result.citations.length, JSON.stringify(deep));
  assert.ok((await page.evaluate(() => window.tvlens.state())).segments.length > beforeDeep, 'Capture continues during deep research');
  await page.locator('.deep-message').nth(2).locator('.reference').first().click();
  await page.waitForFunction(() => document.querySelector('#replay').readyState >= 2);
  const cited = deep.jobs[2].result.citations[0];
  const replayState = await page.evaluate(() => window.tvlens.state());
  const citedSegment = replayState.segments.find(s => s.id === cited.id);
  const actualTime = await page.locator('#replay').evaluate(el => el.currentTime);
  assert.ok(Math.abs(actualTime - (cited.startMs - citedSegment.startMs) / 1000) < 1, 'Deep citation seeks within the original clip, not the slowed provider video');
  await page.locator('#close-replay').click();
  await page.locator('#question').fill('Pourquoi le cercle saute ?');
  await page.locator('#send').click();
  await page.waitForSelector('.deep-message[data-status="running"]');
  await page.locator('#question').fill('Que voit-on maintenant ?');
  await page.locator('#send').click();
  await page.waitForSelector('.deep-message[data-status="queued"]');
  assert.match(await page.locator('.deep-message[data-status="queued"]').innerText(), /En attente · position 1 sur 1 dans la file/, 'A waiting question shows its place');
  assert.match(await page.locator('#queue-status').textContent(), /^1 question en attente · traitée dans l’ordre/, 'One waiting question is written in the singular');
  await waitState(page,async () => (await window.tvlens.deepState()).jobs.at(-1)?.status === 'done');
  if (liveVideoAgent) await fs.writeFile(liveInspection ? 'docs/reexamen-ui-live.json' : 'docs/mcp-ui-live.json', JSON.stringify({ date:new Date().toISOString(), deep, captureContinued:true, newQuestionQueued:true, deepReplay:true, note:liveInspection ? 'Real persistent Codex, dynamic video tools, OpenRouter embeddings, Luna image inspection and local Whisper; synthetic capture and background observation.' : 'Real persistent Codex and dynamic video tools, synthetic capture and deterministic inspection adapter; no OpenRouter calls.' }, null, 2));
  // A cancelled question is shown as cancelled: never as an answer, never as insufficient evidence.
  await page.locator('#question').fill('Question à annuler');
  await page.locator('#send').click();
  await page.waitForSelector('.deep-message[data-status="running"] .cancel-deep');
  await page.locator('.deep-message[data-status="running"] .cancel-deep').click();
  await waitState(page,async()=> (await window.tvlens.deepState()).jobs.at(-1)?.status==='cancelled');
  await page.waitForSelector('.deep-message[data-status="cancelled"] .job-outcome');
  const cancelledText = await page.locator('.deep-message[data-status="cancelled"]').last().innerText();
  assert.match(cancelledText, /ANNULÉE/); assert.doesNotMatch(cancelledText, /PREUVES INSUFFISANTES/);
  // Whatever its outcome, a finished question keeps the short freshness label: the sentence never stacks up above the answers.
  assert.deepEqual(await page.locator('.deep-message:not([data-status="queued"]):not([data-status="running"]) .job-fresh').evaluateAll(nodes=>nodes.map(n=>n.textContent).filter(text=>!/^(?:Mémoire(?: analysée)? jusqu’à [\d:]+|Aucun passage (?:reçu à l’envoi|analysé))$/.test(text))), [], 'Finished questions carry the short label only');
  // What the window writes itself, and the limits of the core it draws (a real agent may write its own sentences).
  const counted = ['#chat-health-summary', '#chat-coverage', '#queue-status', ...(liveVideoAgent ? [] : ['.deep-message .answer-limits'])].join(', ');
  assert.deepEqual(await page.locator(counted).evaluateAll(nodes=>nodes.map(n=>n.textContent).filter(text=>/\p{L}\((?:s|es)\)/u.test(text))), [], 'No count is written with a parenthesised plural');
  await page.screenshot({ path: '/tmp/tvlens-smoke.png',fullPage:true });

  // ---- Surveillance: free instruction, beside the chat, discreet cards (simulated agent, no provider) ----
  await page.locator('#nav-watch').click();
  assert.equal(await page.locator('#watch-section').isVisible(), true);
  assert.equal(await page.locator('#float-conversation').isVisible(), true, 'The conversation stays beside the surveillance');
  assert.equal(await page.locator('#auto-frequency').count(), 0, 'No cadence field');
  assert.equal(await page.locator('#watch-examples .watch-example').count() >= 2, true, 'Instruction examples are offered');
  assert.equal(await page.locator('#watch-stop').isDisabled(), true);
  assert.equal(await page.locator('#watch-signals').count(), 0, 'No setting puts video signals on screen');
  // The display settings sit in a folded block: open it as a viewer would before choosing a duration.
  await page.locator('.watch-settings summary').click();
  await page.locator('#watch-duration').selectOption('8000');
  // Whatever enters the bottom-left stack or the one-line bar is recorded from here on: that only sourced
  // verifications appear by themselves is checked over the whole surveillance, not at chosen instants.
  await page.evaluate(() => {
    window.__popped = [];
    new MutationObserver(records => { for (const record of records) for (const node of record.addedNodes) if (node.dataset?.kind) window.__popped.push(node.dataset.kind); })
      .observe(document.querySelector('#watch-stack'), { childList: true });
    const toast = document.querySelector('#float-toast');
    new MutationObserver(() => { if (!toast.hidden) window.__popped.push(`bar:${toast.textContent}`); }).observe(toast, { attributes: true, childList: true, characterData: true, subtree: true });
  });
  const stackCards = () => page.locator('#watch-stack .watch-card').count();
  // Every state pushed to the window and every text of the conversation chip is recorded from here: the host
  // answers an activation at once, while the folder of the session is still being read ("restoring"), and the
  // surveillance listens a moment later.
  await page.evaluate(() => {
    window.__watchStates = []; window.__chipTexts = [];
    window.tvlens.onSurveillance(s => window.__watchStates.push({ enabled: s.enabled, state: s.activity.state, ready: s.registry?.ready ?? null, persisted: s.registry?.persisted ?? null, activation: s.activation?.id ?? null }));
    const chip = document.querySelector('#watch-chip');
    new MutationObserver(() => window.__chipTexts.push(chip.hidden ? '' : chip.textContent)).observe(chip, { attributes: true, childList: true, characterData: true, subtree: true });
  });
  const settled = s => s.enabled && s.ready === true && s.state !== 'restoring';
  await page.locator('#watch-instruction').fill('Préviens-moi quand on parle d’images');
  await page.locator('#watch-start').click();
  // Back to the video at once: with the panel open a result is listed there and nothing pops up.
  await page.locator('#nav-live').click();
  // Bounded: the runtime itself gives the folder five seconds before it goes on in memory and says so.
  await page.waitForFunction(() => window.__watchStates.some(s => s.enabled && s.ready === true && s.state !== 'restoring'), null, { timeout: 10000 });
  const activation = (await page.evaluate(()=>window.__watchStates)).filter(s=>s.enabled), settledAt = activation.findIndex(settled);
  assert.ok(settledAt > 0 && activation.slice(0, settledAt).every(s=>s.state==='restoring'&&s.ready===false&&s.activation===null), `The activation is first answered as a restoration, without a number: ${JSON.stringify(activation)}`);
  assert.ok(['listening','detecting'].includes(activation[settledAt].state) && activation[settledAt].activation && activation[settledAt].persisted === true, `Then the surveillance listens, under a numbered activation, saved: ${JSON.stringify(activation[settledAt])}`);
  // On screen the restoration is told as such, when it is painted at all: never as a delay nor as a check in progress.
  const calm = /^Surveillance · (?:écoute|lecture des nouveaux passages)/;
  await page.waitForFunction(() => /^Surveillance · (?:écoute|lecture des nouveaux passages)/.test(document.querySelector('#watch-chip').textContent), null, { timeout: 10000 });
  const chips = await page.evaluate(()=>window.__chipTexts);
  assert.deepEqual(chips.slice(0, chips.findIndex(text=>calm.test(text))).filter(text=>text&&text!=='Surveillance · restauration du suivi enregistré'), [], 'While the saved history is read the chip says so and nothing else');
  // The history is saved: no "not saved" banner.
  assert.equal(await page.locator('#watch-notice').isHidden(), true, 'No banner while the registry is saved');
  await waitState(page,async()=>{const s=await window.tvlens.surveillanceState();return s.enabled===true&&s.registry.ready===true;});
  const watching = await page.evaluate(()=>window.tvlens.surveillanceState());
  assert.ok(watching.activation.id, 'The activation has its number once the folder is read');
  // A signal is a video observation: counted on the tab and read in the panel, never shown by itself. Checked
  // first in the collapsed floating window, where a card would become the one-line bar.
  await page.locator('#float-mode').click();
  await page.waitForFunction(()=>document.body.classList.contains('floating'));
  await waitState(page,async()=>(await window.tvlens.surveillanceState()).signals.seq>=1);
  await page.waitForFunction(()=>Number(document.querySelector('#watch-badge').textContent)>=1, null, { timeout: 30000 });
  assert.ok(await page.locator('#float-menu-toggle').getAttribute('data-badge'), 'The floating bar carries the dot of the tab');
  await page.waitForTimeout(1000);
  assert.deepEqual([await page.locator('#float-toast').evaluate(el=>el.hidden), await stackCards()], [true, 0], 'A signal never becomes the one-line bar');
  await menuClick(page,'float-full');
  await page.waitForFunction(()=>!document.body.classList.contains('floating'));
  await page.locator('#question').focus();
  await page.waitForTimeout(1000);
  assert.equal(await stackCards(), 0, 'A signal never becomes a card, even once the full window is back');
  assert.equal(await page.locator('#watch-badge').isVisible(), true, 'The tab carries a badge');
  assert.match(await page.locator('#watch-chip').textContent(), /^Surveillance/);
  // Decision 8: a question neither suspends nor restarts the surveillance, which keeps reading meanwhile.
  await page.locator('#question').fill('Que voit-on maintenant ?');
  await page.locator('#send').click();
  await waitState(page,async()=> (await window.tvlens.deepState()).jobs.at(-1)?.status==='done');
  const afterQuestion = await page.evaluate(()=>window.tvlens.surveillanceState());
  assert.deepEqual([afterQuestion.enabled, afterQuestion.activation.id], [true, watching.activation.id], 'A question does not interrupt the surveillance');
  assert.ok(afterQuestion.coverage.total > watching.coverage.total, 'Passages keep being read during a question');
  assert.deepEqual(await page.evaluate(()=>window.__popped), [], 'Nothing popped up during a surveillance that only signals');
  // The signal is read in the panel: its own label and interval, a quote, no source; and it stays in the history.
  await page.locator('#nav-watch').click();
  await page.waitForSelector('#watch-results .watch-card[data-kind="signal"]');
  const signalCard = await page.locator('#watch-results .watch-card[data-kind="signal"]').first().innerText();
  assert.match(signalCard, /REPÉRÉ DANS LA VIDÉO/); assert.match(signalCard, /sans vérification sur le web/);
  assert.equal(await page.locator('#watch-results .watch-card[data-kind="signal"] .source-link').count(), 0, 'A signal never shows a source');
  await page.waitForSelector('#watch-history .watch-row[data-state="noted"]');
  assert.match(await page.locator('#watch-history .watch-row[data-state="noted"] .state-chip').first().textContent(), /Relevée/);
  await page.screenshot({ path: '/tmp/tvlens-surveillance-signal.png', fullPage: true });
  // A verification instruction: its sourced result is what appears by itself, bottom left, and it takes no focus.
  await page.locator('#watch-instruction').fill('Vérifie les chiffres annoncés.');
  await page.locator('#watch-start').click();
  await page.locator('#nav-live').click();
  await page.locator('#question').focus();
  await page.waitForSelector('#watch-stack .watch-card[data-kind="verification"]', { timeout: 30000 });
  const firstCardKey = await page.locator('#watch-stack .watch-card[data-kind="verification"]').first().getAttribute('data-key');
  const stackCard = await page.locator('#watch-stack .watch-card[data-kind="verification"]').first().innerText();
  assert.match(stackCard, /SOURCES CONSULTÉES/); assert.match(stackCard, /Concorde avec les sources|Contredit par les sources|Sources partagées/);
  assert.doesNotMatch(stackCard, /\b(?:vrai|faux)\b/i, 'No true/false badge');
  assert.ok(await page.locator('#watch-stack .watch-card[data-kind="verification"] .source-link').count() > 0, 'A card names its sources');
  assert.equal(await page.locator('#question').evaluate(n=>n===document.activeElement), true, 'A result card never takes the focus');
  assert.equal(await page.locator('#watch-stack').evaluate(el=>{const r=el.getBoundingClientRect();return r.left<60&&innerHeight-r.bottom<60;}), true, 'Cards stack at the bottom left');
  await page.screenshot({ path: '/tmp/tvlens-surveillance-card.png' });
  // Collapsed floating window: the same card is one line of the bar; a click opens the window on it.
  await page.locator('#float-mode').click();
  await page.waitForFunction(()=>document.body.classList.contains('floating')&&!document.querySelector('#float-toast').hidden);
  assert.match(await page.locator('#float-toast').textContent(), /^Sources consultées · [\d:]+–[\d:]+ — \S/);
  assert.equal(await stackCards(), 0, 'The collapsed bar shows the line, not the stack');
  await page.locator('#float-toast').click();
  await page.waitForFunction(key=>document.body.classList.contains('floating-expanded')&&[...document.querySelectorAll('#watch-stack .watch-card')].some(card=>card.dataset.key===key), firstCardKey);
  await menuClick(page,'float-full');
  await page.waitForFunction(()=>!document.body.classList.contains('floating'));
  // It leaves by itself after the chosen duration (eight seconds here); other cards may follow it.
  await page.waitForFunction(key=>![...document.querySelectorAll('#watch-stack .watch-card')].some(card=>card.dataset.key===key), firstCardKey, { timeout: 30000 });
  // Every claim ends in an explicit state, shown in the history; the sourced lot is listed with its sources.
  await page.locator('#nav-watch').click();
  await waitState(page,async()=>{const s=await window.tvlens.surveillanceState();return s.activation?.instruction==='Vérifie les chiffres annoncés.'&&s.counts.sourced>=1;});
  const verified = await page.evaluate(()=>window.tvlens.surveillanceState());
  await page.waitForFunction(()=>document.querySelectorAll('#watch-history .watch-row .state-chip').length>0);
  assert.match(await page.locator('#watch-counts').textContent(), /affirmations? suivies?/);
  await page.waitForSelector('#watch-results .watch-card[data-kind="verification"]');
  const sourcedCard = await page.locator('#watch-results .watch-card[data-kind="verification"]').first().innerText();
  assert.match(sourcedCard, /SOURCES CONSULTÉES/); assert.match(sourcedCard, /Concorde avec les sources|Contredit par les sources|Sources partagées/);
  assert.doesNotMatch(sourcedCard, /\b(?:vrai|faux)\b/i, 'No true/false badge');
  assert.ok(await page.locator('#watch-results .watch-card[data-kind="verification"] .source-link').count() > 0, 'A sourced card lists its sources');
  if (verified.counts.undetermined > 0) assert.ok(await page.locator('#watch-history .watch-row[data-state="undetermined"] .watch-reason').count() > 0, 'An undetermined claim stays in the history with its reason');
  assert.ok(await page.locator('#watch-results .watch-card[data-kind="signal"]').count() > 0, 'The signals of the earlier instruction are still listed');
  assert.equal(await stackCards(), 0, 'No card on top of the panel that already lists the results');
  // Over the whole surveillance: sourced verifications appeared by themselves, a signal never did.
  const popped = await page.evaluate(()=>window.__popped);
  assert.ok(popped.includes('verification') && popped.some(entry=>entry.startsWith('bar:Sources consultées')), 'A sourced verification reached the stack and the bar');
  assert.deepEqual(popped.filter(entry=>entry!=='verification'&&!entry.startsWith('bar:Sources consultées')), [], 'Nothing else ever did');
  await page.screenshot({ path: '/tmp/tvlens-surveillance.png', fullPage: true });
  const rowsBeforeStop = await page.locator('#watch-history .watch-row').count();
  await page.locator('#watch-stop').click();
  await waitState(page,async()=>(await window.tvlens.surveillanceState()).enabled===false);
  await page.waitForFunction(()=>document.querySelector('#watch-start').textContent==='Démarrer la surveillance');
  assert.ok(await page.locator('#watch-history .watch-row').count() >= rowsBeforeStop, 'Stopping loses nothing of the history');
  await page.locator('#nav-live').click();

  await page.locator('#float-mode').click();
  await page.locator('#float-record').click();
  await page.waitForFunction(() => document.querySelector('#mode').textContent === 'EN PAUSE');
  assert.equal(await page.locator('#float-status').textContent(),'En pause');
  state = await page.evaluate(() => window.tvlens.state());
  const doneBeforePause = (await page.evaluate(()=>window.tvlens.deepState())).jobs.filter(j=>j.status==='done').length;
  assert.equal(state.accepting, false); assert.equal(doneBeforePause, 6);
  const pausedId=state.id,pausedCount=state.segments.length,pausedTime=state.elapsedMs;
  await page.waitForTimeout(500);
  assert.equal((await page.evaluate(()=>window.tvlens.state())).elapsedMs,pausedTime);
  await page.locator('#float-record').click();
  await page.waitForFunction(()=>document.querySelector('#float-record').getAttribute('aria-label')==='Mettre TVLens en pause');
  assert.equal(await page.locator('#float-source-dialog').evaluate(el=>el.open),false,'Resume reuses the verified source');
  const resumed=await page.evaluate(()=>window.tvlens.state());assert.equal(resumed.id,pausedId);assert.ok(resumed.segments.length>=pausedCount);
  assert.ok((await page.evaluate(()=>window.tvlens.deepState())).jobs.length>0);
  await waitState(page,async count=>(await window.tvlens.state()).segments.length>count,pausedCount);
  if(!liveVideoAgent){
    await menuClick(page,'float-explain');
    assert.equal(await page.locator('#moment-dialog').evaluate(el=>el.open),false,'Explain runs directly without a second confirmation');
    await waitState(page,async()=> (await window.tvlens.deepState()).jobs.at(-1)?.intent==='explain-moment' && (await window.tvlens.deepState()).jobs.at(-1)?.status==='done');
    const explained=(await page.evaluate(()=>window.tvlens.deepState())).jobs.at(-1);
    assert.ok(explained.result.citations.length,'Explain remains linked to video evidence');
    assert.ok(explained.result.citations.every(c=>c.endMs<=explained.anchorMs),'Explain never cites after the selected instant');
    await page.locator('.deep-message').last().locator('.deepen').click();
    await waitState(page,async()=> (await window.tvlens.deepState()).jobs.at(-1)?.mode==='inspect' && (await window.tvlens.deepState()).jobs.at(-1)?.status==='done');
    const reexamined=(await page.evaluate(()=>window.tvlens.deepState())).jobs.at(-1);
    assert.equal(reexamined.anchorMs,explained.anchorMs,'Reexamination preserves the original instant');
    await page.locator('#catch-up').click();
    await waitState(page,async()=> (await window.tvlens.deepState()).jobs.at(-1)?.intent==='recap' && (await window.tvlens.deepState()).jobs.at(-1)?.status==='done');
    const recap=(await page.evaluate(()=>window.tvlens.deepState())).jobs.at(-1);
    assert.ok(recap.memoryPreview?.passages.length,'Catch-up immediately shows available summaries');
    assert.ok(recap.metrics.firstUsefulMs < recap.metrics.totalMs,'Memory appears before final synthesis');
    assert.ok(await page.locator('.deep-message').last().locator('.preview-passage').count(),'Completed catch-up retains clickable passages');
    await menuClick(page,'mark-attention');
    await page.waitForFunction(()=>document.querySelector('#attention-status').textContent.startsWith('Tu reprends ici'));
    const frozen=await page.evaluate(()=>window.tvlens.freezeMoment({kind:'catch-up'}));
    assert.ok(frozen.startMs>0,'Explicit attention marker bounds the next catch-up');
    const sourceState=await page.evaluate(()=>window.capture.sources());
    assert.equal(sourceState.preferredSourceId,'test-source','Chosen source is remembered');
    await fs.writeFile('/tmp/tvlens-latency.json',JSON.stringify({kind:'local synthetic capture, fake 2500 ms model',firstCapturedPassageMs:firstCaptureMs,explain:explained.metrics,recap:recap.metrics},null,2));
    await page.screenshot({path:'/tmp/tvlens-catch-up.png'});
  }
  await page.locator('#float-record').click();
  await page.waitForFunction(() => document.querySelector('#mode').textContent === 'EN PAUSE');
  const archivedState = await page.evaluate(() => window.tvlens.state());
  const archivedJobs = (await page.evaluate(()=>window.tvlens.deepState())).jobs.length;
  await menuClick(page,'float-full');
  await page.locator('#nav-memory').click();
  await page.locator('#new-session').click();
  await waitState(page,async()=>await window.tvlens.state()===null);
  assert.equal(await page.evaluate(()=>window.tvlens.state()),null);
  assert.equal((await page.evaluate(()=>window.tvlens.deepState())).jobs.length,0);
  const clearedRecap=await page.evaluate(()=>window.tvlens.recapState());
  assert.equal(clearedRecap.sessionId,null);assert.equal(clearedRecap.overview,'');assert.equal(clearedRecap.chapters.length,0);

  // ---- Durable sessions: "Nouvelle session" archives, an archive opens read-only, capture resumes on request ----
  const rowOf = id => page.locator(`#sessions-list .session-row[data-id="${id}"]`);
  await waitState(page,async id=>(await window.tvlens.sessions()).sessions.some(s=>s.id===id&&s.state==='archived'),pausedId);
  const listed = (await page.evaluate(()=>window.tvlens.sessions())).sessions.find(s=>s.id===pausedId);
  assert.ok(listed.media.stored > 0 && listed.media.bytes > 0, 'The archived session keeps its media');
  // What this small synthetic capture really weighs on disk (640x360 fixture, not a programme).
  Object.assign(archivedVolume,{elapsedMs:listed.elapsedMs,passages:listed.passages,stored:listed.media.stored,bytes:listed.media.bytes});
  assert.equal(await exists(path.join(userData,'sessions',pausedId,'media','moment-1.webm')), true, 'Nothing is purged when a session ends');
  await rowOf(pausedId).waitFor();
  assert.match(await rowOf(pausedId).innerText(), /Vidéo partielle/, 'A session with an unreadable passage is not said complete');
  assert.match(await page.locator('#storage-line').textContent(), /Sessions :|Espace libre non mesuré/);
  await page.screenshot({path:'/tmp/tvlens-sessions.png',fullPage:true});
  await rowOf(pausedId).locator('[data-action=session-open]').click();
  await waitState(page,async id=>{const s=await window.tvlens.state();return s?.id===id&&s.readOnly===true;},pausedId);
  await page.waitForFunction(()=>!document.querySelector('#archive-banner').hidden);
  let opened = await page.evaluate(() => window.tvlens.state());
  assert.deepEqual([opened.accepting, opened.segments.length], [false, archivedState.segments.length], 'An opened archive is whole and not capturing');
  const openedAtMs = opened.elapsedMs;
  assert.match(await page.locator('#archive-banner').innerText(), /ARCHIVE · LECTURE SEULE/);
  assert.equal(await page.locator('#observe').textContent(), 'Reprendre la capture…');
  assert.equal(await page.locator('#message-list .deep-message').count(), archivedJobs, 'The questions of the archive come back with it');
  await page.waitForTimeout(2500);
  opened = await page.evaluate(() => window.tvlens.state());
  assert.deepEqual([opened.accepting, opened.segments.length, opened.elapsedMs], [false, archivedState.segments.length, openedAtMs], 'Opening an archive never restarts the capture, and its clock stays where it stopped');
  // Its thumbnails and its videos are served from disk: the previews held in memory are gone with the first session.
  await page.locator('#nav-memory').click();
  await page.waitForFunction(()=>[...document.querySelectorAll('#timeline img.moment-image')].some(img=>img.getAttribute('src').startsWith('tvlens-media://')&&img.complete&&img.naturalWidth>0));
  if (archivedState.segments.length > 40) assert.match(await page.locator('#timeline-older').textContent(), /passages? plus anciens?/, 'A long session draws its recent passages and names the rest');
  // An archive states its own retention, read from its state: a durable one says "until deleted" wherever it is opened.
  assert.match(await page.locator('#memory-status').textContent(), /jusqu’à la suppression de la session$/, 'An opened archive shows the retention of the session');
  await page.locator('#nav-live').click();
  await page.locator('#message-list .deep-message').first().locator('.reference:not([disabled])').first().click();
  await page.waitForFunction(() => document.querySelector('#replay').readyState >= 2);
  assert.ok((await page.locator('#replay').evaluate(el => el.currentSrc)).includes(pausedId), 'An early passage of the archive can be replayed');
  await page.locator('#close-replay').click();
  if (!liveVideoAgent) {
    // Questions are allowed on an archive, and re-examine its stored media.
    await page.locator('#question').fill('Que voyait-on au début ?');
    await page.locator('#send').click();
    await waitState(page,async count=>{const jobs=(await window.tvlens.deepState()).jobs;return jobs.length>count&&jobs.at(-1).status==='done';},archivedJobs);
    const onArchive = (await page.evaluate(()=>window.tvlens.deepState())).jobs.at(-1);
    assert.equal(onArchive.sessionId, pausedId); assert.ok(onArchive.result.citations.length, 'An archive answers with its own passages');
  }
  // Surveillance cannot start on a read-only archive; capture restarts only after an explicit confirmation.
  await page.locator('#nav-watch').click();
  assert.equal(await page.locator('#watch-start').isDisabled(), true);
  assert.match(await page.locator('#watch-hint').textContent(), /Archive en lecture seule/);
  await page.locator('#nav-live').click();
  await page.locator('#observe').click();
  await page.waitForFunction(()=>document.querySelector('#resume-session-dialog').open);
  const beforeResume = await page.evaluate(() => window.tvlens.state());
  assert.equal(beforeResume.accepting, false, 'The click alone starts nothing');
  assert.match(await page.locator('#resume-session-text').textContent(), new RegExp(`à partir de ${clock(beforeResume.elapsedMs)}`));
  await page.screenshot({path:'/tmp/tvlens-resume.png'});
  await page.locator('#confirm-resume-session').click();
  await page.waitForFunction(()=>document.querySelector('#float-record').getAttribute('aria-label')==='Mettre TVLens en pause');
  await waitState(page,async count=>{const s=await window.tvlens.state();return s.readOnly===false&&s.accepting&&s.segments.length>count;},archivedState.segments.length);
  assert.equal((await page.evaluate(() => window.tvlens.state())).id, pausedId, 'The explicit resume continues the same session');
  assert.equal(await page.locator('#archive-banner').isVisible(), false);
  await page.locator('#stop').click();
  await page.waitForFunction(() => document.querySelector('#mode').textContent === 'EN PAUSE');
  // A second session, then the first one is deleted: only that one goes, and the kept moment stays.
  await page.locator('#nav-memory').click();
  await page.locator('#new-session').click();
  await waitState(page,async()=>await window.tvlens.state()===null);
  await page.locator('#nav-live').click();
  await page.locator('#observe').click();
  await page.waitForFunction(()=>document.querySelector('#float-record').getAttribute('aria-label')==='Mettre TVLens en pause');
  await waitState(page,async()=>((await window.tvlens.state())?.segments.length||0)>=2);
  const secondId = (await page.evaluate(() => window.tvlens.state())).id;
  assert.notEqual(secondId, pausedId, 'A new session is a new session');
  // A registry that cannot be taken over (here the file of another session, placed in the folder of this one) is
  // neither resumed nor replaced: the surveillance goes on in memory and a discreet banner says so above every
  // view, in the words of the state. Nothing in it offers to remove the file, and the file is left as it is.
  const registryFile = path.join(userData, 'sessions', secondId, 'surveillance.json');
  const foreign = JSON.stringify({ version: 1, sessionId: 'une-autre-session', claims: [], lots: [] });
  await fs.writeFile(registryFile, foreign);
  const answered = await page.evaluate(()=>window.tvlens.startSurveillance({ instruction: 'Vérifie les chiffres annoncés.' }));
  assert.deepEqual([answered.enabled, answered.activity.state, answered.registry.ready, answered.activation.id], [true, 'restoring', false, null], 'The activation is answered before the folder is read');
  await page.waitForFunction(()=>!document.querySelector('#watch-notice').hidden, null, { timeout: 10000 });
  const unsaved = await page.evaluate(()=>window.tvlens.surveillanceState());
  assert.deepEqual([unsaved.enabled, unsaved.registry.ready, unsaved.registry.persisted, unsaved.registry.status], [true, true, false, 'unreadable'], 'The surveillance goes on, its history in memory only');
  assert.match(unsaved.registry.message, /Historique en mémoire seulement/);
  assert.equal(await page.locator('#watch-notice-text').textContent(), unsaved.registry.message, 'The banner carries the sentence of the state as it is');
  assert.equal(await page.locator('#watch-notice').isVisible(), true, 'The banner is drawn on the Direct view, surveillance panel closed');
  assert.equal(await page.locator('#watch-notice button, #watch-notice a').count(), 0, 'The banner offers no action');
  assert.doesNotMatch(await page.locator('#watch-notice').innerText(), /supprim|effac/i, 'Nothing offers to remove the registry');
  assert.match(await page.locator('#watch-chip').textContent(), /^Surveillance · (?:écoute|lecture des nouveaux passages|vérification en cours)/, 'The activity stays what it is');
  await page.locator('#nav-watch').click();
  assert.doesNotMatch(await page.locator('#watch-activity').textContent(), /Historique en mémoire seulement/, 'Said once: the activity line does not repeat the banner');
  await page.screenshot({path:'/tmp/tvlens-surveillance-unsaved.png'});
  await page.locator('#nav-live').click();
  await page.evaluate(()=>window.tvlens.stopSurveillance());
  await waitState(page,async()=>(await window.tvlens.surveillanceState()).enabled===false);
  assert.equal(await fs.readFile(registryFile, 'utf8'), foreign, 'The registry found in the folder is neither replaced nor removed');
  assert.equal(await page.locator('#watch-notice').isVisible(), true, 'Said for as long as the state says it, surveillance stopped included');
  await page.locator('#stop').click();
  await page.waitForFunction(() => document.querySelector('#mode').textContent === 'EN PAUSE');
  await page.locator('#nav-memory').click();
  await rowOf(pausedId).waitFor(); await rowOf(secondId).waitFor();
  await rowOf(pausedId).locator('[data-action=session-delete]').click();
  await page.waitForFunction(()=>document.querySelector('#delete-session-dialog').open);
  const deletionText = await page.locator('#delete-session-dialog').innerText();
  assert.match(deletionText, /Seront effacés de ce Mac/); assert.match(deletionText, /Ne seront pas effacés : les moments gardés et les anciennes vérifications/);
  assert.equal(await page.evaluate(()=>document.activeElement.id), 'cancel-delete-session', 'The destructive button is never the focused one');
  await page.screenshot({path:'/tmp/tvlens-delete-session.png'});
  await page.locator('#confirm-delete-session').click();
  await waitState(page,async id=>!(await window.tvlens.sessions()).sessions.some(s=>s.id===id),pausedId);
  await page.waitForFunction(id=>!document.querySelector(`#sessions-list .session-row[data-id="${id}"]`),pausedId);
  assert.equal(await exists(path.join(userData,'sessions',pausedId)), false, 'The deleted session is gone from the disk');
  assert.equal(await exists(path.join(userData,'sessions',secondId,'session.json')), true, 'The other session is intact');
  assert.equal((await page.evaluate(() => window.tvlens.state())).id, secondId, 'The loaded session is untouched by the deletion of another one');
  assert.ok((await page.evaluate(()=>window.tvlens.savedMoments())).length > 0, 'Kept moments survive the deletion of their session');
  assert.ok((await fs.readdir(path.join(userData, 'verifications'))).filter(name => name.endsWith('.json')).length >= 1, 'Past verifications survive it too');
  assert.match(await page.locator('#notice').textContent(), /Session supprimée/);

  await page.locator('#nav-saved').click();
  assert.equal(await page.locator('#library-dialog').evaluate(el=>el.open),true);
  await page.locator('#close-library').click();
  await page.locator('#nav-search').click();
  assert.equal(await page.locator('#moment-query').evaluate(el=>document.activeElement===el),true);
  await page.locator('#close-library').click();
  await page.locator('#models').click();
  await page.locator('.status-details summary').click();
  assert.equal(await page.locator('#cloud-note').isVisible(),true);
  assert.deepEqual(errors, []);
  await page.evaluate(() => window.__fixtureCleanup());
  console.log(JSON.stringify({ result: 'PASS', segments: state.segments.length, audio: '16kHz WAV', replay: 'WebM via range protocol', passageWithoutFrame: withoutFrame, archivedVolume, ask: 'cited answer', verification: liveVerifier ? 'real Codex web search' : 'fake success + error',
    freshness: 'short label above a finished answer, whole sentence in the detail block',
    surveillance: 'simulated agent: activation answered as a restoration then listening, signal in the panel and the history only, sourced card bottom left and in the collapsed bar, no interruption by a question, banner when the history is not saved',
    sessions: 'archive, read-only open with its own retention, explicit resume, single deletion', screenshot: '/tmp/tvlens-smoke.png' }));
} finally {
  await app.close();
  if (userData) await fs.rm(userData, { recursive: true, force: true });
}

// ---- Disk floor (second, short launch): capture refused with its reason, a persistent banner, nothing deleted ----
// The floor is set absurdly high for this launch only: the machine's real free space is never touched.
const constrained = await electron.launch({ args: launchArgs, executablePath: require('electron'), env: { ...process.env, TVLENS_DISK_MIN_FREE_MB: String(1e9) } });
let constrainedData;
try {
  constrainedData = await constrained.evaluate(({ app }) => app.getPath('userData'));
  const page = await constrained.firstWindow();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.waitForFunction(() => document.querySelector('#source').value === 'test-source');
  await installFixture(page);
  await waitState(page, async () => (await window.tvlens.storage()).state === 'blocked');
  await page.waitForFunction(() => !document.querySelector('#storage-banner').hidden);
  const banner = await page.locator('#storage-banner').innerText();
  assert.match(banner, /Espace disque insuffisant/); assert.match(banner, /Rien n’a été supprimé/);
  await page.locator('#observe').click();
  await page.waitForFunction(() => /Espace disque insuffisant/.test(document.querySelector('#notice').textContent));
  assert.equal(await page.evaluate(() => window.tvlens.state()), null, 'No session starts below the disk floor');
  assert.notEqual(await page.locator('#float-record').getAttribute('aria-label'), 'Mettre TVLens en pause', 'Capture did not start');
  assert.equal(await page.locator('#storage-banner').isVisible(), true, 'The banner stays');
  await page.screenshot({ path: '/tmp/tvlens-storage-blocked.png' });
  assert.deepEqual(errors, []);
  await page.evaluate(() => window.__fixtureCleanup?.());
  console.log(JSON.stringify({ result: 'PASS', storage: 'capture refused below the floor, persistent banner, nothing deleted', screenshot: '/tmp/tvlens-storage-blocked.png' }));
} finally {
  await constrained.close();
  if (constrainedData) await fs.rm(constrainedData, { recursive: true, force: true });
}

// Synthetic capture: a moving circle and a tone, in place of a real window.
async function installFixture(page, { firstPassageWithoutFrame = false } = {}) {
  await page.evaluate(withoutFrame => {
    // The case met on a saturated Mac, reproduced on purpose: for the first passage the recorder gets the sound and a
    // video track that delivers no frame. Chromium then writes a WebM header and nothing else (110 bytes).
    if (withoutFrame) {
      const Recorder = window.MediaRecorder; let first = true;
      window.MediaRecorder = class extends Recorder {
        constructor(stream, options) {
          if (!first) return super(stream, options);
          first = false;
          const blank = document.createElement('canvas'); blank.width = 640; blank.height = 360; blank.getContext('2d');
          super(new MediaStream([...blank.captureStream(10).getVideoTracks(), ...stream.getAudioTracks()]), options);
        }
      };
    }
    navigator.mediaDevices.getDisplayMedia = async () => {
      const canvas = document.createElement('canvas'); canvas.width = 640; canvas.height = 360;
      const ctx = canvas.getContext('2d'); let frame = 0;
      const draw = () => { ctx.fillStyle = '#173952'; ctx.fillRect(0, 0, 640, 360); ctx.fillStyle = '#c9ed9b'; ctx.beginPath(); ctx.arc(100 + (frame++ % 300), 180, 45, 0, Math.PI * 2); ctx.fill(); };
      draw(); const timer = setInterval(draw, 80);
      const stream = canvas.captureStream(10);
      const audio = new AudioContext(); const oscillator = audio.createOscillator();
      const gain = audio.createGain(); gain.gain.value = 0.1;
      const dest = audio.createMediaStreamDestination();
      oscillator.connect(gain).connect(dest); oscillator.start(); await audio.resume();
      stream.addTrack(dest.stream.getAudioTracks()[0]);
      window.__fixtureCleanup = () => { clearInterval(timer); oscillator.stop(); audio.close(); };
      return stream;
    };
  }, firstPassageWithoutFrame);
}

// Polls the host through the bridge. The bound follows the question ceiling when a real agent answers.
async function waitState(page,fn,arg){const end=Date.now()+stateTimeoutMs;while(Date.now()<end){if(await page.evaluate(fn,arg))return;await page.waitForTimeout(150);}throw Error('State timeout');}

async function menuClick(page,id){await page.locator('#float-menu-toggle').click();await page.locator('#'+id).click();}
