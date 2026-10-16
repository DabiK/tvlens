#!/usr/bin/env node
// Vue web de la boucle : le bureau des agents, le fil en direct de chaque session et les quêtes, dans le navigateur.
// Elle montre ce que `watch-loop.mjs` montre dans le terminal, en lecture seule de `.harness-state/` et des tickets,
// et n'écoute que sur 127.0.0.1.
//
//   node scripts/loop-web.mjs                     sert la vue sur http://127.0.0.1:4178
//   node scripts/loop-web.mjs --port 0            sur un port libre
//   node scripts/loop-web.mjs --root <dossier>    suit la boucle d'un autre projet (par défaut, celui du script)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createLoopWeb } from "./loop-web/server.mjs";

const HOST = "127.0.0.1";
const DEFAULT_PORT = 4178;
const MAX_PORT = 65535;
const USAGE = "Usage : node scripts/loop-web.mjs [--root <dossier>] [--port <numéro>]";

function parseArguments(argv) {
  const options = { root: path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."), port: DEFAULT_PORT, help: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--help" || argv[i] === "-h") options.help = true;
    else if (argv[i] === "--root" && argv[i + 1]) options.root = path.resolve(argv[++i]);
    else if (argv[i] === "--port" && /^\d+$/.test(argv[i + 1] ?? "") && Number(argv[i + 1]) <= MAX_PORT) options.port = Number(argv[++i]);
    else return { error: `Option inconnue ou incomplète : ${argv[i]}` };
  }
  return options;
}

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
    console.error(`Dossier introuvable : ${options.root}`);
    process.exit(1);
  }
  const server = createLoopWeb(options.root);
  server.on("error", (error) => {
    console.error(error.code === "EADDRINUSE" ? `Le port ${options.port} est déjà pris : essaie --port 0.` : error.message);
    process.exit(1);
  });
  server.listen(options.port, HOST, () => console.log(`Vue de la boucle : http://${HOST}:${server.address().port}`));
}

main();
