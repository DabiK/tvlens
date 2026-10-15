---
id: T026
titre: Install Prettier with default settings and a staged ignore list
statut: termine
bloque_par: T158
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

### Exploration — 2026-10-15

Lecture du ticket, des consignes, du contrôle et de ses tests ; aucun écart fonctionnel prévu.
Prochain ADR libre : 0012. Preuves conservées dans `.harness-state/tickets/T026/`.

Commande initiale : `node scripts/check.mjs --no-tests` (sortie 0).

```text
✔ règles par fichier
– format : non lancé (Prettier n'est pas installé)
– lint : non lancé (ESLint n'est pas installé ou pas configuré)
✔ cliquet
    Mesures améliorées : cas_de_test : 740 → 762
check : vert
```

### Installation et configuration — 2026-10-15

`npm install --save-dev --save-exact prettier@3.8.1` : premier essai refusé (EPERM sur le cache npm utilisateur).
Même commande avec `npm_config_cache` dans un dossier temporaire autorisé : sortie 0, `added 1 package`, `found 0 vulnerabilities`.
Sorties complètes dans `installation.log` et `installation-cache-temporaire.log`.
Ajout des scripts, de la configuration vide, de la liste d’ignorés et de l’ADR 0012.

### Vérification des critères — 2026-10-15

```text
$ node_modules/.bin/prettier --version
3.8.1
Code de sortie : 0

$ node -p "require('./package.json').devDependencies.prettier"
3.8.1
Code de sortie : 0

$ node_modules/.bin/prettier --check .
Checking formatting...
All matched files use Prettier code style!
Code de sortie : 0

$ npm run format:check

> tvlens@0.1.0 format:check
> prettier --check .

Checking formatting...
All matched files use Prettier code style!
Code de sortie : 0

$ node scripts/check.mjs --no-tests
✔ règles par fichier
✔ format
– lint : non lancé (ESLint n'est pas installé ou pas configuré)
✔ cliquet
    Mesures améliorées : cas_de_test : 740 → 762
check : vert
Code de sortie : 0

$ node_modules/.bin/prettier --file-info film/package.json
{ "ignored": true, "inferredParser": null }
Code de sortie : 0

$ node_modules/.bin/prettier --file-info promo/package.json
{ "ignored": true, "inferredParser": null }
Code de sortie : 0

$ node_modules/.bin/prettier --file-info package-lock.json
{ "ignored": true, "inferredParser": null }
Code de sortie : 0

$ node_modules/.bin/prettier --file-info .claude/settings.json
{ "ignored": true, "inferredParser": null }
Code de sortie : 0

$ node_modules/.bin/prettier --file-info scripts/check.mjs
{ "ignored": true, "inferredParser": null }
Code de sortie : 0

$ node_modules/.bin/prettier --file-info scripts/quality/baseline.json
{ "ignored": true, "inferredParser": null }
Code de sortie : 0

$ node_modules/.bin/prettier --file-info tests/fixtures/tv-overlay-queue-cases.json
{ "ignored": true, "inferredParser": null }
Code de sortie : 0

$ node_modules/.bin/prettier --file-info docs/latency-local.json
{ "ignored": true, "inferredParser": null }
Code de sortie : 0

$ node_modules/.bin/prettier --file-info runtime/session-closing.cjs
{ "ignored": true, "inferredParser": null }
Code de sortie : 0

$ node_modules/.bin/prettier --file-info package.json
{ "ignored": false, "inferredParser": "json-stringify" }
Code de sortie : 0

$ node_modules/.bin/prettier --file-info tv/app/appinfo.json
{ "ignored": false, "inferredParser": "json" }
Code de sortie : 0

$ node -e 'const assert = require("node:assert/strict"); const lines = require("node:fs").readFileSync(".prettierignore", "utf8").trimEnd().split("\n"); const start = "# >>> code JavaScript pas encore formaté"; const end = "# <<< code JavaScript pas encore formaté"; for (const marker of [start, end]) assert.equal(lines.filter(line => line === marker).length, 1); const block = lines.slice(lines.indexOf(start) + 1, lines.indexOf(end)); assert.deepEqual(block, ["**/*.js", "**/*.cjs", "**/*.mjs"]); assert.equal(lines.at(-1), end); console.log(block.join("\n"));'
**/*.js
**/*.cjs
**/*.mjs
Code de sortie : 0

$ node_modules/.bin/prettier --find-config-path core/ports.cjs
.prettierrc.json
Code de sortie : 0

$ node scripts/check.mjs --changed
✔ règles par fichier
✔ format
– lint : non lancé (ESLint n'est pas installé ou pas configuré)
✔ cliquet
    Mesures améliorées : cas_de_test : 740 → 762
✔ tests JS
check : vert
Code de sortie : 0

$ git diff --check
Code de sortie : 0
```

### Contrôle complet — 2026-10-15

Commande : `node scripts/check.mjs` (sortie 0).

```text
✔ règles par fichier
✔ format
– lint : non lancé (ESLint n'est pas installé ou pas configuré)
✔ cliquet
    Mesures améliorées : cas_de_test : 740 → 762
✔ tests JS (82 fichier(s))
    ℹ tests 805
    ℹ pass 805
    ℹ fail 0
✔ tests Python
    Ran 84 tests in 27.696s

    OK (skipped=1)
check : vert
```

Verdict : **TERMINÉ**, critères 1 à 7 vérifiés. ESLint reste explicitement non lancé
(absent ou non configuré, hors périmètre). Le contrôle Python rapporte un test ignoré.
`git diff --check` a détecté les espaces d’une ligne vide recopiée du bilan Python dans ce journal ;
après retrait de ces espaces, sortie 0. La sortie brute reste dans `controle-complet.log`.
Verdict détaillé dans `.harness-state/tickets/T026/verdict.json`.
Relecture et intégration laissées à la boucle. Aucun commit ni push.

### Reprise après relecture — 2026-10-15

Constat mineur accepté : le harnais comprend désormais `.codex/` et `.agents/`.
Contrairement aux quatre fichiers recensés au découpage, `.codex/hooks.json` est aussi contrôlé ;
sa conformité actuelle masquait cette omission. Les deux dossiers seront ajoutés aux exclusions permanentes.

```text
$ node_modules/.bin/prettier --file-info .codex/hooks.json
{ "ignored": false, "inferredParser": "json" }
Code de sortie : 0
Assertion ROUGE observée : .codex/hooks.json doit être ignoré
```

```text
$ node_modules/.bin/prettier --file-info .codex/hooks.json
{ "ignored": true, "inferredParser": null }
Code de sortie : 0
Assertion ignored=true : réussie.
```

```text
$ node_modules/.bin/prettier --file-info .agents/skills/ticket-codex/SKILL.md
{ "ignored": true, "inferredParser": null }
Code de sortie : 0
Assertion ignored=true : réussie.
```

```text
$ node_modules/.bin/prettier --check .
Checking formatting...
All matched files use Prettier code style!
Code de sortie : 0
```

```text
$ npm run format:check

> tvlens@0.1.0 format:check
> prettier --check .

Checking formatting...
All matched files use Prettier code style!
Code de sortie : 0
```

```text
$ node -e 'const assert = require("node:assert/strict"); const lines = require("node:fs").readFileSync(".prettierignore", "utf8").trimEnd().split("
"); const start = "# >>> code JavaScript pas encore formaté"; const end = "# <<< code JavaScript pas encore formaté"; for (const marker of [start, end]) assert.equal(lines.filter(line => line === marker).length, 1); const block = lines.slice(lines.indexOf(start) + 1, lines.indexOf(end)); assert.deepEqual(block, ["**/*.js", "**/*.cjs", "**/*.mjs"]); assert.equal(lines.at(-1), end); console.log(block.join("
"));'
[eval]:1
const assert = require("node:assert/strict"); const lines = require("node:fs").readFileSync(".prettierignore", "utf8").trimEnd().split("
                                                                                                                                       ^
Expected ',', got 'string literal (); const start = , "); const start = ")'

SyntaxError: Invalid or unexpected token
    at makeContextifyScript (node:internal/vm:194:14)
    at compileScript (node:internal/process/execution:388:10)
    at evalTypeScript (node:internal/process/execution:260:22)
    at node:internal/main/eval_string:71:3

Node.js v24.12.0
Code de sortie : 1
```

La commande d’extraction ci-dessus avait un saut de ligne mal échappé dans son argument JavaScript.
Correction de la commande de vérification, sans changement de configuration :

```text
$ node -e 'const assert = require("node:assert/strict"); const lines = require("node:fs").readFileSync(".prettierignore", "utf8").trimEnd().split("\n"); const start = "# >>> code JavaScript pas encore formaté"; const end = "# <<< code JavaScript pas encore formaté"; for (const marker of [start, end]) assert.equal(lines.filter(line => line === marker).length, 1); const block = lines.slice(lines.indexOf(start) + 1, lines.indexOf(end)); assert.deepEqual(block, ["**/*.js", "**/*.cjs", "**/*.mjs"]); assert.equal(lines.at(-1), end); console.log(block.join("\n"));'
**/*.js
**/*.cjs
**/*.mjs
Code de sortie : 0
```

```text
$ node scripts/check.mjs --changed
✔ règles par fichier
✔ format
– lint : non lancé (ESLint n'est pas installé ou pas configuré)
✔ cliquet
    Mesures améliorées : cas_de_test : 740 → 762
✔ tests JS
check : vert
Code de sortie : 0
```

```text
$ git diff --check
Code de sortie : 0
```

```text
$ node scripts/check.mjs
✔ règles par fichier
✔ format
– lint : non lancé (ESLint n'est pas installé ou pas configuré)
✔ cliquet
    Mesures améliorées : cas_de_test : 740 → 762
✔ tests JS (82 fichier(s))
    ℹ tests 805
    ℹ pass 805
    ℹ fail 0
✔ tests Python
    Ran 84 tests in 27.129s

    OK (skipped=1)
check : vert
Code de sortie : 0
```

Nouveau verdict : **TERMINÉ**. Constat mineur corrigé, aucun constat contesté ni restant.
L’ADR précise désormais les deux dossiers ajoutés au harnais. Aucun fichier du harnais modifié.
Preuves : `relecture-rouge.log`, `relecture-verifications.log` ; verdict dans `verdict.json`.
ESLint reste non lancé ; la suite Python conserve un test ignoré. Relecture et intégration à la boucle.
