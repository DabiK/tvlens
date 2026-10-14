---
id: T046
titre: Reject the active Codex turn when its event handler throws
statut: a-faire
bloque_par: T028
adr: non
installe: non
harnais: non
supprime_tests: non
---

## Ce que le ticket livre

Aujourd'hui, une exception levée pendant le traitement d'une notification Codex est avalée par le
transport : la question en cours reste suspendue jusqu'à son délai, sans trace. Après ce ticket, le
transport continue de lire, signale l'exception, et le client rejette aussitôt la question en cours
avec un message fixe qui garde l'exception comme cause, puis ferme sa connexion pour que la question
suivante ne reçoive pas la fin du tour abandonné.

## Sources

- Constats : ADP-01
- Code vérifié à la version `0d5a954` (le formatage du lot L03 décalera les lignes : chercher par nom) :
  - `adapters/codex-rpc.cjs`, `CodexRpc.start` (l.58-70) : le gestionnaire de `stdout`, l.67, exécute
    `try{this.receive(JSON.parse(line));}catch{}`. Le même `catch` vide couvre la lecture du JSON et
    tout ce que `receive` appelle.
  - `adapters/codex-rpc.cjs`, `CodexRpc.receive` (l.73-77) : branche requête l.74
    (`Promise.resolve(this.onRequest?.(…)).then(…).catch(…)` : un `throw` synchrone de `onRequest`
    sort de `receive` et finit dans le `catch` de la l.67, rien n'est répondu) ; branche notification
    l.75 (`this.onEvent?.(message.method,message.params)`).
  - `adapters/codex-session-client.cjs`, composition du transport (`this.rpcFactory({…})`, l.316-329) :
    `onEvent` appelle `this.event(m, p)` ; `onRequest` lève `Error("Connexion obsolète.")` de façon
    synchrone quand la connexion n'est plus la bonne (l.326).
  - `adapters/codex-session-client.cjs`, `event(method, p)` (l.555) : accès directs sans garde
    `active.turnId = p.turn.id` (l.598), `p.turn.id` (l.681), `p.turn.status` (l.683). Une notification
    `turn/started` qui porte le fil de la session mais pas de champ `turn` lève un `TypeError` l.598
    quand une question est en cours. Le signalement couvre toute exception sortie de `event`, quelle
    qu'en soit l'origine.
  - Modèle de rejet de la question en cours : branche `connection/closed` de `event` (l.566-572),
    `active?.reject(Error("Connexion Codex interrompue. Réessaie la question."))`.
  - Modèle de fermeture après un rejet : `foreignThread()` (l.388-394) rejette la question en cours,
    puis `this.ready = null; this.rpc?.close();` — la question suivante se reconnecte.
  - Le risque que cette fermeture écarte est écrit dans le code, `refuse(active, kind, turnId)`
    (l.474), commentaire l.480-482 : la question est répondue mais le tour continue dans Codex, et le
    tour suivant, qui n'a pas encore d'identifiant, prendrait la fin tardive du précédent pour la
    sienne.
  - `adapters/codex-session-client.cjs`, `trace(event, fields)` (l.170-172) et `safeError` de
    `adapters/chat-trace.cjs` : la trace existante, à réutiliser telle quelle.
  - `adapters/codex-perception.cjs`, `CONNECTION_LOST` (l.23-29) et `passing` (l.58-71) : une erreur
    dont le message n'est pas dans ces listes n'est pas prise pour une coupure passagère.
  - Seuls utilisateurs de `CodexRpc` : `adapters/codex-rpc.cjs` et `adapters/codex-session-client.cjs`.
- Modèles de test :
  - `tests/codex-stream-decoding.test.cjs`, test « an accented character split across two pipe chunks
    reaches the client intact » (l.8) : vrai `CodexRpc` devant un faux binaire écrit dans un dossier
    temporaire.
  - `tests/codex-connect-race.test.cjs` (tests l.35 et l.48) : client piloté par un double passé en
    `rpcFactory`.
  - `tests/review-regressions.test.cjs`, aide locale `appServer({ handle })` (l.27) : un double de
    transport qui compte ses connexions, sait dire lesquelles sont fermées, et fait aboutir une
    question en appelant `options.onEvent` (`item/completed` puis `turn/completed`). Le nouveau test
    écrit son propre double sur ce modèle, dans son fichier.
- Mesure, à la version `0d5a954` : `adapters/codex-rpc.cjs` compte 3 `catch` vides.

  ```sh
  node --input-type=module -e "import fs from 'node:fs';import {measureText} from './scripts/quality/metrics.mjs';console.log(measureText(fs.readFileSync('adapters/codex-rpc.cjs','utf8')))"
  ```

## Périmètre

- À modifier : `adapters/codex-rpc.cjs`, `adapters/codex-session-client.cjs`.
- À créer : `tests/codex-handler-failure.test.cjs`.
- Forme retenue :
  - `CodexRpc` sépare la lecture du JSON de la distribution. Une ligne qui n'est pas du JSON est
    ignorée, avec un commentaire qui dit pourquoi (sortie parasite du binaire).
  - Une exception levée par `onEvent` est remise à un rappel optionnel du constructeur,
    `onFault(error, method)` ; la lecture des lignes suivantes continue. Sans `onFault`, la lecture
    continue aussi. Une exception levée par `onFault` lui-même n'arrête pas la lecture.
  - Un `throw` synchrone de `onRequest` garde son comportement observable d'aujourd'hui : rien n'est
    écrit sur l'entrée du binaire pour cette requête, aucun `onFault`. Un commentaire dit pourquoi
    (connexion remplacée : on ne répond plus sur l'ancienne).
  - `CodexSessionClient` passe un `onFault` qui n'agit que pour la connexion courante
    (`this.rpc === rpc`, comme `onEvent`). Il trace l'exception par `this.trace` avec `safeError`.
    - Question en cours : il la rejette avec le message fixe « Codex : événement illisible. Réessaie
      la question. » et l'exception en `cause`, puis ferme la connexion comme le fait
      `foreignThread()` (`this.ready = null`, `this.rpc?.close()`). Le tour abandonné ne peut plus
      rien envoyer ; la question suivante ouvre une nouvelle connexion.
    - Sans question en cours : la trace seulement, la connexion reste ouverte.
- À ne pas toucher : `adapters/codex-perception.cjs` et ses listes de messages ; les textes français
  existants ; les assertions des tests existants ; la condition d'écriture de `trace` ; `refuse()` et
  `foreignThread()` (le ticket suit leur modèle, il ne les modifie pas).

## Critères d'acceptation

Chaque critère se vérifie par un test ou une commande.

1. Vrai `CodexRpc` devant un faux binaire qui écrit, dans l'ordre, une notification A, une ligne qui
   n'est pas du JSON, puis une notification B, avec un `onEvent` qui lève sur A : B est remise à
   `onEvent` ; `onFault` est appelé exactement une fois, avec l'exception levée et la méthode de A ; la
   ligne non JSON ne provoque aucun appel à `onFault`.
2. Même montage, le faux binaire envoie une requête dont `onRequest` lève de façon synchrone, puis une
   notification : `onFault` n'est pas appelé et la notification est remise. Le faux binaire garde les
   lignes reçues sur son entrée et les rend dans sa réponse à une requête que le test lui envoie
   ensuite par `request()` : aucune de ces lignes ne porte l'identifiant de la requête refusée.
3. Client piloté par un double `rpcFactory` qui remet à `options.onFault` toute exception levée par
   `options.onEvent` (le contrat du critère 1), question en cours : à la réception d'une notification
   `turn/started` portant le fil de la session mais sans champ `turn`, la promesse de la question est
   rejetée avec exactement le message « Codex : événement illisible. Réessaie la question. », et
   `error.cause` est l'exception d'origine. Le test n'attend aucun délai réel de question.
4. Suite du critère 3 : la connexion du double a été fermée (`close()` appelé) ; une question posée
   ensuite ouvre une seconde connexion (second appel à `rpcFactory`) et aboutit avec la réponse de
   cette connexion.
5. Même client, sans question en cours : un signalement remis à `options.onFault` ne lève rien, ne
   ferme pas la connexion, et une question posée ensuite aboutit sur la même connexion.
6. La commande de mesure ci-dessus rend `catch_vides` inférieur ou égal à 2 pour
   `adapters/codex-rpc.cjs`.
7. `node --test --test-concurrency=1 tests/codex-stream-decoding.test.cjs tests/codex-connect-race.test.cjs tests/architecture-f05.test.cjs tests/architecture-f08.test.cjs tests/review-regressions.test.cjs`
   passe sans qu'aucune assertion existante soit modifiée.
8. `node scripts/check.mjs` est vert.

## Test d'acceptation attendu

`tests/codex-handler-failure.test.cjs`. Deux frontières publiques : le constructeur et les rappels de
`CodexRpc` devant un vrai processus (faux binaire, comme dans `tests/codex-stream-decoding.test.cjs`),
puis la promesse rendue par le client à qui pose une question, avec un double `rpcFactory` écrit dans
le fichier (modèles : `tests/codex-connect-race.test.cjs` et `appServer` de
`tests/review-regressions.test.cjs`).

## Hypothèses bloquantes

Aucune décision n'est attendue. Le texte du rejet est nouveau et suit la forme de « Connexion Codex
interrompue. Réessaie la question. ». La fermeture de la connexion après le rejet suit le modèle de
`foreignThread()`. Si un test existant exige qu'une exception de gestionnaire reste silencieuse, ou
si aucune notification ne fait lever `event` à la version traitée : verdict BLOQUÉ, avec le nom du
test ou l'écart constaté.

## Journal
