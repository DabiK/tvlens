---
id: T304
titre: Keep a sound-only passage sound-only when it is recovered from disk
statut: termine
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
  `adapters/session-library.cjs` (ajout de l'orchestrateur, 19/10 : seule la bibliothèque distingue un passage récupéré),
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

- 19/10, Codex : exploration terminée (store, récupération, restauration, ADR 0062/0047). Le compteur des seules pertes récupérées demande un ajout dans session-library.cjs ; extension limitée soumise au propriétaire. État initial et diagnostic dans `.harness-state/tickets/T304/exploration.md`.
- 19/10, Codex : rouge observé avec `node --test --test-name-pattern='unsaved sound-only passages' tests/session-durable.test.cjs` : passage récupéré annoncé rejouable (sortie `test-red.log`). Après conservation de media et réutilisation de capturedMedia, même commande : rouge sur le seul compteur (`1 !== 2`, `test-counter-red.log`).
- 19/10, Codex : `node --test tests/archive-compat.test.cjs tests/adapters.test.cjs` : 28 tests réussis, aucune modification du corpus ni des tests existants (`archive-compat.log`).
- 19/10, Codex : `node scripts/check.mjs --changed` : ROUGE, règles/format/lint/gel/cliquet réussis ; 28 tests réussis sur 29, seul échec sur imagesAbsent (`1 !== 2`). Complément limité proposé dans `.harness-state/tickets/T304/complement-propose.diff`, non appliqué en attente de la décision de périmètre.
- 19/10, Codex : `node scripts/check.mjs` : ROUGE ; règles, format, lint, gel, cliquet réussis ; 3 028 tests JS réussis sur 3 029 (154 fichiers), seul échec imagesAbsent ; 71 tests Python réussis (`check-full.log`). `git diff --check` réussi. Verdict `BLOQUÉ` dans `.harness-state/tickets/T304/verdict.json` : décision de périmètre toujours en attente, aucun changement de session-library.cjs. Aucun commit ni push.
- 19/10, orchestrateur, propriétaire absent : extension à `adapters/session-library.cjs` admise (le fichier figurait
  dans les sources ; le cadrage du ticket l'avait oublié). Complément de Codex (`complement-propose.diff`) appliqué tel
  quel, commentaires de récupération mis à jour (`session-library.cjs`, `local-store.cjs`) à la demande de la relecture.
- 19/10, orchestrateur : `node --test --test-name-pattern='unsaved sound-only passages' tests/session-durable.test.cjs`
  1/1 vert ; `node scripts/check.mjs` vert, 3 029 / 3 029 tests JS et 71 tests Python (`integration-check-full.log`) ;
  `node scripts/check.mjs --changed` vert après la correction des commentaires. Relecture indépendante : un constat
  mineur corrigé, deux hors périmètre ci-dessous. Intégré hors boucle.

### Réserves à la clôture

- Relecture de l'orchestrateur : `server/session-routes.cjs:16-21`, le rejeu d'un passage son seul répond 410
  « Média expiré. » (`media-expired`) alors que le son est là : ticket T308.
- Relecture de l'orchestrateur : la règle « `hasImages === false` compte une perte `imagesAbsent` » vit dans
  `core/session.cjs:200` et `adapters/session-library.cjs:128` ; une fonction de `core/` qui complète un état sauvegardé
  avec les passages récupérés la garderait en un seul endroit (déplacement structurel, sans urgence).
