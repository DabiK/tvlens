# J4 — `topicSummary` calculé hors du chemin critique (prototype par le proxy)

## Question

Retirer `topicSummary` de la sortie de vision accélère tout (N2), mais le produit en a besoin : c'est le résumé cumulatif
des cartes de la frise TV. Peut-on le calculer à part, quand le GPU est libre, sans ralentir les questions ni perdre de
blocs de vision ? Critères fixés avec Codex Astra : surcoût médian des questions ≤ 1 s face à J2, 0 bloc perdu,
≥ 18/20 résumés fidèles.

## Configuration

- J2 (N2 sur les 60 questions de l'oracle v3), avec `--rewrite vlm=async-topic-summary`
  ([`ollama_proxy-j4.py`](ollama_proxy-j4.py)). La vision part sans `topicSummary`. Pour chaque bloc qui continue le
  sujet, un appel texte au modèle de vision replie l'observation dans le résumé du sujet, dès que ni question, ni
  inspection, ni vision n'est en cours. Un changement de sujet repart du résumé du bloc, comme dans TVLens. Les résumés
  sont journalisés (rôle `async-summary`), jamais renvoyés à TVLens.
- 22 octobre, 13:52–15:23 UTC, sceau complet. Plans : [`plans/`](plans/) ; bruts compressés : [`bruts/`](bruts/).

## Résultats

| Vidéo | Délai médian J4 (J2) | Sous 15 s | Blocs vision perdus (J2 : 0) | Replis | Frontières de sujet |
| --- | ---: | ---: | ---: | ---: | ---: |
| Kennedy | 6,2 s (5,2) | 10/10 | 14 | 31 | 7 |
| Spring | 5,7 s (4,1) | 10/10 | 4 | 19 | 35 |
| CNRS | 7,1 s (5,2) | 10/10 | 14 | 44 | 52 |
| Bœuf | 7,3 s (4,5) | 10/10 | 20 | 57 | 15 |
| Tears | 5,2 s (4,1) | 10/10 | 5 | 39 | 46 |
| Artemis | 6,1 s (5,4) | 10/10 | 49 | 150 | 63 |
| **Ensemble** | **6,3 s (5,0)** | **60/60** | **106** | 340 | 218 |

Replis : 1 bloc chacun (jamais regroupés), 4,9 s médians, tous valides (≤ 1 600 caractères, 522 en médiane). Attente
d'un GPU libre : 0 ms en médiane ; retard sur le bloc : 0 s en médiane, 19 s au plus.

## Lecture

Négatif : **106 blocs de vision perdus** et +1,3 s par question. Le gestionnaire trouvait toujours le GPU libre juste
après une vision, donc il repliait chaque bloc aussitôt. Son appel de 4,9 s passait alors devant l'appel de vision
suivant, dans la file d'Ollama (un seul calcul à la fois), et la vision prenait du retard jusqu'à perdre des blocs.
Correctif appliqué pour J5 ([`ollama_proxy-j5.py`](ollama_proxy-j5.py)) : replier tous les 4 blocs ou au changement de
sujet. La fidélité des résumés sera jugée sur J5 ; J4 n'est pas noté, puisqu'il échoue déjà sur la perte de blocs.

## Limites et incidents

- Le proxy ne peut pas renvoyer les résumés à TVLens après coup : l'essai mesure la charge, pas l'effet sur les cartes.
- Le Mac s'est mis en veille pendant le rapatriement ; il a été refait à la reprise, sceau vérifié.
- Les campagnes et les journaux du proxy sont compressés avec `gzip -n` ; leurs empreintes renvoient aux fichiers non
  compressés sur la GX10.

## J5b : repli tous les 4 blocs, sur la base de J6

- Configuration : J6 (journal mémoire du produit, `83cddd5`), avec en plus le `topicSummary` calculé hors du chemin
  critique par le proxy ([`ollama_proxy-j5.py`](ollama_proxy-j5.py)), replié tous les 4 blocs ou au changement de
  sujet. C'est la seule différence avec J6 (revue de Codex Astra, 16:47).
- 22 octobre, 18:30–20:01 UTC (deux départs interrompus avant : J5 à 16:41, J5b à 18:13). Sceau complet, 13 fichiers
  vérifiés. Bruts : [`bruts-j5b/`](bruts-j5b/), plan : [`plans/`](plans/).
- Critères fixés avant le départ : 0 bloc perdu, surcoût médian ≤ 1 s face à J6, ≥ 18/20 résumés fidèles,
  pertinence ≥ J6 − 3.

| | Délai médian | Sous 15 s | Blocs vision perdus | Rejets de citations |
| --- | ---: | ---: | ---: | ---: |
| J6 | 6,2 s | 60/60 | 0 | 0 |
| **J5b** | **8,1 s** | 60/60 | **14** (CNRS 13, Kennedy 1) | 0 |

**Négatif** : +1,9 s par question et 14 blocs perdus, deux critères manqués. La pertinence et la fidélité des résumés
ne sont pas notées : le verdict est acquis, et Dabi a fait de la recherche web la seule priorité à 20:15 UTC. Replier
moins souvent ne suffit pas : les résumés gardent la priorité sur la vision dans la file d'Ollama. Pour le produit,
`topicSummary` reste dans la vision, ou passe à un modèle bien plus petit (non mesuré).

