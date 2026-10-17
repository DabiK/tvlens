---
id: T246
titre: Capture the Mac system audio on recent macOS and warn when no sound is captured
statut: a-faire
bloque_par:
adr: oui
installe: non
harnais: non
supprime_tests: non
niveau: sensible
---

## Ce que le ticket livre

Sur Mac, l'app capte de nouveau le son du système sous macOS 14.2 et plus. Quand une capture démarre sans son, ou
reste en silence numérique, la fenêtre le dit de façon visible et durable, avec la marche à suivre, au lieu
d'enregistrer des passages sans paroles en silence.

## Sources

- Constat du 17/10 sur le Mac du propriétaire : macOS 26.3, Electron 44.4.5. La session `29d85bd9` compte 46 passages,
  dont aucun avec paroles. Ses clips ne contiennent qu'une piste vidéo (`ffprobe` : `vp8,video`). Les sessions Mac du
  29/09 avaient des paroles avec le même code et la même version d'Electron.
- Même app relancée avec l'option Chromium `--disable-features=MacCatapLoopbackAudioForScreenShare` : les clips
  contiennent `opus,audio` (volume moyen −23 dB, pointes −5 dB), et 7 passages sur 7 sont transcrits.
- Documentation d'Electron, changements cassants 39.0 : depuis Electron 39, sous macOS 14.2 et plus, Chromium capte le
  son du système par l'API CoreAudio Tap. Sans la permission correspondante, `desktopCapturer` fournit un flux audio
  mort, sans erreur ni avertissement. Le contournement documenté est
  `app.commandLine.appendSwitch('disable-features', 'MacCatapLoopbackAudioForScreenShare')`, valable d'Electron 39 à
  44 seulement : l'option est retirée en amont à partir d'Electron 45.
- L'`Info.plist` de l'Electron de développement contient déjà `NSAudioCaptureUsageDescription`, et le paquet en ajoute
  une (`scripts/package.mjs:7-9`) : la clé seule ne suffit donc pas sur ce Mac. L'app empaquetée n'a pas été essayée.
- Code vérifié à `5e3f479` :
  - `app/main.cjs:23` importe `app` ; `:60` pose le verrou d'instance unique ; `:62` attend `whenReady` ;
    `:546-549` répond à `getDisplayMedia` avec `audio: 'loopback'` ;
  - `app/ui/capture-controller.mjs:296-298` demande `getDisplayMedia({ audio: true })` ; `:307-315` affiche
    seulement le statut passager « Aperçu actif · Sans piste audio » quand aucune piste audio n'est vivante, puis la
    capture continue ; `:322-340` branche le worklet audio.

## Périmètre

- Dans `app/main.cjs`, avant `whenReady`, sur macOS seulement, ajouter l'option
  `disable-features=MacCatapLoopbackAudioForScreenShare`, avec un commentaire qui dit pourquoi et jusqu'à quelle version
  d'Electron elle vaut. Si une autre option `disable-features` est déjà posée, fusionner les deux valeurs.
- Dans `app/ui/capture-controller.mjs` et la vue qui affiche l'état de capture : quand la capture démarre sans piste
  audio vivante, ou quand le worklet ne reçoit que du silence numérique pendant 10 secondes de capture, afficher un
  avertissement durable (« Le son n'est pas capté : vérifie la permission d'enregistrement de l'écran et de l'audio du
  système, puis relance l'app »), qui reste tant que la condition dure. Le statut passager actuel ne suffit pas.
- Les seuils (10 secondes, niveau du silence numérique) sont nommés.
- ADR court : le contournement, sa limite à Electron 44, et ce qu'il faudra faire avant de passer à Electron 45
  (accorder et vérifier la permission CoreAudio Tap, ou une autre voie de capture).
- À ne pas toucher : la capture TV et le serveur (le son de la TV passe par le producteur Python et fonctionne), la
  version d'Electron, `scripts/package.mjs`.

## Critères d'acceptation

1. Un test du processus principal (par la couture de T195) prouve que l'option est ajoutée sur macOS avant
   `whenReady`, fusionnée avec une valeur existante, et absente sur les autres plateformes.
2. Un test du contrôleur de capture, avec un flux simulé sans piste audio, prouve que l'avertissement durable apparaît et
   reste ; avec une piste qui ne livre que du silence pendant 10 secondes (horloge injectée), il apparaît aussi ; avec
   du son, il n'apparaît pas, et il disparaît quand le son revient.
3. `node scripts/check.mjs` est vert.

## Test d'acceptation attendu

`tests/` : un test du contrôleur de capture, avec flux, worklet et horloge simulés, qui fait apparaître puis disparaître
l'avertissement ; un test de la couture du processus principal pour l'option de démarrage.

## Hypothèses bloquantes

Aucune décision n'est attendue.

Après l'intégration, l'orchestrateur vérifie en réel sur le Mac, sans l'option en ligne de commande, qu'un clip de
capture contient une piste audio non muette et que les passages sont transcrits, puis il l'écrit dans le journal.
L'app empaquetée n'a pas été essayée : si elle se comporte autrement, ce ticket le dit et ne la modifie pas.

## Journal
