#!/usr/bin/env node
// PostToolUse(Edit|Write) : contrôle rapide du fichier qui vient d'être écrit. L'édition a déjà eu lieu ;
// le retour sert à corriger tout de suite plutôt qu'à la fin du ticket.
import { spawnSync } from "node:child_process";
import { block, projectDir, readInput, relative } from "./lib.mjs";

const input = readInput();
const root = projectDir(input);
const target = input.tool_input?.file_path;
if (!target || !/\.(cjs|mjs|js)$/.test(target)) process.exit(0);
const file = relative(root, target);
if (file.startsWith("..")) process.exit(0);

const check = spawnSync(process.execPath, ["scripts/check.mjs", "--file", file], { cwd: root, encoding: "utf8" });
if (check.status !== 0) block(`Contrôle rapide en échec sur ${file} :\n${(check.stdout || "") + (check.stderr || "")}`);
