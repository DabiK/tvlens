# 0036 — Les hôtes partagent trois règles pures de session

- Date : 2026-10-16
- Ticket : `docs/travail/tickets/191-share-the-empty-session-library-row-and-disk-full-rules-of.md`
- Statut : acceptée

## Contexte

Le Mac et le serveur définissaient chacun la session vide, la ligne vivante de bibliothèque
et la réaction au refus de stockage. Le Mac perdait l'origine d'une archive à sa reprise :
sans passage ni question, sa fermeture pouvait effacer le dossier. Le parcours IPC reproduit
cet effacement ; le même parcours HTTP conserve déjà l'archive.

## Décision

Trois fonctions pures de `runtime/` reçoivent des faits explicites :

- `empty-session.cjs` reconnaît uniquement une création de cette vie de l'hôte (`fresh`),
  sans job de question, question historique de WatchSession ni passage.
- `session-rows.cjs` projette liste et instantané avec les métadonnées fournies par l'hôte.
  La façade Mac fournit son titre et ses dates ; le serveur garde sa présentation, son indicateur
  de capture incluant les stockages en cours et sa limite de 50 lignes après projection.
- `capture-storage.cjs` reconnaît le code de stockage plein et l'identité de l'objet session
  encore chargé. Un identifiant égal après réouverture ne suffit pas.

Le Mac marque `fresh` uniquement à la création. L'ouverture puis la reprise d'une archive
ne lèvent jamais ce fait. Les hôtes conservent pause, arrêt de l'horloge et publication,
ainsi que le refus initial du bloc quand la pause rejette.

## Alternatives écartées

- Garder les copies avec des tests similaires : la correction d'une règle resterait à reporter.
- Partager un coordinateur de cycle de vie dans ce changement : la migration de l'ADR 0030
  est distincte ; les propriétaires et les ordres de l'ADR 0007 sont conservés ici.
- Lire les objets d'hôte depuis la projection : cela cacherait ses dépendances et sa temporalité.

## Conséquences

Chaque règle a une implémentation appelée par les deux hôtes, sans effet de bord dans les fonctions.
Les formats d'archive, la rétention, l'effacement explicite et les seuils disque sont conservés.
La cohérence des lectures serveur à travers une attente reste traitée séparément par T192.

## Protégée par

`tests/empty-session.test.cjs` couvre les quatre faits indépendants ;
`tests/session-rows.test.cjs` fournit le même corpus à la projection et aux deux façades,
avec entrées gelées et métadonnées préservées. `tests/capture-storage.test.cjs` distingue
code et identité ; `tests/capture-intake.test.cjs` conduit les refus différés et l'échec de pause.
Les bancs `mac-ipc-contract` et `server-sessions` passent par le preload et HTTP avec une fixture
d'archive vide, séparément avec et sans reprise. Les scénarios de garde disque restent simulés.
