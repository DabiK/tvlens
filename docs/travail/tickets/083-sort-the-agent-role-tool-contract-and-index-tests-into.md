---
id: T083
titre: Sort the agent role, tool contract and index tests into behaviour files
statut: a-faire
bloque_par: T047, T048, T049, T050, T052, T054, T065
adr: non
installe: non
harnais: non
supprime_tests: non
---

## Ce que le ticket livre

`tests/refactor-boundaries.test.cjs` porte le nom d'une opération passée et mêle trois sujets : le rôle
des deux agents Codex, le contrat des outils vidéo et l'index des passages. Après ce ticket, le fichier
s'appelle `tests/codex-agent-roles.test.cjs` et ne garde que les trois tests des agents ; les deux
tests de l'index sont dans `tests/moment-index.test.cjs` ; le test du contrat des outils est dans
`tests/video-tool-contracts.test.cjs`, du nom du module qu'il prouve. Les six tests existent toujours,
avec le même titre et le même corps. La mesure `tests_nommes_par_chantier` baisse de 1.

## Sources

- Constats : TSTA-06, DOC-06
- Règle : `docs/standards.md`, section « Tests » (« Un fichier de test porte le nom d'un module ou d'un
  comportement » ; « Le nombre de cas de test ne baisse pas »).
- Code vérifié à la version `0d5a954`. Les tickets qui précèdent celui-ci (formatage, aides de test
  partagées) ont pu déplacer les lignes et remplacer des aides locales : se fier aux noms et aux titres.
  - `tests/refactor-boundaries.test.cjs` : 6 tests, 246 lignes, aucune ligne de plus de 160 caractères.
    Aide locale `rpcFixture(onTurn)` (`:11`), utilisée par trois tests seulement.
  - Tests des agents, qui restent : « analysis advertises no tools, disables web and rejects a tool
    call at the RPC boundary » (`:55`, `CodexAnalysisAgent`) ; « chat dispatches tools and applies
    changed model selection on subsequent turns » (`:92`, `CodexSessionAgent`) ; « chat reasoning
    effort is configurable without changing perception default » (`:232`, `CodexSessionClient` et
    `createConversationRuntime`, importés dans le test).
  - Test du contrat, qui part : « MCP and Codex expose the same tool names and argument fields »
    (`:150`) ; il n'utilise que `videoToolDefinitions` (`core/video-tool-contracts.cjs`), `dynamicTools`
    (`adapters/codex-tool-definitions.cjs`) et `mcpToolDefinitions` (`mcp/tool-definitions.cjs`).
  - Tests de l'index, qui partent : « index is lazy, reuses vectors, and search never embeds passages
    after the question anchor » (`:168`) ; « cancelled indexing does not cache a late embedding or
    continue to the next passage » (`:203`). Ils n'utilisent que `MomentIndex`, `MomentSearch` et des
    doubles écrits dans le test : aucune aide du fichier.
  - `tests/moment-index.test.cjs` : 22 tests ; importe déjà `MomentIndex` et `MomentSearch`.
  - Aucun fichier `tests/video-tool-contracts.test.cjs` ni `tests/codex-agent-roles.test.cjs`
    n'existe ; aucun autre fichier de test ne prouve l'égalité des trois listes d'outils.
  - `tests/surveillance-runtime.test.cjs`, commentaire au-dessus de `appServer` (`:79`) : « Fake App
    Server on the model of tests/refactor-boundaries.test.cjs… ». Un ticket antérieur a pu retirer
    cette aide et son commentaire.
  - `docs/architecture-improvements/history/F10.md:107` cite le nom nu `refactor-boundaries` dans un
    décompte daté : il reste tel quel.
- Mécanique de la boucle, vérifiée dans `scripts/loop/run.mjs` : une entrée de `git status` qui contient
  « D » sous `tests/` est refusée quand `supprime_tests` vaut non. Un renommage fait par `git mv`
  apparaît en « R » : il passe. Le fichier renommé garde plus de la moitié de son contenu.
- Mécanique du contrôle, vérifiée dans `scripts/check.mjs` (fonction `fileRules`) : dans un fichier
  renommé ou créé, la moindre ligne de plus de 160 caractères rend le contrôle rouge ; dans un fichier
  existant, le nombre de ces lignes ne doit pas monter.
- Ordre : des tickets des lots L04 et L05 comptent les tests de `tests/moment-index.test.cjs` dans
  leurs critères ; ce ticket passe après eux.

## Périmètre

- À modifier :
  - `tests/refactor-boundaries.test.cjs` → `tests/codex-agent-roles.test.cjs`, par `git mv` (le
    fichier renommé n'est pas ré-indexé ensuite, pour que Git le voie toujours comme un renommage). Il
    garde `rpcFixture` et les trois tests des agents ; les imports devenus inutiles sont retirés ; un
    en-tête d'une ligne dit le comportement prouvé (le rôle d'analyse n'a aucun outil, le rôle de
    conversation en a et suit les réglages).
  - `tests/moment-index.test.cjs` : reçoit les deux tests de l'index, à la fin du fichier, avec leurs
    doubles écrits sur place. Les aides existantes du fichier ne changent pas.
  - `tests/video-tool-contracts.test.cjs` (nouveau) : le test du contrat et ses trois imports.
  - `tests/surveillance-runtime.test.cjs` : si le commentaire cité existe encore, il nomme
    `tests/codex-agent-roles.test.cjs`. Rien d'autre n'y change.
- Un test déplacé garde son titre au caractère près, son corps et ses assertions ; seule la mise en
  forme du formateur peut différer.
- Aucune ligne de plus de 160 caractères dans le fichier renommé ni dans le fichier créé ; aucune
  ajoutée dans les deux autres.
- À ne pas toucher : le code de production ; les autres tests de `tests/moment-index.test.cjs` ; le
  commentaire de `scripts/quality/metrics.mjs`, qui cite l'ancien nom comme exemple de la règle ;
  l'historique `docs/architecture-improvements/history/`.

## Critères d'acceptation

Chaque critère se vérifie par un test ou une commande. « Commande des titres » désigne, lancée fichier
par fichier :

```sh
node --test --test-concurrency=1 --test-reporter=tap tests/<fichier>.test.cjs \
  | grep -E '^ *(not )?ok [0-9]+ - ' | sed -E 's/^ *(not )?ok [0-9]+ - //; s/ # (SKIP|TODO).*$//' | sort
```

1. Avant toute modification, la commande des titres et `grep -cE '^\s*test\(' ` sont lancés sur
   `tests/refactor-boundaries.test.cjs` et `tests/moment-index.test.cjs` ; sorties conservées dans le
   dossier d'état du ticket (`.harness-state/tickets/<id>/`, hors Git), avec une copie de
   `tests/moment-index.test.cjs`. À `0d5a954` : 6 et 22.
2. `test -e tests/refactor-boundaries.test.cjs` échoue ; `test -e` réussit sur
   `tests/codex-agent-roles.test.cjs` et `tests/video-tool-contracts.test.cjs`.
3. `grep -cE '^\s*test\(' ` rend 3 pour `tests/codex-agent-roles.test.cjs`, 1 pour
   `tests/video-tool-contracts.test.cjs`, et le nombre relevé au critère 1 plus 2 pour
   `tests/moment-index.test.cjs`.
4. La commande des titres, lancée sur les trois fichiers et réunie puis triée, rend exactement la
   réunion triée des deux listes du critère 1 : aucun titre perdu, ajouté, modifié ou en double.
   Comparaison (`diff`) dans le journal.
5. Chacun des trois tests déplacés passe seul, par `--test-name-pattern` sur son nouveau fichier, puis
   avec son fichier entier : `node --test --test-concurrency=1 tests/codex-agent-roles.test.cjs`,
   puis `tests/video-tool-contracts.test.cjs`, puis `tests/moment-index.test.cjs`, sans échec.
6. `awk 'length($0) > 160' <fichier> | wc -l` rend 0 pour `tests/codex-agent-roles.test.cjs` et
   `tests/video-tool-contracts.test.cjs`.
7. `grep -rl 'refactor-boundaries' tests/` ne sort aucun fichier.
8. `grep -cE 'MomentIndex|MomentSearch|mcpToolDefinitions|videoToolDefinitions' tests/codex-agent-roles.test.cjs`
   rend 0.
9. `diff <copie du critère 1> tests/moment-index.test.cjs | grep '^<'` ne sort rien : le fichier
   d'arrivée ne perd ni test ni assertion, il ne fait que recevoir.
10. `node -e "import('./scripts/quality/metrics.mjs').then((m) => console.log(m.measure('.')))"` :
    `tests_nommes_par_chantier` vaut la valeur de `scripts/quality/baseline.json` moins 1 ;
    `cas_de_test` n'est pas sous sa valeur du plancher.
11. `node scripts/check.mjs` est vert.

## Test d'acceptation attendu

Les six tests existants, inchangés : trois dans `tests/codex-agent-roles.test.cjs` (agents Codex
derrière le double `rpcFixture`), deux dans `tests/moment-index.test.cjs` (index et recherche sur des
doubles de fournisseur et de cache), un dans `tests/video-tool-contracts.test.cjs` (les trois listes
d'outils publiées).

## Hypothèses bloquantes

Aucune décision n'est attendue. Si `git mv` est refusé à la session, ou si un test déplacé passe dans
son fichier d'origine et échoue dans son nouveau fichier : verdict BLOQUÉ, avec le refus ou l'échec
constaté.

## Journal
