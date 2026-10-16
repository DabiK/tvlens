# 0022 — Le client Codex délègue les notifications et l’exécution des tours

- Date : 2026-10-16
- Ticket : `docs/travail/tickets/175-split-the-event-and-run-handling-of-the-codex-session-client.md`
- Statut : acceptée

## Contexte

Le client de session réunissait connexion, notifications et exécution d’un tour.
Avant extraction, `event` occupait 147 lignes physiques et `run` 122.
Les courses de connexion, le drain d’un tour refusé et la propagation des exceptions
de gestionnaire imposent de conserver un seul état et les garanties de l’ADR 0005.

## Décision

`adapters/codex-session-events.cjs` expose des fonctions nommées par notification.
Son répartiteur conserve l’ordre : diagnostic, fermeture, garde des fils étrangers,
drain, filtre du fil et du tour, garde des items, traitement de la notification.
Les fonctions reçoivent l’état du client et des effets explicites ; l’horloge est injectée.
Les choix de garde restent dans le client, qui transmet leur application au répartiteur.

`adapters/codex-session-run.cjs` exécute un tour en étapes : préparation, installation
de l’activité, démarrage et accusé de réception, interruption, watchdog et nettoyage.
Il reçoit le même état et les effets de préparation, drain, trace, horloge et minuteries.
La promesse de fin est créée une fois ; ses résolveurs sont publiés dans `client.active`.
Un rejet du tour garde priorité sur le rejet consécutif de `turn/start`, et un succès
attend toujours l’accusé de réception. Le quota reste informatif.

Le client garde sa façade et la possession de `rpc`, des fils, de l’activité, du drain
et de la fermeture de génération. `connect` reste inchangé : ses callbacks vérifient
l’identité du transport avant `event`, `tool` ou `onFault`. Les requêtes serveur restent
dans `tool`, distinctes des notifications. Aucun second transport ou état de session
n’est conservé par les modules extraits.

## Alternatives écartées

- Un contrôleur par module possédant sa copie de l’activité : il pourrait recevoir les événements d’une autre génération.
- Extraire aussi `connect` : hors périmètre ; sa barrière de génération reste lisible au même endroit.

## Conséquences

Les chemins de notification et de tour se testent sans processus Codex, avec état,
transport et effets enregistrés, promesses différées et temps piloté. Le protocole,
les délais, les résultats et les diagnostics sont conservés. Les fonctions extraites
et les délégations sont mesurées à 80 lignes physiques au plus, fonctions imbriquées comprises.

## Protégée par

- `tests/codex-session-events.test.cjs` et `tests/codex-session-run.test.cjs`.
- Les tests existants de confinement, courses, drain, rotation, abandon, traçage et décodage.
- `tests/codex-handler-failure.test.cjs` pour la propagation et la priorité des erreurs.
- La mesure AST du ticket et `node scripts/check.mjs`.
