---
id: T062
titre: Leave no private copy of a wait helper in the test files
statut: termine
bloque_par: T061
adr: non
installe: non
harnais: non
supprime_tests: non
niveau: standard
---

## Ce que le ticket livre

Dernier lot : surveillance et vues prennent leurs primitives génériques dans le module partagé.
L'inventaire global contracte ensuite les copies génériques des trois lots ; chaque attente
spécifique restante est nommée avec son contrat distinct.

## Sources

- `docs/audit-architecture.md`, rapport A, B8 et D14 ; rapport B, B7.
  Décision du propriétaire, le 16/10 : dernier lot après T061, qui dépend de T060 puis T199/T178.
- Les aides existent déjà dans `tests/helpers/wait.cjs:11` à `:82` : pause réelle capturée avant
simulation, tick par setImmediate, turns avec nombre explicite, deferred avec resolve/reject,
until nommé et séquentiel borné par horloge monotone (5 s par défaut), bounded qui relaie les
rejets et retourne une sentinelle à l'échéance, failure pour un rejet attendu.

## Périmètre

Modifier seulement les six fichiers du lot, avec le changement propre à chacun :

| Fichier et repères vérifiés | Migration et contrat conservé ou changé |
| --- | --- |
| `tests/surveillance-runtime.test.cjs:12`, `:15`, `:809` | settle devient turns(20) ou le nombre explicite ; until reste en deux phases, 500 tours rapides puis grâce réelle de 5 s, avec primitives partagées et libellé ajouté ; renommer la variable turns qui désigne les messages turn/start. |
| `tests/surveillance.test.cjs:8` et `:9` | deferred partagé ; flush conserve ses microtâches Promise.resolve et son nombre de tours, sans devenir un tour d'événement. |
| `tests/verification.test.cjs:62` | settle devient turns(10) ou le nombre explicite. Aucune autre aide locale dans ce fichier : l'ancien `until` de 2000 tours n'existe plus. |
| `tests/tv-chat-view.test.cjs:108` et `:362` | deferred partagé ; settle d'un seul setImmediate devient tick(). |
| `tests/tv-paired-page.test.cjs:37` et `:71` | mêmes changements deferred/tick ; les identifiants de timers nommés tick restent des variables métier. |
| `tests/mac-ipc-contract.test.cjs:20` et `:214` | pause réelle partagée ; until(t, check, label, stepMs) reste local et conduit l'horloge virtuelle, sans devenir un until réel. |

- Conserver le flush de microtâches de mac-ui et le settle propre à l'horloge partagée : ils ne sont
  pas des copies d'une attente générique. T060/T061 ont déjà migré leurs fichiers ; ne pas les rouvrir
  pour agrandir le lot. Une nouvelle copie hors de ce lot se signale avant extension de périmètre.
- Ne modifier ni produit, ni harnais, ni doubles App Server, ni `tests/helpers/wait.cjs` ou
  `tests/helpers/clock.cjs`. Aucun titre, résultat attendu ou cas de test ne disparaît.
- Les boucles métier et les flush de microtâches gardent leur sens. Aucun socket réel ne reçoit
  une horloge globale simulée. Une sentinelle de bounded n'est jamais assimilée à un succès.

## Critères d'acceptation

1. Consigner avant/après l'inventaire global exact des définitions, tests et aides compris,
   hors ticket-loop, agent-guards et helpers/codex-session. Il couvre aussi les définitions indentées :

```sh
rg -n --glob '*.cjs' \
  --glob '!tests/ticket-loop.test.cjs' \
  --glob '!tests/agent-guards.test.cjs' \
  --glob '!tests/helpers/codex-session.cjs' \
  -e '^\s*(async )?function (tick|deferred|turns|until|settle|settled|pause|bounded|failure|flush|eventually)\b' \
  -e '^\s*(const|let) (tick|deferred|turns|until|settle|settled|pause|bounded|failure|flush|eventually)\s*=\s*(async\s+)?(\([^)\n]*\)|[A-Za-z_$][\w$]*)\s*=>' \
  tests
```

   Après les trois lots, la liste exacte des exceptions attendues est :
   - wait.cjs : pause, tick, turns, deferred, until, bounded, failure (les sept exports canoniques) ;
   - helpers/clock.cjs : settle propre à l'horloge virtuelle ;
   - architecture-f09 : deferred(t, options), port de résumé spécialisé ;
   - architecture-f06 : eventually booléen ; codex-confinement : bounded sans propagation du rejet ;
   - clip-unreadable, disk-guard, session-delete, session-durable : leurs quatre settle(watch) ;
   - surveillance-runtime : until à deux phases ; mac-ipc-contract : until de l'horloge virtuelle ;
   - surveillance et mac-ui : leurs deux flush de microtâches.
   Chaque nom sans chemin développé dans cette liste désigne `tests/<nom>.test.cjs`, les deux
   helpers étant sous `tests/helpers/`. Aucune autre définition ne reste dans la sortie ; les
   données et variables homonymes ne sont pas des fonctions et ne sont pas visées par cette commande.
2. Chaque until générique migré nomme son fait et sa borne ; la variante de surveillance conserve
   ses deux phases et until Mac ses pas simulés. Aucun contrôle asynchrone n'est lancé deux fois
   avant son règlement. Les deux settle de page à un tour deviennent tick, jamais turns arbitraires.
3. Assertions, titres et nombre de cas par fichier restent ceux du début de session. Chaque compte
   explicite reste identique ; les défauts 20 et 10 deviennent explicites. Le journal rapproche
   chaque définition restante de l'exception ci-dessus et donne les changements d'appels/import.
4. À l'implémentation, exécuter les six fichiers un par un, puis wait-helpers et
   `node scripts/check.mjs`. Aucun nouveau test de forme, aucune hausse de délai pour obtenir le vert.

## Test d'acceptation attendu

Les scénarios existants des six fichiers et les contrats publics de wait.cjs. La commande de
contraction et la lecture de ses seules exceptions complètent cette preuve sans ajouter de garde
au harnais. T195 attend ce lot car il modifie aussi mac-ipc-contract, dans une autre zone.

## Hypothèses bloquantes

Aucune décision n'est attendue.

Les repères sont ceux du worktree à `8340014`, à relire après les dépendances. Une différence de
contrat non prévue se consigne avant migration ; elle ne se masque pas en allongeant un délai.
Au premier échec, conserver la sortie et diagnostiquer ; aucune relance jusqu'au vert ni ancienne
sonde slow-fs non livrée n'est nécessaire.

## Journal

### Exploration — Codex

- Lecture des consignes, des six fichiers, des aides partagées, de leurs tests et des ADR 0015/0025/0026/0027. Exploration et écarts prévus dans `.harness-state/tickets/T062/`.
- Commande d’inventaire du critère 1 exécutée exactement : sortie conservée dans `inventaire-avant.txt`, 28 définitions, dont huit copies génériques à retirer et la fonction métier `turns` à renommer. Aucun élargissement nécessaire.
- Les scénarios existants sont la preuve comportementale avant/après ; aucun nouveau test de forme, titre ou attendu. Le critère de contraction est non satisfait avant migration.

### Migration et preuves ciblées — Codex

Les six commandes `node --test tests/<nom>.test.cjs`, exécutées une par une avant puis après migration,
réussissent : surveillance-runtime 16/16, surveillance 17/17, verification 10/10, tv-chat-view 22/22,
tv-paired-page 13/13, mac-ipc-contract 15/15. `node --test tests/wait-helpers.test.cjs` réussit ensuite : 13/13.
Sorties complètes et commandes dans `avant-<nom>.log` et `apres-<nom>.log` du dossier d’état.
Aucun échec comportemental observé ; aucun scénario ajouté ou supprimé pour cette refactorisation.

- `surveillance-runtime` importe `tick`, `turns` et `until` sous le nom `waitUntil` : les 39 appels
  `settle()` deviennent `turns(20)`. Les 27 appels `until` nomment leur fait ; les 500 tours rapides
  séquentiels précèdent la grâce réelle de 5000 ms, bornée par l’horloge monotone de l’aide partagée.
  Les messages `turn/start` s’appellent désormais `turnRequests` ; le double App Server reste identique.
- `surveillance` importe `deferred` ; son `flush` garde strictement `Promise.resolve`, le défaut 300
  et tous ses comptes explicites (20, 600, 1500, 6000).
- `verification` importe `turns` ; l’unique appel `settle()` devient `turns(10)`.
- `tv-chat-view` importe `deferred` et `tick` : les appels `settle()` et les trois barrières directes
  `new Promise(setImmediate)` deviennent `tick()` ; un seul tour reste un seul tour.
- `tv-paired-page` importe `deferred` et `tick` sous le nom `waitTick` pour conserver les identifiants
  métier `tick` des minuteries. Chaque appel `settle()` devient `waitTick()` ; aucune avance arbitraire.
- `mac-ipc-contract` importe `pause` avant la simulation : tous les appels et délais sont conservés.
  Son `until(t, check, label, stepMs)` reste identique (600 essais, pause réelle 5 ms, pas simulé optionnel).

`node .harness-state/tickets/T062/verifier-conservation.cjs` réussit : titres et 992 assertions de
scénarios identiques par AST, modulo le seul renommage `turnRequests`. Les fichiers avant modification,
les listes d’appels avant/après et la sortie sont conservés dans le dossier d’état ; aucune garde
n’est ajoutée au harnais. `git diff --check` réussit.

La commande exacte du critère 1 a été exécutée avant puis après. Inventaires bruts :

Avant (28 définitions) :

```text
tests/verification.test.cjs:62:const settle = async (rounds = 10) => { for (let i = 0; i < rounds; i++) await new Promise(resolve => setImmediate(resolve)); };
tests/tv-paired-page.test.cjs:37:const settle = () => new Promise(setImmediate);
tests/tv-paired-page.test.cjs:71:function deferred() {
tests/mac-ipc-contract.test.cjs:20:const pause = ms => new Promise(resolve => realTimeout(resolve, ms));
tests/mac-ipc-contract.test.cjs:214:async function until(t, check, label, stepMs = 0) {
tests/helpers/wait.cjs:11:const pause = (ms) => new Promise((resolve) => realTimeout(resolve, ms));
tests/helpers/wait.cjs:12:const tick = () => new Promise((resolve) => setImmediate(resolve));
tests/helpers/wait.cjs:14:async function turns(count) {
tests/helpers/wait.cjs:22:function deferred() {
tests/helpers/wait.cjs:31:async function until(check, what, { timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
tests/helpers/wait.cjs:70:async function bounded(promise, ms = DEFAULT_TIMEOUT_MS) {
tests/helpers/wait.cjs:82:function failure(promise, what = "the call") {
tests/helpers/clock.cjs:4:const settle = async () => {
tests/architecture-f09.test.cjs:47:function deferred(t, options) {
tests/disk-guard.test.cjs:15:const settle = async watch => { do { await tick(); } while (watch.running); };
tests/surveillance.test.cjs:6:const flush = async (turns = 300) => { for (let i = 0; i < turns; i++) await Promise.resolve(); };
tests/surveillance.test.cjs:7:const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
tests/surveillance-runtime.test.cjs:12:const settle = async (turns = 20) => { for (let i = 0; i < turns; i++) await new Promise(resolve => setImmediate(resolve)); };
tests/surveillance-runtime.test.cjs:15:const until = async (check, turns = 500, graceMs = 5000) => {
tests/surveillance-runtime.test.cjs:809:    const turns = () => server.sent(web(), 'turn/start');
tests/session-durable.test.cjs:19:const settle = async watch => { do { await tick(); } while (watch.running); };
tests/tv-chat-view.test.cjs:108:function deferred() {
tests/tv-chat-view.test.cjs:362:const settle = () => new Promise(setImmediate);
tests/codex-confinement.test.cjs:768:  const bounded = promise => new Promise(resolve => { const timer = setInterval(() => { clearInterval(timer); resolve('nothing after 5 s'); }, 5000); promise.then(value => { clearInterval(timer); resolve(value); }); });
tests/clip-unreadable.test.cjs:25:const settle = async watch => { do { await tick(); } while (watch.running); };
tests/architecture-f06.test.cjs:28:const eventually = async (check, rounds = 300) => { for (let i = 0; i < rounds; i++) { if (await check()) return true; await pause(5); } return false; };
tests/mac-ui.test.cjs:18:const flush = async (turns = 300) => { for (let i = 0; i < turns; i++) await Promise.resolve(); };
tests/session-delete.test.cjs:15:const settle = async watch => { do { await tick(); } while (watch.running); };
```

Après (19 définitions) :

```text
tests/surveillance.test.cjs:7:const flush = async (turns = 300) => { for (let i = 0; i < turns; i++) await Promise.resolve(); };
tests/surveillance-runtime.test.cjs:14:const until = async (check, label, fastTurns = 500, graceMs = 5000) => {
tests/disk-guard.test.cjs:15:const settle = async watch => { do { await tick(); } while (watch.running); };
tests/architecture-f06.test.cjs:28:const eventually = async (check, rounds = 300) => { for (let i = 0; i < rounds; i++) { if (await check()) return true; await pause(5); } return false; };
tests/session-durable.test.cjs:19:const settle = async watch => { do { await tick(); } while (watch.running); };
tests/codex-confinement.test.cjs:768:  const bounded = promise => new Promise(resolve => { const timer = setInterval(() => { clearInterval(timer); resolve('nothing after 5 s'); }, 5000); promise.then(value => { clearInterval(timer); resolve(value); }); });
tests/mac-ui.test.cjs:18:const flush = async (turns = 300) => { for (let i = 0; i < turns; i++) await Promise.resolve(); };
tests/clip-unreadable.test.cjs:25:const settle = async watch => { do { await tick(); } while (watch.running); };
tests/session-delete.test.cjs:15:const settle = async watch => { do { await tick(); } while (watch.running); };
tests/architecture-f09.test.cjs:47:function deferred(t, options) {
tests/mac-ipc-contract.test.cjs:213:async function until(t, check, label, stepMs = 0) {
tests/helpers/clock.cjs:4:const settle = async () => {
tests/helpers/wait.cjs:11:const pause = (ms) => new Promise((resolve) => realTimeout(resolve, ms));
tests/helpers/wait.cjs:12:const tick = () => new Promise((resolve) => setImmediate(resolve));
tests/helpers/wait.cjs:14:async function turns(count) {
tests/helpers/wait.cjs:22:function deferred() {
tests/helpers/wait.cjs:31:async function until(check, what, { timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
tests/helpers/wait.cjs:70:async function bounded(promise, ms = DEFAULT_TIMEOUT_MS) {
tests/helpers/wait.cjs:82:function failure(promise, what = "the call") {
```

Rapprochement exhaustif des exceptions restantes :

| Fichier | Définition et contrat distinct |
| --- | --- |
| `tests/helpers/wait.cjs` | Les sept primitives canoniques : pause, tick, turns, deferred, until, bounded, failure. |
| `tests/helpers/clock.cjs` | settle lié à l’horloge virtuelle, avec setImmediate capturé. |
| `tests/architecture-f09.test.cjs` | deferred(t, options), port de résumé avec refus de capacité et nettoyage. |
| `tests/architecture-f06.test.cjs` | eventually retourne un booléen au lieu d’échouer à la borne. |
| `tests/codex-confinement.test.cjs` | bounded sur setInterval réel pendant la simulation de setTimeout, sans propagation de rejet. |
| `tests/clip-unreadable.test.cjs` | settle(watch), jusqu’à la fin du travail de la session. |
| `tests/disk-guard.test.cjs` | settle(watch), même contrat lié à watch.running. |
| `tests/session-delete.test.cjs` | settle(watch), même contrat lié à watch.running. |
| `tests/session-durable.test.cjs` | settle(watch), même contrat lié à watch.running. |
| `tests/surveillance-runtime.test.cjs` | until avec 500 tours rapides puis 5 s de grâce réelle. |
| `tests/mac-ipc-contract.test.cjs` | until conduit les pas de l’horloge simulée entre les lectures réelles. |
| `tests/surveillance.test.cjs` | flush de microtâches, sans tour d’événement. |
| `tests/mac-ui.test.cjs` | flush de microtâches, sans tour d’événement. |

Comparaison de l’ensemble attendu à la sortie observée réussie : `contraction.log`, 19 définitions dans
13 fichiers, aucune autre. Helpers, produit, harnais et doubles App Server restent hors modification.

### Contrôle des fichiers modifiés — Codex

`node scripts/check.mjs --changed` : vert, code 0. Règles par fichier, format, lint, gel du lint et
cliquet passent ; les six fichiers totalisent 93 tests, 93 réussis, zéro échec. Une ligne longue de
moins dans les tests (1657 → 1656). Sortie intégrale : `.harness-state/tickets/T062/check-changed.log`.
Le plancher du cliquet reste à la charge de la boucle.

### Contrôle complet et remise à la boucle — Codex

`node scripts/check.mjs` : vert, code 0. Règles, format, lint, gel du lint et cliquet passent ;
120 fichiers JavaScript, 1652 tests réussis, zéro échec ; 22 tests Python réussis.
Sortie intégrale : `.harness-state/tickets/T062/check-complet.log`.

Critères couverts : huit copies génériques retirées, inventaire contracté de 28 à 19 définitions,
contrats spécialisés conservés et attentes nommées, 93 scénarios du lot et 13 contrats publics des
aides réussis, titres et assertions conservés. Aucun délai augmenté, aucune modification produit,
helpers ou harnais. Verdict `TERMINÉ` écrit dans `.harness-state/tickets/T062/verdict.json`.
Aucun commit ni push ; relecture et intégration laissées à la boucle.

### Reprise après relecture 1 — Codex

Rapport `relecture-1.md`, journal, écarts, consignes, statut et diff relus. Le constat mineur est accepté :
supprimer la ligne vide créée par le retrait de `deferred` et restaurer l’espacement historique avant
« the open panel controls… ». Aucun changement de comportement ni écart prévu ; aucun test de forme ajouté.

Correction limitée à deux lignes vides de `tests/tv-paired-page.test.cjs`, conservée dans
`reprise-1-correction.diff`. Aucun jeton de code changé ; aucun rouge comportemental attendu pour
cette correction d’espacement. `node --test tests/tv-paired-page.test.cjs` avant correction : 13/13
(`reprise-1-test-avant.log`). `node .harness-state/tickets/T062/verifier-conservation.cjs` après
correction : titres et 992 assertions conservés (`reprise-1-conservation.log`).
`node scripts/check.mjs --changed` : vert, code 0, 93/93 tests ; règles, format, lint, gel et cliquet
validés (`reprise-1-check-changed.log`). `git diff --check` : code 0.

`node scripts/check.mjs` après correction : vert, code 0 ; règles, format, lint, gel du lint et cliquet
validés, 1652/1652 tests JavaScript dans 120 fichiers et 22 tests Python réussis. Sortie conservée dans
`reprise-1-check-complet.log`. Constat mineur de `relecture-1.md` corrigé intégralement ; aucune
contestation ni réserve. Nouveau verdict `TERMINÉ` écrit ; relecture et intégration laissées à la boucle,
sans commit ni push.
