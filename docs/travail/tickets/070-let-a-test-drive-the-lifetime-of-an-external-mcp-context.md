---
id: T070
titre: Let a test drive the lifetime of an external MCP context
statut: a-faire
bloque_par: T066, T145
adr: non
installe: non
harnais: non
supprime_tests: non
---

## Ce que le ticket livre

La durée de vie d'un contexte MCP externe est prouvée en temps réel : le test ouvre un contexte de
80 ms, dort par pas de 10 ms jusqu'à ce qu'il disparaisse, puis exige qu'au moins 70 ms se soient
écoulées. La borne basse dépend de la précision des minuteries de la machine, et le test ne dit pas
que le contexte tient jusqu'à son terme. Après ce ticket, `VideoBridge` reçoit sa minuterie par
injection : le test prouve que le contexte est encore ouvert juste avant son terme et fermé à son
terme, sans dormir, et un second cas garde la minuterie réelle par défaut.

## Sources

- Constats : FLK-11, TSTB-13
- Code vérifié à la version `0d5a954` (le nom d'abord, la ligne ensuite) :
  - `adapters/video-bridge.cjs` (50 lignes) : `constructor({descriptor,makeTools,
    contextMs=QUESTION_TIMEOUT_MS})`, ligne 9 ; ouverture d'un contexte par `search_moments` —
    `scope.timer=setTimeout(()=>{controller.abort(new Error('Contexte MCP expiré.'));
    this.external.delete(client);},this.contextMs);scope.timer.unref();`, ligne 28 ;
    `clearTimeout(scope.timer)` dans `revoke(sessionId)`, ligne 46, et dans `close()`, ligne 48.
    Aucune minuterie injectable.
  - Appelants de `new VideoBridge(` : `app/main.cjs`, ligne 177 ; `scripts/probe-chat-web.cjs` et
    `scripts/probe-chat-sources.cjs`, ligne 8 ; `scripts/probe-chat-memory.cjs`, ligne 12 ;
    `scripts/evaluate-actions.cjs`, ligne 13 ; `tests/video-research.test.cjs`, ligne 52 ;
    `tests/architecture-f05.test.cjs`, ligne 530 ; `tests/question-ceiling.test.cjs`, ligne 189. Aucun
    ne passe de minuterie : tous gardent la valeur par défaut.
  - `tests/question-ceiling.test.cjs`, test « an external MCP context lasts as long as a question may
    be processed, and says so », ligne 186 : `const brief = await open({ contextMs: 80 }), openedAt =
    performance.now();`, ligne 200 ; boucle qui attend que `brief.external.size` tombe à zéro, par
    pas de 10 ms, ligne 202 (le lot L05 la remplace par un `until` nommé avant ce ticket : la
    reconnaître à ce qu'elle attend, pas à sa forme) ;
    `assert.equal(brief.external.size, 0)`, ligne 203 ; `assert.ok(performance.now() - openedAt >= 70,
    'the context was not dropped before its lifetime')`, ligne 204 ; puis le refus de
    `get_transcript` avec « Commence par search_moments pour ouvrir un contexte de 1 seconde. ». Le
    test parle au pont par `fetch`.
  - Modèle de minuterie injectée : `core/moment-index.cjs`, option `setTimer = (fn, ms) =>
    setTimeout(fn, ms)`, ligne 22 ; `adapters/codex-verifier.cjs`, constructeur ligne 50.
- La décision d'architecture qui encadre ce geste est celle écrite par T066 (minuterie injectée par
  `setTimer` et `clearTimer`, pas de `t.mock.timers` dans un processus qui ouvre un socket) : ce
  ticket l'applique à un second module et n'écrit pas d'ADR. C'est la seule raison de sa dépendance
  à T066 ; les deux tickets ne touchent aucun fichier commun.
- `tests/helpers/clock.cjs` (lot L05) : `manualClock()` — `io: { now, setTimer, clearTimer }`, `armed`,
  `advance(ms)` ; `tests/helpers/wait.cjs` : `until`.
- Reste du constat TSTB-13, hors de ce ticket : les `setTimeout` directs de `core/deep-ask.cjs`
  (lignes 81 et 87) et de `core/living-recap.cjs` (ligne 107) relèvent du lot qui traite les
  minuteries du cœur.

## Périmètre

- À modifier :
  - `adapters/video-bridge.cjs` : options `setTimer` et `clearTimer`, par défaut les minuteries
    globales ; l'expiration d'un contexte, `revoke` et `close` passent par elles. Le `unref()` de la
    minuterie réelle est conservé pour la valeur par défaut.
  - `tests/question-ceiling.test.cjs`, le test cité : le contexte bref est ouvert sur un
    `manualClock()` ; le test avance de 79 ms et constate que le contexte répond encore, avance de
    1 ms et constate qu'il est fermé. Un second contexte bref, sur la minuterie réelle par défaut,
    expire de lui-même, attendu par un `until` borné sans borne basse.
- À ne pas toucher : `app/main.cjs` et les quatre scripts de `scripts/` cités, qui gardent la
  minuterie par défaut ; les autres tests du fichier ; les messages (« contexte de 1 seconde »,
  « Contexte MCP expiré. »).

## Critères d'acceptation

Chaque critère se vérifie par un test ou une commande.

1. `grep -n "openedAt" tests/question-ceiling.test.cjs` ne sort rien.
2. Sur l'horloge manuelle : après 79 ms, `get_transcript` répond 200 et `external.size` vaut 1 ;
   après 1 ms de plus, `external.size` vaut 0 et `get_transcript` est refusé avec le message actuel.
3. Sur la minuterie réelle par défaut : un contexte de quelques dizaines de millisecondes disparaît,
   attendu par un `until` borné qui nomme ce qu'il attend.
4. Après `bridge.close()` d'un pont dont un contexte est encore ouvert sur l'horloge manuelle,
   `armed` vaut 0 ; même constat après `revoke`.
5. Preuve par mutation, notée dans le journal puis annulée : la durée passée à la minuterie divisée
   par deux dans `adapters/video-bridge.cjs` → le test échoue sur le constat des 79 ms.
6. `node --test --test-concurrency=1 tests/question-ceiling.test.cjs tests/video-research.test.cjs`
   passe dix fois de suite.
7. `grep -c "^test(" tests/question-ceiling.test.cjs` donne le même nombre qu'avant le ticket : le
   second contexte bref vit dans le test existant.
8. `node scripts/check.mjs` est vert.

## Test d'acceptation attendu

Le test existant de `tests/question-ceiling.test.cjs`, sur une minuterie injectée. Frontière : le
serveur HTTP local d'un vrai `VideoBridge`, appelé par `fetch`, comme aujourd'hui.

## Hypothèses bloquantes

Aucune décision n'est attendue.

## Journal
