---
id: T188
titre: Carry a stable code through every direct server refusal and media response
statut: termine
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

- Cadrage : consignes, skills, standards, code, appelants, sept suites citées et ADR concernés lus.
  Base `8d032f2`, témoin de hooks présent ; trois entrées initiales du statut Git conservées.
  Exploration et ajouts additifs prévus aux attentes dans `.harness-state/tickets/T188/exploration.md`
  et `ecarts.md`. Aucun test encore exécuté ; aucun commit ni push prévu.
- Refus HTTP communs : `node --test --test-name-pattern='unknown paths|HTTP common refusals|HTTP enforces|HTTP revalidation' tests/server-routes.test.cjs`
  : 4 rouges sur assertions de code/CORS, puis 4/4 verts (`http-direct-red.log`, `http-direct-green.log`).
  Authentification → unauthenticated, méthode → method-not-allowed, type → json-required,
  tailles annoncée/lue sur les deux limites → request-too-large, JSON malformé/non objet → invalid-json,
  chemins inconnus des cinq groupes → route-not-found. Aucun admit/assemble pour les corps refusés.
- Erreurs levées : `node --test --test-name-pattern='HTTP carries recognized|HTTP leaves errno' tests/server-routes.test.cjs`
  : 2 rouges sur absence d'identité, puis 2/2 verts (`error-translation-red.log`, `error-translation-green.log`).
  Deux messages arbitraires par code, treize codes T124 et codes publics existants transmis ;
  STORAGE_FULL → 507 storage-full ; errno, identités inconnues et phrases familières → unclassified-error.
  Statuts valides conservés, statuts invalides repliés en 400. `refusal` extrait avec ses quatre imports.
- Ingestion : `node --test --test-name-pattern='HTTP ingestion keeps|HTTP keeps one preparation|HTTP refuses a future' tests/server-routes.test.cjs`
  : 3 rouges sur assertions de code, puis 3/3 verts (`ingestion-refusals-red.log`, `ingestion-refusals-green.log`).
  Conflit de contenu → sequence-conflict, séquence ancienne → stale-sequence, créneau → preparation-busy,
  horodatage futur → invalid-capture-time. La borne exacte de tolérance reste admise ; refus futur après
  admit et avant accept/assemble. Doublons, renouvellement de capture et finish conservent leurs assertions.
- Média JSON : `node --test --test-name-pattern='HTTP preserves JPEG|HTTP codes unavailable' tests/server-routes.test.cjs`
  : 2 rouges sur assertions de code, puis 2/2 verts (`media-json-red.log`, `media-json-green.log`).
  Session absente/étrangère (miniature et média) → session-ended ; lecture miniature refusée → thumbnail-unavailable ;
  mediaReason expired/absent/inconnu → media-expired, missing/not-kept → media-missing,
  unreadable → media-unreadable. Deux routes média exercées ; aucun appel au store pour un refus d'état.
  Le contrôle rapide a signalé quatre imports encore inutilisés, retirés avant le rouge ; aucun test n'a été lancé sur cet état.
- Média binaire : `node --test --test-name-pattern='HTTP preserves JPEG|HTTP media refusal headers' tests/server-routes.test.cjs`
  : 2 rouges sur l'en-tête 416 absent (`media-binary-red.log`), puis 1 rouge sur l'en-tête 404 absent
  après le seul ajout 416 (`media-missing-header-red.log`), puis 2/2 verts (`media-binary-green.log`).
  Vrai store temporaire, deux routes, plages bornée/ouverte et trois formes de 416 : corps vide,
  Content-Range, invalid-range et CORS vérifiés ensemble. 404 texte inchangé → en-tête media-missing,
  prioritaire sur Range ; 200/206 conservent leurs octets et n'ont aucun en-tête d'erreur.
- Attentes existantes ajustées uniquement par ajout de code et exposition CORS, conformément à ecarts.md.
  ADR 0034 écrit sur les deux formes de transport, leurs propriétaires et le catalogue T201 restant.
- Suites citées exécutées un fichier à la fois, toutes code 0 : `node --test tests/remote-server.test.cjs`
  2/2 ; `node --test tests/server-routes.test.cjs` 19/19 ; `node --test tests/server-ingest-path.test.cjs`
  5/5 ; `node --test tests/server-sessions.test.cjs` 15/15 ; `node --test tests/server-state-views.test.cjs`
  1/1 ; `node --test tests/timeline-server.test.cjs` 2/2 ; `node --test tests/state-views.test.cjs` 5/5.
  Soit 49 tests réussis, aucun ignoré ; sorties `acceptance-<nom>.log` dans le dossier d'état.
- `node scripts/check.mjs --changed` : code 0, `check : vert` ; règles, format, lint, gel et cliquet verts,
  40/40 tests JS sur les quatre fichiers de test modifiés (`check-changed.log`). `git diff --check` : code 0.
- Premier contrôle complet : `node scripts/check.mjs` : code 1 (`check-full.log`). Règles, format,
  lint, gel, cliquet verts ; 22 tests Python OK ; JS 1 722/1 729, sept échecs sur les seules propriétés
  `code` supplémentaires des réponses HTTP. Pas d'échec intermittent observé.
- Diagnostic séquentiel, code 1 chacun : `node --test tests/architecture-f06.test.cjs` (4 échecs),
  `node --test tests/architecture-f07.test.cjs` (1), `node --test tests/architecture-f10.test.cjs` (1),
  `node --test tests/server-surveillance.test.cjs` (1) ; sorties intégrales
  `http-expectations-<nom>-red.log`. Ajouts attendus déclarés dans ecarts.md avant édition,
  puis ajout des codes seulement : préparation occupée, validation média sans identité, conflit,
  séquence ancienne, taille, session arrêtée, question active, authentification et session obsolète.
  Aucun scénario, message, statut, comptage, délai, annulation ou assertion de nettoyage retiré.
- Mêmes quatre commandes après les ajouts d'identité, exécutées une par une : 17/17, 26/26,
  10/10 et 5/5 verts, code 0 chacun (`http-expectations-<nom>-green.log`). Les comptages de lecture
  Range, les nettoyages, les courses de fermeture et le chevauchement chat/surveillance passent.
- Contrôle final des fichiers modifiés : `node scripts/check.mjs --changed` : code 0, `check : vert`,
  règles, format, lint, gel et cliquet verts ; 98/98 tests JS sur huit fichiers (`check-changed-final.log`).
- Contrôle complet final : `node scripts/check.mjs` : code 0, `check : vert` ; règles, format, lint,
  gel et cliquet verts ; 1 729/1 729 tests JS sur 123 fichiers, 22 tests Python OK
  (`check-full-final.log`). Aucun test ignoré ni contrôle non lancé.
- `git diff --check` : code 0. Vérification du diff : harnais, plancher, store, cœur, clients et messages
  inchangés ; les deux dossiers non suivis initiaux restent hors périmètre. Les seules adaptations
  des attentes existantes ajoutent codes/en-têtes, sans retirer d'assertion de comportement.
- Verdict `TERMINÉ` écrit dans `.harness-state/tickets/T188/verdict.json`, sans réserve restante.
  Catalogue du domaine laissé à T201, repli 400 conservé. Aucun commit ni push ; la boucle garde
  la relecture et l'intégration.

### Réserves à la clôture

- .harness-state/tickets/T188/relecture-1.md : **1. `server/http.cjs:23-30` : hors périmètre (réserve pour T201)**
  - **Le problème.** Les huit codes publics déjà existants (`media-unavailable`, `read-only`, `session-closing`, `capture-changed`, `capturing`, `not-open`, `not-found`, `invalid-capture-time`) sont écrits deux fois : une fois chez leur émetteur (`runtime/capture-intake.cjs`, `runtime/headless-session-lifecycle.cjs`, `runtime/state-views.cjs`, `adapters/remote-media.cjs`, `server/ingest-routes.cjs`), une fois dans la liste `APPLICATION_CODES`. Si on renomme un code chez son émetteur, le serveur répondra `unclassified-error` sans erreur visible. Le test `HTTP carries recognized application codes…` utilise lui aussi des chaînes écrites en dur et ne le verrait pas. Les suites d'intégration (architecture-f06, server-sessions) attraperaient la plupart des cas.
  - **Ce qui est attendu.** Chaque émetteur déclare et exporte son code, et `server/` l'importe, comme le prévoit T201.
  - **Pourquoi hors périmètre.** T188 interdit de modifier les règles des appelants et les refus du cœur ou des adaptateurs.
- .harness-state/tickets/T188/relecture-1.md : **Écart accepté, critère 5 (attentes HTTP additives).** Le ticket prescrit d'ajouter `code`, `unclassified-error`, l'exposition CORS et l'en-tête média. Le diff des attentes ne retire aucune assertion.
- .harness-state/tickets/T188/relecture-1.md : **Écart accepté, périmètre (import dans `runtime/headless-session-lifecycle.cjs`).** C'est un appelant existant de `refusal`. Le ticket demande d'« adapter ses imports existants », et la liste des appelants citée n'était pas complète (« comprennent »). Seul l'import change, aucune règle.
- .harness-state/tickets/T188/relecture-1.md : **Écart accepté, critère 5 (`tests/architecture-f06`, `-f07`, `-f10`, `tests/server-surveillance`).** Ces suites ne sont pas citées par le ticket, mais elles vérifient par HTTP réel les garanties des ADR 0006, 0007 et 0010, qu'il cite. Le changement de comportement demandé les fait forcément évoluer. J'ai vérifié que seuls `code` ou l'exposition CORS ont été ajoutés : scénarios, comptages, délais et nettoyages sont intacts.

  Aucun constat contesté : c'est la première relecture.
