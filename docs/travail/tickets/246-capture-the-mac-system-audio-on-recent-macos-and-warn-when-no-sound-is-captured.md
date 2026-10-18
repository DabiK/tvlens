---
id: T246
titre: Capture the Mac system audio on recent macOS and warn when no sound is captured
statut: termine
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

- Exploration : règles, skill et ADR 0018/0043 lus ; couture du vrai hôte et contrôleur injecté retenus.
  Documentation Electron confirmée via Context7. Plan et ajustements consignés dans
  `.harness-state/tickets/T246/exploration.md` et `ecarts.md`. Les trois changements initiaux sont préservés.
- Option de démarrage :
  `node --test --test-name-pattern='Mac system audio fallback' tests/mac-ipc-contract.test.cjs` :
  rouge observé sur l'option absente, puis vert (macOS, fusion, absence de doublon, Linux et Windows).
  Sorties : `startup-red.log`, `startup-green.log` dans le dossier d'état.
- Avertissement sans piste :
  `node --test --test-name-pattern='missing live audio keeps' tests/capture-controller.test.cjs` :
  rouge sur l'absence de bannière, puis vert avec contrôleur et vue des commandes réels.
  Sorties : `missing-audio-red.log`, `missing-audio-green.log`.
- Silence numérique et retour du son :
  `node --test --test-name-pattern='ten seconds of digital silence' tests/capture-controller.test.cjs` :
  rouge à dix secondes, puis vert avec horloge injectée, persistance, son faible et réarmement.
  Sorties : `silence-red.log`, `silence-green.log`.
- Fin de piste :
  `node --test --test-name-pattern='ending the live audio track warns' tests/capture-controller.test.cjs` :
  rouge sur l'avertissement absent, puis vert ; des échantillons restants ne masquent pas la perte de piste.
  Sorties : `ended-audio-red.log`, `ended-audio-green.log`.
- Capture conservée après refus d'arrêt :
  `node --test --test-name-pattern='a retained capture still warns' tests/capture-controller.test.cjs` :
  rouge sur le délai perdu, puis vert sans échantillon du worklet et avec fin de piste ultérieure.
  Sorties : `retained-capture-red.log`, `retained-capture-green.log`.
- `node scripts/check.mjs --changed` : vert, 75 tests réussis (`check-changed-1.log`).
  ADR 0049 rédigé. Essais matériels Mac et paquet non lancés ; vérification réelle réservée à l'orchestrateur
  après intégration, comme prévu dans le ticket.
- Premier contrôle complet : `node scripts/check.mjs` rouge (`check-full-1.log`) : 2440/2457 tests JS réussis,
  47 tests Python réussis. Diagnostic ciblé dans `integration-red.log` : deux doublures Electron sans
  `commandLine`, contrat de minuteries du banc de latence à conserver, attente du timer audio à ajouter dans
  la composition navigateur, et lien de l'ADR manquant dans l'index des décisions. Aucun échec écarté.
- Corrections de raccordement : doublures Electron complétées sans changer leurs assertions ; le suivi audio
  dérive par défaut des minuteries déjà injectées, sans modifier le banc de latence ; le test navigateur attend
  aussi la minuterie audio et conserve ses preuves de libération. ADR 0049 indexé dans `docs/architecture.md`.
  `node --test --test-concurrency=1 --test-name-pattern='Mac host revokes the external|Mac host .IPC.|fresh offline|published documentation indexes|browser composition uses every' tests/architecture-f05.test.cjs tests/architecture-f07.test.cjs tests/capture-display-latency.test.cjs tests/documentation-index.test.cjs tests/mac-ui.test.cjs`
  passe : 13/13, sortie `integration-green.log`.
- Son pendant un arrêt ensuite refusé :
  `node --test --test-name-pattern='sound received while a stop is pending' tests/capture-controller.test.cjs` :
  rouge sur le délai perdu, puis vert ; la libération forcée supprime aussi cette attente.
  Sorties : `pending-stop-red.log`, `pending-stop-green.log`.
- Validation finale : `node scripts/check.mjs --changed` vert, 170/170 tests JS (`check-changed-2.log`),
  puis `node scripts/check.mjs` vert, 2458/2458 tests JS sur 137 fichiers et 47 tests Python
  (`check-full-2.log`). Règles, format, lint, gel du lint et cliquet verts ; `git diff --check` sans erreur.
  Aucun changement du harnais ni du plancher, aucun commit ni push. Verdict `TERMINÉ` dans le dossier d'état,
  prêt pour la relecture de la boucle. La preuve matérielle Mac attend l'intégration ; l'app empaquetée n'a pas été essayée.

### Réserves à la clôture

- Comme prévu au ticket, l'orchestrateur doit vérifier après intégration une piste audio non muette et les transcriptions sur le Mac réel, sans option en ligne de commande. L'app empaquetée n'a pas été essayée.
