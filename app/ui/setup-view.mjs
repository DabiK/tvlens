const ITEMS = {
  codexBinary: ['Codex', 'Pour comprendre les images et répondre à tes questions.', 'brew install --cask codex'],
  codexAuthHome: ['Connexion Codex', 'Utilise ton compte Codex. Aucun mot de passe à saisir dans TVLens.'],
  whisperBinary: ['Transcription locale', 'Whisper transforme les paroles en texte sur ce Mac.', 'brew install whisper.cpp'],
  whisperModel: ['Modèle de transcription', 'Modèle multilingue base · environ 142 Mio.'],
  ffmpeg: ['Outils vidéo', 'FFmpeg permet de réexaminer les passages vidéo.', 'brew install ffmpeg'],
  screen: ['Écran et son du système', 'Autorise TVLens dans Confidentialité et sécurité → Enregistrement de l’écran et des sons du système.'],
};
const STATES = {
  ready: 'Vérifié', present: 'Fichier présent', missing: 'À installer', unavailable: 'À vérifier',
  timeout: 'Vérification expirée', denied: 'À autoriser', restricted: 'Accès restreint',
  'not-determined': 'Autorisation à donner', unknown: 'À vérifier',
};
const quote = value => "'" + String(value).replaceAll("'", "'\\''") + "'";

export function setupRows(report) {
  return report.checks.map(check => {
    const [title, detail, install] = ITEMS[check.id];
    const good = ['ready', 'present'].includes(check.state);
    const connection = check.id === 'codexAuthHome';
    const command = connection ? `CODEX_HOME=${quote(report.paths.codexAuthHome)} ${quote(report.paths.codexBinary)} login` : install;
    return { ...check, title, detail, good, path: report.paths[check.id], command,
      label: connection && !good ? 'Connexion à vérifier' : STATES[check.state] || 'À vérifier',
      required: ['codexBinary', 'codexAuthHome', 'screen'].includes(check.id),
    };
  });
}

export function setupSummary(report) {
  if (report.restartRequired) return 'Réglages enregistrés. Quitte TVLens, puis rouvre l’application depuis Applications.';
  if (report.ready) return 'Les prérequis sont vérifiés. Choisis ensuite une fenêtre et lance l’observation.';
  if (report.canFinish) return 'Les outils sont prêts. Tu peux continuer sans capture et autoriser l’écran plus tard dans Configurer ce Mac.';
  if (report.canObserve) return 'Tu peux observer les images. Les étapes restantes complètent la transcription et le réexamen vidéo.';
  return 'Termine les étapes indispensables pour lancer l’observation. Tu peux aussi explorer l’application maintenant.';
}
