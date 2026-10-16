---
id: T174
titre: Route the server HTTP handler through one module per route group
statut: termine
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

- Exploration : lecture du transport, de son point d'entrée, des huit suites citées
  et des ADR de possession, fermeture et Range. `git status --short` et `git diff`
  observés : seul le statut du ticket est modifié, deux dossiers non suivis préexistants.
  `wc -l server/http.cjs` : **297 lignes** avant extraction. Détails et plan de preuve
  dans `.harness-state/tickets/T174/exploration.md` ; aucun écart prévu (`ecarts.md`).
- Interfaces de groupe : échafaudages vides puis rouge sur l'assertion `matched`
  pour état, questions, surveillance, sessions et ingestion. Commandes :
  `node --test tests/server-routes.test.cjs` (état), puis
  `node --test --test-name-pattern='question routes' tests/server-routes.test.cjs`,
  mêmes commandes filtrées sur `surveillance routes`, `session routes` et `ingestion routes`.
  Chaque rouge est suivi de `node --test tests/server-routes.test.cjs` vert :
  successivement **1, 2, 3, 4 puis 5 tests passés**. Sorties `*-red.log` et
  `*-green.log` conservées dans le dossier d'état. Les assertions couvrent les
  arguments, réponses et routes inconnues ; l'ingestion vérifie opération et signal.
- Caractérisation HTTP avant raccordement : `node --test tests/server-routes.test.cjs`
  **13/13 verts** (`http-characterization-complete.log`). Limites exactes, annonces
  et flux dépassés, refus ordonnés, ETag sans snapshot, JPEG/Range, conflits,
  renouvellement de capture, créneau par serveur et libération sur succès/échec.
  Table vide : `node --test --test-name-pattern='composed table' tests/server-routes.test.cjs`
  **rouge observé, 0 entrée au lieu de 26** (`table-red.log`). Composition puis
  raccordement de `handle` : `node --test tests/server-routes.test.cjs` **14/14 verts**
  (`table-green.log`, `http-table-green.log`).
- Répartition livrée (mêmes paramètres et motifs ancrés que le ticket) :
  - état : GET `/v1/session`, GET `/v1/state`, POST `/v1/settings/transcription` ;
  - surveillance : GET `/v1/surveillance/overlay`, GET `/v1/surveillance`, POST
    `/v1/surveillance/{start,stop,retry,history,detail}` ;
  - sessions : GET `/v1/sessions`, GET `/v1/storage`, GET
    `/v1/thumbnail/:sessionId/:momentId`, GET `/v1/media/:sessionId/:momentId`,
    GET `/v1/media/:momentId`, POST `/v1/session/{start,pause,end}`, POST
    `/v1/sessions/close`, POST `/v1/sessions/:id/{open,resume,delete}` ;
  - questions : POST `/v1/moments/detail`, POST `/v1/questions`, POST
    `/v1/questions/:id/cancel` ; ingestion : POST `/v1/segments`.
  Chaque paire méthode/route a un seul propriétaire (9 GET, 17 POST).
- `wc -l` après extraction : `server/http.cjs` **147** (avant : 297), `routes.cjs`
  **31**, `session-routes.cjs` **81**, `ingest-routes.cjs` **58**,
  `question-routes.cjs` **13**, `surveillance-routes.cjs` **17**, `state-routes.cjs`
  **32**. La répartition ajoute des interfaces ; aucune mesure de performance annoncée.
- `node_modules/.bin/eslint --prune-suppressions server/http.cjs` : sortie 0,
  quatre gels devenus inutiles retirés, aucune suppression ajoutée.
  `node scripts/check.mjs --changed` : **vert**, 14 tests passés, catch vide de
  production 32 → 31 (`check-changed.log`). ADR 0021 rédigé.
- Régressions :
  `node --test --test-concurrency=1 tests/remote-server.test.cjs tests/server-ingest-path.test.cjs tests/server-sessions.test.cjs tests/server-state-views.test.cjs tests/server-surveillance.test.cjs tests/timeline-server.test.cjs tests/architecture-f06.test.cjs tests/architecture-f07.test.cjs`
  **70/70 tests passés**, sortie 0 (`http-regressions.log`). Les huit fichiers sont
  identiques octet pour octet à HEAD (`http-suites-unchanged.log`). Sous `tests/`,
  seul `tests/server-routes.test.cjs` est ajouté.
- Contrôle final : `node scripts/check.mjs` **vert**, sortie 0, **1 357/1 357 tests
  JS** dans 109 fichiers en séquentiel ; Python **OK, 33 cas dont 1 ignoré**
  (`check-full.log`). Dernière mise en forme limitée au nouveau test :
  `node_modules/.bin/prettier --ignore-path /dev/null --write tests/server-routes.test.cjs`,
  puis `node scripts/check.mjs --changed` **vert, 14/14 tests passés**
  (`check-changed-final.log`). `git diff --check` sans erreur.
- Verdict d'implémentation : **TERMINÉ**, preuves dans
  `.harness-state/tickets/T174/verdict.json`. Relecture et intégration rendues à la
  boucle ; aucun commit ni push.

- Reprise après `relecture-1.md` : rapport, ticket, journal, écarts, `git status --short`
  et `git diff` relus. Constat mineur 1 accepté : restaurer les commentaires de raison
  à six emplacements, sans modifier les instructions ni les tests. Vérification par
  les tests existants avant édition ; aucun rouge comportemental annoncé pour des
  commentaires et aucun test du texte source ajouté. Constat hors périmètre 2
  conservé en réserve ; la suite d'architecture interdite de modification reste intacte.
- Correction du constat mineur 1 : `node --test tests/server-routes.test.cjs`
  **14/14 verts avant édition** (`correction-1-before.log`). Six explications remises
  en français : verbes du panneau, publication des ETag, refus 507, corps objet,
  redémarrage de capture sans pause et refus des anciens blocs, arrêt de l'outil
  média par le signal à la fin de session. Empreintes des instructions hors lignes
  de commentaires identiques avant/après ; détails dans `correction-1.md`.
  `node scripts/check.mjs --changed` : **vert, 14/14 tests**, sortie 0
  (`correction-1-check-changed.log`). `git diff --check` : sortie 0.
  `wc -l` actualisé : HTTP **151**, ingestion **61**, seuls commentaires ajoutés.
- Contrôle complet de la correction : `node scripts/check.mjs` **vert**, sortie 0 ;
  **1 357/1 357 tests JS** dans 109 fichiers en séquentiel ; Python **OK, 33 cas
  dont 1 ignoré** (`correction-1-check-full.log`). Constat mineur 1 corrigé sans
  modification d'instruction ni de test. Nouveau verdict **TERMINÉ**, avec le
  constat hors périmètre 2 en réserve dans `reste` ; relecture rendue à la boucle,
  aucun commit ni push.

### Réserves à la clôture

- Hors périmètre, relecture 1 constat 2 : la garde du message de fermeture dans tests/architecture-f07.test.cjs ne lit que server/http.cjs côté transport serveur ; les nouveaux server/*-routes.cjs échappent à cette garde. Elle reste vraie aujourd'hui et la suite reste inchangée conformément au ticket.
- .harness-state/tickets/T174/relecture-2.md : Nombre de constats discordant : CONSTATS annonce 1 hors périmètre ; 0 constat(s) extrait(s). Consulter le rapport pour l'ensemble des constats hors périmètre.
- .harness-state/tickets/T174/relecture-2.md : **Écart accepté, `eslint-suppressions.json` (élagage, sans numéro de critère).** Décision inchangée depuis la relecture 1 : `docs/standards.md` impose de retirer une suppression devenue inutile, et aucun gel n'est ajouté.
