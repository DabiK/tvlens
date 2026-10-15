---
id: T058
titre: Share the simulated clocks of the tests instead of importing one from a script
statut: a-faire
bloque_par: T055
adr: non
installe: non
harnais: non
supprime_tests: non
niveau: standard
---

## Ce que le ticket livre

Un test importe son horloge virtuelle d'un script de `scripts/`, et l'horloge manuelle des tests est
écrite trois fois, dans deux fichiers, avec des conventions opposées (avance relative ou instant
absolu). Après ce ticket, `tests/helpers/clock.cjs` définit les deux horloges une fois, avec ses
propres tests : les tests n'importent plus d'horloge depuis `scripts/`, et le script de simulation
prend la sienne dans le module partagé.

## Sources

- Constats : OPS-13, TSTB-04 ; `docs/audit-points-chauds.md`, sections E et F (entrée T058),
  retenu par décision du propriétaire, le 15/10.
- Code vérifié par lecture à la version `e92c6a6` (le nom d'abord, la ligne ensuite) :
  - `scripts/simulate-stream.cjs` : `const realSetImmediate`, ligne 14 ; `const settle` (deux tours de
    `realSetImmediate`), ligne 15, utilisé dans la classe et aussi hors d'elle (`await settle();`,
    ligne 353) ; `class VirtualClock`, ligne 18 — `install()` remplace `setTimeout`, `setInterval`,
    `clearTimeout`, `clearInterval` et `Date.now` ; `uninstall()` ; `runUntil(limit)` déclenche les
    minuteries par échéance puis par ordre de création et répète les intervalles ;
    `module.exports = { runScenario, SCENARIOS, MODELS, VirtualClock }`, ligne 420 ; `runScenario`
    construit l'horloge ligne 130. Quatre lignes de plus de 160 caractères dans les lignes 1 à 68.
  - `tests/question-ceiling.test.cjs` : `const { VirtualClock } = require('../scripts/simulate-stream.cjs')`,
    ligne 6 ; `new VirtualClock().install()`, lignes 62 et 134 ; boucle d'attente muette
    `for (let i = 0; i < 300 && brief.external.size; i++)`, ligne 202, suivie de son assertion ligne 203.
  - `tests/moment-index.test.cjs` : `function manualClock()`, ligne 17 — `io: { now, setTimer,
    clearTimer }`, `armed`, `advance(ms)` relatif, un `tick()` avant chaque recherche de minuterie échue
    et un après la dernière ; un seul appel, ligne 56, dans la fabrique du fichier (`...clock.io`) ; dix
    lignes citent `clock.io` ou `clock.armed`.
  - `tests/moment-index.test.cjs`, test « a steady stream is sent as a few passages per request once a
    flush interval is set, and a question never waits for it » (ligne 521) : une troisième horloge
    manuelle écrite sur place — `const setTimer`, ligne 523, `const clearTimer`, ligne 524,
    `const settle` (six tours), ligne 525, `const advance = async to =>` vers un instant absolu,
    ligne 526 ; appels `advance(` lignes 532 (dans `publish`), 534, 536 et 543 ; la ligne 538 avance par `publish`.
  - `tests/review-regressions.test.cjs` : `function manualTimers()`, ligne 138 — `{ now, setTimer,
    clearTimer, advance }`, `advance(to)` vers un instant absolu, `settle()` (six tours) aux mêmes
    endroits que le `tick()` de `manualClock` ; créée lignes 149, 165 et 282, passée par `...clock`
    (lignes 150, 166, 285) ou par `clock.setTimer` et `clock.clearTimer` (lignes 151 et 286) ; appels
    `clock.advance(` lignes 153, 167, 169, 171, 292, 299 et 302 ; `clock.now()` ligne 153.
  - `tests/stream-simulation.test.cjs:4` importe `runScenario` du même script : hors de ce ticket.
- `scripts/quality/metrics.mjs`, `lignes_longues_tests` : compte tous les fichiers de code sous
  `tests/`, aides comprises.
- `tests/helpers/clock.cjs` n'existe pas encore. Seul T055 est requis pour `until` et les tours partagés ;
  il implique T150. Les bancs `moment-index`, `review-regressions` et `stream-simulation` sont déjà présents.
  Leurs comptages statiques utiles sont respectivement 22, 19 et 8 déclarations de tests ;
  `question-ceiling` en compte 4. Aucun test n'a été exécuté pour les revalider.

## Périmètre

- À modifier :
  - `tests/helpers/clock.cjs` (nouveau) : `VirtualClock`, déplacée avec sa propre copie de ce dont elle
    a besoin (`realSetImmediate`, `settle`), et `manualClock({ turns = 1 } = {})` dans la forme de
    `tests/moment-index.test.cjs` ;
  - `tests/simulated-clock.test.cjs` (nouveau) ;
  - `scripts/simulate-stream.cjs` : importe `VirtualClock` de `../tests/helpers/clock.cjs`, ne la définit
    plus et ne l'exporte plus ; il garde `realSetImmediate` et `settle`, dont son moteur se sert
    ligne 353 ; rien d'autre n'y change (moteur de scénarios, modèles, ligne de commande) ;
  - `tests/question-ceiling.test.cjs` : importe `VirtualClock` du module partagé ; la boucle de la
    ligne 202 devient un `until` nommé de `tests/helpers/wait.cjs` ;
  - `tests/moment-index.test.cjs` : importe `manualClock`, sa définition locale disparaît ; l'horloge
    écrite sur place dans le test de la ligne 521 devient `manualClock({ turns: 6 })` ;
  - `tests/review-regressions.test.cjs` : `manualTimers` disparaît au profit de
    `manualClock({ turns: 6 })` ; `...clock`, `clock.setTimer`, `clock.clearTimer` et `clock.now()`
    passent par `clock.io`.
- Dans les deux fichiers, chaque `advance(to)` absolu devient l'avance relative équivalente (la
  différence avec l'instant simulé courant, `clock.io.now()`, quand l'instant visé n'est pas une
  constante), de sorte que chaque minuterie parte au même instant simulé qu'aujourd'hui.
- À ne pas toucher : le code de production ; `tests/stream-simulation.test.cjs` ; `runScenario`,
  `SCENARIOS`, `MODELS` et la ligne de commande du script ; les titres des tests et les valeurs attendues.
- Une seule forme d'horloge manuelle : celle de `manualClock` (`io`, `armed`, `advance(ms)` relatif).
  Le nombre de tours de boucle laissés autour de chaque minuterie est son seul paramètre, `turns` : un
  par défaut, comme aujourd'hui dans `tests/moment-index.test.cjs` ; six pour les appelants qui en
  laissaient six. Aucun appelant ne change de nombre de tours dans ce ticket.
- Sens de dépendance retenu : le script dépend de `tests/helpers/`, jamais un test de `scripts/`.
- Aucune ligne de plus de 160 caractères dans les deux fichiers créés ni ajoutée ailleurs.

## Critères d'acceptation

Chaque critère se vérifie par un test ou une commande.

1. `grep -n "simulate-stream" tests/question-ceiling.test.cjs` ne sort rien ;
   `grep -n "class VirtualClock" scripts/simulate-stream.cjs` ne sort rien.
2. `node -e "console.log(Object.keys(require('./scripts/simulate-stream.cjs')).sort().join(' '))"` affiche
   `MODELS SCENARIOS runScenario`.
3. `rg -n 'function (manualClock|manualTimers)|const advance = async' tests/moment-index.test.cjs
   tests/review-regressions.test.cjs` ne sort rien : les trois doubles migrés n'y sont plus définis.
4. `grep -n "i < 300 && " tests/question-ceiling.test.cjs` ne sort rien.
5. `tests/simulated-clock.test.cjs` prouve au moins : `install()` puis `uninstall()` rendent les
   `setTimeout`, `setInterval`, `clearTimeout`, `clearInterval` et `Date.now` d'origine ; `runUntil`
   déclenche les minuteries par échéance puis par ordre de création, répète un intervalle et s'arrête à
   la limite ; `manualClock().advance(ms)` déclenche dans l'ordre les minuteries échues, y compris celle
   qu'une minuterie arme en partant, `clearTimer` en retire une, `armed` compte celles qui restent,
   `io.now()` vaut l'instant de la minuterie pendant qu'elle part et l'instant visé à la fin ; avec
   `turns: 6`, une suite de trois tours de boucle lancée par une minuterie est terminée avant que la
   minuterie suivante parte, et ne l'est pas avec la valeur par défaut.
6. `rg -c '^\s*test\('` donne toujours 4, 22 et 19 pour `question-ceiling`, `moment-index` et
   `review-regressions`, et `git diff -U0 HEAD -- tests/question-ceiling.test.cjs tests/moment-index.test.cjs
   tests/review-regressions.test.cjs | grep -E "^-.*assert\."` ne sort rien.
7. `node --test --test-concurrency=1 tests/simulated-clock.test.cjs tests/question-ceiling.test.cjs
   tests/moment-index.test.cjs tests/review-regressions.test.cjs tests/stream-simulation.test.cjs` passe.
8. `node scripts/check.mjs` est vert.

## Test d'acceptation attendu

Nouveau fichier `tests/simulated-clock.test.cjs`, à la frontière du module `tests/helpers/clock.cjs`
(critère 5). `tests/stream-simulation.test.cjs`, inchangé, prouve que le script de simulation tourne
toujours avec l'horloge déplacée.

## Hypothèses bloquantes

Aucune décision n'est attendue. Si un test de `tests/moment-index.test.cjs` ou de
`tests/review-regressions.test.cjs` change de résultat alors que ses minuteries partent aux mêmes
instants simulés et avec le même nombre de tours, ou si le déplacement exige de modifier le moteur de
scénarios du script : verdict BLOQUÉ, avec le test en cause. Si la boucle de la ligne 202 de
`tests/question-ceiling.test.cjs`, une fois rendue bruyante, échoue : verdict BLOQUÉ, avec le fait
attendu ; un test n'est jamais relancé jusqu'à ce qu'il passe.

## Journal

- Rafraîchi le 15/10 contre `e92c6a6` : T145 retiré, T055 conservé (donc T150), niveau standard ;
  horloges et bancs existants revérifiés, avances absolues du scénario recomptées (la ligne 538 avance par `publish`), critère d'absence
  borné aux deux fichiers migrés. Helpers à créer explicités ; comptages confirmés par lecture, aucun test exécuté.

- Contrôle documentaire : `node scripts/check.mjs --changed` lancé une fois, code 0, vert.
  Aucun fichier de test modifié, donc aucun test exécuté ; Markdown ignoré par Prettier.
  ESLint non lancé (absent ou non configuré). En-têtes, sections et repères contrôlés séparément par lecture.

- Relecture documentaire le 15/10 contre `e92c6a6` : sources rendues pérennes dans
  `docs/audit-points-chauds.md` ou attribuées à la décision du propriétaire, le 15/10.
