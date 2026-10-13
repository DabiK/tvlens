#!/usr/bin/env node
// PreToolUse(Edit|Write|…) : protège le harnais lui-même et le cadre du ticket en cours.
import fs from "node:fs";
import path from "node:path";
import { TICKET_NAMED_TEST } from "../../scripts/quality/metrics.mjs";
import { decide, loopMode, projectDir, readInput, refuseOrAsk, relative } from "./lib.mjs";

const input = readInput();
const root = projectDir(input);
const target = input.tool_input?.file_path || input.tool_input?.notebook_path;
if (!target) process.exit(0);
const file = relative(root, target);

// Ce qui définit les règles ne se modifie pas en cours de ticket : sinon un contrôle rouge se « répare » en l'affaiblissant.
const PROTECTED = [".claude/", "scripts/check.mjs", "scripts/quality/", "scripts/loop/", "CLAUDE.md", "docs/standards.md"];
const isProtected = PROTECTED.some((p) => (p.endsWith("/") ? file.startsWith(p) : file === p));

const name = path.basename(file);
const newFile = !fs.existsSync(path.resolve(root, target));
if (newFile && file.startsWith("tests/") && /\.test\./.test(name) && TICKET_NAMED_TEST.test(name)) {
  const advice = "Nomme le fichier d'après le comportement testé, ou ajoute le test au fichier du module concerné.";
  decide("deny", `« ${name} » porte le nom d'un ticket ou d'une revue. ${advice}`);
}

if (isProtected && process.env.TVLENS_HARNESS !== "1") {
  const when = "Il ne se modifie que dans un ticket marqué « harnais: oui » ou à la demande explicite de l'utilisateur.";
  refuseOrAsk(`${file} fait partie du harnais (règles, contrôles, boucle). ${when}`);
}

if (loopMode) {
  if (file.startsWith("..")) decide("deny", "Refusé pendant un ticket : écriture en dehors du projet.");
  const ticket = process.env.TVLENS_TICKET_FILE ? relative(root, process.env.TVLENS_TICKET_FILE) : null;
  if (file.startsWith("docs/travail/tickets/") && file !== ticket)
    decide("deny", "Refusé pendant un ticket : seul le journal du ticket en cours se modifie, pas les autres tickets.");
}
