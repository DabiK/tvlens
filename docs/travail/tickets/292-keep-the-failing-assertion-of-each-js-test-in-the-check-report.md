---
id: T292
titre: Keep the failing assertion of each JS test in the check report
statut: a-faire
bloque_par:
adr: non
installe: non
harnais: oui
supprime_tests: non
niveau: standard
---

## Ce que le ticket livre

Quand un test JS échoue, le rapport de `node scripts/check.mjs` dit pourquoi : fichier et ligne, message de
l'assertion, valeurs attendue et obtenue. Un échec qui ne se reproduit pas reste lisible après coup, sans
reconstitution.

## Sources

- Décision du propriétaire, le 19/10 : « il faut un ticket pour le point numéro 1 », sur la proposition de
  l'orchestrateur de garder le détail des tests en échec dans le contrôle. Ce ticket modifie le harnais avec son accord.
- Nuit du 19/10 : deux tests ont échoué une seule fois au contrôle complet de la boucle (T287 à 01:44,
  `tests/session-events.test.cjs:104` ; T288 à 02:23, `tests/local-stream-replay.test.cjs:591`). Le rapport ne gardait
  que leur titre ; Codex a dû provoquer une reproduction pour trouver la cause (T290, T291), dont l'identité avec
  l'échec observé reste une inférence.
- Code à `e26ac28`, `scripts/check.mjs` :
  - `:168-179` `jsTests` lance `node --test --test-concurrency=1` puis, `:176`, ne garde que les lignes
    `ℹ tests|pass|fail` et `✖ …`, 40 au plus : le bloc qui suit `✖ failing tests:` (`AssertionError`, `actual`,
    `expected`, emplacement) est jeté ;
  - `:47` `tail` ; `:181-187` les tests Python gardent déjà les 25 dernières lignes en cas d'échec ;
  - `:218-224` affichage des étapes ; option `--json`.
- Tests du contrôle : `tests/quality-check.test.cjs` (dépôt temporaire, `repo.node("scripts/check.mjs", …)`).

## Périmètre

- À modifier : `scripts/check.mjs`, `tests/quality-check.test.cjs`, et la documentation du contrôle si elle décrit le
  rapport (`docs/standards.md`, `README.md`).
- En cas d'échec des tests JS, le détail de l'étape garde, en plus du résumé actuel, le bloc des tests en échec que
  produit `node --test` : pour chaque test, son titre, son emplacement et le message de l'assertion avec ses valeurs.
  Le volume est borné (une limite nommée, par exemple 120 lignes) ; une coupe le dit en une ligne.
- Un contrôle vert reste aussi court qu'aujourd'hui. Le délai dépassé garde son message actuel.
- La sortie `--json` porte le même détail.
- À ne pas toucher : les autres étapes, l'ordre et le budget des tests, le cliquet et son plancher, `scripts/loop/`.

## Critères d'acceptation

1. Dans un dépôt temporaire dont un test échoue sur `assert.equal(1, 2)`, le rapport du contrôle contient le titre du
   test, son fichier et sa ligne, et les valeurs `1` et `2`.
2. Avec un très grand nombre de tests en échec, le détail reste borné et signale la coupe.
3. Un contrôle vert affiche exactement les mêmes lignes qu'avant.
4. `node --test tests/quality-check.test.cjs`, puis `node scripts/check.mjs`.

## Test d'acceptation attendu

`tests/quality-check.test.cjs` : un dépôt temporaire avec un test JS en échec, le rapport texte et `--json` relus.

## Hypothèses bloquantes

Aucune décision n'est attendue.

## Journal

- 19/10, orchestrateur : passe juste après T224, avant le reste de la phase Mémoire.
