---
id: T084
titre: Move the moment index regression tests next to the index tests
statut: a-faire
bloque_par: T005, T006, T008, T010, T011, T013, T014, T040, T041, T043, T044, T045, T067, T068, T069, T070, T074, T076, T077, T083, T145
adr: non
installe: non
harnais: non
supprime_tests: non
---

## Ce que le ticket livre

`tests/review-regressions.test.cjs` range dix-neuf tests par l'occasion qui les a fait écrire (une
revue), pas par ce qu'ils prouvent. Sept d'entre eux portent sur l'index des passages et sur son
branchement dans les deux runtimes. Après ce ticket, ces sept tests sont à côté des tests du même
comportement : cinq dans `tests/moment-index.test.cjs`, un dans `tests/session-runtime.test.cjs`
(nouveau, du nom du module qu'il prouve), un dans `tests/server-state-views.test.cjs`. Chaque test
garde son titre, son corps et ses assertions. Le fichier d'origine garde son nom pour l'instant : la
mesure `tests_nommes_par_chantier` ne bouge pas ici, elle baisse quand le fichier sera renommé.

## Sources

- Constats : TSTA-06
- Règle : `docs/standards.md`, section « Tests » (« Un fichier de test porte le nom d'un module ou d'un
  comportement » ; « Le nombre de cas de test ne baisse pas »).
- Code vérifié à la version `0d5a954`. Les tickets qui précèdent celui-ci (formatage, aides d'attente
  et horloges partagées, attentes) ont déplacé les lignes et remplacé des aides locales par celles de
  `tests/helpers/` : se fier aux titres.
  - `tests/review-regressions.test.cjs` : 19 tests, 383 lignes ; en-tête « Defects found by the
    independent review of the latency branch, each pinned by its failing case. » (`:20`).
  - Vers `tests/moment-index.test.cjs` :
    - « during an embeddings outage searches do not multiply failing requests: one per shared backoff
      step » (`:148`) ;
    - « a search holding an older copy of a passage does not discard the newer text being indexed »
      (`:164`) ;
    - « a vector appended after a torn line survives the next load » (`:177`, `EmbeddingStore`) ;
    - « the text of a spoken passage without description does not change when it is archived »
      (`:191`, `passageText`) ;
    - « a search during the pause that follows a provider failure answers at once instead of waiting
      its whole budget » (`:281`).
  - Vers `tests/session-runtime.test.cjs` (nouveau) : « the session runtime feeds published passages
    to the index, honours the opt-out, passes the lane options and closes the index » (`:249`,
    `createSessionRuntime`).
  - Vers `tests/server-state-views.test.cjs` : « the headless state exposes index counters only when
    an index exists » (`:272`, `HeadlessRuntime`).
  - Aides du fichier d'origine dont ces tests se servent, à `0d5a954` : `tick`, `settle`, `until`
    (`:21` à `:24`) ; `manualTimers()` (`:138`) ; `memoryCache` (cache indexé par « id + texte »,
    champ `values`) et `passage` (avec `status: 'ready'`) juste en dessous.
  - Aides homonymes mais différentes dans `tests/moment-index.test.cjs` : `memoryCache({ many })`
    (`:47`, champs `entries` et `writes`), `passage(n, summary)` (`:54`, sans `status`),
    `manualClock()` (`:17`). Le fichier importe déjà `MomentIndex`, `MomentSearch`, `passageText`,
    `EmbeddingStore`, et `node:fs/promises` sous le nom `fsp` (le fichier d'origine le nomme `fs`).
  - `tests/server-state-views.test.cjs` : 1 test ; construit déjà un `HeadlessRuntime`.
  - Aucun fichier `tests/session-runtime.test.cjs` n'existe ; `createSessionRuntime` n'a pas de fichier
    de test à son nom.
- Risque relevé par la relecture de l'audit : des tests réunis dans un même fichier partagent un
  processus ; chaque test déplacé est donc lancé seul, puis avec son fichier.
- Mécanique du contrôle, vérifiée dans `scripts/check.mjs` (fonction `fileRules`) : dans un fichier
  créé, la moindre ligne de plus de 160 caractères rend le contrôle rouge ; dans un fichier existant,
  le nombre de ces lignes ne doit pas monter.
- Ordre : des tickets des lots L01, L04, L05, L06 et L17 citent `tests/review-regressions.test.cjs`,
  `tests/moment-index.test.cjs` ou `tests/server-state-views.test.cjs` avec leur nombre de tests ; ce
  ticket passe après eux, et après la répartition de `tests/refactor-boundaries.test.cjs`, qui ajoute
  aussi des tests à `tests/moment-index.test.cjs`.

## Périmètre

- À modifier :
  - `tests/review-regressions.test.cjs` : perd les sept tests cités, et les aides et imports que plus
    aucun de ses tests n'utilise. Il garde son nom, son en-tête et ses autres tests.
  - `tests/moment-index.test.cjs` : reçoit les cinq tests, à la fin du fichier.
  - `tests/session-runtime.test.cjs` (nouveau) : un test, ses imports, un en-tête d'une ligne qui dit
    le comportement prouvé.
  - `tests/server-state-views.test.cjs` : reçoit un test, à la fin du fichier.
- Aides :
  - une aide que le fichier d'origine importe de `tests/helpers/` est importée de la même façon dans
    le fichier d'arrivée ; aucune aide partagée n'est créée ni modifiée ;
  - une aide locale du fichier d'origine qui porte le nom d'une aide différente du fichier d'arrivée
    (`memoryCache`, `passage`) suit ses tests sous un autre nom, qui dit sa différence (par exemple
    `textKeyedCache`, `readyPassage`) ; les aides du fichier d'arrivée ne changent pas ;
  - une aide locale que le fichier d'arrivée n'a pas suit ses tests sous son nom (à `0d5a954` : `until`
    pour le test du runtime de session, `manualTimers` pour trois tests de l'index) ;
  - une aide locale encore utilisée par un test qui reste est copiée, pas retirée du fichier d'origine
    (à `0d5a954` : `settle`, dont trois tests de la connexion Codex se servent encore ; elle s'appuie
    sur `tick`, que `tests/moment-index.test.cjs` définit déjà à l'identique et qui n'y est pas
    redéclaré).
- Un test déplacé garde son titre au caractère près, ses assertions et ses valeurs attendues. Les seuls
  changements permis dans son corps : le nom d'un import (`fs` → `fsp`) ou d'une aide renommée comme
  ci-dessus, la mise en forme du formateur, et la coupe en plusieurs morceaux concaténés d'une chaîne
  dont la ligne dépasse encore 160 caractères, sans changer son texte.
- Aucune ligne de plus de 160 caractères dans le fichier créé ; aucune ajoutée dans les trois autres.
- À ne pas toucher : le code de production ; les tests déjà présents dans les fichiers d'arrivée ; les
  tests qui restent dans le fichier d'origine (douze à `0d5a954`).

## Critères d'acceptation

Chaque critère se vérifie par un test ou une commande. « Commande des titres » désigne, lancée fichier
par fichier :

```sh
node --test --test-concurrency=1 --test-reporter=tap tests/<fichier>.test.cjs \
  | grep -E '^ *(not )?ok [0-9]+ - ' | sed -E 's/^ *(not )?ok [0-9]+ - //; s/ # (SKIP|TODO).*$//' | sort
```

1. Avant toute modification, la commande des titres et `grep -cE '^\s*test\(' ` sont lancés sur
   `tests/review-regressions.test.cjs`, `tests/moment-index.test.cjs` et
   `tests/server-state-views.test.cjs` ; sorties conservées dans le dossier d'état du ticket
   (`.harness-state/tickets/<id>/`, hors Git), avec une copie de `tests/moment-index.test.cjs` et de
   `tests/server-state-views.test.cjs`.
2. `grep -cE '^\s*test\(' ` rend, par rapport au critère 1 : 7 de moins pour
   `tests/review-regressions.test.cjs`, 5 de plus pour `tests/moment-index.test.cjs`, 1 de plus pour
   `tests/server-state-views.test.cjs` ; et 1 pour `tests/session-runtime.test.cjs`.
3. La commande des titres, lancée sur les quatre fichiers et réunie puis triée, rend exactement la
   réunion triée des trois listes du critère 1 : aucun titre perdu, ajouté, modifié ou en double.
   Comparaison (`diff`) dans le journal.
4. Chacun des sept titres cités dans « Sources » sort une fois de la commande des titres de son
   fichier d'arrivée, et ne sort plus de celle de `tests/review-regressions.test.cjs`.
5. Chacun des sept tests déplacés passe seul, par `--test-name-pattern` sur son fichier d'arrivée ;
   puis `node --test --test-concurrency=1` passe sans échec sur chacun des quatre fichiers.
6. Pour `tests/moment-index.test.cjs` puis `tests/server-state-views.test.cjs`,
   `diff <copie du critère 1> <fichier> | grep '^<'` ne sort rien, ou seulement des lignes d'import
   complétées : les fichiers d'arrivée ne perdent ni test ni assertion. Sortie dans le journal.
7. `awk 'length($0) > 160' tests/session-runtime.test.cjs | wc -l` rend 0.
8. `node -e "import('./scripts/quality/metrics.mjs').then((m) => console.log(m.measure('.')))"` :
   aucune mesure n'est au-dessus de sa valeur de `scripts/quality/baseline.json` (pour `cas_de_test`,
   aucune en dessous).
9. `node scripts/check.mjs` est vert.

## Test d'acceptation attendu

Les sept tests existants, inchangés, dans leurs fichiers d'arrivée. Frontières inchangées : `MomentIndex`
et `MomentSearch` sur des doubles de fournisseur, de cache et d'horloge ; `EmbeddingStore` sur un vrai
fichier temporaire ; `createSessionRuntime` avec des doubles de perception et d'embeddings ;
`HeadlessRuntime` en mode `smoke`.

## Hypothèses bloquantes

Aucune décision n'est attendue. Si un test déplacé passe dans son fichier d'origine et échoue dans son
fichier d'arrivée, seul ou avec le fichier : verdict BLOQUÉ, avec l'échec constaté ; le test n'est ni
modifié ni relancé jusqu'à ce qu'il passe.

## Journal
