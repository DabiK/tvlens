# Essai du 18/10/2026 — recherche d'une vraie session par des embeddings Ollama

Contrôle réel T276, après T264 ; à refaire après T278. Quatre recherches par la sonde, une question par le serveur et une
reproduction ciblée, une exécution chacune, sans annotation humaine : la pertinence est jugée en lisant les résumés.

## Question

La recherche de production fonctionne-t-elle avec des embeddings calculés en local par Ollama, sur une vraie session ?
L'index est-il lié à l'identité du modèle, sans jamais mélanger les vecteurs de deux modèles ?

## Configuration exacte

| Élément | Valeur |
| --- | --- |
| Code | `258d910` (T265 intégré), chemin `OllamaEmbeddings` → `providerIdentity` → `EmbeddingStore` → `MemorySearch` |
| Machine | MacBook Apple M5 Max, 36 Go unifiés, boucle arrêtée |
| Runtime et modèle | Ollama 0.33.2, `qwen3-embedding:0.6b` (596 M, Q8_0, vecteurs de 1 024 dimensions), téléchargé le 18/10 |
| Entrées | session `ec55a89c` du 17/10 (live YouTube en français), 19 passages, résumés produits par Codex ; lecture seule |
| Caches | dossier temporaire de la sonde, jamais celui de la session |
| Sonde | `sonde-recherche.cjs` ; données brutes dans `resultats.json` |
| Serveur | headless sur une copie, `TVLENS_EMBEDDINGS_BACKEND=local`, questions sur Codex, `gemma3:12b` encore résident ; `resultats-serveur.json` |
| Reproduction | `repro-froid.cjs` : un lot de 19 passages, modèle froid seul, chaud, puis froid avec `gemma3:12b` résident ; `repro-froid.json` |

## Résultats

| Recherche | Mode | Durée | Trois premiers | Premier résultat |
| --- | --- | --- | --- | --- |
| « un sondage sur l'élection présidentielle » | hybride | 2,3 s (index compris) | 7, 4, 8 | surprises possibles d'une campagne présidentielle |
| « une escroquerie à la location de logements » | hybride | 23 ms | 10, 12, 11 | vidéo sur un logement abîmé, textes sur une arnaque |
| « une personne interviewée dont le visage est caché » | hybride | 20 ms | 16, 19, 18 | entretien de deux personnes dans un salon |
| « il y a une minute » | temporel | 0 ms | 12 | aucun appel au modèle |

Le premier appel construit l'index des 19 passages (22 lignes dans le cache : en-tête, passages et requêtes). Une
seconde instance du même modèle reçoit une autre identité, ouvre un autre fichier de cache, signale le cache existant
comme « modèle différent » et reconstruit le sien ; elle rend le même premier résultat.

Par le serveur, la question « Retrouve le moment où il est question d'une arnaque au logement » cite le bon passage
(moment 10) en 14 s. Mais le journal d'Ollama montre deux appels d'embeddings arrêtés à 8,1 s : aucun index n'a été
construit, la recherche a classé par texte, et rien n'est apparu dans le journal du serveur.

Reproduction du premier appel d'embeddings (19 passages, 8 953 octets, un lot) :

| Condition | Durée | Chargement du modèle | Au-delà des 8 s de l'adaptateur |
| --- | --- | --- | --- |
| Modèle froid, seul | 1,1 s | 0,8 s | non |
| Modèle chaud | 0,3 s | 1 ms | non |
| Modèle froid, `gemma3:12b` résident | 13,2 s | 12,7 s | oui |

## Lecture

- **La recherche locale marche sur du vrai contenu français**, avec un petit modèle : les paraphrases retrouvent les
  bons passages sans partager leurs mots.
- **Les vecteurs restent liés à leur modèle** : deux identités, deux caches, aucune réutilisation croisée.
- Le coût réel est l'indexation (2,3 s pour 19 passages) ; une recherche ensuite prend une vingtaine de millisecondes.
- **Écart trouvé :** quand un autre modèle local est déjà chargé, le chargement du modèle d'embeddings dépasse le délai
  de 8 s de l'adaptateur ; l'appel coupé abandonne aussi le chargement, et l'index peut ne jamais se construire. C'est
  le cas d'une session tout en local, celle du GX10. Correctif : T278, avant le tag de la copie A.

## Limites et incidents

- Quatre requêtes écrites pour la sonde, sans vérité terrain annotée : aucun rappel ni précision mesurés.
- La sonde passe par `MemorySearch` ; le chemin d'une question par le serveur est exercé à part, avec l'écart ci-dessus.
- Chaque nouvelle instance réécrit un cache complet : c'est voulu (ADR 0058), le nettoyage reste au cycle des archives.
