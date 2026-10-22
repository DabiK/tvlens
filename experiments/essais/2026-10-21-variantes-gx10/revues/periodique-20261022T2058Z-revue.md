**1. Dérive — le recentrage sur les preuves web est justifié ; le risque devient de multiplier les variantes sans mesurer leur coût complet ni isoler la cause du gain.**

- **J5b est à clore** : 8,1 s contre 6,2 s pour J6 (**+31 %**), **14 blocs perdus contre 0**. L’échec mécanique suffit ; aucune notation supplémentaire nécessaire. [Résultats J5b](/Users/Dabi/Documents/ISN/tvlens/experiments/essais/2026-10-22-resume-asynchrone-gx10/README.md:49)
- **H4 doit utiliser la référence sans titre** : H2-P déclenche **29/30** W/M, avec **99/102** décisions stables ; PQ obtient **21/58** réponses pertinentes. Les **26/60** et **102/102** du plan concernent le bras avec titre, plus favorable. Conserver les **30 questions** au dénominateur, déclenchements manqués compris. [H2](/Users/Dabi/Documents/ISN/tvlens/experiments/essais/2026-10-22-decision-web-hors-ligne-gx10/README.md)
- Le potentiel reste réel : selon l’état fourni, fusion **45/60 → 52/60** bonnes pages ; fenêtres **18/27 → 23/27** faits accessibles. **Aucun gain de pertinence confirmé à ce stade.** Le cache masque aussi recherche, ouverture des pages et calcul des plongements : sa latence ne représente pas celle du produit.

**2. Arrêter / continuer / commencer**

| Action | Gain attendu / objectif | Coût GX10 proposé |
|---|---|---:|
| **Arrêter** J5c, répétitions, nouveaux modèles ; supprimer l’ancien F1b automatique | Éviter notamment **100 min** de seconde validation complète | 0 |
| **Continuer** la notation H2b, sans nouvelle acquisition | Départager fusion et fenêtres ; gain encore inconnu | 0 nouvelle acquisition |
| **Continuer** H4 jusqu’au terme prévu, sans interruption | **150 réponses** : 5 variantes × 30 questions ; mesurer W et M séparément | Réserve **30 min**, estimation |
| **Commencer** le diagnostic des échecs et le relevé des coûts complets | Distinguer page absente, fait absent, mauvaise extraction et réponse fautive ; examiner les **7 questions d’actualité** | Analyse locale : **0 GPU** |

Pour H4 : **V0/V1** isolent la fenêtre ; **V1/V2** la fusion. **V3/V4** n’isolent le classement que si pages, découpage et budget de texte sont identiques. V2/V3 constitue sinon une comparaison de configurations, pas la preuve d’un effet BM25.

**3. File GX10 : garder H4 → choix noté → un seul F1 ; couper les anciennes entrées.**

| Étape | Durée à réserver |
|---|---:|
| Cache H4 déjà lancé | ≈**8 min minimum** pour 59 recherches espacées de 8 s ; ouvertures en supplément |
| H4, cinq bras | **30 min estimées**, à remplacer par la durée observée |
| Notation et choix | Hors budget GPU ci-dessus ; durée non établie |
| F1, meilleure configuration intégrée, 102 questions | ≈**100 min** |
| Marge incidents | **30 min** |

Réserver **160 min côté GX10**, plus cache restant et notation. Aucun horaire de fin fiable avant ces résultats. F1 doit mesurer la latence complète, les inventions et les régressions sur les **60 questions vidéo**.

**4. Depuis la revue précédente.** J5b a terminé sans nouvelle interruption ; H2b a duré **16 min 32 s**, conforme au budget **10–20 min**. Le report de F1 est justifié par la priorité explicite de Dabi et évite deux passes de 100 min. H4 répond au conseil d’étudier les preuves transmises. Le registre reste périmé ; aucun résultat H2b/H4 n’est encore vérifiable dans les fichiers locaux consultés. **Un passage sur 30 questions servira à choisir, pas à établir une supériorité statistique.**

**5. Aucune décision humaine nécessaire.**

Lecture seule respectée : aucun fichier modifié, aucun réseau, aucun SSH.