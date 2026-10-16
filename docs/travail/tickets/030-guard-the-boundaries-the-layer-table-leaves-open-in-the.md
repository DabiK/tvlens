---
id: T030
titre: Guard the boundaries the layer table leaves open in the architecture test
statut: termine
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

### Exploration Codex

Lecture de la garde, de son banc et des ADR ; relevé unique réutilisable. État initial et périmètre consignés dans `.harness-state/tickets/T030/exploration.md` ; aucun écart prévu.

### Gardes et banc — cycles rouge/vert

Les commandes exactes et leurs sorties sont conservées dans `.harness-state/tickets/T030/commandes.md`
et les logs associés. Les mutations restent dans les arbres temporaires du banc.

- Paquets : `node --test --test-concurrency=1 --test-name-pattern='^external imports' tests/architecture-guard.test.cjs`
  rouge (42 violations acceptées), puis vert (88/88).
- UI et `module.require` : `node --test --test-concurrency=1 --test-name-pattern='^Mac UI|module.require' tests/architecture-guard.test.cjs`
  rouge (17/17), puis vert (17/17).
- TV : `node --test --test-concurrency=1 --test-name-pattern='^TV scripts' tests/architecture-guard.test.cjs`
  rouge (35 violations acceptées), puis vert (40/40). Les chargements à cible calculée ont ensuite
  montré un rouge de 4/4 ; leur refus donne 44/44 verts. Les deux branches sont délimitées aussi
  avec `?.` et `??` (rouge observé sur deux violations, puis vert).
- État du domaine : `node --test --test-concurrency=1 --test-name-pattern='^lifecycle guard' tests/architecture-guard.test.cjs`
  rouge sur les six écritures `asking`, puis vert (26/26). Lectures, comparaisons, commandes et écritures
  du domaine passent.
- `node --test tests/architecture.test.cjs` : 8/8 passent sur le dépôt réel, gardes des adaptateurs
  retirés et assertions positives des rôles Codex incluses.
- `CONTRIBUTING.md` décrit les frontières vérifiées et les exceptions des ADR 0011 et 0018.

### Vérifications séquentielles

Après la garde réelle (8/8), `node --test --test-concurrency=1 tests/architecture-guard.test.cjs`
passe : 297/297. Puis `node --test --test-concurrency=1 tests/tv-app-compat.test.cjs
 tests/tv-remote-navigation.test.cjs tests/tv-text.test.cjs tests/tv-chat-model.test.cjs
 tests/tv-poll-controller.test.cjs tests/tv-paired-page.test.cjs tests/chat-error-ui.test.cjs`
passe : 73/73 (chargements classiques sans `module` et CommonJS compris).

`node scripts/check.mjs --changed` : vert ; règles, format, lint, gel du lint, cliquet et 305/305 tests.
Stock statique de tests : 1426 → 1442, sans modification du plancher.
`git diff --check` : code 0, aucune erreur.

### Contrôle complet et transmission

`node scripts/check.mjs` : code 0, **vert**. Règles, format, lint, gel du lint et cliquet passent ;
1902/1902 tests JavaScript sur 124 fichiers et 22 tests Python passent.
Sortie complète : `.harness-state/tickets/T030/check-full.log`.

Verdict `TERMINÉ` dans `.harness-state/tickets/T030/verdict.json`, sans réserve ni écart.
Aucun commit ni push. La boucle conserve la responsabilité de la relecture et de l’intégration.
Les dossiers non suivis présents au départ sont préservés.

### Réserves à la clôture

- .harness-state/tickets/T030/relecture-1.md : **`tests/architecture.test.cjs:170`** : `if (specifier === null) continue;` (hors périmètre)

     **Le problème.** Le relevé repère désormais les chargements à cible calculée, comme `require(name)`, `require('es' + 'lint')` ou `` import(`../${x}`) ``. Dans `tv/app/`, la garde les refuse (`:240`). Dans les six couches, `app/ui/` compris, la garde les saute. Un paquet de développement ou un import UI vers un parent, écrit avec une cible calculée, échappe donc aux nouvelles règles. C'est la limite déjà réservée à la clôture de T025, celle des gabarits. Le ticket ne demande pas de la lever. `CONTRIBUTING.md:19` la nomme honnêtement : « imports externes littéraux ». Une recherche ne trouve aujourd'hui aucun `require(` ni `import(` à cible non littérale dans les six couches.

     **Attendu (réserve).** Un ticket ultérieur refuse les chargements calculés dans les couches, comme pour la TV, ou nomme la limite là où la garde est décrite.
