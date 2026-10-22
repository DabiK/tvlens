import fs from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { parseArgs } from "node:util";
import { pathToFileURL } from "node:url";
import { compareQualityPolicy, validateFullCheck } from "./ci-policy.mjs";
import { checkBaseFiles } from "./ci-changes.mjs";

const FILES = {
  baseline: "scripts/quality/baseline.json",
  suppressions: "eslint-suppressions.json",
};

export async function checkBasePolicy(root, base) {
  if (!/^[a-f0-9]{40}$/.test(base))
    throw Object.assign(new Error("La base CI doit être un SHA Git complet."), {
      code: "TVLENS_CI_BASE_INVALID",
    });
  const before = {},
    current = {};
  for (const [key, file] of Object.entries(FILES)) {
    const result = spawnSync("git", ["show", `${base}:${file}`], {
      cwd: root,
      encoding: "utf8",
    });
    if (result.status !== 0)
      throw Object.assign(new Error(`Base CI indisponible : ${base}:${file}`), {
        code: "TVLENS_CI_BASE_UNAVAILABLE",
      });
    before[key] = JSON.parse(result.stdout);
    current[key] = JSON.parse(await fs.readFile(path.join(root, file), "utf8"));
  }
  return compareQualityPolicy(before, current);
}

async function main() {
  const { values } = parseArgs({
    options: { base: { type: "string" }, report: { type: "string" } },
  });
  const problems = values.base
    ? await checkBasePolicy(process.cwd(), values.base)
    : [];
  if (values.base)
    problems.push(...(await checkBaseFiles(process.cwd(), values.base)));
  // Toujours le contrôle complet : --changed est vide sur un checkout CI propre.
  const result = spawnSync(process.execPath, ["scripts/check.mjs", "--json"], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    stdio: ["ignore", "pipe", "inherit"],
  });
  let check;
  try {
    check = JSON.parse(result.stdout);
  } catch {
    problems.push(
      "Le contrôle qualité n’a pas produit de rapport JSON lisible.",
    );
  }
  problems.push(...validateFullCheck(check));
  if (result.status !== 0)
    problems.push(
      `Le contrôle qualité a échoué (${result.status ?? result.error?.code}).`,
    );
  const report = {
    ok: problems.length === 0,
    base: values.base ?? null,
    problems,
    check,
  };
  const json = JSON.stringify(report, null, 2) + "\n";
  if (values.report) await fs.writeFile(values.report, json);
  console.log(json);
  if (!report.ok) process.exitCode = 1;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
