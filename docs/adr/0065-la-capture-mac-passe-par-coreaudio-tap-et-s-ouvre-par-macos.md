# 0065 — La capture Mac passe par CoreAudio Tap et s’ouvre toujours par macOS

- Date : 2026-10-22
- Essai : `experiments/essais/2026-10-22-son-capture-mac/`
- Statut : acceptée ; remplace l’ADR 0049 pour la voie audio, dont elle garde l’avertissement durable

## Contexte

L’ADR 0049 désactivait CoreAudio Tap (`MacCatapLoopbackAudioForScreenShare`) pour tous les lancements, sur la foi
d’un essai du 17/10 fait depuis un terminal. Le 22/10, l’app ouverte par macOS ne captait plus aucun son. Sur ce Mac
(macOS 26.3, Electron 44.4.5), la voie qui capte le son dépend de l’app que macOS tient pour responsable de l’accès
à l’écran et au son :

| Qui lance l’app | ScreenCaptureKit | CoreAudio Tap |
| --- | --- | --- |
| macOS (Finder, Dock, `open`) | piste terminée, aucun son | son capté |
| un terminal | son capté | piste terminée, aucun son |

Electron documente que Tap exige la permission audio et la clé `NSAudioCaptureUsageDescription` chez l’app
responsable. Lancée depuis un terminal, c’est le terminal, et l’`Info.plist` de « claude » n’a pas cette clé.
Electron 45 retire l’option qui permettait ScreenCaptureKit.

## Décision

L’hôte Mac ne pose plus aucune option `disable-features` : la capture passe par CoreAudio Tap, la voie par défaut
d’Electron. Une option posée explicitement en ligne de commande reste celle du lancement.

Avant de prendre le verrou d’instance unique, un lancement sur macOS dont le parent n’est pas launchd et qui ne porte
pas `--opened-by-launch-services` se rouvre par LaunchServices. `app/launch-services.cjs` construit la commande
`open -n` sur le même paquet, avec le dossier de l’app et la configuration rendus absolus, puisque `open` démarre
dans `/`, et avec cette marque, qui interdit une seconde réouverture. La sortie standard et les erreurs vont dans
`main.log`, dans le dossier de journaux de l’app. Le lancement d’origine dit où se trouvent les journaux, puis se
termine avec le statut d’`open`. `open` transmet l’environnement de l’appelant.

Une exécution simulée (`--smoke-test`) ne se rouvre jamais : ses scripts pilotent le processus et injectent leur son.
L’avertissement durable de l’ADR 0049 reste ; sa bannière ouvre les réglages Enregistrement de l’écran et des sons du
système.

## Alternatives écartées

- Garder ScreenCaptureKit : aucun son pour l’app ouverte par macOS, et l’option disparaît avec Electron 45.
- Choisir la voie au démarrage selon le lancement : heuristique, et sans objet dès Electron 45.
- Autoriser le son système à chaque terminal : il faut la clé dans chaque app responsable, et « claude » ne l’a pas.
- `app.relaunch()` : en Electron 44.4.5, il relance le processus sans passer par LaunchServices.
- Une capture native séparée : bien plus de code, d’empaquetage et de synchronisation.

## Conséquences

- Depuis un terminal, `npm start` rend la main aussitôt ; les journaux ne s’affichent plus dans le terminal.
- Un processus orphelin a aussi launchd pour parent ; un tel lancement reste où il est.
- Les permissions sont celles de l’app : « Electron » en développement, « TVLens » empaquetée. Sa signature est ad
  hoc, donc un nouveau paquet peut redemander la permission.
- Avant Electron 45, la voie audio ne change pas, mais la matrice de l’essai se refait.
- Vérifiée le 22/10 par cinq captures réelles d’une vidéo parlée : Electron de développement et app empaquetée,
  ouverts par macOS ou depuis un terminal, son présent et transcrit dans chaque passage. Les captures de fenêtre
  de l’app empaquetée et du lancement depuis un terminal n’ont pas été faites.

## Protégée par

- `tests/launch-services.test.cjs` : commande de réouverture, chemins absolus, journaux, et lancements gardés tels
  quels (ouverts par macOS, déjà rouverts, hors macOS).
- `tests/mac-ipc-contract.test.cjs` : vrai processus principal sous doublure Electron, aucune option ajoutée sur
  aucune plateforme, exécution simulée démarrée sur place.
- `tests/capture-controller.test.cjs` et `tests/mac-capture-actions.test.cjs` : avertissement durable et ouverture
  des réglages depuis sa bannière.
