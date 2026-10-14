---
id: T069
titre: Order abandoned-run and held-write tests by a signal instead of a delay
statut: a-faire
bloque_par: T057, T058, T059, T062, T063, T064, T145
adr: non
installe: non
harnais: non
supprime_tests: non
---

## Ce que le ticket livre

Quatre tests ordonnent deux événements par une durée : « 120 ms plus tard, le lancement abandonné est
terminé », « 20 ms plus tard, l'hôte attend cette écriture », un faux binaire qui dure 600 ms pour
qu'on ait le temps de l'abandonner, un rejet qui doit arriver « en moins d'une seconde ». Sur une
machine chargée, la durée ne garantit plus l'ordre. Après ce ticket, chaque test attend le fait
lui-même — le lancement abandonné terminé, un processus vu parti, une écriture entrée dans sa
doublure alors que la session se dit en cours de fermeture, un rejet qui porte la raison de
l'appelant — et une mutation montre ce que chaque test détecte.

## Sources

- Constats : FLK-11
- Code vérifié à la version `0d5a954` (le nom d'abord, la ligne ensuite) :
  - `tests/review-regressions.test.cjs`, test « an abandoned Whisper run settling late does not
    unregister the run that replaced it », ligne 114 : faux binaire écrit sur place, qui note `start`
    puis répond après `setTimeout(…, 400)`, ligne 122 ; boucle d'attente du démarrage par pas de
    10 ms, ligne 128 ; `await new Promise(resolve => setTimeout(resolve, 120)); // the abandoned run
    has settled by now`, ligne 132 ; assertion finale `starts() === 2`.
  - `adapters/local-transcriber.cjs` : registre des lancements — `run.result = this.run(…).finally(()
    => { if (this.running.get(key) === run) this.running.delete(key); })`, ligne 60 ;
    `this.running.set(key, run)`, ligne 62 ; `leave`, ligne 67 ; `spawn`, ligne 82 ; `const abort =
    () => child.kill('SIGKILL')`, ligne 86. La garde `this.running.get(key) === run` est ce que le
    test protège. Aucun signal public ne dit qu'un lancement abandonné est terminé, mais `run` est
    une méthode de l'instance : un test peut l'envelopper pour garder la promesse du premier
    lancement. Le `.finally` de la ligne 60 est enregistré avant toute attente du test, donc il a
    tourné quand le test reprend après la fin de cette promesse. Deuxième fait à tenir : si le second
    lancement se termine avant le troisième appel, celui-ci est servi par le cache et le test passe
    sans rien prouver — le second lancement doit donc être retenu jusqu'au troisième appel.
  - `tests/transcriber-sharing.test.cjs` : `async function fixture(t, delayMs = 250)`, ligne 9 — faux
    binaire qui note `start`, attend `delayMs`, écrit la transcription, note `end` ; `const until`
    local, ligne 24, qui n'échoue jamais ; test « a run abandoned by every caller is killed, and a
    later request starts its own », ligne 46 — `fixture(t, 600)`, puis événements attendus
    `['start', 'start', 'end']`, ligne 56.
  - `tests/chat-instruction.test.cjs` : `store.put` remplacé par une version tenue par la promesse
    `held`, ligne 49 ; `const ending = runtime.end();`, ligne 51 ; `await new Promise(resolve =>
    setTimeout(resolve, 20));`, ligne 53, sous le commentaire « The host is now waiting for that
    write, with the flag already raised » ; puis `release()` et l'assertion `described === before`.
  - Le drapeau « la session se termine » est levé à deux endroits : `runtime/session-closing.cjs`,
    `closeSession`, `if (session) session.watch.ending = true;`, ligne 73 (l'hôte, en premier), puis
    `runtime/session-runtime.cjs`, `watch.ending = true;`, ligne 495, suivi de `await
    watch.landed();`, ligne 496. `core/session.cjs` le lit lignes 122, 226, 260 et 306. Retirer un
    seul des deux endroits ne change donc rien à ce que le test observe.
  - `tests/local-vlm-agent.test.cjs`, test « caller abort rejects promptly with its reason, drops the
    connection and leaves the agent usable », ligne 94 : le serveur simulé ne répond jamais à la
    première demande (`n === 1 ? arrived(request) : reply(…)`, ligne 97) ; `const abortedAt =
    Date.now();`, ligne 103 ; `assert.ok(Date.now() - abortedAt < 1000, 'rejection does not wait for
    the backend or the timeout')`, ligne 106 ; `assert.equal(await request.closed, false, …)`, ligne
    107, qui constate déjà que la connexion s'est fermée sans réponse.
  - `adapters/local-vlm-agent.cjs` : `timeoutMs = 45000` par défaut, ligne 11 ; `AbortSignal.any([
    …(signal ? [signal] : []), AbortSignal.timeout(this.timeoutMs), this.#closing.signal])`, ligne
    41. Le test a une limite de 10 s : le serveur ne répondant jamais et l'expiration étant à 45 s, le
    seul rejet possible dans le test est celui de l'appelant, et `error === reason` le vérifie déjà.
    La borne d'une seconde ne prouve rien de plus.
- Hors périmètre, après lecture : `tests/local-vlm-agent.test.cjs`, ligne 119 (`timeoutMs: 40`, une
  expiration voulue) ; `tests/question-ceiling.test.cjs`, lignes 200-204, qui demande une minuterie
  injectée dans le code de production et fait l'objet d'un autre ticket.
- `tests/helpers/wait.cjs` (lot L05) : `deferred`, `until(check, what, { timeoutMs })`, qui échoue en
  nommant ce qui manque ; `bounded`, qui borne une promesse et échoue de même.

## Périmètre

- À modifier :
  - `tests/review-regressions.test.cjs`, le test cité : le faux binaire note son `pid` et ne répond
    que lorsqu'un fichier de libération existe ; le test enveloppe `transcriber.run` sur l'instance
    pour garder la promesse de chaque lancement, attend la fin de celle du lancement abandonné (rejet
    compris), lance le troisième appel, puis crée le fichier. Plus de durée fixe.
  - `tests/transcriber-sharing.test.cjs`, le test cité et `fixture` : même poignée de main par
    fichier de libération à la place des 600 ms ; le test affirme que le processus abandonné est parti
    (son `pid`) en plus des événements. Les autres tests du fichier gardent leur comportement.
  - `tests/chat-instruction.test.cjs` : la pause de 20 ms devient l'attente de deux faits — la
    doublure de `store.put` a été appelée pour le second passage, et
    `runtime.session.watch.ending === true`.
  - `tests/local-vlm-agent.test.cjs`, le test cité : `abortedAt` et la borne sur `Date.now()`
    disparaissent ; l'attente du rejet est bornée par `bounded` et nomme le fait attendu. Le serveur
    simulé ne répond toujours jamais à la première demande, et les assertions `error === reason` et
    `request.closed === false` restent.
- À ne pas toucher : le code de production, sauf pour les mutations temporaires du critère 4,
  annulées avant la fin ; les titres des tests ; les valeurs attendues.
- Chaque faux binaire tenu par un fichier de libération est libéré et tué dans `t.after`, que le test
  ait réussi ou non.

## Critères d'acceptation

Chaque critère se vérifie par un test ou une commande.

1. `grep -n "setTimeout(resolve, 120)\|setTimeout(resolve, 20)" tests/review-regressions.test.cjs
   tests/chat-instruction.test.cjs` ne sort rien ; `grep -n "fixture(t, 600)"
   tests/transcriber-sharing.test.cjs` ne sort rien ; `grep -n "abortedAt"
   tests/local-vlm-agent.test.cjs` ne sort rien.
2. Chaque attente ajoutée est bornée et échoue en nommant le fait attendu.
3. Dans chacun des deux tests à faux binaire, `t.after` libère et tue les processus dont le `pid` a
   été noté, puis attend, par une attente bornée qui nomme le `pid`, que `process.kill(pid, 0)` lève
   `ESRCH` pour chacun.
4. Preuve par mutation, une par test, mutation annulée ensuite. Chaque mutation est lancée deux fois,
   commande et sortie dans le journal : d'abord contre le test tel qu'il est avant ce ticket, puis
   contre le test réécrit.
   - `adapters/local-transcriber.cjs`, ligne 60 : garde `this.running.get(key) === run` retirée du
     `.finally` (le lancement qui se termine se désinscrit toujours) → le test réécrit de
     `tests/review-regressions.test.cjs` échoue sur `starts() === 2`, dix fois sur dix ;
   - `adapters/local-transcriber.cjs`, ligne 86 : `abort` ne tue plus le processus → le test réécrit
     de `tests/transcriber-sharing.test.cjs` échoue en nommant le processus abandonné encore en vie ;
   - `runtime/session-closing.cjs`, ligne 73, et `runtime/session-runtime.cjs`, ligne 495 : les deux
     levées du drapeau retirées ensemble → le test réécrit de `tests/chat-instruction.test.cjs`
     échoue ;
   - `adapters/local-vlm-agent.cjs`, ligne 41 : le signal de l'appelant retiré de `AbortSignal.any` →
     le test réécrit de `tests/local-vlm-agent.test.cjs` échoue sur l'attente bornée du rejet.
   Une mutation qui fait échouer le test d'avant fait échouer le test réécrit : sinon la réécriture a
   perdu la protection et n'est pas finie. Une mutation qui laisse vert le test d'avant est notée
   telle quelle dans le journal, avec le titre du test : ce ticket ne comble pas ce manque.
5. `node --test --test-concurrency=1 tests/review-regressions.test.cjs
   tests/transcriber-sharing.test.cjs tests/chat-instruction.test.cjs tests/local-vlm-agent.test.cjs`
   passe dix fois de suite, sans relance sélective. Durée de `tests/transcriber-sharing.test.cjs`
   avant et après dans le journal.
6. `node scripts/check.mjs` est vert, mutations annulées.

## Test d'acceptation attendu

Les quatre tests existants, ordonnés par un signal. Frontières inchangées : `LocalTranscriber` devant
un faux binaire réel, `HeadlessRuntime` devant ses ports simulés, `LocalVlmAgent` devant un serveur
HTTP local.

## Hypothèses bloquantes

Aucune décision n'est attendue. Si l'un des quatre faits ne peut être attendu qu'en modifiant le
code de production (par exemple un signal public du registre de `LocalTranscriber`) : verdict BLOQUÉ
pour le ticket entier, avec le test en cause et ce qui manque — la boucle n'intègre pas une partie de
ticket.

## Journal
