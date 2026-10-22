# C1 — Local (GX10) contre Codex (cloud), sur les mêmes questions

## Question

TVLens a deux voies de questions : la voie Codex (un modèle OpenAI dans le cloud, avec sa recherche web intégrée) et
la voie locale mesurée sur la GX10. Aucune mesure ne les comparait sur les mêmes questions. Où en est la voie locale ?

## Configuration

- Mêmes 102 questions que l'oracle v4, avec EXACTEMENT le contexte reçu par le modèle local :
  - contextes de J6 (journal du produit) pour les 60 questions vidéo ;
  - contextes de J2, question remplacée, pour les 42 W/M/O, comme H1, H2 et H4.

  Script d'export : [`scripts/construire_c1.py`](scripts/construire_c1.py).
- Codex `gpt-6-luna`, effort de raisonnement faible, recherche web intégrée en direct, via `codex exec` sur le Mac,
  4 en parallèle, 22/10 vers 22:15 UTC ([`scripts/codex_c1.py`](scripts/codex_c1.py)). Seules deux lignes de consigne
  changent : le mode local devient « recherche web ouverte » ; la règle web demande de chercher et de citer les pages
  ouvertes. Codex n'a pas les outils vidéo, donc pas de relecture d'images. Le délai Codex inclut le démarrage de
  l'outil en ligne de commande.
- Budget demandé par Dabi : 20 % du quota Codex au plus. Consommé : moins de 1 % (jauge hebdomadaire à 8 % avant et
  après). Jetons d'entrée moyens : environ 30 000 par question vidéo, environ 100 000 par question web.
- Notation à l'aveugle dans le MÊME paquet que les réponses locales (J6 pour la vidéo, H4-V0 pour W/M), mêmes juges,
  mêmes grilles : [`notation-video/`](notation-video/), [`notation-web/`](notation-web/).

## Résultats

| | Codex | Local |
| --- | ---: | ---: |
| Questions vidéo justes | **42/60** | 38/60 (J6, renoté ; 40 à sa première notation) |
| dont faits anciens | 11/19 | 9/19 |
| Inventions (vidéo) | **7** | 12 |
| Délai médian (vidéo) | 5,5 s | 6,2 s (flux réel, GX10) |
| Questions web justes (W) | 11/18 | **12/18** (H4, début de page) |
| Questions mixtes justes (M) | **4/12** | 2/12 |
| Inventions (W + M) | **2** | 6 |
| Délai médian (W/M) | 10,8 s (90e centile ~19 s) | ~8,5 s estimé (0,65 + 1,7 + 6,2 s) |
| Relecture d'images (O) | 0/12 | non comparé ici (H1 : 4/24 avec l'outil) |

- Face à face sur la vidéo : Codex gagne 8 questions et en perd 4 (test des signes : p ≈ 0,39).
- Codex a lancé une recherche pour 13 W sur 18 et 8 M sur 12.

## Lecture

Le local fait jeu égal avec Codex sur la justesse, à une exécution près. Il répond plus vite aux questions web, mais il
invente davantage. L'écart restant porte sur la prudence (inventions) et sur les questions mixtes, pas sur la vitesse.

## Limites

- Une seule exécution ; les écarts sont dans le bruit (7 à 8 bascules sur 30 en rejouant une configuration).
- Codex reçoit le contexte déjà construit par le local ; la voie Codex du produit construirait le sien.
- Le délai Codex est mesuré depuis le Mac et inclut le démarrage de `codex exec` ; le délai local est celui du flux
  réel sur la GX10.
- `gpt-6-luna` en effort faible n'est qu'un des réglages possibles de la voie Codex.
