**1. Dérive — le goulot principal devient la qualité des preuves transmises au répondeur ; optimiser encore le déclenchement ou la génération rapporte moins.**

- **H2 : déclenchement W/M 8/30 → 30/30 en 0,65 s**, mais pertinence inchangée : **26/60**. W gagne 6 réponses, M en perd 6 (**10/24 → 4/24**). La requête autonome ne suffit donc pas. [H2](/Users/Dabi/Documents/ISN/tvlens/experiments/essais/2026-10-22-decision-web-hors-ligne-gx10/README.md)
- Selon le plan fourni, sélectionner une fenêtre porte la présence du fait de **18/27 à 23/27** ; fusionner les recherches retrouve **52/60 pages attendues contre 45/60**. Ce sont des gains de récupération, **pas encore de réponses pertinentes**.
- **J6 : 40/60, 6,2 s, 0 rejet**, mais supériorité sur J3 non démontrée : **+9/−7, p≈0,80** ; critère d’inventions manqué (**10, plafond 9**). Le retenir comme référence opérationnelle, pas comme victoire statistique. Il reste **10/19 questions anciennes ratées**. [J6](/Users/Dabi/Documents/ISN/tvlens/experiments/essais/2026-10-22-journal-produit-gx10/README.md)

**2. Arrêter / continuer / commencer**

| Action | Gain attendu ou objectif | Occupation GX10 estimée |
|---|---|---:|
| **Arrêter** répétitions retirées, nouveaux modèles, H1-C | Préserver les **180 min** déjà économisées ; aucune nouvelle piste justifiée | 0 |
| **Arrêter** les interruptions de J5b pour changer les priorités | Éviter une nouvelle acquisition partielle et un troisième départ | 0 supplémentaire |
| **Continuer** J5b jusqu’au résultat | Vérifier **0 bloc perdu**, ≤**7,2 s**, ≥**37/60**, ≥**18/20** résumés fidèles | ≈73 min restantes |
| **Continuer** H2b | Vérifier que la fusion récupère les M sans perdre les W ; gain final inconnu | Budget **10–20 min**, non mesuré |
| **Continuer** F1 sur base J6 + recherche | Mesurer les **102 questions**, latences complètes, inventions, pertes de blocs et régressions v3 | ≈100 min |
| **Commencer** diagnostic des preuves manquantes et rejeu de fenêtres | Potentiel : **5/27 faits supplémentaires accessibles** ; isoler sélection des passages et fusion | Diagnostic **0 GPU** ; rejeu plafonné à **20 min** |

**3. File : garder J5b → H2b → F1 ; rendre F1b conditionnel.**

À partir de **18:47 UTC**, avec intégration prête :

| Étape | Durée | Fin indicative UTC |
|---|---:|---:|
| J5b restant | 73 min | 20:00 |
| H2b | 10–20 min | 20:10–20:20 |
| F1 | 100 min | 21:50–22:00 |
| Marge incidents | 30 min | **22:20–22:30** |

Soit **3 h 33–43 réservées**, hors notation/intégration. **Ne pas engager automatiquement 100 min supplémentaires pour F1b** : les changements côté questions se départagent d’abord hors ligne. Si fusion et fenêtres sont prometteuses, les tester séparément ; les changer ensemble empêcherait d’attribuer le gain. Une validation finale combinée reste possible, explicitement présentée comme telle.

**4. Depuis 16:47.** Conseils suivis : J6 priorisé et désormais noté, J5b aligné sur J6, répétitions supprimées. H2 ajouté à raison avant F1 : il corrige un déclencheur limité à **8/30**. Inverser F1/J5b était justifié par l’intégration en attente. Le registre a rattrapé H1/J6 ; le plan conserve toutefois des mentions périmées « J4/J6 en cours ». Nouveaux points à protéger : régression M, titres disponibles dans l’hôte réel, et différence entre meilleurs passages hors ligne et début de page produit.

**5. Aucune décision humaine nécessaire.** Les priorités données permettent ce tri.

Lecture seule respectée : aucun fichier modifié, aucun réseau, aucun SSH.

