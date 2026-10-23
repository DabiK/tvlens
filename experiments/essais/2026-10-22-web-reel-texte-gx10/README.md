# H4 — Quel texte donner au modèle, sur de vraies pages web

## Question

Sur le corpus figé, donner au modèle le début de chaque page plus l'extrait qui recoupe le mieux la question battait le
seul début de page (H2b : 29 contre 24 sur 60). Est-ce vrai sur de vraies pages, ouvertes par le produit ? Et trier des
passages, ou fusionner deux recherches, fait-il mieux ?

## Configuration

- Pages : l'adaptateur SearXNG du produit (branche d'essai `df5da95`) a ouvert les 5 premiers résultats de chaque
  recherche. Les recherches portent sur la requête du modèle (H2, sans titre de vidéo, comme le produit) et sur la
  question brute, pour les 30 questions W/M. Il y a eu 59 recherches, une toutes les 8 s ; le texte des pages est gardé
  en entier, hors de Git, sur la GX10 et le Mac (`web-vivant-20261022`). Script : [`scripts/cache_web.cjs`](scripts/cache_web.cjs).
  Recherche avec ouverture des pages : médiane 1,7 s, 90e centile 3,7 s, maximum 5,3 s, aucune erreur.
- Réponse : requêtes capturées dans J2, comme H1 et H2 ; une exécution, 22 octobre, 21:03–21:19 UTC.
  Script : [`scripts/rejouer_h4.py`](scripts/rejouer_h4.py). Bras :
  - **V0** : début de chaque page (2 500 caractères), le produit avant T315 ;
  - **V1** : début (1 000) + meilleure fenêtre lexicale (1 500), T315 ;
  - **V2** : fusion des deux recherches + V1 ;
  - **V3** : 5 meilleurs passages BM25 sur les 10 pages ;
  - **V4** : mêmes passages classés par plongements.
- Notation à l'aveugle contre l'oracle v4 ; les juges vérifiaient les faits dans le texte des pages ouvertes
  ([`notation/`](notation/)).

## Résultats

| Bras | Justes /30 | W /18 | M /12 | Inventions | Délai de réponse médian |
| --- | ---: | ---: | ---: | ---: | ---: |
| **V0 début de page** | **14** | **12** | 2 | **3** | 6,2 s |
| V1 début + fenêtre (T315) | 14 | 12 | 2 | 6 | 6,2 s |
| V2 fusion + fenêtre | 12 | 10 | 2 | 6 | 6,4 s |
| V3 passages BM25 | 10 | 8 | 2 | 8 | 5,2 s |
| V4 passages par plongements | 8 | 6 | 2 | 7 | 5,6 s |

## Lecture

- Sur de vraies pages, la version la plus simple suffit : le début de page fait aussi bien que la fenêtre et invente
  moins. Le gain de T315 sur le corpus figé ne se retrouve pas ici. Les sélections plus élaborées font moins bien.
- Les questions web marchent (12/18). Les questions mixtes restent à 2/12 dans tous les bras : les requêtes de J2 n'ont
  pas de journal, et le volet vidéo manque souvent (« la vidéo ne mentionne pas… »). Ce n'est pas la recherche.
- Délai de bout en bout estimé pour une question web : décision 0,65 s + recherche 1,7 s + réponse 6,2 s, soit environ
  8,5 s en médiane.

## Limites

Une seule exécution sur 30 questions : les écarts de 2 à 4 sont dans le bruit, et seul l'ordre général compte. Les
pages sont celles du 22/10 au soir ; le web change. Les textes des pages ne sont pas versionnés (dépôt public) : seuls
les URL, titres et tailles le sont.

## H4b : le titre de la source dans la requête

- Question : le diagnostic des 16 échecs de V0 attribue 6 échecs à une requête qui vise la mauvaise œuvre, faute de
  titre (« Apollo 13 », « Space Chimps », « Avatar »). Le titre de la source change-t-il le résultat ?
- Méthode : pour les 29 questions W/M où F1 a cherché, on rejoue la requête de réponse de F1 telle quelle : journal,
  prompt du produit, extrait de page T315. On remplace seulement les pages par celles que SearXNG ouvre pour la
  requête du modèle écrite avec le titre (H2, bras PT). Il y a eu 30 recherches, une toutes les 8 s
  ([`scripts/cache_web_pt.cjs`](scripts/cache_web_pt.cjs), [`scripts/rejouer_h4b.py`](scripts/rejouer_h4b.py)).
  Rejeu le 22/10, 23:01–23:05 UTC. Notation à l'aveugle dans le même paquet que les réponses de F1
  ([`notation-h4b/`](notation-h4b/), bruts [`bruts-h4b/`](bruts-h4b/)).

| | Avec le titre (H4b) | F1, sans titre |
| --- | ---: | ---: |
| W | **14/18** | 8/18 |
| M | **7/11** | 5/11 |
| Inventions | **2** | 5 |

- Le titre fait gagner 8 questions et n'en fait perdre aucune (p ≈ 0,008) : `artemis-w2`, `cnrs-w2`, `cnrs-w3`,
  `cuisine-m1`, `cuisine-w1`, `spring-m2`, `spring-w2`, `tears-w2`.
- Avec le titre, le local dépasse Codex sur le web (C1 : W 11/18, M 4/12).
- Réserve : ce rejeu montre l'effet d'un ticket « titre de la source », depuis intégré sur `main` (T318, 23/10) mais
  non mesuré en flux réel. Les titres sont ceux des pages YouTube du corpus de test, et le nom du fichier pour Kennedy.

## Diagnostic des 16 échecs du bras V0 (sans GPU)

Un sous-agent a examiné, sur les traces et le texte des pages en cache, chacune des 16 questions W/M (6 W, 10 M) que le
début de page (V0) rate, et leur a attribué une cause principale (scripts : [`diagnostic/`](diagnostic/)). Les deux
notations, H4 et la renotation C1, donnent les mêmes 16 échecs.

| Cause | Échecs | W | M | Réussis par Codex |
| --- | ---: | ---: | ---: | ---: |
| a. fait vidéo absent du contexte (6 passages récents, sans journal) | 5 | 0 | 5 | 0/5 |
| b. recherche ratée : la requête vise la mauvaise œuvre faute de titre | 6 | 3 | 3 | 2/6 |
| c. fait présent dans la page, mais au-delà des 2 500 premiers caractères | 2 | 1 | 1 | 1/2 |
| d. fait donné au modèle, mais mal lu (volet manquant, mauvaise version) | 2 | 1 | 1 | 1/2 |
| e. actualité : ancien plan donné comme actuel malgré la page | 1 | 1 | 0 | 1/1 |

- Cause a : Codex, qui reçoit le même contexte, rate les 5 aussi. Le journal mémoire du produit vise ce cas ; F1, avec
  journal, monte les mixtes à 5/12.
- Cause b : avec le titre de la source (H4b), ces requêtes nomment la bonne œuvre ; c'est l'origine du ticket T318.
- Questions d'actualité (7) : local 4/7, Codex 6/7. Les réponses sont rarement datées « au … », ce qui les plafonne à s2.
- Limites : une exécution, une notation par modèles, et des gains annoncés qui sont des plafonds hors ligne.

