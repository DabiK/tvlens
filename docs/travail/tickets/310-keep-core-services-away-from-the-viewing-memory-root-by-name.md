---
id: T310
titre: Keep core services away from the viewing memory root by name
statut: a-faire
bloque_par: T220
adr: non
installe: non
harnais: non
supprime_tests: non
niveau: standard
---

## Ce que le ticket livre

Un service du cœur hors de `core/memory/` ne peut plus obtenir la racine `ViewingMemory`, ni par un import direct ni par
l'entrée publique de la Mémoire : la garde d'architecture le vérifie au niveau de l'identifiant, et la documentation
redit l'interdiction.

## Sources

- Réserve de clôture de T220 (`.harness-state/tickets/T220/relecture-1.md`, constat 1) : depuis que
  `core/memory/index.cjs` exporte `ViewingMemory`, la garde `tests/architecture.test.cjs:545-554` ne bloque plus que
  l'import direct ; `require('./memory/index.cjs').ViewingMemory` passe ; `docs/architecture.md:39-40` présente l'index
  comme la voie d'accès des services.
- Code à `41ef3e3` : `core/memory/index.cjs` (export de `ViewingMemory`), `core/ports.cjs:120` (mention en JSDoc, à ne
  pas compter), garde `context-private-import` (import direct déjà refusé).
- ADR 0063 (racine de la Mémoire renommée).

## Périmètre

- À modifier : `tests/architecture.test.cjs` (garde au niveau de l'identifiant, commentaires ignorés, et une fixture
  qui rejette un service obtenant la racine par l'index), `docs/architecture.md:39-40` (la phrase redevient une
  interdiction), l'ADR 0063 si elle décrit la garde.
- À ne pas toucher : le code de production, sauf si la garde trouve un vrai usage (alors s'arrêter et le dire).

## Critères d'acceptation

1. La fixture « service plat qui lit `ViewingMemory` par l'index » est refusée par la garde ; le test échoue avant la
   correction.
2. Aucun module de `core/` hors `core/memory/` ne référence `ViewingMemory` hors commentaires.
3. `node scripts/check.mjs`.

## Test d'acceptation attendu

`tests/architecture.test.cjs` : la garde de la racine au niveau de l'identifiant, avec sa fixture refusée.

## Hypothèses bloquantes

Aucune décision n'est attendue.

## Journal

- 19/10, orchestrateur : ticket ouvert depuis la réserve de clôture de T220.
