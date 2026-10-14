---
id: T104
titre: Make the TV ipk build reproducible and require its inputs explicitly
statut: a-faire
bloque_par: T102, T145
adr: non
installe: non
harnais: non
supprime_tests: non
---

## Ce que le ticket livre

`tv/packaging/ipk.py` (l'ancien `prototypes/lg-sidebar/package.py`) construit les paquets installés sur la
LG. Deux constructions du même arbre donnent pourtant deux fichiers différents : l'en-tête ar porte l'heure
de la construction, et l'en-tête gzip aussi. On ne peut donc pas vérifier qu'un paquet installé correspond à
une version du dépôt. Le script a deux autres défauts.

- Chaque paquet, celui de production compris, se décrit comme « Reversible sidebar feasibility probe ».
- Ses dossiers par défaut désignent, depuis le déplacement, des dossiers qui n'existent pas.

Après ce ticket, la date de la construction vient de `SOURCE_DATE_EPOCH` (0 en son absence) : deux
constructions du même arbre donnent le même SHA-256. La description, le dossier de l'app et le dossier de
sortie deviennent des arguments obligatoires, et un test Python le prouve.

## Sources

- Constats : OPS-10
- Code vérifié à la version `0d5a954`, dans `prototypes/lg-sidebar/package.py` (20 lignes), que le ticket
  T102 déplace sans le modifier :
  - lignes 4-5 : `base=Path(__file__).resolve().parent`, `--app-dir` par défaut `base/'app'`, `--output-dir`
    par défaut `base/'dist'` ;
  - lignes 7-12 : `archive()`, `tarfile.open(fileobj=b,mode='w:gz')`. En mode `w:gz`, `tarfile` écrit l'heure
    courante dans l'en-tête gzip, sans moyen de la fixer. Seul `gzip.GzipFile(..., mtime=...)` le permet.
    Les `TarInfo` ont un `mtime` de 0 par défaut et le mode `0o644` ;
  - ligne 13 : `Description: Reversible sidebar feasibility probe` dans la fiche `control` ;
  - ligne 14 : fichiers du premier niveau de l'app, triés, sauf `connection.js` ;
  - ligne 18 : `int(time.time())` dans chaque en-tête ar ;
  - ligne 20 : écrit `{ident}_{version}_all.ipk` dans le dossier de sortie et affiche son chemin.
- Appelants :
  - `scripts/package-tv-ambient.mjs`, fonction `main`, appel `spawnSync` de l'empaqueteur (ligne 288 à la
    version citée) : passe `--app-dir` et `--output-dir`, après T102 vers
    `tv/packaging/ipk.py` ;
  - `docs/lg-installation.md:27` et `docs/lg-remote-runtime.md:75` passent `--app-dir tv/app --output-dir
    tv/dist` ;
  - `prototypes/lg-sidebar/README.md:10` passe, après T102, les dossiers de la sonde.
- `scripts/package-tv-ambient.mjs`, `assemble()` ligne 241 : distingue le paquet de production
  (`org.tvlens.ambient`) de la sonde (`org.tvlens.ambientprobe`).

## Périmètre

À modifier :

- `tv/packaging/ipk.py` :
  - `--app-dir`, `--output-dir` et `--description` deviennent obligatoires ;
  - la date vient de `SOURCE_DATE_EPOCH`, qui vaut 0 en son absence. Une valeur qui n'est pas un entier
    positif ou nul est refusée par un message clair et un code de sortie non nul, sans paquet écrit ;
  - la date sert à l'en-tête ar, au `mtime` de chaque `TarInfo` et à l'en-tête gzip, via `gzip.GzipFile`
    autour d'un `tarfile` en mode `w` ;
  - la fiche `control` porte la description reçue ;
  - le reste ne change pas : choix des fichiers, exclusion de `connection.js`, noms des entrées, nom du
    paquet, chemin affiché.
- `scripts/package-tv-ambient.mjs`, le même appel dans `main` : passe `--description`, une pour le paquet
  de production et une autre pour la sonde. Aucune autre ligne ne change.
- `docs/lg-installation.md`, `docs/lg-remote-runtime.md` et `prototypes/lg-sidebar/README.md` : leurs
  commandes passent `--description`.

À créer :

- `tests/test_tv_packaging.py`, qui lance `tv/packaging/ipk.py` par `sys.executable` sur un dossier
  d'app temporaire de quelques fichiers (dont un `connection.js`). Il vérifie :
  - deux constructions avec la même `SOURCE_DATE_EPOCH` donnent le même SHA-256 ; une autre valeur donne un
    autre SHA-256 ;
  - sans `--app-dir`, ou sans `--description`, la construction échoue et n'écrit rien ;
  - une `SOURCE_DATE_EPOCH` non entière est refusée ;
  - la fiche `control`, lue dans l'archive, porte la description passée ;
  - `connection.js` ne figure pas dans `data.tar.gz`, et les autres fichiers y sont, sous
    `usr/palm/applications/<id>/`.

À ne pas toucher : `assemble()` et les refus de `scripts/package-tv-ambient.mjs`, la TV.

## Critères d'acceptation

Chaque critère se vérifie par un test ou une commande.

1. `python3 -B -m unittest tests/test_tv_packaging.py` passe, hors ligne.
2. `grep -n "time.time\|feasibility probe" tv/packaging/ipk.py` ne rend rien.
3. `grep -n "default=" tv/packaging/ipk.py` ne rend rien.
4. `node scripts/package-tv-ambient.mjs`, lancé deux fois, écrit deux fois le même paquet sous
   `dist/tv-ambient/`. `shasum -a 256` donne la même somme les deux fois ; les deux sommes figurent au
   journal.
5. `node --test tests/tv-ambient-params.test.cjs` passe sans qu'une ligne du fichier ait changé.
6. `node scripts/check.mjs` est vert, tests Python compris.

## Test d'acceptation attendu

`tests/test_tv_packaging.py`, nouveau. Frontière : le script `tv/packaging/ipk.py` lancé comme processus, et
l'archive `.ipk` qu'il écrit, lue octet par octet (ar, puis tar et gzip).

## Hypothèses bloquantes

Aucune décision n'est attendue. Le ticket ne prouve pas qu'un paquet daté de `SOURCE_DATE_EPOCH` s'installe
sur la LG : il ne touche pas à la TV, et le journal le dit comme non vérifié. Si un appelant non listé ici se
sert des valeurs par défaut retirées, il passe les arguments explicitement, dans le même commit, et le
journal le cite.

## Journal
