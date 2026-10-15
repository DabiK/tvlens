---
id: T055
titre: Share the wait helpers of the tests and make every bounded wait fail aloud
statut: termine
bloque_par: T163
adr: non
installe: non
harnais: non
supprime_tests: non
niveau: standard
---

## Ce que le ticket livre

Les aides d'attente des tests (`tick`, `deferred`, `until`, `pause`…) sont recopiées de fichier en
fichier avec des sens différents, et plusieurs `until` abandonnent en silence quand leur borne est
atteinte. Après ce ticket, un module unique `tests/helpers/wait.cjs` les définit une fois, avec ses
propres tests, et quatre premiers fichiers l'utilisent : une attente bornée qui n'aboutit pas y fait
échouer le test en nommant le fait attendu.

## Sources

- Constats : FLK-12, TSTA-02, TSTB-03 ; `docs/audit-points-chauds.md`, sections E et F (entrée T055),
  retenu par décision du propriétaire, le 15/10.
- Code vérifié par lecture à la version `e92c6a6` (le nom d'abord, la ligne ensuite) :
  - `tests/transcriber-sharing.test.cjs` : `const until = async check =>`, ligne 23 — 200 tours de
    10 ms puis retour sans erreur ; deux appels, lignes 39 et 50.
  - `tests/review-regressions.test.cjs` : `const tick`, ligne 21 ; `const settle = async (n = 6)` (tours de
    `setImmediate`), ligne 22 ; `const until = async check =>`, ligne 24 — 300 tours de 10 ms puis
    retour sans erreur, deux appels lignes 260 et 267 ; boucle d'attente en ligne
    `for (let i = 0; i < 100 && !(await starts()); i++)`, ligne 128 ; attente fixe de 120 ms, ligne 132.
  - `tests/chat-instruction.test.cjs` : `const until = async (check, label)`, ligne 9 — échéance de
    10 s ; deux appels ; attente fixe de 20 ms ligne 53.
  - `tests/server-surveillance.test.cjs` : `const tick`, ligne 12 ; `const until = async (check, label)`,
    ligne 14 — échéance de 15 s ; neuf appels.
  - Modèles déjà en place, à reprendre : `tests/surveillance-runtime.test.cjs`, `const until`, ligne 15
    (d'abord des tours de boucle, puis du temps réel borné) ; `tests/architecture-f07.test.cjs`,
    `const realTimeout = globalThis.setTimeout` et `const pause`, lignes 22-23 (minuterie réelle
    capturée au chargement, insensible à `t.mock.timers`) ; `tests/architecture-f06.test.cjs`,
    `const bounded`, ligne 34 et `const failure`, ligne 38.
  - `tests/helpers/` contient `codex-session.cjs`, `harness-repo.cjs`, `loop-state-dir.cjs`,
    `loop-stream.cjs`, `source-shape.cjs` et `tv-page.cjs`. `wait.cjs` et ses tests restent à créer.
- `Date` est figée par `t.mock.timers` dans `tests/codex-confinement.test.cjs:436` et
  `tests/architecture-f05.test.cjs:306` : une échéance mesurée avec `Date.now()` n'y avancerait pas.
- Sonde disque lent : source complète dans
  `docs/travail/tickets/001-resent-block-duplicate-without-race.md:37`, section « Sonde de reproduction ».
  Elle capture la vraie minuterie avant de retarder `mkdir`, `writeFile` et `rename`.
  Son fichier d'état n'est pas présent dans ce worktree : le recréer depuis cette source pour le critère 7.
- Comptages statiques actuels des déclarations `test(` : 3, 19, 2 et 2 dans les quatre fichiers migrés,
  dans l'ordre ci-dessus. Aucun résultat d'exécution n'est déduit de ces comptages.

## Périmètre

- À modifier :
  - `tests/helpers/wait.cjs` (nouveau) ;
  - `tests/wait-helpers.test.cjs` (nouveau) ;
  - `tests/transcriber-sharing.test.cjs`, `tests/review-regressions.test.cjs`,
    `tests/chat-instruction.test.cjs`, `tests/server-surveillance.test.cjs`.
- À ne pas toucher : le code de production ; les autres fichiers de test (ils migrent par lots dans
  les tickets suivants) ; `manualTimers` de `tests/review-regressions.test.cjs` au-delà du remplacement
  de son appel à `settle` ; les titres des tests et les valeurs attendues.
- Forme du module, à respecter (les tickets suivants s'y appuient) :
  - `tick()` : un tour de `setImmediate` ;
  - `turns(count)` : `count` tours ; remplace les `settle` « N tours » ; appelé sans entier positif, il
    échoue aussitôt, pour que chaque appelant dise son nombre ;
  - `deferred()` : rend `{ promise, resolve, reject }` ;
  - `pause(ms)` : attente réelle sur une minuterie capturée au chargement du module ; `until` et
    `bounded` attendent sur cette même minuterie capturée, jamais sur le `setTimeout` global du moment ;
  - `until(check, what, { timeoutMs = 5000 } = {})` : `check` synchrone ou asynchrone ; rend la valeur
    vraie obtenue ; essaie d'abord à un tour de boucle d'écart (nombre d'essais fixé par une constante
    du module), puis à intervalle réel court ; un contrôle n'est jamais lancé avant que le précédent ait
    rendu sa valeur, parce qu'un contrôle peut avoir un effet (renvoyer une requête, par exemple) ; à
    l'échéance, fait échouer le test avec un message qui contient `what` ; l'échéance se mesure sur une
    horloge que `t.mock.timers` ne fige pas (`performance.now()`), jamais sur `Date.now()` ;
    appelé sans libellé (chaîne non vide), il échoue aussitôt ;
  - `bounded(promise, ms = 5000)` : rend la valeur de la promesse, ou la chaîne `nothing after <ms> ms`,
    et laisse passer un rejet ;
  - `failure(promise, what = 'the call')` : rend l'erreur du rejet ; si la promesse aboutit, échoue avec
    un message qui contient `what` et « should have failed ».
- Aucune dépendance installée, aucun import hors de Node. Aucune ligne de plus de 160 caractères dans
  les deux fichiers créés ni ajoutée ailleurs.
- Dans les quatre fichiers : les définitions locales de `tick`, `settle` et `until` disparaissent au
  profit du module ; `settle()` devient `turns(6)`, un appel qui donnait un nombre le garde ; chaque
  `until` reçoit un libellé qui nomme le fait attendu ; les échéances de 10 s (`chat-instruction`) et
  de 15 s (`server-surveillance`) sont conservées, passées par `timeoutMs` ; la boucle de la ligne 128
  devient un `until` nommé ; les attentes fixes de 20 ms et 120 ms deviennent `pause(20)` et
  `pause(120)` sans changer de durée.
- Le module est importé en tête de chaque fichier de test, avant toute activation de `t.mock.timers` :
  c'est ce qui garantit que la minuterie capturée est la vraie.

## Critères d'acceptation

Chaque critère se vérifie par un test ou une commande.

1. `node -e "console.log(Object.keys(require('./tests/helpers/wait.cjs')).sort().join(' '))"` affiche
   `bounded deferred failure pause tick turns until`.
2. `node --test --test-concurrency=1 tests/wait-helpers.test.cjs` passe, et ce fichier prouve au
   moins : `until` rend la valeur vraie d'un contrôle synchrone et d'un contrôle asynchrone ; `until`
   rejette, à l'échéance (prise courte dans le test), avec un message qui contient le libellé ; `until`
   sans libellé et `turns` sans nombre échouent aussitôt ; `until` ne lance jamais un contrôle
   asynchrone tant que le précédent n'a pas rendu sa valeur (un contrôle lent compte ses entrées
   simultanées, le maximum vaut 1) ; `until`, `pause` et `bounded` aboutissent pendant que
   `t.mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'] })`
   est actif et que rien n'avance l'horloge figée ; `bounded` rend `nothing after 20 ms` pour une
   promesse qui ne se règle pas et laisse passer un rejet ; `failure` rend l'erreur et échoue quand la
   promesse aboutit ; `deferred` se règle par `resolve` et par `reject`.
3. `grep -nE "^(const|function|async function) (tick|settle|until) ?[=(]" tests/transcriber-sharing.test.cjs
   tests/review-regressions.test.cjs tests/chat-instruction.test.cjs tests/server-surveillance.test.cjs`
   ne sort rien, et `grep -c "helpers/wait.cjs"` vaut 1 dans chacun des quatre fichiers.
4. `grep -n "i < 100 && " tests/review-regressions.test.cjs` ne sort rien.
5. `rg -c '^\s*test\('` sur les quatre fichiers migrés donne toujours 3, 19, 2 et 2 pour
   `transcriber-sharing`, `review-regressions`, `chat-instruction` et `server-surveillance`.
6. `git diff -U0 HEAD -- tests/transcriber-sharing.test.cjs tests/review-regressions.test.cjs
   tests/chat-instruction.test.cjs tests/server-surveillance.test.cjs | grep -E "^-.*assert\."` ne sort
   que des lignes appartenant aux définitions locales de `until` supprimées. Sortie dans le journal.
7. Sonde disque lent, recréée depuis la source de T001 dans le dossier d'état du ticket
   (`.harness-state/tickets/<id>/slow-fs.cjs`, hors Git) avant la mesure initiale : pour chacun des quatre fichiers,
   `FLK_MS=10 node --require ./.harness-state/tickets/<id>/slow-fs.cjs
   --test --test-concurrency=1 tests/<fichier>` est lancée une fois avant toute modification et une fois
   après. Un fichier qui passait avant passe après. Les deux sorties (`ℹ pass`, `ℹ fail`) dans le journal.
8. `node --test --test-concurrency=1` sur les quatre fichiers migrés passe, sans sonde.
9. `node scripts/check.mjs` est vert.

## Test d'acceptation attendu

Nouveau fichier `tests/wait-helpers.test.cjs`, à la frontière du module `tests/helpers/wait.cjs` : il
prouve le contrat du critère 2, dont l'échec nommé de `until` et son indépendance vis-à-vis de
`t.mock.timers`. Les tests existants des quatre fichiers migrés restent la preuve que rien n'a changé
de sens.

## Hypothèses bloquantes

Aucune décision n'est attendue.

Les pauses fixes de 20 et 120 ms sont conservées volontairement : ce ticket partage leurs aides,
sans prétendre rendre ces deux scénarios indépendants du temps réel. L'effet de la sonde sur cette
version reste à observer ; les résultats historiques de T001 ne valent pas mesure de ces quatre fichiers.
Si une attente aujourd'hui muette échoue sans sonde une fois rendue
bruyante, ou si la migration exige de toucher au code de production : verdict BLOQUÉ, avec le test et
le fait attendu. Un test n'est jamais relancé jusqu'à ce qu'il passe.

## Journal

- Rafraîchi le 15/10 contre `e92c6a6` : T028 et T145 remplacés par T150, niveau standard ; inventaire
  des helpers corrigé, absence du fichier de sonde explicitée avec sa source de reconstruction.
  Les boucles muettes, appels, pauses fixes et comptages 3/19/2/2 sont confirmés par lecture ; aucun test exécuté.

- Contrôle documentaire : `node scripts/check.mjs --changed` lancé une fois, code 0, vert.
  Aucun fichier de test modifié, donc aucun test exécuté ; Markdown ignoré par Prettier.
  ESLint non lancé (absent ou non configuré). En-têtes, sections et repères contrôlés séparément par lecture.

- Relecture documentaire le 15/10 contre `e92c6a6` : sources rendues pérennes dans
  `docs/audit-points-chauds.md` ou attribuées à la décision du propriétaire, le 15/10.

### 2026-10-15 — Exploration Codex

Lecture des consignes, des quatre fichiers complets et des modèles d’attente ; état initial et choix
consignés dans `.harness-state/tickets/T055/exploration.md`, écarts dans `ecarts.md` (aucun).
Témoin de hooks présent ; aucun rapport de reprise. Les fichiers non suivis initiaux sont conservés.
Sonde reconstruite depuis la source T001 dans le dossier d’état avant modification des tests.

### 2026-10-15 — Sonde disque lent avant et après

Pour chacun des quatre fichiers, cette commande est lancée une seule fois avant modification,
puis une seule fois après migration (tests séquentiels) :

```sh
FLK_MS=10 node --require ./.harness-state/tickets/T055/slow-fs.cjs \
  --test --test-concurrency=1 tests/transcriber-sharing.test.cjs
FLK_MS=10 node --require ./.harness-state/tickets/T055/slow-fs.cjs \
  --test --test-concurrency=1 tests/review-regressions.test.cjs
FLK_MS=10 node --require ./.harness-state/tickets/T055/slow-fs.cjs \
  --test --test-concurrency=1 tests/chat-instruction.test.cjs
FLK_MS=10 node --require ./.harness-state/tickets/T055/slow-fs.cjs \
  --test --test-concurrency=1 tests/server-surveillance.test.cjs
```

| Fichier | Avant : sortie | Après : sortie | Code avant/après |
| --- | --- | --- | --- |
| `transcriber-sharing` | ℹ pass 3 ; ℹ fail 0 | ℹ pass 3 ; ℹ fail 0 | 0 / 0 |
| `review-regressions` | ℹ pass 19 ; ℹ fail 0 | ℹ pass 19 ; ℹ fail 0 | 0 / 0 |
| `chat-instruction` | ℹ pass 2 ; ℹ fail 0 | ℹ pass 2 ; ℹ fail 0 | 0 / 0 |
| `server-surveillance` | ℹ pass 2 ; ℹ fail 0 | ℹ pass 2 ; ℹ fail 0 | 0 / 0 |

Sorties complètes : `.harness-state/tickets/T055/before-<fichier>.txt` et `after-<fichier>.txt`.
Aucun échec sous sonde, aucune relance de la mesure.

### 2026-10-15 — Module partagé, tests d’abord

Commande de chaque cycle, avec sorties conservées dans le dossier d’état :

```sh
node --test --test-concurrency=1 tests/wait-helpers.test.cjs
```

| Comportement ajouté | Rouge observé | Vert observé | Sorties |
| --- | --- | --- | --- |
| Valeur vraie synchrone/asynchrone | 0 pass / 1 fail, assertion export absent | 1 pass / 0 fail | `red-truthy.txt`, `green-truthy.txt` |
| Échéance nommée | 1 pass / 1 fail, rejet absent | 2 pass / 0 fail | `red-deadline.txt`, `green-deadline.txt` |
| Libellé obligatoire | 2 pass / 1 fail, rejet absent | 3 pass / 0 fail | `red-label.txt`, `green-label.txt` |
| Tours explicites et invalides | 3 pass / 2 fail, assertions exports absents | 5 pass / 0 fail | `red-turns.txt`, `green-turns.txt` |
| Promesse différée résolue/rejetée | 5 pass / 1 fail, assertion export absent | 6 pass / 0 fail | `red-deferred.txt`, `green-deferred.txt` |
| Pause réelle sous horloge figée | 6 pass / 1 fail, assertion export absent | 7 pass / 0 fail | `red-pause.txt`, `green-pause.txt` |
| Valeur, rejet et borne d’une promesse | 7 pass / 1 fail, assertion export absent | 8 pass / 0 fail | `red-bounded.txt`, `green-bounded.txt` |
| Contrôle qui ne se règle pas | 8 pass / 1 fail, rejet absent | 9 pass / 0 fail | `red-pending-check.txt`, `green-pending-check.txt` |
| Erreur attendue et succès refusé | 9 pass / 1 fail, assertion export absent | 10 pass / 0 fail | `red-failure.txt`, `green-failure.txt` |

Rouges observés sur `AssertionError`, aucun échec d’import. Le contrat existant est ensuite complété
par trois tests : contrôles lents sans chevauchement (maximum 1), événement réel et expiration sous
horloge figée, propagation des erreurs du contrôle. Même commande : 13 pass / 0 fail, code 0
(`green-contracts.txt`). Minuteries réelles capturées, échéance monotone ; le contrôle en cours n’est
pas relancé après expiration.

### 2026-10-15 — Migration et contrôles ciblés

Les quatre fichiers importent le module en tête. Les appels de `manualTimers` deviennent
`turns(6)` ; seule la ligne qui les contient est découpée pour respecter 160 caractères, sans autre
changement de logique (précision consignée dans `ecarts.md`). Pauses 20/120 ms et délais 10/15 s conservés.

```sh
node --test --test-concurrency=1 tests/transcriber-sharing.test.cjs \
  tests/review-regressions.test.cjs tests/chat-instruction.test.cjs \
  tests/server-surveillance.test.cjs
```

Résultat : code 0, `ℹ pass 26`, `ℹ fail 0` (`migrated.txt`).

```sh
node -e "console.log(Object.keys(require('./tests/helpers/wait.cjs')).sort().join(' '))"
```

Sortie : `bounded deferred failure pause tick turns until`, code 0.

```sh
grep -nE "^(const|function|async function) (tick|settle|until) ?[=(]" \
  tests/transcriber-sharing.test.cjs tests/review-regressions.test.cjs \
  tests/chat-instruction.test.cjs tests/server-surveillance.test.cjs
grep -c "helpers/wait.cjs" tests/transcriber-sharing.test.cjs \
  tests/review-regressions.test.cjs tests/chat-instruction.test.cjs \
  tests/server-surveillance.test.cjs
grep -n "i < 100 && " tests/review-regressions.test.cjs
rg -c '^\s*test\(' tests/transcriber-sharing.test.cjs \
  tests/review-regressions.test.cjs tests/chat-instruction.test.cjs \
  tests/server-surveillance.test.cjs
```

Résultats : aucune définition locale (code 1, sans sortie) ; un import par fichier ; ancienne boucle
absente (code 1, sans sortie) ; nombres de tests inchangés : 3, 19, 2, 2. Vérification supplémentaire
par comparaison des lignes : titres et assertions identiques hors définitions locales supprimées.
Aucune ligne ajoutée de plus de 160 caractères dans les six fichiers JavaScript.
Sorties complètes et commandes dans `static-checks.txt`.

```sh
git diff -U0 HEAD -- tests/transcriber-sharing.test.cjs \
  tests/review-regressions.test.cjs tests/chat-instruction.test.cjs \
  tests/server-surveillance.test.cjs | grep -E "^-.*assert\."
```

Sortie (deux lignes de définitions locales `until` uniquement, repliées ici pour lecture ;
sortie originale complète dans `static-checks.txt`) :

```text
-const until = async (check, label) => { for (const deadline = Date.now() + 10000; Date.now() < deadline;) {
  if (await check()) return; await new Promise(resolve => setTimeout(resolve, 2)); } assert.fail('never reached: ' + label); };
-const until = async (check, label) => { for (const deadline = Date.now() + 15000; Date.now() < deadline;) {
  if (await check()) return; await new Promise(resolve => setTimeout(resolve, 2)); } assert.fail('never reached: ' + label); };
```

```sh
node scripts/check.mjs --changed
```

Résultat : code 0, vert ; règles, format, lint, gel, cliquet et 5 fichiers de tests contrôlés ;
`ℹ pass 39`, `ℹ fail 0`. Mesures améliorées : lignes longues de tests 1714 → 1707,
cas de test 1066 → 1079. Sortie complète : `check-changed.txt`. Plancher du cliquet inchangé.

### 2026-10-15 — Contrôle complet et remise à la boucle

```sh
node scripts/check.mjs
```

Résultat observé : code 0, `check : vert`. Règles, format, lint, gel et cliquet verts ;
99 fichiers JavaScript, `ℹ tests 1180`, `ℹ pass 1180`, `ℹ fail 0` ; Python :
`Ran 84 tests in 27.179s`, `OK (skipped=1)`. Sortie complète :
`.harness-state/tickets/T055/check-full.txt`.

Verdict `TERMINÉ` écrit dans `.harness-state/tickets/T055/verdict.json`.
Les neuf critères sont couverts ; aucun changement de production, de harnais ou de plancher,
aucun commit ni push. Relecture et intégration laissées à la boucle.
