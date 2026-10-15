const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const COMMAND = path.resolve(__dirname, "../scripts/coverage.mjs");
const COMMAND_TIMEOUT_MS = 30_000;

function fixture(t, extra = {}) {
  const root = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), "tvlens-coverage-")),
  );
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const files = {
    "core/choice.cjs": [
      "module.exports = function choose(flag) {",
      "  if (flag) {",
      "    return 'yes';",
      "  } else {",
      "    return 'no';",
      "  }",
      "};",
      "",
    ].join("\n"),
    "app/nested/unloaded.mjs": "throw new Error('must never execute');\n",
    "tests/choice.test.cjs": [
      "const { test } = require('node:test');",
      "const assert = require('node:assert/strict');",
      "const choose = require('../core/choice.cjs');",
      "test('chooses yes', () => {",
      "  console.log('test output must stay separate');",
      "  assert.equal(choose(true), 'yes');",
      "});",
      "",
    ].join("\n"),
    "scripts/ignored.js": "throw new Error('outside scope');\n",
    "core/ignored.txt": "not JavaScript",
    ...extra,
  };
  for (const [rel, content] of Object.entries(files)) {
    const dest = path.join(root, rel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, content);
  }
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  // La propriété explicite bloque la réinjection par child_process ; undefined omet la variable de l'enfant.
  env.NODE_V8_COVERAGE = undefined;
  delete env.NODE_OPTIONS;
  return {
    root,
    run: (args = [], environment = {}) =>
      spawnSync(process.execPath, [COMMAND, ...args], {
        cwd: root,
        env: { ...env, ...environment },
        encoding: "utf8",
        timeout: COMMAND_TIMEOUT_MS,
      }),
  };
}

test("reports a nested unloaded module at zero without executing it", (t) => {
  const repo = fixture(t);
  const result = repo.run(["--json"]);
  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.complete, true);
  assert.equal(report.testsPassed, true);
  assert.deepEqual(report.errors, []);
  assert.deepEqual(
    report.modules.map((row) => row.path),
    ["app/nested/unloaded.mjs", "core/choice.cjs"],
  );
  assert.deepEqual(report.modules[0], {
    path: "app/nested/unloaded.mjs",
    lines: 0,
    branches: 0,
    functions: 0,
  });
});

test("measures the exercised and unexercised branches with exact percentages", (t) => {
  const repo = fixture(t);
  const result = repo.run(["--json"]);
  assert.equal(result.status, 0, result.stderr);
  const covered = JSON.parse(result.stdout).modules.find(
    (row) => row.path === "core/choice.cjs",
  );
  assert.deepEqual(covered, {
    path: "core/choice.cjs",
    lines: (5 / 7) * 100,
    branches: (2 / 3) * 100,
    functions: 100,
  });
});

test("keeps JSON and text measures identical and repeatable in the specified order", (t) => {
  const repo = fixture(t, {
    "core/branch.cjs": "module.exports = (flag) => flag ? 1 : 0;\n",
    "core/functions.cjs": "module.exports = [() => 1, () => 0];\n",
    "core/uncalled.cjs": "module.exports = () => {\n  return 1;\n};\n",
    "core/full-a.cjs": "module.exports = () => 1;\n",
    "core/full-z.cjs": "module.exports = () => 1;\n",
    "tests/order.test.cjs": [
      "const { test } = require('node:test');",
      "test('loads modules', () => {",
      "  require('../core/branch.cjs')(true);",
      "  require('../core/uncalled.cjs');",
      "  require('../core/functions.cjs')[0]();",
      "  require('../core/full-z.cjs')();",
      "  require('../core/full-a.cjs')();",
      "});",
    ].join("\n"),
  });
  const first = repo.run(["--json"]);
  const second = repo.run(["--json"]);
  const text = repo.run();
  for (const result of [first, second, text])
    assert.equal(result.status, 0, result.stderr);
  assert.equal(first.stdout, second.stdout);
  const report = JSON.parse(first.stdout);
  const lowLines = report.modules.find(
    (row) => row.path === "core/uncalled.cjs",
  );
  const lowBranches = report.modules.find(
    (row) => row.path === "core/branch.cjs",
  );
  assert.ok(lowLines.lines < lowBranches.lines);
  assert.ok(lowLines.branches > lowBranches.branches);
  assert.deepEqual(
    report.modules.map((row) => row.path),
    [
      "app/nested/unloaded.mjs",
      "core/uncalled.cjs",
      "core/choice.cjs",
      "core/branch.cjs",
      "core/functions.cjs",
      "core/full-a.cjs",
      "core/full-z.cjs",
    ],
  );
  const textRows = text.stdout
    .trim()
    .split("\n")
    .slice(2)
    .map((line) => {
      const [modulePath, lines, branches, functions] = line.split(" | ");
      return {
        path: modulePath,
        lines: Number(lines),
        branches: Number(branches),
        functions: Number(functions),
      };
    });
  assert.deepEqual(textRows, report.modules);
  assert.match(text.stdout, /Module \| Lignes \| Branches \| Fonctions/);
  assert.doesNotMatch(first.stdout, /test output must stay separate/);
});

test("inventories every product root and excludes dependencies, tests, scripts and resources", (t) => {
  const roots = [
    "core",
    "adapters",
    "runtime",
    "server",
    "app",
    "tv/app",
    "mcp",
  ];
  const extra = {};
  for (const root of roots)
    extra[`${root}/nested/empty.js`] = "throw new Error('unloaded');\n";
  extra["core/node_modules/dependency/index.cjs"] = "module.exports = 1;\n";
  extra["core/tests/extra.cjs"] = "module.exports = 1;\n";
  extra["core/scripts/tool.mjs"] = "export default 1;\n";
  const repo = fixture(t, extra);
  const result = repo.run(["--json"]);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(
    JSON.parse(result.stdout).modules.map((row) => row.path),
    [
      ...roots.map((root) => `${root}/nested/empty.js`),
      "app/nested/unloaded.mjs",
    ]
      .sort()
      .concat("core/choice.cjs"),
  );
});

test("runs only top-level test files sequentially", (t) => {
  const lockedTest = [
    "const { test } = require('node:test');",
    "const fs = require('node:fs');",
    "const lock = fs.openSync('suite.lock', 'wx');",
    "test('does not overlap another file', () => {});",
    "process.on('exit', () => { fs.closeSync(lock); fs.unlinkSync('suite.lock'); });",
  ].join("\n");
  const repo = fixture(t, {
    "tests/first.test.cjs": lockedTest,
    "tests/second.test.cjs": lockedTest,
    "tests/nested/ignored.test.cjs": "throw new Error('must not run');\n",
    "tests/ignored.cjs": "throw new Error('must not run');\n",
  });
  const result = repo.run(["--json"]);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).complete, true);
});

test("reports a failing test with a nonzero exit and a separate diagnostic", (t) => {
  const repo = fixture(t, {
    "tests/failure.test.cjs":
      "require('node:test').test('broken assertion', () => require('node:assert/strict').equal(1, 2));\n",
  });
  const result = repo.run(["--json"]);
  assert.equal(result.status, 1);
  const report = JSON.parse(result.stdout);
  assert.equal(report.complete, false);
  assert.equal(report.testsPassed, false);
  assert.equal(report.errors[0].code, "TESTS_FAILED");
  assert.match(result.stderr, /broken assertion/);
  assert.match(result.stderr, /ERR_ASSERTION/);
});

test("rejects missing coverage data even when the test assertions pass", (t) => {
  const repo = fixture(t, {
    "tests/corrupt.test.cjs": [
      "const { test } = require('node:test');",
      "const fs = require('node:fs');",
      "const path = require('node:path');",
      "test('damages collection', () => {",
      "  fs.writeFileSync(path.join(process.env.NODE_V8_COVERAGE, 'coverage-1-1234567890123-0.json'), '{');",
      "});",
    ].join("\n"),
  });
  const result = repo.run(["--json"]);
  assert.equal(result.status, 1, result.stdout + result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.complete, false);
  assert.equal(report.testsPassed, true);
  assert.equal(report.errors[0].code, "COVERAGE_INCOMPLETE");
  assert.equal(report.errors[0].details?.coverageMissing, true);
});

test("does not start implicit test discovery when no matching test exists", (t) => {
  const repo = fixture(t);
  fs.rmSync(path.join(repo.root, "tests/choice.test.cjs"));
  const result = repo.run(["--json"]);
  assert.equal(result.status, 1);
  const report = JSON.parse(result.stdout);
  assert.equal(report.complete, false);
  assert.equal(report.errors[0].code, "NO_TEST_FILES");
});

test("accepts passing test files that only use top-level assertions", (t) => {
  const repo = fixture(t, {
    "tests/assertions.test.cjs": "require('node:assert/strict').equal(1, 1);\n",
  });
  const result = repo.run(["--json"]);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).complete, true);
});

test("keeps runner diagnostics on stderr when collecting JSON", (t) => {
  const repo = fixture(t, {
    "tests/diagnostics.test.cjs": [
      "const { test } = require('node:test');",
      "test('adds diagnostic', (t) => t.diagnostic('controlled report diagnostic'));",
    ].join("\n"),
  });
  const result = repo.run(["--json"]);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).complete, true);
  assert.match(result.stderr, /controlled report diagnostic/);
});

test("isolates a nested collection from the caller's coverage directory", (t) => {
  const repo = fixture(t, {
    "tests/corrupt.test.cjs": [
      "const { test } = require('node:test');",
      "const fs = require('node:fs');",
      "const path = require('node:path');",
      "test('damages inner collection', () => {",
      "  fs.writeFileSync(path.join(process.env.NODE_V8_COVERAGE, 'coverage-1-1234567890123-0.json'), '{');",
      "});",
    ].join("\n"),
  });
  const parentCoverage = path.join(repo.root, "parent-coverage");
  fs.mkdirSync(parentCoverage);
  const result = repo.run(["--json"], { NODE_V8_COVERAGE: parentCoverage });
  assert.equal(result.status, 1, result.stderr);
  assert.equal(JSON.parse(result.stdout).complete, false);
  assert.ok(fs.readdirSync(parentCoverage).length > 0);
  assert.equal(
    fs.existsSync(path.join(parentCoverage, "coverage-1-1234567890123-0.json")),
    false,
  );
});

test("reports test and collection failures independently", (t) => {
  const repo = fixture(t, {
    "tests/failure.test.cjs": [
      "const { test } = require('node:test');",
      "const fs = require('node:fs');",
      "const path = require('node:path');",
      "test('fails and damages collection', () => {",
      "  fs.writeFileSync(path.join(process.env.NODE_V8_COVERAGE, 'coverage-1-1234567890123-0.json'), '{');",
      "  require('node:assert/strict').equal(1, 2);",
      "});",
    ].join("\n"),
  });
  const result = repo.run(["--json"]);
  assert.equal(result.status, 1, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.complete, false);
  assert.equal(report.testsPassed, false);
  assert.deepEqual(report.errors.map((error) => error.code).sort(), [
    "COVERAGE_INCOMPLETE",
    "TESTS_FAILED",
  ]);
});

test("preserves received coverage and assertion status in an incomplete collection", async () => {
  const { summarizeCollection } =
    await import("../scripts/coverage-reporter.mjs");
  const measured = {
    path: "/sample/core/choice.cjs",
    coveredLinePercent: 75,
    coveredBranchPercent: 50,
    coveredFunctionPercent: 100,
  };
  const result = summarizeCollection(
    {
      coverage: [measured],
      testsPassed: true,
      success: true,
      completedFiles: ["/sample/tests/finished.test.cjs"],
    },
    ["/sample/tests/finished.test.cjs", "/sample/tests/missing.test.cjs"],
    "/sample",
    true,
  );
  assert.deepEqual(result.files, [measured]);
  assert.equal(result.testsPassed, true);
  assert.deepEqual(
    result.errors.map((error) => error.code),
    ["COVERAGE_INCOMPLETE"],
  );
  assert.deepEqual(result.errors[0].details, {
    coverageMissing: false,
    unfinishedFiles: ["tests/missing.test.cjs"],
    summaryMissing: false,
    executionFailed: false,
  });
});

test("reports unfinished files relative to the repository with mixed runner paths", async () => {
  const { summarizeCollection } =
    await import("../scripts/coverage-reporter.mjs");
  const result = summarizeCollection(
    {
      coverage: [],
      testsPassed: true,
      success: true,
      completedFiles: ["/sample/tests/finished.test.cjs", "tests/relative.test.cjs"],
    },
    [
      "tests/finished.test.cjs",
      "/sample/tests/relative.test.cjs",
      "/sample/tests/nested/missing.test.cjs",
    ],
    "/sample",
  );
  assert.deepEqual(result.errors[0].details.unfinishedFiles, [
    "tests/nested/missing.test.cjs",
  ]);
});

test("marks a failed text report as incomplete", (t) => {
  const repo = fixture(t, {
    "tests/failure.test.cjs":
      "require('node:test').test('broken assertion', () => require('node:assert/strict').equal(1, 2));\n",
  });
  const result = repo.run();
  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stdout, /INCOMPLÈTE/);
  assert.match(result.stderr, /TESTS_FAILED/);
});

test("identifies missing summaries and execution failures in collection diagnostics", async () => {
  const { summarizeCollection } =
    await import("../scripts/coverage-reporter.mjs");
  const complete = {
    coverage: [],
    completedFiles: [],
    testsPassed: true,
    success: true,
  };
  const cases = [
    {
      data: { ...complete, testsPassed: null, success: false },
      runSucceeded: true,
      cause: "summaryMissing",
    },
    { data: complete, runSucceeded: false, cause: "executionFailed" },
  ];
  for (const { data, runSucceeded, cause } of cases) {
    const result = summarizeCollection(data, [], "/sample", runSucceeded);
    assert.equal(result.errors[0].code, "COVERAGE_INCOMPLETE");
    assert.equal(result.errors[0].details?.[cause], true);
  }
});
