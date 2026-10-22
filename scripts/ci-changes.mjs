import fs from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import {
  measureText,
  PROD_DIRS,
  TICKET_NAMED_TEST,
} from "./quality/metrics.mjs";

export async function checkBaseFiles(root, base) {
  const git = (args) => {
    const result = spawnSync("git", args, {
      cwd: root,
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
    });
    if (result.status !== 0)
      throw Object.assign(new Error("Lecture des changements CI impossible."), {
        code: "TVLENS_CI_GIT_FAILED",
      });
    return result.stdout;
  };
  if (!/^[a-f0-9]{40}$/.test(base))
    throw Object.assign(new Error("Base CI invalide."), {
      code: "TVLENS_CI_BASE_INVALID",
    });
  const changes = git([
    "diff",
    "--name-status",
    "-z",
    "--no-renames",
    base,
    "--",
  ]).split("\0");
  const problems = [];
  for (let index = 0; index < changes.length - 1; index += 2) {
    const status = changes[index],
      file = changes[index + 1];
    if (status === "D" || !/\.(?:cjs|mjs|js)$/.test(file)) continue;
    const previous = measureText(
      status === "A" ? "" : git(["show", `${base}:${file}`]),
    );
    const now = measureText(await fs.readFile(path.join(root, file), "utf8"));
    if (now.lignes_longues > previous.lignes_longues)
      problems.push(`${file} : ajout de lignes de plus de 160 caractères.`);
    if (
      PROD_DIRS.some((dir) => file.startsWith(dir + "/")) &&
      now.catch_vides > previous.catch_vides
    ) {
      problems.push(`${file} : ajout de catch vide.`);
    }
    if (
      status === "A" &&
      file.startsWith("tests/") &&
      /\.test\./.test(file) &&
      TICKET_NAMED_TEST.test(path.basename(file))
    ) {
      problems.push(`${file} : le nom du test doit décrire un comportement.`);
    }
  }
  return problems;
}
