---
id: T066
titre: Drive the question checkpoint of the server host with an injected timer
statut: a-faire
bloque_par: T057, T058, T059, T062, T063, T064
adr: oui
installe: non
harnais: non
supprime_tests: non
---

## Ce que le ticket livre

Le brouillon d'une réponse est sauvegardé au plus une fois par seconde par une minuterie globale de
l'hôte serveur. Pour la piloter, deux tests remplacent le `setTimeout` de tout le processus, alors que
ce même processus parle à l'hôte par `fetch` : les minuteries internes du client HTTP sont gelées avec
elle, et le fichier de test peut échouer alors que ses tests passent. Après ce ticket, l'hôte reçoit la
minuterie de sa sauvegarde différée par injection, les deux tests la pilotent sans toucher au
`setTimeout` global, et une décision d'architecture dit où une minuterie s'injecte.

## Sources

- Constats : FLK-07, OUBLI-12
- Code vérifié à la version `0d5a954` (le nom d'abord, la ligne ensuite) :
  - `runtime/headless-runtime.cjs` : `const CHECKPOINT_MS = 1000`, ligne 66 ; `class HeadlessRuntime`,
    ligne 236 ; `this.wallClock = options.wallClock || Date.now`, ligne 248 (modèle d'option injectée
    dans ce constructeur) ; `checkpoint(session, state)`, ligne 403 — arme
    `this.checkpointTimer ||= setTimeout(() => this.saveQuestions(), CHECKPOINT_MS)`, lignes 409-412 ;
    `saveQuestions()`, ligne 416 — `clearTimeout(this.checkpointTimer)`, ligne 417 ;
    `adopt(session, jobs = [])`, ligne 630 — `clearTimeout(this.checkpointTimer)` puis remise à `null`.
    Aucune option `setTimer` ou `clearTimer` dans ce fichier.
  - Hors périmètre dans le même fichier : les deux `setInterval` du constructeur (lignes 326 et 334),
    détachés par `unref` et pilotés par `runtime.tick()` ; la borne de `settleIngestions`, ligne 767
    (`setTimeout(resolve, this.preparationWaitMs, true)`), dont l'expiration est le résultat voulu.
  - Modèle existant de minuterie injectée : `core/moment-index.cjs`, option
    `setTimer = (fn, ms) => setTimeout(fn, ms)`, ligne 22, utilisée lignes 240 et 391 ;
    `core/moment-search.cjs`, lignes 26 et 34 ; `adapters/codex-verifier.cjs`, constructeur ligne 50.
  - `tests/server-sessions.test.cjs` : `const tick` (un tour de `setImmediate`), ligne 15 ; `const turns`,
    ligne 16 ; `async function fixture(t, { chat, runtimeOptions = () => ({}) } = {})`, ligne 76 — crée
    un vrai `HeadlessRuntime` et lui parle par `fetch` ; test « the draft of an answer is published each
    time it moves and saved at most once a second… », ligne 688 —
    `t.mock.timers.enable({ apis: ['setTimeout'] })`, ligne 696, `const second`, ligne 697
    (`t.mock.timers.tick(1000)`), `t.mock.timers.tick(50)`, ligne 706, `tick(999)` ligne 717, `tick(1)`
    ligne 719 ; test « synthetic probe of the ticket at the host, on a disk that keeps up… », ligne 753
    — `t.mock.timers.enable({ apis: ['setTimeout'] })`, ligne 759, `t.mock.timers.tick(80)`, ligne 767.
    Ce sont les deux seuls usages de `mock.timers` du fichier.
  - `tests/architecture-f07.test.cjs` : `async function serverHost(t)`, ligne 169 — vrai hôte serveur
    sans minuterie simulée ; son `settled`, ligne 187, attend `!runtime.unsaved &&
    !runtime.checkpointTimer` en temps réel. `async function macHost(t)`, ligne 221, simule les
    minuteries mais n'appelle jamais `fetch` ; `const onBothHosts`, ligne 312, lance un hôte par test :
    aucun test de ce fichier ne simule les minuteries et n'ouvre un socket à la fois (lu, non rejoué).
  - `app/main.cjs` : la sauvegarde différée jumelle de l'hôte Mac, `let unsavedQuestions = null,
    checkpointTimer = null, savedShape = null`, ligne 147, `checkpointTimer ||= setTimeout(saveQuestions,
    1000)`, ligne 159. Hors périmètre : elle rejoint `runtime/` avec l'unification des hôtes.
  - `core/deep-ask.cjs`, lignes 81 et 87 : `setTimeout` directs d'une question. Aujourd'hui gelés dans
    les deux tests par la simulation globale ; ils redeviennent réels après ce ticket.
- Échec décrit par l'audit, statut « supposé » : une fois sur deux sous une sonde de disque lent
  (+10 ms), le fichier `tests/server-sessions.test.cjs` échoue alors que ses tests passent, avec
  « generated asynchronous activity after the test ended » et « Cannot destructure property 'socket'
  of 'parser.deref(...)' ». Non déterministe : le ticket ne demande pas de reproduction préalable.
- `tests/helpers/clock.cjs` (lot L05) : `manualClock()` rend `io: { now, setTimer, clearTimer }`,
  `armed` et `advance(ms)`.

## Périmètre

- À modifier :
  - `runtime/headless-runtime.cjs` : deux options de constructeur, `setTimer` et `clearTimer`, par
    défaut les minuteries globales, sur le modèle de `core/moment-index.cjs` ; `checkpoint`,
    `saveQuestions` et `adopt` passent par elles. Rien d'autre ne change dans ce fichier.
  - `tests/server-sessions.test.cjs` : les deux tests cités passent à leur hôte, par `runtimeOptions`,
    les `setTimer` et `clearTimer` d'un `manualClock()` de `tests/helpers/clock.cjs`, et avancent ce
    temps par `advance(ms)` ; ils n'appellent plus `t.mock.timers`.
  - `docs/adr/NNNN-<titre>.md` (nouveau, prochain numéro libre, gabarit `docs/adr/0000-gabarit.md`).
- À ne pas toucher : `app/main.cjs`, `core/`, les deux `setInterval` et la borne de `settleIngestions`,
  `tests/architecture-f07.test.cjs`, `tests/architecture-f06.test.cjs` (ses `preparationWaitMs: 40`
  sont des expirations voulues).
- Les valeurs attendues par les deux tests (nombre d'écritures, brouillons lus sur le disque, 999 ms
  puis 1 ms) ne changent pas. Aucun test n'est retiré.

## Critères d'acceptation

Chaque critère se vérifie par un test ou une commande.

1. `grep -n "mock.timers" tests/server-sessions.test.cjs` ne sort rien, et les deux tests cités gardent
   leur titre et leurs assertions.
2. `grep -n "clearTimeout(this.checkpointTimer)" runtime/headless-runtime.cjs` ne sort rien ;
   `grep -n "setTimer\|clearTimer" runtime/headless-runtime.cjs` montre l'option, sa valeur par défaut
   et ses usages dans `checkpoint`, `saveQuestions` et `adopt`.
3. Une assertion, dans chacun des deux tests ou dans un test ajouté au même fichier, prouve qu'après
   `runtime.close()` l'horloge manuelle n'a plus de minuterie armée (`armed` vaut 0) alors qu'un
   brouillon attendait sa seconde.
4. La minuterie réelle par défaut reste couverte :
   `node --test --test-concurrency=1 --test-name-pattern="server host \(HTTP\)"
   tests/architecture-f07.test.cjs` lance au moins un test et passe, ce fichier inchangé. Les titres
   visés sont de la forme « server host (HTTP) — … » (`HOSTS`, ligne 311, et les tests directs des
   lignes 499 et 517) ; celui de la ligne 499 attend, par `settled` (ligne 187), que la sauvegarde
   différée arrive sur la minuterie réelle.
5. `node --test --test-concurrency=1 tests/server-sessions.test.cjs` passe vingt fois de suite, sans
   relance sélective, et aucune des vingt sorties ne contient « asynchronous activity ». Commande et
   décompte dans le journal.
6. L'ADR existe et dit : un module qui arme une minuterie qu'un test doit piloter la reçoit par
   injection (`setTimer`, `clearTimer`, valeur par défaut globale) ; un test n'active pas
   `t.mock.timers` dans un processus qui ouvre un socket ; une borne dont l'expiration est le résultat
   voulu reste une courte durée réelle. Elle cite ce que la décision ne couvre pas encore : la
   sauvegarde différée de l'hôte Mac et les minuteries de `core/deep-ask.cjs` et
   `core/living-recap.cjs`.
7. `node scripts/check.mjs` est vert.

## Test d'acceptation attendu

Les deux tests existants de `tests/server-sessions.test.cjs`, pilotés par une minuterie injectée.
Frontière : les routes HTTP d'un vrai `RemoteServer` devant un vrai `HeadlessRuntime`, comme
aujourd'hui.

## Hypothèses bloquantes

Aucune décision n'est attendue. Si, une fois la simulation globale retirée, une minuterie de
`core/deep-ask.cjs` redevenue réelle change le résultat d'un des deux tests ou laisse une activité
après sa fin : verdict BLOQUÉ, avec la sortie observée — l'injection de ces minuteries appartient à un
autre lot et ne se fait pas ici.

## Journal
