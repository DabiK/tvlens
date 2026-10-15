---
id: T031
titre: Lint with ESLint in the quality check and freeze the existing violations
statut: a-faire
bloque_par: T163
adr: oui
installe: oui
harnais: oui
supprime_tests: non
niveau: standard
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
- Code concerné, à la version `e92c6a6` :
  - `scripts/check.mjs`, fonction `lint` (ligne 96) : elle lance `eslint <cibles>` (tout l'arbre, ou
    les fichiers de code modifiés en mode `--changed` et `--file`) dès que `node_modules/.bin/eslint` et
    un `eslint.config.{mjs,js,cjs}` existent. Ce ticket ne la modifie pas.
  - `docs/standards.md`, lignes 11 à 13 : trois règles vérifiées par « relecture, puis ESLint ».
    Lignes 59-60 : ces règles « rejoindront `check` avec le ticket qui installe l'outil ».
  - `package.json:7` et `package.json:33`, blocs `scripts` et `devDependencies` : ni ESLint ni entrée `lint`.
  - `promo/eslint.config.mjs:1` configure son propre ESLint ; `film/` n’en a pas. Ce sont deux sous-projets avec
    leur `package.json`, qu'un `eslint .` à la racine ne doit pas parcourir.
  - `console.` en production : `app/main.cjs` (2), `server/main.cjs` (3), et
    `runtime/headless-runtime.cjs:256`, journal par défaut de `HeadlessRuntime`.
- État de formatage : Prettier 3.8.1 est déjà déclaré à `package.json:37`, `.prettierrc.json`
  contient `{}` et `.prettierignore:23` ouvre un bloc temporaire qui ignore encore tout le JavaScript.
  L’ADR `docs/adr/0013-formatage-prettier-reglages-par-defaut.md` décrit cette étape. T028 n’est donc
  pas requis pour activer le lint : ce ticket ne retire pas le bloc et ne reformate pas le produit.
- `eslint-suppressions.json` et une configuration ESLint racine sont absents. Le test du contrôle
  isolé à `tests/quality-check.test.cjs:78` vérifie le signalement de Prettier absent ; il n’exerce
  ni ESLint ni ses suppressions. Les mesures d’essai faites sur une ancienne copie formatée ne valent pas mesure
  de ce worktree : le stock doit être relevé pendant l’implémentation, après T150.
- Décision du propriétaire, le 15/10 : T150 remplace T028/T145 ; `harnais: oui` et `installe: oui`
  restent autorisés. La fiche n’avait pas de niveau : `standard`, selon l’exception décidée pour T031/T032.

## Périmètre

- Installation (`installe: oui`), en versions exactes :
  `npm install --save-dev --save-exact eslint@9.39.5 @eslint/js@9.39.5 globals@14.0.0`.
- `eslint.config.mjs` (nouveau), en configuration plate :
  - `linterOptions: { noInlineConfig: true }` : aucun commentaire ne désactive une règle ;
  - ignorés : `.harness-state/`, `.local/`, `.scratch/`, `challenge/`, `node_modules/`, `dist/`,
    `tv/dist/`, `film/`, `promo/`, `media/`, `design/`, `experiments/`, `screenshots/`, `prototypes/`,
    `tests/fixtures/`, `docs/`, et le harnais (`.claude/`, `.codex/`, `.agents/`, `scripts/check.mjs`,
    `scripts/quality/`, `scripts/loop/`) ;
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
    ne s'ajoute jamais pour faire passer un contrôle. Le paragraphe dit aussi, pour tous les tickets
    suivants :
    - un ticket qui rend une suppression inutile l'élague, même si `eslint-suppressions.json` n'est pas
      dans son périmètre ;
    - du code déplacé vers un nouveau fichier y arrive sans infraction : le ticket de déplacement corrige
      celles du code qu'il déplace.
- ADR : `docs/adr/<prochain numéro libre>-eslint-gel-des-infractions.md`, d'après le gabarit. Il
  présente trois options : tout corriger avant d'activer, avertissements seulement, ou gel par
  suppressions ; il retient le gel. Il donne les conséquences :
  - un ticket qui déplace du code gelé vers un autre fichier crée une infraction nouvelle : il la
    corrige. T032 empêchera l’augmentation du gel, y compris lors d’un déplacement ;
  - les règles de couches restent dans `tests/architecture.test.cjs` (arbitrage A3) ;
  - le harnais n'est ni formaté ni analysé pour l'instant ;
  - aucune règle de style ajoutée : le périmètre retient la configuration recommandée et les seules
    règles listées ; il n’ajoute pas `eslint-config-prettier`.
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
   commence par `film/`, `promo/`, `.claude/`, `.codex/`, `.agents/`, `scripts/quality/` ni `scripts/loop/`.
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
8. Sur une copie temporaire du code et du gel, corriger une infraction réellement gelée sans l’élaguer
   fait échouer ESLint avec un diagnostic de suppression devenue inutile. `--prune-suppressions <fichier>`
   retire cette seule entrée devenue inutile, conserve les autres fichiers et rend le contrôle vert.
   Le fichier choisi, les commandes et les trois sorties sont consignés. Aucun changement produit
   de cette preuve ne reste dans le diff du dépôt.
9. `node scripts/check.mjs` est vert ; le code de production et les tests sont inchangés.

## Test d'acceptation attendu

Aucun test nouveau dans ce ticket : la preuve est l'étape « lint » du contrôle unique, qui passe de
« non lancé » à « ✔ », les fautes injectées du critère 6 et l’élagage du critère 8. Le test
« the full check fails when a measure regresses against the baseline and reports skipped tools as not
run » de `tests/quality-check.test.cjs` prouve le signalement de Prettier absent dans un dépôt isolé ;
il ne prouve pas le lancement d’ESLint. Le test qui empêche le gel de grandir vient au ticket suivant.

## Hypothèses bloquantes

Aucune décision n'est attendue.

Hypothèse technique à vérifier à l’implémentation : ESLint 9.39.5 fournit les options `--suppress-all`
et `--prune-suppressions`, le fichier par défaut et les refus exigés ici. Aucun ESLint racine n’a été
installé ou exécuté pour le rafraîchissement. L’implémentation vérifie ces capacités avant le gel ;
si elles manquent, elle décrit l’écart et s’arrête sans changer de mécanisme ni affaiblir le contrôle.

Les seuils viennent de `docs/standards.md` ; les exemptions des tests,
les ignorés et l'absence des autres règles sont consignés dans l'ADR, et le propriétaire peut les
revoir plus tard par un ticket marqué `harnais: oui`.

Verdict BLOQUÉ, avec la sortie constatée, dans deux cas :

- l'installation échoue (réseau, registre) ;
- une option de suppression attendue (`--suppress-all`, `--prune-suppressions`) manque à la version
  installée.

## Journal

Rafraîchi le 15/10 contre `e92c6a6` : T150 remplace T028/T145, Prettier et son ignore progressif sont
reconnus, anciennes mesures ESLint retirées, repères corrigés et réduction des suppressions à prouver.
Aucun ESLint installé et aucun test exécuté pendant ce rafraîchissement ; les commandes des critères
restent à exécuter lors de l’implémentation.

- Relecture documentaire le 15/10 contre `e92c6a6` : sources rendues pérennes dans
  `docs/audit-points-chauds.md` ou attribuées à la décision du propriétaire, le 15/10.
