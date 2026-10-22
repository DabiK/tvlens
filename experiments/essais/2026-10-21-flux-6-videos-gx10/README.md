# E5 — Flux réel sur les six vidéos : meilleure configuration et vision Gemma 4

## Question

La meilleure configuration d'E4 (GPS) tient-elle sur les six vidéos ? La vision `gemma4:e4b` sans raisonnement, plus
rapide et plus juste hors ligne (E3b), améliore-t-elle les réponses dans le flux ?

## Configuration

- **GPS** : questions `gemma4:26b-a4b-it-q4_K_M`, pause vision, Whisper `small`, vision `gemma3:4b`.
- **GPSV** : GPS avec la vision `gemma4:e4b-it-q4_K_M`, `TVLENS_LOCAL_VLM_THINK=off`.
- GPSV sur les six vidéos ; GPS sur Bœuf, Tears et Artemis. GPS sur Kennedy, Spring et CNRS vient d'E4, avec le même
  code et le même plan.
- Lanceur `labo.py` et proxy de mesure (sans réécriture), comme E1 et E4. Plan figé : [`plan.json`](plan.json).
  21 octobre, 17:37–20:07 UTC.
- Notation à l'aveugle de 90 réponses dans un même paquet (E1, GPS, GPSV) : [`notation/`](notation/).

## Résultats

9 passages sur 9 complets, sceau complet.

| Configuration | Pertinentes /30 | dont sous 15 s | Réponses sous 15 s | Inventions | Abstentions injustifiées | Délai médian | Blocs vision perdus |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| E1 (actuelle) | 16 | 3 | 7 | 7 | 10 | 17,5 s | 1 à 14 par vidéo |
| **GPS** | **21** | **20** | 28 | 5 | 3 | 7,1 s | 1 à 14 par vidéo |
| GPSV | 20 | 20 | **30** | 5 | 6 | 6,8 s | **0** |

Pertinentes sous 15 s, par vidéo :

| Vidéo | E1 | GPS | GPSV |
| --- | ---: | ---: | ---: |
| Kennedy | 0/5 | 5/5 | 4/5 |
| Spring | 0/5 | 1/5 | 2/5 |
| CNRS | 0/5 | 4/5 | 2/5 |
| Bœuf | 0/5 | 2/5 | 3/5 |
| Tears | 3/5 | 4/5 | 4/5 |
| Artemis | 0/5 | 4/5 | 5/5 |

## Lecture

- Sur les six vidéos, GPS fait passer les réponses pertinentes rendues sous 15 s de **3 à 20 sur 30**, avec moins
  d'inventions et d'abstentions injustifiées.
- GPSV n'améliore pas la pertinence des réponses : 20 contre 21, un écart qui reste dans le bruit d'un seul passage.
  Sa vision tient en revanche toujours la cadence (aucun bloc perdu). Le gain de justesse mesuré sur les descriptions
  (E3b) ne se transmet pas aux réponses, qui butent d'abord sur la mémoire de 48 s (voir G2).
- Spring et Bœuf restent les vidéos faibles.

## Limites et incidents

- Un passage par configuration et par vidéo. GPS sur Kennedy, Spring et CNRS date d'E4, quelques heures plus tôt.
- Oracle et juges sont des modèles (voir le dossier de méthode).
- Les corps de requêtes vision et les préparations restent sur la GX10
  (`/home/nvidia/tvlens-setup/labo-claude/e5-flux-results/`). Empreintes dans [`bruts/`](bruts/).
- Les campagnes (`bruts/**/campagnes/*.json.gz`) et les journaux du proxy (`*.jsonl.gz`) sont compressés avec
  `gzip -n` pour le dépôt : `gunzip -k` rend les fichiers d'origine, et leurs empreintes SHA-256 restent celles des
  fichiers non compressés.
