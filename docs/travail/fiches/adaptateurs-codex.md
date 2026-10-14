# Fiche — Des adaptateurs Codex lisibles (lot L13)

Version du code lue : `0d5a954`, branche `refactor/maintenabilite`. Fiche citée dans les tickets sous le
chemin `docs/travail/fiches/adaptateurs-codex.md`.

Constats du lot : ADP-04, ADP-08, ADP-10, ADP-12, ADP-13. La consigne du lot s'applique : ADP-04 (codes
posés à la source) est une dette déjà consignée par l'ADR 0008, et il conditionne ADP-13. Les corrections
du relecteur priment sur les constats d'origine ; elles sont reprises ici.

Tickets écrits : T124 (codes posés à la source), T125 (la reprise lit les codes, ADR), T126 (une
seule clé de page citée dans `core/`). Le reste est découpé plus tard, sur les déclencheurs du § 8.

## 1. État constaté

### 1.1 La reprise d'une description lit le texte des erreurs (ADP-04)

- `adapters/codex-perception.cjs` classe les échecs pour l'ADR 0008. La fonction `refused(error)` (l.43-55)
  remonte la chaîne `cause` sur 4 niveaux. Elle teste `authRequired`, un ensemble `REFUSED` de 4 messages
  exacts (l.34-39), 2 préfixes `REFUSED_PREFIXES` (l.40) et la regex `LOCAL_REFUSED` des HTTP 4xx (l.41).
  La fonction `passing(error, caller, deadline)` (l.58-71) teste l'échéance de l'adaptateur, puis le
  message « Recherche annulée. » avec `turnStatus === 'interrupted'` sans `turnError`. Elle teste enfin
  l'ensemble `CONNECTION_LOST` de 5 messages exacts (l.23-29) et la regex `LOCAL_UNAVAILABLE` des HTTP 5xx
  (l.30).
- `adapters/codex-verifier.cjs`, fonction `failure(error)` (l.34-41) : trois `startsWith` sur des préfixes
  de messages (« Outil hors du périmètre TVLens », « Confinement Codex », « Rôle Codex »).
- Les émetteurs de ces messages sont au nombre de quatre :
  - `adapters/codex-rpc.cjs` (`send` l.71, `request` l.72, `fail` l.78) ;
  - `adapters/codex-session-client.cjs` (l.382, 391, 430-433, 469-471, 479, 570, 717, 856) ;
  - `adapters/codex-confinement.cjs` (`subAgentRefusal` l.200-202, `assertRole` l.358-362) ;
  - `adapters/local-vlm-agent.cjs` (l.4, 37, 51, 52, `close` l.62).
- Aucun de ces messages ne porte de code. Seuls `authRequired` et `turnStatus` sont des champs lisibles
  par machine. `turnStatus` n'est posé qu'à un endroit (`codex-session-client.cjs`, l.695), et
  `'interrupted'` y va toujours avec « Recherche annulée. ».
- Entre l'émetteur et le classeur, aucun intermédiaire ne recopie le message dans une nouvelle `Error`.
  `codex-analysis-agent.cjs` et `codex-session-agent.cjs` laissent passer l'erreur telle quelle (grep de
  `.message` et de `Error(` vérifié). Un champ `code` posé à la source arrive donc au classeur.

### 1.2 Le client Codex porte six responsabilités (ADP-08)

`adapters/codex-session-client.cjs` fait 871 lignes. Il porte connexion et générations, confinement, fils,
requêtes de Codex, réduction d'événements (`event`, l.555-701), exécution du tour (`run`, l.702) et libellés
d'interface (l.529-535, 620-629). Neuf fichiers de tests et de scripts l'importent par son chemin et lisent
ses champs (`ready`, `rpc`, `dir`, `opened`, `confinement`, `active`). `tests/architecture.test.cjs` (l.22)
cite ce chemin en dur.

### 1.3 Validation sans couche (ADP-10, constat corrigé)

Le relecteur corrige l'exemple. `validateRemote` (`server/remote-media.cjs`, l.29-39) et `validateSegment`
(`runtime/session-runtime.cjs`, l.597-631) ne sont pas deux versions d'une même règle : l'un contrôle le
format de fil de la TV, l'autre le segment assemblé. Ce constat n'est pas propre à Codex.

### 1.4 Duplications (ADP-12)

- Normalisation d'URL en trois copies :
  - `sourceKey` dans `adapters/codex-session-client.cjs` (l.58-67) ;
  - `pageKey` dans `core/verification.cjs` (l.2-8) ;
  - `sourceKey` dans `core/surveillance.cjs` (l.220-227).

  Les deux copies de `core/` font `new URL(String(value))`, celle du client fait `new URL(value)`. Essai
  `node -e` sur 17 entrées (fragment, majuscules, port 443, `http:`, identifiants, chaîne vide, `null`,
  `undefined`, nombre, objet à `toString`, objet `URL`, `Symbol`, tableau, espaces, punycode, `#` final) :
  sorties identiques, car le constructeur `URL` convertit déjà son argument en chaîne.
- L'ensemble des pages ouvertes est construit de la même façon en deux lieux de `core/` :
  `core/verification.cjs` l.30 et `core/surveillance.cjs` l.237.
- La règle de filtrage des sources citées, elle, diffère dans les trois lieux. Elle n'est donc pas une
  duplication :

  | Lieu | Dédoublonnage | Nombre de sources gardées | Contrôle des champs |
  |---|---|---|---|
  | vérification | par URL brute | 6 | `typeof` et `trim` |
  | surveillance | par clé | 3 | `clip` |
  | agent de conversation | aucun | 6 | `typeof` |

- File série `tail` écrite quatre fois :
  - `codex-session-client.cjs`, l.173-183 (deux files, `answer` et `rotateThread`) ;
  - `codex-session-agent.cjs`, l.53-57 ;
  - `local-vlm-agent.cjs`, l.27-31.

  La double mise en file agent + client est voulue : elle garde le tour de réparation des sources
  adjacent à la question.
- `coldStart`/`connectMs` sont calculés deux fois (`codex-session-agent.cjs` l.75-80,
  `codex-session-client.cjs` l.720-728). Ce n'est pas une copie pure : l'agent mesure sa propre préparation
  avant d'appeler le client, qui la voit alors déjà faite (commentaire l.74).
- La validation de sortie est écrite à la main dans chaque adaptateur, par exemple
  `codex-session-agent.cjs` l.111-117 et `codex-perception.cjs` l.181-185.
- Hors constat : `adapters/codex-video-agent.cjs` (l.23, ancien transport MCP) compare les URL brutes, sans
  normalisation. Il n'entre pas dans la forme cible.

### 1.5 Règles de perception dans l'adaptateur (ADP-13, constat corrigé)

`codex-perception.cjs` porte quatre règles : la consigne (l.169), la continuité de sujet (l.186-190),
l'échantillonnage (l.142-150) et la classification (l.43-71). Il sert aussi le modèle local
(`runtime/session-runtime.cjs`, l.267-269) : son nom est trompeur.

Le relecteur apporte deux précisions :
- la classification ne peut entrer dans `core/` qu'après ADP-04 ;
- l'agent est déjà injectable (constructeur l.79, 87-88), donc le gain est de lisibilité, pas de
  testabilité.

Les consignes vivent toutes dans `adapters/` : c'est une convention du dépôt.

### 1.6 Où les codes deviennent visibles

`safeError` (`adapters/chat-trace.cjs`, l.13) garde déjà `code` dans sa liste blanche. Il nourrit
`job.errorDetail` (`runtime/conversation-runtime.cjs` l.65, puis `core/deep-ask.cjs` l.141), publié dans
l'état servi à la TV et sauvegardé. Les deux vues lisent seulement `turnError.code`, jamais le `code` du
premier niveau : `tv/app/companion.js` (l.168-172) et `app/ui/job-view.mjs` (l.93-95).

`server/http.cjs` (l.275-290) répond avec `error.status` quand c'est un entier de 400 à 599, sinon 400. Il
ne publie `code` que si ce statut n'est pas 400. Les erreurs Codex n'ont pas de `status`.

C'est pourquoi le statut du modèle local est porté sous le nom `httpStatus`, jamais `status`. Une erreur
« Backend local indisponible (HTTP 503) » qui atteindrait ce `catch` répondrait sinon 503 avec son code, au
lieu de 400 sans code.

Conséquence : poser un code sur une erreur de conversation ajoute une nouvelle valeur à un champ déjà
publié de l'état. L'affichage ne change pas.

## 2. Forme cible

Le modèle retenu (arbitrage A8) est celui de `runtime/session-closing.cjs` : un module par comportement
partagé, importé par chacun de ceux qui l'appliquaient en copie.

### 2.1 Modules

| Module | Responsabilité | Dépend de | Étape |
|---|---|---|---|
| `adapters/codex-rpc.cjs` | Émet ses erreurs avec un code : déconnecté, délai d'une requête (avec `method`), requête coupée par la fin du processus. Exporte ces codes. | rien de nouveau | 1 |
| `adapters/codex-session-client.cjs` | Émet ses erreurs avec un code : connexion perdue pendant un tour, session fermée, entrée média refusée, confinement non confirmé, outil hors périmètre. Exporte ces codes. | `./codex-rpc.cjs`, `./codex-confinement.cjs` (déjà) | 1 |
| `adapters/codex-confinement.cjs` | `assertRole` lève avec un code ; `subAgentRefusal` reste un texte, que le client lève avec son code de confinement. Exporte le code de rôle. | rien de nouveau | 1 |
| `adapters/local-vlm-agent.cjs` | Émet ses erreurs avec un code : injoignable, indisponible (avec `httpStatus` numérique), image refusée, fermé. Exporte ces codes. | rien de nouveau | 1 |
| `adapters/codex-perception.cjs` | `refused` et `passing` lisent `code`, `method`, `httpStatus`, `turnStatus`, `turnError`, `authRequired`, et plus aucun texte. | les quatre émetteurs ci-dessus, pour leurs constantes | 2 |
| `adapters/codex-verifier.cjs` | `failure` lit les codes au lieu des préfixes. | `./codex-session-client.cjs`, `./codex-confinement.cjs` | 2 |
| `core/source-provenance.cjs` | `sourceKey(value)` : URL `https:` sans identifiants et sans fragment, sinon `null`. `openedKeys(urls)` : ensemble des clés d'une liste de pages ouvertes, vide pour une valeur qui n'est pas un tableau. Pur, sans import. | rien | 3 |
| `core/verification.cjs`, `core/surveillance.cjs` | Importent `./source-provenance.cjs`. `core/surveillance.cjs` réexporte `sourceKey`. Chacun garde sa règle de filtrage. | `./source-provenance.cjs` | 3 |
| `adapters/codex-session-client.cjs` | Importe `sourceKey` depuis `../core/source-provenance.cjs` et continue de l'exporter : `codex-session-agent`, `codex-surveillance-agent` et `scripts/probe-confinement.cjs` l'importent de là. | `../core/source-provenance.cjs` | 3 |
| `core/perception-policy.cjs` (plus tard) | Échantillonnage des images, continuité de sujet, classification d'un échec en refus, en passager ou en définitif. Pur. | codes dans `core/` (décision D3) | 4 |
| Découpage du client Codex (plus tard) | Connexion et générations, fils, réduction des événements, exécution du tour, derrière la façade `adapters/codex-session-client.cjs`. Le chemin et les champs lus par les tests ne bougent pas. | `lot:L04` (ADP-01), étape 2 | 5 |

### 2.2 Les codes posés à la source

Le nom suit la famille interne existante, `TVLENS_` + MAJUSCULES_SOULIGNÉES, comme `TVLENS_STORAGE_FULL`,
`TVLENS_VISION_TRANSIENT` et `TVLENS_RECAP_CAPACITY` (arbitrage A5). L'émetteur définit et exporte la
constante, sur le modèle de `adapters/disk-guard.cjs`. Aucun code existant n'est renommé.

On ne pose un code que sur un message qu'une classification lit aujourd'hui. Les autres erreurs restent sans
code : « Connexion obsolète. », « Codex : requête refusée. … », « Réponse du modèle local invalide. », et les
erreurs de configuration du modèle local.

| Émetteur | Message à `0d5a954` | Code proposé | Champ ajouté |
|---|---|---|---|
| `codex-rpc.cjs`, `send` | « Codex déconnecté. » | `TVLENS_CODEX_DISCONNECTED` | — |
| `codex-rpc.cjs`, `request` | « Codex : délai de connexion dépassé (`method`). » | `TVLENS_CODEX_REQUEST_TIMEOUT` | `method` |
| `codex-rpc.cjs`, `fail` | « Connexion Codex interrompue. » | `TVLENS_CODEX_REQUEST_CUT` | — |
| `codex-session-client.cjs`, `event` (`connection/closed`) | « Connexion Codex interrompue. Réessaie la question. » | `TVLENS_CODEX_CONNECTION_LOST` | — |
| `codex-session-client.cjs`, `close` | « Session Codex fermée. » | `TVLENS_CODEX_SESSION_CLOSED` | — |
| `codex-session-client.cjs`, `run` | « Entrée média non autorisée. » | `TVLENS_CODEX_INPUT_REFUSED` | — |
| `codex-session-client.cjs`, `checkThread` et `unconfirmedSubAgents` | « Confinement Codex non confirmé … » | `TVLENS_CODEX_CONFINEMENT_REFUSED` | — |
| `codex-session-client.cjs`, `startThread`, `foreignThread`, `refuse` | « Outil hors du périmètre TVLens (…). » | `TVLENS_CODEX_TOOL_REFUSED` | — |
| `codex-confinement.cjs`, `assertRole` | « Rôle Codex … » | `TVLENS_CODEX_ROLE_REFUSED` | — |
| `local-vlm-agent.cjs`, `run` | « Backend local : image invalide. » | `TVLENS_LOCAL_VLM_INPUT_REFUSED` | — |
| `local-vlm-agent.cjs`, `run` | « Backend local injoignable. » | `TVLENS_LOCAL_VLM_UNREACHABLE` | — |
| `local-vlm-agent.cjs`, `run` | « Backend local indisponible (HTTP n). » | `TVLENS_LOCAL_VLM_UNAVAILABLE` | `httpStatus` (nombre) |
| `local-vlm-agent.cjs`, `close` | « Backend local fermé. » | `TVLENS_LOCAL_VLM_CLOSED` | — |

Le message nu « Connexion Codex interrompue. » (requête en attente quand le processus s'en va) reçoit un
code distinct de la perte en plein tour : l'ADR 0008 (points 4 et 5) le laisse définitif.

### 2.3 La classification lue sur les codes (étape 2)

L'ordre et le sens de l'ADR 0008 ne changent pas.

- **Refus**, sur l'erreur et sur sa chaîne `cause` jusqu'à 4 niveaux :
  - `authRequired === true` ;
  - `TVLENS_CODEX_INPUT_REFUSED`, `TVLENS_CODEX_CONFINEMENT_REFUSED`, `TVLENS_CODEX_TOOL_REFUSED`,
    `TVLENS_CODEX_SESSION_CLOSED` ;
  - `TVLENS_LOCAL_VLM_INPUT_REFUSED`, `TVLENS_LOCAL_VLM_CLOSED` ;
  - `TVLENS_LOCAL_VLM_UNAVAILABLE` avec un `httpStatus` de 400 à 499.
- **Passager**, une fois l'appelant non annulé et aucun refus trouvé :
  - la raison même de l'échéance ;
  - un tour avec `turnStatus === 'interrupted'` et sans `turnError`, échéance expirée (le message
    « Recherche annulée. » n'est plus lu ; il va toujours avec ce statut, § 1.1) ;
  - `TVLENS_CODEX_CONNECTION_LOST`, `TVLENS_CODEX_DISCONNECTED` ;
  - `TVLENS_CODEX_REQUEST_TIMEOUT` avec `method` égal à `initialize` ou `thread/start` ;
  - `TVLENS_LOCAL_VLM_UNREACHABLE` ;
  - `TVLENS_LOCAL_VLM_UNAVAILABLE` avec un `httpStatus` de 500 à 599.
- **Définitif** : tout le reste, dont `TVLENS_CODEX_REQUEST_CUT` et le délai de `turn/start`.
- **Vérificateur** : `TVLENS_CODEX_TOOL_REFUSED` donne le message fixe de la vérification ;
  `TVLENS_CODEX_CONFINEMENT_REFUSED`, `TVLENS_CODEX_ROLE_REFUSED` ou `authRequired` rendent l'erreur telle
  quelle ; `SyntaxError` et le reste ne changent pas.

### 2.4 Sens des dépendances

`core/` n'importe que `./`. Les adaptateurs importent `core/` (déjà le cas : `codex-perception.cjs` importe
`../core/topic-summary.cjs`). Le classeur importe les constantes des émetteurs ; aucun émetteur n'importe le
classeur. `core/` ne lit aucun code d'adaptateur tant que la décision D3 n'est pas prise.

## 3. Séquence étendre / migrer / contracter

1. **Étendre : les émetteurs posent les codes** (ticket T124). Les messages sont inchangés, les
   classifications aussi. Les assertions des tests existants sur les messages restent ; on y ajoute le code.
2. **Migrer puis contracter : la reprise et le vérificateur lisent les codes** (ticket T125). On retire les
   listes de messages de `codex-perception.cjs` et les préfixes de `codex-verifier.cjs`. Les erreurs
   fabriquées à la main du test des refus reçoivent les codes des émetteurs. Un ADR modifie l'ADR 0008 sur
   ce point.
3. **Étendre, migrer, contracter : une clé de page citée** (ticket T126). On crée
   `core/source-provenance.cjs`, puis les trois copies l'importent et sont retirées dans le même ticket.
   Les exports publics `sourceKey` de `core/surveillance.cjs` et du client restent : leurs importeurs ne
   bougent pas.
4. **Politique de perception dans `core/`** (ADP-13, non découpée).
5. **Découpage du client Codex** (ADP-08, non découpée) :
   1. réduction des événements extraite en fonctions pures, derrière la façade ;
   2. libellés de progression regroupés dans un module d'adaptateur (arbitrage A6 : ils ne vont pas dans
      `core/`) ;
   3. fils (`startThread`, `foreignThread`, `checkThread`, `rotate`) ;
   4. connexion et générations, en dernier, parce que c'est là que vivent les courses fermées par F05.
6. **File série unique** (reste d'ADP-12, non découpée) : par l'aide `settled(promise)` proposée au lot L17.
7. **Validation aux frontières** (ADP-10 et validation de sortie d'ADP-12, non découpées).

## 4. Invariants

- I1. Ce qui est redemandé ne change pas : chaque issue des tests `tests/architecture-f08.test.cjs` reste la
  même (marqué ou non, nombre d'appels, compteurs `visionRetried`, `visionRecovered`, `visionError`).
- I2. Les refus passent d'abord et gagnent toujours, sur l'erreur et sur sa chaîne `cause` (ADR 0008,
  point 4).
- I3. Le message nu « Connexion Codex interrompue. » et le délai de `turn/start` restent définitifs (ADR
  0008, point 5).
- I4. Aucun message vu par l'utilisateur ne change : les tests qui comparent les textes exacts passent sans
  retouche (`local-vlm-agent`, `codex-confinement`, `verification`, `architecture-f08`, `chat-error-ui`).
- I5. Ce que la TV et le Mac affichent d'un échec ne change pas : `describeJob` ne lit pas le `code` du
  premier niveau.
- I6. Aucun statut HTTP, aucune route ni aucun champ nouveau sur `/v1` (arbitrage A7). Seule une valeur
  nouvelle peut apparaître dans `errorDetail.code`, déjà publié. Aucune erreur d'adaptateur ne reçoit de
  champ `status` : `server/http.cjs` en ferait le statut de la réponse.
- I7. Une page citée compte comme ouverte exactement dans les mêmes cas : même clé pour chaque entrée, et
  les règles de filtrage (6 ou 3 sources, dédoublonnage) restent propres à chaque lieu.
- I8. `core/` reste sans import hors de `./` (`tests/architecture.test.cjs`, premier test).
- I9. Les chemins `adapters/codex-session-client.cjs` et `core/surveillance.cjs` et leurs exports restent :
  `sourceKey`, `streamedAnswer`, `CodexSessionClient`.

## 5. Tests qui protègent chaque étape

| Étape | Tests existants qui protègent | Tests qui manquent (à écrire dans le ticket) |
|---|---|---|
| 1 | `architecture-f08` : « the messages the adapter relies on are the ones the Codex pipe really writes… », « behind the real Codex client: a connection lost… », « behind the real local agent… » ; `local-vlm-agent` : « timeout, HTTP error and dropped connection reject with stable messages », « anything but a base64 image data URL is refused… », « close aborts the request in flight… » ; `codex-confinement` (refus de confinement, outil hors périmètre, rôle, entrée média) ; `verification` (refus de confinement porté tel quel). | Le code de chaque émetteur, à côté du message. « Session Codex fermée. » n'est vérifié par aucun test. L'affichage d'un `errorDetail` portant un `code` de premier niveau n'est vérifié nulle part. |
| 2 | Tous les tests `architecture-f08` des l.236 à 394 ; `verification` : « the manual verifier is a web-only role… » (outil hors périmètre) et « the manual verifier is refused like every role… » (confinement). | Une erreur au bon message sans code n'est pas marquée ; une erreur au bon code et au message reformulé l'est. Chaque erreur extérieure du test des refus est marquée quand elle est seule : sinon l'assertion « non marquée à cause de sa cause » passerait à vide. |
| 3 | `chat-sources`, `opened-pages`, `verification` (« a cited page that was never opened is not evidence… »), `surveillance`, et le ticket T120 qui fixe `sourceKey` de `core/surveillance.cjs`. | Un test direct de la clé : https seul, identifiants, fragment, requête gardée, valeurs qui ne sont pas des chaînes, entrée invalide ; et l'identité des fonctions réexportées. |
| 4 | `perception-context`, `topic-summary`, `split-perception`, `architecture-f08`. | Tests unitaires de la politique pure, sans agent. |
| 5 | `codex-connect-race`, `codex-thread-rotation`, `architecture-f05`, `codex-confinement`, `chat-trace`, `review-regressions`. | Tests du protocole du transport (lot L08, ticket T089) ; journal des exceptions du gestionnaire d'événements (lot L04, ticket T046). |
| 6 | `local-vlm-agent` : « answers issued together never overlap on the backend and settle in order… » ; `chat-sources` (tour de réparation adjacent). | Ordre des files du client sous rejet (`answer` et `rotateThread`). |
| 7 | `remote-server`, `tv-panel` (relecteur : seulement si leurs charges suivent le companion réel). | Test de contrat des charges `/v1` (jalon `jalon:contrat-fil`). |

## 6. Risques

- R1. Un émetteur oublie son code, ou range le message nu « Connexion Codex interrompue. » sous le code de
  la perte en plein tour : ce qui est redemandé change. Les tests derrière les émetteurs réels le
  détectent (relecteur).
- R2. Les tests de refus fabriquent leurs erreurs à la main. Après l'étape 2, une erreur sans code n'est
  plus marquée, donc une assertion « non marquée » passerait à vide. Il faut des codes sur les erreurs
  fabriquées et une contre-épreuve (chaque erreur extérieure seule est marquée).
- R3. Une couche future qui recopie le message dans une nouvelle `Error` perdrait le code. Aujourd'hui il
  n'y en a pas (§ 1.1), et les tests derrière le vrai client le détecteraient.
- R4. Le code apparaît dans `job.errorDetail`, sauvegardé et servi à la TV. C'est une valeur nouvelle dans
  un champ existant, non affichée. Un client qui afficherait plus tard le `code` du premier niveau
  montrerait un identifiant technique.
- R5. Fusionner les clés d'URL en changeant un détail (conversion en chaîne, fragment, identifiants)
  changerait les sources gardées. L'essai `node -e` montre l'équivalence ; le test direct de T126 la fixe.
- R6. Le lot L12 prévoit `sourceKey` dans `core/surveillance-verdicts.cjs` (sa fiche, étape 7) et la paire
  `sourceKey`/`pageKey` dans son étape 12. Sans coordination, la clé aurait deux maisons.
- R7. Fichiers partagés avec d'autres lots :
  - `codex-rpc.cjs` avec T046 et T047 (`start`, `receive`) ;
  - `codex-session-client.cjs` avec T005 (`run`) et T046 (`event`).

  Des tickets lancés en même temps se gêneraient. T124 attend donc T047.
- R8. Découpage du client (étape 5) : répartir `generation`, `rpc`, `draining`, `leaving` et `threads`
  peut rouvrir les courses fermées par F05 (relecteur).

## 7. Décisions pour le propriétaire

- D1. Noms des codes : la table du § 2.2 suit la convention `TVLENS_` de la famille interne (A5). Les
  tickets l'appliquent ; le propriétaire peut renommer avant T124.
- D2. ADR : T125 écrit un ADR qui modifie l'ADR 0008 sur un point. Les messages n'y sont plus « recopiés
  (dette) », les codes les remplacent. Les points 1 à 7 de l'ADR 0008 restent.
- D3. Maison unique des codes (arbitrage A5, constat CORE-10 du lot L04). Pour l'instant, chaque émetteur
  exporte les siens. Faire entrer la classification dans `core/` (étape 4) demande que les codes y soient
  définis.
- D4. Contrat de fil (A7) : T124 attend `jalon:contrat-fil`, parce qu'une valeur nouvelle apparaît dans
  `errorDetail.code`, déjà publié. Le propriétaire peut lever cette attente s'il juge qu'une valeur nouvelle
  d'un champ existant non affiché n'est pas une addition au contrat.
- D5. Branche « Rôle Codex » du vérificateur : elle ne s'exécute pas avec la fabrique par défaut, car
  `this.client()` (l.67), qui appelle `assertRole`, est hors du `try`. T125 la garde à l'identique (lue
  par code). Le propriétaire dira plus tard s'il la retire.
- D6. Zod hors de `mcp/` pour ADP-10 et pour la validation de sortie d'ADP-12 (A4) : ADR et décision du
  propriétaire.
- D7. Coordination avec L12 : la clé de page citée vit dans `core/source-provenance.cjs` (T126). Les
  étapes 7 et 12 de la fiche L12 l'importent au lieu de la déplacer.

## 8. Étapes non découpées et leurs déclencheurs

- **Étape 4, ADP-13** (`core/perception-policy.cjs`, renommage en service de perception). Déclencheur, trois
  conditions :
  - T125 intégré ;
  - la décision D3 prise, et les codes définis dans `core/` (lot L04, CORE-10) ;
  - `tests/architecture-f08.test.cjs` renommé par le lot L07, pour citer des tests stables.

  Le renommage touche la composition (`runtime/session-runtime.cjs`, l.180, 259, 267) et la documentation.
  Priorité P3.
- **Étape 5, ADP-08** (découpage du client). Déclencheur, trois conditions :
  - T046 intégré (exception du gestionnaire d'événements, ADP-01) ;
  - T125 intégré ;
  - le double App Server partagé du lot L05 disponible, au lieu des copies locales (dont
    `architecture-f08`, l.307) ;
  - de préférence aussi, les tests de protocole de T089.

  Premier ticket alors : la réduction des événements en fonctions pures, derrière la façade.
- **Étape 6, file série** (reste d'ADP-12). Déclencheur : l'aide `settled(promise)` du lot L17 livrée (ses
  prérequis : GAP1-01, L03, ADP-05). La double file agent + client reste ; seule l'écriture de `tail` est
  remplacée.
- **`coldStart`/`connectMs`** (reste d'ADP-12). Déclencheur : étape 5, quand la préparation de connexion
  aura un seul propriétaire. Avant, la seconde mesure est voulue.
- **Validation de sortie `assertShape`** (reste d'ADP-12) **et ADP-10**. Déclencheur, trois conditions :
  - la décision D6 prise ;
  - `jalon:contrat-fil` atteint ;
  - la table des routes du lot L17 écrite.

  ADP-10 n'est pas propre à Codex : il peut passer dans un lot de frontières.
