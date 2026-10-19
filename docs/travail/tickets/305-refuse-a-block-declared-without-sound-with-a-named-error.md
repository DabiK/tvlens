---
id: T305
titre: Refuse a block declared without sound with a named error
statut: termine
bloque_par: T299, T306
adr: non
installe: non
harnais: non
supprime_tests: non
niveau: standard
---

## Ce que le ticket livre

Un bloc envoyé à la TV qui déclare `media: { audio: false }` reçoit un refus 400 nommé, avant toute préparation, au lieu
d'une erreur 500 `internal-error` journalisée comme imprévue.

## Sources

- Réserve de la relecture de T299 (`.harness-state/tickets/T299/relecture-1.md`, constat 3, reporté en relecture 2) : un
  bloc avec images qui déclare `audio: false` sans `video: false` passe `validateRemote`, est assemblé, puis le cœur le
  refuse par `TVLENS_CAPTURE_AUDIO_REQUIRED`, absent de `PUBLIC_CODES` : réponse 500. Aucun client réel n'envoie ce
  champ aujourd'hui.
- Code à `7c9e3b1` :
  - `adapters/remote-media.cjs:35-36`, `:51-52` : `audio === false` n'est refusé que pour un bloc déclaré son seul ;
  - `core/session.cjs:156-157` : refus `TVLENS_CAPTURE_AUDIO_REQUIRED` de toute déclaration `audio: false` ;
  - `server/http.cjs:57-78` (`PUBLIC_CODES`), `:79-81` (`APPLICATION_CODES`).
- Tests : `tests/server-ingest-path.test.cjs:150` (son manquant ou refusé dans un bloc son seul), `:170`,
  `tests/split-perception.test.cjs:69-72` (refus du cœur).

## Périmètre

- À modifier : `adapters/remote-media.cjs` (refuser toute déclaration `audio: false` par
  `TVLENS_MEDIA_BLOCK_INVALID`, message nommé), `server/http.cjs` (le code du cœur `TVLENS_CAPTURE_AUDIO_REQUIRED` a
  une réponse publique 400, pour qu'aucun chemin ne finisse en 500), leurs tests.
- À ne pas toucher : le cœur, la capture TV, le contrat `runtime/segment-contract.cjs`.

## Critères d'acceptation

1. Bloc avec images déclaré `audio: false` : 400 `invalid-media-block` avant préparation, aucun fichier temporaire
   laissé. Le test échoue avant la correction.
2. `TVLENS_CAPTURE_AUDIO_REQUIRED` levé par le cœur derrière la route : réponse 400 nommée, pas 500.
3. Les tests existants cités passent sans modification de leurs assertions.
4. `node scripts/check.mjs`.

## Test d'acceptation attendu

`tests/server-ingest-path.test.cjs` : un bloc avec images déclaré sans son, refusé en 400.

## Hypothèses bloquantes

Aucune décision n'est attendue.

## Journal

- 19/10, orchestrateur : ticket ouvert depuis la relecture de T299 (constat hors périmètre que la boucle n'a pas extrait
  en réserve), rangé dans le chantier « son seul » avant T220 et T293.
- 19/10, Codex : exploration terminée ; validation avant admission confirmée, refus audio du cœur absent de la
  traduction HTTP. Périmètre confirmé sans écart ; détails dans `.harness-state/tickets/T305/exploration.md`.
- 19/10, Codex : rouge observé avec `node --test --test-name-pattern='HTTP ingestion refuses a block with images declared without sound' tests/server-ingest-path.test.cjs`
  (500 au lieu de 400 ; `red-validation.log`). Correction minimale de `validateRemote`, puis même commande verte :
  1/1 (`green-validation-corrected.log`). Le premier essai vert révélait une assertion de banc incorrecte : le dossier
  média n'existe pas avant stockage ; son absence est désormais vérifiée explicitement (`green-validation.log`).
- 19/10, Codex : `node --test --test-name-pattern='HTTP ingestion exposes a core sound requirement refusal' tests/server-ingest-path.test.cjs` :
  rouge 500 au lieu de 400 (`red-core-refusal-corrected.log`), puis vert 1/1 après traduction de la constante du cœur
  (`green-core-refusal.log`). Le premier banc sans audio était arrêté par le contrat du runtime
  (`red-core-refusal.log`) ; la doublure déclare maintenant `audio: false` avec images, pour exercer le vrai cœur.
- 19/10, Codex : `node --test --test-concurrency=1 tests/remote-media.test.cjs tests/server-ingest-path.test.cjs tests/split-perception.test.cjs` :
  77/77 verts, assertions existantes conservées (`regression.log`). `node scripts/check.mjs --changed` : vert,
  règles, format, lint, gel et cliquet validés, 24/24 tests du fichier modifié (`check-changed.log`).
- 19/10, Codex : `node scripts/check.mjs` : ROUGE (`check-full.log`). Règles, format, lint, gel et cliquet verts ;
  Python 71/71 verts. JavaScript : 2924 réussites, aucune assertion en échec, mais 12 suites annulées à partir de
  `video-file-source` avec « Promise resolution is still pending but the event loop has already resolved ».
  Diagnostic isolé `node --test tests/video-file-source.test.cjs` : 25/25 verts (`diagnostic-video-file-source.log`) ;
  ce diagnostic ne remplace pas le contrôle complet rouge et sa cause reste indéterminée.
- 19/10, Codex : diagnostic des onze autres suites annulées avec
  `node --test --test-concurrency=1 tests/video-research.test.cjs tests/viewing-actions.test.cjs tests/viewing-features.test.cjs tests/wait-helpers.test.cjs tests/watch-loop-render.test.cjs tests/watch-loop.test.cjs tests/watch-session-ending.test.cjs tests/whisper-diagnostics.test.cjs tests/window-mode.test.cjs tests/wire-contract.test.cjs tests/write-pruned-archive.test.cjs` :
  106/106 verts (`diagnostic-cancelled-suites.log`). `git diff --check` : vert. Verdict PARTIEL : correctif livré,
  mais critère 4 non rempli ; l'annulation globale reste inexpliquée. Aucun contrôle rouge écarté ni relancé pour
  obtenir un vert ; aucun changement au harnais.
- 19/10, Codex, reprise : lecture de `echec-1.txt`, du journal et des preuves ; correctif et assertions conservés.
  Diagnostic du lanceur Node prévu avec toute la liste séquentielle, sortie complète et observation de SIGINT,
  SIGTERM et `beforeExit` dans le dossier d'état, sans modification du harnais. Les sources intégrées de Node
  `v24.12.0` montrent que le message d'annulation précédent peut aussi venir d'un signal d'arrêt.
- 19/10, Codex, reprise : `node .harness-state/tickets/T305/diagnose-suite.cjs` : code 0,
  3 031/3 031 tests JavaScript réussis sur les 154 fichiers séquentiels, aucune annulation ni saut (442,350 s).
  L'observateur du processus parent ne relève aucun SIGINT/SIGTERM et relève `beforeExit(0)`, puis `exit(0)`.
  Configuration et sortie intégrale conservées (`diagnostic-launch.json`, `diagnostic-result.json`,
  `diagnostic-full-js.log`, `runner-events.jsonl`). L'incident initial reste inexpliqué et consigné en réserve ;
  contrôle réglementaire sans observateur prévu pour cette reprise, sans nouvelle modification produit.
- 19/10, Codex, reprise : `node scripts/check.mjs --changed` : code 0, règles, format, lint, gel,
  cliquet et 24/24 tests verts (`reprise-check-changed.log`). Puis `node scripts/check.mjs` sans observateur :
  code 0, tous les contrôles qualité verts, 3 031/3 031 tests JavaScript sur 154 fichiers et 71 tests Python
  réussis en 63,896 s (`reprise-check-full.log`). `git diff --check` : code 0. Verdict TERMINÉ : les quatre
  critères disposent de preuves ; réserve conservée sur la cause inconnue de l'annulation du premier contrôle.
  Aucun changement supplémentaire du produit, des assertions ou du harnais ; aucun commit ni push.

### Réserves à la clôture

- Réserve : l'annulation de douze fichiers lors du premier contrôle complet n'a pas été reproduite par le diagnostic global ni par le contrôle réglementaire de reprise ; sa cause reste inconnue. Le rapport initial rouge est conservé dans check-full.log et décrit dans diagnostic-controle.md ; il n'est pas présenté comme un incident corrigé.
- .harness-state/tickets/T305/relecture-1.md : 1. Le premier contrôle complet a été annulé, et on ne sait pas pourquoi — `hors périmètre`

  **Où :** `.harness-state/tickets/T305/check-full.log:7-35`

  **Ce qui ne va pas :**
  - Le premier `node scripts/check.mjs` est sorti en code 1. Aucune assertion n'a échoué, mais les 12 derniers fichiers (de `video-file-source` à `write-pruned-archive`) ont été annulés d'un coup, avec « Promise resolution is still pending but the event loop has already resolved ».
  - La cause n'est pas trouvée. La consigne de `CLAUDE.md` (« un échec … s'explique avant d'être écarté ») n'est donc tenue qu'à moitié.

  **Pourquoi je ne le relie pas au diff :**
  - Les 12 fichiers restants ont été annulés en même temps. Cela désigne le processus parent du lanceur, pas un test particulier.
  - `video-file-source` passe seul : 25/25.
  - Les 11 autres fichiers passent en séquentiel : 106/106.
  - Ce fichier appelle bien `validateRemote`, mais ses blocs n'ont aucun champ `media`, donc la nouvelle règle ne s'y applique pas.
  - Deux exécutions complètes ensuite donnent 3 031/3 031 : l'une avec un observateur des signaux du processus, l'autre réglementaire. Il s'agit d'un diagnostic suivi d'un contrôle, pas de relances jusqu'à obtenir un vert.

  **Ce qui est attendu :** garder ce point en réserve sur le lanceur de tests (`scripts/check.mjs`, qui fait partie du harnais) et le rouvrir à la prochaine annulation du même type.
- .harness-state/tickets/T305/relecture-1.md : 2. L'ADR 0042 ne décrit pas encore la nouvelle règle — `hors périmètre`

  **Où :** `docs/adr/0042-le-fil-v1-conserve-les-comportements-lus-par-les-clients-tv.md:109-112`

  **Ce qui ne va pas :** l'ADR ne mentionne le refus de `media.audio === false` que pour un bloc son seul. Désormais, toute déclaration `audio: false` est refusée en 400 `invalid-media-block`, y compris pour un bloc avec images. Le fil peut aussi rendre le nouveau code public `capture-audio-required`.

  **Ce qui est attendu :** une phrase dans l'ADR, dans un ticket qui a le droit de toucher aux docs. T305 porte `adr: non` et ne liste que le code et les tests dans « À modifier ».
