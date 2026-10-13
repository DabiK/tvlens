const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const panel = require('../tv/app/companion.js');
const surveillance = require('../tv/app/surveillance-view.js');
const sessions = require('../tv/app/sessions-view.js');
const { RemoteClient } = require('../tv/app/remote-client.js');
const overlay = require('../tv/app/surveillance-overlay.js');

// Pure view models of the TV panel: no DOM, no network, every clock injected.
const SERVER_NOW = Date.UTC(2031, 0, 1);
const GIB = 1024 ** 3;
const running = (extra = {}) => ({ id: 'deep-1', status: 'running', question: 'Q ?', anchorMs: 760000, startedAt: SERVER_NOW - 72000, timeoutMs: 300000, ...extra });
const compact = (extra = {}) => ({
  version: 1, enabled: true, sessionId: 's1',
  activation: { id: 'act-1', instruction: 'Vérifie les chiffres annoncés.', t0Ms: 760000, startedAt: SERVER_NOW - 60000, stoppedAt: null, stopReason: null },
  activity: { state: 'listening', label: 'Surveillance active.', detecting: false, running: 0, waiting: 0, late: false },
  backlog: { late: false, reason: null, passagesPending: 0, passagesFailed: 0, failure: null, claimsWaiting: 0, oldestClaimWaitMs: 0 },
  counts: { detected: 0, queued: 0, running: 0, sourced: 0, undetermined: 0, error: 0, cancelled: 0, noted: 0 },
  overlay: { seq: 0, cards: [] }, signals: { seq: 0, cards: [] }, ...extra,
});
const sourcedCard = (seq, extra = {}) => ({
  id: 'lot-' + seq, kind: 'verification', label: 'Sources consultées', seq, text: 'Le chiffre annoncé concorde avec la dernière publication.',
  interval: { startMs: 760000, endMs: 768000 }, sources: [{ url: 'https://www.insee.fr/statistiques/1', title: 'Taux de chômage', publisher: 'Insee' }],
  publishedAtMs: 770000, finishedAt: SERVER_NOW - 2000, ...extra,
});

test('a running question shows elapsed over its own ceiling, from the server clock only', () => {
  const view = panel.describeJob(running(), { serverNowMs: SERVER_NOW, jobs: [running()] });
  assert.equal(view.statusLabel, 'En cours');
  assert.deepEqual({ ...view.progress }, { status: 'running', position: null, total: null, elapsedMs: 72000, timeoutMs: 300000, label: 'En cours · 1:12 / 5:00 max' });
  // The ceiling is the one the server really enforces for this question, not a literal of the panel.
  assert.equal(panel.describeJobProgress(running({ timeoutMs: 120000 }), { serverNowMs: SERVER_NOW }).label, 'En cours · 1:12 / 2:00 max');
  assert.equal(panel.describeJobProgress(running({ timeoutMs: undefined }), { serverNowMs: SERVER_NOW, timeoutMs: 90000 }).label, 'En cours · 1:12 / 1:30 max');
  assert.equal(panel.describeJobProgress(running({ timeoutMs: undefined }), { serverNowMs: SERVER_NOW }).label, 'En cours · 1:12 / 5:00 max', 'a question saved before the field existed falls back to five minutes');
  // Never past the ceiling, never negative: a late poll or a clock step cannot show nonsense.
  assert.equal(panel.describeJobProgress(running(), { serverNowMs: SERVER_NOW + 3600000 }).label, 'En cours · 5:00 / 5:00 max');
  assert.equal(panel.describeJobProgress(running(), { serverNowMs: SERVER_NOW - 600000 }).label, 'En cours · 0:00 / 5:00 max');
  // Without a server clock (older server) the panel counts from when it first saw the card running;
  // the wall clock of the TV is not an input of this function at all.
  assert.equal(panel.describeJobProgress(running(), { localElapsedMs: 23400 }).label, 'En cours · 0:23 / 5:00 max');
  assert.equal(panel.describeJobProgress(running(), {}).label, 'En cours · arrêt au plus tard à 5:00');
  const realNow = Date.now;
  Date.now = () => { throw new Error('the TV wall clock must not be read'); };
  try { assert.equal(panel.describeJob(running(), { serverNowMs: SERVER_NOW }).progress.elapsedMs, 72000); } finally { Date.now = realNow; }
});

test('a queued question shows its place in the queue, and a finished one no live line', () => {
  const jobs = [running(), { id: 'deep-2', status: 'queued' }, { id: 'deep-3', status: 'done' }, { id: 'deep-4', status: 'queued' }];
  assert.equal(panel.describeJob(jobs[1], { jobs }).progress.label, 'En file · position 1 sur 2');
  assert.equal(panel.describeJob(jobs[3], { jobs }).progress.label, 'En file · position 2 sur 2');
  assert.equal(panel.describeJob(jobs[3], { jobs: [jobs[3]] }).progress.label, 'En file · position 1');
  assert.equal(panel.describeJob(jobs[1], {}).progress.label, 'En file', 'no list, no invented position');
  assert.equal(panel.describeJob(jobs[2], { jobs }).progress, null);
  assert.equal(panel.describeJob({ status: 'timeout' }).progress, null);
  // The fixed cancel button acts on the running question, otherwise on the last one queued.
  assert.equal(panel.cancelTarget(jobs).id, 'deep-1');
  assert.equal(panel.cancelTarget(jobs.slice(1)).id, 'deep-4');
  assert.equal(panel.cancelTarget([jobs[2]]), null);
  assert.equal(panel.cancelTarget(undefined), null);
});

test('the freshness of a question comes from job.availability and is never widened', () => {
  const availability = { startMs: 472000, throughMs: 768000, anchorMs: 771000, passages: 37, lastPassage: { id: 'moment-96', startMs: 760000, endMs: 768000 } };
  assert.equal(panel.describeJob(running({ availability })).freshness, 'Mémoire disponible jusqu’à 12:48 au moment de la question · dernier passage reçu 12:40–12:48');
  assert.equal(panel.describeJob(running({ availability: { ...availability, throughMs: 5528000, lastPassage: { id: 'moment-691', startMs: 5520000, endMs: 5528000 } } })).freshness,
    'Mémoire disponible jusqu’à 1:32:08 au moment de la question · dernier passage reçu 1:32:00–1:32:08', 'a film is longer than an hour');
  assert.equal(panel.describeJob(running({ availability: { startMs: 0, throughMs: 0, anchorMs: 3000, passages: 0, lastPassage: null } })).freshness, 'Aucun passage n’était encore reçu au moment de la question');
  assert.equal(panel.describeJob(running()).freshness, null, 'a server that does not publish the field shows nothing');
  // An answer that is over carries a short label; the whole sentence stays available, it is not repeated above every answer.
  const done = panel.describeJob({ ...running({ availability }), status: 'done', result: { kind: 'observation', answer: 'R.' } });
  assert.deepEqual([done.freshnessShort, done.freshness], ['Mémoire jusqu’à 12:48', 'Mémoire disponible jusqu’à 12:48 au moment de la question · dernier passage reçu 12:40–12:48']);
  assert.ok(done.freshnessShort.length <= 24 && done.freshness.length > 3 * done.freshnessShort.length);
  assert.equal(panel.describeJobFreshnessShort({ availability: { ...availability, throughMs: 5528000 } }), 'Mémoire jusqu’à 1:32:08');
  assert.equal(panel.describeJobFreshnessShort({ availability: { startMs: 0, throughMs: 0, anchorMs: 3000, passages: 0, lastPassage: null } }), 'Aucun passage reçu à l’envoi');
  assert.equal(panel.describeJob(running()).freshnessShort, null);
});

test('no duration literal is left in the panel: every ceiling shown is derived', () => {
  const app = path.resolve(__dirname, '../tv/app');
  for (const name of ['companion.js', 'index.html', 'timeline-view.js', 'capture-control.js', 'surveillance-view.js', 'sessions-view.js', 'remote-client.js']) {
    const source = fs.readFileSync(path.join(app, name), 'utf8');
    assert.equal((/60\s*secondes|60\s*s\b|maximum\s+60|cinq minutes|supprimer les miniatures|média expiré/i.exec(source) || [null])[0], null, name);
  }
  assert.equal(panel.describeJob({ status: 'timeout' }).error, 'Délai atteint.');
  assert.equal(panel.describeJob({ status: 'timeout', message: 'Limite de 5 minutes atteinte.' }).error, 'Limite de 5 minutes atteinte.', 'the server words its own ceiling');
});

test('poll policy: fast chat view while a question moves, panel view otherwise, complete state for an older server', () => {
  const idle = { timeline: { cards: [] }, chat: { jobs: [{ id: 'deep-1', status: 'done' }] } };
  const busy = { timeline: { cards: [] }, chat: { jobs: [{ id: 'deep-1', status: 'done' }, { id: 'deep-2', status: 'queued' }] } };
  assert.deepEqual(panel.pollPolicy(null, 0), { view: 'panel', delayMs: 1000 }, 'first poll');
  for (const turn of [0, 1, 2, 3, 4, 5]) assert.deepEqual(panel.pollPolicy(idle, turn), { view: 'panel', delayMs: 1000 });
  assert.deepEqual([0, 1, 2, 3, 4, 5, 6, 7, 8].map(turn => panel.pollPolicy(busy, turn).view), ['panel', 'chat', 'chat', 'chat', 'panel', 'chat', 'chat', 'chat', 'panel'], 'the timeline keeps moving: one poll out of four');
  assert.ok([0, 1, 2, 3].every(turn => panel.pollPolicy(busy, turn).delayMs === 250));
  assert.deepEqual(panel.pollPolicy({ chat: busy.chat }, 1), { view: 'panel', delayMs: 250 }, 'the chat view carries no timeline: a session needs one panel view first');
  assert.deepEqual(panel.pollPolicy(busy, 1, { legacy: true }), { view: null, delayMs: 1000 }, 'older server: complete state at the former cadence');
  assert.deepEqual(panel.pollPolicy(busy, 1, { activeMs: 500, idleMs: 2000 }), { view: 'chat', delayMs: 500 }, 'cadences can be set by the pairing file');
  assert.deepEqual(panel.pollPolicy(idle, 1, { activeMs: 500, idleMs: 2000 }), { view: 'panel', delayMs: 2000 });
  assert.deepEqual(panel.pollPolicy(idle, 1, { activeMs: 0, idleMs: -5 }), { view: 'panel', delayMs: 1000 }, 'a wrong setting falls back to the default, never to a tight loop');
  assert.deepEqual({ ...panel.POLL }, { activeMs: 250, idleMs: 1000, panelEvery: 4, timeoutMs: 300000, viewRetryMs: 10000, backoffMaxMs: 8000 });
});

// The poll loop as the panel runs it (TvlensPollPlan.read, then the wait it asks for), on a virtual clock.
// respond(view, now) stands for the server: it returns a body or throws what the transport would throw.
async function drivePolls(plan, state, respond, untilMs) {
  const requests = [], reads = [];
  let now = 0;
  const client = { state: async view => { requests.push({ at: now, resource: view || 'full' }); return { value: respond(view || 'full', now), notModified: false }; } };
  while (now < untilMs) {
    try { reads.push((await plan.read(client, state, () => now)).view || 'full'); } catch { reads.push('failed'); }
    now += plan.delay(state, now);
  }
  return { requests, reads };
}
const refusal = (status, message) => Object.assign(new Error(message), { status });
const outage = () => Object.assign(new Error('Connexion impossible.'), { network: true });

test('a passing 400 on a view is not a server without views: the complete state stands in, then the views come back', async () => {
  const idle = { timeline: { cards: [] }, chat: { jobs: [] } };
  // One 400 without a reason (this server answers 400 to every exception without a status), at the third poll.
  let plan = new panel.PollPlan();
  let polls = 0;
  const passing = await drivePolls(plan, idle, view => { if (view === 'panel' && ++polls === 3) throw refusal(400, 'Curseur d’historique invalide.'); return {}; }, 16000);
  assert.equal(plan.legacy, false, 'not sticky');
  assert.deepEqual(passing.reads.slice(0, 4), ['panel', 'panel', 'full', 'full'], 'the poll that was refused still brought a state back');
  assert.deepEqual(passing.requests.slice(2, 4).map(r => [r.at, r.resource]), [[2000, 'panel'], [2000, 'full']]);
  const back = passing.requests.findIndex((request, index) => index > 3 && request.resource === 'panel');
  assert.deepEqual([passing.requests[back].at, passing.requests.slice(3, back).every(r => r.resource === 'full'), passing.reads.at(-1)], [12000, true, 'panel'], 'views again ten seconds later, and they stay');
  assert.equal(passing.requests.filter(r => r.resource === 'full').length, 10, 'the megabyte state is read for ten seconds, not until the panel is reloaded');
  // The server says it does not know the view, or routes on the exact URL (an older one): the complete state for good.
  for (const error of [refusal(400, 'Vue d’état inconnue.'), refusal(404, 'Route inconnue.')]) {
    plan = new panel.PollPlan();
    const older = await drivePolls(plan, idle, view => { if (view !== 'full') throw error; return {}; }, 30000);
    assert.equal(plan.legacy, true, error.message);
    assert.deepEqual([older.requests.filter(r => r.resource !== 'full').length, older.reads.every(read => read === 'full'), older.reads.length], [1, true, 30], 'one attempt, then once per second as before');
  }
  // A refusal that is not about the view (token, server error) is a failed poll, never a fallback.
  plan = new panel.PollPlan();
  const refused = await drivePolls(plan, idle, () => { throw refusal(401, 'Jeton refusé.'); }, 3000);
  assert.deepEqual([plan.legacy, plan.viewsAfter, refused.requests.every(r => r.resource === 'panel'), refused.reads.every(read => read === 'failed')], [false, 0, true, true]);
});

test('an outage backs the polls off even while a question runs, and the first answer restores the cadence', async () => {
  const busy = { timeline: { cards: [] }, chat: { jobs: [{ id: 'deep-1', status: 'running' }] } };
  const idle = { timeline: { cards: [] }, chat: { jobs: [] } };
  for (const [name, state] of [['running question', busy], ['at rest', idle]]) {
    const plan = new panel.PollPlan();
    const down = await drivePolls(plan, state, () => { throw outage(); }, 60000);
    const at = down.requests.map(r => r.at);
    assert.deepEqual(at.slice(0, 6), [0, 1000, 3000, 7000, 15000, 23000], name + ': 1 s, 2 s, 4 s, then 8 s at most');
    assert.equal(at.filter(t => t < 4000).length, 3, name + ': three requests in four seconds of outage (sixteen before, with a question running)');
    assert.ok(down.reads.every(read => read === 'failed') && plan.failures === down.reads.length);
  }
  // The server comes back: the very next wait is the normal one again (fast while the question runs).
  const plan = new panel.PollPlan();
  const recovering = await drivePolls(plan, busy, (view, now) => { if (now < 3000) throw outage(); return {}; }, 4000);
  assert.deepEqual(recovering.requests.map(r => r.at), [0, 1000, 3000, 3250, 3500, 3750]);
  assert.equal(plan.failures, 0);
  // Without a failure nothing changed: four polls a second while a question runs.
  assert.equal((await drivePolls(new panel.PollPlan(), busy, () => ({}), 4000)).requests.length, 16);
  assert.deepEqual(panel.pollPolicy(busy, 1, { failures: 3, idleMs: 20000 }), { view: 'chat', delayMs: 20000 }, 'never shorter than the idle cadence the pairing file asked for');
});

test('a new body is merged: questions by identifier, and a chat view never erases the panel view', () => {
  const job = (n, status) => ({ id: 'deep-' + n, status });
  const held = { view: 'panel', revision: 4, serverNowMs: 1000, session: { id: 's1', elapsedMs: 100, segments: [{ id: 'moment-1' }], unavailableIds: ['moment-0'] }, timeline: { sessionId: 's1', cards: [{ id: 'moment-1' }] }, captureGapCount: 2,
    chat: { jobs: [job(1, 'done'), job(2, 'done'), job(3, 'running')], total: 3, timeoutMs: 300000 } };
  // The chat view lists the moving questions and the most recent ones only: an absence is not a deletion.
  const chat = panel.mergeState(held, { view: 'chat', revision: 5, serverNowMs: 2000, session: { id: 's1', elapsedMs: 900 }, chat: { jobs: [job(3, 'done'), job(4, 'queued')], total: 4, timeoutMs: 300000 } }, 'chat');
  assert.deepEqual(chat.chat.jobs, [job(1, 'done'), job(2, 'done'), job(3, 'done'), job(4, 'queued')]);
  assert.deepEqual([chat.revision, chat.serverNowMs, chat.chat.total], [5, 2000, 4]);
  assert.deepEqual(chat.session, { id: 's1', elapsedMs: 900, segments: [{ id: 'moment-1' }], unavailableIds: ['moment-0'] }, 'header refreshed, passages kept');
  assert.deepEqual([chat.timeline, chat.captureGapCount], [held.timeline, 2], 'the timeline of the panel view survives a chat view');
  // A panel view replaces everything it carries, and still keeps the older questions.
  const next = panel.mergeState(chat, { view: 'panel', revision: 6, session: { id: 's1', elapsedMs: 1200, segments: [], unavailableIds: [] }, timeline: { sessionId: 's1', cards: [] }, chat: { jobs: [job(12, 'running'), job(4, 'done')], total: 12 } }, 'panel');
  assert.deepEqual(next.chat.jobs.map(j => j.id + ':' + j.status), ['deep-1:done', 'deep-2:done', 'deep-3:done', 'deep-4:done', 'deep-12:running'], 'ordered by number, not by text');
  assert.deepEqual(next.timeline.cards, []);
  // Another session, or none: nothing of the former one is kept.
  const other = { view: 'panel', session: { id: 's2' }, chat: { jobs: [job(1, 'queued')] } };
  assert.equal(panel.mergeState(next, other, 'panel'), other);
  const none = { view: 'panel', session: null, chat: { jobs: [] } };
  assert.equal(panel.mergeState(next, none, 'panel'), none);
  assert.equal(panel.mergeState(null, held, 'panel'), held);
});

test('the transport revalidates with If-None-Match, keeps the body on 304 and never sends a tag it was not given', async () => {
  const calls = [];
  const replies = [];
  const fetcher = async (url, init) => { calls.push({ url, tag: init.headers['If-None-Match'] ?? null, method: init.method }); return replies.shift(); };
  const reply = (status, body, tag) => ({ status, ok: status >= 200 && status < 300, json: async () => { if (body === undefined) throw new SyntaxError('empty'); return body; }, headers: { get: name => (name === 'ETag' ? tag ?? null : null) } });
  const client = new RemoteClient({ url: 'http://server.test/', token: 't'.repeat(32) }, fetcher);
  const first = { revision: 1 };
  replies.push(reply(200, first, '"a-panel-1"'), reply(304, undefined, '"a-panel-1"'), reply(200, { revision: 2 }, '"a-panel-2"'), reply(304, undefined, '"a-panel-2"'));
  assert.deepEqual(await client.state('panel'), { value: first, notModified: false });
  const second = await client.state('panel');
  assert.equal(second.notModified, true);
  assert.equal(second.value, first, 'a 304 hands back the very body that is held');
  assert.deepEqual(await client.state('panel'), { value: { revision: 2 }, notModified: false });
  assert.deepEqual((await client.state('panel')).value, { revision: 2 });
  assert.deepEqual(calls.map(c => c.tag), [null, '"a-panel-1"', '"a-panel-1"', '"a-panel-2"']);
  assert.ok(calls.every(c => c.url === 'http://server.test/v1/state?view=panel' && c.method === 'GET'), 'the poll URL never varies');
  // Each resource has its own tag; the complete state of an older server has none, so nothing is ever sent back.
  replies.push(reply(200, { view: 'chat' }, '"a-chat-2"'), reply(200, { full: true }), reply(200, { full: true }));
  await client.state('chat');
  await client.state();
  await client.state();
  assert.deepEqual(calls.slice(4).map(c => [c.url.replace('http://server.test', ''), c.tag]), [['/v1/state?view=chat', null], ['/v1/state', null], ['/v1/state', null]]);
  // A refusal keeps its status and the reason code of the server; an empty error body is still a refusal.
  replies.push(reply(404, { error: 'Route inconnue.' }), reply(507, { error: 'Espace disque insuffisant.', code: 'storage-full' }), reply(404, undefined));
  await assert.rejects(client.state('panel'), error => error.status === 404 && error.message === 'Route inconnue.');
  await assert.rejects(client.sessionAction('11111111-1111-4111-8111-111111111111', 'resume'), error => error.status === 507 && error.code === 'storage-full' && /insuffisant/.test(error.message));
  await assert.rejects(client.request('/ambient'), error => error.status === 404 && error.message === 'Serveur indisponible');
  assert.equal(calls.at(-2).url, 'http://server.test/v1/sessions/11111111-1111-4111-8111-111111111111/resume');
  // An unreachable host has no status, and is worded by the panel rather than by the engine.
  const down = new RemoteClient({ url: 'http://server.test', token: 't' }, async () => { throw new TypeError('Failed to fetch'); });
  await assert.rejects(down.state('panel'), error => error.network === true && error.status === undefined && error.message === 'Connexion impossible.');
  const slow = new RemoteClient({ url: 'http://server.test', token: 't' }, async () => { throw Object.assign(new Error('The user aborted a request.'), { name: 'AbortError' }); });
  await assert.rejects(slow.request('/capture'), error => error.network === true && error.message === 'Pas de réponse dans le délai imparti.');
  // A 304 for a resource of which nothing is held cannot be used: it is an error, not an empty state.
  replies.push(reply(304, undefined));
  await assert.rejects(new RemoteClient({ url: 'http://server.test', token: 't' }, fetcher).state('panel'));
});

test('surveillance state: activation, counters, lateness with its cause and the number of unread passages', () => {
  const session = { id: 's1', accepting: true, readOnly: false };
  const off = surveillance.describeSurveillance({ ...compact({ enabled: false, activation: null }), activity: { state: 'idle', label: 'Surveillance inactive.' } }, { session });
  assert.deepEqual([off.available, off.enabled, off.canStart, off.canStop, off.toggleLabel, off.status, off.counts], [true, false, true, false, 'Activer la surveillance', 'Surveillance inactive.', '']);
  const on = surveillance.describeSurveillance(compact({ counts: { detected: 1, queued: 2, running: 1, sourced: 3, undetermined: 1, error: 0, cancelled: 0, noted: 2 } }), { session });
  assert.deepEqual([on.enabled, on.canStart, on.canStop, on.toggleLabel], [true, false, true, 'Arrêter la surveillance']);
  assert.equal(on.status, 'Surveillance active. Depuis 12:40.');
  assert.equal(on.instruction, 'Vérifie les chiffres annoncés.');
  assert.equal(on.counts, '3 sourcées · 1 indéterminée · 3 en attente · 1 en cours · 2 signalements');
  assert.deepEqual([on.alerts, on.late, on.total], [[], false, 10]);
  const late = cause => surveillance.describeSurveillance(compact({ backlog: { late: true, passagesPending: 7, passagesFailed: 3, claimsWaiting: 5, ...cause } }), { session });
  assert.deepEqual(late({ reason: 'detection-failed' }).alerts, ['Lecture des passages en échec : 3 passages non lus.']);
  assert.deepEqual(late({ reason: 'detection-failed', passagesFailed: 1 }).alerts, ['Lecture des passages en échec : 1 passage non lu.']);
  assert.deepEqual(late({ reason: 'verification' }).alerts, ['Vérifications en retard : 5 affirmations en attente.']);
  assert.deepEqual(late({ reason: 'detection' }).alerts, ['Lecture en retard : 7 passages à lire.']);
  assert.deepEqual(late({ reason: 'registry-full' }).alerts, ['Registre plein : les nouveaux passages ne sont plus lus.']);
  assert.equal(late({ reason: 'detection' }).late, true);
  // A number that is 0 is never told: the cause alone, and a check that runs late with nothing queued for what it is.
  assert.deepEqual([late({ reason: 'verification', claimsWaiting: 0 }).alerts, late({ reason: 'verification', claimsWaiting: 1 }).alerts],
    [['Vérification en cours : elle a pris du retard.'], ['Vérifications en retard : 1 affirmation en attente.']]);
  assert.deepEqual([late({ reason: 'detection-failed', passagesFailed: 0 }).alerts, late({ reason: 'detection', passagesPending: 0 }).alerts], [['Lecture des passages en échec.'], ['Lecture en retard.']]);
  // Passages given up stay counted once the reading works again.
  assert.deepEqual(surveillance.describeSurveillance(compact({ backlog: { late: false, passagesFailed: 2 } }), { session }).alerts, ['2 passages n’ont pas pu être lus depuis l’activation.']);
  // A capture that stopped starves the surveillance: said, and nothing resumes by itself.
  assert.deepEqual(surveillance.describeSurveillance(compact(), { session: { ...session, accepting: false } }).alerts, ['Capture arrêtée : la surveillance ne reçoit plus de passage. Rien ne reprend seul.']);
  // An archive is only read, no session means nothing to watch, an older server has no surveillance at all.
  const archive = surveillance.describeSurveillance(compact({ enabled: false }), { session: { id: 's1', readOnly: true, accepting: false } });
  assert.deepEqual([archive.canStart, archive.canStop], [false, false]);
  assert.match(archive.status, /^Archive en lecture seule/);
  assert.deepEqual([surveillance.describeSurveillance(compact({ enabled: false }), { session: null }).canStart, surveillance.describeSurveillance(compact({ enabled: false }), { session: null }).status], [false, 'Démarre la capture TV pour activer la surveillance.']);
  assert.deepEqual([surveillance.describeSurveillance(undefined, { session }).available, surveillance.describeSurveillance(undefined, { session }).status], [false, 'Surveillance indisponible : serveur à mettre à jour.']);
});

test('surveillance activity is told in the words of the state: restoring, failed reading, a registry that is not saved', () => {
  const session = { id: 's1', accepting: true, readOnly: false };
  const view = extra => surveillance.describeSurveillance(compact(extra), { session });
  // Lateness worded by the server: said once, with its cause and the number that belongs to it.
  const failing = view({ activity: { state: 'late', label: 'Lecture des passages en échec : 3 passages non lus.', detecting: false, running: 0, waiting: 0, late: true },
    backlog: { late: true, reason: 'detection-failed', passagesPending: 0, passagesFailed: 3, claimsWaiting: 0 } });
  assert.deepEqual([failing.status, failing.alerts, failing.late], ['Lecture des passages en échec : 3 passages non lus. Depuis 12:40.', [], true]);
  assert.doesNotMatch(JSON.stringify(failing), /0 en attente|en retard ·/);
  const behind = view({ activity: { state: 'late', label: 'Vérifications en retard : 5 affirmations en attente.', waiting: 5, late: true }, backlog: { late: true, reason: 'verification', claimsWaiting: 5 } });
  assert.deepEqual([behind.status, behind.alerts], ['Vérifications en retard : 5 affirmations en attente. Depuis 12:40.', []]);
  // One check still running 90 s after its claim was found, nothing queued behind it: the core words a 0
  // (reason "verification", claimsWaiting 0). Line and pill say a late check, never "0 … en attente".
  const aloneState = compact({ activity: { state: 'late', label: 'Vérifications en retard : 0 affirmation en attente.', detecting: false, running: 1, waiting: 0, late: true },
    backlog: { late: true, reason: 'verification', passagesPending: 0, passagesFailed: 0, claimsWaiting: 0 }, counts: { detected: 0, queued: 0, running: 1, sourced: 0, undetermined: 0, error: 0, cancelled: 0, noted: 0 } });
  const alone = surveillance.describeSurveillance(aloneState, { session });
  assert.deepEqual([alone.status, alone.alerts, alone.late, alone.counts], ['Vérification en cours : elle a pris du retard. Depuis 12:40.', [], true, '1 en cours']);
  assert.deepEqual(overlay.describeActivity(aloneState), { label: 'Vérification en cours · en retard', late: true });
  assert.doesNotMatch(JSON.stringify([alone, overlay.describeActivity(aloneState)]), /\b0 (?:en attente|affirmation)|en retard ·/);
  // The saved registry is being read: said as such, nothing else is shown as if it were final.
  const restoringState = { activity: { state: 'restoring', label: 'Restauration du suivi enregistré…', detecting: false, running: 0, waiting: 0, late: false },
    activation: { id: null, provisional: true, instruction: 'Vérifie les chiffres annoncés.', t0Ms: 760000 }, registry: { ready: false, persisted: false, status: 'restoring', message: 'Restauration du suivi enregistré…' },
    counts: { detected: 0, queued: 0, running: 0, sourced: 4, undetermined: 1, error: 0, cancelled: 0, noted: 0 }, backlog: { late: true, reason: 'detection', passagesPending: 9, passagesFailed: 2 } };
  const restoring = view(restoringState);
  assert.deepEqual([restoring.status, restoring.restoring, restoring.counts, restoring.alerts, restoring.late, restoring.total, restoring.historyLabel, restoring.canStop],
    ['Restauration du suivi enregistré…', true, '', [], false, 0, 'Historique', true]);
  assert.equal(view({ ...restoringState, enabled: false }).status, 'Restauration du suivi enregistré…', 'a stop asked while the folder is read still says what is going on');
  // Ready but not saved with the session: the message of the server, for as long as it holds.
  const kept = status => view({ registry: { ready: true, persisted: false, status, message: 'Écriture du suivi en échec. Historique en mémoire seulement : il ne sera pas enregistré tant que l’écriture échoue.' } });
  assert.deepEqual([kept('write-failed').notice, kept('write-failed').alerts, kept('write-failed').status],
    ['Écriture du suivi en échec. Historique en mémoire seulement : il ne sera pas enregistré tant que l’écriture échoue.', ['Écriture du suivi en échec. Historique en mémoire seulement : il ne sera pas enregistré tant que l’écriture échoue.'], 'Surveillance active. Depuis 12:40.']);
  assert.deepEqual([view({ registry: { ready: true, persisted: true, status: 'ready', message: null } }).notice, view({}).notice, view({ registry: { ready: false, persisted: false, status: 'restoring', message: 'Restauration du suivi enregistré…' } }).notice], [null, null, null]);
  // The button counts claims, like the counters; the list says how many lines they make. The two never contradict each other.
  const counted = view({ counts: { detected: 0, queued: 0, running: 0, sourced: 3, undetermined: 1, error: 0, cancelled: 0, noted: 0 } });
  assert.deepEqual([counted.total, counted.historyLabel, view({}).historyLabel], [4, 'Historique · 4 affirmations', 'Historique']);
  assert.equal(surveillance.describeHistoryStatus({ items: 2, claims: 4, loaded: 2 }), '2 éléments pour 4 affirmations · du plus récent au plus ancien');
  assert.equal(surveillance.describeHistoryStatus({ items: 25, claims: 25, loaded: 20 }), '25 éléments · du plus récent au plus ancien · 20 chargés');
  assert.equal(surveillance.describeHistoryStatus({ items: 1, loaded: 1, stale: true }), '1 élément · du plus récent au plus ancien · nouveaux éléments : Retour puis Historique pour actualiser');
  assert.equal(surveillance.describeHistoryStatus({ items: 0, claims: 0, loaded: 0 }), 'Aucun résultat pour l’instant. Les affirmations relevées apparaîtront ici.');
});

test('a restored history is not news: the reference of the header count waits for a ready registry', () => {
  const state = (seq, registry, id = 's1') => ({ session: { id }, surveillance: compact({ overlay: { seq, cards: [] }, signals: { seq: 0, cards: [] }, registry }) });
  const fresh = (reference, marks) => Math.max(0, marks.overlay - reference.overlay - reference.shown) + Math.max(0, marks.signals - reference.signals) + Math.max(0, marks.undetermined - reference.undetermined);
  const ready = { ready: true, persisted: true, status: 'ready', message: null }, reading = { ready: false, persisted: false, status: 'restoring', message: 'Restauration du suivi enregistré…' };
  // Activation on a session whose folder holds seven results: 0 while it is read, 7 once restored, 8 with a new one.
  let reference = null;
  const seen = [];
  for (const [seq, registry] of [[0, ready], [0, reading], [0, reading], [7, ready], [7, ready], [8, ready]]) {
    const marks = panel.registryMarks(state(seq, registry));
    reference = panel.badgeReference(reference, marks);
    seen.push(fresh(reference, marks));
  }
  assert.deepEqual(seen, [0, 0, 0, 0, 0, 1], 'seven restored results are not announced, the eighth is');
  // A server that publishes no registry block (older) keeps the reference of the first state, as before.
  reference = panel.badgeReference(null, panel.registryMarks(state(2, undefined)));
  assert.equal(fresh(panel.badgeReference(reference, panel.registryMarks(state(5, undefined))), panel.registryMarks(state(5, undefined))), 3);
  assert.equal(panel.badgeReference(reference, panel.registryMarks(state(1, ready, 's2'))).sessionId, 's2', 'another session: a new reference');
  // The queue of the card follows the same rule: nothing is taken while the registry is read, and the cursor is placed afterwards.
  let now = 0;
  const queue = new overlay.OverlayQueue({ now: () => now });
  const feed = (seq, cards, registry) => queue.ingest({ sessionId: 's1', serverNowMs: SERVER_NOW, overlay: { seq, cards }, registry });
  feed(0, [], ready);
  feed(0, [], reading);
  assert.deepEqual(feed(7, [sourcedCard(6), sourcedCard(7)], ready), { added: 0, skipped: 0 });
  assert.deepEqual([queue.tick(false).card, queue.state().cursor, queue.state().counts.shown], [null, 7, 0]);
  assert.deepEqual(feed(8, [sourcedCard(7), sourcedCard(8)], ready), { added: 1, skipped: 0 });
  assert.equal(queue.tick(false).card.id, 'lot-8');
});

test('only a sourced verification may reach the bottom-left card; signals and open claims are history only', () => {
  const signal = { id: 'lot-9', kind: 'signal', label: 'Repéré dans la vidéo', seq: 5, text: 'Le plateau revient sur les retraites.', sources: [] };
  const state = compact({ overlay: { seq: 6, cards: [sourcedCard(4), { ...sourcedCard(5), sources: [] }, { ...signal, seq: 6, sources: [{ url: 'https://example.org' }] }, { ...sourcedCard(7), kind: undefined }, { ...sourcedCard(8), seq: undefined }] }, signals: { seq: 5, cards: [signal] } });
  assert.deepEqual(surveillance.overlayCards(state).map(card => card.id), ['lot-4'], 'unsourced, signal, untyped and unnumbered cards are dropped');
  assert.deepEqual(surveillance.overlayCards({ signals: { cards: [signal] } }), [], 'signals.cards is never read');
  assert.deepEqual(surveillance.overlayCards(null), []);
  // The queue of the overlay module, driven as the panel drives it: the session's first body places the
  // cursor (no replay), then only the sourced verification is ever handed back for display.
  let now = 0;
  const queue = new overlay.OverlayQueue({ now: () => now, displayMs: 14000 });
  const feed = (seq, cards) => queue.ingest({ sessionId: 's1', serverNowMs: SERVER_NOW, elapsedMs: 772000, overlay: { seq, cards } });
  feed(3, [sourcedCard(3)]);
  assert.equal(queue.tick(false).card, null, 'a result published before the panel opened is not replayed');
  feed(6, state.overlay.cards);
  const shown = queue.tick(false);
  assert.equal(shown.card.id, 'lot-4');
  assert.deepEqual(overlay.describeCard(shown.card, { more: shown.more }), { kicker: 'Sources consultées · 12:40–12:48', text: 'Le chiffre annoncé concorde avec la dernière publication.', sourcesLine: 'Sources : insee.fr', footer: '', accent: 'verification' });
  assert.equal(overlay.describeCard(signal), null, 'the module itself refuses to draw a signal');
  now = 13999;
  assert.equal(queue.tick(false).card.id, 'lot-4');
  now = 14000;
  assert.equal(queue.tick(false).card, null, 'gone at its deadline');
  now = 20000;
  assert.equal(queue.tick(false).card, null, 'and nothing else of that batch was queued behind it');
  assert.equal(queue.state().counts.shown, 1);
  // Discreet activity: only while something is read, checked or late.
  assert.equal(overlay.describeActivity(compact()), null);
  assert.deepEqual(overlay.describeActivity(compact({ activity: { state: 'verifying', label: 'Vérification en cours…', waiting: 2, late: false } })), { label: 'Vérification en cours… · 2 en attente', late: false });
  assert.deepEqual([surveillance.DISPLAY_DEFAULT, surveillance.DISPLAY_CHOICES], [14000, [8000, 14000, 20000]]);
  assert.deepEqual([14000, 20000, 8000, 999, undefined].map(surveillance.nextDisplay), [20000, 8000, 14000, 20000, 20000]);
  assert.deepEqual([8000, 14000, 20000, 9000, 'x', undefined].map(surveillance.displayChoice), [8000, 14000, 20000, 14000, 14000, 14000]);
});

test('history lines tell a verification, a video signal and an open claim apart', () => {
  const line = item => surveillance.describeHistoryItem(item);
  const lot = { seq: 7, id: 'lot-2', kind: 'lot', cardKind: 'verification', status: 'sourced', startMs: 760000, endMs: 768000, text: 'Concorde avec l’Insee.', claimCount: 2, sourceCount: 3 };
  assert.deepEqual(line(lot), { id: 'lot-2', seq: 7, accent: 'verification', verified: true, kicker: 'Sources consultées · 12:40–12:48', text: 'Concorde avec l’Insee.', meta: '2 affirmations · 3 sources' });
  const signal = line({ seq: 19, id: 'lot-4', kind: 'lot', cardKind: 'signal', status: 'noted', startMs: 5520000, endMs: 5528000, text: 'Retour sur les retraites.', claimCount: 1, sourceCount: 0 });
  assert.deepEqual([signal.accent, signal.verified, signal.kicker, signal.meta], ['signal', false, 'Repéré dans la vidéo · 1:32:00–1:32:08', 'Observation de la vidéo, non vérifiée sur le web.']);
  const claim = (status, extra = {}) => line({ seq: 8, id: 'claim-4', kind: 'claim', action: 'verify', status, startMs: 770000, endMs: 778000, text: 'Affirmation.', reason: null, ...extra });
  assert.deepEqual([claim('undetermined', { reason: 'non vérifiable' }).accent, claim('undetermined', { reason: 'non vérifiable' }).kicker, claim('undetermined', { reason: 'non vérifiable' }).meta],
    ['open', 'Indéterminée · 12:50–12:58', 'Non vérifiée : affirmation qui ne se vérifie pas par une recherche.']);
  assert.equal(claim('undetermined', { reason: 'preuves insuffisantes' }).meta, 'Non vérifiée : les sources consultées ne suffisent pas pour conclure.');
  assert.equal(claim('undetermined', { reason: 'autre raison' }).meta, 'Non vérifiée : autre raison.');
  assert.deepEqual([claim('queued').kicker, claim('detected').kicker, claim('running').kicker], ['En attente · 12:50–12:58', 'En attente · 12:50–12:58', 'En cours · 12:50–12:58']);
  assert.equal(claim('queued', { late: true }).meta, 'En attente depuis un moment : la vérification a pris du retard.');
  assert.deepEqual([claim('error', { reason: 'Délai dépassé.' }).kicker, claim('error', { reason: 'Délai dépassé.' }).meta], ['Erreur · 12:50–12:58', 'Délai dépassé.']);
  assert.deepEqual([claim('cancelled').kicker, claim('cancelled').meta], ['Annulée · 12:50–12:58', 'Surveillance arrêtée.']);
  assert.ok(['undetermined', 'queued', 'running', 'error', 'cancelled'].every(status => claim(status).verified === false && claim(status).accent === 'open'), 'no open claim looks like a verification');
  assert.equal(claim('noted', { action: 'signal', startMs: null, endMs: null }).kicker, 'Signalement · Relevée dans la vidéo');
});

test('detail: claims with quote and timing, state in plain words, sources as text, uncertainties, moment to question', () => {
  const lot = { id: 'lot-2', kind: 'verification', status: 'done', text: 'Les deux chiffres concordent.', claimIds: ['claim-3', 'claim-5'],
    sources: [{ url: 'https://www.insee.fr/a', title: 'Taux de chômage', publisher: 'Insee', claimIds: ['claim-3'] }, { url: 'https://www.lemonde.fr/b', title: 'Le chômage se stabilise', publisher: '', claimIds: ['claim-5'] }, { url: 'https://www.insee.fr/a', title: 'Doublon', publisher: 'Insee' }],
    origin: [{ claimId: 'claim-5', passageId: 'moment-102', startMs: 808000, endMs: 816000, quote: 'q2' }, { claimId: 'claim-3', passageId: 'moment-96', startMs: 760000, endMs: 768000, quote: 'q1' }],
    uncertainties: ['Transcription automatique.'] };
  const claims = [
    { id: 'claim-3', action: 'verify', status: 'sourced', statement: 'Le chômage est à 7,4 %.', assessment: 'supported', conclusion: 'L’Insee publie 7,4 %.', origin: { passageId: 'moment-96', startMs: 760000, endMs: 768000, quote: 'le chômage est à 7,4 %' }, limitations: ['Chiffre provisoire.', 'Transcription automatique.'] },
    { id: 'claim-5', action: 'verify', status: 'sourced', statement: 'Il baisse depuis deux ans.', assessment: 'contradicted', conclusion: '', origin: { passageId: 'moment-102', startMs: 808000, endMs: 816000, quote: '' }, limitations: [] },
    { id: 'claim-6', action: 'verify', status: 'undetermined', reason: 'preuves insuffisantes', statement: 'C’est un record.', origin: { passageId: 'moment-102', startMs: 808000, endMs: 816000, quote: 'un record' }, limitations: [] },
  ];
  const view = surveillance.describeDetail({ sessionId: 's1', id: 'lot-2', kind: 'lot', lot, claims });
  assert.deepEqual([view.id, view.accent, view.title, view.time, view.text, view.note], ['lot-2', 'verification', 'Sources consultées', '12:40–13:36', 'Les deux chiffres concordent.', null]);
  assert.deepEqual(view.claims, [
    { id: 'claim-3', statement: 'Le chômage est à 7,4 %.', quote: 'le chômage est à 7,4 %', time: '12:40–12:48', state: 'Concorde avec les sources — L’Insee publie 7,4 %.' },
    { id: 'claim-5', statement: 'Il baisse depuis deux ans.', quote: '', time: '13:28–13:36', state: 'Contredit par les sources' },
    { id: 'claim-6', statement: 'C’est un record.', quote: 'un record', time: '13:28–13:36', state: 'Indéterminée : les sources consultées ne suffisent pas pour conclure.' },
  ]);
  assert.deepEqual(view.sources, [{ title: 'Taux de chômage', publisher: 'Insee', url: 'https://www.insee.fr/a' }, { title: 'Le chômage se stabilise', publisher: 'lemonde.fr', url: 'https://www.lemonde.fr/b' }], 'title, publisher (or host) and address; one line per address');
  assert.deepEqual(view.uncertainties, ['Transcription automatique.', 'Chiffre provisoire.']);
  assert.deepEqual(view.moment, { segmentIds: ['moment-96', 'moment-102'], startMs: 760000, endMs: 816000 }, 'passages in order, whatever the order of the origins');
  assert.ok(!/vrai|faux/i.test(JSON.stringify(view)), 'never a true/false verdict');
  // A signal: its own label, no source and no verdict, even if a registry carried some.
  const signal = surveillance.describeDetail({ id: 'lot-4', kind: 'lot', lot: { id: 'lot-4', kind: 'signal', text: 'Retour sur les retraites.', sources: [{ url: 'https://example.org', title: 'Intrus' }], origin: [{ claimId: 'claim-9', passageId: 'moment-88', startMs: 700000, endMs: 708000, quote: 'q' }], uncertainties: [] },
    claims: [{ id: 'claim-9', action: 'signal', status: 'noted', statement: 'Le plateau revient sur les retraites.', assessment: 'supported', origin: { passageId: 'moment-88', startMs: 700000, endMs: 708000, quote: 'revenons sur les retraites' }, sources: [{ url: 'https://example.org' }] }] });
  assert.deepEqual([signal.accent, signal.title, signal.note, signal.sources, signal.claims[0].state], ['signal', 'Repéré dans la vidéo', 'Observation de la vidéo, non vérifiée sur le web.', [], 'Relevée dans la vidéo, sans vérification sur le web.']);
  // A claim alone: waiting, failed, cancelled.
  const alone = (status, extra = {}) => surveillance.describeDetail({ id: 'claim-4', kind: 'claim', lot: null, claims: [{ id: 'claim-4', action: 'verify', status, statement: 'S.', origin: { passageId: 'moment-97', startMs: 770000, endMs: 778000, quote: '' }, ...extra }] });
  assert.deepEqual([alone('queued').title, alone('queued').accent, alone('queued').claims[0].state, alone('queued').sources, alone('queued').moment], ['En attente', 'open', 'En attente', [], { segmentIds: ['moment-97', 'moment-97'], startMs: 770000, endMs: 778000 }]);
  assert.equal(alone('error', { error: 'Délai dépassé' }).claims[0].state, 'Erreur : Délai dépassé.');
  assert.equal(alone('cancelled', { reason: 'Surveillance arrêtée.' }).claims[0].state, 'Annulée : Surveillance arrêtée.');
  assert.equal(alone('running').claims[0].state, 'En cours');
  assert.equal(surveillance.describeDetail({ id: 'claim-1', kind: 'claim', lot: null, claims: [{ id: 'claim-1', status: 'queued', statement: 'S.', origin: {} }] }).moment, null, 'no passage, nothing to question');
});

test('ambient display, read on the local controller, is told in plain words', () => {
  const state = (extra = {}) => ({ value: { supported: true, active: true, stopping: false, settings: { alerts: true, displayMs: 14000 }, state: { status: 'idle', reason: null, focus: 'relay', counts: {}, capture: {}, ...extra } } });
  assert.deepEqual([surveillance.describeAmbient(null).supported, surveillance.describeAmbient(null).line], [false, 'Affichage panneau fermé : lecture de l’état…']);
  assert.equal(surveillance.describeAmbient({ status: 404, error: true }).line, 'Alertes panneau fermé : contrôleur TV à mettre à jour.');
  assert.equal(surveillance.describeAmbient({ value: { active: false, stopping: false, report: {} } }).line, 'Alertes panneau fermé : contrôleur TV à mettre à jour.', 'an answer that is not the ambient status is an older controller too');
  assert.equal(surveillance.describeAmbient({ error: true }).line, 'Alertes panneau fermé : contrôleur TV inaccessible.');
  const off = surveillance.describeAmbient(state({ status: 'disabled', reason: 'profile-off', focus: 'off', counts: { notShown: 3, skippedStale: 1 } }));
  assert.equal(off.supported, true);
  assert.equal(off.line, 'Affichage panneau fermé non activé sur cette TV : les résultats s’affichent panneau ouvert et restent dans l’historique.');
  assert.deepEqual([off.details, off.notShown], [['4 résultats non montrés panneau fermé : à lire dans l’historique.'], 3]);
  // Alerts switched off by the viewer are a different thing from a display never enabled on this TV.
  assert.equal(surveillance.describeAmbient(state({ status: 'disabled', reason: 'alerts-off' })).line, 'Alertes à l’écran coupées : la surveillance continue, les résultats restent dans l’historique.');
  assert.equal(surveillance.describeAmbient(state({ status: 'disabled', reason: 'server-unsupported' })).line, 'Affichage panneau fermé désactivé : serveur à mettre à jour.');
  assert.equal(surveillance.describeAmbient(state({ status: 'disabled', reason: 'inconnue', message: 'Phrase du contrôleur' })).line, 'Affichage panneau fermé désactivé : Phrase du contrôleur.');
  assert.equal(surveillance.describeAmbient(state({ status: 'paused', reason: 'panel' })).line, 'Affichage panneau fermé en pause : panneau ouvert.');
  assert.equal(surveillance.describeAmbient(state({ status: 'paused', reason: 'media-transition' })).line, 'Affichage panneau fermé en pause : publicité ou changement de vidéo.');
  assert.equal(surveillance.describeAmbient(state()).line, 'Affichage panneau fermé actif.');
  assert.equal(surveillance.describeAmbient(state({ trial: true })).line, 'Affichage panneau fermé actif. Mode d’essai.');
  assert.equal(surveillance.describeAmbient({ value: { ...state().value, active: false } }).line, 'Affichage panneau fermé arrêté.');
  assert.deepEqual(surveillance.describeAmbient(state({ capture: { overlay: { cropped: 5, withheld: 1 }, gateStale: true } })).details,
    ['Capture : 5 images recadrées, 1 image retenue pendant une alerte.', 'Porte de capture restée fermée : les images sont recadrées par précaution.']);
  assert.deepEqual(surveillance.describeAmbient(state()).settings, { alerts: true, displayMs: 14000 });
});

test('sessions: title, duration, volume, media state, and what each row allows', () => {
  const library = {
    current: { id: 'a', readOnly: false, accepting: true, title: 'Session du 13 oct., 21:04' },
    sessions: [
      { id: 'a', title: 'Session du 13 oct., 21:04', state: 'live', elapsedMs: 772000, passages: 96, media: { stored: 96, missing: 0, bytes: 400 * 1024 ** 2 }, legacy: false, current: true, readOnly: false, capturing: true },
      { id: 'b', title: 'Débat du 12 oct., 20:55', firstTopic: 'Emploi', state: 'archived', elapsedMs: 5520000, passages: 690, media: { stored: 688, missing: 2, bytes: 1.2 * GIB }, legacy: false, current: false },
      { id: 'c', title: '', state: 'archived', elapsedMs: 300000, passages: 37, media: { stored: 0, missing: 37, bytes: 0 }, legacy: true, current: false },
      { id: 'd', title: 'Session illisible', state: 'unreadable', elapsedMs: 0, passages: 0, media: { stored: 0, missing: 0, bytes: 0 } },
      { id: 'e', title: 'Coupée', state: 'interrupted', elapsedMs: 45000, passages: 5, media: { stored: 0, missing: 5, bytes: 0 }, legacy: false },
      null, { title: 'sans identifiant' },
    ],
    storage: { sessions: 5, bytes: 1.6 * GIB, freeBytes: 9 * GIB, minFreeBytes: GIB, warnFreeBytes: 2 * GIB, state: 'ok' },
  };
  // The TV is capturing: nothing may replace or delete the session it feeds.
  const live = sessions.describeSessions(library, { capturing: true });
  assert.deepEqual(live.rows.map(row => [row.id, row.title, row.meta, row.media, row.status]), [
    ['a', 'Session du 13 oct., 21:04', '12 min · 96 passages · 400 Mo', 'Vidéo complète', 'En cours de capture'],
    ['b', 'Débat du 12 oct., 20:55', '1 h 32 · 690 passages · 1,2 Go', 'Vidéo partielle · 2 passages sans vidéo', ''],
    ['c', 'Session sans titre', '5 min · 37 passages · 0 o', 'Texte seul', ''],
    ['d', 'Session illisible', '0 s · 0 passage · 0 o', 'Illisible', 'Archive illisible'],
    ['e', 'Coupée', '45 s · 5 passages · 0 o', 'Sans vidéo', 'Interrompue · ce qui était enregistré reste lisible'],
  ]);
  assert.deepEqual(live.rows.map(row => [row.canOpen, row.canResume, row.canDelete]), [[false, false, false], [false, false, true], [false, false, true], [false, false, true], [false, false, true]]);
  assert.equal(live.rows[1].openBlocked, 'Arrête la capture avant d’ouvrir une autre session.');
  assert.equal(live.rows[0].deleteBlocked, 'Arrête la capture avant de supprimer cette session.');
  assert.deepEqual([live.canNew, live.pauseFirst, live.currentId], [false, false, 'a']);
  assert.equal(live.storage.line, '5 sessions · 1,6 Go · 9 Go libres sur le serveur');
  // The TV stopped sending but the server still accepts: the row says so, and the session is paused first.
  const stopped = sessions.describeSessions(library, { capturing: false });
  assert.deepEqual([stopped.rows[0].status, stopped.rows[0].live, stopped.pauseFirst, stopped.canNew], ['Ouverte · capture arrêtée', false, true, true]);
  assert.deepEqual(stopped.rows.map(row => row.canOpen), [true, true, true, false, true]);
  assert.equal(stopped.rows[3].openBlocked, 'Archive illisible.');
  // An archive opened read-only: it may be resumed explicitly, and nothing else resumes.
  const archive = sessions.describeSessions({ ...library, current: { id: 'b', readOnly: true, accepting: false }, sessions: library.sessions.map(s => (s && s.id ? { ...s, current: s.id === 'b', readOnly: s.id === 'b', capturing: false } : s)) }, { capturing: false });
  assert.deepEqual(archive.rows.map(row => [row.status, row.canResume, row.canOpen]).slice(0, 2), [['', false, true], ['Ouverte · lecture seule', true, false]]);
  assert.equal(archive.pauseFirst, false);
  assert.match(sessions.describeSessions({ sessions: [] }).empty, /^Aucune session enregistrée/);
  assert.deepEqual(sessions.describeSessions(null).rows, []);
  // Deletion: what goes, and that nothing else does.
  assert.deepEqual(sessions.describeDeletion(live.rows[1]), {
    subject: 'Débat du 12 oct., 20:55 · 1 h 32 · 690 passages · 1,2 Go',
    removed: 'Seront effacés du serveur : la vidéo et le son de 688 passages (1,2 Go), les miniatures, les transcriptions, les résumés, les questions et leurs réponses, les résultats de surveillance.',
    kept: 'Aucune autre session n’est touchée.',
  });
  assert.equal(sessions.describeDeletion(stopped.rows[0]).kept, 'Aucune autre session n’est touchée. Cette session est ouverte : elle sera fermée.');
  assert.equal(sessions.describeArchive({ id: 'b', readOnly: true, title: 'Débat du 12 oct., 20:55', elapsedMs: 5520000 }), 'Archive · lecture seule — Débat du 12 oct., 20:55 · enregistrée jusqu’à 1:32:00. Rien n’est capturé : tu peux relire et poser des questions.');
  assert.equal(sessions.describeArchive({ id: 'a', readOnly: false }), null);
  assert.equal(sessions.describeArchive(null), null);
});

test('storage: figures of the server, a banner only when low or blocked, nothing deleted', () => {
  const ok = sessions.describeStorage({ state: 'ok', freeBytes: 9 * GIB, minFreeBytes: GIB, sessionBytes: 400 * 1024 ** 2, remainingMinutes: 200 });
  assert.deepEqual(ok, { state: 'ok', blocked: false, line: 'cette session : 400 Mo · 9 Go libres sur le serveur · environ 3 h 20 de capture possibles', banner: null });
  const low = sessions.describeStorage({ state: 'low', freeBytes: 1.6 * GIB, minFreeBytes: GIB });
  assert.equal(low.banner, 'Espace disque faible sur le serveur : 1,6 Go libres, la capture s’arrêtera sous 1 Go. Rien n’est supprimé automatiquement.');
  const blocked = sessions.describeStorage({ state: 'blocked', freeBytes: 0.8 * GIB, minFreeBytes: GIB, remainingMinutes: 0 });
  assert.equal(blocked.blocked, true);
  assert.equal(blocked.banner, 'Espace disque insuffisant sur le serveur : capture suspendue pour ne rien supprimer. 819 Mo libres, 1 Go requis. Supprime une session (Mémoire ↔ puis Sessions) ou libère de l’espace, puis relance la capture.');
  assert.doesNotMatch(blocked.line, /capture possibles/);
  assert.deepEqual([sessions.describeStorage(undefined).state, sessions.describeStorage(undefined).banner, sessions.describeStorage({ state: 'bizarre' }).state], ['unknown', null, 'unknown']);
  assert.equal(sessions.describeStorage({ state: 'unknown', freeBytes: null }).line, 'espace libre non mesuré');
  assert.deepEqual([0, 512, 1536, 5 * 1024 ** 2, 1.25 * GIB, 250 * GIB, null, NaN, -1].map(sessions.bytes), ['0 o', '512 o', '2 Ko', '5 Mo', '1,3 Go', '250 Go', '', '', '']);
  assert.deepEqual([0, 45000, 240000, 5520000, 36000000].map(sessions.duration), ['0 s', '45 s', '4 min', '1 h 32', '10 h 00']);
});

test('capture button: every end of capture comes with its cause, and an open archive asks for a choice', () => {
  const limits = { seconds: 21600, idleSeconds: 600 };
  const stopped = (report, context) => sessions.describeCapture({ active: false, stopping: false, exitCode: 0, report: { stopped: true, limits, ...report } }, context);
  const active = sessions.describeCapture({ active: true, stopping: false, report: { connection: 'connected', sent: 12, limits } }, {});
  assert.deepEqual(active, { button: 'Arrêter la capture', label: 'Capture active · 12 passages envoyés · arrêt automatique après 6 h ou après 10 min sans lecture', action: 'stop', ended: null });
  assert.equal(sessions.describeCapture({ active: true, report: { connection: 'starting' } }, {}).label, 'Connexion au serveur…', 'an older controller reports no bounds: none is invented');
  assert.equal(sessions.describeCapture({ active: true, report: { connection: 'reconnecting' } }, {}).label, 'Réseau coupé · tampon court, nouvel essai…');
  assert.deepEqual(sessions.describeCapture({ active: true, stopping: true, report: {} }, {}), { button: 'Arrêt en cours…', label: 'Arrêt du micro et des captures…', action: null, ended: null });
  assert.deepEqual(stopped({ stopReason: 'duration' }), { button: 'Démarrer l’analyse', label: 'Capture terminée : limite de 6 h atteinte. Elle ne reprend pas seule : relance-la pour continuer.', action: 'start', ended: 'duration' });
  assert.deepEqual([stopped({ stopReason: 'idle' }).label, stopped({ stopReason: 'idle' }).ended], ['Capture arrêtée : 10 min sans lecture YouTube. Elle ne reprend pas seule.', 'idle']);
  assert.equal(stopped({ stopReason: 'duration', limits: { seconds: 1800 } }).label, 'Capture terminée : limite de 30 min atteinte. Elle ne reprend pas seule : relance-la pour continuer.', 'the bound shown is the one reported, whatever it is');
  assert.equal(stopped({ stopReason: 'stopped' }).label, 'Capture arrêtée · contexte conservé');
  assert.equal(stopped({ stopReason: 'stopped', stopMessage: 'Capture arrêtée à la demande.', errors: ['Capture arrêtée à la demande.'] }).label, 'Capture arrêtée · contexte conservé', 'a stop the viewer asked for is not shown as an error');
  assert.deepEqual([stopped({ stopReason: 'nouvelle-cause', stopMessage: 'Phrase de la capture.' }).label, stopped({ stopReason: 'nouvelle-cause', stopMessage: 'Phrase de la capture.' }).ended], ['Capture arrêtée : Phrase de la capture.', 'nouvelle-cause'], 'an unknown cause is still told, in the words of the capture');
  assert.match(stopped({ stopReason: 'stopped', gateStale: true }).label, /porte de capture restée fermée : images recadrées par précaution$/);
  assert.deepEqual([stopped({ stopReason: 'session-changed' }).ended, stopped({ connection: 'session-changed' }).label], ['session-changed', 'Serveur redémarré ou session changée · redémarre l’analyse.']);
  assert.equal(stopped({ stopReason: 'parent' }).label, 'Capture arrêtée : contrôleur TV redémarré. Elle ne reprend pas seule.');
  // Storage: the server state, the reason of the capture or a bare 507 all say the same thing in plain words.
  const full = 'Capture arrêtée : espace disque insuffisant sur le serveur. Rien n’a été supprimé, rien ne reprend seul.';
  assert.deepEqual([stopped({}, { storage: { state: 'blocked' } }).label, stopped({}, { storage: { state: 'blocked' } }).ended], [full, 'storage']);
  assert.equal(stopped({ stopReason: 'storage-full' }).label, full);
  assert.equal(stopped({ connection: 'error', errors: ['HTTP Error 507: Insufficient Storage'] }).label, full);
  assert.equal(sessions.describeCapture({ active: true, report: { connection: 'connected', sent: 3 } }, { storage: { state: 'blocked' } }).label, 'Espace disque insuffisant sur le serveur : les passages sont refusés, rien n’a été supprimé.');
  // An archive open read-only: the button offers the choice instead of starting anything.
  assert.deepEqual(stopped({ stopReason: 'idle' }, { readOnly: true }), { button: 'Reprendre ou nouvelle session…', label: 'Archive ouverte en lecture seule · rien n’est capturé.', action: 'choose', ended: null });
  assert.deepEqual([stopped({ connection: 'error', errors: ['HTTP Error 409: Conflict'] }).ended, stopped({ stopReason: 'read-only' }).label], ['read-only', 'Capture refusée : session ouverte en lecture seule. Choisis Reprendre ou Nouvelle session.']);
  assert.equal(stopped({ errors: ['Contrôleur arrêté.'] }).label, 'Capture arrêtée · Contrôleur arrêté.');
  assert.equal(sessions.describeCapture({ active: false, exitCode: 1, report: {} }, {}).label, 'Capture interrompue · tu peux réessayer.');
  assert.equal(sessions.describeCapture({ active: false, exitCode: null, report: {} }, {}).label, 'Capture arrêtée · contexte conservé');
  // Nothing lost or masked in silence: blocks dropped with their cause, frames cut or held back under a card.
  assert.equal(stopped({ stopReason: 'stopped', dropped: 3, dropReasons: { foreignApp: 2, overlayVisible: 1 }, framesCropped: 4, framesWithheld: 1 }).label,
    'Capture arrêtée · contexte conservé · 3 passages non envoyés (autre application à l’écran 2, alerte à l’écran 1) · 4 images recadrées, 1 retenue sous une alerte');
  assert.equal(stopped({ stopReason: 'stopped', dropped: 1, dropReasons: { inconnu: 1 } }).label, 'Capture arrêtée · contexte conservé · 1 passage non envoyé (inconnu 1)');
  assert.equal(sessions.describeCapture({ active: true, report: { connection: 'connected', sent: 1 } }, {}).label, 'Capture active · 1 passage envoyé');
  // Every cause the capture counts has its words: none reaches the screen as an identifier.
  assert.equal(stopped({ stopReason: 'stopped', dropped: 7, dropReasons: { storageFull: 2, readOnly: 1, deliveryError: 3, lunaFailed: 1 } }).label,
    'Capture arrêtée · contexte conservé · 7 passages non envoyés (stockage plein 2, session en lecture seule 1, erreur d’envoi 3, système de la TV muet 1)');
  const python = name => fs.readFileSync(path.resolve(__dirname, '../tv', name), 'utf8');
  const counted = new Set([...(python('capture.py') + python('transport.py')).matchAll(/drop\((?:self\.)?report, ?'(\w+)'/g)].map(match => match[1]));
  assert.ok(counted.size >= 6 && ['deliveryError', 'storageFull', 'readOnly'].every(cause => counted.has(cause)), [...counted].join(','));
  for (const cause of counted) assert.doesNotMatch(stopped({ stopReason: 'stopped', dropped: 1, dropReasons: { [cause]: 1 } }).label, new RegExp('\\(' + cause + ' 1\\)'), cause);
  assert.equal(sessions.describeCapture(undefined, undefined).label, 'Capture arrêtée · contexte conservé');
});
