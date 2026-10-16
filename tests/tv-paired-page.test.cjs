const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadTvPage, KEYS } = require('./helpers/tv-page.cjs');

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
// An event-loop barrier drains promises from already controlled responses; it waits for no duration.
const settle = () => new Promise(setImmediate);
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
  await settle();
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

function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

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
  await settle();
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
  await settle();
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
  await settle();
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
  await settle();
  page.el('show-surveillance').click();
  await settle();
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
  await settle();
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
  await settle();
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
  await settle();
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
  await settle();
  const poll = [...page.timers.pending].find(([, timer]) => !timer.repeat && timer.delay === 1000)[0];
  const before = page.calls.requests;
  page.timers.run(poll);
  await settle();
  assert.equal(page.calls.requests, before + 1);
  page.cleanup();
  assert.equal(page.timers.pending.size, 0);
  assert.equal(timers.pending.size, 0, 'no consumed timeout remains owned by the injected scheduler');
});
