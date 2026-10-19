---
id: T009
titre: Skip by name, or fail on demand, the tests that need ffmpeg
statut: a-faire
bloque_par: T294
adr: non
installe: non
harnais: non
supprime_tests: non
---

## Ce que le ticket livre

Cinq tests lancent le vrai `ffmpeg`. Sans lui, trois échouent sans dire pourquoi, un saute en silence une
partie de ce qu'il prouve, un seul se déclare sauté, et chacun cherche le binaire à sa façon. Après ce
ticket, une aide unique résout `ffmpeg` comme le produit, chaque test qui en dépend est sauté avec une
raison lisible quand il manque, et `TVLENS_REQUIRE_TOOLS=1` transforme ce saut en échec pour une machine
qui doit tout prouver.

## Sources

- Constats : TSTB-01, OPS-06, FLK-14
- Code concerné, à la version `1178657` :
  - `tests/remote-media.test.cjs`, test « remote media preserves crop, frame timestamps and produces a
    replay with normalized audio » (ligne 6) : `new RemoteMedia().assemble(input)` (ligne 10), sans
    garde ; `ffmpeg` est pris dans le `PATH`. Les autres tests du fichier sont refusés avant `ffmpeg` ou
    lui passent un faux binaire.
  - `tests/video-research.test.cjs`, test « real clip decoding spans a segment boundary, aligns PCM
    audio and constructs native-video evidence » (ligne 65) : chemin de `ffmpeg` calculé à la main ligne
    67 (`TVLENS_FFMPEG`, sinon `/opt/homebrew/bin/ffmpeg` sur macOS, sinon `ffmpeg`), sans garde.
  - `tests/video-research.test.cjs`, test « external bridge authenticates capability and real MCP stdio
    tool calls reach scoped domain » (ligne 54) : `path.resolve('mcp/server.cjs')` (ligne 59) dépend du
    dossier courant.
  - `tests/clip-unreadable.test.cjs`, test « a passage recorded without a frame is kept, analysed and
    never announced as a video that can be replayed » (ligne 95) : le réexamen par le vrai décodeur est
    dans un `if (spawnSync('ffmpeg', ['-version']).status === 0) { … } else t.diagnostic(…)` (lignes 131
    à 139), entre une première partie et une fin qui n'en dépendent pas. Sans `ffmpeg`, le test passe en
    n'ayant rien prouvé de cette partie. Le `ClipInspector` de ce bloc (ligne 132) ne reçoit pas
    `ffmpeg` : il prend le défaut du produit.
  - `tests/media-asr-options.test.cjs`, constante `ffmpegAvailable` (ligne 36) et test « parallel
    assembly keeps frame order, the exact frame pipeline and normalized audio, and measures itself »
    (ligne 37) : déjà `{ skip: !ffmpegAvailable && 'ffmpeg indisponible' }`, mais par le seul `PATH`.
  - `tests/server-ingest-path.test.cjs`, test « normal and legacy capture blocks retain images,
    identity, sequence and source without a masking declaration or note » (ligne 103) : tout le test
    passe par `new RemoteMedia()` (ligne 106), donc par le vrai `ffmpeg`. Il remplace depuis T194
    (`9a040e6`) le test « images cropped or withheld under a TV Lens card… » cité au découpage ; la
    validation pure qui en formait la première moitié est déjà un test à part, « remote payloads are
    still refused when malformed or oversized, without being decoded for the check » (ligne 92).
  - `adapters/system-paths.cjs`, fonction `executable(name, { override, environment, home })` (ligne 6) :
    la résolution du produit — `override`, puis `PATH`, `~/.local/bin`, `/opt/homebrew/bin`,
    `/usr/local/bin`, `/usr/bin`. `adapters/config.cjs` (ligne 19) l'appelle avec `TVLENS_FFMPEG`.
  - `adapters/remote-media.cjs`, constructeur de `RemoteMedia` (ligne 90) : `ffmpeg = 'ffmpeg'` par
    défaut ; le chemin se passe par l'option `ffmpeg`.
  - `adapters/clip-inspector.cjs`, constructeur de `ClipInspector` (ligne 11) : `ffmpeg =
    executable('ffmpeg')` par défaut ; le chemin se passe par l'option `ffmpeg`.
  - `docs/standards.md`, section « Tests » (lignes 37 à 54).

## Périmètre

- À créer : `tests/helpers/tools.cjs` et son test, par exemple `tests/test-tools.test.cjs`.
- À modifier : les cinq fichiers de test cités, pour les tests cités seulement ; `CONTRIBUTING.md` (une
  phrase sur `TVLENS_REQUIRE_TOOLS`, section « Vérifier une modification », ligne 86).
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
  tests passent le chemin résolu à `new RemoteMedia({ ffmpeg })` et au décodeur (`ClipInspector` ou
  `run` de `adapters/clip-inspector.cjs`), au lieu de compter sur le `PATH`.
- Le test dont une partie seulement dépend de `ffmpeg` (`clip-unreadable`) est scindé : la partie sans
  `ffmpeg` reste un test toujours lancé, la partie avec `ffmpeg` devient un test à part, nommé d'après
  son comportement et gardé par `skip`. Chaque assertion d'origine se retrouve dans l'un des deux
  tests ; aucune n'est retirée ni affaiblie. Le test de `server-ingest-path`, qui dépend de `ffmpeg` en
  entier, est gardé par `skip` sans être scindé.
- `tests/video-research.test.cjs` ligne 59 : le chemin du serveur MCP est calculé depuis `__dirname`.
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
   découpage ; il y est encore installé le 19/10 (`/opt/homebrew/bin/ffmpeg`).
5. `cd tests && node --test --test-name-pattern="external bridge" video-research.test.cjs` : le test
   « external bridge authenticates capability… » passe depuis un autre dossier courant. Les autres
   tests du fichier ne sont pas lancés par cette commande.
6. `grep -n "spawnSync('ffmpeg'" tests/*.test.cjs` ne rend plus rien : aucun test ne cherche `ffmpeg`
   par lui-même.
7. `node scripts/check.mjs` est vert ; la mesure `cas_de_test_produit` monte.

## Test d'acceptation attendu

Les cinq tests existants, gardés par `skip`, et les deux tests issus de la scission de `clip-unreadable` ;
un test de l'aide, nommé par exemple « a missing tool skips its tests with a reason, and fails them when
tools are required ». Frontières inchangées : `RemoteMedia.assemble`, le décodeur de clips et la route
d'ingestion devant le vrai `ffmpeg`.

## Hypothèses bloquantes

Aucune décision n'est attendue. Si `ffmpeg` n'est pas installé sur la machine de la session, le critère
4 ne peut pas être observé : verdict BLOQUÉ, sans rien installer. Si scinder un test impose de
dupliquer une mise en place au point de changer ce qu'il prouve : verdict BLOQUÉ, avec le test en cause.
Si, au critère 2, un sixième test de ces fichiers échoue ou doit être sauté sous le chemin forcé, il
lance `ffmpeg` lui aussi : verdict BLOQUÉ, avec son nom, car le compte des tests concernés est à revoir.

## Journal

- 19/10, orchestrateur : rouvert sur décision du propriétaire (sélection du tri d'Astra) ; sources mises à
  jour à `1178657` (inchangées à `11e601f`) : lignes des cinq fichiers, de `RemoteMedia` et de
  `docs/standards.md` ; le test cité de `server-ingest-path` a été remplacé par T194 et dépend de `ffmpeg`
  en entier, sa validation pure est déjà un test à part : seul `clip-unreadable` reste à scinder, le
  compte de cinq tests sautés ne change pas ; défaut `executable('ffmpeg')` de `ClipInspector` ajouté aux
  sources ; mesure `cas_de_test` scindée par T196, d'où `cas_de_test_produit` au critère 7. Bloqueurs
  revus : T145 retiré (file parquée, rouverte par le propriétaire) ; T294 ajouté (passe après la file en
  cours).
