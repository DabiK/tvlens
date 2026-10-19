---
id: T298
titre: Let a declared sound-only passage skip vision and count its missing image
statut: termine
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
- 19/10, Codex : exploration consignée dans `.harness-state/tickets/T298/exploration.md` ; déclaration explicite,
  absence sauvegardée et lecture générique par les voies retenues, sans écart prévu.
- 19/10, Codex : `node --test --test-name-pattern='declared sound-only capture' tests/split-perception.test.cjs` :
  rouge (appel vision indu), puis 1/1 vert ; ADR 0062 rédigée.
- 19/10, Codex : `node --test --test-name-pattern='a declared sound-only passage reopens' tests/session-durable.test.cjs` :
  rouge (perte absente à la réouverture), puis 1/1 vert sur archive réelle.
- 19/10, Codex : `node --test --test-name-pattern='a declared sound-only capture requires sound' tests/split-perception.test.cjs` :
  rouge (refus absent), puis 1/1 vert. `node_modules/.bin/eslint --prune-suppressions core/session.cjs` :
  code 0, un ternaire imbriqué gelé retiré.
- 19/10, Codex : `node --test --test-name-pattern='audio overload sheds declared sound-only' tests/split-perception.test.cjs` :
  rouge (perte vision inventée), puis 1/1 vert.
- 19/10, Codex : `node --test --test-name-pattern='sound-only transcription stays unanalysed' tests/split-perception.test.cjs` :
  un échec sur le résultat audio signalé, puis 2/2 verts ; le rejet levé était déjà conforme.
- 19/10, Codex : `node --test --test-name-pattern='successful sound-only transcription clears' tests/split-perception.test.cjs` :
  rouge (ancienne erreur conservée), puis 1/1 vert, source de résumé vérifiée.
- 19/10, Codex : `node scripts/check.mjs --changed` : vert, 55/55 tests JS. Premier `node scripts/check.mjs` :
  2 994/2 995 tests JS verts et 54 tests Python verts ; seul échec : lien ADR manquant dans l’index d’architecture.
  Ajout documentaire consigné dans `ecarts.md`, puis `node --test tests/documentation-index.test.cjs` : 12/12 verts.
- 19/10, Codex : `node --test --test-name-pattern='sound-only audio drops publish' tests/session-events.test.cjs` :
  rouge (statut terminal sans nouvelle révision), puis 1/1 vert ; aucune perte vision ajoutée.
  Sorties conservées dans `.harness-state/tickets/T298/`.
- 19/10, Codex : contrôle final `node scripts/check.mjs --changed` vert, 84/84 tests JS ;
  `node scripts/check.mjs` vert, 2 996/2 996 tests JS dans 154 fichiers et 54 tests Python.
  `git diff --check` réussi. Verdict `TERMINÉ` remis à la boucle, sans commit ni push.
- 19/10, Codex : reprise après `relecture-1.md` ; les deux constats mineurs sont acceptés.
  Test de fin pendant la lecture média son seul prévu avant correction ; exploration et écarts mis à jour.
- 19/10, Codex : `node --test --test-name-pattern='ending during a sound-only media read' tests/watch-session-ending.test.cjs` :
  rouge observé (révision 2 au lieu de 1), puis 1/1 vert ; aucun appel fournisseur ni événement supplémentaire.
  Le littéral d’ingestion est découpé ; aucune ligne ajoutée de `core/session.cjs` ne dépasse 160 caractères.
- 19/10, Codex : `node scripts/check.mjs --changed` vert après correction, 95/95 tests JS dans quatre fichiers ;
  `git diff --check` réussi. Sorties préfixées `correction-1-` dans le dossier d’état.
- 19/10, Codex : `node scripts/check.mjs` vert après correction de relecture : 2 997/2 997 tests JS
  dans 154 fichiers et 54 tests Python ; règles, format, lint, gel et cliquet verts.
  Nouveau verdict `TERMINÉ` remis à la boucle ; les deux constats mineurs sont corrigés, sans commit ni push.

### Réserves à la clôture

- .harness-state/tickets/T298/relecture-2.md : `core/latency-trace.cjs:10` (hors périmètre, réserve reportée de la relecture 1)
  - **Problème :** `readyAfterCloseMs` ne se calcule qu'à partir de `visionPublishedMs`. Un passage son seul `ready` n'a jamais cette valeur : sa latence « prêt après fin du bloc » reste `null`, et `snapshot().latency` ne le compte pas.
  - **Attendu :** pour un passage sans image, utiliser `transcriptPublishedMs`. Le fichier ne fait pas partie de ce que le ticket autorise à modifier : le constat reste en réserve pour la session.
- .harness-state/tickets/T298/relecture-2.md : **Écart accepté, index de l'ADR (`docs/architecture.md`)** : la décision de la relecture 1 est maintenue. La correction ne touche pas à ce point.
