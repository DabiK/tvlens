---
id: T026
titre: Install Prettier with default settings and a staged ignore list
statut: a-faire
bloque_par: T145
adr: oui
installe: oui
harnais: non
supprime_tests: non
---

## Ce que le ticket livre

Le contrôle unique sait déjà lancer Prettier, mais l'outil n'est pas installé : l'étape « format » est
« non lancée ». Après ce ticket, Prettier 3.8.1 est installé en version exacte, avec ses réglages par
défaut. Une liste d'ignorés écarte les sous-projets, les données et le harnais. L'étape « format » de
`node scripts/check.mjs` tourne et passe au vert.

Le code JavaScript reste ignoré pour l'instant, par un bloc de trois lignes délimité par deux marqueurs.
Le formatage lui-même est l'objet d'un ticket à part, qui retire ce bloc et ne fait rien d'autre. Le
choix des réglages est consigné dans un ADR.

## Sources

- Constats : OPS-02, ADP-15, OUBLI-27, OPS-07
- Code concerné, à la version `0d5a954` :
  - `scripts/check.mjs`, fonction `format` (ligne 88) : lance `prettier --check --ignore-unknown .`
    dès que `node_modules/.bin/prettier` existe (fonction `bin`, ligne 48). Sinon, elle affiche
    « format : non lancé ». Ce ticket ne modifie pas cette fonction.
  - `package.json`, bloc `scripts` (lignes 7 à 30) : aucune entrée `format`. Bloc `devDependencies`
    (lignes 31 à 35) : aucun formateur.
  - `film/` et `promo/` sont deux sous-projets Remotion suivis par Git. Chacun a son `package.json`, et
    `promo/` a son propre `.prettierrc`. Un `prettier .` lancé à la racine les parcourrait.
  - `tests/codex-confinement.test.cjs`, test de la ligne 457, assertion de la ligne 481 : elle attend
    `|| "enforce` entre guillemets doubles dans `adapters/codex-session-client.cjs` (classe
    `CodexSessionClient`, valeur par défaut de la ligne 107). Le réglage `singleQuote` casserait ce test.
  - `runtime/session-closing.cjs` est la forme cible du code (arbitrage A8). Il fait partie des 13
    fichiers déjà conformes aux réglages par défaut (liste ci-dessous).
- Mesures au découpage, avec Prettier 3.8.1 (celui de `promo/node_modules`), sur une copie des fichiers
  suivis, avec la liste ci-dessous sans le bloc temporaire :
  - 214 fichiers `.js`, `.cjs` et `.mjs` sont dans le périmètre ; 201 seraient modifiés et 13 sont déjà
    conformes : cinq d'`adapters/` (`codex-analysis-agent`, `codex-recap`, `codex-session-agent`,
    `codex-tool-definitions`, `session-thumbnails`), `core/moment-search.cjs`, `core/ports.cjs`,
    `mcp/server.cjs`, `mcp/tool-definitions.cjs`, `runtime/conversation-runtime.cjs`,
    `runtime/session-closing.cjs`, `runtime/session-runtime.cjs` et `tv/app/remote-client.js` ;
  - avec le bloc, `prettier --check .` sort en 0 : les seuls fichiers encore vus sont `package.json`,
    `tv/app/appinfo.json`, `tv/app/appinfo.ambient.json` et `prototypes/lg-sidebar/app/appinfo.json`,
    déjà conformes ;
  - reproduction : dans une copie des fichiers suivis dont le `.prettierignore` a perdu son bloc, lancer
    `node_modules/.bin/prettier --list-different . | wc -l`. La copie doit avoir son propre
    `.prettierignore`, car Prettier lit les motifs d'une liste par rapport au dossier de cette liste.
    La méthode de copie est celle du ticket qui rejoue la suite sur l'arbre formaté.

## Périmètre

- Installation (`installe: oui`) : `npm install --save-dev --save-exact prettier@3.8.1`. Seuls
  `package.json` et `package-lock.json` changent.
- `.prettierrc.json` contient `{}`, c'est-à-dire les réglages par défaut : 80 colonnes, guillemets
  doubles, `trailingComma: "all"`, `arrowParens: "always"`, fins de ligne LF. Ce ticket ne choisit
  aucune autre option.
- `.prettierignore`. S'il existe déjà, par exemple créé par un autre lot pour `tests/fixtures/`, il est
  complété et ses lignes sont gardées. Lignes permanentes :
  - `film/`, `promo/`, `dist/`, `tv/dist/`, `media/`, `screenshots/`, `design/`, `experiments/` ;
  - `prototypes/lg-remote/`, `docs/**/*.json`, `tests/fixtures/`, `package-lock.json` ;
  - `**/*.md`, `**/*.css`, `**/*.html` ;
  - le harnais, qui n'est pas formaté par ce lot : `.claude/`, `scripts/check.mjs`,
    `scripts/quality/`, `scripts/loop/`.
- Bloc temporaire en fin de fichier, entre la ligne `# >>> code JavaScript pas encore formaté` et la
  ligne `# <<< code JavaScript pas encore formaté`, avec exactement trois lignes : `**/*.js`,
  `**/*.cjs`, `**/*.mjs`.
- `package.json` reçoit deux entrées : `"format": "prettier --write ."` et
  `"format:check": "prettier --check ."`.
- ADR : `docs/adr/<prochain numéro libre>-formatage-prettier-reglages-par-defaut.md` (0011 à `0d5a954`),
  écrit d'après `docs/adr/0000-gabarit.md`. Il présente les deux options : réglages par défaut, ou style
  dominant (apostrophes, `arrowParens: "avoid"`, 100 colonnes). Il retient les réglages par défaut, pour
  trois raisons :
  - la forme cible A8 les respecte déjà ;
  - le test de confinement attend des guillemets doubles ;
  - le code le plus récent est déjà conforme.
  L'ADR donne aussi les conséquences :
  - 201 fichiers seront réécrits par le ticket de formatage ;
  - une branche ou un worktree ouvert se remet à niveau en appliquant `prettier --write .` deux fois
    avant de fusionner ;
  - la largeur de 80 colonnes reste sous la règle des 160 caractères de `docs/standards.md` ;
  - CSS, HTML, Markdown et harnais ne sont pas formatés pour l'instant.
- À ne pas toucher : tout fichier `.js`, `.cjs` ou `.mjs`, `scripts/check.mjs`, `scripts/quality/`,
  `.claude/`, `docs/standards.md`.
- Ni `.editorconfig` ni `.gitattributes` : ils viennent après le commit de formatage.

## Critères d'acceptation

Chaque critère se vérifie par une commande, avec sa sortie dans le journal.

1. `node_modules/.bin/prettier --version` affiche `3.8.1`.
   `node -p "require('./package.json').devDependencies.prettier"` affiche `3.8.1`, sans `^` ni `~`.
2. `node_modules/.bin/prettier --check .` sort en 0. `npm run format:check` sort en 0.
3. `node scripts/check.mjs --no-tests` affiche `✔ format`, et non « format : non lancé ».
4. Pour chacun des fichiers suivants, `node_modules/.bin/prettier --file-info <fichier>` rend
   `"ignored": true` :
   - `film/package.json`, `promo/package.json`, `package-lock.json` ;
   - `.claude/settings.json`, `scripts/check.mjs`, `scripts/quality/baseline.json` ;
   - `tests/fixtures/tv-overlay-queue-cases.json`, `docs/latency-local.json` ;
   - `runtime/session-closing.cjs`, ignoré par le bloc temporaire.
   La même commande rend `"ignored": false` pour `package.json` et `tv/app/appinfo.json`.
5. Un `node -e` extrait les lignes comprises entre les deux marqueurs de `.prettierignore`. Il affiche
   exactement `**/*.js`, `**/*.cjs`, `**/*.mjs`, et chaque marqueur n'apparaît qu'une fois dans le
   fichier.
6. `node_modules/.bin/prettier --find-config-path core/ports.cjs` affiche `.prettierrc.json`.
7. `node scripts/check.mjs` est vert.

## Test d'acceptation attendu

Aucun test nouveau : le ticket n'ajoute que de la configuration. La preuve est l'étape « format » du
contrôle unique, qui passe de « non lancé » à « ✔ ». Le chemin « non lancé » reste couvert par le test
« the full check fails when a measure regresses against the baseline and reports skipped tools as not
run » de `tests/quality-check.test.cjs`, qui tourne dans un dépôt temporaire sans `node_modules`.

## Hypothèses bloquantes

Aucune décision n'est attendue. Les réglages par défaut s'appuient sur l'arbitrage A8 et sur le test
de confinement. Si le propriétaire préfère le style dominant, il remplace `.prettierrc.json` et l'ADR
avant le ticket qui rejoue la suite sur une copie formatée : cette preuve se fait alors avec ses
réglages. Si l'installation échoue (réseau, registre) : verdict BLOQUÉ, avec la sortie de `npm`.

## Journal
