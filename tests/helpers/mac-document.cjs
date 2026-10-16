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
  matches(selector) {
    if (selector === "details[data-key]")
      return this.tagName === "DETAILS" && "key" in this.dataset;
    if (selector === "details[open][data-key]")
      return this.matches("details[data-key]") && Boolean(this.open);
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
function createMacDocument() {
  const nodes = new Map();
  return {
    createElement: (tag) => new Element(tag),
    createTextNode: (text) =>
      Object.assign(new Element("#text"), { textContent: text }),
    getElementById: (id) => {
      if (!nodes.has(id)) nodes.set(id, new Element("div"));
      return nodes.get(id);
    },
  };
}
module.exports = { createMacDocument };
