---
id: T060
titre: Use the shared wait helpers in the session and moment index tests
statut: a-faire
bloque_par: T055
adr: non
installe: non
harnais: non
supprime_tests: non
---

## Ce que le ticket livre

Huit fichiers de test redéfinissent chacun `tick`, `deferred` ou une boucle de tours comptés. Après ce
ticket, ils les prennent dans `tests/helpers/wait.cjs`. C'est le premier des trois lots de migration ;
aucun test ne change de sens.

## Sources

- Constats : FLK-12, TSTA-02, TSTB-03
- Définitions locales vérifiées à la version `0d5a954` (le nom d'abord, la ligne ensuite) :
  - `tests/session.test.cjs` : `const tick`, ligne 4 ; `const deferred`, ligne 5 (8 tests) ;
  - `tests/session-latency.test.cjs` : `const tick`, ligne 5 ; `const deferred`, ligne 6 (20 tests) ;
  - `tests/split-perception.test.cjs` : `const tick`, ligne 7 ; `const deferred`, ligne 8 (10 tests) ;
  - `tests/session-delete.test.cjs` : `const tick`, ligne 14 ; `const settle = async watch =>`,
    ligne 15 ; `const deferred`, ligne 16 (3 tests) ;
  - `tests/session-durable.test.cjs` : `const tick`, ligne 18 ; `const settle = async watch =>`,
    ligne 19 ; `const deferred`, ligne 20 ; `const turns = async () =>` (20 tours), locale à un test,
    ligne 1004 (24 tests) ;
  - `tests/disk-guard.test.cjs` : `const tick`, ligne 14 ; `const settle = async watch =>`, ligne 15
    (4 tests) ;
  - `tests/clip-unreadable.test.cjs` : `const tick`, ligne 24 ; `const settle = async watch =>`,
    ligne 25 (5 tests) ;
  - `tests/moment-index.test.cjs` : `const tick`, ligne 15 ; `const settle = async () =>` (6 tours),
    locale à un test, ligne 525 ; `const bounded = setup(…)`, ligne 93, est une variable de test sans
    rapport avec l'aide `bounded` (22 tests).
- `settle(watch)` (`do { await tick(); } while (watch.running)`) attend un vrai signal de la session
  de visionnage : ce n'est pas une copie des `settle` à tours comptés.
- Module partagé : `tests/helpers/wait.cjs`, créé par le ticket qui précède (`tick`, `turns`,
  `deferred`, `pause`, `until`, `bounded`, `failure`).

## Périmètre

- À modifier : les huit fichiers ci-dessus, et eux seuls.
  - `tick` et `deferred` viennent du module ; leurs définitions locales disparaissent ;
  - `settle(watch)` reste défini dans ses quatre fichiers, sur le `tick` partagé ;
  - la boucle locale de `tests/session-durable.test.cjs` (ligne 1004) devient `turns(20)` et celle de
    `tests/moment-index.test.cjs` (ligne 525) devient `turns(6)`, avec le même nombre de tours ; cette
    dernière appartient à une horloge écrite sur place dans un test : si le ticket des horloges
    partagées est passé avant, elle a déjà disparu avec cette horloge et il n'y a rien à faire ;
  - `manualClock` de `tests/moment-index.test.cjs` continue d'utiliser `tick`, où qu'elle soit définie
    au moment où ce ticket est traité.
- À ne pas toucher : le code de production ; `tests/helpers/wait.cjs` (si une aide manque, c'est un
  écart à signaler, pas une variante à ajouter) ; les titres des tests, les valeurs attendues, les
  nombres de tours.
- Aucune ligne de plus de 160 caractères ajoutée.

## Critères d'acceptation

Chaque critère se vérifie par un test ou une commande.

1. `grep -nE "^(const|function|async function) (tick|deferred) ?[=(]" tests/session.test.cjs
   tests/session-latency.test.cjs tests/split-perception.test.cjs tests/session-delete.test.cjs
   tests/session-durable.test.cjs tests/disk-guard.test.cjs tests/clip-unreadable.test.cjs
   tests/moment-index.test.cjs` ne sort rien.
2. `grep -nE "const (turns|settle) = async \(\) =>" tests/session-durable.test.cjs tests/moment-index.test.cjs`
   ne sort rien.
3. `grep -c "helpers/wait.cjs"` vaut 1 dans chacun des huit fichiers.
4. `grep -c "^\s*test(" ` donne toujours, dans l'ordre de la liste des sources : 8, 20, 10, 3, 24, 4,
   5 et 22.
5. `git diff -U0 HEAD -- <les huit fichiers> | grep -E "^-.*assert\."` ne sort rien. Sortie dans le
   journal.
6. Sonde disque lent (fichier de `docs/travail/tickets/001-resent-block-duplicate-without-race.md`,
   section « Sonde de reproduction », enregistré dans `.harness-state/tickets/<id>/slow-fs.cjs`, hors
   Git) : `FLK_MS=10 node --require ./.harness-state/tickets/<id>/slow-fs.cjs --test --test-concurrency=1
   tests/<fichier>` est lancée une fois par fichier avant toute modification et une fois après. Un
   fichier qui passait avant passe après. Décomptes `ℹ pass` et `ℹ fail` dans le journal.
7. `node --test --test-concurrency=1` sur les huit fichiers passe, sans sonde.
8. `node scripts/check.mjs` est vert.

## Test d'acceptation attendu

Les tests existants des huit fichiers, sans changement d'exigence : ils prouvent que les aides
partagées ont le sens des copies qu'elles remplacent. Aucun test nouveau.

## Hypothèses bloquantes

Aucune décision n'est attendue. Si un test change de résultat avec l'aide partagée, ou échoue sous
sonde alors qu'il passait avant : verdict BLOQUÉ, avec le test et l'aide en cause. Un test n'est
jamais relancé jusqu'à ce qu'il passe.

## Journal
