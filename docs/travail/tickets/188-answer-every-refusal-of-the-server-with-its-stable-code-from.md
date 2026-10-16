---
id: T188
titre: Carry a stable code through every direct server refusal and media response
statut: a-faire
bloque_par: T124
adr: oui
installe: non
harnais: non
supprime_tests: non
niveau: sensible
---

## Ce que le ticket livre

Le transport serveur transmet toujours un code dans ses refus JSON, y compris 400, et code ses
refus directs. Les refus média binaires gardent leur corps et portent leur code en en-tête.
T201 complète ensuite les identités du domaine et des adaptateurs ; le repli 400 reste provisoire.

## Sources

- `docs/audit-architecture.md`, rapport A, B4 et D4 ; rapport B, B2.
  Décision du propriétaire, le 16/10 : premier lot transport, puis catalogue T201.
- Code vérifié à `8340014` : `server/http.cjs:89` traduit les erreurs ; `:97` omet le code des 400.
  Les refus directs de corps sont à `:56`, `:61` et `:83` ; authentification, méthode et route à
  `:128`, `:131` et `:141`. L'exposition CORS ne porte que ETag à `:16`.
- `server/ingest-routes.cjs:12` lève le refus d'horodatage futur ; `:29`, `:32` et `:34`
  répondent aux conflits de séquence et au créneau occupé sans code.
- `server/session-routes.cjs:6`, `:12`, `:26` et `:29` répondent aux refus de média ;
  `:30` relaie ensuite la Response du store. `adapters/local-store.cjs:245` répond 416 vide avec
  Content-Range et `:259` répond 404 texte : ces deux formes ne deviennent pas du JSON.
- `runtime/state-views.cjs:38` porte le constructeur de refus à statut ; ses appelants comprennent
  `runtime/capture-intake.cjs:2` et `runtime/headless-runtime.cjs`.
  Les groupes réels sont assemblés dans `server/routes.cjs:7`.
- Tests existants : remote-server, server-routes, server-ingest-path, server-sessions,
  server-state-views, timeline-server et state-views sous `tests/`, suffixe `.test.cjs`.
  ADR 0006, 0007, 0010 et 0021 : admission et ordre de transport conservés.

## Périmètre

- Modifier `server/http.cjs`, `server/ingest-routes.cjs`, `server/session-routes.cjs` et les tests cités.
  Sortir `refusal` de state-views vers `runtime/errors.cjs`, consacré aux erreurs, et adapter ses
  imports existants, sans autre modification des règles de ces appelants. La traduction HTTP vit
  dans server/ ; le cœur ne connaît aucun de ces deux modules.
- Poser les codes des refus directs du transport, avec leurs statuts et messages actuels :

  | Refus direct | Code public | Statut |
  | --- | --- | --- |
  | Authentification ; méthode ; type de corps | `unauthenticated` ; `method-not-allowed` ; `json-required` | 401 ; 405 ; 415 |
  | Corps trop grand ; JSON invalide ; route absente | `request-too-large` ; `invalid-json` ; `route-not-found` | 413 ; 400 ; 404 |
  | Horodatage futur | `invalid-capture-time` | 400 |
  | Même séquence, autre contenu ; séquence ancienne | `sequence-conflict` ; `stale-sequence` | 409 |
  | Préparation précédente encore en cours | `preparation-busy` | 429 |
  | Session du média terminée ; miniature indisponible | `session-ended` ; `thumbnail-unavailable` | 410 |
  | Média expiré ; manquant ou non conservé ; illisible | `media-expired` ; `media-missing` ; `media-unreadable` | 410 |

  Le classement de média utilise les raisons structurées déjà reçues, jamais leurs messages français.
- Transmettre les codes applicatifs déjà explicites, 400 compris. Conserver `STORAGE_FULL` →
  507 `storage-full` et les codes existants media-unavailable, read-only, session-closing,
  capture-changed, capturing, not-open et not-found. Un refus sans identité applicative reconnue
  reçoit `unclassified-error` et garde le repli/statut actuel ; errno ne devient pas un code métier.
  T201 ajoutera la table des autres émetteurs, sans reconnaissance par phrase.
- Sur la route média, ajouter `X-TVLens-Error-Code: invalid-range` au 416 et
  `X-TVLens-Error-Code: media-missing` au 404 générique du store. Exposer cet en-tête avec ETag par
  CORS, sans modifier corps, statut, Content-Range, lecture du clip ni store/appelants Mac.
- Les attentes HTTP ajoutent seulement code et en-tête. Déclarer ces ajouts dans ecarts.md et un ADR
  court sur les deux formes de transport et leurs propriétaires. Aucun changement de messages média,
  refus du cœur/adaptateurs, clients TV/IPC, formats persistés, politique de reprise ou choix 500.

## Critères d'acceptation

1. Le vrai RemoteServer prouve chaque ligne de la table, avec les vrais groupes de routes et un
   runtime contrôlé. Chaque refus JSON direct ou levé possède un code ; un 400 explicite conserve
   le sien. Le même code avec deux messages arbitraires garde la même classification.
2. Un errno brut ou une phrase connue sans code n'est pas reconnu comme refus métier : le repli
   reste provisoirement 400 `unclassified-error`. Les codes et statuts déjà explicites restent
   identiques, stockage plein compris. Aucun catalogue indexé par message n'est introduit.
3. Un corps refusé avant routage n'admet ni n'assemble de média. Déduplication, ordre des contrôles,
   créneau, annulation et libération des opérations gardent leurs garanties et leurs assertions.
4. Les 416 gardent corps vide et Content-Range, les 404 média du store leur texte. Chacun porte son
   en-tête de code accessible en CORS. Les réponses 200/206 conservent leurs octets et statuts.
5. Le journal rapproche chaque branche directe et son code de son cas HTTP. Le diff des attentes
   ajoute les identités et CORS sans retirer d'assertion de comportement. L'ADR ne prétend pas que
   les refus du domaine sont déjà tous classés : ils appartiennent à T201.
6. À l'implémentation, exécuter les suites citées en séquentiel, puis `node scripts/check.mjs`.
   Aucun changement du harnais, du plancher, des messages de contenu ni du repli 500.

## Test d'acceptation attendu

`tests/server-routes.test.cjs` conduit la matrice de refus par HTTP réel local et les vrais groupes
avec un runtime contrôlé. Les tests d'ingestion gardent ordre et déduplication ; ceux de Range
vérifient ensemble corps, Content-Range, code et CORS, sans comparaison du texte du programme.

## Hypothèses bloquantes

Aucune décision n'est attendue.

T124 livre le premier lot de codes d'émetteurs et implique T199/T178. T201 poursuit par le catalogue
des refus du domaine et des adaptateurs ; T051 assainit les messages média et T052 décide le repli 500.
Les erreurs contenues dans un état de travail réussi en HTTP ne changent pas de format ici.

## Journal
