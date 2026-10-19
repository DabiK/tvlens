# 0054 — Le serveur publie une projection applicative de la mémoire

- Date : 2026-10-17
- Ticket : `docs/travail/tickets/219-build-published-memory-projections-in-the-application.md`
- Statut : acceptée

## Contexte

Le serveur construisait sa session complète par `WatchSession.snapshot()` et ses vues légères par
la consultation publique. Le listing réutilisait le callback hérité avec un secours snapshot.
L'ADR 0046 fournit les passages mais pas les questions historiques, les compteurs d'usage ni
les métadonnées nécessaires à la forme complète du fil. Les corps HTTP figés doivent rester égaux.

## Décision

`runtime/memory/memory-projection.cjs` traduit la consultation et des ports publics distincts
vers la session historique. La composition partagée lie ces capacités à une seule session.
Le serveur conserve une projection par publication, commune à ses livraisons et aux données des
vues dérivées et du listing. Une adoption remplace ensemble cette projection et sa consultation ;
une publication d'une autre identité ne les modifie pas.

| Champs publiés | Source publique |
| --- | --- |
| `id`, bornes et retard d'analyse | `MemoryView.session` et `MemoryView.clock` |
| `segments`, `history`, disponibilité, champs facultatifs | `MemoryView.passages`, origine et métadonnées détachées |
| `coverage`, `gaps`, `audioGaps`, `visionGaps` | `MemoryView.coverage` et compteurs acquis `losses` |
| `accepting`, `readOnly`, `unplacedMedia`, `retention`, `retentionMs` | `memory.readPublicationStatus()` |
| `asking`, `analyzing`, `pending`, `audioPending`, `visionPending`, `lastError` | `memory.readPublicationStatus()` |
| `coverage.visionBlockedMs` | `memory.readPublicationStatus()`, durée actuelle de retenue |
| `questions` historiques | `memory.readHistoricalQuestions()`, copie profonde, distincte des jobs de chat |
| `apiCalls`, `apiCost` | `memory.readUsage()`, acquisition à l'appel fournisseur |
| `latency` | Horodatages consultables, calcul `latencySummary` exporté par l'entrée publique de Mémoire |
| `elapsedMs` des vues légères | `SessionClock.now()`, horloge injectée dans la composition |
| `storage` | `session.storage()`, mesure existante en cache, sans I/O |
| `title` | `session.manifest()` côté serveur, titre de la session chargée côté Mac, déjà en mémoire |

La façade de compatibilité fournit le statut sans snapshot ; `lastError` garde la priorité stockage,
puis sauvegarde, puis traitement. `asking` quitte la consultation métier. Les questions historiques
n'y entrent pas. Les métadonnées de passage conservent les horodatages, durées, `hasAudio`, `ingest`,
`metrics`, les raisons média et les extensions historiques. `fieldOrder`, `undefinedFields` et
`explicitNulls` distinguent ordre, absence, undefined et null sans lire une archive ni une forme
complète de secours. Les autres contextes gardent leur vue spécialisée.

Une lecture complète relit les ports publics : elle garde la fraîcheur des compteurs acquis et
d'une disponibilité changée pendant une attente de retrait média. Une vue légère réutilise sa
partie publiée, puis ajoute horloge, drapeaux de fermeture et stockage courants. Les révisions
et les ETags suivent les publications existantes ; quota et index gardent la révision auxiliaire.
Une horloge seule ne change aucun ETag et un 304 ne construit aucune projection.

| Transition | Invalidation conservée |
| --- | --- |
| Réception, départ/progression/résultat de voie, pertes, miniature et disponibilité | `MemoryInvalidated` puis `published` et `emit` |
| Retenue/question, suspension d'admission, pause/reprise, erreur ou retour de sauvegarde | Même invalidation bornée ; aucun faux événement de passage |
| Adoption ou chargement d'archive | `onAdopt`, remplacement atomique des références puis `emit` |
| Question de chat, surveillance et disponibilité de transcription | Callbacks d'hôte existants vers `emit` |
| Mesure disque changée | Comparaison du cache dans `tick`, puis `emit` |
| Quota et index | Comparaison auxiliaire dans `tick`, ETag complet seulement |

La garde autorise explicitement la composition plate vers `runtime/memory/**`. L'export public
de latence garde une exception limitée à l'arête index de Mémoire → module pur plat existant.
Aucun accès interne de Mémoire n'est donné à un autre contexte.

### Livraison Mac

Depuis l'ADR 0059, lecture IPC `watch:state` et push Mac appellent le même lecteur de
`runtime.memoryProjection`. Le Mac ajoute le titre chargé et la disponibilité de transcription
au résultat. Depuis l’ADR 0061, `MemoryInvalidated` remplace le callback complet pour les
transitions de statut, files, erreurs et sauvegarde ; les invalidations propres à l’hôte restent en place.
Chaque push construit une projection, commune aux destinataires de son message ; une lecture
IPC explicite relit les ports publics pour préserver leur fraîcheur entre deux publications.

L'invalidation est liée à l'identité du runtime adopté, pas seulement à son identifiant persistant.
Closing et switching empêchent tout push. Le renderer révoque les lectures de session dépassées
et les lots d'archive d'une vie de session précédente ; l'ADR 0025 garde ses dessins regroupés.
Résumé et surveillance conservent leurs abonnements spécialisés, sans seconde alimentation.

## Alternatives écartées

- Reprendre le callback complet ou un snapshot de secours : maintient le couplage du lecteur serveur.
- Tout mettre dans MemoryView : impose activité de Questions et historique de chat aux lecteurs métier.
- Cacher toutes les lectures complètes : perd les changements acquis entre deux publications.
- Invalider sur l'horloge ou inventer des faits de passage : change le contrat de revalidation.

## Conséquences

La contraction est achevée par l’[ADR 0061](0061-la-memoire-invalide-sans-construire-son-snapshot.md) :
`emit()` ne construit plus de snapshot. La projection publiée est partagée avec le manifeste et les
consommateurs différés ; les sauvegardes restent explicites et séparées. Cet ADR complète aussi
la matrice des invalidations et consigne le comptage avant/après pour 0, 1 et 3 auditeurs.
Une projection ne confirme aucune écriture. Les noms persistés, le convertisseur, l'IPC et la TV
restent inchangés. Les fichiers nouveaux ne portent aucune infraction gelée.

Les auditeurs de test partagent une livraison ; le produit n'en compte actuellement aucun et
`replay-lg-stream` en ajoute un pour la mesure. Cette preuve distingue les constructions héritées
et applicatives ; elle ne constitue pas un gain mesuré à plusieurs abonnés produit.

## Protégée par

`memory-projection` compose la vraie mémoire et les ports publics, interdit snapshot, préserve
les champs facultatifs et teste la fraîcheur pendant un retrait média retenu.
`server-state-views` compare les corps HTTP figés et l'ordre JSON, interdit snapshot aux lecteurs,
compte séparément le callback hérité, vérifie files sans texte, usage acquis, refus de sauvegarde,
chargement de questions historiques et rejet d'une publication tardive.
`session-rows`, `server-sessions`, `timeline-server`, `state-views`, `wire-contract`, `memory-view`, les contrats Mac
et les gardes conservent les contrats de session, caches et 304.
La part Mac est protégée par les espions séparés snapshot/projection de `mac-ipc-contract`, ses
transitions de files, usage acquis, historique et erreurs, et les courses de lectures de `mac-ui`.
`state-delivery` vérifie aussi trois états de session rapprochés et les deux ordres frame/secours.
