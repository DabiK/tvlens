---
id: T299
titre: Accept a declared sound-only block on the server
statut: termine
bloque_par: T298
adr: non
installe: non
harnais: non
supprime_tests: non
niveau: sensible
---

## Ce que le ticket livre

Le serveur accepte un bloc de capture qui déclare « son seul » : sans image, avec son obligatoire. Il en fabrique un
clip audio rejouable et le remet au cœur comme passage son seul (T298). Un bloc sans image et sans déclaration reste
refusé comme aujourd'hui.

## Sources

- Décision du propriétaire, le 19/10 : analyser le son seul quand l'image est noire ; chantier en premier.
- Choix de l'orchestrateur, le 19/10 : la déclaration voyage dans le bloc (un champ facultatif, précédent de
  `overlay` ignoré en `adapters/remote-media.cjs:149` et ADR 0038) ; le passage garde un clip, audio seul en WebM
  Opus, pour ne toucher ni au stockage ni aux baux (`adapters/local-store.cjs:37-43`, `:53`, `:105-117`).
- Code à `c35cd02` :
  - `server/ingest-routes.cjs` : `validateRemote(body)` (`:9`), empreinte (`:22-23`), `media.assemble` (`:41`),
    `runtime.ingest` (`:42`) ;
  - `adapters/remote-media.cjs` : images obligatoires (`:26-27`), ordre et cadrage (`:28-41`), son facultatif (`:42`,
    `:107`), clip fabriqué à partir des images (`:122-131`, avec zéro image `:127` écrirait `file '-1.jpg'`) ;
  - `server/http.cjs:75-76` : `TVLENS_MEDIA_BLOCK_INVALID` en 400 `invalid-media-block` ;
  - `adapters/session-thumbnails.cjs:25-29` : miniature refusée sans image ;
  - contrat de segment de T297 (`runtime/segment-contract.cjs`).
- Un ancien serveur répond 400 `invalid-media-block` à un bloc son seul ; la TV le compte `deliveryRejected`
  (`tv/transport.py:79`, `:88-91`) : ADR 0042, ajout au fil dans l'ordre tests, serveur, client.
- Tests : `tests/remote-media.test.cjs:63`, `tests/server-ingest-path.test.cjs:166-195`,
  `tests/wire-contract.test.cjs:230-260` (cas `:246`), `tests/local-stream-replay.test.cjs:337`.

## Périmètre

- À modifier : `adapters/remote-media.cjs`, `runtime/segment-contract.cjs`, `server/ingest-routes.cjs` si besoin, leurs
  tests, et la documentation du fil si elle décrit le bloc (`docs/` ; `tv/` n'est pas touché ici).
- Un bloc qui déclare son seul : zéro image exigée, son exigé et décodable ; clip WebM audio seul ; passage remis au
  cœur avec la déclaration de T298 ; aucune miniature tentée.
- Un bloc sans image et sans déclaration : refus actuel, même code et même message.
- Un bloc qui déclare son seul mais porte des images : refus nommé (déclaration incohérente).
- À ne pas toucher : la capture TV (T301), le Mac, `core/` hors de ce que T298 expose.

## Critères d'acceptation

1. Par le chemin HTTP réel (`tests/server-ingest-path.test.cjs`), un bloc son seul est accepté, son clip audio se
   relit, et le passage du cœur est déclaré son seul. Le test échoue avant la correction.
2. Les refus existants pour un bloc sans image non déclaré passent sans modification.
3. Son seul sans son, ou son seul avec images : refus 400 avec un code nommé.
4. `node scripts/check.mjs`.

## Test d'acceptation attendu

`tests/server-ingest-path.test.cjs` : un bloc son seul, du corps HTTP au passage du cœur.

## Hypothèses bloquantes

Aucune décision n'est attendue.

## Journal

- 19/10, propriétaire : le chantier « son seul » (T297 à T302) passe en tête de file, après T225.
- 19/10, Codex : exploration consignée dans `.harness-state/tickets/T299/exploration.md`, aucun écart prévu.
  T298 fournit déjà la déclaration `media.video: false` ; les deux validations et l'assemblage distant restent à adapter.
  Le clip sera relu comme audio depuis le store existant ; aucune route vidéo, capture TV ou capture Mac n'est modifiée.
- 19/10, Codex : `node --test --test-name-pattern='HTTP ingestion keeps a declared sound-only passage' tests/server-ingest-path.test.cjs`
  rouge observé sur l'assertion d'acceptation (`400 invalid-media-block`, `acceptance-red.log`), puis vert : 1 test réussi
  (`acceptance-green.log`). Le vrai FFmpeg décode une seconde de son Opus, sans piste vidéo ; le cœur publie le passage
  prêt avec vision absente, sans vision ni miniature. Le rejeu du même bloc reste un doublon.
- 19/10, Codex : son obligatoire, rouge observé dans `sound-required-red.log` (contrat assemblé trop permissif,
  absence de son arrivée jusqu'à FFmpeg), puis 3 tests verts dans `sound-required-green.log` avec
  `node --test --test-concurrency=1 --test-name-pattern='missing or denied sound|requires nonempty sound|HTTP ingestion keeps a declared sound-only passage' tests/server-ingest-path.test.cjs tests/segment-contract.test.cjs`.
  Le contrôle rapide a signalé une complexité de 16 dans `validateCapturedSegment` ; validation audio extraite
  avant le vert, sans ajout de suppression ni changement du harnais.
- 19/10, Codex : images incohérentes, 2 rouges sur les assertions de refus (acceptation 200 et absence d'exception),
  puis 2 verts avec `node --test --test-concurrency=1 --test-name-pattern='images contradicting|requires an empty array of frames' tests/server-ingest-path.test.cjs tests/segment-contract.test.cjs`
  (`incoherent-images-red.log`, `incoherent-images-green.log`).
- 19/10, Codex : `node --test --test-name-pattern='requires decodable samples' tests/server-ingest-path.test.cjs`
  rouge observé : WAV sans échantillon accepté en 200 (`decodable-sound-red.log`). Normalisation FFmpeg du son seul
  avec refus de sortie vide ; puis 7 tests verts avec
  `node --test --test-name-pattern='requires decodable samples|HTTP ingestion keeps a declared sound-only passage' tests/server-ingest-path.test.cjs`
  (`decodable-sound-green.log`). Les refus rendent leur admission ; un nouvel envoi valide est accepté.
- 19/10, Codex : `node scripts/check.mjs --changed` vert, code 0 : règles, format, lint, gel et cliquet verts,
  29 tests réussis dans les 2 fichiers de tests modifiés (`check-changed.log`). Les tests existants de refus
  sans image non déclaré sont conservés sans modification. Documentation du champ facultatif ajoutée à l'ADR 0042.
- 19/10, Codex : `node scripts/check.mjs` vert, code 0 : règles, format, lint, gel et cliquet verts,
  3 008 tests JavaScript réussis dans 154 fichiers, 54 tests Python réussis (`check-full.log`).
  `git diff --check` vert, code 0. Verdict `TERMINÉ` déposé dans `.harness-state/tickets/T299/verdict.json`,
  sans réserve ; relecture et intégration laissées à la boucle, aucun commit ni push.
- 19/10, Codex, reprise après relecture 1 : rapport, ticket, journal, écarts, statut et diff relus.
  Le constat mineur de nommage est accepté : renommage prévu de `clipArguments` en `prepareClipCommand`, sans
  changement des arguments FFmpeg. Tests publics existants exécutés avant et après ce nettoyage ; aucun test du
  nom privé ni du texte source n'est ajouté. Aucun écart ni contestation ; les constats hors périmètre restent à la boucle.
- 19/10, Codex, correction 1 : `node --test --test-concurrency=1 tests/remote-media.test.cjs tests/server-ingest-path.test.cjs`
  vert avant puis après renommage : 48 tests réussis à chaque exécution (`correction-1-tests-before.log`,
  `correction-1-tests-after.log`). Seuls la déclaration de l'aide et son appel sont renommés ; les arguments FFmpeg
  et la préparation de `frames.txt` sont conservés. `node scripts/check.mjs --changed` vert, code 0 : 29 tests
  réussis dans 2 fichiers et toutes les gardes vertes (`correction-1-check-changed.log`). `git diff --check` vert.
- 19/10, Codex, correction 1 : `node scripts/check.mjs` vert, code 0 : toutes les gardes vertes,
  3 008 tests JavaScript réussis dans 154 fichiers et 54 tests Python réussis (`correction-1-check-full.log`).
  `git diff --check` vert, code 0. Nouveau verdict `TERMINÉ`, sans réserve propre ni contestation ;
  constat mineur corrigé, relecture et intégration laissées à la boucle, aucun commit ni push.

### Réserves à la clôture

- .harness-state/tickets/T299/relecture-2.md : Nombre de constats discordant : CONSTATS annonce 2 hors périmètre ; 0 constat(s) extrait(s). Consulter le rapport pour l'ensemble des constats hors périmètre.
