# 0052 — Les transitions de Mémoire remplacent une valeur immuable à quatre axes

- Date : 2026-10-17
- Ticket : `docs/travail/tickets/217-name-the-memory-lifecycle-state-transitions.md`
- Statut : acceptée

## Contexte

`WatchSession` affectait séparément `closed`, `ending`, `accepting` et `readOnly`.
Ces axes sont partiellement indépendants : le début de fin conserve l'admission et une pause
conserve la lecture seule. Les ADR 0002/0003/0006 imposent de garder les effets et leurs attentes
chez leurs propriétaires, sans réduire le cycle à une énumération de quelques états exclusifs.

## Décision

`MemoryLifecycleState`, dans `core/memory/lifecycle-state.cjs`, est une valeur composée gelée.
La racine possède une référence privée et la remplace par le résultat d'une transition nommée.
Les quatre lectures publiques restent des getters ; les projections et le convertisseur
conservent les champs historiques, sans exposer la valeur.

| Transition | Axes modifiés | Axes conservés et refus |
| --- | --- | --- |
| `pause`, `suspendAdmission`, `closeIntake` | accepting = false | closed, ending, readOnly |
| `beginEnding` | ending = true | closed, accepting, readOnly |
| `resume` | accepting = true, readOnly = false | ending conservé ; fermeture refusée |
| `close` | closed = true, accepting = false | ending, readOnly |
| `restore` | accepting = false, readOnly = true | ending conservé ; fermeture refusée |

Les transitions sont répétables et sans ports ni effets. La racine garde les préconditions
supplémentaires de restauration, le verrou des questions et sa traduction en retenue vision,
les publications isolées et les sauvegardes explicites. Les voies gardent leur annulation.
La garde disque précède toujours l'horloge dans le runtime ; `landed`, la barrière de confirmation
et le scellement restent distincts de cette valeur. Les deux hôtes gardent leur coordination actuelle.

La valeur seule refuse une restauration après fermeture. La racine prépare cette transition avant
toute validation ou mutation, puis l'installe à la fin. Ses autres préconditions utilisent la même
fabrique `restorationRefusal` : code `TVLENS_MEMORY_RESTORE_REFUSED` et message historique définis une seule fois.

## Alternatives écartées

- Une énumération live/pause/fin/archive : fusionne des combinaisons actuellement observables.
- Un setter recevant les quatre drapeaux : rendrait leur propriété aux compositions.
- Déplacer les effets dans la valeur : confondrait décision pure et confirmation du disque.

## Conséquences

Les affectations des quatre drapeaux disparaissent de la racine ; chaque commande nomme son intention.
Une archive reste en lecture seule jusqu'à une reprise explicite, même après pause ou fermeture.
Le refus du nouvel essai vision en lecture seule se teste par la lecture injectée des voies ;
une archive se construit par restauration, sans fabriquer un changement impossible en plein appel.
L'import de la racine passe par l'entrée Mémoire existante ; aucune permission n'est ajoutée.

## Protégée par

`memory-lifecycle-state` teste la table des combinaisons atteignables, les répétitions, les refus
et l'immutabilité. `watch-session-ending`, `session-lifecycle`, `memory-lanes` et
`architecture-f08` couvrent silence, ordre, stockage retenu et essais interdits.
Les bancs de disque plein et d'ingestion conservent les preuves de suspension et d'atterrissage.
Les gardes d'architecture existantes protègent les écritures des hôtes et les frontières de Mémoire.
