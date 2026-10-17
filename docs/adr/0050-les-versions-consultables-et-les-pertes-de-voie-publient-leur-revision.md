# 0050 — Les versions consultables et les pertes de voie publient leur révision

- Date : 2026-10-17
- Ticket : `docs/travail/tickets/221-publish-passage-updates-and-lane-losses-with-their-revision.md`
- Statut : acceptée

## Contexte

L’ADR 0045 fournit le diffuseur isolé, la réception et la suspension. La révision de `WatchSession`
montait aux seuls résultats audio et vision réussis. Une perte définitive, une disponibilité
expirée ou une miniature tardive changeaient donc la consultation sans changer sa version.
L’API historique d’élagage reste présente jusqu’au retrait prévu par T223 ; les hôtes ne
l’activent plus depuis l’ADR 0048.

## Décision

Le champ existant `revision` désigne une version consultable publiée du passage. La réception
conserve la révision initiale 0. Chaque transcription, observation, perte terminale ou changement
de disponibilité ajoute une version. Les changements d’un même passage acquis dans une même
transition partagent une seule révision : disponibilité expirée et pertes des deux voies,
transcription et expiration de la vision au passage de relais, ou transcription signalée failed.
Les départs de voie, progressions et le seul lancement du second essai ne créent pas de version.

`PassageEvents`, dans `core/passage-events.cjs`, possède la file privée des faits et un ensemble
temporaire des passages déjà versionnés dans la transition synchrone. `WatchSession` lui remet
les réceptions, suspensions et changements acquis. Cet ensemble n’est ni persisté ni un compteur ;
il est vidé avec le lot avant les callbacks. `PassageUpdated` précède les `PassageLost` de sa version.
Les mutations des statuts, files, compteurs et drapeaux d’activité sont terminées à la livraison
par le port existant `onEvents` et la composition partagée. `emit()` appelle cette publication
avant son snapshot d’hôte, qui conserve ses points d’émission.

`prune()` clôt aussi sa transition à la fin du balayage synchrone, avant la première attente de
suppression des médias. La version expirée est déjà consultable à cet instant. Une transcription,
observation ou miniature terminant pendant la suppression acquiert donc sa propre révision.
Cette publication des faits ne construit pas de snapshot et n’ajoute aucun appel à `onChange` ;
la publication d’état après les suppressions et le déplacement en history reste en place.

Les deux faits portent `sessionId`, `passageId`, `revision`, `interval: { startMs, endMs }`.
`PassageLost` ajoute `lane: 'audio' | 'vision'` et `cause: { code }`, dont le code appartient
à l’ensemble fermé `backlog`, `asking`, `expired`, `error`. Aucun code arbitraire de fournisseur,
message d’erreur, observation, snapshot, média ou liste n’est copié. Le diffuseur conserve sa
copie immuable, son isolation et sa livraison sans attente des promesses.

### Carte des branches et compteurs

| Branche de WatchSession | Compteur conservé | Faits de la transition |
| --- | --- | --- |
| Stockage accepté et ajout du passage | Aucun | `PassageReceived` à la révision initiale |
| Clip sans bloc vidéo, une fois le stockage accepté | `videoUnreadable` | `PassageUpdated` de disponibilité après réception, sans perte de voie |
| Résultat de transcription réussi | Aucun | `PassageUpdated` audio |
| Transcription qui renvoie `failed: true` | `audioError` | `PassageUpdated` et perte audio `error`, sans changer les statuts historiques |
| Lecture média ou transcription qui lève | `audioError` | `PassageUpdated` et perte audio `error` après le relais vers la vision |
| Audio en attente écarté par `shed()` | `audioSkipped` | `PassageUpdated` et perte audio `backlog` |
| File audio totale au-delà de trois fois maxPending : abandon du passage le plus ancien | `visionSkippedBacklog` | `PassageUpdated` et perte vision `backlog` ; l’audio a déjà sa perte, sans second comptage |
| File vision pleine : éviction d’un passage parlé, ou refus de la place à un passage dont l’audio est écarté | `visionSkippedAsking` si une question seule retient la voie, sinon `visionSkippedBacklog` | `PassageUpdated` et perte vision `asking` ou `backlog` |
| `prune()` expire un média conservé | Aucun pour la seule disponibilité | `PassageUpdated`, même si une voie est encore active |
| Ce passage attend son audio et son audio n’a pas été écarté | `audioExpired` | Perte audio `expired`, dans la version d’expiration |
| Ce passage attend son audio, déjà écarté ou non | `visionExpired` | Perte vision `expired`, dans cette même version |
| Ce passage a son audio et attend en file vision | `visionExpired` | Perte vision `expired`, dans cette même version |
| Audio en vol lors de l’expiration, puis relais vers la vision sans média conservé | `visionExpired` | Perte vision `expired`, dans la version du résultat audio ; aucune perte audio inventée |
| Observation visuelle réussie, au premier ou au second essai | Aucun ; `visionRecovered` si second essai réussi | `PassageUpdated` visuel |
| Premier échec passager autorisant la redemande | `visionRetried` seulement au second appel réel | Aucun fait ni nouvelle révision intermédiaire |
| Erreur vision définitive, y compris lecture média ou second échec | `visionError` | `PassageUpdated` et une seule perte vision `error` |
| Miniature devenue disponible | Aucun | `PassageUpdated` ; la copie en history reçoit la même révision et le même drapeau |
| Miniature refusée alors qu’aucune n’était disponible | Aucun | Aucun fait : la disponibilité consultable reste fausse |
| Retrait média refusé puis retenté, émission répétée, pause ou issue disque | Aucun nouveau compteur de passage | Aucun nouveau fait ni révision sans autre changement |

L’expiration ne compte jamais une voie active comme perdue par anticipation. Le transfert en
`history` garde la révision acquise ; une miniature qui termine ensuite met à jour l’objet retenu
par l’ingestion et sa copie historique avant publication. Le nouvel essai conserve intégralement
les conditions et la relecture média de l’ADR 0008 : un succès et un échec final restent distincts,
et aucune troisième description n’est possible.

Un résultat fournisseur arrivé après fermeture est ignoré, sans enrichissement ni perte.
Un stockage déjà admis conserve son atterrissage réel et son fait de réception, comme dans
l’ADR 0045. Restaurer reste silencieux, même si les états interrompus sont décodés en erreurs.
Un refus d’admission ne crée aucun passage ; seule la suspension pour disque plein déjà prévue
peut être annoncée. Sauvegardes et barrières de fermeture restent des appels obligatoires.

## Alternatives écartées

- Un second compteur pour disponibilité et miniature : les lecteurs ont déjà `revision`.
- Publier une perte entre deux essais : annoncerait une perte qui peut encore être récupérée.
- Une révision par compteur augmenté dans la même transition : fabriquerait des versions
  intermédiaires sans consultation distincte.
- Déduire les faits du snapshot : ferait dépendre chaque notification du volume de la session.
- Migrer les consommateurs et normaliser les archives à révisions égales : travaux distincts ;
  `VideoTools` conserve son départage par ordre de lecture pour ces archives.

## Conséquences

Les abonnés peuvent relire un passage cohérent à chaque version publiée, indépendamment du disque.
Les faits ne prouvent toujours ni durabilité ni livraison durable. Les compteurs et décisions de
voie gardent leur sens ; sept attentes de révision suivent le contrat explicite du ticket, sans
modifier les passages historiques ni les témoins du corpus.
Aucun format d’archive, manifeste, index ou fil n’est migré. L’expiration est couverte tant que son
API existe ; cet ADR ne réactive aucune fenêtre dans les hôtes.

## Protégée par

`session-events` conduit ingestion, composition et lecture publique avec audio, vision, miniature
et sauvegarde retenus séparément. Il vérifie les formes exactes des faits, les compteurs, les
versions en history, les notifications répétées, les refus, la fermeture et la restauration.
Une suppression média retenue distingue la version expirée de la transcription qui arrive ensuite.
Les restaurations audio/vision interrompues décodent leurs pertes sans fait nouveau, y compris
après émission, pause et reprise. Un refus disque sur clip sans image ne crée aucune disponibilité
ni perte de passage inexistant.
`events` garde l’isolation des abonnés ; `session-latency`, `architecture-f08`, `split-perception`,
`session-durable`, `watch-session-ending` et les gardes protègent les invariants existants.
Le cas de `review-regressions` qui consulte des états historiques de même révision reste intact.
