---
id: T297
titre: Write the captured segment contract once with named limits
statut: a-faire
bloque_par:
adr: non
installe: non
harnais: non
supprime_tests: non
niveau: standard
---

## Ce que le ticket livre

Les exigences qu'un bloc capturé doit tenir (clip, nombre d'images, horodatage, tolérance de 3 000 ms) sont écrites
une seule fois, avec des bornes nommées, et lues par le Mac, le serveur et le runtime. Aucun comportement ne change :
c'est le premier temps du chantier « son seul », qui changera ensuite une seule règle au lieu de quatre.

## Sources

- Décision du propriétaire, le 19/10 : analyser le son seul quand l'image d'une application est noire (Netflix),
  chantier traité en premier.
- Sonde du 19/10 (dossier d'essai `2026-10-19-son-netflix`) : sur Netflix, capture d'écran noire à 100 %, son présent.
- `docs/audit-architecture.md` :
  - D8 (`:604-623`) : `runtime/segment-contract.cjs`, `SEGMENT_LIMITS`, `validateCapturedSegment(input, { now })` ;
    « Sans image reste refusé : on écrit la règle, on ne l'assouplit pas » (ce ticket ne l'assouplit pas) ;
  - B11 (`:382-402`) : « Une source audio seule touche cinq couches ».
- Code (relevé du 19/10, avant l'intégration de T225, qui modifie `runtime/session-runtime.cjs` : relire les lignes) :
  - `runtime/session-runtime.cjs`, `validateSegment` (`:283-317` à `c35cd02`) : clip non vide, 1 à 8 images, tolérance
    de 3 000 ms ;
  - appelants : `runtime/capture-intake.cjs:3`, `:106` ; `app/main.cjs:8`, `:472` ;
  - autres tolérances de 3 000 ms : `server/ingest-routes.cjs:5` (`FUTURE_TOLERANCE_MS`),
    `runtime/headless-runtime.cjs:426` ;
  - règle du fil : `adapters/remote-media.cjs:26-27` (1 à 5 images), traduite en 400 `invalid-media-block` par
    `server/http.cjs:75-76`.
- Tests : `tests/session-runtime.test.cjs:29`, `:31` (clip vide, images vides), `tests/remote-media.test.cjs:63`,
  `tests/server-ingest-path.test.cjs:166-195`, `tests/wire-contract.test.cjs:230-260`.

## Périmètre

- À créer : `runtime/segment-contract.cjs`, qui exporte `SEGMENT_LIMITS` (bornes nommées, dont la tolérance de
  3 000 ms) et `validateCapturedSegment(input, { now })`, reprise exacte de `validateSegment`.
- À modifier : `runtime/session-runtime.cjs`, `runtime/capture-intake.cjs`, `app/main.cjs`, `server/ingest-routes.cjs`,
  `runtime/headless-runtime.cjs` : lire le contrat et ses bornes ; plus aucun littéral 3 000 pour cette tolérance.
- Les validateurs du fil restent propres à leur transport (`adapters/remote-media.cjs`), mais lisent les bornes
  partagées quand ce sont les mêmes.
- À ne pas toucher : les messages et codes de refus, `core/`, la capture TV.

## Critères d'acceptation

1. Un test du contrat reprend les refus existants (clip vide, aucune image, trop d'images, horodatage futur au-delà de
   la tolérance) avec les mêmes messages, et l'acceptation d'un bloc valide.
2. `git grep -n "3000\|3_000" -- runtime server app` ne montre plus cette tolérance hors de `segment-contract.cjs`.
3. Les tests existants cités passent sans modification de leurs assertions.
4. `node scripts/check.mjs`.

## Test d'acceptation attendu

`tests/segment-contract.test.cjs` : les refus et l'acceptation, par `validateCapturedSegment`.

## Hypothèses bloquantes

Aucune décision n'est attendue.

## Journal

- 19/10, propriétaire : le chantier « son seul » (T297 à T302) passe en tête de file, après T225.
