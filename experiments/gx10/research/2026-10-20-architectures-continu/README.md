# Pistes d'architecture pour la vision continue — 21 octobre 2026

Recherche documentaire préparatoire, **sans essai réel ni promesse de gain**. Décision à prendre après lecture des campagnes nocturnes. Critères communs : faits correctement couverts, inventions et abstentions, pertinence des réponses sous 20 s, âge des preuves, événements courts manqués, retard et blocs perdus, appels/images/tokens par minute, charge CPU/GPU et mémoire. Les références humaines doivent être validées avant toute notation de pertinence.

Le point de départ mesuré sur Kennedy : blocs de 8 s, 35 appels visuels terminés sur 38, médiane 7,272 s, moyenne 8,280 s, maximum 17,005 s, un bloc perdu pour retard. Voir [diagnostic nocturne](../../../essais/2026-10-20-nuit-gx10/diagnostic-vision.md). Ces durées ne décomposent pas encodage image, préremplissage, génération et attente fournisseur.

## Essais courts prioritaires demain

| Piste | Hypothèse et essai discriminant | Coût de préparation estimé | Risque à contrôler |
| --- | --- | --- | --- |
| Déclenchement par nouveauté visuelle | [PySceneDetect](https://github.com/Breakthrough/PySceneDetect) peut réduire les descriptions redondantes. Comparer cadence fixe et déclenchement sur coupe/changement, avec observation périodique maximale conservée. Mesurer appels/min, temps du détecteur, retard, événements manqués et pertinence. | 2–4 h | Une action sémantique peut se produire sans coupe ; AdaptiveDetector ajoute sa propre fenêtre et son retard. |
| ASR/OCR comme indices légers | Exploiter l'[ASR whisper.cpp](https://github.com/ggml-org/whisper.cpp) déjà présent et [Tesseract](https://github.com/tesseract-ocr/tesseract) sur images sélectionnées. D'abord observer les décisions d'un filtre sans supprimer d'appel VLM ; ensuite comparer ASR seule, ASR+OCR et VLM. | ½ journée | Les événements muets et sans texte doivent rester couverts ; varier les vidéos parlées et d'action. |
| Hiérarchie rapide/lente | Tester [Qwen3-VL 2B puis 4B](https://ollama.com/library/qwen3-vl/tags) uniquement pour nouveauté, ambiguïté ou question. Séparer cet essai de la synthèse cumulative différée. Mesurer appels des deux modèles, escalades manquées, qualité et délai total. | ½–1 journée | Deux modèles résidents ou deux appels peuvent coûter plus cher qu'un seul ; la confiance auto-déclarée n'est pas un oracle. |

Commencer par lire l'ablation nocturne cinq contre trois images et la suspension de vision pendant les questions. Réutiliser un modèle et un corpus de référence fixés pour chaque comparaison, sans changer plusieurs axes dans le même bras.

## Pistes à pré-vol borné ou programme plus long

| Piste | Question utile | Niveau de preuve et prochaine étape |
| --- | --- | --- |
| Fenêtres vidéo temporelles | [Qwen3-VL](https://huggingface.co/Qwen/Qwen3-VL-4B-Instruct) ou [Cosmos Reason2](https://docs.nvidia.com/cosmos/latest/prerequisites.html) conservent-ils mieux l'ordre des actions que des images isolées ? | Même trames, résolution et horodatages d'abord ; mesurer chronologie, coût d'encodage et qualité. Pré-vol Cosmos séparé. |
| Cache visuel continu | [StreamingVLM](https://arxiv.org/abs/2510.09608v2) réutilise un cache KV avec 512 tokens de début, 512 tokens récents et 16 s de vision ; peut-il stabiliser la latence sur 5–60 min ? | Papier et sections méthode/efficacité lus via MCP arXiv. Les 8 images/s publiées concernent H100, **pas** GB10. Son mécanisme exige modèle et code dédiés ; activer un cache générique vLLM ne le reproduit pas. |
| Mémoire hiérarchique d'événements | [StreamForest](https://arxiv.org/abs/2509.24871v1) aide-t-il le rappel ancien à budget constant ? | Auditer code/poids, puis mesurer rappel par ancienneté et pertes de détails à la fusion avant intégration à l'index. |
| Encodage réutilisable à la question | [ReKV](https://arxiv.org/abs/2503.00540v1) peut-il éviter de réencoder les mêmes passages ? | D'abord mesurer le taux de réutilisation exacte ; les caches KV dépendent du modèle, du prétraitement et du contenu. Portage plus long. |
| Moteur NVIDIA spécialisé | [TensorRT-LLM sur Spark](https://build.nvidia.com/spark/trt-llm/instructions) améliore-t-il la même vision Qwen3-VL BF16 ? | Pré-vol limité à 2 h sur couple version/modèle/GX10 exact, puis même corpus visuel que vLLM/Ollama. La recette générale ne prouve pas la compatibilité. |

## Accès aux articles

Le sous-agent a testé le MCP arXiv : recherche et résumés, téléchargement du texte HTML de *StreamingVLM* v2 (41 815 caractères), plan et lecture de sections ciblées fonctionnent. Les réponses longues sont paginées ; seules les sections pertinentes ont été lues, pas chaque article en entier. Les papiers restent des hypothèses de recherche tant qu'aucun essai GX10 ne les valide.
