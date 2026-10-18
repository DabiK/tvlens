const { requireInput } = require('./perception-replay-input.cjs');

const HELP = `Valider ou rejouer des entrées de perception TVLens (aucun fournisseur par défaut).
Usage : node scripts/replay-local-perception.cjs --manifest fichier.json --out dossier-neuf --backend local|codex
  --validate                 Validation seule (mode par défaut, aucun agent).
  --execute                  Autoriser explicitement l'inférence ; --model obligatoire.
  --model nom                Modèle explicite pour le backend choisi.
  --url http://hôte:port      URL Ollama explicite, obligatoire avec --execute --backend local.
  --num-ctx entier            Fenêtre locale ; défaut fournisseur si absente.
  --keep-alive durée          Maintien Ollama ; défaut de l'agent si absent.
  --codex-binary chemin       Exécutable à transmettre à l'adaptateur Codex.
  --annotations fichier      Empreinte seule, acquise avant l'inférence pour G2.
  --help                     Afficher cette aide sans effet.
Format et exemples : scripts/perception-replay.md
`;
const VALUES = { '--manifest': 'manifestPath', '--out': 'outputDir', '--backend': 'backend', '--model': 'model',
  '--url': 'url', '--num-ctx': 'numCtx', '--keep-alive': 'keepAlive', '--annotations': 'annotationsPath', '--codex-binary': 'codexBinary' };
function parseArgs(args) {
  const options = {}, seen = new Set();
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    requireInput(!seen.has(arg), 'CLI_INVALID');
    seen.add(arg);
    if (arg === '--execute') options.execute = true;
    else if (arg === '--validate') options.validate = true;
    else {
      requireInput(VALUES[arg] && typeof args[i + 1] === 'string' && !args[i + 1].startsWith('--'), 'CLI_INVALID');
      options[VALUES[arg]] = args[++i];
    }
  }
  requireInput(!(options.execute && options.validate) && options.manifestPath && options.outputDir, 'CLI_INVALID');
  if (options.numCtx !== undefined) options.numCtx = Number(options.numCtx);
  return options;
}
async function main(args, runReplay, { stdout = process.stdout, stderr = process.stderr } = {}) {
  if (args.includes('--help')) {
    stdout.write(HELP);
    return 0;
  }
  const controller = new AbortController();
  const interrupt = () => controller.abort(Object.assign(Error('Campagne interrompue.'), { code: 'TVLENS_REPLAY_CANCELLED' }));
  process.on('SIGINT', interrupt);
  process.on('SIGTERM', interrupt);
  try {
    const report = await runReplay({ ...parseArgs(args), signal: controller.signal });
    stdout.write(`${report.mode} : ${report.runId} ; ${report.cases.length} cas ; complète : ${report.complete ? 'oui' : 'non'}.\n`);
    return report.complete && report.cases.every(item => ['validated', 'succeeded'].includes(item.status)) ? 0 : 1;
  } catch (error) {
    stderr.write(`Rejeu refusé : ${error.code || 'TVLENS_REPLAY_ERROR'}.\n`);
    return 1;
  } finally {
    process.removeListener('SIGINT', interrupt);
    process.removeListener('SIGTERM', interrupt);
  }
}
module.exports = { main };
