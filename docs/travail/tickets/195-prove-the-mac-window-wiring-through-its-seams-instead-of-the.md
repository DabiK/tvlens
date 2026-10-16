---
id: T195
titre: Prove the Mac host wiring through its registered handlers and effects
statut: a-faire
bloque_par: T062
adr: non
installe: non
harnais: non
supprime_tests: non
niveau: standard
---

## Ce que le ticket livre

Le banc hôte prouve ses canaux IPC et l'indépendance des agents par les gestionnaires enregistrés
et leurs effets, au lieu de lire la forme de main.cjs. Aucun code produit ne change dans ce lot.
La couture renderer, ses six groupes, son ADR et ses mutations appartiennent à T203.

## Sources

- `docs/audit-architecture.md`, rapport A, B8 ; rapport B, B7.
  Décision du propriétaire, le 16/10 : séparer le banc hôte de la couture renderer.
- Code vérifié à `8340014` : `tests/mac-ipc-contract.test.cjs:87` à `:128` compare les canaux au
  texte de main.cjs, compte les arrêts et déduit l'indépendance de surveillance/options vision.
- `tests/mac-ipc-contract.test.cjs:53` exécute déjà le vrai preload ; `:151` à `:204` fournit launch,
  qui charge le vrai hôte avec Electron simulé et expose ses gestionnaires ; `:382` prouve déjà la
  coexistence surveillance/question. `tests/helpers/wait.cjs:11` à `:82` fournit les aides d'attente.
- T062 modifie aussi `tests/mac-ipc-contract.test.cjs`, pour ses aides. C'est la raison de l'ordre ;
  il ne crée pas ces aides déjà livrées. T061/T060/T199/T178 sont transitifs.
- ADR 0005 : processus indépendants par rôle ; ADR 0018 et 0025 : contrats Mac conservés.

## Périmètre

- Modifier seulement `tests/mac-ipc-contract.test.cjs` et ses aides sous tests/ si nécessaire pour
  remplacer les preuves de forme de la plage 87–128. Réutiliser launch et le vrai preload avec
  Electron simulé ; les canaux se comparent aux gestionnaires réellement enregistrés.
- Remplacer comptages cancel/stop et déduction textuelle des options par effets observables :
  capture, question, surveillance et vérification manuelle gardent leurs contrats de coexistence.
  Le démarrage balaie les seuls contextes Codex via sa dépendance contrôlée, sans racine réelle.
- Réutiliser directement `tests/helpers/wait.cjs` pour signaux et bornes. Le journal associe chaque
  ancienne assertion à sa preuve publique ou à un scénario existant conservé.
- Conserver les autres scénarios du banc et les gardes de frontière utiles. Aucun changement dans
  app/, core/, adapters/ ou runtime/, aucun ADR nouveau, protocole modifié, harnais ou plancher.

## Critères d'acceptation

1. Les canaux invoqués par le vrai preload trouvent les handlers réellement enregistrés par le vrai
   hôte sous Electron simulé ; un canal manquant est un échec. Aucun fragment JS de main.cjs
   n'est recherché pour prouver ce contrat.
2. Les scénarios existants de coexistence restent actifs : une question ne suspend ni surveillance
   ni vérification manuelle. Les vérifications des options et du balayage initial passent par les
   dépendances déjà contrôlées du banc, avec événements/promesses, sans lancement natif. Exception
   déclarée : la branche de vision de repli d'`app/main.cjs:67` ne s'atteint qu'avec `--live-inspection`
   et une configuration illisible, que `launch` ne permet pas (il force `--smoke-test`) ; son assertion de
   contenu (`tests/mac-ipc-contract.test.cjs:127`) est conservée telle quelle, avec cette raison au journal.
3. Le journal rapproche chaque assertion de la plage initiale 87–128 de sa preuve de remplacement.
   Le diff conserve titres, nombre de cas et valeurs attendues ; les seules assertions retirées
   sont celles de forme remplacées par une preuve de comportement. Aucun fichier produit ne change.
4. À l'implémentation, exécuter mac-ipc-contract et wait-helpers en séquentiel, puis
   `node scripts/check.mjs`. Aucun fournisseur réel, Electron natif, installation ni test de remplissage.

## Test d'acceptation attendu

Le banc existant lance le véritable hôte par launch, appelle le vrai preload et observe handlers,
commandes et publications sous dépendances maîtrisées. Les scénarios de coexistence font foi ;
une projection isolée ou la présence textuelle d'un appel n'est pas la preuve d'un effet.

## Hypothèses bloquantes

Aucune décision n'est attendue.

La dépendance à T062 ordonne les deux modifications de mac-ipc-contract. La couture du renderer
ne fait pas partie de ce lot et attend T195 dans T203. La preuve reste sous doublures et ne
revendique ni capture matérielle ni comportement d'Electron réel.

## Journal
