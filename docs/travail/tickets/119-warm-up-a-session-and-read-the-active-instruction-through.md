---
id: T119
titre: Warm up a session and read the active instruction through shared functions
statut: a-faire
bloque_par: T116, T117, T118
adr: non
installe: non
harnais: non
supprime_tests: non
---

## Ce que le ticket livre

Deux petites règles de cycle de vie sont écrites dans chacun des deux hôtes. La première préchauffe les
agents d'une session qui démarre ou reprend. La seconde donne la consigne de la surveillance active au
tour de chat. Le commentaire du serveur dit « Same warm-up as the Mac host », mais les deux copies ont
déjà divergé : l'appel à l'agent d'observation n'a pas la même forme. Après ce ticket, chaque règle vit
dans un module de `runtime/`, sur le modèle de `runtime/session-closing.cjs`, et les deux hôtes s'en
servent.

## Sources

- Constats : CORE-01, ADP-07
- Code à la version `0d5a954` (les numéros de ligne bougeront au formatage : chercher d'abord le nom) :
  - `app/main.cjs`, handler `watch:start`, lignes 408-409, et handler `sessions:resume`, lignes 460-461 :
    `videoAgent.prepare?.(id).catch(()=>{})` puis `perception.agent?.prepare(id+'-observe').catch(()=>{})`.
    Un agent d'observation sans `prepare`, ou un `prepare` qui ne rend pas de promesse, lève ici.
  - `runtime/headless-runtime.cjs`, `warmUp(session)`, lignes 644-649 :
    `Promise.resolve(session.perception?.agent?.prepare?.(…)).catch(() => {})` pour l'agent
    d'observation, ce qui tolère les deux cas. Appelé par `start()` (ligne 673) et `resume(id)`
    (ligne 1035).
  - `app/main.cjs`, `getInstruction` de `createConversationRuntime`, ligne 164 ;
    `runtime/headless-runtime.cjs`, `activeInstruction()`, lignes 376-385, appelée par `getInstruction`,
    ligne 288. Même règle des deux côtés : la consigne si la surveillance est `enabled` et que son
    `sessionId` est celui de la session chargée, sinon `undefined`. Une erreur rend aussi `undefined`.
  - Les `prepare` de production rendent tous une promesse : `adapters/codex-session-agent.cjs`
    (`async prepare`, ligne 47), `adapters/codex-analysis-agent.cjs` (`prepare`, ligne 19),
    `adapters/local-vlm-agent.cjs` (`prepare`, ligne 24).
- Tests qui fixent ces règles : ceux de T116 (hôte Mac) et T117 (hôte serveur) ;
  `tests/chat-instruction.test.cjs`, « the instruction of the active surveillance reaches the chat agent of
  the host… », ligne 11 ; `tests/deep-ask-restore.test.cjs`, ligne 60 (un `getInstruction` qui lève).
  Un fichier de test a pu être renommé par un lot antérieur : retrouver chaque test par son titre.

## Périmètre

- À créer :
  - `runtime/session-warm-up.cjs`, qui exporte `warmUp({ chat, perception, sessionId })`. Il appelle
    `chat?.prepare?.(sessionId)` et `perception?.agent?.prepare?.(sessionId + '-observe')`, chacun dans
    `Promise.resolve(…).catch(() => {})`. C'est la forme tolérante du serveur, retenue pour les deux
    agents. Le commentaire « never for an archive that is only being read » reste à l'appelant.
  - `runtime/active-instruction.cjs`, qui exporte `activeInstruction(surveillance, sessionId)` : la règle
    actuelle, `try` et `catch` compris (le `catch` rend `undefined`, il n'est pas vide).
  - Ni l'un ni l'autre ne charge un module ou ne lit `process`.
  - `tests/session-warm-up.test.cjs` : les deux agents appelés avec le bon identifiant. Sont tolérés : un
    agent absent, un `prepare` absent, un `prepare` qui rend `undefined`, un `prepare` qui rejette (aucun
    rejet non traité).
  - `tests/active-instruction.test.cjs` : consigne rendue pour une surveillance active sur la session ;
    `undefined` pour une autre session, une surveillance arrêtée, une surveillance absente, un `snapshot`
    qui lève.
- À modifier :
  - `app/main.cjs` : les deux paires de lignes de préchauffage appellent
    `warmUp({ chat: videoAgent, perception, sessionId })`. `getInstruction` appelle
    `activeInstruction(surveillance, watch?.id)`, évalué à chaque appel (la surveillance est composée
    plus bas).
  - `runtime/headless-runtime.cjs` : `warmUp(session)` et `activeInstruction()` délèguent aux modules,
    ou disparaissent si plus rien d'autre ne les appelle. Le commentaire « Same warm-up as the Mac host »
    est retiré.
- À ne pas toucher : le moment où chaque hôte préchauffe (démarrage et reprise, jamais l'ouverture en
  lecture seule) ; la porte `asking` ; le module de sauvegarde des questions ; les tests de T116 et
  T117, qui ne changent pas d'une ligne.

## Critères d'acceptation

Chaque critère se vérifie par un test ou une commande.

1. `node --test tests/session-warm-up.test.cjs` et `node --test tests/active-instruction.test.cjs`
   passent. Commandes et durées dans le journal.
2. Passent sans modification, lancés un fichier à la fois, commandes et durées dans le journal :
   `tests/mac-ipc-contract.test.cjs` (dont les tests de T116), `tests/server-warm-up.test.cjs`,
   `tests/chat-instruction.test.cjs`, `tests/deep-ask-restore.test.cjs`, `tests/server-sessions.test.cjs`.
3. `grep -n "\.prepare" app/main.cjs runtime/headless-runtime.cjs` ne renvoie plus qu'une ligne : celle
   du vérificateur de l'hôte Mac (`verify` de `VerificationService`, ligne 236 à `0d5a954`), qui n'est pas
   un préchauffage. À `0d5a954`, cette commande renvoie sept lignes.
4. `grep -n "activation?.instruction" app/main.cjs runtime/headless-runtime.cjs` ne renvoie rien.
5. `node scripts/check.mjs --changed` est vert ; aucune mesure du cliquet ne baisse. Un contrôle non lancé
   est rapporté tel quel.

## Test d'acceptation attendu

`tests/session-warm-up.test.cjs`, le cas d'un `prepare` qui rend `undefined` (titre en anglais) : c'est la seule
différence de comportement possible pour l'hôte Mac, et elle ne concerne aucun agent de production.
L'équivalence sur les deux hôtes reste prouvée par les tests de T116 et T117.

## Hypothèses bloquantes

Aucune décision n'est attendue. La forme tolérante est celle que le serveur applique déjà à l'agent
d'observation. Elle ne change rien pour les agents de production, qui rendent tous une promesse. Le
ticket attend T118 parce que les deux touchent la même composition de la conversation, dans les deux
hôtes.

## Journal
