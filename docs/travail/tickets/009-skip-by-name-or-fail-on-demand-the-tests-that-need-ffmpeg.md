---
id: T009
titre: Skip by name, or fail on demand, the tests that need ffmpeg
statut: a-faire
bloque_par: T145
adr: non
installe: non
harnais: non
supprime_tests: non
---

## Ce que le ticket livre

Cinq tests lancent le vrai `ffmpeg`. Sans lui, deux échouent sans dire pourquoi, un saute en silence la
moitié de ce qu'il prouve, un seul se déclare sauté, et chacun cherche le binaire à sa façon. Après ce
ticket, une aide unique résout `ffmpeg` comme le produit, chaque test qui en dépend est sauté avec une
raison lisible quand il manque, et `TVLENS_REQUIRE_TOOLS=1` transforme ce saut en échec pour une machine
qui doit tout prouver.

## Sources

- Constats : TSTB-01, OPS-06, FLK-14
- Code concerné, à la version `0d5a954` :
  - `tests/remote-media.test.cjs`, test « remote media preserves crop, frame timestamps and produces a
    replay with normalized audio » (ligne 3) : `new RemoteMedia().assemble(input)` (ligne 7), sans
    garde ; `ffmpeg` est pris dans le `PATH`.
  - `tests/video-research.test.cjs`, test « real clip decoding spans a segment boundary, aligns PCM
    audio and constructs native-video evidence » (ligne 60) : chemin de `ffmpeg` calculé à la main ligne
    62 (`TVLENS_FFMPEG`, sinon `/opt/homebrew/bin/ffmpeg` sur macOS, sinon `ffmpeg`), sans garde.
  - `tests/video-research.test.cjs`, test « external bridge authenticates capability and real MCP stdio
    tool calls reach scoped domain » (ligne 49) : `path.resolve('mcp/server.cjs')` (ligne 54) dépend du
    dossier courant.
  - `tests/clip-unreadable.test.cjs`, test « a passage recorded without a frame is kept, analysed and
    never announced as a video that can be replayed » (ligne 94) : le réexamen par le vrai décodeur est
    dans un `if (spawnSync('ffmpeg', ['-version']).status === 0) { … } else t.diagnostic(…)` (lignes 130
    à 138). Sans `ffmpeg`, le test passe en n'ayant rien prouvé de cette partie.
  - `tests/media-asr-options.test.cjs`, constante `ffmpegAvailable` (ligne 36) et test « parallel
    assembly keeps frame order, the exact frame pipeline and normalized audio, and measures itself »
    (ligne 37) : déjà `{ skip: !ffmpegAvailable && 'ffmpeg indisponible' }`, mais par le seul `PATH`.
  - `tests/server-ingest-path.test.cjs`, test « images cropped or withheld under a TV Lens card are
    bounded at the door, carried to the passage and said in its uncertainty; an ordinary block is
    unchanged » (ligne 70) : une première moitié de validation pure, puis
    `fixture(t, { media: new RemoteMedia() })` (ligne 91) qui lance le vrai `ffmpeg`.
  - `adapters/system-paths.cjs`, fonction `executable(name, { override, environment, home })` (ligne 6) :
    la résolution du produit — `override`, puis `PATH`, `~/.local/bin`, `/opt/homebrew/bin`,
    `/usr/local/bin`, `/usr/bin`. `adapters/config.cjs` (ligne 19) l'appelle avec `TVLENS_FFMPEG`.
  - `adapters/remote-media.cjs`, constructeur de `RemoteMedia` (ligne 67) : `ffmpeg = 'ffmpeg'` par
    défaut ; le chemin se passe par l'option `ffmpeg`.
  - `docs/standards.md`, section « Tests » (lignes 36 à 45).

## Périmètre

- À créer : `tests/helpers/tools.cjs` et son test, par exemple `tests/test-tools.test.cjs`.
- À modifier : les cinq fichiers de test cités, pour les tests cités seulement ; `CONTRIBUTING.md` (une
  phrase sur `TVLENS_REQUIRE_TOOLS`).
- Forme unique retenue : `requireTool('ffmpeg')`, dans `tests/helpers/tools.cjs`.
  - L'aide tient une table des outils connus : pour chacun, la variable qui force son chemin (si le
    produit en a une) et les arguments qui le font répondre. Ce ticket n'y inscrit que `ffmpeg` :
    variable `TVLENS_FFMPEG`, arguments `-version`. Un autre outil s'ajoute par une ligne de la table,
    sans seconde aide.
  - Elle résout l'outil par `executable(name, { override })` du produit, puis vérifie qu'il se lance
    avec ses arguments. Un chemin forcé qui n'existe pas donne donc « outil absent » : `executable` rend
    le chemin forcé sans le vérifier.
  - Elle rend le chemin résolu et la valeur à passer à `test(nom, { skip }, fn)` : `false` quand
    l'outil répond, sinon une raison en français qui nomme l'outil.
  - Avec `TVLENS_REQUIRE_TOOLS=1` et un outil absent, elle lève au chargement du fichier une erreur qui
    nomme l'outil et la variable.
  - L'environnement lu et la table sont des paramètres (`process.env` et la table de l'aide par
    défaut), pour que son test n'ait ni à modifier l'environnement du processus ni à dépendre de
    `ffmpeg`.
- Dans les tests : le saut passe par l'option `skip` de `test`, jamais par un `if` dans le corps. Les
  tests passent le chemin résolu à `new RemoteMedia({ ffmpeg })` et au décodeur, au lieu de compter sur
  le `PATH`.
- Les deux tests dont une moitié seulement dépend de `ffmpeg` (`clip-unreadable`, `server-ingest-path`)
  sont scindés : la moitié sans `ffmpeg` reste un test toujours lancé, la moitié avec `ffmpeg` devient un
  test à part, nommé d'après son comportement et gardé par `skip`. Chaque assertion d'origine se
  retrouve dans l'un des deux tests ; aucune n'est retirée ni affaiblie.
- `tests/video-research.test.cjs` ligne 54 : le chemin du serveur MCP est calculé depuis `__dirname`.
- À ne pas toucher : le code de production — le défaut de `RemoteMedia` reste `'ffmpeg'` ; les autres
  tests de ces fichiers ; les attentes sans borne de ces fichiers. Aucune ligne de plus de 160
  caractères n'est ajoutée ; une ligne longue existante que l'on modifie est coupée ou laissée à sa
  longueur.

## Critères d'acceptation

1. Test de l'aide, avec une table et un environnement passés en paramètres : pour un outil dont le
   chemin forcé n'existe pas, `requireTool` rend une raison de saut qui le nomme ; avec
   `TVLENS_REQUIRE_TOOLS=1` dans cet environnement, elle lève une erreur qui nomme l'outil et la
   variable ; pour un outil présent — une entrée de table dont le chemin forcé est `process.execPath`
   et les arguments `--version` (Node refuse `-version`) —, elle rend `skip: false` et ce chemin.
2. Avec `ffmpeg` introuvable, simulé par un chemin forcé :
   `TVLENS_FFMPEG=/tvlens-absent/ffmpeg node --test --test-concurrency=1 tests/remote-media.test.cjs
   tests/video-research.test.cjs tests/clip-unreadable.test.cjs tests/media-asr-options.test.cjs
   tests/server-ingest-path.test.cjs` donne `fail 0` et `skipped 5`. Les cinq tests sautés sont ceux qui
   lancent `ffmpeg`, chacun avec une raison qui le nomme. Sortie dans le journal.
3. Même commande précédée de `TVLENS_REQUIRE_TOOLS=1` : code de sortie non nul, et le message nomme
   `ffmpeg` et `TVLENS_REQUIRE_TOOLS`.
4. Même commande sans `TVLENS_FFMPEG` : `fail 0` et `skipped 0`. `ffmpeg` répondait sur le poste au
   découpage.
5. `cd tests && node --test --test-name-pattern="external bridge" video-research.test.cjs` : le test
   « external bridge authenticates capability… » passe depuis un autre dossier courant. Les autres
   tests du fichier ne sont pas lancés par cette commande.
6. `grep -n "spawnSync('ffmpeg'" tests/*.test.cjs` ne rend plus rien : aucun test ne cherche `ffmpeg`
   par lui-même.
7. `node scripts/check.mjs` est vert ; la mesure `cas_de_test` monte.

## Test d'acceptation attendu

Les cinq tests existants, gardés par `skip`, et les deux tests issus de la scission ; un test de l'aide,
nommé par exemple « a missing tool skips its tests with a reason, and fails them when tools are
required ». Frontières inchangées : `RemoteMedia.assemble`, le décodeur de clips et la route d'ingestion
devant le vrai `ffmpeg`.

## Hypothèses bloquantes

Aucune décision n'est attendue. Si `ffmpeg` n'est pas installé sur la machine de la session, le critère
4 ne peut pas être observé : verdict BLOQUÉ, sans rien installer. Si scinder un test impose de
dupliquer une mise en place au point de changer ce qu'il prouve : verdict BLOQUÉ, avec le test en cause.
Si, au critère 2, un sixième test de ces fichiers échoue ou doit être sauté sous le chemin forcé, il
lance `ffmpeg` lui aussi : verdict BLOQUÉ, avec son nom, car le compte des tests concernés est à revoir.

## Journal
