#!/usr/bin/env node
// PostToolUse(Edit|Write|apply_patch) : contrôle rapide de chaque fichier JavaScript écrit. L'édition a déjà eu lieu ;
// le retour sert à corriger tout de suite plutôt qu'à la fin du ticket.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { block, editPaths, projectDir, readInput, relative } from "./lib.mjs";

const input = readInput();
const root = projectDir(input);
const failures = [];
for (const target of new Set(editPaths(input))) {
  if (!/\.(cjs|mjs|js)$/.test(target)) continue;
  const file = relative(root, target);
  if (file.startsWith("..") || !fs.existsSync(path.join(root, file))) continue;
  const check = spawnSync(process.execPath, ["scripts/check.mjs", "--file", file], { cwd: root, encoding: "utf8" });
  if (check.status !== 0) failures.push(`Contrôle rapide en échec sur ${file} :\n${(check.stdout || "") + (check.stderr || "")}`);
}
if (failures.length) block(failures.join("\n"));
