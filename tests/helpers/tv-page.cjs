'use strict';
// Loads the scripts of the TV panel (tv/app/index.html) in one vm context, over a hand-written document that
// offers only what the loaded code reads. The page is built from index.html alone: no assertion should ever
// look at the text of a script.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const APP_DIR = path.join(__dirname, '..', '..', 'tv', 'app');
const KEYS = {
  left: { keyCode: 37, key: 'ArrowLeft' },
  up: { keyCode: 38, key: 'ArrowUp' },
  right: { keyCode: 39, key: 'ArrowRight' },
  down: { keyCode: 40, key: 'ArrowDown' },
  ok: { keyCode: 13, key: 'Enter' },
  back: { keyCode: 461, key: '' },
  escape: { keyCode: 27, key: 'Escape' },
};

const { readPage, createEvent } = require('./tv-document.cjs');

// Every scheduled callback belongs to this page, including callbacks queued by a late network answer.
function pageTimers(calls, injected = {}) {
  const pending = new Map();
  let disposed = false;
  let nextId = 0;
  function clear(id) {
    const timer = pending.get(id);
    if (!timer) return;
    pending.delete(id);
    const cancel = timer.repeat ? injected.clearInterval : injected.clearTimeout;
    if (cancel) cancel(timer.handle);
  }
  function schedule(callback, delay, repeat, args) {
    if (disposed) return undefined;
    calls.timers += 1;
    const id = ++nextId;
    const timer = { delay, repeat, callback: null, handle: undefined };
    timer.callback = () => {
      if (disposed || !pending.has(id)) return;
      if (!repeat) pending.delete(id);
      return callback(...args);
    };
    pending.set(id, timer);
    const register = repeat ? injected.setInterval : injected.setTimeout;
    if (register) timer.handle = register(timer.callback, delay);
    return id;
  }
  return {
    pending,
    setTimeout: (callback, delay, ...args) => schedule(callback, delay, false, args),
    setInterval: (callback, delay, ...args) => schedule(callback, delay, true, args),
    clearTimeout: clear,
    clearInterval: clear,
    run(id) {
      const timer = pending.get(id);
      if (!timer) throw new Error('No pending timer ' + id);
      // Explicit driving replaces the scheduler's delivery of a one-shot callback.
      if (!timer.repeat && injected.clearTimeout) injected.clearTimeout(timer.handle);
      return timer.callback();
    },
    cleanup() {
      disposed = true;
      for (const id of pending.keys()) clear(id);
    },
  };
}

// Copy seed values into an independent store, never reuse a previous page's storage object.
function pageStorage(seed = {}) {
  const values = new Map(Object.entries(seed).map(([key, value]) => [key, String(value)]));
  return {
    get length() { return values.size; },
    key: index => [...values.keys()][index] ?? null,
    getItem: key => values.get(String(key)) ?? null,
    setItem: (key, value) => { values.set(String(key), String(value)); },
    removeItem: key => { values.delete(String(key)); },
    clear: () => values.clear(),
  };
}

// Defaults never use process timers or network. Pairing is injected before the classic scripts load.
// options: { config, fetch, storage (seed entries), now, dateNow, timers (setTimeout/setInterval/clearTimeout/clearInterval) }.
// The timer registry also permits explicit run(id); numeric element dimensions remain test-controlled.
function loadTvPage(options = {}) {
  const { document, loaded } = readPage(APP_DIR);
  const calls = { timers: 0, requests: 0, close: 0 };
  const timers = pageTimers(calls, options.timers);
  const localStorage = pageStorage(options.storage);
  const wallNow = options.dateNow || (() => 0);
  class PageDate extends Date {
    constructor(...args) { super(...(args.length ? args : [wallNow()])); }
    static now() { return wallNow(); }
  }
  const context = vm.createContext({});
  const global = vm.runInContext('globalThis', context);
  Object.assign(global, {
    window: global, document, localStorage,
    TVLENS_REMOTE: options.config ? structuredClone(options.config) : undefined,
    URL, AbortController, structuredClone,
    Date: PageDate,
    performance: { now: options.now || (() => 0) },
    setTimeout: timers.setTimeout,
    setInterval: timers.setInterval,
    clearTimeout: timers.clearTimeout,
    clearInterval: timers.clearInterval,
    fetch: (...args) => {
      calls.requests += 1;
      return options.fetch ? options.fetch(...args) : new Promise(() => {});
    },
    XMLHttpRequest: function XMLHttpRequest() { calls.requests += 1; },
    close: () => { calls.close += 1; },
  });
  try {
    for (const name of loaded) {
      const file = path.join(APP_DIR, name);
      vm.runInContext(fs.readFileSync(file, 'utf8'), context, { filename: file });
    }
  } catch (error) {
    timers.cleanup();
    throw error;
  }

  function dispatch(type, target, fields) {
    const event = createEvent(type, target, fields);
    for (const listener of document.listeners[type] || []) listener(event);
    return event;
  }
  const el = id => {
    const element = document.getElementById(id);
    if (!element) throw new Error('No element with id ' + id);
    return element;
  };
  return {
    window: global, document, scripts: loaded, calls, el, timers, localStorage,
    cleanup: timers.cleanup,
    activeId: () => document.activeElement.id,
    // A key goes to the document, as it does on the TV; the event comes back with its recorded effects.
    press: key => dispatch('keydown', document.activeElement, { keyCode: key.keyCode, key: key.key }),
    keyboard: visible => dispatch('keyboardStateChange', document, { detail: { visibility: visible } }),
    mousedown: target => dispatch('mousedown', target, {}),
    input: (id, value) => {
      const node = el(id);
      node.value = value;
      return node.emit('input');
    },
    submit: (id = 'ask') => {
      const form = el(id);
      const event = createEvent('submit', form);
      return { event, done: form.onsubmit(event) };
    },
    body: document.body,
    documentElement: document.documentElement,
    openDialog: id => {
      const dialog = el(id);
      dialog.showModal();
      return dialog;
    },
  };
}

module.exports = { loadTvPage, KEYS };
