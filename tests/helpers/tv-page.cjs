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

const COMMENT = /<!--[\s\S]*?-->/g;
const OPEN_TAG = /<([a-zA-Z][a-zA-Z0-9-]*)((?:"[^"]*"|'[^']*'|[^>"'])*)>/g;
const ATTRIBUTE = /([a-zA-Z_:][\w:.-]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;

// Tags and attributes may be spread over several lines: the whole string is scanned, never line by line.
function parseAttributes(source) {
  const attributes = {};
  for (const match of source.matchAll(ATTRIBUTE)) {
    const value = match[2] ?? match[3] ?? match[4];
    attributes[match[1].toLowerCase()] = value === undefined ? '' : value;
  }
  return attributes;
}

function camelCase(name) {
  return name.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
}

class FakeElement {
  constructor(document, tagName, attributes, text) {
    this.document = document;
    this.tagName = tagName.toUpperCase();
    this.id = attributes.id || '';
    this.hidden = 'hidden' in attributes;
    this.disabled = 'disabled' in attributes;
    this.open = 'open' in attributes;
    this.textContent = text;
    this.scrollTop = 0;
    this.clicks = 0;
    this.onclick = null;
    this.children = [];
    this.dataset = {};
    for (const [name, value] of Object.entries(attributes)) {
      if (name.startsWith('data-')) this.dataset[camelCase(name.slice(5))] = value;
    }
    this.listeners = {};
  }

  addEventListener(type, listener) {
    (this.listeners[type] = this.listeners[type] || []).push(listener);
  }

  emit(type) {
    for (const listener of this.listeners[type] || []) listener({ type, target: this });
  }

  // A disabled element still takes the focus here: the guard that keeps the remote off it belongs to the
  // page and must stay observable.
  focus() {
    const previous = this.document.activeElement;
    if (previous === this) return;
    this.document.activeElement = this;
    previous.emit('blur');
    this.emit('focus');
  }

  blur() {
    if (this.document.activeElement !== this) return;
    this.document.activeElement = this.document.body;
    this.emit('blur');
  }

  click() {
    this.clicks += 1;
    if (typeof this.onclick === 'function') this.onclick({ type: 'click', target: this });
  }

  contains(other) {
    return other === this || this.children.includes(other);
  }

  querySelector(selector) {
    if (selector !== '[data-cancel]') throw new Error('Unsupported selector: ' + selector);
    return this.children.find(child => 'cancel' in child.dataset) || null;
  }

  querySelectorAll(selector) {
    if (selector !== 'button') throw new Error('Unsupported selector: ' + selector);
    return this.children.filter(child => child.tagName === 'BUTTON');
  }
}

function parsePage(html) {
  const source = html.replace(COMMENT, '');
  const document = { listeners: {}, byId: new Map(), dialogs: [], scripts: [] };
  document.body = new FakeElement(document, 'body', {}, '');
  document.documentElement = new FakeElement(document, 'html', {}, '');
  document.activeElement = document.body;
  const ranges = [];
  const elements = [];
  for (const match of source.matchAll(OPEN_TAG)) {
    const name = match[1].toLowerCase();
    const attributes = parseAttributes(match[2]);
    if (name === 'script' && attributes.src) document.scripts.push(attributes.src);
    if (!attributes.id) continue;
    const end = match.index + match[0].length;
    const next = source.indexOf('<', end);
    const text = source.slice(end, next < 0 ? source.length : next).replace(/\s+/g, ' ').trim();
    const element = new FakeElement(document, name, attributes, text);
    elements.push({ element, index: match.index });
    document.byId.set(attributes.id, element);
    if (name === 'dialog') {
      document.dialogs.push(element);
      ranges.push({ element, from: match.index, to: source.indexOf('</dialog>', match.index) });
    }
  }
  for (const { element, index } of elements) {
    const owner = ranges.find(range => index > range.from && index < range.to);
    if (owner && element.tagName === 'BUTTON') owner.element.children.push(element);
  }
  return document;
}

function readPage() {
  const html = fs.readFileSync(path.join(APP_DIR, 'index.html'), 'utf8');
  const document = parsePage(html);
  const loaded = document.scripts.filter(name => name !== 'connection.js');
  return { document, loaded };
}

function createEvent(type, target, fields) {
  return Object.assign({
    type,
    target,
    defaultPrevented: false,
    propagationStopped: false,
    preventDefault() { this.defaultPrevented = true; },
    stopPropagation() { this.propagationStopped = true; },
  }, fields);
}

// Timers and network are spies that count: the panel must start none while it is not paired.
function loadTvPage() {
  const { document, loaded } = readPage();
  const calls = { timers: 0, requests: 0, close: 0 };
  const count = key => () => { calls[key] += 1; };
  const context = vm.createContext({});
  const global = vm.runInContext('globalThis', context);
  const pageDocument = {
    body: document.body,
    documentElement: document.documentElement,
    getElementById: id => document.byId.get(id) || null,
    addEventListener: (type, listener) => {
      (document.listeners[type] = document.listeners[type] || []).push(listener);
    },
    querySelector(selector) {
      if (selector !== 'dialog[open]') throw new Error('Unsupported selector: ' + selector);
      return document.dialogs.find(dialog => dialog.open) || null;
    },
  };
  Object.defineProperty(pageDocument, 'activeElement', {
    get: () => document.activeElement,
  });
  Object.assign(global, {
    window: global,
    document: pageDocument,
    performance: { now: () => 0 },
    setTimeout: count('timers'),
    setInterval: count('timers'),
    clearTimeout() {},
    clearInterval() {},
    fetch: () => { calls.requests += 1; return new Promise(() => {}); },
    XMLHttpRequest: function XMLHttpRequest() { calls.requests += 1; },
    close: count('close'),
  });
  for (const name of loaded) {
    const file = path.join(APP_DIR, name);
    vm.runInContext(fs.readFileSync(file, 'utf8'), context, { filename: file });
  }

  function dispatch(type, target, fields) {
    const event = createEvent(type, target, fields);
    for (const listener of document.listeners[type] || []) listener(event);
    return event;
  }
  const el = id => {
    const element = document.byId.get(id);
    if (!element) throw new Error('No element with id ' + id);
    return element;
  };
  return {
    window: global,
    scripts: loaded,
    calls,
    el,
    activeId: () => document.activeElement.id,
    // A key goes to the document, as it does on the TV; the event comes back with its recorded effects.
    press: key => dispatch('keydown', document.activeElement, { keyCode: key.keyCode, key: key.key }),
    keyboard: visible => dispatch('keyboardStateChange', document, { detail: { visibility: visible } }),
    mousedown: target => dispatch('mousedown', target, {}),
    body: document.body,
    documentElement: document.documentElement,
    // Opens like showModal: the first enabled button takes the focus.
    openDialog: id => {
      const dialog = el(id);
      dialog.open = true;
      const first = dialog.children.find(button => !button.disabled);
      if (first) first.focus();
      return dialog;
    },
  };
}

module.exports = { loadTvPage, KEYS };
