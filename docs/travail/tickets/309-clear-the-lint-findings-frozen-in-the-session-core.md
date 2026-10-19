---
id: T309
titre: Clear the lint findings frozen in the session core
statut: a-faire
bloque_par: T305
adr: non
installe: non
harnais: non
supprime_tests: non
niveau: sensible
---

## Ce que le ticket livre

`core/session.cjs` n'a plus aucune entrée dans le gel du lint : ses trois fonctions trop complexes et son ternaire
imbriqué sont découpés sans changer de comportement. C'est la condition préalable de T220 (renommage de la racine de
la Mémoire), qui s'est arrêté dessus.

## Sources

- T220, condition préalable (`docs/travail/tickets/220-rename-the-memory-root-to-viewing-memory.md`, « Périmètre ») :
  plus aucune entrée `core/session.cjs` dans `eslint-suppressions.json` ; sinon un ticket de nettoyage séparé. Arrêt
  de Codex le 19/10, relevé dans `.harness-state/tickets/T220/releve-gel.json`.
- Code à `8d64bb6`, relevé de l'orchestrateur (ESLint 9.39.5, gel ignoré) :
  - `core/session.cjs:170`, fonction fléchée asynchrone de `land()`, complexité 23 ;
  - `:267`, méthode `restore`, complexité 30 ;
  - `:275`, fonction fléchée dans `restore`, complexité 17 ;
  - `:285`, ternaire imbriqué ;
  - `eslint-suppressions.json:233-240` : `complexity: 3`, `no-nested-ternary: 1`.
- Précédent : T298 a retiré un ternaire gelé par `node_modules/.bin/eslint --prune-suppressions core/session.cjs`.
- ADR 0047 (`session.json` version 1), 0062 (son seul sauvegardé), 0050 (pertes).
- Tests : `tests/session-durable.test.cjs`, `tests/archive-compat.test.cjs` (archives figées), `tests/split-perception.test.cjs`,
  `tests/session-events.test.cjs`, `tests/memory-view.test.cjs`.

## Périmètre

- À modifier : `core/session.cjs` (fonctions nommées, au même module ou dans `core/memory/` si une règle y appartient
  déjà), `eslint-suppressions.json` (élagage seulement, par `--prune-suppressions`).
- Aucun changement de comportement : mêmes champs restaurés, mêmes pertes, mêmes erreurs, même format sauvegardé.
- À ne pas toucher : le renommage (T220), les adaptateurs, les tests existants (aucune assertion modifiée).

## Critères d'acceptation

1. `node_modules/.bin/eslint --suppressions-location <fichier vide> core/session.cjs` ne signale ni `complexity` ni
   `no-nested-ternary`.
2. `eslint-suppressions.json` n'a plus d'entrée `core/session.cjs` ; aucune autre entrée n'augmente.
3. Les tests cités passent sans modification, archives figées comprises.
4. `node scripts/check.mjs`.

## Test d'acceptation attendu

Aucun test nouveau n'est exigé : c'est un découpage sans changement de comportement, vérifié par les tests existants
de la restauration et de l'ingestion, et par le critère 1.

## Hypothèses bloquantes

Aucune décision n'est attendue.

## Journal

- 19/10, orchestrateur : ticket ouvert après l'arrêt de T220 sur sa condition préalable.
