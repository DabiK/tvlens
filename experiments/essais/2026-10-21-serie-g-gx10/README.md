# Série G — rejeux à une seule modification (outils, MTP, sortie vision, mémoire)

## Question

Quatre hypothèses de la synthèse de recherche, chacune testée par une seule modification de requêtes capturées en E1,
sur le GPU sans autre charge :
- **G1** : le schéma JSON imposé empêche-t-il le modèle de questions d'appeler ses outils ?
- **G3** : combien le MTP déjà actif accélère-t-il le modèle actuel ?
- **G4** : retirer ou plafonner le résumé cumulatif `topicSummary` accélère-t-il la vision ?
- **G2** : injecter une mémoire des passages anciens améliore-t-il les réponses ?

## Configuration

- Rejoueur [`rejouer_variantes.py`](rejouer_variantes.py) : un bras = une transformation déclarée. Un nonce unique est
  placé en tête de chaque requête pour neutraliser le cache, et chaque modèle est échauffé avant la mesure. Ordre
  A/B/B/A ou A B C C B A. Plans construits par [`construire_plans_g.py`](construire_plans_g.py) et
  [`construire_g2.py`](construire_g2.py), figés par SHA-256 ([`bruts/`](bruts/)).
- Modèles : `qwen3.8:27b` (questions), `gemma3:4b` (vision), `qwen3-embedding:0.6b` (recherche de G2).
- 21 octobre, 16:05–17:37 UTC, lancés par [`file-g-reprise.sh`](file-g-reprise.sh).

## Résultats

| Essai | Bras | Résultat |
| --- | --- | --- |
| G1 (10 questions × 2) | A capturé / B sans schéma / C sans outils | Outils appelés : **A 0/20, B 20/20** (dont 12/12 sur les questions à fait ancien), C 0/20. JSON valide : A et C 20/20, B 0/20 (des appels d'outils à la place). Premier tour : B 5,1 s, A 11,6 s. |
| G3 (15 questions × 2) | défaut (`draft_num_predict 4`) / 0 | Avec MTP : **23,6 jet/s, 10,4 s** ; sans : 11,1 jet/s, 18,4 s. Même longueur (163 jetons). |
| G4 (48 blocs × 2) | référence / sans `topicSummary` / plafond 300 car. | Sans `topicSummary` : **5,2 s** contre 6,7 s, 125 jetons contre 213, 0 bloc > 8 s contre 11. Plafond : 6,5 s, 0 bloc > 8 s. Champs summary et visual quasi inchangés (333 et 354 caractères contre 354). |
| G2 (30 questions × 2) | A capturé / B journal compact / C 6 passages retrouvés | Contexte : 2 662 / 4 906 / 3 557 jetons ; délai médian 10,5 / 13,4 / 11,0 s. **Pertinentes : A 38/60, B 47/60, C 41/60 ; inventions : 14 / 6 / 11** ; abstentions injustifiées 14 / 9 / 10. Faits anciens : 12 / 16 / 13 sur 22. Toutes les vidéos progressent avec B. Notation : [`notation-g2/`](notation-g2/). |

## Lecture

- **G1** confirme la cause du « zéro outil » : avec `think=false`, le schéma JSON contraint la sortie dès le premier
  jeton. Sans lui, le modèle cherche dans la vidéo, par exemple « paysage début de la vidéo » pour `spring-06`. Un
  prototype de répondeur en deux phases, qui retire le schéma au premier tour seulement, est testé dans le flux (E6).
- **G3** : le MTP actuel est un vrai gain (×2). Il n'y a rien à gagner de plus avec la variante `-mtp` (E2).
- **G2** : le journal compact de toute la vidéo est le gain de pertinence le plus net de la journée (+9 réponses
  pertinentes sur 60, inventions divisées par plus de 2), pour +2,9 s. Dans le flux, TVLens rejetterait une citation
  d'un passage injecté : le prototype E7 combine donc le journal et le répondeur en deux phases, pour que le modèle
  lise ce passage par `get_transcript` avant de le citer.
- **G4** : `topicSummary` coûte 40 % des jetons de la vision et un quart de son temps, sans servir aux questions.
  Le retirer est un levier simple ; il reste à le combiner avec la vision `gemma4:e4b`.

## Limites et incidents

- Rejeux sur requêtes figées : en flux, les contextes suivants changent aussi (rétroaction non mesurée).
- La qualité des champs summary et visual de G4 n'est pas notée : seule leur longueur est comparée.
- **Incident** : la première exécution de la file (14:18 UTC) a échoué à l'import, aucune requête n'a été envoyée.
  En mode isolé `python3 -I`, le dossier du script n'est pas dans le chemin d'import. Corrigé dans
  `rejouer_variantes.py` puis relancé à 16:05 UTC. Journaux de l'échec : [`incident-import-1418/`](incident-import-1418/).
