const path = require('node:path');
const { WHISPER_MODELS, whisperModel } = require('../adapters/whisper-model-catalog.cjs');
const { validateTranscriptionLanguage } = require('../core/transcription-language.cjs');

function checkLanguage(model, language) {
  validateTranscriptionLanguage(language);
  if (model?.englishOnly && language !== 'en') throw Object.assign(
    new Error('Ce modèle est réservé à l’anglais. Choisis Anglais ou un modèle multilingue.'),
    { code: 'TVLENS_SPEECH_MODEL_LANGUAGE' },
  );
  return language;
}

function createSpeechSetup({ userData, access, install, settings, config, save, resolvePaths, simulated }) {
  const destination = model => path.join(userData, 'models', model.filename);
  const selected = paths => WHISPER_MODELS.find(model => paths.whisperModel === destination(model));
  const language = () => settings().transcriptionLanguage || config().transcriptionLanguage || 'auto';
  async function status(paths) {
    const models = await Promise.all(WHISPER_MODELS.map(async model => ({
      id: model.id, label: model.label, detail: model.detail, bytes: model.bytes,
      englishOnly: model.englishOnly, quantization: model.quantization,
      present: !simulated && await access(destination(model), 'file'),
    })));
    return { models, selectedId: selected(paths)?.id, language: language() };
  }
  async function configure(name, value) {
    if (name === 'speech-language') {
      const model = selected(resolvePaths(config(), settings().paths));
      await save(settings().paths, false, checkLanguage(model, value?.language));
      return;
    }
    if (simulated) throw Object.assign(new Error('Téléchargement désactivé dans une exécution simulée.'), {
      code: 'TVLENS_SETUP_SIMULATED',
    });
    const model = whisperModel(value?.modelId);
    const nextLanguage = checkLanguage(model, value?.language || language());
    const file = await install(destination(model), { modelId: model.id });
    await save({ ...settings().paths, whisperModel: file }, false, nextLanguage);
  }
  return { status, configure };
}

module.exports = { createSpeechSetup };
