const { check } = require('./perception-replay-scoring-input.cjs');

const HELP = `Noter une revue humaine du rejeu TVLens, entièrement hors ligne.
Usage : node scripts/score-perception-replay.cjs --manifest corpus.json --annotations attendus.json
  --report campaign.json --review revue.json
  --validate                      Valider les identités et la grille, sans publier de score.
  --reference-report fichier       Comparer à ce rapport, avec sa revue propre obligatoire.
  --reference-review fichier        Revue du rapport de référence.
  --reference-manifest fichier      Corpus de référence (défaut : --manifest).
  --reference-annotations fichier   Attendus de référence (défaut : --annotations).
  --help                          Aide sans lecture de fichier.
La sortie JSON va sur stdout ; les fichiers fournis restent intacts.
Schéma, préparation et exemple fictif : scripts/perception-replay-scoring.md
`;
const VALUES = { '--manifest': 'manifestPath', '--annotations': 'annotationsPath', '--report': 'reportPath', '--review': 'reviewPath',
  '--reference-report': 'referenceReport', '--reference-review': 'referenceReview',
  '--reference-manifest': 'referenceManifest', '--reference-annotations': 'referenceAnnotations' };
function parseArgs(args) {
  const options = {}, seen = new Set();
  const valid = condition => check(condition, 'CLI_INVALID');
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    valid(!seen.has(arg));
    seen.add(arg);
    if (arg === '--validate') options.validate = true;
    else {
      valid(VALUES[arg] && typeof args[index + 1] === 'string' && !args[index + 1].startsWith('--'));
      options[VALUES[arg]] = args[++index];
    }
  }
  valid(options.manifestPath && options.annotationsPath && options.reportPath && options.reviewPath);
  if (Object.keys(options).some(key => key.startsWith('reference'))) valid(options.referenceReport && options.referenceReview);
  return options;
}
async function main(args, api, { stdout = process.stdout, stderr = process.stderr } = {}) {
  if (args.includes('--help')) {
    stdout.write(HELP);
    return 0;
  }
  try {
    const options = parseArgs(args);
    let result;
    if (options.referenceReport) {
      result = await api.compareReplays({ candidate: options, reference: {
        manifestPath: options.referenceManifest || options.manifestPath,
        annotationsPath: options.referenceAnnotations || options.annotationsPath,
        reportPath: options.referenceReport, reviewPath: options.referenceReview,
      } });
      if (options.validate) result = { valid: true, candidate: result.candidate.identity, reference: result.reference.identity };
    } else {
      result = await api.scoreReplay(options);
      if (options.validate) result = { valid: true, identity: result.identity };
    }
    stdout.write(JSON.stringify(result, null, 2) + '\n');
    return 0;
  } catch (error) {
    stderr.write(`Notation refusée : ${error.code || 'TVLENS_SCORING_ERROR'}.\n`);
    return 1;
  }
}
module.exports = { main };
