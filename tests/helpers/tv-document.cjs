'use strict';
// Small structural DOM shared by both page modes. Geometry is supplied by the test, never computed as CSS.
const fs = require('node:fs');
const path = require('node:path');
const VOID_TAGS = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'wbr']);
const ATTRIBUTE = /([a-zA-Z_:][\w:.-]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>/]+)))?/g;
const dataName = name => 'data-' + name.replace(/[A-Z]/g, letter => '-' + letter.toLowerCase());
function decode(text) {
  const entities = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: '\u00a0' };
  return text.replace(/&(#\d+|#x[\da-f]+|amp|lt|gt|quot|apos|nbsp);/gi, (_, code) => {
    if (code.startsWith('#x')) return String.fromCodePoint(parseInt(code.slice(2), 16));
    return code[0] === '#' ? String.fromCodePoint(Number(code.slice(1))) : entities[code];
  });
}
function createEvent(type, target, fields) {
  return Object.assign({
    type, target, defaultPrevented: false, propagationStopped: false,
    preventDefault() { this.defaultPrevented = true; },
    stopPropagation() { this.propagationStopped = true; },
  }, fields);
}
class FakeNode {
  constructor(document) {
    this.ownerDocument = document;
    this.parentNode = null;
    this.childNodes = [];
  }
  get children() { return this.childNodes.filter(node => node.tagName); }
  get firstChild() { return this.childNodes[0] || null; }
  get lastChild() { return this.childNodes.at(-1) || null; }
  get isConnected() { return this === this.ownerDocument.documentElement || !!this.parentNode?.isConnected; }
  get textContent() { return this.childNodes.map(node => node.textContent).join(''); }
  set textContent(value) {
    this.replaceChildren();
    if (String(value)) this.appendChild(new FakeText(this.ownerDocument, String(value)));
  }
  appendChild(node) {
    node.remove();
    node.parentNode = this;
    this.childNodes.push(node);
    return node;
  }
  removeChild(node) {
    const index = this.childNodes.indexOf(node);
    if (index < 0) throw new Error('Node is not a child');
    this.childNodes.splice(index, 1);
    node.parentNode = null;
    return node;
  }
  replaceChild(next, previous) {
    if (next === previous) return previous;
    next.remove();
    const index = this.childNodes.indexOf(previous);
    if (index < 0) throw new Error('Node is not a child');
    this.childNodes[index] = next;
    previous.parentNode = null;
    next.parentNode = this;
    return previous;
  }
  replaceChildren(...nodes) {
    for (const node of [...this.childNodes]) this.removeChild(node);
    for (const node of nodes) this.appendChild(node);
  }
  remove() { this.parentNode?.removeChild(this); }
  contains(other) { return this === other || this.childNodes.some(node => node.contains(other)); }
}
class FakeText extends FakeNode {
  constructor(document, value) {
    super(document);
    this.value = value;
  }
  get textContent() { return this.value; }
  set textContent(value) { this.value = String(value); }
}
// Only simple selectors used by the real views are supported; unsupported syntax fails visibly.
function matches(node, selector) {
  const match = /^([\w-]+)?(?:#([\w-]+))?(?:\.([\w-]+))?(?:\[([\w-]+)(?:="([^"]*)")?\])?$/.exec(selector);
  if (!match) throw new Error('Unsupported selector: ' + selector);
  const [, tag, id, className, attribute, value] = match;
  return (!tag || node.tagName === tag.toUpperCase()) && (!id || node.id === id) &&
    (!className || node.classList.contains(className)) &&
    (!attribute || (node.hasAttribute(attribute) && (value === undefined || node.getAttribute(attribute) === value)));
}
class FakeElement extends FakeNode {
  constructor(document, tagName) {
    super(document);
    this.tagName = tagName.toUpperCase();
    this.attributes = {};
    this.value = '';
    this.scrollTop = 0;
    this.scrollHeight = 0;
    this.clientHeight = 0;
    this.clicks = 0;
    this.listeners = {};
    this.style = {};
    this.dataset = new Proxy({}, {
      get: (_, key) => this.getAttribute(dataName(key)) ?? undefined,
      set: (_, key, value) => { this.setAttribute(dataName(key), value); return true; },
      deleteProperty: (_, key) => { this.removeAttribute(dataName(key)); return true; },
      has: (_, key) => this.hasAttribute(dataName(key)),
    });
    this.classList = {
      contains: name => this.className.split(/\s+/).includes(name),
      add: name => { this.className = [...new Set([...this.className.split(/\s+/).filter(Boolean), name])].join(' '); },
      remove: name => { this.className = this.className.split(/\s+/).filter(value => value !== name).join(' '); },
    };
  }
  get id() { return this.getAttribute('id') || ''; }
  set id(value) { this.setAttribute('id', value); }
  get className() { return this.getAttribute('class') || ''; }
  set className(value) { this.setAttribute('class', value); }
  get offsetParent() {
    if (!this.isConnected || this.hidden) return null;
    for (let node = this.parentNode; node; node = node.parentNode) {
      if (node.hidden) return null;
    }
    return this.parentNode;
  }
  set innerHTML(html) {
    this.replaceChildren();
    parseFragment(this.ownerDocument, html, this);
  }
  getAttribute(name) { return this.attributes[name] ?? null; }
  hasAttribute(name) { return name in this.attributes; }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  removeAttribute(name) { delete this.attributes[name]; }
  addEventListener(type, listener) { (this.listeners[type] ||= []).push(listener); }
  emit(type, fields) {
    const event = createEvent(type, this, fields);
    for (const listener of this.listeners[type] || []) listener.call(this, event);
    if (typeof this['on' + type] === 'function') this['on' + type](event);
    return event;
  }
  // Disabled focus remains observable: the page itself must guard remote navigation.
  focus() {
    const previous = this.ownerDocument.activeElement;
    if (previous === this) return;
    this.ownerDocument.activeElement = this;
    previous?.emit('blur');
    this.emit('focus');
  }
  blur() {
    if (this.ownerDocument.activeElement !== this) return;
    this.ownerDocument.activeElement = this.ownerDocument.body;
    this.emit('blur');
  }
  click() {
    this.clicks += 1;
    return this.emit('click');
  }
  showModal() {
    this.open = true;
    this.querySelectorAll('button').find(button => !button.disabled)?.focus();
  }
  close() { this.open = false; }
  scrollIntoView(options) { this.lastScroll = options; }
  querySelectorAll(selector) {
    const found = [];
    for (const child of this.children) {
      if (matches(child, selector)) found.push(child);
      found.push(...child.querySelectorAll(selector));
    }
    return found;
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
}
for (const name of ['hidden', 'disabled', 'open']) {
  Object.defineProperty(FakeElement.prototype, name, {
    get() { return this.hasAttribute(name); },
    set(value) {
      if (value) this.setAttribute(name, '');
      else this.removeAttribute(name);
    },
  });
}
function parseFragment(document, html, root) {
  const stack = [root];
  const tokens = html.replace(/<!--[\s\S]*?-->/g, '').matchAll(/<\/?[a-zA-Z][^>]*>|[^<]+/g);
  for (const [token] of tokens) {
    const parent = stack.at(-1);
    if (token.startsWith('</')) {
      const name = /^<\/([\w-]+)/.exec(token)[1].toUpperCase();
      const index = stack.findLastIndex(node => node.tagName === name);
      if (index > 0) stack.length = index;
    } else if (token.startsWith('<')) {
      const [, tag, source] = /^<([\w-]+)([\s\S]*?)\/?\s*>$/.exec(token);
      const node = document.createElement(tag);
      for (const match of source.matchAll(ATTRIBUTE)) node.setAttribute(match[1], decode(match[2] ?? match[3] ?? match[4] ?? ''));
      parent.appendChild(node);
      if (!VOID_TAGS.has(tag.toLowerCase())) stack.push(node);
    } else if (token.trim()) {
      parent.appendChild(new FakeText(document, decode(token.replace(/\s+/g, ' ').trim())));
    }
  }
}
function readPage(appDir) {
  const document = {
    listeners: {},
    createElement: tag => new FakeElement(document, tag),
    addEventListener(type, listener) { (this.listeners[type] ||= []).push(listener); },
    querySelectorAll(selector) {
      const root = this.documentElement;
      return [...(matches(root, selector) ? [root] : []), ...root.querySelectorAll(selector)];
    },
    querySelector(selector) { return this.querySelectorAll(selector)[0] || null; },
    getElementById(id) { return this.querySelector('#' + id); },
  };
  const fragment = document.createElement('fragment');
  const html = fs.readFileSync(path.join(appDir, 'index.html'), 'utf8').replace(/<!doctype[^>]*>/i, '');
  parseFragment(document, html, fragment);
  document.documentElement = fragment.querySelector('html');
  document.documentElement.remove();
  document.body = document.querySelector('body');
  document.activeElement = document.body;
  const loaded = document.querySelectorAll('script').map(node => node.getAttribute('src')).filter(name => name && name !== 'connection.js');
  return { document, loaded };
}
module.exports = { readPage, createEvent };
