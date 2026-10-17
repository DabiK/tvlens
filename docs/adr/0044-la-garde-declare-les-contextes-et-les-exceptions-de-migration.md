# 0044 — La garde déclare les contextes et les exceptions de migration

- Date : 2026-10-17
- Ticket : `docs/travail/tickets/205-guard-context-subzones-public-entry-points-and-temporary-exceptions.md`
- Statut : acceptée

## Contexte

La sélection par préfixe le plus long et les permissions exactes sont déjà contrôlées par la garde.
Le noyau `core/shared/` existe, mais les extractions en contextes doivent aussi protéger leurs modules
internes. Les ADR 0029 et 0030 imposent cette protection avant les déplacements ; les façades du code
plat doivent pouvoir survivre pendant la migration.

## Décision

La table unique `DEPENDENCY_ZONES` déclare la couche (`layer`), le contexte (`context`), le noyau
(`shared`) et l'entrée publique (`entryPoint`) des zones concernées. Aucun nom de dossier ne déduit
un contexte. Déclarer une sous-zone impose sa permission exacte à chaque lecteur, sans héritage.
`core/shared/**` est déclaré séparément, avec une permission dans chacune des six zones racines qui
importent `core/**` ; chaque nouvelle ligne de contexte devra aussi déclarer son accès au noyau.

La garde valide ces métadonnées avant les imports et signale une ligne incohérente par
`zone-metadata-invalid`. La racine impose la couche : `core` porte le domaine, `runtime`
l'application, `adapters` les adaptateurs, et `server`, `mcp`, `app` les hôtes. Chaque sous-zone
conserve la couche de sa racine. Le noyau exige `shared: true`, sans `context` ni `entryPoint`. Une autre
sous-zone de domaine exige un contexte explicite, un motif `core/<contexte>/**` et exactement
l'entrée `core/<contexte>/index.cjs`. Une ligne de contexte d'application doit correspondre à
`runtime/<contexte>/**` ; une sous-zone du runtime comme `runtime/compose/**` peut rester sans
contexte. Aucun contexte absent n'est déduit ; une ligne incomplète est refusée.
Les diagnostics de permission constatent le droit manquant sans conseiller de modifier les couches.

Un lecteur extérieur à un domaine accède seulement à son `core/<contexte>/index.cjs` résolu.
Les imports de dossier sont équivalents à cet index ; les chemins normalisés ne donnent aucun accès
supplémentaire. Un domaine ne lit jamais celui d'un autre contexte, même avec une permission ou une
exception. Un service d'application peut lire une entrée publique étrangère avec sa permission.
Les modules plats de `core/` et `runtime/` n'ont aucun contexte ; ils lisent les entrées publiques
avec permission. Un module contextualisé ne les atteint que par exception de migration.

`TEMPORARY_IMPORT_EXCEPTIONS` déclare chaque arête temporaire par `name`, `source`, `target` et
`reason`. Les chemins sont des fichiers exacts, relatifs au dépôt et normalisés ; `target` est la
destination après résolution. Noms et arêtes sont uniques. L'exception ne sert que si un import encore
présent serait refusé par la politique des zones, des modules privés ou du code plat. Elle échoue si
un fichier ou l'import disparaît, ou si l'arête devient permise sans elle. Les gardes du temps, des
globales, de pureté, d'Electron, des paquets et de présentation restent indépendantes.

## Alternatives écartées

- Déduire le contexte d'un préfixe : cela attribuerait implicitement des permissions produit.
- Autoriser un dossier entier pendant la migration : une nouvelle dépendance pourrait s'y cacher.
- Conserver une exception devenue inutile : la dette déclarée ne refléterait plus les imports réels.

## Conséquences

Chaque extraction déclare sa zone et les droits de ses lecteurs. Les façades transitoires restent
possibles, avec une dette exacte qui doit disparaître avec elles. Aucun contexte produit ni exception
produit n'est ajouté ici. La garde reste lexicale : elle n'évalue pas les imports calculés et ne
résout pas les spécificateurs entre accents graves ; ce changement n'élargit pas sa reconnaissance.

## Protégée par

`tests/architecture.test.cjs` sur le dépôt et `tests/architecture-guard.test.cjs` sur des copies
temporaires : permissions, entrées publiques, domaines étrangers, noyau et péremption des exceptions.
Le banc vérifie aussi l'exécution effective des gardes sélectionnées.
