---
id: T071
titre: Inject the disk into the session store and library with a fault double
statut: a-faire
bloque_par: T057, T058, T059, T062, T063, T064, T145
adr: oui
installe: non
harnais: non
supprime_tests: non
---

## Ce que le ticket livre

Pour simuler un disque qui refuse ou qui traîne, les tests remplacent `writeFile` dans le module
partagé `node:fs/promises` et reconnaissent leur cible au suffixe `.tmp` : ils savent comment le
magasin écrit, et le remplacement touche tous les modules du processus. Après ce ticket, le magasin de
session et la bibliothèque de sessions reçoivent leur disque par injection, une doublure partagée
refuse ou retient une écriture désignée par le nom du fichier, et un fichier de test neuf prouve
l'injection et la doublure. Les tests qui simulent aujourd'hui une panne passent à la doublure dans
les tickets d'après, et la barrière de repos des tickets suivants s'en sert pour ses propres tests.

## Sources

- Constats : TSTB-12
- Code vérifié à la version `0d5a954` (le nom d'abord, la ligne ensuite) :
  - `adapters/local-store.cjs` : `const fs = require('node:fs/promises');`, ligne 1, utilisé
    directement dans tout le module (une vingtaine de lignes) ; `static forSession(root, options =
    {})`, ligne 16 ; `constructor(root, { mediaDir = '', guard = null } = {})`, ligne 18 ; écriture
    d'un fichier d'état — `fs.mkdir`, `fs.writeFile(target + '.tmp', …)`, `fs.rename(target + '.tmp',
    target)`, lignes 170-173 ; `async function cleanupRawMedia(sessionsRoot)`, ligne 267, fonction
    de module hors de la classe. Aucun disque injectable.
  - Autres constructeurs de production, qui ne passent pas d'option et gardent le disque par défaut :
    `adapters/saved-moment-store.cjs`, ligne 14 (`new LocalSessionStore(this.dir(id),
    {mediaDir:''})`) ; cinq scripts de `scripts/`.
  - `adapters/session-library.cjs` : `const fs = require('node:fs/promises');`, ligne 1 ;
    `constructor({ root, guard = null })`, ligne 64 ; la bibliothèque construit elle-même des magasins
    par `LocalSessionStore.forSession(…)`, lignes 122 et 134.
  - `runtime/session-runtime.cjs` : `overrides = {}`, ligne 69 (déjà lu pour `overrides.embeddings`,
    ligne 119, et `overrides.perception`, ligne 238) ; `store = LocalSessionStore.forSession(
    path.join(sessionsRoot, id), {`, ligne 109.
  - `runtime/headless-runtime.cjs` : `this.library = new SessionLibrary({ root: options.sessionsRoot,
    guard: this.guard })`, ligne 278 ; `sessionOptions()`, ligne 618, recopie `...this.options` vers
    `createSessionRuntime` : une clé de `overrides` donnée à l'hôte atteint déjà la session. Des
    tests passent déjà `overrides: { perception }` ou `overrides: { embeddings }` : `fsImpl` s'ajoute
    à ces clés, il ne les remplace pas.
  - `app/main.cjs` : `new SessionLibrary({ root: sessionsRoot, guard })`, ligne 72. Hors périmètre :
    l'hôte Mac garde le disque réel.
  - Doublures d'aujourd'hui : `tests/session-durable.test.cjs`, `function refusing(t, ...names)`,
    ligne 37, et `function disk(t, ...names)`, ligne 48 (`hold`, `release`, `count`, `reached`,
    `seen`, `refuse`), toutes deux par `t.mock.method(fs, 'writeFile', …)` et
    `String(file).endsWith(name + '.tmp')`.
- Risque nommé par la relecture d'audit : un disque injecté ne voit que les accès du module qui le
  reçoit. Les assertions de coût qui comptent toutes les lectures du processus
  (`tests/session-durable.test.cjs`, lignes 105 et 317 ; `tests/server-state-views.test.cjs`,
  ligne 102) gardent donc leur espion global : ce sont des espions, pas des pannes simulées.
- Aides du lot L05 : `tests/helpers/wait.cjs` (`deferred`, `until`).

## Périmètre

- À modifier :
  - `adapters/local-store.cjs` : option `fsImpl`, par défaut `node:fs/promises` ; tout accès disque de
    la classe passe par elle. `cleanupRawMedia` garde le disque par défaut.
  - `adapters/session-library.cjs` : même option, transmise aux magasins qu'elle construit.
  - `runtime/session-runtime.cjs` : `overrides.fsImpl` transmis à `LocalSessionStore.forSession`.
  - `runtime/headless-runtime.cjs` : `overrides.fsImpl` transmis à `new SessionLibrary`.
  - `tests/helpers/faulty-fs.cjs` (nouveau) : `faultyFs()` rend un `fsImpl` adossé au disque réel et de
    quoi, par nom de fichier (`session.json`, `moment-3.json`) : refuser une écriture avec un code
    (`EIO` par défaut), la retenir et la relâcher, attendre que n écritures soient arrivées
    (`reached`, borné, qui échoue en disant combien sont arrivées), compter et lister les écritures
    vues avec leur taille. La connaissance du fichier temporaire puis du renommage vit dans cette
    aide. Une écriture retenue est relâchée en fin de test.
  - `tests/injected-disk.test.cjs` (nouveau) : les tests de l'aide et de l'injection (critères 1 à 5).
  - `docs/adr/NNNN-<titre>.md` (nouveau, prochain numéro libre, gabarit `docs/adr/0000-gabarit.md`).
- À ne pas toucher : `app/main.cjs` ; `core/` ; les messages d'erreur (« Écriture refusée par le
  disque (…) : EIO ») ; la technique d'écriture du magasin ; les tests existants, tous
  (`tests/session-durable.test.cjs`, `tests/server-sessions.test.cjs`, `tests/disk-guard.test.cjs`
  et `tests/session-delete.test.cjs` passent à la doublure dans les tickets suivants) ; les espions
  de coût cités.

## Critères d'acceptation

Chaque critère se vérifie par un test de `tests/injected-disk.test.cjs` ou par une commande.

1. Un `LocalSessionStore` et une `SessionLibrary` construits avec un `fsImpl` qui compte, bâti sur
   les fonctions d'origine de `node:fs/promises` lues avant la pose de tout espion : pendant une
   suite écriture d'un passage, sauvegarde d'état, lecture, liste et suppression, des espions globaux
   posés sur `writeFile`, `rename`, `mkdir`, `rm`, `readFile` et `readdir` de `node:fs/promises`
   comptent zéro appel, et le `fsImpl` a vu chacune de ces six opérations au moins une fois.
2. Sans `fsImpl`, le magasin écrit sur le disque réel comme aujourd'hui : un état sauvegardé se relit
   depuis le dossier.
3. Sur le disque réel, à travers l'aide : pendant qu'une écriture de `session.json` est retenue, puis
   après qu'elle a été refusée, le fichier du dossier se lit comme l'état précédent entier, et aucun
   fichier d'état partiel n'est lisible sous ce nom.
4. L'aide, par nom de fichier : une écriture refusée rejette avec son code ; une écriture retenue
   n'aboutit qu'après relâchement ; `reached(n)` échoue en donnant le compte quand la n-ième écriture
   ne vient pas ; les fichiers non désignés passent sans délai.
5. Un hôte `HeadlessRuntime` lancé avec `overrides: { fsImpl, perception }` : une écriture d'état
   refusée par la doublure se retrouve dans la réponse de fin de session (« Écriture refusée par le
   disque (session.json) : EIO »), la liste des sessions de l'hôte passe par la même doublure, et la
   doublure de perception donnée à côté est bien celle qui a servi.
6. `grep -c "node:fs/promises" adapters/local-store.cjs` et `grep -c "node:fs/promises"
   adapters/session-library.cjs` rendent chacun 1 : le module n'est nommé qu'une fois, pour la valeur
   par défaut.
7. L'ADR existe et dit : que le magasin et la bibliothèque reçoivent leur disque ; qu'une panne de
   disque se simule par la doublure et non par un remplacement global ; que le remplacement global
   reste permis pour un espion de coût, et pourquoi ; que l'hôte Mac garde le disque réel.
8. `node --test --test-concurrency=1 tests/injected-disk.test.cjs tests/disk-guard.test.cjs
   tests/session-delete.test.cjs tests/session-durable.test.cjs tests/server-sessions.test.cjs`
   passe, les quatre derniers fichiers inchangés : leurs remplacements globaux atteignent toujours le
   disque par défaut.
9. `node scripts/check.mjs` est vert.

## Test d'acceptation attendu

`tests/injected-disk.test.cjs`, critère 1 : frontière `LocalSessionStore` et `SessionLibrary`, disque
injecté, espions globaux à zéro.

## Hypothèses bloquantes

Aucune décision n'est attendue. Si un accès disque du magasin ne peut pas passer par `fsImpl` sans
changer ce qu'il fait (flux, descripteur ouvert) : verdict BLOQUÉ, avec la ligne en cause.

## Journal
