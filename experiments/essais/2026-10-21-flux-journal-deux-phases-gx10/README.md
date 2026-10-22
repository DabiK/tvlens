# E7 — Journal mémoire et répondeur en deux phases dans le flux réel

## Question

Hors ligne (G2), un journal compact des passages anciens ajouté au contexte des questions a porté les réponses pertinentes
de 38 à 47 sur 60. Ce gain tient-il dans le flux réel, avec le répondeur en deux phases d'E6 pour que le modèle puisse
relire un passage ancien et le citer ?

## Configuration

- Base : GPSV (questions `gemma4:26b-a4b`, pause vision, Whisper `small`, vision `gemma4:e4b` sans raisonnement).
- Deux prototypes dans le proxy (`--rewrite questions=journal+two-phase`, [`ollama_proxy-e7.py`](ollama_proxy-e7.py)) :
  - **journal** : le proxy garde, pour chaque bloc, la transcription, la description visuelle et le sujet rendus par la
    vision. Il injecte les passages plus anciens que les 6 récents dans chaque requête de question, plafonnés à
    10 000 caractères ;
  - **deux phases** : comme E6, le schéma `format` est retiré au premier tour ; sans appel d'outil, la requête d'origine
    est renvoyée.

  Aucune ligne de TVLens n'est modifiée.
- Six vidéos, 21 octobre, 21:38–23:09 UTC. Plan figé : [`plan.json`](plan.json). Journaux du proxy, avec la décision et
  le nombre de passages injectés à chaque requête : [`bruts/`](bruts/).
- Notation à l'aveugle contre GPSV (E5) dans un même paquet : [`notation/`](notation/).

## Résultats

6 passages sur 6 complets. Sceau : 2 771 fichiers rapatriés, aucun divergent.

| | Pertinentes /30 | dont sous 15 s | Inventions | Abstentions injustifiées | Note moyenne | Délai médian |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| GPSV (E5, renotée) | 19 | 19 | 5 | 6 | 2,02 | 6,8 s |
| GPSV + journal + deux phases (E7) | 17 | 17 | 6 | 7 | 1,80 | 11,8 s |

- **Contexte** : le journal porte la requête de question de 2 507 jetons (médiane des 30 appels de GPSV en E5) à
  4 323 (médiane des 36 appels d'E7, tours à outils compris) ; jusqu'à 73 passages
  anciens injectés (Artemis).
- **Délais** : médiane 9,6 à 14,1 s sur Bœuf, Artemis, CNRS et Kennedy, contre 5 à 9 s en GPSV. Spring (médiane 146 s,
  max 283 s) et Tears (médiane 41 s, max 262 s) explosent dès que le modèle appelle ses outils (`inspect_clip` 5 fois,
  `search_moments` 1, `get_transcript` 1). Sur les quatre autres vidéos, aucun outil n'est appelé et la requête
  d'origine est toujours renvoyée.
- **Erreurs** : 3 questions sans réponse. `tears-03` : Ollama interrompt une boucle de répétition (« token repeat limit
  reached », HTTP 500). `spring-03` et `tears-04` : réponse invalide.
- Pertinentes par vidéo (E7 contre GPSV) : Kennedy 3 contre 4, Spring 2 contre 2, CNRS 3 contre 1, Bœuf 4 contre 3,
  Tears 1 contre 4, Artemis 4 contre 5.
- Questions gagnées par E7 : `cnrs-05`, `cnrs-06`, `cuisine-05`, `spring-01`. Perdues : `artemis-07`, `kennedy-01`,
  `spring-03`, `tears-01`, `tears-04`, `tears-06`.

## Lecture

Négatif dans cette combinaison, mais le journal fait ce qu'on attend de lui :
- trois des quatre questions gagnées (`cnrs-05`, `cnrs-06`, `cuisine-05`) demandent un fait sorti de la fenêtre de
  48 s, comme en G2. Sur les 6 questions de ce type, E7 en réussit 5 contre 2 pour GPSV ;
- les six questions perdues portent sur des faits encore dans la fenêtre (fenêtre réelle du contexte). Sur les
  24 questions de ce type, E7 en réussit 12 contre 17. Les pertes tombent surtout sur Tears et sur les erreurs du chemin
  à outils, déjà négatif en E6.

Le journal coûte aussi 3 à 5 s par question, parce que le contexte double. N3 (GPS + journal seul, sans deux phases)
isole l'effet du journal.

## Limites et incidents

- Un seul passage. GPSV, renotée dans ce paquet par de nouveaux juges, obtient 19/30 (20/30 dans les paquets E5 et
  E6) : la notation varie d'environ une réponse d'un paquet à l'autre.
- Un seul arbitrage par un troisième juge (Spring, une réponse) ; 59 textes distincts pour 60 réponses.
- 3 réponses d'E7 en anglais contre 1 pour GPSV ; la grille plafonne à 2/3 une réponse en français à une question en
  anglais, ce qui avantage légèrement les réponses en anglais.
- Les corps de requêtes et les préparations restent sur la GX10 (`/home/nvidia/tvlens-setup/labo-claude/e7-flux-results/`).
  Empreintes dans [`bruts/empreintes-hors-git.txt`](bruts/empreintes-hors-git.txt).
- Les campagnes (`bruts/**/campagnes/*.json.gz`) et les journaux du proxy (`*.jsonl.gz`) sont compressés avec
  `gzip -n` pour le dépôt : `gunzip -k` rend les fichiers d'origine, et leurs empreintes SHA-256 restent celles des
  fichiers non compressés.
