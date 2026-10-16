const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadTvPage, KEYS } = require('./helpers/tv-page.cjs');
const model = require('../tv/app/chat-model.js');
const shared = require('../tv/app/text.js');

const snapshot = (jobs = [], id = 's1') => ({
  session: { id, segments: [{ id: 'moment-1', available: true }] },
  chat: { jobs, timeoutMs: 90000 }, serverNowMs: 100000,
});
const job = (extra = {}) => ({ id: 'deep-1', question: '<img src=x> ?', anchorMs: 16000, status: 'queued', ...extra });
function harness(t, actions = {}) {
  const page = loadTvPage();
  t.after(page.cleanup);
  const create = page.window.TVLensChatView && page.window.TVLensChatView.createChatView;
  assert.equal(typeof create, 'function', 'the real page loads the chat view factory');
  let now = 0;
  const view = create({
    document: page.document, elements: page.el, model, text: shared, now: () => now,
    isReading: () => page.el('conversation').dataset.reading === 'true',
    actions: { ask: async () => ({ id: 'deep-2' }), cancel: async () => ({}), kick: () => {}, onSubmit: () => {}, ...actions },
  });
  return { page, view, advance: value => { now = value; }, list: page.el('conversation') };
}

test('a repeated job keeps one article from queued through running to a cited answer rendered as text', t => {
  const { page, view, list } = harness(t);
  view.receive(snapshot([job()]), 0);
  const article = list.firstChild;
  const heading = article.querySelector('h2');
  view.receive(snapshot([job()]), 0);
  assert.equal(list.children.length, 1);
  assert.equal(list.firstChild, article);
  assert.equal(article.querySelector('h2'), heading, 'unchanged job does not rebuild its children');
  view.receive(snapshot([job({ status: 'running', preview: 'Brouillon <b>brut</b>' })]), 0);
  assert.equal(list.firstChild, article);
  assert.match(article.textContent, /Réponse provisoire/);
  assert.match(article.textContent, /Brouillon <b>brut<\/b>/);
  view.receive(snapshot([job({ status: 'done', result: {
    kind: 'external', answer: '<script>réponse</script>',
    citations: [{ id: 'moment-1', startMs: 8000, endMs: 16000 }],
    sources: [{ title: '<b>Publication</b>', url: 'https://example.test/?q=<img>' }],
    hypotheses: [{ text: 'Une hypothèse' }], limits: ['Une limite'],
  } })]), 0);
  assert.equal(list.children.length, 1);
  assert.equal(list.firstChild, article);
  assert.equal(article.querySelector('.chat-answer').textContent, '<script>réponse</script>');
  assert.equal(article.querySelector('script'), null);
  assert.equal(article.querySelector('img'), null);
  assert.match(article.textContent, /Réponse avec sources/);
  assert.match(article.textContent, /0:08–0:16 · passage conservé/);
  const citation = article.querySelectorAll('small').find(node => node.textContent === '0:08–0:16 · passage conservé');
  assert.ok(citation, 'the citation remains a small text line');
  assert.equal(article.querySelector('button'), null, 'a finished answer adds no citation command');
  assert.equal(article.querySelector('.source-card').textContent, '<b>Publication</b>\nhttps://example.test/?q=<img>');
  assert.match(article.textContent, /Hypothèse : Une hypothèse/);
  assert.match(article.textContent, /Une limite/);
  assert.equal(page.calls.requests, 0);
});

for (const [name, extra, labels] of [
  ['technical failure', { status: 'error', message: 'Diagnostic expurgé.',
    errorDetail: { authRequired: true, turnStatus: 'failed', turnError: { code: 'auth_required' } },
    preview: 'Brouillon', provisional: 'Résumé',
  }, ['Reconnexion Codex requise', 'Diagnostic expurgé.', 'Réponse provisoire interrompue (non validée)', 'Résumé automatique partiel']],
  ['abstention', { status: 'done', result: { kind: 'insufficient', answer: 'Pas de preuve.' } }, ['Contexte insuffisant', 'Pas de preuve.']],
  ['provisional answer', { status: 'running', preview: 'Brouillon', provisional: 'Résumé' }, ['Réponse provisoire', 'Résumé automatique partiel']],
]) {
  test('the card shows the distinct labels for a ' + name, t => {
    const { view, list } = harness(t);
    view.receive(snapshot([job(extra)]), 0);
    for (const label of labels) assert.ok(list.textContent.includes(label), label);
    if (extra.status === 'error') assert.equal(list.textContent.includes('Contexte insuffisant'), false);
  });
}

test('progress advances from the received server clock without a new body or reconstructed nodes', t => {
  const { view, list, advance } = harness(t);
  view.receive(snapshot([job({ status: 'running', startedAt: 28000 })]), 0);
  const article = list.firstChild;
  const heading = article.firstChild;
  const progress = article.querySelector('.job-progress');
  assert.equal(progress.textContent, 'En cours · 1:12 / 1:30 max');
  assert.equal(typeof view.tick, 'function');
  advance(4000);
  view.tick();
  assert.equal(progress.textContent, 'En cours · 1:16 / 1:30 max');
  assert.equal(list.firstChild, article);
  assert.equal(article.firstChild, heading);
  assert.equal(article.querySelector('.job-progress'), progress);
});

test('an older server uses the monotonic time first seen running and queue positions come from the model', t => {
  const { view, list, advance } = harness(t);
  const state = snapshot([job(), job({ id: 'deep-2' })]);
  delete state.serverNowMs;
  view.receive(state, 0);
  assert.equal(list.firstChild.querySelector('.job-progress').textContent, 'En file · position 1 sur 2');
  assert.equal(list.lastChild.querySelector('.job-progress').textContent, 'En file · position 2 sur 2');
  advance(1000);
  state.chat.jobs[0] = job({ status: 'running' });
  view.receive(state, 1000);
  advance(24000);
  view.tick();
  assert.equal(list.firstChild.querySelector('.job-progress').textContent, 'En cours · 0:23 / 1:30 max');
});

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const target = () => ({ sessionId: 's1', ms: 16000, range: { firstId: 'moment-1', lastId: 'moment-2' } });

test('submission echoes and locks immediately, freezes its target and releases the IME before the response', async t => {
  const answer = deferred();
  const calls = [];
  let released = 0, kicks = 0;
  const { page, view, list } = harness(t, {
    ask: (...args) => { calls.push(args); return answer.promise; },
    onSubmit: () => { released++; }, kick: () => { kicks++; },
  });
  view.receive(snapshot(), 0);
  page.el('question').focus();
  page.input('question', '  La question ?  ');
  assert.equal(typeof view.submit, 'function');
  const at = target();
  const done = view.submit(at);
  const echo = list.firstChild;
  assert.equal(echo.dataset.pending, 'true');
  assert.equal(echo.querySelector('h2').textContent, 'La question ?');
  assert.equal(page.el('send').disabled, true);
  assert.equal(page.activeId(), 'dictate');
  assert.equal(released, 1);
  at.sessionId = 's2';
  at.ms = 99999;
  at.range.firstId = 'moment-9';
  await view.submit(target());
  assert.deepEqual(structuredClone(calls), [['La question ?', 's1', 16000, { firstId: 'moment-1', lastId: 'moment-2' }]]);
  assert.equal(list.children.length, 1);
  page.el('capture').focus();
  answer.resolve({ id: 'deep-2' });
  await done;
  assert.equal(list.firstChild, echo);
  assert.equal(echo.dataset.job, 'deep-2');
  assert.equal(page.el('question').value, '');
  assert.equal(page.activeId(), 'capture', 'network completion does not move focus again');
  assert.equal(page.el('send').disabled, false);
  assert.equal(kicks, 1);
  view.receive(snapshot([job({ id: 'deep-2' })]), 0);
  assert.equal(list.firstChild, echo);
  assert.equal(echo.hasAttribute('data-pending'), false);
});

test('when polling creates the job before acknowledgement the pending echo is removed without a duplicate', async t => {
  const answer = deferred();
  let kicks = 0;
  const { page, view, list } = harness(t, { ask: () => answer.promise, kick: () => { kicks++; } });
  view.receive(snapshot(), 0);
  page.input('question', 'Envoyée');
  assert.equal(typeof view.submit, 'function');
  const done = view.submit(target());
  const echo = list.firstChild;
  view.receive(snapshot([job({ id: 'deep-2', question: 'Envoyée' })]), 0);
  const polled = list.lastChild;
  assert.notEqual(polled, echo);
  assert.equal(list.children.length, 2, 'one echo and one confirmed card before acknowledgement');
  page.input('question', 'Nouvelle saisie');
  answer.resolve({ id: 'deep-2' });
  await done;
  assert.equal(list.children.length, 1, 'only the confirmed job remains');
  assert.equal(list.firstChild, polled);
  assert.equal(echo.isConnected, false);
  assert.equal(page.el('question').value, 'Nouvelle saisie');
  assert.equal(page.el('send').disabled, false);
  assert.equal(kicks, 1);
});

test('a failed submission removes its echo, preserves the question, shows the error and unlocks sending', async t => {
  const answer = deferred();
  const { page, view, list } = harness(t, { ask: () => answer.promise });
  view.receive(snapshot(), 0);
  page.input('question', 'Réessaie ?');
  assert.equal(typeof view.submit, 'function');
  const done = view.submit(target());
  const echo = list.firstChild;
  answer.reject(Object.assign(new Error('Envoi refusé.'), { code: 'submission-refused' }));
  await done;
  assert.equal(echo.isConnected, false);
  assert.equal(list.children.length, 0);
  assert.equal(page.el('question').value, 'Réessaie ?');
  assert.equal(page.el('error').textContent, 'Envoi refusé.');
  assert.equal(page.el('send').disabled, false);
});

for (const outcome of ['success', 'error']) {
  test('a session change clears cards and ignores a late submission ' + outcome + ' without unlocking a newer send', async t => {
    const old = deferred(), current = deferred();
    let requests = 0, kicks = 0;
    const { page, view, list } = harness(t, {
      ask: () => (++requests === 1 ? old.promise : current.promise), kick: () => { kicks++; },
    });
    view.receive(snapshot([job()]), 0);
    page.input('question', 'Ancienne question');
    const done = view.submit(target());
    const echo = list.lastChild;
    view.receive(snapshot([job({ question: 'Nouvelle conversation' })], 's2'), 0);
    assert.equal(list.children.length, 1, 'old cards and echo are disconnected');
    assert.equal(echo.isConnected, false);
    assert.equal(page.el('send').disabled, false);
    page.input('question', 'Question courante');
    const next = view.submit({ sessionId: 's2', ms: 1000 });
    assert.equal(requests, 2);
    if (outcome === 'success') old.resolve({ id: 'deep-1' });
    else old.reject(new Error('Ancien refus'));
    await done;
    assert.equal(page.el('question').value, 'Question courante');
    assert.equal(page.el('error').textContent, '');
    assert.equal(page.el('send').disabled, true, 'old finally cannot unlock the new submission');
    assert.equal(list.children.length, 2);
    assert.equal(list.firstChild.querySelector('h2').textContent, 'Nouvelle conversation');
    assert.equal(kicks, 0);
    current.resolve({ id: 'deep-2' });
    await next;
    assert.equal(page.el('send').disabled, false);
    assert.equal(kicks, 1);
  });
}

test('reset disconnects pending echoes and releases the submission state', async t => {
  const answer = deferred();
  const { page, view, list } = harness(t, { ask: () => answer.promise });
  view.receive(snapshot([job()]), 0);
  page.input('question', 'Question');
  const done = view.submit(target());
  assert.equal(typeof view.reset, 'function');
  view.reset();
  assert.equal(list.children.length, 0);
  assert.equal(page.el('send').disabled, true, 'no session remains after reset');
  answer.resolve({ id: 'deep-2' });
  await done;
  assert.equal(list.children.length, 0);
  assert.equal(page.el('question').value, 'Question');
});

test('cancellation uses the current running job, otherwise the last queued, and preserves focus when the target disappears', async t => {
  const cancelled = [];
  let kicks = 0;
  const { page, view, list } = harness(t, {
    cancel: async id => { cancelled.push(id); return { cancelled: false }; }, kick: () => { kicks++; },
  });
  const jobs = [job(), job({ id: 'deep-2', status: 'running' }), job({ id: 'deep-3' })];
  view.receive(snapshot(jobs), 0);
  const button = page.el('cancel-question');
  assert.equal(button.hidden, false);
  assert.equal(button.textContent, 'Annuler la question en cours');
  button.click();
  await new Promise(setImmediate);
  assert.deepEqual(cancelled, ['deep-2']);
  assert.equal(page.el('error').textContent, 'Cette question était déjà terminée.');
  view.receive(snapshot([jobs[0], jobs[2]]), 0);
  assert.equal(button.textContent, 'Retirer la question en file');
  button.click();
  await new Promise(setImmediate);
  assert.deepEqual(cancelled, ['deep-2', 'deep-3']);
  list.firstChild.querySelector('button').click();
  await new Promise(setImmediate);
  assert.deepEqual(cancelled, ['deep-2', 'deep-3', 'deep-1']);
  assert.equal(kicks, 3);
  button.focus();
  view.receive(snapshot([job({ status: 'done' }), job({ id: 'deep-3', status: 'done' })]), 0);
  assert.equal(button.hidden, true);
  assert.equal(page.activeId(), 'dictate');
});

test('sending shows its echo and follows acknowledgement while reading and navigation keep priority', async t => {
  const { page, view, list } = harness(t);
  view.receive(snapshot([job()]), 0);
  list.scrollHeight = 1000;
  list.clientHeight = 200;
  list.scrollTop = 100;
  view.receive(snapshot([job({ status: 'running' })]), 0);
  assert.equal(list.scrollTop, 100);
  page.input('question', 'Question');
  await view.submit(target());
  assert.equal(list.scrollTop, 1000, 'the immediate echo is visible even when the conversation was scrolled up');
  list.scrollTop = 100;
  view.receive(snapshot([job({ status: 'done' })]), 0);
  assert.equal(list.scrollTop, 1000, 'the render following acknowledgement follows latest outside reading or navigation');
  list.scrollTop = 800;
  list.focus();
  view.receive(snapshot([job()]), 0);
  assert.equal(list.scrollTop, 800, 'navigation in the conversation owns scrolling');
  list.firstChild.querySelector('button').focus();
  view.receive(snapshot([job()]), 0);
  assert.equal(list.scrollTop, 800, 'a descendant control also owns scrolling');
  page.el('dictate').focus();
  list.dataset.reading = 'true';
  view.receive(snapshot([job()]), 0);
  assert.equal(list.scrollTop, 800);
  list.dataset.reading = 'false';
  view.receive(snapshot([job()]), 0);
  assert.equal(list.scrollTop, 1000);
});

for (const navigation of ['reading', 'conversation', 'card']) {
  test('following acknowledgement preserves ' + navigation + ' and does not defer a forced jump', async t => {
    const answer = deferred();
    const { page, view, list } = harness(t, { ask: () => answer.promise });
    view.receive(snapshot([job()]), 0);
    list.scrollHeight = 1000;
    list.clientHeight = 200;
    page.input('question', 'Une question');
    const done = view.submit(target());
    assert.equal(list.scrollTop, 1000, 'the echo is visible immediately');
    list.scrollTop = 100;
    if (navigation === 'reading') list.dataset.reading = 'true';
    else if (navigation === 'conversation') list.focus();
    else list.firstChild.querySelector('button').focus();
    answer.resolve({ id: 'deep-2' });
    await done;
    view.receive(snapshot([job()]), 0);
    assert.equal(list.scrollTop, 100, 'acknowledgement cannot interrupt reading or focus in the conversation');
    page.el('dictate').focus();
    list.dataset.reading = 'false';
    view.receive(snapshot([job()]), 0);
    assert.equal(list.scrollTop, 100, 'the forced follow is consumed by the first render, even when navigation prevented it');
  });
}

test('an immediate echo also respects active reading', async t => {
  const { page, view, list } = harness(t);
  view.receive(snapshot([job()]), 0);
  list.scrollHeight = 1000;
  list.clientHeight = 200;
  list.scrollTop = 100;
  list.dataset.reading = 'true';
  page.input('question', 'Une question');
  await view.submit(target());
  assert.equal(list.scrollTop, 100);
});

test('connection changes only availability and never rebuild cards or reset their clock', t => {
  const { page, view, list, advance } = harness(t);
  view.receive(snapshot([job({ status: 'running', startedAt: 28000 })]), 0);
  const heading = list.firstChild.firstChild;
  assert.equal(typeof view.setOnline, 'function');
  view.setOnline(false);
  assert.equal(page.el('send').disabled, true);
  advance(4000);
  view.tick();
  assert.equal(page.el('send').disabled, true);
  view.setOnline(true);
  assert.equal(page.el('send').disabled, false);
  assert.equal(list.firstChild.firstChild, heading);
  assert.equal(list.firstChild.querySelector('.job-progress').textContent, 'En cours · 1:16 / 1:30 max');
});

const CONFIG = { url: 'https://inference.test', controlUrl: 'http://controller.test', token: 'fictitious-pairing-token' };
const SESSION = '11111111-1111-4111-8111-111111111111';
const reply = body => ({ status: 200, ok: true, headers: { get: () => '"revision"' }, json: async () => JSON.parse(JSON.stringify(body)) });
const settle = () => new Promise(setImmediate);
function paired(t) {
  let now = 0;
  const answer = deferred();
  const calls = [];
  const held = {
    ...snapshot([job({ status: 'running', startedAt: 28000 })], SESSION),
    transcription: { language: 'fr' }, storage: { state: 'ok' },
  };
  Object.assign(held.session, { elapsedMs: 16000, capturedThroughMs: 16000, analyzedThroughMs: 16000, pending: 0, accepting: true });
  held.timeline = { sessionId: SESSION, cards: [{
    id: 'moment-1', segmentIds: ['moment-1', 'moment-2'], startMs: 0, endMs: 16000,
    title: 'Un moment', summary: 'Résumé', pending: 0, status: 'ready',
  }] };
  let body = held;
  let layout = { active: true, mode: 'chat' };
  const page = loadTvPage({
    config: CONFIG, now: () => now,
    fetch: (url, init) => {
      calls.push({ route: new URL(url).pathname, ...init });
      switch (new URL(url).pathname) {
        case '/capture': return reply({ active: false });
        case '/panel': return reply(layout);
        case '/panel/chat':
        case '/panel/timeline':
          layout = { active: true, mode: new URL(url).pathname.split('/').pop(), requestId: 'layout-confirmed' };
          return reply({ id: layout.requestId });
        case '/v1/moments/detail': return reply({ summary: 'Le passage demandé.', passages: [] });
        case '/v1/state': return body === null ? { status: 304 } : reply(body);
        case '/v1/questions': return answer.promise;
        default: throw new Error('Unexpected route: ' + url);
      }
    },
  });
  t.after(page.cleanup);
  return { page, calls, answer, held, advance: value => { now = value; }, respond: value => { body = value; } };
}

test('the paired form delegates submission and a late old-session response cannot clear its text', async t => {
  const { page, answer, respond, held } = paired(t);
  await settle();
  page.el('dictate').click();
  page.keyboard(true);
  page.input('question', 'Ma question');
  const { done } = page.submit();
  const echo = page.el('conversation').lastChild;
  assert.equal(page.activeId(), 'dictate');
  assert.equal(page.el('send').disabled, true);
  respond({ ...held, session: { ...held.session, id: '22222222-2222-4222-8222-222222222222' }, chat: { jobs: [] } });
  page.window.tvlensPanel.kick();
  await settle();
  assert.equal(echo.isConnected, false);
  answer.resolve(reply({ id: 'deep-2' }));
  await done;
  assert.equal(page.el('question').value, 'Ma question', 'an old acknowledgement has no form effects in the new conversation');
  assert.equal(page.el('conversation').children.length, 0);
  assert.equal(page.el('send').disabled, false);
});

test('a real 304 preserves the card children and clock while a chat body keeps the timeline', async t => {
  const { page, held, respond, advance } = paired(t);
  await settle();
  const panel = page.window.tvlensPanel;
  // The transport revalidates per URL: prime the chat resource before returning its 304.
  respond({ ...held, view: 'chat', timeline: undefined });
  panel.kick();
  await settle();
  const heading = page.el('conversation').firstChild.firstChild;
  const progress = page.el('conversation').querySelector('.job-progress');
  const timeline = panel.state().timeline;
  assert.equal(timeline.cards[0].id, 'moment-1');
  respond(null);
  advance(4000);
  panel.kick();
  await settle();
  assert.equal(panel.stats.renders, 2);
  assert.equal(panel.stats.notModified, 1);
  assert.equal(page.el('conversation').firstChild.firstChild, heading);
  const second = [...page.timers.pending].find(([, timer]) => timer.repeat && timer.delay === 1000)[0];
  page.timers.run(second);
  assert.equal(progress.textContent, 'En cours · 1:16 / 1:30 max');
  respond({ ...held, view: 'chat', timeline: undefined, serverNowMs: 104000 });
  panel.kick();
  await settle();
  assert.equal(panel.state().timeline, timeline);
  assert.equal(page.el('conversation').firstChild.firstChild, heading);
  assert.equal(panel.stats.renders, 3);
});

test('the real selected-moment form sends fixed passage bounds and releases the keyboard before acknowledgement', async t => {
  const { page, answer, calls, advance, held } = paired(t);
  await settle();
  page.el('show-timeline').click();
  await settle();
  page.el('timeline-rail').querySelector('button').click();
  await settle();
  page.el('detail-ask').click();
  await settle();
  assert.equal(page.activeId(), 'question');
  assert.equal(page.el('moment-context').hidden, false);
  page.keyboard(true);
  page.input('question', '  Ce moment ?  ');
  advance(90000);
  const { done } = page.submit();
  const echo = page.el('conversation').lastChild;
  assert.equal(page.activeId(), 'dictate');
  assert.equal(page.el('send').disabled, true);
  await page.submit().done;
  const sent = calls.filter(call => call.route === '/v1/questions');
  assert.equal(sent.length, 1);
  assert.deepEqual(JSON.parse(sent[0].body), {
    question: 'Ce moment ?', sessionId: SESSION, anchorMs: 16000,
    moment: { firstId: 'moment-1', lastId: 'moment-2' },
  });
  page.el('question').focus();
  page.press(KEYS.down);
  assert.equal(page.activeId(), 'dictate', 'the keyboard is already released while HTTP is pending');
  page.input('question', 'Autre saisie');
  page.el('capture').focus();
  held.chat.jobs.push(job({ id: 'deep-2', question: 'Ce moment ?' }));
  answer.resolve(reply({ id: 'deep-2' }));
  await done;
  await settle();
  assert.equal(page.el('conversation').lastChild, echo);
  assert.equal(echo.dataset.job, 'deep-2');
  assert.equal(page.el('question').value, 'Autre saisie');
  assert.equal(page.activeId(), 'capture');
  assert.equal(calls.filter(call => call.route === '/v1/state').length, 2, 'success accelerates the real poll controller');
});
