---
id: T065
titre: Stop the Mac launch when the given config file cannot be read
statut: a-faire
bloque_par: T053, T057, T058, T059, T062, T063, T064
adr: non
installe: non
harnais: non
supprime_tests: non
---

## Ce que le ticket livre

Au démarrage, l'application Mac remplace tout échec de `loadConfig` par une configuration par défaut
sans clé : un fichier de configuration donné mais illisible produit une application qui démarre et ne
sait rien faire, sans message. Après ce ticket, un fichier de configuration donné qui ne peut pas être
lu arrête le démarrage par le chemin existant (« TVLens ne peut pas démarrer »), comme un réglage mal
écrit. Un fichier absent et un lancement sans fichier démarrent comme avant.

## Sources

- Constats : ADP-03
- Code vérifié à la version `0d5a954` (chercher par nom, les lignes bougeront) :
  - `app/main.cjs` l.38-40 : `smoke`, `liveInspection` (`smoke && --live-inspection`),
    `localInspection`. L.51-52 : `arg` vient de `--config=` ; `configPath = arg || (!app.isPackaged &&
    (!smoke || liveInspection) ? path.join(__dirname, '..', '.env.local') : undefined)`.
  - `app/main.cjs` l.55 : `config = smoke && !liveInspection ? {… 'test/fake' …} : await
    loadConfig({ configPath, userData: app.getPath('userData'), safeStorage }).catch(() => ({ apiKey:
    '', model: 'google/gemini-2.5-flash-lite', audioInput: true, visionDuringAsk: … }))`. C'est la
    première lecture du démarrage : rien n'est composé avant. `environment` n'est pas passé : l'hôte
    lit `process.env`, où `loadConfig` prend aussi la clé du fournisseur (`OPENROUTER_API_KEY`).
  - `app/main.cjs` l.547-552 : traitement existant d'un démarrage échoué — `console.error(error)`,
    `dialog.showErrorBox('TVLens ne peut pas démarrer', String(error?.message || error))` hors mode
    d'essai, puis `app.quit()`.
  - `adapters/config.cjs`, `loadConfig` : la lecture du fichier (l.10) rend une chaîne vide pour
    `ENOENT` et relance toute autre erreur. Après le ticket du lot sur la copie chiffrée, c'est la
    seule cause d'échec de `loadConfig` : ni la copie ni la branche sans `configPath` ne lèvent.
  - Qui est arrêté par ce ticket, et qui ne l'est pas : seul un `configPath` présent et illisible
    autrement que par absence lève. Une application installée lancée sans `--config=` n'a pas de
    `configPath` (`app.isPackaged`) : elle ne peut pas être arrêtée par ce ticket, et l'import par
    `app:import-config` (l.267-269), seul chemin de réparation, reste atteignable. En développement,
    un `.env.local` illisible arrête le lancement, avec le message de l'erreur.
  - `--live-inspection` au lancement ne change que trois choses (`grep -n liveInspection app/main.cjs
    runtime/session-runtime.cjs`) : la lecture de la configuration (l.52, l.55), les vecteurs
    (`runtime/session-runtime.cjs` l.118-123, composés seulement si la configuration porte une clé)
    et l'inspecteur réel (l.189), composé à la création d'une session.
  - `tests/mac-ipc-contract.test.cjs` : aide locale `launch(userData, { env, sweep, disk, wrap })`
    (l.141-194) qui remplace Electron (`app.isPackaged: false`, chiffrement indisponible), ajoute
    toujours `--smoke-test` (l.168), capture `console.error` dans `failures` sous forme de chaînes
    (l.169, `String(error?.message || error)`) et expose `host.started` ; test « host settings come
    from the environment; a full disk stops capture, refuses start and resume and deletes nothing; a
    mistyped setting refuses the launch » (l.451), assertions l.527-528
    (`refused.started === false`, `refused.failures.join(' ')` comparé au message).
  - `tests/portable-config.test.cjs`, « fresh installation works without an optional env file and
    keeps writable usage separate » (l.19) : le cas du fichier absent, et l.32 le rejet `EISDIR` de
    `loadConfig` quand le chemin donné est un dossier.

## Périmètre

- À modifier : `app/main.cjs` (retirer le `.catch` de la l.55, et la phrase « and the fallback » du
  commentaire qui le précède si elle devient inexacte) ; le test du lancement Mac
  (`tests/mac-ipc-contract.test.cjs`), par l'aide `tests/helpers/mac-host.cjs` livrée par le lot L05.
  Si cette aide n'accepte pas d'arguments de ligne de commande en plus, le ticket lui ajoute cette
  option (il la modifie, il ne crée aucune aide).
- À ne pas toucher : `adapters/config.cjs` ; le texte « TVLens ne peut pas démarrer » ; le mode
  d'essai (`--smoke-test` sans `--live-inspection` ne lit aucun fichier) ; le canal
  `app:import-config` ; `server/main.cjs`.
- Le test n'utilise ni Electron réel ni fournisseur. `--live-inspection` ne sert ici qu'à faire lire
  le fichier de configuration par l'hôte factice. Le chemin donné par `--config=` est dans le dossier
  temporaire du test. Le temps de chaque lancement, le test retire `OPENROUTER_API_KEY` de
  l'environnement du processus puis le rétablit, pour qu'aucune clé de la machine n'entre dans la
  configuration lue. Le test ne crée aucune session.

## Critères d'acceptation

Chaque critère se vérifie par un test ou une commande.

1. Hôte Mac factice lancé avec `--live-inspection` et `--config=<un dossier temporaire>` (la lecture
   lève `EISDIR`) : `started` vaut `false`, et `failures.join(' ')` correspond à `/EISDIR/`.
2. Même lancement avec `--config=<chemin d'un fichier absent du dossier temporaire>` : `started` vaut
   `true`, et `failures` ne contient aucune erreur de lecture de la configuration.
3. Le test « host settings come from the environment; … a mistyped setting refuses the launch » passe
   sans modification de ses assertions.
4. `node --test --test-concurrency=1 tests/mac-ipc-contract.test.cjs tests/portable-config.test.cjs`
   passe sans qu'aucune assertion existante soit modifiée ; `node scripts/check.mjs` est vert.

## Test d'acceptation attendu

Dans `tests/mac-ipc-contract.test.cjs`, par le lancement de `app/main.cjs` devant l'hôte factice de
`tests/helpers/mac-host.cjs`, avec des arguments de ligne de commande en plus. Frontière : le
démarrage de l'application, observé par `started` et par les erreurs capturées.

## Hypothèses bloquantes

Aucune décision n'est attendue. La forme suit le modèle existant, où un réglage mal écrit refuse le
lancement. Si le lancement du critère 2 (`--live-inspection`, fichier absent, aucune clé) ouvre une
connexion, lance Codex ou appelle un fournisseur avant d'atteindre `started`, ou si l'aide
`tests/helpers/mac-host.cjs` ne peut pas recevoir d'arguments de ligne de commande sans changer ce
que ses autres utilisateurs observent : verdict BLOQUÉ, avec l'écart constaté.

## Journal
