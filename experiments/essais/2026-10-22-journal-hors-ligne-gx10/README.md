# G5 — Variantes du journal mémoire, rejouées hors ligne

## Question

Le journal mémoire améliore les questions dont un fait est sorti du contexte récent (G2, N3), mais il coûte du temps et
semble parfois gêner les questions récentes. Une forme du journal plus courte, ou placée autrement, garde-t-elle le gain
pour moins cher ? Le résultat choisit le journal de J3, la comparaison sur 60 questions dans le flux réel.

## Configuration

- Base : les 30 requêtes de questions capturées en N2 (GPS avec la vision sans `topicSummary`, questions
  `gemma4:26b-a4b`) et les sorties de vision de N2, qui alimentent le journal. Le GPU ne fait rien d'autre.
- Construction : [`scripts/construire_g5.py`](scripts/construire_g5.py). Un bloc entre dans le journal s'il était perçu
  avant la question et s'il est plus ancien que les 6 passages récents, comme dans le proxy. Bras :
  - **A** : sans journal (requête capturée) ;
  - **B** : journal de N3 (transcription de chaque bloc ancien, une ligne d'image au changement de sujet, 10 000
    caractères au plus, placé avant les passages récents) ;
  - **D** : B plafonné à 3 000 caractères ;
  - **E** : B placé après les passages récents ;
  - **F** (calculé, sans appel) : A, puis B si A s'abstient, avec le délai A + B.

  Le bras C (une entrée par sujet) a été construit, mais retiré avant le départ sur la revue de Codex Astra : il change
  plusieurs choses à la fois.
- Rejeu : [`scripts/rejouer_variantes.py`](scripts/rejouer_variantes.py), ordre A B D E E D B A (deux passages par
  bras), un préfixe unique par appel contre le cache. 22 octobre, 10:29–10:50 UTC, 240 appels, aucune erreur. Plan :
  [`plan-g5.json`](plan-g5.json) ; bruts et empreintes : [`bruts/`](bruts/).
- Notation à l'aveugle des 240 réponses (214 textes distincts) contre l'oracle v2 : [`notation/`](notation/).
- Mémoire : 6 questions sur 30 demandent un fait sorti du contexte récent ([P − 56 s, P − 8 s)), soit 12 réponses sur
  60 par bras.

## Résultats

| Bras | Pertinentes /60 | Passages | Inventions | Mémoire /12 | Récentes /48 | Délai médian | Contexte (jetons) |
| --- | ---: | --- | ---: | ---: | ---: | ---: | ---: |
| A : sans journal | 45 | 22 · 23 | 13 | 4 | 41 | 4,22 s | 2 486 |
| **B : journal complet** | **49** | 24 · 25 | **7** | **10** | 39 | 5,50 s | 4 825 |
| D : plafonné à 3 000 car. | 46 | 24 · 22 | 12 | 8 | 38 | 4,69 s | 3 884 |
| E : placé après | 45 | 22 · 23 | 12 | 8 | 37 | 5,47 s | 4 825 |
| F : A puis B si abstention | 45 | — | 14 | 4 | 41 | 4,27 s | — |

Critères fixés avant la notation (revue de Codex Astra) :
- B/A : gain ≥ 4/60 sans plus d'inventions → **oui** (+4, inventions 13 → 7) ;
- D/B : perte ≤ 1/60 et au moins 1 s gagnée → non (−3, 0,8 s gagnée) ;
- E/B : gain ≥ 2/60 → non (−4).

## Lecture

- Le journal complet est le seul gagnant. Il porte la mémoire de 4 à 10 sur 12 et réduit les inventions de près de
  moitié : sans journal, le modèle comble souvent le manque par des faits plausibles. Il coûte 1,3 s par question et
  2 réponses récentes sur 48, ce qui reste dans le bruit.
- Le plafonner ou le déplacer garde une partie du gain sur la mémoire (8/12), mais pas la baisse des inventions.
- F n'apporte rien : sans journal, le modèle ne s'abstient presque jamais (1 fois sur 60), il invente.
- Même sens que G2 (`qwen3.8:27b`, 47/60 contre 38/60). J3 teste donc le journal B dans le flux réel, sur les
  60 questions de l'oracle v3, dont 27 qui dépendent de la mémoire.

## Limites et incidents

- Rejeu hors ligne : GPU seul, sans la vision en parallèle ni la validation des citations par TVLens. Les délais sont
  ceux du modèle seul.
- 6 questions de mémoire seulement : un écart de 6 sur 12 reste fragile, d'où J3.
- Oracle et juges sont des modèles. Un audit par Codex Astra, d'une autre famille de modèles, donne 90 % d'accord sur
  le statut ([revues](../2026-10-21-variantes-gx10/revues/README.md)).
- Juste après G5, le premier départ de J2 a été bloqué par le garde-fou GPU, parce que le modèle de G5 se déchargeait
  encore (voir le registre).
- Le journal des appels est compressé (`bruts/calls.jsonl.gz`, `gzip -n`) ; l'empreinte dans `bruts/empreintes.txt`
  est celle du fichier non compressé sur la GX10.
