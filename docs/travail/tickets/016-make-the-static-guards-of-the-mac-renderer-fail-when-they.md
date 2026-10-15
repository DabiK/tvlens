---
id: T016
titre: Make the static guards of the Mac renderer fail when they scan nothing
statut: termine
bloque_par: T163
adr: non
installe: non
harnais: non
supprime_tests: non
niveau: standard
---

## Ce que le ticket livre

Trois gardes statiques de la fenêtre Mac parcourent ce qu'un motif trouve dans le texte. Si le motif ne
trouve plus rien, la boucle tourne à vide et le test reste vert : après un formatage, le garde ne garde
plus rien et personne ne le voit. Après ce ticket, chaque garde prouve qu'il a examiné quelque chose,
lit les imports et le pont réels plutôt que leur texte, et un test dédié montre qu'il échoue quand on
le prive de matière.

## Sources

- Constat : TSTC-04 ; `docs/audit-points-chauds.md`, sections E et F (entrée T016), retenu par décision du propriétaire, le 15/10.
- Code vérifié par lecture à la version `e92c6a6` :
  - `tests/mac-ui.test.cjs:1049`, `rendererFiles` : `renderer.js`, `recording.js` et les scripts
    `.js`/`.mjs` de `app/ui/`, maintenant au nombre de 18 ;
  - `tests/mac-ui.test.cjs:1052`, test « the renderer parses, imports only what its modules export,
    and finds every element it asks for » : `exportsOf` relève les exports dans le texte (`:1053`),
    les imports nommés sont relevés par un motif imposant des apostrophes (`:1056`),
    puis comparés aux exports textuels (`:1057-1058`). Aucun plancher ne vérifie le nombre d'imports ;
  - dans ce même test, les identifiants HTML sont relevés à `:1064` ; les motifs des appels littéraux
    du renderer et du shell sont parcourus à `:1066-1067`, sans assertion de non-vacuité ;
  - `tests/mac-ui.test.cjs:1073`, test « the renderer talks to the bridge of the contract only, and
    writes no ceiling or retention of its own » : `exposed` mélange les clés textuelles des deux
    objets du preload (`:1074-1075`) ; `used` vient déjà du source normalisé par `shape` (`:1076`).
    Les scripts de sonde ont leur relevé propre et des méthodes obligatoires (`:1082-1085`) ;
  - `tests/helpers/source-shape.cjs:238`, `shape`, normalise les mises en page : ce helper existe déjà
    et est déjà utilisé par ces gardes ; T015 est terminé. Il ne prouve ni syntaxe complète ni imports réels ;
  - `app/renderer.js:1` à `:18` déclare 18 imports nommés, dont `RollingRecorder` à `:5`.
    Le chargement accède au document (`:19-20`) et au pont (`:21`) : ce module n'est pas à exécuter
    dans ce test ; `app/index.html:143` le charge comme module de la page ;
  - `app/preload.cjs:14` expose trois méthodes sous `capture`, `:19` expose 57 méthodes sous `tvlens`.
    Le pont réel peut être chargé devant un faux `electron`, suivant `loadBridge` dans
    `tests/mac-ipc-contract.test.cjs:46-58`, dont le test de contrat commence à `:60` ;
  - `app/ui/shell.js:5`, `ViewingShell`, évalue le document par défaut à l'instanciation seulement.
    Les appels littéraux `this.get` ne sont pas tous les accès dynamiques (boucles à `:37` et `:74`) :
    le présent ticket garde le périmètre des relevés littéraux, sans annoncer une validation DOM complète.
- Relevé statique : le fichier déclare 34 tests. Les 18 modules UI et `recording.js` ont été lus ;
  leurs accès navigateur sont dans les fonctions ou méthodes, pas au chargement. Aucun import réel
  ni test n'a été exécuté pour ce rafraîchissement : leur importabilité est une hypothèse à vérifier.

## Périmètre

- À modifier : `tests/mac-ui.test.cjs` seulement — les deux tests cités, plus un cas de test ajouté pour
  la preuve de non-vacuité.
- Imports : chaque module de `rendererFiles` autre que `renderer.js` est réellement importé
  (`await import()`), ce qui prouve que ses imports nommés existent ; pour `renderer.js`, chaque nom
  importé est cherché dans les clés du module réellement importé, et non plus dans une lecture de son texte. Le
  relevé des imports de `renderer.js` ne dépend ni des guillemets ni des retours à la ligne.
- Identifiants : les deux motifs acceptent apostrophes, guillemets et retour à la ligne après la
  parenthèse.
- Pont : `exposed` vient des clés de l'objet que le vrai `app/preload.cjs` expose sous `tvlens`, chargé
  devant un faux `electron` par une aide locale au fichier (même technique que `loadBridge`). `used`
  reste relevé dans le texte, tel que T015 l'a rendu indifférent à la mise en page :
  ce ticket n'y ajoute que le plancher. Le contrôle des scripts de la page (l.1082-1085) ne relève que
  `window.tvlens.…` : il reste valable avec les seules méthodes de `tvlens`.
- Planchers : le relevé des imports de `renderer.js`, chacun des deux relevés d'identifiants
  (`renderer.js` et `ui/shell.js`), le relevé agrégé des méthodes du pont et celui de chacun des deux
  scripts doivent être non vides ; chaque échec nomme le fichier ou le groupe concerné.
  Les modules sans import ou sans accès au pont ne sont pas soumis à un plancher impossible :
  leur import réel vérifie leurs dépendances, même quand ils n'en ont aucune.
- À ne pas toucher : le code de production ; `tests/mac-ipc-contract.test.cjs` (son relevé de canaux est
  traité par le ticket de la table des canaux) ; les gardes d'absence du second test. Aucun cas de test
  n'est retiré, aucun titre changé. `tests/helpers/mac-host.cjs` n'est pas créé ici : le banc local
  du preload suffit et les extractions de helpers parquées ne sont pas un prérequis.
- Les fautes injectées pour les preuves sont défaites avant la fin de la session
  par retrait manuel des seules fautes : aucun fichier de `app/` ne reste modifié par ce ticket.
- Aucune ligne de plus de 160 caractères n'est ajoutée au fichier.

## Critères d'acceptation

Chaque critère se vérifie par un test ou une commande.

1. `node --test tests/mac-ui.test.cjs` passe, et `rg -c '^test\(' tests/mac-ui.test.cjs` rend un de
   plus qu'au début de la session (34 déclarations à `e92c6a6`). Aucun titre existant ne change.
2. Le cas ajouté prouve, sur des textes écrits en dur : le relevé d'identifiants et celui des imports
   rendent le même résultat en apostrophes sur une ligne et en guillemets doubles sur plusieurs lignes ;
   un texte sans aucune occurrence fait échouer le garde avec le nom du fichier. Le relevé du pont
   est également éprouvé avec une entrée vide ; un module sans import reste accepté par l'import réel.
3. Le test des imports n'utilise plus `exportsOf` : `grep -c "exportsOf" tests/mac-ui.test.cjs` rend 0.
4. `exposed` ne vient plus du texte du preload : dans le test du pont, il compte 57 noms (assertion du
   test) et `capture` n'en fait pas partie.
5. Fautes injectées, consignées au journal puis défaites : importer un nom inexistant dans
   `app/ui/job-card.js` fait échouer le test des imports ; demander `$('absent-id')` dans
   `app/renderer.js` fait échouer le test des identifiants ; appeler `bridge.absentMethod()` dans
   `app/renderer.js` fait échouer le test du pont.
6. `node scripts/check.mjs` est vert.

## Test d'acceptation attendu

Les deux tests existants de `tests/mac-ui.test.cjs`, plus le cas de non-vacuité. Frontière : les modules
réels de `app/ui/` et `app/recording.js` importés par Node, le vrai `app/preload.cjs` chargé devant un
faux `electron`, et le texte de `app/renderer.js` et `app/index.html`.

## Hypothèses bloquantes

Aucune décision n'est attendue.

Hypothèse à vérifier par le traitement : les 18 modules UI et l'enregistreur s'importent sans DOM et sans
effet de bord sous la version de Node utilisée. Cette réussite n'a pas été exécutée ici.
Si l'import réel d'un module de `rendererFiles` échoue ou a un effet de bord (minuterie, écriture)
dans le processus de test, ou si le vrai preload n'expose pas 57 méthodes
sous `tvlens` : verdict BLOQUÉ, avec l'écart constaté.

## Journal

- Rafraîchi le 15/10 contre `e92c6a6` : dépendance T150, niveau standard ; 18 modules UI au lieu de 14,
  18 imports du renderer, 34 déclarations de tests au lieu de 15. Preload toujours à 57 méthodes sous
  `tvlens` ; relevé `used` déjà normalisé. Planchers limités aux relevés attendus non vides, ancien
  succès d'import remplacé par une hypothèse explicite ; aucune exécution de test.

- Contrôle documentaire : `node scripts/check.mjs --changed` lancé une fois, code 0, vert.
  Aucun fichier de test modifié, donc aucun test exécuté ; Markdown ignoré par Prettier.
  ESLint non lancé (absent ou non configuré). En-têtes, sections et repères contrôlés séparément par lecture.

- Relecture documentaire le 15/10 contre `e92c6a6` : sources rendues pérennes dans
  `docs/audit-points-chauds.md` ou attribuées à la décision du propriétaire, le 15/10.

- Exploration Codex le 15/10 : consignes et code lus, 34 tests au départ, modifications préexistantes préservées.
  Exploration et absence d’écart prévu consignées dans `.harness-state/tickets/T016/`.

- Hypothèses vérifiées : `node --input-type=module -e …` (commande complète dans `hypotheses.log`),
  code 0 : les 19 modules s’importent sans DOM ; le preload expose 57 méthodes sous `tvlens`.
  `node --test tests/mac-ui.test.cjs` initial : 34 réussites (`baseline.log`).
- Cycles tests d’abord : `node --test --test-name-pattern='static scans' tests/mac-ui.test.cjs` :
  rouge observé sur les identifiants multilignes, puis sur l’absence d’exception pour une entrée vide,
  puis sur les imports multilignes (`red-layout.log`, `red-empty.log`, `red-import-layout.log`).
  Après correction : 1 réussite (`green-scans.log`).
- Pont : `node --test --test-name-pattern='the renderer talks' tests/mac-ui.test.cjs` rouge :
  60 clés textuelles au lieu de 57 (`red-bridge-keys.log`). Chargement réel du preload corrigé.
  `node --test tests/mac-ui.test.cjs` : 35 réussites (`green-mac-ui.log`).
  `node scripts/check.mjs --changed` : vert, 35 tests ; lint non lancé (ESLint absent ou non configuré).
  Commandes et sorties conservées dans `.harness-state/tickets/T016/`.

- Fautes injectées séparément, échecs observés puis seules les lignes injectées retirées :
  - `import { absentExport } from './format.js';` dans `app/ui/job-card.js` :
    `node --test --test-name-pattern='the renderer parses' tests/mac-ui.test.cjs`, code 1,
    assertion `doesNotReject` nommant `ui/job-card.js` et export inexistant (`mutation-import.log`).
  - `$('absent-id');` dans `app/renderer.js` : même commande, code 1,
    assertion `renderer.js uses #absent-id, absent from index.html` (`mutation-element.log`).
  - `bridge.absentMethod();` dans `app/renderer.js` :
    `node --test --test-name-pattern='the renderer talks' tests/mac-ui.test.cjs`, code 1,
    assertion sur la méthode non exposée (`mutation-bridge.log`).
  Identité des octets des deux fichiers avec leur état avant injection vérifiée après retrait.

- Vérification finale : `rg -c '^test\(' tests/mac-ui.test.cjs` rend 35 ;
  `grep -c "exportsOf" tests/mac-ui.test.cjs` rend 0 (code 1 normal sans occurrence).
  Les 34 titres antérieurs sont conservés dans leur ordre ; aucune ligne ajoutée ne dépasse 160 caractères ;
  `git diff --exit-code -- app` rend 0 (`acceptance-inventory.log`).
- `node scripts/check.mjs` complet : code 0, vert (`check-full.log`) ;
  1 123 tests JS réussis sur 97 fichiers ; Python : 84 tests, OK avec 1 ignoré.
  Règles, format et cliquet verts ; lint non lancé (ESLint absent ou non configuré).
  Verdict Codex `TERMINÉ` écrit dans `.harness-state/tickets/T016/verdict.json` ;
  aucun commit ni push, relecture laissée à la boucle.

### Réserves à la clôture

- .harness-state/tickets/T016/relecture-1.md : **1. `tests/mac-ui.test.cjs:1072` (`importRendererModule`) — hors périmètre**
  - **Problème :** les modules `.js` de `app/` ont la syntaxe ESM, mais aucun `package.json` ne déclare `"type": "module"`. Le premier import réel affiche donc l'avertissement `[MODULE_TYPELESS_PACKAGE_JSON]`, et Node relit le fichier comme ESM, ce qui ajoute un coût. Ce bruit n'existait pas dans la sortie de ce fichier avant le ticket : `baseline.log` est propre, `green-mac-ui.log` le montre. Le journal ne le mentionne pas.
  - **Effet de bord au sens de l'hypothèse bloquante ? Non.** L'avertissement vient du chargeur de Node, pas du module : aucune minuterie, aucune écriture. Le phénomène existe déjà ailleurs dans la suite (`tests/architecture-f09.test.cjs:265` importe `app/ui/recap-view.js`).
  - **Ce qu'il faudrait :** déclarer le type de module (`package.json` racine ou `app/`), ou renommer les modules en `.mjs`. Ce ticket interdit de toucher au code de production : c'est une réserve pour un ticket ultérieur.
