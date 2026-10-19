---
id: T298
titre: Let a declared sound-only passage skip vision and count its missing image
statut: a-faire
bloque_par: T297
adr: oui
installe: non
harnais: non
supprime_tests: non
niveau: sensible
---

## Ce que le ticket livre

Le cœur accepte un passage **déclaré** « son seul » : la voie audio le transcrit, la voie vision ne s'exécute pas,
le passage devient prêt après sa transcription, et l'absence d'image est comptée comme une perte nommée, sauvegardée
et relue à la réouverture. Un passage sans image non déclaré garde le comportement actuel.

## Sources

- Décision du propriétaire, le 19/10 : analyser le son seul quand l'image est noire ; chantier en premier.
- Choix de l'orchestrateur, le 19/10, dans la règle du propriétaire (options les plus simples, à corriger par le
  propriétaire avant traitement s'il le souhaite) :
  - déclaration explicite par le bloc : une vingtaine de tests du cœur ingèrent `frames: []` et attendent que la
    vision tourne (`split-perception`, `session-latency`, `architecture-f08`, `session-events`, `session-durable`,
    `living-recap-runtime`, `watch-session-ending`, `surveillance-runtime`, `session-providers`…) ;
  - un passage son seul transcrit est `ready` : il compte comme analysé et entre dans le résumé ;
  - la perte est une perte de capture, sur le modèle de `losses.videoUnreadable`, pas une nouvelle cause de
    `PassageLost` : l'ensemble fermé de l'ADR 0050 ne change pas.
- Code (relevé du 19/10 ; T225 modifie `core/session.cjs` : relire les lignes) :
  - `core/ports.cjs:7` (`CapturedSegment`, clip et images), `:36` (bail), `:75-78` (`audioStatus`, `visionStatus`) ;
  - `core/session.cjs` : `capturedModalities` (`:25-31`, Map privée non sauvegardée `:40`, `:178`), persistance de
    `hasAudio` (`:157`) et `mediaReason` (`:158-162`), précédent `losses.videoUnreadable` (`:182-185`, restauration
    `:277-278`), `LANE_LOSSES` (`:13-16`), `#updateLane` (`:98-105`), piège de restauration (`:258-264`), miniature
    (`:199-209`) ;
  - `core/memory/lanes.cjs` : `#toVision` (`:122-139`, saut `hasMedia → expired` en `:124-128` comme modèle), appel
    après l'audio (`:179`) ; seule la vision met `ready` (`:289`), pas `#acceptAudio` (`:189-204`) ; garde de
    vocabulaire `tests/architecture.test.cjs:527-533` : la cause arrive par un port générique ;
  - `core/memory/memory-view.cjs` (`historicalModalities` `:26-30`, `availability.images` `:54`,
    `analyzedThroughMs` `:72`), `core/memory/coverage.cjs:14-15`, `core/memory/ports.cjs:4-9` (`MediaReason`).
- ADR : 0046 (modalités et `MediaReason`), 0050 (causes de `PassageLost`), 0051 (politiques des voies), 0047
  (`session.json` version 1, ajout compatible), 0008.
- Tests : `tests/memory-view.test.cjs:382-399` (modalités non sauvegardées, `unknown` à la réouverture),
  `tests/session-events.test.cjs`, `tests/split-perception.test.cjs`, `tests/memory-lanes.test.cjs`,
  `tests/session-durable.test.cjs`.

## Périmètre

- À modifier : `core/ports.cjs`, `core/session.cjs`, `core/memory/lanes.cjs`, `core/memory/memory-view.cjs`,
  `core/memory/coverage.cjs`, `core/memory/ports.cjs`, leurs tests ; une ADR nouvelle qui complète 0046 (absence
  d'image déclarée et sauvegardée) sans contredire 0050.
- Le segment capturé peut porter une déclaration explicite de ses médias (par exemple `media: { video: false,
  audio: true }`). Déclarée sans vidéo : pas d'appel de vision, pas de miniature tentée, `visionStatus` dit l'absence
  (sans erreur ni nouvel essai), le passage passe `ready` à la fin de l'audio, et une perte nommée
  (`losses.imagesAbsent`, créée seulement quand elle sert) est comptée, sauvegardée et relue.
- La disponibilité des images d'un passage est sauvegardée pour ce cas : la réouverture dit « absentes », pas
  « inconnues ».
- Un passage déclaré sans son reste refusé : le son est obligatoire en son seul.
- À ne pas toucher : le fil (`adapters/remote-media.cjs`, serveur), la capture TV, les questions (T300).

## Critères d'acceptation

1. Un passage déclaré son seul : aucun appel de vision ; transcription faite ; statut `ready` ; `losses.imagesAbsent`
   vaut 1 ; aucun `PassageLost` de vision. Le test échoue avant la correction.
2. Sauvegarde puis réouverture : la perte et l'absence d'images sont relues telles quelles.
3. Un passage avec `frames: []` sans déclaration : comportement inchangé ; les tests cités passent sans modification.
4. Un passage déclaré son seul sans son : refusé, avec un message nommé.
5. `node scripts/check.mjs`.

## Test d'acceptation attendu

`tests/split-perception.test.cjs` ou un fichier du même domaine : un passage déclaré son seul de l'ingestion à la
réouverture.

## Hypothèses bloquantes

Aucune décision n'est attendue.

## Journal

- 19/10, propriétaire : le chantier « son seul » (T297 à T302) passe en tête de file, après T225.
