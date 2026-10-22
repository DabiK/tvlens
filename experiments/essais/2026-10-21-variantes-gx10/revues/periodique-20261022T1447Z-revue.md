**1. Dérive — la priorité est désormais la pertinence réellement livrée ; optimiser encore la vitesse avant de valider mémoire, recherche et résumés ensemble aurait un rendement faible.**

- J3 : **38/60 pertinentes contre 28/60** (+16,7 points), **9 inventions contre 16**, médiane **6,3 contre 5,0 s**, toujours **60/60 sous 15 s**.
- Mais **13/19 questions entièrement anciennes restent en échec**, et **7 blocs vision sont perdus sur CNRS**, contre zéro dans J2. Les récentes restent à **25/33**, avec **5 gains et 5 pertes** : stabilité du total, pas des réponses.
- **J4 teste les résumés sans journal** : même réussi, il ne validera pas leur combinaison avec J3. C’est le principal trou de validation produit. [Résultats et configurations](/Users/Dabi/Documents/ISN/tvlens/experiments/essais/2026-10-21-variantes-gx10/CHIFFRES.md)

**2. Arrêter / continuer / commencer.** Les gains ci-dessous sont des objectifs, pas des prévisions.

| Action | Gain recherché / justification | Budget GX10 |
|---|---|---:|
| **Arrêter** J1, nouveaux modèles et variantes D/E | Préserver la fenêtre ; J1 économise ≈90 min | 0 |
| **Continuer** J4 puis H1 | J4 : ≤+1 s, zéro bloc perdu, ≥18/20 résumés fidèles. H1 : ≥+5/30 W/M, inventions non accrues | ≈35 + 40–60 min |
| **Continuer** l’analyse locale des 13 échecs anciens et des 7 blocs perdus | Distinguer fait absent du journal, tronqué ou mal exploité avant une nouvelle variante | 0 min |
| **Commencer** F1 A/B sur une configuration commune figée | Mesurer l’apport de la recherche seule, récupération et citations acceptées incluses | 180 min |
| **Commencer**, en réserve, J3 + résumés asynchrones sur v3 | Vérifier que les **38/60** et la cadence survivent à la combinaison | ≈90 min |

Pour H1, utiliser **A2/B** pour isoler l’apport des pages si A2 seul autorise déjà les connaissances extérieures ; **A/B** mesure alors le changement global. Garder **B/C** et **OJ/OI** comme comparaisons distinctes.

**3. File GX10 — garder J4 → H1 → F1 ; remplacer la répétition J3 seule par la validation combinée.**

| Depuis 14:47 UTC | Durée estimée | Fin indicative |
|---|---:|---:|
| J4 restant | ≈35 min | 15:22 |
| H1 | 40–60 min | 16:02–16:22 |
| F1 A/B, produit prêt et H1 concluant | 180 min | 19:02–19:22 |
| Réserve : J3 + résumés asynchrones | 90 min | 20:32–20:52 |
| Marge incidents | 30 min | **21:02–21:22** |

Soit **4 h 15–4 h 35 principales**, puis **2 h de réserve et marge**. Hors intégration et notation. Ce sont des durées d’occupation GX10, pas du calcul GPU mesuré. Si le produit tarde, avancer la réserve après H1.

**4. Depuis 12:37.** Les conseils principaux ont été suivis : J3 terminé et noté, J4 lancé, variantes secondaires arrêtées, F1 porté à **180 min**. Le journal franchit les critères proposés, mais sur **un seul passage par configuration**. L’oracle W/M/O apporte **42 questions**, avec source retrouvée pour **28/30 W/M** ; aucun résultat H1 acquis. [Oracle v4](/Users/Dabi/Documents/ISN/tvlens/experiments/essais/2026-10-22-oracle-v4-web-outils-gx10/README.md)

Une divergence documentaire reste à résoudre avant interprétation : le plan fourni annonce **BM25**, le registre mentionne encore **qwen3-embedding**. Le manifeste exécuté devra trancher. Les **3 s SearXNG** proviennent d’une requête de test et ne garantissent pas le budget complet de recherche.

**5. Décision humaine :** quelle est l’heure exacte de fermeture GX10 le **23/10** ? Elle détermine la possibilité d’une répétition comparative supplémentaire de **180 min**.

Lecture seule respectée : aucun fichier modifié, aucun réseau ni SSH utilisé.