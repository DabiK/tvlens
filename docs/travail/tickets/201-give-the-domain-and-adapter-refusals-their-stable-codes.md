---
id: T201
titre: Give the domain and adapter refusals their stable codes, including the media content refusals
statut: a-faire
bloque_par: T188
adr: oui
installe: non
harnais: non
supprime_tests: non
niveau: sensible
---

## Ce que le ticket livre

Les refus voulus du domaine, des adaptateurs et de leur composition portent une identité à la source.
Le transport de T188 les traduit sans lire leurs messages. Le catalogue comprend les trois refus
de contenu média nécessaires à T051, pour qu'ils restent des 400 explicites après T052.

## Sources

- `docs/audit-architecture.md`, rapport A, B4 et D4 ; rapport B, B2 et D2.
  Décision du propriétaire, le 16/10 : deuxième lot après T188, avant T051 et T189.
  Décision du propriétaire, le 16/10, à la conception du domaine (Q13) : des codes par contexte sur une petite
  base partagée, et aucun catalogue central à redécouper quand le code sera rangé par contexte.
  La base vit dans `core/shared/`, le noyau partagé de la cible (`docs/domaine.md`, ADR 0029).
- Code vérifié à `8340014` : refus de question à `core/deep-ask.cjs:58` à `:61`, sélection de moment
  à `core/session-timeline.cjs:79` à `:99`, langue à `core/transcription-language.cjs:3` ;
  `core/session.cjs:96`, `:97` et `:112` refusent arrêt, horodatage et ordre de passage.
- `core/surveillance.cjs:398` et `:399` refusent session/consigne ; `:501` à `:509` refusent les
  relances invalides. `runtime/state-views.cjs:123`, `:125`, `:186` et `:190` refusent curseur,
  limite et identité de surveillance. Le constructeur d'erreurs aura été déplacé par T188.
- `adapters/session-library.cjs:68`, `:74`, `:81`, `:93` et `:97` valident identité et archive ;
  `runtime/session-runtime.cjs:53` à `:61` valide l'ouverture d'archive, et `:249` le segment capturé.
- `adapters/remote-media.cjs:29` valide le bloc, `:62` refuse l'outil en erreur et `:76` à `:80`
  laisse remonter sharp. `:43` et `:45` distinguent déjà les pannes 503 de disponibilité.
- `runtime/headless-runtime.cjs:271`, `:379`, `:417` et `:424` refusent vue, session, fermeture et
  ancrage. `runtime/capture-intake.cjs:16`, `:17`, `:27` et `:103` portent les refus d'admission.
  `runtime/headless-session-lifecycle.cjs:89`, `:195`, `:215`, `:245` et `:280` portent les transitions.
- Tests disponibles : architecture-f06, media-asr-options, remote-media, server-routes,
  server-state-views, server-ingest-path, server-sessions, server-surveillance, timeline-server,
  session-timeline, state-views et transcription-language sous tests/, suffixe `.test.cjs`.
  Les tests propres à DeepAsk et Surveillance complètent les preuves à la source ; aucun futur
  contrat-fil ni port de journal n'est un prérequis. ADR 0006, 0007 et 0021/0023/0024.

## Périmètre

- Modifier les émetteurs cités et leurs tests. Chaque module émetteur du cœur déclare et exporte ses
  propres codes, sans import externe ni statut HTTP : `core/deep-ask.cjs` ceux des questions,
  `core/session.cjs` ceux de la capture et de l'arrêt, `core/session-timeline.cjs` ceux des moments,
  `core/transcription-language.cjs` celui de la langue, `core/surveillance.cjs` ceux de la surveillance.
  Seule une base minimale est partagée : ajouter `core/shared/domain-error.cjs`, qui fabrique une erreur portant `code`
  et `cause`, et ne déclare aucun code. Aucun fichier ne réunit les codes de plusieurs modules : quand
  le code sera rangé par contexte, chaque code suivra son module. Les codes propres aux adaptateurs sont
  définis/exportés chez eux ; les compositions utilisent `runtime/errors.cjs` livré par T188.
  La traduction vers statut/code public vit dans server/. Les branches existantes gardent leur
  statut actuel, 400 par défaut historique ; aucune règle métier ni nouvelle validation ici.
- Le catalogue fini des familles attendues est le suivant. Les constantes nouvelles valent leur
  nom ; les valeurs déjà livrées, notamment STORAGE_FULL, gardent leur export compatible.

  | Émetteur/famille | Identité interne ou code déjà public | Code HTTP ; statut conservé |
  | --- | --- | --- |
  | Domaine, stockage plein | `TVLENS_STORAGE_FULL` existant | `storage-full` ; 507 |
  | DeepAsk, question ; file ; action ; intervalle | `TVLENS_QUESTION_INVALID`, `TVLENS_QUESTION_QUEUE_FULL`, `TVLENS_QUESTION_ACTION_INVALID`, `TVLENS_QUESTION_INTERVAL_INVALID` | `invalid-question`, `question-queue-full`, `invalid-question-action`, `invalid-question-interval` ; 400 |
  | Session, horodatage ; ordre ; arrêt | `TVLENS_CAPTURE_TIME_INVALID`, `TVLENS_CAPTURE_ORDER_INVALID`, `TVLENS_SESSION_STOPPED` | `invalid-capture-time`, `invalid-capture-order`, `session-stopped` ; 400 |
  | Timeline, bornes/sélection ; moment absent ; intervalle discontinu | `TVLENS_MOMENT_SELECTION_INVALID`, `TVLENS_MOMENT_MISSING`, `TVLENS_MOMENT_INTERVAL_DISCONTINUOUS` | `invalid-moment-selection`, `moment-missing`, `discontinuous-moment-interval` ; 400 |
  | Langue invalide | `TVLENS_TRANSCRIPTION_LANGUAGE_INVALID` | `invalid-transcription-language` ; 400 |
  | Surveillance, session absente ; consigne ; relance | `TVLENS_SURVEILLANCE_SESSION_REQUIRED`, `TVLENS_SURVEILLANCE_INSTRUCTION_INVALID`, `TVLENS_SURVEILLANCE_RETRY_INVALID` | `surveillance-session-required`, `invalid-surveillance-instruction`, `invalid-surveillance-retry` ; 400 |
  | Bibliothèque, identité ; absente ; archive illisible/incomplète/étrangère | `TVLENS_SESSION_ID_INVALID`, `TVLENS_SESSION_NOT_FOUND`, `TVLENS_ARCHIVE_INVALID` | `invalid-session-id`, `not-found`, `invalid-archive` ; 400 à ces validateurs, 404 pour les branches déjà explicites |
  | RemoteMedia, validation du bloc (WAV et déclaration masquée tant qu'elle existe compris) | `TVLENS_MEDIA_BLOCK_INVALID` | `invalid-media-block` ; 400 |
  | RemoteMedia, image indécodable | `TVLENS_MEDIA_IMAGE_UNREADABLE` | `image-unreadable` ; 400 |
  | RemoteMedia, outil exécuté mais refusant le contenu | `TVLENS_MEDIA_TOOL_REFUSED` | `media-tool-refused` ; 400 |
  | RemoteMedia, outil absent/délai/espace temporaire | `media-unavailable` existant | `media-unavailable` ; 503 |
  | Composition, vue ; session obsolète ; ancrage | `unknown-view`, `stale-session`, `invalid-anchor` | mêmes codes ; 400 |
  | Composition, segment capturé invalide | `invalid-captured-segment` | même code ; 400 |
  | Composition, curseur ; limite ; identité surveillance | `invalid-history-cursor`, `invalid-history-limit`, `invalid-surveillance-id` | mêmes codes ; 400 |
  | Composition, réglage de langue en cours | `language-setting-busy` | même code ; 400 |
  | Composition, surveillance sans session | `surveillance-session-required` | même code ; 400 |
  | Transitions/admission déjà codées | `read-only`, `capture-changed`, `capturing`, `not-open`, `not-found`, `session-closing` | conserver chaque statut de branche, notamment 409/404/503 explicites |

- Coder aussi les refus de fermeture sans statut en `session-closing`, avec leur 400 historique
  lorsqu'il n'y avait pas de statut ; ne pas uniformiser les routes. Ne pas confondre les motifs
  persistés de surveillance, les erreurs de travaux et les refus directs de requête de ce catalogue.
- Pour sharp, envelopper seulement construction/transformation jusqu'à toBuffer afin de poser
  `TVLENS_MEDIA_IMAGE_UNREADABLE`, avec message original et cause conservés provisoirement.
  Le refus d'outil reçoit `TVLENS_MEDIA_TOOL_REFUSED` ; la validation voulue du bloc reçoit
  `TVLENS_MEDIA_BLOCK_INVALID`. Ne pas coder une erreur scratch, système ou annulation comme faute
  du contenu. T051 rendra les textes publics fixes et ajoutera la garde frame null/non objet.
- Conserver messages, causes, annulation prioritaire, travaux commencés attendus avant nettoyage,
  déduplication et ordre d'admission. Les seuls ajouts aux attentes existantes sont code/statut
  explicite ; déclarer ces ajouts dans ecarts.md. Les détails sharp/outil restent à assainir par T051.
- Ne modifier ni clients TV/IPC, ni politiques de reprise, ni erreurs Codex de T124/T125, ni données
  d'archive, ni critères de surveillance. Le repli inattendu vers 500 appartient à T052.

- ADR court, au premier numéro libre : un code interne `TVLENS_*` vit chez le module qui émet le refus (cœur ou
  adaptateur), le transport `server/` le traduit en code public stable, et aucun lecteur ne compare de message.
  Il prolonge l'ADR du transport posé par T188, sans le réécrire.

## Critères d'acceptation

1. Un test de vrai émetteur par famille du catalogue prouve code importable depuis son module
   émetteur, message conservé et cause utile. `core/shared/domain-error.cjs` n'exporte aucun code.
   Les refus du cœur n'ont aucun statut HTTP ; deux formulations d'un code gardent
   sa classification, et un message connu sans code ne devient jamais un refus reconnu.
2. Le vrai RemoteServer devant les émetteurs couvre chaque famille atteignable par ses cinq groupes
   de routes ; le journal rapproche chaque branche voulue d'un cas et de son statut/code exact.
   Aucun refus normal du catalogue n'atteint `unclassified-error`. Une faute système sans identité
   applicative reste non classée, même si son message ressemble à une validation connue.
3. Les trois contenus média donnent exactement 400 `image-unreadable`, `invalid-media-block` et
   `media-tool-refused`, avec les constantes nommées en table, avant T051. Les pannes d'outil,
   scratch et échéance restent 503 media-unavailable ; stockage plein reste 507 storage-full.
   Annulation garde sa raison et tous les travaux commencés sont réglés avant nettoyage.
4. Les refus de lecture seule, fermeture, capture changée, bibliothèque et ancrage gardent leurs
   statuts et messages existants. Les réponses binaires/en-têtes de T188 restent couvertes et
   ne sont pas remplacées par une enveloppe JSON.
5. À l'implémentation, exécuter les tests des émetteurs puis les suites serveur citées un par un,
   puis `node scripts/check.mjs`. Aucune assertion comportementale ni aucun cas n'est retiré ;
   aucun harnais, plancher, fournisseur réel ou installation n'est nécessaire.

## Test d'acceptation attendu

Les tests des vrais validateurs établissent le code à la source ; `tests/server-routes.test.cjs`
et les intégrations d'ingestion/bibliothèque établissent sa traduction HTTP par le transport réel.
Les trois refus RemoteMedia sont exercés directement puis via POST /v1/segments, sans simple
fixture d'erreur fabriquée. Leur texte public final sera fixé par T051.

## Hypothèses bloquantes

Aucune décision n'est attendue.

T188 livre module d'erreurs et transport des codes et implique T124, T199 et T178. Le catalogue
nomme des identités techniques, sans inventer de règle métier. Si une branche normale manque à
l'inventaire après les dépendances, la nommer par sa condition et son test, jamais par une regex
sur son message. T051 et T189 dépendent de ce lot ; T052 attend T051 et sa décision propre.

## Journal
