---
id: T105
titre: Build both TV packages from a file manifest with one npm command
statut: a-faire
bloque_par: T104
adr: non
installe: non
harnais: non
supprime_tests: non
---

## Ce que le ticket livre

Le paquet du panneau se construit aujourd'hui à la main. On lance `ipk.py --app-dir tv/app`, qui prend tout
le premier niveau de `tv/app` sauf `connection.js`. Le panneau embarque donc aussi les fichiers de
l'affichage ambiant (`ambient.html`, `ambient.js`, `ambient.css`, `appinfo.ambient.json`), et n'importe quel
fichier déposé dans `tv/app`. Le paquet ambiant, lui, passe par un assemblage contrôlé
(`scripts/package-tv-ambient.mjs`).

Après ce ticket, une seule commande, `npm run package:tv`, construit les deux paquets. Chacun part d'un
dossier assemblé à partir d'une liste fermée de fichiers. La date de construction est celle du commit
`HEAD`, et la commande affiche le SHA-256 de chaque paquet. Deux exécutions sur le même commit donnent donc
les mêmes sommes, que l'on peut comparer à un paquet installé.

## Sources

- Constats : OPS-10
- Code vérifié à la version `0d5a954` :
  - `scripts/package-tv-ambient.mjs` :
    - lignes 18-23 : `root`, `PRODUCTION_ID = 'org.tvlens.ambient'`, `PROBE_ID`, `WINDOW_TYPES`,
      `PROBE_PATTERN`, `SHARED` ;
    - `assemble({ dir, probe, id, windowType, appDir })` lignes 241-260 : refus d'un type de fenêtre inconnu,
      d'un identifiant de sonde sans `--probe` (ligne 246), d'un identifiant autre que celui de production,
      d'un dossier non vide ; copie des fichiers, puis écriture de `appinfo.json` depuis
      `appinfo.ambient.json` ;
    - `options` ligne 262 ; `main` ligne 276, qui appelle l'empaqueteur par `spawnSync` ; garde d'exécution directe
      en fin de fichier.
  - `tv/app/appinfo.json` : `"id": "org.tvlens.sidebarprobe"`, `"main": "index.html"`. C'est l'identifiant
    du panneau installé, d'après `docs/lg-installation.md:19`. `assemble` le refuserait, parce qu'il
    contient `probe`.
  - `tv/app/index.html` référence `style.css`, `timeline.css`, `surveillance.css`, `connection.js`,
    `remote-client.js`, `surveillance-overlay.js`, `surveillance-view.js`, `sessions-view.js`,
    `capture-control.js`, `timeline-view.js`, `companion.js`. `appinfo.json` référence `icon.png`.
  - `tv/app/connection.js` est ignoré par Git (`.gitignore:26`), installé à part.
  - `tests/tv-ambient-params.test.cjs:100` et `:107` : contenu exact des dossiers assemblés du paquet ambiant
    et de sa sonde.
  - `package.json` : ni `package:tv` ni autre entrée de construction de la TV.
- Documentation : `docs/lg-installation.md:27` et `docs/lg-remote-runtime.md:75` donnent la commande
  manuelle du panneau, avec `--description` depuis T104.

## Périmètre

À modifier :

- `scripts/package-tv-ambient.mjs` : extraire de `assemble` une fonction `stage({ dir, files, appDir })`
  exportée. Elle exige un dossier neuf ou vide et y copie exactement la liste reçue. `assemble` l'appelle et
  garde tous ses refus, ses messages et son résultat.

À créer :

- `scripts/package-tv.mjs` :
  - `PANEL_FILES`, la liste fermée du panneau : `appinfo.json`, `index.html`, les trois feuilles de style,
    les scripts de `index.html` sauf `connection.js`, et `icon.png` ;
  - `assemblePanel({ dir })`, qui appelle `stage` et copie `appinfo.json` tel quel. L'identifiant du panneau
    reste `org.tvlens.sidebarprobe`, sans passer par les refus de `assemble`, qui sont propres au paquet
    ambiant ;
  - en exécution directe : assemblage du panneau et du paquet ambiant de production dans des dossiers
    temporaires, puis appel de `tv/packaging/ipk.py` pour chacun. `SOURCE_DATE_EPOCH` vaut la date du commit
    `HEAD` (`git log -1 --format=%ct`), la sortie va dans `dist/tv`, et la commande affiche pour chaque
    paquet son chemin et son SHA-256.
- `package.json` : l'entrée `"package:tv": "node scripts/package-tv.mjs"`.
- `tests/tv-packaging.test.cjs`, qui vérifie :
  - le dossier assemblé du panneau contient exactement `PANEL_FILES`, jamais `connection.js` ni un fichier
    `ambient*` ;
  - tout fichier que référencent `tv/app/index.html` et `tv/app/appinfo.json` figure dans `PANEL_FILES`,
    sauf `connection.js`. Ce test échoue dès qu'un script est ajouté à la page sans l'être à la liste ;
  - `stage` refuse un dossier non vide ;
  - `assemble` garde ses refus (un identifiant de sonde sans `--probe` reste refusé).

Documentation : `docs/lg-installation.md:27` et `docs/lg-remote-runtime.md:75` citent `npm run package:tv` et
`dist/tv`. Ils précisent que la commande construit sans rien installer.

À ne pas toucher : `tv/app/`, `tv/packaging/ipk.py`, `tests/tv-ambient-params.test.cjs`, la TV.

## Critères d'acceptation

Chaque critère se vérifie par un test ou une commande.

1. `node --test tests/tv-packaging.test.cjs tests/tv-ambient-params.test.cjs` passe, et le second fichier n'a
   pas changé.
2. `npm run package:tv`, lancé deux fois sur le même commit, affiche deux fois les mêmes deux SHA-256. Les
   deux sorties figurent au journal.
3. Dans `data.tar.gz` du paquet du panneau, les entrées sous `usr/palm/applications/org.tvlens.sidebarprobe/`
   portent exactement les noms de `PANEL_FILES`, et la seule autre entrée est
   `usr/palm/packages/org.tvlens.sidebarprobe/packageinfo.json`. La liste est extraite par une commande
   `python3 -c` notée au journal avec sa sortie.
4. `grep -n "package.py\|ipk.py --app-dir tv/app" docs/lg-installation.md docs/lg-remote-runtime.md` ne rend
   rien.
5. `node scripts/check.mjs` est vert.

## Test d'acceptation attendu

`tests/tv-packaging.test.cjs`, nouveau. Frontière : les fonctions d'assemblage exportées par
`scripts/package-tv.mjs` et `scripts/package-tv-ambient.mjs`, appliquées au vrai `tv/app` et à un dossier
temporaire. L'empaqueteur Python n'est lancé que par le critère 2, hors `npm test`.

## Hypothèses bloquantes

Aucune décision n'est attendue. Le paquet du panneau ne contient plus les fichiers de l'affichage ambiant :
c'est voulu, puisque l'ambiant a son propre paquet. Le ticket ne l'installe pas sur la TV, et le journal le
dit comme non vérifié sur l'appareil. Si le panneau lit à l'exécution un fichier que ni `index.html` ni
`appinfo.json` ne nomment (un `fetch` d'un fichier local, par exemple) : verdict BLOQUÉ, avec le fichier et
la ligne.

## Journal
