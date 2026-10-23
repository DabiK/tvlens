**1. Dérive — arrêter d’affiner l’extraction est justifié ; le risque devient de présenter les gains du titre comme une validation du produit final, en sous-estimant l’attente et les pertes vidéo.**

- **H4b : 13/29 → 21/29 pertinentes**, soit **+27,6 points**, avec **2 inventions contre 5**, +8/−0 (p ≈ 0,008). Signal fort sur cet échantillon, mais rejeu avec titres du corpus ; la question M sans recherche est exclue. Conserver **29 paires**, et signaler la couverture **29/30**. [H4b](/Users/Dabi/Documents/ISN/tvlens/experiments/essais/2026-10-22-web-reel-texte-gx10/README.md:51)
- **F1 : 44/60 contre 39/60**, +8/−3 (p ≈ 0,23) : aucune baisse observée de pertinence vidéo, mais aucune preuve de non-régression. Médiane **7,6 contre 6,2 s**, **13 blocs perdus contre 0**. [F1](/Users/Dabi/Documents/ISN/tvlens/experiments/essais/2026-10-22-produit-complet-web-gx10/README.md)
- Le temps propre masque l’attente : W **12,2 s**, mais **20,0 s avec attente** ; M **10,6 → 17,7 s**. Recalcul des notes : **12/30 W/M dépassent 20 s** avec attente. Ce scénario enchaîne les questions ; ces chiffres ne représentent pas une question isolée. [Notes brutes](/Users/Dabi/Documents/ISN/tvlens/experiments/essais/2026-10-22-produit-complet-web-gx10/notation-web/notes.json)

**2. Arrêter / continuer / commencer**

| Action | Gain attendu ou objectif | GPU supplémentaire |
|---|---|---:|
| **Arrêter** fusion, classement, F1b et nouveaux modèles | Éviter ≈ **100 min** de répétition complète ; aucun gain établi pour l’extraction sophistiquée | **0 min** |
| **Continuer** la voie simple avec titre lorsqu’il est réellement disponible | Gain observé **+8/29**, transfert au produit encore non mesuré | **0 min** |
| **Continuer** la consolidation par configuration et paquet de notation | Séparer F1 `cfa0bf8`, H4b et produit T316–T318 ; éviter une performance composite fictive | **0 min** |
| **Commencer** le bilan pertinence × délai depuis les traces | Compter combien des **5/30** réponses dépassant 14 s sont pertinentes ; distinguer attente et traitement | **0 min** |
| **Commencer** la clôture du diagnostic restant | **6/16** échecs H4 expliqués par la mauvaise œuvre ; **10/16** encore sans attribution systématique | **0 min** |

**3. File GX10 — couper toute entrée restante, garder la file vide.**

F1 terminé en **90 min 38 s** ; H4b en **4 min 03 s**. **Budget GPU recommandé : 0 min.** Ne pas réactiver les anciennes files. La clôture documentaire et l’analyse des traces suffisent ; la version finale intégrée restera explicitement **non mesurée en flux réel**.

**4. Depuis la revue précédente.** F1 unique, abandon de F1b et simplification suivis. H4b constitue une exception raisonnable à l’arrêt des essais : **4 minutes**, un changement ciblé, après identification de **6 erreurs de sujet**. Le diagnostic est donc partiellement réalisé. Le registre marque désormais F1 terminé et F1b abandonné, mais CHIFFRES conserve des mentions périmées (« F1 à venir », « J5b en cours »).

**5. Une décision humaine : plafond web de 14 à 20 s ?** Je recommande **20 s de traitement**, comme compromis provisoire : les **5 dépassements observés** culminent à **16,6 s**. Coût maximal autorisé : **+6 s par recherche** ; gain de pertinence à compter dans les traces. Cela ne garantit pas **20 s attente comprise**.

Lecture seule respectée : aucun fichier modifié, aucun réseau, aucun SSH.

