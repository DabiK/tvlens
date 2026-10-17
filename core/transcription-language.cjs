const { domainError } = require('./shared/domain-error.cjs');
const TVLENS_TRANSCRIPTION_LANGUAGE_INVALID = 'TVLENS_TRANSCRIPTION_LANGUAGE_INVALID';
const TRANSCRIPTION_LANGUAGES = Object.freeze(['fr', 'en', 'auto']);
function validateTranscriptionLanguage(language) {
  if (!TRANSCRIPTION_LANGUAGES.includes(language))
    throw domainError(TVLENS_TRANSCRIPTION_LANGUAGE_INVALID, 'Langue de transcription invalide.');
  return language;
}
module.exports = { validateTranscriptionLanguage, TVLENS_TRANSCRIPTION_LANGUAGE_INVALID };
