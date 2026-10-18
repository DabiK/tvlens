const { requireInput: check } = require('./perception-replay-input.cjs');
const HELP = `Valider ou conduire un calendrier de captures et questions TVLens.
Usage : node scripts/replay-local-stream.cjs --scenario scénario.json --out dossier-neuf
  --validate          Validation seule, par défaut ; aucun fournisseur construit.
  --execute           Autorisation explicite d'exécution, hors boucle de tickets.
  --config fichier    Configuration des outils et secrets ; défaut .env (exécution seule).
  --help              Afficher cette aide sans lire de scénario ni créer de fournisseur.
Le scénario choisit explicitement perception, questions, embeddings et inspection.
Les sorties, données et corps envoyés sont conservés ; un dossier existant est refusé.
Formats, scénario de trente minutes et surcharge séparée : scripts/local-stream-replay.md
`;
function parse(args) {
  const options = {}, seen = new Set(), values = { '--scenario': 'scenarioPath', '--out': 'outputDir', '--config': 'configPath' };
  for (let i = 0; i < args.length; i++) {
    const name = args[i];
    check(!seen.has(name), 'CLI_INVALID');
    seen.add(name);
    if (name === '--execute') options.execute = true;
    else if (name === '--validate') options.validate = true;
    else {
      check(values[name] && args[i + 1] && !args[i + 1].startsWith('--'), 'CLI_INVALID');
      options[values[name]] = args[++i];
    }
  }
  check(options.scenarioPath && options.outputDir && !(options.execute && options.validate), 'CLI_INVALID');
  return options;
}
async function main(args, runReplay, { stdout = process.stdout, stderr = process.stderr } = {}) {
  if (args.includes('--help')) { stdout.write(HELP); return 0; }
  const controller = new AbortController();
  const interrupt = () => controller.abort(Object.assign(Error('Campagne interrompue.'), { code: 'TVLENS_REPLAY_CANCELLED' }));
  process.on('SIGINT', interrupt);
  process.on('SIGTERM', interrupt);
  try {
    const report = await runReplay({ ...parse(args), signal: controller.signal });
    const label = { validated: 'validé', complete: 'complet', incomplete: 'incomplet' }[report.status];
    stdout.write(`${report.mode} : ${report.runId} ; ${report.uploads.length} envois ; état : ${label}.\n`);
    return report.complete ? 0 : 1;
  } catch (error) {
    stderr.write(`Rejeu refusé : ${error.code || 'TVLENS_REPLAY_ERROR'}.\n`);
    return 1;
  } finally {
    process.removeListener('SIGINT', interrupt);
    process.removeListener('SIGTERM', interrupt);
  }
}
module.exports = { main };
