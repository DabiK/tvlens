---
id: T049
titre: Tell a panel drawing failure apart from a server outage on the TV
statut: a-faire
bloque_par: T028
adr: non
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
- Code vérifié à la version `0d5a954` (chercher par nom, les lignes bougeront) :
  - `tv/app/companion.js`, `poll()` (l.1155-1184) : un seul `try` entoure la lecture
    (`plan.read(client, state, monotonic)`) et ses suites — `renderStatus()` quand le corps est
    inchangé (`read.answer.notModified`), `receive(read.answer.value, read.view)` sinon. Le `catch` met
    `online = false`, écrit dans `#connection` « Appairage refusé par le serveur · vérifie le jeton de
    cette TV. » si `error.status === 401`, sinon « Serveur inaccessible · reconnexion… », puis
    désactive `#send`. Après le `try`, sans garde : `polling = false` et
    `pollTimer = setTimeout(poll, …)`. Une exception qui sortirait de `poll()` laisserait
    `polling` à `true` et aucune minuterie : le panneau ne lirait plus jamais.
  - `tv/app/companion.js`, `receive(next, viewName)` (l.1118-1134) : fusionne l'état puis appelle
    `render()` ; toute exception de dessin remonte dans le `catch` de `poll()`.
  - `tv/app/companion.js`, `TvlensPollPlan(options)` (l.248) : champs `turn`, `legacy`, `viewsAfter`,
    `failures` ; méthodes `policy`, `refused`, `read`, `delay`. `read` (l.277) incrémente `failures`
    quand la lecture lève et le remet à zéro à chaque lecture réussie : un dessin qui échoue après une
    lecture réussie ne peut donc pas être compté dans `failures` tel quel, il lui faut son propre
    compte, que `policy` (l.258) additionne à `failures` pour calculer le délai. Exports (l.364-377) :
    `pollPolicy`, `PollPlan` (l.370), `POLL`. `tvlensViewRefusal` (l.240).
  - `tv/app/remote-client.js`, `RemoteClient.prototype.poll` (l.68-85) : retient
    `this.held[route] = { tag, value }` dès la réponse et renvoie `If-None-Match` ensuite ; un 304 rend
    le corps retenu avec `notModified: true`. `RemoteClient.prototype.state` (l.87) construit la route
    à partir de la vue.
- Tests existants, dans `tests/tv-panel.test.cjs` : aide `drivePolls` (l.107), qui pilote
  `plan.read` puis `plan.delay` sur une horloge virtuelle ; « an outage backs the polls off even while
  a question runs, and the first answer restores the cadence » (l.145) ; « the transport revalidates
  with If-None-Match, keeps the body on 304 and never sends a tag it was not given » (l.188).
  `tests/tv-app-compat.test.cjs` garde la compatibilité du code de la TV.

## Périmètre

- À modifier : `tv/app/companion.js`, `tv/app/remote-client.js`, `tests/tv-panel.test.cjs`.
- Forme retenue (modèle : `TvlensPollPlan`, logique sans DOM exportée à côté du code d'écran) :
  - Le tour de lecture devient une fonction sans DOM, exportée avec `PollPlan`. Elle reçoit le client,
    le plan, l'état, l'horloge, la fonction de dessin (corps nouveau) et la fonction de
    rafraîchissement (corps inchangé), et rend l'une de quatre issues : inchangé, dessiné, panne (avec
    le statut), dessin échoué. La lecture et le dessin ont chacun leur `try`.
  - Elle ne rejette jamais : que le client lève, que le dessin lève ou que le rafraîchissement lève,
    elle rend une issue. C'est ce qui garantit que `poll()` atteint toujours `polling = false` et sa
    minuterie.
  - Sur un dessin échoué (dessin ou rafraîchissement), l'étiquette retenue pour la route lue est
    relâchée par une méthode nouvelle de `RemoteClient`, qui reçoit la vue lue (`read.view`) comme
    `state(view)` : la lecture suivante reçoit le corps entier.
  - Les échecs de dessin consécutifs sont comptés par le plan, à part de `failures`, et espacent les
    tours selon la même règle que les pannes ; un dessin réussi remet ce compte à zéro.
  - Le texte de `#connection` vient d'une fonction sans DOM, exportée. Les deux textes existants ne
    changent pas ; un troisième s'ajoute pour le dessin échoué : « Affichage interrompu · nouvel
    essai… ». Sur un dessin échoué, la connexion reste tenue pour bonne et `#send` n'est pas désactivé.
  - `poll()` ne garde que le câblage : appel de la fonction, écriture du texte, compteurs, minuterie.
- À ne pas toucher : le style du fichier (il tourne sur le navigateur de la TV) ; les textes existants ;
  la règle d'espacement des pannes et le sens de `failures` ; `#error` et sa durée de vie (reportés,
  décision de produit) ; les autres vues.

## Critères d'acceptation

Chaque critère se vérifie par un test ou une commande.

1. Tour de lecture avec un vrai `RemoteClient` devant un faux `fetch` qui répond 200 avec une
   étiquette, et une fonction de dessin qui lève : la promesse du tour est résolue, l'issue est
   « dessin échoué », pas « panne » ; le texte de connexion calculé est exactement « Affichage
   interrompu · nouvel essai… » ; l'issue dit que la connexion est bonne.
2. Tour suivant sur la même route : la requête part sans en-tête `If-None-Match` et le corps est remis
   à la fonction de dessin. Après un dessin réussi, le tour d'après renvoie l'étiquette.
3. Faux `fetch` qui répond 304 après un premier 200, fonction de rafraîchissement qui lève : la
   promesse du tour est résolue avec l'issue « dessin échoué », et le tour suivant part sans
   `If-None-Match`.
4. Dessins échoués consécutifs, pilotés sur une horloge virtuelle comme le fait `drivePolls` : la
   suite des délais rendus par `plan.delay` est égale à celle que le même plan, dans le même état,
   rend pour autant de pannes de lecture consécutives (la suite épinglée par le test « an outage
   backs the polls off… ») ; le premier dessin réussi rétablit la cadence normale ; `plan.failures`
   reste à zéro pendant toute la série.
5. Panne de lecture : la promesse du tour est résolue ; le texte calculé est exactement « Appairage
   refusé par le serveur · vérifie le jeton de cette TV. » pour un statut 401 et « Serveur
   inaccessible · reconnexion… » pour toute autre panne, et l'issue dit que la connexion est perdue.
6. `node --test --test-concurrency=1 tests/tv-panel.test.cjs tests/tv-app-compat.test.cjs` passe sans
   qu'aucune assertion existante soit modifiée.
7. `node scripts/check.mjs` est vert.

## Test d'acceptation attendu

Dans `tests/tv-panel.test.cjs`, par les exports du panneau (`PollPlan`, la fonction de tour, la
fonction de texte) et un vrai `RemoteClient` devant un faux `fetch` qui enregistre les en-têtes, comme
le test « the transport revalidates with If-None-Match… ». Aucun DOM n'est nécessaire. Le câblage dans
`poll()` (écriture de `#connection`, `#send`, minuterie) n'a pas de test hors ligne à cette version,
faute de DOM de test : il est relu, et réduit à des affectations sans branche autre que l'issue.

## Hypothèses bloquantes

Aucune décision n'est attendue. Le texte du troisième message est nouveau. Si le chargement du panneau
par les tests ne permet pas d'exporter une fonction de plus, ou si redessiner deux fois le même corps
(relu après un dessin échoué) change l'état tenu par le panneau : verdict BLOQUÉ, avec l'écart
constaté.

## Journal
