# ADR 0004 — Une question terminée rend son contexte de travail quand son agent a réellement fini

| | |
|---|---|
| Issue | F04 — Les jobs terminés gardent leur mémoire de travail ([#4](https://github.com/DabiK/tvlens/issues/4)), fiche [`04-f04.md`](../architecture-improvements/04-f04.md) |
| Date | 13 octobre 2026 |
| Statut | Accepté localement : deux reviews indépendantes validées à la première passe sur le commit ci-dessous. Intégration locale en attente du merger à la date de rédaction. Non publié, non déployé. |
| Code relu | `fcee917c1a7f2535a0de37f6d6b4b2701a6f3457` (base `474346a`) |
| Détail | [Historique F04](../architecture-improvements/history/F04.md) |

## Contexte

Chaque question reçoit ses propres outils vidéo : une copie de tous les passages figés à l’instant de la question, la recherche, l’inspecteur et les médias de la session, un fournisseur de l’état en direct et un callback de progression.

- Une question terminée restait dans la liste des questions avec tout cela. La liste n’est vidée ou remplacée qu’à un changement de session : fin de session, ouverture d’une archive.
- La limite de cinq questions ne porte que sur celles qui attendent : elle ne borne pas cette mémoire.
- Une question est déclarée terminée par une course entre son plafond, son annulation et le travail de l’agent. Après un plafond ou une annulation, l’agent et un appel d’outil peuvent encore tourner.

Ces constats viennent de la lecture du code et d’une mesure structurelle synthétique. Aucun heap, aucun RSS, aucune latence n’a été mesuré.

## Décision

1. **Le contexte est rendu en place, par celui qui possède la question.** `DeepAsk` décide du moment ; `VideoTools.release({keepPassages})` sait quoi lâcher. `DeepAsk` en est le seul appelant. La méthode est optionnelle sur les outils : les copies restaurées et les doublures restent telles quelles, et un échec de libération n’atteint ni la question ni la file.
2. **Le moment est la fin du travail de l’agent, pas la fin de la course.** La libération vient après les dernières lectures (mesures) et la dernière publication, quand le travail propre de l’agent est réglé : tout de suite pour une réponse ou une erreur, au retour de l’agent après un plafond ou une annulation. Une question annulée dans la file n’a jamais été remise à l’agent : elle rend son contexte aussitôt.
3. **Un appel d’outil encore en vol garde tout**, son bail média compris, jusqu’à sa fin. Les outils comptent leurs appels en vol ; rien n’est lâché avant le dernier.
4. **Ce qui est lâché** : le préfixe copié, la recherche, l’inspecteur et les médias de la session, le fournisseur en direct, le callback de progression. **Ce qui reste** : réponses, citations et mesures, qui sont sur la question elle-même ; les preuves consultées, dont la validation des citations suivantes a besoin ; le journal, les compteurs et le signal d’abandon.
5. **Une action de moment garde les passages de son propre intervalle**, déjà restreints quand la question a été figée : le réexamen d’un moment les relit.
6. **Après libération, tout appel d’outil est refusé**, sans lecture, bail ni preuve nouvelle. Le refus vient après le contrôle d’intervalle existant, qui continue de nommer la plage que la question pouvait consulter. Un contexte ouvert hors de la file, comme celui d’un client MCP externe, n’est jamais libéré par elle.
7. **Aucun minuteur et aucune émission** ne sont ajoutés : un contexte n’est jamais libéré de force, et rien n’est republié ni resauvegardé à la libération.

Aucun module, aucune classe, aucune dépendance n’est ajouté. La composition partagée par les deux hôtes n’est pas modifiée.

## Alternatives écartées

| Alternative | Exécutée ? | Raison |
|---|---|---|
| Libérer dès la fin de la course (réponse, plafond ou annulation) | Non, écartée à l’exploration | L’agent ou un appel d’outil peut encore tourner : dépendances retirées sous un appel en vol, bail non rendu. Risque déduit de la lecture ; il n’existait pas avant, puisque rien n’était libéré. |
| Forcer la libération par un minuteur quand l’agent ne revient pas | Non, exclue à l’exploration puis par son gate | Libérerait un contexte peut-être encore utilisé ; la direction approuvée demande la fin effective de l’usage. |
| Ne garder aucun passage sur aucune question terminée | Non, écartée à l’exploration | Le réexamen d’un moment relit les passages figés de la question d’origine dans `core/viewing-actions.cjs`, hors des fichiers du ticket. |
| Refuser tout appel dès la libération, avant le contrôle d’intervalle | Non | Un test existant, non modifiable pendant la vague, attend le refus d’intervalle sur les outils d’une question terminée. |
| Laisser le refus d’intervalle se calculer sur le préfixe vidé | Non, écartée à l’écriture | Il aurait annoncé qu’aucun passage n’était reçu au moment de la question, ce qui est faux. La plage consultable est figée à la libération. |
| Réduire ce que capture le fournisseur en direct dans la composition partagée | Non | Une mesure structurelle ne voit pas une fermeture : le gain ne serait pas prouvable. Le fournisseur est lâché avec le reste. |

## Conséquences

- Une question ordinaire terminée ne tient plus de préfixe. En tiennent encore : la question en cours, celles qui attendent (cinq au plus), une question arrêtée dont l’agent n’a pas rendu la main, et les actions de moment pour leur intervalle.
- Après un plafond ou une annulation, le contexte reste tenu jusqu’au retour de l’agent et de ses appels en vol. Un agent qui ne revient jamais garde le sien, comme avant.
- Une question terminée garde le texte des passages qu’elle a consultés, son journal (400 entrées au plus, sans texte) et ses compteurs.
- Une action de moment terminée garde son intervalle. Un rattrapage qui part du début de la session garde donc tout le préfixe, et chaque rattrapage ou réexamen garde sa propre copie.
- Sur l’hôte serveur, qui n’a pas de chemin de réexamen, cet intervalle est gardé sans lecteur.
- Les états publiés et sauvegardés sont inchangés : les garanties de F02 et de F03 ne sont pas touchées.

## Preuves

- **Déclaré par le développeur** : huit tests ajoutés à la couture de la composition partagée, tous rouges sur la base puis verts. Neuf fichiers de tests existants désignés par le gate, 57 sur 57 ; douze autres fichiers hors ligne qui construisent directement les modules modifiés, 114 sur 114, un seul passage. Aucun test existant modifié.
- **Mesure structurelle synthétique, même test sur la base et sur le commit** : vingt questions terminées sur cent passages gardent atteignables 2000 passages copiés (1 010 981 octets de JSON) sur la base, 0 sur le commit. Ce sont des objets atteignables et des octets de JSON, ni heap ni RSS.
- **Reviews indépendantes** : validation à la lecture du code et des journaux conservés, sans exécuter de test.
- **Merger** : aucune exécution indépendante à la date de rédaction. Suite globale, essais Mac natifs et vérification cumulée avec F08 lui reviennent.

## Limites

- Aucune mesure de heap, de RSS ni de latence. Le chiffre de l’audit (2 269 200 octets) n’est pas rejoué : sa sonde n’est pas dans le dépôt.
- L’instantané brut tenu par le fournisseur en direct n’est pas visible d’une mesure structurelle ; sa libération est déduite de la lecture.
- Seuls les appels d’outils sont refusés après libération ; la lecture du contexte de départ ne l’est pas, faute d’appelant à ce stade. Les commentaires du code parlent de toute consultation : à préciser.
- La libération différée par un appel en vol n’est testée que derrière un plafond.
- `core/ports.cjs` ne décrit pas encore la libération : fichier hors du périmètre du ticket.
- Exercé en Node seulement, avec des doublures. Fenêtre Mac native, TV, VPS et fournisseurs non exercés.

La liste complète des dettes et des constats des reviews est dans l’historique.
