---
id: T297
titre: Write the captured segment contract once with named limits
statut: termine
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
- 19/10, Codex : exploration consignée dans `.harness-state/tickets/T297/exploration.md` ; contrat actuel et différences
  du transport relevés, raccord des bornes et compatibilité de l'export historique expliqués dans `ecarts.md`.
- 19/10, Codex : `node --test tests/segment-contract.test.cjs`, rouge sur l'assertion de refus puis vert, successivement
  pour horodatages, clip, audio et images ; sorties `timestamps-*`, `clips-*`, `audio-*`, `frames-*` dans le dossier d'état.
  Test d'acceptation sans mutation ajouté, bornes inclusives conservées.
- 19/10, Codex : `node --test --test-concurrency=1 tests/segment-contract.test.cjs tests/session-runtime.test.cjs
  tests/remote-media.test.cjs tests/server-ingest-path.test.cjs tests/wire-contract.test.cjs` : 62 tests réussis,
  aucune assertion existante modifiée (`targeted-green.log`).
- 19/10, Codex : `node scripts/check.mjs --changed` : vert, 5 tests ; `git grep -n '3000\|3_000' -- runtime server app`
  ne relève plus la tolérance dans les fichiers suivis ; `rg -n '3000|3_000' runtime server app` confirme son unique
  définition dans `runtime/segment-contract.cjs` (encore non suivi), les autres résultats sont des valeurs distinctes.
- 19/10, Codex : `node scripts/check.mjs` : vert, règles, format, lint, gel et cliquet réussis ; 2 988 tests JS dans
  154 fichiers et 54 tests Python réussis (`.harness-state/tickets/T297/check-full.log`). `git diff --check` réussi.
  Verdict `TERMINÉ` déposé dans le dossier d'état pour relecture par la boucle, sans commit ni push.
- 19/10, Codex, reprise après `relecture-1.md` : rapport, ticket, journal, écarts, témoin de hooks, état Git et diff relus.
  Constat mineur accepté : le test annonce désormais seulement l'acceptation d'un bloc valide, selon la première option
  proposée ; ses assertions restent identiques. La mention antérieure « sans mutation » ne constituait pas une preuve
  d'absence de mutation. Le constat documentaire hors périmètre reste transmis par la boucle depuis le rapport.
- 19/10, Codex : `node --test tests/segment-contract.test.cjs` avant puis après renommage : 5 tests réussis à chaque fois
  (`correction-1-before.log`, `correction-1-after.log`). Correction de libellé, sans nouveau comportement ni rouge artificiel.
  `node scripts/check.mjs --changed` : vert, 5 tests réussis (`correction-1-check-changed.log`).
- 19/10, Codex, correction : `node scripts/check.mjs` : vert, règles, format, lint, gel et cliquet réussis ; 2 988 tests JS
  dans 154 fichiers et 54 tests Python réussis (`correction-1-check-full.log`). `git diff --check` réussi.
  Nouveau verdict `TERMINÉ` déposé pour relecture de correction par la boucle, sans commit ni push.

### Réserves à la clôture

- .harness-state/tickets/T297/relecture-2.md : Nombre de constats discordant : CONSTATS annonce 1 hors périmètre ; 0 constat(s) extrait(s). Consulter le rapport pour l'ensemble des constats hors périmètre.
- .harness-state/tickets/T297/relecture-2.md : **Écart accepté : raccord des bornes communes.** `REMOTE_MEDIA_LIMITS` est défini dans `adapters/remote-media.cjs` et le contrat le lit (`runtime/segment-contract.cjs:9-10`). La raison n'a pas changé depuis la première relecture : la garde d'architecture interdit `adapters → runtime` et autorise l'inverse. Le seul autre endroit commun possible, `core/`, est exclu par le ticket. Chaque borne commune garde une seule définition.
- .harness-state/tickets/T297/relecture-2.md : **Écart accepté : `validateSegment` gardé comme délégation d'une ligne.** Le critère 3 interdit de modifier l'assertion de `tests/session-runtime.test.cjs:34`, qui l'appelle encore. Il n'y a aucune logique en double, et les appelants en production passent directement par `validateCapturedSegment`.
