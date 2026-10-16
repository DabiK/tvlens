# 0033 — La surveillance confirme la livraison et retente seulement l'état courant

- Date : 2026-10-16
- Ticket : `docs/travail/tickets/187-guard-the-surveillance-tick-on-both-hosts-and-never-mark-a.md`
- Statut : acceptée

## Contexte

Le runtime marquait un statut de persistance comme annoncé avant le retour du callback hôte.
Un refus perdait sa notification, même après rétablissement de l'observateur. Le tick Mac
laissait remonter une exception du runtime ; le serveur l'absorbait sans diagnostic.
Une exception du tick du cœur empêchait aussi la tentative d'écriture déjà due.
Ces cas sont reproduits par observateurs, stores et minuteries conduits dans les tests.

## Décision

`runtime/surveillance-runtime.cjs` confirme `toldAs` seulement après le retour réussi de
`onChange`. Il garde le statut du dernier refus, même si la persistance reste `ready`,
sans conserver d'instantané ni de liste de notifications. Les changements continuent
de publier l'état courant ; un refus disque répété sous le même statut ne relance pas
la notification à lui seul.

Chaque tick peut rattraper une notification refusée, une seule fois, si aucune publication
n'a déjà été tentée pendant ce tick. Il reconstruit alors l'état courant. Une réussite
efface le refus. La reprise fonctionne aussi pendant une restauration encore en attente.
Reset, restauration et remplacement de session invalident le refus précédent ; un
callback qui change la session ne peut confirmer ensuite son ancien état.

Le `finally` du tick tente la sauvegarde due même si le cœur lève. La fonction partagée
`tickSurveillance` protège les appels périodiques des deux hôtes et signale
`TVLENS_SURVEILLANCE_TICK_FAILED`. Les refus de notification utilisent le contrat
`TVLENS_STATE_PUBLICATION_FAILED` de l'ADR 0032, avec l'origine `surveillance-runtime`.
Les deux diagnostics passent par le journal fourni par l'hôte et tolèrent son refus.
Ils ne deviennent ni une erreur du cœur ni un refus disque.

## Alternatives écartées

- Confirmer avant livraison : un observateur rétabli ne reçoit jamais le statut perdu.
- Comparer seulement les statuts confirmés : une notification du cœur sous `ready` peut être perdue aussi.
- Relancer depuis le diagnostic, par microtâche ou minuterie : une panne durable multiplierait les tentatives.
- Conserver toutes les notifications : les anciens statuts ne décrivent plus nécessairement la session courante.
- Rejouer immédiatement tout le tick : ses effets partiels ne sont pas annulés.

## Conséquences

Une livraison réussie ne se répète pas sans changement. Une panne persistante laisse le registre
consultable et ses écritures actives selon leur cadence. La maintenance serveur continue après
le refus de surveillance. Les règles de détection, formats disque et ordres de fin restent ceux
des ADR 0003, 0007 et 0024. La confirmation concerne le retour synchrone du callback,
pas un accusé de réception du client distant.

## Protégée par

`tests/surveillance-runtime.test.cjs` couvre reprise sans nouvel événement disque, borne
par tick, diagnostic défaillant, écriture due, `ready`, restauration et changements de session.
`tests/mac-ipc-contract.test.cjs` conduit les vrais intervalles du processus principal sans
Electron et observe le journal et la reprise de livraison. `tests/server-surveillance.test.cjs`
conduit l'intervalle du serveur et observe quota, disque et diagnostic. Les vues serveur et
l'ensemble des contrôles restent vérifiés par `node scripts/check.mjs`, en séquentiel.
