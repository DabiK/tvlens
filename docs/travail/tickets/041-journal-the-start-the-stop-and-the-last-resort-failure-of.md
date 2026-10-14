---
id: T041
titre: Journal the start, the stop and the last-resort failure of the server host
statut: a-faire
bloque_par: T039
adr: non
installe: non
harnais: non
supprime_tests: non
---

## Ce que le ticket livre

Le serveur n'écrit ni sa version, ni la révision dont il vient, ni la version de Node, ni le signal qui
l'arrête ; et aucun hôte Node n'a de gestionnaire de dernier recours : une exception non attrapée sort
comme une pile brute, sans dire quelle session était ouverte. Après ce ticket, le serveur écrit au
journal son démarrage, son arrêt demandé, son arrêt terminé, et une ligne `fatal` avant de sortir sur
une exception ou un rejet non traités. Ce ticket ne traite que l'hôte serveur.

## Sources

- Constats : OUBLI-55, GAP1-05
- Code vérifié à la version `0d5a954` :
  - `server/main.cjs` : `settings(env)` lignes 9-21 ; `main()` lignes 22-45 ; `console.log` du balayage
    des contextes ligne 36 et du démarrage ligne 41 ; `close` et `process.on('SIGTERM'/'SIGINT')` lignes
    43-44 ; `if(require.main===module)main().catch(e=>{console.error(e.message);process.exit(1)})`
    ligne 47 ; exports `{settings,main}` ligne 48. Le fichier porte des lignes de plus de 160
    caractères : toute ligne ajoutée reste en dessous, et aucune ligne longue n'est allongée.
  - `runtime/headless-runtime.cjs` : `this.boot` ligne 250 ; `close()` lignes 1112-1142.
  - `mcp/server.cjs` lignes 78-81 et `app/main.cjs` lignes 549-550 : les deux autres hôtes, hors de ce
    ticket.
  - Aucun `process.on('uncaughtException')` ni `process.on('unhandledRejection')` dans le dépôt.
  - `tests/server-sessions.test.cjs`, test « the server host reads its reversible settings strictly… »
    ligne 619 : importe `settings` de `server/main.cjs` (ligne 620), qui doit rester chargeable sans rien
    démarrer, et compare son retour entier par `deepEqual` (ligne 621) : `settings` ne gagne aucune clé.
  - `scripts/quality/metrics.mjs`, `ENV_READERS` ligne 15 : `server/main.cjs` a le droit de lire
    `process.env` ; un module de `runtime/` ne l'a pas.
  - `package.json` : `"version": "0.1.0"` ligne 3.
- Livré par T036 et T039 : le port, la fabrique, le puits mémoire, et le journal composé dans
  `server/main.cjs`.

## Périmètre

À créer :

- `runtime/last-resort.cjs` : `installLastResort({ journal, context, exit, target })`. Sur
  `uncaughtException` et `unhandledRejection` de `target` (par défaut `process`), il émet une ligne
  `host.fatal` de niveau `fatal` avec l'erreur, l'origine (`origin`) et ce que rend `context()` (au plus
  l'identifiant de la session en cours), puis appelle `exit(1)`. Un `context` ou un journal qui lève
  n'empêche pas `exit`. Le module ne lit pas `process.env` et n'installe rien à son chargement.
- Dans `server/main.cjs`, une fonction exportée, chargée de l'arrêt, qu'un test peut piloter sans
  démarrer le serveur : sur `SIGTERM` ou `SIGINT` elle émet `host.stopping` avec le signal, ferme le
  serveur puis le runtime comme aujourd'hui, émet `host.stopped` avec la durée, puis sort ; un second
  signal pendant l'arrêt est sans effet, comme aujourd'hui.
- `tests/host-lifecycle.test.cjs`.

À modifier :

- `server/main.cjs` : après l'écoute, `host.started` avec la version du paquet, la révision
  (`TVLENS_REVISION`, sinon `unknown` ; si une lecture de cette variable existe déjà dans le fichier, elle
  est réutilisée, pas doublée) et la version de Node. Les réglages retenus n'y figurent pas : leurs clés
  sont hors liste blanche. L'émission passe par une fonction exportée qui reçoit le journal et
  l'environnement, pour qu'un test la pilote sans démarrer le serveur. `settings()` n'est pas modifié.
  `installLastResort` est appelé depuis `main()`, jamais au chargement du module. Les deux `console.log`
  et le `console.error` existants restent tels quels.
- `runtime/journal.cjs` : la liste blanche gagne `version`, `revision`, `node` et `signal`.
- `docs/diagnostic.md` : les quatre événements et leurs champs ; la révision vaut `unknown` tant que le
  déploiement ne pose pas la variable.

À ne pas toucher :

- `app/main.cjs`, `mcp/server.cjs` : aucun gestionnaire n'y est installé par ce ticket.
- `runtime/headless-runtime.cjs`. Aucun fichier témoin d'arrêt n'est écrit sur le disque.
- Le jeton, son chemin et tout réglage secret : ils n'entrent pas au journal.

## Critères d'acceptation

Chaque critère se vérifie par un test ou une commande.

1. `node --test tests/host-lifecycle.test.cjs` passe et prouve, avec un émetteur factice à la place de
   `process` et le puits mémoire :
   - une exception non attrapée donne exactement une ligne `host.fatal` de niveau `fatal`, portant
     l'erreur, `origin` et l'identifiant de session rendu par `context`, puis un appel `exit(1)` ;
   - un rejet non traité fait de même ;
   - un `context` qui lève, puis un puits qui lève, n'empêchent pas `exit(1)` ;
   - charger `runtime/last-resort.cjs` n'ajoute aucun écouteur à `process`.
2. Le même fichier prouve, avec un faux serveur et un faux runtime qui notent leur fermeture : `SIGTERM`
   donne `host.stopping` portant `signal: 'SIGTERM'`, puis la fermeture du serveur avant celle du
   runtime, puis `host.stopped`, puis la sortie avec le code 0 ; un second signal pendant l'arrêt ne
   ferme rien deux fois.
3. Le même fichier prouve que la fonction de démarrage émet une ligne `host.started` portant `version`
   (celle de `package.json`), `node` et `revision` : la valeur de `TVLENS_REVISION` quand
   l'environnement passé la donne, `unknown` sinon.
4. `require('../server/main.cjs')` depuis un test n'ajoute aucun écouteur à `process` et ne démarre rien ;
   le test « the server host reads its reversible settings strictly… » de
   `tests/server-sessions.test.cjs` passe sans changement.
5. Aucune ligne de journal du test ne contient le jeton ni un chemin absolu.
6. `grep -n "process.env" runtime/last-resort.cjs` ne rend rien.
7. `grep -n "installLastResort" server/main.cjs` et `grep -n "host.started" server/main.cjs` rendent
   chacun au moins une ligne. Aucun test ne lance `main()` : ce câblage n'est constaté que par ces
   commandes.
8. `node scripts/check.mjs` est vert.

## Test d'acceptation attendu

`tests/host-lifecycle.test.cjs`, nouveau.
Frontières : `installLastResort` de `runtime/last-resort.cjs` et la fonction d'arrêt exportée par
`server/main.cjs`, avec un émetteur factice, un `exit` factice et le puits mémoire. Aucun processus
n'est lancé, aucun port n'est ouvert.

## Hypothèses bloquantes

Aucune décision n'est attendue. `main()` lit le jeton et la configuration réels : aucun test ne le
lance, et le câblage des trois fonctions dans `main()` n'est constaté que par les commandes du critère 7 ;
le journal du ticket le dit tel quel. Si un test existant exige que `SIGTERM` et `SIGINT` soient écoutés d'une autre
façon : verdict BLOQUÉ, avec l'écart constaté.

## Journal
