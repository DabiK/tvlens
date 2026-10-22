**A. Vérification**

Recalculs depuis les notes et campagnes, avec la **nouvelle règle des blocs**. « Hors fenêtre » signifie ici dépendance partielle : 6 questions, aucune entièrement ancienne.

| Configuration | Pertinentes /30 | Dont <15 s | Toutes <15 s | Inventions | Médiane | Hors fenêtre /6 · autres /24 |
|---|---:|---:|---:|---:|---:|---:|
| GPS | 21 | 20 | 28 | 5 | 7,094 s | 1 · 20 |
| N1 | 17 | 17 | 29 | 9 | 8,477 s | 2 · 15 |
| N2 | 21 | 21 | 30 | 4 | 5,709 s | 2 · 19 |
| N3 | 21 | 18 | 25 | 4 | 9,141 s | 4 · 17 |
| N4 | 18 | 17 | 29 | 7 | 6,132 s | 1 · 17 |
| GPSV renotée pour E7 | 19 | 19 | 30 | 5 | 6,774 s | 2 · 17 |
| E7 | 17 | 17 | 22 | 6 | 11,766 s | 5 · 12 |

**Aucun écart sur ces résultats publiés actualisés.** Bascules face à GPS : N1 **+2/−6**, N2 **+3/−3**, N3 **+5/−5**, N4 **+2/−5**. E7 : **+4/−6**, dont trois gains hors fenêtre et six pertes récentes. Ma précédente objection sur E7 est levée par la définition harmonisée. N2 : **0 perte**, **1/667** blocs >8 s, plus rapide que GPS sur **25/30** questions. E7 : **3 erreurs**, médianes Spring **145,5 s**, Tears **41,2 s**.

Écarts et réserves restants :

- Oracle v3 : **23/7 publiées → 22/8 recalculées**, également selon les blocs, parmi les nouvelles questions.
- Contexte N3 : **4 762 publiés → 4 762,5 jetons**, simple arrondi.
- E7 : **4 323 jetons** confirmé, mais médiane de **36 appels renseignés**, pas de 30 questions ; référence **2 507** non vérifiable dans les bruts locaux disponibles.
- N5 : **6,8 s, 30/30 <15 s, zéro perte**, confirmé dans le registre actualisé ; pertinence encore inconnue.

**B. Méthode**

1. **Variance sous-estimée.** Les 8 bascules de N1 ne définissent pas un seuil statistique « ±4 ». Répéter les finalistes, comparer les paires par vidéo et conserver les résultats interrompus.
2. **Oracle et juges corrélés.** Même famille de modèles ; accord ≠ justesse. Vérifier indépendamment les preuves des réponses basculées et un échantillon fixe de 12 questions.
3. **Langue.** Séparer exactitude et français attendu ; renoter les réponses existantes. Le plafond à 2 affecte la moyenne, mais ne change pas mécaniquement le seuil de pertinence ≥2.
4. **G5 confond plusieurs effets.** B reprend la règle de N3 avec les observations de N2. C change regroupement, contenu et portée des citations : l’écarter du classement causal. Vérifier aussi le plafond réel de D et la validation des citations ; pour F, compter **délai A+B** lorsque A s’abstient.
5. **30/60 non interchangeables.** Les questions supplémentaires modifient les pauses vision. Comparer deux flux à 60 questions ; publier séparément anciennes questions, nouvelles et dépendance mémoire.

**C. Plan — ordre de rendement attendu, seuils exploratoires proposés**

| Essai : variation unique / référence | GPU estimé | Critère de poursuite |
|---|---:|---|
| G5 B/A : ajout du journal | 18 min | Gain ≥4/60 réponses sur deux passages, inventions non accrues |
| G5 D/B : plafond 3 000 caractères | +9 min | Perte ≤1/60 ; médiane réduite ≥1 s |
| G5 E/B : journal après les récents | +9 min | Gain ≥2/60 ou ≥0,5 s ; aucune invention supplémentaire |
| N6/N2 : répétition identique | 90 min au total | ≥20/30 pertinentes, ≥29/30 <15 s, zéro perte vision |
| Flux 60 questions : meilleur journal / sans journal | 180 min, deux bras | Gain ≥5/60, perte ≤1 sur questions entièrement récentes, inventions non accrues |
| N2 + synthèse asynchrone / N6 | 90 min | Surcoût médian questions ≤1 s, zéro perte vision ; ≥18/20 résumés conservant les faits initiaux, sans invention |

G5 partage ses références : **240 appels, ≈36 min**. Ensemble : **≈6 h 36**, N6 compris, hors préparation.

Pour la synthèse : proxy renvoyant immédiatement la vision, puis synthèse textuelle en arrière-plan, priorités questions/vision, résultats horodatés dans une frise témoin. Le [code](/Users/Dabi/Documents/ISN/tvlens/core/memory/topic-summary.cjs:6) accepte l’absence du champ : cumul nul en continuation, repli sur deux extraits ; une frontière initialise depuis `summary`. La [récupération](/Users/Dabi/Documents/ISN/tvlens/core/perception-context.cjs:54) tolère seulement **trois blocs manquants**. Le proxy actuel ne peut pas publier rétroactivement un cumul : cet essai mesure charge et fidélité ; l’intégration produit nécessite une mise à jour asynchrone aux bornes vérifiées.

**D. File proposée**

**Laisser N6 terminer → noter N2/N5/N6 ensemble → G5 réduit à A/B/D/E → comparaison mémoire à 60 questions → synthèse asynchrone.** Reporter J1 : la mémoire et la conservation des cartes apportent davantage d’information produit aujourd’hui. Garder N5 identifié comme passage repris après redémarrage. Aucun fichier modifié, aucun réseau ni SSH utilisé.

