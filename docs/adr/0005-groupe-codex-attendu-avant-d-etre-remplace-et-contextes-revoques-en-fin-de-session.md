# ADR 0005 — Un groupe de processus Codex est attendu avant d’être remplacé, et la fin d’une session révoque ce qui a été ouvert sur elle

| | |
|---|---|
| Issue | F05 — Fermeture des processus et révocation des contextes incomplètes ([#5](https://github.com/DabiK/tvlens/issues/5)), fiche [`05-f05.md`](../architecture-improvements/05-f05.md) |
| Date | 13 octobre 2026 |
| Statut | Revu : reviews standards et spécification validées à la seconde passe sur le commit ci-dessous, après une correction demandée par la review standards. En attente d’intégration locale par le merger à la date de rédaction. Non publié, non déployé. |
| Code relu | `be16029db68c264e0c5ae352cd4eb38c927b5975`, deux commits (`5532d04` puis `be16029`), base `aab5543` |
| Détail | [Historique F05](../architecture-improvements/history/F05.md) |

## Contexte

Chaque rôle Codex (chat, description, réexamen, surveillance) est un client qui lance un processus dans son propre groupe, avec un arbre privé lié aux identifiants.

- Fermer le transport envoyait SIGTERM au groupe, armait un SIGKILL à 3 s et ne répondait rien. Le client supprimait l’arbre privé et se reconnectait aussitôt, à côté d’un processus qui avait encore jusqu’à trois secondes.
- Un lanceur sorti de lui-même ne provoquait aucun signal vers ce qu’il laissait dans son groupe. Une fermeture ultérieure envoyait SIGTERM sans SIGKILL derrière.
- Un spawn refusé qui rend un enfant sans tubes faisait lever le démarrage du transport, avant que l’erreur annoncée au tick suivant ait un écouteur.
- Sur le Mac, un client MCP externe ouvre sur la session chargée un contexte de cinq minutes qui garde la recherche, l’inspecteur et les médias de cette session. Rien ne le révoquait à la fin de la session, et l’inspecteur d’un runtime fermé servait encore.

Observé sur la base par des tests rouges, avec des processus Node à la place de Codex : la fermeture ne répond rien ; un second processus démarre à côté de ce qu’a laissé le premier ; ce que laisse un lanceur mort ne reçoit aucun signal ; le démarrage lève sur un enfant sans tubes ; un contexte ancien répond encore pendant la fin de sa session ; le cache d’inspection survit à la fermeture du runtime.

Lu dans le code, sans être observé : l’absence de SIGKILL derrière une fermeture tardive, l’erreur de spawn restée sans écouteur, le service d’un appel tardif par un runtime fermé et la reconnexion du modèle d’inspection qui s’ensuivrait. Rien n’a été observé sur le vrai Codex.

## Décision

1. **Un propriétaire par groupe, dans le transport.** Il possède le groupe de son lanceur jusqu’à ce que ce groupe soit vu vide. `close()` envoie SIGTERM et rejette les requêtes en attente avant de rendre la main, puis répond : `true` quand le groupe est vu vide, `false` s’il est encore là une seconde après le SIGKILL de la troisième seconde. Redemandé ensuite, il regarde une fois et n’envoie plus rien.
2. **Seul « aucun processus » confirme la disparition.** Un groupe qu’on ne peut pas signaler compte comme encore là. Un groupe vu vide n’est plus jamais signalé ni sondé : son numéro peut appartenir à un autre.
3. **Un lanceur qui meurt laisse son groupe à ce propriétaire.** Ce qu’il laisse reçoit SIGTERM à sa sortie, SIGKILL après la même borne, et reste inscrit pour le nettoyage à la sortie de l’hôte.
4. **Le client n’a qu’un groupe à la fois.** Il garde le transport qu’il a fermé et ne démarre rien pour la connexion suivante, pas même son arbre privé, avant que ce groupe soit vu parti. Toutes les façons de quitter un transport y passent : fermeture, autre session, recyclage après les rotations, fil étranger, drain, watchdog, lanceur mort. L’arbre privé est supprimé après la sortie, ou après la borne.
5. **Une sortie non confirmée refuse la connexion, en toutes lettres** : « Arrêt du processus Codex précédent non confirmé : connexion refusée. » La connexion suivante redemande. Ce message n’entre dans aucune liste de nouvelle tentative de la description des images.
6. **`close()` du client reste un recyclage.** Le client se reconnecte plus tard ; aucune fermeture définitive de client n’est ajoutée, faute d’appelant. La fin définitive est celle des runtimes.
7. **Celui qui attend tient l’hôte en vie.** Les minuteurs du transport ne retiennent jamais un hôte : un hôte qui ferme et n’attend rien sort aussitôt, et ce qui reste est tué à sa sortie. Le client, lui, attend la réponse : il tient la boucle pendant ses deux attentes, jusqu’à la réponse que le transport borne lui-même.
8. **Un spawn refusé finit en connexion fermée.** Les écouteurs sont posés avant toute lecture des tubes, qui peuvent manquer.
9. **Un runtime de session fermé ne réexamine plus rien.** Son inspecteur refuse avant le cache et avant l’inspecteur interne, un réexamen en vol est prévenu par son signal avant d’atteindre le modèle, et rien ne reste en cache. L’objet exposé est conservé.
10. **Le pont MCP révoque par session**, et l’hôte Mac le fait dès que la fin d’une session commence, avant toute attente ; il n’ouvre aucun contexte sur une session en cours de fermeture. Un contexte dont les outils ne nomment aucune session part avec la session qui finit.

Aucune dépendance, aucun module, aucune route. Jetons, contrôle d’origine, capacités des questions et confinement sont inchangés. Le runtime de surveillance ne reçoit qu’un commentaire : la barrière de chaque client suffit à un arrêt suivi d’un redémarrage.

## Alternatives écartées

| Alternative | Exécutée ? | Raison |
|---|---|---|
| Rendre `close()` du client définitif | Non | Des tests existants ferment puis reconnectent le même client ; l’approbation d’exploration exclut une interface sans appelant. |
| Ordonner l’arrêt et le redémarrage dans le runtime de surveillance | Non | Inutile : le test sur le vrai runtime est vert avec la seule barrière du client. |
| Reconnecter après la borne même sans confirmation, ou tenir tout échec de sonde pour une disparition | Non | Exclu par l’approbation : une sortie incertaine se dit, elle ne passe pas pour un succès. |
| Faire rejeter `close()` quand la sortie n’est pas confirmée | Non | Une fermeture ne doit ni rejeter ni bloquer l’archive d’une session. |
| Référencer les minuteurs du transport pour tenir l’hôte | Non, écartée à la correction | Un hôte qui ferme sans attendre serait retenu ; ce contrat est porté par des tests existants. |
| Révoquer les contextes MCP au premier refus du runtime, sans toucher l’hôte | Non, repli proposé à l’exploration | Critère tenu à moitié : un contexte ancien répondrait encore sur ses passages figés jusqu’à ce refus. |
| Porter la révocation dans `CachedInspector` | Non | `core/` n’est pas attribué au sujet. |
| Garder une horloge virtuelle dans le test bout en bout | Oui au premier commit, retirée à la correction | Un client qui tient la boucle sur un vrai transport bloquerait le processus de test sur une assertion ratée. Risque déduit, non observé. |

## Conséquences

- Une fermeture attend la sortie du processus : au pire environ 4 s par client quand Codex ignore SIGTERM. Les fermetures d’un hôte sont en partie séquentielles : environ 12 s pour une fin de session ou un quit Mac, environ 8 s à l’arrêt du serveur, sous les 30 s de son unité. Ces durées sont déduites de la lecture, aucune n’est mesurée.
- Un `close()` de client qui n’est pas attendu retient désormais son hôte jusqu’à la réponse du transport. Les deux hôtes sortent explicitement.
- Fermer un runtime de session interrompt un réexamen en vol. Les hôtes annulaient déjà questions et contextes avant.
- Un groupe non signalable, ou dont le numéro serait repris, laisse son rôle refusé jusqu’au redémarrage de l’hôte. Cas non observé.
- Le commentaire de l’unité de service, hors attribution, décrit encore neuf arbres de processus après un arrêt suivi d’un redémarrage de surveillance : c’est devenu un majorant. La limite de tâches est inchangée.

## Preuves

- **Déclaré par le développeur**, avant toute vérification du merger : 13 tests dans un fichier dédié. Sur la base, la version du premier commit donne 12 rouges sur 12. Sur le premier commit, la version finale donne 2 rouges sur 13 : l’hôte sans autre travail sorti au milieu de son attente, et le contexte sans session. Sur le commit relu, 13 sur 13. 22 fichiers de tests existants, 207 sur 207, sans modification.
- **Reviews indépendantes** : lecture du code et des journaux conservés, sans exécuter de test.
- **Merger** : aucune exécution indépendante à la date de rédaction.

## Limites

- Vrai Codex, fenêtre Mac native, TV, VPS et Windows non exercés. L’arrêt de l’hôte serveur avec un survivant n’est pas testé : la correction est prouvée au niveau du client.
- Dans un hôte sans autre travail, seule la veille de 50 ms est observée pendant que le client tient la boucle ; le SIGKILL de la troisième seconde et la réponse de la quatrième ne le sont pas.
- Un second `close()` concurrent se résout aussitôt alors que le premier attend encore : si l’hôte sort dans cette fenêtre, l’arbre privé reste jusqu’au balayage du démarrage suivant. Déduit, non reproduit.
- `close()` jette la réponse `false` : un client créé par session et abandonné ensuite (description, réexamen, résumé, vérification) ne dit rien, et la session suivante lancerait le même rôle à côté du groupe non confirmé. Cas d’un processus qui survit à SIGKILL, non observé.
- L’attente du client n’a pas de borne propre : elle tient à celle du vrai transport. Une doublure de transport qui rend une promesse à `close()` doit la régler.
- La révocation de l’inspecteur remplace une méthode sur l’instance d’une classe de `core/` : elle devra rejoindre `CachedInspector` quand ce fichier sera attribué.
- Le cas « impossible à signaler » n’a été observé ni sur macOS ni sur Linux. De mémoire, non vérifié : macOS peut le répondre pour un groupe réduit à des zombies, ce qui consommerait la grâce de 300 ms à la sortie de l’hôte.

La liste complète des dettes et des constats des reviews est dans l’historique.
