---
id: T037
titre: Freeze a reference session archive and prove the current code reads it
statut: a-faire
bloque_par:
adr: non
installe: non
harnais: non
supprime_tests: non
---

## Ce que le ticket livre

La lecture d'une archive de session n'est prouvée aujourd'hui que par aller-retour : le même code écrit
puis relit. Après ce ticket, une archive écrite une fois par le code actuel est figée dans
`tests/fixtures/archives/`, avec ses sommes de contrôle, et un test l'ouvre et la relit par les frontières
publiques. Tout ticket qui changera un format sur disque aura ainsi un témoin qu'il n'a pas écrit.

## Sources

- Constats : GAP2-01, GAP2-02, GAP2-10, OUBLI-53
- Livre : jalon:archive-reference
- Code vérifié à la version `0d5a954` :
  - `adapters/local-store.cjs` : `FILES` ligne 6 (`session.json`, `deep-answers.json`,
    `living-recap.json`, `auto.json`, `surveillance.json`, `manifest.json`) ; `MEDIA_DIR`, `THUMBS_DIR`,
    `LEGACY_THUMBS_DIR` ligne 7 ; `MEDIA_FILE` ligne 8 ; `write(id, input)` lignes 50-73 : le JSON du
    média est `{frames, audio (base64), startMs, endMs}`, sans version (ligne 55).
  - `adapters/session-library.cjs` : `MANIFEST_FORMAT`, `MANIFEST_VERSION` ligne 6 ; `SESSION_ID`
    ligne 8 ; `sessionTitle(at)` lignes 11-15 ; `describe` lignes 34-47 (sans manifeste, titre et dates
    viennent de `savedAt`, ligne 44) ; `SessionLibrary.state()` lignes 89-114 (`savedAt` est la date de
    modification du dossier, ligne 95, ou de `session.json`, ligne 98) ; `list()` lignes 117-130 ;
    `read()` lignes 133-141.
  - `runtime/headless-runtime.cjs` : `open(id)` lignes 983-1015.
  - `app/main.cjs` : `store?.saveRecap(state)` ligne 212 — `living-recap.json` n'est écrit que par
    l'hôte Mac.
  - `.gitignore` : `*.webm`, `*.bin`, `*.log`, `sessions/`, `saved-moments/` écartent ce qu'une archive
    contient. `.prettierignore` et `.gitattributes` n'existent pas.
  - `scripts/check.mjs` : `format` (ligne 88) lancerait Prettier sur `.` s'il était installé.
  - `tests/server-sessions.test.cjs` : `fixture` ligne 73 — modèle d'un `HeadlessRuntime` hors ligne
    (faux agent, faux embeddings, faux assembleur, horloges injectées).
  - Six copies de `tree(dir, base = dir)` dans les tests (`tests/session-durable.test.cjs:24`,
    `tests/server-sessions.test.cjs:61`, entre autres) : ce ticket ne les fusionne pas.

## Périmètre

À créer :

- `scripts/fixtures/write-reference-archive.cjs` : pilote un `HeadlessRuntime` hors ligne, sur le modèle
  de `fixture`, et écrit une génération dans le dossier passé en argument. Il n'est lancé qu'une fois,
  par cette session ; aucun test ne le lance.
- `tests/fixtures/archives/durable-v1/` : la génération écrite par le code de la version courante. Elle
  contient deux sessions, chacune dans un dossier nommé par son identifiant, sous un dossier qui ne
  s'appelle ni `sessions` ni `saved-moments` :
  - une session archivée proprement, avec au moins deux passages, leurs médias et vignettes, une
    conversation et un registre de surveillance ;
  - une session interrompue : l'hôte n'a pas clos la session ; un clip est tronqué alors que son JSON
    est complet, et un reste `session.json.tmp` est présent. Ces deux altérations sont faites à la main
    après l'écriture et le README les nomme, fichier par fichier.
- `tests/fixtures/archives/durable-v1/expected.json` : ce que la lecture doit rendre (identifiants,
  états, nombre de passages, médias présents et manquants, intervalle de chaque média, nombre
  d'affirmations du registre de surveillance), pas une copie des fichiers. Il ne porte ni titre ni date
  tirés d'une date de fichier : une copie de la génération n'a pas les dates du dépôt.
- `tests/fixtures/archives/durable-v1/SHA256SUMS` : une somme par fichier de la génération.
- `tests/fixtures/archives/README.md` : commit d'origine, commande qui a produit la génération, ce qui a
  été altéré à la main, la règle « une génération figée ne se régénère jamais », qui peut modifier
  `expected.json` et dans quel cas, et ce que la génération ne contient pas (`living-recap.json`, écrit
  par le seul hôte Mac ; la disposition antérieure à `manifest.json` ; un média d'une génération
  ancienne, sans `startMs` ni `endMs`).
- `tests/archive-compat.test.cjs` et, si besoin, une aide dans `tests/helpers/`.
- `.prettierignore` (nouveau) : `tests/fixtures/`. `.gitattributes` (nouveau) :
  `tests/fixtures/archives/** -text`.

À modifier :

- `.gitignore` : une négation ajoutée pour `tests/fixtures/archives/**`.

À ne pas toucher :

- Le code de production : aucun format ne change, aucune version n'est ajoutée à un fichier.
- Les tests existants et leurs aides locales.

## Critères d'acceptation

Chaque critère se vérifie par un test ou une commande.

1. `node --test tests/archive-compat.test.cjs` passe. Le fichier prouve, sur une copie de la génération
   dans un dossier temporaire :
   - chaque fichier listé dans `SHA256SUMS` existe et a la somme écrite, et aucun fichier de la
     génération n'est absent de la liste ;
   - chaque fichier de la génération dont le nom finit par `.json` se lit par `JSON.parse` ;
   - `SessionLibrary.list()` rend les deux sessions avec l'état, le nombre de passages et le décompte de
     médias de `expected.json` ;
   - `SessionLibrary.read()` rend pour la session archivée un instantané, une conversation et un registre
     de surveillance non nuls, et l'inventaire attendu ;
   - `HeadlessRuntime.open()` ouvre la session archivée ; l'état publié porte les passages attendus, dit
     le registre de surveillance `ready` et porte le nombre d'affirmations de `expected.json` ;
   - la session interrompue est listée dans l'état attendu, son clip tronqué est compté comme
     `expected.json` le dit, et le reste `session.json.tmp` n'empêche ni la liste ni la lecture ;
   - un titre qui dépend d'une date de fichier est comparé à `sessionTitle` appliqué à une date que le
     test pose lui-même sur la copie (`fs.utimes`), jamais à une date du dépôt.
2. Le même fichier prouve qu'aucun chemin de `SHA256SUMS` n'est écarté par `.gitignore`
   (`git check-ignore --no-index` par chemin) ; ce cas est sauté, et le dit, hors d'un dépôt Git.
3. Le test ne lance pas le générateur et n'écrit rien sous `tests/fixtures/`.
4. `node --test tests/session-durable.test.cjs` passe sans qu'une ligne de ce fichier ait changé.
5. `node scripts/check.mjs` est vert.

## Test d'acceptation attendu

`tests/archive-compat.test.cjs`, nouveau. Frontières : `SessionLibrary` (`list`, `read`) et
`HeadlessRuntime.open`, sur une copie temporaire de `tests/fixtures/archives/durable-v1/`.

## Hypothèses bloquantes

Aucune décision n'est attendue. Si le code actuel ne peut pas relire, sans modification, la génération
qu'il vient d'écrire, ou si la négation de `.gitignore` ne suffit pas à faire suivre les médias : verdict
BLOQUÉ, avec l'écart constaté. La génération n'est pas retouchée pour faire passer le test. Si le runtime
hors ligne ne produit aucune affirmation de surveillance, le registre est figé tel qu'il est écrit,
`expected.json` porte zéro et le README le dit : ce n'est pas un blocage.

## Journal
