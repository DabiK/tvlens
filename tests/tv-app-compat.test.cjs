const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// The TV loads tv/app from file:// as classic scripts, on an engine whose version is written nowhere in the
// repository. The floor proven by use is around Chrome 103 (AbortSignal.timeout in remote-client.js).
// This is a static heuristic: it catches a module or a recent API slipping in, it proves nothing about the TV.
const app = path.resolve(__dirname, '../tv/app');
// connection.js is the local pairing secret (untracked, never packaged): it is not read here.
const files = extension => fs.readdirSync(app).filter(name => name.endsWith(extension) && name !== 'connection.js').sort();
const read = name => fs.readFileSync(path.join(app, name), 'utf8');

const RECENT_JS = [
  [/\bimport\s*\(/, 'import() dynamique'], [/\bimport\.meta\b/, 'import.meta'],
  [/\.toSorted\s*\(/, 'toSorted (Chrome 110)'], [/\.toReversed\s*\(/, 'toReversed (110)'], [/\.toSpliced\s*\(/, 'toSpliced (110)'],
  [/\b(?:Object|Map)\.groupBy\b/, 'groupBy (117)'], [/\bPromise\.withResolvers\b/, 'Promise.withResolvers (119)'], [/\bPromise\.try\b/, 'Promise.try (128)'],
  [/\bArray\.fromAsync\b/, 'Array.fromAsync (121)'], [/\bAbortSignal\.any\b/, 'AbortSignal.any (116)'], [/\bURL\.(?:canParse|parse)\b/, 'URL.canParse / URL.parse (120+)'],
  [/\bRegExp\.escape\b/, 'RegExp.escape (136)'], [/\.(?:isSubsetOf|isSupersetOf|isDisjointFrom|symmetricDifference)\s*\(/, 'méthodes d’ensemble (122)'],
  [/\.(?:showPopover|hidePopover|togglePopover)\s*\(/, 'popover (114)'], [/\bstartViewTransition\b/, 'View Transitions (111)'],
];
const RECENT_CSS = [
  [/:has\(/, ':has() (105)'], [/color-mix\(/, 'color-mix() (111)'], [/light-dark\(/, 'light-dark() (123)'], [/@container\b/, '@container (105)'],
  [/@scope\b/, '@scope (118)'], [/@starting-style\b/, '@starting-style (117)'], [/text-wrap\s*:/, 'text-wrap (114)'], [/anchor-name\s*:|position-anchor\s*:/, 'ancrage CSS (125)'],
];
const RECENT_HTML = [[/<script[^>]*type\s*=\s*["']?module/i, 'script module'], [/\spopover(?:[\s=>])/i, 'attribut popover (114)'], [/\spopovertarget\b/i, 'popovertarget (114)'], [/<search[\s>]/i, '<search> (118)']];
const offences = (text, rules) => rules.filter(([pattern]) => pattern.test(text)).map(([, label]) => label);

// A style rule opened inside another style rule is CSS nesting (Chrome 112 and later).
function nested(css) {
  const stack = [];
  let prelude = '';
  for (const char of css.replace(/\/\*[\s\S]*?\*\//g, '').replace(/"[^"]*"|'[^']*'/g, '""')) {
    if (char === '{') {
      const rule = prelude.trim().startsWith('@') ? 'at' : 'style';
      if (stack.at(-1) === 'style') return prelude.trim() || '{';
      stack.push(rule);
      prelude = '';
    } else if (char === '}') { stack.pop(); prelude = ''; } else if (char === ';') prelude = ''; else prelude += char;
  }
  return null;
}

test('every tv/app script compiles as a classic script and stays under the proven engine floor', () => {
  const scripts = files('.js');
  for (const expected of ['companion.js', 'remote-client.js', 'surveillance-overlay.js', 'timeline-view.js']) assert.ok(scripts.includes(expected), `${expected} is checked`);
  for (const name of scripts) {
    // vm.Script parses with the Script goal: a static import or export is a syntax error here, as on the TV.
    assert.doesNotThrow(() => new vm.Script(read(name), { filename: name }), `${name} must load as a classic script`);
    assert.deepEqual(offences(read(name), RECENT_JS), [], `${name} uses an API newer than the proven floor`);
  }
});

test('the guard itself refuses a module, a recent API and nested CSS', () => {
  assert.throws(() => new vm.Script('import x from "./x.js";'), SyntaxError);
  assert.throws(() => new vm.Script('export const x = 1;'), SyntaxError);
  assert.deepEqual(offences('var a = list.toSorted(); Object.groupBy(a, f); await import("./x.js");', RECENT_JS), ['import() dynamique', 'toSorted (Chrome 110)', 'groupBy (117)']);
  assert.deepEqual(offences('.a:has(.b) { color: color-mix(in srgb, red, blue); }', RECENT_CSS), [':has() (105)', 'color-mix() (111)']);
  assert.deepEqual(offences('<div popover id="x"></div><script type="module" src="a.js"></script>', RECENT_HTML), ['script module', 'attribut popover (114)']);
  assert.equal(nested('.a { color: red; .b { color: blue; } }'), '.b');
  assert.equal(nested('.a { color: red; &:hover { color: blue; } }'), '&:hover');
  assert.equal(nested('@media (max-height: 800px) { .a { color: red; } } @keyframes k { from { opacity: 0; } to { opacity: 1; } } .b::before { content: "{"; }'), null);
});

test('stylesheets and pages of tv/app avoid recent CSS and HTML', () => {
  for (const name of files('.css')) {
    assert.deepEqual(offences(read(name), RECENT_CSS), [], `${name} uses CSS newer than the proven floor`);
    assert.equal(nested(read(name)), null, `${name} nests a rule`);
  }
  for (const name of files('.html')) assert.deepEqual(offences(read(name), RECENT_HTML), [], name);
});
