---
id: T034
titre: Add a type-check step and a typed-files measure to the quality check
statut: a-faire
bloque_par: T032
adr: oui
installe: oui
harnais: oui
supprime_tests: non
---

## Ce que le ticket livre

Aucun fichier du produit n'est vérifié par un vérificateur de types. Une erreur de forme sur un
argument ou une valeur peut-être absente n'apparaît qu'à l'exécution. Le cœur s'y prête pourtant : il
n'a aucune dépendance externe.

Après ce ticket, TypeScript est installé et vérifie en mode strict, à partir des annotations JSDoc et
sans transpilation, les deux fichiers de `core/` qui passent déjà sans erreur. Le contrôle unique lance
cette vérification dans une étape « types ». Une mesure du cliquet compte les fichiers vérifiés : la
liste ne peut que grandir, et l'assouplissement du mode strict la fait tomber à zéro. Ce ticket pose
l'outillage et ne touche à aucun fichier de `core/` ; l'ajout d'autres fichiers est l'objet d'un ticket
à part, qui n'a pas besoin du harnais.

## Sources

- Constats : OPS-14, ADP-15, OPS-07
- Code concerné, à la version `0d5a954` :
  - `scripts/check.mjs` : fonctions `run` (ligne 29) et `bin` (ligne 48) ; fonction `lint` (ligne 96),
    modèle d'une étape qui rend « non lancé » quand l'outil manque ; enchaînement des étapes en mode
    `--file` et en modes complet et `--changed` (lignes 140 à 160).
  - `scripts/quality/metrics.mjs` : constante `DIRECTIONS` (ligne 47), où `"min"` désigne une mesure
    qui ne peut que monter ; fonction `measure` (ligne 57), qui part de `DIRECTIONS` pour créer chaque
    compteur à zéro.
  - `scripts/quality/ratchet.mjs` : `compare` (ligne 16) ne contrôle pas une mesure absente du plancher ;
    `tighten` (ligne 31) ajoute au plancher une mesure qui n'y est pas encore. Le plancher
    `scripts/quality/baseline.json` n'a donc pas à être édité : la boucle y ajoute la mesure nouvelle
    après le ticket.
  - `tests/quality-check.test.cjs`, test « measures count long lines, empty catches, env reads,
    innerHTML, ticket-named tests and test cases » (ligne 10) : il compare tout l'objet rendu par
    `measure` ; une clé nouvelle dans `DIRECTIONS` l'oblige à recevoir `fichiers_types: 0`.
  - `tests/quality-check.test.cjs`, test « the full check fails when a measure regresses against the
    baseline and reports skipped tools as not run » (ligne 78) : modèle pour l'étape « non lancée ».
  - `package.json` : ni `typescript`, ni `tsconfig.json` à la racine. `film/` et `promo/` ont chacun le
    leur, avec TypeScript 5.9.3 dans `promo/node_modules`. `@types/node` 24.19.0 est déjà présent dans
    `package-lock.json` (ligne 756) comme dépendance indirecte.
  - `core/ports.cjs` (103 lignes) et `core/video-tool-contracts.cjs` (38 lignes) n'importent aucun
    module.
- Mesure au découpage :
  ```sh
  promo/node_modules/.bin/tsc --noEmit --allowJs --checkJs --strict --module nodenext \
    --moduleResolution nodenext --types node --skipLibCheck --target es2022 \
    core/ports.cjs core/video-tool-contracts.cjs
  ```
  sort en 0, sans erreur. Trois fichiers de tests citent l'un des deux :
  `tests/clip-unreadable.test.cjs`, `tests/reinspection-transcript-reuse.test.cjs`,
  `tests/refactor-boundaries.test.cjs`.

## Périmètre

- Installation (`installe: oui`), en versions exactes :
  `npm install --save-dev --save-exact typescript@5.9.3 @types/node@24.19.0`.
- `tsconfig.json` (nouveau, JSON sans commentaire) :
  - `compilerOptions` : `allowJs`, `checkJs`, `noEmit` et `strict` à `true`, `module` et
    `moduleResolution` à `nodenext`, `target` à `es2022`, `types` à `["node"]`, `skipLibCheck` à `true` ;
  - `files` : `core/ports.cjs` et `core/video-tool-contracts.cjs`, nommés un par un. Ni `include` ni
    joker : la liste est la mesure.
- `scripts/check.mjs` (`harnais: oui`) : une étape « types », en mode complet et en mode `--changed`,
  pas en mode `--file`. Elle lance `node_modules/.bin/tsc -p tsconfig.json --pretty false`. Elle est
  « non lancée » si `tsc` ou `tsconfig.json` manque, et rouge avec les vingt dernières lignes de sortie
  si `tsc` sort autrement qu'en 0.
- `scripts/quality/metrics.mjs` (`harnais: oui`) : une mesure `fichiers_types`, de sens `"min"`, ajoutée
  à `DIRECTIONS` après `cas_de_test`. Elle est calculée par une fonction pure qui reçoit le texte de
  `tsconfig.json` et un moyen de lire un fichier :
  - elle vaut le nombre d'entrées de `files` qui existent et ne contiennent ni `@ts-nocheck`, ni
    `@ts-ignore`, ni `@ts-expect-error` ;
  - elle vaut 0 si `tsconfig.json` manque ou ne se lit pas en JSON, si `strict`, `checkJs` ou `noEmit`
    n'est pas `true`, ou si l'une des options `noImplicitAny`, `strictNullChecks`,
    `strictFunctionTypes`, `strictBindCallApply`, `strictPropertyInitialization`, `noImplicitThis`,
    `useUnknownInCatchVariables` ou `alwaysStrict` vaut `false`.
- `scripts/quality/baseline.json` n'est pas modifié : la boucle y ajoute la mesure en resserrant le
  plancher.
- `package.json` : entrée `"typecheck": "tsc -p tsconfig.json"`.
- `docs/standards.md` (protégé, `harnais: oui`) : une ligne qui dit que les fichiers listés dans
  `tsconfig.json` passent `tsc` en mode strict, que la liste ne fait que grandir (mesure
  `fichiers_types`) et qu'un type se donne en JSDoc, sans directive qui fait taire `tsc`.
- ADR : `docs/adr/<prochain numéro libre>-typage-progressif-par-jsdoc.md`, d'après le gabarit. Trois
  options : migrer vers des fichiers `.ts` avec une étape de compilation, vérifier le JavaScript par
  JSDoc lot par lot, ne rien vérifier. Il retient la deuxième et donne les conséquences :
  - aucune étape de compilation, les fichiers exécutés restent ceux qu'on lit ;
  - `tsconfig.json` n'est pas dans le harnais protégé, pour qu'un ticket de typage n'ait pas besoin de
    `harnais: oui` ; c'est la mesure `fichiers_types` qui interdit de retirer un fichier ou d'assouplir
    le mode strict ;
  - un type se donne par un commentaire JSDoc, sans `@ts-ignore`, `@ts-expect-error`, `@ts-nocheck` ni
    `any` explicite ;
  - le contrôle des promesses flottantes, qui demande un lint typé, attend des tickets suivants.
- Tests, dans `tests/quality-check.test.cjs` :
  - le test de la ligne 10 reçoit `fichiers_types: 0` dans l'objet attendu, et rien d'autre ne change :
    c'est un renforcement, aucune assertion n'est retirée ;
  - un test nouveau de la mesure, sur des dépôts de `harnessRepo` : deux fichiers listés et le mode
    strict donnent 2 ; `strict: false` donne 0 ; `noImplicitAny: false` donne 0 ; un fichier listé qui
    contient `@ts-nocheck` n'est pas compté ; un fichier listé absent n'est pas compté ; un
    `tsconfig.json` illisible donne 0 ;
  - un test nouveau du contrôle : dans un dépôt de `harnessRepo` (sans `node_modules`), avec un
    `tsconfig.json`, la sortie contient « types : non lancé ».
- À ne pas toucher : `scripts/quality/baseline.json`, `eslint.config.mjs`, `eslint-suppressions.json`,
  `scripts/loop/`, `.claude/`, tout fichier de `core/`, les autres tests.

## Critères d'acceptation

Chaque critère se vérifie par un test ou une commande, avec sa sortie dans le journal.

1. `node -p "Object.entries(require('./package.json').devDependencies).filter(([n])=>/typescript|@types\/node/.test(n)).join(' ')"`
   affiche les deux paquets en version exacte, sans `^` ni `~`. `node_modules/.bin/tsc --version` affiche
   `Version 5.9.3`.
2. `node_modules/.bin/tsc -p tsconfig.json` sort en 0 et `npm run typecheck` aussi.
3. `node -p "require('./tsconfig.json').files.length"` affiche `2`, et
   `node scripts/quality/ratchet.mjs` affiche `fichiers_types` à 2.
4. `node scripts/check.mjs --no-tests` affiche `✔ types`.
5. Fautes injectées, consignées au journal puis défaites :
   - `function f(a) { return a; }` ajouté à `core/ports.cjs` fait afficher par
     `node scripts/check.mjs --no-tests` l'erreur `TS7006` avec le fichier, et le contrôle sort en rouge ;
   - `"strict": false` dans `tsconfig.json` fait afficher `fichiers_types` à 0 par
     `node scripts/quality/ratchet.mjs` (le plancher n'a pas encore cette mesure pendant la session :
     le refus par le cliquet est prouvé par le test de `compare`, ligne 32, pour toute mesure `"min"`) ;
   - `// @ts-nocheck` en tête de `core/video-tool-contracts.cjs` fait afficher 1 par
     `node scripts/quality/ratchet.mjs`.
6. `node --test tests/quality-check.test.cjs` passe, avec deux tests de plus qu'au début de la session
   (nombres consignés au journal).
7. `node_modules/.bin/prettier --check .` et `node_modules/.bin/eslint .` sortent en 0.
8. `node scripts/check.mjs` est vert.

## Test d'acceptation attendu

Dans `tests/quality-check.test.cjs`, deux tests nouveaux. Frontière : la mesure appelée sur un dépôt
temporaire de `harnessRepo` où le test écrit `tsconfig.json` et les fichiers listés ; et
`node scripts/check.mjs` lancé dans un dépôt sans `tsc`, pour l'étape « non lancée ». La vérification
réelle des deux fichiers est l'étape « types » du contrôle unique sur le dépôt.

## Hypothèses bloquantes

Aucune décision n'est attendue. Les options du compilateur et le refus des directives qui font taire
`tsc` découlent du constat et sont consignés dans l'ADR ; le propriétaire peut les revoir par un ticket
marqué `harnais: oui`.

Verdict BLOQUÉ, avec la sortie constatée, si l'installation échoue (réseau, registre), ou si
`tsc -p tsconfig.json` ne sort pas en 0 sur les deux fichiers sans modifier `core/`.

## Journal
