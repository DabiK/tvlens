# 0027 — Une vue possède les cartes et les envois du chat TV

- Date : 2026-10-16
- Ticket : `docs/travail/tickets/171-keep-tv-chat-cards-and-submission-state-inside-one-view.md`
- Statut : acceptée

## Contexte

`tv/app/companion.js` détenait le registre des cartes, leur signature de rendu, la progression,
l'écho d'envoi et le verrou de soumission. Le polling dispose déjà de son contrôleur injecté
(ADR 0026), et les règles de présentation vivent dans `chat-model.js`. Une réponse d'envoi
arrivant après un changement de session pouvait encore vider le champ de la nouvelle conversation.

## Décision

`tv/app/chat-view.js` expose `TVLensChatView.createChatView`, en script classique et par CommonJS
selon l'ADR 0011. `index.html` le charge après les modèles et avant le companion. La fabrique reçoit
`document`, `elements(id)`, `model`, `text`, `now` (horloge monotone), `isReading` et `actions`.
Les actions injectées sont `ask(question, sessionId, anchorMs, range)`, `cancel(id)`, `kick()`
et `onSubmit()`.

La vue possède son registre de cartes, les signatures, le début local de progression et l'envoi en
cours. Ces champs restent privés ; le companion ne recopie aucun registre ni verrou. L'interface est :

- `receive(snapshot, receivedAt)` reçoit le snapshot déjà fusionné et l'instant monotone de réception
  du corps. Elle réinitialise la conversation si l'identifiant de session change, réutilise les articles
  par identifiant de job et ne reconstruit leurs enfants que si le job ou la disponibilité des citations
  change. Le contenu réseau est écrit par `textContent`.
- `tick()` met à jour uniquement les lignes de progression avec les modèles existants. Le temps serveur
  s'extrapole depuis le dernier corps ; sans horodatage serveur, le temps local commence à la première
  observation du job running. Le companion appelle cette méthode dans son intervalle existant.
- `setOnline(online)` recalcule la disponibilité d'envoi sans rendre les cartes ni modifier leur horloge.
  Un 304 emprunte cette voie ; le contrôleur n'appelle pas `receive` pour cette réponse.
- `submit(target)` reçoit `{ sessionId, ms, range? }` et en copie les valeurs avant l'attente. La vue
  lit le texte, ajoute l'écho, verrouille l'envoi et remet le focus à Dicter immédiatement. `onSubmit`
  libère le témoin global du clavier et l'ancre de composition. Aucun retour réseau ne déplace le focus.
- `reset()` déconnecte les cartes et invalide l'envoi en cours. Son retour tardif ne modifie plus les
  cartes, le texte, les erreurs ou la disponibilité d'une nouvelle conversation.

Sur succès, l'écho devient le job reçu, ou disparaît si le polling a déjà créé ce job. La saisie n'est
vidée que si son texte correspond encore à l'envoi ; `kick` accélère le contrôleur existant. Sur refus,
l'écho disparaît, la saisie reste disponible et l'erreur est affichée. Une identité d'envoi empêche aussi
le `finally` d'une ancienne promesse de libérer un nouvel envoi après réinitialisation.

Le snapshot partagé, sa fusion, la sélection de moment, l'ancre et la navigation globale restent dans
le companion. Les citations et les sources restent affichées comme texte. Hors envoi, le défilement
suit le bas si le spectateur s'y trouve déjà. L'écho immédiat et le premier rendu après l'accusé d'envoi
suivent le bas même si la liste avait été remontée. Dans tous les cas, une lecture active ou le focus
dans la conversation, y compris ses descendants, empêche ce déplacement. Le suivi demandé après
l'accusé est consommé au premier rendu ; il ne provoque pas de saut différé à la sortie de lecture.

## Alternatives écartées

- Garder un verrou ou un registre dans chaque propriétaire : imposerait une synchronisation entre
  composition et vue lors des réponses différées et des changements de session.
- Confier les cartes au contrôleur de polling : mélangerait la présentation avec les lectures réseau.
- Créer un intervalle dans la vue : ajouterait une cadence à libérer alors que le companion possède
  déjà celle de la progression. La vue ne crée aucune minuterie.

## Conséquences

La conversation se teste par son DOM et ses actions, sans fournisseur ni attente réelle. La composition
reste responsable des autres vues et de la politique d'ancrage. Le banc public `window.tvlensPanel`
conserve `stats`, `kick`, `state` et `stop`. Le reset invalide les effets de l'envoi, sans annuler la
requête physique. Les preuves du DOM minimal n'affirment pas une validation sur le moteur réel de la TV.

## Protégée par

- `tests/tv-chat-view.test.cjs` : articles réutilisés, texte brut, citations et sources, libellés,
  progression monotone, soumissions différées, déduplication, erreurs, reset, annulation et défilement.
- Ses cas appairés chargent le formulaire et les scripts réels : envoi lié à un moment, clavier libéré
  avant HTTP, réponse d'ancienne session ignorée, 304 et timeline conservée.
- `tests/tv-panel.test.cjs` : garde des littéraux de durée étendue à la vue sans changer ses assertions.
- Tests existants des modèles, du polling, de la page appairée, des erreurs, de la navigation et de
  compatibilité : contrats publics conservés.
- Mutation retirant la déduplication à l'accusé d'envoi : le test observe deux articles au lieu d'un.
  La sortie rouge est consignée dans le dossier d'état du ticket et la mutation est retirée.
