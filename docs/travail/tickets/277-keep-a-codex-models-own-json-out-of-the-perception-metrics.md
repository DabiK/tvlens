---
id: T277
titre: Keep a Codex model's own JSON out of the perception metrics
statut: termine
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

- Exploration : fuite confirmée à la lecture de `turnResult`, en amont de `reportedMetrics` ; correction limitée aux quatre clés
  réservées dans le JSON du modèle. Détails et absence d'écart consignés dans `.harness-state/tickets/T277/`.
- Rouge observé : `node --test --test-name-pattern='visual metrics discard model-claimed' tests/codex-thread-rotation.test.cjs`
  échoue sur l'assertion d'absence de `backend` inventé (`true !== false`), après validation de l'observation et du résumé.
  Sortie conservée dans `test-red.log` du dossier d'état.
- Vert observé : `node --test tests/codex-thread-rotation.test.cjs tests/codex-session-run.test.cjs tests/local-vlm-agent.test.cjs`
  réussit, 47 tests sur 47. Les tests locaux restent inchangés ; sortie dans `test-green.log`.
- `node scripts/check.mjs --changed` : vert (règles, format, lint, gel, cliquet, 16 tests sur 16) ;
  sortie dans `check-changed.log`. `git diff --check` réussit également.
- `node scripts/check.mjs` : vert (151 fichiers JavaScript, 2 817 tests sur 2 817 ; 47 tests Python réussis ;
  règles, format, lint, gel et cliquet verts). Sortie conservée dans `check-full.log`.
- Livraison : seules les quatre clés réservées sont retirées à la frontière JSON Codex ; observation, sujet, résumé et
  incertitudes restent inchangés. Aucun changement du chemin local, des schémas ou du harnais. Verdict `TERMINÉ` écrit
  dans `.harness-state/tickets/T277/verdict.json` ; relecture et intégration laissées à la boucle, sans commit ni push.

### Réserves à la clôture

- .harness-state/tickets/T277/relecture-1.md : 1. `adapters/codex-perception.cjs:317` — hors périmètre
  - **Problème :** la correction dans `turnResult` protège aussi les métriques de diagnostic de l'inspection (`onDiagnostic?.({ metrics: reportedMetrics(result) })`). Mais aucun test ne le prouve par le transport Codex doublé. Le seul nouveau test passe par `observeVisual`. Si quelqu'un déplaçait un jour le filtre de `turnResult` vers `observeVisual`, l'inspection se remettrait à publier les clés inventées sans qu'aucun test ne casse.
  - **Attendu :** un cas d'inspection où le modèle doublé revendique les quatre clés et où `onDiagnostic` ne les reçoit pas.
  - **Pourquoi hors périmètre :** le ticket n'autorise à modifier qu'un seul test et ne demande que le chemin visuel.
- .harness-state/tickets/T277/relecture-1.md : 2. `adapters/codex-session-run.cjs:132` avec `adapters/codex-perception.cjs:95-98` — hors périmètre
  - **Problème :** les quatre clés retirées dans `turnResult` doivent rester identiques à celles que `reportedMetrics` publie. Rien ne les relie : si `reportedMetrics` publie une cinquième mesure, la fuite revient pour cette clé.
  - **Attendu :** une liste unique des clés propres à l'adaptateur, ou un test qui les relie, sans faire dépendre le module générique des tours de la perception.
  - **Pourquoi hors périmètre :** le ticket fixe explicitement « ces quatre clés ».
