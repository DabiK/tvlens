#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { summarizeCollection } from "./coverage-reporter.mjs";
import { PROD_DIRS } from "./quality/metrics.mjs";

const EXCLUDED_DIRS = new Set(["node_modules", "tests", "scripts", ".git"]);
const CODE = /\.(js|cjs|mjs)$/;
const TEST_BUDGET_MS = 20 * 60 * 1000;
const MAX_OUTPUT_BYTES = 64 * 1024 * 1024;
const root = fs.realpathSync(process.cwd());
const json = process.argv.includes("--json");

function inventory(dir) {
  const absolute = path.join(root, dir);
  if (!fs.existsSync(absolute)) return [];
  return fs.readdirSync(absolute, { withFileTypes: true }).flatMap((entry) => {
    const relative = path.posix.join(dir, entry.name);
    if (entry.isDirectory()) {
      return EXCLUDED_DIRS.has(entry.name) ? [] : inventory(relative);
    }
    return entry.isFile() && CODE.test(entry.name) ? [relative] : [];
  });
}

function collect(tests) {
  const env = { ...process.env };
  // Le rapport fonctionne aussi depuis un test ou une collecte parente : chacun possède sa collecte.
  delete env.NODE_TEST_CONTEXT;
  // La propriété explicite bloque la réinjection par child_process ; undefined omet la variable de l'enfant.
  env.NODE_V8_COVERAGE = undefined;
  const reporter = fileURLToPath(
    new URL("./coverage-reporter.mjs", import.meta.url),
  );
  const result = spawnSync(
    process.execPath,
    [
      "--experimental-test-coverage",
      "--test",
      "--test-concurrency=1",
      `--test-reporter=${reporter}`,
      ...tests,
    ],
    {
      cwd: root,
      env,
      encoding: "utf8",
      timeout: TEST_BUDGET_MS,
      maxBuffer: MAX_OUTPUT_BYTES,
      detached: true,
      killSignal: "SIGKILL",
    },
  );
  if (result.error && result.pid) {
    try {
      process.kill(-result.pid, "SIGKILL");
    } catch (error) {
      if (error.code !== "ESRCH") throw error;
    }
  }
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.error) throw result.error;
  const data = JSON.parse(result.stdout);
  return summarizeCollection(data, tests, root, result.status === 0);
}

const comparePath = (a, b) => (a < b ? -1 : Number(a > b));
const compareRows = (a, b) =>
  a.lines - b.lines ||
  a.branches - b.branches ||
  a.functions - b.functions ||
  comparePath(a.path, b.path);

function rowsFor(modules, files) {
  const measured = new Map(
    files.map((file) => [
      path.relative(root, file.path).split(path.sep).join("/"),
      file,
    ]),
  );
  return modules
    .map((modulePath) => {
      const file = measured.get(modulePath);
      return {
        path: modulePath,
        lines: file?.coveredLinePercent ?? 0,
        branches: file?.coveredBranchPercent ?? 0,
        functions: file?.coveredFunctionPercent ?? 0,
      };
    })
    .sort(compareRows);
}

function reportCoverage() {
  const modules = PROD_DIRS.flatMap(inventory);
  const tests = fs.existsSync(path.join(root, "tests"))
    ? fs
        .readdirSync(path.join(root, "tests"))
        .filter((file) => file.endsWith(".test.cjs"))
        .sort()
        .map((file) => `tests/${file}`)
    : [];
  const report = {
    complete: false,
    testsPassed: false,
    errors: [],
    modules: [],
  };
  let files = [];
  try {
    if (!tests.length)
      throw Object.assign(new Error("Aucun fichier de test JavaScript."), {
        code: "NO_TEST_FILES",
      });
    const collected = collect(tests);
    files = collected.files;
    report.testsPassed = collected.testsPassed;
    report.errors.push(...collected.errors);
    report.complete = report.errors.length === 0;
  } catch (error) {
    report.errors.push({
      code: error.code || "COVERAGE_COLLECTION_FAILED",
      message: "Collecte de couverture impossible ou incomplète.",
    });
    process.stderr.write(
      `${error.code || "COVERAGE_COLLECTION_FAILED"} : ${error.message}\n`,
    );
  }
  report.modules = rowsFor(modules, files);
  return report;
}

function printReport(report) {
  if (json) return console.log(JSON.stringify(report, null, 2));
  console.log(
    report.complete
      ? "Couverture JavaScript par module (%)"
      : "Couverture JavaScript INCOMPLÈTE (%)",
  );
  console.log("Module | Lignes | Branches | Fonctions");
  for (const row of report.modules)
    console.log(
      `${row.path} | ${row.lines} | ${row.branches} | ${row.functions}`,
    );
  for (const error of report.errors)
    console.error(`${error.code} : ${error.message}`);
}

try {
  const report = reportCoverage();
  printReport(report);
  process.exitCode = report.complete ? 0 : 1;
} catch (error) {
  const report = {
    complete: false,
    testsPassed: false,
    modules: [],
    errors: [
      {
        code: error.code || "COVERAGE_COLLECTION_FAILED",
        message: "Inventaire ou collecte impossible.",
      },
    ],
  };
  printReport(report);
  process.exitCode = 1;
}
