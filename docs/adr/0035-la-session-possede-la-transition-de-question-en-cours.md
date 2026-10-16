# 0035 — La session possède la transition de question en cours

- Date : 2026-10-16
- Ticket : `docs/travail/tickets/190-let-the-watch-session-own-its-question-pending-state.md`
- Statut : acceptée

## Contexte

Les deux hôtes et le simulateur recopiaient l'affectation de `asking`, sa publication et la reprise
différée des voies. Le serveur comptait aussi les questions d'une autre session. Le callback Mac
relisait la session chargée et pouvait drainer B après le relâchement de A ; le banc IPC le reproduit.

## Décision

`WatchSession.setQuestionPending(busy)` possède un état privé, sa publication idempotente, la fin
de la mesure de retenue et une microtâche qui draine cette instance. `asking` reste lisible.
Une session ending ou closed met encore son état à jour et termine la retenue au relâchement,
sans publier ni programmer de drainage ; le drainage vérifie encore ces états.
`closeIntake()` ferme silencieusement les passages et verrouille les questions : leur fin tardive
ne rouvre pas leur admission. L'appel interne `ask()` passe aussi par la commande.

`hasPendingQuestion(jobs, sessionId)`, dans `runtime/conversation-runtime.cjs`, reconnaît seulement
les travaux queued ou running identifiés comme appartenant à la session. Les deux hôtes et les
bancs utilisent cette règle pour `asking`. Le serveur conserve explicitement son verrou `closing`
en plus. Les sondes de chevauchement et la priorité du résumé gardent leur règle de jobs actifs.

## Alternatives écartées

- Capturer seulement la référence Mac dans son callback : cela laisserait trois copies de la transition.
- Déduire la fermeture de l'absence de jobs : cela rouvrirait les questions pendant le démontage.

## Conséquences

Les appelants déclarent uniquement la présence de questions ; la session possède les effets.
Les cycles de vie des hôtes, checkpoints, restaurations, plafonds et règles de vision restent ceux
des ADR existants. Les questions historiques sans identité restent sauvegardables mais ne rendent
aucune session occupée. La surveillance conserve sa voie indépendante.

## Protégée par

`tests/split-perception.test.cjs`, `tests/session-latency.test.cjs` et
`tests/watch-session-ending.test.cjs` couvrent publication, retenue, reprise et fermeture.
`tests/conversation-runtime.test.cjs` couvre le filtre ; `tests/mac-ipc-contract.test.cjs` et
`tests/remote-server.test.cjs` couvrent son câblage, la course A/B et le verrou serveur.
L'inventaire des affectations protège la migration du simulateur ; le contrôle complet reste
`node scripts/check.mjs`.
