---
id: T167
titre: Move Mac preview and recording into an injected capture controller
statut: termine
bloque_par: T016, T021, T129
adr: oui
installe: non
harnais: non
supprime_tests: non
niveau: sensible
---

## Ce que le ticket livre

L'aperçu, le branchement audio, le démarrage de l'enregistrement et son arrêt passent par un contrôleur
injecté, importable sans démarrer la fenêtre Mac. Ses tests conduisent les opérations de capture avec
un faux navigateur et un faux bridge. Le renderer garde provisoirement ses petites fonctions de
délégation ; la migration des autres commandes et la fermeture de l'accès aux ressources suivent dans T168.

## Sources

- `docs/audit-points-chauds.md`, section B « Découpage des trois gros fichiers », renderer.
  Décision du propriétaire, le 15/10 : ouverture sélective après T150 et périmètre de cette file.
- Code vérifié à `e92c6a6`, renderer, enregistreur, worklet, preload et tests protecteurs lus en entier :
  - `app/renderer.js:24` détient `stream`, `context`, `worklet`, `recorder`, et `app/renderer.js:34`
    la table `flushes` ; `app/renderer.js:101` démarre l'aperçu et branche l'audio ;
  - `app/renderer.js:129` gère le flush audio avec UUID, réponse du worklet et délai de 500 ms ;
    `app/renderer.js:138` choisit démarrage ou reprise explicite d'archive ;
  - `app/renderer.js:144` construit `RollingRecorder` et `app/renderer.js:160` orchestre
    `recorder.stop()`, `bridge.stop()`, arrêt des pistes et fermeture audio, avec garde `stopping` ;
  - `app/recording.js:14` définit l'interface du recorder ; `app/recording.js:43` attend la rotation
    et les ingestions au checkpoint ; `app/recording.js:81` arrête sans redémarrage ;
    `app/audio-worklet.js:1` définit le processor PCM ;
  - `app/preload.cjs:14` expose le choix des sources ; `app/preload.cjs:63` expose démarrage,
    ingestion et arrêt. Le contrôleur de sources natif n'est pas le contrôleur navigateur à extraire ;
  - `tests/recording.test.cjs:32` réécrit encore le source du recorder ; ses six scénarios commencent
    à `tests/recording.test.cjs:41`. T021 doit avoir remplacé ce montage avant l'extraction ;
  - `tests/mac-ui.test.cjs:1025` contient une garde de branchement bornée par le texte de
    `startPreview` ; `tests/mac-ui.test.cjs:1049` inclut les modules `app/ui/` dans ses gardes ;
  - `tests/mac-ipc-contract.test.cjs:15` exclut explicitement renderer et capture de son banc hôte.
- Contrats à respecter : ADR 0002 (archivage confirmé), 0003 (publication avant sauvegarde),
  0004 (intervalle de l'action) et 0007 (fermeture partagée et arrêt de capture propre au Mac), dans `docs/adr/`.

## Périmètre

- Créer `app/ui/capture-controller.mjs`, avec une fabrique recevant le bridge hôte, le choix de source,
  les API navigateur nécessaires, une fabrique de recorder, les minuteries/UUID et les callbacks de
  présentation. Aucune dépendance à la page, au navigateur ou au bridge n'est lue au chargement du module.
- Déplacer `startPreview`, `flushAudio`, `openCapture`, `observe` et `stop`, y compris les messages du
  worklet et le callback de fin de piste. La composition du renderer injecte `RollingRecorder`,
  les API réelles et les éléments ou callbacks nécessaires à l'aperçu et au vumètre.
- Garder les délégations du renderer utiles à ses appelants actuels et des lectures de statut pour
  les boutons. Les commandes flottantes, archives et checkpoints restent à migrer complètement en T168 ;
  elles ne créent pas une seconde instance de contrôleur.
- Créer `tests/capture-controller.test.cjs` en important le vrai module. Remplacer la garde de placement
  touchée de `tests/mac-ui.test.cjs` par la preuve du branchement correspondant, sans réduire les
  assertions de contrôle, d'imports, d'IDs ou de bridge apportées par T016.
- Écrire un ADR au premier numéro libre sur l'interface injectée et l'état cible : un seul
  propriétaire des ressources de capture et de leur libération. Il décrit la migration en deux
  temps, extraction et délégations provisoires ici, puis fermeture de tous les accès dans T168.
- Ne pas déplacer les IPC de `app/main.cjs`, modifier le protocole du preload, les règles de
  `RollingRecorder`, le format des passages, la réception d'état corrigée par T129 ou les vues de chat.

## Critères d'acceptation

1. Le module s'importe sous Node sans `window`, `document`, `navigator` ni Electron. Un test par son
   interface publique démarre l'aperçu, vérifie la sélection de source puis `getDisplayMedia`, branche
   l'audio lorsqu'une piste vivante existe et démarre exactement un recorder après l'ouverture hôte.
   Le cas sans piste audio ne crée pas de contexte audio et permet toujours la capture vidéo.
2. Le test d'arrêt utilise un recorder dont l'arrêt reste différé : `bridge.stop()` attend cet arrêt,
   puis les pistes sont arrêtées et le contexte fermé. Deux demandes d'arrêt simultanées n'exécutent
   cette séquence qu'une fois ; la fin de piste passe par cette même opération.
3. Un refus de `getDisplayMedia` ou un échec du branchement audio est exposé au callback d'erreur et
   libère les ressources déjà acquises. Les tests contrôlent les promesses et vérifient pistes et
   fermeture audio sans sommeil réel. Le flush transmet les samples au recorder, résout l'ID attendu
   sur acquittement et se termine aussi à son délai injecté, sans timer restant après résolution.
4. L'ouverture d'une archive appelle `resumeSession()` puis lit l'état ; si celui-ci accepte, elle
   utilise la session reprise, sinon elle suit le repli `start()` déjà présent. L'enregistrement direct
   garde son chemin `start()`. Les messages d'interface et le mode `quiet` de l'arrêt sont préservés.
5. Les six scénarios de `tests/recording.test.cjs`, après T021, restent verts sans changement de leurs
   assertions. Les tests de contrôles et de bridge Mac restent verts ; aucune garde n'est rendue vide
   par le déplacement de `startPreview`. Une mutation qui arrête l'hôte avant le recorder rend le test
   du critère 2 rouge ; sortie conservée au journal, puis mutation retirée.
6. Les tests du contrôleur, `tests/recording.test.cjs`, `tests/mac-ui.test.cjs` et
   `tests/mac-ipc-contract.test.cjs` passent en séquentiel, puis `node scripts/check.mjs` est vert.

## Test d'acceptation attendu

`tests/capture-controller.test.cjs`, frontière : fabrique et commandes publiques du vrai contrôleur.
Le banc injecte pistes, aperçu, contexte/worklet, recorder et bridge enregistrant leurs appels, avec
promesses différées et minuteries maîtrisées. Il prouve l'ordre et les effets visibles, sans charger le
renderer par réécriture du source ni lancer Electron.

## Hypothèses bloquantes

Aucune décision n'est attendue.

T016 protège les gardes déplacées, T021 fournit le vrai recorder importable et T129 sécurise la
réception des lectures d'état ; leurs dépendances ramènent à T150. Le nettoyage complet de tous les
points d'entrée est réservé à T168. Les API natives réelles n'ont pas été exercées pendant le découpage :
les tests demandés prouvent l'orchestration sous doublures, pas le fonctionnement matériel du Mac.

## Journal

- Exploration : consignes, code, appelants, tests et ADR lus ; plan et absence d'écart consignés dans `.harness-state/tickets/T167/`. Témoin de hooks vérifié. Les trois chemins déjà modifiés ou non suivis sont préservés.
- Tests d'abord : `node --test tests/capture-controller.test.cjs`, sorties conservées dans `.harness-state/tickets/T167/` : `red-preview.log` (1 assertion rouge), `green-preview.log` (1/1), `red-recording.log` (2 assertions rouges), `green-recording.log` (3/3), `red-stop.log` (2 assertions rouges), `green-stop.log` (5/5), `red-failures.log` (3 assertions rouges), `green-failures.log` (8/8), `red-flush-resume.log` (5 assertions rouges), `green-flush-resume.log` (12/12). Les derniers tests caractérisent aussi l'import sans navigateur et la fin de piste seule.
- Branchement : `node --test --test-name-pattern='window switches|window composes' tests/mac-ui.test.cjs` : deux assertions rouges avant composition (`red-wiring.log`), puis 2/2 vertes (`green-wiring.log`). Les assertions de contrôles, imports, IDs et bridge sont conservées ; leur borne de lecture ne dépend plus du code extrait de `startPreview`.
- Contrôle intermédiaire : `node scripts/check.mjs --changed` vert (`check-changed-first.log`), 57/57 tests, règles, format, lint, gel et cliquet verts. Une ligne devenue trop longue a été signalée par le contrôle rapide pendant l'édition et découpée avant ce passage.
- Mutation : `node --test --test-name-pattern="simultaneous stops" tests/capture-controller.test.cjs` avec `bridge.stop()` avancé avant le recorder : assertion rouge sur l'événement `host.stop` prématuré (`mutation-stop-order.log`). Mutation retirée, contenu du module restauré à l'identique.
- ADR 0018 rédigé : dépendances injectées, arrêt partagé et migration en deux temps ; les accès provisoires des checkpoints et du déchargement sont explicités.
- Acceptation : `node --test --test-concurrency=1 tests/capture-controller.test.cjs tests/recording.test.cjs tests/mac-ui.test.cjs tests/mac-ipc-contract.test.cjs` : 78/78 verts, dont les six scénarios du recorder sans changement d'assertions (`acceptance.log`). `git diff --check` vert. Aucun matériel Mac, Electron, TV, VPS ni fournisseur réel exercé.
- Mise en forme : `node_modules/.bin/prettier --write --ignore-path /dev/null app/ui/capture-controller.mjs tests/capture-controller.test.cjs` ; les lignes touchées du renderer ont aussi été découpées sans changer leur comportement.
- Contrôle complet : `node scripts/check.mjs` vert (`check-full.log`) : règles, format, lint, gel, cliquet, 104 fichiers JS / 1275 tests réussis ; Python : 33 tests, un ignoré, résultat OK. Après la dernière mise en forme, `node scripts/check.mjs --changed` vert (`check-changed-final.log`) : 57/57 tests et tous les contrôles verts. `git diff --check` vert ; recorder, preload, hôte et assertions de recording inchangés.
- Verdict : `TERMINÉ` écrit dans `.harness-state/tickets/T167/verdict.json`. Relecture et intégration laissées à la boucle ; aucun commit ni push.
- Reprise après relecture 1 : trois constats mineurs acceptés, sans contestation. Rapport, journal, écarts, statut et diff relus ; nouveau témoin de hooks vérifié. Choix consigné avant correction : retour à l'arrêt antérieur sur refus, libération forcée après échec d'aperçu, preuves du flush à la libération et de « Capture inactive ».
- Constat 1 : `node --test --test-name-pattern='refused recorder stop|refused host stop|audio setup failure' tests/capture-controller.test.cjs` : trois assertions rouges observées (`correction-1-red-stop-failures.log`). Après correction, `node --test tests/capture-controller.test.cjs` : 17/17 verts (`correction-1-green-stop-failures.log`). Les tests vérifient ressources conservées, erreur transmise, statut inchangé et nouvelle tentative aboutie ; l'échec audio libère tout même si l'hôte refuse. L'ADR explicite cette politique, et la garde de branchement vérifie la réactivation d'Arrêter par `preview(true)`.
- Constats 2 et 3 : tests de caractérisation ajoutés avant tout changement de ces comportements déjà présents. `node --test tests/capture-controller.test.cjs` : 19/19 verts (`correction-1-characterizations.log`). Un flush est lancé avant l'arrêt sans déclencher ni acquittement ni délai ; sa promesse est réglée et ses timers sont retirés. Un arrêt avec `session() === null` vérifie exactement « Capture inactive ».
- Sensibilité : `node --test --test-name-pattern='releasing preview completes' tests/capture-controller.test.cjs` avec résolution des flushes à la libération retirée : assertion rouge sur le timer restant (`correction-1-mutation-release-flush.log`). `node --test --test-name-pattern='without a loaded session' tests/capture-controller.test.cjs` avec texte remplacé : assertion rouge sur « Capture inactive » (`correction-1-mutation-inactive-message.log`). `node --test --test-name-pattern='simultaneous stops' tests/capture-controller.test.cjs` avec l'hôte arrêté avant le recorder : assertion rouge sur `host.stop` prématuré (`correction-1-mutation-stop-order.log`). Chaque mutation a été retirée avec restauration du module à l'identique.
- Contrôle des corrections : après mise en forme, `node scripts/check.mjs --changed` vert (`correction-1-check-changed.log`) : règles, format, lint, gel, cliquet et 62/62 tests. Les trois constats sont corrigés, sans affaiblir les assertions existantes.
- Acceptation des corrections : `node --test --test-concurrency=1 tests/capture-controller.test.cjs tests/recording.test.cjs tests/mac-ui.test.cjs tests/mac-ipc-contract.test.cjs` : 83/83 verts (`correction-1-acceptance.log`). `git diff --check` vert ; hôte, preload, recorder et assertions des six scénarios de recording inchangés.
- Contrôle complet après correction : `node scripts/check.mjs` vert (`correction-1-check-full.log`) : règles, format, lint, gel, cliquet ; 104 fichiers JS, 1280/1280 tests réussis ; Python OK, 33 tests dont un ignoré. Les API natives ne sont pas exercées, conformément au périmètre.
- Nouveau verdict `TERMINÉ` écrit dans `.harness-state/tickets/T167/verdict.json` : les trois constats mineurs sont traités et prouvés ; aucune réserve ni contestation. La relecture de correction reste à la boucle. Aucun commit ni push.
- Reprise après relecture 2 : constat mineur accepté. Rapport, journal, écarts, statut et diff relus ; témoin de hooks vérifié. La réactivation est conservée et sera décrite comme une nouveauté, utilisable par Arrêter après refus du recorder seulement. Après refus de l'hôte, le shell masque le bouton. Une caractérisation de la composition contrôleur/shell précède la correction documentaire ; aucun changement fonctionnel de production prévu.
- Preuve avant correction documentaire : `node --test --test-name-pattern='stop refusal re-enables' tests/capture-controller.test.cjs` : caractérisation verte avec le vrai contrôleur et le vrai `ViewingShell` (`correction-2-characterization.log`). Deux refus sont conduits : Arrêter est visible et activé après refus du recorder ; il est activé mais masqué après refus de l'hôte. Retirer la réactivation rend l'assertion `disabled` rouge (`correction-2-mutation-stop-reactivation.log`) ; forcer la visibilité dans le shell rend l'assertion `hidden` rouge (`correction-2-mutation-stop-visibility.log`). Mutations retirées, fichiers restaurés à l'identique.
- Commentaire, ADR 0018 et écarts alignés : l'enchaînement de libération reste celui de l'ancien renderer, mais la réactivation est nouvelle et son effet dépend du recorder encore détenu. Après refus de l'hôte, une nouvelle tentative passe par le contrôleur, la fin de piste ou le changement de source. `node scripts/check.mjs --changed` vert après ces dernières éditions (`correction-2-check-changed.log`) : tous les contrôles et 63/63 tests verts.
- Acceptation après correction : `node --test --test-concurrency=1 tests/capture-controller.test.cjs tests/recording.test.cjs tests/mac-ui.test.cjs tests/mac-ipc-contract.test.cjs` : 84/84 verts (`correction-2-acceptance.log`). Le shell, le modèle des contrôles, l'hôte, le preload, le recorder et les six tests de recording restent inchangés. `git diff --check` vert.
- Contrôle complet lancé après la dernière édition de code et de tests : `node scripts/check.mjs` vert (`correction-2-check-full.log`) : règles, format, lint, gel, cliquet, 104 fichiers JS / 1281 tests réussis ; Python OK, 33 tests dont un ignoré. Les preuves restent sous doublures, sans API natives du Mac.
- Nouveau verdict `TERMINÉ` écrit dans `.harness-state/tickets/T167/verdict.json`. Constat de relecture 2 corrigé, sans réserve ni contestation ; relecture et intégration laissées à la boucle. Aucun commit ni push.
