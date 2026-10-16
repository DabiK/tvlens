// Construction du DOM sans innerHTML : tout texte, qu'il vienne d'un modèle, d'un ticket ou de la boucle, entre comme texte.

function append(node, children) {
  for (const child of children.flat(Infinity)) {
    if (child == null || child === false) continue;
    node.append(child instanceof Node ? child : String(child));
  }
}

/** Un élément : `props` porte les attributs, `class`, `dataset` et les écouteurs `on<événement>`. */
export function h(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value == null || value === false) continue;
    if (key === "class") node.className = value;
    else if (key === "dataset") Object.assign(node.dataset, value);
    else if (key.startsWith("on")) node.addEventListener(key.slice(2), value);
    else node.setAttribute(key, value === true ? "" : String(value));
  }
  append(node, children);
  return node;
}

/** Remplace tout le contenu d'un élément. */
export function fill(node, ...children) {
  node.replaceChildren();
  append(node, children);
  return node;
}

const INLINE = /(`[^`]+`|\*\*[^*]+\*\*)/;

function inline(text) {
  return text.split(INLINE).filter(Boolean).map((part) => {
    if (part.startsWith("`") && part.endsWith("`") && part.length > 1) return h("code", {}, part.slice(1, -1));
    if (part.startsWith("**") && part.endsWith("**") && part.length > 3) return h("strong", {}, part.slice(2, -2));
    return part;
  });
}

/** Le Markdown d'un ticket ou d'un rapport : titres, paragraphes, listes, code. Rien d'autre n'est interprété. */
export function markdown(text) {
  const out = document.createDocumentFragment();
  let paragraph = [];
  let list = null;
  let code = null;
  const flushParagraph = () => {
    if (paragraph.length) out.append(h("p", {}, inline(paragraph.join(" "))));
    paragraph = [];
  };
  const flush = () => {
    flushParagraph();
    if (list) out.append(h(list.tag, {}, list.items.map((item) => h("li", {}, inline(item)))));
    list = null;
  };
  for (const line of String(text).split("\n")) {
    if (code) {
      if (/^```/.test(line)) {
        out.append(h("pre", {}, h("code", {}, code.join("\n"))));
        code = null;
      } else code.push(line);
      continue;
    }
    if (/^```/.test(line)) {
      flush();
      code = [];
      continue;
    }
    const heading = /^#{1,4}\s+(.*)/.exec(line);
    const item = /^\s*(?:[-*]|(\d+)\.)\s+(.*)/.exec(line);
    if (heading) {
      flush();
      out.append(h("h3", {}, heading[1].toUpperCase()));
    } else if (item) {
      flushParagraph();
      const tag = item[1] ? "ol" : "ul";
      if (list?.tag !== tag) flush();
      list ??= { tag, items: [] };
      list.items.push(item[2]);
    } else if (!line.trim()) flush();
    else if (list && /^\s{2,}/.test(line)) list.items[list.items.length - 1] += ` ${line.trim()}`;
    else paragraph.push(line.trim());
  }
  if (code) out.append(h("pre", {}, h("code", {}, code.join("\n"))));
  flush();
  return out;
}
