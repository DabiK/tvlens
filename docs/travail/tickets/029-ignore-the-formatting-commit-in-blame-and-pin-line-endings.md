---
id: T029
titre: Ignore the formatting commit in blame and pin line endings
statut: a-faire
bloque_par: T028, T145
adr: non
installe: non
harnais: non
supprime_tests: non
---

## Ce que le ticket livre

Le commit de formatage réécrit environ 200 fichiers. Sans précaution, `git blame` l'attribue à presque
chaque ligne et l'historique utile disparaît derrière lui. Après ce ticket, `.git-blame-ignore-revs`
nomme ce commit, et `CONTRIBUTING.md` explique comment l'activer une fois pour toutes.

Le même ticket fixe ce que Prettier suppose déjà sans que Git ni les éditeurs le sachent :
- des fins de ligne LF, par `.gitattributes`, qui marque aussi les médias suivis comme binaires ;
- l'encodage, le saut de ligne final et, pour les fichiers que Prettier formate, l'indentation, par
  `.editorconfig`.

Aucun fichier n'est renormalisé : l'index ne contient déjà aucune fin de ligne CRLF.

## Sources

- Constats : OPS-02, OPS-19
- Code concerné, à la version `0d5a954` :
  - aucun `.git-blame-ignore-revs`, `.editorconfig` ni `.gitattributes` n'existe à la racine ;
  - `CONTRIBUTING.md`, section « Vérifier une modification » (lignes 15 à 21) : `npm ci`, `npm test`,
    `npm run test:electron`, sans formatage ni contrôle unique ;
  - le commit de formatage est intégré par la boucle sous le titre
    `T028: Format every JavaScript file of the product with Prettier` (`scripts/loop/run.mjs`, fonction
    `integrate`, ligne 213 : `${id}: ${titre}`) ;
  - un ticket d'un autre lot (préparation des fixtures binaires) peut créer `.gitattributes` avec la
    ligne `tests/fixtures/archives/** -text`. Si le fichier existe, il est complété et cette ligne est
    gardée.
- Mesures au découpage :
  - `git ls-files --eol | grep -c "i/crlf"` affiche `0` : 495 fichiers texte en `i/lf` et 33 binaires
    (23 `.png`, 5 `.jpg`, 3 `.webm`, 1 `.mp3`, 1 `.ttf`) ;
  - indentation des fichiers Python suivis : mêlée. `tests/test_tv_ambient.py`,
    `tests/test_tv_capture_gate.py` et `prototypes/lg-remote/test_ambient_relay.py` indentent surtout
    par 2 espaces ; `tv/ambient.py`, `tv/controller.py`, `tv/luna.py` et `tv/transport.py` par 4
    (commande, par fichier : `grep -cE "^  [^ ]"` et `grep -cE "^    [^ ]"`). Aucune largeur
    d'indentation n'est donc fixée pour Python ;
  - aucun `Makefile` ni fichier qui exige des tabulations.

## Périmètre

- `.git-blame-ignore-revs` (nouveau). Une ligne de commentaire en français qui dit ce que le commit
  contient, puis le SHA complet donné par
  `git log --format=%H --grep="Format every JavaScript file of the product with Prettier"`. Si la
  commande rend zéro ou plusieurs SHA, le ticket s'arrête (voir les hypothèses).
- `.gitattributes`, créé ou complété :
  - en tête : `* text=auto eol=lf` ;
  - puis `*.png binary`, `*.jpg binary`, `*.webm binary`, `*.mp3 binary`, `*.ttf binary` ;
  - toute ligne déjà présente est gardée, dont `tests/fixtures/archives/** -text`.
- `.editorconfig` (nouveau), avec `root = true` :
  - section `[*]` : `charset = utf-8`, `end_of_line = lf`, `insert_final_newline = true` ;
  - section `[*.{js,cjs,mjs,json}]` : `indent_style = space`, `indent_size = 2`, ce que Prettier
    produit déjà ;
  - aucune section pour Python, dont les fichiers suivis mêlent 2 et 4 espaces ;
  - aucune `max_line_length` : Prettier la lirait comme largeur d'impression.
- `CONTRIBUTING.md`, section « Vérifier une modification » : ajouter `npm run format` et
  `node scripts/check.mjs`, et une ligne qui donne `git config blame.ignoreRevsFile .git-blame-ignore-revs`
  pour ignorer le commit de formatage dans `git blame`.
- À ne pas toucher : le code, les tests, `.prettierrc.json`, `.prettierignore`, le harnais. Aucune
  renormalisation : aucun fichier suivi ne change de contenu.

## Critères d'acceptation

Chaque critère se vérifie par une commande, avec sa sortie dans le journal.

1. `grep -vE "^(#|$)" .git-blame-ignore-revs` affiche une seule ligne, égale à la sortie de
   `git log --format=%H --grep="Format every JavaScript file of the product with Prettier"`.
2. Avec `S` le SHA court du commit de formatage, le nombre de lignes de `core/session.cjs` attribuées à
   `S` par `git blame --ignore-revs-file .git-blame-ignore-revs core/session.cjs | grep -c "^$S"` est
   strictement inférieur à celui de `git blame core/session.cjs | grep -c "^$S"`. Les deux nombres
   sont recopiés au journal.
3. `git check-attr text eol -- core/ports.cjs` affiche `text: auto` et `eol: lf`.
   `git check-attr binary -- app/assets/hero-coast.png tests/fixtures/ffmpeg-webm-head.webm` affiche
   `binary: set` pour les deux.
4. `git ls-files --eol | grep -c "i/crlf"` affiche `0`.
5. `node_modules/.bin/prettier --check .` sort en 0, ce qui montre que `.editorconfig` ne change pas la
   mise en forme.
6. `grep -c "blame.ignoreRevsFile" CONTRIBUTING.md` affiche au moins `1`.
7. `node scripts/check.mjs` est vert.

## Test d'acceptation attendu

Aucun test nouveau : le ticket n'ajoute que de la configuration Git et d'éditeur. Les preuves sont les
commandes `git blame`, `git check-attr` et `prettier --check` des critères.

## Hypothèses bloquantes

Aucune décision n'est attendue. Verdict BLOQUÉ, avec la sortie constatée, dans trois cas :
- la commande `git log --grep` rend zéro ou plusieurs SHA ;
- `prettier --check .` passe au rouge après l'ajout de `.editorconfig` ;
- le critère 2 montre autant de lignes attribuées au commit de formatage avec et sans la liste.

## Journal
