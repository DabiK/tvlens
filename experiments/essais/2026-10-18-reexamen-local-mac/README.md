# Essai du 18/10/2026 — réexamen de clips par un modèle vision local

Contrôle réel T271, après T265. Trois questions sur une session réelle, une exécution chacune, sans annotation
humaine : la qualité est jugée en comparant aux lectures de Codex et de `qwen3.8:27b` sur les mêmes images.

## Question

Quand le réexamen d'un clip est confié à Ollama (`TVLENS_INSPECTION_BACKEND=local`), la réponse s'appuie-t-elle bien sur
le modèle local, avec son identité et ses mesures dans les diagnostics ? Sans modèle, le refus est-il nommé, sans repli
sur Codex ?

## Configuration exacte

| Élément | Valeur |
| --- | --- |
| Code | `258d910` (T265), serveur headless, questions sur Codex (défaut), réexamen sur Ollama |
| Machine | MacBook Apple M5 Max, 36 Go unifiés, boucle arrêtée |
| Runtime et modèle | Ollama 0.33.2, `gemma3:12b` (Q4_K_M), `keep_alive` 2 min ; puis `modele-absent:1b` |
| Entrées | session `ec55a89c` du 17/10 (live YouTube en français, 19 passages), copies temporaires |
| Script | `questions-session.mjs` (serveur lancé sur une copie, questions par l'API HTTP) |
| Données brutes | `resultats-reexamen.json`, `resultats-modele-absent.json` |

## Résultats

| Question | Réexamens | Durée | Diagnostic d'inspection | Réponse |
| --- | --- | --- | --- | --- |
| « Qu'est-ce qui est écrit à l'écran au début du live ? » | 1 | 29 s | `ollama`, `gemma3:12b`, appelé, chargement 4,4 s, appel 18,5 s | « RD SECQURS », lecture signalée incertaine, 1 citation |
| « Décris ce qu'on voit dans les vingt dernières secondes » | 2 | 53 s | chargement 17 ms à chaud, appels 16,9 et 18,4 s | homme devant un ordinateur, « elan.media__ — ABONNÉ », 4 citations ; contradiction avec les résumés signalée |
| Même première question, modèle absent | 1 (échec) | 11 s | `ollama`, échec `TVLENS_LOCAL_VLM_UNAVAILABLE`, aucun repli | `insufficient`, limite « backend indisponible (HTTP 404) » |

Chaque preuve retenue garde la provenance de son réexamen (rôle, backend, modèle, hôte).

## Lecture

- **Le branchement est sûr** : le modèle local est bien celui qui réexamine, ses mesures séparent attente, appel et
  chargement, et son absence produit un refus nommé au lieu d'un repli silencieux sur Codex.
- **La qualité visuelle du 12B est en retrait** : il lit « RD SECQURS » là où Codex et le 27B lisaient « SECOURS », et
  décrit un homme seul devant un ordinateur là où les résumés d'origine voyaient deux personnes dans un salon. La
  réponse finale signale elle-même cette contradiction : le désaccord reste visible pour le spectateur.
- **Le coût** : environ 17 à 19 s par réexamen sur le Mac, contre quelques secondes pour Codex.

## Limites et incidents

- Trois questions, une exécution, aucune annotation : la qualité relevée est une impression, à mesurer en G2.
- Les questions passaient par Codex : la qualité de rédaction de la réponse n'est pas celle d'un modèle local.
- Les vues légères envoyées à la TV reprennent ce diagnostic, avec l'hôte du modèle (réserve de relecture de T265).
