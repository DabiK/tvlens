---
id: T072
titre: Let a session say what it still has in flight and when it is at rest
statut: a-faire
bloque_par: T071, T145
adr: oui
installe: non
harnais: non
supprime_tests: non
---

## Ce que le ticket livre

Aucun test ne peut demander à une session « as-tu fini ? ». Chaque banc recompose donc la réponse à
la main — une boucle sur `watch.running`, puis `store.serial`, puis quelques tours de boucle
d'événements — et chaque recomposition oublie quelque chose : c'est l'origine des échecs
intermittents déjà corrigés un par un. Après ce ticket, une session sait dire ce qu'elle a encore en
cours (passages qui s'écrivent, analyse, question, écritures du magasin) et offre une barrière qui se
résout quand il ne reste rien : bornée, sans jamais rejeter, et qui nomme ce qui reste. Un ADR fixe
la forme de cette barrière pour la session et pour l'hôte ; la part de l'hôte serveur est le ticket
suivant.

## Sources

- Constats : FLK-06
- Code vérifié à la version `0d5a954` (le nom d'abord, la ligne ensuite) :
  - `core/session.cjs` : suivi des passages qui s'écrivent, `this.landing`, lignes 86-90 ; `landed()
    { return Promise.allSettled([...this.landing]); }`, ligne 92 ; `async land(input, receivedMs)`,
    ligne 93 ; `async drain()`, ligne 225, dont la garde `if (this.running || this.asking ||
    !this.queue.length) return;`, ligne 228, laisse une file non vide avec `running` à faux tant
    qu'une question tient la voie ; voies séparées `drainAudio`, ligne 259, et `drainVision`,
    ligne 305 (`audioRunning`, `visionRunning`, `visionQueue`) ; `close()`, lignes 366-371, qui vide
    les files ; `async ask(question)`, ligne 374, qui lève `this.asking`, ligne 377, et le rabaisse
    dans son `finally` avant de relancer `drain()` ; `persist()`, ligne 495, qui ne rejette pas.
    Aucune promesse ne dit que la voie d'analyse est au repos.
  - `runtime/session-runtime.cjs` : objet rendu par `createSessionRuntime`, `const runtime = { id,
    watch, store, … }`, ligne 436 ; fin d'une session, lignes 488-496 — `watch.asking = true;`,
    ligne 489, n'est jamais rabaissé ensuite, et `await watch.landed();`, ligne 496, est le seul
    appelant de `landed()` ; `store.flush()`, ligne 519.
  - `adapters/local-store.cjs` : `this.serial` (file des écritures d'état), `this.writes = new Set()`
    (écritures de médias en cours, promesses sans identifiant), `this.queued = new Map()` (par nom de
    fichier, l'état qui attend son tour), lignes 20-23 ; `put(id, input)`, ligne 44 ; `persist(name,
    snapshot, indent)`, ligne 157, qui retire le nom de `queued` quand son tour vient : rien ne dit
    quel fichier est en train de s'écrire ; `async flush()`, ligne 202, qui attend `serial` puis
    rejette quand l'écriture d'un fichier d'état a été refusée ; `async seal()`, ligne 210.
  - Ce que les bancs recomposent aujourd'hui, pour mémoire : `tests/architecture-f06.test.cjs`,
    `f.settled`, ligne 139 ; `tests/server-sessions.test.cjs`, `f.block`, lignes 95-102.
- Exigences de la relecture d'audit : la barrière ne rejette jamais, alors que `store.flush()`
  rejette ; elle est bornée et nomme ce qui tourne encore ; elle dit quoi faire quand une question
  tient la voie. Trop large, elle ne se résout jamais dans un test qui tient une doublure ; trop
  étroite, elle reproduit les échecs qu'elle doit éviter.
- Aides : `tests/helpers/wait.cjs` (lot L05, `deferred`, `until`) ; `tests/helpers/faulty-fs.cjs`
  (T071), qui retient ou refuse une écriture par nom de fichier sur le disque injecté par
  `overrides: { fsImpl }`.
- Montages existants d'une session seule : `createSessionRuntime` appelé directement dans
  `tests/disk-guard.test.cjs`, `f.open`, ligne 31 ; une `Session` seule dans `tests/session.test.cjs`
  (`f.watch.ask(…)`).

## Sonde de disque lent

À enregistrer dans `.harness-state/tickets/<id du ticket>/slow-fs.cjs` (hors Git) :

```js
const fsp = require("node:fs/promises");
const realSetTimeout = globalThis.setTimeout;
const names = (process.env.FLK_SLOW || "mkdir,writeFile,rename").split(",").filter(Boolean);
const ms = Number(process.env.FLK_MS || 5);
if (ms > 0) {
  for (const name of names) {
    const original = fsp[name];
    if (typeof original !== "function") continue;
    fsp[name] = function (...args) {
      return new Promise((resolve) => realSetTimeout(resolve, ms)).then(() => original.apply(this, args));
    };
  }
}
```

Commande de sonde : `FLK_MS=10 node --require ./.harness-state/tickets/<id du ticket>/slow-fs.cjs
--test --test-concurrency=1 tests/session-at-rest.test.cjs`.

## Périmètre

- À modifier :
  - `core/session.cjs` : de quoi attendre le repos de la voie d'analyse par une promesse, sur le modèle
    de `landing` et `landed()` — pas de boucle sur une durée, aucun changement de l'ordre dans lequel
    la file est traitée.
  - `adapters/local-store.cjs` : de quoi lire, sans attendre, le nom des fichiers d'état dont
    l'écriture attend son tour ou est en cours, et l'identifiant des passages dont le média s'écrit.
    Aucune écriture ne change d'ordre ni de moment.
  - `runtime/session-runtime.cjs` : sur l'objet rendu par `createSessionRuntime`, `pending()` rend
    sans attendre la liste de ce qui est en cours, une entrée lisible par chose (sa nature et son
    identifiant ou son nom de fichier) ; `idle({ timeoutMs })` se résout avec `{ idle: true,
    pending: [] }` dès que cette liste est vide, ou à l'échéance avec `{ idle: false, pending:
    [...] }`. Elle ne rejette jamais et a une échéance par défaut finie.
  - `tests/session-at-rest.test.cjs` (nouveau).
  - `docs/adr/NNNN-<titre>.md` (nouveau, prochain numéro libre, gabarit `docs/adr/0000-gabarit.md`).
- À ne pas toucher : `runtime/headless-runtime.cjs` et `app/main.cjs` ; `server/` ; les tests
  existants ; le comportement de `end()`, `close()`, `store.flush()` et `store.seal()`.
- Ce qui compte comme « en cours » pour une session : un passage dont l'écriture n'a pas fini
  d'atterrir ; une analyse en cours, sur l'une ou l'autre voie ; un passage en file qui sera analysé,
  y compris quand une question tient la voie ; une question en cours ; une écriture du magasin qui
  attend ou qui tourne. Ce qui ne compte pas : une écriture refusée ; la file et le drapeau `asking`
  d'une session fermée ou en fin de vie, que plus rien ne videra ni ne rabaissera.
- La barrière n'est appelée par aucun chemin de production. Son échéance est comptée en temps réel,
  pas sur une minuterie injectée : elle borne l'attente de celui qui l'appelle, pas un comportement de
  la session.

## Critères d'acceptation

Chaque critère se vérifie par un test de `tests/session-at-rest.test.cjs`, devant une session montée
par `createSessionRuntime` avec une perception simulée et le disque de `faultyFs()`, ou par une
commande.

1. Session ouverte sans activité : `idle()` rend `{ idle: true, pending: [] }` et `pending()` rend
   `[]`.
2. Un passage dont l'écriture du média est retenue par la doublure de disque : `idle({ timeoutMs:
   20 })` rend `idle: false` et une entrée de `pending` cite l'identifiant du passage ; l'écriture
   relâchée, `idle()` rend `idle: true`, et à cet instant le passage est analysé (`status` vaut
   `ready`) et lisible dans `session.json` sur le disque.
3. Une question qui tient la voie pendant qu'un passage attend dans la file : `pending()` cite la
   question et le passage ; `idle()` ne se résout avec `idle: true` qu'une fois la question finie et
   le passage analysé. Ce cas peut être monté sur une `Session` seule, comme dans
   `tests/session.test.cjs`, si la session composée n'offre pas de quoi tenir une question.
4. Une écriture de `session.json` retenue par la doublure figure dans `pending` sous son nom de
   fichier ; refusée par la doublure, elle n'y figure plus : `idle()` se résout avec `idle: true`
   sans rejeter, alors que `store.flush()` rejette.
5. Après `end()` : `idle()` ne rejette pas et rend `{ idle: true, pending: [] }`, y compris quand
   l'écriture d'un passage était en cours à l'appel de `end()`.
6. `idle()` appelée deux fois de suite sur une session au repos rend deux fois le même résultat, et
   aucun fichier du dossier de la session n'a changé de date entre les deux appels.
7. La commande de sonde passe cinq fois sur cinq.
8. `node --test --test-concurrency=1 tests/session.test.cjs tests/session-durable.test.cjs
   tests/disk-guard.test.cjs tests/session-delete.test.cjs` passe, ces fichiers inchangés.
9. L'ADR existe et dit, pour la session et pour l'hôte : ce que la barrière compte et ce qu'elle ne
   compte pas, l'index des moments compris, avec la raison ; qu'elle est bornée en temps réel, ne
   rejette pas et nomme ce qui reste ; ce qu'elle fait quand une question tient la voie ; qu'elle
   n'écrit rien d'elle-même, à une exception près, le registre de surveillance que l'hôte pousse sur
   le disque avant de se dire au repos ; que la part de l'hôte serveur vient ensuite et que l'hôte
   Mac la recevra quand ses variables de module auront rejoint `runtime/`.
10. `node scripts/check.mjs` est vert ; `tests/architecture.test.cjs` passe (`core/` n'importe rien).

## Test d'acceptation attendu

`tests/session-at-rest.test.cjs`, critère 2 : un passage donné à une session composée, écriture
retenue puis relâchée ; la barrière nomme le passage tant qu'il est tenu et ne se résout qu'une fois
le passage analysé et écrit.

## Hypothèses bloquantes

Aucune décision n'est attendue. Si le repos de la voie d'analyse ne peut pas s'exprimer par une
promesse sans changer l'ordre dans lequel `core/session.cjs` traite sa file : verdict BLOQUÉ, avec ce
qui l'empêche.

## Journal
