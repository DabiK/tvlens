---
id: T031
titre: Lint with ESLint in the quality check and freeze the existing violations
statut: a-faire
bloque_par: T028
adr: oui
installe: oui
harnais: oui
supprime_tests: non
---

## Ce que le ticket livre

Le contrôle unique sait déjà lancer ESLint, mais l'outil n'est ni installé ni configuré : l'étape
« lint » est « non lancée ». Quatre règles de `docs/standards.md` attendent l'outil : `max-lines`,
`complexity`, `max-lines-per-function` et `no-nested-ternary`.

Après ce ticket, ESLint est installé en version exacte et configuré par dossier. Toutes les infractions
existantes sont gelées dans `eslint-suppressions.json`, compté par fichier et par règle. Toute infraction
nouvelle fait passer `node scripts/check.mjs` au rouge. Une suppression devenue inutile le fait aussi,
tant qu'elle n'est pas élaguée : le stock ne peut que baisser.

## Sources

- Constats : OPS-03, ADP-15, OUBLI-27, OPS-07
- Livre : jalon:lint
- Code concerné, à la version `0d5a954` :
  - `scripts/check.mjs`, fonction `lint` (ligne 96) : elle lance `eslint <cibles>` (tout l'arbre, ou
    les fichiers de code modifiés en mode `--changed` et `--file`) dès que `node_modules/.bin/eslint` et
    un `eslint.config.{mjs,js,cjs}` existent. Ce ticket ne la modifie pas.
  - `docs/standards.md`, lignes 11 à 13 : trois règles vérifiées par « relecture, puis ESLint ».
    Lignes 59-60 : ces règles « rejoindront `check` avec le ticket qui installe l'outil ».
  - `package.json`, blocs `scripts` et `devDependencies` : ni ESLint ni entrée `lint`.
  - `promo/` a son propre `eslint.config.mjs`, `film/` n'en a pas ; ce sont deux sous-projets avec
    leur `package.json`, qu'un `eslint .` à la racine ne doit pas parcourir.
  - aucun commentaire `eslint-disable`, `eslint-env` ni `/* global` dans les fichiers suivis hors `film/`
    et `promo/` (`git grep -n "eslint-disable\|eslint-env\|/\* global" -- ':!film' ':!promo'` ne rend
    rien).
  - `console.` en production : `app/main.cjs` (2), `server/main.cjs` (3), et
    `runtime/headless-runtime.cjs:259`, journal par défaut de `HeadlessRuntime`.
- Mesures au découpage, avec ESLint 9.39.5, `@eslint/js` 9.39.5 et `globals` 14.0.0 (ceux de
  `promo/node_modules`), sur la copie formatée décrite par le ticket de preuve du formatage, avec une
  configuration d'essai proche de celle du périmètre (recommandée, CommonJS pour `.cjs`, module pour
  `.mjs` et `.js`, navigateur pour `app/ui/` et `app/*.js`, script ES2022 pour `tv/app/`, règles
  ci-dessous, sans exemption des tests ni globales navigateur pour les scripts) :
  - `eslint --suppress-all --suppressions-location <fichier> .` sort en 0 et gèle 1 184 infractions
    dans 124 fichiers ;
  - par règle (production, scripts, tests) : `no-empty` 39, 7, 5 ; `complexity` 105, 19, 0 ;
    `max-lines-per-function` 57, 30, 165 ; `no-nested-ternary` 132, 10, 2 ; `max-lines` 21, 10, 32 ;
    `no-unused-vars` 3, 4, 9 ; `no-undef` 0, 529, 2 ; `constructor-super` 0, 1, 0 ;
    `no-useless-escape` 2, 0, 0 ;
  - les 529 `no-undef` des scripts sont des `document` et `window` dans les fonctions passées à
    Playwright (`scripts/smoke-electron.mjs`, `smoke-tv-*.mjs`, `capture-showcase`, etc.) : les
    globales navigateur les font tomber ;
  - avec ce fichier, `eslint --suppressions-location <fichier> .` sort en 0 ; une fonction vide ajoutée
    à `core/ports.cjs` sort en 1 ;
  - après la correction d'une infraction gelée (paramètre renommé `_mode` dans `core/deep-ask.cjs`),
    `eslint <fichier>` sort en 2 (« There are suppressions left that do not occur anymore ») ;
    `eslint --prune-suppressions core/deep-ask.cjs` retire la seule entrée devenue inutile et garde les
    123 autres fichiers ;
  - `prettier --check` refuse le fichier de suppressions tel qu'ESLint l'écrit ;
  - la configuration d'essai ne portait ni `no-console` ni `eqeqeq`. Relevé à part sur l'arbre non
    formaté (`eslint --no-config-lookup` avec ces deux seules règles, sur les dossiers de code) :
    `eqeqeq` avec `null` ignoré, 0 infraction ; `no-console`, 2 dans `app/main.cjs`, 3 dans
    `server/main.cjs`, 114 dans `scripts/`, 1 dans `runtime/headless-runtime.cjs` (ligne 259) et 13
    dans `tests/`. Avec les exemptions du périmètre, les 14 dernières sont gelées en plus du total
    ci-dessus : le stock réel est celui du critère 4.

## Périmètre

- Installation (`installe: oui`), en versions exactes :
  `npm install --save-dev --save-exact eslint@9.39.5 @eslint/js@9.39.5 globals@14.0.0`.
- `eslint.config.mjs` (nouveau), en configuration plate :
  - `linterOptions: { noInlineConfig: true }` : aucun commentaire ne désactive une règle ;
  - ignorés : `.harness-state/`, `.local/`, `.scratch/`, `challenge/`, `node_modules/`, `dist/`,
    `tv/dist/`, `film/`, `promo/`, `media/`, `design/`, `experiments/`, `screenshots/`, `prototypes/`,
    `tests/fixtures/`, `docs/`, et le harnais (`.claude/`, `scripts/check.mjs`, `scripts/quality/`,
    `scripts/loop/`) ;
  - `js.configs.recommended` ;
  - `.cjs` en CommonJS et `.mjs` et `.js` en module, ECMAScript 2024, globales Node ;
  - `app/ui/**` et `app/*.js` : module, globales navigateur ;
  - `tv/app/**/*.js` : script, ECMAScript 2022, globales navigateur et `module` en lecture ;
  - `scripts/**` : globales Node et navigateur ;
  - règles pour tous : `no-unused-vars` avec `ignoreRestSiblings` et les motifs `^_` pour arguments,
    variables et erreurs attrapées ; `complexity` 15 ; `max-lines` 400 et `max-lines-per-function` 80,
    lignes vides et commentaires exclus ; `no-nested-ternary` ; `eqeqeq` avec `null` ignoré ;
    `no-console` en erreur ;
  - `tv/app/**` : `no-unused-vars` avec `vars: "local"`, car ses fonctions de haut niveau sont des
    globales voulues (`tv/app/surveillance-overlay.js:495-499`) ;
  - `no-console` coupé pour `app/main.cjs`, `server/main.cjs` et `scripts/**` ;
  - `max-lines` et `max-lines-per-function` coupés pour `tests/**`.
  Aucune autre règle : `max-depth`, `max-params`, `no-shadow`, `no-param-reassign` et `require-await`
  n'ont pas de seuil dans `docs/standards.md` et ne sont pas ajoutées.
- Gel : `node_modules/.bin/eslint --suppress-all .` écrit `eslint-suppressions.json` à la racine. Ce
  fichier est ajouté à `.prettierignore`. Aucune infraction n'est corrigée dans ce ticket.
- `package.json` : entrée `"lint": "eslint ."`.
- `docs/standards.md` (protégé, `harnais: oui`) :
  - lignes 11 à 13 : la colonne « Vérification » devient « `check` : ESLint `<règle>` ; l'existant est
    gelé dans `eslint-suppressions.json` », avec la mention que les tests sont exemptés de `max-lines`
    et de `max-lines-per-function` ;
  - une ligne dans « Erreurs » : `no-empty` vérifie aussi la règle du `catch` vide ;
  - lignes 59-60 : remplacées par un paragraphe sur le gel. Une infraction gelée se corrige, puis
    `eslint --prune-suppressions <fichier>` retire sa suppression dans le même ticket. Une suppression
    ne s'ajoute jamais pour faire passer un contrôle.
- ADR : `docs/adr/<prochain numéro libre>-eslint-gel-des-infractions.md`, d'après le gabarit. Il
  présente trois options : tout corriger avant d'activer, avertissements seulement, ou gel par
  suppressions ; il retient le gel. Il donne les conséquences :
  - un ticket qui déplace du code gelé vers un autre fichier crée une infraction nouvelle : il la
    corrige, ou il porte `harnais: oui` pour la geler à nouveau ;
  - les règles de couches restent dans `tests/architecture.test.cjs` (arbitrage A3) ;
  - le harnais n'est ni formaté ni analysé pour l'instant ;
  - aucune règle de style : ESLint 9 n'en porte plus dans sa configuration recommandée, d'où l'absence
    d'`eslint-config-prettier`.
- À ne pas toucher : `scripts/check.mjs`, `scripts/loop/`, `.claude/`, le code de production, les
  tests, `.prettierrc.json`.

## Critères d'acceptation

Chaque critère se vérifie par une commande, avec sa sortie dans le journal.

1. `node -p "Object.entries(require('./package.json').devDependencies).filter(([n])=>/eslint|globals/.test(n)).join(' ')"`
   affiche les trois paquets en version exacte, sans `^` ni `~`. `node_modules/.bin/eslint --version`
   affiche `v9.39.5`.
2. `node_modules/.bin/eslint .` sort en 0, et `npm run lint` aussi.
3. `node scripts/check.mjs --no-tests` affiche `✔ lint`, et non « lint : non lancé ».
4. Cette commande affiche le stock gelé par règle et par dossier de premier niveau, recopié dans le
   journal, avec son total :
   `node -e 'const s=require("./eslint-suppressions.json"),c={};for(const[f,rs]of Object.entries(s))for(const[r,{count}]of Object.entries(rs)){const z=f.split("/")[0];c[r]??={};c[r][z]=(c[r][z]||0)+count}console.table(c)'`.
   Aucune clé ne commence par `tests/` pour `max-lines` ni `max-lines-per-function`. Aucune clé ne
   commence par `film/`, `promo/`, `.claude/` ni `scripts/quality/`.
5. `node_modules/.bin/eslint --print-config <fichier>` montre, pour chacun :
   - `tv/app/companion.js` : `sourceType` à `script` ;
   - `app/ui/text.mjs` : la globale `document` ;
   - `tests/session.test.cjs` : `max-lines-per-function` à `off` ;
   - `server/main.cjs` : `no-console` à `off` ; `core/session.cjs` : `no-console` en erreur.
6. Fautes injectées, consignées au journal puis défaites :
   - `function unused(a) { try {} catch (e) {} }` ajoutée à la fin de `core/ports.cjs` fait sortir
     `node_modules/.bin/eslint core/ports.cjs` en 1, et `node scripts/check.mjs --no-tests` en rouge ;
   - `// eslint-disable-next-line` placé au-dessus de cette fonction ne change rien ;
   - `console.log(1)` ajouté à `core/ports.cjs` est refusé.
7. `node_modules/.bin/prettier --check .` sort en 0 ; `node_modules/.bin/prettier --file-info
   eslint-suppressions.json` rend `"ignored": true`.
8. `node scripts/check.mjs` est vert.

## Test d'acceptation attendu

Aucun test nouveau dans ce ticket : la preuve est l'étape « lint » du contrôle unique, qui passe de
« non lancé » à « ✔ », et les fautes injectées du critère 6. Le chemin « non lancé » reste couvert par
le test « the full check fails when a measure regresses against the baseline and reports skipped tools
as not run » de `tests/quality-check.test.cjs`. Le test qui empêche le gel de grandir vient au ticket
suivant.

## Hypothèses bloquantes

Aucune décision n'est attendue. Les seuils viennent de `docs/standards.md` ; les exemptions des tests,
les ignorés et l'absence des autres règles sont consignés dans l'ADR, et le propriétaire peut les
revoir plus tard par un ticket marqué `harnais: oui`.

Verdict BLOQUÉ, avec la sortie constatée, dans deux cas :
- l'installation échoue (réseau, registre) ;
- une option de suppression attendue (`--suppress-all`, `--prune-suppressions`) manque à la version
  installée.

## Journal
