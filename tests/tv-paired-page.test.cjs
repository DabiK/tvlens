const { test } = require('node:test');
const assert = require('node:assert/strict');
const { deferred, tick: waitTick } = require('./helpers/wait.cjs');
const { loadTvPage, KEYS } = require('./helpers/tv-page.cjs');
const refusedReports = require('./fixtures/tv-capture-refusals.json');

const SESSION_ID = '11111111-1111-4111-8111-111111111111';
const SERVER_NOW = Date.UTC(2031, 0, 1);
const CONFIG = { url: 'https://inference.test', controlUrl: 'http://controller.test', token: 'fictitious-pairing-token' };
const job = (id = 'deep-1', question = 'Quel chiffre ?') => ({
  id, question, status: 'done', anchorMs: 16000,
  result: { kind: 'observation', answer: 'Le chiffre est 42.', citations: [], sources: [], limits: [] },
});

// Fields consumed by the real views: session clock/coverage, chat jobs, timeline, surveillance,
// storage, transcription and server clock. No view or receiver is replaced.
function serverState() {
  return {
    view: 'panel', revision: 1, serverNowMs: SERVER_NOW,
    session: {
      id: SESSION_ID, elapsedMs: 16000, accepting: true, readOnly: false,
      capturedThroughMs: 16000, analyzedThroughMs: 16000, pending: 0, gaps: [], segments: [],
    },
    chat: { jobs: [job()], timeoutMs: 300000 },
    timeline: { sessionId: SESSION_ID, cards: [] },
    surveillance: {
      enabled: true, sessionId: SESSION_ID,
      activation: { instruction: 'Vérifie les chiffres.', t0Ms: 0 },
      registry: { ready: true, persisted: true },
      activity: { state: 'listening', label: 'Surveillance active.' },
      backlog: {}, counts: {}, overlay: { seq: 0, cards: [] }, signals: { seq: 0, cards: [] },
    },
    storage: { state: 'ok' }, transcription: { language: 'fr' }, captureGapCount: 0,
  };
}

const response = body => ({ status: 200, ok: true, headers: { get: () => null }, json: async () => structuredClone(body) });
function network(state = serverState()) {
  const calls = [];
  const fetch = async (url, init) => {
    calls.push({ url, ...init });
    const route = new URL(url).pathname;
    if (route === '/capture') return response({ active: false, stopping: false });
    if (route === '/panel') return response({ active: true, mode: 'chat' });
    if (route === '/v1/state') return response(state);
    if (route.startsWith('/ambient')) return response({ supported: false });
    throw new Error('Unexpected request: ' + url);
  };
  return { calls, fetch, state };
}

test('a paired page reads both hosts and renders a job through its real scripts', async t => {
  const net = network();
  const page = loadTvPage({ config: CONFIG, fetch: net.fetch });
  t.after(() => page.cleanup());
  await waitTick();
  assert.ok(page.window.tvlensPanel, 'paired page exposes its polling commands');
  const startup = net.calls.filter(call => !new URL(call.url).pathname.startsWith('/ambient'));
  assert.deepEqual(startup.map(call => call.url).sort(), [
    CONFIG.controlUrl + '/capture', CONFIG.controlUrl + '/panel', CONFIG.url + '/v1/state?view=panel',
  ].sort());
  assert.equal(page.window.tvlensPanel.stats.renders, 1);
  assert.equal(typeof page.window.tvlensPanel.kick, 'function');
  assert.equal(page.window.tvlensPanel.state().session.id, SESSION_ID);
  const card = page.el('conversation').querySelector('[data-job="deep-1"]');
  assert.equal(card.tagName, 'ARTICLE');
  assert.equal(card.querySelector('h2').textContent, 'Quel chiffre ?');
  assert.equal(card.querySelector('.chat-answer').textContent, 'Le chiffre est 42.');
});

for (const [name, report] of Object.entries(refusedReports)) {
  test('the paired capture control renders the Python refusal report ' + name + ' as text', async t => {
    const net = network();
    const value = { active: false, stopping: false, exitCode: 0, report };
    const page = loadTvPage({
      config: CONFIG,
      fetch: (url, init) => new URL(url).pathname === '/capture' ? response(value) : net.fetch(url, init),
    });
    t.after(() => page.cleanup());
    await waitTick();
    const expected = page.window.TVLensSessions.describeCapture(value, { storage: net.state.storage });
    assert.equal(page.el('capture-state').textContent, expected.label);
    assert.equal(page.el('capture-state').getAttribute('data-ended'), expected.ended);
    assert.equal(page.el('capture').textContent, expected.button);
    assert.equal(page.el('archive-capture-dialog').open, false);
    assert.deepEqual(net.calls.filter(call => call.method === 'POST'), [], 'no automatic capture or resume');
    if (report.lastRefusal.code === 'read-only') {
      assert.match(page.el('capture-state').textContent, /lecture seule.*Reprendre ou Nouvelle session/);
    } else if (report.lastRefusal.status === 409) {
      assert.equal(expected.action, 'start');
      assert.doesNotMatch(page.el('capture-state').textContent, /lecture seule|Reprendre|archive/i);
    }
  });
}

test('historical capture diagnostics containing markup and status numbers stay generic text in the paired page', async t => {
  const net = network();
  const diagnostic = '<img src=x onerror=alert(1)> 409 images / 507 octets';
  const page = loadTvPage({
    config: CONFIG,
    fetch: (url, init) => new URL(url).pathname === '/capture'
      ? response({ active: false, report: { errors: [diagnostic], dropped: 1, dropReasons: { deliveryRejected: 1 } } })
      : net.fetch(url, init),
  });
  t.after(() => page.cleanup());
  await waitTick();
  assert.equal(page.el('capture-state').getAttribute('data-ended'), 'error');
  assert.equal(page.el('capture-state').textContent,
    'Capture arrêtée · ' + diagnostic + ' · 1 passage non envoyé (envoi refusé 1)');
  assert.equal(page.el('capture-state').querySelector('img'), null);
  assert.equal(page.el('capture').textContent, 'Démarrer l’analyse');
});

test('the real form echoes immediately, releases focus and turns its echo into the received job', async t => {
  const net = network();
  const answer = deferred();
  let sent;
  let now = 1000;
  const page = loadTvPage({
    config: CONFIG, now: () => now, dateNow: () => 1234,
    fetch: (url, init) => {
      if (new URL(url).pathname !== '/v1/questions') return net.fetch(url, init);
      sent = { url, ...init };
      return answer.promise;
    },
  });
  t.after(() => page.cleanup());
  await waitTick();
  now = 4000;
  page.el('dictate').click();
  page.keyboard(true);
  page.input('question', '  Et le suivant ?  ');
  const { event, done } = page.submit();
  assert.equal(event.defaultPrevented, true);
  const echo = page.el('conversation').lastChild;
  assert.equal(echo.dataset.pending, 'true');
  assert.equal(echo.isConnected, true);
  assert.equal(echo.querySelector('h2').textContent, 'Et le suivant ?');
  assert.match(echo.textContent, /Envoi…/);
  assert.equal(page.activeId(), 'dictate');
  assert.equal(page.el('send').disabled, true);
  assert.equal(sent.url, CONFIG.url + '/v1/questions');
  assert.equal(sent.method, 'POST');
  assert.equal(sent.headers.Authorization, 'Bearer ' + CONFIG.token);
  assert.equal(sent.signal.aborted, false);
  assert.deepEqual(JSON.parse(sent.body), { question: 'Et le suivant ?', sessionId: SESSION_ID, anchorMs: 19000 });
  net.state.chat.jobs.push(job('deep-2', 'Et le suivant ?'));
  answer.resolve(response({ id: 'deep-2' }));
  await done;
  await waitTick();
  assert.equal(page.el('conversation').lastChild, echo, 'the real renderer reuses the echo node');
  assert.equal(echo.dataset.job, 'deep-2');
  assert.equal(echo.hasAttribute('data-pending'), false);
  assert.equal(echo.querySelector('.chat-answer').textContent, 'Le chiffre est 42.');
  assert.equal(page.el('question').value, '');
  assert.equal(page.activeId(), 'dictate');
  assert.equal(page.window.performance.now(), 4000);
  assert.equal(page.window.Date.now(), 1234);
});

test('a refused submission removes the echo and preserves the composed question', async t => {
  const net = network();
  const answer = deferred();
  const page = loadTvPage({
    config: CONFIG,
    fetch: (url, init) => new URL(url).pathname === '/v1/questions' ? answer.promise : net.fetch(url, init),
  });
  t.after(() => page.cleanup());
  await waitTick();
  page.input('question', 'Une autre question ?');
  const { done } = page.submit();
  const echo = page.el('conversation').lastChild;
  answer.resolve({ status: 409, ok: false, json: async () => ({ code: 'read-only', error: 'Archive en lecture seule.' }) });
  await done;
  assert.equal(echo.isConnected, false);
  assert.equal(page.el('conversation').children.length, 1);
  assert.equal(page.el('question').value, 'Une autre question ?');
  assert.equal(page.el('error').textContent, 'Archive en lecture seule.');
  assert.equal(page.activeId(), 'dictate');
});

test('surveillance commands share the page DOM and draw only a new sourced verification on a tick', async t => {
  const net = network();
  const page = loadTvPage({
    config: CONFIG, fetch: net.fetch,
    storage: { 'tvlens.overlay': JSON.stringify({ displayMs: 8000, alerts: true }) },
  });
  t.after(() => page.cleanup());
  await waitTick();
  page.el('show-surveillance').click();
  await waitTick();
  assert.equal(page.el('surveillance-view').hidden, false);
  assert.equal(page.el('chat-view').hidden, true);
  assert.equal(page.activeId(), 'surv-toggle');
  page.press(KEYS.down);
  assert.equal(page.activeId(), 'surv-duration');
  page.press(KEYS.right);
  assert.equal(page.activeId(), 'surv-alerts');
  assert.equal(page.el('surv-instruction').value, 'Vérifie les chiffres.');
  assert.equal(page.el('surv-duration').textContent, 'Durée des alertes · 8 s');
  page.el('surv-duration').click();
  assert.equal(page.el('surv-duration').textContent, 'Durée des alertes · 14 s');
  page.el('surv-alerts').click();
  assert.equal(page.el('surv-alerts').textContent, 'Alertes à l’écran · non');
  assert.deepEqual(JSON.parse(page.localStorage.getItem('tvlens.overlay')), { displayMs: 14000, alerts: false });
  page.el('surv-alerts').click();
  const tick = [...page.timers.pending].find(([, timer]) => timer.repeat && timer.delay === 250)[0];
  page.timers.run(tick);
  assert.equal(page.el('overlay-card').children.length, 0, 'initial state places the sequence cursor');
  net.state.surveillance.overlay = { seq: 1, cards: [{
    id: 'lot-1', seq: 1, kind: 'verification', text: 'Le chiffre annoncé concorde avec la publication.',
    interval: { startMs: 8000, endMs: 16000 }, finishedAt: SERVER_NOW - 1000,
    sources: [{ title: 'Publication', url: 'https://www.insee.fr/statistiques/1' }],
  }] };
  page.window.tvlensPanel.kick();
  await waitTick();
  assert.equal(page.el('overlay-card').children.length, 0, 'drawing belongs to the timer callback');
  page.timers.run(tick);
  const card = page.el('overlay-card');
  assert.equal(card.hidden, false);
  assert.equal(card.dataset.id, 'lot-1');
  assert.equal(card.querySelector('.tvl-card-text').textContent, 'Le chiffre annoncé concorde avec la publication.');
  assert.equal(card.querySelector('.tvl-card-sources').textContent, 'Sources : insee.fr');
  assert.equal(card.querySelector('.tvl-card').getAttribute('data-accent'), 'verification');
  assert.equal(card.ownerDocument, page.document);
  assert.equal(card.isConnected, true);
  assert.equal(page.el('surveillance-view').contains(page.document.activeElement), true);
});

function scheduler() {
  let nextId = 0;
  const pending = new Map();
  const cancelled = [];
  const register = (callback, delay) => {
    const id = ++nextId;
    pending.set(id, { callback, delay });
    return id;
  };
  const clear = id => {
    cancelled.push(id);
    pending.delete(id);
  };
  return { pending, cancelled, setTimeout: register, setInterval: register, clearTimeout: clear, clearInterval: clear };
}

test('cleanup cancels injected timers and prevents late capture or state responses from rearming them', async () => {
  const net = network();
  const capture = deferred();
  const state = deferred();
  const timers = scheduler();
  const page = loadTvPage({
    config: CONFIG, timers,
    fetch: (url, init) => {
      const route = new URL(url).pathname;
      if (route === '/capture') return capture.promise;
      if (route === '/v1/state') return state.promise;
      return net.fetch(url, init);
    },
  });
  await waitTick();
  assert.ok(timers.pending.size > 0);
  assert.equal(page.timers.pending.size, timers.pending.size);
  const staleCallbacks = [...timers.pending.values()].map(timer => timer.callback);
  const scheduledBefore = page.calls.timers;
  const cancelledBefore = timers.cancelled.length;
  page.cleanup();
  assert.equal(timers.pending.size, 0);
  assert.equal(page.timers.pending.size, 0);
  assert.equal(timers.cancelled.length - cancelledBefore, staleCallbacks.length);
  page.cleanup();
  for (const callback of staleCallbacks) callback();
  capture.resolve(response({ active: false, stopping: false }));
  state.resolve(response(net.state));
  await waitTick();
  assert.equal(page.window.tvlensPanel.stats.renders, 1, 'the late response was actually received');
  assert.equal(page.calls.timers, scheduledBefore);
  assert.equal(timers.pending.size, 0);
  assert.equal(page.timers.pending.size, 0);
  assert.equal(timers.cancelled.length - cancelledBefore, staleCallbacks.length, 'cleanup is idempotent');
});

test('each page owns its storage even when seeded from the same entries', () => {
  const seed = { 'tvlens.overlay': '{"displayMs":8000,"alerts":true}' };
  const first = loadTvPage({ storage: seed });
  const second = loadTvPage({ storage: seed });
  first.localStorage.setItem('tvlens.overlay', 'changed');
  first.localStorage.setItem('private', 'first page');
  assert.equal(second.localStorage.getItem('tvlens.overlay'), seed['tvlens.overlay']);
  assert.equal(second.localStorage.getItem('private'), null);
  assert.equal(seed['tvlens.overlay'], '{"displayMs":8000,"alerts":true}');
  first.cleanup();
  second.cleanup();
});

test('manually driving a poll consumes its injected timeout registration before cleanup', async t => {
  const net = network();
  const timers = scheduler();
  const page = loadTvPage({ config: CONFIG, fetch: net.fetch, timers });
  t.after(() => page.cleanup());
  await waitTick();
  const poll = [...page.timers.pending].find(([, timer]) => !timer.repeat && timer.delay === 1000)[0];
  const before = page.calls.requests;
  page.timers.run(poll);
  await waitTick();
  assert.equal(page.calls.requests, before + 1);
  page.cleanup();
  assert.equal(page.timers.pending.size, 0);
  assert.equal(timers.pending.size, 0, 'no consumed timeout remains owned by the injected scheduler');
});


test('the open panel controls server surveillance and local cards without ambient requests', async t => {
  const net = network();
  net.state.surveillance.enabled = false;
  net.state.surveillance.activation = null;
  net.state.surveillance.activity = { state: 'idle', label: 'Surveillance inactive.' };
  let now = 0;
  const page = loadTvPage({
    config: CONFIG, now: () => now,
    fetch: async (url, init) => {
      const route = new URL(url).pathname;
      if (!['/v1/surveillance/start', '/v1/surveillance/stop'].includes(route)) return net.fetch(url, init);
      net.calls.push({ url, ...init });
      const enabled = route.endsWith('/start');
      Object.assign(net.state.surveillance, {
        enabled,
        activation: { instruction: 'Vérifie les chiffres.', t0Ms: 16000 },
        activity: enabled
          ? { state: 'verifying', label: 'Vérification en cours…', waiting: 2 }
          : { state: 'stopped', label: 'Surveillance arrêtée.' },
      });
      return response({ surveillance: net.state.surveillance });
    },
  });
  t.after(() => page.cleanup());
  const noAmbient = () => assert.deepEqual(net.calls.filter(call => new URL(call.url).pathname.startsWith('/ambient')), []);
  await waitTick();
  noAmbient();
  page.el('show-surveillance').click();
  await waitTick();
  assert.equal(page.el('surveillance-view').hidden, false);
  assert.equal(page.el('surv-status').textContent, 'Surveillance inactive.');
  noAmbient();
  page.input('surv-instruction', 'Vérifie les chiffres.');
  page.el('surv-toggle').click();
  await waitTick();
  assert.equal(page.el('surv-toggle').textContent, 'Arrêter la surveillance');
  assert.match(page.el('surv-status').textContent, /^Vérification en cours/);
  noAmbient();
  const tick = [...page.timers.pending].find(([, timer]) => timer.repeat && timer.delay === 250)[0];
  const second = [...page.timers.pending].find(([, timer]) => timer.repeat && timer.delay === 1000)[0];
  page.timers.run(tick);
  assert.equal(page.el('overlay-activity').hidden, false);
  assert.equal(page.el('overlay-activity').querySelector('.tvl-pill-label').textContent, 'Vérification en cours… · 2 en attente');
  page.el('surv-duration').click();
  assert.equal(page.el('surv-duration').textContent, 'Durée des alertes · 20 s');
  page.el('surv-duration').click();
  assert.equal(page.el('surv-duration').textContent, 'Durée des alertes · 8 s');
  page.el('surv-alerts').click();
  assert.equal(page.el('surv-alerts').textContent, 'Alertes à l’écran · non');
  assert.deepEqual(JSON.parse(page.localStorage.getItem('tvlens.overlay')), { displayMs: 8000, alerts: false });
  net.state.surveillance.overlay = { seq: 1, cards: [{
    id: 'lot-1', seq: 1, kind: 'verification', text: 'Le chiffre concorde avec la publication.',
    interval: { startMs: 8000, endMs: 16000 }, finishedAt: SERVER_NOW,
    sources: [{ title: 'Publication', url: 'https://www.insee.fr/statistiques/1' }],
  }] };
  page.window.tvlensPanel.kick();
  await waitTick();
  page.timers.run(tick);
  assert.equal(page.el('overlay-card').hidden, true);
  assert.equal(page.el('overlay-activity').hidden, true);
  page.el('show-surveillance').click();
  assert.equal(page.el('show-surveillance').textContent, 'Surveillance (1)');
  page.el('show-surveillance').click();
  page.el('surv-alerts').click();
  const card = page.el('overlay-card');
  assert.equal(card.hidden, false);
  assert.equal(card.querySelector('.tvl-card-text').textContent, 'Le chiffre concorde avec la publication.');
  assert.equal(card.querySelector('.tvl-card-sources').textContent, 'Sources : insee.fr');
  assert.equal(page.el('overlay-activity').hidden, true);
  for (let i = 0; i < 5; i++) {
    now += 1000;
    page.timers.run(second);
    await waitTick();
  }
  noAmbient();
  now = 7999;
  page.timers.run(tick);
  assert.equal(card.hidden, false);
  now = 8000;
  page.timers.run(tick);
  assert.equal(card.hidden, true, 'the locally chosen duration is enforced');
  assert.equal(page.el('overlay-activity').hidden, false);
  page.el('show-surveillance').click();
  assert.equal(page.el('show-surveillance').textContent, 'Surveillance', 'the shown card updates the local count');
  page.el('show-surveillance').click();
  page.el('surv-toggle').click();
  await waitTick();
  page.timers.run(tick);
  assert.equal(page.el('surv-toggle').textContent, 'Activer la surveillance');
  assert.equal(page.el('surv-status').textContent, 'Surveillance arrêtée.');
  assert.equal(page.el('overlay-activity').hidden, true);
  const actions = net.calls.filter(call => call.method === 'POST');
  assert.deepEqual(actions.map(call => [call.url, JSON.parse(call.body)]), [
    [CONFIG.url + '/v1/surveillance/start', { sessionId: SESSION_ID, instruction: 'Vérifie les chiffres.' }],
    [CONFIG.url + '/v1/surveillance/stop', { sessionId: SESSION_ID }],
  ]);
  assert.ok(actions.every(call => call.headers.Authorization === 'Bearer ' + CONFIG.token));
  assert.deepEqual(JSON.parse(page.localStorage.getItem('tvlens.overlay')), { displayMs: 8000, alerts: true });
  noAmbient();
});

test('an open overlay reports only its card once per session even after an interruption', t => {
  let now = 0;
  const page = loadTvPage({ now: () => now });
  t.after(() => page.cleanup());
  let paused = false;
  const shown = [];
  const overlay = new page.window.TVLensSurveillance.Overlay({
    settings: () => ({ displayMs: 8000, alerts: true }),
    paused: () => paused,
    suspended: () => false,
    onShown: (...args) => shown.push(structuredClone(args)),
  });
  const state = serverState();
  overlay.update(state);
  overlay.tick();
  assert.deepEqual(shown, []);
  const card = {
    id: 'lot-1', seq: 1, kind: 'verification', text: 'Le chiffre concorde avec la publication.',
    interval: { startMs: 8000, endMs: 16000 }, finishedAt: SERVER_NOW,
    sources: [{ title: 'Publication', url: 'https://www.insee.fr/statistiques/1' }],
  };
  state.surveillance.overlay = { seq: 1, cards: [card] };
  overlay.update(state);
  overlay.tick();
  assert.equal(page.el('overlay-card').hidden, false);
  assert.deepEqual(shown, [[card]], 'the callback receives only the drawn card');
  paused = true;
  overlay.tick();
  assert.equal(page.el('overlay-card').hidden, true);
  paused = false;
  overlay.tick();
  overlay.update(state);
  overlay.tick();
  assert.equal(page.el('overlay-card').hidden, false);
  assert.deepEqual(shown, [[card]], 'redrawing the same card must not count it twice');
  state.session.id = '22222222-2222-4222-8222-222222222222';
  state.surveillance.overlay = { seq: 0, cards: [] };
  overlay.update(state);
  overlay.tick();
  assert.equal(page.el('overlay-card').hidden, true);
  now = 8000;
  state.surveillance.overlay = { seq: 1, cards: [card] };
  overlay.update(state);
  overlay.tick();
  assert.equal(page.el('overlay-card').hidden, false);
  assert.deepEqual(shown, [[card], [card]], 'the same sequence in a new session counts again');
});

test('the paired page loads the polling controller and its public kick and stop drive real reads', async t => {
  const { manualClock } = require('./helpers/clock.cjs');
  const clock = manualClock();
  const net = network();
  const late = deferred();
  const reads = [];
  const page = loadTvPage({
    config: CONFIG, now: clock.io.now,
    timers: { setTimeout: clock.io.setTimer, clearTimeout: clock.io.clearTimer },
    fetch: (url, init) => {
      if (new URL(url).pathname === '/v1/state') {
        reads.push(url);
        if (reads.length === 2) return late.promise;
      }
      return net.fetch(url, init);
    },
  });
  t.after(() => page.cleanup());
  await clock.advance(0);
  assert.equal(typeof page.window.TVLensPollController, 'object');
  assert.equal(typeof page.window.TVLensPollController.createPollController, 'function');
  const at = page.scripts.indexOf('poll-controller.js');
  assert.ok(page.scripts.indexOf('chat-model.js') < at);
  assert.ok(at < page.scripts.indexOf('companion.js'));
  const panel = page.window.tvlensPanel;
  assert.equal(typeof panel.kick, 'function');
  assert.equal(typeof panel.state, 'function');
  assert.equal(typeof panel.stop, 'function');
  assert.deepEqual({ ...panel.stats }, { polls: 1, notModified: 0, renders: 1, legacy: false, failures: 0 });
  const held = panel.state();
  const card = page.el('conversation').firstChild;
  panel.kick();
  assert.equal(reads.length, 2, 'the real public kick reads immediately');
  panel.kick();
  panel.kick();
  assert.equal(reads.length, 2);
  panel.stop();
  panel.stop();
  panel.kick();
  late.resolve(response({ ...net.state, session: null }));
  await clock.advance(20000);
  assert.equal(reads.length, 2);
  assert.equal(panel.state(), held, 'a late response cannot replace page state');
  assert.equal(page.el('conversation').firstChild, card);
  assert.deepEqual({ ...panel.stats }, { polls: 1, notModified: 0, renders: 1, legacy: false, failures: 0 });
  const presentation = [...page.timers.pending.values()].filter(timer => timer.repeat);
  assert.deepEqual(presentation.map(timer => timer.delay).sort((a, b) => a - b), [250, 1000]);
});

for (const status of [401, 500, null]) {
  test('the paired page preserves its offline send state after ' + (status || 'a network failure') + ' until a 304 reconnects', async t => {
    const net = network();
    let failure = false;
    let revalidated = false;
    const page = loadTvPage({
      config: CONFIG,
      fetch: (url, init) => {
        if (new URL(url).pathname !== '/v1/state') return net.fetch(url, init);
        if (failure) {
          if (!status) throw new Error('offline');
          return { status, ok: false, json: async () => ({ error: 'Refus du serveur.' }) };
        }
        if (revalidated) return { status: 304 };
        return { ...response(net.state), headers: { get: () => '"panel-1"' } };
      },
    });
    t.after(() => page.cleanup());
    await waitTick();
    const panel = page.window.tvlensPanel;
    const held = panel.state();
    const card = page.el('conversation').firstChild;
    assert.equal(page.el('send').disabled, false);
    failure = true;
    panel.kick();
    await waitTick();
    const message = status === 401
      ? 'Appairage refusé par le serveur · vérifie le jeton de cette TV.'
      : 'Serveur inaccessible · reconnexion…';
    assert.equal(page.el('connection').textContent, message);
    assert.equal(page.el('send').disabled, true);
    const second = [...page.timers.pending].find(([, timer]) => timer.repeat && timer.delay === 1000)[0];
    page.timers.run(second);
    assert.equal(page.el('send').disabled, true, 'local presentation cannot enable sending while offline');
    assert.equal(page.el('connection').textContent, message);
    assert.deepEqual({ ...panel.stats }, { polls: 1, notModified: 0, renders: 1, legacy: false, failures: 1 });
    failure = false;
    revalidated = true;
    panel.kick();
    await waitTick();
    assert.equal(page.el('connection').textContent, 'Capture reçue');
    assert.equal(page.el('send').disabled, false);
    assert.equal(panel.state(), held);
    assert.equal(page.el('conversation').firstChild, card);
    assert.deepEqual({ ...panel.stats }, { polls: 2, notModified: 1, renders: 1, legacy: false, failures: 0 });
  });
}

test('transcription availability renders one durable coded warning and clears on recovery without exposing private diagnostics', async t => {
  const net = network();
  net.state.transcription = { language: 'fr', available: false, code: 'TVLENS_WHISPER_MODEL_MISSING', error: '/private/model.bin' };
  const page = loadTvPage({ config: CONFIG, fetch: net.fetch });
  t.after(() => page.cleanup());
  await waitTick();
  const warning = page.document.getElementById('transcription-warning');
  assert.ok(warning, 'the real page contains the persistent warning');
  assert.equal(warning.hidden, false);
  assert.equal(warning.dataset.code, 'TVLENS_WHISPER_MODEL_MISSING');
  assert.match(warning.textContent, /modèle introuvable/);
  assert.doesNotMatch(warning.textContent, /private|model.bin/);
  page.window.tvlensPanel.kick();
  await waitTick();
  assert.equal(warning.hidden, false);
  net.state.transcription.code = 'TVLENS_WHISPER_BINARY_MISSING';
  page.window.tvlensPanel.kick();
  await waitTick();
  assert.match(warning.textContent, /binaire introuvable/);
  net.state.transcription = { language: 'fr', available: true, code: null };
  page.window.tvlensPanel.kick();
  await waitTick();
  assert.equal(warning.hidden, true);
  assert.equal(warning.textContent, '');
});
