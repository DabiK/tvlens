---
id: T031
titre: Lint with ESLint in the quality check and freeze the existing violations
statut: termine
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

- Exploration Codex le 15/10 : lecture du contrôle, de ses tests et des ADR 0011/0013 ;
  état initial conservé (ticket déjà en cours, dossiers design/continuous-context/ et experiments/
  non suivis). Aucun écart prévu, détail dans `.harness-state/tickets/T031/exploration.md`
  et `ecarts.md`. Les preuves CLI prévues remplacent tout ajout de test.

### Activation et gel — 15/10

- Avant activation, `node scripts/check.mjs --no-tests` sort en 0 avec `lint : non lancé`
  (sortie conservée dans `before-check.log`).
- `npm install --save-dev --save-exact eslint@9.39.5 @eslint/js@9.39.5 globals@14.0.0`
  échoue en 1 : EPERM à l’écriture dans le cache npm utilisateur. Sans modifier ce cache,
  `npm install --cache /private/tmp/tvlens-eslint-npm-cache --save-dev --save-exact eslint@9.39.5 @eslint/js@9.39.5 globals@14.0.0`
  réussit en 0 : 85 paquets ajoutés, 233 audités, 0 vulnérabilité (`install-writable-cache.log`).
- Documentation consultée par Context7 : résolution ESLint, puis
  `npx ctx7@latest docs /eslint/eslint/v9.39.3 "bulk suppressions --suppress-all --prune-suppressions default eslint-suppressions.json unused suppressions exit code"`.
  La version indexée confirme le fichier par défaut et les options ; le binaire réellement installé
  les confirme par `node_modules/.bin/eslint --help` (sortie `eslint-help.log`, code 0).
  Une requête documentaire supplémentaire sur la configuration plate échoue en EPERM sur le cache npm ;
  les configurations effectives sont vérifiées ci-dessous avec le binaire installé.
- Après configuration, `node_modules/.bin/eslint .` sort en 1 :
  `402 problems (402 errors, 0 warnings)` (`before-freeze.log`). Aucune infraction corrigée.
- `node_modules/.bin/eslint --suppress-all .` sort en 0, sans sortie, et écrit
  `eslint-suppressions.json` (`freeze.log`). Total initial : **402 infractions dans 95 fichiers**.
- Configuration par dossier, entrée npm, ignore du gel, standards et ADR 0014 écrits.

### Preuves d’acceptation — 15/10

Commandes exécutées séquentiellement par `.harness-state/tickets/T031/acceptance.py`.
Sorties complètes ci-dessous ; configurations complètes conservées dans les fichiers `config-*.json`
du dossier d’état, logs individuels et `acceptance.log`. Les extraits de configuration donnent les
valeurs demandées ; les valeurs numériques ESLint 0 et 2 signifient respectivement off et error.

```text
$ node -p 'Object.entries(require('"'"'./package.json'"'"').devDependencies).filter(([n])=>/eslint|globals/.test(n)).join('"'"' '"'"')'
@eslint/js,9.39.5 eslint,9.39.5 globals,14.0.0

exit=0
$ node_modules/.bin/eslint --version
v9.39.5

exit=0
$ node_modules/.bin/eslint .
(aucune sortie)
exit=0
$ npm run lint

> tvlens@0.1.0 lint
> eslint .


exit=0
$ node scripts/check.mjs --no-tests
✔ règles par fichier
✔ format
✔ lint
✔ cliquet
check : vert

exit=0
$ node -e 'const s=require("./eslint-suppressions.json"),c={};for(const[f,rs]of Object.entries(s))for(const[r,{count}]of Object.entries(rs)){const z=f.split("/")[0];c[r]??={};c[r][z]=(c[r][z]||0)+count}console.table(c)'
┌────────────────────────┬──────────┬─────┬──────┬─────────┬─────────┬────────┬───────┬────┐
│ (index)                │ adapters │ app │ core │ runtime │ scripts │ server │ tests │ tv │
├────────────────────────┼──────────┼─────┼──────┼─────────┼─────────┼────────┼───────┼────┤
│ no-empty               │ 16       │ 4   │ 6    │ 4       │ 7       │ 2      │ 5     │ 7  │
│ complexity             │ 23       │ 17  │ 30   │ 8       │ 23      │ 1      │       │ 25 │
│ no-nested-ternary      │ 16       │ 34  │ 27   │ 8       │ 10      │ 1      │ 2     │ 37 │
│ no-unused-vars         │ 1        │     │ 1    │         │ 8       │        │ 12    │    │
│ max-lines-per-function │ 5        │ 3   │ 1    │ 2       │ 4       │ 1      │       │ 8  │
│ max-lines              │ 1        │ 2   │ 2    │ 3       │ 4       │        │       │ 5  │
│ no-console             │          │     │      │ 1       │         │        │ 13    │    │
│ constructor-super      │          │     │      │         │ 1       │        │       │    │
│ no-control-regex       │          │     │      │         │ 1       │        │ 4     │    │
│ no-undef               │          │     │      │         │         │        │ 2     │    │
│ no-regex-spaces        │          │     │      │         │         │        │ 2     │    │
│ no-useless-escape      │          │     │      │         │         │        │       │ 2  │
└────────────────────────┴──────────┴─────┴──────┴─────────┴─────────┴────────┴───────┴────┘

exit=0
Stock vérifié : 402 infractions dans 95 fichiers ; exclusions conformes.
$ node_modules/.bin/eslint --print-config tv/app/companion.js
Extrait : {"sourceType": "script", "ecmaVersion": 2022}
exit=0
$ node_modules/.bin/eslint --print-config app/ui/text.mjs
Extrait : {"document": false}
exit=0
$ node_modules/.bin/eslint --print-config tests/session.test.cjs
Extrait : {"max-lines-per-function": [0, {"max": 80, "skipBlankLines": true, "skipComments": true}], "max-lines": [0, {"max": 400, "skipBlankLines": true, "skipComments": true}]}
exit=0
$ node_modules/.bin/eslint --print-config server/main.cjs
Extrait : {"no-console": [0, {}]}
exit=0
$ node_modules/.bin/eslint --print-config core/session.cjs
Extrait : {"no-console": [2, {}]}
exit=0
$ node_modules/.bin/eslint core/ports.cjs

/Users/Dabi/Documents/ISN/tvlens/core/ports.cjs
  105:10  error  'unused' is defined but never used. Allowed unused vars must match /^_/u      no-unused-vars
  105:17  error  'a' is defined but never used. Allowed unused args must match /^_/u           no-unused-vars
  105:26  error  Empty block statement                                                         no-empty
  105:36  error  'e' is defined but never used. Allowed unused caught errors must match /^_/u  no-unused-vars
  105:39  error  Empty block statement                                                         no-empty

✖ 5 problems (5 errors, 0 warnings)


exit=1
$ node scripts/check.mjs --no-tests
✖ règles par fichier
    core/ports.cjs : catch vide ajouté. Traiter l'erreur, ou la laisser passer avec un commentaire qui dit pourquoi.
✔ format
✖ lint

    /Users/Dabi/Documents/ISN/tvlens/core/ports.cjs
      105:10  error  'unused' is defined but never used. Allowed unused vars must match /^_/u      no-unused-vars
      105:17  error  'a' is defined but never used. Allowed unused args must match /^_/u           no-unused-vars
      105:26  error  Empty block statement                                                         no-empty
      105:36  error  'e' is defined but never used. Allowed unused caught errors must match /^_/u  no-unused-vars
      105:39  error  Empty block statement                                                         no-empty

    ✖ 5 problems (5 errors, 0 warnings)
✖ cliquet
    Mesures dégradées :
    catch_vides_prod : 40 → 41
check : ROUGE

exit=1
$ node_modules/.bin/eslint core/ports.cjs

/Users/Dabi/Documents/ISN/tvlens/core/ports.cjs
  105:1   warning  '// eslint-disable-next-line' has no effect because you have 'noInlineConfig' setting in your config
  106:10  error    'unused' is defined but never used. Allowed unused vars must match /^_/u                              no-unused-vars
  106:17  error    'a' is defined but never used. Allowed unused args must match /^_/u                                   no-unused-vars
  106:26  error    Empty block statement                                                                                 no-empty
  106:36  error    'e' is defined but never used. Allowed unused caught errors must match /^_/u                          no-unused-vars
  106:39  error    Empty block statement                                                                                 no-empty

✖ 6 problems (5 errors, 1 warning)


exit=1
$ node_modules/.bin/eslint core/ports.cjs

/Users/Dabi/Documents/ISN/tvlens/core/ports.cjs
  105:1  error  Unexpected console statement  no-console

✖ 1 problem (1 error, 0 warnings)


exit=1
Injections restaurées octet pour octet ; gel inchangé.
$ node_modules/.bin/prettier --check .
Checking formatting...
All matched files use Prettier code style!

exit=0
$ node_modules/.bin/prettier --file-info eslint-suppressions.json
{ "ignored": true, "inferredParser": null }

exit=0
Copie temporaire : JavaScript de core/, adapters/, runtime/, server/, mcp/, app/, scripts/, tests/, tv/, configuration, package.json et gel ; node_modules lié. Aucun code exécuté.
Correction uniquement dans la copie : scripts/bench-backend.cjs, renommage de saved en _saved (déclaration et incrément).
$ node_modules/.bin/eslint scripts/bench-backend.cjs [copie temporaire]
There are suppressions left that do not occur anymore. Consider re-running the command with `--prune-suppressions`.

exit=2
$ node_modules/.bin/eslint --prune-suppressions scripts/bench-backend.cjs [copie temporaire]
(aucune sortie)
exit=0
Élagage vérifié : seule l’entrée scripts/bench-backend.cjs / no-unused-vars / count=1 a disparu. Les 94 autres fichiers sont identiques.
$ node_modules/.bin/eslint . [copie temporaire]
(aucune sortie)
exit=0
Copie supprimée ; produit et gel du dépôt inchangés après la preuve d’élagage.
```

- Toutes les injections ont été défaites ; aucun changement produit ou test ne reste de ces preuves.

### Contrôles finaux — 15/10

`node scripts/check.mjs --changed` sort en 0 (`check-changed.log`) :

```text
✔ règles par fichier
✔ format
✔ lint
✔ cliquet
✔ tests JS
check : vert
```

Aucun test modifié à lancer dans ce mode. `git diff --check` sort en 0 après suppression
d’espaces finaux dans la transcription du journal. `git diff --name-only -- core adapters runtime
server mcp app tv tests scripts .claude .codex .agents .prettierrc.json` ne rend aucune ligne :
produit, tests, contrôle et harnais inchangés. Les dépendances préexistantes du verrouillage
conservent toutes leurs métadonnées ; seuls les paquets nécessaires au lint sont ajoutés.

`node scripts/check.mjs` complet, tests JS en séquentiel : sortie 0 (`check-full.log`).

```text
✔ règles par fichier
✔ format
✔ lint
✔ cliquet
✔ tests JS (97 fichier(s))
    ℹ tests 1123
    ℹ pass 1123
    ℹ fail 0
✔ tests Python
    Ran 84 tests in 27.083s

    OK (skipped=1)
check : vert
```

Verdict Codex : **TERMINÉ**, prêt pour la relecture de la boucle. Les neuf critères sont
couverts ; aucun écart de périmètre, aucun commit ni push. Verdict et preuves détaillées
dans `.harness-state/tickets/T031/verdict.json`.

### Reprise après relecture 1 — 15/10

- Rapport et arbre existant relus. Constat 1 accepté : les globales Node sont fusionnées dans les
  configurations navigateur. Correction prévue sans écart : isoler leur portée, vérifier le refus
  par `no-undef`, refaire le gel et mesurer le stock. Exploration et écarts consignés dans le dossier
  d’état. Constats 2 et 3 hors périmètre conservés comme réserves du prochain verdict.

- Documentation vérifiée via la skill `find-docs` et Context7 : résolution ESLint puis documentation
  `/eslint/eslint/v9.39.3` sur les exclusions locales à un bloc de configuration, sorties 0.
  Commandes et source dans `correction-1-docs.md` ; le binaire testé reste 9.39.5.
- Preuve rouge, avant modification : `python3 -B .harness-state/tickets/T031/browser-globals.py`,
  sortie 1 (`correction-1-red.log`) : six assertions en échec, sans erreur technique. Les trois
  chemins `tv/app/companion.js`, `app/ui/text.mjs` et `app/renderer.js` héritaient de neuf globales
  propres à Node et acceptaient les quatre usages sondés. Les sondes Node et scripts passaient.
  Une première sonde utilisait une option inexistante `--no-suppressions` ; elle a été corrigée
  avant cette preuve rouge, avec un fichier de suppressions vide distinct.
- Correction : globales Node dans un bloc distinct qui exclut `app/ui/**`, `app/*.js` et
  `tv/app/**/*.js`. Les règles communes restent appliquées. Même commande de preuve : sortie 0,
  deux tests réussis (`correction-1-green.log`). Aucun test ajouté au dépôt.
- `--print-config` sur ces trois chemins confirme l’absence de `process`, `require`, `Buffer`,
  `__dirname`, `__filename`, `exports`, `global`, `setImmediate` et `clearImmediate` ; `document`,
  `setTimeout`, `URL` et `console` restent déclarés. `module` reste en lecture pour la TV et absent
  des vues Mac. `--stdin` avec `void process; void require; void Buffer; void __dirname;` produit
  quatre erreurs `no-undef` par chemin navigateur, zéro pour Node et scripts. Configurations et
  diagnostics complets : `correction-1-config-*.json` et `correction-1-stdin-*.json`.
- Avant nouveau gel, `node_modules/.bin/eslint .` sort en 1 : exactement trois erreurs
  `no-undef`, pour `require` dans `tv/app/companion.js:29`, `tv/app/sessions-view.js:6` et
  `tv/app/surveillance-view.js:47` (`correction-1-before-freeze.log`).
- `node_modules/.bin/eslint --suppress-all .` sort en 0, sans sortie (`correction-1-freeze.log`).
  Comparaison structurée au gel relu : seules ces trois entrées `no-undef / count=1` sont ajoutées ;
  toutes les entrées précédentes sont identiques (`correction-1-stock-diff.log`). Le stock initial
  définitif remplace la mesure de 402 ci-dessus : **405 infractions dans 95 fichiers**. ADR actualisé.
- `python3 -B .harness-state/tickets/T031/correction-1-acceptance.py` sort en 0 : les neuf critères
  sont réexercés sauf le contrôle complet, lancé séparément après les injections. Les fautes sont
  refusées, `noInlineConfig` résiste, l’élagage ne retire que l’entrée devenue inutile. Produit et gel
  restaurés après ces preuves. Logs complets dans `correction-1-acceptance/acceptance.log` ; versions,
  lint direct et npm, contrôle sans tests, configurations, Prettier et élagage conformes.

Stock définitif, commande du critère 4 (`correction-1-acceptance/stock.log`, sortie 0) :

```text
┌────────────────────────┬──────────┬─────┬──────┬─────────┬─────────┬────────┬───────┬────┐
│ (index)                │ adapters │ app │ core │ runtime │ scripts │ server │ tests │ tv │
├────────────────────────┼──────────┼─────┼──────┼─────────┼─────────┼────────┼───────┼────┤
│ no-empty               │ 16       │ 4   │ 6    │ 4       │ 7       │ 2      │ 5     │ 7  │
│ complexity             │ 23       │ 17  │ 30   │ 8       │ 23      │ 1      │       │ 25 │
│ no-nested-ternary      │ 16       │ 34  │ 27   │ 8       │ 10      │ 1      │ 2     │ 37 │
│ no-unused-vars         │ 1        │     │ 1    │         │ 8       │        │ 12    │    │
│ max-lines-per-function │ 5        │ 3   │ 1    │ 2       │ 4       │ 1      │       │ 8  │
│ max-lines              │ 1        │ 2   │ 2    │ 3       │ 4       │        │       │ 5  │
│ no-console             │          │     │      │ 1       │         │        │ 13    │    │
│ constructor-super      │          │     │      │         │ 1       │        │       │    │
│ no-control-regex       │          │     │      │         │ 1       │        │ 4     │    │
│ no-undef               │          │     │      │         │         │        │ 2     │ 3  │
│ no-regex-spaces        │          │     │      │         │         │        │ 2     │    │
│ no-useless-escape      │          │     │      │         │         │        │       │ 2  │
└────────────────────────┴──────────┴─────┴──────┴─────────┴─────────┴────────┴───────┴────┘

exit=0
```

Les exclusions du gel et des tests sont vérifiées par assertions ; total calculé : 405, fichiers : 95.
Les constats hors périmètre restent réservés : mention « puis ESLint » des tests dans les standards,
et version 9.39.5 signalée dépréciée dans le verrouillage, imposée par ce ticket.

#### Contrôles après correction

```text
$ node scripts/check.mjs --changed
✔ règles par fichier
✔ format
✔ lint
✔ cliquet
✔ tests JS
check : vert

exit=0
```

```text
$ node scripts/check.mjs
✔ règles par fichier
✔ format
✔ lint
✔ cliquet
✔ tests JS (97 fichier(s))
    ℹ tests 1123
    ℹ pass 1123
    ℹ fail 0
✔ tests Python
    Ran 84 tests in 27.859s

    OK (skipped=1)
check : vert

exit=0
```

`git diff --check` est vert et le diff limité au produit, aux tests, au contrôle et au harnais
est vide. Aucun test ni code de production modifié, aucun commit ni push.

Nouveau verdict Codex : **TERMINÉ**. Constat mineur 1 corrigé et prouvé, aucun constat bloquant.
Les constats 2 et 3 restent hors périmètre et figurent dans `reste` du verdict ; aucune contestation
ni nouvel écart. La relecture et l’intégration reviennent à la boucle.

### Réserves à la clôture

- Relecture 1, constat 2 hors périmètre : docs/standards.md conserve la mention « relecture, puis règle ESLint avec liste d’exceptions » pour la comparaison du texte source dans les tests. À reprendre dans le ticket qui ajoutera cette règle.
- Relecture 1, constat 3 hors périmètre : ESLint 9.39.5 est marqué deprecated dans package-lock.json ; cette version exacte est imposée par le ticket. Révision ultérieure par un ticket installe: oui.
- .harness-state/tickets/T031/relecture-2.md : `docs/standards.md:42` : « relecture, puis règle ESLint avec liste d'exceptions » (hors périmètre)

  Cette mention s'appuyait sur la phrase retirée des lignes 59-60. Maintenant qu'ESLint est installé, un lecteur peut croire la règle active. Le ticket ne permet de modifier que les lignes 11-13, une ligne dans « Erreurs » et les lignes 59-60 de ce fichier protégé.

  **Attendu :** le ticket qui ajoutera cette règle reprend la mention. Réserve.
- .harness-state/tickets/T031/relecture-2.md : `package-lock.json:1600` : ESLint 9.39.5 marqué « deprecated » (hors périmètre)

  Le verrouillage contient « This version is no longer supported ». Le ticket impose cette version exacte.

  **Attendu :** le propriétaire la revoit dans un ticket `installe: oui`. Réserve.
