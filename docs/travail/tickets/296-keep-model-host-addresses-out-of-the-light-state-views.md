---
id: T296
titre: Keep model host addresses out of the light state views
statut: a-faire
bloque_par: T294
adr: non
installe: non
harnais: non
supprime_tests: non
niveau: standard
---

## Ce que le ticket livre

Les vues légères de l'état, envoyées à la TV, au chat et au panneau, ne transportent plus l'adresse des hôtes de
modèles : elles gardent le genre et le nom du modèle utiles à l'affichage, pas son `host`.

## Sources

- Décision du propriétaire, le 19/10 : faire un ticket des défauts relevés en recette (tri d'Astra, « Manques »).
- Réserve 1 de T265 (`.harness-state/tickets/T265/relecture-2.md`), constat du 18/10 à 14:23 : les vues légères
  retirent `tools` et `evidence` des métriques d'une question, mais laissent passer `metrics.inspection`, dont
  l'identité porte `host`.
- Contrôle T284 du 19/10 : les métriques d'une question portent aussi `metrics.backend.identity.host`
  (`127.0.0.1:11434` pour Ollama), avec `kind`, `model`, `think`, `numCtx` ; elles partent vers les mêmes vues.
- Code à `11e601f`, `runtime/state-views.cjs` :
  - `:62-96` `lightJob` : `const { tools, evidence, ...figures } = metrics` puis `light.metrics = figures` ;
  - `:221` et `:362` : appels et export de `lightJob`.
- Tests : `tests/state-views.test.cjs`, `tests/server-state-views.test.cjs`.

## Périmètre

- À modifier : `runtime/state-views.cjs`, `tests/state-views.test.cjs`, et `tests/server-state-views.test.cjs` si
  besoin.
- Dans les vues légères, aucune identité de rôle (questions, réexamen, embeddings, perception) ne garde `host`, ni
  une URL, ni un jeton. `kind`, `model` et les réglages non sensibles restent. L'état complet du Mac et les archives ne
  changent pas.
- Une seule règle de filtrage pour toutes les identités, appliquée au même endroit.
- À ne pas toucher : les métriques enregistrées, les rapports de campagne, `core/`.

## Critères d'acceptation

1. Une question dont les métriques portent `backend.identity.host` et `inspection` avec `host` : la vue légère ne
   contient aucun `host` ; `kind` et `model` restent. Le test échoue avant la correction.
2. L'état complet (non léger) garde ses métriques telles quelles.
3. `node scripts/check.mjs`.

## Test d'acceptation attendu

`tests/state-views.test.cjs` : une tâche de question avec les deux identités, passée par `lightJob`.

## Hypothèses bloquantes

Aucune décision n'est attendue.

## Journal
