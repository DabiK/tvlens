---
id: T164
titre: Walk core, runtime and server recursively in the architecture guard
statut: termine
bloque_par: T163, T123
adr: non
installe: non
harnais: non
supprime_tests: non
niveau: standard
---

## Ce que le ticket livre

La garde d'architecture examine aussi les modules rangés dans un sous-dossier de `core/`, `runtime/`
ou `server/`. Ranger un module ne fait plus sortir ce module de la vérification, et le diagnostic
nomme son chemin relatif complet. Les règles de frontière existantes restent les mêmes.

## Sources

- `docs/audit-points-chauds.md`, section A « Frontières ».
  Décision du propriétaire, le 15/10 : ouverture sélective après T150 et périmètre de cette file.
- Code vérifié à `e92c6a6`, `tests/architecture.test.cjs` lu en entier :
  - `tests/architecture.test.cjs:7` parcourt les entrées immédiates de `core/`, puis les lit comme
    des fichiers à la ligne 8. Il n'y a ni distinction fichier/dossier ni descente récursive ;
  - `tests/architecture.test.cjs:9` vérifie les imports et `tests/architecture.test.cjs:12`
    interdit les accès globaux déjà nommés par la garde ;
  - `tests/architecture.test.cjs:16` applique le même parcours plat à `runtime/` et `server/`,
    avec l'interdiction de l'import Electron à la ligne 17 ;
  - `tests/architecture.test.cjs:20` commence une troisième garde, indépendante, sur les rôles Codex ;
  - `docs/architecture.md:18` renvoie à cette garde pour les dépendances du cœur ;
  - `scripts/check.mjs:116` découvre le fichier de test, exécuté en séquentiel à la ligne 121.
- Nuance au constat : un sous-dossier rencontré serait actuellement donné à `readFileSync` ; il peut
  donc produire une erreur de lecture au lieu d'un diagnostic de frontière. Le défaut établi est
  l'absence de parcours récursif, pas la preuve qu'un import imbriqué est aujourd'hui accepté.

## Périmètre

- T123 ajoute dans `tests/architecture.test.cjs` la garde récursive contre les affectations directes
  de `watch.ending`, `watch.accepting`, `watch.readOnly` et `watch.closed` depuis `app/`, `runtime/`,
  `server/` et `mcp/`. Relire sa version livrée avant de modifier ce fichier.
- Partager le helper de parcours de cette garde avec les gardes de couches de `core/`, `runtime/`
  et `server/` ; si T123 a gardé son parcours en ligne, l’extraire une seule fois dans ce ticket.
  Le parcours commun accepte un filtre d’extensions : `.cjs` pour la garde de T123, `.js`, `.cjs`,
  `.mjs` pour les couches. Les répertoires ne sont jamais lus comme des fichiers.
- Garder les assertions d'import et d'accès global existantes. Les diagnostics incluent le chemin
  relatif à la racine du dépôt, sous-dossiers compris.
- Ajouter les cas de parcours dans ce test ou dans `tests/architecture-guard.test.cjs`, avec des
  arbres temporaires isolés soumis à la même garde. Ne modifier aucun module produit pour le ranger.
- Ne toucher ni à la troisième garde Codex, ni au harnais, ni aux règles de dépendance autorisées.
  L'analyse des syntaxes d'import reste celle de la garde actuelle ; ce ticket ne crée pas un analyseur.

## Critères d'acceptation

1. Une fixture contenant des modules conformes au premier niveau et à deux niveaux de sous-dossiers
   de chacune des trois racines passe la garde, sans erreur de lecture de répertoire. Chaque module
   est effectivement examiné, y compris lorsqu'une entrée non JavaScript voisine est présente.
2. Un fichier temporaire `core/nested/forbidden.cjs` contenant `require('node:fs')` fait échouer la
   garde avec un diagnostic d'import qui cite ce chemin et `node:fs`. Le journal conserve cette sortie
   rouge, puis la sortie verte après retrait du fichier. Une simple erreur `EISDIR` ne constitue pas
   cette preuve. Réaliser la manipulation dans une copie isolée si un autre travail utilise le dépôt.
3. Les fixtures d'un accès `process` dans un sous-dossier de `core/`, et d'un import Electron dans
   un sous-dossier de `runtime/` puis de `server/`, échouent sur leurs assertions respectives. Les mêmes
   interdictions au premier niveau restent vérifiées ; un module conforme n'est pas refusé.
4. Une mutation qui rend le parcours plat fait échouer les cas imbriqués pour la raison attendue.
   La sortie rouge est consignée, puis la mutation retirée. Les cas n'inspectent pas le texte du helper.
5. `node --test --test-concurrency=1 tests/architecture.test.cjs` et les éventuels tests du helper,
   puis `node scripts/check.mjs`, sont verts. La garde de T123 utilise le même helper et conserve ses assertions et son cas de mutation.
   Aucun fichier du produit ou du harnais n’est modifié.

## Test d'acceptation attendu

La garde réelle de `tests/architecture.test.cjs`, appliquée à une arborescence temporaire ou à une copie
isolée du dépôt. Le premier cas prouve qu'un sous-dossier conforme est parcouru, le second qu'un import
interdit imbriqué est rejeté précisément. Le test exerce le parcours et ses assertions ensemble.

## Hypothèses bloquantes

Aucune décision n'est attendue.

Le ticket étend uniquement la profondeur du parcours. Il ne tranche aucune nouvelle règle sur les
imports parents, les modules externes, les extensions ou la composition des hôtes. Les restrictions
déjà exprimées par les assertions sont conservées.

## Journal

### Exploration — Codex

- Skill `ticket-codex`, méthode de tests, standards, garde entière, appelant, ADR 0014/0016 et version
  livrée de T123 relus. Base `eb1cc2f`, témoin de hooks présent ; fichiers initiaux conservés.
- Exploration et écarts consignés dans `.harness-state/tickets/T164/{exploration,ecarts}.md`.
  Aucun écart prévu. Le parcours commun servira aussi à la garde des services du cœur, elle aussi plate,
  avec ses assertions inchangées. La garde Codex reste inchangée.

### Parcours et tests

- `node --test --test-concurrency=1 tests/architecture-guard.test.cjs` : rouge observé sur l'assertion
  du cas conforme (code 1, `conforming-red.log`), les trois parcours plats tentant de lire un dossier.
  Même commande verte après extraction du générateur de T123 et partage du filtre d'extensions
  (code 0, 1/1, `conforming-green.log`).
- Le helper reste dans `tests/architecture.test.cjs` ; assertions d'import, d'accès global et de cycle
  de vie conservées, diagnostics relatifs au dépôt. `.cjs` uniquement pour T123, `.js/.cjs/.mjs` pour
  les couches. La garde des services du cœur conserve l'exception du seul `core/session.cjs`.
- `node --test --test-concurrency=1 tests/architecture-guard.test.cjs tests/architecture.test.cjs` :
  code 0, 62/62 tests (`guards-green.log`). Les fixtures copient et exécutent la garde réelle, sans
  inspecter le texte du helper : modules conformes et entrées non JavaScript, import interdit,
  `process` et Electron à chaque profondeur et extension ; drapeaux, lectures et comparaisons de T123.

### Preuves rouges et mutations isolées

- `python3 .harness-state/tickets/T164/probe-guards.py` : code 0 ; commandes et résultats dans
  `probes.log`. Toutes les manipulations ont lieu dans une copie temporaire, supprimée ensuite.
- `node --test --test-concurrency=1 tests/architecture.test.cjs`, dans cette copie avec
  `core/nested/forbidden.cjs` contenant `require('node:fs')` : code 1, 4/5, assertion
  `core/nested/forbidden.cjs depends on node:fs`, sans `EISDIR` (`nested-import-red.log`).
  Fichier retiré : même commande code 0, 5/5 (`nested-import-green.log`).
- Mutation du helper : descente récursive remplacée temporairement par l'ignorance des dossiers
  (`flat-mutation.patch.txt`). `node --test --test-concurrency=1 tests/architecture-guard.test.cjs` :
  code 1, 43 échecs sur 57, assertion `0 !== 1` parce que les violations imbriquées ne sont plus vues,
  sans `EISDIR` (`flat-mutation-red.log`). Mutation retirée, garde restaurée à l'octet près :
  même commande code 0, 57/57 (`flat-mutation-green.log`).
- Mutation T123 conservée et rejouée dans la copie : `session.watch.ending = true` réintroduit dans
  `closeSession` à la place de `beginEnding()`. `node --test --test-concurrency=1 tests/architecture.test.cjs` :
  code 1, 4/5, assertion `runtime/session-closing.cjs writes watch.ending =` (`lifecycle-mutation-red.log`).
  Module restauré à l'octet près : même commande code 0, 5/5 (`lifecycle-mutation-green.log`).

### Contrôles

- `node scripts/check.mjs --changed` : code 0, vert ; règles, format, lint, gel, cliquet et 62/62 tests JS.
  Cliquet amélioré : `cas_de_test` 1097 → 1103, sans modification du plancher (`check-changed.log`).
- Toutes les sorties citées sont conservées dans `.harness-state/tickets/T164/`.
- `node scripts/check.mjs` complet : code 0, vert ; règles, format, lint, gel et cliquet verts,
  1267/1267 tests JavaScript sur 104 fichiers ; Python : 84 tests comptabilisés, un ignoré,
  `OK (skipped=1)` (`check-full.log`).
- `git diff --check` : code 0. Aucun produit ni harnais modifié, aucune installation, aucun commit
  ni push. Verdict `TERMINÉ`, sans reste, écrit dans `.harness-state/tickets/T164/verdict.json` ;
  relecture et intégration laissées à la boucle.

### Reprise après relecture 1

- Rapport, ticket et journal, écarts, `git status --short` et `git diff` relus. Constat mineur 1 accepté :
  retirer les copies d'adaptateurs et limiter les exécutions isolées aux gardes de couches et de cycle
  de vie. Preuve rouge puis verte prévue par une exécution du cas conforme sans aucun fichier produit.
  Assertions existantes conservées ; exploration et écarts complétés avant correction, sans écart prévu.
- `node --test --test-concurrency=1 --test-name-pattern='^architecture guard cases run without product adapters' tests/architecture-guard.test.cjs` :
  rouge sur l'assertion du statut enfant, code 1, causé par la lecture de `adapters/codex-session-agent.cjs`
  absent de la copie limitée aux tests (`review-isolation-red.log`). Après retrait de la liste et des
  copies d'adaptateurs, puis sélection des quatre gardes concernées par `--test-name-pattern`, même
  commande verte, code 0, 1/1 (`review-isolation-green.log`). Les assertions existantes sont inchangées.
- `node --test --test-concurrency=1 tests/architecture-guard.test.cjs tests/architecture.test.cjs` :
  code 0, 63/63 (`review-guards-green.log`). La garde Codex reste exécutée sur le dépôt réel.
- `python3 .harness-state/tickets/T164/review-probe-guards.py` : code 0 (`review-probes.log`). Cette
  version ne copie plus d'adaptateur et conserve les anciennes preuves. Import imbriqué : code 1 avec
  `core/nested/forbidden.cjs depends on node:fs`, puis code 0 après retrait ; mutation plate : code 1,
  43/58 échecs attendus, puis code 0, 58/58 ; mutation T123 dans la copie de `closeSession` : code 1
  avec `runtime/session-closing.cjs writes watch.ending =`, puis code 0 après restauration.
  Sorties `review-{nested-import,flat-mutation,lifecycle-mutation}-{red,green}.log`, sans `EISDIR`.
- `node scripts/check.mjs --changed` : code 0, toutes étapes vertes, 63/63 tests JS ; cliquet
  `cas_de_test` 1097 → 1104 (`review-check-changed.log`). `git diff --check` : code 0.
- `node scripts/check.mjs` : code 0, toutes étapes vertes ; 1268/1268 tests JS sur 104 fichiers,
  Python : 84 tests comptabilisés, un ignoré, `OK (skipped=1)` (`review-check-full.log`).
- Constat 1 corrigé, aucune contestation ni réserve. Nouveau verdict `TERMINÉ` dans le dossier d'état.
  Aucun produit ni harnais modifié, aucun commit ni push ; relecture et intégration laissées à la boucle.

### Reprise après relecture 2

- Rapport, ticket et journal, écarts, `git status --short` et `git diff` relus ; nouveau constat mineur 1
  accepté. Reproduire le passage à vide par renommage du cas conforme dans une copie temporaire, puis
  exiger un cas passé dans la sortie de l'exécution imbriquée. Assertions existantes conservées,
  exploration et écarts complétés avant correction ; aucun écart ni contestation.
- `python3 .harness-state/tickets/T164/probe-empty-selection.py before 0` : passage à vide reproduit
  dans une copie des seuls tests, cas conforme renommé ; le test d'isolation initial passe à tort
  (`empty-selection-before.log`). Premier essai limité au compteur également insuffisant : Node compte
  le fichier comme un cas passé (`empty-selection-count-only.log`).
- Ajout d'un reporter TAP explicite et de deux assertions : un test passé et sa ligne de réussite nommée.
  `python3 .harness-state/tickets/T164/probe-empty-selection.py red 1` : sonde code 0, exécution test
  mutée code 1 sur l'absence de `ok 1 - architecture guard accepts conforming modules ...`, malgré
  `# pass 1` (`empty-selection-red.log`). Aucun fichier du dépôt n'a été renommé.
- `node --test --test-concurrency=1 --test-name-pattern='^architecture guard cases run without product adapters' tests/architecture-guard.test.cjs` :
  code 0, 1/1 sans mutation (`empty-selection-green.log`). Assertions préexistantes inchangées.
- `node --test --test-concurrency=1 tests/architecture-guard.test.cjs tests/architecture.test.cjs` :
  code 0, 63/63 (`review2-guards-green.log`).
- `node scripts/check.mjs --changed` : code 0, toutes étapes vertes, 63/63 tests JS ; cliquet
  `cas_de_test` 1097 → 1104 (`review2-check-changed.log`).
- `node scripts/check.mjs` complet : code 0, règles, format, lint, gel et cliquet verts ; 1268/1268 tests
  JS sur 104 fichiers, Python : 84 tests comptabilisés dont un ignoré, `OK (skipped=1)`
  (`review2-check-full.log`). `git diff --check` : code 0.
- Nouveau constat 1 corrigé, aucun écart, aucune réserve. Verdict `TERMINÉ` écrit dans le dossier d'état.
  Aucun produit ni harnais modifié, aucun commit ni push ; relecture et intégration laissées à la boucle.
