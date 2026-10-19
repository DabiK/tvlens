---
id: T049
titre: Tell a panel drawing failure apart from a server outage on the TV
statut: a-faire
bloque_par: T294
adr: oui
installe: non
harnais: non
supprime_tests: non
---

## Ce que le ticket livre

Sur la TV, une exception levée en dessinant un état reçu est prise pour une panne du serveur : le
panneau affiche « Serveur inaccessible · reconnexion… », désactive l'envoi, et comme le corps reçu est
déjà retenu avec son étiquette, les lectures suivantes répondent 304 et ne redessinent rien. Après ce
ticket, un échec de dessin a son propre message, n'éteint pas la connexion, fait relire le corps au
tour suivant et espace les tours comme une panne.

## Sources

- Constats : TV-05
- Code vérifié à la version `1178657` (chercher par nom, les lignes bougeront). Depuis `0d5a954`, la boucle de
  lecture a quitté `companion.js` pour un contrôleur injecté (ADR 0026), et le plan pour `chat-model.js` :
  - `tv/app/poll-controller.js`, `createPollController(options)` (l.6-58), `poll()` (l.17-45) : un seul `try`
    (l.28-39) entoure la lecture (`plan.read(options.client, options.getState(), options.now)`) et ses suites —
    `options.onNotModified()` quand le corps est inchangé (`read.answer.notModified`),
    `options.onReceive(read.answer.value, read.view)` sinon. Le `catch` appelle `options.onError(error)`. Après le
    `try`, sans garde (l.40-44) : `stats.legacy`, `stats.failures`, `polling = false`, puis
    `timer = options.setTimer(poll, …)`. Une exception qui sortirait de `poll()` laisserait `polling` à `true` et
    aucune minuterie : le panneau ne lirait plus jamais. `request` est `poll` lui-même (l.57) ; `stats` (l.13) a
    cinq champs.
  - `tv/app/companion.js`, options du contrôleur (l.591-627) : `onReceive` (l.608-612) met `online = true`, appelle
    `chatView.setOnline(true)` puis `receive(value, viewName)` ; `onNotModified` (l.613-617) appelle
    `renderStatus()` ; `onError` (l.618-626) met `online = false`, écrit dans `#connection` « Appairage refusé par
    le serveur · vérifie le jeton de cette TV. » si `error.status === 401`, sinon « Serveur inaccessible ·
    reconnexion… », puis appelle `chatView.setOnline(false)`, qui désactive `#send` (`tv/app/chat-view.js`,
    `renderAvailability` l.163-166, `setOnline` l.233-236).
  - `tv/app/companion.js`, `receive(next, viewName)` (l.576-590) : fusionne l'état puis appelle `render()`
    (l.526) ; toute exception de dessin remonte dans le `catch` de `poll()`, donc dans `onError`. `renderStatus()`
    (l.505-525) n'écrit rien quand `online` est faux ; un intervalle l'appelle chaque seconde (l.663-666).
  - `tv/app/chat-model.js`, `TvlensPollPlan(options)` (l.226-235) : champs `turn`, `legacy`, `viewsAfter`,
    `failures` ; méthodes `policy` (l.236), `refused` (l.245), `read` (l.255-273), `delay` (l.275). `read`
    incrémente `failures` quand la lecture lève et le remet à zéro à chaque lecture réussie : un dessin qui échoue
    après une lecture réussie ne peut donc pas être compté dans `failures` tel quel, il lui faut son propre compte,
    que `policy` additionne à `failures` pour calculer le délai (`tvlensPollPolicy`, l.192-212). Exports
    (l.336-350) : `pollPolicy`, `PollPlan`, `POLL` ; `companion.js` les réexporte (l.20-35). `tvlensViewRefusal`
    (l.215).
  - `tv/app/remote-client.js`, `RemoteClient.prototype.poll` (l.70-87) : retient
    `this.held[route] = { tag, value }` dès la réponse et renvoie `If-None-Match` ensuite ; un 304 rend le corps
    retenu avec `notModified: true`. `RemoteClient.prototype.state` (l.89-91) construit la route à partir de la vue.
  - Listes épinglées par des assertions existantes : exports de `companion.js` (`tests/chat-error-ui.test.cjs:18`,
    `tests/tv-chat-model.test.cjs:79`) et de `chat-model.js` (`tests/tv-chat-model.test.cjs:34-37`) ; les cinq
    champs de `stats` (`deepEqual` dans `tests/tv-poll-controller.test.cjs` et `tests/tv-paired-page.test.cjs`). Les
    exports de `poll-controller.js` (`{ createPollController }`, l.59) ne sont épinglés par aucun test.
- ADR 0026 (`docs/adr/0026-un-controleur-injecte-possede-la-boucle-de-polling-tv.md`) : une seule lecture en vol, un
  seul timer, `stop` définitif, accélérations regroupées ; les erreurs gardent le message propre au 401 et
  désactivent l'envoi hors ligne.
- Tests existants :
  - `tests/tv-panel.test.cjs` : aide `drivePolls` (l.111), qui pilote `plan.read` puis `plan.delay` sur une horloge
    virtuelle ; « an outage backs the polls off even while a question runs, and the first answer restores the
    cadence » (l.149) ; « the transport revalidates with If-None-Match, keeps the body on 304 and never sends a tag
    it was not given » (l.192).
  - `tests/tv-poll-controller.test.cjs` : `setup` (l.11-28), contrôleur sur `manualClock` ; « network failures back
    off to eight seconds for an … session and a success restores its cadence » (l.178-200) épingle les instants
    0, 1000, 3000, 7000, 15000 et 23000 ms ; « internal server errors through the remote client back off without
    declaring an unknown view » (l.202-232) passe par un vrai `RemoteClient`.
  - `tests/tv-paired-page.test.cjs` : les vrais scripts de la page sur le banc `loadTvPage`
    (`tests/helpers/tv-page.cjs`) ; « the paired page preserves its offline send state after … until a 304
    reconnects » (l.510-556) vérifie `#connection` et `#send`.
  - `tests/tv-app-compat.test.cjs` garde la compatibilité du code de la TV.

## Périmètre

- À modifier : `tv/app/poll-controller.js`, `tv/app/chat-model.js`, `tv/app/companion.js`,
  `tv/app/remote-client.js`, `tests/tv-poll-controller.test.cjs`, `tests/tv-panel.test.cjs`,
  `tests/tv-paired-page.test.cjs`.
- Forme retenue (modèle : le contrôleur injecté de l'ADR 0026, logique sans DOM exportée à côté du code d'écran) :
  - Le tour de lecture est le `poll()` du contrôleur, déjà sans DOM. La lecture et le dessin (`onReceive` pour un
    corps nouveau, `onNotModified` pour un corps inchangé) y ont chacun leur `try`. Le tour a l'une de quatre
    issues : inchangé, dessiné, panne (avec le statut), dessin échoué. Un dessin échoué est remis au companion par
    un rappel distinct de `onError` ; `onError` ne reçoit que les pannes de lecture.
  - Le tour ne rejette jamais : que le client lève, que le dessin lève ou que le rafraîchissement lève, la promesse
    rendue par `request()` est résolue. C'est ce qui garantit que `poll()` atteint toujours `polling = false` et sa
    minuterie.
  - Sur un dessin échoué (dessin ou rafraîchissement), l'étiquette retenue pour la route lue est relâchée par une
    méthode nouvelle de `RemoteClient`, qui reçoit la vue lue (`read.view`) comme `state(view)` : la lecture
    suivante reçoit le corps entier.
  - Les échecs de dessin consécutifs sont comptés par le plan (`TvlensPollPlan`), à part de `failures`, et espacent
    les tours selon la même règle que les pannes ; un dessin réussi remet ce compte à zéro. `stats` garde ses cinq
    champs.
  - Le texte de `#connection` vient d'une fonction sans DOM, exportée par un script dont la liste d'exports n'est
    épinglée par aucun test (`poll-controller.js` à `1178657`). Les deux textes existants ne changent pas ; un
    troisième s'ajoute pour le dessin échoué : « Affichage interrompu · nouvel essai… ». Sur un dessin échoué, la
    connexion reste tenue pour bonne et `#send` n'est pas désactivé.
  - Le companion ne garde que le câblage : rappels, écriture du texte, `online`, `chatView.setOnline`.
- À ne pas toucher : le style du fichier (il tourne sur le navigateur de la TV) ; les textes existants ; la règle
  d'espacement des pannes et le sens de `failures` ; `#error` et sa durée de vie (reportés, décision de produit) ;
  les autres vues ; les décisions de l'ADR 0026 (une lecture en vol, `stop` définitif, accélérations regroupées) ;
  les listes d'exports de `companion.js` et de `chat-model.js`.
- Hors boucle, par l'orchestrateur, après intégration : contrôle réel sur la TV :
  1. déployer `tv/app` depuis un tag, avec sauvegarde et retour arrière prêt, sans toucher au fichier d'appairage ;
  2. ouvrir le panneau sur une vidéo YouTube : la frise et le chat se dessinent, une question reçoit sa réponse,
     `#connection` suit la capture comme avant ;
  3. écrire le résultat dans `experiments/essais/`. Un dessin échoué n'est pas provoqué sur la TV : il reste prouvé
     par les tests.

## Critères d'acceptation

Chaque critère se vérifie par un test ou une commande.

1. Tour du contrôleur avec un vrai `RemoteClient` devant un faux `fetch` qui répond 200 avec une étiquette, et un
   `onReceive` qui lève : la promesse du tour est résolue ; l'issue est « dessin échoué », pas « panne » (`onError`
   n'est pas appelé) ; le texte de connexion calculé est exactement « Affichage interrompu · nouvel essai… » ;
   l'issue dit que la connexion est bonne.
2. Tour suivant sur la même route : la requête part sans en-tête `If-None-Match` et le corps est remis à
   `onReceive`. Après un dessin réussi, le tour d'après renvoie l'étiquette.
3. Faux `fetch` qui répond 304 après un premier 200, `onNotModified` qui lève : la promesse du tour est résolue avec
   l'issue « dessin échoué », et le tour suivant part sans `If-None-Match`.
4. Dessins échoués consécutifs, pilotés sur une horloge virtuelle (`manualClock`, comme `setup`) : la suite des
   instants de lecture est égale à celle que le même contrôleur, dans le même état, suit pour autant de pannes de
   lecture consécutives (la suite épinglée par « network failures back off to eight seconds… » et par « an outage
   backs the polls off… ») ; le premier dessin réussi rétablit la cadence normale ; `stats.failures`, copie de
   `plan.failures`, reste à zéro pendant toute la série.
5. Panne de lecture : la promesse du tour est résolue ; le texte calculé est exactement « Appairage refusé par le
   serveur · vérifie le jeton de cette TV. » pour un statut 401 et « Serveur inaccessible · reconnexion… » pour
   toute autre panne, et l'issue dit que la connexion est perdue.
6. Sur le banc appairé (`loadTvPage`, vrais scripts de la page), juste après un tour dont le dessin lève :
   `#connection` porte exactement « Affichage interrompu · nouvel essai… » et `#send` reste actif.
   Le message reste affiché au rafraîchissement suivant de l'état de connexion, et disparaît au premier dessin
   réussi. Le contrat de lecture décrit par l'ADR 0026 est mis à jour.
7. `node --test --test-concurrency=1 tests/tv-panel.test.cjs tests/tv-poll-controller.test.cjs
   tests/tv-paired-page.test.cjs tests/tv-chat-model.test.cjs tests/chat-error-ui.test.cjs
   tests/tv-app-compat.test.cjs` passe sans qu'aucune assertion existante soit modifiée.
8. `node scripts/check.mjs` est vert.

## Test d'acceptation attendu

Dans `tests/tv-poll-controller.test.cjs`, par `createPollController`, la fonction de texte et un vrai
`RemoteClient` devant un faux `fetch` qui enregistre les en-têtes, comme le test « internal server errors through
the remote client… » et le test « the transport revalidates with If-None-Match… » de `tests/tv-panel.test.cjs`.
Aucun DOM n'est nécessaire. Le câblage du companion (`#connection`, `#send`) se prouve sur le banc appairé de
`tests/tv-paired-page.test.cjs`, comme le test « the paired page preserves its offline send state… » : ce banc
n'existait pas à `0d5a954`.

## Hypothèses bloquantes

Aucune décision n'est attendue. Le texte du troisième message est nouveau. Si aucun script ne peut exporter une
fonction de plus sans modifier une assertion existante, ou si redessiner deux fois le même corps (relu après un
dessin échoué) change l'état tenu par le panneau : verdict BLOQUÉ, avec l'écart constaté.

## Journal

- 19/10, orchestrateur : rouvert sur décision du propriétaire (sélection du tri d'Astra) ; sources mises à jour à
  `1178657` ; bloqueurs revus : T145 retiré (file rouverte) ; T028 retiré (reformatage Prettier jamais lancé, encore
  à faire : ce ticket n'a pas besoin de son code) ; T294 ajouté (passe après la file en cours). La boucle de
  lecture vit désormais dans `poll-controller.js` (ADR 0026) et le plan dans `chat-model.js` : forme, périmètre et
  critères recalés sur le contrôleur, sans changer les textes, la règle d'espacement ni les issues attendues. Les
  exports de `companion.js` et `chat-model.js` étant épinglés, la fonction de texte va dans un script non épinglé.
  Le banc appairé rend le câblage testable hors ligne : critère 6 ajouté. Contrôle réel sur la TV ajouté au
  périmètre.
- 19/10, orchestrateur : `adr: oui`, le ticket change le contrat de l'ADR 0026 ; le message de dessin échoué reste affiché jusqu'au prochain dessin réussi (critère 6).
