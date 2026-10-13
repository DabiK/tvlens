const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { harnessRepo } = require("./helpers/harness-repo.cjs");

const load = (rel) => import(pathToFileURL(path.join(__dirname, "..", rel)).href);
const LONG = "const value = '" + "x".repeat(170) + "';\n";

test("measures count long lines, empty catches, env reads, innerHTML, ticket-named tests and test cases", async (t) => {
  const { measure } = await load("scripts/quality/metrics.mjs");
  const repo = harnessRepo({
    "core/a.cjs": "const x = 1;\n" + LONG + "try { x(); } catch {}\n",
    "adapters/b.cjs": "const home = process.env.HOME;\n",
    "adapters/config.cjs": "module.exports = process.env;\n",
    "app/view.js": "node.innerHTML = '';\n",
    "tests/session.test.cjs": "test('a', () => {});\ntest('b', () => {});\n",
    "tests/architecture-f04.test.cjs": "test('c', () => {});\n",
  });
  t.after(repo.cleanup);
  assert.deepEqual(measure(repo.root), {
    lignes_longues_prod: 1,
    lignes_longues_tests: 0,
    catch_vides_prod: 1,
    tests_nommes_par_chantier: 1,
    process_env_hors_config: 1,
    inner_html: 1,
    cas_de_test: 4,
  });
});

test("a measure that gets worse is a regression whichever way it is meant to move", async () => {
  const { compare } = await load("scripts/quality/ratchet.mjs");
  const worse = compare({ catch_vides_prod: 2, cas_de_test: 10 }, { catch_vides_prod: 3, cas_de_test: 9 });
  assert.deepEqual(worse.regressions.map((r) => r.key), ["catch_vides_prod", "cas_de_test"]);
  const better = compare({ catch_vides_prod: 2, cas_de_test: 10 }, { catch_vides_prod: 1, cas_de_test: 12 });
  assert.equal(better.regressions.length, 0);
  assert.deepEqual(better.improvements.map((r) => r.key), ["catch_vides_prod", "cas_de_test"]);
});

test("the baseline only ever tightens, never loosens", async () => {
  const { tighten } = await load("scripts/quality/ratchet.mjs");
  const next = tighten({ catch_vides_prod: 5, cas_de_test: 10 }, { catch_vides_prod: 7, cas_de_test: 8 });
  assert.deepEqual(next, { catch_vides_prod: 5, cas_de_test: 10 });
  const improved = tighten({ catch_vides_prod: 5, cas_de_test: 10 }, { catch_vides_prod: 3, cas_de_test: 14 });
  assert.deepEqual(improved, { catch_vides_prod: 3, cas_de_test: 14 });
});

test("the check tolerates long lines already committed and refuses a new one", (t) => {
  const repo = harnessRepo({ "core/legacy.cjs": LONG });
  t.after(repo.cleanup);
  repo.write("core/legacy.cjs", LONG + "const added = 1;\n");
  assert.equal(repo.node("scripts/check.mjs", ["--file", "core/legacy.cjs"]).code, 0);
  repo.write("core/legacy.cjs", LONG + LONG);
  const refused = repo.node("scripts/check.mjs", ["--file", "core/legacy.cjs"]);
  assert.equal(refused.code, 1);
  assert.match(refused.out, /1 ligne\(s\) de plus de 160 caractères/);
});

test("the check refuses an empty catch added to production code", (t) => {
  const repo = harnessRepo({ "core/a.cjs": "const a = 1;\n" });
  t.after(repo.cleanup);
  repo.write("core/a.cjs", "const a = 1;\ntry {\n  a();\n} catch {}\n");
  const refused = repo.node("scripts/check.mjs", ["--file", "core/a.cjs"]);
  assert.equal(refused.code, 1);
  assert.match(refused.out, /catch vide ajouté/);
});

test("the check refuses a new test file named after a ticket", (t) => {
  const repo = harnessRepo();
  t.after(repo.cleanup);
  repo.write("tests/architecture-f11.test.cjs", "const { test } = require('node:test');\ntest('x', () => {});\n");
  const refused = repo.node("scripts/check.mjs", ["--changed", "--no-tests"]);
  assert.equal(refused.code, 1);
  assert.match(refused.out, /porte le nom du comportement testé/);
});

test("the full check fails when a measure regresses against the baseline and reports skipped tools as not run", (t) => {
  const repo = harnessRepo({ "core/a.cjs": "const a = 1;\n" });
  t.after(repo.cleanup);
  assert.equal(repo.node("scripts/quality/ratchet.mjs", ["--init"]).code, 0);
  const green = repo.node("scripts/check.mjs");
  assert.equal(green.code, 0, green.out);
  assert.match(green.out, /format : non lancé/);
  assert.match(green.out, /tests JS \(1 fichier\(s\)\)/);
  repo.write("app/view.js", "document.body.innerHTML = '';\n");
  const red = repo.node("scripts/check.mjs", ["--no-tests"]);
  assert.equal(red.code, 1);
  assert.match(red.out, /inner_html : 0 → 1/);
});

test("the baseline cannot be re-initialised once it exists", (t) => {
  const repo = harnessRepo();
  t.after(repo.cleanup);
  assert.equal(repo.node("scripts/quality/ratchet.mjs", ["--init"]).code, 0);
  assert.equal(repo.node("scripts/quality/ratchet.mjs", ["--init"]).code, 1);
});
