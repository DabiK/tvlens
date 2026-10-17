# 0045 — Les faits de mémoire sont livrés par un diffuseur isolé après leur transition

- Date : 2026-10-17
- Ticket : `docs/travail/tickets/206-publish-bounded-passage-events-after-memory-transitions.md`
- Statut : acceptée

## Contexte

`WatchSession` publie son snapshot par `onChange`, protégé depuis l'ADR 0032. Les ADR 0029 et 0030
prévoient aussi des faits légers après transition, sans confier aux abonnés les obligations de
durabilité ou de fermeture. Les deux hôtes partagent `runtime/session-runtime.cjs` ; aucun lecteur
actuel ne doit changer de contrat pour introduire les premières notifications.

## Décision

`core/shared/events.cjs` expose `createEventPublisher({ onError })`. `subscribe(listener)` rend une
fonction de désabonnement idempotente ; chaque abonnement possède un identifiant numérique local
au diffuseur. `publish(message)` livre synchroniquement dans l'ordre d'abonnement et rend `undefined`.
Une publication pendant la livraison attend dans une file FIFO, sans livraison récursive. La liste
des abonnés est fixée au début de chaque livraison : abonnement et désabonnement intervenant pendant
celle-ci prennent effet au message suivant, y compris pour les messages déjà mis en file.

Le diffuseur copie récursivement puis gèle les données simples du message dès sa publication,
avant sa mise en file. Un abonné ne peut donc modifier ce que recevront les suivants, et l'émetteur
garde ses propres objets modifiables. Chaque abonné est isolé : exception et rejet de promesse
produisent `TVLENS_EVENT_DELIVERY_FAILED`, avec le message borné dans `event`, `subscriberId` et
l'erreur réservée au diagnostic. Le diagnostic injecté est lui-même protégé contre exception et
rejet, sans nouvelle publication ni diagnostic récursif. Aucune promesse d'abonné ou de diagnostic
n'est attendue ; aucun accès au temps ni aucune dépendance externe n'est nécessaire.

`WatchSession` enregistre deux faits dans une file privée puis la vide avant tout callback, lors
de la publication de la transition. Son port synchrone `onEvents` remet le lot à la composition
partagée, qui appelle le diffuseur injecté par l'option `events`, construit par défaut avec
`onPublicationError`. La façade expose ce même `events` pour abonnement. Le port est protégé
séparément de `onChange` ; aucun snapshot n'est nécessaire pour construire ou livrer les messages.
Un passage admis qui atterrit après une fermeture directe du cœur conserve son fait de réception,
même quand la publication d'état est déjà silencieuse.

| Type | Moment | Identités et données |
| --- | --- | --- |
| `PassageReceived` | Après stockage accepté et ajout effectif à la mémoire | `sessionId`, `passageId`, `revision` courante et `interval: { startMs, endMs }` |
| `AdmissionSuspended` | Après fermeture de l'admission pour disque plein | `sessionId`, `passageId: null`, `revision: null`, `cause: { code: 'TVLENS_STORAGE_FULL' }` et intervalle refusé |

La réception copie la révision initiale existante, sans la faire avancer. Les enrichissements
audio et vision conservent leurs incréments actuels. Le refus disque conserve son erreur d'origine,
n'ajoute aucun passage et transmet uniquement son code structuré dans le fait. La suspension est
enregistrée seulement si ce refus ferme une admission encore ouverte. Les autres écritures déjà
admises conservent leur refus et leur sauvegarde, sans nouveau fait après une première suspension
ou une fermeture par `stop()`, `closeIntake()` ou `close()`. Aucun texte de
perception, média, objet `Error`, snapshot ou liste de passages n'entre dans ces messages.

Les files se vident après livraison ; aucun historique ni rejeu n'est conservé. Restaurer reste
silencieux, sans `MemoryReopened`. Les enrichissements et pertes n'ajoutent aucun événement ici.
`onChange` conserve ses points d'émission, sa signature et ses lecteurs. Sauvegarde, révocation
et fermeture restent des appels explicites, indépendants des notifications.

## Alternatives écartées

- Livrer récursivement : le second fait pourrait atteindre un abonné avant le premier.
- Attendre les promesses : un seul abonné jamais réglé retiendrait perception et sauvegardes.
- Réutiliser le snapshot comme message : son volume croît et il contient des données inutiles aux faits.
- Migrer l'index ou les autres lecteurs dès maintenant : leurs critères d'éligibilité restent un travail distinct.

## Conséquences

Les premiers faits sont accessibles aux deux hôtes par leur composition commune, sans migration
des consommateurs. Le noyau partagé utilise les permissions exactes déjà déclarées par l'ADR 0044
et n'importe aucun contexte. Un échec de notification ne remplace jamais une erreur métier.
Un callback synchrone doit rester court : l'isolation n'interrompt pas du calcul arbitraire.
Les diagnostics et faits ne constituent aucune preuve de sauvegarde ou de livraison durable.

## Protégée par

`tests/events.test.cjs` vérifie ordre synchrone, FIFO imbriquée, modifications d'abonnement,
absence de rejeu, copie immuable, exceptions, rejets et promesses jamais réglées, diagnostic compris.
`tests/session-events.test.cjs` conduit le vrai cœur et la composition publique, avec écritures
et fournisseurs contrôlés : état établi, réceptions uniques, voies et sauvegardes, refus disque
sans passage, refus concurrents et après fermeture, fin avec fournisseur tardif et restauration
silencieuse sans changement de révision.
Les suites split-perception, session-durable, watch-session-ending et les gardes conservent leurs
assertions ; `node scripts/check.mjs` exécute les contrôles complets en séquentiel.
