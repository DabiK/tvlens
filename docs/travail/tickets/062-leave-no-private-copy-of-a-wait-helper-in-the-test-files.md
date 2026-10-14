---
id: T062
titre: Leave no private copy of a wait helper in the test files
statut: a-faire
bloque_par: T056, T060, T061
adr: non
installe: non
harnais: non
supprime_tests: non
---

## Ce que le ticket livre

Les sept derniers fichiers de test qui redéfinissent leurs aides d'attente passent sur
`tests/helpers/wait.cjs`. Après ce ticket, il ne reste dans `tests/` aucune copie privée de `tick`,
`deferred`, `until`, `pause`, `turns`, `bounded` ou `failure` : seules subsistent les aides qui ont un
sens propre, nommées dans le périmètre. C'est le dernier des trois lots de migration, et celui qui
ferme la séquence.

## Sources

- Constats : FLK-12, TSTA-02, TSTB-03
- Définitions locales vérifiées à la version `0d5a954` (le nom d'abord, la ligne ensuite) :
  - `tests/architecture-f04.test.cjs` : `const settle` (4 tours), ligne 13 (3 appels, 8 tests) ;
  - `tests/architecture-f05.test.cjs` : `const pause` sur `setInterval`, ligne 31 ; `const until = async
    (check, what, rounds = 400)`, ligne 32 (24 appels) ; `const bounded`, ligne 34 ; `const settle =
    async (rounds = 10)`, ligne 38 (7 appels) ; `const deferred`, ligne 39 ; `const failure`, ligne 40 ;
    `const tick`, ligne 568 ; boucle muette `for (let i = 0; i < 40 && answer === 'pending'; i++)
    { t.mock.timers.tick(50); await pause(5); }`, ligne 138, suivie de son assertion ligne 139 (15 tests) ;
  - `tests/architecture-f06.test.cjs` : `const pause` sur `setTimeout` nu, ligne 26 ; `const tick`,
    ligne 27 ; `const deferred` avec `reject`, ligne 28 ; `const until = async (check, what, rounds =
    600)`, ligne 30 (16 appels) ; `const eventually`, ligne 32, rend un booléen sans échouer, choix
    documenté ligne 31 (4 appels) ; `const bounded`, ligne 34 ; `const failure`, ligne 38 (17 tests) ;
  - `tests/architecture-f07.test.cjs` : `const realTimeout`, ligne 22 ; `const pause`, ligne 23 ;
    `const tick`, ligne 24 ; `const until` (rend la valeur), ligne 26 (8 appels) ; `const deferred`,
    ligne 27 (12 tests) ;
  - `tests/architecture-f08.test.cjs` : `const tick`, ligne 16 ; `const settle = async (n = 8)`,
    ligne 17 (15 appels) ; `const deferred`, ligne 18 ; `const until`, ligne 20 (2 appels) ;
    `const failure` (« the description should have failed »), ligne 22 (19 tests) ;
  - `tests/architecture-f10.test.cjs` : `const tick`, ligne 18 ; `const deferred`, ligne 19 ;
    `const until`, ligne 21 (2 appels) (10 tests) ;
  - `tests/codex-confinement.test.cjs` : `const settle = async (rounds = 10)`, ligne 82 (5 appels) ;
    `const pause` sur `setInterval`, ligne 137 ; `const until` (500 tours de 10 ms), ligne 138
    (5 appels) ; `const bounded = promise =>`, locale à un test, ligne 760 : rend « nothing after 5 s »
    et ne relaie pas un rejet, alors que l'aide partagée le laisse passer (17 tests).
- Deux faits à garder en tête : le contrôle passé à `until` ligne 531 de
  `tests/architecture-f06.test.cjs` renvoie une requête à chaque essai (l'aide partagée ne lance jamais
  un contrôle avant la fin du précédent) ; un `until` passe un nombre de tours ligne 128 de
  `tests/architecture-f05.test.cjs` (300 tours).
- Toutes ces attentes sont bornées en nombre de tours, pas en durée : quand un contrôle est lent, elles
  durent plus que leur valeur nominale (tours × pas).
- Aides qui gardent un sens propre : `function deferred(t, options)` de `tests/architecture-f09.test.cjs`
  (ligne 50) ; `settle(watch)` de `session-delete`, `session-durable`, `disk-guard` et `clip-unreadable` ;
  `flush` de `tests/mac-ui.test.cjs` et `tests/surveillance.test.cjs` (microtâches) ; `eventually` de
  `tests/architecture-f06.test.cjs` ; le `bounded` local de `tests/codex-confinement.test.cjs`.
- Module partagé : `tests/helpers/wait.cjs`, avec `advanceUntil(t, check, what, stepMs, rounds)` depuis
  le déplacement du banc Mac.

## Périmètre

- À modifier : les sept fichiers ci-dessus, et eux seuls.
  - `tick`, `deferred`, `pause`, `until`, `bounded`, `failure` viennent du module ; leurs définitions
    locales disparaissent, `realTimeout` avec elles ;
  - un `settle()` sans argument devient `turns(N)` avec la valeur par défaut du fichier (4, 10, 8, 10) ;
    un appel qui donnait un nombre le garde ;
  - les `until` prennent l'échéance par défaut de l'aide (5 s), qui dépasse leur borne nominale (2 s
    dans `architecture-f05`, 1,5 s pour l'appel à 300 tours, 3 s dans `architecture-f06`, `f07`, `f08`
    et `f10`) ; un autre appel qui passerait un nombre de tours prend de même la plus longue des deux
    durées, par `timeoutMs` ; dans `codex-confinement`, où la borne nominale (500 tours de 10 ms)
    égale déjà cette échéance, chaque `until` passe `timeoutMs: 10000` ;
  - les appels à `failure` de `tests/architecture-f08.test.cjs` ne changent pas : le libellé par défaut
    de l'aide suffit, ce message ne s'affiche qu'à l'échec et aucune valeur attendue ne le cite ;
  - la boucle de la ligne 138 de `tests/architecture-f05.test.cjs` devient un `advanceUntil` nommé, au
    même pas de 50 ms et avec la même borne de 40 tours, pour que le temps simulé n'avance pas plus
    loin qu'aujourd'hui ;
  - `eventually` et le `bounded` local de `codex-confinement` restent, construits sur le `pause` partagé.
- À ne pas toucher : le code de production ; `tests/helpers/wait.cjs` ; les bancs d'hôte et les faux
  App Server de ces fichiers ; les titres des tests, les valeurs attendues, les nombres de tours.
- Aucune ligne de plus de 160 caractères ajoutée.

## Critères d'acceptation

Chaque critère se vérifie par un test ou une commande.

1. Contraction, sur tout le dossier :
   `grep -nE "^(const|function|async function) (tick|deferred|until|pause|turns|failure|bounded|realTimeout) ?[=(]"
   tests/*.test.cjs` ne sort qu'une ligne, `function deferred(t, options)`.
2. `grep -nE "^const settle = " tests/*.test.cjs` ne sort que quatre lignes, toutes de la forme
   `async watch` (ou `async (watch)` après formatage).
3. `grep -n "i < 40 && " tests/architecture-f05.test.cjs` ne sort rien, et
   `node -e "const s=require('fs').readFileSync('tests/architecture-f05.test.cjs','utf8');
   console.log((s.match(/advanceUntil\([^;]*?50,\s*40,?\s*\)/g)||[]).length)"` (sur une ligne) affiche 1.
4. `grep -c "helpers/wait.cjs"` vaut 1 dans chacun des sept fichiers.
5. `grep -c "^\s*test(" ` donne toujours, dans l'ordre de la liste des sources : 8, 15, 17, 12, 19, 10
   et 17.
6. `git diff -U0 HEAD -- <les sept fichiers> | grep -E "^-.*assert\."` ne sort que des lignes des
   définitions locales supprimées (`until`, `failure`). Sortie dans le journal.
7. Sonde disque lent (fichier de `docs/travail/tickets/001-resent-block-duplicate-without-race.md`,
   section « Sonde de reproduction », enregistré dans `.harness-state/tickets/<id>/slow-fs.cjs`, hors
   Git) : `FLK_MS=10 node --require ./.harness-state/tickets/<id>/slow-fs.cjs --test --test-concurrency=1
   tests/<fichier>` est lancée une fois par fichier avant toute modification et une fois après. Un
   fichier qui passait avant passe après. Décomptes `ℹ pass` et `ℹ fail` dans le journal.
8. `node --test --test-concurrency=1` sur les sept fichiers passe, sans sonde.
9. `node scripts/check.mjs` est vert.

Si un autre lot a renommé des fichiers `architecture-fNN` d'après leur comportement, les critères 1
et 2 les couvrent tels quels ; pour les autres, retrouver chaque fichier par la définition citée dans
les sources (`grep -ln` sur son texte).

## Test d'acceptation attendu

Les tests existants des sept fichiers, sans changement d'exigence, et le critère 1 comme preuve de
contraction. Aucun test nouveau.

## Hypothèses bloquantes

Aucune décision n'est attendue. Si le critère 1 ou 2 sort une définition que ce ticket ne cite pas
(copie apparue depuis `0d5a954`), elle migre ici si elle a le sens de l'aide partagée ; sinon elle est
nommée dans le journal et le verdict est BLOQUÉ. Si, sous sonde, un test qui passait échoue parce
qu'un `until` partagé atteint son échéance là où l'ancienne attente comptait des tours : cet appel
reçoit un `timeoutMs` explicite, égal à l'ancien nombre de tours multiplié par la durée d'un tour
mesurée sous sonde et arrondi à la seconde supérieure ; l'appel, la mesure et la valeur vont dans le
journal. Tout autre changement de résultat, avec ou sans sonde : verdict BLOQUÉ, avec le test en cause.
Un test n'est jamais relancé jusqu'à ce qu'il passe.

## Journal
