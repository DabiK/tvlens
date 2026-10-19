# 0061 — La Mémoire invalide sans construire son snapshot

- Date : 2026-10-19
- Ticket : `docs/travail/tickets/225-stop-building-the-full-snapshot-to-notify.md`
- Statut : acceptée ; complète les ADR 0045, 0054 et 0059

## Contexte

Les deux hôtes lisent déjà la projection applicative, mais `WatchSession.emit()` construisait
encore son snapshot complet pour un argument ignoré. Le manifeste, le résumé vivant et la
surveillance pouvaient aussi reconstruire leur propre consultation. Les voies publient des
changements sans nouveau texte : suivre seulement `PassageUpdated` perdrait ces états.

## Décision

`WatchSession` remplace `onChange(snapshot)` par `onInvalidate({ type: 'MemoryInvalidated',
sessionId })`, après la livraison des faits de passage. La forme ne contient ni passages,
ni texte, ni erreur interne. Une invalidation demande de relire ; elle ne prétend pas qu'un
passage a acquis une révision. Les points d'émission restent ceux du domaine, y compris les
rafraîchissements explicitement demandés par l'hôte. Restaurer reste silencieux ; un cœur fermé
ne reprend pas ses publications d'état, même si un stockage déjà admis atterrit ensuite.

La composition invalide la projection puis remet le message au diffuseur existant. Manifeste
et hôte ont chacun leur abonnement isolé : une erreur du premier ne supprime pas le second.
Les abonnements se détachent à la fermeture de cette vie de session. Le Mac garde aussi sa
comparaison d'identité du runtime et ses gardes de bascule ; le serveur refuse les publications
d'un autre runtime. Aucun historique, rejeu ou minuteur de domaine n'est ajouté.

`memoryProjection.published()` partage une construction jusqu'à la prochaine invalidation.
Le manifeste ne la demande que lorsque sa cadence l'autorise ; l'hôte réutilise ce résultat.
Le résumé Mac et la réaction différée de surveillance utilisent la même consultation publiée.
L'index conserve ses lectures bornées. Questions, frise et détail gardent leurs consultations
explicites ; les relectures d'une question restent limitées à ses identifiants.
`read()` demeure une lecture complète fraîche pour les requêtes explicites et les changements
propres à l'hôte. Ces lectures ne deviennent pas des abonnements spécialisés.

Les lecteurs d'état publié restants — recherche et listing Mac, moments gardés, décisions de
fin, simulateur de flux et banc de latence hors ligne — passent par la projection. L'adoption headless ne construit plus d'argument
complet inutilisé. Les protocoles média continuent de contrôler identité et disponibilité sans
snapshot. `WatchSession.snapshot()` reste disponible pour la compatibilité explicite et le
modèle remis au convertisseur d'archive ; aucun hôte ne l'appelle pour publier.

### Matrice des invalidations

| Transition | Signal et lecture |
| --- | --- |
| Réception, résultat audio/vision, pertes, miniature, disponibilité | Faits bornés existants, puis `MemoryInvalidated` ; projection partagée |
| Départ et fin de voie, progression sans texte, attente ou retenue | `MemoryInvalidated`, sans révision de passage inventée |
| Pause, reprise, suspension d'admission pour disque plein | `MemoryInvalidated` avant l'attente de sauvegarde |
| Erreur de traitement, échec puis retour de sauvegarde | `MemoryInvalidated` ; priorité stockage, sauvegarde puis traitement conservée |
| Archive ouverte, adoption et remplacement | Restauration silencieuse, puis publication explicite de l'hôte ; anciens abonnements détachés |
| Questions, surveillance, disponibilité du transcripteur | Callbacks propres aux hôtes ; lecture fraîche, sans enrichir MemoryView |
| Stockage modifié, chargement | Invalidation de l'hôte ; données disque lues dans le cache existant |
| Quota et index | Révision auxiliaire de l'hôte serveur, ETag complet seulement |
| Rafraîchissement Mac en capture sans nouveau passage | `MemoryInvalidated` ; occasion de cadence du manifeste conservée |

### Durabilité

`persist()` reste le seul écrivain de `session.json`, par `toArchive(snapshot())` de l'ADR 0047.
La projection n'est jamais remise à cet écrivain. Les appels explicites de première ingestion,
fin de voie, pause/reprise et fermeture sont conservés. Publication et diagnostic peuvent échouer
ensemble sans empêcher ces appels. Une fermeture attend les stockages admis, sauve l'état final,
passe la barrière, puis confirme le manifeste de cette vie. Un refus impose un nouvel essai ;
les ressources ne sont pas fermées deux fois. La coalescence et le scellement restent ceux du store.

### Comptage synthétique

Même scénario avant/après : trois transitions rapprochées de retenue, vraie mémoire et vrai hôte
headless, avec un passage historique et un passage conservé, sur répertoire temporaire, horloge
et fournisseurs contrôlés. Espions injectés sur les
frontières publiques, sans lecture du source. Les valeurs sont les totaux des trois changements.

| Auditeurs du banc | Snapshots avant → après | MemoryView complètes avant → après | Lectures bornées avant → après | Projections avant → après |
| --- | --- | --- | --- | --- |
| 0 | 3 → 0 | 3 → 3 | 0 → 0 | 3 → 3 |
| 1 | 3 → 0 | 3 → 3 | 0 → 0 | 3 → 3 |
| 3 | 3 → 0 | 3 → 3 | 0 → 0 | 3 → 3 |

Chaque auditeur reçoit les trois états, avec le dernier `asking: true`, et partage l'objet livré
avec les autres. Les contrats d'index comptent séparément les lectures bornées sur un vrai passage.
Il s'agit d'auditeurs synthétiques : le produit n'en compte aucun sur ce chemin hors
`replay-lg-stream`. Ces comptes n'établissent aucun gain de latence ou de mémoire.

## Alternatives écartées

- Ne publier que les faits de passage : perd les progressions, attentes et issues disque.
- Construire la consultation dans chaque abonné : déplace le coût du snapshot au lieu de le partager.
- Mettre la sauvegarde dans un abonné : rend la durabilité dépendante d'une réaction facultative.
- Cacher toutes les lectures explicites : masque l'usage acquis entre deux publications.

## Conséquences

La notification du domaine a un volume indépendant du nombre de passages. Une publication complète
reste proportionnelle à la mémoire et peut être construite même sans auditeur headless, pour les
vues dérivées et le listing. Les consommateurs différés ne rejouent pas les états intermédiaires.
Les champs persistés et publiés, ETags/304 et la livraison Mac de l'ADR 0025 restent inchangés.

## Protégée par

`memory-projection` compte les constructions et conduit par promesses les voies, la retenue,
les progressions, pause/reprise, stockage et sauvegarde, avec abonné et diagnostic défaillants.
Il archive aussi une première vie, restaure silencieusement la seconde en lecture seule, puis
vérifie sa publication à l'adoption et à la reprise avant libération d'une sauvegarde retenue.
L'ancienne vie reste inerte, y compris sous le même identifiant.
`session-durable` retient puis refuse état final et barrière pendant qu'un bloc atterrit à la
fermeture ; il vérifie le fichier versionné, le nouvel essai et l'absence de résurrection après scellement.
`session-lifecycle`, `session-events` et `session-event-consumers` gardent les obligations, pertes,
révisions, coalescence et cadence. Les contrats Mac et serveur, corps figés, `wire-contract`,
`state-delivery`, archives historiques et gardes d'architecture conservent leurs preuves.
Le contrat Mac envoie de vraies invalidations tardives et éprouve séparément le callback retenu
de l'hôte ; retirer les gardes de bascule ou d'identité fait échouer ces assertions. Les arguments
du renderer ne peuvent pas remplacer la projection lue par le gestionnaire IPC `watch:state`.
`capture-display-latency` garde ses publications initiales, traces et dessins réels hors ligne,
et vérifie que sa notification n'appelle plus le snapshot historique.
