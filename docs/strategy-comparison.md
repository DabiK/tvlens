# Choix du réexamen vidéo — 28 septembre 2026

**Choix retenu : Gemini 3.8 Flash + vidéo native ralentie ×4.** La sélection
adaptative améliore les planches sur ce corpus, mais la vidéo obtient la même
justesse avec moins de coût et de délai. Les variantes restent interchangeables
derrière `ClipInspectionPort`, sans changement du domaine ou des outils MCP.

## Comparaison finale contrôlée

Dix clips fixes de six secondes ; modèle `google/gemini-3.8-flash`, question et
intervalle `[0,6000]` ms identiques entre stratégies. Ordre des variantes alterné
par clip. Aucune réponse attendue ni annotation spatiale n'est donnée au modèle.
Les fichiers vidéo et leurs empreintes SHA-256 sont communs aux variantes.

| Stratégie | Action sans ajout erroné | Citations justifiées | Coût retourné / 10 clips | Appels API | Médiane, préparation incluse |
| --- | --- | --- | --- | --- | --- |
| Vidéo native ×4 | **8/10** | **8/10** | **0,01972125 $** | 10 | **1,937 s** |
| Planches uniformes | 4/10 | 4/10 | 0,050295 $ | 10 | 2,447 s |
| Planches adaptatives | **8/10** | **8/10** | 0,0501285 $ | 10 | 2,294 s |
| Adaptatif + crop proposé par le modèle | 7/10 | 7/10 | 0,11286525 $ | 18 | 4,164 s |

Les coûts proviennent des `usage.cost` réels, pas d'une estimation du nombre
« d'images ». Tous les appels de sélection de zone sont inclus. Deux sélections
ont produit une réponse non structurée avant l'analyse finale : elles sont des
échecs, et leur coût reste compté. Aucun appel échoué n'est retiré du dénominateur.
La plus longue variante de cette série a pris 5,191 s au port de réexamen.

La latence comprend décodage, sélection, rendu, sélection de zone et analyse.
Elle **exclut ici Codex et la recherche de passages**, car l'intervalle est imposé
pour contrôler la comparaison. Le parcours intégré avec Codex/MCP a été testé
séparément, en environ 27 s, avec capture continue, annulation et relecture.

- [Réponses complètes, usages et temps](strategy-comparison-live.json)
- [Revue qualitative des 40 réponses, liée à l'empreinte du rapport](strategy-comparison-review.json)
- [Critères de correction](action-evaluation-rubric.md)
- [Parcours intégré réel](reexamen-ui-live.json)

## Ce que les échecs montrent

Le score est strict : une action juste avec un mouvement inventé échoue. La vidéo
native ajoute une légère descente au croisement du clip 6. Pour le clip 8, elle
invente une phase de taille constante et cite des horaires internes non reconvertis
dans le texte, malgré les champs temporels reconvertis correctement par le code.
Ces deux erreurs restent explicitement pénalisées.

Les planches uniformes ajoutent des déplacements ou recentrages : le modèle
confond parfois la position dans la grille avec la position dans la frame.
Les séparateurs visibles et les consignes aident, sans supprimer complètement ce
risque. Sur ce corpus et ce modèle, le pipeline adaptatif passe de 4 à 8 réponses
correctes au même budget de 30 frames envoyées. Il utilise toutefois un pool de
candidats plus dense : ce résultat ne mesure pas une déduplication isolée.

Le crop augmente nettement le coût et n'améliore pas le score global. Il reste
optionnel, jamais imposé au parcours normal. Une erreur de rectangle entraîne
maintenant un repli explicite vers les vues complètes ; une génération invalide
reste une erreur visible. La vidéo conserve le meilleur compromis observé.

## Comment frames et zones sont choisies

- Uniforme : environ 5 fps sur ces clips, 30 frames et cinq planches 3×2.
- Adaptatif : jusqu'à 160 candidats locaux à 8 fps ; delta RGB après réduction
  à 64×64, paires avant/après changements, première/dernière frame et repères
  temporels, puis remplissage des trous jusqu'au budget de 30 frames. Aucune
  reconnaissance des formes du corpus n'entre dans le sélecteur.
- Crop : un appel au même modèle lit les planches complètes et la question pour
  proposer un rectangle normalisé ou null. Aucun masque ni annotation du générateur
  n'est fourni. Le rectangle reste fixe pour toute la séquence ; les deux vues
  utilisent exactement les mêmes timestamps, sans suivi ou recentrage par frame.

Six frames par planche, ordre gauche→droite puis haut→bas. Cases de 384×384,
letterboxing fixe, numéros et timestamps ; planche de 1200×868 pixels. Au plus
cinq planches complètes et cinq recadrées. Audio séparé, aligné et à vitesse normale
pour les planches ; ralenti ×4 avec la vidéo native. Tous les travaux partagent
le même signal d'annulation et le délai total de 60 s.

## Historique conservé

Avec Gemini 2.5 Flash, la première comparaison complète donnait 8/10 en vidéo
native et 0/10 strict pour les trois variantes en planches. Deux variantes trouvaient
la bonne couleur mais ajoutaient une position fausse. Coût vidéo : 0,023710 $ pour
dix clips, médiane 3,272 s. Aucun résultat favorable n'a été choisi à la place des
échecs : [rapport initial](strategy-comparison-v1-failures.json),
[revue](strategy-comparison-v1-review.json).

La version avec séparateurs a ensuite été comparée sur les dix clips avec ce même
modèle : [rapport Flash 2.5 v2](strategy-comparison-flash25-v2.json). Une interruption
HTTP 402 est conservée dans [le rapport interrompu](strategy-comparison-v2-interrupted.json).
OpenRouter exigeait au moins 1 USD de solde disponible pour accepter une vidéo ;
ce n'était pas une consommation de tout notre plafond. La réserve rejetée a été
rapprochée de l'usage réel de la clé : [justificatif](budget-reconciliation.json).
Les essais ont repris après rechargement ; les tentatives échouées sont conservées.

Un essai antérieur complet avec Codex et Flash 2.5 obtenait également **8/10 contre
0/10 pour Ask échantillonné** : [réponses](action-evaluation-live.json),
[revue stricte](action-evaluation-review.json). Cette comparaison inclut le choix
du passage par l'agent, contrairement au tableau contrôlé ci-dessus.

## Portée et budget

Ce corpus synthétique, muet et utilisé pendant le développement n'est pas un jeu
indépendant. Il ne prouve ni 80 % de fiabilité sur des films, ni la compréhension des
sons ou des gestes humains. Les modèles peuvent encore inventer des détails ;
les citations facilitent la relecture, elles ne rendent pas une description vraie.

Le plafond supplémentaire a été porté explicitement de **1 à 5 USD au total**, en
conservant toutes les dépenses précédentes. Le compteur fait foi dans
`.local/research-budget.json`. L'observation/Ask rapide garde son budget antérieur
séparé de 1 USD. Les quotas Codex sont distincts.

Voir [les sources de recherche et les adaptations](temporal-research.md).
