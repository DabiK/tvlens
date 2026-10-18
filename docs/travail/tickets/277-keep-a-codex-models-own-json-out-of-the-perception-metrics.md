---
id: T277
titre: Keep a Codex model's own JSON out of the perception metrics
statut: a-faire
bloque_par: T267
adr: non
installe: non
harnais: non
supprime_tests: non
niveau: standard
---

## Ce que le ticket livre

Sur le chemin Codex, les mesures et l'identité publiées par la perception (`backend`, `providerTimings`,
`clientTimings`, `modelState`) viennent de l'adaptateur, jamais du JSON rendu par le modèle. Les comparaisons Codex et
local du GX10 ne peuvent pas recevoir une mesure qu'aucun composant n'a prise.

## Sources

- Réserve de la relecture de T255, le 18/10 (`.harness-state/tickets/T255/relecture-1.md`, journal de T255).
- Code à `9e84275` :
  - `adapters/codex-session-run.cjs:128-139`, `turnResult` : recopie d'abord tout le JSON du modèle (`...result`), puis
    ne réécrit que `audit`, `threadId`, `elapsedMs`, `coldStart` et `connectMs` ;
  - `adapters/codex-perception.cjs:69-76`, `reportedMetrics` : publie `backend`, `providerTimings` et `clientTimings`
    dès que ce sont des objets, et `modelState` quand il vaut `unknown`, quelle que soit leur origine ;
  - `adapters/codex-perception.cjs:14` et `:285` : le schéma d'observation impose `additionalProperties: false`. Rien ne
    vérifie que l'App Server l'applique strictement.
- `tests/codex-thread-rotation.test.cjs:398-400` prouve que la perception n'invente pas ces champs, pas qu'elle résiste
  à un modèle qui les revendique. La faiblesse existait déjà pour `backend` et `providerTimings`.

## Périmètre

- À modifier : `adapters/codex-session-run.cjs` ou `adapters/codex-perception.cjs`, au plus près de la frontière avec le
  modèle, et un test existant du chemin Codex de la perception.
- Les clés `backend`, `providerTimings`, `clientTimings` et `modelState` du JSON du modèle sont écartées avant toute
  publication de métriques ; une valeur posée par l'adaptateur lui-même reste publiée. Le reste du JSON du modèle
  (observation, sujets, incertitudes) ne change pas, pour tous les rôles qui passent par `turnResult`.
- À ne pas toucher : `adapters/local-vlm-agent.cjs` et ses mesures, les schémas, les autres rôles au-delà de ces quatre
  clés, le harnais.

## Critères d'acceptation

1. Par le transport Codex doublé, un modèle qui rend une observation valide avec `clientTimings`, `providerTimings`,
   `modelState` et `backend` inventés : l'observation est publiée, et les métriques ne contiennent aucune de ces quatre
   valeurs inventées.
2. Le chemin local publie toujours ses `clientTimings`, `providerTimings` et `modelState` : les tests de
   `tests/local-vlm-agent.test.cjs` passent sans modification.
3. `node scripts/check.mjs`.

## Test d'acceptation attendu

Dans le test existant du chemin Codex de la perception : le modèle doublé revendique les quatre clés, et les métriques
publiées ne les reprennent pas.

## Hypothèses bloquantes

Aucune décision n'est attendue.

## Journal

