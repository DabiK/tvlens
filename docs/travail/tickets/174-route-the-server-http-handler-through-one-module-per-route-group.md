---
id: T174
titre: Route the server HTTP handler through one module per route group
statut: a-faire
bloque_par: T163
adr: oui
installe: non
harnais: non
supprime_tests: non
niveau: sensible
---

## Ce que le ticket livre

Le serveur HTTP possède une table de routes et un module par groupe : sessions, ingestion, questions,
surveillance et état. `RemoteServer.handle` conserve les contrôles communs, la lecture de la requête,
le routage et la traduction des erreurs. Chaque groupe se teste par son interface et les clients
continuent de recevoir les mêmes réponses, dans le même ordre de validation.

## Sources

- `docs/audit-points-chauds.md`, section A « Carte des points chauds », gestionnaire HTTP.
  Décision du propriétaire, le 15/10 : ouverture sélective après T150 et périmètre de cette file.
- Code à `e92c6a6` : `server/http.cjs:26` ouvre `handle`, jusqu'à la ligne 291, soit 266 lignes
  physiques. CORS et OPTIONS, `server/http.cjs:27` ; authentification,
  `server/http.cjs:52` ; méthodes permises, `server/http.cjs:60` ; ETag et 304,
  `server/http.cjs:73` ; GET, `server/http.cjs:81` ; corps POST borné,
  `server/http.cjs:154` ; routes POST, `server/http.cjs:181` ; ingestion,
  `server/http.cjs:220` ; erreurs communes, `server/http.cjs:275`.
- État de transport par instance : registre des doublons, séquence, capture et créneau,
  `server/http.cjs:10` ; nettoyage du créneau et remise de l'opération au runtime dans le même
  `finally`, `server/http.cjs:268`. Création par l'hôte, `server/main.cjs:40`.
- Tests : `tests/remote-server.test.cjs`, `tests/server-ingest-path.test.cjs`,
  `tests/server-sessions.test.cjs`, `tests/server-state-views.test.cjs`,
  `tests/server-surveillance.test.cjs`, `tests/timeline-server.test.cjs`,
  `tests/architecture-f06.test.cjs`, `tests/architecture-f07.test.cjs`.
- Contrats de possession des blocs et de fermeture : ADR 0006 et 0007 dans `docs/adr/`.

## Périmètre

- Créer à plat dans `server/` les modules `session-routes.cjs`, `ingest-routes.cjs`,
  `question-routes.cjs`, `surveillance-routes.cjs`, `state-routes.cjs` et une table dans
  `routes.cjs`. La forme des entrées doit rendre explicites méthode, chemin ou motif, et gestionnaire.
  Les paramètres des routes dynamiques ne sont pas décodés davantage qu'aujourd'hui.
- Affecter chaque route au groupe fixé par la table ci-dessous, relevée dans
  `server/http.cjs:82-220` à `e92c6a6`. Les miniatures et médias gardent leur réponse binaire ou Range.
  Chaque route a exactement un propriétaire ; les paramètres et leurs motifs restent inchangés.
- Conserver les politiques communes dans `server/http.cjs` : OPTIONS avant authentification,
  authentification avant méthode/routage, CORS, JSON et limites, envoi JSON et erreurs.
  Une table connue à l'avance ne doit pas faire répondre 404 avant les refus de corps actuels.
- Le registre de déduplication et le créneau restent uniques et propres à un `RemoteServer` : si le
  module ingestion les possède, les champs encore consultés par les tests sont des délégations vers
  cette instance, sans copie d'état. Aucun déplacement de l'admission métier hors du runtime.
- Ajouter `tests/server-routes.test.cjs` et un ADR court décrivant table, groupes et ordre des contrôles.
  Garder l'export et les méthodes publiques de `RemoteServer`.
- Ne changer ni les routes, ni les corps, statuts, codes ou en-têtes, ni les délais, ni le runtime,
  ni les assertions des tests HTTP existants ; aucune nouvelle dépendance.

| Méthode | Route | Groupe propriétaire |
| --- | --- | --- |
| GET | `/v1/session` | état |
| GET | `/v1/state` | état |
| GET | `/v1/surveillance/overlay` | surveillance |
| GET | `/v1/surveillance` | surveillance |
| GET | `/v1/sessions` | sessions |
| GET | `/v1/storage` | sessions |
| GET | `/v1/thumbnail/:sessionId/:momentId` | sessions |
| GET | `/v1/media/:sessionId/:momentId` | sessions |
| GET | `/v1/media/:momentId` | sessions |
| POST | `/v1/settings/transcription` | état |
| POST | `/v1/session/start` | sessions |
| POST | `/v1/session/pause` | sessions |
| POST | `/v1/session/end` | sessions |
| POST | `/v1/sessions/close` | sessions |
| POST | `/v1/sessions/:id/open` | sessions |
| POST | `/v1/sessions/:id/resume` | sessions |
| POST | `/v1/sessions/:id/delete` | sessions |
| POST | `/v1/moments/detail` | questions |
| POST | `/v1/questions` | questions |
| POST | `/v1/questions/:id/cancel` | questions |
| POST | `/v1/surveillance/start` | surveillance |
| POST | `/v1/surveillance/stop` | surveillance |
| POST | `/v1/surveillance/retry` | surveillance |
| POST | `/v1/surveillance/history` | surveillance |
| POST | `/v1/surveillance/detail` | surveillance |
| POST | `/v1/segments` | ingestion |

Pour miniatures et médias, `sessionId` garde `[a-zA-Z0-9-]+` et `momentId` garde `moment-\d+`.
Les actions de bibliothèque gardent `[^/]+` pour `id`, l'annulation garde `deep-\d+`.
OPTIONS, authentification, refus de méthode/corps et 404 restent communs dans `server/http.cjs`.

## Critères d'acceptation

1. Un test par groupe appelle son interface avec un runtime enregistré : une route connue appelle la
   bonne méthode avec les mêmes arguments ; une route inconnue n'appelle rien et laisse le répartiteur
   rendre `404` et `{ error: "Route inconnue." }`. Vérifier aussi ces routes inconnues par HTTP, avec
   GET et POST JSON objet valides. Les cinq groupes sont effectivement atteints, sans test vacuement vert.
2. Les refus communs restent ordonnés : OPTIONS sans jeton répond 204, mauvais jeton 401, méthode
   interdite 405 avec `Allow`, POST non JSON 415, annonce ou flux dépassant sa limite 413, JSON invalide
   ou non objet 400, puis route inconnue 404. Tester les limites 13 000 000 et 12 000 octets sans
   demander un fournisseur ni assembler un bloc refusé.
3. Les ETag restent distincts par vue ; `If-None-Match`, y compris un tag faible, produit le même
   304 sans corps et sans construction de snapshot. Miniatures JPEG, médias et réponses Range gardent
   leurs en-têtes et statuts. Un motif voisin ou un suffixe inconnu ne capture aucune route dynamique.
4. L'ingestion conserve déduplication, conflit de contenu, refus de séquence ancienne, renouvellement
   par `captureEpoch`, 429, et acquisition de l'opération avant assemblage. Le même `finally` libère
   le créneau et appelle `finish` après succès ou échec ; les refus 409/503/507 restent inchangés.
5. `handle` ne contient plus les branches des cinq groupes ; la table et les modules sont les seules
   définitions de ces routes. Relever au journal les routes/méthodes affectées et `wc -l` avant/après,
   sans imposer un gain de taille inventé ni une réécriture globale.
6. Les fichiers HTTP cités passent en séquentiel sans changement d'assertion ; le diff sous `tests/`
   ne contient que `tests/server-routes.test.cjs`. `node scripts/check.mjs` est vert à l'implémentation.

## Test d'acceptation attendu

`tests/server-routes.test.cjs` couvre les groupes par leurs fonctions exportées, puis le répartiteur
par un vrai `RemoteServer` en boucle locale avec runtime et assembleur enregistrés. Les suites HTTP
existantes restent inchangées et protègent les réponses, la durabilité et les courses d'ingestion.

## Hypothèses bloquantes

Aucune décision n'est attendue.

La répartition des routes auxiliaires ci-dessus ferme le périmètre des cinq groupes décidés.
Les fichiers restent à plat : `tests/architecture.test.cjs:15` lit encore `server/` sans descendre
dans les sous-dossiers ; T164 améliore cette garde mais n'est pas un prérequis de ce découpage.
T150 couvre le plan court. Aucune amélioration de sécurité ou de politique d'erreur n'est déduite
de ce déplacement ; un défaut découvert est consigné séparément.

## Journal
