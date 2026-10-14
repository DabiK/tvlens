---
id: T073
titre: Give the server host a barrier that resolves once nothing is in flight
statut: a-faire
bloque_par: T066, T072
adr: non
installe: non
harnais: non
supprime_tests: non
---

## Ce que le ticket livre

Une session sait désormais dire ce qu'elle a en cours, mais l'hôte serveur tient d'autres travaux
qu'aucune session ne voit : les blocs admis qu'il assemble, les questions et leur sauvegarde
différée, la surveillance. Après ce ticket, l'hôte serveur expose la même barrière que la session,
étendue à ces travaux : elle se résout quand plus rien n'est en cours, elle est bornée, ne rejette
jamais et dit par son nom ce qui reste. Les bancs de test y passeront dans le ticket suivant.

## Sources

- Constats : FLK-06
- Décision d'architecture appliquée : l'ADR écrit par T072, qui fixe la forme de la barrière pour
  la session et pour l'hôte. Ce ticket n'en écrit pas.
- Ce que T072 fournit : sur l'objet rendu par `createSessionRuntime`, `pending()` (liste de ce qui
  est en cours pour la session) et `idle({ timeoutMs })`, qui rend `{ idle, pending }` sans jamais
  rejeter.
- Code vérifié à la version `0d5a954` (le nom d'abord, la ligne ensuite) :
  - `runtime/headless-runtime.cjs` : `this.ingestions = new Set()`, ligne 240 (ajout ligne 795,
    retrait ligne 807) ; `this.admitted = new Set()`, ligne 243 (`accept(sessionId)`, ligne 713,
    `finish(operation)`, ligne 738) ; `this.deep = conversation.deep`, ligne 308 — les questions sont
    dans `this.deep.jobs`, chacune avec une promesse `done` ; `this.surveillance =
    createSurveillanceRuntime({ … onChange: () => this.emit(), … })`, ligne 312 ;
    `checkpoint(session, state)`, ligne 403, qui pose `this.unsaved` et `this.checkpointTimer` ;
    `saveQuestions()`, ligne 416, qui lance `saveResearch(…).catch(() => {})` sans l'attendre ;
    lecture de la surveillance par `this.surveillance.snapshot({ brief: true })` dans l'état de
    l'hôte, ligne 474 ; `moving()`, ligne 650 ; `async settleIngestions(cancelled)`, ligne 760 ;
    `end()`, ligne 904 ; `close()`, ligne 1112. Aucune méthode `idle` ni `pending`.
  - `core/surveillance.cjs` : l'état publié porte `activity: { state, label, detecting, running,
    waiting, late }`, ligne 887.
  - `runtime/surveillance-runtime.cjs` : `const flush = async () => { await adopting?.settled;
    write(); return writing; }`, lignes 405-409, exposé ligne 515 : `flush()` écrit tout de suite un
    registre modifié puis attend cette écriture. Aucun chemin de production ne l'appelle.
  - Ce que les bancs recomposent aujourd'hui : `tests/architecture-f06.test.cjs`, `f.settled`,
    ligne 139 (`do { await tick(); } while (f.runtime.session?.watch.running); await
    …store.serial;`) ; `tests/server-sessions.test.cjs`, `f.block`, lignes 95-102, et `f.ask`,
    lignes 103-108 (`await job.done; await turns(5); await …store.serial;`) ;
    `tests/architecture-f07.test.cjs`, `settled` de `serverHost`, ligne 187.
  - `app/main.cjs` : l'hôte Mac tient le même état dans des variables de module (`unsavedQuestions`,
    `checkpointTimer`, ligne 147). Hors périmètre.
- Exigences de la relecture d'audit : la barrière compte les questions (`job.done`, sauvegarde
  différée) et `surveillance.flush()`.
- Aides : `tests/helpers/clock.cjs` et `tests/helpers/wait.cjs` (lot L05) ; minuterie injectée de la
  sauvegarde différée (T066) ; `tests/helpers/faulty-fs.cjs` (T071).

## Sonde de disque lent

Même sonde que celle du ticket T072 (fichier `slow-fs.cjs` à recopier depuis ce ticket dans
`.harness-state/tickets/<id du ticket>/`, hors Git). Commande de sonde : `FLK_MS=10 node --require
./.harness-state/tickets/<id du ticket>/slow-fs.cjs --test --test-concurrency=1
tests/host-idle.test.cjs`.

## Périmètre

- À modifier :
  - `runtime/headless-runtime.cjs` : `pending()` rend, sans attendre, la liste de ce qui est en cours
    pour l'hôte — blocs admis, préparations de médias, questions non finies, sauvegarde différée en
    attente, détection ou vérification de surveillance en cours — suivie de ce que la session en
    mémoire dit avoir en cours ; `idle({ timeoutMs })` se résout avec `{ idle: true, pending: [] }`
    dès que cette liste est vide, ou à l'échéance avec `{ idle: false, pending: [...] }`. Elle ne
    rejette jamais.
  - `tests/host-idle.test.cjs` (nouveau).
- À ne pas toucher : `core/`, `runtime/session-runtime.cjs`, `runtime/surveillance-runtime.cjs`,
  `app/main.cjs`, `server/` ; les tests existants (leur passage à la barrière est le ticket
  suivant) ; le comportement de `end()`, `close()` et `settleIngestions`.
- La barrière n'est appelée par aucun chemin de production. Elle observe : elle ne déclenche ni la
  sauvegarde différée des questions ni une annulation. Seule exception, écrite dans l'ADR : avant de
  se dire au repos, elle appelle `surveillance.flush()`, qui pousse sur le disque un registre de
  surveillance modifié.

## Critères d'acceptation

Chaque critère se vérifie par un test de `tests/host-idle.test.cjs`, devant un vrai `HeadlessRuntime`
à ports simulés, ou par une commande.

1. Hôte sans session, puis session ouverte sans activité : `idle()` rend `{ idle: true, pending: [] }`
   et `pending()` rend `[]`.
2. Un bloc dont l'assemblage est tenu par une doublure : `idle({ timeoutMs: 20 })` rend
   `idle: false` et une entrée de `pending` désigne le bloc ; la doublure relâchée, `idle()` rend
   `idle: true`, et à cet instant le passage est analysé (`status` vaut `ready`) et lisible dans
   `session.json` sur le disque.
3. Une question en cours figure dans `pending` jusqu'à sa fin ; un brouillon qui attend sa seconde sur
   la minuterie injectée y figure aussi, et en sort quand le test avance l'horloge manuelle : la
   barrière ne l'a pas sauvegardé à sa place.
4. Ce que la session a en cours se lit à travers l'hôte : une écriture de `session.json` retenue par
   la doublure de disque figure dans le `pending` de l'hôte sous son nom de fichier.
5. Une vérification de surveillance tenue par l'agent simulé figure dans `pending` ; relâchée,
   `idle()` rend `idle: true` et le registre de surveillance relu sur le disque porte son résultat.
6. Pendant `end()` puis après `close()`, `idle()` ne rejette pas et rend `idle: true` une fois la fin
   menée à bien.
7. La commande de sonde passe cinq fois sur cinq.
8. `node --test --test-concurrency=1 tests/architecture-f06.test.cjs tests/architecture-f07.test.cjs
   tests/server-sessions.test.cjs tests/server-surveillance.test.cjs` passe, ces fichiers inchangés.
9. `node scripts/check.mjs` est vert.

## Test d'acceptation attendu

`tests/host-idle.test.cjs`, critère 2 : un bloc envoyé à un vrai `HeadlessRuntime`, assemblage tenu
puis relâché ; la barrière désigne le bloc tant qu'il est tenu et ne se résout qu'une fois le passage
analysé et écrit.

## Hypothèses bloquantes

Aucune décision n'est attendue. Si un travail de l'hôte ne peut être ni nommé ni attendu sans
modifier un module hors du périmètre (par exemple l'activité de la surveillance) : verdict BLOQUÉ,
avec le travail en cause et ce qui manque.

## Journal
