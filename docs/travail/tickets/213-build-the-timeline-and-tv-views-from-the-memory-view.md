---
id: T213
titre: Build the timeline and TV state views from the memory consultation view
statut: termine
bloque_par: T207, T038
adr: non
installe: non
harnais: non
supprime_tests: non
niveau: sensible
---

## Ce que le ticket livre

La frise, le détail d'un moment et les vues TV partent de `MemoryView`. Pour une même mémoire et
une même horloge, les réponses `/v1` conservent leurs corps et leurs comportements, prouvés sur des témoins figés.

## Sources

- Cible : `docs/domaine.md`, sections 3 (Mémoire), 6, 8 et 9 ; ADR 0029/0030.
  T038 fournit le témoin de compatibilité avec le vrai client JavaScript de la TV.
- Code vérifié à `dd5efc9` : `core/session-timeline.cjs:10` agrège `history` et `segments` ;
  `core/session-timeline.cjs:16` décide du sujet, `core/session-timeline.cjs:24` interdit de grouper
  au-delà d'un trou de 1000 ms ; `core/session-timeline.cjs:72` sélectionne le détail d'un moment.
- `runtime/state-views.cjs:46` projette les passages légers ; `runtime/state-views.cjs:201`
  construit les vues, dont couverture et trous. Le panneau borne ses passages et ses trous à
  `runtime/state-views.cjs:242` et `runtime/state-views.cjs:246` ; les anciennes cartes sont
  condensées à `runtime/state-views.cjs:225`.
- Appelants lus : `runtime/headless-runtime.cjs`, `server/state-routes.cjs:18-21`, `server/question-routes.cjs:3`.
  Tests lus : session-timeline, topic-summary, state-views, server-state-views et timeline-server
  sous `tests/`, suffixe `.test.cjs`.
- État attendu : T207 a figé le contrat de lecture ; T038 rafraîchi a fixé le fil effectivement
  servi avec les codes de la vague 1. T188 déplace seulement le constructeur de refus hors de
  state-views ; relire son successeur, le contrat T038 et les codes T201 s'ils sont déjà livrés.

## Périmètre

- Modifier `core/session-timeline.cjs`, `runtime/state-views.cjs` ou leurs successeurs et les
  branchements qui leur donnent le snapshot. La traduction de `MemoryView` vers les noms du fil
  appartient à la projection ; elle ne pollue pas la vue publique avec les alias historiques.
- Le champ `session` de l'état complet (`runtime/headless-runtime.cjs:282`) garde sa source
  actuelle jusqu'à T219. Migrent ici : `timeline` et `captureGaps` de l'état complet (`:287`,
  `:289-292`), `deriveStateViews` (lu depuis `this.sessionState`, `:313`) et `momentDetail`
  (`:426`, `:438`).
- Couvrir `sessionTimeline` et `momentDetail`, les sélections par liste ou bornes, les résumés
  cumulatifs et leur repli en extraits. Les regroupements, statuts partiels, miniatures, bornes,
  disponibilités et refus de sélection restent exactement ceux de l'existant.
- Conserver les vues complètes et légères, les plafonds, la pagination et la condensation. Garder
  les clés et l'ordre de construction nécessaires à une sérialisation JSON identique à horloge
  et état identiques, ainsi que les statuts, codes, en-têtes et séquences d'appels du contrat T038.
- Adapter le cache de projections de l'hôte à l'entrée de consultation sans changer ici son
  mécanisme d'invalidation. Révision, ETag et 304 restent la responsabilité du serveur.
  Ce ticket ne contracte pas `onChange`, ce que fera T225 après tous les lecteurs.
- Ne pas déplacer les modules gelés, réécrire la continuité des sujets (T218), modifier les
  routes, la page TV ou l'archivage. Élaguer toute suppression ESLint rendue inutile.

## Critères d'acceptation

1. Les mêmes passages de test, donnés via la vue T207, produisent les mêmes cartes et détails :
   sujet continu, changement ou incertitude, trou, attente, erreur, analyse partielle, média
   manquant et miniature tardive. Les bornes et la contiguïté des sélections restent vérifiées.
2. Avant toute modification, figer dans `tests/fixtures/` les corps de `/v1/state`,
   `/v1/state?view=chat`, `/v1/state?view=panel` et `/v1/moments/detail` d'un scénario à horloges
   injectées. Après la migration, les mêmes requêtes donnent des corps égaux par
   `assert.deepStrictEqual`. La vue est un paramètre (`tv/app/remote-client.js:90`), pas un chemin.
   Aucun champ, valeur historique ou code n'est renommé ; plafonds, trous et cartes restent identiques.
3. Le vrai client TV demande une vue, la redemande sans changement et reçoit 304, puis voit
   l'enrichissement d'un passage après invalidation. Il conserve sa valeur sur 304. Les refus et
   le repli de compatibilité de T038 gardent leurs séquences ; aucun compteur de révision exact
   arbitraire n'est imposé à la place de cette preuve.
4. La frise, le détail, les vues `chat` et `panel`, ainsi que `timeline` et `captureGaps` de
   l'état complet, ne lisent plus le snapshot ni les listes privées. Seul le champ `session` de
   l'état complet le lit encore, jusqu'à T219. Elles n'importent pas la racine Mémoire.
5. À l'implémentation, exécuter les cinq suites citées et `tests/wire-contract.test.cjs` livré
   par T038 en séquentiel, puis `node scripts/check.mjs`. Les attentes du fil ne sont pas
   réécrites pour accepter une réponse différente ; aucun cas n'est supprimé.

## Test d'acceptation attendu

Les tests purs de frise et state-views consomment le vrai contrat T207. Les intégrations
`tests/server-state-views.test.cjs`, `tests/timeline-server.test.cjs` et le banc T038 vérifient
la traduction réelle jusqu'au client TV, avec horloges injectées et HTTP local. Comparer les
réponses produites, pas le texte des modules ; aucune TV ni instance distante n'est utilisée.

## Hypothèses bloquantes

Aucune décision n'est attendue.

Le contenu exact de T038 rafraîchi n'est pas encore livré au commit vérifié ; sa preuve devient
le témoin, sans reconduire les anciens repères ni les anciennes attentes de codes du ticket
non rafraîchi. Si T207 omet sujet, continuité ou provenance du résumé, compléter son contrat
explicitement avant la migration ; aucun accès interne de secours n'est permis. L'en-tête autorisé
(`runtime/state-views.cjs:17-35`) comporte aussi `asking`, `analyzing`, les files en attente,
`lastError` (`storageError || saveError || lastError`, `core/session.cjs:498`) et `retention`.
Ces champs sont lus par les accès publics livrés, jamais par `snapshot()`. `asking` n'entre pas
dans `MemoryView` (`docs/domaine.md:88`). S'il en manque un, compléter le contrat explicitement
avant la migration. Cette règle ne change pas l'exception du champ `session` complet ci-dessus.

## Journal

### Cadrage

- Lecture du ticket, des standards, des skills, des ADR et des lecteurs/appelants/tests concernés.
- Exploration et écarts prévus consignés dans `.harness-state/tickets/T213/` ; aucun critère retiré.
- Les témoins HTTP seront figés avant modification de production. Les fichiers non suivis présents à l'entrée restent intacts.

### Témoins et migration

- Quatre corps HTTP figés avant modification de production : `tests/fixtures/state-view-memory.json` et `state-view-responses.json`.
  Génération hors ligne via session réelle, HTTP local et horloges injectées ; sortie dans `freeze-wire.log` du dossier d'état.
- `node --test --test-name-pattern='frozen memory scenario' tests/server-state-views.test.cjs` : 1/1 vert avant migration.
- `node --test --test-name-pattern='explicit null metadata' tests/memory-view.test.cjs` : rouge sur l'assertion de distinction absent/null.
  Contrat complété explicitement ; `node --test tests/memory-view.test.cjs` : 13/13 verts.
- `node --test --test-name-pattern='consultation' tests/session-timeline.test.cjs` : 2 assertions rouges, puis 2/2 verts après migration.
- `node --test --test-name-pattern='panel projects frozen' tests/state-views.test.cjs` : rouge sur les cartes attendues ;
  `node --test tests/state-views.test.cjs` : 6/6 verts après migration.
- `node --test --test-name-pattern='timeline views and moment selection' tests/server-state-views.test.cjs` : rouge sur assertion,
  puis `node --test --test-name-pattern='frozen memory scenario|timeline views and moment selection' tests/server-state-views.test.cjs` : 2/2 verts.
- Frise, détails, panneau/chat et projections de l'état complet lisent la consultation. Le champ `session` complet garde son snapshot.
  Cache toujours invalidé par révision/identité ; consultation figée à la publication de la session pour conserver les compteurs temporels.
- `node --test --test-concurrency=1 tests/session-timeline.test.cjs tests/topic-summary.test.cjs tests/state-views.test.cjs tests/server-state-views.test.cjs tests/timeline-server.test.cjs tests/wire-contract.test.cjs` : 41/41 verts.
- `node scripts/check.mjs --changed` : 93 tests verts ; contrôle rouge sur deux lignes trop longues des bancs adaptés, ensuite découpées.
  Sorties rouges/vertes conservées dans le dossier d'état.

### Contrôle complet et correction de doublure

- `node scripts/check.mjs --changed` après découpage : vert, 93/93 tests JS.
- Premier `node scripts/check.mjs` : règles/format/lint/cliquet verts ; 2443/2444 tests JS verts,
  échec de `both host facades project the same library facts while preserving their titles and dates` ; 47/47 Python verts.
- `node --test tests/session-rows.test.cjs` reproduit l'échec : sa doublure adoptée ne fournit pas `memory.view`.
  Ajout du port réel de consultation à sa préparation, assertions de bibliothèque conservées.
- `node --test tests/session-rows.test.cjs` après correction : 5/5 verts.

### Livraison à la boucle

- Dernier `node scripts/check.mjs --changed` : vert, 98/98 tests JS (9 fichiers modifiés).
- Dernier `node scripts/check.mjs` : vert, règles/format/lint/gel/cliquet validés,
  2444/2444 tests JS (137 fichiers) et 47/47 tests Python réussis.
- `git diff --check` : aucune erreur d'espacement. Aucune suppression ESLint devenue inutile.
- Les quatre réponses figées sont égales par `assert.deepStrictEqual`, avec ordre JSON conservé.
  Le banc `wire-contract` conserve ses preuves du vrai client TV, des 304, de l'enrichissement et des refus/replis.
- Verdict `TERMINÉ` écrit dans `.harness-state/tickets/T213/verdict.json`. Aucun commit ni push ; relecture et intégration laissées à la boucle.

### Reprise après relecture 1

- Rapport, journal, écarts, état Git et diff relus ; les trois constats bloquant et mineurs sont acceptés.
- Exploration de correction dans `.harness-state/tickets/T213/exploration-correction-1.md`.
- Corrections prévues : garde sur la MemoryView effectivement passée, titre explicite identique aux témoins figés, import regroupé.
  Aucun changement de production ni réécriture des corps figés prévu.

### Corrections de la relecture 1

- Constat 1 : la vue passée à `deriveStateViews` est maintenant conservée et clonée avant l'appel,
  puis comparée après l'appel. L'ancienne assertion sur la source reste présente.
  `node --require ./.harness-state/tickets/T213/mutate-consultation.cjs --test --test-name-pattern='older timeline cards' tests/state-views.test.cjs` :
  rouge sur la nouvelle assertion après une mutation contrôlée de l'entrée via l'export public.
  `node --test tests/state-views.test.cjs` sans mutation : 6/6 verts. Aucun code de production modifié.
- Constat 2 : `TZ=UTC node --test --test-name-pattern='frozen memory scenario' tests/server-state-views.test.cjs` :
  rouge observé sur le titre (14:13 au lieu de 16:13). Le scénario pose désormais le titre explicite déjà figé
  via `store.saveManifest` avant publication et adoption ; aucun corps figé n'a été réécrit.
  Même commande sous `TZ=UTC`, puis `TZ=America/Los_Angeles` : 1/1 vert dans chaque fuseau.
- Constat 3 : import de `memory-consultation.cjs` regroupé dans une seule déstructuration.
  `node --test tests/review-regressions.test.cjs` : 19/19 verts.
- Sorties conservées sous `correction-1-*.log` dans le dossier d'état.

### Validation de la correction 1

- `TZ=UTC node --test --test-concurrency=1 tests/session-timeline.test.cjs tests/topic-summary.test.cjs tests/state-views.test.cjs tests/server-state-views.test.cjs tests/timeline-server.test.cjs tests/wire-contract.test.cjs` : 41/41 verts.
- `node scripts/check.mjs --changed` : vert, 98/98 tests JS ; règles, format, lint, gel et cliquet validés.
- `node scripts/check.mjs` : vert, 2444/2444 tests JS et 47/47 tests Python ; règles, format, lint, gel et cliquet validés.
- Les trois constats bloquant et mineurs sont corrigés. Les corps figés restent inchangés.
  La garde de non-mutation a été prouvée rouge avec mutation contrôlée, puis verte sur la production conservée.
- `git diff --check` : aucune erreur d'espacement. Nouveau verdict `TERMINÉ` écrit pour la boucle, sans commit ni push.

### Réserves à la clôture

- .harness-state/tickets/T213/relecture-2.md : 1. `asking` dans la vue de consultation — hors périmètre (réserve reconduite)
  - **Fichiers :** `core/memory/memory-view.cjs:78` et `runtime/state-views.cjs:200-212`.
  - **Ce qui ne va pas :** `MemoryView.session` expose encore `asking`, alors que `docs/domaine.md:88` l'exclut de `MemoryView`. Le fil n'en dépend pas, puisque `stateView` remplace la valeur par `watch.asking`.
  - **Pourquoi hors périmètre :** le champ existait avant ce ticket (T207), et la correction n'y touche pas.
  - **Attendu :** le retirer du contrat dans un ticket dédié.
- .harness-state/tickets/T213/relecture-2.md : **Écart accepté, la correction après relecture 1 (`ecarts.md`, dernière section) :** elle ne déclare aucun nouvel écart, et c'est exact. La correction rétablit la garde, fixe un titre identique au témoin et regroupe un import, sans changement de production ni des corps figés.
