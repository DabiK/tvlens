---
id: T030
titre: Guard the boundaries the layer table leaves open in the architecture test
statut: a-faire
bloque_par: T016, T017, T018, T019, T020, T021, T022, T024, T025
adr: non
installe: non
harnais: non
supprime_tests: non
---

## Ce que le ticket livre

Après le lot L02, le test d'architecture garde, avec une table, les dépendances entre les six
couches. Plusieurs frontières restent pourtant ouvertes :
- un sous-dossier du cœur ne peut pas importer `../` vers le cœur lui-même, ce qui bloque tout
  découpage de `core/` en sous-dossiers ;
- n'importe quel fichier de production peut importer Electron ou une dépendance de développement ;
- `app/ui/` et `tv/app/` ne tiennent leur autonomie que par discipline ;
- un fichier de production peut importer les adaptateurs hérités.

Après ce ticket, `tests/architecture.test.cjs` ferme ces frontières. Chaque règle a son cas rouge,
prouvé sur un texte ou une arborescence temporaire écrits par le test. Les règles restent dans ce test
et non dans ESLint.

## Sources

- Constats : OPS-04, OUBLI-19, OUBLI-06
- Hors de ce ticket : la partie d'un signalement qui demande d'interdire `setTimeout`, `Date.now` et
  `AbortSignal.timeout` dans le cœur (13 occurrences dans 8 fichiers, par
  `grep -rnE "setTimeout|Date\.now|AbortSignal\.timeout|setInterval" core | wc -l`). Ces appels sont
  en usage aujourd'hui ; leur retrait relève des lots du cœur, pas d'une règle de couches.
- Code concerné, à la version `0d5a954` (le lot L02 y ajoute une table des couches
  permises et une lecture récursive ; les lignes ci-dessous sont celles d'avant ce lot) :
  - `tests/architecture.test.cjs`, test « portable core has no Electron, provider, platform or adapter
    imports » (ligne 5) : un import du cœur doit commencer par `./` et ne contenir aucun `..`
    (ligne 10). Un fichier de `core/sous-dossier/` ne peut donc pas importer `../ports.cjs`, alors que
    la cible reste dans le cœur.
  - `tests/architecture.test.cjs`, test « shared runtime and headless transport do not import
    Electron » (lignes 15 à 17) : seuls `runtime/` et `server/` sont gardés contre Electron.
  - `tests/architecture.test.cjs`, test « active Codex roles do not depend on the legacy MCP
    transport » (ligne 20) : il ne nomme que six fichiers d'`adapters/`, avec l'assertion positive de
    la ligne 28, qui reste.
  - `package.json` : `dependencies` contient `@modelcontextprotocol/sdk`, `sharp` et `zod` ; `electron`
    est en `devDependencies`.
  - `CONTRIBUTING.md`, section « Frontières à conserver » (lignes 5 à 11) : ne dit ni que `app/ui/` et
    `tv/app/` sont autonomes, ni quel test garde les frontières.
- Mesures au découpage, par `grep -rnE` sur `core adapters runtime server mcp app tv/app` :
  - imports par nom de paquet hors `node:` : `sharp` (4 fichiers d'`adapters/`), `zod`
    (`mcp/tool-definitions.cjs:1`), `@modelcontextprotocol/sdk/server/mcp.js` et `…/stdio.js`
    (`mcp/server.cjs:1` et `:4`), `electron` (`app/main.cjs:12`, `app/preload.cjs:1`). Tous les
    modules intégrés sont préfixés `node:`.
  - `app/ui/*.mjs` et `app/ui/*.js` n'importent que des chemins `./`.
  - `tv/app/*.js` n'a ni `require(`, ni `import`, ni `export`. Cinq fichiers exportent pour les tests
    par `module.exports` sous condition (par exemple `tv/app/remote-client.js:170-171`).
  - aucun fichier de production n'importe `openrouter.cjs` ni `codex-video-agent.cjs` ; seuls quatre
    scripts importent `openrouter.cjs` (`scripts/probe-live*`, `evaluate-actions`,
    `compare-inspection-strategies`, `diagnose-inspect`).
  - `adapters/codex-verifier.cjs:18` nomme `codex-video-agent.cjs` dans un commentaire : la règle 6
    s'applique au texte dont les commentaires sont retirés, sans quoi elle signalerait ce fichier.
- Le relecteur de l'audit : une règle mal ciblée ne signale rien et donne une fausse garantie ; il faut
  un cas rouge par frontière. L'arbitrage A3 place les règles de couches dans ce test seulement.

## Périmètre

- À modifier : `tests/architecture.test.cjs`, en réutilisant le relevé d'imports, la table et la
  lecture récursive posés par le lot L02. Si leur forme diffère de celle décrite, le journal le dit et
  les règles s'écrivent sur la forme trouvée. Règles ajoutées ou assouplies :
  1. Cœur : un import relatif est permis s'il se résout dans `core/`, `../` compris depuis un
     sous-dossier. Un import qui sort de `core/` reste refusé, comme tout import par nom de paquet,
     `node:` compris. Les globales interdites (ligne 12) ne changent pas.
  2. Electron : `require("electron")` n'est permis que dans `app/main.cjs` et `app/preload.cjs`, dans
     toute la production (`core`, `adapters`, `runtime`, `server`, `mcp`, `app`).
  3. Paquets : en production, un import par nom de paquet est soit un module `node:`, soit un paquet de
     `dependencies` de `package.json`, lu par le test. Le nom du paquet est le premier segment du
     chemin, ou les deux premiers pour un nom en `@portée/`. Electron, seule exception, suit la règle 2.
  4. `app/ui/` : un import relatif se résout dans `app/ui/` ; aucun import par nom de paquet.
  5. `tv/app/` : aucun `require(`, aucune déclaration `import` ni `export`, aucun `import(` dynamique.
     L'export conditionnel par `module.exports` reste permis.
  6. Adaptateurs hérités : aucun fichier de production n'importe `openrouter.cjs` ni
     `codex-video-agent.cjs`. Les scripts et les tests ne sont pas concernés.
  7. Seuls les fichiers `.cjs`, `.mjs` et `.js` sont lus comme du code : un `README.md` dans une couche
     n'est pas analysé (si le lot L02 le fait déjà, le cas rouge du critère 2 suffit).
- `CONTRIBUTING.md`, section « Frontières à conserver » : ajouter que `app/ui/` et `tv/app/` n'importent
  rien hors de leur dossier, qu'Electron n'est importé que par `app/main.cjs` et `app/preload.cjs`, et
  que `tests/architecture.test.cjs` garde ces frontières.
- À ne pas toucher : le code de production, `docs/standards.md` (protégé ; sa ligne 23 nomme déjà ce
  test comme vérification), les scripts, `eslint.config.mjs` s'il existe.
- Aucun test n'est retiré, aucune assertion existante n'est affaiblie, l'assertion positive de la
  ligne 28 reste. Aucun fichier de test n'est créé. Aucune ligne de plus de 160 caractères.
- Les fautes injectées dans la production pour le critère 3 sont défaites avant la fin de la session
  (`git checkout -- <fichier>`). Les arborescences temporaires sont créées et supprimées par le test.

## Critères d'acceptation

Chaque critère se vérifie par un test ou une commande, avec sa sortie dans le journal.

1. `node --test tests/architecture.test.cjs` passe sur le dépôt. Pour chaque règle de 2 à 6, le test
   échoue s'il ne lit aucun fichier dans le dossier qu'elle garde (`app/ui/` et `tv/app/` compris).
2. Un test applique les règles à des textes ou à une arborescence temporaire écrits par lui, et prouve
   un cas rouge et un cas vert par règle :
   - `core/sous/x.cjs` qui importe `../ports.cjs` est accepté ; `../../adapters/y.cjs` est refusé ;
   - `require("electron")` est refusé dans `adapters/x.cjs` et accepté dans `app/preload.cjs` ;
   - `require("playwright-core")` est refusé ; `require("@modelcontextprotocol/sdk/server/mcp.js")` et
     `require("node:fs")` sont acceptés ; `require("fs")` sans préfixe est refusé ;
   - dans `app/ui/`, `import x from "../renderer.js"` est refusé, `"./text.mjs"` accepté ;
   - dans `tv/app/`, `require("./a.js")`, `import a from "./a.js"`, `export const a = 1` et
     `import("./a.js")` sont refusés ; `if (typeof module !== "undefined") module.exports = {}` est
     accepté ;
   - `require("./openrouter.cjs")` dans `adapters/` est refusé ;
   - un `README.md` qui contient `require("electron")` dans une couche n'est pas lu.
3. Fautes injectées dans le dépôt, consignées au journal puis défaites : `require("electron")` ajouté à
   `adapters/config.cjs`, `require("playwright-core")` ajouté à `runtime/session-closing.cjs`,
   `import "../renderer.js"` ajouté à `app/ui/text.mjs`, et `require("./openrouter.cjs")` ajouté à
   `adapters/codex-recap.cjs` font chacun échouer `node --test tests/architecture.test.cjs` avec un
   message qui nomme le fichier.
4. `grep -c "^\s*test(" tests/architecture.test.cjs` ne baisse pas par rapport à sa valeur au début de
   la session, consignée au journal.
5. `grep -c "architecture.test.cjs" CONTRIBUTING.md` affiche au moins `1`.
6. `node scripts/check.mjs` est vert.

## Test d'acceptation attendu

Dans `tests/architecture.test.cjs`. Frontière : les fichiers sources de la production, lus
récursivement, `package.json` pour la liste des dépendances, et des textes et arborescences temporaires
écrits par le test pour prouver que chaque règle voit ce qu'elle doit refuser.

## Hypothèses bloquantes

Aucune décision n'est attendue. Si un import existant enfreint l'une des règles (le découpage n'en a
trouvé aucun), ou si une règle exige de modifier le code de production : verdict BLOQUÉ, avec l'écart
constaté, sans élargir la règle.

## Journal
