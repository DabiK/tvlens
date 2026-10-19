---
id: T305
titre: Refuse a block declared without sound with a named error
statut: a-faire
bloque_par: T299
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
