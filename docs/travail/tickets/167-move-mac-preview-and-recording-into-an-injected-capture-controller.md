---
id: T167
titre: Move Mac preview and recording into an injected capture controller
statut: a-faire
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
