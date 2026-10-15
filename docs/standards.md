# Standards de code

Règles courtes, chacune avec la façon dont elle est vérifiée. Une règle sans vérification automatique
est relue par le rôle `relecteur`. Le contrôle unique est `node scripts/check.mjs`.

## Lisibilité

| Règle | Vérification |
| --- | --- |
| Une instruction par ligne ; aucune ligne de plus de 160 caractères | `check` : refus sur les lignes ajoutées, cliquet sur le total |
| Un fichier, une responsabilité ; au-delà de 400 lignes utiles, se demander ce qu'on peut extraire | `check` : ESLint `max-lines` (tests exemptés) ; l'existant est gelé dans `eslint-suppressions.json` |
| Une fonction fait une chose ; au-delà de 80 lignes ou d'une complexité de 15, la découper | `check` : ESLint `complexity` et `max-lines-per-function` (tests exemptés de cette dernière) ; l'existant est gelé dans `eslint-suppressions.json` |
| Pas de ternaires imbriqués | `check` : ESLint `no-nested-ternary` ; l'existant est gelé dans `eslint-suppressions.json` |
| Un nom dit ce que la chose fait ; aucune référence à un ticket ou à un chantier dans le code | relecture ; `check` pour les noms de fichiers de test |
| Les constantes (délais, tailles, seuils) portent un nom et vivent à un seul endroit | relecture |
| Les commentaires disent pourquoi, pas quoi | relecture |

## Architecture

| Règle | Vérification |
| --- | --- |
| `core/` n'importe rien hors de `core/` et n'utilise ni `process`, ni `fetch`, ni le disque | `tests/architecture.test.cjs` |
| `runtime/` et `server/` n'importent pas Electron | `tests/architecture.test.cjs` |
| Une logique commune aux deux hôtes s'écrit une fois, dans `runtime/` | relecture |
| Les dépendances externes (horloge, minuteries, disque, modèles) sont injectées | relecture |
| `process.env` se lit dans `adapters/config.cjs` et les points d'entrée des hôtes, nulle part ailleurs | cliquet `process_env_hors_config` |

## Erreurs

| Règle | Vérification |
| --- | --- |
| Pas de `catch` vide : traiter l'erreur, ou la laisser passer avec un commentaire qui dit pourquoi | `check` : refus sur les ajouts dans le code de production, cliquet sur le total |
| Aucun bloc vide sans commentaire ; la règle du `catch` vide est aussi vérifiée par ESLint | `check` : ESLint `no-empty` ; l'existant est gelé dans `eslint-suppressions.json` |
| Une erreur s'identifie par un code stable, pas par le texte de son message | relecture |
| Un message interne (chemin, sortie d'un outil) ne part pas vers un client | relecture |

## Tests

| Règle | Vérification |
| --- | --- |
| Un test vérifie un comportement par une frontière publique | relecture |
| Aucun test ne compare le texte du code source (les gardes d'architecture mises à part) | relecture, puis règle ESLint avec liste d'exceptions |
| Un fichier de test porte le nom d'un module ou d'un comportement | `check` : refus à la création, cliquet `tests_nommes_par_chantier` |
| Temps, réseau, disque et fournisseurs sont maîtrisés, pas attendus | relecture ; méthode dans la skill `tests` |
| Le nombre de cas de test ne baisse pas | cliquet `cas_de_test` |
| On ne relance pas un test instable jusqu'à ce qu'il passe | règle de travail |

## Interface

| Règle | Vérification |
| --- | --- |
| Le contenu produit par un modèle ou venu du réseau s'affiche comme du texte, jamais par `innerHTML` | cliquet `inner_html` |

## Le cliquet

`scripts/quality/baseline.json` contient le plancher de chaque mesure. Une mesure ne peut pas se
dégrader ; quand un ticket l'améliore, la boucle resserre le plancher dans le même commit. Le plancher
ne se relâche jamais à la main pour faire passer un contrôle.

Les mesures du cliquet restent simples et sans dépendance. ESLint complète `check` avec la
configuration recommandée et les règles de `eslint.config.mjs`. Les infractions existantes sont
gelées par fichier et par règle dans `eslint-suppressions.json`. Une infraction nouvelle et une
suppression devenue inutile font échouer le contrôle : le stock ne peut que baisser.

Une infraction gelée se corrige, puis `node_modules/.bin/eslint --prune-suppressions <fichier>` retire
sa suppression dans le même ticket. Une suppression ne s'ajoute jamais pour faire passer un contrôle.
Tout ticket qui rend une suppression inutile l'élague, même si `eslint-suppressions.json` n'est pas
dans son périmètre. Du code déplacé vers un nouveau fichier y arrive sans infraction : le ticket
de déplacement corrige celles du code qu'il déplace.
