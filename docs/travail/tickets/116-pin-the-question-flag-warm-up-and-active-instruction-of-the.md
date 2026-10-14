---
id: T116
titre: Pin the question flag, warm-up and active instruction of the Mac host in tests
statut: a-faire
bloque_par: T057, T058, T059, T062, T063, T064
adr: non
installe: non
harnais: non
supprime_tests: non
---

## Ce que le ticket livre

Trois comportements de l'hôte Mac vont être déplacés dans des fonctions partagées avec l'hôte serveur, et
aucun test ne les fixe aujourd'hui côté Mac :

- le drapeau `asking` d'une session pendant une question, et la reprise de l'analyse des passages
  arrivés pendant ce temps ;
- le préchauffage des agents au démarrage et à la reprise ;
- la consigne de la surveillance active, transmise au tour de chat.

Après ce ticket, trois tests du contrat IPC les fixent sur le vrai `app/main.cjs`, tel qu'il se comporte
aujourd'hui. Le code de production ne change pas.

## Sources

- Constats : CORE-01, ADP-07
- Code à la version `0d5a954` (les numéros de ligne bougeront au formatage : chercher d'abord le nom) :
  - `app/main.cjs`, `onChange` passé à `createConversationRuntime`, ligne 167 : `busy` compte les jobs
    `running` ou `queued` dont `sessionId` est celui de `watch`. Quand `busy` change, `watch.asking` est
    posé et émis. Quand il redevient faux, `queueMicrotask(() => watch?.drain())`.
  - `app/main.cjs`, `getInstruction` de la même composition, ligne 164 : la consigne n'est rendue que si
    la surveillance est `enabled` et que son `sessionId` est celui de `watch`. Une erreur rend `undefined`.
  - `app/main.cjs`, handler `watch:start`, lignes 408-409, et handler `sessions:resume`, lignes 460-461 :
    `videoAgent.prepare?.(id).catch(()=>{})` puis `perception.agent?.prepare(id+'-observe').catch(()=>{})`.
    Un `prepare` qui ne rend pas de promesse lève ici.
  - `app/main.cjs`, `videoAgent = conversation.agent`, ligne 173 : l'agent de chat de l'hôte est l'objet
    rendu par la composition. `adopt`, ligne 307 : `perception` vient du runtime de session.
  - `app/main.cjs`, handler `watch:new`, lignes 426-430 : il refuse tant que la session accepte des
    passages ou qu'une analyse tourne ; il faut donc `stop` avant `newSession`.
  - `app/main.cjs`, handler `watch:ask`, lignes 476-479 : `ask(question, { mode: 'chat' })`.
    `core/deep-ask.cjs`, ligne 113 : la consigne n'est passée qu'à un tour en mode `chat`.
  - `runtime/session-runtime.cjs`, construction de la perception, lignes 238-239 : en mode smoke, la
    perception simulée n'a pas de propriété `agent`.
  - `core/session.cjs`, getter et setter `asking`, lignes 76-77 ; `drain()`, lignes 225-228 : rien n'est
    analysé tant que `asking` est vrai (voie héritée, celle du mode smoke).
  - `tests/mac-ipc-contract.test.cjs` : `launch(userData, { wrap })`, ligne 141. `wrap.conversation`
    enveloppe le résultat de `createConversationRuntime` ; `wrap.session` enveloppe celui de
    `createSessionRuntime`, à chaque composition, ouverture d'archive comprise. Le test « on the Mac host
    the draft of an answer reaches the window… », ligne 758, pilote un agent de chat par
    `wrap.conversation` et `built.agent`. Le test « a question neither suspends nor cancels the
    surveillance… », ligne 372, démarre une surveillance et attend le registre. Gestes `capture`,
    ligne 216, et `analysed`, ligne 224.
  - Référence côté serveur : `tests/chat-instruction.test.cjs`, test « the instruction of the active
    surveillance reaches the chat agent of the host… », ligne 11.
- Le lot L05 déplace le banc de lancement vers `tests/helpers/mac-host.cjs`. Ses lignes auront bougé, et
  un fichier de test a pu être renommé : partir de la version intégrée et retrouver chaque test par son
  titre.

## Périmètre

- À modifier : `tests/mac-ipc-contract.test.cjs`, en ajoutant trois tests qui utilisent le banc et les
  gestes du fichier (après L05, ceux de `tests/helpers/mac-host.cjs`).
  1. Question en cours : avec un agent de chat piloté par `wrap.conversation`, une question posée sur la
     session chargée met `asking` à vrai dans l'état de la session. Un passage capturé pendant la réponse
     n'est pas analysé. Quand la réponse se termine, `asking` repasse à faux, et ce passage est analysé
     sans autre geste.
  2. Préchauffage : `prepare` est enregistré sur l'agent de chat (`wrap.conversation`, `built.agent`) et
     sur un agent d'observation posé par `wrap.session` (`runtime.perception.agent = { prepare }`, la
     perception smoke n'en ayant pas). Les deux `prepare` sont `async`. `start` appelle `prepare(id)` et
     `prepare(id + '-observe')` une fois chacun. Après au moins un passage, `stop` puis `newSession`
     archivent la session. `openSession(id)` en lecture seule n'appelle aucun des deux. `resumeSession()`
     les appelle de nouveau avec le même `id`. Un `prepare` qui rejette ne fait échouer ni `start` ni
     `resumeSession`.
  3. Consigne active : l'agent piloté enregistre `input.instruction` à chaque tour de `ask` (mode chat).
     Une question posée avant toute surveillance reçoit `undefined`. Pendant une surveillance active sur
     la session, elle reçoit la consigne (`startSurveillance({ instruction })`, registre prêt). Après
     `stopSurveillance`, elle reçoit `undefined`. C'est le même scénario que le test serveur de
     `chat-instruction`.
- Les titres décrivent le comportement, en anglais, sans nom de chantier ni de ticket.
- À ne pas toucher : `app/main.cjs` et tout code de production ; les tests existants du fichier ; le
  banc partagé, sauf pour un ajout dont le test a besoin et qui ne change rien pour les autres
  utilisateurs du banc.

## Critères d'acceptation

Chaque critère se vérifie par un test ou une commande.

1. `node --test tests/mac-ipc-contract.test.cjs` passe sur le code de production, inchangé. Commande et
   durée dans le journal.
2. Preuve de détection, sans rien committer, chaque modification annulée ensuite. Les essais peuvent
   viser le seul test concerné avec `--test-name-pattern`. Commande et sortie de chaque essai dans le
   journal.
   - On retire `queueMicrotask(() => watch?.drain())` de `onChange` : le test 1 échoue.
   - On retire le `prepare` de l'agent d'observation dans `sessions:resume` : le test 2 échoue.
   - On fait rendre `undefined` à `getInstruction` : le test 3 échoue.
3. Aucune attente non bornée : chaque attente passe par les aides du banc, qui échouent en nommant ce
   qui n'est pas arrivé.
4. `node scripts/check.mjs --changed` est vert. Un contrôle non lancé est rapporté tel quel.

## Test d'acceptation attendu

`tests/mac-ipc-contract.test.cjs`, test 1 (question en cours). La frontière est le pont IPC du vrai
`app/main.cjs`, derrière le faux Electron du banc, avec des fournisseurs simulés.

## Hypothèses bloquantes

Aucune décision n'est attendue. Le filtre par session de `onChange` (ligne 167) n'est pas visé : à
`0d5a954`, la libération vide `deep.jobs` (`letGo` d'`endSession`, ligne 376), et aucun geste du pont n'a
été trouvé qui laisse un job d'une autre session pendant qu'une session est chargée. Si la session en
trouve un, elle l'ajoute au test 1 ; sinon, elle le note au journal.

## Journal
