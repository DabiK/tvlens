---
id: T124
titre: Put a stable code on every Codex and local vision error a retry reads
statut: a-faire
bloque_par: T028, T038
adr: non
installe: non
harnais: non
supprime_tests: non
---

## Ce que le ticket livre

Aujourd'hui, la reprise d'une description (ADR 0008) et le vérificateur reconnaissent les erreurs de Codex
et du modèle local par leur texte français exact. Les émetteurs ne posent aucun code.

Après ce ticket, chaque erreur que ces classifications lisent porte un `code` stable, défini et exporté par
le module qui la lève, sur le modèle de la constante `STORAGE_FULL` (valeur `'TVLENS_STORAGE_FULL'`) de
`adapters/disk-guard.cjs`. Deux champs s'ajoutent : `method` sur le délai d'une requête Codex, `httpStatus`
numérique sur la réponse en erreur du modèle local.

Les messages ne changent pas, et les classifications non plus : elles lisent encore le texte. Le ticket
T125 les fera lire les codes.

## Sources

- Constats : ADP-04
- Correction du relecteur sur ADP-04 :
  - c'est une dette déjà consignée : l'ADR 0008 n'écarte « un code posé à la source » que parce que les
    adaptateurs étaient en lecture seule ;
  - les tests qui passent par les émetteurs réels font échouer un message reformulé ;
  - un émetteur qui oublie son code, ou le message nu « Connexion Codex interrompue. » rangé sous le code
    de la perte en plein tour, changerait ce qui est redemandé (ADR 0008, points 4 et 5).
- Code à la version `0d5a954` (le nom d'abord, la ligne ensuite) :
  - `adapters/codex-rpc.cjs`, classe `CodexRpc` (fichier compact, une méthode par ligne) :
    - `send(value)`, ligne 71 : « Codex déconnecté. » ; `request` rejette la même erreur quand l'envoi
      échoue ;
    - `request(method, params, timeoutMs)`, ligne 72 : « Codex : délai de connexion dépassé (`method`). » ;
    - `fail()`, ligne 78 : « Connexion Codex interrompue. » pour chaque requête en attente ; appelée par
      `close()` (lignes 82-89) et par les événements `error` et `exit` du processus ;
    - export `{ CodexRpc }`.
  - `adapters/codex-session-client.cjs`, classe `CodexSessionClient` :
    - `startThread`, ligne 382, et `foreignThread`, ligne 391 : « Outil hors du périmètre TVLens (fil
      étranger). » ;
    - `checkThread`, lignes 430-433 : « Confinement Codex non confirmé … » ;
    - `unconfirmedSubAgents`, lignes 469-471 : texte de `subAgentRefusal` levé en `Error` ;
    - `refuse`, ligne 479 : « Outil hors du périmètre TVLens (`label`). » ;
    - `event`, ligne 570 : « Connexion Codex interrompue. Réessaie la question. » sur `connection/closed` ;
    - `run`, ligne 717 : « Entrée média non autorisée. » ;
    - `close`, ligne 854, rejet ligne 856 : « Session Codex fermée. » ;
    - export ligne 871 : `{ CodexSessionClient, streamedAnswer, sourceKey }`.
  - `adapters/codex-confinement.cjs` :
    - fonction `assertRole`, lignes 358-362 : « Rôle Codex inconnu … », « Rôle Codex `role` : web ou outils
      non permis. » ; appelée par le constructeur du client (ligne 110) ;
    - fonction `subAgentRefusal`, lignes 200-202 : rend un texte, sans lever ;
    - `module.exports`, ligne 464.
  - `adapters/local-vlm-agent.cjs`, classe `LocalVlmAgent` :
    - constante `CLOSED`, ligne 4 : « Backend local fermé. » ;
    - `run`, ligne 37 : « Backend local : image invalide. » ;
    - `run`, ligne 51 : « Backend local injoignable. » ;
    - `run`, ligne 52 : « Backend local indisponible (HTTP `status`). » ;
    - `close`, ligne 62 : `this.#closing.abort(Error(CLOSED))`, raison rejetée pour la requête en cours,
      la requête en file et tout appel suivant ;
    - export ligne 67 : `{ LocalVlmAgent }`.
  - Lecteurs, non modifiés ici :
    - `adapters/codex-perception.cjs`, fonctions `refused` (ligne 43) et `passing` (ligne 58), listes
      `CONNECTION_LOST` (ligne 23) et `REFUSED` (ligne 34) ;
    - `adapters/codex-verifier.cjs`, fonction `failure`, ligne 34.
  - Modèle à suivre : `adapters/disk-guard.cjs`, ligne 4, `const STORAGE_FULL = 'TVLENS_STORAGE_FULL';`,
    exportée ligne 88 et importée par ses lecteurs.
  - Où le code devient visible :
    - `adapters/chat-trace.cjs`, fonction `safeError`, ligne 13 : garde déjà `code` ;
    - `core/deep-ask.cjs`, ligne 141 : `job.errorDetail`, servi à la TV et sauvegardé ;
    - `tv/app/companion.js`, fonction `describeJob`, lignes 167-174, et `app/ui/job-view.mjs`, lignes
      93-95 : n'affichent que `turnError.code` ;
    - `server/http.cjs`, `catch` des lignes 275-290 : un champ `status` entier de 400 à 599 deviendrait le
      statut de la réponse, et `code` n'est renvoyé que pour un statut autre que 400. D'où le nom
      `httpStatus` pour le modèle local.
- Tests existants :
  - `tests/architecture-f08.test.cjs` (le lot L07 peut le renommer ; on le retrouve par le nom de ses
    tests) :
    - « the messages the adapter relies on are the ones the Codex pipe really writes; the one a closed
      process also answers is left out » ;
    - « behind the real Codex client: a connection lost during the turn is marked… » ;
    - « behind the real local agent: a backend out of reach or answering 5xx is marked… » ;
    - le double `appServer` et l'aide `codex(t, script, options)` (vers la ligne 306) : un tour joué
      `'stalled'` ne reçoit aucune réponse, ce qui permet de fermer le client pendant le tour.
  - `tests/architecture-f05.test.cjs`, lignes 196-211 : « Codex déconnecté. » par le vrai `CodexRpc` et
    le vrai client.
  - `tests/local-vlm-agent.test.cjs` :
    - « timeout, HTTP error and dropped connection reject with stable messages » ;
    - « anything but a base64 image data URL is refused before any request » ;
    - « close aborts the request in flight and refuses every later answer ».
  - `tests/codex-confinement.test.cjs` :
    - « a thread/start answer that contradicts the confinement refuses the connection… » ;
    - « on the real launch path, the default refuses a connection whose sub-agent block is not
      confirmed… » ;
    - « any thread item outside the allow-list of the role rejects the turn… » ;
    - « a thread the host did not start closes the process… » ;
    - « media inputs are inline images only… » ;
    - ligne 624 : `new CodexSessionClient({ role: 'admin' })` lève « Rôle Codex inconnu ».
  - `tests/chat-error-ui.test.cjs`, « generic technical error shows the redacted Codex diagnostic »
    (ligne 61).
  - Aucun test ne vérifie « Session Codex fermée. ».
- Dépendance : `jalon:contrat-fil`, parce qu'une valeur nouvelle apparaît dans `errorDetail.code`, déjà
  servi à la TV.

## Périmètre

- À modifier, chaque émetteur définit et exporte ses constantes, de valeur égale à leur nom :

  | Émetteur | Message à `0d5a954` | Code | Champ ajouté |
  |---|---|---|---|
  | `codex-rpc.cjs`, `send` | « Codex déconnecté. » | `TVLENS_CODEX_DISCONNECTED` | — |
  | `codex-rpc.cjs`, `request` | « Codex : délai de connexion dépassé (`method`). » | `TVLENS_CODEX_REQUEST_TIMEOUT` | `method` |
  | `codex-rpc.cjs`, `fail` | « Connexion Codex interrompue. » | `TVLENS_CODEX_REQUEST_CUT` | — |
  | `codex-session-client.cjs`, `event` (`connection/closed`) | « Connexion Codex interrompue. Réessaie la question. » | `TVLENS_CODEX_CONNECTION_LOST` | — |
  | `codex-session-client.cjs`, `close` | « Session Codex fermée. » | `TVLENS_CODEX_SESSION_CLOSED` | — |
  | `codex-session-client.cjs`, `run` | « Entrée média non autorisée. » | `TVLENS_CODEX_INPUT_REFUSED` | — |
  | `codex-session-client.cjs`, `checkThread`, `unconfirmedSubAgents` | « Confinement Codex non confirmé … » | `TVLENS_CODEX_CONFINEMENT_REFUSED` | — |
  | `codex-session-client.cjs`, `startThread`, `foreignThread`, `refuse` | « Outil hors du périmètre TVLens (…). » | `TVLENS_CODEX_TOOL_REFUSED` | — |
  | `codex-confinement.cjs`, `assertRole` | « Rôle Codex … » | `TVLENS_CODEX_ROLE_REFUSED` | — |
  | `local-vlm-agent.cjs`, `run` | « Backend local : image invalide. » | `TVLENS_LOCAL_VLM_INPUT_REFUSED` | — |
  | `local-vlm-agent.cjs`, `run` | « Backend local injoignable. » | `TVLENS_LOCAL_VLM_UNREACHABLE` | — |
  | `local-vlm-agent.cjs`, `run` | « Backend local indisponible (HTTP n). » | `TVLENS_LOCAL_VLM_UNAVAILABLE` | `httpStatus` (nombre) |
  | `local-vlm-agent.cjs`, `close` | « Backend local fermé. » | `TVLENS_LOCAL_VLM_CLOSED` | — |

  Le message nu « Connexion Codex interrompue. » reçoit un code distinct de la perte en plein tour : l'ADR
  0008 (points 4 et 5) le laisse définitif.
- Si un autre ticket a déjà modifié `receive`, `close` ou `fail` de `adapters/codex-rpc.cjs` (raison de
  fermeture, cause d'un refus), ses ajouts sont gardés : ce ticket n'ajoute que les codes.
- Tests :
  - des assertions sur `code` (et `method`, `httpStatus`) ajoutées à côté des assertions de message
    existantes, dans les tests listés en Sources ;
  - un nouveau test pour « Session Codex fermée. » dans `tests/architecture-f08.test.cjs`, avec le double
    `appServer` existant (tour `'stalled'`), sans nouvelle copie de double ;
  - une assertion dans `tests/chat-error-ui.test.cjs` (critère 7).
- À ne pas toucher :
  - `adapters/codex-perception.cjs` et `adapters/codex-verifier.cjs`, les lecteurs ;
  - les textes des messages ;
  - les erreurs que personne ne classe : « Connexion obsolète. », « Codex : requête refusée. … »,
    « Réponse du modèle local invalide. », erreurs de configuration du constructeur du modèle local ;
  - `core/`, `server/`, `tv/`, `app/`.
- Aucune erreur ne reçoit de champ `status`. Aucun code existant n'est renommé (arbitrage A5).
- Lignes de 160 caractères au plus.

## Critères d'acceptation

Chaque critère se vérifie par un test ou une commande.

1. La commande suivante affiche `TVLENS_CODEX_REQUEST_CUT TVLENS_CODEX_SESSION_CLOSED TVLENS_CODEX_ROLE_REFUSED
   TVLENS_LOCAL_VLM_CLOSED` :

   ```sh
   node -e "console.log(require('./adapters/codex-rpc.cjs').TVLENS_CODEX_REQUEST_CUT, require('./adapters/codex-session-client.cjs').TVLENS_CODEX_SESSION_CLOSED, require('./adapters/codex-confinement.cjs').TVLENS_CODEX_ROLE_REFUSED, require('./adapters/local-vlm-agent.cjs').TVLENS_LOCAL_VLM_CLOSED)"
   ```

   Les tests des critères 2 à 5 importent les constantes des émetteurs et vérifient que chacune vaut son nom.
2. Par le vrai `CodexRpc` (test « the messages the adapter relies on… ») :
   - « Codex déconnecté. » porte `TVLENS_CODEX_DISCONNECTED` ;
   - les délais d'`initialize` et de `turn/start` portent `TVLENS_CODEX_REQUEST_TIMEOUT` et `method` égal
     à `initialize` ou `turn/start` ;
   - la requête `thread/start` coupée par la fermeture porte `TVLENS_CODEX_REQUEST_CUT`, différent de
     `TVLENS_CODEX_CONNECTION_LOST`.
3. Par le vrai client Codex :
   - la perte en plein tour porte `TVLENS_CODEX_CONNECTION_LOST` (`architecture-f08`, sur `error.cause`) ;
   - le confinement non confirmé (les deux tests de `codex-confinement` cités) porte
     `TVLENS_CODEX_CONFINEMENT_REFUSED` ;
   - l'outil ou le fil hors périmètre porte `TVLENS_CODEX_TOOL_REFUSED` ;
   - l'entrée média refusée porte `TVLENS_CODEX_INPUT_REFUSED` ;
   - le rôle `admin` refusé à la construction porte `TVLENS_CODEX_ROLE_REFUSED`.
4. Nouveau test dans `tests/architecture-f08.test.cjs` : fermer le client pendant un tour `'stalled'`
   rejette ce tour avec le message « Session Codex fermée. » et le code `TVLENS_CODEX_SESSION_CLOSED`.
5. Par le vrai `LocalVlmAgent` (`local-vlm-agent` et `architecture-f08`) :
   - l'image refusée porte `TVLENS_LOCAL_VLM_INPUT_REFUSED` ;
   - la coupure porte `TVLENS_LOCAL_VLM_UNREACHABLE` ;
   - une réponse HTTP 500 ou 404 porte `TVLENS_LOCAL_VLM_UNAVAILABLE`, `httpStatus` égal au statut, et
     `status` vaut `undefined` ;
   - la fermeture, pour la requête en cours, la requête en file et l'appel suivant, porte
     `TVLENS_LOCAL_VLM_CLOSED`.
6. Les assertions existantes sur les messages passent sans retouche, et tous les tests de
   `tests/architecture-f08.test.cjs` passent sans retouche d'assertion.
7. Dans `tests/chat-error-ui.test.cjs`, `describeJob` appelé avec
   `errorDetail: { code: 'TVLENS_CODEX_CONNECTION_LOST', turnStatus: 'failed', turnError: { code: 'rate_limit' } }`
   rend `errorDetail` égal à `'Codex · failed · rate_limit'`, comme sans le `code` de premier niveau.
8. `node --test` sur chacun des fichiers de tests modifiés passe, lancés un par un ;
   `node scripts/check.mjs --changed` passe.
9. Mutation, notée au journal avec le résultat observé puis retirée :
   - poser `TVLENS_CODEX_CONNECTION_LOST` au lieu de `TVLENS_CODEX_REQUEST_CUT` dans `CodexRpc.fail` fait
     échouer au moins un test ;
   - retirer le code de la raison de `close` dans `LocalVlmAgent` fait échouer au moins un test.

## Test d'acceptation attendu

`tests/architecture-f08.test.cjs`, test « the messages the adapter relies on are the ones the Codex pipe
really writes; the one a closed process also answers is left out », étendu. Pour les quatre issues du vrai
`CodexRpc` (processus absent, `initialize` sans réponse, `turn/start` sans réponse, requête en attente à la
fermeture), il vérifie le triplet `[message, code, method]`. Frontière : les exports de
`adapters/codex-rpc.cjs`.

## Hypothèses bloquantes

Aucune décision n'est attendue. Les noms suivent la convention `TVLENS_` des codes internes existants
(`TVLENS_STORAGE_FULL`, `TVLENS_VISION_TRANSIENT`). Si le propriétaire les a renommés avant le lancement, on
prend ses noms.

Si un test existant compare une erreur entière par `deepEqual` et casse à cause du champ ajouté : verdict
BLOQUÉ, avec le nom du test. Il n'est pas affaibli.

## Journal
