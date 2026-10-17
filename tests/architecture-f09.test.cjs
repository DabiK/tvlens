const { memoryOf } = require('./helpers/memory-consultation.cjs');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { LivingRecap } = require('../core/living-recap.cjs');
const { CodexRecap } = require('../adapters/codex-recap.cjs');

// F09: a session too long for one synthesis is refused for its size, said as such, and attempted again only once
// what a synthesis is sent has changed. Offline: the real adapter behind the real core, composed as app/main.cjs
// composes them, with a double where Codex would answer; an injected clock, no file, no provider. Attempts,
// calls and statuses only: nothing here measures a latency, a size reached in real use or how often it is reached.
const CAPACITY = 'TVLENS_RECAP_CAPACITY', LIMIT = 240000, WINDOW = 25000;
const REFUSED = 'La session dépasse la capacité de cette synthèse automatique. Le dernier résumé reste disponible ; tous les passages originaux sont conservés.';
const source = (id, startMs, endMs, text = 'Une scène', status = 'ready') => ({ id, startMs, endMs, status, available: true, observation: status === 'ready' ? { summary: text } : null });
const snapshot = (segments, history = [], id = 's') => memoryOf({ id, segments, history }).view();
// What the adapter really handed to its agent, read back from the prompt.
const data = request => request.instructions.slice(request.instructions.indexOf('DONNÉES : ') + 'DONNÉES : '.length);
// A valid synthesis of that: earlier chapters kept, every source they do not cite gathered in one more.
const synthesize = ({ chapters, sourcePassages }) => {
  const cited = new Set(chapters.flatMap(chapter => chapter.sourceIds)), rest = sourcePassages.filter(passage => !cited.has(passage.id)).map(passage => passage.id);
  return { overview: `Vue d’ensemble de ${sourcePassages.length} passage(s).`,
    chapters: [...chapters.map(({ title, summary, sourceIds }) => ({ title, summary, sourceIds })), ...(rest.length ? [{ title: `Chapitre ${rest[0]}`, summary: 'La session continue.', sourceIds: rest }] : [])] };
};
// The composition of app/main.cjs: the core's `summarize` goes to the adapter. `attempts` counts what the core
// asked for, `calls` what would have reached Codex.
function compose({ answer = synthesize, ...options } = {}) {
  const host = { now: 0, attempts: 0, calls: 0, states: [] };
  const adapter = new CodexRecap({ agent: { answer: async request => { host.calls++; return answer(JSON.parse(data(request))); } } });
  host.recap = new LivingRecap({ now: () => host.now, onChange: state => host.states.push(state), summarize: input => { host.attempts++; return adapter.summarize(input); }, ...options });
  return host;
}
// Passages at the 1 200 characters the core keeps of each: a hundred of them, sent as new and as originals, are
// more than one synthesis takes.
const first = source('a', 0, 8000, 'Premier sujet');
const long = (i, text = 'x'.repeat(1200)) => source(`long-${i}`, 8000 + i * 8000, 16000 + i * 8000, text);
const many = (count, text) => Array.from({ length: count }, (_, i) => long(i, text));
// A first recap of one passage, then the hundred long ones: the second synthesis is over the capacity.
async function overCapacity(options) {
  const host = compose(options);
  host.recap.observe(snapshot([first])); await host.recap.tick();
  host.now = 30000; host.passages = [first, ...many(100)];
  host.recap.observe(snapshot(host.passages)); await host.recap.tick();
  return host;
}
// Retry windows going by, the host ticking in each as its timer does.
const wait = async (host, windows = 4) => { for (let i = 0; i < windows; i++) { host.now += WINDOW; await host.recap.tick(); } };
// A recap behind a port that answers when told to, by a refusal for size. Reset when its test ends: an attempt
// left in flight by a failed assertion would otherwise hold the run until its 45 s deadline.
function deferred(t, options) {
  const port = { attempts: 0 };
  port.recap = new LivingRecap({ ...options, summarize: () => { port.attempts++; return new Promise((_, reject) => { port.refuse = () => reject(Object.assign(new Error('Trop long pour ce port.'), { code: CAPACITY })); }); } });
  t.after(() => port.recap.reset());
  return port;
}

test('the adapter still sends an input of exactly 240 000 characters and refuses one more, marked as capacity with its measured size, before any provider call', async () => {
  const requests = [];
  const adapter = new CodexRecap({ agent: { answer: async request => { requests.push(request); return { overview: 'Résumé', chapters: [] }; } } });
  const input = (text, available = true) => ({ sessionId: 's', chapters: [], newPassages: [], sourcePassages: [{ id: 'huge', startMs: 0, endMs: 100, text, available }], limits: [], signal: new AbortController().signal });
  await adapter.summarize(input(''));
  const room = LIMIT - data(requests[0]).length;
  await adapter.summarize(input('x'.repeat(room)));
  assert.deepEqual([requests.length, data(requests[1]).length], [2, LIMIT], 'the limit itself is still sent');
  // Replay availability is not part of what is sent, so not of what is measured.
  await adapter.summarize(input('x'.repeat(room), false));
  assert.deepEqual([requests.length, data(requests[2])], [3, data(requests[1])]);
  const error = await adapter.summarize(input('x'.repeat(room + 1))).then(() => assert.fail('one character more should be refused'), error => error);
  assert.deepEqual([error.code, error.size, error.limit, error.message], [CAPACITY, LIMIT + 1, LIMIT, REFUSED]);
  assert.equal(requests.length, 3, 'refused before Codex is asked anything');
});

test('a session over the capacity is refused once: said as capacity, the same input is not attempted again and nothing more is published', async () => {
  const host = await overCapacity();
  assert.deepEqual([host.recap.snapshot().status, host.recap.snapshot().error, host.attempts, host.calls], ['capacity', REFUSED, 2, 1]);
  const published = host.states.length;
  // Minutes go by: the host ticks, is handed the same session again, a question starts and ends.
  for (let i = 0; i < 6; i++) {
    host.now += WINDOW; await host.recap.tick();
    host.recap.observe(snapshot(host.passages)); await host.recap.tick({ busy: true }); await host.recap.tick();
  }
  assert.deepEqual([host.attempts, host.calls, host.states.length], [2, 1, published]);
  assert.deepEqual([host.recap.snapshot().status, host.recap.snapshot().error], ['capacity', REFUSED]);
  // Passages leaving the replay window change what can be replayed, not what a synthesis is sent.
  host.recap.observe(snapshot(host.passages.slice(50), host.passages.slice(0, 50)));
  assert.equal(host.states.length, published + 1, 'the change of availability itself is published');
  await wait(host);
  assert.deepEqual([host.attempts, host.calls, host.recap.snapshot().status], [2, 1, 'capacity']);
});

test('over the capacity, the last recap, its provenance and every original stay as they were, and what waits is counted', async () => {
  const host = await overCapacity();
  const ready = host.states.find(state => state.status === 'ready'), state = host.recap.snapshot();
  assert.equal(state.status, 'capacity');
  assert.deepEqual([state.overview, state.updatedAt, state.chapters, state.overviewSourceIds], [ready.overview, ready.updatedAt, ready.chapters, ['a']]);
  assert.deepEqual(state.chapters[0].sources, [{ id: 'a', startMs: 0, endMs: 8000, available: true }]);
  assert.deepEqual(state.sourcePassages.map(passage => [passage.id, passage.startMs, passage.text]), host.passages.map(passage => [passage.id, passage.startMs, passage.observation.summary]));
  assert.deepEqual([state.sourceCount, state.pendingCount], [101, 100]);
  assert.ok(state.limits.includes('100 passage(s) récent(s) en attente d’intégration au résumé.'));
  // What the session folder is handed: the state as published, the ceiling said in it.
  const saved = JSON.parse(JSON.stringify(host.states.at(-1)));
  assert.deepEqual([saved.status, saved.error, saved.overview, saved.chapters.length, saved.sourcePassages.length], ['capacity', REFUSED, ready.overview, 1, 101]);
});

test('a failure that is not a refusal for size stays an error, and the same input is attempted again', async () => {
  let failure = new Error('Connexion perdue');
  const host = compose({ answer: input => { if (failure) throw failure; return synthesize(input); } });
  host.recap.observe(snapshot([first])); await host.recap.tick();
  assert.deepEqual([host.recap.snapshot().status, host.recap.snapshot().error, host.attempts], ['error', 'Connexion perdue', 1]);
  await wait(host, 2);
  assert.deepEqual([host.attempts, host.calls, host.recap.snapshot().status], [3, 3, 'error']);
  // The mark is the exact code: neither the words of the refusal nor another code stand for it.
  failure = Object.assign(new Error(REFUSED), { code: 'TVLENS_VISION_TRANSIENT' }); await wait(host, 2);
  assert.deepEqual([host.attempts, host.calls, host.recap.snapshot().status, host.recap.snapshot().error], [5, 5, 'error', REFUSED]);
  failure = null; await wait(host, 1);
  assert.deepEqual([host.attempts, host.recap.snapshot().status, host.recap.snapshot().error, host.recap.snapshot().pendingCount], [6, 'ready', null, 0]);
});

test('each change to what a synthesis is sent allows one attempt, after the usual delay, and no more', async () => {
  const host = await overCapacity();
  // A source added ten seconds after the refusal waits for the delay between two attempts, like any new passage.
  host.passages = [...host.passages, long(100)];
  host.now += 10000; host.recap.observe(snapshot(host.passages)); await host.recap.tick();
  assert.equal(host.attempts, 2, 'not before the delay');
  host.now += 15000; await host.recap.tick();
  assert.deepEqual([host.attempts, host.calls, host.recap.snapshot().status], [3, 1, 'capacity'], 'attempted, and refused again before any provider call');
  await wait(host);
  assert.equal(host.attempts, 3, 'that input is not attempted twice either');
  const once = async (what, passages) => {
    const attempts = host.attempts;
    host.passages = passages; host.recap.observe(snapshot(passages)); await wait(host);
    assert.deepEqual([host.attempts - attempts, host.calls, host.recap.snapshot().status, host.recap.snapshot().error], [1, 1, 'capacity', REFUSED], what);
  };
  await once('a text corrected, as long as before', host.passages.map(passage => passage.id === 'long-0' ? long(0, 'y'.repeat(1200)) : passage));
  await once('the end of a passage corrected', host.passages.map(passage => passage.id === 'long-1' ? { ...passage, endMs: passage.endMs - 1 } : passage));
  await once('the start of a passage corrected', host.passages.map(passage => passage.id === 'long-2' ? { ...passage, startMs: passage.startMs + 1 } : passage));
  // A passage still in analysis is no source, but the limits a synthesis is sent count it.
  const analysing = i => ({ ...long(i), status: 'queued', observation: null });
  await once('a limit', [...host.passages, analysing(101)]);
  await once('that limit reworded, the list as long as before', [...host.passages, analysing(102)]);
  await once('that limit gone', host.passages.slice(0, -2));
  // The passage of the recap itself corrected: it is sent as new again.
  await once('a summarised passage waiting again', host.passages.map(passage => passage.id === 'a' ? source('a', 0, 8000, 'Premier sujer') : passage));
  assert.deepEqual([host.recap.snapshot().pendingCount, host.recap.snapshot().overviewSourceIds], [102, ['a']]);
});

test('the refusal is that of the input that was sent: a correction or a limit arriving while it settles is attempted next', async t => {
  const host = compose();
  host.recap.observe(snapshot([first])); await host.recap.tick();
  host.now = 30000; host.recap.observe(snapshot([first, ...many(100)]));
  const settling = host.recap.tick();
  host.recap.observe(snapshot([first, ...many(100, 'Texte corrigé, plus court.')]));
  await settling;
  assert.deepEqual([host.recap.snapshot().status, host.attempts, host.calls], ['capacity', 2, 1], 'what was sent was too long');
  host.now += WINDOW; await host.recap.tick();
  assert.deepEqual([host.attempts, host.calls, host.recap.snapshot().status, host.recap.snapshot().error, host.recap.snapshot().pendingCount], [3, 2, 'ready', null, 0]);

  // The mark is the port's, whichever it is; here the port answers later and a limit changes meanwhile.
  let now = 0;
  const port = deferred(t, { now: () => now }), recap = port.recap;
  recap.observe(snapshot([first])); const running = recap.tick();
  recap.observe(snapshot([first, source('b', 8000, 16000, '', 'queued')]));
  port.refuse(); await running;
  assert.deepEqual([recap.snapshot().status, recap.snapshot().error, recap.snapshot().overview], ['capacity', 'Trop long pour ce port.', '']);
  now += WINDOW; const next = recap.tick();
  assert.equal(port.attempts, 2, 'the input with its new limit was never refused');
  port.refuse(); await next;
  // Nothing changed while that one settled: it is the input held back. A tick asks its port, or not, at once.
  for (let i = 0; i < 4; i++) { now += WINDOW; recap.tick(); }
  assert.deepEqual([port.attempts, recap.snapshot().status], [2, 'capacity']);
});

test('corrections that bring the session back under the capacity are synthesized at the next attempt, and the recap goes on from there', async () => {
  let failure = null;
  const host = await overCapacity({ answer: input => { if (failure) throw failure; return synthesize(input); } });
  // Two passages shortened: still too long, one local refusal more.
  host.recap.observe(snapshot([first, ...many(100).map((passage, i) => i < 2 ? long(i, 'Texte corrigé, plus court.') : passage)])); await wait(host);
  assert.deepEqual([host.attempts, host.calls, host.recap.snapshot().status], [3, 1, 'capacity']);
  host.passages = [first, ...many(100, 'Texte corrigé, plus court.')];
  host.recap.observe(snapshot(host.passages)); await wait(host);
  const state = host.recap.snapshot();
  assert.deepEqual([host.attempts, host.calls, state.status, state.error, state.pendingCount], [4, 2, 'ready', null, 0]);
  assert.deepEqual([...state.overviewSourceIds].sort(), host.passages.map(passage => passage.id).sort(), 'every passage is cited, once');
  assert.deepEqual([state.chapters.length, state.chapters[0].sourceIds, state.overview], [2, ['a'], 'Vue d’ensemble de 101 passage(s).']);
  // The session goes on as it did before the ceiling: a passing failure is a failure again, attempted again.
  failure = new Error('Connexion perdue');
  host.recap.observe(snapshot([...host.passages, long(100, 'Suite')])); await wait(host, 2);
  assert.deepEqual([host.attempts, host.calls, host.recap.snapshot().status, host.recap.snapshot().error], [6, 4, 'error', 'Connexion perdue']);
  failure = null; await wait(host);
  assert.deepEqual([host.attempts, host.calls, host.recap.snapshot().status, host.recap.snapshot().overviewSourceIds.length], [7, 5, 'ready', 102]);
});

test('a new session or a reopened archive starts unblocked: opening stays silent, and a resume finds the ceiling again by one local refusal', async t => {
  const host = await overCapacity();
  const saved = JSON.parse(JSON.stringify(host.recap.snapshot()));
  const reopened = compose(), published = reopened.states.length, restored = reopened.recap.restore(saved);
  assert.deepEqual([reopened.states.length, reopened.attempts], [published, 0], 'opening an archive publishes nothing and asks for nothing');
  assert.deepEqual([restored.status, restored.error, restored.overview, restored.chapters.length, restored.sourceCount, restored.pendingCount], ['waiting', null, saved.overview, 1, 101, 100]);
  // Explicit resume: the host observes and ticks again.
  reopened.recap.observe(snapshot(host.passages)); await wait(reopened);
  assert.deepEqual([reopened.attempts, reopened.calls, reopened.recap.snapshot().status, reopened.recap.snapshot().overview], [1, 0, 'capacity', saved.overview]);

  // The Mac host keeps one recap for all its sessions: the ceiling of one never follows into another.
  host.recap.reset('next');
  assert.deepEqual([host.recap.snapshot().status, host.recap.snapshot().error], ['idle', null]);
  host.recap.observe(snapshot([source('n', 0, 8000, 'Autre session')], [], 'next')); await host.recap.tick();
  assert.deepEqual([host.attempts, host.calls, host.recap.snapshot().status], [3, 2, 'ready']);
  // Back to the long one, as the host reopens it: one attempt is allowed again, and only one.
  host.recap.reset(); host.recap.restore(saved); host.recap.observe(snapshot(host.passages)); await wait(host);
  assert.deepEqual([host.attempts, host.calls, host.recap.snapshot().status], [4, 2, 'capacity']);
  // Reopened once more while it is held back, with nothing in between: the same.
  host.recap.restore(saved); host.recap.observe(snapshot(host.passages)); await wait(host);
  assert.deepEqual([host.attempts, host.calls, host.recap.snapshot().status], [5, 2, 'capacity']);

  // A refusal that lands after the session has changed marks nothing.
  const port = deferred(t), late = port.recap;
  late.observe(snapshot([first])); const running = late.tick();
  late.reset('next'); port.refuse(); await running;
  assert.deepEqual([late.snapshot().status, late.snapshot().error], ['idle', null]);
  late.observe(snapshot([source('n', 0, 8000)], [], 'next')); const next = late.tick();
  assert.equal(port.attempts, 2);
  port.refuse(); await next;
  assert.equal(late.snapshot().status, 'capacity');
});

// Just enough of a document for the recap view: a node keeps what the view sets on it.
function page() {
  return { createElement: tag => ({ tag, className: '', textContent: '', dataset: {}, attributes: {}, children: [],
    setAttribute(name, value) { this.attributes[name] = value; }, append(...nodes) { this.children.push(...nodes); },
    replaceChildren(...nodes) { this.children = nodes; }, querySelectorAll: () => [] }) };
}
const marked = (node, name) => [...(node.className.split(' ').includes(name) ? [node] : []), ...node.children.flatMap(child => marked(child, name))];
const texts = (node, name) => marked(node, name).map(found => found.textContent);
// What the window keeps of the recap it shows when a new recap state arrives: the rule is a function of the module.
const earlier = { sessionId: 's', status: 'ready', overview: 'Vue d’ensemble', chapters: [{ title: 'Chapitre a', summary: 'Un sujet', sources: [] }] };

test('a recap state of another session is ignored, and one of this session keeps the earlier recap only while it is being updated', async () => {
  const { reduceRecap } = await import('../app/ui/recap-state.mjs');
  // Another session than the current one: the window touches nothing.
  assert.equal(reduceRecap(earlier, { sessionId: 'other', status: 'ready', overview: 'Autre', chapters: [] }, 's'), undefined);
  // An update or a failure of this session that carries no recap goes on showing the earlier one.
  for (const status of ['updating', 'error']) {
    const kept = reduceRecap(earlier, { sessionId: 's', status, overview: '', chapters: [] }, 's');
    assert.deepEqual([kept.status, kept.overview, kept.chapters], [status, earlier.overview, earlier.chapters], status);
  }
  // A recap that carries its own overview and chapters is shown as it is.
  const own = { sessionId: 's', status: 'updating', overview: 'Nouvelle vue', chapters: [{ title: 'Chapitre b', summary: 'Autre', sources: [] }] };
  assert.deepEqual(reduceRecap(earlier, own, 's'), own);
  // A ready recap without chapters has none: nothing is borrowed from the earlier one.
  const none = reduceRecap(earlier, { sessionId: 's', status: 'ready', overview: 'Vue', chapters: [] }, 's');
  assert.deepEqual([none.overview, none.chapters], ['Vue', []]);
  // The earlier recap belongs to another session than the state received: nothing is taken from it.
  const fresh = reduceRecap({ ...earlier, sessionId: 'old' }, { sessionId: 's', status: 'updating' }, 's');
  assert.deepEqual([fresh.overview, fresh.chapters], ['', []]);
  // No state at all: no recap, and that is not an ignored state.
  assert.equal(reduceRecap(earlier, null, 's'), null);
});

// The window's reception of a recap state, over the rule of the module: ignored for another session, else kept.
// A ceiling is not a status that keeps an earlier recap, and the state of the ceiling carries its own.
async function reception(sessionId = 's') {
  const { reduceRecap } = await import('../app/ui/recap-state.mjs');
  let shown = null;
  return { receive(state) { const next = reduceRecap(shown, state, sessionId); if (next !== undefined) shown = next; }, state: () => shown };
}

test('the Mémoire view says a ceiling as a ceiling, with or without an earlier recap, and goes on showing that recap', async t => {
  const { renderRecapView } = await import('../app/ui/recap-view.js');
  globalThis.document = page(); t.after(() => { delete globalThis.document; });
  const render = (state, segments) => {
    const panel = document.createElement('div'), dialog = document.createElement('div');
    renderRecapView({ state, session: { id: 's', history: [], segments }, targets: [[panel, false], [dialog, true]], replay() {}, notice() {} });
    return { panel, dialog };
  };
  const host = await overCapacity(), ready = host.states.find(state => state.status === 'ready');
  const shown = await reception(); shown.receive(ready); shown.receive(host.recap.snapshot());
  for (const target of Object.values(render(shown.state(), host.passages))) {
    assert.deepEqual(texts(target, 'recap-status'), ['Session trop longue pour la synthèse automatique · Le résumé n’est plus mis à jour. 100 passages en attente d’intégration au résumé.']);
    assert.equal(marked(target, 'recap-status')[0].attributes.role, 'status');
    assert.deepEqual([texts(target, 'recap-error'), texts(target, 'recap-overview'), texts(target, 'recap-summary')], [[REFUSED], [ready.overview], ['La session continue.']]);
    assert.deepEqual(texts(target, 'recap-chapter-link'), ['00:00 · Chapitre a ↗'], 'the chapter of the last recap is still there, and still replayable');
  }
  // The first synthesis of a session already too long: no recap, and no promise that one is on its way.
  const never = compose(); never.passages = many(100);
  never.recap.observe(snapshot(never.passages)); await never.recap.tick();
  assert.deepEqual([never.recap.snapshot().status, never.attempts, never.calls], ['capacity', 1, 0]);
  const empty = await reception(); empty.receive(never.recap.snapshot());
  const { panel } = render(empty.state(), never.passages);
  assert.deepEqual(texts(panel, 'recap-status'), ['Session trop longue pour la synthèse automatique · Aucun résumé n’est produit. 100 passages en attente d’intégration au résumé.']);
  assert.deepEqual([texts(panel, 'recap-error'), texts(panel, 'recap-overview'), marked(panel, 'recap-chapter').length], [[REFUSED], [], 0]);
  // A passing failure keeps its own words.
  const failed = { ...host.recap.snapshot(), status: 'error', error: 'Connexion perdue' };
  assert.deepEqual(texts(render(failed, host.passages).panel, 'recap-status'), ['Mise à jour indisponible · Le dernier résumé reste disponible. 100 passages en attente d’intégration au résumé.']);
  assert.deepEqual(texts(render({ ...never.recap.snapshot(), status: 'error', error: 'Connexion perdue' }, never.passages).panel, 'recap-status'), ['Le résumé est momentanément indisponible. 100 passages en attente d’intégration au résumé.']);
});
