---
id: T025
titre: State the layer rules as one table in the architecture test
statut: a-faire
bloque_par: T023, T145
adr: non
installe: non
harnais: non
supprime_tests: non
---

## Ce que le ticket livre

Deux règles de dépendance seulement sont gardées aujourd'hui : le cœur n'importe rien hors de lui, et
`runtime/` et `server/` n'importent pas Electron. Rien n'empêche un adaptateur d'importer `runtime/`, et
le test qui garde ces deux règles casse sur `EISDIR` au premier sous-dossier créé. Après ce ticket,
`tests/architecture.test.cjs` lit les six couches récursivement, porte une table des dépendances
permises entre couches et prouve sur un exemple qu'il voit une arête interdite. Deux tests de
comportement n'ont plus à lire le texte du cœur pour une règle d'import.

## Sources

- Constats : TSTA-08, TSTB-19
- Code concerné, à la version `0d5a954` :
  - `tests/architecture.test.cjs` (30 lignes, 3 tests) : test « portable core has no Electron, provider,
    platform or adapter imports » (l.5) — `fs.readdirSync(root)` sans récursion (l.7), retrait des
    commentaires (l.8), relevé des imports (l.9), import permis seulement s'il commence par `./` et ne
    contient pas `..` (l.10), globales interdites (l.12) ; test « shared runtime and headless transport
    do not import Electron » (l.15) — lecture sans récursion (l.16), motif `require\(['"]electron['"]\)`
    (l.17) ; test « active Codex roles do not depend on the legacy MCP transport » (l.20).
  - `docs/standards.md`, tableau « Architecture » (l.22-23) : `tests/architecture.test.cjs` est le
    vérificateur nommé de ces deux règles.
  - `tests/chat-trace.test.cjs`, test « deep-ask keeps a redacted diagnostic on the failed job, never
    imports adapters, and traces cannot break it » (l.54) : `!…includes('adapters/')` sur le texte de
    `core/deep-ask.cjs` (l.55), seule lecture de fichier du test.
  - `tests/surveillance.test.cjs`, test « words first: a partial passage is read without waiting for
    vision, which then gets one second reading at most » (l.583) : `assert.equal(h.chatReads, 0)`
    (l.623), puis `doesNotMatch(core/surveillance.cjs, /\basking\b|manualBusy|prioritizeManual|deep-ask/)`
    (l.624).
- Mesures à `0d5a954`, par un `node -e` qui parcourt récursivement `core`, `adapters`, `runtime`,
  `server`, `mcp`, `app` (fichiers `.cjs`, `.mjs`, `.js`), retire les commentaires et applique le motif
  de la l.9 : 91 fichiers, 241 imports. Arêtes entre couches : `adapters` vers `core` 8 ; `runtime` vers
  `core` 11 et `adapters` 19 ; `server` vers `adapters` 9 et `runtime` 1 ; `mcp` vers `core` 2 ; `app`
  vers `adapters` 15, `core` 5 et `runtime` 4. Aucune autre arête, aucun import relatif hors des six
  couches, aucun import externe dans `core`. `require('electron')` : `app/main.cjs` et
  `app/preload.cjs` seulement. `core/surveillance.cjs` et `core/deep-ask.cjs` n'ont aucun `require(`.
  Aucun sous-dossier dans `core`, `adapters`, `runtime`, `server`, `mcp` ; deux dans `app` (`assets`,
  `ui`).
- Le relecteur de l'audit : garder des fichiers à plat et le nom `tests/architecture.test.cjs` ; pour la
  l.624 de `tests/surveillance.test.cjs`, la partie comportement existe déjà l.623 et le motif peut
  partir, hors la règle d'import. Risque nommé : une table écrite d'après les arêtes constatées peut
  manquer une arête ; ajouter exprès une arête interdite et voir le test échouer le détecte.

## Périmètre

- À modifier : `tests/architecture.test.cjs`, seul fichier qui porte les règles de couches :
  - une lecture récursive des couches, à partir d'une racine passée en paramètre (le dépôt par
    défaut), commentaires retirés une fois par la fonction commune de `tests/helpers/source-shape.cjs`,
    et un relevé des imports (`require(`, `from`, `import(`) qui rend pour chacun la couche du fichier
    et la couche visée ;
  - une table `ALLOWED = { core: [], adapters: ['core'], runtime: ['core', 'adapters'],
    server: ['core', 'adapters', 'runtime'], mcp: ['core'], app: ['core', 'adapters', 'runtime'] }` :
    tout import relatif qui sort de la couche de son fichier doit viser une couche permise ; un import
    relatif qui sort des six couches est refusé ;
  - les deux tests existants sur le cœur et sur Electron gardent leurs exigences et lisent
    récursivement ; le test sur l'ancien transport MCP ne change pas ;
  - deux règles reprises des tests de comportement : `core/deep-ask.cjs` n'importe rien hors de `core/`
    (déjà vrai par la règle du cœur, nommé dans le message) et `core/surveillance.cjs` n'importe pas
    `deep-ask`.
- À modifier : `tests/chat-trace.test.cjs` — la lecture de texte de la l.55 est retirée, la règle étant
  portée par le test d'architecture ; `tests/surveillance.test.cjs` — la l.624 est retirée, la l.623
  reste, le commentaire de la l.622 est accordé à ce qui reste prouvé. Les `require` devenus inutiles
  partent avec. Aucun cas de test n'est retiré.
- Restent tels quels, chacun pour sa raison : `tests/server-sessions.test.cjs` l.635-637 (l'absence de nettoyage au démarrage du serveur ne se
  prouve pas tant que son `main()` n'est pas démarrable en test) ; `tests/deploy-unit.test.cjs` l.11
  (le fichier lu est la chose testée). `tests/question-ceiling.test.cjs` l.206-209 n'est pas repris
  ici : son remplacement par une preuve de comportement au plafond n'est pas une règle de couches.
- À ne pas toucher : le code de production, `docs/standards.md`, `scripts/`,
  `tests/codex-confinement.test.cjs`, `tests/architecture-f07.test.cjs`.
- Les arêtes injectées pour la preuve du critère 3 sont défaites avant la fin de la session
  (`git checkout -- core/ adapters/`) : aucun fichier de production ne reste modifié par ce ticket.
  Le cas du sous-dossier se prouve sur une arborescence temporaire créée et supprimée par le test,
  jamais par un dossier créé dans une couche du dépôt.
- Aucun fichier de test créé ; aucun fichier modifié ne gagne de ligne de plus de 160 caractères.

## Critères d'acceptation

Chaque critère se vérifie par un test ou une commande.

1. `node --test tests/architecture.test.cjs` passe, 5 tests au moins. Le test de la table échoue s'il
   ne lit aucun fichier dans l'une des six couches, ou s'il ne relève aucun import sortant dans l'une de
   `adapters`, `runtime`, `server`, `mcp`, `app`.
2. Un test applique le relevé et la table à des textes écrits dans le test et prouve : un
   `require("../runtime/x.cjs")` depuis `adapters/` est refusé ; un `import … from` écrit sur deux
   lignes, un `import(` dynamique et un `require` entre guillemets doubles sont relevés ; un import en
   commentaire ne l'est pas ; un import de `../../core/x.cjs` depuis `adapters/sous-dossier/` est
   rattaché à la couche `core`. Le même test lit une arborescence temporaire où une couche contient un
   sous-dossier : le fichier du sous-dossier est lu, sans erreur `EISDIR`.
3. Fautes injectées, consignées au journal puis défaites : un `require('../runtime/session-closing.cjs')`
   ajouté à un fichier de `adapters/` fait échouer le test de la table ; un
   `require('../adapters/config.cjs')` ajouté à `core/deep-ask.cjs` fait échouer le test du cœur ; un
   `require('./deep-ask.cjs')` ajouté à `core/surveillance.cjs` fait échouer la règle reprise de
   `tests/surveillance.test.cjs`.
4. `node --test tests/chat-trace.test.cjs tests/surveillance.test.cjs` passe ;
   `grep -c "readFileSync" tests/chat-trace.test.cjs` rend 0 ;
   `grep -c "manualBusy" tests/surveillance.test.cjs` rend 0.
5. `grep -c "^\s*test(" ` ne baisse dans aucun des fichiers de test modifiés (à `0d5a954` :
   architecture 3, chat-trace 7, surveillance 17).
6. `node scripts/check.mjs` est vert.

## Test d'acceptation attendu

Dans `tests/architecture.test.cjs`. Frontière : les fichiers sources des six couches, lus récursivement,
et des textes et une arborescence temporaire écrits par le test pour prouver que le garde voit ce qu'il
doit refuser.

## Hypothèses bloquantes

Aucune décision n'est attendue. La table reprend celle que propose l'audit ; elle permet `server` vers
`core`, que le code n'utilise pas aujourd'hui, et `app` vers `core`, qu'il utilise cinq fois. Si une
arête existante sort de la table, ou si un `require` au chemin construit à l'exécution échappe au
relevé : verdict BLOQUÉ, avec l'écart constaté, sans élargir la table.

## Journal
