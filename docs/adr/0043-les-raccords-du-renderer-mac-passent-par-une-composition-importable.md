# 0043 — Les raccords du renderer Mac passent par une composition importable

- Date : 2026-10-17
- Ticket : `docs/travail/tickets/203-deliver-the-renderer-s-wiring-through-one-tested-seam.md`
- Statut : acceptée

## Contexte

L’ADR 0025 rend importables la livraison des états et la composition des cartes chat, mais les
raccords de la fenêtre restent privés dans `app/renderer.js`. Le banc Mac cherche encore des fragments
JavaScript pour les recherches, les commandes chat, la surveillance, le résumé et la mémoire.
Ces assertions connaissent le placement du code sans prouver les effets d’une publication ou d’un clic.

## Décision

`createRendererWiring`, dans `app/ui/renderer-wiring.mjs`, compose les raccords ciblés. Le renderer
crée une instance et appelle `bind(actions)` après avoir assemblé ses autres vues et commandes.
Le banc importe cette même fabrique sans transformer ses imports ni reproduire ses callbacks.
Les dépendances sont le bridge, le document et son accès par ID, la fenêtre pour le déchargement,
le shell, les lectures de configuration, bibliothèque, aperçus et options de présentation, les
callbacks du chrome restant, les notifications et le temps injecté. `time.now` est en millisecondes
d’époque pour les dates des questions et cartes ; frames et minuteries sont également injectées.
Aucun accès à la page n’a lieu à l’import.

La composition possède la session et son index de passages, les questions, les vérifications, le
résumé et la référence de lecture de surveillance. Elle réutilise `createStateDelivery` et
`bindPushedStates` : session garde son groupe, questions et vérifications partagent chat ; le dessin
de session redessine aussi le chat. La surveillance conserve son regroupement frame/secours à
`FALLBACK_MS`, désormais possédé par cette même livraison sous son propre groupe.

Les vraies cartes passent par `createChatView` et `jobEntry`. Le résumé reçu passe par `reduceRecap`,
puis `renderRecapView` ; un changement de disponibilité des citations renouvelle leur présentation.
La mémoire lit la rétention de la session ouverte ou son entrée de bibliothèque, sans emprunter
celle de l’hôte. `nextSeen` fixe la référence du badge au premier état prêt ; la bannière affiche
le message du registre et la pile reçoit les seules cartes de la projection de surveillance.

`renderer-commands.mjs` contient les raccords de recherche, replay et vérification ainsi que le
répartiteur de clics. Il est assemblé par la fabrique, jamais recomposé dans le banc. Il réutilise
`createSearchController`, `replayTarget` et les règles de `chat-requests.mjs`. Les commandes lisent
l’état courant par callbacks ; une carte de recherche transporte sa propre session jusqu’au replay.
Reset et changement de session effacent la recherche et révoquent ses résultats en attente.
La construction DOM des cartes de passage est aussi partagée avec les copies conservées ; leur
disponibilité et leur callback de lecture sont fournis par le renderer, qui garde le protocole de ces copies.
Les actions de capture, la bibliothèque d’archives et l’historique détaillé de surveillance restent
composés dans leurs emplacements actuels.

`pullSession()` conserve la garde des questions après le `Promise.all` complet, même quand deep a
déjà répondu et qu’un résumé ou une surveillance retient encore le lot. Un refus deep se propage ;
les refus des deux lectures facultatives restent tolérés. Résumé et surveillance continuent d’être
adoptés quand la lecture deep est dépassée, et le dessin suit la dernière réponse de l’archive.
Les lectures initiales deep/vérification conservent leurs gardes distinctes et leurs effets sur les
contrôles prévus par l’ADR 0025.

`beforeunload` passe par `release()`. Cette libération idempotente retire les six abonnements,
le répartiteur de clics et son écouteur de déchargement, annule les frames, secours et minuterie
de pile, révoque les lectures et efface la recherche. Les publications et lectures déjà parties ne redessinent plus.
La libération native de capture reste détenue par `bindCaptureActions` et son contrôleur.

## Alternatives écartées

- Charger le renderer en réécrivant ses imports : conserverait une dépendance au texte de composition.
- Recopier les callbacks dans les tests ou tester seulement les projections : ne prouverait pas le raccord réel.
- Extraire toute la fenêtre et redécouper les sessions ou la surveillance : dépasserait les raccords concernés.

## Conséquences

Les publications, lectures retenues, formulaires, clics et désinscriptions se vérifient par les effets
du même assemblage que la page. Le document Mac reste distinct du document TV ; ses IDs proviennent
de la page et un ID requis absent échoue immédiatement. Les opérations DOM supportées restent limitées
aux besoins de ces preuves. Les gardes statiques d’imports, exports, IDs, CSP, bridge, retraits d’API
et contenu restent distinctes des tests de raccordement.

Les preuves ne garantissent ni peinture physique, ni capture native, ni fonctionnement d’Electron réel.

## Protégée par

- `tests/mac-ui.test.cjs` : les six groupes par la vraie composition, publications et DOM, commandes
  de bridge, lectures initiales et d’archive retenues, déchargement et libération.
- `tests/state-delivery.test.cjs` : courses frame/secours, groupes, fraîcheur et cartes réelles.
- `tests/mac-capture-actions.test.cjs` et `tests/mac-ipc-contract.test.cjs` : commandes de capture
  et frontière IPC conservées, sous doublures.
- Trois mutations isolées : abonnement deep débranché, garde tardive retirée et approfondissement
  détourné vers verify. Chacune échoue sur son effet, puis repasse après restauration ; sorties dans
  le dossier d’état du ticket.
