---
id: T103
titre: Move the TV remote Python tests into tests and run them in one discovery
statut: a-faire
bloque_par: T102, T145
adr: non
installe: non
harnais: oui
supprime_tests: non
---

## Ce que le ticket livre

Après le déplacement de `tv/remote/`, ses trois fichiers de test sont toujours rangés à côté du code. Ils
trouvent ce code par le dossier où ils se trouvent. Le contrôle doit donc lancer une découverte Python de
plus, rien que pour eux. Tous les autres tests Python du projet sont à plat dans `tests/`, et ils trouvent
`tv/` par un chemin calculé depuis la racine.

Après ce ticket, les trois fichiers vivent dans `tests/` sous des noms qui disent ce qu'ils couvrent. Ils
trouvent `tv/remote` comme les autres tests trouvent `tv/`, et une seule découverte (`-s tests`) les lance
tous. Aucun test n'est ajouté, retiré ni modifié dans ce qu'il vérifie.

## Sources

- Constats : OPS-18, DOC-10, OUBLI-29
- Code vérifié à la version `0d5a954`, aux chemins d'avant le ticket T102 (`prototypes/lg-remote/` y devient
  `tv/remote/`) :
  - `test_ambient_relay.py:9` : `HERE=Path(__file__).resolve().parent` ; `:10` :
    `sys.path.insert(0,str(HERE/'runtime'))`. `HERE` sert aussi ligne 325, dans
    `git -C HERE show 9758633:prototypes/lg-remote/runtime/managed_mapper.py`, et ligne 330, qui lit
    `HERE/'vendor'/'upstream.json'`.
  - `test_panel.py:4` : `sys.path.insert(0,str(Path(__file__).parent/'runtime'))`.
  - `test_control.py:7` : `spec_from_file_location('remote_control', Path(__file__).with_name('control.py'))`.
  - Modèle en place : `tests/test_tv_control.py:14`,
    `sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'tv'))`.
  - Noms déjà pris dans `tests/` : `test_tv_ambient.py`, `test_tv_capture_gate.py`, `test_tv_control.py`.
  - `scripts/check.mjs`, fonction `pythonTests()` : `-s tests` seulement, à la version citée. Après
    lot:L01, c'est `scripts/quality/python-tests.mjs` qui liste les dossiers, et T102 y a mis
    `tv/remote`.
- OUBLI-29 signale aussi que la ligne 325 se saute sur un clone superficiel. Cela relève de la profondeur de
  clone de la CI (constat OPS-05, hors de ce lot) : ce ticket ne la touche pas.

## Périmètre

- `git mv` de chaque fichier, puis, dans chacun, seulement le calcul du chemin :
  - `tv/remote/test_panel.py` → `tests/test_tv_remote_panel.py` ;
  - `tv/remote/test_ambient_relay.py` → `tests/test_tv_remote_ambient_relay.py` ;
  - `tv/remote/test_control.py` → `tests/test_tv_remote_control.py`.
  Le dossier du code devient `Path(__file__).resolve().parents[1]/'tv'/'remote'`. Dans
  `test_ambient_relay`, `HERE` désigne ce dossier, si bien que la ligne `git show` et ses autres usages
  restent justes. Aucune assertion, aucun nom de test, aucune donnée ne change.
- `harnais: oui` : `tv/remote` sort de la liste des dossiers de `scripts/quality/python-tests.mjs`, devenue
  inutile parce que `tests` les contient. C'est la seule ligne du harnais modifiée ; le nombre de tests lancés
  ne baisse pas (critère 2).
- Documentation : les commandes qui lancent ces tests par leur chemin (`tv/remote/README.md`,
  `docs/lg-capture-control.md:65`, et `docs/lg-ambient.md:145-147` si elles y figurent encore) citent les
  nouveaux chemins, ou `npm run test:python` si lot:L01 l'a créé.
- À ne pas toucher : le code de `tv/remote/`, les autres tests Python, `scripts/check.mjs`.

## Critères d'acceptation

Chaque critère se vérifie par un test ou une commande.

1. `ls tv/remote/test_*.py` ne trouve aucun fichier ; les trois fichiers existent sous `tests/`.
2. Au début de la session, l'agent mesure A, le nombre de tests de
   `python3 -B -m unittest discover -s tests -p "test_*.py"`, et B, celui de la même commande avec
   `-s tv/remote`. En fin de session, la première commande donne A + B tests, et OK. Les trois mesures
   figurent au journal.
3. `git diff -M HEAD -- tests/test_tv_remote_*.py` ne montre, en dehors des renommages, que les lignes de
   calcul du chemin.
4. `grep -rn "parent/'runtime'\|with_name('control.py')" tests` ne rend rien.
5. `node scripts/check.mjs` est vert, et le nombre de tests Python qu'il rapporte est A + B.

## Test d'acceptation attendu

Les trois fichiers de test déplacés, inchangés dans ce qu'ils vérifient, découverts par `-s tests`.
Frontière : les modules de `tv/remote/runtime/` et `tv/remote/control.py`, chargés comme aujourd'hui.

## Hypothèses bloquantes

Aucune décision n'est attendue. Une découverte unique charge tous les modules dans le même processus. Si deux
tests y deviennent dépendants l'un de l'autre (un module de même nom, un `sys.path` qui en masque un autre,
un état global partagé), le test qui échoue ne passe pas et n'est pas modifié. Verdict BLOQUÉ, avec la
sortie : la liste des dossiers du harnais reste alors en l'état.

## Journal
