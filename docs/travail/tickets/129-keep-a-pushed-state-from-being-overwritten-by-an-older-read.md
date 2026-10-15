---
id: T129
titre: Keep a pushed state from being overwritten by an older read in the Mac window
statut: termine
bloque_par: T055
adr: non
installe: non
harnais: non
supprime_tests: non
niveau: standard
---

## Ce que le ticket livre

La fenêtre Mac reçoit l'état des approfondissements et des vérifications de deux façons : poussé par
l'hôte (`onDeepState`, `onVerificationState`) et lu à la demande (`deepState()`, `verificationState()`).
Trois lectures appliquent leur réponse sans condition : les deux lectures initiales et celle de
`pullSession` à la réouverture d'une session. Si l'hôte pousse un état entre le départ et l'arrivée d'une
de ces lectures, la réponse plus ancienne l'écrase et la carte d'une question en cours peut disparaître ou
revenir à un état passé jusqu'à la poussée suivante. Après ce ticket, une règle pure de
`app/ui/freshness.mjs`, testée avec des promesses tenues par le test, écarte une lecture dépassée par une
poussée ou par une lecture plus récente, et la fenêtre l'applique à ces trois lectures. Une lecture que
rien n'a dépassée s'applique comme aujourd'hui.

## Sources

- Constats : UI-03 ; `docs/audit-points-chauds.md`, sections E et F (entrée T129), retenu par décision du propriétaire, le 15/10.
- Fiche : `docs/travail/fiches/interface-mac.md`, étape 3 (l'étape 4 reprend `refreshSessions`,
  `renderSaved` et la commande de surveillance).
- Code concerné, vérifié par lecture à la version `e92c6a6` :
  - `app/renderer.js`, abonnements `bridge.onVerificationState` (l.315) et `bridge.onDeepState` (l.317) :
    état poussé, appliqué tel quel.
  - `app/renderer.js`, lectures initiales `bridge.deepState().then(...)` (l.318) et
    `bridge.verificationState().then(...)` (l.319) : aucune garde.
  - `app/renderer.js`, `pullSession` (l.509-518) : `Promise.all([bridge.deepState(), …])` puis
    `deepState = deep` (l.514) sans garde. `pullSession` n'est appelée que par `openArchive` (l.523),
    après `await bridge.openSession(id)`. L'hôte pousse `deep:state` dans le gestionnaire
    `sessions:open` (`app/main.cjs:439`, avant de répondre à `openSession`) et aux publications d'un
    approfondissement (`DeepAsk.emit`, `core/deep-ask.cjs` l.26, relayé par le `onChange` de
    `createConversationRuntime` dans `app/main.cjs:156`, envoi l.159) : une question en cours peut donc pousser
    pendant la lecture. L'état de vérification est poussé par le `onChange` de la vérification
    (`app/main.cjs:228`, canal `verify:state`). Les lectures du pont invoquent les canaux correspondants
    (`app/preload.cjs:68`, `:73`), traités par les instantanés de `app/main.cjs:212` et `:233`.
  - Patron existant à reprendre : `commandSurveillance` (l.714-724) note `watchPushes` au départ et
    refuse une réponse « en restauration » dépassée par une poussée (l.717-720) ;
    `bridge.onSurveillance` incrémente `watchPushes` (l.746).
  - Les instantanés de l'hôte n'ont pas de numéro de révision : `DeepAsk.snapshot` (`core/deep-ask.cjs`,
    l.25) et `VerificationService.snapshot` (`core/verification.cjs`, l.15).
  - `DeepAsk.restore` (`core/deep-ask.cjs:45`) n'émet pas ; `sessions:open` pousse après restauration
    (`app/main.cjs:434`, `:439`). `VerificationService.verify` émet au départ puis après la sauvegarde
    d'archive (`core/verification.cjs:23`, `:51-52`). La causalité réelle des réponses et poussées n'a pas
    été exercée dans ce rafraîchissement : l'hypothèse à caractériser est nommée plus bas.
- Banc existant : `tests/mac-ui.test.cjs:10` importe les modules purs ; `:718` définit un `deferred`
  local, utilisé par `searchHarness` (`:725`). Les gardes de branchement passent déjà par `shape`
  (`:13`, `:704`). Il n'est pas nécessaire d'attendre l'extraction de bancs des tickets parqués.
- Aide partagée à livrer par T055 : `tests/helpers/wait.cjs`, `deferred()` rend
  `{ promise, resolve, reject }`. Ce fichier n'existe pas encore à cette version ; T055 implique T150.
- Le relecteur de l'audit précise qu'un simple « dernière demande gagne » ne suffit pas : il faut aussi
  écarter une lecture dépassée par une poussée, sur le modèle de `watchPushes`, ou un numéro de révision de
  l'hôte (décision 2 de la fiche ; ce ticket retient le compteur côté fenêtre, sans changer l'IPC).

## Périmètre

- À créer : `app/ui/freshness.mjs`, sans DOM ni pont. Il offre, pour une source d'état, de quoi noter une
  poussée, démarrer une lecture et savoir à son arrivée si elle est encore fraîche : écartée si une poussée
  a été notée depuis son départ, ou si une lecture plus récente de la même source est partie. La forme
  exacte (fabrique, classe, fonctions) est libre ; elle ne dépend ni du temps ni d'une minuterie.
- À modifier : `app/renderer.js` (les deux abonnements, les deux lectures initiales, `pullSession`) et le
  fichier de tests des modules `app/ui/` (aujourd'hui `tests/mac-ui.test.cjs`).
- Une lecture écartée ne touche pas à l'état de sa source et ne déclenche pas son dessin.
  Dans `pullSession`, les autres états reçus gardent leur application et leur dessin.
  Une lecture en échec garde son traitement
  d'aujourd'hui (`notice(reason(error))` pour les lectures initiales ; rejet propagé dans `pullSession`).
- Dans `pullSession`, seule l'affectation de l'état d'approfondissement est gardée ; les lectures du
  récapitulatif (`receiveRecap`, qui incrémente `recapRevision` l.826) et de la surveillance ne changent pas.
  La lecture initiale du récapitulatif a déjà sa garde de révision (l.850-853) ; elle reste telle quelle.
- Les promesses différées des tests viennent de `deferred` de `tests/helpers/wait.cjs` (arbitrage A2) :
  la définition locale existante est remplacée par cet import, également pour les tests de recherche qui
  l'utilisent déjà. Aucune copie privée de `deferred`, `tick` ou `until` n'est ajoutée.
- Hors périmètre : `refreshSessions`, `renderSaved`, `commandSurveillance`, `watchPushes`,
  `refreshRegistry`, `app/preload.cjs`, `app/main.cjs`, `core/`.
- La faute injectée pour le critère 3 est défaite à la main avant la fin de la session et le test relancé.
- Aucune ligne de plus de 160 caractères dans le nouveau module ; `app/renderer.js` n'en gagne aucune.

## Critères d'acceptation

1. Les tests du module passent et prouvent, avec des promesses différées tenues par le test :
   - une lecture sans poussée ni autre lecture pendant son trajet est fraîche (premier chargement) ;
   - une lecture pendant laquelle une poussée est notée est écartée, que la poussée arrive juste après le
     départ ou juste avant la réponse ;
   - une poussée notée avant le départ d'une lecture ne l'écarte pas (cas de l'ouverture d'archive, dont
     la poussée précède la lecture de `pullSession`) ;
   - deux lectures dont la première répond en dernier : la seconde est fraîche, la première écartée ;
   - deux sources distinctes ne s'influencent pas (une poussée de vérification n'écarte pas une lecture
     d'approfondissement) ;
   - une lecture rejetée ne change pas la fraîcheur d'une lecture suivante.
2. Ces tests importent `app/ui/freshness.mjs` ; ils n'utilisent ni `vm` ni le texte de `app/renderer.js`.
3. Une garde de branchement, indifférente à la mise en page — exception déclarée par ce ticket, pour
   un branchement que rien d'autre ne peut prouver : la fenêtre ne se charge pas sans Electron
   (`tests/mac-ui.test.cjs:700`) — prouve que les deux abonnements notent la
   poussée et que les trois lectures passent par la règle ; une faute injectée puis défaite (l'abonnement
   `onDeepState` ne note plus la poussée) la fait échouer, sortie au journal.
4. Les gardes statiques existantes de `tests/mac-ui.test.cjs` passent avec le nouveau module dans
   `rendererFiles`.
5. Le nombre de tests du fichier modifié ne baisse pas (`grep -c "^\s*test("` avant et après, au journal).
6. `node scripts/check.mjs` est vert.

## Test d'acceptation attendu

Dans le fichier de tests des modules `app/ui/` (aujourd'hui `tests/mac-ui.test.cjs`). Frontière : le
module importé depuis `app/ui/freshness.mjs`, avec des promesses différées (`deferred` de
`tests/helpers/wait.cjs`) et des poussées simulées par le test ; aucun DOM, aucun pont.

## Hypothèses bloquantes

Aucune décision n'est attendue.

Hypothèse de fraîcheur des poussées : les transitions utiles sont suivies d'une publication de leur
instantané ; l'état d'une lecture écartée ne sera pas le seul état à jour jamais livré. Les chemins
de publication sont identifiés dans les sources, mais la course reste à caractériser par des promesses
contrôlées. Aucune exécution IPC ni de renderer ne l'a reproduite ici.

Si la règle ne peut pas être appliquée sans changer un canal IPC, un
instantané de l'hôte ou le comportement d'une lecture que rien n'a dépassée, ou si un changement d'état
de l'approfondissement ou de la vérification n'est suivi d'aucune poussée (une lecture écartée perdrait
alors le seul état à jour) : verdict BLOQUÉ, avec l'écart constaté.

## Journal

- Rafraîchi le 15/10 contre `e92c6a6` : dépendances réduites à T055 (donc T150), niveau standard ;
  trois lectures sans garde et canaux repérés à nouveau. Banc de modules et `shape` déjà présents,
  remplacement du `deferred` local explicité ; garde initiale du récapitulatif déjà livrée reconnue.
  Garantie de publication formulée comme hypothèse à caractériser ; aucun test exécuté.

- Contrôle documentaire : `node scripts/check.mjs --changed` lancé une fois, code 0, vert.
  Aucun fichier de test modifié, donc aucun test exécuté ; Markdown ignoré par Prettier.
  ESLint non lancé (absent ou non configuré). En-têtes, sections et repères contrôlés séparément par lecture.

- Relecture documentaire le 15/10 contre `e92c6a6` : sources rendues pérennes dans
  `docs/audit-points-chauds.md` ou attribuées à la décision du propriétaire, le 15/10.

- Exploration Codex : consignes, code de fenêtre et tests lus ; publications de `DeepAsk`, de la
  vérification et de `sessions:open` vérifiées. `deferred` partagé disponible, aucun écart prévu.
  Détails dans `.harness-state/tickets/T129/exploration.md` et `ecarts.md`.
  `grep -c '^\s*test(' tests/mac-ui.test.cjs` : 35 avant modification.

- Règle pure, tests d'abord :
  `node --test --test-name-pattern='a state read overtaken' tests/mac-ui.test.cjs` : rouge observé
  sur l'assertion `true !== false` (poussée après départ), puis vert, 1/1.
  `node --test --test-name-pattern='of two state reads' tests/mac-ui.test.cjs` : rouge observé
  sur l'ancienne lecture déclarée fraîche, puis
  `node --test --test-name-pattern='a state read overtaken|of two state reads' tests/mac-ui.test.cjs` : vert, 2/2.
  Six cas de fraîcheur couvrent premier chargement, poussées aux deux instants, poussée antérieure,
  réponses inversées, sources séparées et rejet sans effet sur la lecture suivante.
  Sorties conservées dans `.harness-state/tickets/T129/` (`push-*`, `reads-*`, `module-green.log`).

- Branchement : `node --test --test-name-pattern='the window tracks pushes' tests/mac-ui.test.cjs` :
  rouge sur l'import de la règle absent. Après branchement des deux abonnements et des trois lectures,
  `node --test tests/mac-ui.test.cjs` : vert, 42/42 (gardes statiques incluses).
  `node scripts/check.mjs --changed` : code 0, règles, format, lint, gel, cliquet et 42 tests verts.
  Sorties `wiring-red.log`, `wiring-green.log` et `check-changed.log` dans le dossier d'état.

- Faute injectée : retrait manuel de `deepFreshness.pushed()` dans `onDeepState`, puis
  `node --test --test-name-pattern='the window tracks pushes' tests/mac-ui.test.cjs` : code 1,
  assertion `a deep push invalidates pending deep reads before applying its state` échouée.
  Faute défaite à la main ; même commande relancée : code 0, 1/1 vert.
  Sorties intégrales : `mutation-deep-push-red.log` et `mutation-restored-green.log` dans le dossier d'état.
  `grep -c '^\s*test(' tests/mac-ui.test.cjs` après modification : 42 (avant : 35).

- Contrôle final : `node scripts/check.mjs` : code 0, vert. Règles, format, lint, gel et
  cliquet verts ; 103 fichiers JS, 1 215 tests réussis, aucun échec ; Python : 84 tests,
  `OK (skipped=1)`. Sortie conservée dans `.harness-state/tickets/T129/check-full.log`.
  `git diff --check` : code 0. Aucun IPC réel ni Electron exécuté ; courses couvertes par
  promesses contrôlées et branchement par la garde autorisée. Verdict `TERMINÉ`, sans écart,
  remis à la boucle pour relecture ; aucun commit ni push.
