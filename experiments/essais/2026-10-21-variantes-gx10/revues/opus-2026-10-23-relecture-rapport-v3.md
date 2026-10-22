# Relecture du rapport GX10 v3 : 40 corrections pour Codex Astra

**Contrôle des chiffres.** Tous les chiffres des pages 1 à 5 concordent avec CHIFFRES.md, les README des essais et les notes de H2b et H4. J'ai recalculé H4 et H2b depuis notes.json :
- **H4 :** 14, 14, 12, 10 et 8 réponses justes sur 30 ; 3, 6, 6, 8 et 7 inventions ; médianes de 6,2, 6,2, 6,4, 5,2 et 5,6 s.
- **H2b :** 21, 24 et 29 réponses justes sur 60.

Je n'ai trouvé aucune erreur de calcul. Les défauts viennent du cadrage, des étiquettes et de ce qui manque.

## A. Conclusion et honnêteté (le plus important)

**1. Page 2, « 02 / Conclusion ».** La page s'appelle « Conclusion », mais elle contient un tableau d'essais, des noms de branches et « La suite ». Ce qui est prouvé, ce qui est en cours et ce qui a échoué n'est jamais séparé. C'est exactement le reproche de Dabi. Insérer ce bloc sous le titre, avant le tableau :

> **Prouvé** (mesuré dans le produit, notes attribuées par des modèles)
> - Vitesse : le temps de réponse médian passe de 17,5 s à 7,1 s. Il tombe à 5,7 s si la vision n'écrit plus le résumé de la frise. Réponses justes en moins de 15 s : de 3 à 20 sur 30. Une répétition de chaque recette confirme ces délais.
> - Mémoire : le journal des passages anciens porte les réponses justes de 28 à 40 sur 60. Sur les faits anciens, on passe de 0 à 9 sur 19. Le coût est de 1,2 s par réponse.
>
> **Pas encore prouvé**
> - Le web dans le produit. Il n'est mesuré que hors ligne : 14 sur 30 sur de vraies pages, 2 sur 12 quand il faut croiser vidéo et web. L'essai du produit complet sur 102 questions est en cours.
> - Le résumé de la frise TV. La version rapide le retire, et aucune solution testée ne le rétablit sans ralentir.
> - La TV. Rien n'a été mesuré sur le téléviseur ni sur une longue session.
>
> **Écarté**
> - Calculer le résumé à part : 8,1 s au lieu de 6,2 s, et 14 blocs de vidéo non décrits.
> - Faire appeler des outils au modèle en plusieurs tours : jusqu'à 156 s de médiane sur une vidéo, et moins de réponses justes (18 contre 20 sur 30).
> - Les méthodes élaborées de sélection du texte des pages : au mieux à égalité avec le simple début de page.

**2. Cartes 1 et 2 de la page 1, et ligne J6 du tableau de la page 2.**
- **Problème :** 5,7 s (N2) et 40/60 (J6) viennent tous deux d'une vision qui n'écrit plus le résumé de sujet. Or ce résumé alimente la frise TV. D'après le README de resume-asynchrone, il « reste dans la vision » pour le produit. Le lecteur prend donc 5,7 s pour la vitesse du produit, alors qu'il manque une fonction. L'avertissement n'apparaît qu'en page 3, puis en annexe.
- **Correction :** ajouter sous les cartes : « Les deux premières cartes utilisent une vision qui n'écrit plus le résumé affiché dans la frise TV. Le rétablir sans ralentir n'est pas encore résolu. Avec ce résumé, la recette rapide répond en 7,1 s. »

**3. Carte 3, « 8 → 30/30 … aidée par le titre ».**
- **Problème :** le titre utilisé est celui de la page YouTube du jeu de test. Le README de H2 le dit : « un hôte qui ne connaît pas le titre se comporte comme P », soit 29 sur 30. Le plan courant ajoute que le rejeu final n'a pas de titre (« F1 ≈ bras P »). La carte montre donc un réglage que le produit n'utilise pas.
- **Correction :** « 8 → 29/30 · Questions web reconnues · Hors ligne. Règle de mots-clés actuelle → décision du modèle (0,65 s). 30/30 si le titre de la vidéo est connu. 3 déclenchements inutiles sur 60 questions vidéo. »

**4. Carte 4, « 14/30 Réponses justes avec le vrai web ».**
- **Problème :** la carte n'a pas de point de départ. « Vrai web » laisse croire que le produit cherche en direct. En réalité, les pages ont été collectées à l'avance et seule la réponse a été rejouée hors ligne, en une seule exécution.
- **Correction :** « 0 → 14/30 · Réponses justes aux questions qui demandent internet · Hors ligne, une exécution. Début de vraies pages collectées à l'avance. Le produit actuel refuse ces questions. Vidéo + web : 2/12. »

**5. Page 1, sous-titre.** Le rapport ne dit nulle part ce que sont TVLens et la GX10, ni d'où l'on part. Remplacer « La campagne a trouvé une meilleure recette locale… » par :

> « TVLens répond aux questions du spectateur sur la vidéo qu'il regarde. Du 20 au 22 octobre, ses modèles ont tourné sur la GX10, un ordinateur IA local (puce NVIDIA GB10, environ 120 Go de mémoire). Au départ : 17,5 s par réponse, une mémoire limitée aux 48 dernières secondes, aucun accès au web. »

**6. Page 1, « Le gain vient de deux choix : mieux partager la machine… ».**
- **Problème :** l'explication est fausse par omission. D'après E4, changer de modèle de réponse fait passer le délai de 19,2 s à 12,2 s. C'est le premier gain, et il n'est pas cité.
- **Correction :** « Trois changements expliquent le gain : un modèle de réponse plus rapide (Gemma 4), une vision mise en pause pendant que TVLens répond, et un journal des passages anciens que le modèle peut citer. Avec ce journal, TVLens répond juste à 40 questions sur 60, en 6,2 s médian. »

**7. Les quatre cartes de la page 1.** Deux cartes sont mesurées dans le produit, deux hors ligne, sur des jeux de 30 ou de 60 questions, et rien ne les distingue. Ajouter une étiquette discrète en tête de chaque carte : « Dans le produit · 30 questions », « Dans le produit · 60 questions », « Hors ligne · 30 questions », « Hors ligne · 30 questions, une exécution ».

**8. Page 2, ligne « Le produit complet avec web (F1) ».** Il faut dire ce que teste cet essai. D'après plan-f1-produit-journal-web-102q.json (commit cfa0bf8, avec T315), l'essai :
- utilise « début de page + extrait ciblé », c'est-à-dire la variante que la page 4 et l'annexe classent « écartée », et non le simple début de page recommandé ;
- n'a pas de titre de vidéo ;
- utilise une vision sans résumé de frise.

Ajouter : « Teste la version début + extrait ciblé (à égalité avec le début seul sur les vraies pages), sans titre de vidéo. Critères fixés avant le départ : au moins 12/30 réponses web justes, médiane web d'au plus 15 s, pas plus de 3 réponses vidéo perdues face au journal seul. » Faire vérifier ce point à Dabi.

**9. Page 2, ligne J6 « 40/60 justes ».** Placée sous « 21/30 », elle se lit comme 67 % contre 70 %, donc comme une baisse. Écrire : « 40/60 justes (sans journal : 28/60) ; faits anciens 0 → 9/19 ; 6,2 s ».

**10. Page 3, tableau de vitesse.**
- **Problème :** il ne montre pas les répétitions. Rejouée, la recette rapide fait 17/30 en 8,5 s ; la vision allégée fait 22/30 en 5,2 s. Le passage de 16 à 21 bonnes réponses reste du même ordre que ce bruit.
- **Correction :** ajouter sous le tableau : « Rejouées à l'identique : 17/30 en 8,5 s et 22/30 en 5,2 s. Le délai se reproduit ; le nombre de réponses justes varie jusqu'à 4. » Ajouter aussi une colonne « Justes en moins de 15 s » : 3, 20 et 21. C'est l'indicateur produit le plus solide.

**11. Page 5, « Des tests comparables » et le tableau des jeux de questions.** Ces explications arrivent après des résultats qui en dépendent. Remonter un encadré « Comment lire les chiffres » en bas de la page 2, en quatre lignes :
- les trois jeux de questions ;
- la définition de « juste » ;
- la différence entre « dans le produit » et « hors ligne » ;
- le bruit : 1 à 4 points sur 30 quand on rejoue la même configuration.

**12. Page 4, « de 0 à 26 sur 60 ».** La phrase omet que les inventions passent de 2 à 8 (dont 5 sur des pièges d'actualité). Ajouter « mais avec plus d'inventions (8 contre 2) ».

**13. Page 4, « Le gain des extraits sur les pages figées ne se retrouve pas ici ».** La phrase renvoie à H2b, qui n'est pas présenté dans le corps du rapport. Écrire : « Sur les pages collectées pour les tests, ajouter un extrait ciblé aidait (29 contre 24 sur 60). Sur les vraies pages, non (14 contre 14). Bonne nouvelle : les vraies pages ne font pas moins bien (47 % contre 43 %). »

**14. Sources de H2b, H4 et F1.**
- **Problème :** elles sont citées dans `/private/tmp/…/scratchpad/labo`, un dossier temporaire. Le PDF imprime aussi des chemins absolus du Mac, qui n'ont pas de sens pour le jury.
- **Correction :** archiver ces notes dans `experiments/essais/` avant toute diffusion, puis citer des chemins relatifs au dépôt.

## B. Jargon (terme, position, correction)

**15. « passage » a deux sens.** Il désigne tantôt un extrait de vidéo (« passages anciens », pages 1 à 3), tantôt une exécution (« Un passage du banc web » en page 1, « sur ce passage » en page 3, titre « un passage » en page 4). Réserver « passage » à la vidéo et écrire « exécution » pour les rejeux.

**16. « frise » et « résumé de sujet ».** Ils sont utilisés dès la page 2 (« frise à préserver ») mais définis seulement en annexe, page 11. À la première occurrence, écrire : « le résumé de sujet, que la vision écrit à chaque bloc et qui alimente les cartes de la frise sur l'écran TV ».

**17. « journal », « passages anciens », « contexte récent ».** Ils apparaissent en carte 2 et en page 3. Il manque la donnée clé : le modèle ne voit que les 48 dernières secondes. Écrire : « le journal : un condensé de tout ce qui précède les 48 dernières secondes, seule partie que le modèle voit ».

**18. « blocs visuels perdus ».** Page 2, ligne J5b. Écrire : « 14 tranches de 8 s non décrites, car la vision a pris du retard ».

**19. « banc d'essai », « journal ajouté par le banc d'essai », « journal expérimental ».** Page 3. Le même objet porte trois noms. Choisir « journal expérimental (injecté par l'outil de mesure) » et s'y tenir.

**20. « rejet de citation ».** Page 3, non défini. Écrire : « TVLens refuse une réponse qui ne cite pas le passage qui la justifie ».

**21. « faux départs » (page 2) et « déclenchements inutiles » (page 4).** Garder une seule formule, chiffrée : « 3 recherches inutiles sur 60 questions vidéo ».

**22. « flux réel ».** Page 5. Le terme n'est utilisé nulle part ailleurs dans le rapport, et « c'est le « flux réel » des fichiers sources » est obscur. Le supprimer ; « dans le produit » suffit.

**23. « modèles évaluateurs » (page 1), « juges » et « oracles » (page 5).** Trois noms pour deux rôles. Écrire en page 1 : « notée par des modèles évaluateurs (90 % d'accord avec un évaluateur d'une autre famille), contre des réponses attendues elles aussi préparées par des modèles ». Garder « juges » et « oracles » pour l'annexe uniquement.

**24. « Les outils en plusieurs tours » (page 2) et le titre de section « 04 / Web et outils ».** Ni l'un ni l'autre n'est expliqué dans le corps, et aucun résultat sur les outils n'y figure. Ajouter en page 4 : « Laisser le modèle appeler des outils puis répondre en deux tours a fait monter la médiane jusqu'à 156 s sur une vidéo. Relire d'anciennes images n'a donné que 4 réponses justes sur 24, avec 10 inventions. » Sinon, renommer la section « 04 / Web ».

**25. « banc web » (page 1), « pages figées » (page 4), « corpus figé » (note de la page 4).** Écrire partout « pages collectées pour les tests ».

**26. Les six vidéos ne sont jamais nommées.** Kennedy, Spring et Artemis apparaissent en annexe, page 7. Ajouter dans l'encadré du point 11 : « six vidéos : un discours de Kennedy, deux courts-métrages, une recette, une vidéo du CNRS, une vidéo sur Artemis ». En page 3, préciser à la première mention : « Gemma 4 (modèle de réponse) » et « Whisper small (transcription du son) ».

## C. Fluidité

**27. Page 4, introduction.** « L'essai suivant compare le texte donné au modèle » annonce le tableau H4, mais le paragraphe suivant parle de H1 et H2. Écrire : « Le web se joue en trois étapes : donner des pages au modèle, décider quand chercher, choisir quel texte lui donner. Toutes sont mesurées hors ligne, sur les 30 questions qui demandent internet. »

**28. Page 3, « La vision allégée conserve Gemma 3 mais retire son résumé de sujet. »** Écrire : « La vision allégée reprend la recette rapide, mais le modèle de vision (Gemma 3) n'écrit plus le résumé de la frise. »

**29. Page 3, « Le journal du produit permet de citer… contre 8 avec le journal ajouté par le banc d'essai ».** Écrire : « Le journal expérimental faisait rejeter 8 réponses, car ses passages n'étaient pas citables. Celui du produit n'en fait rejeter aucune. Il reste 10 réponses inventées, une de plus que l'objectif fixé avant l'essai (9). »

**30. Page 3, « Les deux réponses gagnées face au journal expérimental ne prouvent pas, seules, une supériorité générale. »** Écrire : « Face au journal expérimental, l'écart de 2 réponses est dans le bruit. Le vrai gain est la fin des rejets de citation. »

**31. Page 1, encadré « La meilleure mesure vidéo est acquise… ».** « Acquise » est vague. Écrire : « Acquis : vitesse et mémoire, mesurées dans le produit. En cours : le produit complet, mémoire et web réunis, sur 102 questions. »

**32. Page 5, « Un rejeu identique a fait basculer 7 à 8 réponses… Une erreur technique, un délai expiré… ».** La seconde phrase n'a pas de lien avec la première. Écrire : « Rejouer la même configuration change le verdict de 7 à 8 questions sur 30, et le score de 1 à 4 points. Un écart de cet ordre entre deux configurations ne prouve rien. » Supprimer la phrase sur les erreurs, ou la déplacer dans le point 1 de « Trois preuves ».

**33. Page 2, cellules du tableau.**
- E5-GPS : remplacer « ajuster la transcription » par « une transcription plus précise ».
- H2 : remplacer « quelques faux départs » par « 3 recherches inutiles sur 60 ».
- J5b : écrire « Rétablir le résumé de la frise en le calculant à part » puis « 8,1 s au lieu de 6,2 s ; 14 blocs non décrits. Échec. »
- H4 : écrire « Les quatre méthodes plus élaborées font au mieux autant, avec plus d'inventions. »

**34. Page 4, « L'extraction du texte principal des pages et la limite de temps sont encore en travail. »** Écrire : « Deux améliorations sont en cours de code : garder seulement le texte utile des pages, et arrêter une question web au bout de 14 s. »

## D. À couper ou à remonter

**35. Notes internes de fabrication à supprimer.**
- « maintenu « en cours » selon la consigne » et « Aucun essai relancé, aucun contrôle distant effectué » (page 5).
- « Statuts en cours : consigne de cette édition » (page 15).
- « Le statut ancien « en file » … remplacé ici » (page 14).
- « Aucun code n'est inventé pour les dossiers qui n'en ont pas » (page 16).
- « Les identifiants de modèles désignent ici les variantes testées, pas une taille de contexte » (page 7).
- « Version 3 » en pied de page : la remplacer par la date.

**36. Page 2, noms de branches.** Pour un jury, ce sont des détails de dépôt. Écrire : « Rien n'est encore dans la version principale de TVLens. Le journal et le web sont sur des branches de travail, réunies pour l'essai final. » Les noms de branches vont en annexe.

**37. Page 4, recherche inversée d'image.** C'est une étude sans essai et sans cas utile. La retirer du corps ; elle reste dans la matrice.

**38. Page 5, « Trois preuves pour clore la campagne ».** Ce bloc reprend « La suite » de la page 2. Fusionner les deux dans la partie « Pas encore prouvé » du point 1. Sortir du corps l'item « archivage des notes web » : c'est de la tenue de dossier.

**39. Annexe, colonne « Verdict ».**
- **Problème :** « Retenu » est appliqué aux références et aux répétitions, par exemple H1-A à 0/60 ou E3-réf avec 27 blocs sur 36 contenant une invention. Lu d'un coup d'œil, cela veut dire « adopté ».
- **Correction :** utiliser cinq valeurs : Adopté, Référence, Répétition, Écarté, En cours. Remplacer aussi la colonne « Statut », presque toujours « Terminé », par « Type » : produit, hors ligne ou étude.

**40. Page 1, « Sources des cartes : … » et « La page suivante donne la conclusion… ».** Ces lignes alourdissent la lecture en 30 secondes. Ramener les sources à des appels de note discrets (1 à 4) renvoyant à l'annexe, et supprimer la phrase de navigation.

## Verdict

La v3 est bien structurée : chiffres justes, matrice complète, codes enfin expliqués. Mais la page 1 ne dit ni ce qu'est TVLens, ni d'où l'on part, et la « Conclusion » de la page 2 est un tableau, pas une conclusion.

Le vrai risque est d'induire le jury en erreur sur trois chiffres phares. Les cartes 1 et 2 retirent le résumé de la frise TV. La carte 3 utilise un titre de vidéo que le produit n'a pas. La carte 4 présente comme du « vrai web » une réponse rejouée hors ligne.

Avec les corrections 1 à 11, le rapport se lit en 30 secondes et reste franc. Les autres corrections sont de la finition.