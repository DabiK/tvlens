# E6 — Prototype de répondeur en deux phases dans le flux réel

## Question

G1 a montré que le schéma JSON imposé empêche le modèle de questions d'appeler ses outils. Si l'on retire ce schéma au
premier tour seulement, les outils de recherche améliorent-ils les réponses dans le flux, pour un délai acceptable ?

## Configuration

- Base : GPSV (questions `gemma4:26b-a4b`, pause vision, Whisper `small`, vision `gemma4:e4b` sans raisonnement).
- Prototype dans le proxy (`--rewrite questions=two-phase`, [`ollama_proxy-e6.py`](ollama_proxy-e6.py)) :
  - au premier tour d'une question, le schéma `format` est retiré ;
  - si le modèle appelle un outil, TVLens l'exécute et le tour suivant garde le schéma ;
  - sinon, la requête d'origine est renvoyée.

  Aucune ligne de TVLens n'est modifiée.
- Six vidéos, 21 octobre, 20:07–21:38 UTC. Plan figé : [`plan.json`](plan.json). Journaux du proxy, avec la décision
  prise à chaque requête : [`bruts/`](bruts/).
- Notation à l'aveugle contre GPSV (E5) dans un même paquet : [`notation/`](notation/).

## Résultats

| | Pertinentes /30 | dont sous 15 s | Inventions | Abstentions injustifiées | Délai médian |
| --- | ---: | ---: | ---: | ---: | ---: |
| GPSV (E5) | 20 | 20 | 5 | 6 | 6,8 s |
| GPSV + deux phases (E6) | 18 | 17 | 6 | 6 | 9,3 s |

- Gemma 4 n'appelle presque pas ses outils une fois libéré du schéma : 8 appels sur 30 questions (`get_transcript` 4,
  `search_moments` 3, `inspect_clip` 1). Sur la plupart des questions, le proxy renvoie donc la requête d'origine,
  ce qui coûte un appel de plus.
- Spring : délai médian 156 s (max 273 s), à cause des recherches et du réexamen d'images. 0/5 réponse pertinente
  sous 15 s ; `spring-01` finit en erreur (`TVLENS_OLLAMA_ANSWER_INVALID`).
- Pertinentes sous 15 s par vidéo (E6 contre GPSV) : Kennedy 3 contre 4, Spring 0 contre 2, CNRS 2 contre 2,
  Bœuf 3 contre 3, Tears 4 contre 4, Artemis 5 contre 5.

## Lecture

Négatif avec Gemma 4 : le répondeur en deux phases coûte du temps sans améliorer les réponses, et dégrade fortement
Spring. Le blocage des outils par le schéma reste établi (G1, avec `qwen3.8:27b`, qui appelle ses outils 20 fois sur 20).
Mais le modèle retenu ne s'en sert pas spontanément. La mémoire passera plutôt par l'injection du journal (G2, N3).

## Limites et incidents

- Un seul passage. Les réponses GPSV, renotées dans ce paquet par de nouveaux juges, obtiennent le même score qu'en E5
  (20/30) : la notation est stable d'un paquet à l'autre.
- Les corps de requêtes et les préparations restent sur la GX10 (`/home/nvidia/tvlens-setup/labo-claude/e6-flux-results/`).
- Les campagnes (`bruts/**/campagnes/*.json.gz`) et les journaux du proxy (`*.jsonl.gz`) sont compressés avec
  `gzip -n` pour le dépôt : `gunzip -k` rend les fichiers d'origine, et leurs empreintes SHA-256 restent celles des
  fichiers non compressés.
