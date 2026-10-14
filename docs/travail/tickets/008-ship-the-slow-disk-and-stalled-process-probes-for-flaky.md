---
id: T008
titre: Ship the slow-disk and stalled-process probes for flaky tests
statut: a-faire
bloque_par: T007
adr: non
installe: non
harnais: non
supprime_tests: non
---

## Ce que le ticket livre

Les deux sondes qui ont permis de reproduire les échecs intermittents de l'audit n'existent que dans un
dossier de travail hors dépôt. Après ce ticket, elles vivent dans le dépôt, se lancent par une commande
npm sur toute la suite ou sur un fichier, et `CONTRIBUTING.md` dit comment lire leur résultat.

## Sources

- Constats : FLK-16
- Texte des deux sondes de l'audit, à reprendre :

  Disque ralenti — retarde les appels nommés de `node:fs/promises` :

  ```js
  const fsp = require("node:fs/promises");
  const realSetTimeout = globalThis.setTimeout;
  const names = (process.env.FLK_SLOW || "mkdir,writeFile,rename").split(",").filter(Boolean);
  const ms = Number(process.env.FLK_MS || 5);
  if (ms > 0) {
    for (const name of names) {
      const original = fsp[name];
      if (typeof original !== "function") continue;
      fsp[name] = function (...args) {
        return new Promise((resolve) => realSetTimeout(resolve, ms)).then(() => original.apply(this, args));
      };
    }
  }
  ```

  Processus figé — bloque le fil principal `FLK_STALL` ms toutes les `FLK_EVERY` ms :

  ```js
  const realSetInterval = globalThis.setInterval;
  const stall = Number(process.env.FLK_STALL || 60), every = Number(process.env.FLK_EVERY || 80);
  const cell = new Int32Array(new SharedArrayBuffer(4));
  if (stall > 0) realSetInterval(() => { Atomics.wait(cell, 0, 0, stall); }, every).unref();
  ```

- Faits de l'audit, lus dans ses journaux :
  - Le mode étroit (`mkdir,writeFile,rename`) a reproduit les échecs de `tests/architecture-f06.test.cjs`,
    `tests/verification.test.cjs` et `tests/session-durable.test.cjs`.
  - Un mode large, quinze appels ralentis, a servi aussi ; il masque l'échec de
    `tests/session-durable.test.cjs` que le mode étroit montre. Les deux modes sont donc à garder. La
    liste exacte des quinze appels n'a pas été conservée : celle du périmètre est proposée au découpage.
  - Ordre de grandeur : 162 s pour 50 fichiers à +10 ms.
  - Les scripts de l'audit étaient en zsh et perl, avec une garde qui tuait le groupe de processus. Le
    chien de garde du lanceur les remplace.
- Code concerné, à la version `0d5a954` :
  - `scripts/quality/run-tests.mjs` : le lanceur livré par le ticket prérequis ; il prend des fichiers
    en arguments (tous les `tests/*.test.cjs` du dossier courant sinon), transmet l'environnement,
    `NODE_OPTIONS` compris, à chaque fichier, et borne chaque test et chaque fichier. Il n'existe pas
    encore à cette version.
  - `scripts/` : les sondes existantes `probe-*.cjs` interrogent des fournisseurs réels ; les sondes de
    ce ticket sont hors ligne et vont dans un dossier à part.
  - `docs/standards.md`, section « Tests » (lignes 36 à 45) : le temps et le disque se contrôlent, et un
    test instable ne se relance pas jusqu'à ce qu'il passe.
  - `CONTRIBUTING.md`, section « Vérifier une modification » (lignes 15 à 21).

## Périmètre

- À créer : `scripts/test-probes/slow-disk.cjs`, `scripts/test-probes/stalled-process.cjs`, un petit
  lanceur `scripts/test-probes/run.mjs`, et un fichier de test à plat, par exemple
  `tests/test-probes.test.cjs`.
- À modifier : `package.json` (deux scripts : `test:slow-disk` et `test:stalled`), `CONTRIBUTING.md`.
- Forme attendue :
  - `npm run test:slow-disk -- [--wide] [fichiers…]` et `npm run test:stalled -- [fichiers…]` appellent
    `scripts/test-probes/run.mjs`, qui pose `NODE_OPTIONS=--require=<sonde>` et les valeurs par défaut,
    puis lance `scripts/quality/run-tests.mjs` avec les fichiers reçus. Le lanceur de tests n'est pas
    modifié.
  - `run.mjs` trouve la sonde et le lanceur de tests à partir de son propre emplacement, pas du dossier
    courant, et donne à `--require` un chemin absolu. Un `NODE_OPTIONS` déjà posé par l'appelant est
    conservé : la sonde s'y ajoute. Le code de sortie est celui du lanceur de tests.
  - Conséquence de `NODE_OPTIONS`, à écrire dans `CONTRIBUTING.md` : la sonde est chargée dans tout
    processus Node lancé sous elle — le lanceur de tests, chaque fichier, et les processus Node qu'un
    test lance lui-même.
  - Défauts : `FLK_MS=10`, `FLK_SLOW=mkdir,writeFile,rename`, `FLK_STALL=60`, `FLK_EVERY=80`. Une
    variable déjà posée par l'appelant l'emporte.
  - `--wide` pose `FLK_SLOW` sur quinze appels : `mkdir`, `writeFile`, `rename`, `readFile`, `readdir`,
    `stat`, `lstat`, `access`, `rm`, `unlink`, `copyFile`, `appendFile`, `open`, `mkdtemp`, `symlink`.
- `CONTRIBUTING.md` dit : à quoi servent les deux sondes, les deux commandes, les variables, que les
  deux modes du disque ralenti ne montrent pas les mêmes échecs, et la règle de lecture — sous sonde,
  seul un échec relu jusqu'à sa cause compte ; un échec sous sonde n'est ni un défaut prouvé ni une
  raison de relancer.
- À ne pas toucher : `scripts/check.mjs`, `scripts/quality/`, les tests existants. Les sondes ne
  s'ajoutent pas au contrôle qualité : elles servent à reproduire, pas à valider. Aucun test trouvé en
  échec sous sonde n'est corrigé ici.

## Critères d'acceptation

Les critères 1 à 5 se vérifient par des tests du nouveau fichier, qui chargent une sonde dans un
processus Node enfant.

1. Disque ralenti, `FLK_SLOW=writeFile FLK_MS=50` : un `writeFile` lancé en même temps qu'une minuterie
   de 5 ms se résout après elle, et le fichier est bien écrit ; `readFile`, non nommé, reste la fonction
   d'origine.
2. Disque ralenti, `FLK_MS=0` : aucune fonction de `node:fs/promises` n'est remplacée.
3. Processus figé : un enfant chargé avec la sonde armée se termine seul, code 0 ; avec `FLK_STALL=0`,
   la sonde n'arme aucune minuterie (`process.getActiveResourcesInfo()` sans `Timeout`).
4. `scripts/test-probes/run.mjs slow-disk <fichier d'essai>` : le test du fichier d'essai, lancé par le
   lanceur de tests, constate que son propre `writeFile` est ralenti ; le résumé du lanceur est affiché
   et le code de sortie est 0.
5. `scripts/test-probes/run.mjs slow-disk --wide <fichier d'essai>` : le fichier d'essai lit dans
   `FLK_SLOW` les quinze noms du périmètre. Lancé avec `NODE_OPTIONS=--no-warnings` et `FLK_MS=3` déjà
   posés, le fichier d'essai retrouve `--no-warnings` dans son `NODE_OPTIONS` et lit `FLK_MS=3`. Lancé
   depuis un autre dossier courant avec un chemin absolu de fichier d'essai, `run.mjs` fonctionne de
   même.
6. `node -p "Object.keys(require('./package.json').scripts).filter(k => /slow-disk|stalled/.test(k))"`
   donne les deux scripts. `grep` sur `CONTRIBUTING.md` montre les deux commandes et la règle de
   lecture. Sorties dans le journal.
7. `node scripts/check.mjs` est vert.

## Test d'acceptation attendu

Un nouveau fichier de test nommé d'après le comportement, dont par exemple « the slow-disk probe delays
only the calls it is told to, and none when its delay is zero ». Frontière : un processus Node chargé
avec la sonde par `--require`, et `scripts/test-probes/run.mjs` lancé comme un processus.

## Hypothèses bloquantes

Aucune décision n'est attendue. La liste du mode large est une proposition du découpage : le
propriétaire peut la changer à la relecture du ticket sans que le reste bouge. Si le lanceur de tests ne
transmet pas `NODE_OPTIONS` à ses fichiers : verdict BLOQUÉ, car le corriger demande le drapeau
`harnais`.

## Journal
