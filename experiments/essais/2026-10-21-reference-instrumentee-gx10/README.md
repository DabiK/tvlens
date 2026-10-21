# E1 — Référence instrumentée sur les six vidéos

## Question

Où passe le temps d'une question et d'un bloc de vision dans la configuration produit (chargement,
préremplissage, génération) ? E1 capture aussi les requêtes exactes, pour les rejouer ensuite à l'identique sur
d'autres modèles (E2, E3, G1–G4).

## Configuration

- GX10, code `2035a2f`, `scripts/replay-local-stream.cjs` (SHA `532329d2…`), `config-base.env` (SHA `1c007271…`).
- Configuration produit inchangée : Whisper `base`, vision `gemma3:4b`, questions `qwen3.8:27b` (sans
  raisonnement), embeddings `qwen3-embedding:0.6b`, vision active pendant les questions.
- Seule différence : un **proxy de mesure** ([`ollama_proxy.py`](ollama_proxy.py)) entre TVLens et Ollama, un port
  par rôle. Il relaie sans rien modifier et journalise compteurs et requêtes (corps complets pour la vision).
  Surcoût mesuré : ~1 ms par requête (20 paires direct/proxy, [`bruts/proxy-overhead.json`](bruts/proxy-overhead.json)).
- Lanceur [`labo.py`](labo.py) : trois verrous coopératifs, contrôles du code, de l'exécuteur, des entrées et du
  GPU ; supervision et sceau par le `night_common.py` figé de la nuit. Plan figé : [`plan.json`](plan.json).
- 21 octobre, 10:56–12:27 UTC, d'abord Kennedy, puis Spring, CNRS, Bœuf, Tears et Artemis.

## Résultats

6 passages sur 6, **30/30 réponses acquises**, sceau complet (8 750 fichiers). Analyse :
[`analyser_e1.py`](analyser_e1.py) → [`analyse-e1.json`](analyse-e1.json).

| Vidéo | Délai HTTP médian | Génération (médiane) | Préremplissage | Rejets par la validation | Outils | Vision > 8 s | `topicSummary` dans la sortie vision | Blocs perdus |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Kennedy | 19,2 s | 12,5 s à 14 jet/s | 5,3 s | 3/5 | 0 | 11/52 | 34 % | 1 |
| Spring | 15,2 s | 11,5 s à 11 jet/s | 3,7 s | 0/5 | 0 | 7/44 | 38 % | 14 |
| CNRS | 24,2 s | 18,3 s à 13 jet/s | 4,7 s | 0/5 | 0 | 29/96 | 32 % | 14 |
| Bœuf | 17,6 s | 13,1 s à 12 jet/s | 3,5 s | 0/5 | 0 | 9/91 | 42 % | 1 |
| Tears | 13,2 s | 9,9 s à 10 jet/s | 2,8 s | 0/5 | 0 | 17/78 | 44 % | 13 |
| Artemis | 21,3 s | 13,0 s à 13 jet/s | 5,7 s | 0/5 | 0 | 56/251 | 36 % | 12 |

La première question paie en plus **13,4 s de chargement** du modèle de questions (Kennedy).

## Lecture

- La **génération** domine le délai d'une question (10–18 s). En flux, avec la vision en parallèle, le débit
  tombe à 10–14 jetons/s ; la sonde du modèle seul donnait 27–32 jetons/s.
- **Aucun appel d'outil** : le modèle répond toujours depuis les 6 derniers passages.
- Le **rejet par validation** (citations laissées dans le texte, champ `citations` vide) frappe 3 réponses
  Kennedy sur 5. Ces réponses étaient justes : la pertinence est perdue par le format.
- **`topicSummary`**, qui ne sert pas aux questions, représente un tiers de ce qu'écrit la vision.

## Limites et incidents

- Un seul passage par vidéo : c'est une mesure, pas une comparaison.
- Des téléchargements de modèles candidats tournaient pendant E1 (réseau et disque du même service Ollama) ;
  leur effet sur les délais n'est pas mesuré.
- Les corps de requêtes vision (images), les préparations et la télémétrie restent sur la GX10
  (`/home/nvidia/tvlens-setup/labo-claude/e1-reference-instrumentee-results/`). Une copie partielle, conforme au
  sceau, est hors Git dans `/Users/Dabi/Documents/TVLens-GX10/essais/e1-reference-instrumentee-20261021/`.
  Empreintes des journaux : [`bruts/empreintes-hors-git.txt`](bruts/empreintes-hors-git.txt).
- La pertinence des 30 réponses sera notée avec celles d'E2, avec les mêmes juges et le même oracle.
