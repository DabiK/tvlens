---
id: T304
titre: Keep a sound-only passage sound-only when it is recovered from disk
statut: a-faire
bloque_par: T299, T306
adr: non
installe: non
harnais: non
supprime_tests: non
niveau: standard
---

## Ce que le ticket livre

Un passage son seul dont l'état n'a pas été sauvegardé avant une coupure revient, à la réouverture, comme un passage son
seul : images absentes, perte de capture comptée, aucun rejeu servi comme une vidéo. Aujourd'hui il revient comme un
passage avec images rejouable.

## Sources

- Réserve de la relecture de T299 (`.harness-state/tickets/T299/relecture-1.md`, constat 2, reporté en relecture 2) : la
  déclaration `media` n'est pas gardée sur disque ; `recoveredPassage` rend `available: true` sans
  `mediaReason: 'images-absent'`, et la route de rejeu servirait comme vidéo un clip qui ne contient que de l'Opus.
- Code à `7c9e3b1` :
  - `adapters/local-store.cjs:50-56` : le JSON du passage garde `frames`, `audio`, `startMs`, `endMs`, pas la
    déclaration ; `interval()` (`:88-94`) rend `{ startMs, endMs, hasAudio }` ;
  - `core/session.cjs:26` : `recoveredPassage` pose `available: true` ; `capturedMedia` (`:35-37`) donne la forme d'un
    passage son seul (`available: false`, `mediaReason: IMAGES_ABSENT`, `hasImages: false`, `visionStatus: 'absent'`) ;
  - `adapters/session-library.cjs:117-121` : la récupération passe l'intervalle à `recoveredPassage` ;
  - `server/session-routes.cjs:30` : un passage sans média rejouable reçoit `unavailableMedia(mediaReason)`.
- ADR 0062 (passages déclarés son seul) ; règle déjà retenue : un passage sans image n'est jamais déduit de `frames: []`,
  seule la déclaration compte.
- Tests : `tests/session-durable.test.cjs:82` (réouverture d'un passage son seul sauvegardé), `:522` (session coupée,
  passages remis en place), `tests/archive-compat.test.cjs:453`, `:486` (archives figées).

## Périmètre

- À modifier : `adapters/local-store.cjs` (écrire la déclaration avec le passage, la relire dans `interval()`),
  `core/session.cjs` (`recoveredPassage` reprend la forme de `capturedMedia` pour un passage déclaré sans vidéo),
  leurs tests.
- Un fichier sans déclaration (archives existantes, passages avec images) se relit comme aujourd'hui.
- La perte `imagesAbsent` compte le passage remis en place, comme un passage son seul sauvegardé.
- À ne pas toucher : le format de `session.json`, la capture TV, le serveur.

## Critères d'acceptation

1. Session coupée après un passage son seul non sauvegardé : à la réouverture, le passage a `available: false`,
   `mediaReason: 'images-absent'`, `hasImages: false`, et la perte `imagesAbsent` le compte. Le test échoue avant la
   correction.
2. Un passage avec images non sauvegardé revient comme aujourd'hui (`available: true`).
3. Les archives figées de `tests/fixtures/archives/` se relisent sans modification des tests existants.
4. `node scripts/check.mjs`.

## Test d'acceptation attendu

`tests/session-durable.test.cjs` : une session coupée après un passage son seul, rouverte avec ce passage en son seul.

## Hypothèses bloquantes

Aucune décision n'est attendue.

## Journal

- 19/10, orchestrateur : ticket ouvert depuis la relecture de T299 (constat hors périmètre que la boucle n'a pas extrait
  en réserve), rangé dans le chantier « son seul » avant T220 et T293.
