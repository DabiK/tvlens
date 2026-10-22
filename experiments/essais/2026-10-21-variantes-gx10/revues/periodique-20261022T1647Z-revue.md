**1. Dérive — le risque principal est désormais de perdre de la perception ou des réponses à la validation ; gagner encore sur la génération est secondaire.**

- **J4 échoue** : **106 blocs vision perdus**, médiane **6,3 s contre 5,0 s** pour J2, malgré **60/60 réponses sous 15 s**. Les résumés prennent **4,9 s** chacun : « asynchrone » ne supprime pas la concurrence GPU. [Essai J4](/Users/Dabi/Documents/ISN/tvlens/experiments/essais/2026-10-22-resume-asynchrone-gx10/README.md)
- **J6 vise le bon problème** : parmi les **13 échecs anciens de J3**, **7 rejets de citations**, **4 abstentions visuelles**, **2 inventions**. Les 7 rejets sont un potentiel à vérifier, pas 7 bonnes réponses garanties. [Diagnostic J3](/Users/Dabi/Documents/ISN/tvlens/experiments/essais/2026-10-22-flux-60-questions-gx10/README.md)
- Recherche : selon l’état fourni, H1-B retrouve une source attendue dans le top 3 pour **21/30 W/M**. Les **9 restantes** méritent une analyse avant toute nouvelle variante. Les **28/30** précédents mesuraient la disponibilité dans le corpus, pas cette récupération.

**2. Arrêter / continuer / commencer**

| Action | Gain recherché ou économie | Occupation GX10 |
|---|---|---:|
| **Arrêter** J3bis/J2bis, nouveaux modèles et relance H1-C | ≈180 min économisées sur les répétitions ; C : seulement 4/60 réponses sourcées | 0 |
| **Continuer** J6 | Mesurer les réponses réellement récupérées grâce aux citations produit ; surveiller les blocs perdus | ≈85 min restantes |
| **Continuer** notation H1 et diagnostic des 9 récupérations manquées | Décider sur A2/B ; objectif ≥+5/30 pertinentes, inventions non accrues, surcoût <3 s | 0 GPU GX10 |
| **Commencer** F1, produit prêt | Valider recherche réelle, citations et déclenchements intempestifs sur les 60 questions vidéo | ≈100 min |
| **Continuer** J5, après F1 si celui-ci est prêt | Objectifs : zéro bloc perdu, ≥18/20 résumés fidèles ; pertinence préservée | ≈90 min |

**J5 n’est pas une répétition de J3** : même avec les mêmes questions, les résumés peuvent changer les blocs perçus et donc les entrées des réponses. Pour isoler leur effet avec le journal produit, figer J5 sur la même configuration que J6, résumés seuls en différence.

**3. File recommandée : J6 → F1 → J5 ; couper les répétitions retirées.**

| Depuis 16:47 UTC | Durée | Fin indicative |
|---|---:|---:|
| J6 restant | 85 min | 18:12 |
| F1, même base que J6 + recherche | 100 min | 19:52 |
| J5, même base que J6 + résumés | 90 min | 21:22 |
| Marge incidents | 30 min | **21:52** |

Total : **5 h 05**, hors intégration et notation ; occupation estimée, pas calcul GPU mesuré. Si F1 n’est pas prêt à 18:12, inverser F1/J5. Ne plus fusionner J6 et F1 : J6 est lancé et fournit une référence utile pour isoler la recherche.

**4. Depuis la revue précédente.** Diagnostic mémoire suivi, J4 clos négatif, H1 terminé en **71 min**, J6 correctement priorisé. Mon F1 A/B de **180 min** a été écarté à raison pour éviter de remesurer le refus web imposé ; le passage unique reste une validation produit, pas une comparaison contrôlée complète. Les répétitions supprimées économisent **180 min**, sans démontrer la reproductibilité exacte de J3. Le registre est en retard : il annonce encore H1 et les répétitions en file. H1/J6 restent sans résultat noté vérifiable dans les fichiers locaux consultés.

**5. Aucune décision humaine nécessaire.** La consigne « aller au plus vite » répond déjà à ma précédente question sur l’heure de fermeture.

Lecture seule respectée : aucune modification, aucun réseau, aucun SSH.