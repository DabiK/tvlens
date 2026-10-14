// The shape of a JavaScript text: what a formatter leaves alone. It is a comparison of forms, not a parser:
// no dependency, no syntax tree. Two layouts of the same code give the same shape; a changed word, operator,
// literal or order gives another one.
//
// What it forgets: spaces and line breaks (a single space is kept between two words, and between two signs
// that would otherwise fuse: `a + +b`), the kind of quote of a literal and the escape of a quote, a comma
// right before `)`, `]` or `}`, semicolons (they separate, like a line break), and the parentheses around
// the single plain parameter of an arrow function.
// What it keeps: the inside of literals, templates, regular expressions and comments, apart from the
// expressions of a template, which are code.
// The end of `return`, `break`, `continue` and `throw` is kept (`return;` is not `return x`), whether it is
// written by a semicolon, a line break or a closing brace: a formatter never puts a line break right after them.
// One limit: a literal that holds both kinds of quote has no way back (`"a 'b'"` and `'a \'b\''` have the
// same shape, but the shape of a shape is not its shape).
const WORD = /[\p{L}\p{N}_$]/u;
const IDENTIFIER = /^[\p{L}_$][\p{L}\p{N}_$]*$/u;
const FUSING = "+-/";
const RESTRICTED = new Set(["return", "break", "continue", "throw"]);
// After one of these a slash starts a regular expression; after anything else it is a division.
const BEFORE_REGEX = new Set(["return", "typeof", "case", "do", "else", "in", "of", "void", "delete", "throw", "new", "instanceof", "yield", "await"]);
const BEFORE_REGEX_SIGNS = "(,=:[!&|?{};+-*%<>~^";

const isWord = character => character !== undefined && WORD.test(character);
const isBlank = character => /\s/.test(character);

// A string literal opened at `start`: its shape (one kind of quote) and where it ends, or null when the line ends first.
function readString(text, start) {
  const quote = text[start];
  let shaped = "'";
  for (let index = start + 1; index < text.length; index++) {
    const character = text[index];
    if (character === "\n") return null;
    if (character === quote) return { shaped: `${shaped}'`, end: index + 1 };
    if (character === "\\") {
      const escaped = text[index + 1];
      if (escaped === "'" || escaped === '"') shaped += "'";
      else shaped += character + (escaped ?? "");
      index++;
    } else shaped += character === '"' ? "'" : character;
  }
  return null;
}

// A regular expression literal opened at `start`, flags included, or null when the line ends first.
function readRegex(text, start) {
  let inClass = false;
  for (let index = start + 1; index < text.length; index++) {
    const character = text[index];
    if (character === "\n") return null;
    if (character === "\\") index++;
    else if (character === "[") inClass = true;
    else if (character === "]") inClass = false;
    else if (character === "/" && !inClass) {
      let end = index + 1;
      while (isWord(text[end])) end++;
      return { shaped: text.slice(start, end), end };
    }
  }
  return null;
}

// A template opened at `start`: its text as it is, its `${…}` expressions shaped like code.
function readTemplate(text, start) {
  let shaped = "`";
  for (let index = start + 1; index < text.length; index++) {
    const character = text[index];
    if (character === "`") return { shaped: `${shaped}\``, end: index + 1 };
    if (character === "\\") {
      shaped += character + (text[index + 1] ?? "");
      index++;
    } else if (character === "$" && text[index + 1] === "{") {
      const inner = tokenize(text, index + 2, true);
      shaped += `\${${compose(inner.tokens)}}`;
      index = inner.end - 1;
    } else shaped += character;
  }
  return { shaped, end: text.length };
}

const lineEnd = (text, from) => {
  const end = text.indexOf("\n", from);
  return end === -1 ? text.length : end;
};

// Each reader returns the token that starts at `index` (with its `end`), or null when none of its kind starts there.
function readBlank(text, index) {
  let end = index;
  while (end < text.length && isBlank(text[end])) end++;
  if (end === index) return null;
  return { type: "space", value: " ", newline: text.slice(index, end).includes("\n"), end };
}

function readLineComment(text, index) {
  if (!text.startsWith("//", index)) return null;
  const end = lineEnd(text, index);
  return { type: "comment", value: text.slice(index, end), end };
}

function readBlockComment(text, index) {
  if (!text.startsWith("/*", index)) return null;
  const close = text.indexOf("*/", index + 2);
  const end = close === -1 ? text.length : close + 2;
  return { type: "comment", value: text.slice(index, end), end };
}

// A literal that cannot be closed on its line is only a sign, read by itself.
function readQuoted(text, index) {
  if (text[index] !== "'" && text[index] !== '"') return null;
  const literal = readString(text, index);
  return literal ? { type: "literal", value: literal.shaped, end: literal.end } : { type: "sign", value: "'", end: index + 1 };
}

function readBackquoted(text, index) {
  if (text[index] !== "`") return null;
  const literal = readTemplate(text, index);
  return { type: "literal", value: literal.shaped, end: literal.end };
}

// A slash is the start of a regular expression after a sign or a word that cannot end an operand, a division otherwise.
function readSlash(text, index, before) {
  if (text[index] !== "/") return null;
  const startsRegex = !before || (before.type === "sign" && BEFORE_REGEX_SIGNS.includes(before.value))
    || (before.type === "word" && BEFORE_REGEX.has(before.value));
  const literal = startsRegex ? readRegex(text, index) : null;
  return literal ? { type: "literal", value: literal.shaped, end: literal.end } : { type: "sign", value: "/", end: index + 1 };
}

function readWord(text, index) {
  if (!isWord(text[index])) return null;
  let end = index + 1;
  while (isWord(text[end])) end++;
  return { type: "word", value: text.slice(index, end), end };
}

const READERS = [readBlank, readLineComment, readBlockComment, readQuoted, readBackquoted, readSlash, readWord];

function readToken(text, index, before) {
  for (const read of READERS) {
    const token = read(text, index, before);
    if (token) return token;
  }
  return { type: "sign", value: text[index], end: index + 1 };
}

// Tokens of the code from `start`; inside a template expression, up to the brace that closes it.
function tokenize(text, start = 0, insideTemplate = false) {
  const tokens = [];
  let before = null, depth = 0, index = start;
  while (index < text.length) {
    const { end, ...token } = readToken(text, index, before);
    const isSignOf = value => token.type === "sign" && token.value === value;
    if (insideTemplate && isSignOf("}") && depth-- === 0) return { tokens, end };
    if (insideTemplate && isSignOf("{")) depth++;
    tokens.push(token);
    if (token.type !== "space" && token.type !== "comment") before = token;
    index = end;
  }
  return { tokens, end: text.length };
}

const skipSpaces = (tokens, from) => {
  while (tokens[from]?.type === "space") from++;
  return from;
};
const isSign = (token, value) => token?.type === "sign" && token.value === value;

// Whether what follows `from` ends the statement: a semicolon, a line break, a closing brace or the end.
function endsStatement(tokens, from) {
  for (let index = from; index < tokens.length; index++) {
    const token = tokens[index];
    if (token.type === "comment") continue;
    if (token.type === "space") {
      if (token.newline) return true;
      continue;
    }
    return isSign(token, ";") || isSign(token, "}");
  }
  return true;
}

// After `return`, `break`, `continue` or `throw`, a line break ends the statement like a semicolon does: that end
// is kept, as `;`, because `return;` and `return x` are not the same statement.
function markEnds(tokens) {
  const result = [];
  let before = null;
  tokens.forEach((token, index) => {
    result.push(token);
    if (token.type === "space" || token.type === "comment") return;
    const property = isSign(before, ".");
    before = token;
    if (token.type !== "word" || !RESTRICTED.has(token.value) || property) return;
    if (endsStatement(tokens, index + 1)) result.push({ type: "end", value: ";" });
  });
  return result;
}

// Semicolons become separators; a comma before a closing sign goes; `(x) =>` becomes ` x =>`.
function simplify(tokens) {
  const result = markEnds(tokens).map(token => (isSign(token, ";") ? { type: "space", value: " " } : token));
  for (let index = 0; index < result.length; index++) {
    if (!isSign(result[index], ",")) continue;
    const next = result[skipSpaces(result, index + 1)];
    if (next?.type === "sign" && ")]}".includes(next.value)) result[index] = { type: "space", value: " " };
  }
  for (let index = 0; index < result.length; index++) {
    if (!isSign(result[index], "(")) continue;
    const name = skipSpaces(result, index + 1);
    if (result[name]?.type !== "word" || !IDENTIFIER.test(result[name].value)) continue;
    const close = skipSpaces(result, name + 1);
    const arrow = skipSpaces(result, close + 1);
    if (isSign(result[close], ")") && isSign(result[arrow], "=") && isSign(result[arrow + 1], ">")) {
      result[index] = { type: "space", value: " " };
      result[close] = { type: "space", value: " " };
    }
  }
  return result;
}

function compose(tokens) {
  let shaped = "", pending = false, previous = null;
  for (const token of simplify(tokens)) {
    if (token.type === "space") {
      pending = true;
      continue;
    }
    if (shaped !== "") {
      const last = shaped[shaped.length - 1], first = token.value[0];
      const glued = (isWord(last) && isWord(first)) || (last === first && FUSING.includes(first));
      if (token.type === "comment" || previous?.type === "comment" || (pending && glued)) shaped += " ";
    }
    shaped += token.value;
    previous = token;
    pending = false;
  }
  return shaped;
}

function shape(text) {
  return compose(tokenize(String(text)).tokens);
}

module.exports = { shape };
