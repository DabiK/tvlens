---
id: T047
titre: Keep the redacted Codex refusal detail as the cause of the fixed message
statut: a-faire
bloque_par: T046
adr: non
installe: non
harnais: non
supprime_tests: non
---

## Ce que le ticket livre

Quand Codex refuse une requête, le transport jette le détail de l'erreur et toute la sortie d'erreur
du binaire : il ne reste que la phrase fixe « Codex : requête refusée. … ». Après ce ticket, la phrase
ne change pas, mais l'erreur porte en cause un résumé borné et expurgé du refus et de la fin de la
sortie d'erreur ; une fermeture pour débordement dit sa raison ; la trace existante d'un tour rejeté
reprend ce détail. La condition d'écriture des traces ne change pas.

## Sources

- Constats : ADP-02
- Code vérifié à la version `0d5a954` (chercher par nom, les lignes bougeront) :
  - `adapters/codex-rpc.cjs`, `CodexRpc.receive` (l.73-77) : l.76,
    `pending.reject(Error('Codex : requête refusée. Vérifie le modèle sélectionné et la connexion.'))` ;
    `message.error` n'est conservé nulle part.
  - `adapters/codex-rpc.cjs`, `CodexRpc.start` : l.68, `child.stderr?.on('data',()=>{})` jette la sortie
    d'erreur ; l.67, `if(buffer.length>4000000)return this.close();` ferme sans dire pourquoi.
  - `adapters/codex-rpc.cjs`, `fail()` (l.78) : rejette les requêtes en attente avec « Connexion Codex
    interrompue. » et émet `onEvent('connection/closed',{})` ; `close()` (l.82-89) appelle `fail()`.
    La raison d'une fermeture doit donc traverser `close()` puis `fail()`.
  - `adapters/chat-trace.cjs` : `clean(value, max = 240)` (l.2-9, non exportée) expurge URL, jetons
    `Bearer`, clés `sk-`/`nvapi-`, champs de secret et longues chaînes opaques, remplace les fins de
    ligne par des espaces et garde le début (`slice(0, max)`) ; elle n'expurge pas les chemins.
    `safeError` (l.13) ; `trace(event, fields)` n'écrit sur `process.stderr` que si
    `TVLENS_CODEX_TRACE === '1'` ; exports `{trace, safeError, isAuthFailure, VERSION}`.
  - `adapters/codex-session-client.cjs`, `trace(event, fields)` (l.170-172) : n'écrit que si
    `this.webSearch || this.role === "surveillance"`. `event(method, p)` (l.555) trace `turn/started`,
    `turn/completed`, `error`, `connection/closed`. Le `catch` de la question (l.804-805) trace
    `turn.rejected` avec `{error: safeError(error), auditCount}`.
  - `adapters/codex-perception.cjs`, `refused(error)` (l.43-55) : remonte `error.cause` sur quatre
    niveaux et lit `message` et `authRequired` de chaque maillon. Une cause qui porterait un `message`
    reconnu par `REFUSED` (l.35-40) ou `CONNECTION_LOST` (l.23-29) changerait le classement de
    l'erreur : la cause ajoutée ici ne doit donc exposer ni `message` ni `authRequired`.
  - Texte épinglé par des tests : `tests/codex-thread-rotation.test.cjs:96`,
    `tests/codex-confinement.test.cjs:310`.
  - `tests/chat-trace.test.cjs`, « failed turn emits correlated sanitized diagnostics without changing
    rejection » (l.4) : sa dernière assertion (l.14) exige qu'un client sans recherche web et de rôle
    par défaut n'écrive aucune ligne de trace pour un tour échoué, même avec `TVLENS_CODEX_TRACE=1`.
    Le ticket n'élargit donc pas la trace à tous les rôles (reporté, décision du propriétaire).
- Modèles de test : `tests/codex-stream-decoding.test.cjs` (vrai `CodexRpc`, faux binaire) ;
  `tests/chat-trace.test.cjs`, tests l.4 et « error summary is bounded and drops arbitrary payloads »
  (l.18).

## Périmètre

- À modifier : `adapters/codex-rpc.cjs`, `adapters/chat-trace.cjs` (exporter l'expurgation),
  `adapters/codex-session-client.cjs`, `tests/chat-trace.test.cjs` ; le fichier de test créé par le
  ticket précédent du lot pour le transport (`tests/codex-handler-failure.test.cjs`) ou
  `tests/codex-stream-decoding.test.cjs`.
- Forme retenue :
  - `CodexRpc` garde la fin de la sortie d'erreur du binaire, bornée en mémoire. La fin gardée fait au
    plus 2000 caractères et ne contient que des lignes entières : chaque ligne est expurgée seule, et
    la ligne que la fenêtre couperait est écartée (un jeton coupé en deux échapperait à
    l'expurgation).
  - L'erreur de la l.76 garde son message à l'identique et reçoit
    `cause: { codexError: safeError(message.error), stderrTail: <fin expurgée> }` : un objet simple,
    sans propriété `message` ni `authRequired`.
  - La fermeture pour débordement passe sa raison : `connection/closed` est émis avec
    `{ reason: 'stdout-overflow' }` ; les autres fermetures gardent des paramètres sans `reason`.
  - Dans le client, sans toucher à la condition de `trace` : la trace `turn.rejected` reprend, quand
    l'erreur en porte, `cause.codexError` et `cause.stderrTail` dans un champ `detail` ; la trace
    `connection/closed` reprend `reason` quand il est présent.
- La cause reste dans le processus : ni la réponse HTTP du serveur ni `safeError` ne recopient
  `cause`. Un chemin de l'hôte peut donc y figurer sans partir vers un client.
- À ne pas toucher : le texte « Codex : requête refusée. Vérifie le modèle sélectionné et la
  connexion. » ; `adapters/codex-perception.cjs` ; les règles d'expurgation existantes (elles ne peuvent
  qu'être réutilisées) ; la condition d'écriture de `trace` dans le client (rôle et recherche web).

## Critères d'acceptation

Chaque critère se vérifie par un test ou une commande.

1. Vrai `CodexRpc` devant un faux binaire qui écrit, dès son lancement, sur sa sortie d'erreur une
   ligne contenant un repère sans secret (`repere-stderr`), `Bearer abcdef123456` et
   `sk-test1234567890`, qui répond normalement à une première requête, puis répond à une seconde par
   une erreur : la seconde promesse est rejetée avec exactement « Codex : requête refusée. Vérifie le
   modèle sélectionné et la connexion. ». (La première requête sert à ce que la sortie d'erreur soit
   lue avant le refus : les deux tuyaux n'ont pas d'ordre entre eux.)
2. Même rejet : `error.cause` est un objet dont `message` et `authRequired` sont `undefined` ;
   `cause.codexError` reprend le code et le message de l'erreur du binaire, expurgés ;
   `cause.stderrTail` contient `repere-stderr` et fait au plus 2000 caractères ;
   `JSON.stringify(error.cause)` ne contient ni `abcdef123456` ni `sk-test1234567890`.
3. Faux binaire dont la sortie d'erreur dépasse 2000 caractères, avec une ligne
   `Bearer jeton-a-cheval-123456` placée de sorte que la fenêtre des 2000 derniers caractères commence
   au milieu du jeton : après un refus obtenu comme au critère 1, `JSON.stringify(error.cause)` ne
   contient aucun fragment du jeton (`cheval-123456`).
4. Faux binaire qui écrit plus de 4 000 000 caractères sans fin de ligne : `onEvent` reçoit
   `connection/closed` avec `reason: 'stdout-overflow'`, et la requête en attente est rejetée avec
   « Connexion Codex interrompue. » comme aujourd'hui. Une fermeture par `close()` émet
   `connection/closed` sans `reason`.
5. Client avec recherche web (`webSearch: true`), `TVLENS_CODEX_TRACE=1`, écriture de `process.stderr`
   capturée comme dans le test l.4 de `tests/chat-trace.test.cjs` : une question rejetée par une
   erreur portant la cause du critère 2 laisse une ligne `turn.rejected` dont `detail.codexError` et
   `detail.stderrTail` sont présents, et la ligne sérialisée ne contient aucun des deux secrets.
6. `node --test --test-concurrency=1 tests/chat-trace.test.cjs tests/architecture-f08.test.cjs tests/codex-thread-rotation.test.cjs tests/codex-confinement.test.cjs tests/codex-stream-decoding.test.cjs`
   passe sans qu'aucune assertion existante soit modifiée : l'absence de trace pour un client sans
   recherche web (l.14 de `tests/chat-trace.test.cjs`) et le classement des refus et des coupures
   restent ceux d'aujourd'hui (tests « a refusal is never marked, even with the deadline already
   expired… » l.261 et « the messages the adapter relies on are the ones the Codex pipe really
   writes… » l.291 de `tests/architecture-f08.test.cjs`).
7. `node scripts/check.mjs` est vert.

## Test d'acceptation attendu

Critères 1 à 4 : par le constructeur et les promesses de `CodexRpc`, devant un vrai processus (faux
binaire), dans le fichier de test du transport. Critère 5 : par la question posée au client (double
`rpcFactory`) et la sortie d'erreur du processus, dans `tests/chat-trace.test.cjs`, en cas ajouté.

## Hypothèses bloquantes

Aucune décision n'est attendue. Écrire les traces d'échec pour tous les rôles est écarté de ce
ticket : une assertion existante exige leur absence. Si le champ `detail` ajouté à la trace
`turn.rejected` fait échouer un test existant : verdict BLOQUÉ, avec le nom du test.

## Journal
