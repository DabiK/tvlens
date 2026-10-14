---
id: T102
titre: Move the installed TV remote and the ipk builder out of prototypes
statut: a-faire
bloque_par: T005, T006, T008, T010, T011, T013, T014, T028
adr: non
installe: non
harnais: oui
supprime_tests: non
---

## Ce que le ticket livre

Deux composants livrés de la TV vivent sous `prototypes/`, où rien ne dit qu'ils sont installés.

- `prototypes/lg-remote/` contient le relais de touches, le gestionnaire du panneau, le mapper et leur
  script de démarrage. Ils sont installés sur la LG, d'après `README.md:139` et `docs/lg-installation.md:20-21`.
- `prototypes/lg-sidebar/package.py` construit le paquet `.ipk` du panneau et de l'affichage ambiant. Le
  script de production `scripts/package-tv-ambient.mjs` l'appelle.

Après ce ticket, ces deux composants se trouvent à `tv/remote/` et `tv/packaging/ipk.py`, à côté du reste du
code de la TV. Le commit est un déplacement seul : `git mv`, plus la mise à jour des chemins qui les
désignent. Le contenu de chaque fichier déplacé ne change pas, hormis les chemins qu'il cite.

## Sources

- Constats : OPS-18, DOC-10, OUBLI-21, OPS-10
- Fichiers suivis à la version `0d5a954` :
  - `prototypes/lg-remote/` : `.gitignore`, `30-tvlens-remote`, `LICENSE.upstream`, `README.md`,
    `control.py`, `rakuten.json`, `runtime/` (`action_catalog.json`, `ambient_relay.py`,
    `magic_mapper_runtime.py`, `managed_mapper.py`, `panel.py`, `tvlens_mapper.py`), `test_ambient_relay.py`,
    `test_control.py`, `test_panel.py`, `vendor/` (`magic_mapper.py`, `upstream.json`).
  - `prototypes/lg-sidebar/package.py`, 20 lignes. Le reste de `prototypes/lg-sidebar/` (`app/`, `probe.py`,
    `smoke.cjs`, `README.md`) est une sonde et reste où il est.
- Les tests de `prototypes/lg-remote` trouvent leur code par le dossier du fichier, ce qui reste vrai après
  le déplacement :
  - `test_ambient_relay.py:9-10` (`HERE/'runtime'`) ;
  - `test_panel.py:4` (`Path(__file__).parent/'runtime'`) ;
  - `test_control.py:7` (`Path(__file__).with_name('control.py')`).
- `test_ambient_relay.py:325` lit `git show 9758633:prototypes/lg-remote/runtime/managed_mapper.py`. C'est un
  chemin dans un commit passé : il ne change pas.
- Le contrôle Python, après lot:L01, passe par `scripts/quality/python-tests.mjs`, qui lance
  une découverte par dossier, dont `prototypes/lg-remote`. Ce fichier n'existe pas à la version citée :
  `scripts/check.mjs`, fonction `pythonTests()`, n'y lance que `-s tests`.
- Chemins à mettre à jour (`git grep -n "lg-remote\|lg-sidebar/package\|'lg-sidebar'"` à la version citée) :
  - `README.md:139` ;
  - `docs/lg-ambient.md:26-28` et `:170` ;
  - `docs/lg-capture-control.md:65` ;
  - `docs/lg-installation.md:20-21`, `:27` et `:47` ;
  - `docs/lg-remote-runtime.md:75` ;
  - `prototypes/lg-remote/README.md:29`, déplacé avec son dossier ;
  - `prototypes/lg-sidebar/README.md:10`, qui lance `package.py` sans argument : ses valeurs par défaut
    (`package.py:4-5`, `base/'app'` et `base/'dist'`, où `base` est le dossier du script) désignaient la
    sonde. La commande devient `python3 tv/packaging/ipk.py --app-dir prototypes/lg-sidebar/app
    --output-dir prototypes/lg-sidebar/dist` ;
  - `scripts/package-tv-ambient.mjs:288`, qui construit le chemin `'prototypes', 'lg-sidebar', 'package.py'` ;
  - `scripts/smoke-tv-overlay.mjs:30`, un commentaire ;
  - `docs/lg-ambient.md:145-147`, si lot:L01 n'a pas déjà remplacé ces commandes par `npm run test:python`.
- Restent tels quels, parce que ce sont des relevés datés ou des rapports :
  - `docs/lg-ambient.md:162` ;
  - `docs/lg-sidebar-validation.md:57` ;
  - `docs/night-features-delivery.md:479` et `:495` ;
  - `test_ambient_relay.py:325`.
- Noms de modules Python : `tv/` porte `ambient`, `capture`, `controller`, `luna`, `transport` ;
  `tv/remote/runtime/` portera `ambient_relay`, `magic_mapper_runtime`, `managed_mapper`, `panel`,
  `tvlens_mapper`, et `tv/remote/vendor/` portera `magic_mapper`. Aucun nom n'est commun.

## Périmètre

- `git mv prototypes/lg-remote tv/remote` et `git mv prototypes/lg-sidebar/package.py tv/packaging/ipk.py`.
- Mise à jour des seuls chemins listés ci-dessus. Aucune autre modification de contenu, aucun renommage de
  fonction, aucune retouche de style.
- `harnais: oui` : `scripts/quality/python-tests.mjs` (créé par lot:L01) nomme le dossier
  `prototypes/lg-remote`. Ce ticket ne fait que remplacer cette chaîne par `tv/remote`. Aucune autre ligne
  du harnais ne change, et aucun contrôle n'est retiré ni assoupli.
- À ne pas toucher : la TV et ce qui y est installé. La table de `docs/lg-installation.md` change de colonne
  « sources du dépôt » ; les destinations sur la LG restent les mêmes.

## Critères d'acceptation

Chaque critère se vérifie par un test ou une commande.

1. `test -d prototypes/lg-remote` échoue ; `test -f tv/remote/runtime/panel.py` et
   `test -f tv/packaging/ipk.py` réussissent.
2. `git grep -n "prototypes/lg-remote\|lg-sidebar/package.py\|'lg-sidebar', 'package.py'" -- . ':!docs/travail'`
   ne rend que
   `docs/lg-ambient.md:162`, `docs/lg-sidebar-validation.md`, `docs/night-features-delivery.md` et la ligne
   `git show 9758633:…` du test déplacé.
3. `git diff -M --stat HEAD` montre les fichiers de `prototypes/lg-remote` et `package.py` comme renommés.
   Seul `tv/remote/README.md` peut avoir une différence de contenu, et seulement sur la ligne de chemin.
   `tv/packaging/ipk.py` est identique à l'ancien `package.py`.
4. Avant le déplacement, `python3 -B -m unittest discover -s prototypes/lg-remote -p "test_*.py"` donne N
   tests OK. Après, `python3 -B -m unittest discover -s tv/remote -p "test_*.py"` donne les mêmes N tests OK.
   N est noté au journal. À la version citée, les trois fichiers comptent 33 fonctions `def test_`
   (17, 15 et 1) ; leur passage par `unittest discover` n'a pas été observé.
5. `node scripts/package-tv-ambient.mjs` réussit hors ligne : il appelle `tv/packaging/ipk.py` par son
   nouveau chemin et écrit le paquet sous `dist/tv-ambient/`, ignoré par Git. Rien n'est installé sur la TV.
6. `node scripts/check.mjs` est vert, tests Python compris, et le nombre de tests Python qu'il rapporte est
   le même qu'avant le ticket.

## Test d'acceptation attendu

Les tests Python déplacés, inchangés, découverts dans leur nouveau dossier par le contrôle. Frontière : les
modules de `tv/remote/runtime/` chargés par les tests, comme aujourd'hui. Aucun test nouveau : le ticket ne
change aucun comportement.

## Hypothèses bloquantes

Aucune décision n'est attendue. Après le déplacement, les valeurs par défaut de `tv/packaging/ipk.py`
désignent `tv/packaging/app` et `tv/packaging/dist`, qui n'existent pas. Aucun appelant ne s'en sert : tous
passent `--app-dir` et `--output-dir`. Le ticket qui suit les rend obligatoires ; celui-ci ne les touche
pas. Si lot:L01 n'a pas créé `scripts/quality/python-tests.mjs`, ou s'il ne nomme pas
`prototypes/lg-remote`, le ticket ne touche pas au harnais : verdict BLOQUÉ, avec l'état constaté. Le ticket
n'ajoute pas de découverte au contrôle lui-même. Si une découverte commune à `tests` et `tv/remote`
fait entrer en collision deux modules de même nom, le journal le montre et le ticket s'arrête.

## Journal
