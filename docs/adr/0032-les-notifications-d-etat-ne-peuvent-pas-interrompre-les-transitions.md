# 0032 — Les notifications d'état ne peuvent pas interrompre les transitions

- Date : 2026-10-16
- Ticket : `docs/travail/tickets/186-keep-a-failed-state-publication-from-stalling-the-perception.md`
- Statut : acceptée

## Contexte

`WatchSession` et `DeepAsk` appelaient leurs observateurs directement. Une exception pouvait
interrompre le lancement d'une voie, le drainage d'une file, une sauvegarde ou la libération
des outils. Sur le serveur, le premier abonné défaillant empêchait les suivants de recevoir l'état.
Les bancs reproduisent aussi une sauvegarde de question omise après un refus d'envoi à la fenêtre Mac.

## Décision

`core/state-publication.cjs` protège chaque appel synchrone de notification des deux cœurs.
L'état acquis reste consultable par `snapshot()` ; la transition continue après une exception.
Chaque refus appelle le port injecté `onPublicationError` avec le code
`TVLENS_STATE_PUBLICATION_FAILED`, l'origine, l'identité de session ou de travail et l'erreur.
Un diagnostic qui lève est absorbé, sans nouvelle émission ni tentative récursive.

Les compositions partagées câblent ce port vers un journal actif indépendamment de la trace Codex.
Les deux hôtes le fournissent explicitement ; le diagnostic sérialise uniquement les champs d'erreur
autorisés par `safeError`, sans les ajouter aux états envoyés aux clients. Le serveur protège chaque
abonné séparément ; sa révision avance même si une livraison échoue. Le callback Mac tente la
sauvegarde des questions dans un `finally`, après sa tentative de publication. La remise à zéro
du chat conserve l'identité de la session quittée dans son diagnostic, même sans travail courant.

La VM du banc de latence résout les imports CommonJS relativement au module chargé. Ses minuteries
restent injectées ; les scénarios et assertions du banc conservent leurs contrats.

L'ADR 0003 reste applicable : publier et lancer le travail suivant précèdent l'attente du disque ;
pause et reprise attendent toujours leur sauvegarde. L'ADR 0004 reste applicable : une question
arrêtée ne rend ses outils qu'au retour effectif de son agent. Le plafond conserve son délai et
son résultat ; sa minuterie est construite dans une méthode dédiée pour garder `run` sous la limite
de longueur des standards.

## Alternatives écartées

- Protéger seulement les départs de voies : les fins, progressions et autres transitions resteraient fragiles.
- Renvoyer le refus vers l'erreur fournisseur : cela fausserait les pertes et remplacerait la cause métier.
- Réémettre depuis le diagnostic : un observateur défaillant pourrait provoquer une récursion sans fin.

## Conséquences

Une notification refusée ne prouve aucune livraison ; aucun rattrapage ni réparation d'observateur
n'est ajouté. Le journal peut lui-même perdre le diagnostic sans affecter le métier. Les erreurs
de fournisseur et de stockage gardent leur traitement. Les notifications de surveillance restent
un sujet distinct.

## Protégée par

`tests/split-perception.test.cjs`, `tests/session-latency.test.cjs`,
`tests/deep-ask-restore.test.cjs`, `tests/host-error-handling.test.cjs` et
`tests/mac-ipc-contract.test.cjs` : publications refusées, diagnostic défaillant, résultats,
files, sauvegardes, révisions, plafonds, annulations et libérations différées.
`node scripts/check.mjs` exécute les contrôles et les tests en séquentiel.
