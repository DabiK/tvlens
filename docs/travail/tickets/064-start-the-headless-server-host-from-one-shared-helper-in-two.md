---
id: T064
titre: Start the headless server host from one shared helper in two test files
statut: a-faire
bloque_par: T061
adr: non
installe: non
harnais: non
supprime_tests: non
---

## Ce que le ticket livre

Monter un vrai `HeadlessRuntime` derrière un vrai `RemoteServer` sur un port éphémère est refait dans
neuf fichiers de test, chacun avec son jeton, sa fonction de requête et ses horloges ; trois fabriques
prennent `runtimeOptions`, une comme fonction et deux comme objet. Après ce ticket,
`tests/helpers/server-host.cjs` monte cet hôte une fois, et deux fichiers l'utilisent. Les sept autres
fichiers ne sont pas touchés ici.

## Sources

- Constats : OUBLI-38, TSTA-04, TSTB-04
- Code vérifié à la version `0d5a954` (le nom d'abord, la ligne ensuite) :
  - `tests/server-sessions.test.cjs` : `const token`, ligne 13 (lu lignes 84 et 89, dans la fabrique
    seulement) ; `async function fixture(t, { chat, runtimeOptions = () => ({}) } = {})`, ligne 73 —
    racine temporaire, horloges `f.clock` (0) et `f.wall` (1790000000000) tenues par le test, compteurs
    `f.calls`, doublures `agent`, `embeddings` et `media` (image JPEG produite par `sharp`) ; l'hôte
    est créé avec `selectedModels: {}`, `readClock: () => f.clock`, `wallClock: () => f.wall`,
    `overrides: { embeddings }` puis `...runtimeOptions(f)` ; `f.boot()`, ligne 81, rappelable sur la
    même racine (redémarrage) ; `f.hosts` ; `f.raw`, ligne 89 ; `f.req(route, body)`, ligne 90 — POST
    quand `body` est donné, GET sinon, rend `{ status, value }` avec `value` lu par `res.json()` ; puis
    `f.block`, `f.ask`, `f.saved` (ligne 109) et `f.polled` ; arrêt de tous les hôtes et suppression de
    la racine en fin de test, ligne 115. 14 tests.
  - Le même fichier écrit `new HeadlessRuntime(` une seconde fois, ligne 627, dans le
    `const host = env =>` d'un test de réglages : ce n'est pas un montage serveur, il reste en place.
  - `tests/server-ingest-path.test.cjs` : `const token`, ligne 8 ; `async function fixture(t, { media,
    runtimeOptions = {} } = {})`, ligne 10 — hôte créé avec trois modèles `test` dans `selectedModels`,
    `readClock` seul (pas de `wallClock` : horloge murale réelle), sans doublure d'embeddings, agent
    propre, doublure d'assemblage propre (`ingest: { assembleMs: 37 }`) ; `req(route, body, method)`
    rend `{ status, headers, value }` ; rend `{ runtime, server, req, setClock }` ; trois appelants,
    lignes 26, 37 et 91 : aucun ne passe `runtimeOptions`, aucun appel à `req` ne passe de méthode et
    aucun test ne lit `headers` sur son résultat. 5 tests.
  - Autres montages, hors de ce ticket : `host` de `tests/architecture-f06.test.cjs` (ligne 121, qui
    prend lui aussi `runtimeOptions = {}`), `serverHost` de `tests/architecture-f07.test.cjs`
    (ligne 169), `served` de `tests/architecture-f10.test.cjs` (ligne 75), et `new RemoteServer(` dans
    `tests/remote-server.test.cjs`, `tests/server-surveillance.test.cjs`,
    `tests/server-state-views.test.cjs` et `tests/timeline-server.test.cjs`.

## Périmètre

- À modifier :
  - `tests/helpers/server-host.cjs` (nouveau) : `startServerHost(t, options)`, né du `fixture` de
    `tests/server-sessions.test.cjs` ;
  - `tests/server-sessions.test.cjs` : `fixture` se réduit à un appel à l'aide, plus les gestes de
    scénario du fichier (`block`, `ask`, `polled`) écrits sur l'hôte rendu ;
  - `tests/server-ingest-path.test.cjs` : `fixture` se réduit à un appel à l'aide avec ses propres
    doublures ; son `runtimeOptions`, que personne ne passe, disparaît.
- À ne pas toucher : `server/`, `runtime/` et tout le code de production ; les sept autres fichiers qui
  montent un hôte serveur ; le `const host = env =>` de la ligne 627 de
  `tests/server-sessions.test.cjs` ; les titres des tests et les valeurs attendues.
- Forme de l'aide, à respecter :
  - `startServerHost(t, { agent, media, embeddings, selectedModels = {}, wall = 1790000000000,
    runtimeOptions = () => ({}) } = {})` ; `runtimeOptions` est toujours une fonction de l'hôte ; les
    doublures par défaut sont celles de `tests/server-sessions.test.cjs` ;
  - `wall: null` laisse l'hôte sur l'horloge murale réelle (aucun `wallClock` passé) et
    `embeddings: null` ne pose aucune doublure d'embeddings (aucune clé `overrides` passée) : ce sont
    les deux écarts de `tests/server-ingest-path.test.cjs`, qui les demande par ces deux options ;
  - l'hôte rendu porte `root`, `sessionsRoot`, `token`, `clock`, `wall`, `calls`, `runtime`, `server`,
    `hosts`, `boot()`, `raw(route, init)`, `req(route, body)` et `saved(id, name)` ;
  - `req` garde le sens de celui de `tests/server-sessions.test.cjs` et rend `{ status, value }` ;
    `method` et `headers`, que personne n'utilise, ne sont pas repris ; les en-têtes se lisent par `raw` ;
  - un seul jeton, porté par l'hôte ; les deux `const token` locaux disparaissent ;
  - l'arrêt des hôtes et la suppression de la racine sont inscrits par l'aide sur `t.after`.
- Ce ticket ne change la configuration d'aucun des deux hôtes : chaque fichier garde ses
  `selectedModels`, son horloge murale, ses doublures et ses options d'hôte d'aujourd'hui.
- `setClock` de `tests/server-ingest-path.test.cjs` devient une écriture de `clock` sur l'hôte.
- Aucune dépendance nouvelle (`sharp` est déjà utilisé par ces tests). Aucune ligne de plus de 160
  caractères dans le fichier créé ni ajoutée ailleurs.

## Critères d'acceptation

Chaque critère se vérifie par un test ou une commande.

1. `grep -n "new RemoteServer(\|const token" tests/server-sessions.test.cjs tests/server-ingest-path.test.cjs`
   ne sort rien ; `grep -c "new HeadlessRuntime("` vaut 0 pour `tests/server-ingest-path.test.cjs` et 1
   pour `tests/server-sessions.test.cjs` (le `const host = env =>` du test de réglages) ; les deux
   fichiers importent `./helpers/server-host.cjs`.
2. `grep -n "runtimeOptions" tests/server-ingest-path.test.cjs` ne sort rien, et
   `grep -n "runtimeOptions = {}" tests/helpers/server-host.cjs` non plus : dans l'aide, une seule
   forme, la fonction.
3. `grep -c "wall: null"` et `grep -c "embeddings: null"` valent chacun 1 dans
   `tests/server-ingest-path.test.cjs` et 0 dans `tests/server-sessions.test.cjs`.
4. `grep -c "^\s*test(" ` donne toujours 14 pour `tests/server-sessions.test.cjs` et 5 pour
   `tests/server-ingest-path.test.cjs`.
5. `git diff -U0 HEAD -- tests/server-sessions.test.cjs tests/server-ingest-path.test.cjs | grep -E "^-.*assert\."`
   ne sort rien. Sortie dans le journal.
6. `node --test --test-concurrency=1 tests/server-sessions.test.cjs tests/server-ingest-path.test.cjs`
   passe ; le test de redémarrage de `tests/server-sessions.test.cjs` (« the start of a film is still
   served 95 minutes later, after a stop and a restart… ») en fait partie.
7. `node scripts/check.mjs` est vert.

## Test d'acceptation attendu

Les tests existants des deux fichiers, sans changement d'exigence. Frontière : les routes HTTP `/v1`
d'un vrai `RemoteServer` devant un vrai `HeadlessRuntime`, comme aujourd'hui ; le test de redémarrage
prouve que `boot()` remonte un hôte sur la même racine.

## Hypothèses bloquantes

Aucune décision n'est attendue. Si l'un des deux fichiers a besoin d'un comportement du montage que
l'autre contredit et que ni `wall`, ni `embeddings`, ni `selectedModels`, ni `runtimeOptions` ne
sépare, ou si la migration exige de modifier le code de production : verdict BLOQUÉ, avec l'écart
constaté. Un test n'est jamais relancé jusqu'à ce qu'il passe.

## Journal
