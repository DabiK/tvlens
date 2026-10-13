# ADR 0003 — Le disque reçoit le dernier état de chaque fichier, et la publication ne l’attend pas

| | |
|---|---|
| Issue | F03 — Sérialisation complète et file de sauvegardes non bornée ([#3](https://github.com/DabiK/tvlens/issues/3)), fiche [`03-f03.md`](../architecture-improvements/03-f03.md) |
| Date | 13 octobre 2026 |
| Statut | Accepté localement : deux reviews indépendantes validées à la première passe sur le commit ci-dessous. Intégration locale en attente du merger à la date de rédaction. Non publié, non déployé. |
| Code relu | `e6190c29dc84bf4c3c221056549fc408665b8cf8` (base `0ffdf7b`) |
| Détail | [Historique F03](../architecture-improvements/history/F03.md) |

## Contexte

Chaque changement publié était aussi l’écriture d’un état entier :

- chaque brouillon de réponse, jusqu’à un toutes les 80 ms, resauvegardait toutes les questions, sur les deux hôtes ;
- le store sérialisait chaque état dès la demande et ajoutait une écriture par demande à sa chaîne : un disque plus lent que ses états gardait toutes les anciennes versions à écrire ;
- la voie d’analyse unique, la pause et la reprise n’étaient publiées qu’au retour de leur sauvegarde ;
- côté Mac, un balayage inconditionnel poussait l’état complet toutes les cinq secondes, session en pause comprise.

Ces constats viennent de la lecture du code et d’une sonde synthétique. Aucun délai disque ni délai utilisateur n’a été mesuré.

## Décision

1. **Le store borne ce qui attend.** Par fichier, au plus un état attend son tour ; un état demandé entre-temps prend sa place et n’est sérialisé qu’à son tour. Les appelants dont l’état a été remplacé reçoivent l’issue de l’écriture qui le couvre, refus compris. Le manifeste dit confirmé est celui que l’écriture a réellement porté.
2. **Les contrats de F02 sont gardés tels quels** : chaîne unique, fichier temporaire puis renommage, refus retenu par fichier, barrière `flush()`, scellement.
3. **Le cœur publie avant de sauvegarder.** La voie unique, `stop()` et `resume()` publient d’abord et ne se règlent toujours qu’une fois le disque servi. L’issue d’une sauvegarde est publiée quand elle change le statut de sauvegarde, refus ou fin du refus. Un instantané possède ses listes `history` et `questions`, pour qu’un état en attente ne soit pas déchiré par un balayage.
4. **La durabilité des questions est une règle des hôtes, distincte de leur publication.** Une question qui apparaît, disparaît ou change de statut est sauvegardée tout de suite, états finaux compris. Entre deux, un brouillon est publié à chaque fois et sauvegardé au plus une fois par seconde, son dernier état compris quand la réponse cale. Ce qui attend reste attaché à sa session, lui est remis avant sa fermeture et est abandonné quand l’hôte la lâche.
5. **Le balayage Mac a une raison de tourner** : capture en cours, fenêtre glissante, ou retrait à retenter. Une session durable en pause ne pousse plus rien.

Aucune route, aucun canal IPC, aucun module ni dépendance n’est ajouté.

## Alternatives écartées

| Alternative | Exécutée ? | Raison |
|---|---|---|
| Plan minimal de l’exploration : brouillons limités par une horloge, sans minuterie de rattrapage ; ordre publication/sauvegarde du cœur inchangé ; balayage Mac gardé comme sur le serveur | Non, amendé par la supervision avant toute écriture | Un texte qui cale serait resté non sauvegardé sans limite ; la publication serait restée liée au disque ; le temps écoulé affiché côté Mac se serait figé pendant la capture. |
| Porter la cadence dans le store | Non, envisagée à la conception | Le plan approuvé demande une minuterie simple par hôte : le store ne décide rien de la cadence. |
| Une aide commune aux deux hôtes | Non | Aucun nouveau module dans le périmètre approuvé. La règle existe donc en deux exemplaires (dette). |
| Rendre l’émission de `prune()` conditionnelle | Non | Cette émission est aussi le rafraîchissement de l’horloge pendant la capture ; la condition est portée par la minuterie Mac. |
| Réduire les deux écritures de fin de question à une seule | Non | Demande de modifier `DeepAsk`, hors des fichiers du ticket. |
| Stabiliser un test par répétition, délai ou tolérance des fichiers temporaires | Répétitions lancées par le développeur, arrêtées par la supervision | Des passes vertes n’expliquent pas un échec. Remplacé par un diagnostic à barrière contrôlée (voir l’historique). |
| Format incrémental pour l’état de session, fsync | Non | Hors de la direction approuvée. |

## Conséquences

- Derrière un disque retenu, une écriture est en cours et un état attend par fichier. Sur un disque qui suit, le store écrit encore chaque état qu’on attend : c’est la cadence des hôtes qui réduit les écritures de brouillons.
- Après un arrêt brutal en cours de réponse, le brouillon sauvegardé peut avoir jusqu’à une seconde de retard. Comportement nouveau ; l’état final reste sauvegardé tout de suite.
- Un état en attente est écrit tel qu’il est à son tour. Pour les questions, il peut porter une entrée d’activité plus récente que son texte ; l’écriture suivante le corrige.
- Un état peut atterrir plus tôt qu’avant par rapport à un autre fichier. L’ordre « derniers états, puis manifeste final » est tenu par la barrière.
- Un refus de sauvegarde est publié dès qu’il est connu, sans attendre un autre événement : dette de F02 levée.
- Une question terminée est toujours écrite deux fois, la réponse puis la réponse avec ses mesures. Qui lit le dossier doit attendre la seconde.
- Côté Mac, pendant une pause durable, les chiffres disque affichés dans la fenêtre ne sont plus rafraîchis par le balayage.

## Preuves

- **Déclaré par le développeur** : douze tests ajoutés aux coutures store, cœur, HTTP et IPC Mac ; neuf rouges sur la base puis verts, trois qui caractérisent ; suite hors ligne 498 sur 498, fichiers exécutés un à un ; trois mutations retenues ; un passage dans la fenêtre Electron native en mode simulé.
- **Sonde synthétique, même sonde sur la base et sur le commit** : store derrière un disque retenu, 100 écritures et 99 états en attente deviennent 2 et 1 ; hôte serveur sur disque libre, 100 écritures de brouillons deviennent 7. Ce sont des comptages, pas des latences.
- **Reviews indépendantes** : validation à la lecture du code et des journaux, sans exécuter de test.
- **Merger** : relecture des journaux retenus, sans ré-exécution enregistrée à la date de rédaction.

## Limites

- Aucune latence réelle mesurée : ni disque, ni modèle, ni TV.
- L’état de session reste écrit en entier deux fois par passage : borné, non réduit.
- La règle de cadence des questions est dupliquée dans les deux hôtes.
- Un test existant a échoué une fois sur le commit en préparation ; la cause est établie et corrigée dans le test, mais les échecs voisins vus sur la base ne sont pas identifiés avec certitude.
- Disque retenu, cadence des brouillons et refus disque ne sont exercés qu’en Node. TV non exercée.

La liste complète des dettes et des constats des reviews est dans l’historique.
