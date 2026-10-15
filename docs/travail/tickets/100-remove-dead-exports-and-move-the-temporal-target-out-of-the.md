---
id: T100
titre: Remove dead exports and move the temporal target out of the session module
statut: termine
bloque_par: T163
adr: non
installe: non
harnais: non
supprime_tests: non
niveau: standard
---

## Ce que le ticket livre

Plusieurs modules exportent des noms que personne n'importe. Une fonction et une constante n'ont même aucun
appelant. Et `core/moment-search.cjs`, un service de recherche, importe le module de session
`core/session.cjs`, rien que pour une fonction de lecture de la question. Le service de recherche dépend
ainsi du cas d'usage qui l'appelle.

Après ce ticket :

- le code sans appelant a disparu, et les exports sans lecteur sont retirés ;
- la résolution d'une cible temporelle vit dans son propre module, que la session et la recherche importent
  toutes deux. Un test de caractérisation fige ses réponses avant le déplacement ;
- un test d'architecture interdit à un module de `core/` d'importer `./session.cjs`.

Aucun comportement ne change.

## Sources

- Constats : OUBLI-09, CORE-05, ADP-11. Décision du propriétaire, le 15/10 : attente de T150,
  retrait de T028/T145 et critères d’absence limités au code, hors documents historiques.
- Code vérifié à la version `e92c6a6` :
  - Sans aucun appelant :
    - `core/deep-ask.cjs`, fonction `needsInspection` (lignes 2-4), exportée ligne 174 ;
    - `adapters/codex-confinement.cjs`, `const OPEN_ACTIONS` ligne 442, jamais lue. Le commentaire des
      lignes 434-441 décrit `openedPages`, qui suit : il reste.
  - Exports à retirer après migration des lecteurs indiqués :
    - `core/moment-search.cjs`, `cosine` (ligne 9), et `passageText` réexporté, dans l'export ligne 163 ;
    - `core/perception-context.cjs`, `observedTopic`, export ligne 68 ;
    - `core/surveillance.cjs`, `DEFAULT_LIMITS` (ligne 45) et `TEXT_LIMITS` (ligne 71), export ligne 920 ;
    - `core/transcription-language.cjs`, `TRANSCRIPTION_LANGUAGES`, export ligne 6 ;
    - `runtime/surveillance-runtime.cjs`, `SAVE_INTERVAL_MS`, dans l'export ligne 550 ;
    - `runtime/headless-runtime.cjs`, `VIEWS` : défini à `runtime/headless-runtime.cjs:33`, lu par
      `viewName` à `runtime/headless-runtime.cjs:407`, exporté à `runtime/headless-runtime.cjs:1112`.
      Aucun lecteur externe de cet export n’a été trouvé. `runtime/state-views.cjs` et son test n’existent
      pas encore à cette version : T147 prévoit leur création et un réexport de `VIEWS` par l’hôte.
  - `core/living-recap.cjs:1` importe `passageText` depuis `./moment-search.cjs`. Les autres modules le
    prennent dans `./passage-text.cjs`, où il est défini.
  - `core/session.cjs` :
    - fonction `resolveTemporalTarget` (lignes 512-522). Deux de ses lignes dépassent 160 caractères :
      l'objet `numbers` (183) et l'expression `relative = q.match(/(?:il y a|y a|depuis)…/)` (189) ;
    - appelée dans `WatchSession` (ligne 383) et dans `selectEvidence` (ligne 524) ;
    - export à `core/session.cjs:537` : `{ WatchSession, selectEvidence, resolveTemporalTarget, restorable, recoveredPassage }`.
  - `core/moment-search.cjs:3` importe `resolveTemporalTarget` de `./session.cjs`. C'est le seul module de
    `core/` qui importe `./session.cjs`.
  - Hors de `core/`, `resolveTemporalTarget` n'est lue par aucun script ni test. Les tests ne la couvrent que
    par `selectEvidence` (`tests/session.test.cjs`, questions « Il y a une minute ») et par la recherche.
  - `scripts/probe-live.cjs:7` importe `WatchSession` ; `scripts/evaluate-actions.cjs:4` importe
    `MomentSearch`. Aucun n’importe directement `resolveTemporalTarget` ; ces imports restent inchangés.
  - `tests/architecture.test.cjs`, premier test : règle des imports de `core/` (relatifs, sans `..`). C'est
    le seul fichier des règles de couches.
  - Gardé volontairement, parce qu'il a un lecteur hors de son fichier : `HeadlessRuntime.listeners`, lu par
    `scripts/replay-lg-stream.cjs:121`.
- L’inventaire des symboles dans `core/`, `adapters/`, `runtime/`, `app/`, `server/`, `mcp/`, `tv/`,
  `scripts/` et `tests/` confirme les lecteurs décrits ci-dessus. Les rapports, tickets et ADR sont des
  sources historiques, pas des appelants : ils contiennent légitimement ces noms.
- Tests lus qui protègent les zones touchées : `tests/session.test.cjs:70` (cible relative via
  `selectEvidence`), `tests/moment-index.test.cjs`, `tests/living-recap.test.cjs`,
  `tests/perception-context.test.cjs`, `tests/surveillance.test.cjs`, `tests/surveillance-runtime.test.cjs`,
  `tests/transcription-language.test.cjs`, `tests/server-state-views.test.cjs`,
  `tests/timeline-server.test.cjs` et `tests/remote-server.test.cjs`.
- `scripts/check.mjs` refuse un fichier dont le nombre de lignes de plus de 160 caractères augmente. Un
  fichier nouveau part de zéro.

## Périmètre

À créer, dans cet ordre :

1. `tests/temporal-target.test.cjs`, un test de caractérisation de `resolveTemporalTarget`, écrit et vert
   avant tout déplacement, en important la fonction depuis `core/session.cjs`. Une table de questions, avec
   une ancre et des segments fixes, couvre :
   - un délai en chiffres, entier et décimal à virgule (« il y a 30 secondes », « y a 1,5 min ») ;
   - un délai en lettres, minutes et secondes (« il y a deux minutes », « depuis une seconde ») ;
   - majuscules et accents (« Il y a UNE minute », « au tout début ») ;
   - un temps absolu (« vers 12:34 », « au moment 1:05 ») ;
   - une question qui porte à la fois un délai et un temps absolu ;
   - « premier passage » avec des segments, puis sans segment ;
   - une question sans repère temporel.
   Les valeurs attendues sont celles que rend la fonction d'origine, relevées par `node -e` avant le
   déplacement. La commande et sa sortie figurent au journal.
2. `core/temporal-target.cjs`, qui exporte `resolveTemporalTarget`. Le corps est déplacé tel quel, sauf les
   deux lignes de plus de 160 caractères, coupées pour le fichier nouveau.

À modifier :

- `tests/temporal-target.test.cjs` : seule sa ligne d'import passe à `core/temporal-target.cjs`.
- `core/session.cjs` : retirer la fonction et l'importer depuis `./temporal-target.cjs` ; ne plus
  l'exporter.
- `core/moment-search.cjs` : importer depuis `./temporal-target.cjs` ; exporter `{ MomentSearch }` seul.
- `core/living-recap.cjs:1` : importer `passageText` depuis `./passage-text.cjs`.
- `core/deep-ask.cjs` : supprimer `needsInspection` et la retirer de l'export.
- `adapters/codex-confinement.cjs` : supprimer la ligne `const OPEN_ACTIONS`.
- Retirer des exports : `observedTopic`, `DEFAULT_LIMITS`, `TEXT_LIMITS`, `TRANSCRIPTION_LANGUAGES`,
  `SAVE_INTERVAL_MS`, et le réexport inutilisé `VIEWS` de `runtime/headless-runtime.cjs`. Les définitions
  utilisées restent. Si T147 est intégré avant ce ticket, inventorier `runtime/state-views.cjs` et son
  test : conserver tout export `VIEWS` que l’hôte importe réellement depuis ce module, et retirer
  seulement le réexport de l’hôte resté sans lecteur. Aucun déplacement des vues dans ce ticket.
- `tests/architecture.test.cjs` : un test qui échoue si un module de `core/` autre que `session.cjs`
  importe `./session.cjs`.

À ne pas toucher :

- `cleanupRawMedia` et son commentaire (`adapters/local-store.cjs`) : hors de cet inventaire d’exports.
- `validateDetection` et `validateRecap` : fonctions actives hors de cet inventaire de code mort.
- `HeadlessRuntime.listeners`.

## Critères d'acceptation

Chaque critère se vérifie par un test ou une commande.

1. `git grep -nwE 'needsInspection|OPEN_ACTIONS' -- core adapters runtime app server mcp tv scripts tests`
   ne rend rien. Les documents historiques (`docs/audit-maintenabilite.md`, tickets et ADR compris)
   ne sont pas soumis aux critères d’absence.
2. `git grep -n "resolveTemporalTarget" -- core` ne rend que des lignes de `core/temporal-target.cjs`, de
   `core/session.cjs` et de `core/moment-search.cjs`. `git grep -n "session.cjs" -- core` ne rend rien.
3. Pour chacun de `cosine`, `observedTopic`, `DEFAULT_LIMITS`, `TEXT_LIMITS`, `TRANSCRIPTION_LANGUAGES`,
   `SAVE_INTERVAL_MS`, l’inventaire sur les dossiers de code du critère 1 ne rend que des usages internes
   dans leur fichier de définition. Aucun de ces noms n’est exporté. `passageText` n’est plus exporté
   par `moment-search.cjs` ; son lecteur `living-recap.cjs` l’importe de `passage-text.cjs`. `VIEWS` n’est
   plus exporté par `headless-runtime.cjs` ; son éventuel export depuis `state-views.cjs` ne reste que
   s’il a un lecteur réel. Le journal donne l’inventaire final et le module propriétaire de `VIEWS`.
4. `node --test tests/temporal-target.test.cjs` passe avant le déplacement (import depuis
   `core/session.cjs`) et après (import depuis `core/temporal-target.cjs`). Entre les deux, seule la ligne
   d'import du test change. Les deux sorties figurent au journal.
5. `node --test tests/architecture.test.cjs` passe. Le nouveau test échoue si l'on remet
   `require("./session.cjs")` dans `core/moment-search.cjs` ; l'agent le constate une fois et note la sortie
   au journal.
6. Les tests protecteurs listés dans les sources passent, lancés un fichier à la fois avec `node --test`,
   sans changement de leurs assertions. Si T147 a créé `tests/state-views.test.cjs`, il est aussi exécuté
   sans modification. Le journal en donne la liste et le résultat.
7. `awk 'length > 160' core/temporal-target.cjs` ne rend rien.
8. `node scripts/check.mjs` est vert. La mesure `lignes_longues_prod` baisse au moins du nombre de lignes de plus de
   160 caractères que la fonction comptait dans `core/session.cjs` ; le retrait de `needsInspection`
   (`core/deep-ask.cjs:3`) peut en retirer d'autres, comptées à part au journal. L'agent relève ce nombre au début de la
   session (le format a pu le changer) et le note au journal.

## Test d'acceptation attendu

`tests/temporal-target.test.cjs`, nouveau. Frontière : la fonction pure `resolveTemporalTarget`, avec une
question, des segments et une ancre fixes. Il fige ses réponses avant le déplacement, et la coupe des deux
lignes trop longues ne peut pas les changer sans qu'il échoue. S'y ajoute le nouveau test de
`tests/architecture.test.cjs`, sur le texte source des modules de `core/`.

## Hypothèses bloquantes

Aucune décision n'est attendue.

T150 est le seul bloqueur de file. T147 n’est pas un prérequis nécessaire au retrait de l’export de
l’hôte : la fiche traite explicitement les deux placements possibles de sa définition. Son état sera
relevé au début de l’implémentation ; l’extraction des vues ne doit pas être faite ici.

Si un `git grep` trouve un lecteur d'un des noms à retirer qui n'existait
pas à la version citée, ce nom reste exporté et le journal dit pourquoi. Si un test existant dépend d'un de
ces exports, verdict BLOQUÉ : le test n'est pas modifié dans ce ticket. Si la coupe de l'expression
`relative` ne peut pas garder exactement les réponses de la table, l'expression d'origine est gardée telle
quelle, découpée par concaténation de chaînes dans un `new RegExp`, et le journal le dit.

## Journal

Rafraîchi le 15/10 contre `e92c6a6` : T150 remplace T028/T145, repères de `VIEWS` actualisés,
absence actuelle de `state-views` établie et cas d’un T147 intégré pris en compte. Les critères excluent
les documents historiques et vérifient aussi le changement d’import de `passageText`. Aucun test exécuté.

- Relecture documentaire le 15/10 contre `e92c6a6` : sources rendues pérennes dans
  `docs/audit-points-chauds.md` ou attribuées à la décision du propriétaire, le 15/10.

- Exploration Codex le 15/10 sur `bf2b056` : inventaire `git grep -nwE` dans les
  dossiers de code, aucun lecteur supplémentaire des noms à retirer. T147 intégré :
  `runtime/state-views.cjs` possède `VIEWS`, réellement importé par l'hôte ; seul le
  réexport de `headless-runtime.cjs` sera retiré. Exploration et écarts prévus dans
  `.harness-state/tickets/T100/`. Aucun sous-agent, commit ni push.
- Mesure initiale par `node --input-type=module -e` utilisant
  `scripts/quality/metrics.mjs` : `lignes_longues_prod = 512`. La fonction temporelle
  compte deux lignes longues (514 : 183 caractères ; 515 : 189), `needsInspection`
  une ligne supplémentaire (3 : 266). Réduction attendue : au moins trois.

- Caractérisation avant déplacement : commande exacte et valeurs relevées sur la fonction
  d’origine par `node -e` :

```sh
$ node -e 'const {resolveTemporalTarget} = require("./core/session.cjs");
const anchorMs = 180000;
const segments = [{id:"moment-1",startMs:12000,endMs:30000},{id:"moment-2",startMs:30000,endMs:60000}];
const cases = [
["il y a 30 secondes",segments],
["y a 1,5 min",segments],
["il y a deux minutes",segments],
["depuis une seconde",segments],
["Il y a UNE minute",segments],
["au tout début",segments],
["vers 12:34",segments],
["au moment 1:05",segments],
["il y a 30 secondes, vers 12:34",segments],
["premier passage",segments],
["premier passage",[]],
["Que voit-on ?",segments]
];
console.log("anchorMs =",anchorMs,"segments =",JSON.stringify(segments));
for (const [question,passages] of cases) console.log(JSON.stringify({question,segments:passages.length}),"=>",resolveTemporalTarget(question,passages,anchorMs));'
anchorMs = 180000 segments = [{"id":"moment-1","startMs":12000,"endMs":30000},{"id":"moment-2","startMs":30000,"endMs":60000}]
{"question":"il y a 30 secondes","segments":2} => 150000
{"question":"y a 1,5 min","segments":2} => 90000
{"question":"il y a deux minutes","segments":2} => 60000
{"question":"depuis une seconde","segments":2} => 179000
{"question":"Il y a UNE minute","segments":2} => 120000
{"question":"au tout début","segments":2} => 12001
{"question":"vers 12:34","segments":2} => 754000
{"question":"au moment 1:05","segments":2} => 65000
{"question":"il y a 30 secondes, vers 12:34","segments":2} => 754000
{"question":"premier passage","segments":2} => 12001
{"question":"premier passage","segments":0} => undefined
{"question":"Que voit-on ?","segments":2} => undefined

exit=0
```

- `node --test tests/temporal-target.test.cjs` avant déplacement, import depuis
  `core/session.cjs` :

```text
✔ temporal target preserves integer seconds (0.7105ms)
✔ temporal target preserves decimal comma minutes (0.123583ms)
✔ temporal target preserves spelled minutes (0.032208ms)
✔ temporal target preserves spelled seconds (0.0295ms)
✔ temporal target preserves uppercase words (0.036167ms)
✔ temporal target preserves accented beginning (0.063542ms)
✔ temporal target preserves absolute minutes and seconds (0.027292ms)
✔ temporal target preserves absolute moment (0.029208ms)
✔ temporal target preserves absolute overrides relative (0.037292ms)
✔ temporal target preserves first passage (0.069542ms)
✔ temporal target preserves first passage without segments (0.034292ms)
✔ temporal target preserves no temporal reference (0.028167ms)
ℹ tests 12
ℹ suites 0
ℹ pass 12
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 30.519209
```

- Garde ajoutée avant toute modification de production :
  `node --test tests/architecture.test.cjs`, sortie rouge observée sur son assertion :

```text
✔ portable core has no Electron, provider, platform or adapter imports (5.042833ms)
✔ shared runtime and headless transport do not import Electron (1.91725ms)
✖ core services do not import the session use case (0.507417ms)
✔ active Codex roles do not depend on the legacy MCP transport (1.152875ms)
ℹ tests 4
ℹ suites 0
ℹ pass 3
ℹ fail 1
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 35.685083

✖ failing tests:

test at tests/architecture.test.cjs:20:1
✖ core services do not import the session use case (0.507417ms)
  AssertionError [ERR_ASSERTION]: moment-search.cjs depends on the session use case
      at TestContext.<anonymous> (/Users/Dabi/Documents/ISN/tvlens/tests/architecture.test.cjs:27:14)
      at Test.runInAsyncScope (node:async_hooks:214:14)
      at Test.run (node:internal/test_runner/test:1106:25)
      at Test.processPendingSubtests (node:internal/test_runner/test:788:18)
      at Test.postRun (node:internal/test_runner/test:1235:19)
      at Test.run (node:internal/test_runner/test:1163:12)
      at async Test.processPendingSubtests (node:internal/test_runner/test:788:7) {
    generatedMessage: false,
    code: 'ERR_ASSERTION',
    actual: './session.cjs',
    expected: './session.cjs',
    operator: 'notStrictEqual',
    diff: 'simple'
  }
```

- Extraction et retraits appliqués. La regex relative seule mesure 160 caractères ;
  son motif original est conservé en deux chaînes concaténées dans `new RegExp`,
  repli prévu au ticket. Le contrôle rapide du hook a signalé une suppression ESLint
  devenue inutile après le retrait de la constante morte.
  `node_modules/.bin/eslint --prune-suppressions adapters/codex-confinement.cjs core/session.cjs core/deep-ask.cjs core/temporal-target.cjs`
  sort 0 ; seul le gel `no-unused-vars` de confinement baisse (1 → absent).

- Après déplacement, import depuis core/temporal-target.cjs ; comparaison avec la copie initiale : seule cette ligne change. `node --test tests/temporal-target.test.cjs` :

```text
✔ temporal target preserves integer seconds (0.4565ms)
✔ temporal target preserves decimal comma minutes (0.124667ms)
✔ temporal target preserves spelled minutes (0.032375ms)
✔ temporal target preserves spelled seconds (0.032ms)
✔ temporal target preserves uppercase words (0.034292ms)
✔ temporal target preserves accented beginning (0.06675ms)
✔ temporal target preserves absolute minutes and seconds (0.364917ms)
✔ temporal target preserves absolute moment (0.04475ms)
✔ temporal target preserves absolute overrides relative (0.050292ms)
✔ temporal target preserves first passage (0.092709ms)
✔ temporal target preserves first passage without segments (0.036875ms)
✔ temporal target preserves no temporal reference (0.030541ms)
ℹ tests 12
ℹ suites 0
ℹ pass 12
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 30.684375
```

- Après extraction. `node --test tests/architecture.test.cjs` :

```text
✔ portable core has no Electron, provider, platform or adapter imports (8.440791ms)
✔ shared runtime and headless transport do not import Electron (1.483542ms)
✔ core services do not import the session use case (0.925166ms)
✔ active Codex roles do not depend on the legacy MCP transport (1.263917ms)
ℹ tests 4
ℹ suites 0
ℹ pass 4
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 38.871625
```

- Mutation temporaire : remise de require("./session.cjs") dans moment-search, un seul essai. `node --test tests/architecture.test.cjs` :

```text
$ node --test tests/architecture.test.cjs
✔ portable core has no Electron, provider, platform or adapter imports (5.43275ms)
✔ shared runtime and headless transport do not import Electron (1.869667ms)
✖ core services do not import the session use case (0.534667ms)
✔ active Codex roles do not depend on the legacy MCP transport (1.147584ms)
ℹ tests 4
ℹ suites 0
ℹ pass 3
ℹ fail 1
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 36.022709

✖ failing tests:

test at tests/architecture.test.cjs:20:1
✖ core services do not import the session use case (0.534667ms)
  AssertionError [ERR_ASSERTION]: moment-search.cjs depends on the session use case
      at TestContext.<anonymous> (/Users/Dabi/Documents/ISN/tvlens/tests/architecture.test.cjs:27:14)
      at Test.runInAsyncScope (node:async_hooks:214:14)
      at Test.run (node:internal/test_runner/test:1106:25)
      at Test.processPendingSubtests (node:internal/test_runner/test:788:18)
      at Test.postRun (node:internal/test_runner/test:1235:19)
      at Test.run (node:internal/test_runner/test:1163:12)
      at async Test.processPendingSubtests (node:internal/test_runner/test:788:7) {
    generatedMessage: false,
    code: 'ERR_ASSERTION',
    actual: './session.cjs',
    expected: './session.cjs',
    operator: 'notStrictEqual',
    diff: 'simple'
  }

exit=1
```

- Import correct restauré immédiatement, puis vert. `node --test tests/architecture.test.cjs` :

```text
✔ portable core has no Electron, provider, platform or adapter imports (2.527833ms)
✔ shared runtime and headless transport do not import Electron (0.446833ms)
✔ core services do not import the session use case (0.900792ms)
✔ active Codex roles do not depend on the legacy MCP transport (0.302334ms)
ℹ tests 4
ℹ suites 0
ℹ pass 4
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 30.8605
```

- Tests protecteurs lancés en séquentiel, un fichier par commande, assertions
  existantes inchangées ; 97 tests réussis, zéro échec ni test ignoré. Les sorties
  intégrales sont conservées dans `.harness-state/tickets/T100/protect-*.log`.

  - `node --test tests/session.test.cjs` : sortie 0 ; ℹ tests 8, ℹ pass 8, ℹ fail 0, ℹ skipped 0.
  - `node --test tests/moment-index.test.cjs` : sortie 0 ; ℹ tests 22, ℹ pass 22, ℹ fail 0, ℹ skipped 0.
  - `node --test tests/living-recap.test.cjs` : sortie 0 ; ℹ tests 17, ℹ pass 17, ℹ fail 0, ℹ skipped 0.
  - `node --test tests/perception-context.test.cjs` : sortie 0 ; ℹ tests 7, ℹ pass 7, ℹ fail 0, ℹ skipped 0.
  - `node --test tests/surveillance.test.cjs` : sortie 0 ; ℹ tests 17, ℹ pass 17, ℹ fail 0, ℹ skipped 0.
  - `node --test tests/surveillance-runtime.test.cjs` : sortie 0 ; ℹ tests 14, ℹ pass 14, ℹ fail 0, ℹ skipped 0.
  - `node --test tests/transcription-language.test.cjs` : sortie 0 ; ℹ tests 2, ℹ pass 2, ℹ fail 0, ℹ skipped 0.
  - `node --test tests/server-state-views.test.cjs` : sortie 0 ; ℹ tests 1, ℹ pass 1, ℹ fail 0, ℹ skipped 0.
  - `node --test tests/timeline-server.test.cjs` : sortie 0 ; ℹ tests 2, ℹ pass 2, ℹ fail 0, ℹ skipped 0.
  - `node --test tests/remote-server.test.cjs` : sortie 0 ; ℹ tests 2, ℹ pass 2, ℹ fail 0, ℹ skipped 0.
  - `node --test tests/state-views.test.cjs` : sortie 0 ; ℹ tests 5, ℹ pass 5, ℹ fail 0, ℹ skipped 0.

- Inventaire final et mesure, commandes et sorties :

```text
$ git grep -nwE 'needsInspection|OPEN_ACTIONS' -- core adapters runtime app server mcp tv scripts tests
exit=1

$ git grep -n resolveTemporalTarget -- core
core/moment-search.cjs:3:const { resolveTemporalTarget } = require("./temporal-target.cjs");
core/moment-search.cjs:60:    const target = resolveTemporalTarget(query, eligible, anchorMs);
core/session.cjs:1:const { resolveTemporalTarget } = require('./temporal-target.cjs');
core/session.cjs:384:      const targetMs = resolveTemporalTarget(question, [...this.history, ...context], anchorMs);
core/session.cjs:514:  const target = targetMs ?? resolveTemporalTarget(question, segments, anchorMs);
exit=0

$ git grep --no-index -n resolveTemporalTarget -- core
core/moment-search.cjs:3:const { resolveTemporalTarget } = require("./temporal-target.cjs");
core/moment-search.cjs:60:    const target = resolveTemporalTarget(query, eligible, anchorMs);
core/session.cjs:1:const { resolveTemporalTarget } = require('./temporal-target.cjs');
core/session.cjs:384:      const targetMs = resolveTemporalTarget(question, [...this.history, ...context], anchorMs);
core/session.cjs:514:  const target = targetMs ?? resolveTemporalTarget(question, segments, anchorMs);
core/temporal-target.cjs:1:function resolveTemporalTarget(question, segments, anchorMs) {
core/temporal-target.cjs:16:module.exports = { resolveTemporalTarget };
exit=0

$ git grep -n session.cjs -- core
exit=1

$ git grep -nwE 'cosine|observedTopic|DEFAULT_LIMITS|TEXT_LIMITS|TRANSCRIPTION_LANGUAGES|SAVE_INTERVAL_MS|VIEWS|passageText' -- core adapters runtime app server mcp tv scripts tests
core/living-recap.cjs:1:const {passageText}=require('./passage-text.cjs');
core/living-recap.cjs:54:      if(segment.status!=='ready'||!passageText(segment).trim())continue;
core/living-recap.cjs:55:      const text=passageText(segment),known=this.originals.get(segment.id);
core/moment-index.cjs:1:const { passageText } = require("./passage-text.cjs");
core/moment-index.cjs:58:      const text = passageText(segment);
core/moment-index.cjs:110:    return this.cache.get(segment.id, passageText(segment));
core/moment-index.cjs:127:        .map((passage) => ({ id: passage.id, text: passageText(passage) }))
core/moment-search.cjs:1:const { passageText } = require("./passage-text.cjs");
core/moment-search.cjs:9:function cosine(a, b) {
core/moment-search.cjs:119:      const text = passageText(s),
core/moment-search.cjs:132:      const semantic = vector ? Math.max(0, cosine(vector, known)) : 0;
core/moment-search.cjs:156:    text: passageText(s),
core/passage-text.cjs:2:function passageText(segment) {
core/passage-text.cjs:21:    Boolean(passageText({ observation: segment.observation }).trim());
core/passage-text.cjs:22:  return Boolean(passageText(segment).trim()) && (!segment.status || ['ready', 'partial'].includes(segment.status) || laneEvidence);
core/passage-text.cjs:24:module.exports = { passageText, hasUsableObservation };
core/perception-context.cjs:5:function observedTopic(passage) {
core/perception-context.cjs:14:    topic: observedTopic(p),
core/perception-context.cjs:23:    const topic = observedTopic(p);
core/perception-context.cjs:37:  const previousTopic = last && current.startMs - last.endMs <= 1000 ? observedTopic(last) : '';
core/perception-context.cjs:42:      if (observedTopic(p) !== previousTopic || (next && (next.startMs - p.endMs > 1000 ||
core/perception-context.cjs:55:    if (observedTopic(p) !== previousTopic || (next && (next.startMs - p.endMs > 1000 ||
core/surveillance.cjs:45:const DEFAULT_LIMITS = Object.freeze({
core/surveillance.cjs:71:const TEXT_LIMITS = Object.freeze({ sentences: 3, chars: 420 });
core/surveillance.cjs:103:  const limits = { ...DEFAULT_LIMITS };
core/surveillance.cjs:181:function validateDetection(result, passages, limits = DEFAULT_LIMITS) {
core/surveillance.cjs:320:  return clean.length > 0 && clean.length <= TEXT_LIMITS.chars && count >= 1 && count <= TEXT_LIMITS.sentences;
core/surveillance.cjs:326:    if (parts.length === TEXT_LIMITS.sentences) break;
core/surveillance.cjs:330:  const budget = Math.floor((TEXT_LIMITS.chars - (parts.length - 1)) / (parts.length || 1));
core/surveillance.cjs:346:  if (statements.length <= TEXT_LIMITS.sentences) return boundedSentences(statements);
core/transcription-language.cjs:1:const TRANSCRIPTION_LANGUAGES = Object.freeze(['fr', 'en', 'auto']);
core/transcription-language.cjs:3:  if (!TRANSCRIPTION_LANGUAGES.includes(language)) throw Error('Langue de transcription invalide.');
core/video-tools.cjs:1:const { passageText, hasUsableObservation } = require('./passage-text.cjs');
core/video-tools.cjs:56:    const evidence=segments.filter(hasUsableObservation).map(s=>({id:s.id,startMs:s.startMs,endMs:s.endMs,text:passageText(s),precision:s.status==='partial'?'partial-observation':'automatic-summary',audioStatus:s.audioStatus,visionStatus:s.visionStatus,audioError:s.audioError,visionError:s.visionError,...(s.audioFailed?{audioFailed:true}:{}),available:Boolean(s.available),...stills(s),...(s.revision===undefined?{}:{revision:s.revision})}));
runtime/headless-runtime.cjs:29:  VIEWS,
runtime/headless-runtime.cjs:226:    if (!VIEWS.includes(view)) throw refusal(400, "Vue d’état inconnue.");
runtime/state-views.cjs:6:const VIEWS = ["chat", "panel"];
runtime/state-views.cjs:333:  VIEWS,
runtime/surveillance-runtime.cjs:8:const SAVE_INTERVAL_MS = 1000;
runtime/surveillance-runtime.cjs:10:  SAVE_INTERVAL_MS * Math.max(1, Math.ceil(claims / 200));
tests/moment-index.test.cjs:8:const { passageText } = require('../core/passage-text.cjs');
tests/moment-index.test.cjs:51:  assert.deepEqual(embeddings.calls.flatMap(call => call.texts), passages.map(passageText));
tests/moment-index.test.cjs:107:  assert.deepEqual(embeddings.calls.map(call => call.texts), [[passageText(ready)]]);
tests/moment-index.test.cjs:108:  assert.equal(cache.entries.get('moment-1').text, passageText(ready));
tests/moment-index.test.cjs:117:  assert.deepEqual(embeddings.calls.map(call => call.texts), [[passageText(partial)]]);
tests/moment-index.test.cjs:125:  assert.deepEqual(embeddings.calls[1].texts, [passageText(ready)]);
tests/moment-index.test.cjs:128:  assert.equal(cache.entries.get('moment-1').text, passageText(ready));
tests/moment-index.test.cjs:176:  assert.deepEqual(embeddings.calls.map(call => call.texts), [scene.map(passageText), ['chien']]);
tests/moment-index.test.cjs:209:  assert.deepEqual(embeddings.calls[2].texts, scene.map(passageText));
tests/moment-index.test.cjs:219:  assert.deepEqual(embeddings.calls.map(call => call.texts), [[passageText(scene[0])], [passageText(scene[1])], ['chien']]);
tests/moment-index.test.cjs:340:  assert.deepEqual(embeddings.calls.map(call => call.texts), [scene.map(passageText), ['chien']]);
tests/moment-index.test.cjs:363:  assert.deepEqual(embeddings.calls.map(call => call.texts), [[passageText(past), passageText(future)], ['chat futur']]);
tests/moment-index.test.cjs:371:  const legacy = { ensure: async segments => { ensured.push(segments.map(s => s.id)); }, queryVector: async () => [0, 1], passageVector: async segment => vector(passageText(segment)) };
tests/review-regressions.test.cjs:16:const { passageText } = require('../core/passage-text.cjs');
tests/review-regressions.test.cjs:200:  assert.equal(passageText(archived), passageText(live));
tests/review-regressions.test.cjs:201:  assert.equal(passageText(live), 'Bonsoir à tous.');
tests/review-regressions.test.cjs:202:  assert.equal(passageText({ observation: { summary: 'Résumé', visual: 'Image', transcript: 'Paroles' } }), 'Résumé\nImage\nParoles');
exit=0

$ awk 'length > 160' core/temporal-target.cjs
exit=0

$ node --input-type=module -e 'import {measure} from "./scripts/quality/metrics.mjs"; console.log(JSON.stringify(measure(process.cwd()),null,2));'
{
  "lignes_longues_prod": 509,
  "lignes_longues_tests": 1703,
  "catch_vides_prod": 38,
  "tests_nommes_par_chantier": 9,
  "process_env_hors_config": 8,
  "inner_html": 2,
  "cas_de_test": 1091
}
exit=0
```

  Les sorties vides de `git grep` donnent normalement le code 1. Le nouveau
  module est encore non suivi : `git grep --no-index` complète l’inventaire sans
  toucher à l’index. `VIEWS` reste propriétaire de `runtime/state-views.cjs`,
  réellement lu par `HeadlessRuntime.viewName` ; l’hôte ne le réexporte plus.
  `lignes_longues_prod` baisse de 512 à 509 : deux lignes de la fonction extraite,
  plus une de la fonction morte. `awk` ne rend rien.

- `node scripts/check.mjs --changed` : sortie 0, vert observé :

```text
✔ règles par fichier
✔ format
✔ lint
✔ gel du lint
✔ cliquet
    Mesures améliorées : lignes_longues_prod : 512 → 509, cas_de_test : 1089 → 1091
✔ tests JS (2 fichier(s))
    ℹ tests 16
    ℹ pass 16
    ℹ fail 0
check : vert
```

- `node scripts/check.mjs` complet : sortie 1. Contrôles statiques verts ;
  suite JS rouge (1 202 réussis / 1 203), suite Python verte (84 tests dont un
  ignoré). Sortie intégrale rendue par le contrôle :

```text
✔ règles par fichier
✔ format
✔ lint
✔ gel du lint
✔ cliquet
    Mesures améliorées : lignes_longues_prod : 512 → 509, cas_de_test : 1089 → 1091
✖ tests JS (102 fichier(s))
    ✖ an abandoned Whisper run settling late does not unregister the run that replaced it (5003.681125ms)
    ℹ tests 1203
    ℹ pass 1202
    ℹ fail 1
    ✖ failing tests:
    ✖ an abandoned Whisper run settling late does not unregister the run that replaced it (5003.681125ms)
✔ tests Python
    Ran 84 tests in 27.232s

    OK (skipped=1)
check : ROUGE
```

- Diagnostic du seul échec : lecture de `adapters/local-transcriber.cjs`,
  du scénario dans `tests/review-regressions.test.cjs` et du helper
  `tests/helpers/wait.cjs`. Le scénario attend le démarrage d’un processus Node
  simulant Whisper via un fichier starts.log ; cette attente est bornée à cinq
  secondes réelles. Le contrôle ne conserve que le nom et la durée du test échoué
  (5 003,68 ms), pas sa pile complète. Le transcripteur et le scénario sont
  inchangés ; le validateur de langue conserve exactement sa définition et son
  export utilisé. Aucun lien causal avec les retraits n’est établi.

- Reproduction ciblée pour isoler le scénario :
  `node --test --test-name-pattern='an abandoned Whisper run settling late does not unregister the run that replaced it' tests/review-regressions.test.cjs`
  sort 0 :

```text
✔ an abandoned Whisper run settling late does not unregister the run that replaced it (727.116875ms)
ℹ tests 1
ℹ suites 0
ℹ pass 1
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 782.525041
```

- Diagnostic avec les scénarios précédents du même fichier :
  `node --test tests/review-regressions.test.cjs` sort 0, 19 tests réussis ;
  sortie intégrale dans `.harness-state/tickets/T100/whisper-file-diagnostic.log` :

```text
✔ an App Server dying during the handshake leaves neither its directory nor its dead transport on the client (4.179875ms)
TVLens : confinement Codex non vérifié (réponse de thread/start incomplète).
✔ a client closed while its process is being recycled stays closed (1.911125ms)
✔ two prepare calls around a dead connection end with a single live process (2.386875ms)
✔ a chat answer that had to connect says so, and the next one does not (1.974708ms)
✔ after the agent reconnected, a description is the first turn of its thread, not the nth (0.325459ms)
✔ an abandoned Whisper run settling late does not unregister the run that replaced it (706.078375ms)
✔ during an embeddings outage searches do not multiply failing requests: one per shared backoff step (5.879334ms)
✔ a search holding an older copy of a passage does not discard the newer text being indexed (1.173542ms)
✔ a vector appended after a torn line survives the next load (3.110709ms)
✔ the text of a spoken passage without description does not change when it is archived (0.20125ms)
✔ an older read returned late never replaces the newer consulted version, even at the same revision (1.224583ms)
✔ runtime switches reach the packaged app too: those of the imported file persist with it, the environment of a start wins and is not stored, and a mistyped one is refused at session start (6.23475ms)
✔ the session runtime feeds published passages to the index, honours the opt-out, passes the lane options and closes the index (11.609417ms)
✔ the headless state exposes index counters only when an index exists (4.201ms)
✔ a search during the pause that follows a provider failure answers at once instead of waiting its whole budget (3.496667ms)
✔ a client closed while a turn is removing a dead connection stays closed (1.24325ms)
✔ a passage whose transcription failed says so wherever its empty transcript is read (0.259083ms)
✔ with the session clock stopped by a pause, an older read returned late still does not replace the newer one (0.36225ms)
✔ the switches of an imported file persist without any provider key, never with the local-model token, and leave a stored key in place (3.470167ms)
ℹ tests 19
ℹ suites 0
ℹ pass 19
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 808.946541
```

- L’échec de la suite complète n’est pas reproduit dans ces deux contextes et
  reste inexpliqué : aucune conclusion sur une saturation de la machine, aucun
  délai augmenté ni test modifié. Pas de nouvelle relance pour obtenir du vert.
  `git diff --check` sort 0 ; `git diff --name-only` sur les onze fichiers
  protecteurs ne rend rien. Verdict **PARTIEL** : extraction, inventaire,
  caractérisation et garde livrés ; critère 8 non satisfait à cause du contrôle
  complet rouge. Réserve de validation conservée pour la boucle. Aucun commit
  ni push, aucun appel fournisseur ni accès TV/VPS.

- Reprise Codex après `echec-1.txt` : rapport, journal, écarts et diff relus.
  Extraction et retraits déjà présents ; seul le contrôle complet reste à éclaircir.
  Diagnostic prévu avec sortie JS brute et trace passive du lancement du faux Whisper,
  un fichier de test à la fois. Aucun test existant ni délai modifié.

- Diagnostic complet avec trace passive, sans modification du harnais ni des tests :
  `node --require ./.harness-state/tickets/T100/trace-whisper.cjs --test --test-concurrency=1 tests/*.test.cjs`
  sort 0 : 1 203 tests réussis, zéro échec, zéro ignoré, durée 175 953,18 ms.
  Sortie brute : `.harness-state/tickets/T100/resume-full-js-diagnostic.log` ;
  événements : `resume-whisper-trace.jsonl` dans le même dossier.
  Le scénario Whisper passe en 689,52 ms : deux spawns réussis, premier processus
  clos par SIGKILL après 260,47 ms, second clos normalement après 426,69 ms.
  L'échec initial n'est toujours pas reproduit et sa cause reste inconnue ;
  aucune saturation n'est affirmée. Cette passe instrumentée n'est pas le contrôle
  `check` exigé au critère 8. Le contrôle final sera lancé sans sonde, une seule fois.

- Contrôle final des fichiers modifiés :
  `node scripts/check.mjs --changed > .harness-state/tickets/T100/resume-check-changed.log 2>&1`
  sort 0 :

```text
✔ règles par fichier
✔ format
✔ lint
✔ gel du lint
✔ cliquet
    Mesures améliorées : lignes_longues_prod : 512 → 509, cas_de_test : 1089 → 1091
✔ tests JS (2 fichier(s))
    ℹ tests 16
    ℹ pass 16
    ℹ fail 0
check : vert
```

- Contrôle complet final, sans sonde :
  `node scripts/check.mjs > .harness-state/tickets/T100/resume-check-full.log 2>&1`
  sort 0 :

```text
✔ règles par fichier
✔ format
✔ lint
✔ gel du lint
✔ cliquet
    Mesures améliorées : lignes_longues_prod : 512 → 509, cas_de_test : 1089 → 1091
✔ tests JS (102 fichier(s))
    ℹ tests 1203
    ℹ pass 1203
    ℹ fail 0
✔ tests Python
    Ran 84 tests in 27.817s

    OK (skipped=1)
check : vert
```

- Vérification directe des API publiques par `node -`, conservée dans
  `.harness-state/tickets/T100/resume-public-exports.log` : sortie 0, tous les
  exports visés absents et fonction temporelle publique dans son nouveau module.
  `awk 'length > 160' core/temporal-target.cjs` reste sans sortie.
  `git diff --exit-code --` sur les onze fichiers protecteurs,
  `tests/review-regressions.test.cjs` et `adapters/local-transcriber.cjs` sort 0 :
  tous sont inchangés. Aucun changement de production supplémentaire à la reprise.

- Verdict de reprise **TERMINÉ** : les huit critères disposent de leurs preuves,
  dont le contrôle complet effectif sur l'état final. La baisse des lignes longues
  reste 512 → 509. La réserve de la première tentative est conservée comme
  historique de stabilité : l'échec Whisper initial reste inexpliqué et n'est pas
  déclaré corrigé ; aucune conclusion de saturation n'est tirée des passes actuelles.
  Aucun délai, assertion existante ni contrôle n'a été assoupli. Aucun sous-agent,
  commit, push, fournisseur réel ni accès TV/VPS.

### Réserves à la clôture

- Réserve de stabilité historique : l’échec Whisper de la première tentative (5003,68 ms) n’est pas reproduit et sa cause reste inconnue. Il n’est pas déclaré corrigé ou attribué à la charge ; les passes actuelles ne prouvent pas l’absence d’intermittence. Les tests et leurs délais restent inchangés.
- .harness-state/tickets/T100/relecture-1.md : **1. `tests/review-regressions.test.cjs:112`, hors périmètre**
  - **Le problème.** Le scénario « an abandoned Whisper run settling late does not unregister the run that replaced it » a échoué une fois pendant la suite complète de la première tentative. Il a atteint 5 003 ms, soit la limite de l'attente `until(starts, …)` (`check-full.log`).
  - **Ce qui a été tenté.** L'implémenteur l'a relancé dans trois situations : seul, avec tout son fichier, puis dans une suite complète instrumentée. Il passe chaque fois. Le `check` complet final, sans sonde, est vert : 1 203 sur 1 203 (`resume-check-full.log`).
  - **Pourquoi ce n'est pas lié au ticket.** Le diff ne touche ni ce test ni `adapters/local-transcriber.cjs`. La cause reste inconnue et l'implémenteur ne prétend pas l'avoir corrigée.
  - **Ce qui est attendu.** Reporter cette instabilité en réserve et la traiter dans un ticket à part, en la reproduisant. Ne pas allonger le délai.
