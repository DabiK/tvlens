import { inspect } from "node:util";
import path from "node:path";

// Les sorties des tests restent des diagnostics ; seul ce protocole arrive sur stdout.
export default async function* coverageReporter(source) {
  let coverage = null;
  let success = false;
  let testsPassed = null;
  const completedFiles = new Set();
  for await (const { type, data } of source) {
    if (type === "test:coverage") {
      coverage = data.summary.files.map((file) => ({
        path: file.path,
        coveredLinePercent: file.coveredLinePercent,
        coveredBranchPercent: file.coveredBranchPercent,
        coveredFunctionPercent: file.coveredFunctionPercent,
      }));
    }
    // Les fichiers sans node:test n'émettent pas de résumé, mais leur fin reste observable.
    if (type === "test:complete" && data.file) completedFiles.add(data.file);
    if (type === "test:summary" && !data.file) {
      success = data.success;
      testsPassed = data.counts.failed === 0 && data.counts.cancelled === 0;
    }
    if (type === "test:fail") {
      process.stderr.write(
        `Échec de test : ${data.name}\n${inspect(data.details.error)}\n`,
      );
    }
    if (type === "test:diagnostic") process.stderr.write(`${data.message}\n`);
    if (type === "test:stderr" || type === "test:stdout") {
      process.stderr.write(data.message);
    }
  }
  yield JSON.stringify({
    coverage,
    success,
    testsPassed,
    completedFiles: [...completedFiles],
  });
}

export function summarizeCollection(
  data,
  expectedFiles,
  root,
  runSucceeded = true,
) {
  const relativeFile = (file) =>
    path.relative(root, path.resolve(root, file)).split(path.sep).join("/");
  const completed = new Set(data.completedFiles.map(relativeFile));
  const missing = expectedFiles
    .map(relativeFile)
    .filter((file) => !completed.has(file));
  const hasCoverage = Array.isArray(data.coverage);
  const unknownTests = typeof data.testsPassed !== "boolean";
  const collectionFailed = data.testsPassed && (!data.success || !runSucceeded);
  const errors = [];
  if (!hasCoverage || missing.length || unknownTests || collectionFailed) {
    errors.push({
      code: "COVERAGE_INCOMPLETE",
      message: "La collecte de couverture est incomplète.",
      details: {
        coverageMissing: !hasCoverage,
        unfinishedFiles: missing,
        summaryMissing: unknownTests,
        executionFailed: Boolean(collectionFailed),
      },
    });
  }
  if (data.testsPassed === false) {
    errors.push({
      code: "TESTS_FAILED",
      message: "Des tests JavaScript ont échoué.",
    });
  }
  return {
    files: hasCoverage ? data.coverage : [],
    testsPassed: data.testsPassed === true,
    errors,
  };
}
