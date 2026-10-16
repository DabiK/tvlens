# 0025 — La livraison des états Mac possède ses dessins et ses attentes

- Date : 2026-10-16
- Ticket : `docs/travail/tickets/183-deliver-the-pushed-state-of-the-mac-window-through-one-tested-seam.md`
- Statut : acceptée

## Contexte

`app/renderer.js` adoptait les états de session, questions et vérifications, puis regroupait leurs
dessins dans des fermetures liées à la page. Le secours à 100 ms ne possédait pas de moyen d’annuler
la frame et aucune observation importable ne délimitait le retour du dessin. Les cartes et leur
réconciliation sont déjà importables ; la garde de fraîcheur des lectures doit être conservée.

## Décision

`app/ui/state-delivery.mjs` expose `createStateDelivery`. Ses dépendances sont les sources avec leur
callback `adopt` et leur groupe, les callbacks synchrones `draws`, `now`, `requestFrame`,
`cancelFrame`, `setTimer` et `clearTimer`. Aucun accès au DOM, au bridge ou au navigateur n’a lieu
au chargement. `receive(source, state)` adopte immédiatement l’état ; `schedule(group)` demande un
dessin sans nouvelle réception. Un groupe possède une frame, un secours à 100 ms et la dernière
émission reçue de chaque source. Le premier callback arrivé retire ces deux attentes avant de dessiner.
Une ancienne frame ou minuterie ne peut pas consommer un nouveau groupe en attente.

Les observateurs optionnels `onReceived` et `onApplied` reçoivent `source`, `emissionId` (compteur
local à l’instance) et `receivedAt`. Le second reçoit aussi `appliedAt`, lu après le retour du dessin
synchrone. Seule la dernière émission de chaque source regroupée est observée comme appliquée.
Un dessin qui lève une erreur ne produit aucune observation d’application. Un dessin demandé sans
réception n’invente pas d’émission. Ces callbacks ne créent ni IPC, ni champ d’instantané, ni statistique
persistante. Ils sont destinés à des observateurs synchrones qui ne modifient pas la livraison.

`bindPushedStates` compose les trois abonnements du bridge, les deux lectures initiales et une garde
`createFreshness` distincte pour les questions et les vérifications. `beginDeepRead()` fournit au
renderer la garde de lecture des archives ; elle reste vérifiée après le `Promise.all` complet.
Les poussées mettent à jour les boutons après adoption et programmation ; la lecture initiale de
vérification le fait aussi, celle des questions conserve son comportement sans mise à jour immédiate.
Un état de session absent reste ignoré.

Le renderer conserve deux groupes : session et chat. Le dessin de session continue d’appeler le
chat ; le chat garde également son dessin programmé séparé. `app/ui/chat-view.mjs` extrait seulement
la composition de la liste, le statut de file, l’écho et le suivi du défilement. La page et les tests
appellent `createChatView`, qui utilise les vrais `jobEntry`, `verificationEntry`, `pendingEntry` et
`KeyedList`. Le contexte de session, les commandes et le budget restent dans le renderer. Les autres
consommateurs de `batched` restent en place. Le délai de secours est défini une seule fois par
`FALLBACK_MS`, exporté par `state-delivery.mjs` et utilisé aussi par `batched`.

`release()` est idempotent : la livraison annule ses frames et secours, puis refuse toute réception
ou programmation tardive. La libération du branchement retire aussi les abonnements, révoque les
lectures en cours et libère la livraison. Le renderer l’appelle à `beforeunload`.

## Alternatives écartées

- Réécrire le source du renderer pour le charger dans un test : la preuve dépendrait de son placement
  textuel et ne fournirait pas de couture réutilisable.
- Recopier la composition des cartes dans un test : elle pourrait diverger de la page réelle.
- Fusionner les dessins session et chat : changerait leur séparation actuelle et leur ordre observable.
- Ajouter une mesure de latence au produit : le scénario de mesure appartient au ticket suivant.

## Conséquences

La réception, les courses frame/secours, les lectures et la libération se conduisent sans Electron,
avec l’horloge commune et un document minimal. Une sonde peut réutiliser les observateurs et la vraie
composition des cartes. Les horodatages décrivent le retour du dessin DOM synchrone du groupe concerné,
pas une présentation physique de pixels ni nécessairement le premier dessin d’une carte par un autre
groupe. Les callbacks de dessin et d’observation restent synchrones. Aucun fournisseur ni matériel
n’est exercé par cette preuve.

## Protégée par

- `tests/state-delivery.test.cjs` : dernier état, observations autour des vraies cartes, deux ordres
  frame/secours, callbacks anciens pendant un nouveau lot, groupes séparés, fraîcheur des lectures,
  erreurs de dessin, citations mises à jour par la session et libération du branchement.
- `tests/mac-ui.test.cjs` : scénarios de fraîcheur existants et gardes de composition, imports, IDs,
  bridge et contrôles Mac conservés ; seule la garde de placement de la fraîcheur change de couture.
- Mutation temporaire retirant la garde d’identité du lot : le test du secours détecte les dessins
  supplémentaires, puis repasse après restauration.
