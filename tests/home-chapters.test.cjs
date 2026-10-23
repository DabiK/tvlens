const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createMacDocument } = require('./helpers/mac-document.cjs');

function pageFor(t) {
  const document = createMacDocument();
  const previous = global.document;
  global.document = document;
  t.after(() => {
    if (previous === undefined) delete global.document;
    else global.document = previous;
  });
  return document;
}

async function recapFor(t) {
  const document = pageFor(t);
  const { renderRecapView } = await import('../app/ui/recap-view.js');
  const target = document.createElement('div');
  const sources = Array.from({ length: 5 }, (_, index) => ({
    id: `passage-${index}`, startMs: index * 1000, endMs: (index + 1) * 1000, available: true,
  }));
  const chapters = sources.map((source, index) => ({
    id: `chapter-${index}`, title: `Chapitre ${index}`, summary: `Résumé ${index}`, ...source, sources: [source],
  }));
  const session = { id: 'archive', readOnly: true, history: [], segments: sources };
  const state = { sessionId: session.id, status: 'ready', overview: 'Résumé réel', chapters };
  const calls = [];
  const render = (options = {}) => renderRecapView({
    state, session, targets: [[target, false]], replay: (...args) => calls.push(args), notice: () => {},
    preview: id => `tvlens-media://archive/thumb/${id}`, askChapter: chapter => calls.push(chapter), ...options,
  });
  return { document, render, target, state, session, calls };
}

test('home renders every archived chapter with its real preview and replay offset', async t => {
  const f = await recapFor(t);
  f.render();
  assert.equal(f.target.querySelectorAll('.home-chapter').length, 5);
  assert.equal(f.target.querySelectorAll('.chapter-image')[0].src, 'tvlens-media://archive/thumb/passage-0');
  f.target.querySelectorAll('.recap-source')[0].onclick();
  assert.deepEqual(f.calls, [['passage-0', 0]]);
  f.target.querySelectorAll('.chapter-ask')[1].onclick();
  assert.equal(f.calls[1], f.state.chapters[1]);
  const details = f.target.querySelectorAll('.chapter-details')[0];
  details.open = true;
  f.render();
  assert.equal(f.target.querySelectorAll('.chapter-details')[0].open, true);
  const overview = f.target.querySelectorAll('.home-overview')[0];
  overview.open = true;
  f.render();
  assert.equal(f.target.querySelectorAll('.home-overview')[0].open, true);
  assert.match(f.target.querySelectorAll('.home-overview')[0].textContent, /Résumé réel/);
  assert.match(f.target.querySelectorAll('.chapter-details')[0].textContent, /Résumé 0/);
});

test('missing archived media keeps chapter text but has no preview or enabled replay', async t => {
  const f = await recapFor(t);
  f.session.segments = f.session.segments.map(source => ({ ...source, available: false, mediaReason: 'expired' }));
  f.render();
  assert.equal(f.target.querySelectorAll('.chapter-image').length, 0);
  assert.equal(f.target.querySelectorAll('.recap-source').every(button => button.disabled), true);
  assert.match(f.target.textContent, /Résumé 0/);
  f.render({ session: { id: 'other', history: [], segments: [] } });
  assert.equal(f.target.querySelectorAll('.chapter-image').length, 0);
});

test('empty home explains the first observation and image failures reveal the fallback', async t => {
  const f = await recapFor(t);
  f.render({ state: null, session: null });
  assert.match(f.target.textContent, /Lance une vidéo/);
  assert.equal(f.target.querySelectorAll('.home-chapter').length, 0);
  f.render();
  const image = f.target.querySelectorAll('.chapter-image')[0];
  image.onerror();
  assert.equal(image.hidden, true);
  assert.equal(f.target.querySelectorAll('.chapter-cover-empty')[0].hidden, false);
});

test('home tabs preserve the conversation, draft and selection across navigation and observation updates', async t => {
  const document = pageFor(t);
  const get = id => document.getElementById(id);
  const create = document.createElement;
  document.createElement = tag => {
    const element = create(tag);
    element.removeAttribute = key => { delete element[key]; };
    return element;
  };
  document.createElementNS = (_namespace, tag) => document.createElement(tag);
  const actions = document.createElement('div');
  document.querySelector = () => actions;
  const conversation = get('float-conversation');
  conversation.append(get('messages'), get('ask-form'));
  const { ViewingShell } = await import('../app/ui/shell.js');
  const shell = new ViewingShell(document);
  const draft = get('question');
  draft.value = 'Ma question en cours';
  draft.focus();
  get('messages').textContent = 'Conversation précédente';
  assert.equal(get('home-chapters').hidden, true);
  assert.equal(get('home-live').hidden, false);
  get('home-chapters-tab').onclick();
  shell.observation({ id: 'session', segments: [], history: [] }, false);
  shell.show('memory');
  shell.show('direct');
  assert.equal(get('home-chapters').hidden, false);
  assert.equal(draft.value, 'Ma question en cours');
  assert.equal(document.activeElement, draft);
  assert.equal(get('messages').textContent, 'Conversation précédente');
  assert.equal(conversation.children.includes(get('messages')), true);
  get('home-live-tab').onkeydown({ key: 'End', preventDefault() {} });
  assert.equal(get('home-chapters').hidden, false);
  assert.equal(get('home-chapters-tab')['aria-selected'], 'true');
  assert.equal(document.activeElement, get('home-chapters-tab'));
});

test('chapter carousel reaches every card and disables its arrows at the scroll boundaries', async t => {
  const f = await recapFor(t);
  f.render();
  const rail = f.target.querySelectorAll('.recap-chapters')[0];
  rail.clientWidth = 450;
  rail.scrollWidth = 1900;
  [...rail.children].forEach((card, index) => { card.offsetLeft = 20 + index * 385; });
  rail.onscroll();
  const previous = f.target.querySelectorAll('.chapter-previous')[0];
  const next = f.target.querySelectorAll('.chapter-next')[0];
  assert.equal(previous.disabled, true);
  assert.equal(next.disabled, false);
  next.onclick();
  assert.equal(rail.scrollLeft, 385);
  assert.equal(previous.disabled, false);
  next.onclick();
  next.onclick();
  next.onclick();
  assert.equal(rail.scrollLeft, 1450);
  assert.equal(next.disabled, true);
  previous.onclick();
  assert.equal(rail.scrollLeft, 1155);
  rail.onkeydown({ target: rail, key: 'Home', preventDefault() {} });
  assert.equal(rail.scrollLeft, 0);
  assert.equal(previous.disabled, true);
  rail.clientWidth = 2000;
  rail.onscroll();
  assert.equal(next.disabled, true);
});

test('chapter carousel preserves its position on updates and releases its resize observer', async t => {
  const f = await recapFor(t);
  const previousObserver = global.ResizeObserver;
  const observers = [];
  global.ResizeObserver = class {
    constructor(callback) { this.callback = callback; observers.push(this); }
    observe(rail) { this.rail = rail; }
    disconnect() { this.disconnected = true; }
  };
  t.after(() => {
    if (previousObserver === undefined) delete global.ResizeObserver;
    else global.ResizeObserver = previousObserver;
  });
  f.render();
  observers[0].rail.clientWidth = 450;
  observers[0].callback();
  observers[0].rail.scrollLeft = 385;
  f.render();
  assert.equal(observers[0].disconnected, true);
  observers[1].rail.clientWidth = 450;
  observers[1].callback();
  assert.equal(observers[1].rail.scrollLeft, 385);
  f.render({ state: { ...f.state, sessionId: 'other' } });
  assert.equal(observers[1].disconnected, true);
  observers[2].rail.clientWidth = 450;
  observers[2].callback();
  assert.equal(observers[2].rail.scrollLeft, 0);
  f.render({ state: null, session: null });
  assert.equal(observers[2].disconnected, true);
  assert.equal(f.target.querySelectorAll('.chapter-next').length, 0);
});


test('chapter carousel keeps deferred scroll position through two hidden redraws', async t => {
  const f = await recapFor(t);
  const previousObserver = global.ResizeObserver;
  const observers = [];
  global.ResizeObserver = class {
    constructor(callback) { this.callback = callback; observers.push(this); }
    observe(rail) { this.rail = rail; }
    disconnect() { this.disconnected = true; }
  };
  t.after(() => {
    if (previousObserver === undefined) delete global.ResizeObserver;
    else global.ResizeObserver = previousObserver;
  });
  f.render();
  observers[0].rail.clientWidth = 450;
  observers[0].callback();
  observers[0].rail.scrollLeft = 385;
  observers[0].rail.onscroll();
  observers[0].rail.clientWidth = 0;
  const createElement = f.document.createElement;
  f.document.createElement = tag => {
    const element = createElement(tag);
    element.clientWidth = 0;
    element.scrollLeft = 0;
    return element;
  };
  f.render();
  f.render();
  assert.equal(observers[0].disconnected, true);
  assert.equal(observers[1].disconnected, true);
  assert.equal(observers[2].rail.scrollLeft, 0);
  observers[2].rail.clientWidth = 450;
  observers[2].rail.scrollWidth = 1900;
  observers[2].callback();
  assert.equal(observers[2].rail.scrollLeft, 385);
});
