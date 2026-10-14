---
id: T019
titre: Declare the IPC channels of the Mac host once and check them at runtime
statut: a-faire
bloque_par: T015
adr: non
installe: non
harnais: non
supprime_tests: non
---

## Ce que le ticket livre

Les 49 canaux d'appel et les 11 canaux d'événement de l'hôte Mac n'existent que comme chaînes éparses
dans `app/main.cjs`, et le test du contrat les retrouve par expression régulière. Après ce ticket, ils
sont déclarés dans une table que l'hôte consulte : un canal hors table est refusé, tous les événements
passent par la même aide, et le test compare la table aux gestionnaires réellement enregistrés par un
hôte lancé sur le banc et aux canaux réellement utilisés par le vrai preload.

## Sources

- Constats : TSTC-03, OUBLI-15
- Code concerné, à la version `0d5a954` :
  - `app/main.cjs`, aides `handle` et `send` (l.84-88), définies dans la fermeture de
    `app.whenReady().then(async () => {` (l.46) ; `sandbox: true` (l.81).
  - `app/main.cjs`, sept envois directs `window.webContents.send(` qui contournent `send` : dans
    `keepMoment` (l.95, `saved:changed`), `registerShortcut` (l.99, `saved:error`), l'état de recherche
    approfondie (l.169, `deep:state`), l'état du résumé (l.210, `recap:state`), `onChange` du service de
    vérification (l.238, `verify:state`), le raccourci d'explication (l.517 `moments:explain-requested`,
    l.518 `saved:error`). Ce dernier bloc ne s'exécute pas en mode `--smoke-test` (l.510-520).
  - `app/preload.cjs` : 57 méthodes sous `tvlens`, 3 sous `capture` ; le preload est isolé et ne peut
    pas charger un module de l'application : les noms de canaux y restent écrits.
  - `tests/mac-ipc-contract.test.cjs` : `loadBridge` (l.45-57), `launch` (l.141-194, `handlers` est la
    table remplie par `ipcMain.handle`, toujours `--smoke-test` l.168), `stage` (l.197-202).
  - `tests/mac-ipc-contract.test.cjs`, test « every bridge call has its handler, every event its
    listener, and the host no longer purges, preempts or knows Auto » (l.86) : relevés `handled` et
    `sent` dans le texte (l.94), égalités (l.95-96), canaux exigés (l.97-100), tranche de composition
    bornée par `'surveillanceTimer = setInterval'` (l.111), balayage au démarrage lu dans le texte
    (l.114).
  - Le balayage des contextes Codex au démarrage est déjà prouvé par le comportement : test « a Mac
    session is archived instead of purged… » (l.227), `assert.deepEqual(host.sweeps, [[]], …)` (l.236),
    et test « host settings come from the environment… » (l.451), où un balayage qui lève `EACCES`
    laisse `[host.started, host.sweeps.length]` à `[true, 1]` (l.469-470).
- Mesures à `0d5a954` : `node -e` appliquant `/(?<![.\w])handle\(\s*'([^']+)'/g` à `app/main.cjs` trouve
  49 canaux distincts ; `/\bsend\(\s*'([^']+)'/g` en trouve 11 : `deep:state`,
  `moments:explain-requested`, `recap:state`, `saved:changed`, `saved:error`, `sessions:changed`,
  `storage:state`, `surveillance:state`, `verify:state`, `watch:reset`, `watch:state`.

## Périmètre

- À créer : `app/ipc-channels.cjs`, qui exporte `CALLS` (49 noms), `EVENTS` (11 noms), figés, et deux
  fonctions qui rendent le canal reçu ou lèvent une erreur en français nommant le canal hors table.
- À modifier : `app/main.cjs` — `handle` et `send` passent le canal par ces fonctions ; les sept envois
  directs passent par `send`. Aucun canal n'est renommé, ajouté ni retiré.
- À modifier : `tests/mac-ipc-contract.test.cjs`, test de la l.86 :
  - `handled` devient la liste des gestionnaires d'un hôte lancé par `launch()` ; elle égale `CALLS` et
    les canaux invoqués par le vrai preload ; les canaux écoutés par le preload égalent `EVENTS` ;
  - les canaux exigés et l'absence de canal `auto:` se lisent sur ces listes ;
  - un garde statique, indifférent à la mise en page et qui échoue s'il ne trouve rien, reste pour ce
    que le banc n'exécute pas : les noms passés à `send(` dans `app/main.cjs` égalent `EVENTS`, et il
    n'y a qu'un `ipcMain.handle(` et un `webContents.send(` dans le fichier ;
  - la tranche de composition de la surveillance est bornée par la fin de l'appel
    `createSurveillanceRuntime(`, plus par la minuterie ;
  - l'assertion de la l.114 est retirée : son exigence est prouvée par le comportement aux l.236 et
    l.469-470.
- Restent tels que le premier ticket du lot les a laissés : les comptages d'annulation et d'arrêt
  (l.106-109), l'agent simulé de la composition (l.112-113), les deux configurations de repli
  (l.116-117), les absences (l.103-105).
- À ne pas toucher : `app/preload.cjs`, `runtime/`, `server/`, les autres tests du fichier.
- Les deux fautes injectées pour la preuve du critère 5 sont défaites à la main avant la fin de la
  session, et le fichier de test relancé ensuite.
- `app/main.cjs` ne gagne aucune ligne de plus de 160 caractères ; le nouveau module n'en a aucune.

## Critères d'acceptation

Chaque critère se vérifie par un test ou une commande.

1. `node --test --test-concurrency=1 tests/mac-ipc-contract.test.cjs` passe, 12 tests au moins.
2. Dans le test du contrat, sur un hôte lancé par `launch()` et démarré (`host.started` vrai) : les clés
   de `host.handlers`, `CALLS` et les canaux invoqués par le vrai preload sont le même ensemble de
   49 noms ; les canaux écoutés par le preload et `EVENTS` sont le même ensemble de 11 noms.
3. Un test prouve que chacune des deux fonctions de `app/ipc-channels.cjs` rend un canal déclaré et
   lève, en nommant le canal, sur un canal absent de sa table.
4. `grep -c "webContents.send(" app/main.cjs` rend 1.
5. Fautes injectées, consignées au journal puis défaites : retirer un nom de `CALLS` empêche l'hôte du
   banc de démarrer et fait échouer le test ; écrire un `send('canal:inconnu', …)` dans `app/main.cjs`
   fait échouer le garde statique.
6. `grep -c "surveillanceTimer" tests/mac-ipc-contract.test.cjs` rend 0.
7. `node scripts/check.mjs` est vert.

## Test d'acceptation attendu

Le test existant de `tests/mac-ipc-contract.test.cjs`, réécrit, et le test de la table. Frontière : le
vrai `app/main.cjs` lancé par `launch()` devant le faux Electron du fichier, et le vrai
`app/preload.cjs` chargé par `loadBridge`.

## Hypothèses bloquantes

Aucune décision n'est attendue. Si l'un des sept envois directs n'a pas `send` à sa portée, si passer
par `send` (qui n'envoie rien à une fenêtre détruite) fait échouer un test existant, ou si les
gestionnaires du banc ne sont pas les 49 canaux relevés : verdict BLOQUÉ, avec l'écart constaté.

## Journal
