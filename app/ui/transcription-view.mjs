const CAUSES = {
  TVLENS_WHISPER_MODEL_MISSING: 'modèle introuvable',
  TVLENS_WHISPER_BINARY_MISSING: 'binaire introuvable',
  TVLENS_WHISPER_FAILED: 'échec de Whisper',
};

export function renderTranscriptionWarning(get, state) {
  const failed = state?.available === false;
  const text = failed
    ? `Transcription locale indisponible : ${CAUSES[state.code] || 'cause inconnue'}. Vérifie Whisper et son modèle, puis réessaie.`
    : '';
  const banner = get('transcription-warning');
  banner.hidden = !failed;
  banner.dataset.code = failed ? state.code || '' : '';
  if (banner.textContent !== text) banner.textContent = text;
  const compact = get('float-transcription-warning');
  compact.hidden = !failed;
  compact.title = text;
  get('float-bar').classList.toggle('transcription-missing', failed);
}
