const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { pathToFileURL } = require('node:url');

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
// Reports the offending excerpt only: a whole source file in a failure message hides the cause.
const absent = (text, pattern, message) => assert.equal((pattern.exec(text) || [null])[0], null, message);

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
  for (const expected of ['ambient.js', 'companion.js', 'remote-client.js', 'surveillance-overlay.js', 'timeline-view.js']) assert.ok(scripts.includes(expected), `${expected} is checked`);
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

test('the ambient page has no secret, no remote client, no focusable element and no media', () => {
  const html = read('ambient.html'), script = read('ambient.js'), css = read('ambient.css');
  assert.deepEqual([...html.matchAll(/<script[^>]*src="([^"]+)"/g)].map(m => m[1]), ['surveillance-overlay.js', 'ambient.js']);
  absent(html, /<script(?![^>]*\ssrc=)/, 'no inline script');
  absent(html, /<(?:button|a|input|select|textarea|dialog|details|summary|iframe|audio|video|embed|object|area)[\s>]|tabindex|contenteditable|autofocus|href=(?!"ambient\.css")/i, 'no focusable element');
  assert.match(css, /html, body \{[^}]*pointer-events: none/);
  assert.match(css, /#ambient \{[^}]*position: fixed[^}]*overflow: hidden/);
  absent(css, /backdrop-filter|url\(|@import/, 'no costly filter, no external resource');
  for (const [name, text] of [['ambient.html', html], ['ambient.js', script], ['ambient.css', css], ['surveillance-overlay.js', read('surveillance-overlay.js')]]) {
    absent(text, /connection\.js|remote-client|TVLENS_REMOTE|Authorization|Bearer|localStorage|sessionStorage|indexedDB|document\.cookie/, `${name} holds no pairing and no storage`);
    absent(text, /https?:\/\/(?!127\.0\.0\.1)/, `${name} names no remote host`);
    absent(text, /\bAudioContext\b|new Audio\b|<audio|<video|\.play\s*\(/, `${name} never touches the sound`);
    absent(text, /\b(?:debug|marker|freeze|probe|handshake|closeOnKey)\b/i, `${name} has no debugging path`);
  }
  // Three requests only, all to the controller named by the validated parameters, none with a header or a body.
  assert.deepEqual([...script.matchAll(/route\("([a-z]+)"\)/g)].map(m => m[1]).sort(), ['ack', 'key', 'wait']);
  assert.equal([...script.matchAll(/\.fetch\(/g)].length, 3);
  absent(script, /headers|body:|XMLHttpRequest|WebSocket|EventSource|sendBeacon/, 'simple requests only');
  const manifest = JSON.parse(read('appinfo.ambient.json')), panel = JSON.parse(read('appinfo.json'));
  assert.equal(manifest.id, 'org.tvlens.ambient');
  assert.notEqual(manifest.id, panel.id);
  assert.deepEqual([manifest.main, manifest.defaultWindowType, manifest.transparent, manifest.visible], ['ambient.html', 'overlay', true, false]);
  assert.equal(panel.main, 'index.html', 'the panel application is not redirected to the ambient page');
});

test('the probe page generated by the packager obeys the same engine floor and stays out of tv/app', async () => {
  const { PROBE_JS, PROBE_HTML } = await import(pathToFileURL(path.resolve(__dirname, '../scripts/package-tv-ambient.mjs')).href);
  assert.doesNotThrow(() => new vm.Script(PROBE_JS, { filename: 'ambient-probe.js' }));
  assert.deepEqual(offences(PROBE_JS, RECENT_JS), []);
  assert.deepEqual(offences(PROBE_HTML, RECENT_HTML.concat(RECENT_CSS)), []);
  absent(PROBE_JS + PROBE_HTML, /connection\.js|remote-client|TVLENS_REMOTE|Authorization|Bearer/, 'the probe holds no pairing either');
  assert.deepEqual(fs.readdirSync(app).filter(name => /probe/i.test(name)), [], 'no probe file sits in tv/app, where the main packager would pick it up');
  for (const name of files('.html')) absent(read(name), /ambient-probe|probe\//, `${name} does not reference the probe page`);
});
