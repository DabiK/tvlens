const { test } = require("node:test");
const assert = require("node:assert/strict");
const { shape } = require("./helpers/source-shape.cjs");

// The form of a piece of code is what a formatter leaves alone: the same words, in the same order, whatever
// the quotes, the line breaks, the trailing commas, the semicolons and the parentheses around one parameter.
const same = (current, formatted, message) => {
  assert.notEqual(shape(current), "", "a shape of nothing proves nothing");
  assert.equal(shape(formatted), shape(current), message);
};
const differ = (current, changed, message) => assert.notEqual(shape(changed), shape(current), message);

const CLEAR_SEARCH = "function clearSearch() { searchRevision++; $('search-results').replaceChildren(); $('search-status').textContent = searchIntro; }";
const CLEAR_SEARCH_FORMATTED = [
  "function clearSearch() {",
  "  searchRevision++;",
  '  $("search-results").replaceChildren();',
  '  $("search-status").textContent = searchIntro;',
  "}",
].join("\n");

// The search form handler of the window, written on one line as it is on disk.
const SEARCH_HANDLER = [
  "$('moment-search-form').onsubmit=async e=>{e.preventDefault();const revision=++searchRevision;",
  "$('search-status').textContent='Recherche dans la session…';try{const found=await bridge.searchMoments($('moment-query').value);",
  "if(revision!==searchRevision)return;const cards=searchCards(found,currentState);if(!cards)return clearSearch();",
  "$('search-results').replaceChildren(...cards.map(m=>momentCard(m)));",
  "$('search-status').textContent=`${plural(found.moments.length,'passage')} · ${found.mode}. ${agreeText(found.warnings.join(' '))}`;}",
  "catch(e){if(revision===searchRevision)$('search-status').textContent=reason(e);}};",
].join("");
const SEARCH_HANDLER_FORMATTED = [
  '$("moment-search-form").onsubmit = async (e) => {',
  "  e.preventDefault();",
  "  const revision = ++searchRevision;",
  '  $("search-status").textContent = "Recherche dans la session…";',
  "  try {",
  '    const found = await bridge.searchMoments($("moment-query").value);',
  "    if (revision !== searchRevision) return;",
  "    const cards = searchCards(found, currentState);",
  "    if (!cards) return clearSearch();",
  '    $("search-results").replaceChildren(...cards.map((m) => momentCard(m)));',
  '    $("search-status").textContent = `${plural(found.moments.length, "passage")} · ${found.mode}. ${agreeText(found.warnings.join(" "))}`;',
  "  } catch (e) {",
  '    if (revision === searchRevision) $("search-status").textContent = reason(e);',
  "  }",
  "};",
].join("\n");

test("a formatter's layout of the same code has the same shape", () => {
  same(CLEAR_SEARCH, CLEAR_SEARCH_FORMATTED, "clearSearch");
  same(SEARCH_HANDLER, SEARCH_HANDLER_FORMATTED, "the whole search form handler, template literal included");
  same(
    [
      "if (seenFor !== state.sessionId) { const restoring = isRestoring(state);",
      " seen = sequences(restoring ? null : state); if (!restoring) seenFor = state.sessionId; }",
    ].join(""),
    [
      "if (seenFor !== state.sessionId) {",
      "  const restoring = isRestoring(state);",
      "  seen = sequences(restoring ? null : state);",
      "  if (!restoring) seenFor = state.sessionId;",
      "}",
    ].join("\n"),
    "the line of receiveSurveillance that takes the reading reference",
  );
  same(
    [
      "const handle = (channel, fn) => ipcMain.handle(channel, (event, ...args) => {",
      "    if (!trusted(event)) throw new Error('Unauthorized');",
      "    return fn(...args);",
      "  });",
    ].join("\n"),
    [
      "const handle = (channel, fn) =>",
      "  ipcMain.handle(channel, (event, ...args) => {",
      '    if (!trusted(event)) throw new Error("Unauthorized");',
      "    return fn(...args);",
      "  });",
    ].join("\n"),
    "the handle helper of the host",
  );
  same("handle('surveillance:stop', () => surveillance.stop('Stopped.'));", 'handle("surveillance:stop", () => surveillance.stop("Stopped."));');
  same("handle('surveillance:retry', id => surveillance.retry(id));", 'handle("surveillance:retry", (id) => surveillance.retry(id));');
  same("handle('verify:open-source', async input => {\n});", 'handle("verify:open-source", async (input) => {});');
});

test("a changed identifier, two statements swapped or a call that disappears give another shape", () => {
  differ(CLEAR_SEARCH_FORMATTED, CLEAR_SEARCH_FORMATTED.replace("searchIntro", "searchIntroduction"), "an identifier");
  differ(CLEAR_SEARCH_FORMATTED, CLEAR_SEARCH_FORMATTED.replace("searchRevision++", "searchRevision--"), "an operator");
  const swapped = [
    "function clearSearch() {",
    '  $("search-results").replaceChildren();',
    "  searchRevision++;",
    '  $("search-status").textContent = searchIntro;',
    "}",
  ];
  differ(CLEAR_SEARCH_FORMATTED, swapped.join("\n"), "two statements inverted");
  const withoutCall = CLEAR_SEARCH_FORMATTED.replace('  $("search-results").replaceChildren();\n', "");
  differ(CLEAR_SEARCH_FORMATTED, withoutCall, "a call that disappeared");
  const withoutGuard = SEARCH_HANDLER.replace("if(!cards)return clearSearch();", "");
  differ(SEARCH_HANDLER, withoutGuard, "a guard of the handler that disappeared");
  const turnedOver = SEARCH_HANDLER.replace("revision!==searchRevision", "revision===searchRevision");
  differ(SEARCH_HANDLER, turnedOver, "a comparison turned over");
});

test("two words separated by a line break stay two words, and a number is not another one", () => {
  assert.equal(shape("return bridge.stop();"), "return bridge.stop()");
  assert.match(shape("const value =\n  await\n    bridge.state();"), /\bvalue=await bridge\.state\(\)/);
  assert.ok(/\breturn\b/.test(shape("return\nbridge")) && /\bbridge\b/.test(shape("return\nbridge")));
  differ("return bridge.stop();", "returnbridge.stop();", "two words that are one");
  differ("retentionMs: 300000", "retentionMs: 1300000", "a number with a digit more");
  assert.ok(!shape("retentionMs: 1300000").includes(shape("retentionMs: 300000")));
  assert.ok(shape("retentionMs:\n  300000,").includes(shape("retentionMs: 300000")), "a property cut on two lines is the same property");
  differ("x = 1; 300000;", "x = 1300000;", "numbers on two statements");
  assert.equal(shape("foo;handle('x');"), "foo handle('x')");
  assert.equal(shape("foo();handle('x');"), "foo()handle('x')");
});

test("a restricted production keeps its end, whatever line break or semicolon writes it", () => {
  assert.notEqual(shape("return;x"), shape("return x"), "a bare return and a return of a value");
  assert.equal(shape("return\nx"), shape("return;x"), "a line break after return ends it, like a semicolon");
  assert.equal(shape("if (!ok) return;\nrun();"), shape("if(!ok)return;run();"));
  differ("if(revision!==searchRevision)return;", "if(revision!==searchRevision)return clearSearch();", "a return that gained a value");
  differ("while (a) { break; }", "while (a) { break out; }", "a break that gained a label");
  differ("for (;;) { continue; }", "for (;;) { continue next; }", "a continue that gained a label");
  assert.equal(shape("{ return }"), shape("{ return; }"), "a closing brace ends it as well");
  assert.equal(shape("return // done\nx"), shape("return; // done\nx"), "a comment does not hide the line break");
  assert.equal(shape("a.return\nb"), shape("a.return b"), "a property called return is not a statement");
  assert.equal(shape("throw new Error('x');"), shape('throw new Error("x")'), "a throw with its value is formatted like any statement");
});

test("what is written inside a literal is kept, and a quote of either kind is one sign", () => {
  assert.equal(shape("list.join(' ')"), shape('list.join(" ")'));
  differ("list.join(' ')", "list.join('')", "a space inside a literal");
  differ("note('a  b')", "note('a b')", "two spaces inside a literal");
  same("say('it\\'s here')", 'say("it\'s here")', "an escaped quote and a quote of the other kind");
  assert.ok(shape("log('a ; b, c )')").includes("a ; b, c )"), "no punctuation rule runs inside a literal");
  assert.ok(shape("open('tvlens-media://session-a/moment-1');").includes("tvlens-media://session-a/moment-1"), "a URL is not a comment");
});

test("a comment is kept as it is and does not turn the quotes after it into a literal", () => {
  const formatted = shape("// the viewer's choice\nconst page = 'index';\n/* it's a block */ run('x');");
  assert.ok(formatted.includes("// the viewer's choice"));
  assert.ok(formatted.includes("const page='index'"));
  assert.ok(formatted.includes("run('x')"));
  same("a(); // don't wait\nb('x');", 'a(); // don\'t wait\nb("x");', "a comment with an apostrophe, then a literal of the other quote");
});

test("trailing commas, semicolons and spacing around punctuation are not part of the shape", () => {
  same("call(a, b);", "call(\n  a,\n  b,\n);");
  same("const list = [1, 2];", "const list = [\n  1,\n  2,\n];");
  same("const object = { a: 1, b: 2 };", "const object = {\n  a: 1,\n  b: 2,\n};");
  same("a=1;b=2", "a = 1;\nb = 2;");
  same("a=1\nb=2", "a = 1;\nb = 2;", "a semicolon added where the line break stood");
  same("if(!ok)return;", "if (!ok) return;");
  differ("call(a, b)", "call(ab)", "a comma between two arguments");
  differ("call(a, b)", "call(b, a)", "arguments in another order");
  differ("a + +b", "a++b", "two plus signs that are not an increment");
  differ("a - -b", "a--b", "two minus signs that are not a decrement");
});

test("only the parentheses of a single plain parameter are optional", () => {
  same("items.map(item => item.id)", "items.map((item) => item.id)");
  same("const run = async input => input;", "const run = async (input) => input;");
  for (const parameters of ["()", "(a, b)", "({ a })", "([a])", "(a = 1)", "(...a)"]) {
    const withParentheses = `run(${parameters} => 1)`;
    assert.ok(shape(withParentheses).includes(`${parameters.replace(/ /g, "")}=>`), `${parameters} keeps its parentheses`);
  }
  differ("items.map((a) => a)", "items.map((a, b) => a)", "a second parameter");
  assert.equal(shape("run(a)(b)"), "run(a)(b)", "a call is not a parameter list");
});

test("a template literal keeps its text, its expressions are shaped like code", () => {
  assert.ok(shape("`a  b ${ x }`").includes("`a  b ${x}`"));
  same("show(`${plural(n, 'passage')}`)", 'show(`${plural(n, "passage")}`)');
  differ("show(`a b`)", "show(`a  b`)", "a space inside a template");
  assert.ok(shape("const url = `tvlens-media://${ state.id }/thumb/${ id }`;").includes("`tvlens-media://${state.id}/thumb/${id}`"));
});

test("a regular expression literal is kept as written", () => {
  assert.ok(shape("const quote = /[\"']\\s+;/g;").includes("/[\"']\\s+;/g"));
  assert.ok(shape("const half = total / 2; const quarter = half / 2;").includes("half/2"));
  assert.ok(shape("if (/^a b$/.test(text)) go();").includes("/^a b$/.test(text)"));
});
