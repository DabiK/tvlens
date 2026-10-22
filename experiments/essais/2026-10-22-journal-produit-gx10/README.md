# J6 — Le journal mémoire intégré au produit, sur 60 questions

## Question

Dans J3, le journal mémoire était injecté par le proxy. Il portait les réponses pertinentes de 28 à 38 sur 60, mais
8 réponses étaient rejetées par la validation des citations de TVLens : elles citaient des passages du journal, que
DeepAsk ne connaissait pas. Le journal construit par TVLens lui-même (ticket T313, ADR 0064), avec des entrées citables,
fait-il au moins aussi bien, sans ces rejets ?

## Configuration

- Code : `83cddd5` (branche `feat/journal-memoire-local`). La seule différence avec le code de J2 et J3 (`2035a2f`) est
  le journal : un condensé des passages plus anciens que les 6 récents (transcription, une ligne « Image » au départ et à
  chaque changement de sujet, 10 000 caractères au plus), placé avant eux, pour une question de chat locale. Écarts avec
  le journal du proxy : [`plans/notes-j6-ecarts-t313.md`](plans/notes-j6-ecarts-t313.md).
- Reste de la configuration : celle de J2. Questions `gemma4:26b-a4b`, pause vision, Whisper `small`, vision `gemma3:4b`
  sans `topicSummary` (proxy `--rewrite vlm=no-topic-summary`, sans réécriture des questions). Mêmes 60 questions de
  l'oracle v3.
- Checkout séparé sur la GX10 (`/home/nvidia/tvlens-j6`), pour laisser le checkout principal sur le code de J5.
  22 octobre, 16:42–18:12 UTC, file dynamique ([`plans/`](plans/)). Sceau complet ; 13 fichiers vérifiés au
  rapatriement, aucun divergent. Bruts compressés : [`bruts/`](bruts/).
- Notation à l'aveugle des réponses de J6 **et de J3 dans le même paquet**, contre l'oracle v3 : 120 réponses,
  119 textes distincts, 7 arbitrages ([`notation/`](notation/)).
- Critères fixés avant le départ :
  - rejets « Je n'ai pas pu relier » ≤ 2 (J3 : 8) ;
  - pertinentes ≥ 38/60 ;
  - inventions ≤ 9 ;
  - 60/60 sous 15 s.

## Résultats

| | Pertinentes /60 | Inventions | Abst. injustifiées | Rejets de citations | Délai médian | Sous 15 s | Blocs perdus |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| J3 : journal du proxy (renoté) | 38 | 9 | 14 | 8 | 6,3 s | 60/60 | 7 |
| **J6 : journal du produit** | **40** | 10 | **8** | **0** | **6,2 s** | **60/60** | **0** |

| Pertinentes | J3 | J6 |
| --- | ---: | ---: |
| Entièrement anciennes (/19) | 6 | **9** |
| Mixtes (/8) | 7 | 7 |
| Récentes (/33) | 25 | 24 |

- J6 gagne 9 questions et en perd 7 face à J3 (test des signes : p ≈ 0,80).
- Des 8 réponses rejetées dans J3, 6 sont pertinentes dans J6 : `artemis-n1`, `artemis-n2`, `artemis-n4`,
  `cnrs-n2`, `cnrs-n3`, `artemis-07`. Les 2 autres sont des inventions (`kennedy-n1` décale la chronologie,
  `tears-n5`).
- J3 renoté dans ce paquet retrouve exactement son score de la première notation (38/60, 9 inventions).
- Critères : rejets **0** (≤ 2), pertinentes **40** (≥ 38), **60/60** sous 15 s ; inventions **10**, une de plus que le
  seuil de 9.

## Lecture

- Le journal intégré au produit fait au moins aussi bien que celui du proxy, sans réécriture des requêtes. La
  validation des citations ne rejette plus rien, les abstentions injustifiées passent de 14 à 8 et les questions
  entièrement anciennes de 6 à 9 sur 19.
- Le gain total (+2) reste dans le bruit d'un passage : rejouer une configuration fait basculer 7 à 8 questions sur
  30. Les 6 réponses récupérées sur les rejets sont compensées par des bascules ailleurs, surtout sur Spring et Tears.
- Le produit atteint la meilleure configuration mesurée sans le proxy pour les questions : **N2 + journal du produit**.
  La vitesse ne change pas (6,2 s) et aucun bloc de vision n'est perdu.
- La mémoire reste le point faible : 9 questions anciennes sur 19 seulement. Les échecs restants portent sur des faits
  visuels, que le journal ne décrit qu'au changement de sujet (voir J3).

## Limites et incidents

- Un passage ; oracle et juges sont des modèles (audit croisé par Codex Astra : 90 % d'accord sur le statut).
- J5 avait démarré à 16:34 UTC sur le checkout principal ; il a été arrêté par SIGTERM à 16:41 UTC (Kennedy en cours)
  pour passer J6 d'abord. Il est remplacé par J5b (J6 + résumé asynchrone seul).
- Les bruts versionnés sont les campagnes et les journaux du proxy, compressés avec `gzip -n`. Les médias et les
  téléversements restent sur la GX10 ; leurs empreintes sont dans `bruts/empreintes-hors-git.txt` et dans le sceau
  `integrite.json` de la GX10.
