---
id: T016
titre: Make the static guards of the Mac renderer fail when they scan nothing
statut: a-faire
bloque_par: T015, T145
adr: non
installe: non
harnais: non
supprime_tests: non
---

## Ce que le ticket livre

Trois gardes statiques de la fenêtre Mac parcourent ce qu'un motif trouve dans le texte. Si le motif ne
trouve plus rien, la boucle tourne à vide et le test reste vert : après un formatage, le garde ne garde
plus rien et personne ne le voit. Après ce ticket, chaque garde prouve qu'il a examiné quelque chose,
lit les imports et le pont réels plutôt que leur texte, et un test dédié montre qu'il échoue quand on
le prive de matière.

## Sources

- Constats : TSTC-04
- Code concerné, à la version `0d5a954` :
  - `tests/mac-ui.test.cjs`, liste `rendererFiles` (l.661) : `renderer.js`, `recording.js` et les
    14 scripts de `app/ui/`.
  - `tests/mac-ui.test.cjs`, test « the renderer parses, imports only what its modules export, and finds
    every element it asks for » (l.664) : `exportsOf` lit les exports dans le texte (l.665) ; les
    imports sont relevés par `/^import\s*\{([^}]+)\}\s*from\s*'([^']+)';?\s*$/gm` (l.668) ; les
    identifiants demandés par `/\$\('([^']+)'\)/g` sur `renderer.js` et `/this\.get\('([^']+)'\)/g` sur
    `ui/shell.js` (l.678).
  - `tests/mac-ui.test.cjs`, test « the renderer talks to the bridge of the contract only, and writes no
    ceiling or retention of its own » (l.685) : `exposed` vient du texte de `app/preload.cjs` par
    `/^\s*([A-Za-z]+)\s*:/gm` (l.686-687) ; `used` vient du texte des modules (l.688).
  - `tests/mac-ipc-contract.test.cjs`, `loadBridge` (l.45-57) : charge le vrai preload devant un faux
    `electron` ; modèle de la technique.
- Mesures à `0d5a954`, par `node -e` appliquant les motifs ci-dessus : 33 imports nommés (14 dans
  `renderer.js`, 5 dans `ui/job-card.js`, 3 dans `ui/recap-view.js`, 2 dans `ui/shell.js`, 1 dans neuf
  autres fichiers, 0 dans `card-queue.mjs`, `icons.js`, `text.mjs`) ; 378 appels `$('…')` dans
  `renderer.js` pour 166 identifiants distincts ; 27 `this.get('…')` dans `ui/shell.js` ; 57 méthodes du
  pont utilisées ; le motif de la l.686 trouve 60 noms dans le preload, alors que le vrai preload expose
  57 méthodes sous `tvlens` et 3 sous `capture`.
- Mesure de l'audit, non rejouable hors ligne : après formatage, 378 passe à 0, 27 à 0, 33 à 0 et le
  test de la l.664 reste vert.
- Vérifié par `node -e` sous Node 24 : `await import()` réussit, sans DOM, pour `app/recording.js` et
  chacun des 14 scripts de `app/ui/`. `app/renderer.js` ne peut pas être importé (il lit le document dès
  son chargement).

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
  reste relevé dans le texte, tel que le premier ticket du lot l'a rendu indifférent à la mise en page :
  ce ticket n'y ajoute que le plancher. Le contrôle des scripts de la page (l.694-698) ne relève que
  `window.tvlens.…` : il reste valable avec les seules méthodes de `tvlens`.
- Plancher : chaque couple (fichier, motif) parcouru doit trouver au moins une occurrence, sinon le test
  échoue en nommant le fichier ; pour les imports, le plancher ne vaut que pour les fichiers qui
  importent.
- À ne pas toucher : le code de production ; `tests/mac-ipc-contract.test.cjs` (son relevé de canaux est
  traité par le ticket de la table des canaux) ; les gardes d'absence du second test. Aucun cas de test
  n'est retiré, aucun titre changé. `tests/helpers/mac-host.cjs` n'est pas créé ici : il relève du lot
  L05, qui reprendra l'aide locale.
- Les fautes injectées pour les preuves sont défaites avant la fin de la session
  (`git checkout -- <chemin>`) : aucun fichier de `app/` ne reste modifié par ce ticket.
- Aucune ligne de plus de 160 caractères n'est ajoutée au fichier.

## Critères d'acceptation

Chaque critère se vérifie par un test ou une commande.

1. `node --test tests/mac-ui.test.cjs` passe, et `grep -c "^test(" tests/mac-ui.test.cjs` rend un de
   plus qu'au début de la session (15 à `0d5a954`).
2. Le cas ajouté prouve, sur des textes écrits en dur : le relevé d'identifiants et celui des imports
   rendent le même résultat en apostrophes sur une ligne et en guillemets doubles sur plusieurs lignes ;
   un texte sans aucune occurrence fait échouer le garde avec le nom du fichier.
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

Aucune décision n'est attendue. Si l'import réel d'un module de `rendererFiles` échoue ou a un effet de
bord (minuterie, écriture) dans le processus de test, ou si le vrai preload n'expose pas 57 méthodes
sous `tvlens` : verdict BLOQUÉ, avec l'écart constaté.

## Journal
