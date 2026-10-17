const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { pathToFileURL } = require('node:url');
const { describeJob: describeTvJob } = require('../tv/app/companion.js');
const { Surveillance } = require('../core/surveillance.cjs');
const { deferred, turns } = require('./helpers/wait.cjs');
const { rendererHarness } = require('./helpers/mac-renderer.cjs');

// Les modules Mac et leur composition sont importés directement, sans Electron.
const ui = name => import(`../app/ui/${name}.mjs`);
const app = (...parts) => path.join(__dirname, '..', 'app', ...parts);
// Les dernières gardes de contenu ignorent la mise en forme ; les raccords sont exercés par le banc.
const { shape } = require('./helpers/source-shape.cjs');
const shaped = (...parts) => shape(fs.readFileSync(app(...parts), 'utf8'));
const holds = (shapedSource, fragment) => shapedSource.includes(shape(fragment));
const flush = async (turns = 300) => { for (let i = 0; i < turns; i++) await Promise.resolve(); };
const T0 = 1_760_000_000_000;

const insufficient = { answer: 'Je n’ai pas obtenu de preuve suffisante pour répondre.', kind: 'insufficient', citations: [], observations: [], hypotheses: [], limits: ['Résultat limité aux observations déjà obtenues.'] };
const observed = { ...insufficient, answer: 'Un intervenant lève la main.', kind: 'observation', observations: [{ id: 'moment-1', startMs: 0, endMs: 1000, text: 'Un intervenant lève la main.' }] };

test('a running question shows elapsed over its own ceiling, and a queued one its place, from the injected clock', async () => {
  const { describeJob } = await ui('job-view');
  const job = { id: 'deep-2', status: 'running', createdAt: T0 - 5000, startedAt: T0, timeoutMs: 300000, message: 'Recherche des passages…' };
  const view = describeJob(job, { now: T0 + 61000, capturing: true });
  assert.equal(view.clockLabel, '01:01 / 05:00');
  assert.ok(Math.abs(view.progress - 61 / 300) < 1e-9);
  assert.equal(view.statusLine, 'La capture continue · arrêt au plus tard à 5 min. Tu peux ajouter des questions : elles attendent leur tour.');
  assert.deepEqual([view.canCancel, view.cancelLabel, view.message], [true, 'Annuler la recherche', 'Recherche des passages…']);
  // The ceiling is the job's, not a constant of the interface: another value changes every text.
  const short = describeJob({ ...job, timeoutMs: 90000 }, { now: T0 + 61000 });
  assert.deepEqual([short.clockLabel, short.statusLine.includes('90 s'), /5 min|05:00/.test(JSON.stringify(short))], ['01:01 / 01:30', true, false]);
  // A late event never shows more elapsed time than the ceiling.
  assert.equal(describeJob(job, { now: T0 + 400000 }).clockLabel, '05:00 / 05:00');
  // A question saved before the field existed: host configuration when there is one, otherwise no ceiling is claimed.
  const { timeoutMs, ...legacy } = job;
  assert.equal(describeJob(legacy, { now: T0 + 61000, timeoutMs: 120000 }).clockLabel, '01:01 / 02:00');
  const unknown = describeJob(legacy, { now: T0 + 61000 });
  assert.deepEqual([unknown.clockLabel, unknown.progress, unknown.timeoutMs], ['01:01', null, null]);
  assert.ok(!/arrêt au plus tard/.test(unknown.statusLine));

  const queued = describeJob({ id: 'deep-4', status: 'queued', createdAt: T0, timeoutMs: 300000 }, { now: T0 + 400000, queuedIds: ['deep-3', 'deep-4'] });
  assert.deepEqual([queued.phase, queued.queuePosition, queued.queueLabel], ['queued', 2, 'En attente · position 2 sur 2 dans la file.']);
  // Waiting is not charged to the ceiling: no clock runs for a queued question.
  assert.deepEqual([queued.clockLabel, queued.elapsedMs, queued.cancelLabel], [null, null, 'Retirer cette question']);
  assert.match(queued.statusLine, /5 min ne démarre qu’à son tour/);
});

test('a deadline, a technical failure or a cancellation is never presented as insufficient evidence', async () => {
  const { describeJob } = await ui('job-view');
  const timeout = describeJob({ id: 'deep-1', status: 'timeout', createdAt: T0, startedAt: T0, finishedAt: T0 + 300000, timeoutMs: 300000, message: 'Limite de 5 minutes atteinte.', preview: 'Le marxisme est', result: insufficient }, { now: T0 + 300000 });
  assert.deepEqual([timeout.phase, timeout.outcomeLabel, timeout.error], ['failed', 'DÉLAI ATTEINT', 'Limite de 5 minutes atteinte.']);
  // The fallback result of the core is not shown: no answer, no kind, no limit borrowed from it.
  assert.deepEqual([timeout.kind, timeout.kindLabel, timeout.answer, timeout.result, timeout.limits], [null, null, null, null, []]);
  // The interrupted draft is kept, under a label that says what it is.
  assert.deepEqual([timeout.previewLabel, timeout.preview], ['Réponse provisoire interrompue (non validée)', 'Le marxisme est']);
  assert.deepEqual([timeout.canReask, timeout.canCancel, timeout.runMs], [true, false, 300000]);
  // Without a message from the core the wording still comes from the ceiling of the job.
  assert.equal(describeJob({ status: 'timeout', timeoutMs: 120000 }, { now: T0 }).error, 'Délai de 2 min atteint.');
  const error = describeJob({ status: 'error', message: 'Codex n’a pas terminé la réponse.', errorDetail: { authRequired: true, turnStatus: 'failed' }, result: insufficient }, { now: T0 });
  assert.deepEqual([error.outcomeLabel, error.authRequired, error.errorDetail], ['ERREUR TECHNIQUE', true, 'Reconnexion Codex requise · Codex · failed']);
  const cancelled = describeJob({ status: 'cancelled', message: 'Recherche annulée.', result: insufficient }, { now: T0 });
  assert.deepEqual([cancelled.outcomeLabel, cancelled.error, cancelled.answer], ['ANNULÉE', 'Recherche annulée.', null]);
  for (const view of [timeout, error, cancelled]) assert.ok(!/insuffisan/i.test(JSON.stringify(view)), 'no trace of an evidence verdict on a failed question');
  // Real observations gathered before the failure are shown, as partial observations.
  const partial = describeJob({ status: 'timeout', message: 'Limite de 5 minutes atteinte.', result: observed }, { now: T0 });
  assert.deepEqual([partial.kind, partial.kindLabel, partial.answer], ['partial', 'OBSERVATIONS PARTIELLES', 'Un intervenant lève la main.']);
  // The label stays reserved for a completed answer that abstains.
  const abstained = describeJob({ status: 'done', result: insufficient }, { now: T0 });
  assert.deepEqual([abstained.kind, abstained.kindLabel, abstained.error, abstained.canReask], ['insufficient', 'PREUVES INSUFFISANTES', null, false]);
});

test('the Mac and TV view models agree on the meaning of every question state', async () => {
  const { describeJob } = await ui('job-view');
  // The TV wording of each kind is read from the TV itself: the comparison is on meaning, not on vocabulary.
  const tvKinds = new Map(['observation', 'external', 'explanation', 'insufficient', 'other'].map(kind => [describeTvJob({ status: 'done', result: { ...insufficient, kind } }).kindLabel, kind]));
  tvKinds.set(describeTvJob({ status: 'timeout', result: observed }).kindLabel, 'partial').set(null, null);
  assert.equal(tvKinds.size, 7, 'the TV names each kind differently');
  const summary = 'D’après les résumés automatiques :\nLe débat porte sur…';
  const cases = [
    { status: 'error', message: 'Codex n’a pas terminé la réponse : authentification refusée (401).', errorDetail: { authRequired: true, turnStatus: 'failed', turnError: { message: 'workspace routing discovery unauthorized (401)', codexErrorInfo: 'other' } }, provisional: summary, result: insufficient },
    { status: 'error', message: 'Codex n’a pas terminé la réponse.', preview: 'Le marxisme est une théorie', provisional: summary, result: insufficient },
    { status: 'timeout', preview: 'Le marxisme est' },
    { status: 'error', message: 'Codex n’a pas terminé la réponse.', errorDetail: { turnStatus: 'failed', turnError: { code: 'rate_limit' } }, result: insufficient },
    { status: 'error', message: 'Codex n’a pas terminé la réponse.', errorDetail: { turnStatus: 'failed', turnError: { codexErrorInfo: 'responseStreamDisconnected' } } },
    { status: 'error', errorDetail: {} },
    { status: 'timeout', message: 'Limite de 5 minutes atteinte.', result: observed },
    { status: 'cancelled', message: 'Recherche annulée.' },
    { status: 'cancelled' },
    { status: 'done', result: { ...insufficient, answer: 'Je n’ai pas assez d’éléments dans le documentaire.' } },
    { status: 'done', result: { ...insufficient, kind: 'explanation', answer: 'Le marxisme est…' } },
    { status: 'done', result: { ...insufficient, kind: 'external', answer: 'Selon la source…' } },
    { status: 'done', result: { ...insufficient, kind: 'other' } },
    { status: 'done', result: observed },
    { status: 'running', message: 'Recherche sur Internet…', preview: 'Le marxisme' },
    { status: 'running', message: 'Analyse…', preview: 'Le marxisme', provisional: 'Le débat porte sur…' },
    { status: 'queued' },
  ];
  const meaning = (view, kind) => ({ error: view.error, errorDetail: view.errorDetail, authRequired: view.authRequired, kind, answer: view.answer, limits: view.limits,
    preview: view.preview, interruptedPreview: /interrompue/.test(view.previewLabel || ''), provisional: view.provisional, hasProvisionalLabel: Boolean(view.provisionalLabel), message: view.message });
  for (const job of cases) {
    const tv = describeTvJob(job), mac = describeJob(job, { now: T0 });
    assert.ok(tvKinds.has(tv.kindLabel), `unknown TV kind for ${job.status}`);
    assert.deepEqual(meaning(mac, mac.kind), meaning(tv, tvKinds.get(tv.kindLabel)), `${job.status} · ${job.message || job.result?.kind || ''}`);
    if (['error', 'timeout', 'cancelled'].includes(job.status)) assert.notEqual(mac.kind, 'insufficient');
  }
});

test('freshness of a question is shown from what the core measured, and nothing is invented without it', async (t) => {
  const { describeFreshness, describeJob } = await ui('job-view');
  assert.equal(describeFreshness({ id: 'deep-1', status: 'queued', anchorMs: 724000 }), null);
  assert.equal(describeJob({ status: 'done', anchorMs: 724000, result: observed }, { now: T0 }).freshness, null);
  // What was received when the question froze (job.availability): the interval is stated as it was, never widened.
  const frozen = { anchorMs: 724000, availability: { startMs: 0, throughMs: 718000, anchorMs: 724000, passages: 90, lastPassage: { id: 'moment-90', startMs: 710000, endMs: 718000 } } };
  const asked = describeFreshness(frozen);
  assert.equal(asked.label, 'Mémoire disponible jusqu’à 11:58 au moment de l’envoi · question posée à 12:04 · dernier passage reçu : 11:50–11:58.');
  assert.deepEqual([asked.throughMs, asked.lagMs, asked.lastPassage.id], [718000, 6000, 'moment-90']);
  // The analysis state at the effective start completes it when it lags behind.
  const lagging = describeFreshness({ ...frozen, evidenceAtStart: { contextThroughMs: 702000, analyzedThroughMs: 702000, pendingCount: 2, partialCount: 0, unanalyzedTailMs: 22000 } });
  assert.match(lagging.label, /analysée jusqu’à 11:42 · 2 passages encore en analyse\.$/);
  assert.equal(describeFreshness({ anchorMs: 3000, availability: { startMs: 0, throughMs: 0, anchorMs: 3000, passages: 0, lastPassage: null } }).label, 'Aucun passage n’était encore reçu au moment de l’envoi · question posée à 00:03.');
  // A question saved before job.availability existed still says what its metrics know.
  const saved = describeFreshness({ anchorMs: 724000, metrics: { evidence: { anchorMs: 724000, contextThroughMs: 718000, pendingCount: 0, lagAtStartMs: 6000 } } });
  assert.equal(saved.label, 'Mémoire analysée jusqu’à 11:58 pour cette question · question posée à 12:04.');

  // Above a finished answer, one time code. The sentence stays whole on hover (label) and in "Détails du
  // traitement" (detail: without the instant of the question, which that block already states).
  assert.deepEqual([asked.short, asked.detail], ['Mémoire jusqu’à 11:58', 'Mémoire disponible jusqu’à 11:58 au moment de l’envoi · dernier passage reçu : 11:50–11:58.']);
  assert.equal(lagging.detail, 'Mémoire disponible jusqu’à 11:58 au moment de l’envoi · dernier passage reçu : 11:50–11:58 · analysée jusqu’à 11:42 · 2 passages encore en analyse.');
  const shown = (status, extra = {}) => describeJob({ ...frozen, id: 'deep-9', status, createdAt: T0, ...extra }, { now: T0, queuedIds: ['deep-9'] }).freshnessLabel;
  assert.deepEqual([shown('done', { result: observed }), shown('timeout'), shown('error'), shown('cancelled')], Array(4).fill('Mémoire jusqu’à 11:58'));
  // A question that waits or runs keeps the sentence: it is what there is to read meanwhile.
  assert.deepEqual([shown('queued'), shown('running', { startedAt: T0 })], [asked.label, asked.label]);
  // The short form invents nothing either: no passage is said as such, analysed is never passed off as received,
  // and without a measurement there is no label of any length.
  assert.equal(describeFreshness({ anchorMs: 3000, availability: { startMs: 0, throughMs: 0, anchorMs: 3000, passages: 0, lastPassage: null } }).short, 'Aucun passage reçu à l’envoi');
  assert.deepEqual([saved.short, saved.detail], ['Mémoire analysée jusqu’à 11:58', 'Mémoire analysée jusqu’à 11:58 pour cette question.']);
  assert.equal(describeFreshness({ anchorMs: 3000, evidenceAtStart: { contextThroughMs: 0, pendingCount: 1 } }).short, 'Aucun passage analysé');
  assert.deepEqual([describeJob({ status: 'done', anchorMs: 724000, result: observed }, { now: T0 }).freshnessLabel, describeJob({ status: 'running', anchorMs: 724000 }, { now: T0 }).freshnessLabel], [null, null]);
  const f = await rendererHarness(t);
  f.publish('onState', { id: 'session', segments: [], history: [] });
  f.publish('onDeepState', { jobs: [{ ...frozen, id: 'deep-9', sessionId: 'session', status: 'done', createdAt: T0, result: observed }] });
  f.frame();
  const card = f.get('message-list').children[0];
  const fresh = card.querySelectorAll('.job-fresh')[0];
  const answer = card.querySelectorAll('.job-result')[0];
  const details = card.querySelectorAll('.response-details')[0];
  assert.equal(fresh.textContent, asked.short);
  assert.equal(fresh.title, asked.label);
  assert.ok(card.children.indexOf(fresh) < card.children.indexOf(answer), 'freshness before answer');
  assert.equal(details.open || false, false);
  assert.equal(details.querySelectorAll('.job-fresh-detail')[0].textContent, asked.detail);
  assert.equal(details.children[0].textContent, 'Détails du traitement');
});

// A real registry, produced by the surveillance core with scripted ports: the view model is checked against
// the state the hosts actually publish, not against a hand-written copy of it.
async function watchedSession(limits = {}) {
  const h = { clock: T0, elapsedMs: 0, segments: [] };
  const page = id => `https://sources.example/${id}`;
  const claim = (passageId, quote, statement, extra = {}) => ({ passageId, quote, statement, action: 'verify', kind: 'figure', checkable: true, reason: '', sameAs: null, ...extra });
  const script = {
    'moment-1': [claim('moment-1', 'le chômage est à 7 %', 'Selon l’invité, le chômage est à 7 %.'), claim('moment-1', 'la dette atteint 3 000 milliards', 'Selon l’invité, la dette atteint 3 000 milliards d’euros.')],
    'moment-2': [claim('moment-2', 'tout ira mieux demain', 'Selon l’invité, tout ira mieux demain.', { kind: 'other', checkable: false })],
    'moment-3': [claim('moment-3', 'du budget de la défense', 'Ils abordent le budget de la défense.', { action: 'signal', kind: 'other' })],
    'moment-4': [claim('moment-4', 'le taux de pauvreté serait de 14 %', 'Selon l’invité, le taux de pauvreté est de 14 %.')],
    'moment-5': [claim('moment-5', 'la croissance atteindrait 2 %', 'Selon l’invité, la croissance atteindra 2 %.'), claim('moment-5', 'une inflation de 4 %', 'Selon l’invité, l’inflation sera de 4 %.')],
  };
  const text = { 'moment-1': 'Il affirme que le chômage est à 7 % et que la dette atteint 3 000 milliards.', 'moment-2': 'Il promet que tout ira mieux demain pour tout le monde.',
    'moment-3': 'Ils parlent maintenant du budget de la défense.', 'moment-4': 'Selon lui le taux de pauvreté serait de 14 % cette année.', 'moment-5': 'Il annonce que la croissance atteindrait 2 % avec une inflation de 4 % ensuite.' };
  const source = id => ({ url: page(id), title: `Publication ${id}`, publisher: 'Institut', publishedAt: '2026-08-14', evidence: 'La publication donne le même ordre de grandeur.', relation: 'supports' });
  const researcher = { verify: request => {
    const ids = request.claims.map(c => c.id);
    if (ids.includes('claim-5')) return Promise.reject(new Error('Recherche indisponible.'));
    if (ids.includes('claim-6')) return new Promise(() => {});
    // claim-2 cites a page that was never opened: its "supported" is demoted to undetermined by the core.
    return Promise.resolve({ summary: '', verdicts: ids.map(id => ({ claimId: id, assessment: 'supported', conclusion: `Les sources consultées donnent le même chiffre pour ${id}.`, sources: [source(id)], limitations: [] })),
      research: { webSearches: 2, openedUrls: [page('claim-1')], elapsedMs: 1 } });
  } };
  h.surveillance = new Surveillance({ detector: { detect: async request => ({ claims: request.passages.flatMap(p => script[p.id] || []) }) }, researcher, now: () => h.clock,
    limits: { visionGraceMs: 0, detectBatchPassages: 1, verifyRetries: 0, ...limits } });
  h.snapshot = () => ({ id: 'session-mac', elapsedMs: h.elapsedMs, history: [], segments: h.segments });
  h.surveillance.start({ instruction: 'Vérifie les chiffres annoncés.' }, h.snapshot());
  for (let n = 1; n <= 5; n++) {
    h.segments.push({ id: `moment-${n}`, startMs: (n - 1) * 8000, endMs: n * 8000, status: 'ready', audioStatus: 'ready', visionStatus: 'ready', available: true, observation: { transcript: text[`moment-${n}`], summary: '', visual: '', uncertainty: '' } });
    h.elapsedMs = n * 8000; h.clock += 8000;
    h.surveillance.observe(h.snapshot());
    await flush();
  }
  return h;
}

test('one card per sourced lot, a signal drawn apart, and everything undetermined kept in the history only', async () => {
  const { describeSurveillance, describeCard } = await ui('surveillance-view');
  const h = await watchedSession(), state = h.surveillance.snapshot(), session = { id: 'session-mac', readOnly: false };
  assert.deepEqual(state.claims.map(c => c.status), ['sourced', 'undetermined', 'undetermined', 'noted', 'error', 'running', 'running']);
  const view = describeSurveillance(state, { session });
  // Four lots exist (sourced, signal, failed, running): only the sourced one and the signal are results.
  assert.equal(state.totals.lots, 4);
  assert.deepEqual(view.results.map(card => [card.id, card.kind]).sort(), [['lot-1', 'verification'], ['lot-2', 'signal']]);
  // Contract 5.3: the bottom-left stack is for sourced results. A signal stays in the panel and in the history,
  // and nothing puts it on screen by itself: not the default, not an option, not a host that would misfile it.
  assert.deepEqual(view.cards.map(card => [card.id, card.kind]), [['lot-1', 'verification']]);
  for (const options of [{ showSignals: true }, { showSignals: false }]) {
    const same = describeSurveillance(state, { session, ...options });
    assert.deepEqual([same.cards.map(card => card.kind), same.results.map(card => card.kind).sort()], [['verification'], ['signal', 'verification']], 'no setting moves a signal');
  }
  const misfiled = describeSurveillance({ ...state, overlay: { ...state.overlay, cards: [...state.overlay.cards, ...state.signals.cards] } }, { session });
  assert.deepEqual(misfiled.cards.map(card => card.kind), ['verification']);
  const { CardQueue } = await ui('card-queue');
  const stack = new CardQueue();
  stack.offer(view.cards, { sessionId: state.sessionId, now: h.clock });
  assert.deepEqual(stack.visible(h.clock).map(card => card.kind), ['verification']);
  const verification = view.results.find(card => card.kind === 'verification'), signal = view.results.find(card => card.kind === 'signal');
  // Sourced: two or three sentences, the video origin with its time code, sources opened by lot and index.
  assert.equal(verification.label, 'Sources consultées');
  assert.ok(verification.text.length > 20 && verification.text.length <= 420);
  assert.deepEqual(verification.items.map(item => [item.claimId, item.passageId, item.timeLabel, item.assessmentLabel]), [['claim-1', 'moment-1', '00:00', 'Concorde avec les sources']]);
  assert.deepEqual(verification.sources.map(s => [s.index, s.title, s.meta, s.relationLabel]), [[0, 'Publication claim-1', 'Institut · 2026-08-14', 'appuie']]);
  assert.deepEqual([verification.intervalLabel, verification.key], ['00:00–00:08', 'session-mac:verification:lot-1']);
  // Signal: its own label and interval, a quote, and by construction neither source nor assessment.
  assert.deepEqual([signal.label, signal.intervalLabel, signal.sources.length, signal.note], ['Repéré dans la vidéo', '00:16–00:24', 0, 'Relevé dans la vidéo, sans vérification sur le web.']);
  assert.deepEqual(signal.items.map(item => [item.quote, item.assessmentLabel]), [['du budget de la défense', null]]);
  const forged = describeCard({ ...state.signals.cards[0], sources: verification.sources.map(s => ({ ...s, url: 'https://x.example' })), assessments: [{ claimId: 'claim-4', assessment: 'supported' }] });
  assert.deepEqual([forged.kind, forged.sources, forged.items[0].assessmentLabel], ['signal', [], null]);
  // A verification without a source is not a card, whatever it claims.
  assert.equal(describeCard({ ...state.overlay.cards[0], sources: [] }), null);
  assert.equal(describeCard({ ...state.lots.find(lot => lot.id === 'lot-3') }), null);
  // Nor is a lot that has not finished, even carrying sources: only a settled result is shown.
  assert.equal(describeCard({ ...state.lots.find(lot => lot.id === 'lot-1'), status: 'running' }), null);
  // No true/false badge anywhere: the wording is about the sources.
  assert.ok(!/\b(vrai|faux|true|false)\b/i.test(JSON.stringify([view.results.map(({ key, ...card }) => card), view.history.rows.map(row => [row.stateLabel, row.assessmentLabel, row.reason])])));

  // History: every claim, whatever its state, with its video origin; nothing detected is dropped.
  assert.deepEqual(view.history.rows.map(row => [row.id, row.state]), [['claim-7', 'running'], ['claim-6', 'running'], ['claim-5', 'error'], ['claim-4', 'noted'], ['claim-3', 'undetermined'], ['claim-2', 'undetermined'], ['claim-1', 'sourced']]);
  assert.equal(view.untracked, 0);
  assert.ok(view.history.rows.every(row => row.passageId && row.timeLabel && row.quote));
  const shown = new Set([...view.results, ...view.cards].flatMap(card => card.items.map(item => item.claimId)));
  const undetermined = view.history.rows.filter(row => row.state === 'undetermined');
  assert.deepEqual(undetermined.map(row => [row.stateLabel, row.reason, shown.has(row.id)]), [
    ['Indéterminée', 'Affirmation qui ne se vérifie pas par une recherche.', false], ['Indéterminée', 'Les sources proposées n’ont pas pu être confirmées.', false]]);
  const failed = view.history.rows.find(row => row.state === 'error');
  assert.deepEqual([failed.stateLabel, failed.error, failed.canRetry, shown.has(failed.id)], ['Erreur', 'Recherche indisponible.', true, false]);
  assert.deepEqual(view.history.rows.find(row => row.id === 'claim-4').stateLabel, 'Relevée');
  assert.equal(describeSurveillance(state, { session, filter: 'undetermined' }).history.rows.length, 2);

  // Stopped: nothing is lost, the unfinished ones say why, and a retry is no longer offered.
  h.surveillance.stop('Surveillance arrêtée.');
  const stopped = describeSurveillance(h.surveillance.snapshot(), { session });
  assert.deepEqual(stopped.history.rows.slice(0, 2).map(row => [row.state, row.reason, row.canRetry]), [['cancelled', 'Surveillance arrêtée.', false], ['cancelled', 'Surveillance arrêtée.', false]]);
  assert.deepEqual([stopped.history.rows.length, stopped.chip.visible, stopped.form.startLabel, stopped.results.length], [7, false, 'Démarrer la surveillance', 2]);
  // The state of another session is never shown as this session's surveillance.
  assert.deepEqual([describeSurveillance(state, { session: { id: 'another' } }).status, describeSurveillance(null, { session }).status], ['off', 'off']);
  assert.equal(describeSurveillance(state, { session: { id: 'session-mac', readOnly: true } }).form.canStart, false);
});

test('lateness shows on the tab with the number waiting, and counts and bounds come from totals', async () => {
  const { describeSurveillance } = await ui('surveillance-view');
  const h = await watchedSession({ stateClaims: 2 }), session = { id: 'session-mac', readOnly: false };
  const calm = describeSurveillance(h.surveillance.snapshot(), { session });
  assert.deepEqual([calm.status, calm.chip.text, calm.badge.tone, calm.badge.count], ['verifying', 'Surveillance · vérification en cours', 'new', 2]);
  // The tab counts what is new in the panel, signal included (one sourced lot, one signal); seen results no longer count.
  assert.deepEqual([calm.badge.label, calm.cards.map(card => card.kind)], ['2 nouveaux résultats', ['verification']]);
  assert.deepEqual([describeSurveillance(h.surveillance.snapshot(), { session, seen: { overlay: 1, signal: 0 } }).badge.count, describeSurveillance(h.surveillance.snapshot(), { session, seen: { overlay: 0, signal: 1 } }).badge.count], [1, 1]);
  assert.deepEqual([describeSurveillance(h.surveillance.snapshot(), { session, seen: { overlay: 1, signal: 1 } }).badge.tone, describeSurveillance(h.surveillance.snapshot(), { session, seen: { overlay: 1, signal: 1 } }).badge.count], ['active', 0]);
  // The two running verifications never answer: after the core's own delay the surveillance is late.
  h.clock += 100000; h.surveillance.tick();
  const state = h.surveillance.snapshot(), late = describeSurveillance(state, { session });
  assert.deepEqual([state.activity.state, state.backlog.reason], ['late', 'verification']);
  assert.deepEqual([late.status, late.badge.visible, late.badge.tone, late.chip.late], ['late', true, 'late', true]);
  assert.equal(late.chip.text, `Surveillance en retard · ${state.backlog.claimsWaiting} affirmation${state.backlog.claimsWaiting > 1 ? 's' : ''} en attente`);
  assert.match(late.badge.label, /^Surveillance en retard : \d+ affirmations? en attente$/);
  // The pushed list is bounded (two here); the counters are the real ones and the bound is said.
  assert.equal(state.claims.length, 2);
  assert.equal(late.history.countsLine, '6 affirmations suivies · 1 sourcée · 2 en cours · 2 indéterminées · 1 en erreur · 1 signalement');
  assert.deepEqual(late.history.filters.map(filter => [filter.key, filter.count]), [['all', 7], ['running', 2], ['sourced', 1], ['undetermined', 2], ['error', 1], ['noted', 1]]);
  assert.deepEqual([late.history.rows.length, late.history.bound.shown, late.history.bound.total, late.history.bound.label], [2, 2, 7, '2 éléments les plus récents affichés sur 7.']);
  // With the registry (panel open) everything is there and nothing is said to be missing.
  const complete = describeSurveillance(state, { session, registry: h.surveillance.snapshot({ full: true }) });
  assert.deepEqual([complete.history.rows.length, complete.history.bound.label, complete.untracked], [7, null, 0]);
  const limited = limit => describeSurveillance(state, { session, registry: h.surveillance.snapshot({ full: true }), historyLimit: limit }).history;
  assert.deepEqual([limited(3).hiddenByLimit, limited(3).moreLabel, limited(6).hiddenByLimit, limited(6).moreLabel], [4, 'Afficher les 4 plus anciens', 1, 'Afficher le plus ancien']);
  // The light state polled every second has no list: cards and counters still work, the history says it is loading.
  const brief = describeSurveillance(h.surveillance.snapshot({ brief: true }), { session });
  assert.deepEqual([brief.history.rows.length, brief.history.bound.total, brief.history.bound.label, brief.results.length, brief.history.empty], [0, 7, 'Chargement de l’historique (7 éléments)…', 2, null]);
});

test('a saved history still being read is told as a restoration, and a history kept in memory only gets a discreet notice: both in the words of the state',
  async (t) => {
  const { describeSurveillance, isRestoring } = await ui('surveillance-view');
  const { createSurveillanceRuntime, REGISTRY_MESSAGES } = require('../runtime/surveillance-runtime.cjs');
  const { SimulatedSurveillanceAgent } = require('../adapters/simulated-surveillance-agent.cjs');
  // The states are those both hosts publish, from the shared runtime, over a session folder that answers on demand.
  const session = { id: 'session-mac', readOnly: false };
  let answer;
  const store = { saveSurveillance: async () => {}, loadSurveillance: () => new Promise(resolve => { answer = resolve; }) };
  const watch = { snapshot: () => ({ id: 'session-mac', elapsedMs: 12000, history: [], segments: [] }) };
  const runtime = createSurveillanceRuntime({ getSession: () => ({ watch, store }), agent: new SimulatedSurveillanceAgent(), now: () => T0 });
  const reading = runtime.start({ instruction: 'Vérifie les chiffres annoncés.' }), restoring = describeSurveillance(reading, { session });
  assert.deepEqual([reading.activity.state, reading.registry.status], ['restoring', 'restoring']);
  // Its own state, worded by the core: neither late, nor a check in progress, nor a surveillance already listening.
  assert.deepEqual([restoring.status, restoring.chip.state, restoring.chip.text, restoring.chip.late, restoring.chip.waiting], ['restoring', 'restoring', 'Surveillance · restauration du suivi enregistré', false, 0]);
  assert.deepEqual([restoring.badge.tone, restoring.badge.label, restoring.badge.count], ['active', 'Surveillance · restauration du suivi enregistré', 0]);
  assert.deepEqual([restoring.activity.text, restoring.activity.detail, restoring.activity.error, restoring.notice, restoring.history.empty], ['Restauration du suivi enregistré…', 'Depuis 00:12 de la vidéo', null, null, 'Restauration du suivi enregistré…']);
  assert.deepEqual([restoring.registry, restoring.instruction, restoring.form.canStop], [{ status: 'restoring', ready: false, persisted: false }, 'Vérifie les chiffres annoncés.', true]);
  assert.ok(!/retard|vérification en cours|écoute|Rien de relevé|Aucun résultat/.test(JSON.stringify(restoring)));
  // The empty results list says the same thing, and the window knows that nothing shown is final yet.
  assert.deepEqual([restoring.resultsEmpty, isRestoring(reading), restoring.chip.unread], ['Restauration du suivi enregistré…', true, 0]);

  // The folder holds the registry of another session: the surveillance goes on, unsaved, and the window says so.
  await flush();
  answer({ version: 1, sessionId: 'une-autre-session', claims: [], lots: [] });
  const state = await runtime.ready(), unsaved = describeSurveillance(state, { session });
  const message = 'Registre de surveillance existant illisible : l’historique précédent n’est ni repris ni remplacé. Historique en mémoire seulement : il ne sera pas enregistré dans cette session.';
  assert.deepEqual([state.registry.status, state.registry.message, state.activity.state], ['unreadable', message, 'listening']);
  // The activity stays what it is: a history that is not saved is neither a delay nor an activity of its own.
  assert.deepEqual([unsaved.status, unsaved.chip.text, unsaved.chip.late, unsaved.badge.tone, unsaved.activity.text], ['listening', 'Surveillance · écoute', false, 'active', 'Surveillance active.']);
  assert.deepEqual([unsaved.notice, unsaved.registry], [{ tone: 'warning', text: message }, { status: 'unreadable', ready: true, persisted: false }]);
  // Without a place of its own the notice is read on the activity line, once: the core gives the same cause as its error.
  assert.deepEqual([state.error !== null && message.startsWith(state.error), unsaved.activity.error, describeSurveillance(state, { session, banner: true }).activity.error], [true, message, null]);
  assert.equal(describeSurveillance({ ...state, error: 'Erreur interne de surveillance.' }, { session }).activity.error, `${message} Erreur interne de surveillance.`);
  // Said for as long as the state says it, stopped included; and nothing ever invites to remove the file.
  const stopped = describeSurveillance(runtime.stop('Surveillance arrêtée.'), { session });
  assert.deepEqual([stopped.status, stopped.notice?.text, stopped.chip.visible], ['stopped', message, false]);
  assert.ok(!/supprim|effac/i.test(JSON.stringify([unsaved, stopped])));
  // A host that says nothing about the registry: nothing is claimed about it.
  const { registry: unused, ...older } = state;
  assert.deepEqual([describeSurveillance(older, { session }).notice, describeSurveillance(older, { session }).registry, describeSurveillance(older, { session }).activity.error], [null, null, state.error]);
  assert.deepEqual([isRestoring(state), isRestoring(older), isRestoring(null)], [false, false, false]);

  // The window draws the notice in a banner of its own (banner: true): for every way a history can be unsaved,
  // the sentence of the state as it is, once, and never while the registry is saved or still being read.
  const kept = (status, text) => describeSurveillance({ ...state, error: null, registry: { ready: status !== 'restoring', persisted: status === 'ready', status, message: text } }, { session, banner: true });
  for (const [status, text] of [['memory-only', REGISTRY_MESSAGES['memory-only']], ['memory-only', REGISTRY_MESSAGES.slow], ['unreadable', REGISTRY_MESSAGES.unreadable], ['write-failed', REGISTRY_MESSAGES['write-failed']]]) {
    const view = kept(status, text);
    assert.deepEqual([view.notice, view.activity.error, view.registry, view.status], [{ tone: 'warning', text }, null, { status, ready: true, persisted: false }, 'listening'], status);
    assert.ok(text.length > 20 && !/supprim|effac/i.test(text), 'no sentence of the state invites to remove the registry');
  }
  assert.deepEqual([kept('ready', null).notice, kept('restoring', REGISTRY_MESSAGES.restoring).notice, kept('restoring', REGISTRY_MESSAGES.restoring).status], [null, null, 'restoring']);
  // An unsaved history without a sentence from the host still raises the notice: the state decides, not the wording.
  for (const text of [null, undefined, '  ']) assert.deepEqual([kept('memory-only', text).notice?.tone, /non enregistré/.test(kept('memory-only', text).notice?.text), /supprim|effac/i.test(kept('memory-only', text).notice?.text)], ['warning', true, false]);
  // The banner itself: a plain banner among the others, hidden without a notice, its text set from the view model,
  // and nothing to click in it.
  // The page is read tag by tag and attribute by attribute: neither their order nor their line breaks are checked.
  const page = fs.readFileSync(app('index.html'), 'utf8');
  const attributesOf = tag => Object.fromEntries([...tag.replace(/^<\w+|\/?>$/g, '').matchAll(/([^\s=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'))?/g)]
    .map(match => [match[1], match[2] ?? match[3] ?? '']));
  const tags = [...page.matchAll(/<div\b[^>]*>/g)].map(match => ({ at: match.index, attributes: attributesOf(match[0]) }));
  const container = tags.find(tag => tag.attributes.id === 'banners'), notice = tags.find(tag => tag.attributes.id === 'watch-notice');
  assert.ok(container && notice && container.at < notice.at, 'a banner among the others');
  assert.deepEqual(Object.keys(notice.attributes).sort(), ['class', 'hidden', 'id', 'role']);
  assert.deepEqual([notice.attributes.class, notice.attributes.role, notice.attributes.hidden], ['banner', 'status', '']);
  const banner = page.slice(notice.at).match(/^[\s\S]*?<\/div>/)[0];
  const spans = [...banner.matchAll(/<span\b[^>]*>\s*<\/span\s*>/g)].map(match => attributesOf(match[0].slice(0, match[0].indexOf('>') + 1)));
  assert.ok(spans.some(attributes => Object.keys(attributes).join() === 'id' && attributes.id === 'watch-notice-text'), 'the text of the notice');
  assert.ok(!/<button|<a\b|supprim|effac/i.test(banner), 'nothing to click in the notice');
  const main = page.search(/<main[\s>]/);
  assert.ok(main >= 0 && notice.at < main, 'above every view');
  const f = await rendererHarness(t);
  f.publish('onState', { ...session, segments: [], history: [] });
  assert.equal(typeof f.listeners.get('onSurveillance'), 'function', 'surveillance subscribed');
  for (const registryStatus of ['memory-only', 'unreadable', 'write-failed', 'ready', 'restoring']) {
    const text = REGISTRY_MESSAGES[registryStatus] || null;
    f.publish('onSurveillance', { ...state, registry: { status: registryStatus,
      ready: registryStatus !== 'restoring', persisted: registryStatus === 'ready', message: text } });
    f.frame();
    const visible = !['ready', 'restoring'].includes(registryStatus);
    assert.equal(f.get('watch-notice').hidden, !visible);
    if (visible) {
      assert.equal(f.get('watch-notice-text').textContent, text);
      assert.equal(f.get('watch-activity').textContent.includes(text), false, 'notice is not repeated in activity');
    }
  }
  f.publish('onState', { id: 'badge-session', history: [], segments: [] });
  f.publish('onSurveillance', { ...state, sessionId: 'badge-session', overlay: { seq: 0 }, signals: { seq: 0 }, registry: { ready: false } });
  f.frame();
  f.publish('onSurveillance', { ...state, sessionId: 'badge-session', overlay: { seq: 7 }, signals: { seq: 2 }, registry: { ready: true } });
  f.frame();
  assert.equal(f.badges.at(-1).count, 0, 'first ready history is the badge reference');
  f.publish('onSurveillance', { ...state, sessionId: 'badge-session', overlay: { seq: 8 }, signals: { seq: 3 }, registry: { ready: true } });
  f.frame();
  assert.equal(f.badges.at(-1).count, 2);
  await runtime.close();
});

// The states of a surveillance as the tab badge sees them: what a session already holds when it first shows is not news.
const ready = (sessionId, overlay, signal) => ({
  sessionId, activity: { state: 'listening' }, overlay: { seq: overlay }, signals: { seq: signal }, registry: { ready: true },
});
const restoring = sessionId => ({
  sessionId, activity: { state: 'restoring' }, overlay: { seq: 0 }, signals: { seq: 0 }, registry: { ready: false },
});
const nothingSeen = { seen: { overlay: 0, signal: 0 }, seenFor: undefined };

test('the reference of the tab badge is the first ready state of a session, and a state still restoring does not give it', async () => {
  const { nextSeen } = await ui('surveillance-view');
  // A new session that is ready: what it holds is the reference, and the session is retained.
  assert.deepEqual(nextSeen(nothingSeen, ready('a', 4, 2)), { seen: { overlay: 4, signal: 2 }, seenFor: 'a' });
  // A state still restoring holds nothing final: the reference is at zero and the session is not retained...
  const waiting = nextSeen(nothingSeen, restoring('a'));
  assert.deepEqual(waiting, { seen: { overlay: 0, signal: 0 }, seenFor: undefined });
  // ...so the next state, ready, takes the reference.
  assert.deepEqual(nextSeen(waiting, ready('a', 3, 1)), { seen: { overlay: 3, signal: 1 }, seenFor: 'a' });
  // A state of the session already retained changes nothing, whatever it holds.
  const retained = { seen: { overlay: 1, signal: 0 }, seenFor: 'a' };
  assert.deepEqual(nextSeen(retained, ready('a', 9, 9)), retained);
  assert.deepEqual(nextSeen(retained, restoring('a')), retained);
  // Another session starts again; if it is still restoring, the one retained stays until its own history is read.
  assert.deepEqual(nextSeen(retained, ready('b', 5, 0)), { seen: { overlay: 5, signal: 0 }, seenFor: 'b' });
  assert.deepEqual(nextSeen(retained, restoring('b')), { seen: { overlay: 0, signal: 0 }, seenFor: 'a' });
});

test('a restored history is not news: the header count waits for a ready registry, then counts what comes after', async () => {
  const { nextSeen, describeSurveillance } = await ui('surveillance-view');
  // The saved history holds seven results: restoring (numbers at zero, twice), then ready with those seven, again
  // seven, then an eighth. Only the eighth is new.
  const states = [restoring('a'), restoring('a'), ready('a', 7, 0), ready('a', 7, 0), ready('a', 8, 0)];
  let reference = nothingSeen;
  const counts = states.map(state => {
    reference = nextSeen(reference, state);
    return describeSurveillance({ ...state, enabled: true, activation: { t0Ms: 0 } }, { seen: reference.seen }).badge.count;
  });
  assert.deepEqual(counts, [0, 0, 0, 0, 1]);
});

test('a reading that fails is told as a failed reading, with the passages left unread, never as claims waiting', async () => {
  const { describeSurveillance } = await ui('surveillance-view');
  const session = { id: 'session-mac', readOnly: false };
  // The real core again, with a detector that fails on the passages named in `down`.
  async function reading(down, passages, later = 0) {
    const h = { clock: T0, elapsedMs: 0, segments: [] };
    const surveillance = new Surveillance({ now: () => h.clock, limits: { visionGraceMs: 0, detectBatchPassages: 1, detectRetries: 0 }, researcher: { verify: () => new Promise(() => {}) },
      detector: { detect: async request => { if (request.passages.some(p => down.includes(p.id))) throw new Error('Codex indisponible (401).'); return { claims: [] }; } } });
    const snapshot = () => ({ id: 'session-mac', elapsedMs: h.elapsedMs, history: [], segments: h.segments });
    surveillance.start({ instruction: 'Vérifie les chiffres annoncés.' }, snapshot());
    for (let n = 1; n <= passages; n++) {
      h.segments.push({ id: `moment-${n}`, startMs: (n - 1) * 8000, endMs: n * 8000, status: 'ready', audioStatus: 'ready', visionStatus: 'ready', available: true, observation: { transcript: 'Il affirme que le chômage est à 7 % cette année.', summary: '', visual: '', uncertainty: '' } });
      h.elapsedMs = n * 8000; h.clock += 8000;
      surveillance.observe(snapshot()); await flush(); surveillance.tick(); await flush();
    }
    if (later) { h.clock += later; surveillance.tick(); await flush(); }
    return surveillance.snapshot();
  }
  // Provider down: three passages given up, and not one claim waiting. The chip and the tab say the former.
  const down = await reading(['moment-1', 'moment-2', 'moment-3'], 3), failing = describeSurveillance(down, { session });
  assert.deepEqual([down.activity.state, down.backlog.reason, down.backlog.claimsWaiting, down.backlog.passagesFailed], ['late', 'detection-failed', 0, 3]);
  assert.deepEqual([failing.status, failing.chip.late, failing.chip.waiting, failing.badge.visible, failing.badge.tone], ['late', true, 3, true, 'late']);
  assert.equal(failing.chip.text, 'Surveillance · lecture des passages en échec : 3 passages non lus');
  assert.equal(failing.badge.label, failing.chip.text);
  assert.equal(failing.activity.text, 'Lecture des passages en échec : 3 passages non lus.');
  // Reading works again, one passage stays unread: still told, in the words of the core.
  const back = await reading(['moment-2'], 4), restored = describeSurveillance(back, { session });
  assert.deepEqual([back.backlog.reason, back.backlog.passagesFailed, back.activity.label], ['detection-failed', 1, 'Lecture rétablie : 1 passage n’a pas pu être lu.']);
  assert.deepEqual([restored.chip.text, restored.chip.waiting], ['Surveillance · lecture rétablie : 1 passage n’a pas pu être lu', 1]);
  // A state without the core's sentence is worded from the figures; a cause this window does not know, from the sentence.
  const bare = failed => describeSurveillance({ ...down, activity: { ...down.activity, label: undefined }, backlog: { ...down.backlog, passagesFailed: failed } }, { session }).chip.text;
  assert.deepEqual([bare(3), bare(1), bare(0)], ['Surveillance · lecture des passages en échec : 3 passages non lus', 'Surveillance · lecture des passages en échec : 1 passage non lu', 'Surveillance · lecture des passages en échec']);
  const quota = { ...down.backlog, reason: 'quota', passagesFailed: 0 };
  const unknown = describeSurveillance({ ...down, backlog: quota, activity: { ...down.activity, label: 'Lecture suspendue : quota atteint.' } }, { session });
  assert.deepEqual([unknown.chip.text, unknown.badge.label, unknown.chip.waiting], ['Surveillance · lecture suspendue : quota atteint', 'Surveillance · lecture suspendue : quota atteint', 0]);
  assert.equal(describeSurveillance({ ...down, backlog: quota, activity: { ...down.activity, label: '' } }, { session }).chip.text, 'Surveillance en retard');
  for (const view of [failing, restored, unknown]) assert.ok(!/affirmation/.test(view.chip.text + view.badge.label), 'no count of claims for a cause that has none');

  // Once the core's delay is over the surveillance listens again, and the passage given up stays unread for good:
  // the chip keeps saying so. Nothing is late any more: the tab stays calm and the panel lists the passage.
  const calm = await reading(['moment-2'], 4, 100000), after = describeSurveillance(calm, { session });
  assert.deepEqual([calm.activity.state, calm.backlog.reason, calm.backlog.late, calm.backlog.passagesFailed], ['listening', null, false, 1]);
  assert.deepEqual([after.status, after.chip.text, after.chip.late, after.chip.unread, after.badge.tone, after.gaps.total], ['listening', 'Surveillance · écoute · 1 passage non lu', false, 1, 'active', 1]);
  // Whatever it is doing, agreed in number; nothing is added when nothing was given up.
  const busy = (activity, failed) => describeSurveillance({ ...calm, activity: { ...calm.activity, state: activity }, backlog: { ...calm.backlog, passagesFailed: failed } }, { session }).chip;
  assert.deepEqual([busy('listening', 0).text, busy('detecting', 2).text, busy('verifying', 2).text, busy('listening', 0).unread],
    ['Surveillance · écoute', 'Surveillance · lecture des nouveaux passages · 2 passages non lus', 'Surveillance · vérification en cours · 2 passages non lus', 0]);
  // Late for another cause: that cause first, then the passages left unread. Late because of them: said once.
  assert.equal(describeSurveillance({ ...down, backlog: { ...down.backlog, reason: 'verification', claimsWaiting: 2 } }, { session }).chip.text, 'Surveillance en retard · 2 affirmations en attente · 3 passages non lus');
  assert.equal(describeSurveillance({ ...down, backlog: { ...quota, passagesFailed: 3 }, activity: { ...down.activity, label: 'Lecture suspendue : quota atteint.' } }, { session }).chip.text, 'Surveillance · lecture suspendue : quota atteint · 3 passages non lus');
  assert.equal([...failing.chip.text.matchAll(/non lus?/g)].length, 1);
  // Stopped: no chip at all; the history and the panel keep the passage.
  const off = describeSurveillance({ ...calm, enabled: false, activity: { ...calm.activity, state: 'stopped' } }, { session });
  assert.deepEqual([off.chip.visible, off.chip.text, off.gaps.total], [false, '', 1]);
});

test('sessions: a session being captured cannot be deleted, an old archive is text only, storage says low or blocked', async () => {
  const { describeSessions, describeStorage, describeDeletion, describeArchive, mediaNote, unavailableNote, retentionNote, sessionRetention, describeMemory } = await ui('sessions-view');
  const GB = 1024 ** 3, at = Date.UTC(2026, 9, 12, 21, 4);
  const summary = (id, extra = {}) => ({ id, title: 'Session du 12 oct. 2026, 21:04', firstTopic: 'Budget', host: 'mac', createdAt: at, updatedAt: at + 5520000, closedAt: at + 5520000, state: 'archived',
    elapsedMs: 5520000, passages: 690, media: { stored: 690, missing: 0, bytes: 1.2 * GB }, legacy: false, ...extra });
  const library = { current: { id: 'live', readOnly: false, accepting: true }, storage: { sessions: 4, bytes: 3.4 * GB, freeBytes: 11 * GB, minFreeBytes: GB, warnFreeBytes: 2 * GB, state: 'ok' },
    sessions: [summary('live', { state: 'live', current: true, capturing: true }), summary('kept'), summary('partial', { media: { stored: 600, missing: 90, bytes: GB } }),
      summary('old', { legacy: true, media: { stored: 0, missing: 70, bytes: 0 }, passages: 70, elapsedMs: 600000 }), summary('cut', { state: 'interrupted' }), summary('broken', { state: 'unreadable', passages: 0, media: { stored: 0, missing: 0, bytes: 0 } })] };
  const view = describeSessions(library, { timeZone: 'UTC' });
  const row = id => view.rows.find(item => item.id === id);
  // The session being captured: neither deleted nor swapped for another one.
  assert.deepEqual([row('live').status, row('live').canDelete, row('live').deleteBlockedReason], ['En cours de capture', false, 'Mets la capture en pause avant de supprimer cette session.']);
  assert.deepEqual([row('kept').canOpen, row('kept').openBlockedReason, row('kept').canDelete], [false, 'Mets la capture en pause avant d’ouvrir une autre session.', true]);
  assert.deepEqual([row('kept').meta, row('kept').dateLabel, row('kept').media.label], ['1 h 32 · 690 passages · 1,2 Go', '12 oct. 22:36', 'Vidéo complète']);
  assert.deepEqual([row('partial').media.label, row('partial').media.hint], ['Vidéo partielle', '90 passages sans vidéo.']);
  assert.deepEqual([row('old').media.label, row('old').meta], ['Texte seul', '10 min · 70 passages · 0 o']);
  assert.match(row('old').media.hint, /avant la conservation des vidéos/);
  assert.deepEqual([row('cut').status, row('broken').canOpen, row('broken').canDelete, row('broken').media.label], ['Interrompue', false, true, 'Illisible']);
  // Once paused, the loaded session can be deleted and the others opened; opening is never a capture.
  const paused = describeSessions({ ...library, current: { id: 'live', readOnly: false, accepting: false }, sessions: library.sessions.map(s => ({ ...s, capturing: false })) }, { timeZone: 'UTC' });
  assert.deepEqual([paused.rows[0].status, paused.rows[0].canDelete, paused.rows[1].canOpen, paused.rows[0].canResume], ['Ouverte · en pause', true, true, false]);
  const reopened = describeSessions({ ...library, current: { id: 'kept', readOnly: true, accepting: false }, sessions: [summary('kept', { current: true, readOnly: true, capturing: false })] }, { timeZone: 'UTC' });
  assert.deepEqual([reopened.rows[0].status, reopened.rows[0].canResume, reopened.rows[0].canOpen], ['Ouverte · lecture seule', true, false]);
  assert.match(describeSessions({ current: null, sessions: [] }).empty, /Aucune session enregistrée/);

  // The confirmation says what goes and what stays.
  const deletion = describeDeletion(row('kept'));
  assert.equal(deletion.removed, 'Seront effacés de ce Mac : la vidéo et le son de 690 passages (1,2 Go), les transcriptions, le résumé, les questions et leurs réponses, les résultats de surveillance.');
  assert.equal(deletion.kept, 'Ne seront pas effacés : les moments gardés et les anciennes vérifications.');
  assert.ok(!describeDeletion(row('old')).removed.includes('vidéo'), 'a text-only archive has no video to announce');

  // Storage: every figure comes from the data, and nothing is ever said to be deleted.
  assert.deepEqual([view.storage.state, view.storage.banner, view.storage.line], ['ok', null, 'Sessions : 3,4 Go · 11 Go libres sur ce Mac']);
  const low = describeStorage({ state: 'low', freeBytes: 1.6 * GB, minFreeBytes: GB, sessionBytes: 1.2 * GB, remainingMinutes: 42 });
  assert.deepEqual([low.banner.state, low.banner.text, low.blocked], ['low', '1,6 Go libres : la capture s’arrêtera sous 1 Go. Rien n’est supprimé automatiquement.', false]);
  assert.equal(low.line, 'Cette session : 1,2 Go · 1,6 Go libres sur ce Mac · environ 42 min de capture possibles');
  const blocked = describeStorage({ state: 'blocked', freeBytes: 0.8 * GB, minFreeBytes: GB, bytes: 3.4 * GB }, { capturing: true });
  assert.deepEqual([blocked.banner.state, blocked.blocked], ['blocked', true]);
  assert.equal(blocked.banner.text, 'La capture s’arrête : 819 Mo libres, 1 Go requis. Rien n’a été supprimé. Supprime une session ou libère de l’espace, puis reprends.');
  assert.match(describeStorage({ state: 'blocked', freeBytes: 0.8 * GB, minFreeBytes: 2 * GB }).banner.text, /^La capture est arrêtée : 819 Mo libres, 2 Go requis\./);
  assert.deepEqual([describeStorage({ state: 'unknown', freeBytes: null }).banner, describeStorage(null).line], [null, 'Espace libre non mesuré']);

  // An archive is announced as read-only, and the resume says where capture would continue.
  assert.equal(describeArchive({ id: 'kept', readOnly: false, elapsedMs: 5520000 }), null);
  const archive = describeArchive({ id: 'kept', readOnly: true, elapsedMs: 5520000, title: 'Session du 12 oct. 2026, 21:04' });
  assert.deepEqual([archive.label, archive.text], ['Archive · lecture seule', 'Session du 12 oct. 2026, 21:04 · enregistrée jusqu’à 1:32:00']);
  assert.match(archive.resumeText, /à partir de 1:32:00/);
  // Honest availability per passage, and a retention read from the data.
  assert.deepEqual([mediaNote({ available: true }), mediaNote({ available: false, mediaReason: 'not-kept' }).short, mediaNote({ available: false, mediaReason: 'missing' }).short, mediaNote({ available: false, mediaReason: 'expired' }).short, mediaNote(undefined).short],
    [null, 'vidéo non conservée', 'vidéo introuvable', 'vidéo expirée', 'vidéo indisponible']);
  // A video recorded without a frame is neither expired nor missing: it is said unreadable, and what is kept is named.
  assert.deepEqual([mediaNote({ available: false, mediaReason: 'unreadable' }).short, /aucune image/.test(mediaNote({ available: false, mediaReason: 'unreadable' }).long), /Ce qui a été analysé \(images clés, paroles, résumé\) reste disponible/.test(mediaNote({ available: false, mediaReason: 'unreadable' }).long)], ['vidéo illisible', true, true]);
  // A recap citation can be gone before the session state says so: its note is never null, and the recap never reads mediaNote directly.
  assert.deepEqual([unavailableNote({ available: true }).short, unavailableNote({ available: true, mediaReason: 'expired' }).short, unavailableNote(undefined).short, /\.$/.test(unavailableNote({ available: true }).long)],
    ['vidéo indisponible', 'vidéo expirée', 'vidéo indisponible', true]);
  assert.ok(!/\bmediaNote\b/.test(fs.readFileSync(app('ui', 'recap-view.js'), 'utf8')));
  assert.deepEqual([retentionNote({ retention: 'until-deleted', retentionMs: null }), retentionNote({ retention: 'rolling', retentionMs: 1800000 }), retentionNote(null)],
    ['Vidéo conservée jusqu’à la suppression de la session', 'Vidéo conservée jusqu’à la suppression de la session', '']);
  // The retention shown is the loaded session's own. A durable archive opened on a host set to a rolling window
  // says "until deleted": the setting of the host is not even an input of what the Mémoire view writes.
  const durable = { id: 'kept', readOnly: true, retention: 'until-deleted', retentionMs: null, history: [], segments: [{ available: true, status: 'ready' }, { available: false, status: 'ready' }] };
  assert.equal(sessionRetention(durable), 'Vidéo conservée jusqu’à la suppression de la session');
  assert.equal(describeMemory(durable), '2 passages · 1 à revoir · 2 analysés · Vidéo conservée jusqu’à la suppression de la session');
  assert.equal(sessionRetention({ id: 'live', retention: 'rolling', retentionMs: 1800000 }), 'Vidéo conservée jusqu’à la suppression de la session');
  // A state that does not say it: the entry of that same session in the library (sessions().current), never the
  // entry of another session, and otherwise nothing rather than a guess.
  const silent = { id: 'kept', history: [], segments: [] }, entry = id => ({ current: { id, retention: 'until-deleted', retentionMs: null } });
  assert.deepEqual([sessionRetention(silent, entry('kept')), sessionRetention(silent, entry('another')), sessionRetention(silent, { current: 'kept' }), sessionRetention(silent), sessionRetention(null, entry('kept'))],
    ['Vidéo conservée jusqu’à la suppression de la session', '', '', '', '']);
  assert.deepEqual([describeMemory(silent, { library: entry('kept') }), describeMemory(silent), describeMemory(null)], ['0 passage · 0 à revoir · 0 analysé · Vidéo conservée jusqu’à la suppression de la session', '0 passage · 0 à revoir · 0 analysé', '']);
});

test('result cards stay their time, are never shown stale and never shown twice', async () => {
  const { CardQueue, DEFAULT_CARD_DURATION_MS, CARD_DURATIONS_MS, CARD_FRESH_MS } = await ui('card-queue');
  assert.deepEqual([DEFAULT_CARD_DURATION_MS, CARD_DURATIONS_MS, CARD_FRESH_MS], [14000, [8000, 14000, 20000], 60000]);
  const card = (n, finishedAt, kind = 'verification') => ({ key: `s1:${kind}:lot-${n}`, id: `lot-${n}`, kind, finishedAt });
  const keys = list => list.map(item => item.id);
  const queue = new CardQueue();
  assert.equal(queue.offer([card(1, T0)], { sessionId: 's1', now: T0 + 500 }), 1);
  assert.deepEqual(keys(queue.visible(T0 + 500)), ['lot-1']);
  // Duration: on screen until fourteen seconds after it appeared, then gone by itself.
  assert.equal(queue.nextChangeAt(), T0 + 14500);
  assert.deepEqual([keys(queue.visible(T0 + 14499)), keys(queue.visible(T0 + 14500)), queue.nextChangeAt()], [['lot-1'], [], null]);
  // No second showing: the host keeps publishing its last cards, and each state offers them again.
  assert.equal(queue.offer([card(1, T0), card(2, T0 + 15000)], { sessionId: 's1', now: T0 + 15000 }), 1);
  assert.deepEqual(keys(queue.visible(T0 + 15000)), ['lot-2']);
  queue.offer([card(2, T0 + 15000)], { sessionId: 's1', now: T0 + 20000 });
  assert.equal(queue.visible(T0 + 20000)[0].remainingMs, 9000, 'offering a visible card again does not restart its time');
  queue.dismiss('s1:verification:lot-2');
  queue.offer([card(2, T0 + 15000)], { sessionId: 's1', now: T0 + 21000 });
  assert.deepEqual(keys(queue.visible(T0 + 21000)), [], 'a dismissed card does not come back');
  // Freshness: an old result is history, not news; neither is one that could not be shown in time.
  assert.equal(queue.offer([card(3, T0 - 120000)], { sessionId: 's1', now: T0 + 22000 }), 0);
  queue.offer([card(4, T0 + 22000)], { sessionId: 's1', now: T0 + 22000 });
  assert.deepEqual(keys(queue.visible(T0 + 30000, { displayable: false })), [], 'a hidden window uses no card up');
  assert.deepEqual(keys(queue.visible(T0 + 40000)), ['lot-4']);
  queue.offer([card(5, T0 + 41000)], { sessionId: 's1', now: T0 + 41000 });
  queue.dismiss('s1:verification:lot-4');
  assert.deepEqual([keys(queue.visible(T0 + 50000, { displayable: false })), keys(queue.visible(T0 + 41000 + 60001))], [[], []]);
  // A restored registry (reopened archive) primes the queue: nothing pops up, now or later.
  assert.equal(queue.offer([card(6, T0 + 110000)], { sessionId: 's1', now: T0 + 110000, prime: true }), 0);
  assert.equal(queue.offer([card(6, T0 + 110000)], { sessionId: 's1', now: T0 + 110001 }), 0);
  // At most three at once, oldest first; the next one appears when a place is free, with its full time.
  const burst = new CardQueue({ durationMs: 8000 });
  burst.offer([1, 2, 3, 4].map(n => card(n, T0)), { sessionId: 's1', now: T0 });
  assert.deepEqual([keys(burst.visible(T0)), burst.waiting], [['lot-1', 'lot-2', 'lot-3'], 1]);
  assert.deepEqual(burst.visible(T0 + 8000).map(item => [item.id, item.remainingMs]), [['lot-4', 8000]]);
  // A card being read does not vanish; released, it keeps a short grace.
  const held = new CardQueue();
  held.offer([card(1, T0)], { sessionId: 's1', now: T0 });
  held.visible(T0); held.hold('s1:verification:lot-1');
  assert.deepEqual([keys(held.visible(T0 + 60000)), held.nextChangeAt()], [['lot-1'], null]);
  held.release('s1:verification:lot-1', T0 + 60000);
  assert.deepEqual([keys(held.visible(T0 + 63999)), keys(held.visible(T0 + 64000))], [['lot-1'], []]);
  // Another session starts from nothing; the surveillance panel being open leaves nothing to pop up.
  held.offer([card(1, T0 + 70000)], { sessionId: 's2', now: T0 + 70000 });
  assert.deepEqual(keys(held.visible(T0 + 70000)), ['lot-1']);
  held.clear();
  held.offer([card(1, T0 + 70000)], { sessionId: 's2', now: T0 + 71000 });
  assert.deepEqual(keys(held.visible(T0 + 71000)), []);
  // Only a sourced verification enters: a signal, or a card of no stated kind, is refused whoever offers it.
  const strict = new CardQueue();
  assert.equal(strict.offer([card(1, T0, 'signal'), { key: 's1:lot-9', id: 'lot-9', finishedAt: T0 }, card(2, T0)], { sessionId: 's1', now: T0 }), 1);
  assert.deepEqual([strict.visible(T0).map(item => [item.id, item.kind]), strict.waiting], [[['lot-2', 'verification']], 0]);
  assert.deepEqual(keys(strict.visible(T0 + 14000)), []);
});

test('lists are redrawn by entry: an unchanged card keeps its node, and a long session draws only its recent passages', async () => {
  const { KeyedList, isNearBottom, tail, olderPassagesLabel, trimMap, settledCount } = await ui('list-view');
  // The four operations a list needs from its container, without a DOM.
  const container = { children: [],
    insertBefore(node, before) { const at = this.children.indexOf(node); if (at >= 0) this.children.splice(at, 1); const to = before == null ? this.children.length : this.children.indexOf(before); this.children.splice(to, 0, node); },
    replaceChild(node, old) { this.children[this.children.indexOf(old)] = node; },
    removeChild(node) { const at = this.children.indexOf(node); if (at < 0) throw new Error('not a child'); this.children.splice(at, 1); this.onRemove?.(node); } };
  const list = new KeyedList(container), built = [];
  const entry = (id, signature) => ({ id, signature, render: previous => { built.push(id); return { id, signature, previous }; } });
  assert.deepEqual(list.sync([entry('a', '1'), entry('b', '1')]), { created: 2, updated: 0, kept: 0, removed: 0 });
  const [a, b] = container.children;
  // A streamed answer changes one card: the others are neither rebuilt nor replaced.
  assert.deepEqual(list.sync([entry('a', '1'), entry('b', '2'), entry('c', '1')]), { created: 1, updated: 1, kept: 1, removed: 0 });
  assert.deepEqual(built, ['a', 'b', 'b', 'c']);
  assert.equal(container.children[0], a);
  assert.deepEqual([container.children[1] === b, container.children[1].previous === b, container.children.map(node => node.id)], [false, true, ['a', 'b', 'c']]);
  // A card may be patched in place: the same node comes back and nothing moves.
  const patched = container.children[1];
  list.sync([entry('a', '1'), { id: 'b', signature: '3', render: previous => Object.assign(previous, { signature: '3' }) }, entry('c', '1')]);
  assert.equal(container.children[1], patched);
  // Order follows the entries; what is gone is removed.
  assert.deepEqual(list.sync([entry('c', '1'), entry('a', '1')]), { created: 0, updated: 0, kept: 2, removed: 1 });
  assert.deepEqual(container.children.map(node => node.id), ['c', 'a']);
  assert.equal(container.children[1], a);
  // Removing a focused node can call back into the list (blur handler): the nested request is applied afterwards.
  container.onRemove = () => { container.onRemove = null; list.sync([entry('z', '1')]); };
  list.sync([entry('a', '1')]);
  assert.deepEqual(container.children.map(node => node.id), ['z']);
  assert.deepEqual(list.clear().removed, 1);

  // The view follows an answer only when the reader was already at the bottom.
  assert.deepEqual([isNearBottom({ scrollHeight: 2000, scrollTop: 1400, clientHeight: 560 }), isNearBottom({ scrollHeight: 2000, scrollTop: 900, clientHeight: 560 })], [true, false]);
  // Ninety minutes of eight-second passages: forty rows drawn, the rest named in one line.
  const film = Array.from({ length: 675 }, (_, i) => ({ id: `moment-${i + 1}` }));
  const recent = tail(film, 40);
  assert.deepEqual([recent.items.length, recent.items[0].id, recent.items.at(-1).id, recent.olderCount], [40, 'moment-636', 'moment-675', 635]);
  assert.equal(olderPassagesLabel(recent.olderCount), '635 passages plus anciens : retrouve-les par la recherche, le résumé ou les citations.');
  assert.deepEqual([tail(film.slice(0, 3), 40).olderCount, olderPassagesLabel(0), tail(undefined, 40).items], [0, '', []]);
  // In-memory previews are bounded, oldest first, sparing what is on screen.
  const previews = new Map(film.slice(0, 100).map(passage => [passage.id, 'data:image/jpeg;base64,…']));
  trimMap(previews, 60, new Set(['moment-1']));
  assert.deepEqual([previews.size, previews.has('moment-1'), previews.has('moment-2'), previews.has('moment-100')], [60, true, false, true]);
  // The research budget is read again when a question finishes, not at every fragment of an answer.
  const running = [{ status: 'done' }, { status: 'running' }, { status: 'queued' }];
  assert.deepEqual([settledCount(running), settledCount([{ status: 'done' }, { status: 'timeout' }, { status: 'queued' }]), settledCount(undefined)], [1, 2, 0]);
});

test('wording helpers: durations, sizes and errors read as a viewer would write them', async () => {
  const { formatClock, formatLimit, formatDuration, formatBytes, cleanError, plural, agree, agreeText } = await ui('text');
  assert.deepEqual([formatClock(61000), formatClock(5400000), formatClock(-5), formatClock(undefined)], ['01:01', '1:30:00', '00:00', '00:00']);
  assert.deepEqual([formatLimit(300000), formatLimit(60000), formatLimit(150000), formatLimit(59001), formatLimit(7200000), formatLimit(0), formatLimit(null)], ['5 min', '1 min', '150 s', '60 s', '2 h', '', '']);
  assert.deepEqual([formatDuration(45000), formatDuration(240000), formatDuration(5520000)], ['45 s', '4 min', '1 h 32']);
  assert.deepEqual([formatBytes(512), formatBytes(2.5 * 1024 ** 2), formatBytes(1288490188), formatBytes(11 * 1024 ** 3), formatBytes(null), formatBytes(NaN)], ['512 o', '3 Mo', '1,2 Go', '11 Go', '', '']);
  assert.deepEqual([plural(0, 'passage'), plural(1, 'passage'), plural(2, 'passage'), plural(2, 'nouveau résultat', 'nouveaux résultats')], ['0 passage', '1 passage', '2 passages', '2 nouveaux résultats']);
  // French agreement, one helper for every count: 0 and 1 are singular, the word alone when the count is written elsewhere.
  assert.deepEqual([0, 1, 2].map(n => plural(n, 'lacune')), ['0 lacune', '1 lacune', '2 lacunes']);
  assert.deepEqual([0, 1, 2].map(n => agree(n, 'traitée')), ['traitée', 'traitée', 'traitées']);
  assert.deepEqual([0, 1, 2].map(n => plural(n, 'passage non lu', 'passages non lus')), ['0 passage non lu', '1 passage non lu', '2 passages non lus']);
  // What the window writes itself: capture health, coverage, memory.
  const { describeHealth, describeCoverage, describeMemory } = await ui('sessions-view');
  const live = (gaps, extra = {}) => ({ id: 'session-mac', readOnly: false, pending: 0, capturedThroughMs: 8000, analyzedThroughMs: 8000, history: [], segments: [], gaps: Array.from({ length: gaps }, (_, i) => ({ id: `moment-${i + 1}` })), ...extra });
  assert.deepEqual([0, 1, 2].map(n => describeHealth(live(n), { recording: true }).label), ['Premières observations en cours…', '1 passage sans analyse', '2 passages sans analyse']);
  assert.deepEqual([0, 1, 2].map(n => describeHealth(live(n), { recording: true }).tone), ['ready', 'pending', 'pending']);
  assert.deepEqual([0, 1, 2].map(n => describeCoverage(live(n))), ['Capturé 00:08 · Analysé 00:08 · 0 en attente · 0 lacune', 'Capturé 00:08 · Analysé 00:08 · 0 en attente · 1 lacune', 'Capturé 00:08 · Analysé 00:08 · 0 en attente · 2 lacunes']);
  const analysed = n => describeMemory(live(0, { segments: Array.from({ length: n }, () => ({ available: true, status: 'ready' })) }));
  assert.deepEqual([0, 1, 2].map(analysed), ['0 passage · 0 à revoir · 0 analysé', '1 passage · 1 à revoir · 1 analysé', '2 passages · 2 à revoir · 2 analysés']);
  // The other states of the health line keep their meaning.
  assert.deepEqual([describeHealth(null).label, describeHealth(live(2, { readOnly: true }), { recording: false }).label, describeHealth(live(2)).label, describeHealth(live(0, { capturedThroughMs: 16000 }), { recording: true }).label, describeHealth(live(0, { segments: [{ status: 'ready', observation: { summary: 'Un débat.' } }] }), { recording: true })],
    ['Prêt à observer', 'Archive · lecture seule', 'Observation en pause', 'Analyse en cours · 8 s de décalage', { label: 'Analyse à jour', tone: 'ready', context: 'Un débat.' }]);
  // Sentences of the core shown in this window (limits of an answer, of the recap, of a search) still carry
  // "(s)": agreed with the number that governs them, nothing else touched.
  assert.deepEqual([0, 1, 2].map(n => agreeText(`${n} passage(s) encore en analyse au moment de la question.`)),
    ['0 passage encore en analyse au moment de la question.', '1 passage encore en analyse au moment de la question.', '2 passages encore en analyse au moment de la question.']);
  assert.deepEqual([agreeText('2 résumé(s) plus ancien(s) non inclus dans ce récapitulatif.'), agreeText('1 passage(s) récent(s) en attente d’intégration au résumé.'), agreeText('5 passage(s) pas encore indexé(s) : classement textuel pour eux.')],
    ['2 résumés plus anciens non inclus dans ce récapitulatif.', '1 passage récent en attente d’intégration au résumé.', '5 passages pas encore indexés : classement textuel pour eux.']);
  assert.equal(agreeText('L’intervalle demandé contient 3 interruption(s) sans passage consultable (12.0 s). 1 passage(s) sans analyse exploitable.'), 'L’intervalle demandé contient 3 interruptions sans passage consultable (12.0 s). 1 passage sans analyse exploitable.');
  assert.equal(agreeText('Bas de l’image masqué par un affichage TV Lens sur 1 image(s) sur 5 : la scène n’a pas été vue en entier.'), 'Bas de l’image masqué par un affichage TV Lens sur 1 image sur 5 : la scène n’a pas été vue en entier.');
  // No number in front, or a punctuation mark in between: left as written. Text without the form: untouched.
  for (const text of ['Backend local : URL http(s) sans identifiants requise.', 'Codex 5 : URL http(s) requise.', 'Résultat limité aux observations déjà obtenues.', '']) assert.equal(agreeText(text), text);
  assert.equal(agreeText(undefined), '');
  // Sentences of the agent are never rewritten, whatever number stands before their "(s)".
  for (const text of ['En 2024, le(s) présentateur(s) évoque(nt) trois sujets.', 'Il reste 3 minute(s) selon le(s) intervenant(s).', 'Sur 2 extraits, le(s) chiffre(s) cité(s) reste(nt) incertain(s).', '4 passage(s) consulté(s) par l’agent.']) assert.equal(agreeText(text), text);
  assert.equal(agreeText('En 2024, le(s) invité(s) hésite(nt). 1 passage(s) sans analyse exploitable.'), 'En 2024, le(s) invité(s) hésite(nt). 1 passage sans analyse exploitable.');
  // Only the exact Electron prefix is removed; a message of ours that contains "Error:" stays whole.
  assert.equal(cleanError(new Error("Error invoking remote method 'watch:ask': Error: Démarre une session avant de poser une question.")), 'Démarre une session avant de poser une question.');
  assert.equal(cleanError(new Error('Codex a répondu : Error: quota dépassé.')), 'Codex a répondu : Error: quota dépassé.');
  assert.deepEqual([cleanError('Session obsolète.'), cleanError(undefined)], ['Session obsolète.', 'Erreur inattendue.']);
});

test('search cards name the session they were searched in: a late answer is not drawn in another session, and an old card replays nothing there', async (t) => {
  const { searchCards, replayTarget } = await ui('search-view');
  const { mediaNote } = await ui('sessions-view');
  const passage = (id, extra = {}) => ({ id, startMs: 0, endMs: 8000, available: true, ...extra });
  // Passages are numbered from moment-1 in every session: A and B both hold one, and both can be replayed.
  const a = { id: 'session-a', history: [], segments: [passage('moment-1')] };
  const b = { id: 'session-b', history: [passage('moment-2', { available: false, mediaReason: 'expired' })], segments: [passage('moment-1'), passage('moment-3', { available: false, mediaReason: 'missing' })] };
  const found = { sessionId: 'session-a', mode: 'lexical', warnings: [], moments: [{ id: 'moment-1', startMs: 0, endMs: 8000, text: 'Un cercle se déplace.', available: true, preview: 'data:image/jpeg;base64,QQ==', score: 1 }] };
  // Drawn in the session that was searched: every card carries that session along with its passage and its thumbnail.
  const cards = searchCards(found, a);
  assert.deepEqual(cards, [{ ...found.moments[0], sessionId: 'session-a' }]);
  // A late answer (B was opened meanwhile, or nothing is loaded any more) is not drawn; one that names no session is nobody's.
  assert.deepEqual([searchCards(found, b), searchCards(found, null), searchCards({ ...found, sessionId: undefined }, a), searchCards(undefined, a)], [null, null, null, null]);

  // Replay validates the session and the passage. In A the card opens the moment-1 of A, at the address of A.
  assert.deepEqual(replayTarget(cards[0], a), { segment: a.segments[0], url: 'tvlens-media://session-a/moment-1' });
  // In B the old card is refused although B holds a moment-1 that can be replayed: no address is built from B.
  const refused = replayTarget(cards[0], b);
  assert.deepEqual([Object.keys(refused), /autre session/.test(refused.refusal)], [['refusal'], true]);
  // A card that names no session is refused the same way; only what was drawn for B is replayed in B.
  assert.deepEqual(replayTarget({ id: 'moment-1' }, b), refused);
  assert.deepEqual(replayTarget({ id: 'moment-1', sessionId: 'session-b' }, b), { segment: b.segments[0], url: 'tvlens-media://session-b/moment-1' });
  // A passage without video, gone to the history, unknown, or asked while nothing is loaded: the reason, never an address.
  const own = id => replayTarget({ id, sessionId: 'session-b' }, b);
  assert.deepEqual([own('moment-3'), own('moment-2'), own('moment-9'), replayTarget({ id: 'moment-1' }, null)],
    [{ refusal: mediaNote(b.segments[1]).long }, { refusal: mediaNote(b.history[0]).long }, { refusal: mediaNote(undefined).long }, { refusal: mediaNote(undefined).long }]);

  const f = await rendererHarness(t);
  f.publish('onState', a);
  f.get('moment-query').value = 'un cercle';
  const submit = () => f.submit(f.get('moment-search-form'));
  assert.equal(typeof f.get('moment-search-form').onsubmit, 'function', 'search form bound');
  const first = submit();
  assert.equal(f.reads.at(-1).args[0], 'un cercle');
  f.reads.at(-1).resolve(found);
  await first;
  assert.match(f.get('search-status').textContent, /1 passage · lexical/);
  const play = f.get('search-results').children[0].children.at(-1).children.at(-1);
  await f.click(play);
  assert.equal(f.get('replay').src, 'tvlens-media://session-a/moment-1');
  assert.equal(f.get('replay-dialog').open, true);
  f.get('replay-dialog').close();
  const plays = f.get('replay').plays;
  for (const change of ['session', 'reset']) {
    f.publish('onState', a);
    const done = submit();
    const read = f.reads.at(-1);
    read.resolve(found);
    await done;
    assert.equal(f.get('search-results').children.length, 1);
    const late = submit();
    const held = f.reads.at(-1);
    if (change === 'session') f.publish('onState', b);
    else f.publish('onReset');
    assert.equal(f.get('search-results').children.length, 0);
    assert.equal(f.get('search-status').textContent, 'Cherche un passage.');
    held.resolve(found);
    await late;
    assert.equal(f.get('search-results').children.length, 0, change);
    const refusal = submit();
    const refused = f.reads.at(-1);
    f.publish('onReset');
    refused.reject(new Error('late search refusal'));
    await refusal;
    assert.equal(f.get('search-status').textContent, 'Cherche un passage.');
  }
  f.publish('onState', b);
  await f.click(play);
  assert.equal(f.get('replay').plays, plays, 'retained A card cannot play B passage');
  assert.equal(f.get('replay-dialog').open, false);
  assert.match(f.get('notice').textContent, /autre session/);
});

test('a retained moment shares the passage card presentation and delegates playback while the open session offers the same passage', async (t) => {
  const f = await rendererHarness(t);
  let played = 0;
  const moment = { id: 'moment-1', sessionId: 'session', startMs: 8000, endMs: 16000, available: false,
    mediaReason: 'expired', preview: 'data:image/jpeg;saved', text: 'Un moment conservé.' };
  f.publish('onState', { id: 'session', history: [], segments: [{ ...moment, available: true }] });
  f.frame();
  const original = f.wiring.momentCard(moment);
  const retained = f.wiring.momentCard(moment, { available: true, replay: () => { played++; } });
  const button = card => card.querySelectorAll('.secondary')[0];
  assert.equal(button(original).disabled, true);
  assert.match(button(original).textContent, /vidéo expirée/);
  assert.equal(button(retained).disabled, false, 'the retained copy is playable even after session media expiry');
  assert.equal(button(retained).textContent, 'Revoir ↗');
  assert.equal(retained.children[0].src, moment.preview);
  assert.equal(retained.children[0].alt, 'Aperçu du passage');
  assert.equal(retained.children[1].children[0].textContent, '00:08–00:16');
  assert.equal(retained.children[1].children[1].textContent, moment.text);
  await f.click(button(retained));
  assert.equal(played, 1);
  assert.equal(Boolean(f.get('replay-dialog').open), false, 'playback remains owned by the supplied callback');
  assert.equal(f.get('replay').src || '', '', 'the retained click must not select session media');
  assert.equal(f.get('notice').textContent, '');
  const current = f.wiring.momentCard({ ...moment, available: true });
  await f.click(button(current));
  assert.equal(f.get('replay-dialog').open, true, 'default playback can open the same passage in this session');
  assert.equal(f.get('replay').src, 'tvlens-media://session/moment-1');
  assert.equal(played, 1);
});

test('a state read overtaken by a push is stale, right after departure or just before its answer', async () => {
  const { createFreshness } = await ui('freshness');
  for (const when of ['after departure', 'before answer']) {
    const freshness = createFreshness();
    const held = deferred();
    const isFresh = freshness.beginRead();
    const answer = held.promise.then(() => isFresh());
    if (when === 'before answer') await Promise.resolve();
    freshness.pushed();
    held.resolve({ jobs: [] });
    assert.equal(await answer, false, when);
  }
});

test('of two state reads answered in reverse order, only the one started last is fresh', async () => {
  const { createFreshness } = await ui('freshness');
  const freshness = createFreshness();
  const first = deferred(), second = deferred();
  const firstIsFresh = freshness.beginRead();
  const older = first.promise.then(() => firstIsFresh());
  const secondIsFresh = freshness.beginRead();
  const newer = second.promise.then(() => secondIsFresh());
  second.resolve({ jobs: ['new'] });
  assert.equal(await newer, true);
  first.resolve({ jobs: [] });
  assert.equal(await older, false);
});

test('a first state read with nothing overtaking it stays fresh until its answer', async () => {
  const { createFreshness } = await ui('freshness');
  const freshness = createFreshness();
  const held = deferred();
  const isFresh = freshness.beginRead();
  const answer = held.promise.then(() => isFresh());
  held.resolve({ jobs: [] });
  assert.equal(await answer, true);
});

test('an archive push before a state read starts does not make its answer stale', async () => {
  const { createFreshness } = await ui('freshness');
  const freshness = createFreshness();
  freshness.pushed();
  const held = deferred();
  const isFresh = freshness.beginRead();
  const answer = held.promise.then(() => isFresh());
  held.resolve({ jobs: ['restored'] });
  assert.equal(await answer, true);
});

test('a verification push does not overtake a deep state read from a separate source', async () => {
  const { createFreshness } = await ui('freshness');
  const deep = createFreshness(), verification = createFreshness();
  const held = deferred();
  const isFresh = deep.beginRead();
  const answer = held.promise.then(() => isFresh());
  verification.pushed();
  verification.beginRead();
  held.resolve({ jobs: [] });
  assert.equal(await answer, true);
});

test('a rejected state read propagates its failure and leaves the next read fresh', async () => {
  const { createFreshness } = await ui('freshness');
  const freshness = createFreshness();
  const refused = deferred();
  const wasFresh = freshness.beginRead();
  const failed = refused.promise.then(() => wasFresh());
  const error = new Error('read refused');
  const rejection = assert.rejects(failed, cause => cause === error);
  const held = deferred();
  const isFresh = freshness.beginRead();
  const answer = held.promise.then(() => isFresh());
  refused.reject(error);
  await rejection;
  held.resolve({ jobs: [] });
  assert.equal(await answer, true);
});

test('the window tracks pushes and guards all three deep and verification reads with their own freshness source', async (t) => {
  const f = await rendererHarness(t);
  f.publish('onState', { id: 'session', history: [], segments: [] });
  f.publish('onDeepState', { jobs: [{ id: 'new', status: 'running', question: 'Dernière question', createdAt: T0 }] });
  f.publish('onDeepState', { jobs: [{ id: 'new', status: 'running', question: 'Question retenue', createdAt: T0 }] });
  f.publish('onVerificationState', { busy: true, jobs: [{ id: 'check', status: 'running', claim: 'Chiffre poussé', createdAt: T0 + 1 }] });
  assert.deepEqual(f.draws.filter(item => typeof item === 'string'), ['buttons', 'buttons', 'buttons']);
  assert.equal(f.frames.size, 2, 'session and chat have separate batches');
  f.frame();
  assert.match(f.get('message-list').textContent, /Question retenue/);
  assert.doesNotMatch(f.get('message-list').textContent, /Dernière question/);
  assert.match(f.get('message-list').textContent, /Chiffre poussé/);
  assert.deepEqual(f.draws.filter(item => item === 'session' || item === 'chat'), ['session', 'chat', 'chat']);
  f.reads.find(read => read.name === 'deepState').resolve({ jobs: [] });
  f.reads.find(read => read.name === 'verificationState').resolve({ busy: false, jobs: [] });
  await turns(1);
  assert.equal(f.frames.size, 0, 'overtaken initial reads schedule nothing');
  const text = f.get('message-list').textContent;
  const retained = [...f.listeners.values()].slice(0, 3);
  f.publish('onDeepState', { jobs: [] });
  f.window.dispatchEvent({ type: 'beforeunload' });
  assert.equal(f.listeners.size, 0, 'window unload releases its subscriptions');
  f.wiring.release();
  assert.equal(f.frames.size, 0);
  assert.equal(f.clock.armed, 0);
  assert.equal(f.listeners.size, 0);
  assert.equal(f.removed.length, new Set(f.removed).size, 'each subscription removed once');
  for (const callback of retained) callback(null);
  await f.clock.advance(100);
  assert.equal(f.get('message-list').textContent, text);
});

test('published questions reach the document through the shared renderer binding', async (t) => {
  const f = await rendererHarness(t);
  f.publish('onDeepState', { jobs: [{ id: 'live', status: 'running', createdAt: T0, preview: 'Brouillon publié' }] });
  f.frame();
  assert.match(f.get('message-list').textContent, /Brouillon publié/);
});

test('fresh initial reads draw real cards and all retained reads become inert when the window unloads', async (t) => {
  const f = await rendererHarness(t);
  f.reads.find(read => read.name === 'deepState').resolve({ jobs: [{ id: 'initial', status: 'running', createdAt: T0, preview: 'Lecture initiale' }] });
  f.reads.find(read => read.name === 'verificationState').resolve({ busy: true,
    jobs: [{ id: 'check', status: 'running', createdAt: T0 + 1, claim: 'Vérification initiale' }] });
  await turns(1);
  f.frame();
  assert.match(f.get('message-list').textContent, /Lecture initiale/);
  assert.match(f.get('message-list').textContent, /Vérification initiale/);
  assert.equal(f.draws.filter(value => value === 'buttons').length, 1);
  const text = f.get('message-list').textContent;
  f.window.dispatchEvent({ type: 'beforeunload' });
  for (const read of f.reads) {
    if (read.name === 'state') read.resolve({ id: 'late', history: [], segments: [] });
    if (read.name === 'recapState') read.resolve({ sessionId: 'late', status: 'ready', overview: 'Résumé tardif', chapters: [] });
    if (read.name === 'surveillanceState') read.resolve({ sessionId: 'late', activity: { state: 'listening' } });
  }
  await f.clock.advance(100);
  assert.equal(f.get('message-list').textContent, text);
  assert.doesNotMatch(f.get('recap-content').textContent, /Résumé tardif/);
  assert.equal(f.listeners.size, 0);
});

test('an archive question read checks freshness after another member of Promise.all answers', async (t) => {
  const f = await rendererHarness(t);
  f.get('messages').scrollHeight = 2000;
  f.get('messages').scrollTop = 0;
  const reading = f.wiring.pullSession();
  await turns(1);
  const state = f.reads.filter(read => read.name === 'state').at(-1);
  assert.ok(state, 'archive reads the session');
  state.resolve({ id: 'archive', readOnly: true, history: [], segments: [] });
  await turns(1);
  const deep = f.reads.filter(read => read.name === 'deepState').at(-1);
  const recap = f.reads.filter(read => read.name === 'recapState').at(-1);
  const watch = f.reads.filter(read => read.name === 'surveillanceState').at(-1);
  deep.resolve({ jobs: [{ id: 'old', status: 'running', question: 'Question archivée', createdAt: T0 }] });
  await turns(1);
  f.publish('onDeepState', { jobs: [{ id: 'pushed', status: 'running', question: 'Question plus récente', createdAt: T0 }] });
  f.publish('onVerificationState', { busy: false, jobs: [] });
  recap.resolve({ sessionId: 'archive', status: 'ready', overview: 'Résumé de l’archive', chapters: [] });
  watch.resolve({ sessionId: 'archive', activity: { state: 'listening' },
    registry: { ready: true, persisted: false, message: 'Archive en mémoire seulement.' } });
  await reading;
  f.frame();
  assert.match(f.get('message-list').textContent, /Question plus récente/);
  assert.doesNotMatch(f.get('message-list').textContent, /Question archivée/);
  assert.match(f.get('recap-content').textContent, /Résumé de l’archive/);
  assert.equal(f.get('watch-notice-text').textContent, 'Archive en mémoire seulement.');
  assert.equal(f.get('messages').scrollTop, 2000, 'archive loading follows the latest answer');
});

test('archive question read failures propagate while optional recap and surveillance failures leave a fresh question usable', async (t) => {
  const f = await rendererHarness(t);
  const reading = f.wiring.pullSession();
  f.reads.filter(read => read.name === 'state').at(-1).resolve({ id: 'archive', history: [], segments: [] });
  await turns(1);
  f.publish('onVerificationState', { busy: false, jobs: [] });
  f.reads.filter(read => read.name === 'deepState').at(-1).resolve({
    jobs: [{ id: 'archive', status: 'running', createdAt: T0, preview: 'Question archivée' }] });
  f.reads.filter(read => read.name === 'recapState').at(-1).reject(new Error('optional recap'));
  f.reads.filter(read => read.name === 'surveillanceState').at(-1).reject(new Error('optional watch'));
  await reading;
  f.frame();
  assert.match(f.get('message-list').textContent, /Question archivée/);
  const failed = f.wiring.pullSession();
  const error = Object.assign(new Error('deep read refused'), { code: 'DEEP_READ_REFUSED' });
  const rejection = assert.rejects(failed, cause => cause === error);
  f.reads.filter(read => read.name === 'state').at(-1).resolve({ id: 'archive', history: [], segments: [] });
  await turns(1);
  f.reads.filter(read => read.name === 'deepState').at(-1).reject(error);
  f.reads.filter(read => read.name === 'recapState').at(-1).resolve(null);
  f.reads.filter(read => read.name === 'surveillanceState').at(-1).resolve(null);
  await rejection;
});

// A controller whose searches are the held requests, in the order they are asked, and whose observers write a log.
async function searchHarness({ session = { id: 'session-a' }, onResult } = {}) {
  const { createSearchController } = await ui('search-controller');
  const log = [], requests = [];
  const state = { session };
  const search = query => { const held = deferred(); requests.push({ query, ...held }); return held.promise; };
  const controller = createSearchController({
    search,
    session: () => state.session,
    onStart: () => log.push(['start']),
    onResult: onResult || ((cards, found) => log.push(['result', cards, found])),
    onClear: () => log.push(['clear']),
    onFailure: error => log.push(['failure', error]),
  });
  return { controller, log, requests, state };
}

const answerFor = (sessionId, ...ids) => ({ sessionId, mode: 'lexical', warnings: [], moments: ids.map(id => ({ id, startMs: 0, endMs: 1000, text: id })) });

test('a search says it left, then draws its answer through searchCards with the session loaded when it answers', async () => {
  const { controller, log, requests, state } = await searchHarness();
  const done = controller.submit('un cercle');
  // It left before the host answered, and with the words the viewer typed.
  assert.deepEqual([log, requests.map(request => request.query)], [[['start']], ['un cercle']]);
  state.session = { id: 'session-b' };
  const found = answerFor('session-b', 'moment-1');
  requests[0].resolve(found);
  await done;
  assert.deepEqual(log, [['start'], ['result', [{ ...found.moments[0], sessionId: 'session-b' }], found]]);
});

test('of two searches, only the one asked last is drawn: the older one, answering last, draws and writes nothing', async () => {
  const { controller, log, requests } = await searchHarness();
  const first = controller.submit('premier');
  const second = controller.submit('second');
  const newer = answerFor('session-a', 'moment-2');
  requests[1].resolve(newer);
  await second;
  requests[0].resolve(answerFor('session-a', 'moment-1'));
  await first;
  assert.deepEqual(log, [['start'], ['start'], ['result', [{ ...newer.moments[0], sessionId: 'session-a' }], newer]]);
});

test('an answer searched in another session than the loaded one empties the results and draws nothing', async () => {
  const { controller, log, requests, state } = await searchHarness();
  const done = controller.submit('un cercle');
  state.session = { id: 'session-b' };
  requests[0].resolve(answerFor('session-a', 'moment-1'));
  await done;
  assert.deepEqual(log, [['start'], ['clear']]);
  // The same goes for an answer that names no session, and for one that arrives with nothing loaded.
  const second = controller.submit('un cercle');
  requests[1].resolve({ mode: 'lexical', warnings: [], moments: [] });
  await second;
  state.session = null;
  const third = controller.submit('un cercle');
  requests[2].resolve(answerFor('session-b', 'moment-1'));
  await third;
  assert.deepEqual(log, [['start'], ['clear'], ['start'], ['clear'], ['start'], ['clear']]);
});

test('a clear while a search is on its way drops its answer, and clearing always tells the observer', async () => {
  const { controller, log, requests } = await searchHarness();
  controller.clear();
  assert.deepEqual(log, [['clear']]);
  const done = controller.submit('un cercle');
  controller.clear();
  requests[0].resolve(answerFor('session-a', 'moment-1'));
  await done;
  assert.deepEqual(log, [['clear'], ['start'], ['clear']]);
});

test('a refusal is told once when the search is still the latest, and not when it was cleared or superseded', async () => {
  const { controller, log, requests } = await searchHarness();
  const refusal = new Error('refused');
  const current = controller.submit('un cercle');
  requests[0].reject(refusal);
  await current;
  assert.deepEqual(log, [['start'], ['failure', refusal]]);

  log.length = 0;
  const cleared = controller.submit('un cercle');
  controller.clear();
  requests[1].reject(new Error('late'));
  await cleared;
  assert.deepEqual(log, [['start'], ['clear']]);

  log.length = 0;
  const old = controller.submit('premier');
  const latest = controller.submit('second');
  requests[2].reject(new Error('late'));
  await old;
  requests[3].resolve(answerFor('session-a', 'moment-1'));
  await latest;
  assert.deepEqual(log.map(entry => entry[0]), ['start', 'start', 'result']);
});

test('an observer that fails while drawing an answer has that failure told as the refusal of the search', async () => {
  const drawing = new Error('cannot draw');
  const { controller, log, requests } = await searchHarness({ onResult: () => { throw drawing; } });
  const done = controller.submit('un cercle');
  requests[0].resolve(answerFor('session-a', 'moment-1'));
  await done;
  assert.deepEqual(log, [['start'], ['failure', drawing]]);
});

test('surveillance publications feed the real sourced stack and keep a signal outside it', async (t) => {
  const f = await rendererHarness(t);
  const h = await watchedSession();
  t.after(() => h.surveillance.stop());
  f.publish('onState', h.snapshot());
  f.publish('onSurveillance', h.surveillance.snapshot());
  f.frame();
  const stack = f.get('watch-stack');
  assert.equal(stack.children.length, 1);
  assert.equal(stack.children[0].dataset.kind, 'verification');
  assert.match(stack.textContent, /Publication claim-1/);
  const source = stack.querySelectorAll('.source-link')[0];
  await f.click(source);
  assert.deepEqual(f.calls.at(-1), ['openSurveillanceSource', 'lot-1', 0]);
  const signal = h.surveillance.snapshot().signals.cards[0];
  f.publish('onState', { id: 'signal-session', history: [], segments: [] });
  f.publish('onSurveillance', { ...h.surveillance.snapshot(), sessionId: 'signal-session', overlay: { seq: 1, cards: [signal] } });
  f.frame();
  assert.equal(stack.children.length, 0, 'even a misfiled signal never enters the stack');
});

test('recap publications keep the earlier content through the reducer and redraw citations with the session', async (t) => {
  const f = await rendererHarness(t);
  const passage = { id: 'moment-1', startMs: 0, endMs: 8000, available: true, status: 'ready' };
  const session = { id: 'session', history: [], segments: [passage] };
  f.publish('onState', session);
  f.publish('onRecap', { sessionId: 'session', status: 'ready', overview: 'Résumé conservé',
    chapters: [{ id: 'chapter', title: 'Un débat', startMs: 0, endMs: 8000, sources: [passage] }] });
  for (const status of ['updating', 'error']) {
    f.publish('onRecap', { sessionId: 'session', status, overview: '', chapters: [] });
    assert.match(f.get('recap-content').textContent, /Résumé conservé/);
  }
  f.publish('onRecap', { sessionId: 'other', status: 'ready', overview: 'Résumé étranger', chapters: [] });
  assert.doesNotMatch(f.get('recap-content').textContent, /Résumé étranger/);
  f.frame();
  assert.equal(f.get('recap-content').querySelectorAll('.recap-source')[0].disabled, false);
  f.publish('onDeepState', { jobs: [{ id: 'answer', sessionId: 'session', status: 'done', createdAt: T0,
    result: { ...observed, citations: [passage] } }] });
  f.frame();
  const card = f.get('message-list').children[0];
  assert.equal(card.querySelectorAll('.reference')[0].disabled, false);
  f.publish('onState', { ...session, segments: [{ ...passage, available: false, mediaReason: 'expired' }] });
  f.frame();
  for (const id of ['recap-content', 'recap-dialog-content']) {
    assert.equal(f.get(id).querySelectorAll('.recap-source')[0].disabled, true);
    assert.match(f.get(id).querySelectorAll('.recap-source')[0].title, /expirée/);
  }
  assert.equal(f.get('message-list').children[0], card);
  assert.equal(card.querySelectorAll('.reference')[0].disabled, true);
});

test('memory presents the open session retention and falls back only to that session in the library', async (t) => {
  const f = await rendererHarness(t, { configuration: { retention: 'rolling', retentionMs: 1800000 },
    library: { current: { id: 'archive', retention: 'until-deleted' } } });
  f.publish('onState', { id: 'archive', retention: 'until-deleted', history: [], segments: [] });
  f.frame();
  assert.match(f.get('memory-status').textContent, /Vidéo conservée jusqu’à la suppression de la session/);
  f.publish('onState', { id: 'archive', history: [], segments: [] });
  f.frame();
  assert.match(f.get('memory-status').textContent, /jusqu’à la suppression/);
  assert.equal(f.get('memory-status').title, f.get('memory-status').textContent);
  f.publish('onState', { id: 'another', history: [], segments: [] });
  f.frame();
  assert.equal(f.get('memory-status').textContent, '0 passage · 0 à revoir · 0 analysé');
});

// ---- Requests of the chat: what the window sends to the models --------------------------------------

test('the claim of a verification loses every recognised prefix, in any case, and keeps what is not one', async () => {
  const { claimFrom } = await ui('chat-requests');
  const prefixes = ['/verify', 'vérifie', 'verifie', 'vérifier', 'vérifie que', 'vérifie si', 'fact-check', 'fact check', 'factcheck'];
  for (const prefix of prefixes) {
    for (const separator of [' ', ': ', ' — ', ' - ', ':']) {
      assert.equal(claimFrom(`${prefix}${separator}le chiffre est exact`), 'le chiffre est exact', `${prefix}${separator}`);
      assert.equal(claimFrom(`${prefix.toUpperCase()}${separator}le chiffre est exact`), 'le chiffre est exact', `${prefix.toUpperCase()}${separator}`);
    }
  }
  assert.equal(claimFrom('  le chiffre est exact \n'), 'le chiffre est exact');
  assert.equal(claimFrom(''), '');
  // A word that only starts like a prefix is a word of the claim.
  assert.deepEqual(['vérifiez ce chiffre', 'verifiera demain', 'factchecker'].map(claimFrom), ['vérifiez ce chiffre', 'verifiera demain', 'factchecker']);
});

test('a prefix followed by que or si gives the claim after it, and only a whole que or si is taken for the conjunction', async () => {
  const { claimFrom } = await ui('chat-requests');
  assert.deepEqual(['vérifie que X', 'vérifie si: X', 'vérifie qu’il X'].map(claimFrom), ['X', 'X', 'qu’il X']);
  // que and si are cut only as whole words, accented letters included.
  assert.deepEqual(['vérifie quelque chose', 'vérifie simplement X', 'vérifie siège X'].map(claimFrom), ['quelque chose', 'simplement X', 'siège X']);
});

test('a bare reference such as ça is not a claim, but is kept when other words follow it', async () => {
  const { claimFrom } = await ui('chat-requests');
  const references = ['ça', 'cela', 'cette affirmation', 'ce qu\'il vient de dire', 'ce qu’il vient de dire'];
  for (const reference of references) {
    for (const ending of ['', '.', '!', '?']) {
      assert.equal(claimFrom(`${reference}${ending}`), '', `${reference}${ending}`);
      assert.equal(claimFrom(`vérifie ${reference}${ending}`), '', `vérifie ${reference}${ending}`);
      assert.equal(claimFrom(`fact-check : ${reference}${ending}`), '', `fact-check : ${reference}${ending}`);
    }
    assert.equal(claimFrom(`${reference} est faux`), `${reference} est faux`);
    assert.equal(claimFrom(`vérifie ${reference} est faux`), `${reference} est faux`);
  }
});

test('a claim is cut at 2000 characters, after the prefix and the bare reference are dealt with', async () => {
  const { claimFrom } = await ui('chat-requests');
  assert.equal(claimFrom('a'.repeat(2500)).length, 2000);
  assert.equal(claimFrom(`vérifie ${'b'.repeat(2500)}`), 'b'.repeat(2000));
  assert.equal(claimFrom('c'.repeat(2000)), 'c'.repeat(2000));
});

test('a question stripped of its prefix equals its claim, except a bare reference, which only the claim empties', async () => {
  const { claimFrom, withoutVerifyPrefix } = await ui('chat-requests');
  const questions = ['vérifie que le chiffre est exact', '/verify: le chiffre est exact', '  fact check — le chiffre est exact ', 'le chiffre est exact'];
  for (const question of questions) assert.equal(withoutVerifyPrefix(question), claimFrom(question), question);
  assert.deepEqual([withoutVerifyPrefix('vérifie ça'), claimFrom('vérifie ça')], ['ça', '']);
  // No cut: only the claim is limited to what the verification takes.
  assert.equal(withoutVerifyPrefix(`vérifie ${'d'.repeat(2500)}`).length, 2500);
});

test('asking to go deeper repeats the first 1200 characters of the answer after its fixed wording', async () => {
  const { deepenRequest } = await ui('chat-requests');
  assert.equal(deepenRequest('Le chiffre est exact.'), 'Approfondis cette réponse : Le chiffre est exact.');
  assert.equal(deepenRequest('e'.repeat(1200)), `Approfondis cette réponse : ${'e'.repeat(1200)}`);
  assert.equal(deepenRequest('f'.repeat(1500)), `Approfondis cette réponse : ${'f'.repeat(1200)}`);
});

test('the window takes its claim, its question and its deepening request from the chat rules', async (t) => {
  const f = await rendererHarness(t);
  assert.equal(typeof f.get('verify').onclick, 'function', 'verification button bound');
  f.get('question').value = 'vérifie que le chiffre est exact';
  await f.click(f.get('verify'));
  assert.equal(f.get('claim').value, 'le chiffre est exact');
  assert.equal(f.get('verify-dialog').open, true);
  await f.submit(f.get('verify-form'));
  assert.equal(f.get('question').value, '');
  assert.deepEqual(f.calls, [['verify', 'le chiffre est exact']]);
  f.publish('onState', { id: 'session', history: [], segments: [] });
  f.publish('onDeepState', { jobs: [{ id: 'answer', sessionId: 'session', status: 'done', createdAt: T0,
    result: { ...observed, answer: 'Le chiffre est 7 %. ' + 'a'.repeat(1500) } }] });
  f.frame();
  const buttons = f.get('message-list').querySelectorAll('.secondary');
  await f.click(buttons.find(node => node.dataset.action === 'job-more'));
  assert.deepEqual(f.calls.at(-1), ['ask', 'Approfondis cette réponse : ' + ('Le chiffre est 7 %. ' + 'a'.repeat(1500)).slice(0, 1200)]);
  await f.click(buttons.find(node => node.dataset.action === 'job-verify'));
  assert.equal(f.get('claim').value, 'Le chiffre est 7 %. ' + 'a'.repeat(1500));
});

// ---- Controls of the window: which command is off, and which wording it takes ------------------------

const COMMANDS = {
  capture: ['new-session', 'float-record', 'observe', 'archive-resume', 'archive-new'],
  quick: ['float-explain', 'explain-moment', 'catch-up', 'mark-attention'],
  moment: ['moment-summarize', 'moment-explain', 'moment-send'],
  keep: ['keep-moment', 'float-keep'],
  chat: ['question', 'verify', 'send'],
};
const ALL_COMMANDS = Object.values(COMMANDS).flat();
const passage = { available: true };
// A session opened and paused, with one replayable passage, on a configured host with a source chosen.
const pausedSession = { id: 'session-1', readOnly: false, analyzing: false, asking: false, segments: [passage], history: [] };
const idleInput = {
  session: pausedSession, recording: false, previewOpen: false, stopping: false, captureBusy: false, quickBusy: false,
  configuration: { canObserve: true, verificationAvailable: true }, verificationBusy: false, pendingQuestion: '', source: 'screen:1',
};
// The expected `disabled` object whole: every command of the window, true for the ones listed and false for the others.
const disabledOnly = (...ids) => Object.fromEntries(ALL_COMMANDS.map(id => [id, ids.flat(Infinity).includes(id)]));
const session = overrides => ({ ...pausedSession, ...overrides });

const controlCases = [
  { name: 'a session open and paused, with a passage to ask about and to keep', input: {},
    disabled: [],
    recording: false, floatStatus: 'paused', recordTitle: 'idle', observeLabel: 'paused', askStatus: 'ready' },
  { name: 'no session', input: { session: null },
    disabled: [COMMANDS.quick, COMMANDS.keep, 'send'],
    recording: false, floatStatus: 'ready', recordTitle: 'idle', observeLabel: 'idle', askStatus: 'idle' },
  { name: 'no session and no host configuration', input: { session: null, configuration: undefined },
    disabled: [COMMANDS.quick, COMMANDS.keep, 'send', 'observe', 'verify'],
    recording: false, floatStatus: 'ready', recordTitle: 'idle', observeLabel: 'idle', askStatus: 'idle' },
  { name: 'a session open without a passage', input: { session: session({ segments: [], history: [] }) },
    disabled: [COMMANDS.keep, 'send'],
    recording: false, floatStatus: 'paused', recordTitle: 'idle', observeLabel: 'paused', askStatus: 'waiting' },
  { name: 'a session live: the capture runs and the preview is open', input: { recording: true, previewOpen: true },
    disabled: ['new-session', 'archive-new', 'observe', 'archive-resume'],
    recording: true, floatStatus: 'live', recordTitle: 'recording', observeLabel: 'recording', askStatus: 'ready' },
  { name: 'an archive with history and no passage to replay', input: { session: session({ readOnly: true, segments: [], history: [{ id: 'old' }] }) },
    disabled: [COMMANDS.keep],
    recording: false, floatStatus: 'archive', recordTitle: 'archive', observeLabel: 'archive', askStatus: 'archive' },
  { name: 'an archive with neither passage nor history', input: { session: session({ readOnly: true, segments: [], history: [] }) },
    disabled: [COMMANDS.keep, 'send'],
    recording: false, floatStatus: 'archive', recordTitle: 'archive', observeLabel: 'archive', askStatus: 'waiting' },
  { name: 'an archive that carries no id is an archive all the same', input: { session: { readOnly: true, segments: [], history: [] } },
    disabled: [COMMANDS.quick, COMMANDS.keep, 'send'],
    recording: false, floatStatus: 'archive', recordTitle: 'archive', observeLabel: 'archive', askStatus: 'idle' },
  { name: 'a capture running in an archive: the capture wins the three wordings, the archive keeps the question line',
    input: { recording: true, session: session({ readOnly: true }) },
    disabled: ['observe', 'archive-resume'],
    recording: true, floatStatus: 'live', recordTitle: 'recording', observeLabel: 'recording', askStatus: 'archive' },
  { name: 'a stop under way', input: { stopping: true },
    disabled: [COMMANDS.capture, COMMANDS.quick, COMMANDS.keep],
    recording: false, floatStatus: 'paused', recordTitle: 'idle', observeLabel: 'paused', askStatus: 'ready' },
  { name: 'an analysis under way', input: { session: session({ analyzing: true }) },
    disabled: ['new-session', 'archive-new'],
    recording: false, floatStatus: 'paused', recordTitle: 'idle', observeLabel: 'paused', askStatus: 'ready' },
  { name: 'a preview open with an analysis under way', input: { previewOpen: true, session: session({ analyzing: true }) },
    disabled: ['new-session', 'archive-new'],
    recording: false, floatStatus: 'paused', recordTitle: 'idle', observeLabel: 'paused', askStatus: 'ready' },
  { name: 'a preview open before any session', input: { previewOpen: true, session: null },
    disabled: ['new-session', 'archive-new', COMMANDS.quick, COMMANDS.keep, 'send'],
    recording: false, floatStatus: 'ready', recordTitle: 'idle', observeLabel: 'idle', askStatus: 'idle' },
  { name: 'the floating bar is busy capturing', input: { captureBusy: true },
    disabled: ['float-record', 'observe', 'archive-resume'],
    recording: false, floatStatus: 'paused', recordTitle: 'idle', observeLabel: 'paused', askStatus: 'ready' },
  { name: 'a quick command is busy', input: { quickBusy: true },
    disabled: [COMMANDS.quick, COMMANDS.moment],
    recording: false, floatStatus: 'paused', recordTitle: 'idle', observeLabel: 'paused', askStatus: 'ready' },
  { name: 'a host that cannot observe', input: { configuration: { canObserve: false, verificationAvailable: true } },
    disabled: ['observe'],
    recording: false, floatStatus: 'paused', recordTitle: 'idle', observeLabel: 'paused', askStatus: 'ready' },
  { name: 'a host without verification', input: { configuration: { canObserve: true, verificationAvailable: false } },
    disabled: ['verify'],
    recording: false, floatStatus: 'paused', recordTitle: 'idle', observeLabel: 'paused', askStatus: 'ready' },
  { name: 'a verification under way', input: { verificationBusy: true },
    disabled: ['verify'],
    recording: false, floatStatus: 'paused', recordTitle: 'idle', observeLabel: 'paused', askStatus: 'ready' },
  { name: 'a question waiting for its answer', input: { pendingQuestion: 'Qui parle ?' },
    disabled: ['send'],
    recording: false, floatStatus: 'paused', recordTitle: 'idle', observeLabel: 'paused', askStatus: 'ready' },
  { name: 'an answer under way: the line says so before anything else', input: { session: session({ asking: true }) },
    disabled: [],
    recording: false, floatStatus: 'paused', recordTitle: 'idle', observeLabel: 'paused', askStatus: 'answering' },
  { name: 'an answer under way in an archive', input: { session: session({ asking: true, readOnly: true }) },
    disabled: [],
    recording: false, floatStatus: 'archive', recordTitle: 'archive', observeLabel: 'archive', askStatus: 'answering' },
  { name: 'an answer under way before any passage', input: { session: session({ asking: true, segments: [], history: [] }) },
    disabled: [COMMANDS.keep, 'send'],
    recording: false, floatStatus: 'paused', recordTitle: 'idle', observeLabel: 'paused', askStatus: 'answering' },
  { name: 'no source chosen', input: { source: '' },
    disabled: ['observe'],
    recording: false, floatStatus: 'paused', recordTitle: 'idle', observeLabel: 'paused', askStatus: 'ready' },
  { name: 'no passage available to keep', input: { session: session({ segments: [{ available: false }] }) },
    disabled: [COMMANDS.keep],
    recording: false, floatStatus: 'paused', recordTitle: 'idle', observeLabel: 'paused', askStatus: 'ready' },
  { name: 'the passages of the history are enough to ask, not to keep', input: { session: session({ segments: [], history: [{ id: 'older' }] }) },
    disabled: [COMMANDS.keep],
    recording: false, floatStatus: 'paused', recordTitle: 'idle', observeLabel: 'paused', askStatus: 'ready' },
];

test('each state of the window gives its whole set of disabled commands, the recording class and the four wording modes', async () => {
  const { describeControls } = await ui('controls-view');
  for (const { name, input, disabled, recording, floatStatus, recordTitle, observeLabel, askStatus } of controlCases) {
    const expected = { disabled: disabledOnly(disabled), recording, floatStatus, recordTitle, observeLabel, askStatus };
    assert.deepEqual(describeControls({ ...idleInput, ...input }), expected, name);
  }
});

test('a session state without its passages makes the controls throw, as the window did, and never answers by guessing', async () => {
  const { describeControls } = await ui('controls-view');
  // The states of the host always carry segments and history: this pins what happens to one that does not.
  assert.throws(() => describeControls({ ...idleInput, session: { id: 'session-1' } }), TypeError);
  assert.throws(() => describeControls({ ...idleInput, session: { id: 'session-1', segments: [] } }), TypeError);
  assert.doesNotThrow(() => describeControls({ ...idleInput, session: { id: 'session-1', segments: [passage] } }));
});

test('every command the controls switch off is an element of the window', async () => {
  const { describeControls } = await ui('controls-view');
  const ids = new Set([...fs.readFileSync(app('index.html'), 'utf8').matchAll(/\sid="([^"]+)"/g)].map(match => match[1]));
  const switched = Object.keys(describeControls(idleInput).disabled);
  assert.equal(switched.length, 17);
  assert.deepEqual(switched.filter(id => !ids.has(id)), []);
});

test('the window applies all controls from the public capture status and reads the source once', async () => {
  const { renderCaptureControls } = await ui('capture-controls');
  for (const { name, input, disabled, recording } of controlCases) {
    const values = { ...idleInput, ...input }, nodes = new Map(), observations = [];
    const get = id => {
      if (!nodes.has(id)) nodes.set(id, { classList: { toggle: (key, value) => { nodes.get(id)[key] = value; } } });
      return nodes.get(id);
    };
    let reads = 0;
    Object.defineProperty(get('source'), 'value', { get: () => { reads++; return values.source; } });
    const { recording: isRecording, previewOpen, stopping, ...pageInput } = values;
    const capture = { recording: isRecording, previewOpen, stopping };
    renderCaptureControls({ ...pageInput, get, capture, shell: { observation: (...args) => observations.push(args) } });
    assert.deepEqual(observations, [[values.session, values.recording]], name);
    assert.equal(reads, 1, name);
    for (const [id, expected] of Object.entries(disabledOnly(disabled))) assert.equal(get(id).disabled, expected, `${name}: ${id}`);
    assert.equal(get('float-record').recording, recording, name);
    for (const id of ['float-status', 'observe', 'ask-status']) assert.equal(typeof get(id).textContent, 'string', `${name}: ${id}`);
    assert.equal(typeof get('float-record').title, 'string', name);
  }
});

test('browser composition selects the source and shares its preview with one injected recorder', async () => {
  const { createBrowserCaptureController } = await ui('browser-capture');
  const events = [], records = [];
  const track = { stop: () => events.push('track.stop') };
  const stream = { getTracks: () => [track], getVideoTracks: () => [track], getAudioTracks: () => [] };
  const video = { play: async () => events.push('play') };
  const session = { id: 'session' };
  const view = Object.fromEntries(['previewStarting', 'preview', 'changed', 'status', 'observing', 'state',
    'recording', 'settled', 'stopping', 'stopped', 'meter'].map(name => [name, () => {}]));
  view.error = error => { throw error; };
  const controller = createBrowserCaptureController({
    video, source: () => 'window:1', session: () => session, view,
    bridge: { start: async () => session, state: async () => ({ accepting: true }), stop: async () => events.push('host.stop') },
    createRecorder: options => {
      records.push(options);
      return { start: () => events.push('record'), stop: async () => events.push('recorder.stop') };
    },
  }, {
    window: { capture: { select: async id => events.push(['select', id]) } },
    navigator: { mediaDevices: { getDisplayMedia: async () => { events.push('display'); return stream; } } },
  });
  await controller.startPreview();
  await controller.observe();
  await controller.observe();
  assert.deepEqual(events, [['select', 'window:1'], 'display', 'play', 'record']);
  assert.equal(records.length, 1);
  assert.equal(records[0].stream, stream);
  assert.equal(records[0].video, video);
  assert.equal(records[0].session, session);
  await controller.stop();
  assert.deepEqual(events.slice(-3), ['recorder.stop', 'host.stop', 'track.stop']);
  assert.equal(video.srcObject, null);
});

// ---- Gardes des frontières du renderer : imports, DOM, bridge et contenu ---------------------------
const rendererFiles = ['renderer.js', 'recording.js', ...fs.readdirSync(app('ui')).filter(name => /\.m?js$/.test(name)).map(name => `ui/${name}`)];
const read = file => fs.readFileSync(app(file), 'utf8');

const elementPatterns = new Map([
  ['renderer.js', /\$\(\s*(['"])([^'"]+)\1\s*,?\s*\)/g],
  ['ui/renderer-commands.mjs', /(?:this\.)?get\(\s*(['"])([^'"]+)\1\s*,?\s*\)/g],
  ['ui/renderer-wiring.mjs', /(?:this\.)?get\(\s*(['"])([^'"]+)\1\s*,?\s*\)/g],
  ['ui/capture-actions.mjs', /this\.get\(\s*(['"])([^'"]+)\1\s*,?\s*\)/g],
  ['ui/moment-actions.mjs', /this\.get\(\s*(['"])([^'"]+)\1\s*,?\s*\)/g],
  ['ui/capture-controls.mjs', /\bget\(\s*(['"])([^'"]+)\1\s*,?\s*\)/g],
  ['ui/shell.js', /this\.get\(\s*(['"])([^'"]+)\1\s*,?\s*\)/g],
]);
const namedImportPattern = /^\s*import\s*\{([^}]+)\}\s*from\s*(['"])([^'"]+)\2\s*;?/gm;
function scanned(source, pattern, file) {
  const matches = [...source.matchAll(pattern)];
  assert.ok(matches.length > 0, `${file}: le garde n'a relevé aucune occurrence`);
  return matches;
}
const elementIds = (source, file) => scanned(source, elementPatterns.get(file), file).map(match => match[2]);
const namedImports = (source, file) => scanned(source, namedImportPattern, file).map(([, names, , target]) => ({
  target,
  names: names.split(',').map(part => part.trim().split(/\s+as\s+/)[0]).filter(Boolean),
}));
const bridgeMethods = (source, group, pattern = /\b(?:bridge|window\.tvlens)\??\.([A-Za-z]+)/g) =>
  new Set(scanned(source, pattern, group).map(match => match[1]));

// Le point d’entrée initialise la page ; sa composition importable est exercée par le banc ci-dessus.
const importRendererModule = file => import(pathToFileURL(app(file)).href);

test('static scans survive quote and line changes and reject empty input with its file or group', async () => {
  for (const [file, call] of [['renderer.js', '$'], ['ui/shell.js', 'this.get']]) {
    const expected = ['first-id', 'second-id'];
    const inline = `${call}('first-id'); ${call}('second-id');`;
    const multiline = `${call}(\n  "first-id",\n); ${call}(\n  "second-id"\n);`;
    assert.deepEqual(elementIds(inline, file), expected, file);
    assert.deepEqual(elementIds(multiline, file), expected, file);
    assert.throws(() => elementIds('const untouched = true;', file),
      error => error.code === 'ERR_ASSERTION' && error.message.includes(file));
  }
  const inline = "import { first, second as local } from './module.mjs';";
  const multiline = 'import {\n  first,\n  second as local,\n} from\n  "./module.mjs";';
  const expected = [{ target: './module.mjs', names: ['first', 'second'] }];
  assert.deepEqual(namedImports(inline, 'renderer.js'), expected);
  assert.deepEqual(namedImports(multiline, 'renderer.js'), expected);
  assert.throws(() => namedImports('const untouched = true;', 'renderer.js'),
    error => error.code === 'ERR_ASSERTION' && error.message.includes('renderer.js'));
  for (const [group, pattern] of [
    ['rendererFiles', undefined],
    ['scripts/smoke-electron.mjs', /window\.tvlens\.([A-Za-z]+)/g],
    ['scripts/probe-video-chat-live.mjs', /window\.tvlens\.([A-Za-z]+)/g],
  ]) {
    assert.deepEqual([...bridgeMethods('window.tvlens.state()', group, pattern)], ['state']);
    assert.throws(() => bridgeMethods('', group, pattern),
      error => error.code === 'ERR_ASSERTION' && error.message.includes(group));
  }
  // Ce module sans import reste vérifié par son chargement réel, sans plancher textuel.
  const icons = await importRendererModule('ui/icons.js');
  assert.equal(typeof icons.setIcon, 'function');
});

function loadRendererBridge() {
  const exposed = {};
  new Function('require', read('preload.cjs'))(name => {
    assert.equal(name, 'electron');
    return {
      contextBridge: { exposeInMainWorld: (key, api) => { exposed[key] = api; } },
      ipcRenderer: {},
    };
  });
  return exposed.tvlens;
}

test('the renderer parses, imports only what its modules export, and finds every element it asks for', async () => {
  for (const file of rendererFiles.filter(file => file !== 'renderer.js')) {
    await assert.doesNotReject(() => importRendererModule(file), `${file} ne s'importe pas sans DOM`);
  }
  const source = read('renderer.js');
  for (const { names, target } of namedImports(source, 'renderer.js')) {
    const provided = new Set(Object.keys(await importRendererModule(target)));
    for (const name of names) {
      assert.ok(provided.has(name), `renderer.js importe ${name}, absent des exports de ${target}`);
    }
  }
  // La syntaxe du renderer est compilée sans exécuter ses accès au document et au pont.
  const body = source.replace(namedImportPattern, '');
  assert.doesNotThrow(() => new vm.Script(`(async () => {${body}\n})`, { filename: 'renderer.js' }), 'renderer.js does not parse');
  const html = read('index.html'), ids = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map(match => match[1]));
  assert.equal(ids.size, [...html.matchAll(/\sid="([^"]+)"/g)].length, 'every id is unique');
  for (const file of elementPatterns.keys()) {
    for (const id of elementIds(read(file), file)) assert.ok(ids.has(id), `${file} uses #${id}, absent from index.html`);
  }
  // Thumbnails of a reopened session come through the media protocol: the page must be allowed to show them.
  assert.match(html, /img-src 'self' data: tvlens-media:/);
});

test('the renderer talks to the bridge of the contract only, and writes no ceiling or retention of its own', () => {
  const exposed = new Set(Object.keys(loadRendererBridge()));
  assert.equal(exposed.size, 57, 'app/preload.cjs expose 57 méthodes sous tvlens');
  assert.ok(!exposed.has('capture'), 'capture est un pont distinct de tvlens');
  const used = bridgeMethods(rendererFiles.map(file => shaped(file)).join('\n'), 'rendererFiles');
  for (const name of ['surveillanceState', 'surveillanceHistory', 'startSurveillance', 'stopSurveillance', 'retrySurveillanceClaim', 'openSurveillanceSource', 'onSurveillance',
    'sessions', 'openSession', 'resumeSession', 'deleteSession', 'storage', 'onSessionsChanged', 'onStorage']) assert.ok(used.has(name), `the renderer never calls ${name}`);
  for (const name of used) assert.ok(exposed.has(name), `the renderer calls ${name}, which app/preload.cjs does not expose`);
  // The two scripts that drive this window through the bridge are not run here: at least they call nothing the
  // bridge no longer exposes (the former Auto calls), and they start and read the surveillance by its own methods.
  for (const script of ['smoke-electron.mjs', 'probe-video-chat-live.mjs']) {
    const source = fs.readFileSync(path.join(__dirname, '..', 'scripts', script), 'utf8');
    const called = bridgeMethods(source, `scripts/${script}`, /window\.tvlens\.([A-Za-z]+)/g);
    for (const name of called) assert.ok(exposed.has(name), `scripts/${script} calls ${name}, which app/preload.cjs does not expose`);
    for (const name of ['startSurveillance', 'surveillanceState', 'stopSurveillance']) assert.ok(called.has(name), `scripts/${script} never calls ${name}`);
  }
  const everything = [...rendererFiles.map(read), read('index.html')].join('\n');
  // The former Auto mode is gone, bridge and wording.
  assert.ok(!/autoState|startAuto|stopAuto|openAutoSource|onAuto\b|auto-frequency|Surveillance auto|questions manuelles sont prioritaires/.test(everything));
  // Frontière produit : aucune API ou préférence ne réintroduit les signaux dans la pile.
  assert.ok(!/showSignals|watch-signals|float-toast\[data-kind/.test(everything + read('style.css')), 'no "signals on screen" setting');
  // No count written "N mot(s)": every count is agreed by ui/text.mjs, in the page and in the texts the modules build
  // (comments aside); sentences that come from the core go through agreeText where they are drawn.
  const code = file => read(file).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  for (const file of rendererFiles) assert.ok(!/\}\s[\p{L}’ ]*\p{L}\((?:s|es)\)/u.test(code(file)), `${file} writes a count with a parenthesised plural`);
  assert.ok(!/\p{L}\((?:s|es|e|x)\)/u.test(read('index.html')), 'index.html writes a parenthesised plural');
  const agreed = [['ui/job-card.js', 'view.limits'], ['ui/recap-view.js', 'state.limits'], ['ui/renderer-commands.mjs', 'found.warnings']];
  for (const [file, sentences] of agreed) assert.ok(holds(shaped(file), `agreeText(${sentences}.join(' '))`), `${file} agrees the sentences of the core`);
  // Ceilings and retention come from job.timeoutMs, the configuration and the session state.
  for (const file of [...rendererFiles, 'index.html']) {
    assert.ok(!/60\s?s\b|60 secondes|5\s?min\b|cinq minutes|Mémoire vidéo de|médias? expirés?/i.test(read(file)), `${file} states a ceiling or a retention by itself`);
    // Two files own a millisecond constant that is not a question ceiling: unit conversion, and how long a card is news.
    assert.ok(!/\b300000\b/.test(read(file)), `${file} carries the question ceiling`);
    if (!/ui\/(?:text|card-queue)\.mjs$/.test(file)) assert.ok(!/\b60000\b/.test(read(file)), `${file} carries a duration constant`);
  }
  assert.ok(!/PREUVES INSUFFISANTES/.test(read('renderer.js') + read('ui/job-card.js')), 'the label lives in the view model, where it is reserved for a completed abstention');
});

test("browser composition uses every injected factory and the real rolling recorder", async (t) => {
  const { createBrowserCaptureController } = await ui("browser-capture");
  const contexts = [],
    worklets = [],
    streams = [],
    canvases = [],
    media = [];
  const selected = [],
    displayed = [],
    scheduled = [],
    cleared = [],
    uuids = [],
    errors = [],
    ingested = [],
    blobs = [];
  const timers = new Map();
  let nextTimer = 0,
    now = 0;
  const clipBytes = Uint8Array.of(3, 1, 4, 1, 5, 9);
  const chunk = new Blob([clipBytes], { type: "video/webm" });
  class ClipBlobStub extends Blob {
    constructor(parts, options) {
      super(parts, options);
      blobs.push({ parts, options });
    }
  }
  const schedule = (kind, callback, delay) => {
    const id = ++nextTimer;
    const timer = { id, kind, callback, delay };
    scheduled.push(timer);
    timers.set(id, timer);
    return id;
  };
  const clear = (id) => {
    cleared.push(id);
    timers.delete(id);
  };
  const videoTrack = {
    stops: 0,
    stop() {
      this.stops++;
    },
  };
  const audioTrack = {
    readyState: "live",
    stops: 0,
    stop() {
      this.stops++;
    },
  };
  const stream = {
    getTracks: () => [videoTrack, audioTrack],
    getVideoTracks: () => [videoTrack],
    getAudioTracks: () => [audioTrack],
  };
  const video = {
    srcObject: null,
    videoWidth: 1280,
    videoHeight: 720,
    play: async () => {},
  };
  class AudioContextStub {
    constructor(options) {
      this.sampleRate = options.sampleRate;
      this.modules = [];
      this.inputs = [];
      this.destination = {};
      this.closed = 0;
      this.audioWorklet = { addModule: async (url) => this.modules.push(url) };
      contexts.push({ context: this, options });
    }
    async resume() {
      this.resumed = true;
    }
    createMediaStreamSource(input) {
      this.inputs.push(input);
      return {
        connect: (node) => {
          this.connected = node;
        },
        disconnect() {},
      };
    }
    async close() {
      this.closed++;
    }
  }
  class WorkletStub {
    constructor(context, name) {
      this.messages = [];
      this.port = {
        postMessage: (message) => this.messages.push(message),
        close: () => {
          this.closed = true;
        },
      };
      worklets.push({ worklet: this, context, name });
    }
    connect(destination) {
      this.destination = destination;
    }
    disconnect() {}
  }
  class MediaStreamStub {
    constructor(tracks) {
      this.tracks = tracks;
      streams.push(this);
    }
  }
  class MediaRecorderStub {
    static isTypeSupported() {
      return true;
    }
    constructor(input, options) {
      this.state = "inactive";
      this.stops = 0;
      media.push({ recorder: this, input, options });
    }
    start() {
      this.state = "recording";
    }
    stop() {
      this.state = "inactive";
      this.stops++;
      queueMicrotask(() => {
        this.ondataavailable({ data: chunk });
        this.onstop();
      });
    }
  }
  const environment = {
    window: { capture: { select: async (id) => selected.push(id) } },
    navigator: {
      mediaDevices: {
        getDisplayMedia: async (options) => {
          displayed.push(options);
          return stream;
        },
      },
    },
    AudioContext: AudioContextStub,
    AudioWorkletNode: WorkletStub,
    MediaStream: MediaStreamStub,
    MediaRecorder: MediaRecorderStub,
    Blob: ClipBlobStub,
    performance: { now: () => now },
    document: {
      createElement: (...args) => {
        const calls = { args, draws: [], contexts: [], encodings: [] };
        calls.canvas = {
          getContext: (...args) => {
            calls.contexts.push(args);
            return {
              drawImage: (...args) => calls.draws.push(args),
              getImageData: () => ({
                data: new Uint8ClampedArray(64 * 36 * 4),
              }),
            };
          },
          toDataURL: (...args) => {
            calls.encodings.push(args);
            return "data:image/jpeg;preview";
          },
        };
        canvases.push(calls);
        return calls.canvas;
      },
    },
    setTimeout: (callback, delay) => schedule("timeout", callback, delay),
    clearTimeout: clear,
    setInterval: (callback, delay) => schedule("interval", callback, delay),
    clearInterval: clear,
    crypto: {
      randomUUID: () => {
        uuids.push("uuid");
        return "native-flush-id";
      },
    },
  };
  const session = { id: "session", elapsedMs: 0, segmentMs: 8000 };
  const view = Object.fromEntries(
    [
      "previewStarting",
      "preview",
      "changed",
      "status",
      "observing",
      "state",
      "recording",
      "settled",
      "stopping",
      "stopped",
      "meter",
      "segment",
    ].map((name) => [name, () => {}]),
  );
  view.error = (error) => errors.push(error);
  const controller = createBrowserCaptureController(
    {
      video,
      source: () => "window:1",
      session: () => session,
      view,
      bridge: {
        start: async () => session,
        state: async () => ({ accepting: true }),
        stop: async () => {},
        ingest: async (passage) => {
          ingested.push(passage);
          return "moment-1";
        },
      },
    },
    environment,
  );
  t.after(() => controller.release());
  assert.equal(await controller.startPreview(), true);
  assert.deepEqual(selected, ["window:1"]);
  assert.deepEqual(displayed, [
    {
      video: { frameRate: 10, width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: true,
    },
  ]);
  const context = contexts[0].context,
    worklet = worklets[0].worklet;
  assert.deepEqual(contexts[0].options, { sampleRate: 16000 });
  assert.deepEqual(context.modules, ["./audio-worklet.js"]);
  assert.equal(context.resumed, true);
  assert.equal(worklets[0].context, context);
  assert.equal(worklets[0].name, "tvlens-pcm");
  assert.deepEqual(streams[0].tracks, [audioTrack]);
  assert.equal(context.inputs[0], streams[0]);
  assert.equal(context.connected, worklet);
  assert.equal(worklet.destination, context.destination);
  assert.equal(controller.snapshot(), "data:image/jpeg;preview");
  assert.deepEqual(canvases[0].args, ["canvas"]);
  assert.deepEqual(
    [canvases[0].canvas.width, canvases[0].canvas.height],
    [320, 180],
  );
  assert.deepEqual(canvases[0].contexts, [["2d"]]);
  assert.deepEqual(canvases[0].draws, [[video, 0, 0, 320, 180]]);
  assert.deepEqual(canvases[0].encodings, [["image/jpeg", 0.7]]);
  const flushed = controller.flushAudio();
  assert.deepEqual(uuids, ["uuid"]);
  assert.deepEqual(worklet.messages, [
    { type: "flush", id: "native-flush-id" },
  ]);
  const [timer] = timers.values();
  assert.equal(timer.kind, "timeout");
  assert.equal(timer.delay, 500);
  worklet.port.onmessage({ data: { type: "flushed", id: "native-flush-id" } });
  await flushed;
  assert.deepEqual(cleared, [timer.id]);
  assert.equal(timers.size, 0);
  let deadlineFlushed = false;
  const deadline = controller.flushAudio().then(() => {
    deadlineFlushed = true;
  });
  const [deadlineTimer] = timers.values();
  assert.equal(typeof deadlineTimer.callback, "function");
  assert.equal(deadlineTimer.delay, 500);
  deadlineTimer.callback();
  await Promise.resolve();
  assert.equal(deadlineFlushed, true);
  await deadline;
  assert.deepEqual(uuids, ["uuid", "uuid"]);
  assert.deepEqual(cleared, [timer.id, deadlineTimer.id]);
  assert.equal(timers.size, 0);
  await controller.observe();
  await controller.observe();
  assert.equal(controller.recording, true);
  assert.equal(media.length, 1);
  assert.equal(media[0].input, stream);
  assert.deepEqual(media[0].options, {
    mimeType: "video/webm;codecs=vp8,opus",
    videoBitsPerSecond: 1000000,
    audioBitsPerSecond: 64000,
  });
  assert.deepEqual(
    canvases.map((call) => call.args),
    [["canvas"], ["canvas"], ["canvas"]],
  );
  assert.deepEqual(
    scheduled.slice(2).map(({ kind, delay }) => [kind, delay]),
    [
      ["interval", 400],
      ["timeout", 2000],
      ["timeout", 10_000],
    ],
  );
  now = 1000;
  const checkpoint = controller.checkpoint();
  const audioFlush = worklet.messages.at(-1);
  assert.deepEqual(audioFlush, { type: "flush", id: "native-flush-id" });
  worklet.port.onmessage({ data: { type: "flushed", id: audioFlush.id } });
  await checkpoint;
  assert.equal(ingested.length, 1);
  const [passage] = ingested;
  assert.equal(passage.sessionId, "session");
  assert.deepEqual([passage.startMs, passage.endMs], [0, 1000]);
  assert.ok(passage.frames.length > 0);
  assert.ok(
    passage.frames.every(
      (frame) =>
        frame.atMs <= 1000 && frame.dataUrl === "data:image/jpeg;preview",
    ),
  );
  assert.ok(passage.clip instanceof Uint8Array);
  assert.deepEqual(passage.clip, clipBytes);
  assert.equal(blobs.length, 1);
  assert.deepEqual(blobs[0].options, { type: "video/webm" });
  assert.equal(blobs[0].parts.length, 1);
  assert.equal(blobs[0].parts[0], chunk);
  assert.equal(media.length, 2);
  await controller.release();
  assert.equal(ingested.length, 1);
  assert.equal(media[0].recorder.stops, 1);
  assert.equal(media[1].recorder.stops, 1);
  assert.equal(timers.size, 0);
  assert.equal(context.closed, 1);
  assert.equal(worklet.closed, true);
  assert.deepEqual(
    [videoTrack.stops, audioTrack.stops, video.srcObject],
    [1, 1, null],
  );
  assert.deepEqual(errors, []);
});

test('transcription failures keep one coded banner through redraws and reset, and a successful silence clears it', async t => {
  const f = await rendererHarness(t, { configuration: { transcription: { available: false, code: 'TVLENS_WHISPER_MODEL_MISSING' } } });
  f.wiring.drawState();
  assert.equal(f.get('transcription-warning').hidden, false);
  assert.match(f.get('transcription-warning').textContent, /modèle introuvable/);
  assert.equal(f.get('transcription-warning').dataset.code, 'TVLENS_WHISPER_MODEL_MISSING');
  assert.equal(f.get('float-transcription-warning').hidden, false);
  assert.equal(f.get('float-bar').classList.contains('transcription-missing'), true);
  const banner = f.get('transcription-warning');
  for (let i = 0; i < 3; i++) f.wiring.drawState();
  assert.equal(f.get('transcription-warning'), banner, 'redraws keep the same banner');
  f.publish('onState', { id: 'session', segments: [], transcription: { available: false, code: 'TVLENS_WHISPER_BINARY_MISSING' } });
  f.frame();
  assert.match(f.get('transcription-warning').textContent, /binaire introuvable/);
  f.publish('onReset');
  assert.equal(f.get('transcription-warning').hidden, false);
  f.publish('onState', { id: 'new-session', segments: [], transcription: { available: true, code: null } });
  f.frame();
  assert.equal(f.get('transcription-warning').hidden, true);
  assert.equal(f.get('transcription-warning').textContent, '');
  assert.equal(f.get('float-transcription-warning').hidden, true);
  assert.equal(f.get('float-bar').classList.contains('transcription-missing'), false);
});

test('a configuration refresh clears the retained transcription warning after leaving a session', async t => {
  const failed = { available: false, code: 'TVLENS_WHISPER_MODEL_MISSING' };
  const f = await rendererHarness(t, { configuration: { transcription: failed } });
  f.publish('onState', { id: 'session', segments: [], transcription: failed });
  f.frame();
  f.publish('onReset');
  assert.equal(f.get('transcription-warning').hidden, false);
  assert.equal(typeof f.wiring.receiveTranscription, 'function');
  f.wiring.receiveTranscription({ available: true, code: null });
  f.frame();
  assert.equal(f.get('transcription-warning').hidden, true);
});
