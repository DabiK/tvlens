# 0063 — La racine de mémoire se nomme ViewingMemory et se construit par son entrée publique

- Date : 2026-10-19
- Ticket : `docs/travail/tickets/220-rename-the-memory-root-to-viewing-memory.md`
- Statut : acceptée

## Contexte

Les extractions ont rangé les voies, les états, la couverture, les sujets et le format d'archive
dans `core/memory/`. La racine restait `WatchSession` dans `core/session.cjs`, importée directement
par la composition partagée, la bibliothèque, HTTP et les bancs. Après le nettoyage préalable,
le relevé de `eslint-suppressions.json` ne contient plus aucune entrée source ni cible : le fichier
peut être déplacé conformément à l'ADR 0029.

## Décision

La classe est `ViewingMemory` dans `core/memory/viewing-memory.cjs`. Son seul accès extérieur
est `core/memory/index.cjs`, qui expose aussi la récupération d'un passage, les convertisseurs
d'archive et les codes de refus. Tous les importeurs actifs utilisent cette entrée ; l'ancien
fichier disparaît sans façade ni alias. Le générateur d'archive historique utilise lui aussi
l'entrée publique et garde son refus explicite quand le cœur n'offre plus l'élagage historique.

La racine importe directement ses modules internes. `core/perception-context.cjs` lit l'entrée
publique à l'appel de sa fonction, après le chargement des modules : sa dépendance réciproque
avec la racine ne capture ainsi aucun export incomplet.

Cinq dépendances restent plates pour limiter ce déplacement. La garde déclare chaque arête
depuis `core/memory/viewing-memory.cjs` ; elle refuse les déclarations devenues inutiles :

| Destination | Raison et condition de retrait |
| --- | --- |
| `core/perception-context.cjs` | Contexte de perception existant ; retirer quand il rejoint la Mémoire. |
| `core/latency-trace.cjs` | Calcul de latence existant ; retirer quand il rejoint la Mémoire ou le noyau partagé. |
| `core/clip-container.cjs` | Lecture du conteneur existante ; retirer quand elle rejoint le noyau partagé. |
| `core/state-publication.cjs` | Publication isolée existante ; retirer quand elle rejoint le noyau partagé. |
| `core/passage-events.cjs` | Événements existants ; retirer quand ils rejoignent la Mémoire. |

L'exception existante de l'index public vers la latence reste distincte. Aucun répertoire
n'est exempté. Le serveur reçoit la permission de lire l'entrée publique Mémoire ; les accès
aux modules privés restent interdits. La garde des services du cœur refuse l'import direct
de la racine, sauf depuis la racine elle-même et son index exporteur. Un domaine étranger
ne peut importer ni cette racine ni son entrée publique, même avec une exception.

Les champs, identifiants, fichiers d'archive, outils, canaux, URL et origines de diagnostic
conservent leur contrat. La politique des questions, les cycles de vie, les ports et les
projections restent ceux déjà livrés. Le vocabulaire interne des passages et ses traductions aux
frontières sont fixés par l'ADR 0064.

## Alternatives écartées

- Conserver un réexport `core/session.cjs` : aucun consommateur ne l'exige après migration.
- Déplacer aussi les cinq modules plats : élargirait ce lot au-delà du nom et du chemin de la racine.
- Autoriser globalement `core/**` depuis la Mémoire : masquerait de nouvelles dépendances.

## Conséquences

La racine porte le nom du domaine et son accès est protégé par l'entrée publique. Les dettes
de placement restantes sont cinq arêtes exactes, à retirer lors du rangement de leurs modules.
Les bancs de construction espionnent désormais les méthodes publiques de `ViewingMemory` ;
ils conservent leurs assertions de lectures bornées, de publications partagées et de snapshots.
Les documents historiques et les témoins figés gardent leur provenance.

## Protégée par

- `tests/session.test.cjs` : construction publique, récupération, archive et refus de capture.
- `tests/architecture.test.cjs` et `tests/architecture-guard.test.cjs` : entrée publique,
  nouvelle racine, homonyme local, domaines étrangers et péremption des exceptions exactes.
- `tests/archive-compat.test.cjs`, `tests/session-durable.test.cjs` et `tests/wire-contract.test.cjs` :
  corpus figé, conservation, reprise, numérotation au-delà des orphelins et fil existant.
- Suites mémoire, outils, fin de session et livraison Mac : révisions, baux, voies, publications
  silencieuses, barrières et projections conservés ; `node scripts/check.mjs` les joue en séquentiel.
