Tu es relecteur technique, en lecture seule, sur le dépôt TVLens (app Electron Mac qui capte une fenêtre ou un
écran et son son système). Réponds en français, une page au plus, sans modifier aucun fichier.

## Problème

Sur le Mac du propriétaire (macOS 26.3, Apple Silicon, Electron 44.4.5), le son système n'est capté que dans une
des deux voies audio de Chromium, et laquelle dépend de qui lance l'app. Le propriétaire veut du son quel que soit
le mode de lancement : app ouverte par macOS (Finder, Dock, `open -n`) ou lancée depuis un terminal (`npm start`,
binaire Electron lancé par un shell ou par un agent).

Mesures du 22/10 (sonde `getDisplayMedia` sur un écran avec `audio: 'loopback'`, deux sons système joués) :

| Qui lance l'app | ScreenCaptureKit (`--disable-features=MacCatapLoopbackAudioForScreenShare`) | CoreAudio Tap (défaut Electron 39+) |
| --- | --- | --- |
| macOS (`open -n Electron.app`) | piste `ended`, aucun son (2 essais) | piste `live`, son capté |
| un terminal (shell de Claude Code, app « claude » autorisée) | piste `live`, son capté | piste `ended`, aucun son |

La permission écran vaut `granted` dans les cinq essais. Réglages Système : « Electron » (bundle) activé dans
Enregistrement de l'écran et des sons du système, une seconde entrée « Electron » (icône d'exécutable nu)
désactivée, « claude » activé, « Terminal » désactivé, « TVLens » (app empaquetée, `dev.tvlens.capture`, signature
ad hoc) activé dans les deux listes (écran + sons du système uniquement). L'`Info.plist` d'Electron contient
`NSAudioCaptureUsageDescription` ; celui de l'app « claude » n'a pas été lu.

Historique : le 29/09, Tap captait le son. Le 17/10, depuis un terminal, Tap ne captait rien et ScreenCaptureKit
captait : l'ADR 0049 a alors désactivé Tap pour tous les lancements. Aujourd'hui, l'app ouverte par macOS n'a plus
de son.

## À lire

- `experiments/essais/2026-10-22-son-capture-mac/README.md` et ses scripts (`scripts/`) et bruts (`bruts/`)
- `docs/adr/0049-la-capture-mac-utilise-le-repli-screen-capture-kit-et-signale-le-silence.md`
- `docs/travail/tickets/246-capture-the-mac-system-audio-on-recent-macos-and-warn-when-no-sound-is-captured.md`
- `app/main.cjs` (bloc `MacCatapLoopbackAudioForScreenShare` vers la ligne 48, `setDisplayMediaRequestHandler`
  vers la ligne 591), `app/ui/capture-controller.mjs`, `scripts/package.mjs`, `scripts/open-mac.mjs`,
  `scripts/smoke-electron.mjs`, `package.json`

## Questions

1. Ton explication du tableau : pourquoi la voie qui marche s'inverse selon l'app que macOS tient pour
   responsable (TCC, `kTCCServiceScreenCapture` contre `kTCCServiceAudioCapture`, clé `NSAudioCaptureUsageDescription`
   de l'app responsable) ? Qu'est-ce qui reste une hypothèse, et quel essai simple la trancherait ?
2. Les options pour avoir du son dans les deux modes, classées de la plus simple et la plus sûre à la moins sûre.
   Pense au moins à : choisir la voie au démarrage selon le lancement (et comment détecter le lancement de façon
   fiable : `process.ppid === 1`, variable d'environnement, autre) ; se relancer par LaunchServices (`open -n`,
   `app.relaunch()` sur macOS : passe-t-il par LaunchServices ?) quand on est lancé depuis un terminal ; accorder la
   permission audio au terminal ; autre voie de capture. Pour chacune : ce qui casse (logs dans le terminal, tests
   `scripts/smoke-electron.mjs`, agents), et ce qu'elle devient avec Electron 45, qui retire l'option.
3. Ta recommandation, et le plan de vérification réelle minimal avant de remplacer l'ADR 0049 (combien d'essais,
   sur quoi, quels critères : piste `opus` dans les clips, passages transcrits).

Signale toute erreur de lecture ou de chiffre dans ce brief.
