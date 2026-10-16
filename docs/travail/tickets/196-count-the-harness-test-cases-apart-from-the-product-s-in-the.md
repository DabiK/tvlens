---
id: T196
titre: Count the harness test cases apart from the product's in the ratchet
statut: a-faire
bloque_par: T199
adr: non
installe: non
harnais: oui
supprime_tests: non
niveau: standard
---

## Ce que le ticket livre

Le cliquet protège séparément le nombre de cas du produit et celui du harnais. Ajouter un scénario de
boucle ne peut plus compenser la suppression d'un scénario produit, et l'inverse reste également
interdit. La mesure garde sa définition textuelle actuelle : elle ne prétend pas compter les tests
effectivement exécutés ni mesurer leur couverture.

## Sources

- `docs/audit-architecture.md`, rapport A, B8 et F8. Décision du propriétaire, le 16/10 : proposer
  cette séparation avec deux planchers indépendants, après T199 ; T178 est transitif.
- Code vérifié à `8340014`, métriques, cliquet, contrôle, boucle et tests de qualité lus en entier :
  - `scripts/quality/metrics.mjs:45` définit le sens des compteurs ; `:60` mesure l'arbre des tests,
    `:72` sélectionne les fichiers et `:74` additionne les lignes commençant par `test(` ;
  - `scripts/quality/baseline.json:8` porte un plancher unique de 1 305 ;
    `scripts/quality/ratchet.mjs:16` compare, `:32` resserre, `:42` écrit les clés connues ;
  - `scripts/check.mjs:160` applique cette comparaison en contrôle complet et en `--changed` ;
    `scripts/loop/run.mjs:408` resserre le plancher à l'intégration ;
  - `tests/quality-check.test.cjs:105` vérifie le comptage, `:127` les deux sens de comparaison,
    `:136` le resserrement. `tests/ticket-loop.test.cjs:562` protège le resserrement à l'intégration ;
  - `docs/standards.md:45` annonce encore un seul compteur. `scripts/coverage.mjs:7` importe
    seulement les racines produit depuis les métriques : son rapport de couverture reste distinct.
- Relevé textuel reproduit en lecture seule sur ce worktree : 1 305 cas, dont 333 dans les douze
  fichiers ci-dessous, donc 972 dans les autres. Ce ne sont ni des résultats de tests ni les valeurs
  à figer après les dépendances : T199 et T200 peuvent déjà ajouter des cas de harnais. Refaire l'inventaire à l'exécution ;
  la liste de classification suit la responsabilité des fichiers alors présents.

  | Fichiers actuels sous `tests/`, suffixe `.test.cjs` | Cas textuels |
  | --- | ---: |
  | ticket-loop | 124 |
  | loop-view, loop-view-codex, loop-view-events, loop-view-state | 106 |
  | watch-loop, watch-loop-render | 35 |
  | agent-guards | 32 |
  | coverage-report | 16 |
  | quality-check | 15 |
  | npm-scripts | 4 |
  | reviewed-state | 1 |

  `tests/reviewed-state.test.cjs:63` teste `scripts/loop/reviewed-state.mjs` : une ligne `test(`
  génère dix cas exécutables ; la mesure reste une occurrence textuelle.

## Périmètre

- Modifier `scripts/quality/metrics.mjs`, `ratchet.mjs` si nécessaire, `baseline.json`, les tests
  de qualité et d'intégration de boucle, et la ligne correspondante de `docs/standards.md`.
  `check.mjs` et `run.mjs` ne changent que si leur raccord aux deux mesures l'exige.
- Remplacer le compteur unique par deux compteurs minimums clairement nommés produit et harnais.
  Garder la même reconnaissance des lignes `test(`, les mêmes extensions et le parcours récursif.
  Les tests Python et le comptage réel de Node restent hors de cette mesure, comme aujourd'hui.
- Centraliser la classification : les douze fichiers énumérés sont du harnais ; les nouveaux
  fichiers de mesure créés ici le sont aussi. Un fichier de test non déclaré est produit par défaut.
  Les tests d'architecture du produit ne deviennent pas du harnais parce qu'ils sont des gardes.
- Migrer le plancher une seule fois, avec inventaire par fichier et somme conservée. Recalculer à
  l'exécution après T199 et les éventuels autres tickets déjà intégrés, notamment T200, et T194 si son retrait a
  été autorisé. Aucun assouplissement implicite ni prise des valeurs approximatives du rapport.
- Aucun test supprimé, aucun renommage de fichiers de tests, aucune modification des scénarios
  produit. Les autres mesures, le gel ESLint et les règles de permissions restent inchangés.

## Critères d'acceptation

1. Des fixtures avec tests produit, tests de harnais, fichier nouveau inconnu et sous-dossiers
   donnent deux comptes exacts et disjoints. Leur somme est l'ancien total calculé par la même
   définition. Les helpers sans suffixe de test et les fichiers non JavaScript ne créent aucun cas.
2. Retirer un cas produit et ajouter un cas harnais, à total constant, rend le contrôle rouge sur
   le plancher produit. Le scénario inverse rend rouge le plancher harnais. Les deux preuves passent
   par `scripts/check.mjs`, en mode complet et `--changed`, dans des dépôts temporaires isolés.
3. `compare` détecte chaque baisse séparément ; `tighten` conserve chaque meilleur plancher sans
   le relâcher quand l'autre mesure progresse. L'écriture/relecture garde les deux clés. La vraie
   intégration de boucle resserre la mesure améliorée et conserve l'autre, avec un test par frontière.
4. Le journal consigne l'ancien plancher, l'ancien total mesuré, l'inventaire refait par responsabilité et les comptes par fichier, les deux
   nouveaux planchers et leur somme. La migration ne masque aucune régression déjà présente : un
   total sous l'ancien plancher demande d'abord une explication autorisée, pas sa réinitialisation.
   Toutes les autres valeurs de `baseline.json` restent identiques.
5. La définition écrite dans les standards nomme les deux mesures et leur classification par
   responsabilité. Les tests existants du comptage sont adaptés sans diminuer leurs exigences ;
   le rapport de couverture conserve son périmètre et son fonctionnement.
6. À l'implémentation, `node --test --test-concurrency=1 tests/quality-check.test.cjs tests/ticket-loop.test.cjs`,
   complété des nouveaux tests de la mesure, puis `node scripts/check.mjs`, sont verts. Aucun test
   ne se contente de lire le texte des scripts de mesure pour prouver leur résultat.

## Test d'acceptation attendu

`tests/quality-check.test.cjs` utilise `harnessRepo` pour construire les deux familles de tests,
initialiser leurs planchers et provoquer les deux compensations interdites. Les compteurs observés
viennent de `measure` et du JSON du vrai contrôle. Le test de boucle vérifie le plancher committé.

## Hypothèses bloquantes

Décision du propriétaire, le 16/10 (« Oui, séparer », en réponse à la question posée) : oui. Le cliquet compte à part les tests du produit et ceux du harnais, chacun avec son plancher.

Question posée : séparer les deux mesures du cliquet, chacune avec son plancher ?
Recommandation : oui.

La classification et la migration proposées sont celles de ce ticket. Elles ne donnent aucune
autorisation générale de supprimer des tests produit, ni de baisser leurs planchers ensuite.

## Journal
