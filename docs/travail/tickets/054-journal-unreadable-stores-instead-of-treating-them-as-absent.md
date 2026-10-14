---
id: T054
titre: Journal unreadable stores instead of treating them as absent
statut: a-faire
bloque_par: T028, T036
adr: non
installe: non
harnais: non
supprime_tests: non
---

## Ce que le ticket livre

Trois lectures de fichiers locaux confondent « le fichier n'existe pas encore » et « le fichier est
illisible ou corrompu » : l'index des vecteurs, les moments sauvegardés et les réglages de
visionnage. Dans le second cas, l'utilisateur perd des données sans qu'aucune trace le dise. Après ce
ticket, le résultat rendu ne change pas, mais un fichier présent et illisible laisse une entrée au
journal ; un fichier absent reste silencieux.

## Sources

- Constats : ADP-05, OUBLI-02
- Code vérifié à la version `0d5a954` (chercher par nom, les lignes bougeront) :
  - `adapters/embedding-store.cjs`, `EmbeddingStore.load()` (l.7-18) : tout le corps est dans un `try`
    fermé par `catch {}` (l.17) — fichier absent, lecture refusée et en-tête au JSON invalide sont
    confondus. Le `catch` intérieur de la l.13 (dernière ligne tronquée, ignorée) est voulu et
    commenté. Un fichier vide (aucune ligne) fait lever l'analyse de l'en-tête et reste silencieux
    aujourd'hui. Constructeur `constructor(file, model)` (l.6), construit dans
    `runtime/session-runtime.cjs`, `createSessionRuntime` (l.48), l.127. `createSessionRuntime` est
    appelée par `app/main.cjs` (`compose`, l.303) et `runtime/headless-runtime.cjs` (l.667).
  - `adapters/saved-moment-store.cjs`, `SavedMomentStore.list()` (l.11) : la liste des dossiers vient
    de `readdir(…).catch(()=>[])` (racine absente ou illisible : liste vide) ; pour chaque dossier,
    `try{out.push(JSON.parse(await fs.readFile(…'saved.json'…)));}catch{}` — un `saved.json` corrompu
    fait disparaître le moment de la liste sans trace. Constructeur `constructor(root)` (l.3),
    construit dans `app/main.cjs` l.93.
  - `adapters/viewing-settings.cjs`, `ViewingSettings.load()` (l.4) :
    `catch{return {bookmarkShortcut:'CommandOrControl+Shift+S'};}` pour toute erreur. Constructeur
    `constructor(file)` (l.3), construit dans `app/main.cjs` l.97.
- Mesures à la version `0d5a954` : `catch_vides` vaut 1 pour `adapters/embedding-store.cjs` et 1 pour
  `adapters/saved-moment-store.cjs`.

  ```sh
  node --input-type=module -e "import fs from 'node:fs';import {measureText} from './scripts/quality/metrics.mjs';for(const f of ['adapters/embedding-store.cjs','adapters/saved-moment-store.cjs'])console.log(f,measureText(fs.readFileSync(f,'utf8')))"
  ```

- Tests existants : `tests/moment-index.test.cjs`, « feeding the index can never fail the caller:
  malformed input and an unreadable cache are absorbed » (l.401, sur un double du cache, pas sur
  `EmbeddingStore`), et les tests l.478 et l.507 sur `EmbeddingStore` ; `tests/viewing-features.test.cjs`, « saved moments survive the deletion of their
  session, replay and explicit durable deletion » (l.20). Aucun test n'exerce directement
  `ViewingSettings` (seul `tests/mac-ipc-contract.test.cjs` en nomme le canal).
- Hors de ce ticket, volontairement : `server/main.cjs` l.36 (balayage au démarrage, « never a reason
  not to start », commenté) et le lien des identifiants dans `adapters/codex-confinement.cjs`
  (`createContext`, l.254-262), reporté.

## Périmètre

- À modifier : `adapters/embedding-store.cjs`, `adapters/saved-moment-store.cjs`,
  `adapters/viewing-settings.cjs` ; `runtime/session-runtime.cjs` et `app/main.cjs` (passer le journal
  livré par le jalon `journal` aux trois constructeurs) ; `tests/moment-index.test.cjs`,
  `tests/viewing-features.test.cjs`.
- Le journal arrive dans `createSessionRuntime` par le chemin que le jalon `journal` a posé. Si le
  jalon n'en a posé aucun jusque-là, le ticket l'ajoute en option de `createSessionRuntime` et le
  passe depuis ses deux appelants ; `runtime/headless-runtime.cjs` entre alors dans le périmètre,
  pour cette seule ligne.
- Forme retenue, la même pour les trois : le journal est un argument optionnel du constructeur ; un
  fichier absent (`ENOENT`) reste silencieux ; tout autre échec de lecture ou d'analyse est écrit au
  journal avec le nom du fichier dans son dossier et le `code` de l'erreur, ou son `name` quand elle
  n'a pas de code — jamais son `message` : celui d'une erreur d'analyse recopie le début du fichier.
  La valeur rendue reste celle d'aujourd'hui.
  - `EmbeddingStore.load` : index vide. Un fichier vide (aucune ligne) reste silencieux comme un
    fichier absent. Un modèle différent n'est pas une erreur.
  - `SavedMomentStore.list` : le moment illisible est sauté, les autres sont rendus. Une racine
    absente reste silencieuse ; une racine illisible pour une autre raison est écrite au journal et
    rend la liste vide, comme aujourd'hui.
  - `ViewingSettings.load` : le raccourci par défaut est rendu.
- À ne pas toucher : les écritures de ces trois fichiers ; le `catch` de la ligne tronquée
  (`embedding-store.cjs` l.13) ; le format des fichiers ; aucune lecture ne se met à lever.

## Critères d'acceptation

Chaque critère se vérifie par un test ou une commande.

1. `EmbeddingStore` sur un fichier dont l'en-tête n'est pas du JSON : `get` rend `null`, et le journal
   de test a reçu une entrée. Sur un fichier absent, puis sur un fichier vide : `get` rend `null`,
   aucune entrée.
2. Le test existant « feeding the index can never fail the caller… » passe sans modification de ses
   assertions.
3. `SavedMomentStore.list()` sur un dossier racine qui contient un moment valide et un moment dont
   `saved.json` est corrompu : la liste rend le seul moment valide et le journal reçoit une entrée qui
   nomme le dossier du moment corrompu. Dossier racine absent : liste vide, aucune entrée. Racine
   qui est un fichier ordinaire (la lecture du dossier échoue autrement que par absence) : liste
   vide, une entrée.
4. `ViewingSettings.load()` sur un fichier au JSON invalide : rend
   `{ bookmarkShortcut: 'CommandOrControl+Shift+S' }` et le journal reçoit une entrée. Fichier absent :
   même valeur, aucune entrée.
5. Dans les trois cas d'échec, `JSON.stringify` des entrées du journal ne contient pas le texte du
   fichier illisible (un repère reconnaissable écrit par le test).
6. La commande de mesure ci-dessus rend `catch_vides: 0` pour les deux fichiers.
7. `node --test --test-concurrency=1 tests/moment-index.test.cjs tests/viewing-features.test.cjs tests/mac-ipc-contract.test.cjs`
   passe sans qu'aucune assertion existante soit modifiée ; `node scripts/check.mjs` est vert.

## Test d'acceptation attendu

Par les méthodes publiques des trois classes (`get`, `list`, `load`), sur un dossier temporaire, avec
un journal de test : dans `tests/moment-index.test.cjs` pour l'index, dans
`tests/viewing-features.test.cjs` pour les moments sauvegardés et les réglages de visionnage. Le
passage du journal aux trois constructeurs (`runtime/session-runtime.cjs`, `app/main.cjs`) n'a pas de
preuve hors ligne propre : il est relu. Le journal étant optionnel, un câblage manqué perd des entrées
mais ne casse rien ; `tests/mac-ipc-contract.test.cjs`, qui lance l'hôte factice, garde que le
démarrage n'en souffre pas.

## Hypothèses bloquantes

Aucune décision n'est attendue. Si le journal livré par le jalon `journal` ne peut pas être passé à
un adaptateur par son constructeur : verdict BLOQUÉ, avec l'écart constaté.

## Journal
