---
id: T100
titre: Remove dead exports and move the temporal target out of the session module
statut: a-faire
bloque_par: T163
adr: non
installe: non
harnais: non
supprime_tests: non
niveau: standard
---

## Ce que le ticket livre

Plusieurs modules exportent des noms que personne n'importe. Une fonction et une constante n'ont même aucun
appelant. Et `core/moment-search.cjs`, un service de recherche, importe le module de session
`core/session.cjs`, rien que pour une fonction de lecture de la question. Le service de recherche dépend
ainsi du cas d'usage qui l'appelle.

Après ce ticket :

- le code sans appelant a disparu, et les exports sans lecteur sont retirés ;
- la résolution d'une cible temporelle vit dans son propre module, que la session et la recherche importent
  toutes deux. Un test de caractérisation fige ses réponses avant le déplacement ;
- un test d'architecture interdit à un module de `core/` d'importer `./session.cjs`.

Aucun comportement ne change.

## Sources

- Constats : OUBLI-09, CORE-05, ADP-11. Décision du propriétaire, le 15/10 : attente de T150,
  retrait de T028/T145 et critères d’absence limités au code, hors documents historiques.
- Code vérifié à la version `e92c6a6` :
  - Sans aucun appelant :
    - `core/deep-ask.cjs`, fonction `needsInspection` (lignes 2-4), exportée ligne 174 ;
    - `adapters/codex-confinement.cjs`, `const OPEN_ACTIONS` ligne 442, jamais lue. Le commentaire des
      lignes 434-441 décrit `openedPages`, qui suit : il reste.
  - Exports à retirer après migration des lecteurs indiqués :
    - `core/moment-search.cjs`, `cosine` (ligne 9), et `passageText` réexporté, dans l'export ligne 163 ;
    - `core/perception-context.cjs`, `observedTopic`, export ligne 68 ;
    - `core/surveillance.cjs`, `DEFAULT_LIMITS` (ligne 45) et `TEXT_LIMITS` (ligne 71), export ligne 920 ;
    - `core/transcription-language.cjs`, `TRANSCRIPTION_LANGUAGES`, export ligne 6 ;
    - `runtime/surveillance-runtime.cjs`, `SAVE_INTERVAL_MS`, dans l'export ligne 550 ;
    - `runtime/headless-runtime.cjs`, `VIEWS` : défini à `runtime/headless-runtime.cjs:33`, lu par
      `viewName` à `runtime/headless-runtime.cjs:407`, exporté à `runtime/headless-runtime.cjs:1112`.
      Aucun lecteur externe de cet export n’a été trouvé. `runtime/state-views.cjs` et son test n’existent
      pas encore à cette version : T147 prévoit leur création et un réexport de `VIEWS` par l’hôte.
  - `core/living-recap.cjs:1` importe `passageText` depuis `./moment-search.cjs`. Les autres modules le
    prennent dans `./passage-text.cjs`, où il est défini.
  - `core/session.cjs` :
    - fonction `resolveTemporalTarget` (lignes 512-522). Deux de ses lignes dépassent 160 caractères :
      l'objet `numbers` (183) et l'expression `relative = q.match(/(?:il y a|y a|depuis)…/)` (189) ;
    - appelée dans `WatchSession` (ligne 383) et dans `selectEvidence` (ligne 524) ;
    - export à `core/session.cjs:537` : `{ WatchSession, selectEvidence, resolveTemporalTarget, restorable, recoveredPassage }`.
  - `core/moment-search.cjs:3` importe `resolveTemporalTarget` de `./session.cjs`. C'est le seul module de
    `core/` qui importe `./session.cjs`.
  - Hors de `core/`, `resolveTemporalTarget` n'est lue par aucun script ni test. Les tests ne la couvrent que
    par `selectEvidence` (`tests/session.test.cjs`, questions « Il y a une minute ») et par la recherche.
  - `scripts/probe-live.cjs:7` importe `WatchSession` ; `scripts/evaluate-actions.cjs:4` importe
    `MomentSearch`. Aucun n’importe directement `resolveTemporalTarget` ; ces imports restent inchangés.
  - `tests/architecture.test.cjs`, premier test : règle des imports de `core/` (relatifs, sans `..`). C'est
    le seul fichier des règles de couches.
  - Gardé volontairement, parce qu'il a un lecteur hors de son fichier : `HeadlessRuntime.listeners`, lu par
    `scripts/replay-lg-stream.cjs:121`.
- L’inventaire des symboles dans `core/`, `adapters/`, `runtime/`, `app/`, `server/`, `mcp/`, `tv/`,
  `scripts/` et `tests/` confirme les lecteurs décrits ci-dessus. Les rapports, tickets et ADR sont des
  sources historiques, pas des appelants : ils contiennent légitimement ces noms.
- Tests lus qui protègent les zones touchées : `tests/session.test.cjs:70` (cible relative via
  `selectEvidence`), `tests/moment-index.test.cjs`, `tests/living-recap.test.cjs`,
  `tests/perception-context.test.cjs`, `tests/surveillance.test.cjs`, `tests/surveillance-runtime.test.cjs`,
  `tests/transcription-language.test.cjs`, `tests/server-state-views.test.cjs`,
  `tests/timeline-server.test.cjs` et `tests/remote-server.test.cjs`.
- `scripts/check.mjs` refuse un fichier dont le nombre de lignes de plus de 160 caractères augmente. Un
  fichier nouveau part de zéro.

## Périmètre

À créer, dans cet ordre :

1. `tests/temporal-target.test.cjs`, un test de caractérisation de `resolveTemporalTarget`, écrit et vert
   avant tout déplacement, en important la fonction depuis `core/session.cjs`. Une table de questions, avec
   une ancre et des segments fixes, couvre :
   - un délai en chiffres, entier et décimal à virgule (« il y a 30 secondes », « y a 1,5 min ») ;
   - un délai en lettres, minutes et secondes (« il y a deux minutes », « depuis une seconde ») ;
   - majuscules et accents (« Il y a UNE minute », « au tout début ») ;
   - un temps absolu (« vers 12:34 », « au moment 1:05 ») ;
   - une question qui porte à la fois un délai et un temps absolu ;
   - « premier passage » avec des segments, puis sans segment ;
   - une question sans repère temporel.
   Les valeurs attendues sont celles que rend la fonction d'origine, relevées par `node -e` avant le
   déplacement. La commande et sa sortie figurent au journal.
2. `core/temporal-target.cjs`, qui exporte `resolveTemporalTarget`. Le corps est déplacé tel quel, sauf les
   deux lignes de plus de 160 caractères, coupées pour le fichier nouveau.

À modifier :

- `tests/temporal-target.test.cjs` : seule sa ligne d'import passe à `core/temporal-target.cjs`.
- `core/session.cjs` : retirer la fonction et l'importer depuis `./temporal-target.cjs` ; ne plus
  l'exporter.
- `core/moment-search.cjs` : importer depuis `./temporal-target.cjs` ; exporter `{ MomentSearch }` seul.
- `core/living-recap.cjs:1` : importer `passageText` depuis `./passage-text.cjs`.
- `core/deep-ask.cjs` : supprimer `needsInspection` et la retirer de l'export.
- `adapters/codex-confinement.cjs` : supprimer la ligne `const OPEN_ACTIONS`.
- Retirer des exports : `observedTopic`, `DEFAULT_LIMITS`, `TEXT_LIMITS`, `TRANSCRIPTION_LANGUAGES`,
  `SAVE_INTERVAL_MS`, et le réexport inutilisé `VIEWS` de `runtime/headless-runtime.cjs`. Les définitions
  utilisées restent. Si T147 est intégré avant ce ticket, inventorier `runtime/state-views.cjs` et son
  test : conserver tout export `VIEWS` que l’hôte importe réellement depuis ce module, et retirer
  seulement le réexport de l’hôte resté sans lecteur. Aucun déplacement des vues dans ce ticket.
- `tests/architecture.test.cjs` : un test qui échoue si un module de `core/` autre que `session.cjs`
  importe `./session.cjs`.

À ne pas toucher :

- `cleanupRawMedia` et son commentaire (`adapters/local-store.cjs`) : hors de cet inventaire d’exports.
- `validateDetection` et `validateRecap` : fonctions actives hors de cet inventaire de code mort.
- `HeadlessRuntime.listeners`.

## Critères d'acceptation

Chaque critère se vérifie par un test ou une commande.

1. `git grep -nwE 'needsInspection|OPEN_ACTIONS' -- core adapters runtime app server mcp tv scripts tests`
   ne rend rien. Les documents historiques (`docs/audit-maintenabilite.md`, tickets et ADR compris)
   ne sont pas soumis aux critères d’absence.
2. `git grep -n "resolveTemporalTarget" -- core` ne rend que des lignes de `core/temporal-target.cjs`, de
   `core/session.cjs` et de `core/moment-search.cjs`. `git grep -n "session.cjs" -- core` ne rend rien.
3. Pour chacun de `cosine`, `observedTopic`, `DEFAULT_LIMITS`, `TEXT_LIMITS`, `TRANSCRIPTION_LANGUAGES`,
   `SAVE_INTERVAL_MS`, l’inventaire sur les dossiers de code du critère 1 ne rend que des usages internes
   dans leur fichier de définition. Aucun de ces noms n’est exporté. `passageText` n’est plus exporté
   par `moment-search.cjs` ; son lecteur `living-recap.cjs` l’importe de `passage-text.cjs`. `VIEWS` n’est
   plus exporté par `headless-runtime.cjs` ; son éventuel export depuis `state-views.cjs` ne reste que
   s’il a un lecteur réel. Le journal donne l’inventaire final et le module propriétaire de `VIEWS`.
4. `node --test tests/temporal-target.test.cjs` passe avant le déplacement (import depuis
   `core/session.cjs`) et après (import depuis `core/temporal-target.cjs`). Entre les deux, seule la ligne
   d'import du test change. Les deux sorties figurent au journal.
5. `node --test tests/architecture.test.cjs` passe. Le nouveau test échoue si l'on remet
   `require("./session.cjs")` dans `core/moment-search.cjs` ; l'agent le constate une fois et note la sortie
   au journal.
6. Les tests protecteurs listés dans les sources passent, lancés un fichier à la fois avec `node --test`,
   sans changement de leurs assertions. Si T147 a créé `tests/state-views.test.cjs`, il est aussi exécuté
   sans modification. Le journal en donne la liste et le résultat.
7. `awk 'length > 160' core/temporal-target.cjs` ne rend rien.
8. `node scripts/check.mjs` est vert. La mesure `lignes_longues_prod` baisse au moins du nombre de lignes de plus de
   160 caractères que la fonction comptait dans `core/session.cjs` ; le retrait de `needsInspection`
   (`core/deep-ask.cjs:3`) peut en retirer d'autres, comptées à part au journal. L'agent relève ce nombre au début de la
   session (le format a pu le changer) et le note au journal.

## Test d'acceptation attendu

`tests/temporal-target.test.cjs`, nouveau. Frontière : la fonction pure `resolveTemporalTarget`, avec une
question, des segments et une ancre fixes. Il fige ses réponses avant le déplacement, et la coupe des deux
lignes trop longues ne peut pas les changer sans qu'il échoue. S'y ajoute le nouveau test de
`tests/architecture.test.cjs`, sur le texte source des modules de `core/`.

## Hypothèses bloquantes

Aucune décision n'est attendue.

T150 est le seul bloqueur de file. T147 n’est pas un prérequis nécessaire au retrait de l’export de
l’hôte : la fiche traite explicitement les deux placements possibles de sa définition. Son état sera
relevé au début de l’implémentation ; l’extraction des vues ne doit pas être faite ici.

Si un `git grep` trouve un lecteur d'un des noms à retirer qui n'existait
pas à la version citée, ce nom reste exporté et le journal dit pourquoi. Si un test existant dépend d'un de
ces exports, verdict BLOQUÉ : le test n'est pas modifié dans ce ticket. Si la coupe de l'expression
`relative` ne peut pas garder exactement les réponses de la table, l'expression d'origine est gardée telle
quelle, découpée par concaténation de chaînes dans un `new RegExp`, et le journal le dit.

## Journal

Rafraîchi le 15/10 contre `e92c6a6` : T150 remplace T028/T145, repères de `VIEWS` actualisés,
absence actuelle de `state-views` établie et cas d’un T147 intégré pris en compte. Les critères excluent
les documents historiques et vérifient aussi le changement d’import de `passageText`. Aucun test exécuté.

- Relecture documentaire le 15/10 contre `e92c6a6` : sources rendues pérennes dans
  `docs/audit-points-chauds.md` ou attribuées à la décision du propriétaire, le 15/10.
