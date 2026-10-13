# ADR 0010 — Une plage d’un clip ne lit que les octets qu’elle renvoie

| | |
|---|---|
| Issue | F10 — Une petite plage vidéo charge le clip entier ([#9](https://github.com/DabiK/tvlens/issues/9)), fiche [`09-f10.md`](../architecture-improvements/09-f10.md) |
| Date | 13 octobre 2026 |
| Statut | Revu : deux reviews indépendantes validées à la première passe sur le commit ci-dessous. En attente d’intégration locale par le merger à la date de rédaction. Non publié, non déployé. |
| Code relu | `ce724345f313bfb89acd61ebd36a93f588221913` (base `147f994`) |
| Détail | [Historique F10](../architecture-improvements/history/F10.md) |

## Contexte

Le store local répond aux relectures par `response(id, range)`, qui rend une `Response`. Trois chemins y mènent : `GET /v1/media` du serveur, le protocole `tvlens-media` de l’hôte Mac, et `tvlens-saved` pour les copies conservées.

- `response()` lisait tout le fichier `.webm` avant de regarder l’en-tête Range : une plage d’un octet, une plage refusée et l’absence de plage lisaient le même fichier de bout en bout ;
- le serveur HTTP recopie ensuite le corps entier de cette réponse avant de l’envoyer ;
- aucun code du dépôt ne pose d’en-tête Range, et `GET /v1/media` n’a pas de consommateur dans le dépôt hors des tests.

Ces constats viennent de la lecture du code. Le premier est confirmé à la couture par un test rouge : 2 097 152 octets lus pour 1 octet répondu, au store comme sur HTTP. La plage que demande réellement le lecteur vidéo de l’hôte Mac n’a pas été observée : la prémisse de la fiche, « le lecteur demande `bytes=0-0` », n’est établie que par un double synthétique.

## Décision

1. **Un descripteur par réponse.** Le clip est ouvert, sa taille est lue sur ce descripteur, puis les octets de la plage le sont par lectures positionnées, sur le même descripteur. Il est fermé avant que la réponse soit rendue, quel que soit le statut ; un échec de fermeture ne change pas la réponse.
2. **Seuls les octets répondus sont lus.** Une plage bornée lit sa longueur ; une plage ouverte `bytes=K-` lit de K à la fin ; une plage refusée (416) ne lit rien du clip. Sans plage, ou avec `bytes=0-`, la réponse est le clip : il est lu en entier.
3. **Le corps reste un tampon, pas un flux.** Aucun descripteur ne survit à une réponse dont le corps n’est jamais lu, et le contrat `response(id, range) → Response` ne change pour aucun de ses trois appelants.
4. **Jamais de réponse courte.** Une lecture rendue en morceaux est redemandée jusqu’à la longueur annoncée. Si le fichier a raccourci depuis la lecture de sa taille, la réponse est « indisponible » (404) : ni corps plus court que son `Content-Length`, ni mémoire non initialisée.
5. **Statuts, en-têtes, textes et grammaire Range inchangés.** Le 404 reste prioritaire sur le 416, y compris pour ce qui porte le nom d’un clip sans être un fichier ; le 416 ne porte que `Content-Range: bytes */N`.
6. **Le clip est ouvert là où il était lu** : à l’emplacement durable d’abord, puis, sur absence seulement, une fois à la racine pour la paire laissée par une ancienne version. Une copie conservée, sans `.json` à côté, reste servie par l’ouverture directe. L’identifiant est validé avant toute ouverture.
7. **`server/http.cjs` n’est pas modifié.** Il prépare toujours la réponse entière avant de l’envoyer ; ce qu’il recopie est désormais la plage. Un client qui abandonne n’arrête pas la lecture en cours, qui se termine et ferme son descripteur.

Aucune route, aucun canal IPC, aucun module, port ni dépendance n’est ajouté.

## Alternatives écartées

| Alternative | Exécutée ? | Raison |
|---|---|---|
| Diffuser le corps en flux, du store jusqu’au socket | Non, option posée à l’exploration, écartée par la supervision avant toute écriture | Elle oblige à modifier `server/http.cjs`, pose la durée de vie du descripteur quand le corps n’est jamais lu (des tests existants ne lisent que le statut) et change le comportement face à une suppression concurrente, pour une priorité modérée. |
| Lire la taille, puis les octets, par le chemin du fichier, en deux temps | Non, risque relevé à l’exploration | Entre les deux, le fichier peut être supprimé : la taille annoncée et les octets ne viendraient plus du même fichier. |
| Arrêter la lecture quand le client abandonne | Non | La supervision a demandé de conserver le comportement de `server/http.cjs` ; l’arrêt supposerait la diffusion en flux. |
| Un seul assistant de repli vers l’ancienne disposition, partagé par `content()` et par l’ouverture du clip | Non | Le plan approuvé laissait `content()` intact. La règle vit donc à deux endroits (dette). |

## Conséquences

- Une relecture par plage bornée ne charge plus que sa plage, dans le store comme dans la copie que fait le serveur.
- Chaque réponse ouvre et ferme un descripteur ; des réponses concurrentes en ouvrent autant, le temps de leur lecture.
- Un clip supprimé pendant qu’une réponse le lit est servi entier, puis indisponible à la requête suivante. La suppression n’est pas retenue. Cela repose sur le comportement des systèmes de fichiers de macOS et de Linux.
- Tout échec entre l’ouverture et la réponse est répondu 404 : lecture refusée, fichier tronqué, mais aussi une éventuelle erreur de programmation dans ce bloc, qui ne remonterait pas.
- Le store gagne une méthode, `openClip(id)`, qui recopie la règle de repli de `content()`.

## Preuves

- **Déclaré par le développeur**, avant toute vérification du merger : 10 tests ajoutés dans un fichier dédié, 9 rouges sur la base et 1 qui caractérise, 10 sur 10 sur le commit ; 9 fichiers de tests existants qui passent par `response()` verts sans modification (72 tests), hôte Mac simulé compris ; 2 fichiers de contrôles statiques verts (9 tests).
- **Reviews indépendantes** : validation à la lecture du code et du diff, sans exécuter de test.
- **Merger** : aucune exécution indépendante à la date de rédaction.

## Limites

- La preuve est synthétique : des clips fabriqués, des octets comptés. Ni latence ni empreinte mémoire ne sont mesurées, et aucun gain n’est annoncé en relecture réelle. Si le lecteur ouvre par une plage partant du début, le volume lu reste le clip entier.
- Sans plage, ou avec `bytes=0-`, le clip entier est encore chargé en mémoire, puis recopié par le serveur. La mémoire d’une réponse n’est bornée que par la plage demandée.
- Hôte Mac natif, TV, VPS et fournisseurs non exercés. Windows n’est pas couvert.
- La taille totale annoncée dans `Content-Range` est celle lue à l’ouverture. Si le fichier raccourcit ensuite sans toucher la plage, le 206 est exact en octets mais annonce l’ancienne taille. Aucun chemin de l’application ne tronque un clip stocké ; cas non testé.
- Le commentaire de `response()` dit qu’une plage ouverte lit tout le clip : ce n’est vrai que pour `bytes=0-`. Le code et les tests sont exacts ; le commentaire reste à reformuler, aucun code ne changeant après les reviews.
- L’outil de documentation prévu par la mission pour vérifier l’API de fichiers était absent, et son installation interdite. Une sonde locale sur Node 24.12 l’a remplacé ; aucune documentation n’est citée.

La liste complète des dettes et des constats des reviews est dans l’historique.
