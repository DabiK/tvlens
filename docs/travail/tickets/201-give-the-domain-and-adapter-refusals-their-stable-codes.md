---
id: T201
titre: Give the domain and adapter refusals their stable codes, including the media content refusals
statut: termine
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

- Exploration : base `dd1ff77`, témoin des hooks présent ; inventaire et écarts prévus consignés dans `.harness-state/tickets/T201/`. Les travaux préexistants hors ticket restent intacts. Aucun contrôle encore lancé.

- Tests d’abord : rouges observés sur l’absence de `code` pour les familles DeepAsk, capture,
  moments, langue, surveillance, bibliothèque et média ; rouge observé sur la cause de la base.
  Commandes : `node --test --test-name-pattern='<motif>' tests/<module>.test.cjs`, puis
  `node --test tests/<module>.test.cjs`. Les commandes par module et leurs sorties sont conservées
  dans `.harness-state/tickets/T201/` (`*-red.log`, `*-green.log`). Le transport a aussi été vu rouge
  sur `invalid-question`, les compositions sur leurs codes absents, puis vert.
- Implémentation : base sans catalogue dans `core/shared/domain-error.cjs`, constantes locales
  exportées, traduction finie dans `server/http.cjs`, compositions codées avec `refusal`.
  Messages et statuts de branche conservés. ADR 0039 ajouté. Aucun client ni format d’archive changé.
- Média : test rouge supplémentaire `media-system-red.log`, puis vert : une sortie non nulle porte
  `TVLENS_MEDIA_TOOL_REFUSED` ; un signal système hors annulation/échéance conserve son erreur sans
  identité, son message et son 400 historique. Les fautes système ne deviennent pas du contenu.
- Ajustements du banc : la cause d’une archive syntaxiquement illisible est l’Error reçue de
  LocalSessionStore, déjà substituée à SyntaxError par ce store. La nouvelle attente vérifie
  précisément cette cause. Le bloc du test d’ordre recouvre plus que la tolérance existante de 100 ms.
  Le nouveau banc HTTP injecte explicitement l’agent de chat : `smoke` seul ne le remplace pas et
  pouvait laisser tenter un préchauffage Codex dans sa première version, sans question valide admise
  vers cet agent. La validation finale ci-dessous utilise la doublure. Détails dans l’exploration
  et `ecarts.md` ; aucune assertion préexistante assouplie ni retirée.
- Premier `node scripts/check.mjs --changed` : 186 tests verts ; contrôle rouge uniquement sur une
  suppression `no-nested-ternary` devenue inutile dans RemoteMedia. Commande prescrite exécutée :
  `node_modules/.bin/eslint --prune-suppressions adapters/remote-media.cjs` ; seule cette suppression
  est retirée. Aucun plancher ni harnais modifié.
- Validation finale ciblée : chaque commande `node --test tests/<nom>.test.cjs` est exécutée seule,
  dans cet ordre : domain-error (1), deep-ask-restore (20), session (7), session-timeline (9),
  transcription-language (3), surveillance (22), session-library (6), session-runtime (7),
  remote-media (21), state-views (5), capture-intake (15), headless-session-lifecycle (15),
  surveillance-runtime (25), architecture-f06 (17), media-asr-options (8), server-routes (30),
  server-state-views (4), server-ingest-path (13), server-sessions (29), server-surveillance (5),
  timeline-server (2), remote-server (3). Tous les cas passent, aucun sauté. Commandes, résultats et
  sorties : `validation-finale-sequentielle.log` et `*-validation-finale.log` du dossier d’état.
- `node scripts/check.mjs --changed` final : **vert**, 190 tests sur 14 fichiers, lint et cliquet verts.
  Lignes longues de production : 440 → 432 ; occurrences textuelles de tests produit : 1112 → 1141.
  Sortie conservée dans `check-changed-final.log` ; le plancher reste à la charge de la boucle.

### Correspondance des branches et des preuves

Les codes ci-dessous sont les codes JSON publics. Les tests à la source vérifient aussi chaque
constante interne importable et l’absence de statut dans le cœur. Les codes sans erreur sous-jacente
ne fabriquent pas de cause ; sharp, lecture d’archive et dossier absent conservent la cause reçue.
Dans les lignes suivantes, `routes` désigne `tests/server-routes.test.cjs` et `ingest`
`tests/server-ingest-path.test.cjs`. Les motifs cités identifient les noms de tests exécutés.

| Branche voulue | Cas observé | Résultat exact |
| --- | --- | --- |
| DeepAsk, question invalide | source `question refusals expose` ; routes `question requests classify` | 400 `invalid-question` |
| DeepAsk, cinq questions en attente | source `full question queue` ; routes `question queue fullness` | 400 `question-queue-full` |
| DeepAsk, action inconnue | source `question refusals expose` ; routes `real question emitter refusal` | 400 `invalid-question-action` |
| DeepAsk, intervalle invalide | mêmes cas, options d’intervalle invalides | 400 `invalid-question-interval` |
| WatchSession, horodatage invalide | source `capture refusals expose` ; routes `ingestion distinguishes` | 400 `invalid-capture-time` |
| WatchSession, ordre invalide | mêmes cas ; server-sessions `a start renews` | 400 `invalid-capture-order` |
| WatchSession, arrêt avant admission, fermeture avant atterrissage, reprise fermée | source `capture refusals expose` | code interne `TVLENS_SESSION_STOPPED`, sans statut |
| Admission d’une capture arrêtée | routes `ingestion distinguishes` ; architecture-f06 `what the transport already guaranteed stays` | 400 `session-stopped` |
| Moment, bornes invalides / liste vide / doublons | source `moment refusals expose` ; routes `question requests classify` | 400 `invalid-moment-selection` |
| Moment absent | mêmes cas, `moment-99` | 400 `moment-missing` |
| Moment discontinu | mêmes cas, moments 1 et 3 | 400 `discontinuous-moment-interval` |
| Langue invalide | source `invalid transcription language` ; routes `state requests classify` | 400 `invalid-transcription-language` |
| Surveillance, snapshot de session absent/invalide | source `surveillance request refusals expose` | `TVLENS_SURVEILLANCE_SESSION_REQUIRED`, sans statut |
| Composition surveillance sans session | routes `surveillance without a session` devant createSurveillanceRuntime | 400 `surveillance-session-required` |
| Surveillance, consigne invalide | source `surveillance request refusals expose` ; routes `surveillance requests classify` | 400 `invalid-surveillance-instruction` |
| Surveillance, relance inactive / passage non échoué / élément non relançable | source `surveillance request refusals expose` ; routes `surveillance requests classify` | 400 `invalid-surveillance-retry` |
| Bibliothèque, identité invalide | source session-library ; routes `library requests retain` ; server-sessions suppression | 400 `invalid-session-id` |
| Bibliothèque, dossier absent | source session-library (cause ENOENT), sans statut ; routes bibliothèque par located | 400 par défaut au validateur ; 404 `not-found` à la route existante |
| Bibliothèque, vide / état illisible / état étranger / manifeste invalide | source session-library ; routes `library requests retain` | 400 `invalid-archive` |
| Composition, archive incomplète / illisible / étrangère | source session-runtime, avant construction | 400 `invalid-archive` |
| Média, séquence / intervalle / nombre / ordre / base64 / taille / cadrage | source `remote block validation identifies` ; ingest `real validation content refusal` | 400 `invalid-media-block` |
| Média, WAV absent | source `non-WAV block retains` ; ingest `real wav content refusal` ; architecture-f06 | 400 `invalid-media-block` |
| Média, sharp indécodable ou transformation impossible | source `image refusal preserves` ; ingest `real image content refusal` | 400 `image-unreadable` |
| Média, outil exécuté en échec | source `executed media tool` ; ingest `real tool content refusal` ; architecture-f06 | 400 `media-tool-refused` |
| Outil absent / lancement refusé / délai / scratch refusé | architecture-f06, cas vrais d’assemblage et HTTP | 503 `media-unavailable` |
| Stockage plein à l’écriture, admission et reprise | ingest `real store write failure` ; server-sessions `below the disk floor` | 507 `storage-full` |
| Vue inconnue / langue déjà en cours d’écriture | routes `state requests classify` | 400 `unknown-view` / `language-setting-busy` |
| Session obsolète, avant les autres validations | routes questions, ingestion et surveillance | 400 `stale-session` |
| Ancrage négatif ou futur | routes `question requests classify` | 400 `invalid-anchor` |
| Segment capturé : temps / clip / audio / images | source session-runtime ; routes `ingestion distinguishes` | 400 `invalid-captured-segment` |
| Historique : curseur / limite / identité | routes `surveillance requests classify` | 400 `invalid-history-cursor` / `invalid-history-limit` / `invalid-surveillance-id` |
| Élément de surveillance absent | même test, `claim-99` | 404 `not-found` |
| Commandes pendant fermeture : question / surveillance / start / open / resume | routes `closing refusals` | 400 `session-closing` |
| Bloc pendant fermeture / préparation annulée | routes `closing refusals` et architecture-f06 | 503 `session-closing` |
| Capture changée pendant préparation | architecture-f06 `a block prepared across a restart` | 409 `capture-changed` |
| Archive en lecture seule : capture / start / surveillance | routes `library transitions preserve exact` et server-sessions | 409 `read-only` |
| Capture active : open / delete ; reprise d’une archive non ouverte | routes `library transitions preserve exact` | 409 `capturing` / `not-open` |
| Deux formulations par identité, tous les codes du catalogue | routes `recognized application codes` | classification identique, texte conservé |
| Texte familier sans identité, errno inconnu ; vraie faute disque EIO | routes `familiar wording unclassified` ; ingest `real store write failure` | 400 `unclassified-error` (ou statut valide existant) |
| Signal système d’un outil, sans annulation/échéance | remote-media `terminated by the system` | erreur originale sans `code` ni `status`, message conservé |
| Binaires et en-têtes média | routes, vrai LocalSessionStore : Range et fichier absent | 200/206 octets ; 416 vide + `invalid-range` ; 404 texte + `media-missing` |

Les action/intervalle de DeepAsk sont aussi branchés directement sur la façade de test du groupe
questions : HeadlessRuntime ne transmet pas un intent arbitraire reçu du client. Les erreurs de
travaux, réglages internes et invariants de restauration ne sont pas renommées en refus de requête.
Les scénarios architecture-f06 et media-asr-options conservent leurs assertions d’annulation
prioritaire, attente des travaux commencés, nettoyage, déduplication et ordre d’admission.

- `node scripts/check.mjs` complet : **vert**, 2 080 tests JavaScript sur 131 fichiers et
  22 tests Python réussis ; règles, format, lint, gel et cliquet verts. Sortie :
  `.harness-state/tickets/T201/check-full.log`. Le dernier `node scripts/check.mjs --changed`
  est également **vert**, 190/190 tests ; `git diff --check` ne signale aucune erreur.
  Les libellés des nouveaux cas sont en anglais, sans changement d’assertion.
- Verdict `TERMINÉ` écrit dans `.harness-state/tickets/T201/verdict.json`, prêt pour la relecture
  de la boucle. Aucun commit ni push. Les dossiers préexistants design/continuous-context/ et
  experiments/ sont restés intacts ; T051 et T052 gardent les travaux explicitement différés.

### Correction après la première relecture

- Rapport `relecture-1.md`, ticket, journal, écarts, `git status --short` et `git diff` relus.
  Deux mineurs acceptés ; reprise de l’arbre présent. Le catch de lecture et celui de lstat
  classent trop largement les fautes système. Correction prévue et preuves consignées dans
  l’exploration et les écarts, avant implémentation. Le test répété sera remplacé par le cas
  d’une entrée UUID qui est un fichier, sans retirer de cas. Aucun contrôle de reprise encore lancé.

- Tests avant correction : `node --test tests/session-library.test.cjs` donne 6 échecs sur les
  assertions de code absent (lecture et lstat pour EIO/EACCES/EMFILE), avec 6 cas déjà verts,
  dont le remplacement du doublon par l’entrée UUID de type fichier. Sortie :
  `correction-library-red.log` dans le dossier d’état.
- `node --test --test-name-pattern='HTTP archive opening keeps' tests/server-routes.test.cjs`
  donne 3 échecs : chacun observe 400 `invalid-archive` au lieu de 400 `unclassified-error`,
  avec le message « Archive illisible. » déjà conservé. Sortie : `correction-http-red.log`.

- Mineur 1 corrigé : `state()` distingue l’errno par `typeof cause?.code === 'string'`.
  Une faute système garde « Archive illisible. » et sa cause sans code ; l’échec d’analyse sans
  errno garde `TVLENS_ARCHIVE_INVALID`. Dans `folder()`, seule ENOENT est codée dans le catch ;
  les autres fautes gardent « Session introuvable. » et leur cause sans identité.
  Les validations existantes et le 404 explicite de `located()` restent en place. ADR 0039 précisé.
- Mineur 2 corrigé : le test répété d’ENOENT est remplacé par une entrée UUID de type fichier,
  refusée avec `TVLENS_SESSION_NOT_FOUND`, le message existant et aucune cause. Le cas ENOENT
  et sa cause restent vérifiés par le premier test. Aucun cas ni aucune assertion utile retiré.
- Verts observés après correction : `node --test tests/session-library.test.cjs` : 12/12 ;
  `node --test tests/server-routes.test.cjs` : 33/33. Sorties `correction-*-green.log` du dossier d’état.

| Branche corrigée ou caractérisée | Cas observé | Résultat exact |
| --- | --- | --- |
| Lecture de session.json : EIO, EACCES, EMFILE | session-library `archive read failure` | aucun code ni statut ; message et cause conservés |
| Même faute devant le vrai serveur | server-routes `HTTP archive opening keeps` | 400 `unclassified-error`, « Archive illisible. » |
| lstat : EIO, EACCES, EMFILE | session-library `session folder stat failure` | aucun code ni statut ; message et cause conservés |
| Absence ENOENT | session-library `identifiers and absent folders` | `TVLENS_SESSION_NOT_FOUND`, cause ENOENT |
| Entrée UUID qui est un fichier | session-library `UUID entry that is a file` | `TVLENS_SESSION_NOT_FOUND`, aucune cause |
| Archive mal formée ou forme invalide | session-library, les 4 cas existants | `TVLENS_ARCHIVE_INVALID` ; cause d’analyse conservée |

- Régressions : les 22 suites ciblées sont rejouées une par une, des émetteurs vers les suites
  serveur ; toutes vertes, aucun cas sauté. Commandes et résultats :
  `.harness-state/tickets/T201/correction-validation-sequentielle.log` ; sorties complètes dans
  `correction-*-validation.log`. Bibliothèque : 12 cas ; routes : 33 cas ; autres comptes inchangés.
- `node scripts/check.mjs --changed` : **vert**, 199/199 tests sur 14 fichiers, règles, format,
  lint, gel et cliquet verts. Sortie `correction-check-changed.log`. Le contrôle complet est lancé ;
  son résultat reste attendu à ce jalon.

- `node scripts/check.mjs` complet après correction : **vert**, 2 089/2 089 tests JavaScript
  sur 131 fichiers et 22 tests Python réussis. Règles, format, lint, gel et cliquet verts.
  Sortie `.harness-state/tickets/T201/correction-check-full.log`. `git diff --check` : sortie 0.
- Nouveau verdict `TERMINÉ` écrit pour la relecture de correction. Les deux mineurs ont leurs
  preuves ; aucun constat contesté ni réserve propre restante. Aucun commit ni push.

### Réserves à la clôture

- .harness-state/tickets/T201/relecture-2.md : `adapters/local-store.cjs:148` (hors périmètre, réserve reconduite)

  - **Ce qui ne va pas.** `new Error('Fichier de session illisible.')` ne porte toujours aucune identité. `SessionLibrary.state()` ne distingue l'échec d'analyse d'une faute système que par l'absence d'errno. Un autre lecteur ou une évolution du store pourrait brouiller cette frontière implicite.
  - **Ce qui est attendu.** Que le store pose un code stable sur l'échec d'analyse, puis que `session-library` teste ce code au lieu de l'absence de `code`.
  - **Pourquoi hors périmètre.** `LocalSessionStore` ne fait pas partie des émetteurs cités par le ticket.
