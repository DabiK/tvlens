# ADR 0007 — La fin d’une session chargée suit un même protocole sur les deux hôtes, qui gardent chacun leur ordre et leur adaptateur

| | |
|---|---|
| Issue | F07 — Transitions de session dupliquées entre Mac et serveur ([#10](https://github.com/DabiK/tvlens/issues/10)), fiche [`10-f07.md`](../architecture-improvements/10-f07.md) |
| Date | 13 octobre 2026 pour le code et les reviews ; documentation du 14 octobre |
| Statut | Revu : reviews standards et spécification validées à la première passe sur le commit ci-dessous. En attente d’intégration locale par le merger à la date de rédaction. Non publié, non déployé. |
| Code relu | `a2c86bb29521d55468f2b932f0e679fe7254131c`, un commit de code, base `6e003d1` |
| Détail | [Historique F07](../architecture-improvements/history/F07.md) |

## Contexte

La fin d’une session chargée était écrite trois fois : `endSession` dans le processus principal Mac, `release` dans le runtime de l’hôte serveur, et la branche « session chargée » de sa suppression. Les trois partageaient les mêmes briques :

- la fin levée sur la session avant toute attente ;
- une étape de fermeture tentée, son échec gardé sous la forme « étape : message » ;
- les questions annulées, attendues, puis sauvegardées ;
- la session archivée, écartée si elle est vide, ou supprimée ;
- une ligne de journal « fermeture incomplète de la session … ».

Elles différaient par l’ordre des étapes, par leurs gardes et par ce que faisait un échec. Toutes ces différences ne sont pas des défauts : plusieurs tiennent à ce qu’un seul hôte possède (contextes MCP et résumé vivant côté Mac, préparation HTTP des blocs côté serveur).

Observé sur la base par des tests rouges, sur les deux compositions réelles et des fournisseurs simulés :

- hôte serveur, suppression dont le scellement est refusé : l’erreur est rendue au demandeur, mais la session reste chargée, runtime fermé, sans ligne au journal ni résultat de fin ;
- hôte serveur, session vide dont le dossier ne peut pas être effacé : rien dans la réponse ni au journal ;
- hôte Mac, recherche de passages encore en cours quand sa session finit : son signal n’est pas levé.

Dans la même situation de scellement refusé, l’hôte Mac lâchait déjà la session : c’est le cas « un correctif ne parvient qu’à un hôte » de la fiche. Déjà vrai sur la base des deux côtés, et caractérisé : le sort d’une question en vol, d’un passage en cours de stockage, d’une fin que le disque refuse, d’adaptateurs qui échouent à fermer, et l’ordre des étapes de chaque hôte.

## Décision

1. **Un module porte ce qui est commun**, `runtime/session-closing.cjs`. Il ne lit ni disque, ni horloge, ni transport : il n’agit que par la session et la bibliothèque de sessions que l’hôte lui remet.
2. **Avant toute attente**, la fin est levée sur la session, puis ce que l’hôte ne doit pas retarder est exécuté. La première étape est entrée dans le même tour.
3. **Chaque étape de l’hôte est tentée, dans l’ordre de l’hôte.** Un échec est gardé sous le nom de son étape, dans un texte borné à 200 caractères, et n’arrête rien.
4. **Le sort de la session a un seul propriétaire.** Elle est archivée ; ou scellée puis effacée, quand son hôte la juge vide ou sur une suppression explicite. Rien n’est effacé sans scellement, et seulement un dossier qui existe.
5. **L’hôte est toujours libéré de la session**, avant l’effacement de son dossier, quoi qu’il se soit passé. Ce que le runtime n’a pas pu fermer est collecté, et une seule ligne de journal dit tout. Les libellés de ces phases sont ceux du protocole : « archive », « scellement », « effacement », « hôte ».
6. **Le protocole ne rejette jamais.** Le refus d’une suppression explicite, scellement ou effacement, est rendu tel quel à l’hôte. Celui-ci le renvoie au demandeur par son adaptateur, une fois le journal écrit et la session lâchée.
7. **Chaque hôte garde ce qu’il est seul à savoir.**

   | | Hôte Mac | Hôte serveur |
   |---|---|---|
   | Avant toute attente | Révocation des contextes MCP de la session | Annulation des blocs encore en préparation |
   | Ordre des étapes | Résumé vivant, surveillance, questions, agent de chat, puis stockages en cours et arrêt de la capture seulement si elle tourne | Arrêt de la capture (sauf suppression), stockages et préparations en cours dans leur borne, questions, surveillance, agent de chat |
   | Session « vide » | Pas ouverte en lecture seule, ni passage ni question | Démarrée par cet hôte, ni passage ni question |
   | Sans session chargée | Ses étapes sont jouées quand même | Retour immédiat |
   | Adaptateur | Événements IPC, écrits dans le processus principal | Réponse HTTP et résultat de la dernière fin |

8. **Deux politiques d’échec sont alignées.**
   - Suppression dont le scellement est refusé : l’hôte serveur lâche désormais la session, son résultat de fin et son journal disent pourquoi, rien n’est effacé, et le demandeur reçoit la même erreur.
   - Session vide dont le dossier ne peut pas être effacé : dit au journal sur les deux hôtes, et dans la réponse HTTP, sans retenir l’hôte.
9. **Côté Mac, une recherche de passages en cours finit avec sa session.** Son contrôleur est levé avec la raison de la fin, puis relâché, dès que la fin commence. Sa réponse tardive reste refusée par la garde existante.
10. **Le reste ne change pas** : ouverture, reprise, démarrage, sauvegarde des questions, transport HTTP, preload, runtime de session. Les lignes de journal et les réponses que fixent les tests communs sont rendues à l’identique, et la possession des blocs (F06) comme la révocation MCP (F05) gardent leur moment et leurs bornes.

## Alternatives écartées

Aucune n’a été exécutée puis retirée : la première exécution de l’implémentation est verte. Les alternatives « pesées » viennent de la délibération du développeur, sans journal.

| Alternative | Exécutée ? | Raison |
|---|---|---|
| Réordonner les étapes, ou unifier la règle « session vide » | Non | Arbitré à l’approbation d’exploration : ce serait changer un hôte sans preuve, et une pause inconditionnelle ajoute des écritures. |
| Effacer le dossier avant de libérer l’hôte, comme le faisait le Mac | Non, pesée | Côté serveur, une session scellée resterait chargée pendant l’effacement, visible des lectures d’état et du balayage périodique. L’ordre du serveur est retenu. |
| Faire rejeter le protocole sur un refus de suppression | Non, pesée | L’hôte serveur a besoin du résultat entier, erreurs comprises, même quand la suppression est refusée. Chaque hôte relance le refus ; les deux sont testés. |
| Liste d’erreurs fournie par l’hôte | Non, pesée | Un paramètre d’entrée et de sortie utile à un seul hôte. Le dépassement d’une préparation devient l’échec de son étape, dans les mêmes mots. |
| Libellés du sort de la session fournis par l’hôte | Non, pesée | L’effacement raté côté serveur aurait porté « scellement », ce qui est faux. |
| Pas de début séparé : la première étape, déjà entrée sans attente | Non, pesée ; reproposée par la review standards | L’approbation nomme un début synchrone dont l’échec ne doit rien empêcher. Côté serveur, l’annulation et l’arrêt de la capture s’enchaînent sans attente entre les deux. |
| Ne pas écrire au journal un refus déjà rendu au demandeur | Non | Lecture de l’approbation, tenue pour conforme par les deux reviews. Sans cela, le résultat de fin du serveur ne distinguerait pas une suppression refusée d’une suppression faite. |
| Rendre « Session obsolète. » à une recherche levée, ou l’annuler côté fournisseur | Non | L’approbation autorise seulement de lever le contrôleur avec la raison de la fin, sans autre fichier de recherche. |
| Mutualiser aussi ouverture, reprise, démarrage et sauvegarde des questions | Non | La fiche limite le sujet à la fermeture. |
| Retirer la copie du format d’erreur que garde le runtime de session | Non | Fichier non attribué par l’approbation. |

## Conséquences

- **Libellés changés côté Mac, sur des chemins d’échec.** Le scellement ou l’effacement raté d’une session vide s’écrit « scellement » ou « effacement », et non plus « session vide ». Aucun test ni document ne fixait l’ancien libellé.
- **Un refus de suppression est aussi au journal**, sur les deux hôtes, et dans le résultat de fin du serveur. Sur la base, il n’était que rendu au demandeur.
- **Ordre interne.** Le Mac remet son état à zéro avant l’effacement du dossier, et non plus après ; ses événements `watch:reset` et `sessions:changed` partent toujours à la fin. Le serveur écrit le résultat d’une suppression après l’effacement ; ce résultat n’est publié dans aucune vue.
- **Si la libération de l’hôte échoue**, l’erreur est notée « hôte : … » et la suite continue : une session scellée est effacée quand même. Côté serveur, la libération lève s’il reste une question active. Une suppression répondrait alors « supprimée », et une fin « terminée » avec des erreurs, la session fermée restant chargée ; la base rejetait sans effacer. Il faut une double panne, l’annulation des questions ayant elle-même échoué. Déduit par les deux reviews, exercé sur doublure seulement.
- **Avec un index sémantique**, une recherche levée par la fin de sa session répond la raison de cette fin, et non « Session obsolète. ». La fenêtre l’affiche dans le statut de recherche jusqu’à son reset. Déduit par lecture : le mode simulé n’a pas d’index.
- **Le début doit être synchrone.** Son résultat n’est ni attendu ni capté, et le commentaire du module ne le dit pas. Les deux débuts actuels sont synchrones.
- **Une règle « session vide » qui lève** garde la session, et son erreur est rangée sous « archive » : le journal peut alors porter deux lignes « archive » d’origines différentes.
- **Les différences entre hôtes du tableau restent**, ainsi que deux écarts hors sujet : l’IPC Mac ne refuse pas un bloc pendant une fermeture, et « Session en cours de fermeture. » est un 503 pour les blocs et un 400 ailleurs.
- **Une troisième copie du format « étape : message »** reste dans le runtime de session.

## Preuves

- **Déclaré par le développeur**, avant toute vérification du merger. Un fichier dédié de 22 tests, écrit avant le code et joué sur la base : 12 rouges pour les causes annoncées, 10 caractérisations vertes. Sur l’implémentation, première exécution : 22 sur 22. Dix-sept fichiers de tests existants, non modifiés, joués un à la fois : 150 sur 150. Trois mutations temporaires, chacune détectée, puis fichiers restaurés à l’identique.
- **Reviews indépendantes**, une passe chacune : lecture du code, du diff et des journaux conservés, sans exécuter de test. Sept constats, aucun bloquant, repris dans l’historique.
- **Merger** : aucune exécution indépendante à la date de rédaction.

## Limites

- La preuve est synthétique : le vrai processus principal Mac et son preload derrière un substitut d’Electron, le vrai runtime serveur derrière le vrai serveur HTTP en boucle locale, des fournisseurs simulés. Fenêtre Mac native, TV, VPS, fournisseurs et vrai Codex ne sont pas exercés. Aucune latence n’est mesurée.
- Le scellement refusé est simulé à la couture du runtime : vrai scellement, puis erreur. Aucun refus réel n’a été observé.
- Le début synchrone est tenu par un test du protocole sur doublures. Au niveau des hôtes il est établi par lecture : une attente ajoutée dans un hôte avant l’appel ne serait vue par aucun test.
- Le refus d’effacement d’une suppression explicite, l’échec de scellement d’une session vide et l’échec d’un rappel d’hôte ne sont exercés que sur doublures.
- Le module fait 92 lignes de code, pour « environ 70 » dans l’approbation.

La liste complète des dettes, des constats de review et des preuves est dans l’historique.
