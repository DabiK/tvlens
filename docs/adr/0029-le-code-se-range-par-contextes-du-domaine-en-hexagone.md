# 0029 — Le code se range par contextes du domaine, en hexagone, dans les dossiers actuels

- Date : 2026-10-16
- Ticket : aucun ; décision de conception du propriétaire, décrite dans `docs/domaine.md`
- Statut : acceptée

## Contexte

Le code est rangé par couches techniques, et quelques gros fichiers portent plusieurs métiers :
`core/session.cjs` (538 lignes), `core/surveillance.cjs` (921), `runtime/surveillance-runtime.cjs` (556),
`app/main.cjs` (574). Le snapshot de `WatchSession` sert à la fois d'état publié, de format disque et de matière
première à sept consommateurs. Les mots « session », « archive », « source » et « moment » ont chacun de trois à six
sens. Deux analyses indépendantes, au commit `ea6ce06`, concluent au même découpage ; une revue critique au commit
`a45b187` en a précisé les contrats.

## Décision

- **Cinq contextes** : Capture (`capture`), Mémoire (`memory`), Questions (`inquiry`), Vérification
  (`verification`), Bibliothèque (`library`). La Vérification est le cœur n° 1, les Questions un cœur, la Mémoire leur
  fondation.
- **Hexagone par contexte, dans les dossiers actuels** : `core/<contexte>/` pour le domaine, `runtime/<contexte>/` pour
  les cas d'usage, `core/shared/` pour le noyau partagé, `runtime/compose/` pour les compositions, `adapters/` par
  famille. Les hôtes (`app/`, `server/`, le pont MCP) composent et pilotent.
- **Les familles d'`adapters/`** : une plateforme d'inférence se nomme d'après son fournisseur (`codex/`, `ollama/`),
  un rôle d'après sa fonction (`perception/`, `speech/`, `media/`…). Un rôle qui tourne sur plusieurs plateformes,
  comme la perception sur Codex ou Ollama, vit dans sa famille de rôle et reçoit sa plateforme par injection.
- **Les ports sont des types JSDoc** déclarés dans le domaine. Un adaptateur les satisfait par sa forme, reçoit ses
  dépendances par injection et n'importe jamais `runtime/`.
- **Le domaine d'un contexte n'importe jamais celui d'un autre.** L'application lit un autre contexte par son module
  public (`core/<contexte>/index.cjs`) ou par un événement publié dans le processus, après la transition. La Mémoire
  n'importe aucun autre contexte et publie une vue de consultation.
- **Un événement notifie un état établi ; il ne porte aucune obligation** de sécurité, de libération ou de durabilité.
  Il est léger (identifiants, révision, données bornées), et aucun abonné ne construit de snapshot complet.
- **Les erreurs** portent un code déclaré par leur module émetteur, sur la base `core/shared/domain-error.cjs`. Le
  domaine et l'application ne produisent aucun statut HTTP ; les hôtes et les adaptateurs de réponse média traduisent.
- **La persistance et les fils sont versionnés**, avec un convertisseur par agrégat. Aucune donnée persistée ne se
  renomme : le nouveau vocabulaire passe par une traduction explicite. La compatibilité de `/v1` porte sur les
  comportements, les refus et les séquences d'appels.
- **La migration se fait par étranglement** : étendre, migrer, contracter, un ticket par pas. Les contrats (fin de
  session, vue de consultation, contrôle de la capture TV) passent avant les extractions.
- **La garde d'architecture évolue d'abord.** Elle apprend les sous-zones, les points d'entrée publics et les
  exceptions temporaires, avec leurs tests, avant la première sous-zone. Chaque règle de `docs/domaine.md` dit si elle
  est contrôlée par la garde, par un test de contrat ou par la relecture.

## Alternatives écartées

- Un dossier racine par contexte (`contexts/<nom>/`) : il multiplie les changements d'imports, de tests, de chemins du
  cliquet et d'installation TV, et retombe sur la disposition actuelle pour le code partagé (client Codex, unité de
  travail sur disque). Une casse du paquet Electron n'est en revanche pas établie par sa configuration actuelle.
- Un contexte Restitution à part : le résumé vivant et les moments gardés sont deux petits modèles, rangés dans la
  Mémoire et la Bibliothèque.
- Un agrégat Session unique : il garderait le couplage par le snapshot.
- Un bus, un conteneur d'injection, de l'event sourcing ou du CQRS : du coût sans besoin.
- Une abstraction « source » à greffons : une fiche de source et des modalités suffisent, l'implémentation viendra avec
  un cas réel.
- Des ports sous forme de classes ou de validateurs importés : les adaptateurs devraient importer le domaine ou
  l'application, et la règle d'injection ne tiendrait plus.

## Conséquences

- Chaque nouveau code a une adresse évidente, et la garde refuse les dépendances qui traversent un contexte.
- Ajouter une sous-zone oblige à revoir les permissions de ses consommateurs : c'est voulu, chaque arête devient
  explicite.
- Les gros fichiers se vident module par module ; ils restent des façades tant qu'ils servent. Le code extrait arrive
  sans infraction ; un fichier entier ne change de chemin qu'une fois débarrassé de ses infractions gelées.
- Les tests qui lisent le texte des sources cassent à chaque déplacement : les bancs par coutures (T195, T203) passent
  avant les découpages côté Mac.
- Il faut environ 65 à 85 tickets, en huit phases, décrites dans `docs/domaine.md`, écrits par vagues sur le code du
  moment.

## Protégée par

`tests/architecture.test.cjs` (table des zones), à mesure que chaque contexte y reçoit sa ligne ; les tests de contrat
de la vue de consultation et du coordinateur de sessions.
