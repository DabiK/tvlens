# ADR 0007 — La fin d’une session chargée suit un même protocole sur les deux hôtes, qui gardent chacun leur ordre et leur adaptateur

| | |
|---|---|
| Issue | F07 — Transitions de session dupliquées entre Mac et serveur ([#10](https://github.com/DabiK/tvlens/issues/10)), fiche [`10-f07.md`](../architecture-improvements/10-f07.md) |
| Date | 13 et 14 octobre 2026 |
| Statut | Revu : reviews standards et spécification validées à la seconde passe sur le commit ci-dessous, après un complément de périmètre approuvé à la suite de la première. En attente d’intégration locale par le merger à la date de rédaction. Non publié, non déployé. |
| Code relu | `8627b46c5d5e6d3b2c1abd13b2417732e087576b`, deux commits de code (`a2c86bb`, `8627b46`), base `6e003d1` |
| Détail | [Historique F07](../architecture-improvements/history/F07.md) |

Cette version remplace celle qui décrivait `a2c86bb` : le complément a changé trois de ses points, relevés dans l’historique.

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

Observé ensuite sur le premier commit de ce sujet, par des tests rouges sur le vrai hôte serveur : quand cet hôte n’arrive pas à lâcher la session, une suppression est répondue « supprimée », dossier effacé, et une fin « terminée », alors qu’il tient encore la session fermée. L’hôte serveur ne peut pas lâcher une session dont une question est encore active ; il faut donc que l’annulation des questions ait elle-même échoué. À la lecture, la base rejetait dans ce cas, sans rien effacer.

## Décision

1. **Un module porte ce qui est commun**, `runtime/session-closing.cjs`. Il ne lit ni disque, ni horloge, ni transport : il n’agit que par la session et la bibliothèque de sessions que l’hôte lui remet.
2. **Avant toute attente**, la fin est levée sur la session, puis ce que l’hôte ne doit pas retarder est exécuté. La première étape est entrée dans le même tour.
3. **Chaque étape de l’hôte est tentée, dans l’ordre de l’hôte.** Un échec est gardé sous le nom de son étape, dans un texte borné à 200 caractères, et n’arrête rien.
4. **Le sort de la session a un seul propriétaire.** Elle est archivée ; ou scellée puis effacée, quand son hôte la juge vide ou sur une suppression explicite. Rien n’est effacé sans scellement, et seulement un dossier qui existe.
5. **L’hôte est toujours prié de lâcher la session**, avant tout effacement, quoi qu’il se soit passé. **S’il n’y parvient pas, il la tient encore** : rien d’elle n’est effacé, et sa fin n’est pas dite faite. Ce que le runtime n’a pas pu fermer est collecté, et une seule ligne de journal dit tout. Les libellés de ces phases sont ceux du protocole : « archive », « scellement », « effacement », « hôte ».
6. **Le protocole ne rejette jamais : il rend un refus.** Trois causes : une suppression explicite dont le scellement est refusé, une suppression explicite dont l’effacement échoue, un hôte qui n’a pas pu lâcher la session, quelle que soit la fin demandée. Le refus d’un scellement passe avant celui de l’hôte. C’est l’erreur d’origine, et l’hôte la renvoie au demandeur par son adaptateur, une fois le journal écrit.
7. **Aucune question n’est retirée pour forcer la libération.** Celle dont l’annulation a échoué reste en cours. Quand ses questions peuvent de nouveau être annulées, la même suppression ou la même fin aboutit.
8. **Chaque hôte garde ce qu’il est seul à savoir.**

   | | Hôte Mac | Hôte serveur |
   |---|---|---|
   | Avant toute attente | Révocation des contextes MCP de la session | Annulation des blocs encore en préparation |
   | Ordre des étapes | Résumé vivant, surveillance, questions, agent de chat, puis stockages en cours et arrêt de la capture seulement si elle tourne | Arrêt de la capture (sauf suppression), stockages et préparations en cours dans leur borne, questions, surveillance, agent de chat |
   | Session « vide » | Pas ouverte en lecture seule, ni passage ni question | Démarrée par cet hôte, ni passage ni question |
   | Sans session chargée | Ses étapes sont jouées quand même | Retour immédiat |
   | Adaptateur | Événements IPC, écrits dans le processus principal et toujours envoyés | Réponse HTTP et résultat de la dernière fin |

9. **Deux politiques d’échec sont alignées.**
   - Suppression dont le scellement est refusé : l’hôte serveur lâche désormais la session, son résultat de fin et son journal disent pourquoi, rien n’est effacé, et le demandeur reçoit la même erreur.
   - Session vide dont le dossier ne peut pas être effacé : dit au journal sur les deux hôtes, et dans la réponse HTTP, sans retenir l’hôte.
10. **Côté Mac, une recherche de passages en cours finit avec sa session.** Son contrôleur est levé avec la raison de la fin, puis relâché, dès que la fin commence. Sa réponse tardive reste refusée par la garde existante.
11. **Le reste ne change pas** : ouverture, reprise, démarrage, sauvegarde des questions, transport HTTP, preload, runtime de session. Les lignes de journal et les réponses que fixent les tests communs sont rendues à l’identique, et la possession des blocs (F06) comme la révocation MCP (F05) gardent leur moment et leurs bornes.

## Alternatives écartées

Les alternatives « pesées » viennent de la délibération du développeur, sans journal.

| Alternative | Exécutée ? | Raison |
|---|---|---|
| Continuer quand l’hôte n’a pas pu lâcher la session : effacer le dossier scellé et répondre un succès | Oui, au premier commit ; retirée au complément | L’hôte serveur répondait « supprimée » ou « terminée » en tenant encore la session, dossier effacé. À la lecture, la base rejetait sans effacer. |
| Vider les questions de force pour que la libération passe | Non | Exclu par l’approbation du complément : l’adaptateur de chat s’en sert encore. |
| Rendre la libération du serveur incapable d’échouer, en réécrivant la prise en charge d’une session | Non | Exclu par l’approbation du complément, limitée à la couture de fermeture. Proposé par les reviews comme sujet ultérieur. |
| Réordonner les étapes, ou unifier la règle « session vide » | Non | Arbitré à l’approbation d’exploration : ce serait changer un hôte sans preuve, et une pause inconditionnelle ajoute des écritures. |
| Effacer le dossier avant de libérer l’hôte, comme le faisait le Mac | Non, pesée | Côté serveur, une session scellée resterait chargée pendant l’effacement, visible des lectures d’état et du balayage périodique. L’ordre du serveur est retenu. |
| Faire rejeter le protocole sur un refus | Non, pesée | L’hôte serveur a besoin du résultat entier, erreurs comprises, même quand la fin est refusée. Chaque hôte relance le refus ; les deux sont testés. |
| Liste d’erreurs fournie par l’hôte | Non, pesée | Un paramètre d’entrée et de sortie utile à un seul hôte. Le dépassement d’une préparation devient l’échec de son étape, dans les mêmes mots. |
| Libellés du sort de la session fournis par l’hôte | Non, pesée | L’effacement raté côté serveur aurait porté « scellement », ce qui est faux. |
| Pas de début séparé : la première étape, déjà entrée sans attente | Non, pesée ; reproposée par la review standards | L’approbation nomme un début synchrone dont l’échec ne doit rien empêcher. |
| Ne pas écrire au journal un refus déjà rendu au demandeur | Non | Lecture de l’approbation, tenue pour conforme par les reviews. Sans cela, le résultat de fin du serveur ne distinguerait pas une suppression refusée d’une suppression faite. |
| Rendre « Session obsolète. » à une recherche levée, ou l’annuler côté fournisseur | Non | L’approbation autorise seulement de lever le contrôleur avec la raison de la fin. |
| Mutualiser aussi ouverture, reprise, démarrage et sauvegarde des questions ; retirer la copie du format d’erreur du runtime de session | Non | La fiche limite le sujet à la fermeture ; ce fichier n’est pas attribué. |

## Conséquences

- **Un hôte serveur qui n’a pas pu lâcher une session la tient encore, runtime fermé**, tant que la cause dure. C’était déjà le cas sur la base. Un nouvel essai aboutit une fois les questions annulables ; démarrer, reprendre ou questionner sur cette session n’est ni traité ni testé.
- **Une fin refusée peut laisser une archive sur disque.** Le manifeste dit « archived » et le résultat de fin du serveur aussi, alors que le demandeur reçoit un refus. La question encore active peut écrire ses états suivants dans ce dossier. Ce résultat n’est lu par aucune route.
- **L’ouverture d’une archive et l’arrêt de l’hôte serveur passent par la même fin** : dans cette double panne ils rejettent, comme sur la base. Un arrêt du service sortirait alors en erreur. Établi par lecture, non testé.
- **Côté Mac, « tenue » veut dire « lâchée à moitié ».** Cet hôte vide son état avant ce qui peut échouer. Le protocole le traite par prudence comme tenant la session : le dossier scellé reste, et se supprime ensuite comme une session non chargée.
- **La libération doit être synchrone.** Seule une erreur levée dans le même tour est vue : une libération asynchrone qui rejetterait laisserait effacer le dossier. Les deux hôtes actuels sont synchrones ; le commentaire du module ne l’écrit pas. Il en va de même du début.
- **Le refus est porté par la valeur de l’erreur.** Un rejet sans raison n’effacerait rien, mais l’hôte répondrait un succès. Aucun code actuel ne rejette ainsi.
- **Des commentaires du code disent encore que l’hôte lâche la session « quoi qu’il arrive ».** La formulation exacte est celle du point 5.
- **Libellés changés côté Mac, sur des chemins d’échec.** Le scellement ou l’effacement raté d’une session vide s’écrit « scellement » ou « effacement », et non plus « session vide ». Aucun test ni document ne fixait l’ancien libellé.
- **Un refus est aussi au journal**, sur les deux hôtes, et dans le résultat de fin du serveur. Sur la base, celui d’une suppression n’était que rendu au demandeur.
- **Ordre interne.** Le Mac remet son état à zéro avant l’effacement du dossier, et non plus après ; ses événements `watch:reset` et `sessions:changed` partent toujours à la fin. Le serveur écrit le résultat d’une suppression après l’effacement.
- **Avec un index sémantique**, une recherche levée par la fin de sa session répond la raison de cette fin, et non « Session obsolète. ». La fenêtre l’affiche dans le statut de recherche jusqu’à son reset. Déduit par lecture : le mode simulé n’a pas d’index.
- **Une règle « session vide » qui lève** garde la session, et son erreur est rangée sous « archive ».
- **Les différences entre hôtes du tableau restent**, ainsi que deux écarts hors sujet : l’IPC Mac ne refuse pas un bloc pendant une fermeture, et « Session en cours de fermeture. » est un 503 pour les blocs et un 400 ailleurs.
- **Une troisième copie du format « étape : message »** reste dans le runtime de session.

## Preuves

- **Déclaré par le développeur**, avant toute vérification du merger. Un fichier dédié de 26 tests, verts sur le commit relu. Chaque étape a son rouge, obtenu avant de modifier le code : 12 rouges et 10 caractérisations vertes sur la base, avec la version à 22 tests ; 4 rouges et 22 verts sur le code de `a2c86bb`, avec la version à 26 tests. Dix-sept fichiers de tests existants, non modifiés, joués un à la fois à chaque commit : 150 sur 150. Cinq mutations temporaires, chacune détectée, puis fichiers restaurés à l’identique.
- **Reviews indépendantes**, deux passes : lecture du code, du diff et des journaux conservés, sans exécuter de test. Aucun constat bloquant.
- **Merger** : aucune exécution indépendante à la date de rédaction.

## Limites

- La preuve est synthétique : le vrai processus principal Mac et son preload derrière un substitut d’Electron, le vrai runtime serveur derrière le vrai serveur HTTP en boucle locale, des fournisseurs simulés. Fenêtre Mac native, TV, VPS, fournisseurs et vrai Codex ne sont pas exercés. Aucune latence n’est mesurée.
- « La base rejetait sans effacer » est établi par lecture, par le développeur et les deux reviews de la seconde passe, pas par un test joué sur la base.
- L’échec de libération est réel côté serveur, où l’annulation des questions est rendue défaillante par le test. Côté Mac il est fabriqué, aucun équivalent naturel n’existant, et joué pour une suppression seulement.
- Le scellement refusé est simulé à la couture du runtime : vrai scellement, puis erreur. Aucun refus réel n’a été observé.
- Le début synchrone est tenu par un test du protocole sur doublures. Au niveau des hôtes il est établi par lecture.
- Le refus d’effacement d’une suppression explicite et l’échec de scellement d’une session vide ne sont exercés que sur doublures.
- La version finale du fichier dédié n’a pas été jouée sur la base : les rouges sur la base sont ceux de sa version à 22 tests.
- Le module fait 95 lignes de code, pour « environ 70 » dans l’approbation d’exploration.

La liste complète des dettes, des constats des deux passes de review et des preuves est dans l’historique.
