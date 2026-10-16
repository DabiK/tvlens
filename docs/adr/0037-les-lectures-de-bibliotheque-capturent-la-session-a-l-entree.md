# 0037 — Les lectures de bibliothèque capturent la session à l'entrée

- Date : 2026-10-16
- Ticket : `docs/travail/tickets/192-read-one-consistent-session-when-the-server-lists-sessions.md`
- Statut : acceptée

## Contexte

Le serveur attend la bibliothèque pour lister les sessions et mesurer leur volume.
Pendant cette attente, une transition peut remplacer A par B ou décharger A.
Relire l'état publié ou le stockage courant après l'attente mélangeait leurs chiffres.
L'adoption reste synchrone, conformément à l'ADR 0024.

## Décision

`HeadlessRuntime` capture avant sa première attente l'identité, le titre, l'horloge,
la rétention, les flags, les passages, leur disponibilité et le stockage de la session chargée.
Il copie uniquement les faits utiles, sans conserver de référence à la session mutable.
L'état publié est utilisé si son identité correspond ; sinon le WatchSession chargé fournit
son propre instantané. Une requête entrée sans session conserve une lecture sans session.

`sessions()` et `storageUsage()` partagent cette lecture et la même construction de liste.
Après les attentes de bibliothèque, la projection partagée de l'ADR 0036 reçoit ces faits.
La réponse peut donc décrire A après l'adoption de B, la fermeture de A ou sa mise en pause.
Le champ `session` du stockage conserve aussi la mesure de A capturée à l'entrée.

Les métadonnées des archives et leur ordre restent ceux de la bibliothèque.
Le volume global porte sur toutes les lignes projetées, avant la limite de 50 lignes ;
l'espace libre reste la mesure de la bibliothèque, obtenue pendant la requête.

## Alternatives écartées

- Retenter après un changement : inutile pour ce contrat et susceptible de multiplier les lectures.
- Attendre la fin de transition : retarderait une lecture qui peut répondre avec ses faits d'entrée.
- Garder seulement l'objet de A : ses flags et chiffres peuvent changer pendant l'attente.

## Conséquences

Chaque réponse possède des faits de session cohérents à son entrée ; la bibliothèque et l'espace
libre ne constituent pas un instantané global du disque. Aucun protocole d'adoption ne change.

## Protégée par

Les courses HTTP de `tests/server-sessions.test.cjs` retiennent séparément `library.list`
et `library.usage` par des signaux explicites, avec transitions réelles et fournisseurs simulés.
Elles couvrent remplacement, fermeture, ouverture d'archive, arrivée tardive, mutation sur la même
session, propriété des faits publiés, ordre, format, limite et volume global.
