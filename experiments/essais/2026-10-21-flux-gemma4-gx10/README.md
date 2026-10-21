# E4 — Flux réel : Gemma 4 pour les questions, puis pause vision, puis Whisper small

## Question

Le gain de `gemma4:26b-a4b` mesuré hors ligne (E2) tient-il dans le flux réel, vision active ? La pause vision et
Whisper `small` ajoutent-ils un gain ?

## Configuration

- Kennedy (anglais), Spring (sans dialogue) et CNRS (français) : 15 questions, mêmes préparations qu'E1.
- Trois bras cumulatifs, chacun ajoute un réglage au précédent, par le scénario et `config.env` seuls (aucun
  changement de code) :
  - **G** : questions `gemma4:26b-a4b-it-q4_K_M` ;
  - **GP** : G et pause vision (`visionDuringAsk=false`, `TVLENS_VISION_DURING_ASK=0`) ;
  - **GPS** : GP et Whisper `small` (`ggml-small.bin`, SHA `1be3a9b2…`).
- Référence : E1, même code, mêmes vidéos, configuration produit.
- Lanceur [`labo.py`](../2026-10-21-reference-instrumentee-gx10/labo.py) et proxy de mesure, comme pour E1.
  Plan figé : [`plan.json`](plan.json). 21 octobre, 14:19–15:50 UTC.
- Notation à l'aveugle des 60 réponses (E1 et E4 mélangés, mêmes juges, oracle v2) : [`notation/`](notation/).

## Résultats

9 passages sur 9 complets, 45/45 réponses acquises, sceau complet.

| Configuration | Délai médian (Kennedy / Spring / CNRS) | Sous 15 s | Pertinentes | dont sous 15 s | Inventions | Abstentions injustifiées |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| E1 (actuelle) | 19,2 / 15,2 / 24,2 s | 3/15 | 8/15 | 0 | 3 | 7 |
| G | 12,2 / 9,1 / 12,2 s | 12/15 | 9/15 | 7 | 2 | 2 |
| GP | 7,2 / 5,2 / 7,2 s | 15/15 | 8/15 | 8 | 2 | 4 |
| **GPS** | 9,4 / 5,2 / 7,9 s | 15/15 | **10/15** | **10** | 2 | 2 |

Pertinentes sous 15 s, par vidéo, en GPS : Kennedy 5/5, CNRS 4/5, Spring 1/5. En E1 : 0/5 partout.
Blocs vision perdus : 1 dans six passages, 12 dans trois (E1 : 1 / 14 / 14 sur ces vidéos).

## Lecture

- Dans le flux, Gemma 4 et la pause vision divisent le délai par 2 à 3 : toutes les réponses arrivent sous 15 s,
  contre 3 sur 15 aujourd'hui.
- Kennedy gagne le plus : plus de réponse jetée par la validation des preuves, et 5/5 pertinentes sous 15 s.
- La pertinence ne baisse pas ; elle monte légèrement avec GPS (10/15 contre 8/15).
- Spring reste faible partout (perception et mémoire), et `cnrs-06` régresse avec Gemma 4 (note 1 contre 3).

## Limites et incidents

- Un passage par bras, bras cumulatifs, 15 questions : l'effet propre de chaque réglage n'est pas isolé, et un
  écart de 1 ou 2 réponses peut venir du hasard du flux.
- La comparaison avec E1 se fait à quelques heures d'écart. Des téléchargements de modèles tournaient pendant E1,
  pas pendant E4.
- Oracle et juges sont des modèles. La grille plafonne à 2/3 une réponse en français à une question en anglais,
  alors que TVLens répond en français par conception : cela pèse sur toutes les configurations de la même façon.
- Les corps de requêtes vision et les préparations restent sur la GX10
  (`/home/nvidia/tvlens-setup/labo-claude/e4-flux-results/`). Empreintes dans [`bruts/`](bruts/).
