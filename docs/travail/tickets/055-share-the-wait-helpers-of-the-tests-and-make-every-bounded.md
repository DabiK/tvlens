---
id: T055
titre: Share the wait helpers of the tests and make every bounded wait fail aloud
statut: a-faire
bloque_par: T028, T145
adr: non
installe: non
harnais: non
supprime_tests: non
---

## Ce que le ticket livre

Les aides d'attente des tests (`tick`, `deferred`, `until`, `pause`…) sont recopiées de fichier en
fichier avec des sens différents, et plusieurs `until` abandonnent en silence quand leur borne est
atteinte. Après ce ticket, un module unique `tests/helpers/wait.cjs` les définit une fois, avec ses
propres tests, et quatre premiers fichiers l'utilisent : une attente bornée qui n'aboutit pas y fait
échouer le test en nommant le fait attendu.

## Sources

- Constats : FLK-12, TSTA-02, TSTB-03
- Code vérifié à la version `0d5a954` (le nom d'abord, la ligne ensuite) :
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
  - `tests/helpers/` ne contient que `harness-repo.cjs`.
- `Date` est figée par `t.mock.timers` dans `tests/codex-confinement.test.cjs:436` et
  `tests/architecture-f05.test.cjs:306` : une échéance mesurée avec `Date.now()` n'y avancerait pas.
- Sonde disque lent : le fichier décrit dans
  `docs/travail/tickets/001-resent-block-duplicate-without-race.md`, section « Sonde de reproduction ».

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
5. `grep -c "^\s*test(" ` donne toujours 3, 19, 2 et 2 pour `transcriber-sharing`, `review-regressions`,
   `chat-instruction` et `server-surveillance`.
6. `git diff -U0 HEAD -- tests/transcriber-sharing.test.cjs tests/review-regressions.test.cjs
   tests/chat-instruction.test.cjs tests/server-surveillance.test.cjs | grep -E "^-.*assert\."` ne sort
   que des lignes appartenant aux définitions locales de `until` supprimées. Sortie dans le journal.
7. Sonde disque lent, enregistrée dans le dossier d'état du ticket (`.harness-state/tickets/<id>/slow-fs.cjs`,
   hors Git) : pour chacun des quatre fichiers, `FLK_MS=10 node --require ./.harness-state/tickets/<id>/slow-fs.cjs
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

Aucune décision n'est attendue. Si une attente aujourd'hui muette échoue sans sonde une fois rendue
bruyante, ou si la migration exige de toucher au code de production : verdict BLOQUÉ, avec le test et
le fait attendu. Un test n'est jamais relancé jusqu'à ce qu'il passe.

## Journal
