const TRANSCRIPTION_LANGUAGES = Object.freeze(['fr', 'en', 'auto']);
function validateTranscriptionLanguage(language) {
  if (!TRANSCRIPTION_LANGUAGES.includes(language)) throw Error('Langue de transcription invalide.');
  return language;
}
module.exports = { TRANSCRIPTION_LANGUAGES, validateTranscriptionLanguage };
