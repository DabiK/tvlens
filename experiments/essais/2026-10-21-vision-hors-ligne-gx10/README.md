# E3 — Modèle de vision, rejeu hors ligne

## Question

À requête de vision identique (mêmes images, consigne et schéma), un autre modèle décrit-il un bloc de 8 s plus vite
que `gemma3:4b`, sans casser le format ?

## Configuration

- 36 requêtes de vision capturées en E1 (6 par vidéo, positions régulières), avec leurs images.
- Seul le modèle change. GPU sans autre charge, 21 octobre, 13:18–14:18 UTC. Chaque modèle est chargé puis échauffé.
- Script [`rejouer_vision-e3.py`](rejouer_vision-e3.py) (version exécutée), plan et bruts dans [`bruts/`](bruts/).

## Résultats

| Modèle | Délai médian par bloc | Blocs > 8 s | Jetons écrits (médiane) | JSON invalide |
| --- | ---: | ---: | ---: | ---: |
| `gemma3:4b` (référence) | **6,7 s** | 3/36 | 219 | 0 |
| `qwen3-vl:2b` | 8,2 s | 19/36 | 560 | 16 |
| `qwen3-vl:4b` (BF16) | 17,0 s | 35/36 | 316 | 8 |
| `qwen3-vl:8b` | 15,9 s | 36/36 | 333 | 3 |
| `gemma4:e4b` | 13,7 s | 36/36 | 1 223 | 0 |
| MoE `qwen3-vl:30b-a3b` | 11,3 s | 33/36 | 327 | 0 |

## Lecture

- Aucun modèle ne bat `gemma3:4b`, qui reste le seul à tenir presque toujours la cadence de 8 s.
- Les Qwen-VL écrivent plus et cassent parfois le JSON.
- `gemma4:e4b` a le préremplissage le plus rapide (1,7 s contre 3,1 s), mais écrit 1 223 jetons, très
  probablement à cause de son raisonnement actif par défaut. Il est relancé sans raisonnement dans le complément E3b.
- La pertinence des descriptions n'a pas été notée : tous les candidats sont plus lents, donc inutilisables tels quels.

## Complément E3b (21 octobre, 15:50–16:05 UTC)

Mêmes 36 blocs, script corrigé ([`complement/rejouer_vision.py`](complement/rejouer_vision.py)) : sur les blocs que le
produit envoie avec 3 images, le bras « 3 images » les garde toutes. Ajout de `gemma4:e4b` avec `think=false`.
Descriptions notées à l'aveugle contre les images de référence (toutes les 2 s) et la transcription complète,
par deux juges automatiques et un troisième sur les désaccords : [`complement/notation/`](complement/notation/).

| Bras | Délai médian | Blocs > 8 s | Justesse /3 | Couverture /3 | Blocs avec invention |
| --- | ---: | ---: | ---: | ---: | ---: |
| `gemma3:4b`, 5 images (référence) | 6,7 s | 3/36 | 1,57 | 1,65 | 27/36 |
| `gemma3:4b`, 3 images | 5,6 s | 0/36 | 1,60 | 1,67 | 21/36 |
| **`gemma4:e4b`, sans raisonnement** | **4,2 s** | **0/36** | **2,58** | **2,11** | **4/36** |

Les références de début et de fin sont identiques (température 0) : pas de dérive. Sans raisonnement, `gemma4:e4b`
est à la fois plus rapide et nettement plus juste. La vision actuelle invente dans 3 blocs sur 4 : un drapeau tenu en
main, ou une citation reprise d'un passage antérieur. Gain confirmé sur chacune des six vidéos (justesse de 2,3 à 3,0
contre 1,2 à 2,0). Ce modèle passe en test dans le flux réel (E5).

## Limites et incidents

- Le bras « `gemma3:4b` à 3 images » et la référence de fin n'ont pas tourné. Mon script a planté sur les blocs que
  le produit envoie déjà avec 3 images seulement (8 sur 36). Corrigé ; ces bras sont relancés dans E3b, après E4.
- Un passage par modèle, sur le GPU seul : dans le flux, la vision est ralentie par les questions.
