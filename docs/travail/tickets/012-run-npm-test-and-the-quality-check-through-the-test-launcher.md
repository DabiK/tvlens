---
id: T012
titre: Run npm test and the quality check through the test launcher
statut: a-faire
bloque_par: T007, T145
adr: non
installe: non
harnais: oui
supprime_tests: non
---

## Ce que le ticket livre

Le lanceur `scripts/quality/run-tests.mjs` existe mais rien ne l'appelle : `npm test` lance encore tous
les fichiers en parallèle sans délai, et `scripts/check.mjs` appelle `node --test` sous un budget global
qui ne dit pas quel fichier est resté bloqué. Après ce ticket, `npm test` et le contrôle qualité passent
tous deux par le lanceur : même ordre, mêmes délais, et un fichier bloqué est nommé dans la sortie du
contrôle.

## Sources

- Constats : FLK-05, FLK-13, OUBLI-37
- Code concerné, à la version `0d5a954` :
  - `scripts/quality/run-tests.mjs` : le lanceur livré par le ticket prérequis. Il n'existe pas encore
    à cette version. Ce que ce ticket en attend : `node scripts/quality/run-tests.mjs [fichiers…]`, un
    fichier à la fois par défaut, chaque fichier meneur de son groupe de processus ; variables
    `TVLENS_TEST_CONCURRENCY`, `TVLENS_TEST_TIMEOUT_MS` (60 s par test), `TVLENS_TEST_LINGER_MS` (10 s)
    et `TVLENS_TEST_BUDGET_MS` (budget global qu'il applique lui-même) ; un résumé `ℹ tests`, `ℹ pass`,
    `ℹ fail` et une ligne commençant par `✖` par échec, dont « ✖ <fichier> : encore vivant <N> s après
    son dernier test… » et « ✖ <fichier> : Délai dépassé (<N> s)… ».
  - `package.json`, script `test` (ligne 11) : `node --test tests/*.test.cjs`.
  - `scripts/check.mjs`, fonction `jsTests(files)` (ligne 114) : appelle
    `run(process.execPath, ["--test", "--test-concurrency=1", ...targets], TEST_BUDGET_MS)` (ligne 121),
    garde du résultat les lignes `ℹ tests`, `ℹ pass`, `ℹ fail` et celles qui commencent par `✖`
    (ligne 122, quarante au plus), et nomme son étape `tests JS (<n> fichier(s))`.
  - `scripts/check.mjs`, fonction `run(command, commandArgs, budgetMs)` (ligne 29) et constante
    `TEST_BUDGET_MS` (ligne 27, `TVLENS_TEST_BUDGET_MS` ou vingt minutes) : à l'échéance, `SIGKILL` au
    groupe de la commande. Les fichiers lancés par le lanceur ne sont plus dans ce groupe : tuer le
    lanceur au même instant que son propre budget les laisserait vivre.
  - `scripts/check.mjs`, fonction `pythonTests()` (ligne 127) : elle utilise le même `TEST_BUDGET_MS` et
    n'est pas concernée.
  - `tests/quality-check.test.cjs`, test « a test file that never ends turns the check red within its
    time budget and leaves no process behind » (ligne 99) : budget de 4 s, code 1, message
    `Délai dépassé (4 s)` exigé, et le processus du fichier bloqué doit avoir disparu.
  - `tests/quality-check.test.cjs`, test « the full check fails when a measure regresses against the
    baseline and reports skipped tools as not run » (ligne 78) : exige `tests JS (1 fichier(s))`.
  - `CONTRIBUTING.md`, section « Vérifier une modification » (lignes 15 à 21) : `npm ci`, `npm test`,
    `npm run test:electron`.

## Périmètre

- À modifier : `scripts/check.mjs` (`jsTests` seulement), `package.json` (script `test`),
  `CONTRIBUTING.md`, et `tests/quality-check.test.cjs` pour y ajouter un test.
- `harnais: oui` parce que `scripts/check.mjs` est protégé. Le changement durcit le contrôle : il n'en
  retire ni n'en assouplit aucun.
- Forme attendue :
  - `jsTests` lance `scripts/quality/run-tests.mjs` sur les mêmes fichiers qu'aujourd'hui (tous, ou les
    tests modifiés avec `--changed`) et lui passe son budget par `TVLENS_TEST_BUDGET_MS`.
  - Le lanceur applique le budget et nomme le fichier. `check.mjs` garde son propre arrêt du groupe
    comme dernier recours, à une échéance plus tardive que celle passée au lanceur (marge laissée au
    choix, dite dans le journal) : il ne sert que si le lanceur lui-même ne rend pas la main.
  - Le nom d'étape `tests JS (<n> fichier(s))` et la forme du détail (totaux, lignes `✖`) restent. Le
    détail d'un échec montre les lignes `✖` du lanceur, donc le nom du fichier bloqué.
  - `package.json` : `"test": "node scripts/quality/run-tests.mjs"`. Aucun autre script npm ne change.
  - `CONTRIBUTING.md`, section « Vérifier une modification » : les fichiers de test sont lancés un par
    un par défaut ; les quatre variables et leurs défauts ; pourquoi un processus par fichier est requis
    (des tests remplacent des variables d'environnement de leur processus, par exemple `TMPDIR` dans
    l'aide `privateTmp(t)` de `tests/media-asr-options.test.cjs`, lignes 27 à 33).
- À ne pas faire : allonger le budget global ; modifier une assertion existante de
  `tests/quality-check.test.cjs` ; toucher à `pythonTests`, aux autres étapes du contrôle ou au lanceur.
  Si le lanceur doit changer pour que ce ticket passe, le journal dit quoi et pourquoi, et le changement
  reste couvert par un test de `tests/test-launcher.test.cjs`.
- Si un test existant dépasse légitimement 60 s une fois la suite jouée par le lanceur, le défaut du
  délai par test est relevé dans le lanceur et le journal dit quel test et combien ; le test n'est pas
  modifié.

## Critères d'acceptation

1. Les tests existants de `tests/quality-check.test.cjs` passent avec leurs assertions inchangées, dont
   celui du budget de 4 s : `node --test tests/quality-check.test.cjs`.
2. Un test nouveau de `tests/quality-check.test.cjs`, dans un dépôt jetable : un fichier dont le test
   échoue en laissant une minuterie réarmée, avec `TVLENS_TEST_LINGER_MS` court. `node scripts/check.mjs`
   y sort en code 1 bien avant le budget global, sa sortie contient le nom du fichier et « encore
   vivant », et le processus du fichier a disparu.
3. `scripts/check.mjs` ne lance plus `node --test` lui-même : `grep -n '"--test' scripts/check.mjs` ne
   donne rien. Sortie dans le journal.
4. `node -p "require('./package.json').scripts.test"` affiche `node scripts/quality/run-tests.mjs`.
5. `CONTRIBUTING.md` nomme les quatre variables, dit que les fichiers sont lancés un par un par défaut
   et pourquoi un processus par fichier est requis. Vérification : `grep` sur le fichier, sortie dans
   le journal.
6. `node scripts/check.mjs` est vert, et son étape « tests JS » affiche les totaux de la suite. Le
   journal recopie cette ligne et la durée de l'étape.

## Test d'acceptation attendu

Dans `tests/quality-check.test.cjs`, un test nommé d'après le comportement — par exemple « the check
names a test file that is still alive after its last test ». Frontière : `scripts/check.mjs` lancé comme
un processus dans un dépôt jetable (`harnessRepo`), observé par son code de sortie, sa sortie et les
processus qu'il laisse.

## Hypothèses bloquantes

Aucune décision n'est attendue. Le drapeau `harnais: oui` a été posé au découpage et attend la relecture
du propriétaire avant le premier lancement. Si le test du budget de 4 s ne peut pas passer sans changer
ses assertions, ou si la suite complète ne passe pas sous le lanceur pour une raison qui n'est pas un
délai par test : verdict BLOQUÉ, avec le fichier et la sortie.

## Journal
