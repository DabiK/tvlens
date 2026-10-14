---
id: T075
titre: Move the durable-session disk faults onto the injected disk double
statut: a-faire
bloque_par: T071
adr: non
installe: non
harnais: non
supprime_tests: non
---

## Ce que le ticket livre

`tests/session-durable.test.cjs` simule un disque qui refuse ou qui traîne en remplaçant `writeFile`
pour tout le processus, et reconnaît sa cible au suffixe `.tmp` que le magasin utilise aujourd'hui.
Changer la façon d'écrire du magasin casserait une quinzaine de tests sans changer un comportement.
Après ce ticket, ces tests donnent la doublure de disque partagée aux magasins, aux bibliothèques et à
l'hôte qu'ils construisent : ils désignent un fichier par son nom et ne savent plus comment il est
écrit.

## Sources

- Constats : TSTB-12
- Code vérifié à la version `0d5a954` (le nom d'abord, la ligne ensuite) :
  - `tests/session-durable.test.cjs` (1053 lignes, 24 tests) : `function refusing(t, ...names)`,
    lignes 37-44, et `function disk(t, ...names)`, lignes 48-65, toutes deux par
    `t.mock.method(fs, 'writeFile', …)` (lignes 39 et 50) et `String(file).endsWith(name + '.tmp')`
    (lignes 40 et 51) ; `d.reached`, borné à 5 s, ligne 64.
  - Leurs usages : `refusing(t, …)` aux lignes 631, 648, 694, 736, 745, 765, 783 et 795 ; `disk(t, …)`
    aux lignes 849, 885, 913, 946 et 974.
  - Une écriture de passage retenue : `const slow = t.mock.method(fsp, 'writeFile', …)` sur
    `moment-2.json`, ligne 370.
  - Ce que les tests construisent : `f.open = extra => … createSessionRuntime({ sessionsRoot,
    ...f.options(extra) })`, ligne 75 ; `const host = () => new HeadlessRuntime({…})`, ligne 343 ;
    `LocalSessionStore.forSession(dir)`, lignes 286, 626, 845, 884, 912, 945 et 970 ;
    `new SessionLibrary(…)`, douze fois (lignes 104, 164, 304, 355, 387, 422, 478, 497, 562, 680, 753
    et 792).
  - Espions de coût, à laisser : `const reads = t.mock.method(require('node:fs/promises'),
    'readFile')`, ligne 105 (liste exacte des fichiers lus) ; `t.mock.method(fsp, 'readdir')` et
    `t.mock.method(fsp, 'readFile')`, ligne 317 (zéro lecture sur 200 tics).
- Ce que le ticket T071 fournit : `LocalSessionStore.forSession(dir, { fsImpl })`,
  `new SessionLibrary({ root, guard, fsImpl })`, `overrides: { fsImpl }` pour `createSessionRuntime`
  et `HeadlessRuntime` ; `tests/helpers/faulty-fs.cjs`, `faultyFs()` — refuser, retenir, relâcher,
  `reached`, compter et lister par nom de fichier.
- Cibles des pannes simulées dans ce fichier : `session.json`, `deep-answers.json`, `manifest.json`
  (écrits par `adapters/local-store.cjs`, `persist`, lignes 157-181, et par lui seul) et
  `moment-N.json` (écrit par `adapters/local-store.cjs`, `write`, ligne 63, et par lui seul). Les
  miniatures (`adapters/session-thumbnails.cjs`) écrivent des `.jpg` qu'aucun test de panne ne vise :
  toutes les pannes du fichier passent donc par le disque injecté.
- Les deux gardes que les mutations du critère 4 retirent, dans `adapters/local-store.cjs`,
  `persist` : la fusion `if (waiting) { waiting.snapshot = snapshot; return waiting.written; }`,
  ligne 160 ; le bloc `catch` des lignes 174-178, `this.refused.set(name, error); throw error;`.
- Risque nommé par la relecture d'audit : un disque injecté ne voit que les modules qui le reçoivent.
  Un magasin ou une bibliothèque construit sans la doublure échapperait à la panne et son test
  passerait à tort ; d'où les mutations du critère 4, lancées avant et après.

## Périmètre

- À modifier : `tests/session-durable.test.cjs` ; `tests/helpers/faulty-fs.cjs` et
  `tests/injected-disk.test.cjs` seulement s'il manque à l'aide un geste dont un test de ce fichier a
  besoin — le geste ajouté a alors son test dans `tests/injected-disk.test.cjs`.
  - `refusing` et `disk` locaux disparaissent au profit de l'aide ; le remplacement de la ligne 370
    aussi.
  - Tout magasin, toute bibliothèque et tout hôte que le fichier construit dans un test de panne
    reçoit la doublure du test, y compris quand la panne est armée après leur construction.
- À ne pas toucher : le code de production, sauf pour les mutations temporaires du critère 4 ;
  les deux espions de coût ; les titres des tests, leurs assertions et leurs valeurs attendues (tailles
  d'écriture et comptes compris).

## Critères d'acceptation

Chaque critère se vérifie par un test ou une commande.

1. `grep -n "mock.method" tests/session-durable.test.cjs` ne sort que les deux espions de coût
   (`readFile` seul, puis `readdir` et `readFile`).
2. `grep -n "tmp" tests/session-durable.test.cjs | grep -v tmpdir` ne sort rien ; `grep -n
   "^function refusing\|^function disk" tests/session-durable.test.cjs` ne sort rien.
3. `grep -c "^test(" tests/session-durable.test.cjs` rend le même nombre qu'avant le ticket (24 à la
   version `0d5a954`) ; les titres rendus par `node --test --test-reporter=tap
   tests/session-durable.test.cjs | grep "^# Subtest"` sont les mêmes avant et après.
4. Preuve par mutation, mutation annulée ensuite. Chaque mutation est lancée deux fois, commande et
   liste des tests en échec dans le journal : avant toute modification du fichier, puis à la fin.
   - `adapters/local-store.cjs`, `persist` : le bloc `catch` ne retient plus le refus et ne le rend
     plus à l'appelant (ni `this.refused.set`, ni `throw`) ;
   - `adapters/local-store.cjs`, `persist` : la fusion de deux sauvegardes du même fichier demandées
     pendant qu'une écriture attend son tour est retirée.
   Pour chaque mutation, tout test en échec avant le ticket est en échec après : sinon un magasin a
   été construit sans la doublure et la migration n'est pas finie. Une mutation qui ne fait échouer
   aucun test avant le ticket est notée telle quelle.
5. `node --test --test-concurrency=1 tests/session-durable.test.cjs` passe cinq fois de suite, sans
   relance sélective ; sa durée avant et après est dans le journal.
6. `node scripts/check.mjs` est vert, mutations annulées.

## Test d'acceptation attendu

Les tests existants de `tests/session-durable.test.cjs`, inchangés dans ce qu'ils affirment.
Frontières inchangées : `LocalSessionStore`, `SessionLibrary`, `createSessionRuntime` et
`HeadlessRuntime`, sur un dossier temporaire réel à travers la doublure.

## Hypothèses bloquantes

Aucune décision n'est attendue.

## Journal
