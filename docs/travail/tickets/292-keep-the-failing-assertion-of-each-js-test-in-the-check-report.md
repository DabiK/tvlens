---
id: T292
titre: Keep the failing assertion of each JS test in the check report
statut: termine
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
- 19/10, Codex — exploration : règles, skill, contrôle, tests et ADR du harnais lus ; le filtre de
  `jsTests` supprime les blocs d'assertion. Aucun écart prévu (`.harness-state/tickets/T292/ecarts.md`).
- 19/10, Codex — assertions : `node --test --test-name-pattern='retains every failing assertion'
  tests/quality-check.test.cjs` : 4 rouges observés sur l'absence du fichier et de la ligne d'assertion.
  Après conservation du bloc Node, `node --test --test-name-pattern='retains every failing assertion|green check keeps'
  tests/quality-check.test.cjs` : 6 verts (texte/JSON, complet/modifiés, sortie verte inchangée).
- 19/10, Codex — volume : `node --test --test-name-pattern='bounds many failing assertions'
  tests/quality-check.test.cjs` : 2 rouges sur 1 090 lignes au lieu de 120, puis 2 verts avec une limite
  nommée, coupe signalée comprise. Une première fixture à 200 échecs dépassait la sortie récupérée par
  le processus ; ramenée à 50 pour observer le rouge sur l'assertion de volume. Sorties conservées dans
  `.harness-state/tickets/T292/` ; documentation du rapport ajoutée aux standards.
- 19/10, Codex — vérifications : `node --test tests/quality-check.test.cjs` : 49/49 verts, arrêt sur
  délai dépassé compris ; `node scripts/check.mjs --changed` : vert (règles, format, lint, gel,
  cliquet et 49 tests). Journaux `quality-check.log` et `check-changed.log` dans le dossier d'état.
- 19/10, Codex — contrôle final : `node scripts/check.mjs` : vert, 2 973 tests JS sur 153 fichiers et
  54 tests Python ; règles, format, lint, gel et cliquet verts (`check-full.log`). Verdict `TERMINÉ`
  écrit dans le dossier d'état ; relecture et intégration laissées à la boucle, sans commit ni push.
- 19/10, Codex — reprise après relecture 1 : constat mineur accepté, paragraphe hors périmètre retiré
  de `docs/standards.md`, désormais identique à HEAD. Avant correction documentaire,
  `node --test tests/quality-check.test.cjs` : 49/49 verts (`correction-1-quality-check.log`).
  Aucun comportement ni test modifié, aucun écart ni contestation.
- 19/10, Codex — vérification de correction : `git diff --exit-code -- docs/standards.md` et
  `git diff --check` : codes 0 ; `node scripts/check.mjs --changed` : vert, 49 tests JS ;
  `node scripts/check.mjs` : vert, 2 973 tests JS et 54 tests Python. Preuves dans
  `correction-1-check-changed.log` et `correction-1-check-full.log`. Nouveau verdict `TERMINÉ`,
  sans commit ni push ; relecture et intégration laissées à la boucle.

### Réserves à la clôture

- .harness-state/tickets/T292/relecture-2.md : 2. `scripts/check.mjs:229-239`, rapport coupé vers 64 Ko (hors périmètre) : toujours une réserve

  - **Ce qui ne va pas.** Le constat tient toujours :
    - `console.log` est suivi d'un `process.exit` immédiat (ligne 239) ;
    - les lignes `actual:` et `expected:` ne sont pas bornées en largeur ;
    - en sortie par tube, plusieurs échecs sur de longues valeurs peuvent couper la sortie, et `--json` devient alors illisible.
  - **Pourquoi hors périmètre.** La correction ne touche pas ce code. Le ticket ne borne le volume qu'en lignes et ne demande pas de modifier la sortie du script.
  - **Ce qui est attendu.** Un ticket de suite, qui fait l'une de ces deux choses :
    - borner aussi le détail en caractères ;
    - remplacer `process.exit` par `process.exitCode`.
