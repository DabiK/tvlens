# F1 — Le produit complet avec le web, rejoué en conditions réelles sur 102 questions

## Question

Avec le journal mémoire et la recherche web locale réunis, le produit répond-il aux questions qui demandent internet
sans dégrader les questions vidéo, et dans quel délai ?

## Configuration

- Branche d'essai `essai/f1-journal-web`, commit `cfa0bf8`, jamais fusionnée dans `main`. Elle réunit :
  - le journal mémoire (T313) ;
  - la recherche web locale (T308–T311) ;
  - la décision de recherche par le modèle (T314) ;
  - le début de page avec la meilleure fenêtre (T315).

  Elle ne contient **pas** T316 (Readability, échéance de 14 s) ni T317, intégrés après le départ.
- Configuration N2 (questions `gemma4:26b-a4b`, pause vision, Whisper small, vision sans `topicSummary`), SearXNG
  sur la GX10, déclencheur `model`, sans titre de la source (le produit ne le connaît pas). Plan :
  [`plans/`](plans/).
- 102 questions : les 60 de l'oracle v3, et les 42 W/M/O de l'oracle v4, chacune posée juste après la question v3 du
  même instant.
- 22 octobre, 21:21–22:52 UTC. Un premier départ, à 21:20, a été bloqué par la garde « autre charge » : elle avait vu
  ma propre commande SSH. Sceau complet, 6 campagnes vérifiées.
- Notation à l'aveugle :
  - vidéo : dans le même paquet que J6 ([`notation-video/`](notation-video/)) ;
  - W/M/O : dans le même paquet que Codex (C1) et le local hors ligne (H4-V0) ([`notation-web/`](notation-web/)).
- Bruts compressés dans [`bruts/`](bruts/). Le texte des pages web est retiré des journaux du proxy, remplacé par son
  empreinte et sa longueur, car le dépôt est public.

## Résultats

| Questions vidéo (60) | F1 | J6, même paquet |
| --- | ---: | ---: |
| Justes | **44** | 39 |
| Faits anciens / mixtes / récents | 10/19 · 8/8 · 26/33 | 9/19 · 7/8 · 23/33 |
| Inventions | **7** | 11 |
| Délai médian | 7,6 s | 6,2 s |
| Recherche lancée | 4 sur 60 | — |

F1 gagne 8 questions et en perd 3 face à J6 (p ≈ 0,23).

| Questions W/M/O | F1 | Codex (C1) | Local hors ligne (H4-V0) |
| --- | ---: | ---: | ---: |
| W /18 | 8 | 11 | 12 |
| M /12 | **5** | 4 | 2 |
| O /12 | 0 | 0 | — |
| Inventions | 7 | 2 | 5 |

Temps propre d'une question, file d'attente exclue (champ `metrics.totalMs`) :

| | Médiane | 90e centile | Maximum | Au-delà de 14 s |
| --- | ---: | ---: | ---: | ---: |
| W | 12,2 s | 15,2 s | 16,6 s | 3 sur 18 |
| M | 10,6 s | 15,0 s | 16,3 s | 2 sur 12 |
| Vidéo | 7,0 s | 10,4 s | 11,3 s | 0 sur 60 |
| O | 4,7 s | 6,6 s | 6,8 s | 0 sur 12 |

- Décision de recherche : 0,8 s en médiane, 2,0 s au plus.
- Recherche et ouverture des pages : 2,0 s en médiane, 5,2 s au plus.
- Blocs de vision perdus : 13, contre 0 pour J6.
- Une réponse rejetée par la validation des citations.

## Lecture

- Aucune baisse n'est observée sur les questions vidéo avec le web : 44/60 contre 39/60 sans web dans le même paquet
  (+8/−3, p ≈ 0,23), et moins d'inventions. Une seule exécution ne prouve pas la non-régression. Ces questions coûtent
  1,4 s de plus, à cause de l'appel de décision, et 13 blocs de vision sont perdus (0 sans web).
- Les questions mixtes profitent du journal (5/12, contre 2/12 hors ligne sans journal).
- Les questions web restent faibles (8/18). Sans titre de la source, la requête du modèle vise souvent la mauvaise
  œuvre. L'essai [H4b](../2026-10-22-web-reel-texte-gx10/) le montre : avec le titre, les mêmes requêtes de F1
  passent à 14/18.
- Une question web prend 12,2 s en médiane, et 5 questions W/M sur 30 dépassent 14 s. T316 les arrêterait
  désormais, sans réponse.
- Les 13 blocs perdus montrent que les réponses web, plus longues, prennent du temps GPU à la vision.

## Limites

- Une exécution, notée par des modèles.
- T316 et T317 ne sont pas mesurés en flux réel.
- Les questions W/M/O sont posées juste après une question vidéo ; leur délai de bout en bout inclut cette file.

## Suite (23/10)

- Le titre de la source (T318), puis le journal mémoire (T313) et l'échéance web portée à 30 s sur décision de Dabi, sont
  intégrés sur `main` (`dd945a5`). Le maximum de temps propre mesuré ici est de 16,6 s : les 30 s sont une marge
  produit, pas un optimum démontré. Aucune de ces versions n'a été rejouée en flux réel après F1.

