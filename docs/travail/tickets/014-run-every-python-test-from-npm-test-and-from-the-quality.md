---
id: T014
titre: Run every Python test from npm test and from the quality check
statut: a-faire
bloque_par: T009, T012
adr: non
installe: non
harnais: oui
supprime_tests: non
---

## Ce que le ticket livre

Le code Python installé sur la TV a 96 tests dans deux dossiers. `npm test` n'en lance aucun, et le
contrôle qualité ne lance que ceux de `tests/` : les 42 de `prototypes/lg-remote` ne tournent que si
quelqu'un lance leurs fichiers un par un, comme `docs/lg-capture-control.md` le fait pour le seul
`test_panel.py`. Après ce ticket, une seule liste dit où sont les tests Python ; `npm test`,
`npm run test:python` et `scripts/check.mjs` la lisent tous les trois.

## Sources

- Constats : TSTC-08, OUBLI-41, OPS-06, FLK-14
- Code concerné, à la version `11e601f` :
  - `package.json`, script `test` (ligne 11) : Node seulement. Aucun script ne lance Python.
  - `scripts/check.mjs`, fonction `pythonTests()` (lignes 193 à 199) : `python3 -B -m unittest discover -s
    tests -p test_*.py` (ligne 196), sous le budget `TEST_BUDGET_MS` ; l'étape s'appelle « tests Python »
    et n'existe que dans le contrôle complet (ligne 224).
  - `tests/test_tv_capture.py` (22 tests) et `tests/test_tv_control.py` (32) : 54 tests, comptés par
    `grep -c "def test_"`. Le contrôle complet de T292, le 19/10, relève `Ran 54 tests in 47.611s` puis
    `OK` (`.harness-state/tickets/T292/check-full.log`). Aucun n'est sauté : le scénario au rythme réel
    (`TVLENS_SLOW`) a disparu avec `tests/test_tv_capture_gate.py`, retiré par T181 (`566b4a2`) ;
    `tests/test_tv_ambient.py` a été retiré par T166 (`13c5890`).
  - `prototypes/lg-remote/test_panel.py` (38), `test_mapper.py` (3) et `test_control.py` (1) : 42 tests,
    comptés de la même façon, non lancés par le contrôle. `test_panel.py` et `test_mapper.py` chargent
    leur code par `sys.path.insert(0, …/'runtime')`, `test_control.py` par `Path(__file__)` : le dossier
    courant n'importe pas. Ils écrivent dans des dossiers temporaires (`tempfile.TemporaryDirectory`) et
    lancent ou simulent des processus (`subprocess`). `test_mapper.py` remplace depuis T166
    `test_ambient_relay.py`, retiré. Le journal de T166 a observé le 16/10
    `python3 -B -m unittest discover -s prototypes/lg-remote -p 'test_*.py' -v` vert sur 18 tests ;
    `test_panel.py` a grandi depuis (T268, T285, T286, T288) et, d'après leurs journaux, n'a été relancé
    que comme script : le passage par `unittest discover` à la version courante reste le premier critère.
  - `prototypes/lg-remote/test_mapper.py` lignes 94 et 95 : un test lit une ancienne version d'un fichier
    par `git -C <dossier> show 9758633:…` ; sans cet historique, il se déclare sauté (`skipTest`).
  - Les deux dossiers modifient `sys.path` pour charger leurs modules (`tv/` d'un côté,
    `prototypes/lg-remote/runtime/` de l'autre) : une découverte par dossier, dans deux processus, évite
    qu'ils se masquent, même si aucun nom de module ne leur est commun à cette version.
  - `README.md` ligne 177 : « 287 tests Node et 6 tests Python (`tests/test_tv_control.py`) passaient
    sur la base de la mission du 13 octobre 2026 » — un relevé daté. La commande `npm test` de la
    section « Ce qui est prouvé, ce qui reste à mesurer » (ligne 175) est à la ligne 184.
  - `docs/lg-ambient.md` : page historique depuis T182 (`c96a46a`). Son en-tête (lignes 10 à 13 et 34
    à 39) dit que les commandes qui suivent sont des traces datées du 13 octobre, plus des instructions
    applicables. Sa section « Tests » (lignes 183 à 215) cite trois fichiers Python retirés depuis
    (lignes 186 à 190).
  - `docs/lg-capture-control.md`, section « Validation et échecs conservés » (ligne 72), bloc
    « Commandes : » (lignes 81 à 89) : `npm test`, puis
    `python3 -m unittest discover -s tests -p 'test_tv_*.py' -v` (ligne 85) et
    `python3 prototypes/lg-remote/test_panel.py` (ligne 86).
  - `CONTRIBUTING.md`, section « Vérifier une modification » (lignes 86 à 92) : `npm ci`, `npm test`,
    `npm run test:electron`.
  - `tests/quality-check.test.cjs` et `tests/helpers/harness-repo.cjs` : les tests du contrôle qualité,
    joués dans un dépôt jetable qui copie `scripts/quality`. Dans un dépôt sans test Python, la sortie
    verte exigée contient `– tests Python : non lancé (aucun test)` (ligne 30).
  - `scripts/quality/run-tests.mjs` : le lanceur des tests Node livré par T007, et branché sur
    `npm test` et sur `scripts/check.mjs` par T012 ; il n'existe pas encore à cette version.
  - `tests/helpers/tools.cjs`, fonction `requireTool(nom)` : l'aide livrée par T009. Elle tient une
    table des outils connus (à cette étape : `ffmpeg`), rend le chemin résolu et la valeur `skip` d'un
    test, et change le saut en échec avec `TVLENS_REQUIRE_TOOLS=1`. Elle n'existe pas encore à cette
    version.

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
  - `docs/lg-capture-control.md` : les deux commandes Python des lignes 85 et 86 deviennent
    `npm run test:python`. `README.md` : la commande `npm test` de la section « Ce qui est prouvé, ce qui
    reste à mesurer » (ligne 184) dit qu'elle lance aussi les tests Python.
  - `tests/quality-check.test.cjs` : les tests nouveaux. Ceux qui lancent `python3` sont gardés par
    `requireTool('python3')` ; `tests/helpers/tools.cjs` reçoit pour cela une ligne dans sa table
    (`python3`, arguments `--version`, pas de variable de chemin forcé). Aucune seconde aide n'est
    créée.
- `harnais: oui` parce que `scripts/check.mjs` et `scripts/quality/` sont protégés. Le contrôle lance
  plus de tests qu'avant : il n'en retire aucun.
- À ne pas toucher : les fichiers `test_*.py` et le code Python ; les relevés datés (`README.md` ligne
  177) et `docs/lg-ambient.md` en entier, page historique, qui disent ce qui a été observé ce jour-là —
  aucun décompte nouveau n'est écrit dans un document ; les scripts `*:live`.
- Les attentes en temps réel des tests Python (environ 48 s pour `tests/` au contrôle complet du 19/10)
  ne sont pas réduites ici.

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
7. `grep -n "unittest" scripts/check.mjs package.json docs/lg-capture-control.md` ne rend rien : la
   commande de découverte n'est plus écrite dans ces trois fichiers. Sortie dans le journal.
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

Aucune décision n'est attendue. Le drapeau `harnais: oui` a été relu et autorisé par le propriétaire le
19/10. Si un test de `prototypes/lg-remote` échoue à la version courante (critère 1), ne passe pas par
`unittest discover`, ou ouvre une connexion ailleurs que sur la machine : verdict BLOQUÉ, avec le test et
la sortie ; il n'est ni corrigé, ni sauté, ni retiré de la liste.

## Journal

- 19/10, orchestrateur : rouvert sur décision du propriétaire (sélection du tri d'Astra) ; sources mises à
  jour à `11e601f` (`1178657` plus T292, intégré pendant la mise à jour, qui modifie `scripts/check.mjs`) :
  fichiers Python retirés ou créés par T166 et T181 (54 tests dans `tests/`, 42 dans
  `prototypes/lg-remote`, plus de `TVLENS_SLOW`), dépendance à Git déplacée dans `test_mapper.py` ;
  `docs/lg-ambient.md`, devenue page historique avec T182, n'est plus modifiée : les commandes à remplacer
  sont celles de `docs/lg-capture-control.md` (périmètre et critère 7 ajustés). Bloqueurs revus : T145
  retiré (file parquée, rouverte par le propriétaire) ; T009 et T012 gardés, `a-faire`, dépendances
  réelles (`requireTool` et le lanceur branché). Harnais autorisé par le propriétaire le 19/10.
