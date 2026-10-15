---
id: T163
titre: Report the test coverage of each module
statut: termine
bloque_par: T150
adr: non
installe: non
harnais: non
supprime_tests: non
niveau: standard
---

## Ce que le ticket livre

Une commande indépendante, `node scripts/coverage.mjs`, donne la couverture JavaScript par module,
y compris pour les modules jamais chargés par les tests. Elle produit un tableau lisible en français
et, avec `--json`, les mêmes mesures structurées. Ce rapport informe le choix des prochains travaux ;
il n'ajoute aucun seuil ni aucune condition au contrôle qualité.

## Sources

- `docs/audit-points-chauds.md`, section A « Cliquet » (comptage des cas, sans mesure de couverture).
  Décision du propriétaire, le 15/10 : ajouter le rapport informatif de couverture, hors contrôle.
- Code vérifié à `e92c6a6` :
  - `package.json:11` lance `node --test tests/*.test.cjs`, sans couverture ;
  - `scripts/check.mjs:116` énumère les fichiers JavaScript de test et `scripts/check.mjs:121`
    les lance avec `--test-concurrency=1`. Ce code sert de référence, il n'est pas à modifier ;
  - `scripts/quality/metrics.mjs:6` nomme les sept répertoires du produit ; son parcours récursif
    est à `scripts/quality/metrics.mjs:17` et son comptage de cas déclarés à
    `scripts/quality/metrics.mjs:74`. Ce comptage n'est pas une couverture ;
  - `tests/quality-check.test.cjs:10` vérifie ces mesures textuelles ; aucun module
    `scripts/coverage.mjs` ni test de rapport de couverture n'existe à ce commit ;
  - `docs/travail/README.md:1` est le guide de travail auquel ajouter la lecture du rapport.
- Relevé local sans exécuter de test : `node --version` donne `v24.12.0` ; `node --help` expose
  `--experimental-test-coverage`, `--test-concurrency`, les options d'inclusion/exclusion de
  couverture et les reporters. La disponibilité de l'option est établie, les chiffres ne le sont pas.

## Périmètre

- Créer `scripts/coverage.mjs` et, si nécessaire, un petit module voisin pour assembler le rapport.
  Utiliser la couverture de Node, sans nouvelle dépendance npm. Lancer les mêmes fichiers
  `tests/*.test.cjs` que le contrôle, en séquentiel, sans lancer le contrôle lui-même.
- Inventorier récursivement tous les fichiers `.js`, `.cjs` et `.mjs` de `core/`, `adapters/`,
  `runtime/`, `server/`, `app/`, `tv/app/` et `mcp/`. Les chemins du rapport sont relatifs au dépôt ;
  les tests, dépendances, scripts et ressources non JavaScript n'en sont pas des modules.
- Rapprocher cette liste des données mesurées : ne jamais importer un module seulement pour le faire
  apparaître. Un module absent des données reste dans le tableau avec ses trois couvertures à zéro.
- Ajouter `tests/coverage-report.test.cjs`, avec une petite arborescence temporaire et des tests
  maîtrisés. Les tests de l'outil ne relancent pas récursivement toute la suite du dépôt.
- Documenter la commande, le périmètre, le tri et les limites dans `docs/travail/README.md`.
- Ne modifier ni `scripts/check.mjs`, ni `scripts/quality/`, ni la boucle, ni les tests du produit.
  Aucun smoke, test Python, script `*:live`, navigateur, fournisseur réel ou installation n'est ajouté
  à la commande de couverture.

## Critères d'acceptation

1. `node scripts/coverage.mjs` lance les fichiers de tests JavaScript un par un et rend, pour chaque
   module du périmètre, son chemin et ses pourcentages de lignes, branches et fonctions couvertes.
   Le test de l'outil vérifie la présence d'un module imbriqué et d'un module jamais chargé : celui-ci
   figure à `0 / 0 / 0`, sans exécution de son code.
2. `node scripts/coverage.mjs --json` rend un JSON exploitable, sans mélange avec la sortie des tests.
   Les chemins et les trois mesures correspondent au tableau texte. Le tri est croissant sur lignes,
   puis branches, puis fonctions, puis chemin pour départager les égalités.
3. Deux exécutions sur le même commit, avec la même suite et le même environnement, sont comparées
   par module et ordre de sortie. Le journal conserve les deux sorties et leur comparaison,
   en excluant seulement les diagnostics d'exécution tels que durées et identifiants de processus.
   Une variation causée par l’outil est corrigée, sans la masquer par l’arrondi. Si elle vient de la
   suite elle-même (course ou processus enfant interrompu avant sa collecte), elle est consignée en
   réserve avec les modules et branches concernés et les deux sorties ; aucun test produit n’est modifié.
   La répétabilité reste exigée sur la petite suite maîtrisée du critère 4.
4. La petite suite du test de l'outil contient une branche parcourue et une non parcourue : les mesures
   attendues sont vérifiées. Une mutation qui omet les modules absents des données rend ce test rouge ;
   la sortie va au journal, puis la mutation est retirée.
5. Aucun taux de couverture, même nul, ne rend le contrôle rouge : le rapport reste informatif, sans
   seuil ni branchement dans `check`. Les erreurs de collecte et les échecs de tests restent indiqués
   comme tels ; une collecte incomplète ne se présente pas comme une mesure complète réussie.
6. Le guide explique notamment que les modules de page ou d'hôte non exercés par les tests apparaissent
   à zéro, que le Python n'est pas mesuré, et qu'un taux élevé ne prouve pas la pertinence des assertions.
   Les tests de l'outil puis `node scripts/check.mjs` passent, en séquentiel.

## Test d'acceptation attendu

`tests/coverage-report.test.cjs`, frontière : la commande de rapport dans une arborescence temporaire
avec un module couvert, une branche non parcourue et un module imbriqué jamais chargé. Le test examine
les mesures et les sorties publiques ; il ne compare pas le texte du script. Les deux collectes réelles
du critère 3 complètent cette preuve sur le dépôt.

## Hypothèses bloquantes

Aucune décision n'est attendue.

L'option observée de Node 24 suffit à cadrer la collecte ; le choix du reporter et la normalisation des
données se vérifient pendant l'implémentation. La répétabilité de la couverture réelle est un critère
à mesurer, pas un résultat de cet audit en lecture seule ; une variation de la suite suit la réserve
prévue au critère 3, sans élargir le périmètre aux tests du produit. Aucun changement du harnais ni installation
n'est autorisé par ce ticket.

## Journal

### Exploration — Codex

- HEAD `6697627` : fichiers du contrôle cités inchangés depuis `e92c6a6` ; guide relu avec ses évolutions.
- Node `v24.12.0`, documentation Node 24 consultée via Context7 pour les événements du reporter.
- Conception et vérifications prévues : `.harness-state/tickets/T163/exploration.md` ; aucun écart prévu (`ecarts.md`).
- Fichiers non suivis initiaux conservés ; aucun harnais, test produit, fournisseur ou installation à modifier.

### Commande et tests maîtrisés

- `node --test tests/coverage-report.test.cjs` : rouge observé sur l'assertion de présence des modules
  (`initial-red.txt`), puis vert (`initial-green.txt`) après inventaire et collecte Node.
- Mesures exactes du module à branche : 5 lignes sur 7, 2 branches sur 3, 100 % des fonctions.
  L'attendu initial comptait à tort le saut de ligne final comme une huitième ligne ; corrigé après
  vérification du comptage Node (sortie conservée dans `measures-test.txt`).
- `node --test --test-name-pattern="reports a nested unloaded" tests/coverage-report.test.cjs` avec
  mutation temporaire filtrant les modules absents des données : code 1 sur l'assertion de présence
  du module imbriqué. Sortie : `.harness-state/tickets/T163/mutation-omission.txt`. Mutation retirée.
- `node --test tests/coverage-report.test.cjs` : 8 tests passent, 0 échec (`acceptance-green.txt`).
  Cela couvre mesures exactes, égalité texte/JSON, répétabilité sans arrondi, tous les niveaux de tri,
  sept racines, exclusions, séquentialité, échec d'assertion, collecte corrompue et absence de tests.
- Le premier essai de corruption portait un nom que Node ignore : ce faux signal est conservé dans
  `collection-red.txt`. Avec un nom conforme, la collecte corrompue est bien refusée (`collection-probe.txt`).
- Guide complété : commande, périmètre, tri, statut incomplet, sorties, absence de seuil et limites.

### Correction de la première collecte réelle

- `node scripts/coverage.mjs --json > .harness-state/tickets/T163/coverage-first.json 2> .harness-state/tickets/T163/coverage-first.stderr`
  : code 1, `COVERAGE_INCOMPLETE`, aucun échec de test annoncé. Cette sortie préliminaire est conservée.
- Cause reproduite sur une petite suite : les fichiers à assertions au niveau du module n'émettent
  pas `test:summary` par fichier. `node --test --test-name-pattern="only use top-level" tests/coverage-report.test.cjs`
  : rouge observé (`top-level-red.txt`). La fin de fichier est maintenant vérifiée par `test:complete`,
  avec le résumé global et la présence des données de couverture toujours requis.
- `node --test tests/coverage-report.test.cjs` : 9 tests passent, 0 échec (`top-level-green.txt`).
  Aucun test produit modifié ; les deux collectes comparables repartent après cette correction.

### Diagnostics de collecte

- La collecte après correction reste à code 1 (`coverage-run1.json` et `coverage-run1.stderr`),
  sans échec d'assertion annoncé. Elle n'est pas comptée comme mesure réussie.
- Le reporter omettait `test:diagnostic`, nécessaire pour comprendre les erreurs natives de collecte.
  `node --test --test-name-pattern="keeps runner diagnostics" tests/coverage-report.test.cjs` : rouge
  sur l'assertion stderr (`diagnostics-red.txt`), puis transmission des diagnostics sur stderr.
- `node --test tests/coverage-report.test.cjs` : 10 tests passent, 0 échec (`diagnostics-green.txt`).
  L'erreur de collecte précise aussi si les données manquent et quels fichiers n'ont pas terminé.
- Une collecte de diagnostic est lancée dans `coverage-diagnostic.json` / `coverage-diagnostic.stderr`,
  pour expliquer le défaut avant toute comparaison de mesures. Aucun test produit n'est retouché.

### Isolation des collectes imbriquées

- `coverage-diagnostic.stderr` explique le refus : les 1116 assertions passent, mais Node ne peut pas
  lire un JSON de couverture corrompu (`SyntaxError`, position 1). Aucune mesure complète n'est annoncée.
- Reproduction limitée au fichier de l'outil :
  `node --test --experimental-test-coverage --test-concurrency=1 --test-reporter=./.harness-state/tickets/T163/probe-reporter.mjs tests/coverage-report.test.cjs`
  : code 1, même erreur (`outer-probe.txt`).
- Cause vérifiée dans le Node installé : `child_process` réinjecte `NODE_V8_COVERAGE` si la propriété
  n'existe pas dans l'environnement transmis. La collecte imbriquée recopiait donc le fichier volontairement
  corrompu de son test vers la collecte parente. Ce défaut appartient à l'outil et à son nouveau test.
- `node --test --test-name-pattern="isolates a nested collection" tests/coverage-report.test.cjs` : rouge
  sur la présence du fichier corrompu chez le parent (`isolation-red.txt`). Une valeur vide bloque la
  copie mais provoque une erreur de nettoyage Node ; sorties conservées dans `isolation-empty-value-red.txt`
  et `outer-empty-value-red.txt`. Une propriété explicite de valeur `undefined` bloque la réinjection
  tout en omettant la variable dans l'enfant ; appliqué à la commande et à la petite suite.
- `node --test tests/coverage-report.test.cjs` : 11 tests passent, 0 échec (`isolation-green.txt`).
- `node --test --experimental-test-coverage --test-concurrency=1 tests/coverage-report.test.cjs` : code 0,
  11 tests passent et la collecte parente réussit (`outer-green.txt`). La collecte ratée précédente
  est conservée sous `coverage-before-isolation.*` ; `coverage-run1.*` et `coverage-run2.*` désignent
  désormais uniquement les deux exécutions finales, avec les entrées figées (`coverage-input-hashes.json`).

### Mesures finales — première exécution

- `node scripts/coverage.mjs --json > .harness-state/tickets/T163/coverage-run1.json 2> .harness-state/tickets/T163/coverage-run1.stderr`
  : code 0, `complete: true`, `testsPassed: true`, aucune erreur, 114 modules dont 11 à `0 / 0 / 0`.
  La sortie de la suite indique 1117 tests, 1117 succès, 0 échec.
- La seconde exécution utilise exactement les mêmes fichiers et options ; les durées et diagnostics
  restent dans les fichiers stderr, les mesures complètes non arrondies dans les fichiers JSON.

### Comparaison finale et réserve prévue au critère 3

- `node scripts/coverage.mjs --json > .harness-state/tickets/T163/coverage-run2.json 2> .harness-state/tickets/T163/coverage-run2.stderr`
  : code 0, 1117 tests réussis, 114 modules, collecte complète.
- `node .harness-state/tickets/T163/compare-coverage.mjs > .harness-state/tickets/T163/coverage-comparison.json`
  : mêmes 114 chemins ; lignes et fonctions identiques ; branches différentes sur cinq modules.
  Empreintes des sources/tests inchangées. Aucun arrondi ni exclusion de module dans la comparaison.

| Module | Branches avant (%) | Branches après (%) |
| --- | --- | --- |
| adapters/codex-session-client.cjs | 94.50867052023122 | 94.78260869565217 |
| adapters/config.cjs | 100 | 96.61016949152543 |
| adapters/model-settings.cjs | 88.23529411764706 | 93.75 |
| runtime/state-views.cjs | 80.68181818181817 | 81.60919540229885 |
| runtime/surveillance-runtime.cjs | 94.11764705882352 | 93.56725146198829 |

- Ordre changé aux indices 83–92, par déplacement de `adapters/config.cjs` selon son taux de branches.
- `node .harness-state/tickets/T163/probe-native.mjs` : deux collectes Node directes, 19 fichiers
  ciblés, séquentielles, codes 0. Elles reproduisent une variation native sans appeler l’outil :
  `config.cjs:12/14`, 57/59 → 57/57 branches ; `surveillance-runtime.cjs:456`, 159/170 → 159/169.
  Les branches non couvertes du dénominateur varient ; les comptes couverts restent constants.
- Réserve : les taux de branches natifs de ces cinq modules varient avec les collectes de la suite.
  L’ordre de fusion V8 est une cause probable, non isolée pour chaque branche ; les trois autres
  emplacements précis restent non isolés. Aucun test produit modifié ni chiffre masqué.
  La répétabilité de la petite suite est vérifiée. Preuves et limites détaillées :
  `.harness-state/tickets/T163/repeatability.md`, `coverage-run{1,2}.{json,stderr}`,
  `coverage-comparison.json`, `native-probe-{1,2}.json`, `native-probe-comparison.json`.

### Contrôles

- `node scripts/check.mjs --changed` : vert, 11 tests passent, cliquet amélioré
  (`cas_de_test` 1028 → 1039), format et règles verts ; ESLint non lancé (absent ou non configuré).
  Sortie complète : `.harness-state/tickets/T163/check-changed.txt`.
- `node scripts/check.mjs` : vert en entier, 97 fichiers JavaScript, 1117 tests réussis, 0 échec ;
  Python : 84 tests, résultat OK avec 1 ignoré. Règles, format et cliquet verts. ESLint non lancé
  (absent ou non configuré). Sortie complète : `.harness-state/tickets/T163/check-full.txt`.
- Aucun harnais ni test produit modifié, aucune dépendance installée ; aucun commit ni push.
- Verdict `TERMINÉ` écrit dans `.harness-state/tickets/T163/verdict.json`, avec la réserve de
  répétabilité réelle ci-dessus ; la relecture et l'intégration restent à la boucle.

### Reprise après relecture 1

- Rapport `relecture-1.md`, ticket et journal, écarts, état Git et diff relus ; arbre existant repris.
- Constat 1 : option de déclaration retenue avant correction dans `ecarts.md`. La variation native
  n'est pas attribuée à la suite produit ; les positions des sondes ne sont pas celles des collectes
  complètes. Cet écart au critère 3 reste à arbitrer par la relecture ; toutes les sorties sont conservées.
- Constats 2 à 7 : corrections préparées, tests de non-régression d'abord. Constat 8 conservé en réserve
  hors périmètre, sans toucher au harnais. Aucun constat contesté.

### Corrections des constats 1 à 7

- Constat 1 : `ecarts.md` déclare explicitement l'écart natif au critère 3, à arbitrer par la
  relecture. `repeatability.md` distingue désormais les comptes et positions de la sonde de 19 fichiers
  de ceux des deux collectes complètes. Les branches de ces collectes ne sont pas localisables dans
  leurs résumés archivés. Cette déclaration remplace l'attribution précédente à la réserve de suite.
- Constat 2 : ancien test vert avec mutation « branches avant lignes » (`correction-sort-old-green.txt`).
  Ajout d'un module à lignes plus basses et branches plus hautes :
  `node --test --test-name-pattern='specified order' tests/coverage-report.test.cjs`
  devient rouge sur l'ordre attendu (`correction-sort-red.txt`), puis vert avec le tri correct rétabli
  (`correction-sort-green.txt`). La mutation est retirée ; les taux relatifs sont observés par assertions.
- Constat 3 : `node --test --test-name-pattern='rejects missing coverage|failures independently|preserves received' tests/coverage-report.test.cjs`
  : trois rouges observés sur leurs assertions (`correction-collection-red.txt`), puis trois verts
  (`correction-collection-green.txt`). Le reporter distingue maintenant le bilan des assertions
  du succès global Node ; l'assembleur conserve les mesures reçues et cumule les deux codes d'erreur.
- Constat 4 : `node --test --test-name-pattern='failed text report' tests/coverage-report.test.cjs`
  : mutation de l'en-tête rendue rouge (`correction-text-red.txt`), puis mutation retirée et vert
  (`correction-text-green.txt`). Code non nul et « INCOMPLÈTE » sur stdout sont vérifiés sans `--json`.
- Constat 5 : guide complété sur les variations de dénominateurs natifs sans changement de code,
  la comparaison de deux rapports et l'indépendance de `testsPassed` vis-à-vis de la collecte.
- Constat 6 : `PROD_DIRS` importé de `scripts/quality/metrics.mjs`, sans modifier ce module ni le harnais.
- Constat 7 : délai du test nommé une seule fois ; le lanceur commun accepte des arguments et un
  environnement de remplacement. Le test d'isolation réutilise ce lanceur et vérifie aussi que
  l'environnement demandé a effectivement produit des données dans le dossier parent.
- `node --test tests/coverage-report.test.cjs` : code 0, 14 tests passent, 0 échec
  (`correction-acceptance.txt`). Aucun test supprimé ni assoupli.

### Vérification des corrections

- `node --test --experimental-test-coverage --test-concurrency=1 tests/coverage-report.test.cjs`
  : code 0, 14 tests passent ; la collecte parente se termine sans erreur (`correction-native.txt`).
- `node scripts/check.mjs --changed` : code 0, vert ; règles, format et cliquet verts,
  14 tests passent, `cas_de_test` 1028 → 1042. ESLint non lancé (absent ou non configuré).
  Sortie complète : `correction-check-changed.txt`.
- `node scripts/check.mjs` : code 0, vert en entier ; 97 fichiers JS, 1120 tests passent,
  0 échec. Python : résultat OK, 84 tests avec 1 ignoré. Règles, format et cliquet verts ;
  ESLint non lancé (absent ou non configuré). Sortie : `correction-check-full.txt`.
- Les constats 1 à 7 de `relecture-1.md` sont traités ; aucun constat contesté. Le constat 1
  suit l'option de déclaration d'écart proposée par le relecteur, sans attribution indue à la suite.
- Nouveau verdict `TERMINÉ`, avec l'écart natif déclaré et la réserve hors périmètre du constat 8
  sur les budgets. Relecture et intégration laissées à la boucle ; aucun commit ni push.

### Reprise après relecture 2

- Rapport, ticket/journal, écarts, état Git et diff relus ; arbre existant repris, témoin présent.
- L'écart natif au critère 3 est accepté par `relecture-2.md`. La réserve sur les budgets reste
  hors périmètre. Aucun nouvel écart prévu ni constat contesté.
- Constat 1 : rétablir la précision du diagnostic dans un champ structuré de `COVERAGE_INCOMPLETE` :
  couverture absente, fichiers non terminés, résumé global absent et échec d'exécution.
  Le test public existant sera renforcé avant correction sur le chemin du fichier manquant.

### Diagnostic restauré — relecture 2, constat 1

- `node --test --test-name-pattern='rejects missing coverage|preserves received|identifies missing summaries' tests/coverage-report.test.cjs`
  : code 1 avant correction, trois rouges observés sur leurs assertions (`diagnostic-detail-red.txt`).
  Le test existant vérifie explicitement `/sample/tests/missing.test.cjs` dans les fichiers signalés.
- Après correction, même commande : code 0, trois verts (`diagnostic-detail-green.txt`).
- `COVERAGE_INCOMPLETE` conserve son code et expose désormais `details.coverageMissing`,
  `details.unfinishedFiles`, `details.summaryMissing` et `details.executionFailed` dans le JSON.
  Les mesures partielles, l'état des assertions et le cumul des erreurs restent conservés.
- Le guide décrit ces champs. Aucun diagnostic supplémentaire n'est supprimé.
- `node --test tests/coverage-report.test.cjs` : code 0, 15 tests passent, 0 échec
  (`diagnostic-detail-acceptance.txt`). Aucun test supprimé ni assoupli.

### Vérification après relecture 2

- `node --test --experimental-test-coverage --test-concurrency=1 tests/coverage-report.test.cjs`
  : code 0, 15 tests passent ; collecte parente réussie (`diagnostic-detail-native.txt`).
- `node scripts/check.mjs --changed` : code 0, vert ; 15 tests passent, règles, format et cliquet
  verts (`cas_de_test` 1028 → 1043). ESLint non lancé (absent ou non configuré).
  Sortie conservée : `diagnostic-detail-check-changed.txt`.
- `node scripts/check.mjs` : code 0, vert en entier ; 97 fichiers JS, 1121 tests passent,
  0 échec. Python : résultat OK, 84 tests avec 1 ignoré. Règles, format et cliquet verts ;
  ESLint non lancé (absent ou non configuré). Sortie : `diagnostic-detail-check-full.txt`.
- Constat mineur de `relecture-2.md` corrigé, aucun constat contesté. Nouveau verdict `TERMINÉ`
  avec l'écart natif accepté et la réserve hors périmètre sur les budgets. Relecture et intégration
  laissées à la boucle ; aucun commit ni push.

### Reprise après échec 1 — relecture 3

- Lecture de `echec-1.txt` (rapport de relecture 3), du journal, des écarts, de l'état Git et du diff.
  Même HEAD `6697627`, témoin présent, fichiers existants repris.
- Constat 1 : normaliser dans `summarizeCollection` les chemins des fichiers non terminés par
  rapport à une racine injectée ; tester cette frontière sur des chemins absolus et relatifs,
  avant correction. Le guide précisera le format de `unfinishedFiles`.
- Constats 2 et 3 conservés en réserves hors périmètre ; écart natif du critère 3 accepté par la
  relecture 3. Aucun nouvel écart prévu ni constat contesté. Pas de sous-agent, commit ni push.

### Chemins des diagnostics — relecture 3, constat 1

- `node --test --test-name-pattern='preserves received|unfinished files relative|identifies missing summaries' tests/coverage-report.test.cjs`
  : code 1 avant correction (`relative-paths-red.txt`). Les deux premières assertions exposent
  les chemins absolus et la comparaison incorrecte des chemins mixtes. Le troisième échec vient
  de l'adaptation de la signature du test à la future racine injectée.
- Même commande après correction : code 0, trois tests passent (`relative-paths-green.txt`).
- La normalisation appartient à `summarizeCollection` : racine explicitement injectée par la
  commande, comparaison des chemins du runner, sortie relative avec séparateurs `/`.
  Le test public de cette fonction vérifie le format exact et les chemins mixtes.
  Le guide précise le format de `details.unfinishedFiles` et donne un exemple.
- `node --test tests/coverage-report.test.cjs` : code 0, 16 tests passent, 0 échec
  (`relative-paths-acceptance.txt`), dont les commandes réelles sur les petites suites maîtrisées.
  Aucun test supprimé ni assoupli ; aucune modification du harnais ni des tests du produit.

### Contrôle des chemins relatifs

- `node scripts/check.mjs --changed` : code 0, vert ; 16 tests passent, règles, format et cliquet
  verts (`cas_de_test` 1028 → 1044). ESLint non lancé (absent ou non configuré).
  Sortie : `.harness-state/tickets/T163/relative-paths-check-changed.txt`.
- `node scripts/check.mjs` : code 0, vert en entier ; 97 fichiers JS, 1122 tests réussis,
  0 échec. Python : 84 tests, résultat OK avec 1 ignoré. Règles, format et cliquet verts ;
  ESLint non lancé (absent ou non configuré). Sortie : `relative-paths-check-full.txt`.
- Constat 1 de `relecture-3.md` corrigé. Les constats 2 (détails absents de stderr en mode texte)
  et 3 (budgets locaux) restent des réserves hors périmètre. L'écart natif au critère 3 reste
  accepté ; les deux collectes complètes et leur comparaison sont conservées.
- Verdict `TERMINÉ` écrit avec ces trois réserves ; relecture et intégration laissées à la boucle.
  Aucun commit ni push.

### Réserves à la clôture

- Écart natif accepté au critère 3 (relecture-3.md, section Écarts et contestations) : dénominateurs de branches variables sur adapters/codex-session-client.cjs, adapters/config.cjs, adapters/model-settings.cjs, runtime/state-views.cjs et runtime/surveillance-runtime.cjs. Preuves dans coverage-run{1,2}.json, coverage-comparison.json, native-probe-{1,2}.json et native-probe-comparison.json. Les positions des branches des collectes complètes ne sont pas localisables rétrospectivement ; celles des sondes ne les remplacent pas. Aucun arrondi ni test produit modifié.
- Hors périmètre, relecture-3.md constat 2 : le mode texte affiche le code et le message générique sur stderr ; les causes détaillées sont disponibles dans le champ details du JSON. Affichage détaillé sur stderr à traiter lors d'une prochaine reprise de ce code.
- Hors périmètre, relecture-3.md constat 3 (report du constat 8 de relecture-1.md) : budgets de durée et de sortie locaux ; mutualisation avec check.mjs et TVLENS_TEST_BUDGET_MS nécessitant un ticket autorisant une modification du harnais.
- .harness-state/tickets/T163/relecture-4.md : `scripts/coverage.mjs:147-148` — hors périmètre (constat 2 de `relecture-3.md`)
  - **Problème :** en mode texte, `printReport` n'écrit sur stderr que `code : message`. Les causes rangées dans `details` (`coverageMissing`, `unfinishedFiles`, `summaryMissing`, `executionFailed`) n'apparaissent qu'avec `--json`.
  - **Attendu :** écrire aussi `details` sur stderr en mode texte, lors d'une prochaine reprise de ce code.
  - La réserve est reportée dans `verdict.json`.
- .harness-state/tickets/T163/relecture-4.md : `scripts/coverage.mjs:11-12` — hors périmètre (constat 3 de `relecture-3.md`, à l'origine constat 8 de `relecture-1.md`)
  - **Problème :** `TEST_BUDGET_MS` et `MAX_OUTPUT_BYTES` reprennent des valeurs de `scripts/check.mjs`, mais pas le réglage `TVLENS_TEST_BUDGET_MS`.
  - **Attendu :** les mettre en commun. Cela demande de modifier le harnais, ce que ce ticket interdit.
  - La réserve est consignée dans `ecarts.md` et `verdict.json`.
- .harness-state/tickets/T163/relecture-4.md : **Écart accepté, critère 3.** Je maintiens la décision des relectures 2 et 3, car la correction ne touche ni la collecte ni les mesures. `ecarts.md` ne déclare aucun nouvel écart.
