/**
 * Plain text out of a fetched web page. Its main content comes from Mozilla Readability over a LinkeDOM document built by
 * parsing only: LinkeDOM runs no script, loads no resource and adds no global. Only the text of the article is kept,
 * never its markup, with a space at every block boundary.
 *
 * When the parse or Readability throws, finds no article, keeps too short a text or meets too many elements, the original
 * string is read again by the patterns below: enough to quote a page, not an HTML parser. Every pattern is lazy and ends at
 * its delimiter or at the end of the page, so a large or malformed page costs linear time.
 *
 * Both paths are synchronous: no deadline interrupts them once started; the page byte cap of the caller bounds their work.
 */
const { DOMParser } = require('linkedom');
const { Readability } = require('@mozilla/readability');
const { WEB_PAGE_READ_MAX_CHARS, clipText } = require('../../core/web-retrieval.cjs');

// Under this length an extracted page is a fragment (a notice, a cookie banner), not a source.
const MIN_PAGE_TEXT_CHARS = 200;
const TITLE_MAX_CHARS = 300;
// Bounds the work of Readability, not the parse itself. Readability's own check counts getElementsByTagName('*'), which
// LinkeDOM answers with no element, so the count is made here before Readability starts.
const READABLE_ELEMENT_LIMIT = 20_000;
const ELEMENT_NODE = 1;
const TEXT_NODE = 3;
// These elements carry words inside a line; any other element (paragraph, heading, list item, cell, line break) ends a block.
const INLINE_ELEMENTS = new Set(['a', 'abbr', 'b', 'bdi', 'bdo', 'cite', 'code', 'data', 'del', 'dfn', 'em', 'font', 'i',
  'ins', 'kbd', 'mark', 'q', 's', 'samp', 'small', 'span', 'strike', 'strong', 'sub', 'sup', 'time', 'tt', 'u', 'var', 'wbr']);
const MAX_CODE_POINT = 0x10ffff;
const REPLACEMENT_CHARACTER = '�';
// head goes too: once the title is taken, it only holds metadata, styles and scripts. The title itself goes as well,
// since head is optional in HTML and a title written without it would otherwise open the text. The title goes before
// head: an unclosed title holds the rest of the page, which head, ending where the content starts, would leave behind.
const DROPPED_ELEMENTS = ['script', 'style', 'noscript', 'svg', 'template', 'title', 'head'];
// The first container that holds text wins: an article is the page's own content, main and body bring navigation too.
const CONTENT_CONTAINERS = ['article', 'main', 'body'];
const NAMED_ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: '\'', nbsp: ' ', laquo: '«', raquo: '»', hellip: '…',
  ndash: '–', mdash: '—', lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', bull: '•', middot: '·', deg: '°',
  euro: '€', copy: '©', reg: '®', trade: '™', times: '×', eacute: 'é', egrave: 'è', ecirc: 'ê', euml: 'ë',
  agrave: 'à', acirc: 'â', ccedil: 'ç', icirc: 'î', iuml: 'ï', ocirc: 'ô', ugrave: 'ù', ucirc: 'û', uuml: 'ü',
  oelig: 'œ', aelig: 'æ', Eacute: 'É', Egrave: 'È', Ecirc: 'Ê', Agrave: 'À', Ccedil: 'Ç', OElig: 'Œ',
};
const ENTITY = /&(?:#(\d{1,8})|#[xX]([0-9a-fA-F]{1,7})|([A-Za-z][A-Za-z0-9]{1,31}));/g;
const COMMENT = /<!--[\s\S]*?(?:-->|$)/g;
// [^<>] stops a stray "<" at the next tag instead of scanning to the end of the page.
const TAG = /<[^<>]*>/g;
// An unclosed title runs to the end of the page, as a browser reads it; without that end, every later opening would rescan the page.
const TITLE = /<title\b[^<>]*>([\s\S]*?)(?:<\/title\s*>|$)/i;
// An unclosed element runs to the end of the page, except head: its closing tag is optional and a browser ends it where the
// content starts.
const IMPLICIT_ENDS = { head: `|(?=<(?:${CONTENT_CONTAINERS.join('|')})\\b)` };
const DROPPED = DROPPED_ELEMENTS.map(name => new RegExp(
  `<${name}\\b[^<>]*>[\\s\\S]*?(?:</${name}\\s*>${IMPLICIT_ENDS[name] ?? ''}|$)`, 'gi'));
const OPENERS = Object.fromEntries(CONTENT_CONTAINERS.map(name => [name, new RegExp(`<${name}\\b[^<>]*>`, 'i')]));

// Out of range and surrogate code points are not characters: they read as the replacement character, as in a browser.
function character(code) {
  if (!Number.isInteger(code) || code <= 0 || code > MAX_CODE_POINT || (code >= 0xd800 && code <= 0xdfff)) return REPLACEMENT_CHARACTER;
  return String.fromCodePoint(code);
}

function decodeEntities(text) {
  return text.replace(ENTITY, (whole, decimal, hexadecimal, name) => {
    if (decimal) return character(Number.parseInt(decimal, 10));
    if (hexadecimal) return character(Number.parseInt(hexadecimal, 16));
    return Object.hasOwn(NAMED_ENTITIES, name) ? NAMED_ENTITIES[name] : whole;
  });
}

const collapse = text => text.replace(/\s+/g, ' ').trim();
const textOf = markup => collapse(decodeEntities(markup.replace(TAG, ' ')));
const titleText = value => clipText(collapse(String(value ?? '')), TITLE_MAX_CHARS).trim();

// The content runs to the first matching closing tag, or to the end when the page never closes it.
function containerContent(html, lowered, name) {
  const opener = OPENERS[name].exec(html);
  if (!opener) return null;
  const start = opener.index + opener[0].length;
  const end = lowered.indexOf(`</${name}`, start);
  return html.slice(start, end === -1 ? html.length : end);
}

function bodyText(html) {
  const lowered = html.toLowerCase();
  for (const name of CONTENT_CONTAINERS) {
    const content = containerContent(html, lowered, name);
    const text = content === null ? '' : textOf(content);
    if (text) return text;
  }
  return textOf(html);
}

// The text of the article node with a space at each block boundary: minified paragraphs keep their words apart. The walk
// keeps its own stack, so a deeply nested page cannot overflow the call stack.
function blockText(root) {
  const parts = [];
  const pending = [root];
  while (pending.length) {
    const node = pending.pop();
    if (typeof node === 'string') parts.push(node);
    else if (node.nodeType === TEXT_NODE) parts.push(node.data);
    else if (node.nodeType === ELEMENT_NODE) {
      const boundary = INLINE_ELEMENTS.has(node.localName.toLowerCase()) ? '' : ' ';
      pending.push(boundary);
      for (let child = node.lastChild; child; child = child.previousSibling) pending.push(child);
      pending.push(boundary);
    }
  }
  return parts.join('');
}

// Readability's article as text, or null when it finds none. Too many elements throws, as Readability's own check does.
function readableText(html) {
  const document = new DOMParser().parseFromString(html, 'text/html');
  const elements = document.querySelectorAll('*').length;
  if (elements > READABLE_ELEMENT_LIMIT) throw new RangeError(`${elements} elements`);
  const article = new Readability(document, { maxElemsToParse: READABLE_ELEMENT_LIMIT, serializer: node => node }).parse();
  return article && blockText(article.content);
}

function articleText(html, extract) {
  let text;
  try { text = collapse(extract(html) ?? ''); } catch {
    // A failed parse or Readability, too many elements included, only costs this path: the patterns read the page again.
    return null;
  }
  return text.length >= MIN_PAGE_TEXT_CHARS ? text : null;
}

function patternText(html) {
  const kept = DROPPED.reduce((markup, pattern) => markup.replace(pattern, ' '), html.replace(COMMENT, ' '));
  return bodyText(kept);
}

// extract stands for Readability over LinkeDOM; it is replaced only to reach outcomes a real page hardly gives. The title
// comes from the original string in both paths, and the patterns read that string too, never the document Readability changed.
function htmlPage(html, { extract = readableText } = {}) {
  const title = titleText(textOf(TITLE.exec(html)?.[1] ?? ''));
  const text = articleText(html, extract) ?? patternText(html);
  return { title, text: clipText(text, WEB_PAGE_READ_MAX_CHARS).trim() };
}

const plainText = text => clipText(collapse(text), WEB_PAGE_READ_MAX_CHARS).trim();

module.exports = { MIN_PAGE_TEXT_CHARS, READABLE_ELEMENT_LIMIT, htmlPage, plainText, titleText };
