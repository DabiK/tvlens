---
id: T168
titre: Keep Mac capture resources inside one controller
statut: termine
bloque_par: T167
adr: non
installe: non
harnais: non
supprime_tests: non
niveau: sensible
---

## Ce que le ticket livre

Tous les chemins de capture de la fenêtre Mac utilisent la même instance du contrôleur livré par T167.
Le renderer ne possède plus les handles de capture ni les attentes de flush ; il commande l'aperçu,
l'observation, les checkpoints et la libération par une interface explicite. Un arrêt laisse le
contrôleur sans ressource de capture détenue.

## Sources

- `docs/audit-points-chauds.md`, section B « Découpage des trois gros fichiers », contraction Mac.
  Décision du propriétaire, le 15/10 : ouverture sélective après T150 et périmètre de cette file.
- Repères vérifiés à `e92c6a6`, avant l'extraction T167 :
  - `app/renderer.js:24` et `app/renderer.js:34` possèdent les handles et `flushes` ;
    `app/renderer.js:88` déduit les boutons de `recorder` et `stream` ;
  - `app/renderer.js:201` et `app/renderer.js:258` demandent l'arrêt silencieux lorsque l'hôte
    n'accepte plus ; `app/renderer.js:382` ne libère au déchargement que les pistes du stream ;
  - `app/renderer.js:411` arrête avant de changer de source ; `app/renderer.js:414` observe avec
    la source choisie ; `app/renderer.js:438` lance le choix flottant et `app/renderer.js:454`
    branche son bouton d'enregistrement ;
  - `app/renderer.js:493` confirme la reprise d'archive ; `app/renderer.js:500` choisit son chemin
    de capture et `app/renderer.js:520` interdit d'ouvrir une archive pendant l'aperçu ou l'enregistrement ;
  - `app/renderer.js:749` prend une image du moment et appelle le checkpoint ;
    `app/renderer.js:780`, `app/renderer.js:798` et `app/renderer.js:811` font de même pour
    expliquer, rattraper et garder l'attention, avec leurs ancres respectives ;
  - `app/recording.js:43` attend les ingestions au checkpoint ; `app/recording.js:81` arrête le
    recorder. `app/renderer.js:158` remet le recorder à `undefined` sur échec d'observation et
    appelle seulement l'arrêt hôte : le nettoyage complet des handles n'y est pas explicite ;
  - `tests/mac-ui.test.cjs:1025` vérifie encore un emplacement textuel de branchement ;
    `tests/mac-ui.test.cjs:1049` parcourt les modules renderer ;
    `tests/mac-ipc-contract.test.cjs:335` protège pause et reprise d'archive côté hôte.
- ADR 0002, 0004 et 0007 dans `docs/adr/` : conservation de l'intervalle, archivage et ordre de fermeture.
  L'ADR et les tests ajoutés par T167 sont à relire dans leur version livrée avant de commencer.

## Périmètre

- Achever `app/ui/capture-controller.mjs` et son câblage dans `app/renderer.js` : commandes plein
  écran et flottantes, choix de source, reprise confirmée d'archive, arrêts silencieux, checkpoints,
  prélèvement de l'image de moment et déchargement de page.
- Faire disparaître les propriétaires `stream`, `context`, `worklet`, `recorder`, `flushes` et la
  garde d'arrêt du renderer. Ils vivent dans le contrôleur ; la page ne reçoit que les états et
  opérations nécessaires. Les accès provisoires aux handles de T167 sont retirés.
- Centraliser le nettoyage des pistes, contexte, ports/callbacks audio et attentes de flush après
  arrêt ou échec partiel. Le contrôleur ne crée ni recorder ni minuterie après sa libération.
- Compléter `tests/capture-controller.test.cjs` et ajouter au besoin
  `tests/mac-capture-actions.test.cjs` pour le câblage des commandes avec une page minimale.
  Remplacer les assertions de placement touchées par des assertions sur les actions réellement appelées ;
  conserver les autres gardes de T016 et les scénarios de recorder de T021.
- Appliquer la décision de l’ADR créé par T167 : l'état cible est un seul propriétaire des ressources
  de capture et de leur libération, atteint en deux temps avec ce ticket. Citer son numéro livré
  dans le journal ; `adr: non`, aucun nouvel ADR ni révision de cette décision n’est demandé ici.
- Ne pas changer les messages IPC, la confirmation d'écriture d'archive, la politique de conservation,
  les ancres des actions, la numérotation des passages, les règles de silence ou le protocole de fermeture hôte.

## Critères d'acceptation

1. Un test de câblage déclenche l'observation directe, le bouton flottant et la reprise d'archive
   confirmée. Chaque chemin commande la même instance injectée du contrôleur ; une reprise refusée
   par l'utilisateur ne commande aucune capture. Le chemin flottant ne construit pas un second recorder.
2. Les quatre actions qui font un checkpoint passent par le contrôleur, avec l'ancre déjà figée pour
   moment, explication et rattrapage, et sans ancre inventée pour l'attention. Une ingestion différée
   empêche l'action dépendante de partir avant la fin du checkpoint ; le recorder est celui de la
   capture courante. Le prélèvement de miniature reste celui du même aperçu.
3. Les boutons et l'interdiction d'ouvrir une archive se calculent depuis le statut public du
   contrôleur. Le renderer n'arrête plus de piste, ne ferme plus de contexte, n'instancie plus de
   recorder et ne tient plus de table de flush. La commande
   `grep -nE "new RollingRecorder|getTracks\(|flushes|AudioWorkletNode" app/renderer.js`
   rend une sortie vide (code 1, aucune correspondance), consignée au journal. Les tests de câblage
   et les gardes d’imports/bridge complètent cette preuve de contraction.
4. Arrêt normal, arrêt silencieux demandé par l'état, fin de piste et échec partiel de démarrage
   convergent sur le même nettoyage. Les tests constatent un seul arrêt hôte, toutes les pistes
   arrêtées, le contexte fermé, l'aperçu détaché et aucun timer de flush restant. Un acquittement audio
   tardif ne relance rien et ne touche plus la page libérée.
5. Le déchargement de la page commande la libération par le contrôleur. Le test d'une libération
   répétée ne laisse ni callback audio actif ni ressource détenue. La partie asynchrone est testée
   par la promesse de libération ; le ticket ne promet pas qu'un navigateur attend cette promesse
   lorsqu'il ferme la page.
6. Une mutation qui contourne le contrôleur pour le checkpoint flottant ou l'une des actions rend son
   test de câblage rouge ; sortie au journal, puis mutation retirée. Les suites Mac concernées passent
   en séquentiel, puis `node scripts/check.mjs` est vert.

## Test d'acceptation attendu

`tests/mac-capture-actions.test.cjs` ou les cas de câblage équivalents de `tests/mac-ui.test.cjs`, frontière :
les actions de page avec un contrôleur injecté enregistrant ses appels. `tests/capture-controller.test.cjs`
vérifie ensuite les effets sur les vraies commandes publiques du contrôleur avec un recorder et des
ressources simulés. Aucun test ne se contente de chercher un appel dans le texte du renderer.

## Hypothèses bloquantes

Aucune décision n'est attendue.

T167 implique les prérequis Mac et T150. Les repères ci-dessus décrivent le code avant T167 ; ses
délégations et ses tests livrés sont le point de départ, sans reconstituer une seconde extraction.
Le code actuel ne garantit pas un nettoyage complet au déchargement ou dans tous les échecs d'observation :
les critères de libération sont à démontrer. Aucune garantie sur l'attente du navigateur à sa fermeture
n'est déduite de ces tests hors ligne.

## Journal

- Exploration : lectures du contrôleur livré, du renderer, recorder, tests et ADR 0002, 0004, 0007 et **0018**.
  Le témoin de hooks est présent ; état initial et direction conservés dans `.harness-state/tickets/T168/exploration.md`.
  Les deux répertoires non suivis présents au départ restent hors intervention. Écarts prévus consignés avant implémentation.

- Checkpoint : `node --test --test-name-pattern='checkpoints use' tests/capture-controller.test.cjs` :
  rouge observé sur l'appel absent, puis 1/1 vert après la commande publique (logs `checkpoint-red.log`, `checkpoint-green.log`).
  `node --test --test-name-pattern='a refused host opening' tests/capture-controller.test.cjs` : rouge sur
  l'aperçu conservé, puis 1/1 vert avec nettoyage partagé (`observation-red.log`, `observation-green.log`).
- Libération : `node --test --test-name-pattern='release is repeatable' tests/capture-controller.test.cjs` :
  rouge sur les ressources conservées ; `node --test tests/capture-controller.test.cjs` : 22/22 verts après correction.
  `node --test --test-name-pattern='release waits|release during|stop during' tests/capture-controller.test.cjs` :
  3 rouges sur les retours tardifs, puis suite du contrôleur à 25/25 verts (`pending-red.log`, `pending-green.log`).
  `node --test --test-name-pattern='moment snapshots' tests/capture-controller.test.cjs` : rouge sur l'image absente,
  puis suite à 26/26 verts. La miniature prélève le même élément vidéo détenu par le contrôleur.
- Câblage : `node --test tests/mac-capture-actions.test.cjs` : rouge sur l'observation non commandée, puis 1/1 vert.
  `node --test --test-name-pattern='existing anchor' tests/mac-capture-actions.test.cjs` : 5 rouges sur les checkpoints,
  puis suite à 7/7 verts, avec les trois ancres figées, aucune ancre pour l'attention et une promesse d'ingestion différée.
  `node --test --test-name-pattern='archive opening|host refusal' tests/mac-capture-actions.test.cjs` : 2 rouges,
  puis câblage, contrôleur et gardes Mac à 78/78 verts. Les assertions textuelles touchées sont remplacées par des
  appels sur une page minimale et un navigateur injecté ; les scans d'IDs sont étendus aux modules extraits.
- Contrôles intermédiaires : `node scripts/check.mjs --changed` a signalé 2 lignes de production et 1 ligne de test
  trop longues ; elles ont été formatées. Second passage vert, 78/78 tests ; aucun gel ni plancher modifié.
  Un contrôle rapide a aussi signalé une complexité de 16 pour l'arrêt ; l'annonce de pause a été extraite (limite 15).
- Preuves complémentaires : `node --test --test-name-pattern='a partially started|release returns the same' tests/capture-controller.test.cjs`
  sur le contrôleur de HEAD : 2 rouges sur assertions ; version de travail restaurée, puis suite à 28/28 verts.
  La fermeture du contexte est attendue par la promesse de libération ; pistes, port, source audio et worklet sont libérés.
- Mutations temporaires, chacune retirée : `node --test --test-name-pattern='moment dialog' tests/mac-capture-actions.test.cjs`,
  puis motifs `floating explanation`, `catch up`, `attention` : chaque contournement du checkpoint donne 1 échec sur
  l'appel attendu (`mutation-openMoment.log`, `mutation-explainNow.log`, `mutation-catchUp.log`, `mutation-markAttention.log`).
- Contraction : `grep -nE "new RollingRecorder|getTracks\(|flushes|AudioWorkletNode" app/renderer.js` : **sortie vide, code 1**
  (`renderer-contraction.log`). Le renderer ne possède plus d'accès provisoire aux handles ni de code de libération.
- `node --test --test-concurrency=1 tests/capture-controller.test.cjs tests/mac-capture-actions.test.cjs tests/mac-ui.test.cjs tests/mac-ipc-contract.test.cjs tests/recording.test.cjs tests/capture-sources.test.cjs tests/window-mode.test.cjs` :
  **113/113 verts**, en séquentiel (`mac-suites.log`). Les scénarios du recorder et les contrats IPC sont conservés.
- Complément avec le vrai `RollingRecorder` : `node --test --test-name-pattern='release prevents the real recorder' tests/capture-controller.test.cjs`
  a montré un rouge **2 enregistrements créés au lieu de 1** lors d'une rotation ancrée attendant l'audio.
  La libération rend maintenant le recorder inactif avant de résoudre ses flushes, puis attend les démarrages en cours
  avant l'arrêt hôte. Suite du contrôleur à 29/29 verts (`anchored-release-red.log`, `anchored-release-green.log`).
  `node --test --test-name-pattern='a late audio callback' tests/capture-controller.test.cjs` : rouge sur le niveau audio
  mis à jour après arrêt, puis 1/1 vert après garde sur la ressource encore courante (`late-audio-red.log`, `late-audio-green.log`).
- Après ces correctifs : `node scripts/check.mjs --changed` : **vert, 82/82 tests** (`check-changed-final.log`).
  La commande des sept suites Mac ci-dessus : **115/115 verts**, en séquentiel (`mac-suites-final.log`).
- Validation finale : `node scripts/check.mjs` : **vert**, règles, format, lint, gel et cliquet verts ;
  **1300/1300 tests JS** sur 105 fichiers, **33 tests Python, dont 1 ignoré**, sans échec (`check-full-final.log`).
  `git diff --check` : sortie vide, code 0. Aucun changement du harnais, du gel ESLint ni du plancher.
- Verdict : **TERMINÉ**, preuves et verdict dans `.harness-state/tickets/T168/verdict.json` ; relecture et intégration
  laissées à la boucle, sans commit ni push. Vérifications hors ligne : la capture native Mac n'est pas exercée et
  aucun test ne suppose que le navigateur attend la promesse de libération pendant sa fermeture.
- Reprise après `.harness-state/tickets/T168/relecture-1.md` : cinq constats à corriger acceptés, sans contestation.
  Témoin de reprise vérifié ; rapport, ticket, journal, écarts, état Git et diff relus. Direction consignée avant correction
  dans l'exploration et les écarts. La mise à jour de l'ADR 0018 reste une réserve hors périmètre (constat 6).
- Correction du constat 1 : `node --test --test-name-pattern='preview and stop buttons|changing the floating source' tests/mac-capture-actions.test.cjs` :
  **2/2 verts**. Les clics `start` et `stop` commandent le contrôleur injecté ; un refus de pause affiche sa notice.
  Le changement de source attend la fin de `stop` avant le mode complet et le focus. Suppressions temporaires des
  trois branchements et de la notice : **1 rouge sur assertion pour chacune des quatre mutations**, puis restauration
  (`correction-1-actions-green.log`, `correction-1-mutation-start-button.log`, `correction-1-mutation-stop-button.log`,
  `correction-1-mutation-stop-notice.log`, `correction-1-mutation-source-change.log`).
- Correction du constat 2 : `node --test --test-name-pattern='browser composition uses every' tests/mac-ui.test.cjs` :
  **1 rouge sur assertion**, puis **1/1 vert** après injection de l'environnement du vrai `RollingRecorder` par
  la composition navigateur. Aperçu avec audio vivant, worklet, flux audio, canvas du snapshot, UUID et minuteries
  sont observés avec leurs arguments ; acquittement et échéance du flush sont déclenchés sans temps réel.
  Les mutations retirant le nom du worklet, le délai, l'UUID ou le vrai recorder donnent chacune **1 rouge sur assertion**,
  puis sont retirées (`correction-1-browser-red.log`, `correction-1-browser-green.log`, `correction-1-mutation-browser-*.log`).
- Correction du constat 3 : le test ne passe plus `recording`, `previewOpen` ou `stopping` au premier niveau de la page.
  `node --test --test-name-pattern='the window applies all controls' tests/mac-ui.test.cjs` : **1/1 vert** ; chaque lecture
  mutée vers `input.recording`, `input.previewOpen` ou `input.stopping` donne **1 rouge sur assertion**, puis restauration
  (`correction-1-controls-green.log`, `correction-1-mutation-controls-*.log`). La production lit toujours le statut public.
- Correction du constat 4 : `node --test --test-name-pattern='shared capture cleanup' tests/capture-controller.test.cjs` :
  **4/4 verts**, pour arrêt normal, arrêt silencieux, fin de piste et démarrage partiel, chacun avec un flush en attente.
  Chaque cas constate un arrêt hôte, toutes les pistes arrêtées, le contexte fermé, l'aperçu détaché, le port neutralisé,
  les attentes résolues et zéro minuterie. Omettre les pistes, la fermeture du contexte ou le drainage des flushes
  donne **4 rouges sur assertions par mutation** ; toutes retirées (`correction-1-cleanup-green.log`, `correction-1-mutation-cleanup-*.log`).
- Correction du constat 5 : `node --test --test-name-pattern='release leaves an|release of an observation|release retries|release after a completed|release waits for a pending display' tests/capture-controller.test.cjs` :
  **4 rouges et 2 verts** avant correction. `release` limite désormais la pause hôte à la capture dont ce contrôleur
  a pris la charge, jusqu'à une pause réussie : aucune pause pour page vide, aperçu seul ou acquisition d'aperçu en cours,
  pas de deuxième pause après arrêt réussi ; ouverture d'observation attendue et refus d'arrêt réessayable.
  `node --test tests/capture-controller.test.cjs` : **39/39 verts** après correction (`correction-1-release-red.log`,
  `correction-1-release-green.log`). Les mutations de pause inconditionnelle, de pause omise et d'oubli après refus
  donnent respectivement **3, 2 et 1 rouges sur assertions**, puis sont retirées (`correction-1-mutation-release-*.log`).
  Le contrôle rapide a signalé une complexité de 16 pour l'arrêt ; le prédicat partagé de libération a été extrait,
  sans gel ajouté (`correction-1-lint-stop.log`). Aucun changement dans l'hôte ou son protocole de fermeture.
- Vérifications de correction : `node scripts/check.mjs --changed` : **vert, 94/94 tests** (`correction-1-check-changed-final.log`).
  `node --test --test-concurrency=1 tests/capture-controller.test.cjs tests/mac-capture-actions.test.cjs tests/mac-ui.test.cjs tests/mac-ipc-contract.test.cjs tests/recording.test.cjs tests/capture-sources.test.cjs tests/window-mode.test.cjs` :
  **127/127 verts**, en séquentiel (`correction-1-mac-suites.log`). Les dix-sept mutations de correction sont toutes
  retirées ; leurs sorties ont été vérifiées : échecs sur assertions, sans erreur de syntaxe ni d'import.
- Validation complète après correction : `node scripts/check.mjs` : **vert**, règles, format, lint, gel et cliquet verts,
  **1312/1312 tests JS** sur 105 fichiers ; **33 tests Python dont 1 ignoré**, sans échec (`correction-1-check-full.log`).
  `git diff --check` : sortie vide, code 0 ; grep du critère 3 : sortie vide, code 1 (`correction-1-diff-check.log`,
  `correction-1-renderer-contraction.log`).
- Nouveau verdict : **TERMINÉ**, cinq constats bloquants et mineurs corrigés ; constat 6 conservé dans `reste` :
  les mentions de `openCapture` et des anciennes délégations dans l'ADR 0018 restent hors périmètre, document intact.
  Verdict écrit dans `.harness-state/tickets/T168/verdict.json`, relecture laissée à la boucle. Vérifications hors ligne ;
  aucun essai de capture native ni garantie sur l'attente du navigateur au déchargement. Aucun commit ni push.
- Reprise après `.harness-state/tickets/T168/relecture-2.md` : constat mineur sur la preuve de soumission du passage accepté,
  sans contestation. Rapport, ticket et journal, écarts, état Git et diff relus ; témoin de reprise vérifié. Direction
  consignée avant correction : compléter le test de composition avec une durée utile et une vraie ingestion simulée.
  Le doublon de l'environnement par défaut du recorder et l'ADR 0018 restent des réserves hors périmètre.
- Correction après relecture 2 : le test existant de composition avance son horloge de 0 à 1000 ms après `observe`,
  émet un fragment vidéo simulé, puis termine le passage par `controller.checkpoint()` avec acquittement audio maîtrisé.
  Il vérifie un seul appel à `bridge.ingest` : session `session`, intervalle 0–1000 ms, images présentes, clip en
  `Uint8Array` contenant les octets du fragment, et construction par le `Blob` injecté avec le type `video/webm`.
  La libération arrête ensuite le recorder courant et n'ajoute aucune deuxième ingestion.
- `node --test --test-name-pattern='browser composition uses every' tests/mac-ui.test.cjs` : avec la ligne `ingest`
  remplacée temporairement par une fonction qui ignore le passage, **1 rouge sur assertion, 0 appel reçu au lieu de 1**
  (`correction-2-mutation-ingest.log`). Les mutations sans `Blob` injecté et avec une mauvaise route donnent aussi
  chacune **1 rouge sur assertion** (`correction-2-mutation-blob.log`, `correction-2-mutation-wrong-route.log`).
  Les trois mutations sont retirées ; même commande : **1/1 vert** (`correction-2-browser-green.log`).
  Aucun changement de production conservé dans cette correction.
- Vérifications de correction 2 : `node scripts/check.mjs --changed` : **vert, 94/94 tests** (`correction-2-check-changed.log`).
  `node --test --test-concurrency=1 tests/capture-controller.test.cjs tests/mac-capture-actions.test.cjs tests/mac-ui.test.cjs tests/mac-ipc-contract.test.cjs tests/recording.test.cjs tests/capture-sources.test.cjs tests/window-mode.test.cjs` :
  **127/127 verts**, en séquentiel (`correction-2-mac-suites.log`).
- Validation complète après correction 2 : `node scripts/check.mjs` : **vert**, règles, format, lint, gel et cliquet verts ;
  **1312/1312 tests JS** sur 105 fichiers, **33 tests Python dont 1 ignoré**, sans échec (`correction-2-check-full.log`).
  `git diff --check` : sortie vide, code 0 ; grep du critère 3 : sortie vide, code 1 (`correction-2-diff-check.log`,
  `correction-2-renderer-contraction.log`).
- Nouveau verdict : **TERMINÉ** ; le constat mineur de relecture 2 est corrigé. Les réserves sur l'environnement par
  défaut de `RollingRecorder` et sur les mentions de l'ADR 0018 sont conservées dans `reste`, sans modification de ces
  fichiers. Verdict écrit dans `.harness-state/tickets/T168/verdict.json` ; relecture laissée à la boucle. Vérifications
  hors ligne, sans garantie que le navigateur attende la libération au déchargement. Aucun commit ni push.

### Réserves à la clôture

- Relecture 2, constat 2 hors périmètre : l’environnement par défaut de RollingRecorder dans app/recording.js fait doublon avec la composition navigateur, notamment pour ingest. Ce fichier reste intact ; retrait ou alignement à traiter ultérieurement.
- Relecture 2, constat 3 hors périmètre : ADR 0018 cite encore openCapture parmi les commandes publiques et les anciennes délégations textuelles de mac-ui. Aucune révision d’ADR autorisée par ce ticket ; document laissé intact.
- Vérifications hors ligne : capture matérielle Mac et moment exact du départ IPC pendant un vrai déchargement Electron non exercés. La résolution de release est testée sans supposer que le navigateur attend sa promesse à la fermeture.
- .harness-state/tickets/T168/relecture-3.md : Nombre de constats discordant : CONSTATS annonce 2 hors périmètre ; 3 constat(s) extrait(s). Consulter le rapport pour l'ensemble des constats hors périmètre.
- .harness-state/tickets/T168/relecture-3.md : **Écart accepté, relecture 2** (`ecarts.md`, section « Relecture 2 ») : aucun critère n'est affaibli. Il complète le test de composition existant avec des dépendances de temps et de média simulées, et ne laisse aucun changement de production. C'est ce que montre l'interdiff.
