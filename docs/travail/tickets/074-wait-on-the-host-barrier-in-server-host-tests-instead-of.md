---
id: T074
titre: Wait on the host barrier in server-host tests instead of polling its state
statut: a-faire
bloque_par: T073, T145
adr: non
installe: non
harnais: non
supprime_tests: non
---

## Ce que le ticket livre

Trois bancs de test décident que l'hôte serveur « a fini » en lisant son état interne : une boucle sur
`watch.running`, la file `store.serial`, cinq tours de boucle d'événements après une question, les
champs `unsaved` et `checkpointTimer`. Chaque banc a sa propre approximation, et un `await` ajouté en
production peut les faire passer à tort. Après ce ticket, ces bancs attendent la barrière de l'hôte :
une seule attente, bornée, qui échoue en nommant ce qui tourne encore.

## Sources

- Constats : FLK-06, TSTA-13
- Code vérifié à la version `0d5a954` (le nom d'abord, la ligne ensuite ; les lignes auront bougé après
  le lot L05, les noms restent) :
  - `tests/server-sessions.test.cjs` : `const turns = async (count = 20) =>`, ligne 16 ; `f.block`,
    lignes 95-102 — `do { await tick(); } while (f.runtime.session?.watch.running);`, ligne 98, puis
    `await f.runtime.session?.store.serial;`, ligne 100 ; `f.ask`, lignes 103-108 — `await job.done;
    await turns(5); await f.runtime.session?.store.serial;`, ligne 106 ; les mêmes gestes recopiés
    dans des tests : lignes 450, 481, 504-505, 532-533, 567-568 (`…store.serial.catch(() => {});
    await turns(5);`). Ces sites font six occurrences de `turns(5)` et six de `store.serial`, sur
    treize et dix-huit dans le fichier.
  - Lu et laissé dans `tests/server-sessions.test.cjs` : les deux tests de la sauvegarde différée,
    que T066 a réécrits sur une horloge manuelle (`const ask` local, ligne 692 ; lignes 711-775),
    et les attentes de `store.serial` des lignes 241, 657 et 676. Ils tiennent une minuterie ou
    lisent un état rechargé : leur passage à la barrière n'est pas de ce ticket.
  - `tests/architecture-f06.test.cjs` : `const eventually`, ligne 32, qui n'échoue jamais ;
    `f.settled`, ligne 139 (`do { await tick(); } while (f.runtime.session?.watch.running); await
    f.runtime.session?.store.serial;`), appelé par `f.block`, ligne 140, et aux lignes 174, 540 et
    552 ; `await eventually(() => f.runtime.admitted.size === 0);`, ligne 280, hôte déjà arrêté.
  - `tests/architecture-f07.test.cjs` : `settled` de l'adaptateur de l'hôte serveur, ligne 187 —
    `await until(() => !runtime.unsaved && !runtime.checkpointTimer, 'the questions are saved'); await
    runtime.session?.store.serial.catch(() => {});` ; appelé ligne 502.
  - Lu et laissé : `tests/architecture-f06.test.cjs`, ligne 350 (`until(() => f.runtime.moving(), …)`
    attend un fait public, c'est la bonne forme) ; ligne 313 (`pause(150).then(() => 'both wait')`,
    preuve d'absence pendant qu'une écriture est tenue : aucun fait positif ne la remplace, elle reste
    telle quelle).
- Ce que les tickets qui précèdent fournissent (T072 pour la session, T073 pour l'hôte) : sur
  `HeadlessRuntime`, `pending()` rend la liste de ce qui est en cours ; `idle({ timeoutMs })` se
  résout avec `{ idle, pending }`, ne rejette jamais, compte blocs admis, écritures de passages,
  analyse, questions et leur sauvegarde différée, surveillance et écritures du magasin, et fonctionne
  après `close()`. Avant de se dire au repos, elle pousse sur le disque un registre de surveillance
  modifié (`surveillance.flush()`) ; elle ne déclenche pas la sauvegarde différée des questions.
- `tests/host-idle.test.cjs` existe depuis T073.
- Aides du lot L05 : `tests/helpers/server-host.cjs` (`startServerHost`, d'où vient le banc de
  `tests/server-sessions.test.cjs`) ; `tests/helpers/wait.cjs` (`until`, `bounded`).
- Risques nommés par la relecture d'audit : une barrière calculée trop étroite déclare le repos alors
  qu'une écriture est en cours ; une attente de fait mise à la place d'une preuve d'absence devient une
  assertion vide. D'où la sonde de disque lent et la mutation ci-dessous.

## Sonde de disque lent

Même sonde que celle du ticket T072 (fichier `slow-fs.cjs` à recopier depuis ce ticket dans
`.harness-state/tickets/<id du ticket>/`, hors Git). Commande :
`FLK_MS=10 node --require ./.harness-state/tickets/<id du ticket>/slow-fs.cjs --test
--test-concurrency=1 tests/server-sessions.test.cjs tests/architecture-f06.test.cjs
tests/architecture-f07.test.cjs`.

## Périmètre

- À modifier :
  - `tests/helpers/server-host.cjs` : une fonction exportée attend `runtime.idle()` d'un hôte donné
    et fait échouer le test, en citant `pending`, si la barrière rend `idle: false` ; l'hôte rendu par
    `startServerHost` l'expose sous `idle()`. C'est la seule forme de cette attente dans `tests/` :
    les bancs propres à `tests/architecture-f06.test.cjs` et `tests/architecture-f07.test.cjs`
    l'importent.
  - `tests/server-sessions.test.cjs` : `block`, `ask` et leurs copies dans les tests cités attendent
    cette barrière.
  - `tests/architecture-f06.test.cjs` : `f.settled` et l'attente de la ligne 280 passent par la
    barrière de l'hôte ; l'assertion sur `held()` qui suit reste.
  - `tests/architecture-f07.test.cjs` : `settled` de l'hôte serveur passe par la barrière.
  - `tests/host-idle.test.cjs` : un test ajouté (critère 3).
- À ne pas toucher : le code de production, sauf pour la mutation temporaire du critère 5 ;
  l'adaptateur de l'hôte Mac de `tests/architecture-f07.test.cjs` et ses pauses de scénario, qui
  tournent sur les deux hôtes ; les titres des tests, leurs assertions et leurs valeurs attendues ; la
  ligne 313 de `tests/architecture-f06.test.cjs`.
- Là où un test tient volontairement une doublure pendant l'attente, il n'attend pas le repos : il
  attend, par un `until` borné, que `pending()` ne nomme plus que ce qu'il tient.
- Les autres fichiers qui sondent `watch.running` (onze fichiers, une ou deux fois chacun) ne sont pas
  de ce ticket.

## Critères d'acceptation

Chaque critère se vérifie par un test ou une commande.

1. `grep -n "watch.running" tests/server-sessions.test.cjs tests/architecture-f06.test.cjs` ne sort
   rien.
2. Relevés avant et après le ticket, dans le journal : `grep -o "turns(5)"
   tests/server-sessions.test.cjs | wc -l` et `grep -o "store.serial" tests/server-sessions.test.cjs
   | wc -l` baissent chacun de six ; `grep -c "store.serial" tests/architecture-f06.test.cjs` rend
   0 ;
   `grep -n "checkpointTimer\|runtime.unsaved" tests/architecture-f07.test.cjs` ne sort rien ;
   `grep -n "eventually(() => f.runtime.admitted" tests/architecture-f06.test.cjs` ne sort rien.
3. Une barrière qui rend `idle: false` fait échouer le test avec la liste `pending` dans le message :
   prouvé par un test ajouté dans `tests/host-idle.test.cjs`, qui tient une écriture et constate le
   message de l'attente du banc.
4. `grep -c "^test(" tests/server-sessions.test.cjs tests/architecture-f06.test.cjs
   tests/architecture-f07.test.cjs` rend les mêmes nombres qu'avant le ticket (14, 17 et 12 à la
   version `0d5a954`), et les titres rendus par `node --test --test-concurrency=1
   --test-reporter=tap` sur ces trois fichiers, filtrés par `grep "^# Subtest"`, sont les mêmes avant
   et après (les deux listes comparées dans le journal).
5. Preuve par mutation, commande et sortie dans le journal, mutation annulée ensuite : `idle()` de
   `runtime/headless-runtime.cjs` rendue immédiate (`{ idle: true, pending: [] }` sans attendre) →
   sous la commande de sonde, au moins un test échoue. Le journal donne, fichier par fichier, les
   tests qui échouent, et nomme tout fichier resté vert : ses tests ne dépendaient pas de l'attente.
6. La commande de sonde est lancée une première fois avant toute modification, puis à la fin, sans
   mutation : la seconde sortie ne contient aucun échec absent de la première (les deux dans le
   journal).
7. `node --test --test-concurrency=1 tests/server-sessions.test.cjs tests/architecture-f06.test.cjs
   tests/architecture-f07.test.cjs tests/host-idle.test.cjs` passe cinq fois de suite, sans relance
   sélective.
8. `node scripts/check.mjs` est vert, mutation annulée.

## Test d'acceptation attendu

Les tests existants des trois fichiers, inchangés dans ce qu'ils affirment, et le test ajouté du
critère 3. Frontière : le serveur HTTP d'un vrai `HeadlessRuntime`, comme aujourd'hui.

## Hypothèses bloquantes

Aucune décision n'est attendue. Si un test ne passe plus parce que la barrière compte une opération
qu'il laisse volontairement en cours et qu'aucun `until` sur `pending()` ne l'exprime, ou parce que
la barrière pousse le registre de surveillance plus tôt que ce test ne l'attend : verdict BLOQUÉ pour
le ticket entier, avec le titre du test et le nom de l'opération — la boucle n'intègre pas une
partie de ticket.

## Journal
