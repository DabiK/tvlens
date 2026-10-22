**1. Dérive — le rendement des variantes d’extraction est désormais faible ; la priorité est d’expliquer les échecs mixtes et les inventions, puis de mesurer la chaîne complète.**

- H2b gagnait **5/60** réponses avec la fenêtre sur corpus figé, avec titre. Sur le vrai web sans titre, H4 donne **14/30** au début de page comme à la fenêtre ; fusion **12**, BM25 **10**, plongements **8**. Aucun gain démontré justifiant davantage de sophistication. [H4](/Users/Dabi/Documents/ISN/tvlens/experiments/essais/2026-10-22-web-reel-texte-gx10/README.md)
- Les **12 questions mixtes restent à 2/12 dans les cinq bras**. Le contexte vient de J2, sans journal : le manque de faits vidéo est une hypothèse prioritaire, sans être encore une cause isolée.
- C1 donne **42/60 contre 38/60** en vidéo, **+8/−4, p ≈ 0,39** : cela ne démontre ni supériorité ni équivalence. Les inventions favorisent Codex : **7 contre 12** en vidéo, **2 contre 6** en W/M. Les **8,5 s** locales additionnent trois médianes : elles ne prouvent pas un avantage face aux **10,8 s mesurées** de Codex. [C1](/Users/Dabi/Documents/ISN/tvlens/experiments/essais/2026-10-23-comparatif-codex-local/README.md)

**2. Arrêter / continuer / commencer**

| Action | Gain attendu ou objectif | Coût GPU supplémentaire |
|---|---|---:|
| **Arrêter** les variantes fusion/classement et la répétition F1b | Aucun gain établi ; éviter environ **100 min** de seconde passe complète | **0** |
| **Continuer** F1 sans interruption ni changement | Obtenir pertinence et latence réelles sur **102 questions**, dont **60** pour détecter les régressions vidéo | **≈13 min restantes**, estimation à 22:47 |
| **Commencer** l’analyse des **16 échecs H4**, dont **10 M**, et des **7 questions d’actualité** | Compter les causes : contexte vidéo, recherche, page, extrait ou réponse ; gain de pertinence encore inconnu | **0**, analyse des traces |
| **Commencer** la réconciliation des notations et des configurations | Fiabiliser le rapport et éviter d’attribuer un résultat au mauvais produit | **0**, lecture locale |

**3. File GX10 — garder F1 seul, couper les anciennes entrées.**

F1 a consommé **85 min 36 s** entre 21:21:44 et 22:47:20. Garder la fin prévue vers **23:00 UTC**, avec **15 min de marge**, sans considérer « 96 % » comme une garantie. Ensuite : notation et diagnostic, **aucun nouveau créneau GPU recommandé** avant leurs conclusions.

Attention : **F1 tourne sur `cfa0bf8`, avec T315**, alors que H4 recommande le début de page ; **T316 n’y figure pas**. F1 validera cette configuration précise, pas la version simplifiée actuelle. Ne pas le modifier en cours.

**4. Depuis la revue précédente.** H2b/H4 sont maintenant documentés ; H4 a pris **16 min**, contre **30 min réservées**. Le bras sans titre, le dénominateur **30**, l’abandon de la fusion et la passe F1 unique suivent les conseils. L’arrêt signalé de H4 à 21:20 intervient après les acquisitions documentées jusqu’à 21:19.

Le coût recherche/ouverture est désormais mesuré, mais pas la latence complète ni le coût des plongements. Le diagnostic des échecs reste à produire. La renotation change J6 de **40 à 38/60**, ses inventions de **10 à 12**, et celles de H4-V0 de **3 à 6** : garder les paquets de notation explicitement séparés. Le registre conserve encore des statuts F1/F1b périmés.

**5. Aucune décision humaine nécessaire.**

Lecture seule respectée : aucun fichier modifié, aucun réseau, aucun SSH.