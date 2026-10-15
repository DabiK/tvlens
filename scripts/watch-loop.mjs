#!/usr/bin/env node
// Suivi de la boucle Claude ou Codex : ticket, phase, relectures, dernières actions et file restante.
// Lecture de `session-<n>.jsonl` ou `codex-<n>.jsonl` ; `verdict.json` aide à repérer la relecture externe de Codex.
// Les actions Codex portent son nom et son coût reste inconnu. La rétrospective suit une intégration ou un blocage,
// sauf si la commande de la boucle contient `--no-retro`. Lecture seule de `.harness-state/` et des tickets ; seul `ps` est lancé.
//
//   node scripts/watch-loop.mjs                 redessine l'écran chaque seconde, jusqu'à Ctrl-C
//   node scripts/watch-loop.mjs --once          imprime un seul écran et sort
//   node scripts/watch-loop.mjs --root <dossier>  suit la boucle d'un autre projet (par défaut, celui du script)
//
// Quand la sortie n'est pas un terminal, il se comporte comme avec --once.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildView } from "./loop-view.mjs";
import { createReader } from "./watch-loop/reader.mjs";
import { watch } from "./watch-loop/terminal.mjs";
import { render } from "./watch-loop/render.mjs";
import { DEFAULT_COLUMNS, plain } from "./watch-loop/text.mjs";

const USAGE = "Usage : node scripts/watch-loop.mjs [--root <dossier>] [--once]";

function parseArguments(argv) {
  const options = { root: path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."), once: false, help: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--once") options.once = true;
    else if (argv[i] === "--help" || argv[i] === "-h") options.help = true;
    else if (argv[i] === "--root" && argv[i + 1]) options.root = path.resolve(argv[++i]);
    else return { error: `Option inconnue ou incomplète : ${argv[i]}` };
  }
  return options;
}

const columns = () => process.stdout.columns || DEFAULT_COLUMNS;
const useColor = () => Boolean(process.stdout.isTTY) && !process.env.NO_COLOR;

function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.error) {
    console.error(`${options.error}\n${USAGE}`);
    process.exit(2);
  }
  if (options.help) {
    console.log(USAGE);
    return;
  }
  if (!fs.existsSync(options.root) || !fs.statSync(options.root).isDirectory()) {
    console.error(`Dossier introuvable : ${plain(options.root)}`);
    process.exit(1);
  }
  const reader = createReader(options.root);
  const frame = () => render(buildView(reader.read(Date.now())), { width: columns(), color: useColor() });
  if (options.once || !process.stdout.isTTY) console.log(frame().join("\n"));
  else watch(frame, {
    output: process.stdout, lifecycle: process, schedule: setInterval, reportError: console.error,
    stop: () => process.kill(process.pid, "SIGSTOP"),
  });
}

main();
