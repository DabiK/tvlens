# 0026 — Un contrôleur injecté possède la boucle de polling TV

- Date : 2026-10-16
- Ticket : `docs/travail/tickets/170-move-tv-polling-into-an-injected-controller.md`
- Statut : acceptée

## Contexte

`tv/app/companion.js` détenait la requête en cours, l'accélération, le timer de polling et les
statistiques. La boucle réarmait toujours son timer, sans commande d'arrêt. Les tests de `PollPlan`
prouvaient la politique de lecture, mais ne conduisaient pas la boucle pendant une requête différée.
Le banc appairé permet désormais d'exercer les vrais scripts avec réseau et minuteries contrôlés.

## Décision

`tv/app/poll-controller.js` expose `TVLensPollController.createPollController` sur la page et par
CommonJS, suivant l'ADR 0011. `index.html` le charge après `chat-model.js`, avant le companion.
La fabrique reçoit `client`, `now` (horloge monotone), `setTimer`, `clearTimer`, `getState`,
`onReceive`, `onNotModified`, `onError` et les réglages existants de cadence et de repli.
Elle réutilise `PollPlan` sans changer ses règles ni le transport HTTP.

Le contrôleur possède une seule lecture en vol et un seul timer. `start` démarre immédiatement,
une seule fois ; `request` annule l'attente ou mémorise une accélération pendant la lecture.
Plusieurs accélérations pendant la même lecture conduisent à une seule lecture supplémentaire,
programmée avec un délai nul avant le retour à la cadence du plan.

`stop` est idempotent et définitif pour l'instance, même avant son démarrage. Il supprime son timer
et invalide la continuation de la lecture en cours : aucun callback, compteur public ou timer
n'est modifié par sa résolution tardive. Il ne demande pas d'annulation réseau au client.
Une nouvelle instance est nécessaire pour redémarrer après un arrêt.

Le companion compose le contrôleur avec ses callbacks et conserve l'état affiché. Un corps reçu
passe à `receive` avec sa vue ; un 304 ne fait que rétablir la connexion et rafraîchir le statut.
Les erreurs gardent le message propre au 401 et désactivent l'envoi hors ligne.
`stats` conserve `polls` (lectures abouties, repli compris), `notModified`, `renders`, `legacy` et
`failures` (échecs consécutifs). La présentation continue à incrémenter `renders`.

`window.tvlensPanel` conserve `stats`, `kick` et `state`, et expose `stop`. Les deux intervalles
locaux de présentation restent dans le companion avec leur branchement existant ; arrêter le
polling ne les arrête pas. Le nettoyage du banc appairé garde lui aussi son contrat existant.

## Alternatives écartées

- Tester seulement `PollPlan.delay` : ne prouve ni absence de concurrence, ni callbacks, ni arrêt.
- Déplacer les cartes ou l'état d'envoi dans le contrôleur : mêlerait présentation et lecture d'état.
- Ajouter une annulation au client HTTP : élargirait le contrat de transport sans nécessité pour
  empêcher une réponse tardive de toucher la page.
- Arrêter aussi les intervalles de présentation : leur propriétaire et leur cycle restent distincts
  du timer de polling dans cette extraction.

## Conséquences

La boucle se conduit sans DOM, sans sommeil et sans réseau réel. L'injection rend les attentes et
les réponses tardives observables ; la composition de page conserve les messages et les rendus.
L'ordre des scripts reste une dépendance explicite. L'arrêt invalide les effets de page et laisse
la requête physique se terminer selon le contrat existant du client. Ces preuves hors ligne
n'affirment aucun fonctionnement sur une TV réelle.

## Protégée par

- `tests/tv-poll-controller.test.cjs` : commandes, regroupement des accélérations, timer annulé,
  réception 200/304, replis définitifs et temporaires, erreurs, backoff et arrêt différé avec
  `manualClock` et promesses différées.
- `tests/tv-paired-page.test.cjs` : vraies balises, lecture par `kick`, arrêt sans effet tardif,
  intervalles de présentation conservés, messages hors ligne et reconnexion par 304 sans rendu.
- `tests/tv-panel.test.cjs`, `tests/tv-chat-model.test.cjs`, `tests/tv-remote-navigation.test.cjs`
  et `tests/tv-app-compat.test.cjs` : contrats existants, navigation et scripts classiques.
- Mutation temporaire retirant la garde en vol : le test de regroupement échoue sur les requêtes
  concurrentes ; sortie rouge et restauration consignées au journal du ticket.
