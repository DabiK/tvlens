---
id: T030
titre: Guard the boundaries the layer table leaves open in the architecture test
statut: a-faire
bloque_par: T025, T190
adr: non
installe: non
harnais: non
supprime_tests: non
niveau: standard
---

## Ce que le ticket livre

La garde commune ferme les frontières de présentation, de paquets et d'état du domaine que la table
des couches ne suffit pas à exprimer. T202 garde le stock des minuteries du cœur et centralise
les règles de pureté dispersées, après ce ticket.

## Sources

- `docs/audit-architecture.md`, rapport A, A.1, B8 et D3 ; décision du propriétaire, le 16/10.
- Code vérifié à `8340014` : `tests/architecture.test.cjs:21` refuse encore tout `..` dans le cœur
  (T025 traite ce point) ; `tests/architecture.test.cjs:34` protège quatre drapeaux, sans `asking`.
  `tests/architecture-guard.test.cjs:113` accepte explicitement `watch.asking = true`.
  Les deux hôtes l'écrivent à `app/main.cjs:151` et `runtime/headless-runtime.cjs:128`.
- L'ancienne frontière UI serait fausse : `app/ui/browser-capture.mjs:2` importe `../recording.js`,
  qui importe le cœur à `app/recording.js:1`. La capture injectée relève de l'ADR 0018.
- Les scripts TV chargent des helpers CommonJS conditionnels : `tv/app/sessions-view.js:6`,
  `tv/app/surveillance-view.js:47`, `tv/app/poll-controller.js:3`, `tv/app/companion.js:3`.
  L'ADR 0011 l'autorise sous Node ; l'ADR 0026 conserve les scripts classiques dans la page.
- `package.json` distingue dependencies et devDependencies, Electron compris.
  `CONTRIBUTING.md:5` décrit les frontières sans ces règles détaillées.
  ADR 0014 : règles de couches dans ce test ; ADR 0016 : retrait des adaptateurs hérités.

## Périmètre

- Modifier `tests/architecture.test.cjs`, son banc `tests/architecture-guard.test.cjs` et
  `CONTRIBUTING.md`. Réutiliser le relevé et la résolution de T025, sans seconde table de couches.
- Electron est permis seulement dans `app/main.cjs` et `app/preload.cjs`. Dans les six couches,
  un autre import externe vise `node:` ou un paquet des dependencies, sous-chemins et paquets à
  portée compris. Refuser les devDependencies et les builtins sans préfixe. Le cœur reste plus strict.
- `app/ui/` importe son dossier, avec l'unique arête existante browser-capture → `app/recording.js`.
  Aucune exception générale pour les parents. `tv/app/` reste en scripts classiques : pas de syntaxe
  ES import/export ; ses chargements CommonJS sont internes au dossier, relatifs, sous la garde Node
  de l'ADR 0011, `module.require` compris. Garder les exports conditionnels.
- Après T190, protéger aussi les écritures de `watch.asking`. Adapter la fixture qui les autorisait.
  Lectures, comparaisons, états de vue et écritures internes au domaine gardent leurs droits.
- Conserver les gardes des adaptateurs retirés et les assertions positives sur les rôles Codex.
  Aucun changement produit, harnais, standards ou lint ; aucun paquet ajouté. Mutations en copies isolées.

## Critères d'acceptation

1. Un cas vert et un cas rouge par frontière passent par la garde réelle : Electron aux deux
   entrées seulement ; dependency acceptée et devDependency refusée ; builtin préfixé accepté et
   non préfixé refusé. Le cœur refuse même une dependency. Les diagnostics nomment fichier et import.
2. Une UI conforme, browser-capture → recorder et le CommonJS TV conditionnel passent.
   Un autre import UI parent, un require TV hors dossier ou non gardé, et chaque forme de syntaxe
   ES import/export TV échouent. Le chargement classique sans `module` continue de fonctionner.
3. Une affectation directe de `watch.asking` dans un hôte imbriqué échoue, comme les quatre drapeaux
   déjà gardés. Lecture, comparaison et appel à `setQuestionPending` passent.
4. À l'implémentation, lancer en séquentiel les tests d'architecture et leur banc,
   puis la compatibilité TV concernée, puis `node scripts/check.mjs`.
   `CONTRIBUTING.md` renvoie à la garde et décrit ses exceptions, sans règle nouvelle non vérifiée.

## Test d'acceptation attendu

`tests/architecture-guard.test.cjs` crée les violations dans des arbres temporaires et exécute la
garde réelle. Chaque règle du périmètre a son cas conforme et sa violation isolée, avec chemin
et import ou écriture en diagnostic. La table des couches de T025 reste l'unique relevé d'import.

## Hypothèses bloquantes

Aucune décision n'est attendue.

T025 implique T199 puis T178. T190 est ajouté comme prérequis nécessaire : sans son retrait des
écritures actuelles, protéger `asking` imposerait une modification produit dans ce ticket de garde.
Les anciennes dépendances T016 à T024 ne sont plus nécessaires. Les exceptions navigateur/Node
reconduisent les ADR ; elles ne demandent aucune migration du système de modules TV.

## Journal
