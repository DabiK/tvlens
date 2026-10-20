# Sources et portée — consultation du 20 octobre 2026

## Preuves locales

- `captures/base-cnrs-apprentissage.json` : rapport complet de référence, SHA dans `captures/manifest.json`.
- `captures/base-kennedy.json` : instantané partiel, pas de synthèse finale.
- `captures/cnrs-input-manifest.json` : métadonnées de préparation, sans octets médias.
- `scripts/local-stream-input.cjs` : scénario et références ; `local-stream-report.cjs` : écriture atomique.
- `scripts/local-stream-host.cjs` : fusion de configuration, priorité au scénario.
- `core/deep-ask.cjs` : délai end-to-end incluant file ; `scripts/local-stream-sampling.cjs` : sondage HTTP.
- `adapters/local-vlm-agent.cjs` : timeout 45 s, timings fournisseur, au plus deux tentatives de langue.
- `adapters/codex-perception.cjs` : sélection de cinq images disponibles ou première/médiane/dernière en mode allégé.
- `adapters/ollama/question-agent.cjs` et `http-client.cjs` : appel non streamé, format JSON, outils, métriques manquantes.
- `runtime/session-providers.cjs` : index de fond ; `core/moment-search.cjs` : recherche hybride et budgets.
- `scripts/perception-replay.md` : ASR figée, nouvel agent par cas, contexte inconnu explicite, aucune mesure de file.

L'inventaire code borné a été effectué par un subagent natif `luna_worker`, puis les points nécessaires aux protocoles ont été relus.
Les décisions expérimentales restent celles du researcher. Les fichiers produit n'ont pas été modifiés.

## vLLM, moteur

[Recette officielle NVIDIA pour DGX Spark](https://build.nvidia.com/spark/vllm/instructions) :
la page actuelle propose l'image `vllm/vllm-openai:qwen38` et le checkpoint `nvidia/Qwen3.8-27B-NVFP4` pour un Spark.
C'est une preuve de recette documentaire sur ce matériel, pas une mesure ASUS GX10 ni un comparatif avec Ollama Q4_K_M.
Le tag est mutable : figer digest, version et architecture avant essai.

La recherche Context7 a résolu `/websites/vllm_ai_en_stable` puis interrogé ARM64/GB10/CUDA13.
[Documentation vLLM Docker](https://docs.vllm.ai/en/stable/deployment/docker/) et
[installation GPU](https://docs.vllm.ai/en/stable/getting_started/installation/gpu/) :
les résultats distinguent les images ARM64/CUDA et les exigences des GPU Blackwell.
La recette générique GB300 remontée par Context7 n'est pas une recette GB10 : elle n'est pas recopiée comme commande GX10.
La sortie conservée est [ctx7-vllm-gb10.txt](sources/ctx7-vllm-gb10.txt).

## Cosmos Reason, modèle

[Dépôt officiel Cosmos-Reason2](https://github.com/nvidia-cosmos/cosmos-reason2/blob/main/README.md) :
inférence documentée sur DGX Spark avec CUDA13 ; la configuration PTXAS compte sur SM121a.
Le dépôt recommande vLLM pour le serving et annonce désormais une maintenance limitée au profit de Cosmos3.
La résolution et la réponse Context7 sont conservées sous `sources/ctx7-cosmos-*.txt`.

[Fiche officielle Cosmos-Reason2-8B](https://huggingface.co/nvidia/Cosmos-Reason2-8B) :
VLM orienté raisonnement physique, fondé sur Qwen3-VL, différent d'un modèle générique de résumé de télévision.
L'exemple de carte utilise vidéo et sorties longues ; cela ne démontre ni une réponse en français pertinente ni moins de 20 s.
L'accès aux poids et le checkpoint exact devront être vérifiés avant tout essai ; aucun téléchargement n'a été fait.

Le support publié DGX Spark rend l'ASUS GX10/GB10 plausible, mais ne prouve pas la combinaison précise Ubuntu/pilote/image/modèle
de la machine utilisateur. Vérifier la pile entière, puis un test isolé borné, avant de parler de compatibilité acquise.

## VSS, architecture et services

[Prérequis officiels VSS latest](https://docs.nvidia.com/vss/latest/prerequisites.html) :
DGX Spark figure parmi les plateformes testées ; son OS indiqué est DGX OS 7.4.0, pilote 580.95.05.
Les tableaux Spark ne listent que des profils avec LLM distant et annoncent le tout local pour une version future.
La GX10 observée utilise Ubuntu24.04.3 ; une proximité de GPU/pilote ne suffit pas à valider toute la stack VSS.

[Introduction VSS](https://docs.nvidia.com/vss/latest/index.html) : blueprint de services de recherche, résumé et analyse vidéo.
VSS ne doit être confondu ni avec les poids Cosmos Reason ni avec vLLM. Étudier ses composants peut informer TVLens,
mais une migration entière changerait simultanément stockage, ingestion, recherche, orchestration et modèles.

## Portée des recherches

Les pages `latest` et branches `main` sont évolutives ; date de consultation conservée, aucune version logicielle installée
déduite de leur contenu. Les bruts GX10 priment pour la configuration réellement exercée.
Le successeur Cosmos3 n'a pas été exploré en profondeur : il ne retarde pas les deux expériences locales les plus informatives.
Phoenix n'a été ni installé ni instrumenté ; la première étape utile est de combler les métriques manquantes du runner.
