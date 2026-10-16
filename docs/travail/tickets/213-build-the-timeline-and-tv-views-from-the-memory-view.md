---
id: T213
titre: Build the timeline and TV state views from the memory consultation view
statut: a-faire
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
