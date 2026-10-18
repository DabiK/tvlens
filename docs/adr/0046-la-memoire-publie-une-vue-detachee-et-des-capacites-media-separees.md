# 0046 — La Mémoire publie une vue détachée et des capacités média séparées

- Date : 2026-10-17
- Ticket : `docs/travail/tickets/207-publish-a-memory-consultation-view-beside-the-session-snapshot.md`
- Statut : acceptée

## Contexte

Le snapshot de WatchSession sert aux lecteurs, à la publication des hôtes et au disque. Les ADR 0029
et 0044 demandent une entrée publique de Mémoire avant de migrer ces lecteurs. La présence d'une
observation, le statut de transcription et l'existence des médias décrivent des faits distincts ;
les archives ne permettent pas toujours de retrouver les modalités capturées.

## Décision

`core/memory/index.cjs` publie le contrat JSDoc et les lectures de consultation. WatchSession expose
`memoryView()`, `memoryPassage(id)` et `recentMemoryPassages(limit)`. La composition commune expose
leurs fermetures dans `memory`, liées à la session. La lecture complète construit `session`, `clock`,
`passages`, `coverage` et `losses` depuis les données du propriétaire, sans snapshot, stockage ni I/O.
Les lectures bornées ne construisent que les passages demandés ; la queue récente parcourt les N
éléments de `segments`, sans history ni filtre ready. Une limite entière positive ou nulle est requise.

Chaque valeur retournée est détachée, observations historiques et résumés de sujet compris. Les passages
unifient les deux collections en conservant `origin: history|retained`, leur ordre et leur révision ;
une révision historique absente devient null. Le rejeu et ses raisons restent distincts des modalités
`present|absent|unknown` et de la disponibilité images/son (booléen, ou null si inconnue).
Une vidéo unreadable peut garder images et son. History ne retrouve jamais de média par consultation.
Une Map privée suit les modalités d'entrée sans ajouter de champ au snapshot ou au disque ;
à la restauration, seul un indicateur explicite comme hasAudio prouve une modalité. La présence de
vidéo désigne ici un conteneur fourni à la capture, sans garantie de décodage.

| Famille | Données et capacité couvertes |
| --- | --- |
| Surveillance | Identité, horloge, ordre, intervalles, révisions, voies et observation propre, séparée du cumul |
| Résumé vivant | Sélection ready, textes, attentes, pertes, trous et disponibilité, history non rejouable |
| Questions | Ancrage, identités/intervalles à figer, relecture par id, révisions, erreurs, bornes et baux |
| Frise/détail | Sujet, continuité, résumé de sujet, voies, erreurs, transcription et miniature |
| Index | Queue des 48 passages conservés, observation utilisable et textes, même avant ready |
| Manifeste | Totaux history/conservés/rejouables, horloge, rétention et premier sujet ; octets apportés ailleurs |
| Vues TV | En-tête de session, horloge, attentes, couverture, pertes, passages et raisons ; stockage/surveillance séparés |

`memoryMedia`, composé séparément dans le runtime, ne propose que `read(id)` (images/son) et `lease(ids)`.
Il est adossé au vrai store de cette session et traduit ses refus en `TVLENS_MEMORY_MEDIA_UNAVAILABLE`,
sans cause interne, chemin ni statut HTTP. La libération partage une promesse et ne restitue qu'une fois.
Son propriétaire la demande après la fin effective de l'usage (ADR 0004). Une suppression demandée
pendant le bail attend sa libération et interdit un nouveau bail. Recherche et inspection restent séparées.

La garde déclare la zone et les permissions exactes de core et runtime vers son index. La vue utilise
le critère pur `passage-text.cjs` encore plat par une exception de migration limitée à cette arête.
Aucun autre contexte ne gagne d'accès à ses internes. Aucun lecteur actuel ne migre et les questions
historiques de l'ADR 0038 restent dans le snapshot. Les révisions existantes ne changent pas : elles ne
signalent pas encore toutes les transitions de disponibilité.

## Alternatives écartées

- Un alias du snapshot : garde le couplage au disque et aux apports de l'hôte, avec des références partagées.
- Déduire les modalités de ready ou du rejeu : invente des informations historiques et confond perte et silence.
- Exposer le store : donne aussi accès aux chemins, sauvegardes, suppressions et réponses de transport.

## Conséquences

Les futurs lecteurs disposent d'un contrat commun avant leur migration. Les capacités restent liées
à une session et les questions peuvent conserver leur préfixe tout en relisant ses révisions.
Une vue complète reste proportionnelle à la mémoire ; les lectures bornées évitent ce coût aux abonnés.
Les modalités connues seulement en mémoire redeviennent inconnues après réouverture si le format
historique ne les conserve pas. Aucun format disque, nom historique, événement ou timer ne change.

## Protégée par

`tests/memory-view.test.cjs` : contrat, matrice, isolation profonde, lecture sans snapshot ni effets,
lectures bornées espionnées, raisons historiques, modalités, préfixe figé et vrai store temporaire.
`tests/architecture.test.cjs` protège la nouvelle zone. Les suites evidence-refresh, video-research,
session-durable, session-lifecycle et server-state-views vérifient les contrats actuels inchangés.
Le banc architecture-guard isole les déclarations produit dans ses copies artificielles, puis chaque
cas déclare les zones et exceptions qu'il exerce ; le vrai dépôt garde sa politique complète.
