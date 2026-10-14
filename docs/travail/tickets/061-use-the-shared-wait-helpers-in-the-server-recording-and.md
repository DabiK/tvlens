---
id: T061
titre: Use the shared wait helpers in the server, recording and Codex client tests
statut: a-faire
bloque_par: T055
adr: non
installe: non
harnais: non
supprime_tests: non
---

## Ce que le ticket livre

Huit autres fichiers de test redéfinissent leurs aides d'attente ; deux d'entre eux ont un `until`
sans libellé, qui échoue sans dire ce qui était attendu. Après ce ticket, ils prennent ces aides dans
`tests/helpers/wait.cjs` et chaque attente bornée nomme le fait attendu. C'est le deuxième des trois
lots de migration.

## Sources

- Constats : FLK-12, TSTA-02, TSTB-03
- Définitions locales vérifiées à la version `0d5a954` (le nom d'abord, la ligne ensuite) :
  - `tests/server-sessions.test.cjs` : `const tick`, ligne 15 ; `const turns = async (count = 20)`,
    ligne 16 (22 appels) ; `const deferred`, ligne 17 (14 tests) ;
  - `tests/server-state-views.test.cjs` : `const tick`, ligne 11 (1 test) ;
  - `tests/recording.test.cjs` : `function deferred()`, ligne 6 ; `const tick`, ligne 39 ;
    `const flush = deferred()`, ligne 11, est une variable de test (6 tests) ;
  - `tests/surveillance.test.cjs` : `const deferred` avec `reject`, ligne 9 ; `const flush = async
    (turns = 300)`, ligne 8, vide des microtâches et reste local (17 tests) ;
  - `tests/codex-connect-race.test.cjs` : `const tick`, ligne 8 (2 tests) ;
  - `tests/codex-thread-rotation.test.cjs` : `const tick`, ligne 10 ; `const deferred` avec `reject`,
    ligne 11 ; `const bounded = fakeAgent(…)`, ligne 307, est une variable de test (14 tests) ;
  - `tests/surveillance-runtime.test.cjs` : `const settle = async (turns = 20)`, ligne 12 (39 appels) ;
    `const until = async (check, turns = 500, graceMs = 5000)`, ligne 15 — tours de boucle puis 5 s de
    temps réel, message « condition never reached » sans libellé (26 appels) ; `const turns = () =>`,
    ligne 745, est une variable de test (14 tests) ;
  - `tests/verification.test.cjs` : `const settle = async (rounds = 10)`, ligne 76 (1 appel) ;
    `const until = async (check, rounds = 2000)`, ligne 77 — 2000 tours de boucle, sans libellé
    (2 appels) (10 tests).
- Module partagé : `tests/helpers/wait.cjs` (`tick`, `turns`, `deferred`, `pause`, `until`, `bounded`,
  `failure`). `turns(count)` exige un nombre ; `until(check, what, { timeoutMs })` exige un libellé.

## Périmètre

- À modifier : les huit fichiers ci-dessus, et eux seuls.
  - `tick`, `deferred`, `turns` et `until` viennent du module ; les définitions locales disparaissent ;
  - un `turns()` ou un `settle()` sans argument devient `turns(N)` avec le nombre que portait la valeur
    par défaut du fichier (20 dans `server-sessions` et `surveillance-runtime`, 10 dans `verification`) ;
    un appel qui donnait un nombre le garde ;
  - chaque `until` de `surveillance-runtime` et de `verification` reçoit un libellé qui nomme le fait
    attendu, tiré de l'assertion qui le suit ou du titre du test ; un appel qui passait des tours ou un
    délai explicites passe une échéance `timeoutMs` qui n'est pas plus courte ;
  - la variable `turns` de `tests/surveillance-runtime.test.cjs` (ligne 745) change de nom pour ne pas
    masquer l'aide dans son test ; `flush` de `tests/surveillance.test.cjs` reste local.
- À ne pas toucher : le code de production ; `tests/helpers/wait.cjs` ; les faux App Server de ces
  fichiers ; les titres des tests, les valeurs attendues, les nombres de tours.
- Aucune ligne de plus de 160 caractères ajoutée.

## Critères d'acceptation

Chaque critère se vérifie par un test ou une commande.

1. `grep -nE "^(const|function|async function) (tick|deferred|turns|until|settle) ?[=(]"
   tests/server-sessions.test.cjs tests/server-state-views.test.cjs tests/recording.test.cjs
   tests/surveillance.test.cjs tests/codex-connect-race.test.cjs tests/codex-thread-rotation.test.cjs
   tests/surveillance-runtime.test.cjs tests/verification.test.cjs` ne sort rien.
2. `grep -c "helpers/wait.cjs"` vaut 1 dans chacun des huit fichiers.
3. `grep -n "condition never reached" tests/surveillance-runtime.test.cjs` ne sort rien.
4. Aucun `until` sans libellé ni `turns` sans nombre ne subsiste : le module les refuse à l'appel, et le
   critère 8 le prouve sur chaque appel exécuté. En complément, `grep -nE "\b(turns|settle)\(\)"` sur les
   huit fichiers ne sort rien.
5. `grep -c "^\s*test(" ` donne toujours, dans l'ordre de la liste des sources : 14, 1, 6, 17, 2, 14,
   14 et 10.
6. `git diff -U0 HEAD -- <les huit fichiers> | grep -E "^-.*assert\."` ne sort que la ligne de la
   définition locale de `until` de `tests/surveillance-runtime.test.cjs` si elle en contient une.
   Sortie dans le journal.
7. Sonde disque lent (fichier de `docs/travail/tickets/001-resent-block-duplicate-without-race.md`,
   section « Sonde de reproduction », enregistré dans `.harness-state/tickets/<id>/slow-fs.cjs`, hors
   Git) : `FLK_MS=10 node --require ./.harness-state/tickets/<id>/slow-fs.cjs --test --test-concurrency=1
   tests/<fichier>` est lancée une fois par fichier avant toute modification et une fois après. Un
   fichier qui passait avant passe après. Décomptes `ℹ pass` et `ℹ fail` dans le journal.
8. `node --test --test-concurrency=1` sur les huit fichiers passe, sans sonde.
9. `node scripts/check.mjs` est vert.

## Test d'acceptation attendu

Les tests existants des huit fichiers, sans changement d'exigence. Aucun test nouveau : l'échec nommé
de `until` est déjà prouvé par `tests/wait-helpers.test.cjs`.

## Hypothèses bloquantes

Aucune décision n'est attendue. Les deux `until` remplacés étaient bornés en tours de boucle (500
tours puis 5 s dans `surveillance-runtime`, 2000 tours dans `verification`), l'aide partagée l'est en
durée (5 s par défaut). Si, sous sonde, un test qui passait échoue parce qu'un `until` partagé atteint
son échéance : cet appel reçoit un `timeoutMs` explicite, égal à la durée mesurée sous sonde de
l'ancienne attente arrondie à la seconde supérieure ; l'appel, la mesure et la valeur vont dans le
journal. Tout autre changement de résultat, avec ou sans sonde, ou une attente qui ne peut pas être
nommée sans lire un état interne du code de production : verdict BLOQUÉ, avec le test et l'attente en
cause. Un test n'est jamais relancé jusqu'à ce qu'il passe.

## Journal
