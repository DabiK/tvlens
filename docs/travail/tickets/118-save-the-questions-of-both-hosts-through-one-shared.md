---
id: T118
titre: Save the questions of both hosts through one shared checkpoint module
statut: a-faire
bloque_par: T157
adr: non
installe: non
harnais: non
supprime_tests: non
---

## Ce que le ticket livre

La règle qui décide quand les questions d'une session sont écrites sur disque est aujourd'hui écrite deux
fois : une copie dans l'hôte Mac, une dans l'hôte serveur. Elle sauvegarde tout de suite quand un job
apparaît, part ou change de statut, et au plus une fois par seconde pour le brouillon d'une réponse. L'ADR
0003 le note dans ses limites. Après ce ticket, cette règle vit dans un seul module, sur le modèle de
`runtime/session-closing.cjs`, et les deux hôtes s'en servent. Le comportement observable ne change pas.

## Sources

- Constats : CORE-01, ADP-07, OUBLI-10
- Code à la version `0d5a954` (les numéros de ligne bougeront au formatage : chercher d'abord le nom) :
  - `app/main.cjs` : variables `unsavedQuestions`, `checkpointTimer`, `savedShape`, ligne 147 ;
    `saveQuestions`, lignes 148-154 ; `checkpoint(target, state)`, lignes 155-160 (délai `1000` écrit en
    dur) ; appel dans `onChange`, ligne 171, avec les seuls jobs de la session chargée ; étape `questions`
    d'`endSession`, `settleQuestions(deep, reason, saveQuestions)`, ligne 366 ; `letGo`, ligne 375, qui
    efface la minuterie et l'état en attente.
  - `runtime/headless-runtime.cjs` : `CHECKPOINT_MS` et `shapeOf`, lignes 66-67 ; champs `unsaved`,
    `checkpointTimer`, `savedShape` initialisés dans le constructeur, lignes 267-269 ; appel
    `this.checkpoint(session, state)` dans `onChange`, ligne 302 ; `checkpoint(session, state)`,
    lignes 403-413 ; `saveQuestions()`, lignes 416-424 (`waiting.session.store.saveResearch`) ; `adopt()`,
    lignes 633-634 ; étape `questions` de `leave()`, ligne 878. `active`, ligne 61, sert aussi aux lignes
    295 et 324 et reste.
  - `runtime/session-runtime.cjs`, objet rendu `runtime`, lignes 435-438 : `store` est une propriété
    fixée à la création du runtime, et aucun code ne la réaffecte. `session.store` au moment du
    `checkpoint` est donc le même store qu'au moment de l'écriture.
  - `runtime/session-closing.cjs` : `settleQuestions(deep, reason, save)`, le modèle de module partagé
    (ADR 0007, point 1).
- Tests qui fixent la règle aujourd'hui :
  - `tests/server-sessions.test.cjs`, « the draft of an answer is published each time it moves and saved at
    most once a second… », ligne 688 (`t.mock.timers.enable({ apis: ['setTimeout'] })`) ;
  - `tests/mac-ipc-contract.test.cjs`, « on the Mac host the draft of an answer reaches the window each
    time it moves and the disk at most once a second… », ligne 758, et « a question is at rest on disk once
    the write that carries its figures has landed… », ligne 798 ;
  - `tests/architecture-f07.test.cjs`, adaptateur serveur, `settled`, ligne 187 : lit `runtime.unsaved` et
    `runtime.checkpointTimer` ; test « both hosts end a session through the shared protocol… »,
    lignes 578-591 : chaque hôte doit contenir `settleQuestions(`.
  - Un fichier de test a pu être renommé par un lot antérieur : retrouver chaque test par son titre.

## Périmètre

- À créer : `runtime/question-checkpoint.cjs`, qui exporte `createQuestionCheckpoint({ delayMs = 1000 })`.
  L'objet rendu a quatre méthodes :
  - `checkpoint(store, state)` : la règle actuelle, mot pour mot. La forme vient des jobs
    (`id:status`). L'état est sauvegardé tout de suite si la forme change ou si aucun job n'est `queued`
    ou `running`. Sinon, une seule minuterie de `delayMs` est posée ;
  - `flush()` : efface la minuterie et remet au store ce qui attend, avec le même
    `.catch(() => {})` et son commentaire (le store garde le refus pour la barrière de fin) ;
  - `forget()` : efface la minuterie, l'état en attente et la dernière forme sauvegardée ;
  - `pending()` : vrai tant qu'un état attend ou qu'une minuterie est posée.
  Le module ne charge rien et ne lit ni `process`, ni disque, ni réseau. Il appelle `setTimeout` et
  `clearTimeout` au moment de l'appel, sans les capturer au chargement, pour que `t.mock.timers`
  s'applique.
- À créer : `tests/question-checkpoint.test.cjs`, tests unitaires sur un faux store et `t.mock.timers` :
  - nouvelle forme sauvegardée tout de suite ;
  - même forme pendant un job actif : une seule écriture après `delayMs`, avec le dernier état ;
  - plus aucun job actif : sauvegarde immédiate ;
  - `forget()` : aucune écriture tardive ;
  - `flush()` et la minuterie écrivent l'état du dernier `checkpoint` dans le store passé avec lui, et
    dans aucun autre ;
  - un refus du store ne lève pas ;
  - le texte du module ne contient ni `require(` ni `process`.
- À modifier :
  - `app/main.cjs` : une instance du module remplace les trois variables, `saveQuestions` et
    `checkpoint`. `onChange` garde son filtre par session et appelle `checkpoint(store, …)`. L'étape
    `questions` devient `settleQuestions(deep, reason, () => questionSaves.flush())` (le nom est
    indicatif). `letGo` appelle `forget()`. Le commentaire « same rule as the server host » est retiré ;
    celui sur la durabilité reste, au-dessus de l'instance.
  - `runtime/headless-runtime.cjs` : une instance créée dans le constructeur, `this.questionSaves`,
    remplace `unsaved`, `checkpointTimer`, `savedShape`, `CHECKPOINT_MS`, `shapeOf`, `checkpoint()` et
    `saveQuestions()`. `onChange` appelle `this.questionSaves.checkpoint(session.store, state)` ; `leave()`
    passe `() => this.questionSaves.flush()` à `settleQuestions(` ; `adopt()` appelle
    `this.questionSaves.forget()`. Le commentaire de `CHECKPOINT_MS` part dans le module.
  - `tests/architecture-f07.test.cjs`, adaptateur serveur, `settled` : la lecture de `runtime.unsaved` et
    `runtime.checkpointTimer` devient `runtime.questionSaves.pending()`. Le sens reste le même : rien
    n'attend et aucune minuterie n'est posée.
- À ne pas toucher : le filtre par session du Mac (ligne 171) ; la porte `asking` (lignes 167 et 289-301) ;
  l'ordre des étapes de fin ; les tests de cadence existants, qui ne changent pas d'une ligne ;
  `runtime/session-closing.cjs`.

## Critères d'acceptation

Chaque critère se vérifie par un test ou une commande.

1. `node --test tests/question-checkpoint.test.cjs` passe. Commande et durée dans le journal.
2. Passent sans modification de leurs assertions, lancés un fichier à la fois, commandes et durées dans
   le journal :
   - `tests/server-sessions.test.cjs` ;
   - `tests/mac-ipc-contract.test.cjs` ;
   - `tests/architecture-f07.test.cjs` (seule `settled` change, voir le périmètre) ;
   - `tests/architecture-f06.test.cjs`.
3. `grep -n "saveResearch" app/main.cjs runtime/headless-runtime.cjs` ne renvoie rien ;
   `grep -n "saveResearch" runtime/question-checkpoint.cjs` renvoie au moins une ligne.
4. `grep -nE "CHECKPOINT_MS|setTimeout\(saveQuestions" app/main.cjs runtime/headless-runtime.cjs` ne
   renvoie rien.
5. Preuve de détection, sans rien committer, modification annulée ensuite. On remplace la condition de
   sauvegarde immédiate par une sauvegarde toujours différée : le test de cadence de
   `tests/server-sessions.test.cjs` et un test de `tests/question-checkpoint.test.cjs` échouent. Commande et
   sortie dans le journal.
6. `node scripts/check.mjs --changed` est vert ; aucune mesure du cliquet ne baisse ; aucun `catch {}`
   vide ajouté. Un contrôle non lancé est rapporté tel quel.

## Test d'acceptation attendu

`tests/question-checkpoint.test.cjs`, le cas « même forme pendant un job actif » (titre en anglais) : frontière du module,
faux store et minuteries simulées. Le comportement des hôtes reste prouvé par le test de cadence de
`tests/server-sessions.test.cjs` (HTTP) et par celui de `tests/mac-ipc-contract.test.cjs` (pont IPC).

## Hypothèses bloquantes

Aucune décision n'est attendue. Le délai reste `1000` ms ; il devient un paramètre du module, pas un
réglage d'hôte.

## Journal
