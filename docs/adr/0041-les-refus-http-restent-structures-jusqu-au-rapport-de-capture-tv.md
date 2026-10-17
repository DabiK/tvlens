# 0041 — Les refus HTTP restent structurés jusqu’au rapport de capture TV

- Date : 2026-10-17
- Ticket : `docs/travail/tickets/189-read-the-server-s-error-codes-in-the-tv-page-instead-of.md`
- Statut : acceptée

## Contexte

Le client JS conservait les codes HTTP, mais le plan de polling reconnaissait une phrase française.
Le rapport Python perdait les codes et le panneau déduisait lecture seule ou stockage plein des
nombres 409/507 trouvés dans ses diagnostics. Un conflit de séquence pouvait ainsi être présenté
comme une archive ouverte en lecture seule.

## Décision

Le rapport de capture ajoute `lastRefusal`, initialement `null`, puis `{ status, code }` au dernier
refus HTTP rencontré au démarrage ou pendant la livraison. Un code absent vaut `null`. Un succès
ou une panne réseau conserve ce dernier refus ; aucune file ni nouveau protocole versionné n’est
ajouté. Le contrôleur transmet le rapport entier sur `/capture`, comme auparavant.

Le démarrage et la livraison reconnaissent la lecture seule par `read-only`, le stockage plein par
`storage-full`, avec un repli pour le 507 sans code des anciens serveurs. Un autre 409 reste un refus
générique ; les conflits de séquence rejettent leur bloc sans reprise ni arrêt pour lecture seule.
Les délais, limites et compteurs de livraison ainsi que la première cause d’arrêt restent inchangés.

`describeCapture` lit `lastRefusal`, les raisons locales `stopReason`/`connection` et le contexte
serveur. `errors` reste un diagnostic affiché comme texte. Un ancien rapport sans `lastRefusal`
garde ses raisons structurées ; ses seuls textes n’identifient aucun statut.

Pour une lecture de vue, le plan de polling utilise 400 `unknown-view`, ou 404 sans code ou avec
`route-not-found`, pour le repli permanent. Les autres 400 gardent le repli temporaire. Les 401,
5xx et refus étrangers ne deviennent pas une vue inconnue. Aucun message ne sert à classifier.

## Alternatives écartées

- Conserver les regex de messages pour les anciennes versions : maintiendrait l’ambiguïté des 409.
- Conserver tous les refus : une file élargirait le rapport sans aider la décision affichée.
- Introduire un contrat versionné : le champ additif suffit pour cette migration bornée.

## Conséquences

Une reformulation ne change plus le repli ni le diagnostic de capture. Les anciens serveurs restent
compatibles sur les statuts non ambigus 404/507. Les anciens rapports ne portant qu’un texte 409
restent lisibles avec un diagnostic générique. Aucun démarrage ni redémarrage automatique n’est ajouté.
La validation hors ligne ne prétend pas valider le moteur d’une TV réelle.

## Protégée par

`tests/tv-chat-model.test.cjs` et `tests/tv-poll-controller.test.cjs` font varier texte et code sur
le modèle et les lectures réelles. `tests/test_tv_control.py` vérifie la conservation des refus,
les pertes, les reprises et le relais HTTP. `tests/test_tv_capture.py` compare les vrais rapports
de démarrage à `tests/fixtures/tv-capture-refusals.json` et conduit les refus de livraison.
`tests/tv-panel.test.cjs` et `tests/tv-paired-page.test.cjs` rendent cette même fixture, puis vérifient
les anciens diagnostics et le texte brut dans les scripts classiques de la page appairée.
