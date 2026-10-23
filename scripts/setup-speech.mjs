import systemPaths from '../adapters/system-paths.cjs';
import catalog from '../adapters/whisper-model-catalog.cjs';
import download from '../adapters/speech-model-download.cjs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
if (args.length > 1) throw Error('Usage : npm run setup:speech -- [modèle | --list]');
if (args[0] === '--list') {
  for (const model of catalog.WHISPER_MODELS) {
    console.log(`${model.id}\t${Math.ceil(model.bytes / 1024 ** 2)} Mio\t${model.englishOnly ? 'anglais uniquement' : 'multilingue'}`);
  }
} else {
  const selected = catalog.whisperModel(args[0]);
  const destination = path.resolve(process.env.TVLENS_WHISPER_MODEL
    || fileURLToPath(new URL(`../.local/models/${selected.filename}`, import.meta.url)));
  const binary = systemPaths.executable('whisper-cli', { override: process.env.TVLENS_WHISPER_BINARY });
  if (spawnSync(binary, ['--help'], { stdio: 'ignore' }).error) {
    if (process.platform !== 'darwin') throw Error('Installe whisper.cpp et ajoute whisper-cli au PATH. Voir docs/server-installation.md.');
    const result = spawnSync('brew', ['install', 'whisper-cpp'], {
      stdio: 'inherit', env: { ...process.env, HOMEBREW_NO_AUTO_UPDATE: '1' },
    });
    if (result.status !== 0) throw Error('Installe whisper.cpp avec Homebrew ou définis TVLENS_WHISPER_BINARY.');
  }
  console.log(`Préparation de ${selected.label} · ${Math.ceil(selected.bytes / 1024 ** 2)} Mio…`);
  await download.installSpeechModel(destination, { modelId: selected.id });
  console.log(`Modèle prêt : ${destination}`);
  console.log('Sélectionne ce fichier dans « Configurer ce Mac » ou renseigne TVLENS_WHISPER_MODEL dans .env.local.');
}
