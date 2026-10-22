# Nuit du 21 au 22 octobre — quatre variantes de GPS dans le flux réel

## Question

Quatre questions, chacune testée par un passage de six vidéos dans le flux réel, en partant de GPS (questions
`gemma4:26b-a4b`, pause vision, Whisper `small`, vision `gemma3:4b`), la meilleure configuration d'E5 :

- **N1** : GPS rejoué à l'identique. Quelle est la variabilité d'un passage à l'autre ?
- **N2** : vision sans le résumé cumulatif `topicSummary`. Le gain de vitesse de G4 tient-il dans le flux, sans perte
  de pertinence ?
- **N3** : journal mémoire seul, sans les deux phases d'E7. Gagne-t-il les questions à fait ancien sans perdre les
  autres ?
- **N4** : questions sur le MoE `qwen3.6:35b-a3b-mtp`. Fait-il mieux que Gemma 4 dans le flux ?

## Configuration

- Lanceur `labo.py` et proxy de mesure, comme E5 à E7. Le proxy est [`ollama_proxy-nuit.py`](ollama_proxy-nuit.py),
  identique pour les quatre passages :
  - N2 : `--rewrite vlm=no-topic-summary` retire le champ du schéma de vision et sa règle du prompt ;
  - N3 : `--rewrite questions=journal` injecte les passages plus anciens que les 6 récents, plafonnés à 10 000
    caractères.

  Aucune ligne de TVLens n'est modifiée.
- Plans et lanceurs figés : [`plans/`](plans/). Chaque passage attend la clôture du précédent.
- Horaires (UTC) : N1 21/10 23:08 → 22/10 00:39 ; N2 00:39 → 02:10 ; N3 02:10 → 03:41 ; N4 03:41 → 05:12.
- 24 passages sur 24 complets, quatre sceaux vérifiés après rapatriement (2 771 fichiers chacun, aucun divergent).
  Résultats bruts par variante : [`bruts/`](bruts/).
- Notation à l'aveugle des 150 réponses (GPS d'E4/E5, N1 à N4) dans **un seul paquet** : mêmes juges pour toutes les
  variantes, 150 textes distincts, 8 arbitrages. Voir [`notation/`](notation/).

## Résultats

| Variante | Pertinentes /30 | dont sous 15 s | Inventions | Abst. injustifiées | Note moyenne | Délai médian | Blocs vision perdus |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| GPS (E4/E5, renotée) | 21 | 20 | 5 | 3 | 2,20 | 7,1 s | 1 à 14 par vidéo |
| N1 : GPS rejoué | 17 | 17 | 9 | 2 | 1,90 | 8,5 s | 0 à 37 par vidéo |
| **N2 : sans `topicSummary`** | **21** | **21** | **4** | 3 | 2,13 | **5,7 s** | **0** |
| N3 : journal seul | 21 | 18 | 4 | 3 | 2,13 | 9,1 s | 0 à 25 par vidéo |
| N4 : questions Qwen MoE | 18 | 17 | 7 | 3 | 2,03 | 6,1 s | 0 à 16 par vidéo |

Mémoire. Avec la fenêtre réelle du contexte, aucune des 30 questions ne dépend entièrement de faits sortis de la fenêtre
de 48 s.
Six questions demandent au moins un fait hors de la fenêtre (`cnrs-05`, `cnrs-06`, `cuisine-02`, `cuisine-05`,
`cuisine-07`, `spring-06`). Les 24 autres sont entièrement dans la fenêtre :

| | GPS | N1 | N2 | N3 | N4 |
| --- | ---: | ---: | ---: | ---: | ---: |
| Pertinentes, fait hors fenêtre (/6) | 1 | 2 | 2 | **4** | 1 |
| Pertinentes, faits dans la fenêtre (/24) | 20 | 15 | 19 | 17 | 17 |

Vitesse :
- **N2** : vision `gemma3:4b` à 4,9–5,4 s par bloc, 1 bloc sur 667 au-delà de 8 s. Aucune sortie ne contient
  `topicSummary`.
- **N3** : contexte des questions 4 762 jetons (GPS ≈ 2 500), jusqu'à 70 passages injectés. Aucun appel d'outil, aucune
  erreur.
- **N4** : 44 jetons/s en sortie, 3 réponses `insufficient` sur Spring.

Pertinentes par vidéo (Kennedy, Spring, CNRS, Bœuf, Tears, Artemis) :

| GPS | N1 | N2 | N3 | N4 |
| --- | --- | --- | --- | --- |
| 5, 1, 4, 2, 4, 5 | 4, 1, 4, 2, 1, 5 | 5, 2, 2, 3, 4, 5 | 3, 3, 4, 3, 4, 4 | 4, 2, 2, 2, 3, 5 |

Questions qui basculent face à GPS :

| Variante | Gagnées | Perdues |
| --- | --- | --- |
| N1 | 2 | 6 (dont 3 sur Tears) |
| N2 | 3 | 3 |
| N3 | 5 | 5 |
| N4 | 2 | 5 |

## Lecture

- **Variabilité** : rejouer GPS à l'identique fait basculer 8 questions sur 30 (17 contre 21 pertinentes). Sur 30
  questions et un passage, un écart de quelques réponses est du même ordre que ces bascules et ne suffit pas à
  conclure ; ce n'est pas un seuil statistique (remarque de Codex Astra). Les délais
  varient moins (médiane 7,1 s puis 8,5 s), mais les blocs vision perdus par `gemma3:4b` varient beaucoup (Artemis : 14
  puis 37).
- **N2 est la meilleure variante de la nuit.** Elle a la pertinence de GPS (21/30, 4 inventions), le délai médian le
  plus bas (5,7 s), 21 réponses pertinentes sous 15 s et aucun bloc vision perdu. Retirer `topicSummary` donne à
  `gemma3:4b` la régularité de `gemma4:e4b` (GPSV). Elle est plus rapide que GPS sur 25 questions sur 30 (test des
  signes, p ≈ 0,0003).
  Elle ne passe pas telle quelle en produit : `topicSummary` est le résumé cumulatif des cartes de la frise TV
  (`core/memory/lanes.cjs`, `docs/lg-timeline.md`) et il est renvoyé à la vision suivante comme `previousTopicSummary`.
  Il faut le calculer hors du chemin critique (au changement de sujet, tous les N blocs ou hors pause).
- **N3** : le journal gagne les questions qui demandent un fait hors de la fenêtre (4/6 contre 1/6), comme en G2 et
  E7, mais perd sur les autres (17/24 contre 20/24) et coûte 2 s par question. Le solde est nul sur un passage.
- **N4** : Qwen MoE est rapide, mais il ne fait pas mieux que Gemma 4 et invente plus (7 contre 5). Écarté.
- Suite lancée : N5 (N2 + journal) puis N6 (N2 rejoué, pour mesurer sa variabilité). La GX10 a été redémarrée à la
  main à 06:04 UTC (souris ou clavier USB branché à 06:03, arrêt par le menu de session GNOME). N5 s'est arrêté après
  Kennedy, Spring et CNRS, et N6 n'a pas démarré. Leurs plans sont dans [`plans/`](plans/).

## Suite du 22 octobre : N5 et N6

- **N5** : N2 avec le journal mémoire (`--rewrite vlm=no-topic-summary`, `questions=journal`). Kennedy, Spring et CNRS
  ont été joués de 05:25 à 05:55 UTC. Bœuf, coupé par le redémarrage, a été rejoué avec Tears et Artemis de 07:59 à
  09:00 UTC (N5b, après relance d'Ollama avec ses réglages d'origine). La partie interrompue n'a pas de sceau : ses
  empreintes ont été relevées à la main.
- **N6** : N2 rejoué à l'identique, de 09:00 à 10:30 UTC.
- Notation à l'aveugle de GPS, N2, N5 et N6 dans un même paquet (120 réponses, 119 textes distincts, 5 arbitrages) :
  [`notation-n5-n6/`](notation-n5-n6/).

| Variante | Pertinentes /30 | dont sous 15 s | Inventions | Abst. injustifiées | Délai médian | Blocs perdus | Hors fenêtre /6 · fenêtre /24 |
| --- | ---: | ---: | ---: | ---: | ---: | --- | --- |
| GPS (renotée) | 21 | 20 | 5 | 3 | 7,1 s | 1 à 14 par vidéo | 2 · 19 |
| N2 (renotée) | 21 | 21 | 5 | 3 | 5,7 s | 0 | 3 · 18 |
| **N5 : N2 + journal** | **22** | **22** | **4** | 3 | 6,8 s | 0 | **4** · 18 |
| **N6 : N2 rejoué** | **22** | **22** | 5 | 1 | **5,2 s** | 0 | 3 · 19 |

Lecture :
- Les quatre configurations sont à égalité à une réponse près. Rejouer N2 fait basculer 7 questions (+4 / −3), comme
  N1 pour GPS (8) : sur 30 questions, ces écarts restent du bruit.
- Les notes tiennent d'un paquet à l'autre : GPS obtient 21/30 pour la troisième fois et N2 21/30 pour la deuxième.
- La vitesse de N2 se reproduit (5,2 s et 5,7 s de médiane, 30/30 sous 15 s, aucun bloc perdu).
- N5 garde la vitesse (6,8 s, 30/30 sous 15 s) : retirer `topicSummary` compense le coût du journal. Son avantage
  sur la mémoire (4/6 contre 3/6) est trop petit pour conclure. Seules 6 questions sur 30 en dépendent, d'où la
  comparaison sur 60 questions (J2 sans journal, J3 avec), dont 27 dépendent de la mémoire.

## Limites et incidents

- Un passage par variante. La variabilité mesurée par N1 interdit de départager N2, N3 et GPS en pertinence.
- Oracle et juges sont des modèles (voir le dossier de méthode). GPS, renotée dans ce paquet, obtient 21/30 comme
  en E5.
- « Hors fenêtre » suit la fenêtre réelle relevée dans les requêtes de N2 : à une pose P, les 6 passages reçus couvrent
  [P − 56 s, P − 8 s), car le bloc qui se ferme à la pose n'est pas encore traité. Une première version de ce dossier
  utilisait une règle plus simple (pose moins début
  du premier fait > 48 s), qui comptait 12 questions « anciennes » alors que leurs faits débordent souvent dans la
  fenêtre. Codex Astra a relevé l'incohérence avec E7 ; les chiffres ont été recalculés le 22/10.
- Les corps de requêtes, les entrées et la télémétrie restent sur la GX10
  (`/home/nvidia/tvlens-setup/labo-claude/n*-results/`).
  Empreintes dans `bruts/*/empreintes-hors-git.txt`.
- Les campagnes (`bruts/**/campagnes/*.json.gz`) et les journaux du proxy (`*.jsonl.gz`) sont compressés avec
  `gzip -n` pour le dépôt : `gunzip -k` rend les fichiers d'origine, et leurs empreintes SHA-256 restent celles des
  fichiers non compressés.
