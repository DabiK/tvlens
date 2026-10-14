---
id: T068
titre: Gate close-during-reconnect and retry tests on a named step, not a count
statut: a-faire
bloque_par: T057, T058, T059, T062, T063, T064, T145
adr: non
installe: non
harnais: non
supprime_tests: non
---

## Ce que le ticket livre

Quatre tests placent leur action « pendant » une étape interne en comptant des tours de microtâches
(trois, puis six) ou des lectures (« la troisième »). Le jour où le code de production gagne ou perd
un `await`, l'action tombe ailleurs et le test passe sans plus rien prouver. Après ce ticket, chacun
s'arrête sur l'étape qu'il vise, signalée par une doublure, et une mutation du code de production
montre que chacun détecte encore le défaut pour lequel il a été écrit.

## Sources

- Constats : FLK-09, OUBLI-13, TSTA-11
- Code vérifié à la version `0d5a954` (le nom d'abord, la ligne ensuite) :
  - `tests/review-regressions.test.cjs` : `function appServer({ handle } = {})`, ligne 27 — sa doublure
    de transport répond `close() { process.closed = true; }`, sans promesse ; test « a client closed
    while its process is being recycled stays closed », ligne 66 — `client.rotateThread()` puis
    `await Promise.resolve(); await Promise.resolve(); await Promise.resolve();`, ligne 71, puis
    `await client.close()` ; test « a client closed while a turn is removing a dead connection stays
    closed », ligne 308 — `onEvent('connection/closed', {})`, `client.answer(…)`, puis
    `for (let i = 0; i < 6; i++) await Promise.resolve();`, ligne 316, puis `controller.abort(…)` et
    `await client.close()`.
  - `adapters/codex-session-client.cjs` : `rotateThread()`, ligne 179 ; `async rotate()` — quand le
    nombre de rotations est atteint, `expected = (this.generation || 0) + 1; await this.close();
    if (this.generation === expected) this.prepare(sessionId)…`, lignes 210-213 : c'est la garde que
    le premier test protège ; `async prepare(sessionId)`, ligne 234 — boucle `while (this.ready ||
    this.dir)`, `await this.close()`, puis `if (this.generation !== expected && !this.ready &&
    !this.dir) throw Error("Connexion obsolète.")`, lignes 236-242 : la garde que le second test
    protège ; `finish()`, ligne 823 — `const answer = left.rpc?.close(); if (answer && (await
    exitOf(answer)) === false)`, puis `if (left.dir) await fs.rm(left.dir, { recursive: true, force:
    true })`, ligne 835 ; son commentaire dit qu'une doublure de transport qui répond une promesse doit
    la tenir ; `async close()`, ligne 854, avance `generation`. Le module n'a pas de disque injectable.
    À la réception de `connection/closed` (lignes 566-572), le client n'efface que `this.ready` et
    garde `this.rpc` : dans les deux tests, le transport existe donc encore quand `finish()` l'appelle,
    et une doublure dont `close()` rend une promesse tenue arrête bien le client sur cette étape.
  - `tests/architecture-f05.test.cjs` : `function treeRemovals(t)`, ligne 55 — doublure de `fsp.rm`
    limitée aux arbres `tvlens-codex-session-*`, avec `hold` et `release` : modèle existant d'une
    suppression tenue ; les transports de ce fichier répondent à `close()` par une promesse `exit`
    que le test résout (`first.exit.resolve(true)`, ligne 264).
  - `tests/architecture-f08.test.cjs` : test « what allows the second call is checked again once the
    media have been read again », ligne 135 — `f.media.read = async id => { … if (id === 'moment-1' &&
    ++reads === 3) await reread.promise; … }`, ligne 143, puis `assert.deepEqual([calls, reads],
    [['moment-1'], 3], name)`, ligne 145 ; test « media that cannot be read again, or are no longer
    kept, end the description at its first failure », ligne 154 — `if (++reads === 3) throw
    Error('ENOENT…')`, ligne 158.
  - `core/session.cjs` : `retriesVision(segment, error)`, ligne 300 ; dans la reprise d'une
    description, première vérification ligne 331, relecture `try { evidence = await
    this.media.read(segment.id); } catch { throw error; }`, ligne 333, seconde vérification
    `if (!this.retriesVision(segment, error)) throw error;`, ligne 334.
- Hors périmètre, après lecture : `tests/codex-connect-race.test.cjs`, ligne 39 (`close()` appelé de
  façon synchrone après `prepare`, pas une étape comptée) ; `tests/codex-thread-rotation.test.cjs`,
  lignes 121, 152 et 173 (cinq tours après une barrière tenue ou un rejet attendu : preuves
  d'absence, pas des synchronisations) ; les autres assertions de `tests/architecture-f08.test.cjs`
  sur le nombre de lectures (lignes 49, 91, 106, 113, 131, 160, 170, 215, 218), qui mesurent un coût
  et restent où elles sont.
- `tests/helpers/wait.cjs` (lot L05) : `deferred`, `until`.

## Périmètre

- À modifier :
  - `tests/review-regressions.test.cjs`, les deux tests cités : la fermeture par l'hôte est lancée
    quand une doublure signale que l'étape visée est atteinte et la tient — la fin du processus, par
    un transport dont `close()` signale son appel et rend une promesse que le test résout. Si cette
    étape ne suffit pas à l'un des deux tests, l'autre point d'arrêt permis est la suppression de
    l'arbre privé (doublure de `fsp.rm` limitée à `tvlens-codex-session-*`, sur le modèle de
    `treeRemovals`). `appServer` peut gagner une option pour cela, sans changer ce que ses autres
    appelants reçoivent.
  - `tests/architecture-f08.test.cjs`, les deux tests cités : la lecture tenue, ou refusée, est « la
    relecture qui suit le premier échec de `observeVisual` », reconnue par un fait (l'échec a eu lieu),
    non par son rang.
- À ne pas toucher : le code de production, sauf pour les mutations temporaires du critère 4,
  annulées avant la fin ; les autres tests de ces deux fichiers ; les assertions existantes, valeurs
  attendues comprises (`[['moment-1'], 3]` reste une assertion, elle ne sert plus de déclencheur).

## Critères d'acceptation

Chaque critère se vérifie par un test ou une commande.

1. `grep -n "await Promise.resolve()" tests/review-regressions.test.cjs` ne sort rien (les lignes 71
   et 316 sont aujourd'hui les deux seules).
2. `grep -n "++reads === 3" tests/architecture-f08.test.cjs` ne sort rien.
3. Chacun des quatre tests attend l'arrivée à son étape par une promesse ou un `until` borné qui
   nomme l'étape, et échoue en la nommant si elle n'est jamais atteinte.
4. Preuve par mutation, une par test, mutation annulée ensuite. Chaque mutation est lancée deux fois,
   commande et sortie dans le journal : d'abord contre le test tel qu'il est avant ce ticket, puis
   contre le test réécrit.
   - garde `if (this.generation === expected)` de `rotate()` retirée → le test de la ligne 66 échoue ;
   - garde `this.generation !== expected` de `prepare()` retirée → le test de la ligne 308 échoue ;
   - seconde vérification `retriesVision` (ligne 334) retirée → le test de la ligne 135 échoue ;
   - `catch { throw error; }` de la relecture (ligne 333) remplacé par la propagation de l'erreur du
     disque → le test de la ligne 154 échoue.
   Une mutation qui fait échouer le test d'avant fait échouer le test réécrit : sinon la réécriture a
   perdu la protection et n'est pas finie. Une mutation qui laisse vert le test d'avant est notée
   telle quelle dans le journal, avec le titre du test : il ne protégeait pas cette garde, ce ticket
   ne comble pas ce manque et le test est réécrit quand même.
5. `node --test --test-concurrency=1 tests/review-regressions.test.cjs
   tests/architecture-f08.test.cjs` passe dix fois de suite, sans relance sélective.
6. `node scripts/check.mjs` est vert, mutations annulées.

## Test d'acceptation attendu

Les quatre tests existants, réécrits sur un point d'arrêt nommé. Frontières inchangées :
`CodexSessionClient` devant un App Server simulé ; `WatchSession` devant ses ports simulés.

## Hypothèses bloquantes

Aucune décision n'est attendue. Si l'un des quatre points d'arrêt ne peut être posé qu'en modifiant
le code de production : verdict BLOQUÉ pour le ticket entier, avec le test en cause et ce qui manque
— la boucle n'intègre pas une partie de ticket.

## Journal
