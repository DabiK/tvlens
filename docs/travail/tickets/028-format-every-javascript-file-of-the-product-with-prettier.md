---
id: T028
titre: Format every JavaScript file of the product with Prettier
statut: a-faire
bloque_par: T027, T145
adr: non
installe: non
harnais: non
supprime_tests: non
---

## Ce que le ticket livre

Ce ticket est le commit de formatage, et rien d'autre. Il retire de `.prettierignore` le bloc
temporaire qui écartait le code JavaScript, puis applique Prettier deux fois à tout le dépôt. La seconde
passe est nécessaire pour atteindre le point fixe de `core/video-tools.cjs`.

Avant d'écrire, une commande prouve que le formatage ne change aucun arbre syntaxique. Après, toute la
suite passe. Dès lors, tout fichier JavaScript modifié doit être formaté, sans quoi l'étape « format »
du contrôle passe au rouge. Les lignes de plus de 160 caractères tombent d'environ 2 270 à environ 244,
et la boucle resserre le plancher du cliquet dans ce même commit.

Le titre du ticket est unique, car le ticket suivant retrouve ce commit par son titre pour l'inscrire
dans `.git-blame-ignore-revs`.

## Sources

- Constats : OPS-02, ADP-15
- Livre : jalon:format
- Code concerné, à la version `0d5a954` :
  - `.prettierignore`, posé par le ticket d'installation : son bloc temporaire est délimité par
    `# >>> code JavaScript pas encore formaté` et `# <<< code JavaScript pas encore formaté`.
  - `scripts/check.mjs`, fonction `format` (ligne 88) : `prettier --check --ignore-unknown .` sur tout
    l'arbre, ou sur les fichiers modifiés en mode `--changed`.
  - `scripts/loop/run.mjs`, fonction `integrate` (ligne 206) : elle réécrit le plancher par `tighten`
    (ligne 208), puis committe sous `${id}: ${titre}`.
  - `scripts/quality/baseline.json` : 545, 1725, 40, 9, 8, 2, 617.
- Mesures au découpage, sur une copie formatée en réglages par défaut :
  - 201 fichiers modifiés sur 214, dont `core/video-tools.cjs` en deux passes ;
  - aucun message `ast(input) !== ast(prettier(input))` ;
  - cliquet : `lignes_longues_prod` 103, `lignes_longues_tests` 141, `cas_de_test` 618, autres mesures
    inchangées ;
  - aucun fichier ne gagne de ligne de plus de 160 caractères ni de `catch` vide : l'étape « règles
    par fichier » de `scripts/check.mjs` (fonction `fileRules`, ligne 70), qui compare chaque fichier
    modifié à sa version de `HEAD`, reste verte ;
  - la preuve que la suite passe sur cette copie est l'objet du ticket qui rejoue la suite sur une
    copie formatée (`T027`), dont le journal fait foi.

## Périmètre

- Le dossier d'état du ticket est `.harness-state/tickets/$TVLENS_TICKET/`, noté `$ETAT`.
- Gestes, dans cet ordre et sans aucun autre :
  1. retirer le bloc temporaire de `.prettierignore`, marqueurs compris, avec le `node -e` du ticket
     précédent appliqué au fichier du dépôt ;
  2. `node_modules/.bin/prettier --debug-check . > $ETAT/debug-check.txt 2>&1` ;
  3. `node_modules/.bin/prettier --write .`, deux fois.
- Aucun autre changement : ni correction de code, ni renommage, ni modification de test, ni
  modification de la configuration Prettier au-delà du retrait du bloc. Si un fichier demande une
  retouche à la main pour passer un contrôle, le ticket s'arrête (voir les hypothèses).
- Le harnais (`.claude/`, `scripts/check.mjs`, `scripts/quality/`, `scripts/loop/`), les fichiers
  Markdown, CSS et HTML, `film/` et `promo/` restent ignorés et ne changent pas.
- `scripts/quality/baseline.json` n'est pas modifié à la main : la boucle le resserre à l'intégration.
- `.git-blame-ignore-revs` vient au ticket suivant, car le SHA de ce commit n'existe qu'après
  l'intégration.

## Critères d'acceptation

Chaque critère se vérifie par une commande, avec sa sortie dans le journal.

1. `$ETAT/debug-check.txt`, produit avant toute écriture, ne contient aucune ligne
   `ast(input) !== ast(prettier(input))`. Ses seules lignes `[error] <fichier>: …` sont des messages
   d'idempotence pour des fichiers déjà nommés dans le journal du ticket précédent.
2. Après les deux passes, `node_modules/.bin/prettier --check .` sort en 0, et
   `node_modules/.bin/prettier --debug-check .` sort en 0 sans aucune ligne `[error]`.
3. `grep -c "code JavaScript pas encore formaté" .prettierignore` affiche `0`, et
   `node_modules/.bin/prettier --file-info runtime/session-closing.cjs` rend `"ignored": false`.
4. Cette commande affiche les mesures du cliquet, recopiées dans le journal :
   `node scripts/quality/ratchet.mjs` (sans option, il affiche les mesures sans écrire le plancher).
   Aucune mesure ne se dégrade par rapport à `scripts/quality/baseline.json`, et `cas_de_test` vaut
   au moins 617.
5. `node scripts/check.mjs` est vert : règles par fichier, format, cliquet, tests JS en séquentiel et
   tests Python. Le journal recopie les lignes `ℹ tests` et `ℹ fail`.

## Test d'acceptation attendu

Les tests existants, sans modification : toute la suite JS et Python, lancée par le contrôle complet
sur l'arbre formaté. `tests/tv-app-compat.test.cjs` garde la compatibilité de `tv/app` avec le moteur
de la TV.

## Hypothèses bloquantes

Aucune décision n'est attendue. Le moment de lancer ce ticket appartient au propriétaire, puisque le
commit entre en conflit avec toute branche ou tout worktree ouvert. Une branche ouverte se remet à
niveau en rejouant les mêmes gestes, comme le dit l'ADR de formatage.

Verdict BLOQUÉ, avec l'écart constaté, dans trois cas :
- le critère 1 montre une différence d'arbre syntaxique ;
- un test échoue après le formatage, ce qui veut dire que le ticket précédent a manqué une lecture du
  texte ;
- un fichier demande une retouche à la main.

Dans ces trois cas, rien n'est corrigé ici.

## Journal
