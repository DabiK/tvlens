// Surface DOM des cartes Mac : les sélecteurs inconnus échouent au lieu de masquer un dessin manquant.
class Element {
  constructor(tag) {
    this.tagName = tag.toUpperCase();
    this.children = [];
    this.dataset = {};
    this.className = "";
    this.text = "";
    this.scrollTop = 0;
    this.scrollHeight = 200;
    this.clientHeight = 200;
    this.listeners = new Map();
    this.classList = {
      contains: (name) => this.className.split(" ").includes(name),
      add: (name) => {
        if (!this.classList.contains(name)) this.className += ` ${name}`;
      },
      remove: (name) => {
        this.className = this.className
          .split(" ")
          .filter((part) => part !== name)
          .join(" ");
      },
      toggle: (name, active) => {
        if (active) this.classList.add(name);
        else this.classList.remove(name);
      },
    };
  }
  set textContent(value) {
    this.text = String(value);
    this.children = [];
  }
  get textContent() {
    return this.text + this.children.map((child) => child.textContent).join("");
  }
  get firstChild() {
    return this.children[0];
  }
  get lastChild() {
    return this.children.at(-1);
  }
  append(...nodes) {
    for (const node of nodes) this.insertBefore(node, null);
  }
  insertBefore(node, before) {
    if (node.parent) node.parent.removeChild(node);
    const index =
      before === null ? this.children.length : this.children.indexOf(before);
    if (index < 0) throw new Error("missing sibling");
    this.children.splice(index, 0, node);
    node.parent = this;
  }
  replaceChild(node, old) {
    const index = this.children.indexOf(old);
    if (index < 0) throw new Error("missing child");
    this.children[index] = node;
    node.parent = this;
    old.parent = null;
  }
  removeChild(node) {
    const index = this.children.indexOf(node);
    if (index < 0) throw new Error("missing child");
    this.children.splice(index, 1);
    node.parent = null;
  }
  setAttribute(name, value) {
    this[name] = String(value);
  }
  replaceChildren(...nodes) {
    for (const child of [...this.children]) this.removeChild(child);
    this.text = "";
    this.append(...nodes);
  }
  showModal() {
    this.open = true;
  }
  close() {
    this.open = false;
  }
  focus() {
    this.ownerDocument.activeElement = this;
  }
  play() {
    this.plays = (this.plays || 0) + 1;
    return Promise.resolve();
  }
  addEventListener(name, callback) {
    if (!this.listeners.has(name)) this.listeners.set(name, new Set());
    this.listeners.get(name).add(callback);
  }
  removeEventListener(name, callback) {
    this.listeners.get(name)?.delete(callback);
  }
  dispatchEvent(event) {
    event.target ||= this;
    this[`on${event.type}`]?.(event);
    for (const callback of this.listeners.get(event.type) || [])
      callback(event);
    if (event.bubbles)
      (this.parent || this.ownerDocument)?.dispatchEvent(event);
    return true;
  }
  closest(selector) {
    return this.matches(selector)
      ? this
      : this.parent?.closest(selector) || null;
  }
  matches(selector) {
    if (selector === "details[data-key]")
      return this.tagName === "DETAILS" && "key" in this.dataset;
    if (selector === "details[open][data-key]")
      return this.matches("details[data-key]") && Boolean(this.open);
    if (selector === "[data-action]") return "action" in this.dataset;
    if (selector === ".recap-extra-sources[open]")
      return (
        this.classList.contains("recap-extra-sources") && Boolean(this.open)
      );
    if (/^\.[\w-]+$/.test(selector))
      return this.className.split(" ").includes(selector.slice(1));
    throw new Error(`unsupported selector: ${selector}`);
  }
  querySelectorAll(selector) {
    return this.children.flatMap((child) => [
      ...(child.matches(selector) ? [child] : []),
      ...child.querySelectorAll(selector),
    ]);
  }
}
function createMacDocument({ ids } = {}) {
  const nodes = new Map();
  const document = new Element("#document");
  Object.assign(document, {
    visibilityState: "visible",
    body: new Element("body"),
    createElement: (tag) =>
      Object.assign(new Element(tag), { ownerDocument: document }),
    createTextNode: (text) =>
      Object.assign(new Element("#text"), { textContent: text }),
    getElementById: (id) => {
      if (ids && !ids.includes(id))
        throw new Error(`missing Mac element: ${id}`);
      if (!nodes.has(id)) nodes.set(id, document.createElement("div"));
      return nodes.get(id);
    },
  });
  return document;
}
module.exports = { createMacDocument };
