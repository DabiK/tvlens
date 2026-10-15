---
id: T163
titre: Report the test coverage of each module
statut: a-faire
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
