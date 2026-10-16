const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");
const { pathToFileURL } = require("node:url");
const { harnessRepo } = require("./helpers/harness-repo.cjs");

const load = (rel) => import(pathToFileURL(path.join(__dirname, "..", rel)).href);
const LONG = "const value = '" + "x".repeat(170) + "';\n";
const testSource = (count) => "const { test } = require('node:test');\n" +
  Array.from({ length: count }, (_, index) => `test('case ${index}', () => {});\n`).join("");

for (const mode of [[], ["--changed"]]) {
  const label = mode.length ? "changed" : "full";
  const frozen = { "core/legacy.cjs": { complexity: { count: 3 } } };
  for (const [name, current, file, rule, before, now] of [
    ["a higher count", { "core/legacy.cjs": { complexity: { count: 4 } } }, "core/legacy.cjs", "complexity", 3, 4],
    ["a new rule", { "core/legacy.cjs": { complexity: { count: 3 }, "no-empty": { count: 1 } } }, "core/legacy.cjs", "no-empty", 0, 1],
    ["a new file", { ...frozen, "core/new.cjs": { complexity: { count: 1 } } }, "core/new.cjs", "complexity", 0, 1],
  ]) {
    test(`the ${label} check refuses ${name} in the lint freeze without ESLint`, (t) => {
      const repo = harnessRepo({ "eslint-suppressions.json": JSON.stringify(frozen) });
      t.after(repo.cleanup);
      repo.write("eslint-suppressions.json", JSON.stringify(current));
      const result = repo.node("scripts/check.mjs", [...mode, "--json"]);
      assert.equal(result.code, 1, result.out);
      const report = JSON.parse(result.out);
      assert.equal(report.steps.find((step) => step.name === "lint").status, "skip");
      const freeze = report.steps.find((step) => step.name === "gel du lint");
      assert.equal(freeze.status, "ko");
      assert.ok(freeze.detail.includes(`${file} : ${rule} : ${before} → ${now}`), freeze.detail);
      assert.match(freeze.detail, /infraction nouvelle se corrige au lieu de se geler/);
    });
  }

  for (const [name, current] of [
    ["a lower count", { "core/legacy.cjs": { complexity: { count: 2 } } }],
    ["a removed rule", { "core/legacy.cjs": {} }],
    ["a removed entry", {}],
    ["a removed freeze file", null],
  ]) {
    test(`the ${label} check accepts ${name} in the lint freeze without ESLint`, (t) => {
      const repo = harnessRepo({ "eslint-suppressions.json": JSON.stringify(frozen) });
      t.after(repo.cleanup);
      if (current === null) fs.unlinkSync(path.join(repo.root, "eslint-suppressions.json"));
      else repo.write("eslint-suppressions.json", JSON.stringify(current));
      const result = repo.node("scripts/check.mjs", [...mode, "--json"]);
      assert.equal(result.code, 0, result.out);
      const report = JSON.parse(result.out);
      assert.equal(report.steps.find((step) => step.name === "lint").status, "skip");
      assert.equal(report.steps.find((step) => step.name === "gel du lint").status, "ok");
    });
  }

  test(`the ${label} check accepts an absent lint freeze in both the tree and HEAD`, (t) => {
    const repo = harnessRepo();
    t.after(repo.cleanup);
    const result = repo.node("scripts/check.mjs", [...mode, "--json"]);
    assert.equal(result.code, 0, result.out);
    const report = JSON.parse(result.out);
    assert.equal(report.steps.find((step) => step.name === "lint").status, "skip");
    assert.equal(report.steps.find((step) => step.name === "gel du lint").status, "ok");
  });

  for (const version of ["tree", "HEAD"]) {
    test(`the ${label} check explicitly refuses invalid lint freeze JSON in ${version}`, (t) => {
      const initial = version === "HEAD" ? "{" : JSON.stringify(frozen);
      const repo = harnessRepo({ "eslint-suppressions.json": initial });
      t.after(repo.cleanup);
      repo.write("eslint-suppressions.json", version === "HEAD" ? JSON.stringify(frozen) : "{");
      const result = repo.node("scripts/check.mjs", [...mode, "--json"]);
      assert.equal(result.code, 1, result.out);
      const freeze = JSON.parse(result.out).steps.find((step) => step.name === "gel du lint");
      assert.equal(freeze.status, "ko");
      assert.match(freeze.detail, /eslint-suppressions\.json.*JSON invalide/);
      if (version === "HEAD") assert.match(freeze.detail, /HEAD:eslint-suppressions\.json/);
    });
  }

  test(`the ${label} check explicitly refuses an unreadable lint freeze`, (t) => {
    const repo = harnessRepo({ "eslint-suppressions.json": JSON.stringify(frozen) });
    t.after(repo.cleanup);
    const file = path.join(repo.root, "eslint-suppressions.json");
    fs.unlinkSync(file);
    fs.mkdirSync(file);
    const result = repo.node("scripts/check.mjs", [...mode, "--json"]);
    assert.equal(result.code, 1, result.out);
    const freeze = JSON.parse(result.out).steps.find((step) => step.name === "gel du lint");
    assert.equal(freeze.status, "ko");
    assert.match(freeze.detail, /eslint-suppressions\.json.*illisible/);
  });

  test(`the ${label} check reports every new lint freeze pair when HEAD has no freeze`, (t) => {
    const repo = harnessRepo();
    t.after(repo.cleanup);
    const current = { "core/legacy.cjs": { complexity: { count: 3 }, "no-empty": { count: 1 } } };
    repo.write("eslint-suppressions.json", JSON.stringify(current));
    const result = repo.node("scripts/check.mjs", [...mode, "--json"]);
    assert.equal(result.code, 1, result.out);
    const freeze = JSON.parse(result.out).steps.find((step) => step.name === "gel du lint");
    assert.equal(freeze.status, "ko");
    assert.ok(freeze.detail.includes("core/legacy.cjs : complexity : 0 → 3"), freeze.detail);
    assert.ok(freeze.detail.includes("core/legacy.cjs : no-empty : 0 → 1"), freeze.detail);
  });

  test(`the ${label} check refuses an unknown baseline key instead of dropping its protection`, (t) => {
    const repo = harnessRepo();
    t.after(repo.cleanup);
    assert.equal(repo.node("scripts/quality/ratchet.mjs", ["--init"]).code, 0);
    const baseline = JSON.parse(repo.read("scripts/quality/baseline.json"));
    repo.write("scripts/quality/baseline.json", JSON.stringify({ ...baseline, cas_de_test: 1 }));
    const result = repo.node("scripts/check.mjs", [...mode, "--json"]);
    assert.equal(result.code, 1, result.out);
    const ratchet = JSON.parse(result.out).steps.find((step) => step.name === "cliquet");
    assert.equal(ratchet.status, "ko");
    assert.match(ratchet.detail, /Mesures inconnues du plancher : cas_de_test/);
  });

  for (const [lost, family] of [["produit", "product"], ["harnais", "harness"]]) {
    test(`the ${label} check refuses a lost ${family} case compensated by the other family`, async (t) => {
      const { measure } = await load("scripts/quality/metrics.mjs");
      const repo = harnessRepo({
        "tests/session.test.cjs": testSource(1),
        "tests/quality-check.test.cjs": testSource(2),
      });
      t.after(repo.cleanup);
      const initial = repo.node("scripts/quality/ratchet.mjs", ["--init"]);
      assert.equal(initial.code, 0, initial.out);
      const before = JSON.parse(initial.out);
      assert.equal(before.cas_de_test_produit, 2);
      assert.equal(before.cas_de_test_harnais, 2);
      const green = repo.node("scripts/check.mjs", [...mode, "--json"]);
      assert.equal(green.code, 0, green.out);
      assert.equal(JSON.parse(green.out).steps.find((step) => step.name === "cliquet").status, "ok");
      const product = lost === "produit" ? 1 : 3;
      const harness = 4 - product;
      repo.write("tests/session.test.cjs", testSource(product - 1));
      repo.write("tests/quality-check.test.cjs", testSource(harness));
      const current = measure(repo.root);
      assert.equal(current.cas_de_test_produit, product);
      assert.equal(current.cas_de_test_harnais, harness);
      assert.equal(current.cas_de_test_produit + current.cas_de_test_harnais, 4);
      const red = repo.node("scripts/check.mjs", [...mode, "--json"]);
      assert.equal(red.code, 1, red.out);
      const ratchet = JSON.parse(red.out).steps.find((step) => step.name === "cliquet");
      assert.equal(ratchet.status, "ko");
      assert.equal(ratchet.detail, `Mesures dégradées :\ncas_de_test_${lost} : 2 → 1`);
    });
  }
}

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
    cas_de_test_produit: 4,
    cas_de_test_harnais: 0,
  });
});

test("a measure that gets worse is a regression whichever way it is meant to move", async () => {
  const { compare } = await load("scripts/quality/ratchet.mjs");
  const baseline = { catch_vides_prod: 2, cas_de_test_produit: 10, cas_de_test_harnais: 5 };
  const worse = compare(baseline, { catch_vides_prod: 3, cas_de_test_produit: 9, cas_de_test_harnais: 4 });
  assert.deepEqual(worse.regressions.map((r) => r.key), ["catch_vides_prod", "cas_de_test_produit", "cas_de_test_harnais"]);
  const better = compare(baseline, { catch_vides_prod: 1, cas_de_test_produit: 12, cas_de_test_harnais: 6 });
  assert.equal(better.regressions.length, 0);
  assert.deepEqual(better.improvements.map((r) => r.key), ["catch_vides_prod", "cas_de_test_produit", "cas_de_test_harnais"]);
  for (const [product, harness, lost, gained] of [[9, 6, "produit", "harnais"], [11, 4, "harnais", "produit"]]) {
    const result = compare(baseline, { cas_de_test_produit: product, cas_de_test_harnais: harness });
    const key = `cas_de_test_${lost}`;
    assert.deepEqual(result.regressions, [{ key, before: baseline[key], now: lost === "produit" ? 9 : 4, direction: "min" }]);
    assert.deepEqual(result.improvements.map((r) => r.key), [`cas_de_test_${gained}`]);
  }
});

test("the baseline only ever tightens, never loosens", async () => {
  const { tighten } = await load("scripts/quality/ratchet.mjs");
  const baseline = { catch_vides_prod: 5, cas_de_test_produit: 10, cas_de_test_harnais: 5 };
  const next = tighten(baseline, { catch_vides_prod: 7, cas_de_test_produit: 8, cas_de_test_harnais: 4 });
  assert.deepEqual(next, baseline);
  const improved = tighten(baseline, { catch_vides_prod: 3, cas_de_test_produit: 14, cas_de_test_harnais: 7 });
  assert.deepEqual(improved, { catch_vides_prod: 3, cas_de_test_produit: 14, cas_de_test_harnais: 7 });
  assert.deepEqual(tighten(baseline, { cas_de_test_produit: 9, cas_de_test_harnais: 6 }), { ...baseline, cas_de_test_harnais: 6 });
  assert.deepEqual(tighten(baseline, { cas_de_test_produit: 11, cas_de_test_harnais: 4 }), { ...baseline, cas_de_test_produit: 11 });
  assert.deepEqual(tighten({}, baseline), baseline);
});

test("test case measures classify declared harness paths and default unknown and nested files to product", async (t) => {
  const { measure } = await load("scripts/quality/metrics.mjs");
  const harnessNames = [
    "ticket-loop", "loop-view", "loop-view-codex", "loop-view-events", "loop-view-state", "loop-view-feed",
    "loop-web", "loop-web-model", "watch-loop", "watch-loop-render", "agent-guards", "coverage-report",
    "quality-check", "npm-scripts", "reviewed-state",
  ];
  const files = Object.fromEntries(harnessNames.map((name, index) => [`tests/${name}.test.cjs`, testSource(index + 1)]));
  Object.assign(files, {
    "tests/new-feature.test.cjs": testSource(2),
    "tests/nested/deeper/session.test.mjs": "  test('a', () => {});\n\ttest('b', () => {});\ntest(\n'c', () => {});\n",
    "tests/nested/ticket-loop.test.cjs": testSource(4),
    "tests/architecture.test.cjs": testSource(5),
    "tests/new-feature.test.js": testSource(6),
    "tests/quality-check.test.mjs": testSource(7),
    "tests/helpers/helper.js": testSource(8),
    "tests/nested/notes.test.py": testSource(9),
    "tests/nested/ignored.test.ts": testSource(10),
  });
  const repo = harnessRepo(files);
  t.after(repo.cleanup);
  const current = measure(repo.root);
  assert.equal(current.cas_de_test_produit, 28);
  assert.equal(current.cas_de_test_harnais, 120);
  const oldTotal = 1 + Object.entries(files).filter(([file]) => /\.test\.(cjs|mjs|js)$/.test(file))
    .reduce((sum, [, source]) => sum + (source.match(/^\s*test\(/gm) || []).length, 0);
  assert.equal(current.cas_de_test_produit + current.cas_de_test_harnais, oldTotal);
  assert.equal(Object.hasOwn(current, "cas_de_test"), false);
});

test("writing and reading the baseline preserves both independent test case floors", async (t) => {
  const { readBaseline, writeBaseline } = await load("scripts/quality/ratchet.mjs");
  const repo = harnessRepo();
  t.after(repo.cleanup);
  const values = { catch_vides_prod: 0, cas_de_test_produit: 12, cas_de_test_harnais: 7 };
  writeBaseline(repo.root, values);
  assert.deepEqual(readBaseline(repo.root), values);
  assert.deepEqual(JSON.parse(repo.read("scripts/quality/baseline.json")), values);
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

test("a test file that never ends turns the check red within its time budget and leaves no process behind", async (t) => {
  const stuck = [
    "const { test } = require('node:test');",
    "require('node:fs').writeFileSync('stuck.pid', String(process.pid));",
    "test('never ends', () => new Promise(() => setInterval(() => {}, 1000)));",
  ];
  const repo = harnessRepo({ "tests/stuck.test.cjs": stuck.join("\n") + "\n" });
  t.after(repo.cleanup);
  const red = repo.node("scripts/check.mjs", [], { env: { TVLENS_TEST_BUDGET_MS: "4000" } });
  assert.equal(red.code, 1, red.out);
  assert.match(red.out, /Délai dépassé \(4 s\)/);
  const pid = Number(repo.read("stuck.pid"));
  const alive = () => {
    try {
      process.kill(pid, 0);
      return true;
    } catch (error) {
      // No such process: it was stopped.
      return false;
    }
  };
  for (let i = 0; i < 100 && alive(); i++) await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(alive(), false, "the stuck test process was stopped along with the check");
});
