---
id: T068
titre: Gate close-during-reconnect and retry tests on a named step, not a count
statut: a-faire
bloque_par: T058, T062, T294
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
- Code vérifié à la version `1178657` (le nom d'abord, la ligne ensuite ; le constat d'origine porte
  sur `0d5a954`) :
  - `tests/review-regressions.test.cjs` : `function appServer({ handle } = {})`, ligne 27 — sa doublure
    de transport répond `close() { process.closed = true; }`, sans promesse (ligne 32) ; test « a client
    closed while its process is being recycled stays closed », ligne 66 — `client.rotateThread()` puis
    `await Promise.resolve(); await Promise.resolve(); await Promise.resolve();`, ligne 71, puis
    `await client.close()` ; test « a client closed while a turn is removing a dead connection stays
    closed », ligne 361 — `onEvent('connection/closed', {})`, `client.answer(…)`, puis
    `for (let i = 0; i < 6; i++) await Promise.resolve();`, ligne 369, puis `controller.abort(…)` et
    `await client.close()`.
  - `adapters/codex-session-client.cjs` : `rotateThread()`, ligne 173 ; `async rotate()`, ligne 193 —
    quand le nombre de rotations est atteint, `expected = (this.generation || 0) + 1; await
    this.close(); if (this.generation === expected) this.prepare(sessionId)…`, lignes 204-207 : c'est
    la garde que le premier test protège ; `async prepare(sessionId)`, ligne 232 — boucle `while
    (this.ready || this.dir)`, `await this.close()`, puis `if (this.generation !== expected &&
    !this.ready && !this.dir) throw Error("Connexion obsolète.")`, lignes 234-240 : la garde que le
    second test protège ; `finish()`, ligne 609 — `const answer = left.rpc?.close(); if (answer &&
    (await exitOf(answer)) === false)`, lignes 613-614, puis `if (left.dir) await fs.rm(left.dir, {
    recursive: true, force: true })`, ligne 621 ; son commentaire (lignes 607-608) dit qu'une doublure
    de transport qui répond une promesse doit la tenir ; `async close()`, ligne 643, avance
    `generation`. Le module n'a pas de disque injectable (`require("node:fs/promises")`, ligne 8).
  - `adapters/codex-session-events.cjs` : `connection/closed`, aiguillé ligne 238, appelle
    `connectionClosed(state)`, lignes 71-79, qui efface `ready`, termine le drainage et rejette le tour
    actif, mais garde `rpc` : dans les deux tests, le transport existe donc encore quand `finish()`
    l'appelle, et une doublure dont `close()` rend une promesse tenue arrête bien le client sur cette
    étape.
  - `tests/architecture-f05.test.cjs` : `function treeRemovals(t)`, ligne 47 — doublure de `fsp.rm`
    limitée aux arbres `tvlens-codex-session-*`, avec `hold` et `release` : modèle existant d'une
    suppression tenue ; les transports de ce fichier répondent à `close()` par une promesse `exit`
    que le test résout (`first.exit.resolve(true)`, ligne 264).
  - `tests/architecture-f08.test.cjs` : test « what allows the second call is checked again once the
    media have been read again », ligne 166 — `f.media.read = async id => { … if (id === 'moment-1' &&
    ++reads === 3) await reread.promise; … }`, ligne 175, puis `assert.deepEqual([calls, reads],
    [['moment-1'], 3], name)`, ligne 177 ; test « media that cannot be read again end the description
    at its first failure », ligne 188 — `if (++reads === 3) throw Error('ENOENT…')`, ligne 192. T223
    (`16be86b`) a retiré de ce second test le cas des médias qui ne sont plus gardés, et « or are no
    longer kept » de son titre.
  - La reprise d'une description a quitté `core/session.cjs` pour `core/memory/lanes.cjs` (T214,
    `c3bf726`) : `#retriesVision(segment, error)`, ligne 206 ; dans `#drainVision` (ligne 227),
    première vérification ligne 250, relecture `try { evidence = await
    this.#ports.readMedia(segment.id); } catch { throw error; }`, lignes 252-256, seconde vérification
    `if (!this.#retriesVision(segment, error)) throw error;`, ligne 257. `core/session.cjs` branche
    `readMedia` sur `this.media.read`, ligne 66.
- Hors périmètre, après lecture : `tests/codex-connect-race.test.cjs`, ligne 39 (`close()` appelé de
  façon synchrone après `prepare`, pas une étape comptée) ; `tests/codex-thread-rotation.test.cjs`,
  lignes 120, 151 et 172 (cinq `tick()` après une barrière tenue ou un rejet attendu : preuves
  d'absence, pas des synchronisations) ; les autres assertions de `tests/architecture-f08.test.cjs`
  sur le nombre de lectures (lignes 59, 105, 120, 132, 141, 162, 247, 252), qui mesurent un coût
  et restent où elles sont.
- Même motif relevé à `1178657`, hors des quatre tests du constat : `tests/memory-lanes.test.cjs`,
  test « read-only memory and unavailable media refuse a visual retry before and after the second
  media read », ligne 56, tient la troisième lecture par `++reads === 3 && stage === 'reread'`,
  ligne 67. Ce ticket le couvre aussi, sur décision de l'orchestrateur du 19/10.
- `tests/helpers/wait.cjs`, livré par T055 : `turns` (ligne 14), `deferred` (ligne 22),
  `until(check, what)` (ligne 31).

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
  - `tests/memory-lanes.test.cjs`, le test de la ligne 56 : même règle, la lecture tenue est reconnue par un fait,
    non par son rang.
- À ne pas toucher : le code de production, sauf pour les mutations temporaires du critère 4,
  annulées avant la fin ; les autres tests de ces trois fichiers ; les assertions existantes, valeurs
  attendues comprises (`[['moment-1'], 3]` reste une assertion, elle ne sert plus de déclencheur).

## Critères d'acceptation

Chaque critère se vérifie par un test ou une commande.

1. `grep -n "await Promise.resolve()" tests/review-regressions.test.cjs` ne sort rien (les lignes 71
   et 369 sont aujourd'hui les deux seules).
2. `grep -n "++reads === 3" tests/architecture-f08.test.cjs tests/memory-lanes.test.cjs` ne sort rien.
3. Chacun des cinq tests attend l'arrivée à son étape par une promesse ou un `until` borné qui
   nomme l'étape, et échoue en la nommant si elle n'est jamais atteinte.
4. Preuve par mutation, une par test, mutation annulée ensuite. Chaque mutation est lancée deux fois,
   commande et sortie dans le journal : d'abord contre le test tel qu'il est avant ce ticket, puis
   contre le test réécrit.
   - garde `if (this.generation === expected)` de `rotate()` (ligne 207) retirée → le test de la
     ligne 66 échoue ;
   - garde `this.generation !== expected` de `prepare()` (ligne 239) retirée → le test de la ligne 361
     échoue ;
   - seconde vérification `#retriesVision` de `core/memory/lanes.cjs` (ligne 257) retirée → le test
     de la ligne 166 échoue ;
   - `catch { throw error; }` de la relecture (`core/memory/lanes.cjs`, lignes 254-256) remplacé par
     la propagation de l'erreur du disque → le test de la ligne 188 échoue.
   Une mutation qui fait échouer le test d'avant fait échouer le test réécrit : sinon la réécriture a
   perdu la protection et n'est pas finie. Une mutation qui laisse vert le test d'avant est notée
   telle quelle dans le journal, avec le titre du test : il ne protégeait pas cette garde, ce ticket
   ne comble pas ce manque et le test est réécrit quand même.
5. `node --test --test-concurrency=1 tests/review-regressions.test.cjs
   tests/architecture-f08.test.cjs` passe dix fois de suite, sans relance sélective.
6. `node scripts/check.mjs` est vert, mutations annulées.

## Test d'acceptation attendu

Les cinq tests existants, réécrits sur un point d'arrêt nommé. Frontières inchangées :
`CodexSessionClient` devant un App Server simulé ; `WatchSession` devant ses ports simulés.

## Hypothèses bloquantes

Aucune décision n'est attendue. Si l'un des quatre points d'arrêt ne peut être posé qu'en modifiant
le code de production : verdict BLOQUÉ pour le ticket entier, avec le test en cause et ce qui manque
— la boucle n'intègre pas une partie de ticket.

## Journal

- 19/10, orchestrateur : rouvert sur décision du propriétaire (sélection du tri d'Astra) ; sources mises à
  jour à `1178657` : lignes des deux tests de `tests/review-regressions.test.cjs` (66 et 361) et du
  client Codex, `connection/closed` passé dans `adapters/codex-session-events.cjs`, reprise d'une
  description passée de `core/session.cjs` à `core/memory/lanes.cjs` (T214), titre du second test de
  `tests/architecture-f08.test.cjs` raccourci par T223 ; critères 1 et 4 recalés sur ces lignes, sans
  changer leur exigence. Même motif signalé dans `tests/memory-lanes.test.cjs` ligne 67, hors de ce
  ticket. Bloqueurs revus : T145 retiré (file rouverte) ; T058 et T062 gardés (terminés) ; T057, T059,
  T063 et T064 retirés (non terminés, sans objet ici) : ils outillent d'autres fichiers (hôte Mac de
  `tests/architecture-f05.test.cjs`, faux DOM, faux App Server de `tests/verification.test.cjs` et
  `tests/surveillance-runtime.test.cjs`, hôte serveur), et T063 exclut nommément
  `tests/review-regressions.test.cjs` et `tests/architecture-f08.test.cjs` ; ce ticket n'a besoin que de
  `tests/helpers/wait.cjs`, livré. T294 ajouté (le ticket passe après la file en cours).
- 19/10, orchestrateur : le test de `tests/memory-lanes.test.cjs` (ligne 56) entre dans ce ticket.
