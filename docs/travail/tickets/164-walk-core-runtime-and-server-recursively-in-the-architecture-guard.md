---
id: T164
titre: Walk core, runtime and server recursively in the architecture guard
statut: a-faire
bloque_par: T163, T123
adr: non
installe: non
harnais: non
supprime_tests: non
niveau: standard
---

## Ce que le ticket livre

La garde d'architecture examine aussi les modules rangés dans un sous-dossier de `core/`, `runtime/`
ou `server/`. Ranger un module ne fait plus sortir ce module de la vérification, et le diagnostic
nomme son chemin relatif complet. Les règles de frontière existantes restent les mêmes.

## Sources

- `docs/audit-points-chauds.md`, section A « Frontières ».
  Décision du propriétaire, le 15/10 : ouverture sélective après T150 et périmètre de cette file.
- Code vérifié à `e92c6a6`, `tests/architecture.test.cjs` lu en entier :
  - `tests/architecture.test.cjs:7` parcourt les entrées immédiates de `core/`, puis les lit comme
    des fichiers à la ligne 8. Il n'y a ni distinction fichier/dossier ni descente récursive ;
  - `tests/architecture.test.cjs:9` vérifie les imports et `tests/architecture.test.cjs:12`
    interdit les accès globaux déjà nommés par la garde ;
  - `tests/architecture.test.cjs:16` applique le même parcours plat à `runtime/` et `server/`,
    avec l'interdiction de l'import Electron à la ligne 17 ;
  - `tests/architecture.test.cjs:20` commence une troisième garde, indépendante, sur les rôles Codex ;
  - `docs/architecture.md:18` renvoie à cette garde pour les dépendances du cœur ;
  - `scripts/check.mjs:116` découvre le fichier de test, exécuté en séquentiel à la ligne 121.
- Nuance au constat : un sous-dossier rencontré serait actuellement donné à `readFileSync` ; il peut
  donc produire une erreur de lecture au lieu d'un diagnostic de frontière. Le défaut établi est
  l'absence de parcours récursif, pas la preuve qu'un import imbriqué est aujourd'hui accepté.

## Périmètre

- T123 ajoute dans `tests/architecture.test.cjs` la garde récursive contre les affectations directes
  de `watch.ending`, `watch.accepting`, `watch.readOnly` et `watch.closed` depuis `app/`, `runtime/`,
  `server/` et `mcp/`. Relire sa version livrée avant de modifier ce fichier.
- Partager le helper de parcours de cette garde avec les gardes de couches de `core/`, `runtime/`
  et `server/` ; si T123 a gardé son parcours en ligne, l’extraire une seule fois dans ce ticket.
  Le parcours commun accepte un filtre d’extensions : `.cjs` pour la garde de T123, `.js`, `.cjs`,
  `.mjs` pour les couches. Les répertoires ne sont jamais lus comme des fichiers.
- Garder les assertions d'import et d'accès global existantes. Les diagnostics incluent le chemin
  relatif à la racine du dépôt, sous-dossiers compris.
- Ajouter les cas de parcours dans ce test ou dans `tests/architecture-guard.test.cjs`, avec des
  arbres temporaires isolés soumis à la même garde. Ne modifier aucun module produit pour le ranger.
- Ne toucher ni à la troisième garde Codex, ni au harnais, ni aux règles de dépendance autorisées.
  L'analyse des syntaxes d'import reste celle de la garde actuelle ; ce ticket ne crée pas un analyseur.

## Critères d'acceptation

1. Une fixture contenant des modules conformes au premier niveau et à deux niveaux de sous-dossiers
   de chacune des trois racines passe la garde, sans erreur de lecture de répertoire. Chaque module
   est effectivement examiné, y compris lorsqu'une entrée non JavaScript voisine est présente.
2. Un fichier temporaire `core/nested/forbidden.cjs` contenant `require('node:fs')` fait échouer la
   garde avec un diagnostic d'import qui cite ce chemin et `node:fs`. Le journal conserve cette sortie
   rouge, puis la sortie verte après retrait du fichier. Une simple erreur `EISDIR` ne constitue pas
   cette preuve. Réaliser la manipulation dans une copie isolée si un autre travail utilise le dépôt.
3. Les fixtures d'un accès `process` dans un sous-dossier de `core/`, et d'un import Electron dans
   un sous-dossier de `runtime/` puis de `server/`, échouent sur leurs assertions respectives. Les mêmes
   interdictions au premier niveau restent vérifiées ; un module conforme n'est pas refusé.
4. Une mutation qui rend le parcours plat fait échouer les cas imbriqués pour la raison attendue.
   La sortie rouge est consignée, puis la mutation retirée. Les cas n'inspectent pas le texte du helper.
5. `node --test --test-concurrency=1 tests/architecture.test.cjs` et les éventuels tests du helper,
   puis `node scripts/check.mjs`, sont verts. La garde de T123 utilise le même helper et conserve ses assertions et son cas de mutation.
   Aucun fichier du produit ou du harnais n’est modifié.

## Test d'acceptation attendu

La garde réelle de `tests/architecture.test.cjs`, appliquée à une arborescence temporaire ou à une copie
isolée du dépôt. Le premier cas prouve qu'un sous-dossier conforme est parcouru, le second qu'un import
interdit imbriqué est rejeté précisément. Le test exerce le parcours et ses assertions ensemble.

## Hypothèses bloquantes

Aucune décision n'est attendue.

Le ticket étend uniquement la profondeur du parcours. Il ne tranche aucune nouvelle règle sur les
imports parents, les modules externes, les extensions ou la composition des hôtes. Les restrictions
déjà exprimées par les assertions sont conservées.

## Journal
