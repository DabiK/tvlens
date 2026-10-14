---
id: T077
titre: Move the disk-guard and session-deletion disk faults onto the injected disk
statut: a-faire
bloque_par: T071, T145
adr: non
installe: non
harnais: non
supprime_tests: non
---

## Ce que le ticket livre

`tests/disk-guard.test.cjs` et `tests/session-delete.test.cjs` simulent trois pannes de disque en
remplaçant `writeFile` pour tout le processus : une écriture coupée après dix octets, une écriture
refusée, une écriture retenue. Après ce ticket, ces trois pannes passent par la doublure de disque
partagée, donnée aux magasins que ces tests construisent, et l'aide sait couper une écriture.

## Sources

- Constats : TSTB-12
- Code vérifié à la version `0d5a954` (le nom d'abord, la ligne ensuite) :
  - `tests/disk-guard.test.cjs` : `const failing = code => t.mock.method(fsp, 'writeFile', …)`,
    ligne 146 — `moment-2.json` est écrit réduit à ses dix premiers caractères puis l'écriture échoue
    avec le code donné ; `const mock = t.mock.method(fsp, 'writeFile', …)`, ligne 168 — toute écriture
    d'un `.json` échoue avec `EIO`, le magasin n'écrivant là que `moment-1.json` ; restaurations
    lignes 157 et 170. Ses magasins viennent de `createSessionRuntime` (`f.open`, ligne 31), de
    `new SessionLibrary`, ligne 132, et de `LocalSessionStore.forSession`, ligne 167.
  - `tests/session-delete.test.cjs` : `const slow = t.mock.method(fsp, 'writeFile', …)`, ligne 68 —
    l'écriture de `moment-3.json` signale son entrée (`entered`) puis attend `onDisk` ; restauration
    ligne 81 ; `createSessionRuntime`, ligne 36 ; `new SessionLibrary`, lignes 60, 109 et 134.
  - Ces trois pannes visent l'écriture d'un passage, faite par `adapters/local-store.cjs`, `write`,
    ligne 50, directement sous son nom (`fs.writeFile(files[1], data, …)`, ligne 63), sans fichier
    temporaire.
- Ce que le ticket T071 fournit : `LocalSessionStore.forSession(dir, { fsImpl })`,
  `new SessionLibrary({ root, guard, fsImpl })`, `overrides: { fsImpl }` pour `createSessionRuntime` ;
  `tests/helpers/faulty-fs.cjs`, `faultyFs()` — refuser, retenir, relâcher, `reached`, compter et
  lister par nom de fichier ; `tests/injected-disk.test.cjs`, les tests de l'aide.
- Risque nommé par la relecture d'audit : un magasin construit sans la doublure échapperait à la
  panne et son test passerait à tort ; d'où la mutation du critère 4.

## Périmètre

- À modifier :
  - `tests/helpers/faulty-fs.cjs` : un geste de plus, par nom de fichier — écrire les premiers octets
    d'une écriture puis la refuser avec un code.
  - `tests/injected-disk.test.cjs` : le test de ce geste.
  - `tests/disk-guard.test.cjs` et `tests/session-delete.test.cjs` : les trois remplacements globaux
    cités passent par l'aide ; chaque magasin, bibliothèque ou session construit dans ces trois tests
    reçoit la doublure.
- À ne pas toucher : le code de production, sauf pour la mutation temporaire du critère 4 ; les
  titres des tests, leurs assertions et leurs valeurs attendues.

## Critères d'acceptation

Chaque critère se vérifie par un test ou une commande.

1. `grep -n "mock.method" tests/disk-guard.test.cjs tests/session-delete.test.cjs` ne sort rien.
2. Dans `tests/injected-disk.test.cjs` : une écriture coupée laisse sur le disque les premiers octets
   demandés sous le nom désigné, puis rejette avec son code ; les autres fichiers passent entiers.
3. `grep -c "^test(" tests/disk-guard.test.cjs tests/session-delete.test.cjs` rend les mêmes nombres
   qu'avant le ticket ; les titres rendus par `node --test --test-concurrency=1 --test-reporter=tap`
   sur ces deux fichiers, filtrés par `grep "^# Subtest"`, sont les mêmes avant et après.
4. Preuve par mutation, lancée avant toute modification puis à la fin, commande et liste des tests en
   échec dans le journal, mutation annulée ensuite : dans `adapters/local-store.cjs`, `write`, le
   retrait de la paire partielle après un échec (`fs.rm` des deux fichiers du passage) est supprimé.
   Tout test en échec avant le ticket est en échec après ; une mutation qui ne fait échouer aucun
   test avant le ticket est notée telle quelle.
5. `node --test --test-concurrency=1 tests/disk-guard.test.cjs tests/session-delete.test.cjs
   tests/injected-disk.test.cjs` passe cinq fois de suite, sans relance sélective.
6. `node scripts/check.mjs` est vert, mutation annulée.

## Test d'acceptation attendu

Les tests existants des deux fichiers, inchangés dans ce qu'ils affirment, et le test du geste
ajouté. Frontières inchangées : `LocalSessionStore`, `SessionLibrary` et `createSessionRuntime`, sur
un dossier temporaire réel à travers la doublure.

## Hypothèses bloquantes

Aucune décision n'est attendue.

## Journal
