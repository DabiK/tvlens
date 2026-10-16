---
id: T025
titre: State the layer rules as one table in the architecture test
statut: a-faire
bloque_par: T199
adr: non
installe: non
harnais: non
supprime_tests: non
niveau: standard
---

## Ce que le ticket livre

Une table unique garde le sens des dépendances entre les six couches JavaScript, y compris les
dépendances inverses que les gardes actuelles ne couvrent pas. Les règles d'import placées dans deux
tests de comportement rejoignent cette garde, sans perdre leurs assertions comportementales.

## Sources

- `docs/audit-architecture.md`, rapport A, A.1 et D3 ; décision du propriétaire, le 16/10 :
  rouvrir après T199, qui attend T178, sans les anciennes chaînes de chantier.
- Code vérifié à `8340014` : `tests/architecture.test.cjs:8` parcourt déjà récursivement les sources
  et filtre les extensions ; `tests/architecture.test.cjs:16` garde le cœur,
  `tests/architecture.test.cjs:26` garde Electron dans runtime/serveur,
  `tests/architecture.test.cjs:33` garde les drapeaux du domaine,
  `tests/architecture.test.cjs:46` interdit aux services du cœur le cas d'usage session et
  `tests/architecture.test.cjs:57` garde les rôles Codex et l'absence des adaptateurs retirés.
- `tests/architecture-guard.test.cjs:18` copie la garde réelle dans des arbres isolés ;
  `tests/architecture-guard.test.cjs:49` prouve l'isolation sans adaptateurs produit.
  Le parcours plat et son erreur EISDIR décrits par l'ancienne fiche sont déjà traités par T164.
- Lectures de source à migrer : `tests/chat-trace.test.cjs:55` interdit textuellement `adapters/`
  dans DeepAsk ; `tests/surveillance.test.cjs:624` cherche des mots liés au chat et à DeepAsk.
  La preuve comportementale `h.chatReads === 0` est à `tests/surveillance.test.cjs:623`.
- Relevé statique récursif des imports littéraux relatifs à cette version : adapters → core 7 ;
  runtime → core 13 et adapters 22 ; server → adapters 9 et runtime 1 ; mcp → core 2 ;
  app → adapters 16, core 5 et runtime 7. Aucune arête inverse relevée par ce relevé textuel.
  Il ne prétend pas analyser les chemins construits à l'exécution.
- Appelant : `scripts/check.mjs:166` découvre les tests puis les exécute en séquentiel.
  ADR 0014 : règles de couches dans le test d'architecture ; ADR 0016 : adaptateurs retirés absents.

## Périmètre

- Modifier `tests/architecture.test.cjs` et `tests/architecture-guard.test.cjs`. Réutiliser le parcours
  récursif existant ; un seul relevé des imports littéraux (`require`, `from`, import dynamique,
  import statique à effet de bord),
  commentaires ignorés, et une résolution des chemins relatifs servent les règles de couches.
- Table permise, imports internes à chaque couche compris :

  | Couche | Autres couches permises |
  | --- | --- |
  | core | aucune |
  | adapters | core |
  | runtime | core, adapters |
  | server | core, adapters, runtime |
  | mcp | core |
  | app | core, adapters, runtime |

  Un import relatif qui sort de ces six racines est refusé. Un chemin parent qui reste dans sa
  couche est permis, y compris dans `core/`. Les imports externes du cœur restent interdits.
- La table est une donnée : une liste de zones, chacune désignée par un motif de chemin (`core/**`,
  `adapters/**`…), avec les zones qu'elle peut importer. Une sous-zone plus précise (par exemple
  `core/memory/**`, ou `core/shared/**` comme noyau partagé) s'ajoute plus tard par une ligne de table,
  sans réécrire le relevé ni les gardes. La zone d'un fichier est le motif le plus précis qui le
  contient. Aujourd'hui, la table ne contient que les six couches ci-dessus : aucune sous-zone n'est créée.
  Un test vérifie ce mécanisme sur un arbre temporaire, avec une sous-zone de fixture et une arête refusée.
- Garder les interdictions de globales du cœur, d'Electron dans runtime/serveur, les drapeaux et les
  rôles Codex. La règle des services du cœur vise le module session après résolution, y compris
  depuis un sous-dossier ; adapter sa fixture au vrai chemin vers ce module.
- Porter ici l'interdiction Surveillance → DeepAsk. Retirer seulement les lectures de source citées
  de `tests/chat-trace.test.cjs` et `tests/surveillance.test.cjs`, avec les imports disque devenus
  inutiles. Garder `h.chatReads === 0` et tous les scénarios.
- Les arbres isolés couvrent les six racines. Adapter la sélection de gardes et vérifier qu'un
  test nommé s'est réellement exécuté, comme le fait déjà le banc d'isolation.
- Ne modifier ni production, ni harnais, ni standards, ni dépendances. Aucun analyseur installé.
  `tests/helpers/source-shape.cjs` conserve les commentaires : ne pas l'utiliser pour les retirer.
  Les fautes injectées restent dans des copies temporaires, jamais dans le worktree partagé.

## Critères d'acceptation

1. La garde passe sur le dépôt et examine chaque racine. Le journal donne fichiers et arêtes
   relevés ; une racine absente ou un parcours vide dans la fixture complète fait échouer le test.
2. Les fixtures prouvent `require` avec les deux guillemets, `from` sur plusieurs lignes, import
   dynamique ou à effet de bord, commentaires ignorés et fichiers non JavaScript ignorés. Elles acceptent
   `../../core/x.cjs` depuis `adapters/nested/` et `../ports.cjs` depuis `core/nested/`, mais refusent
   adapters → runtime, runtime → app et toute sortie des couches, avec les chemins en diagnostic.
3. Dans ces arbres, importer un adaptateur depuis DeepAsk, DeepAsk depuis Surveillance, ou le module
   session depuis un service imbriqué fait échouer la règle correspondante. Retirer chaque faute
   rend le cas vert ; les sorties rouge et verte vont au journal.
4. Les gardes précédentes restent exercées aux profondeurs et extensions déjà couvertes. Aucun cas
   ne disparaît ; chat-trace et surveillance ne lisent plus leur source pour ces règles. Leurs
   assertions de diagnostic et d'indépendance du chat gardent leurs valeurs attendues.
5. À l'implémentation, lancer en séquentiel les tests architecture, architecture-guard, chat-trace
   et surveillance, puis `node scripts/check.mjs`. Consigner les résultats réellement observés.

## Test d'acceptation attendu

`tests/architecture-guard.test.cjs` exerce la garde réelle dans une arborescence temporaire.
Le refus adapters → runtime constitue la première preuve : il échappe aux règles actuelles.
Le banc ne lit pas le texte du parcours pour deviner son comportement.

## Hypothèses bloquantes

Aucune décision n'est attendue.

T199 implique T178. T023 n'est plus un prérequis : parcours et banc sont déjà livrés.
La table extensible par sous-zone vient de l'analyse de conception du 16/10 (Opus et Astra) : la cible découpera
l'intérieur de `core/`, `runtime/` et `adapters/` par contexte. Ce ticket prépare ce mécanisme, sans rien découper.
Les chemins dynamiques restent une limite nommée du relevé. Une arête produit contredisant la table
est signalée avant toute extension de la table ou modification produit.

## Journal
