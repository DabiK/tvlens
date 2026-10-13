#!/usr/bin/env node
// SessionStart : donne à la session l'état réel du dépôt et de la machine, en quelques lignes.
import { spawnSync } from "node:child_process";
import { loopMode, projectDir, readInput } from "./lib.mjs";

const root = projectDir(readInput());
const sh = (command, args) => (spawnSync(command, args, { cwd: root, encoding: "utf8" }).stdout || "").trim();

const branch = sh("git", ["branch", "--show-current"]) || "(HEAD détachée)";
const head = sh("git", ["log", "-1", "--format=%h %s"]);
const dirty = sh("git", ["status", "--porcelain"]).split("\n").filter(Boolean).length;
const swap = process.platform === "darwin" ? sh("sysctl", ["-n", "vm.swapusage"]) : "";

const lines = [
  `Branche ${branch} — ${head}`,
  `${dirty} fichier(s) modifié(s) ou non suivi(s).`,
  loopMode
    ? `Mode boucle : ticket ${process.env.TVLENS_TICKET} (${process.env.TVLENS_TICKET_FILE}). Suis la skill ticket ; ne committe pas, ne pousse pas.`
    : "Mode interactif. Pour traiter un ticket de docs/travail/tickets/, suivre la skill ticket.",
  "Contrôle qualité : node scripts/check.mjs (--changed pour les fichiers modifiés). Règles : docs/standards.md.",
];
if (swap) lines.push(`Mémoire d'échange : ${swap}. Machine vite saturée : deux sous-agents au plus à la fois, tests en séquentiel.`);

console.log(JSON.stringify({ hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: lines.join("\n") } }));
