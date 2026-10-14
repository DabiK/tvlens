---
id: T053
titre: Keep the config read when its cache fails and journal an unreadable cache
statut: a-faire
bloque_par: T028, T036
adr: non
installe: non
harnais: non
supprime_tests: non
---

## Ce que le ticket livre

`loadConfig` lit le fichier de configuration puis en garde une copie chiffrée. Si l'écriture de cette
copie échoue, la configuration pourtant lue est perdue : l'appel lève. À l'inverse, une copie
illisible ou indéchiffrable est traitée en silence comme une copie absente. Après ce ticket, un échec
d'écriture de la copie est écrit au journal et la configuration lue est rendue ; une copie illisible
est écrite au journal avant de retomber sur les valeurs par défaut.

## Sources

- Constats : ADP-03, OUBLI-02, ADP-05
- Code vérifié à la version `0d5a954` (chercher par nom, les lignes bougeront) :
  - `adapters/config.cjs`, `loadConfig({ configPath, userData, safeStorage, environment = process.env })`
    (l.7) : lecture du fichier l.10 (`ENOENT` rend une chaîne vide, toute autre erreur est relancée) ;
    copie chiffrée l.29-36 — `stored(cached, safeStorage)` l.30 (appelée seulement quand le fichier
    n'apporte pas de clé ; elle ne lève pas), `fs.mkdir(userData, …)` l.33,
    `fs.writeFile(cached, safeStorage.encryptString(JSON.stringify(…)), { mode: 0o600 })` l.34 : un
    échec de `mkdir`, de `encryptString` ou de `writeFile` fait lever `loadConfig` avant le `return`
    de la l.37. Le paramètre `environment` vaut `process.env` par défaut.
  - Même fonction, branche sans `configPath` (l.39-46) : lecture et déchiffrement de la copie, puis
    `catch { /* Import remains available when no encrypted credentials exist. */ }` l.45 — copie
    absente, illisible, indéchiffrable ou JSON invalide sont confondues.
  - `adapters/config.cjs`, `stored(cached, safeStorage)` (l.51-54) : `catch { return null; }`, même
    confusion ; quand elle rend `null`, la copie réécrite l.34 ne garde que les interrupteurs.
  - Appelants : `app/main.cjs` l.55 (démarrage, suivi d'un `.catch` qui remplace tout échec par une
    configuration par défaut) et l.269 (`handle('app:import-config', …)`) ; `server/main.cjs` l.28
    (`safeStorage: { isEncryptionAvailable: () => false }` : pas de copie côté serveur).
  - Tests : `tests/portable-config.test.cjs`, « fresh installation works without an optional env file
    and keeps writable usage separate » (l.19), qui exige déjà l.32 qu'un `configPath` illisible
    rejette avec `code: 'EISDIR'`. Autres utilisateurs de `loadConfig` dans les tests :
    `tests/media-asr-options.test.cjs` (l.139), `tests/question-ceiling.test.cjs` (l.25),
    `tests/review-regressions.test.cjs` (l.221-240 et l.361-381, avec une copie chiffrée de test).
  - Le message d'une erreur d'analyse (`JSON.parse`) recopie le début du texte analysé, ici la copie
    déchiffrée : il ne doit pas partir au journal.

## Périmètre

- À modifier : `adapters/config.cjs` ; `app/main.cjs` (les deux appels passent le journal) ;
  `tests/portable-config.test.cjs`.
- Forme retenue :
  - `loadConfig` reçoit en option le journal livré par le jalon `journal` ; sans journal, les règles
    ci-dessous s'appliquent sans écriture.
  - Avec `configPath` : un échec de `mkdir`, de `encryptString` ou de `writeFile` pour la copie est
    écrit au journal, et la configuration lue est rendue comme si la copie avait été écrite.
  - Dans `stored()` et dans la branche sans `configPath` : une copie absente (`ENOENT`) reste
    silencieuse ; tout autre échec (lecture refusée, déchiffrement, JSON invalide) est écrit au
    journal, puis le comportement d'aujourd'hui s'applique (valeurs par défaut, ou copie réécrite avec
    les seuls interrupteurs). `loadConfig` ne lève pas pour une copie illisible.
  - Une entrée de journal ne contient ni la clé du fournisseur, ni le contenu de la copie, ni le
    contenu du fichier lu. Elle porte le nom de l'opération (lecture, déchiffrement, analyse, création
    du dossier, chiffrement, écriture) et le `code` de l'erreur, ou son `name` quand elle n'a pas de
    code ; jamais son `message`, ni l'erreur entière.
  - Comportement gardé tel quel : avec `configPath`, un fichier sans clé mais avec des interrupteurs
    et une copie illisible réécrit la copie avec les seuls interrupteurs, comme aujourd'hui ; l'entrée
    de journal est la seule trace de ce qui est perdu.
- À ne pas toucher : la lecture du fichier (l.10 : une erreur autre que `ENOENT` continue de lever) ;
  le `.catch` de `app/main.cjs` l.55 (dernier ticket du lot) ; `server/main.cjs` ; le format de la
  copie ; les interrupteurs.

## Critères d'acceptation

Chaque critère se vérifie par un test ou une commande.

Tous les appels du test passent `environment: {}`, pour que l'environnement de la machine ne change
pas les valeurs rendues.

1. Fichier de configuration lisible avec une clé, `safeStorage` de test dont `encryptString` lève :
   `loadConfig` rend la configuration lue (clé et modèle du fichier) ; le journal de test reçoit une
   entrée.
2. Même fichier, dossier `userData` où l'écriture est impossible (un fichier ordinaire à la place du
   dossier) : même résultat, une entrée au journal.
3. Sans `configPath`, copie présente mais indéchiffrable (`decryptString` lève) : `loadConfig` rend
   les valeurs par défaut (`apiKey: ''`, modèle par défaut) et le journal reçoit une entrée.
4. Sans `configPath`, copie absente : valeurs par défaut, aucune entrée au journal.
5. Avec `configPath`, fichier sans clé, copie présente mais au JSON invalide : `loadConfig` rend la
   configuration du fichier et le journal reçoit une entrée pour la copie illisible.
6. Dans tous les cas, `JSON.stringify` des entrées du journal ne contient ni la clé écrite dans le
   fichier ni aucun fragment du texte de la copie : au critère 5, la copie déchiffrée est un texte
   reconnaissable (`repere-copie-illisible`), absent des entrées.
7. `node --test --test-concurrency=1 tests/portable-config.test.cjs tests/media-asr-options.test.cjs tests/question-ceiling.test.cjs tests/review-regressions.test.cjs`
   passe sans qu'aucune assertion existante soit modifiée ; `node scripts/check.mjs` est vert.

## Test d'acceptation attendu

Dans `tests/portable-config.test.cjs`, par la fonction exportée `loadConfig`, avec un dossier
temporaire, un `safeStorage` de test et un journal de test qui enregistre ses entrées. Le passage du
journal par les deux appels de `app/main.cjs` ne s'exécute pas hors ligne (l'hôte de test se lance en
mode d'essai, qui ne lit aucune configuration, et son dialogue d'import est annulé) : il est relu. Le
journal étant optionnel, un câblage manqué perd des entrées mais ne casse rien.

## Hypothèses bloquantes

Aucune décision n'est attendue. Si le journal livré par le jalon `journal` ne peut pas être passé à
un adaptateur par son appelant : verdict BLOQUÉ, avec l'écart constaté.

## Journal
