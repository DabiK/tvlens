---
id: T303
titre: Measure the ready latency of a sound-only passage from its transcript
statut: a-faire
bloque_par: T298
adr: non
installe: non
harnais: non
supprime_tests: non
niveau: standard
---

## Ce que le ticket livre

Un passage son seul prêt a une latence « prêt après la fin du bloc », mesurée à la publication de sa transcription.
Aujourd'hui elle vaut `null` et le résumé des latences ignore ces passages : sur Netflix, la mesure serait vide.

## Sources

- Réserve de la relecture de T298 (`.harness-state/tickets/T298/relecture-2.md`, reportée de la relecture 1) : la
  latence d'un passage son seul `ready` reste `null`, et `snapshot().latency` ne le compte pas.
- Code à `38f45db` :
  - `core/latency-trace.cjs:10` : `readyAfterCloseMs` ne lit que `visionPublishedMs` ;
  - un passage son seul déclaré porte `hasImages: false` et `visionStatus: 'absent'` (`core/session.cjs:35-37`) ; seule la
    voie audio l'horodate, par `transcriptPublishedMs` (`core/memory/lanes.cjs:216`) ; `visionPublishedMs` n'est posé que
    par la vision (`:300`) ;
  - lecteurs : `core/session.cjs:376` (`snapshot().latency`), `runtime/memory/memory-projection.cjs:31`,
    `scripts/latency-trace.cjs:41`, `:270` (rejeu des latences).
- ADR 0062 (passages déclarés son seul).
- Test : `tests/session-latency.test.cjs:309-320` (arithmétique des latences, valeurs exactes).

## Périmètre

- À modifier : `core/latency-trace.cjs`, `tests/session-latency.test.cjs`.
- Passage `ready` avec `visionStatus: 'absent'` : `readyAfterCloseMs` = `transcriptPublishedMs − endMs`. Tous les autres
  cas gardent leur calcul actuel, dont un passage avec images sans `visionPublishedMs` (`null`).
- À ne pas toucher : les voies (`core/memory/lanes.cjs`), le format de `session.json`, les scripts de rejeu (ils lisent
  `passageLatency`).

## Critères d'acceptation

1. Un passage son seul `ready` : `readyAfterCloseMs` égale l'écart entre la transcription publiée et la fin du bloc. Le
   test échoue avant la correction.
2. `latencySummary` compte ce passage dans `readyAfterCloseMs.n`.
3. Les assertions existantes de `tests/session-latency.test.cjs` passent sans modification.
4. `node scripts/check.mjs`.

## Test d'acceptation attendu

`tests/session-latency.test.cjs` : la latence d'un passage son seul prêt, puis son entrée dans le résumé.

## Hypothèses bloquantes

Aucune décision n'est attendue.

## Journal

- 19/10, orchestrateur : ticket ouvert depuis la réserve de clôture de T298, rangé dans le chantier « son seul » avant
  T220 et T293.
