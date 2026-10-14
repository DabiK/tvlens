---
id: T076
titre: Move the server-session disk faults onto the injected disk double
statut: a-faire
bloque_par: T075, T145
adr: non
installe: non
harnais: non
supprime_tests: non
---

## Ce que le ticket livre

`tests/server-sessions.test.cjs` porte sa propre copie des deux doublures de disque : elles remplacent
`writeFile` pour tout le processus et reconnaissent leur cible au suffixe `.tmp`. Après ce ticket, le
banc de l'hôte serveur donne à l'hôte la doublure de disque partagée, et les tests de panne du
fichier désignent un fichier par son nom. Les deux copies de `refusing` et `disk` ont alors disparu
de `tests/` ; les remplacements globaux qui visent l'hôte Mac, lui sur le disque réel, restent.

## Sources

- Constats : TSTB-12
- Code vérifié à la version `0d5a954` (le nom d'abord, la ligne ensuite ; les lignes auront bougé après
  le lot L05, les noms restent) :
  - `tests/server-sessions.test.cjs` (778 lignes, 14 tests) : `function refusing(t, ...names)`,
    ligne 21, et `function disk(t, ...names)`, ligne 32, par `t.mock.method(fs, 'writeFile', …)`
    (lignes 23 et 34) et `String(file).endsWith(name + '.tmp')` (lignes 24 et 35) ; `d.reached`, borné
    à 5 s.
  - Leurs usages : `refusing(t, …)` aux lignes 447, 479, 500, 528 et 563 ; `disk(t, …)` aux
    lignes 641 (créée avant le banc), 689 et 760 (créée après le banc).
  - L'hôte du fichier : `new HeadlessRuntime({ userData: root, sessionsRoot, …, overrides: {
    embeddings }, ...runtimeOptions(f) })`, lignes 82-83 ; un second, sans disque, `const host =
    env =>`, ligne 627, hors sujet.
  - Les deux gardes que les mutations du critère 4 retirent, dans `adapters/local-store.cjs`,
    `persist` : la fusion `if (waiting) { waiting.snapshot = snapshot; return waiting.written; }`,
    ligne 160 ; le bloc `catch` des lignes 174-178, `this.refused.set(name, error); throw error;`.
  - Ce qui reste hors de ce ticket, sur le disque réel de l'hôte Mac : `tests/architecture-f07.test.cjs`,
    ligne 371, et `tests/mac-ipc-contract.test.cjs`, lignes 624, 770, 816 et 820, qui citent
    `session.json.tmp` et `deep-answers.json.tmp` en toutes lettres.
- Ce que les tickets qui précèdent fournissent : `overrides: { fsImpl }` reconnu par
  `HeadlessRuntime`, pour ses sessions et pour sa bibliothèque, et `tests/helpers/faulty-fs.cjs`
  (T071) ; `tests/helpers/server-host.cjs`, `startServerHost(t, { …, runtimeOptions })`, qui monte
  l'hôte de ce fichier et pose déjà la clé `overrides` pour les embeddings, sauf quand le test passe
  `embeddings: null` (lot L05).
- Pourquoi après T075 : le critère 2 porte sur tous les fichiers de test, et
  `tests/session-durable.test.cjs` compose le même nom de fichier temporaire tant que T075 ne l'a
  pas migré.
- Risque nommé par la relecture d'audit : un disque injecté ne voit que les modules qui le reçoivent ;
  une doublure créée après le banc ne doit pas manquer l'hôte déjà construit.

## Périmètre

- À modifier :
  - `tests/helpers/server-host.cjs` : l'hôte monté reçoit toujours une doublure de disque, inactive
    par défaut, exposée sur l'hôte rendu ; elle s'ajoute aux `overrides` existants sans les
    remplacer, que le test ait donné des embeddings ou non, et qu'un `runtimeOptions` rende ou non
    sa propre clé `overrides`.
  - `tests/server-sessions.test.cjs` : `refusing` et `disk` locaux disparaissent ; les huit usages
    arment la doublure de l'hôte, y compris celui qui était créé avant le banc.
  - `tests/injected-disk.test.cjs` : un test ajouté (critère 5).
- À ne pas toucher : le code de production, sauf pour les mutations temporaires du critère 4 ;
  `tests/helpers/faulty-fs.cjs` ; `tests/server-ingest-path.test.cjs`, qui utilise la même aide d'hôte
  et doit passer sans changement ; les titres des tests, leurs assertions et leurs valeurs attendues.

## Critères d'acceptation

Chaque critère se vérifie par un test ou une commande.

1. `grep -n "mock.method(fs" tests/server-sessions.test.cjs` ne sort rien ; `grep -n "tmp"
   tests/server-sessions.test.cjs | grep -v tmpdir` ne sort rien ; `grep -n "^function
   refusing\|^function disk" tests/server-sessions.test.cjs` ne sort rien.
2. `grep -n "+ .\.tmp" tests/*.test.cjs` ne sort rien : plus aucun fichier de test ne compose le nom
   d'un fichier temporaire.
3. `grep -c "^test(" tests/server-sessions.test.cjs` rend le même nombre qu'avant le ticket ; les
   titres rendus par `node --test --test-reporter=tap tests/server-sessions.test.cjs | grep "^#
   Subtest"` sont les mêmes avant et après.
4. Preuve par mutation, mutation annulée ensuite. Chaque mutation est lancée deux fois, commande et
   liste des tests en échec dans le journal : avant toute modification, puis à la fin.
   - `adapters/local-store.cjs`, `persist` : le bloc `catch` ne retient plus le refus et ne le rend
     plus à l'appelant (ni `this.refused.set`, ni `throw`) ;
   - `adapters/local-store.cjs`, `persist` : la fusion de deux sauvegardes du même fichier demandées
     pendant qu'une écriture attend son tour est retirée.
   Pour chaque mutation, tout test en échec avant le ticket est en échec après : sinon l'hôte a été
   monté sans la doublure et la migration n'est pas finie. Une mutation qui ne fait échouer aucun
   test avant le ticket est notée telle quelle.
5. Un hôte monté par `startServerHost` avec `embeddings: null`, et un autre dont `runtimeOptions`
   rend une clé `overrides`, reçoivent tous deux la doublure : dans chacun, un refus armé sur
   `session.json` se lit dans la réponse de fin de session. Prouvé par un test ajouté à
   `tests/injected-disk.test.cjs`.
6. `node --test --test-concurrency=1 tests/server-sessions.test.cjs tests/server-ingest-path.test.cjs
   tests/injected-disk.test.cjs` passe cinq fois de suite, sans relance sélective.
7. `node scripts/check.mjs` est vert, mutations annulées.

## Test d'acceptation attendu

Les tests existants de `tests/server-sessions.test.cjs`, inchangés dans ce qu'ils affirment.
Frontière inchangée : le serveur HTTP d'un vrai `HeadlessRuntime`, sur un dossier temporaire réel à
travers la doublure.

## Hypothèses bloquantes

Aucune décision n'est attendue. Si `tests/helpers/server-host.cjs` n'a pas la forme annoncée par le lot
L05 (pas de clé `overrides`, pas d'hôte rendu) : verdict BLOQUÉ, avec l'écart constaté.

## Journal
