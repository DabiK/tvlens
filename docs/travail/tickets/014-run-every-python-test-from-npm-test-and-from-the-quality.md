---
id: T014
titre: Run every Python test from npm test and from the quality check
statut: a-faire
bloque_par: T009, T012, T145
adr: non
installe: non
harnais: oui
supprime_tests: non
---

## Ce que le ticket livre

Le code Python installé sur la TV a 117 tests dans deux dossiers. `npm test` n'en lance aucun, et le
contrôle qualité ne lance que ceux de `tests/` : les 33 de `prototypes/lg-remote` ne tournent que si
quelqu'un recopie trois commandes d'un document. Après ce ticket, une seule liste dit où sont les tests
Python ; `npm test`, `npm run test:python` et `scripts/check.mjs` la lisent tous les trois.

## Sources

- Constats : TSTC-08, OUBLI-41, OPS-06, FLK-14
- Code concerné, à la version `0d5a954` :
  - `package.json`, script `test` (ligne 11) : Node seulement. Aucun script ne lance Python.
  - `scripts/check.mjs`, fonction `pythonTests()` (ligne 127) : `python3 -B -m unittest discover -s tests
    -p test_*.py`, sous le budget `TEST_BUDGET_MS` ; l'étape s'appelle « tests Python » et n'existe que
    dans le contrôle complet (ligne 157).
  - `tests/test_tv_ambient.py` (55 tests), `tests/test_tv_capture_gate.py` (20), `tests/test_tv_control.py`
    (9) : 84 tests, comptés par `grep -c "def test_"`. Le journal du ticket T001
    (`docs/travail/tickets/001-resent-block-duplicate-without-race.md`) relève, pour le contrôle
    complet du 2026-10-14, `Ran 84 tests in 29.160s` et `OK (skipped=1)` ; le test sauté est le scénario
    au rythme réel (`TVLENS_SLOW`, `tests/test_tv_capture_gate.py` ligne 231).
  - `prototypes/lg-remote/test_ambient_relay.py` (17), `test_panel.py` (15), `test_control.py` (1) : 33
    tests, comptés de la même façon, non lancés au découpage. Ils chargent leur code par
    `sys.path.insert(0, …/'runtime')` ou par `Path(__file__)` : le dossier courant n'importe pas. Ils
    écrivent dans des dossiers temporaires (`tempfile.TemporaryDirectory`) et lancent des processus
    (`subprocess`). `docs/lg-ambient.md` les lance un par un comme des scripts
    (`python3 prototypes/lg-remote/test_panel.py`) ; qu'ils passent aussi par
    `unittest discover` n'a pas été observé : c'est le premier critère.
  - `prototypes/lg-remote/test_ambient_relay.py` ligne 325 : un test lit une ancienne version d'un
    fichier par `git show 9758633:…`. Il dépend de l'historique Git du dépôt.
  - Les deux dossiers ont des modules de même rôle chargés par `sys.path` : une découverte par dossier,
    dans deux processus, évite qu'ils se masquent.
  - `README.md` ligne 169 : « 287 tests Node et 6 tests Python (`tests/test_tv_control.py`) passaient
    sur la base de la mission du 13 octobre 2026 » — un relevé daté.
  - `docs/lg-ambient.md`, section « Tests (simulation et navigateur, exécutés) » : quatre commandes
    Python séparées (lignes 144 à 147) et le relevé daté du 13 octobre (lignes 161 et 162).
  - `CONTRIBUTING.md`, section « Vérifier une modification » (lignes 15 à 21) : `npm ci`, `npm test`,
    `npm run test:electron`.
  - `tests/quality-check.test.cjs` et `tests/helpers/harness-repo.cjs` : les tests du contrôle qualité,
    joués dans un dépôt jetable qui copie `scripts/quality`.
  - `scripts/quality/run-tests.mjs` : le lanceur des tests Node livré par un ticket antérieur, et
    branché sur `npm test` et sur `scripts/check.mjs` par un ticket prérequis ; il n'existe pas encore
    à cette version.
  - `tests/helpers/tools.cjs`, fonction `requireTool(nom)` : l'aide livrée par un autre ticket
    prérequis. Elle tient une table des outils connus (à cette étape : `ffmpeg`), rend le chemin résolu
    et la valeur `skip` d'un test, et change le saut en échec avec `TVLENS_REQUIRE_TOOLS=1`. Elle
    n'existe pas encore à cette version.

## Périmètre

- À créer : `scripts/quality/python-tests.mjs`. Il porte la liste des dossiers de tests Python (`tests`,
  `prototypes/lg-remote`) et lance une découverte `python3 -B -m unittest discover -s <dossier> -p
  "test_*.py"` par dossier, l'une après l'autre. Lancé directement, il affiche le résultat de chaque
  dossier et sort en échec si l'un échoue. Quand `python3` ne se lance pas, il le dit en une phrase qui
  nomme `python3` et sort en échec : un outil requis absent n'est pas un test réussi.
- À modifier :
  - `scripts/check.mjs` : `pythonTests()` passe par ce module, garde le budget global et l'étape « tests
    Python », et son détail donne une ligne de résultat par dossier.
  - `package.json` : `test:node` (le lanceur des tests Node), `test:python` (ce module), et `test` qui
    lance les deux à la suite. C'est le seul nom retenu pour l'entrée Python.
  - `CONTRIBUTING.md` : `npm test` couvre Node et Python ; `python3` est requis.
  - `docs/lg-ambient.md` : les quatre commandes Python des lignes 144 à 147 deviennent
    `npm run test:python`, plus la ligne `TVLENS_SLOW=1` gardée telle quelle. `README.md` : la commande
    `npm test` de la section « Ce qui est prouvé » dit qu'elle lance aussi les tests Python.
  - `tests/quality-check.test.cjs` : les tests nouveaux. Ceux qui lancent `python3` sont gardés par
    `requireTool('python3')` ; `tests/helpers/tools.cjs` reçoit pour cela une ligne dans sa table
    (`python3`, arguments `--version`, pas de variable de chemin forcé). Aucune seconde aide n'est
    créée.
- `harnais: oui` parce que `scripts/check.mjs` et `scripts/quality/` sont protégés. Le contrôle lance
  plus de tests qu'avant : il n'en retire aucun.
- À ne pas toucher : les fichiers `test_*.py` et le code Python ; les relevés datés (`README.md` ligne
  169, `docs/lg-ambient.md` lignes 161 et 162), qui disent ce qui a été observé ce jour-là — aucun
  décompte nouveau n'est écrit dans un document ; les scripts `*:live`.
- Les attentes en temps réel des tests Python (une trentaine de secondes) ne sont pas réduites ici.

## Critères d'acceptation

Les critères 2 à 4 se vérifient par des tests ajoutés à `tests/quality-check.test.cjs`, dans un dépôt
jetable.

1. Avant toute modification : `python3 -B -m unittest discover -s prototypes/lg-remote -p "test_*.py"`,
   lancé depuis la racine, se termine avec le code 0. Sortie dans le journal, avec le nombre de tests
   et la durée. En cas d'échec, le ticket s'arrête là (voir « Hypothèses bloquantes »).
2. Un dépôt avec un test Python vert dans `tests/` et un autre vert dans `prototypes/lg-remote/` :
   `scripts/check.mjs` est vert et son étape « tests Python » montre un résultat pour chacun des deux
   dossiers.
3. Le même dépôt avec un test rouge dans `prototypes/lg-remote/` : le contrôle est rouge et sa sortie
   nomme ce test.
4. Un dépôt sans aucun test Python : l'étape reste « non lancé », comme aujourd'hui.
5. `npm run test:python` se termine avec le code 0 et affiche deux résultats `Ran <n> tests` suivis de
   `OK`, un par dossier. Sortie dans le journal, avec les deux nombres observés.
6. `node -p "require('./package.json').scripts"` montre `test:node` (le lanceur des tests Node),
   `test:python` (ce module) et `test` égal à `npm run test:node && npm run test:python`. La suite Node
   n'est pas relancée pour ce critère : le critère 5 et le contrôle complet prouvent les deux moitiés.
7. `grep -n "unittest" scripts/check.mjs package.json docs/lg-ambient.md` : la commande de découverte
   n'est plus écrite dans `scripts/check.mjs` ni dans `package.json`, et `docs/lg-ambient.md` ne garde
   que la ligne `TVLENS_SLOW=1`. Sortie dans le journal.
8. `grep -n "python3" tests/helpers/tools.cjs` montre la ligne de table, et
   `TVLENS_REQUIRE_TOOLS=1 node --test tests/quality-check.test.cjs` passe sans test sauté.
9. `node scripts/check.mjs` est vert, et son étape « tests Python » montre un résultat pour `tests` et
   un pour `prototypes/lg-remote`.

## Test d'acceptation attendu

Des tests nouveaux dans `tests/quality-check.test.cjs`, nommés d'après le comportement — par exemple
« the check runs the Python tests of every listed folder and turns red on a failure in any of them ».
Frontière : `scripts/check.mjs` lancé comme un processus par `harnessRepo`, comme les autres tests du
fichier.

## Hypothèses bloquantes

Aucune décision n'est attendue. Le drapeau `harnais: oui` a été posé au découpage et attend la relecture
du propriétaire avant le premier lancement. Si un test de `prototypes/lg-remote` échoue à la version
courante (critère 1), ne passe pas par `unittest discover`, ou ouvre une connexion ailleurs que sur la
machine : verdict BLOQUÉ, avec le test et la sortie ; il n'est ni corrigé, ni sauté, ni retiré de la
liste.

## Journal
