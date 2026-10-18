#!/usr/bin/env node
const path = require('node:path');
const os = require('node:os');
const { loadConfig } = require('../adapters/config.cjs');
const { convertVideo } = require('../adapters/media/video-file-source.cjs');
const { validateRemote } = require('../adapters/remote-media.cjs');
const { readJson, readBytes, sha256, loadCase } = require('./perception-replay-input.cjs');

const HELP = `Préparer une vidéo sans modèle, transcription ni fournisseur.
Usage : node scripts/prepare-video-replay.cjs --file vidéo --out dossier-neuf
  --start-ms entier          Début source, relatif au début du fichier (obligatoire).
  --duration-ms entier       Durée demandée ; sinon tout le reste, sans répétition.
  --block-ms entier          Durée maximale des blocs (obligatoire, contrat /v1/segments).
  --frames entier            Images équidistantes par bloc (obligatoire).
  --jpeg-quality entier      Qualité ffmpeg de 2 à 31 (obligatoire).
  --config fichier           Configuration ffmpeg TVLens ; défaut .env, TVLENS_FFMPEG prioritaire.
  --validate --out dossier   Vérifier une préparation existante, sans ffmpeg ni inférence.
  --help                     Aide seule, sans effet.
Sorties distinctes : manifest.json pour le rejeu de perception ; blocks.json pour les corps
/v1/segments à rattacher par le transport soutenu. preparation.json porte l'état et les empreintes.
Exemple complet et limites : scripts/prepare-video-replay.md
`;
function check(value, code = 'CLI_INVALID') {
  if (!value) throw Object.assign(Error('Préparation vidéo refusée.'), { code: 'TVLENS_VIDEO_' + code });
}
const VALUES = { '--file': 'file', '--out': 'outputDir', '--config': 'configPath', '--start-ms': 'startMs',
  '--duration-ms': 'durationMs', '--block-ms': 'blockMs', '--frames': 'framesPerBlock', '--jpeg-quality': 'jpegQuality' };
function parse(args) {
  const options = {}, seen = new Set();
  for (let i = 0; i < args.length; i++) {
    const name = args[i];
    check(!seen.has(name));
    seen.add(name);
    if (name === '--validate') options.validate = true;
    else {
      check(VALUES[name] && args[i + 1] && !args[i + 1].startsWith('--'));
      options[VALUES[name]] = args[++i];
    }
  }
  check(options.outputDir);
  if (options.validate) check(seen.size === 2);
  else {
    check(options.file && options.startMs !== undefined && options.blockMs && options.framesPerBlock && options.jpegQuality);
    for (const field of ['startMs', 'durationMs', 'blockMs', 'framesPerBlock', 'jpegQuality']) {
      if (options[field] === undefined) continue;
      check(/^\d+$/.test(options[field]));
      options[field] = Number(options[field]);
    }
  }
  return options;
}
async function checkedJson(base, reference) {
  check(reference && typeof reference.path === 'string' && !path.isAbsolute(reference.path)
    && !reference.path.split(/[\\/]/).includes('..'), 'PREPARATION_INVALID');
  const file = await readJson(path.join(base, reference.path));
  check(file.sha256 === reference.sha256, 'HASH_MISMATCH');
  return file.value;
}
async function validatePreparation(outputDir) {
  const { value: state } = await readJson(path.join(outputDir, 'preparation.json'));
  check(state.version === 1 && state.complete === true, 'PREPARATION_INCOMPLETE');
  const manifest = await checkedJson(outputDir, state.manifest);
  const index = await checkedJson(outputDir, state.index);
  check(manifest.preparation?.complete === true && index.complete === true, 'PREPARATION_INCOMPLETE');
  check(Array.isArray(index.blocks) && index.blocks.length > 0 && index.blocks.length === manifest.cases?.length, 'PREPARATION_INVALID');
  let endMs = 0;
  for (const [sequence, entry] of index.blocks.entries()) {
    const body = await checkedJson(outputDir, entry.body);
    validateRemote(body);
    check(body.sequence === sequence && body.startMs === endMs, 'PREPARATION_INVALID');
    for (const output of entry.outputs) {
      // Les JPEG/WAV ne sont pas des JSON ; seule leur empreinte d'octets est comparée ici.
      check(typeof output.path === 'string' && !path.isAbsolute(output.path)
        && !output.path.split(/[\\/]/).includes('..'), 'PREPARATION_INVALID');
      check(sha256(await readBytes(path.join(outputDir, output.path))) === output.sha256, 'HASH_MISMATCH');
    }
    const item = manifest.cases[sequence];
    await loadCase(item, outputDir);
    check(item.startMs === body.startMs && item.endMs === body.endMs
      && item.provenance.sourceSha256 === state.source.sha256, 'PREPARATION_INVALID');
    endMs = body.endMs;
  }
  check(endMs === state.convertedDurationMs && endMs === state.plannedDurationMs, 'PREPARATION_INVALID');
  return state;
}
async function main(args, { stdout = process.stdout, stderr = process.stderr } = {}) {
  if (args.includes('--help')) {
    stdout.write(HELP);
    return 0;
  }
  const controller = new AbortController();
  const interrupt = () => controller.abort(Object.assign(Error('Préparation interrompue.'), { code: 'TVLENS_VIDEO_CANCELLED' }));
  process.on('SIGINT', interrupt);
  process.on('SIGTERM', interrupt);
  try {
    const options = parse(args);
    let state;
    if (options.validate) state = await validatePreparation(options.outputDir);
    else {
      const config = await loadConfig({ configPath: path.resolve(options.configPath || '.env'), userData: os.tmpdir(),
        safeStorage: { isEncryptionAvailable: () => false } });
      state = await convertVideo(options, { config, signal: controller.signal });
    }
    stdout.write(`Préparation complète : ${state.convertedDurationMs} ms ; manifest.json (perception), blocks.json (transport).\n`);
    return 0;
  } catch (error) {
    stderr.write(`Préparation refusée : ${error.code || 'TVLENS_VIDEO_PREPARATION_FAILED'}.\n`);
    return 1;
  } finally {
    process.removeListener('SIGINT', interrupt);
    process.removeListener('SIGTERM', interrupt);
  }
}
module.exports = { main, validatePreparation };
if (require.main === module) main(process.argv.slice(2)).then(code => { process.exitCode = code; });
