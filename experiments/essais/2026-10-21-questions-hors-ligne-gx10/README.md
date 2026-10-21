# E2 — Modèle de questions, rejeu hors ligne

## Question

À requête identique, un autre modèle de questions répond-il plus vite sans perdre en pertinence ?

## Configuration

- Les 30 premières requêtes de question capturées en E1 (consigne, contexte, outils et schéma JSON identiques).
  Seul le champ `model` change, et `think` pour le bras avec raisonnement.
- GX10, GPU sans autre charge, 21 octobre 12:28–13:18 UTC. Chaque modèle est chargé puis échauffé, ensuite
  mesuré sur les 30 requêtes dans un ordre fixe. La référence passe au début et à la fin.
- Script [`rejouer_questions.py`](rejouer_questions.py), plans construits par
  [`construire_plans.py`](construire_plans.py) et lancés par la file [`file-e2-e3.sh`](file-e2-e3.sh).
  Plan figé et empreintes dans [`bruts/`](bruts/).
- Bras retiré avant le départ : `qwen3.8:27b-nvfp4`, car ce tag Ollama exige MLX, indisponible sous Linux.
- Notation à l'aveugle avec l'oracle v2 (dans [`notation/`](notation/)), par deux juges automatiques et un troisième
  sur les désaccords. Les réponses d'E1 (flux réel) sont notées dans le même paquet.

## Résultats

« Gardées » : réponses pertinentes (note ≥ 2/3, sans invention) qui passeraient aussi la validation des preuves de
TVLens (champ `citations` rempli). Détail : [`notation/bilan.md`](notation/bilan.md).

| Bras | Délai médian | Génération | Gardées /30 | Inventions | Abstentions injustifiées |
| --- | ---: | ---: | ---: | ---: | ---: |
| Référence `qwen3.8:27b` | 9,2 s | 24 jet/s | 17 (21 pertinentes) | 5 | 6 |
| Variante MTP du même modèle | 9,3 s | 24 jet/s | 17 | 5 | 6 |
| MoE `qwen3.6:35b-a3b` | 3,5 s | 64 jet/s | 18 | 8 | 2 |
| MoE `qwen3.6:35b-a3b-mtp` | 3,1 s | 80 jet/s | 18 | 7 | 2 |
| **MoE `gemma4:26b-a4b`** | **4,6 s** | 54 jet/s | **20** | **4** | 3 |
| MoE `qwen3.6:35b-a3b-mtp` avec raisonnement | 17,7 s | 83 jet/s | 8 | 2 | 9 |
| E1, flux réel (`qwen3.8:27b`, vision active) | 17,5 s | 10–14 jet/s | 18 | 4 | 10 |

## Lecture

- `gemma4:26b-a4b` est le meilleur compromis : 2 fois plus rapide que la référence, plus de réponses gardées, et pas
  plus d'inventions. Il passe en confirmation dans le flux réel (E4).
- Les MoE Qwen sont les plus rapides (3 s), mais inventent plus souvent : 7 à 8 réponses contre 5.
- La variante MTP n'apporte rien : le MTP est déjà actif dans le tag produit (`draft_num_predict 4`).
- Le raisonnement multiplie les jetons par 10 et casse le JSON dans 8 cas sur 30 : écarté.
- Le flux réel est 2 fois plus lent que le modèle seul (17,5 contre 9,2 s), à cause de la vision en parallèle.

## Limites et incidents

- Délais mesurés sur le modèle seul : en flux, ils seront plus longs (E4 le mesure).
- Un appel par question et par bras, et seulement le premier tour : les outils ne sont pas exécutés (aucun n'a été
  appelé).
- Oracle et juges sont des modèles, sans relecture humaine ; les deux juges concordent presque toujours.
- Les réponses de la référence, de la variante MTP et de la répétition de fin sont identiques (température 0) ;
  elles ont été regroupées avant notation.
