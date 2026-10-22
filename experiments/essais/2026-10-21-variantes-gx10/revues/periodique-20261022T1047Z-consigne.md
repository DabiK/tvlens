Tu es Codex Astra, regard neuf sur la feuille de route des expériences GX10 de TVLens, appelé toutes les deux heures.
Lecture seule : ne modifie aucun fichier, aucun réseau, aucun SSH. Réponds en français, une page au plus, chiffré.

But du projet : améliorer le rapport pertinence / rapidité des réponses de TVLens sur la GX10 (fenêtre GX10 jusqu'au
23/10), et laisser des chiffres fiables pour le rapport final. Chaque essai ne change qu'une chose et est tracé.

Lis d'abord l'état ci-dessous (file GX10, plan courant, ta revue précédente), puis seulement ce qui est utile parmi :
- registre : /Users/Dabi/Documents/ISN/tvlens/experiments/essais/2026-10-21-variantes-gx10/README.md, CHIFFRES.md, revues/ ;
- dossiers d'essais récents : /Users/Dabi/Documents/ISN/tvlens/experiments/essais/2026-10-2*-*/README.md (et leurs notation/notes.json).

Rends :
1. Dérive : insiste-t-on sur un point qui ne le mérite plus (rendement décroissant, goulot secondaire) ? Que néglige-t-on
   qui pèse plus sur la pertinence ou la vitesse ? Une phrase de diagnostic, puis les preuves chiffrées.
2. Arrêter / continuer / commencer : au plus 3 points chacun, avec le gain attendu et le coût GPU.
3. File GX10 : garder, réordonner ou couper, avec les durées.
4. Ce qui a changé depuis ta revue précédente et si ses conseils ont été suivis ou à raison écartés.
5. Au plus une décision à faire trancher par l'humain, s'il y en a une vraiment.

# État au 20261022T1047Z (UTC)

## GX10 : sessions et files
```
file-jour2: 1 windows (created Thu Oct 22 09:14:18 2026)
== file-e2-e3/file-status.txt
e2 exit 0 13:18:36
e3 exit 1 14:18:27
done
== file-g/file-status.txt
g1 exit 0 16:15:00
g3 exit 0 16:30:27
g4 exit 0 17:00:32
g2 exit 0 17:36:56
done-reprise
== file-jour2/file-status.txt
g5 départ 10:29:48
e7-flux-results finished dernière étape: artemis-GPSVJT-1
n1-gps-bis-results finished dernière étape: artemis-GPS-1
n2-gps-sans-resume-results finished dernière étape: artemis-GPSR-1
n3-gps-journal-results finished dernière étape: artemis-GPSJ-1
n4-qps-results finished dernière étape: artemis-QPS-1
n5-gps-sans-resume-journal-results boeuf-bourguignon-GPSRJ-1 dernière étape: boeuf-bourguignon-GPSRJ-1
n5b-gps-sans-resume-journal-reprise-results finished dernière étape: artemis-GPSRJ-1
n6-gps-sans-resume-bis-results finished dernière étape: artemis-GPSR-1
96 %
10:47:11
```

## Plan courant (tenu par Claude)
Plan courant (22/10 ~11:10 UTC, mis à jour par Claude à chaque changement de file)

Résultats acquis :
- N2 = questions gemma4:26b-a4b + pause vision + Whisper small + vision gemma3:4b sans topicSummary : 21/30
  pertinentes (deux paquets), médiane 5,7 s ; rejoué (N6) : 22/30, 5,2 s, 0 bloc perdu. Confirmé.
- N5 = N2 + journal mémoire : 22/30, 6,8 s, 30/30 sous 15 s ; mémoire 4/6 contre 3/6 pour N2 (trop peu de questions).
- GPS : 21/30 dans trois paquets ; variabilité d'un passage : 7 à 8 questions sur 30 basculent.
- topicSummary ne peut pas être supprimé en produit (cartes de la frise TV) : à calculer hors du chemin critique.
- Oracle v3 : 60 questions, dont 27 qui testent la mémoire (fenêtre réelle [P−56 s, P−8 s)).
- Tout est committé et poussé jusqu'à la phase N5–N6 (7f79246).

File GX10 :
1. G5 (variantes du journal hors ligne, bras A/B/D/E × 2 passages × 30 questions) — en cours depuis 10:30 UTC.
2. J2 (N2 sur 60 questions, référence sans journal) — démarre automatiquement après G5, ~90 min.
Ensuite, à décider après les notations :
3. J3 (J2 + meilleur journal de G5, 60 questions) — ~90 min.
4. Prototype topicSummary asynchrone par le proxy (charge et fidélité des résumés) — ~90 min.
5. J1 (GPSV sans topicSummary) — reporté.

Règle de fin de phase (Dabi, 22/10) : quand un essai est clos, noté et consigné, compresser ses bruts (gzip -n),
lancer check --changed, committer seulement les dossiers d'essais et le registre, puis pousser main.

## Revue précédente
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
