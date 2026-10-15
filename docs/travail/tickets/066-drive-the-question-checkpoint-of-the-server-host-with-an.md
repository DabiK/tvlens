---
id: T066
titre: Drive the question checkpoint of the server host with an injected timer
statut: termine
bloque_par: T055, T058
adr: oui
installe: non
harnais: non
supprime_tests: non
niveau: sensible
---

## Ce que le ticket livre

Le brouillon d'une réponse est publié à chaque progression et sauvegardé au plus une fois par seconde.
Cette cadence vit maintenant dans `runtime/question-checkpoint.cjs`, commun au Mac et au serveur,
mais sa minuterie reste globale. Deux tests HTTP remplacent encore le `setTimeout` du processus qui
exécute aussi `fetch`. Après ce ticket, le module reçoit ses minuteries, les deux hôtes passent par
cette même porte, et les tests HTTP pilotent uniquement la cadence du checkpoint. Les règles de
publication, de sauvegarde immédiate et de fin de session restent les mêmes.

## Sources

- Constats : FLK-07, OUBLI-12 ; `docs/audit-points-chauds.md`, sections E et F (entrée T066), retenu par décision du
  propriétaire, le 15/10. La décision du propriétaire, le 15/10, demande de recadrer l'injection sur le checkpoint partagé.
- Code vérifié par lecture à la version `e92c6a6` :
  - `runtime/question-checkpoint.cjs:11`, `createQuestionCheckpoint({ delayMs = 1000 })` ;
    `flush` efface le timer global (`:21-22`), `checkpoint` sauvegarde immédiatement une forme nouvelle
    ou finale puis diffère les brouillons (`:32-36`), `forget` efface le timer (`:41-43`),
    `pending` expose ce qui attend (`:46`). Il n'existe pas encore d'options de minuterie ;
  - `runtime/headless-runtime.cjs:263` construit `this.questionSaves`, l'alimente dans `onChange`
    (`:297`), appelle `forget` dans `adopt` (`:589-592`) et `flush` dans l'étape questions de `leave`
    (`:832-836`). `close` (`:1075`) passe par la fermeture de session. Les anciens champs
    `unsaved`, `checkpointTimer`, `savedShape` et méthodes de checkpoint de l'hôte ont disparu ;
  - `app/main.cjs:150` construit la même fabrique ; le filtre des jobs par session reste dans l'hôte
    (`:161`), `flush` est remis à `settleQuestions` (`:356`) et `forget` est appelé dans `letGo` (`:365`) ;
  - `tests/server-sessions.test.cjs:73`, `fixture`, accepte déjà `runtimeOptions`, les transmet au
    vrai runtime (`:82-83`) et lui parle par `fetch` (`:89`). `disk` (`:32`) tient les écritures et
    `drivenChat` (`:51`) tient la réponse : les bancs existent sans extraire d'autres helpers ;
  - dans ce fichier, le test de cadence commence à `:700`, active la simulation globale à `:708`,
    avance de 1000 ms (`:709`), de 50 ms (`:718`), puis de 999 et 1 ms (`:729-731`). La sonde
    synthétique commence à `:765`, active la simulation à `:771` et avance de 80 ms à `:779`.
    Ce sont les deux seuls usages de `mock.timers` du fichier, qui déclare 14 tests ;
  - `tests/question-checkpoint.test.cjs:26` utilise des timers globaux simulés, sans socket.
    Ses 12 tests couvrent cadence, défaut à une seconde, store attaché à l'état, `flush`, `forget`
    et refus disque. La garde à `:207` interdit imports, processus, disque et réseau ;
  - `tests/architecture-f07.test.cjs:169`, `serverHost`, monte le vrai HTTP sans timer simulé ;
    `settled` lit déjà `runtime.questionSaves.pending()` (`:187`). Les titres serveur sont construits
    par `HOSTS` (`:311-312`) et les tests directs sont à `:499` et `:517`.
    Le banc Mac (`:221`) simule ses timers mais n'ouvre pas de socket ;
  - `tests/mac-ipc-contract.test.cjs:771` couvre la cadence Mac et la fin avec un brouillon en attente,
    via le vrai hôte et son preload devant un substitut d'Electron.
- Contrats à préserver : ADR 0003 (publication et durabilité distinctes) et ADR 0007 (ordre de fin).
  Leur description historique de la duplication a vieilli : le module partagé est déjà présent.
- T055 livre les attentes partagées ; T058 livre `tests/helpers/clock.cjs` et son `manualClock`
  (`io: { now, setTimer, clearTimer }`, `armed`, `advance(ms)` relatif). Ces helpers sont absents à
  cette version. T055 implique T150 ; les anciens tickets d'extraction des bancs ne sont pas requis.

## Périmètre

- À modifier :
  - `runtime/question-checkpoint.cjs` : ajouter `setTimer` et `clearTimer` à la fabrique. Leurs valeurs
    par défaut délèguent à `setTimeout` et `clearTimeout` au moment de l'appel, sans capturer les
    fonctions globales au chargement. `checkpoint`, `flush` et `forget` n'utilisent que ces dépendances ;
  - `runtime/headless-runtime.cjs` : transmettre ses options `setTimer` et `clearTimer` à la fabrique.
    Ces options ne pilotent que le checkpoint ; les autres timers de l'hôte restent inchangés ;
  - `app/main.cjs` : expliciter à la construction du checkpoint les deux délégations aux timers de
    l'hôte. Elles gardent le comportement global par défaut et restent compatibles avec le banc Mac ;
  - `tests/server-sessions.test.cjs` : dans les deux tests cités, fournir les minuteries de
    `manualClock()` par `runtimeOptions`, remplacer les avances globales par les avances relatives
    équivalentes. Utiliser les aides T055 quand une attente nouvelle est nécessaire ;
  - `tests/question-checkpoint.test.cjs` : ajouter la preuve des minuteries injectées, sans supprimer
    ni assouplir les assertions existantes sur les valeurs par défaut ;
  - un ADR au prochain numéro libre, selon `docs/adr/0000-gabarit.md`.
- À ne pas toucher : `core/`, `server/http.cjs`, `runtime/session-closing.cjs`, les deux `setInterval`
  de l'hôte serveur (`runtime/headless-runtime.cjs:321`, `:329`), la borne de `settleIngestions`
  (`:716`) et les tests de fermeture existants. Le filtre Mac, la porte `asking`, le délai de 1000 ms
  et l'ordre de fin ne changent pas.
- Les titres et assertions des deux tests HTTP sont conservés, notamment les nombres d'écritures,
  brouillons lus sur disque, 999 ms puis 1 ms et borne de huit écritures de la sonde. Aucun test retiré.

## Critères d'acceptation

1. `rg -n 'mock\.timers' tests/server-sessions.test.cjs` ne sort rien. Les deux tests de cadence
   gardent leurs titres et assertions ; chaque avance porte seulement sur le checkpoint injecté.
2. Un test public de `createQuestionCheckpoint`, avec store et minuteries contrôlés, prouve :
   un seul timer pour plusieurs brouillons, rien à 999 ms, le dernier état à 1000 ms ; `flush` et
   `forget` annulent le timer injecté, et avancer ensuite ne produit aucune écriture tardive.
   La valeur par défaut à une seconde et l'appartenance au bon store restent prouvées par les tests existants.
3. Un test HTTP du même fichier que les deux tests migrés ferme le runtime avec un brouillon en
   attente : après `runtime.close()`, `armed` vaut 0 et une avance supplémentaire ne modifie aucun
   fichier de la session. Les assertions de fin et de changement de session déjà présentes restent vertes.
4. La voie par défaut reste couverte, sans modifier ces deux fichiers :
   `node --test --test-concurrency=1 --test-name-pattern="server host \(HTTP\)" tests/architecture-f07.test.cjs`
   lance au moins un test et passe ; `node --test tests/mac-ipc-contract.test.cjs` passe aussi.
   Lancer les fichiers en séquentiel et consigner le nombre de tests réellement sélectionnés.
5. `node --test --test-concurrency=1 tests/server-sessions.test.cjs` passe vingt fois de suite,
   sans relance sélective ni sortie « asynchronous activity ». Au premier échec, arrêter la série,
   conserver la sortie et diagnostiquer ; des passes ultérieures n'annulent pas un échec inexpliqué.
6. L'ADR documente l'injection `setTimer`/`clearTimer`, les valeurs globales par défaut et le
   checkpoint partagé des deux hôtes. Il interdit la simulation globale des timers dans un test
   qui ouvre un socket et distingue les bornes dont l'expiration est le résultat voulu.
   Il nomme les minuteries non traitées, notamment `core/deep-ask.cjs` et `core/living-recap.cjs` ;
   la sauvegarde Mac utilise désormais le même module injecté et n'est plus une copie à extraire.
7. `node --test tests/question-checkpoint.test.cjs`, puis `node scripts/check.mjs`, passent.
   Aucun changement d'assertion dans les tests de fermeture, aucune ligne ajoutée de plus de 160 caractères.

## Test d'acceptation attendu

Les deux tests existants de `tests/server-sessions.test.cjs`, à la frontière HTTP d'un vrai
`RemoteServer` devant un vrai `HeadlessRuntime`, avec les minuteries du seul checkpoint injectées.
`tests/question-checkpoint.test.cjs` prouve le contrat du module ; les bancs IPC Mac et HTTP de
fermeture restent la preuve que les valeurs par défaut et l'ordre de durabilité sont conservés.

## Hypothèses bloquantes

Aucune décision n'est attendue.

Hypothèse de diagnostic : la simulation globale contribue aux activités HTTP tardives signalées
par l'audit. Ni cet échec intermittent, ni sa causalité exacte n'ont été reproduits ici ; ce ticket
supprime le couplage établi par lecture sans promettre la résolution de tout échec HTTP.

Si une minuterie de `core/deep-ask.cjs` redevenue réelle change le résultat d'un des deux tests ou
laisse une activité après sa fin, conserver la sortie et rendre BLOQUÉ avec le test et le timer en
cause. L'injection de ces minuteries ne s'ajoute pas au présent périmètre.

## Journal

- Rafraîchi le 15/10 contre `e92c6a6` : injection recadrée sur `runtime/question-checkpoint.cjs`,
  déjà partagé ; câblage des deux hôtes et tests du module ajoutés au périmètre, anciens champs
  et méthodes retirés des critères. Dépendances réduites à T055 et T058, niveau sensible ; les bancs
  HTTP/IPC existent déjà. Hypothèse sur l'ancien échec HTTP séparée des faits lus. Aucun test exécuté.

- Contrôle documentaire : `node scripts/check.mjs --changed` lancé une fois, code 0, vert.
  Aucun fichier de test modifié, donc aucun test exécuté ; Markdown ignoré par Prettier.
  ESLint non lancé (absent ou non configuré). En-têtes, sections et repères contrôlés séparément par lecture.

- Relecture documentaire le 15/10 contre `e92c6a6` : sources rendues pérennes dans
  `docs/audit-points-chauds.md` ou attribuées à la décision du propriétaire, le 15/10.

- Exploration Codex le 15/10 sur `bf3f3a3` : consignes, checkpoint partagé, deux hôtes,
  bancs HTTP/IPC, helpers d'horloge et d'attente, ADR 0003/0007 lus. Périmètre confirmé,
  aucun écart prévu ; détails dans `.harness-state/tickets/T066/exploration.md` et `ecarts.md`.
  Les trois changements préexistants sont identifiés et conservés. Aucun test exécuté à cette étape.

- Cycle du module : `node --test --test-name-pattern='injected timers' tests/question-checkpoint.test.cjs`
  rouge (1 test, assertion `armed` : 0 au lieu de 1), puis injection de `setTimer`/`clearTimer` et
  `node --test tests/question-checkpoint.test.cjs` vert (13/13). Sorties : `red-checkpoint.log`,
  `green-checkpoint.log` dans le dossier d'état. Les assertions préexistantes restent intactes.

- Cycle HTTP : `node --test --test-concurrency=1 --test-name-pattern='closing the server runtime with a pending draft'
  tests/server-sessions.test.cjs` rouge (1 test, `armed` : 0 au lieu de 1), puis câblage du runtime
  et même commande verte (1/1), sorties `red-runtime-close.log` et `green-runtime-close.log`.
  Le contrôle rapide a refusé une première écriture sur quatre lignes (constructeur à 82 lignes,
  maximum 80) ; une déstructuration locale conserve le câblage sur deux lignes, sans changer le gel.

- Deux tests HTTP migrés vers les avances relatives du seul checkpoint, titres et assertions conservés.
  `rg -n 'mock\.timers' tests/server-sessions.test.cjs` : aucune sortie (code 1).
  `node --test --test-concurrency=1 tests/server-sessions.test.cjs` : vert, 15/15, sonde à 7 écritures,
  aucune activité asynchrone tardive signalée (`green-server-sessions.log`). ADR 0015 rédigé.

- `node scripts/check.mjs --changed` : vert, règles/format/lint/gel/cliquet et 28/28 tests des deux
  fichiers modifiés (`check-changed.log`). Aucun test ou seuil affaibli.

- Voies par défaut vérifiées en séquentiel :
  `node --test --test-concurrency=1 --test-name-pattern="server host \(HTTP\)" tests/architecture-f07.test.cjs`
  vert, 9 tests réellement sélectionnés ; `node --test tests/mac-ipc-contract.test.cjs` vert, 15/15.
  Sorties `default-server-closing-sequential.log` et `default-mac-ipc-sequential.log` ; aucun changement
  dans ces fichiers. Un premier lancement des deux commandes s'était chevauché (9/9 et 15/15 verts) :
  ce lancement n'est pas retenu comme preuve séquentielle ; les sorties initiales sont conservées.

- Série demandée : `node --test --test-concurrency=1 tests/server-sessions.test.cjs` exécuté vingt
  fois consécutives en séquentiel, 15/15 à chaque passage (300 tests), aucun échec ni sortie
  « asynchronous activity ». Sorties intégrales `server-sessions-repeat-01.log` à `-20.log`,
  commande et résultats dans `server-sessions-repetitions.json`. La série s'arrêterait au premier échec.
  `git diff --check` : code 0.

- Validation finale : `node --test tests/question-checkpoint.test.cjs` vert, 13/13
  (`final-question-checkpoint.log`), puis `node scripts/check.mjs` vert, code 0 : règles, format,
  lint, gel et cliquet ; 100 fichiers JS, 1186/1186 tests ; Python annonce 84 tests, `OK (skipped=1)`
  (`check-full.log`). Le nombre de cas mesuré passe de 1083 à 1085 sans modifier le plancher.
  Verdict Codex `TERMINÉ` écrit dans `.harness-state/tickets/T066/verdict.json` ; relecture laissée
  à la boucle. Aucun commit, push ni changement du harnais.
