---
id: T129
titre: Keep a pushed state from being overwritten by an older read in the Mac window
statut: a-faire
bloque_par: T057, T058, T059, T062, T063, T064, T145
adr: non
installe: non
harnais: non
supprime_tests: non
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

- Constats : UI-03
- Fiche : `docs/travail/fiches/interface-mac.md`, étape 3 (l'étape 4 reprend `refreshSessions`,
  `renderSaved` et la commande de surveillance).
- Code concerné, à la version `0d5a954` :
  - `app/renderer.js`, abonnements `bridge.onVerificationState` (l.302) et `bridge.onDeepState` (l.304) :
    état poussé, appliqué tel quel.
  - `app/renderer.js`, lectures initiales `bridge.deepState().then(...)` (l.305) et
    `bridge.verificationState().then(...)` (l.306) : aucune garde.
  - `app/renderer.js`, `pullSession` (l.496-505) : `Promise.all([bridge.deepState(), …])` puis
    `deepState = deep` (l.501) sans garde. `pullSession` n'est appelée que par `openArchive` (l.510),
    après `await bridge.openSession(id)`. L'hôte pousse `deep:state` dans le gestionnaire
    `sessions:open` (`app/main.cjs`, l.449, avant de répondre à `openSession`) et à chaque changement d'un
    approfondissement (`DeepAsk.emit`, `core/deep-ask.cjs` l.26, relayé par le `onChange` de
    `createConversationRuntime` dans `app/main.cjs`, l.169) : une question en cours peut donc pousser
    pendant la lecture. L'état de vérification est poussé par le `onChange` de la vérification
    (`app/main.cjs`, l.238, canal `verify:state`).
  - Patron existant à reprendre : `commandSurveillance` (l.693-703) note `watchPushes` au départ et
    n'applique une réponse « en restauration » que si aucune poussée n'est arrivée depuis (l.696-699) ;
    `bridge.onSurveillance` incrémente `watchPushes` (l.725).
  - Les instantanés de l'hôte n'ont pas de numéro de révision : `DeepAsk.snapshot` (`core/deep-ask.cjs`,
    l.25) et `VerificationService.snapshot` (`core/verification.cjs`, l.15).
  - Pourquoi écarter une lecture dépassée par une poussée ne perd rien : les changements d'état de
    `DeepAsk` et de `VerificationService` passent par `emit()` ; `DeepAsk.restore` (l.45) n'émet pas, mais
    le gestionnaire `sessions:open` pousse l'instantané juste après (l.449). La dernière poussée reçue
    porte donc un état au moins aussi récent que celui d'une lecture partie avant elle. Si la session
    trouve un changement d'état qui n'est suivi d'aucune poussée, elle le note au journal : verdict BLOQUÉ
    (voir les hypothèses).
- Aide de test partagée (lot L05) : `tests/helpers/wait.cjs`, `deferred()` rend
  `{ promise, resolve, reject }`.
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
- Une lecture écartée ne touche ni à l'état ni au dessin. Une lecture en échec garde son traitement
  d'aujourd'hui (`notice(reason(error))` pour les lectures initiales ; rejet propagé dans `pullSession`).
- Dans `pullSession`, seule l'affectation de l'état d'approfondissement est gardée ; les lectures du
  récapitulatif (`receiveRecap`, qui incrémente `recapRevision` l.804 mais n'est pas lui-même gardé contre
  une poussée `onRecap`) et de la surveillance ne changent pas : elles relèvent de l'étape 4 de la fiche.
- Les promesses différées des tests viennent de `deferred` de `tests/helpers/wait.cjs` (arbitrage A2) :
  aucune copie privée de `deferred`, `tick` ou `until` n'est ajoutée au fichier de tests.
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
3. Une garde de branchement, indifférente à la mise en page, prouve que les deux abonnements notent la
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

Aucune décision n'est attendue. Si la règle ne peut pas être appliquée sans changer un canal IPC, un
instantané de l'hôte ou le comportement d'une lecture que rien n'a dépassée, ou si un changement d'état
de l'approfondissement ou de la vérification n'est suivi d'aucune poussée (une lecture écartée perdrait
alors le seul état à jour) : verdict BLOQUÉ, avec l'écart constaté.

## Journal
