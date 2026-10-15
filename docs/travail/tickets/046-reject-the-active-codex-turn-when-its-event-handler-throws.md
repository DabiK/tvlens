---
id: T046
titre: Reject the active Codex turn when its event handler throws
statut: termine
bloque_par: T163
adr: non
installe: non
harnais: non
supprime_tests: non
niveau: sensible
---

## Ce que le ticket livre

Aujourd'hui, une exception levée pendant le traitement d'une notification Codex est avalée par le
transport : elle ne rejette pas la question en cours, qui peut rester suspendue jusqu'à son délai.
Après ce ticket, le transport continue de lire, signale l'exception, et le client rejette aussitôt la question en cours
avec un message fixe qui garde l'exception comme cause, puis ferme sa connexion pour que la question
suivante ne reçoive pas la fin du tour abandonné.

## Sources

- Constats : ADP-01 ; `docs/audit-points-chauds.md`, sections E et F (entrée T046), retenu par décision du propriétaire, le 15/10.
- Code vérifié par lecture à la version `e92c6a6` (chercher les symboles si T150 a décalé les lignes) :
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
  - Le chemin produit construit `CodexRpc` par `spawnRpc` (`adapters/codex-session-client.cjs:27`),
    utilisé comme fabrique par défaut par le constructeur (`adapters/codex-session-client.cjs:98`).
    `scripts/probe-confinement.cjs:119` le construit aussi directement ; les tests de transport l'importent.
    Ces appelants doivent pouvoir omettre le nouveau rappel.
  - Fermeture : `CodexRpc.close` (`adapters/codex-rpc.cjs:82`) garde la barrière du groupe de processus ;
    `CodexSessionClient.finish` (`adapters/codex-session-client.cjs:820`) l'attend avant de retirer son arbre.
    Le signalement d'une exception ne contourne pas ce protocole (ADR 0005).
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
- Relevé statique à `e92c6a6` : trois `catch` vides dans `adapters/codex-rpc.cjs:17`, `:67` et `:74`.
  La commande suivante est une vérification attendue du traitement, pas une mesure exécutée ici.

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
    Le rejet asynchrone garde sa réponse d'erreur JSON-RPC actuelle.
  - `CodexSessionClient` passe un `onFault` qui n'agit que pour la connexion courante
    (`this.rpc === rpc`, comme `onEvent`). Il trace l'exception par `this.trace` avec `safeError`.
    La trace reste conditionnelle : rôle client (`webSearch` ou `surveillance`) et réglage de trace existants.
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
   Le même ordre est vérifié sans rappel `onFault`, puis avec un rappel qui lève lui-même : B est
   toujours remise et aucune exception du rappel n'arrête le lecteur.
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
   Un signalement d'une ancienne connexion ne rejette pas la question ni ne ferme la connexion courante.
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

Aucune décision n'est attendue.

Le cas malformé est déduit des accès directs de `event`, pas observé chez un vrai fournisseur.
Son rejet immédiat et la reconnexion restent à prouver par les doubles ci-dessus.
Le texte du rejet est nouveau et suit la forme de « Connexion Codex
interrompue. Réessaie la question. ». La fermeture de la connexion après le rejet suit le modèle de
`foreignThread()`. Si un test existant exige qu'une exception de gestionnaire reste silencieuse, ou
si aucune notification ne fait lever `event` à la version traitée : verdict BLOQUÉ, avec le nom du
test ou l'écart constaté.

## Journal

- Rafraîchi le 15/10 contre `e92c6a6` : T028 et T145 remplacés par T150, niveau sensible ; catch commun
  au décodage et au gestionnaire confirmé, appelant direct de la sonde réintégré à l'inventaire, barrières de
  fermeture et trace conditionnelle précisées. Preuves du rappel absent, défaillant ou obsolète explicitées.
  Relevés statiques seulement ; aucun test ni fournisseur exécuté.

- Contrôle documentaire : `node scripts/check.mjs --changed` lancé une fois, code 0, vert.
  Aucun fichier de test modifié, donc aucun test exécuté ; Markdown ignoré par Prettier.
  ESLint non lancé (absent ou non configuré). En-têtes, sections et repères contrôlés séparément par lecture.

- Relecture documentaire le 15/10 contre `e92c6a6` : sources rendues pérennes dans
  `docs/audit-points-chauds.md` ou attribuées à la décision du propriétaire, le 15/10.

- Exploration Codex le 15/10 sur `2a1bbea` : défaut et notification malformée toujours présents ;
  modèle de fermeture et trace conditionnelle confirmés par lecture. Détails et écarts prévus dans
  `.harness-state/tickets/T046/`. Mesure initiale : commande `measureText` des sources exécutée,
  code 0, `{ lignes_longues: 6, catch_vides: 3 }`. Aucun fournisseur exécuté.

- Transport, tests d'abord : `node --test --test-concurrency=1 tests/codex-handler-failure.test.cjs`
  rouge observé (0/1, `onFault` absent), puis vert (1/1). Cas de compatibilité ajoutés : 5/5 verts,
  avant et après séparation JSON/distribution. Sorties dans `transport-*.log` du dossier d'état.
  `node_modules/.bin/eslint --prune-suppressions adapters/codex-rpc.cjs` : code 0 ; gel `no-empty`
  abaissé de 3 à 1 après signalement du contrôle rapide, sans hausse ailleurs.

- Client, même commande : rouge observé (5/6, rejet absent), puis vert (6/6). Le complément avec vrai
  transport et `turn/start` en attente échoue sur le message générique de fermeture (12/13) ;
  conservation du premier défaut dans `run`, puis 13/13 verts. Raisonnement consigné dans `ecarts.md`.
  Preuves ajoutées pour les signalements inactifs et obsolètes, les filtres de trace et `safeError`.

- `node scripts/check.mjs --changed` : code 0, vert, 14/14 tests dédiés. Le cas supplémentaire conserve
  la tolérance existante des valeurs JSON non objets. La commande `measureText` des sources rend
  `{ lignes_longues: 4, catch_vides: 1 }`, code 0. Sorties : `check-changed.log`, `metrics.log`.

- `node --test --test-concurrency=1 tests/codex-stream-decoding.test.cjs tests/codex-connect-race.test.cjs tests/architecture-f05.test.cjs tests/architecture-f08.test.cjs tests/review-regressions.test.cjs` :
  code 0, 56/56 tests verts, aucun ignoré ni annulé. Aucune assertion existante modifiée.
  Sortie : `.harness-state/tickets/T046/regressions.log`.

- Contrôle final : `node scripts/check.mjs`, code 0, vert. Règles, format, lint, gel du lint et cliquet
  verts ; 1 162/1 162 tests JS sur 98 fichiers ; 84 tests Python, résultat OK avec 1 ignoré.
  Sortie : `.harness-state/tickets/T046/check-full.log`. `git diff --check` : code 0.
  Verdict `TERMINÉ` écrit dans le dossier d'état ; relecture et intégration laissées à la boucle.
  Aucun commit, push ni fournisseur réel.

- Reprise après `.harness-state/tickets/T046/relecture-1.md` : constat mineur accepté sur la priorité
  indue du défaut de gestionnaire après un autre rejet. Lecture du rapport, du journal, des écarts,
  de l'état Git et du diff effectuée ; correction prévue et réserve hors périmètre consignées dans
  le dossier d'état. Tests de conservation du refus de garde et du diagnostic 401 à ajouter d'abord.

- Correction, tests d'abord : `node --test --test-concurrency=1 tests/codex-handler-failure.test.cjs`,
  code 1, 14/15 réussis ; nouveau test rouge sur le message de garde remplacé par le défaut.
  Retrait de `handlerFailure` et de la priorité dans le `catch` ; écoute du rejet de la question
  dès l'attente de `turn/start`. Même commande : code 0, 15/15 réussis, puis 19/19 avec les cas
  complémentaires (garde pendant le démarrage fermé, diagnostic 401 avant/après acquittement,
  succès du tour qui attend toujours l'acquittement). Aucune assertion antérieure modifiée.
  Sorties : `correction-1-guard-red.log`, `correction-1-guard-green.log`, `correction-1-cases-green.log`.

- `node scripts/check.mjs --changed` : code 0, vert, 19/19 tests dédiés ; règles, format, lint, gel
  et cliquet verts (`correction-1-check-changed.log`).
  `node --test --test-concurrency=1 tests/codex-stream-decoding.test.cjs tests/codex-connect-race.test.cjs tests/architecture-f05.test.cjs tests/architecture-f08.test.cjs tests/review-regressions.test.cjs` :
  code 0, 56/56 réussis, aucun ignoré ni annulé (`correction-1-regressions.log`).
  `git diff --check` : code 0. Tous les journaux sont dans `.harness-state/tickets/T046/`.

- Contrôle complet après correction : `node scripts/check.mjs`, code 0, vert ; 1 167/1 167 tests JS
  sur 98 fichiers ; 84 tests Python, OK avec 1 ignoré. Règles, format, lint, gel et cliquet verts.
  Sortie : `.harness-state/tickets/T046/correction-1-check-full.log`. Constat mineur 1 corrigé ;
  réserve hors périmètre 2 (seuil du tampon sans nom) conservée dans `reste` du nouveau verdict
  `TERMINÉ`. Relecture de correction et intégration laissées à la boucle. Aucun commit ni push.

### Réserves à la clôture

- Réserve hors périmètre de la relecture 1, constat 2 : adapters/codex-rpc.cjs conserve le seuil de tampon 4000000 sans constante nommée. Ce nombre préexistait au ticket ; il n'a pas été modifié pendant la correction.
- .harness-state/tickets/T046/relecture-2.md : `adapters/codex-rpc.cjs:73` (hors périmètre, reconduit)

  `if(buffer.length>4000000)return this.close();` : la taille limite du tampon reste un nombre magique sans nom (standards, « Les constantes portent un nom »). Le nombre existait avant le ticket, qui ne demande pas de le nommer. C'est une réserve, déjà inscrite par l'implémenteur dans `reste` du verdict.
- .harness-state/tickets/T046/relecture-2.md : **Écart accepté, périmètre (élagage du gel ESLint).** Inchangé depuis la relecture 1 : `no-empty` passe de 3 à 1, comme les standards l'exigent.
- .harness-state/tickets/T046/relecture-2.md : **Écart accepté, critère 3 étendu au vrai transport (complément dans `run`).** La nouvelle forme, écouter `done` dès l'attente de `turn/start`, rend à l'appelant le premier motif de rejet. Le défaut de gestionnaire ne passe plus devant un refus de la garde ou un diagnostic 401. L'affirmation de `ecarts.md` est exacte : « un succès du tour ne remplace pas l'acquittement attendu de `turn/start` ». Le test « a completed turn still waits for the start acknowledgment » la prouve.
