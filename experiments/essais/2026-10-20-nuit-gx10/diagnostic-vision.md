# Diagnostic provisoire — coût de la vision continue

Recherche en lecture seule du 20 octobre 2026. Ce document distingue mesures, mécanismes du code et hypothèses ; il ne modifie pas le protocole nocturne.

## Mesures

Sur le replay Kennedy `large-v3-turbo`, 35 appels visuels terminés dans 38 blocs nominaux de huit secondes, 143 images transmises : 19 appels à cinq images et 16 à trois. Durée de requête visuelle : médiane 7,272 s, moyenne 8,280 s, maximum 17,005 s. Un bloc a été ignoré pour retard. La médiane occupe 91 % du créneau de huit secondes ; la moyenne le dépasse. Ce ratio temporel n'est pas une mesure d'utilisation GPU et ne donne pas la part exacte de l'encodage image, du prompt et de la génération.

Sources : `large-v3-turbo-kennedy/run/campaign.json` sur le GX10, relevé ponctuel dans `preuves/ressources-2026-10-20T211547Z.md`.

## Mécanismes observés

- La voie vision est [séquentielle, avec file bornée à deux](/Users/Dabi/Documents/ISN/tvlens/core/memory/lanes.cjs). En cas de retard, les plus anciens éléments peuvent être perdus.
- Le passage de cinq à trois images est déjà [déclenché par l'attente d'un bloc suivant](/Users/Dabi/Documents/ISN/tvlens/core/memory/lanes.cjs). Les appels historiques à trois images sont donc sélectionnés par le retard : leurs temps ne constituent pas un groupe témoin.
- Chaque appel [retransmet des images, des consignes et du contexte](/Users/Dabi/Documents/ISN/tvlens/adapters/local-vlm-agent.cjs). Le [prompt](/Users/Dabi/Documents/ISN/tvlens/adapters/codex-perception.cjs) demande description, incertitudes, titre, continuité et résumé cumulatif, pas seulement la lecture de quelques images.

Ces choix de pipeline ajoutent du travail par bloc. Les mesures actuelles ne permettent pas d'attribuer une part chiffrée à Gemma3 4B, à Ollama ou à l'architecture TVLens.

## Essais et décisions

1. Terminer l'ablation déjà lancée cinq contre trois images, avec mêmes blocs et mesures de pertinence, d'OCR, d'erreurs et de temps fournisseur. Sur le mélange Kennedy observé, trois images partout auraient représenté 105 au lieu de 143 images (−26,6 %) ; ce n'est pas une prédiction de gain temporel.
2. Terminer l'ablation déjà prévue de suspension des nouveaux départs vision pendant les questions ; mesurer délai de réponse, pertes de blocs et âge des preuves.
3. Pour la suite, comparer à images constantes une sortie visuelle plus compacte, puis une synthèse cumulative moins fréquente ; mesurer tokens générés, durée et qualité aval.
4. Pour attribuer un éventuel gain à vLLM, prévoir séparément **Gemma3 vision contre Gemma3 vision** avec images, prompt, quantification et matériel comparables. [vLLM documente la vision multimodale](https://docs.vllm.ai/en/stable/examples/generate/multimodal/) et des [optimisations d'inférence](https://docs.vllm.ai/en/stable/configuration/optimization/), sans garantir un gain sur ce flux séquentiel ou ce GX10.
5. Un protocole ultérieur peut tester une ingestion sélective aux changements de plan ou événements, avec garde-fous de couverture, puis comparer vitesse et pertinence au flux périodique.

La sonde vLLM du protocole nocturne principal concerne **les réponses textuelles Qwen sur contexte figé**, sans images ni file TVLens. Un [essai visuel séparé](../2026-10-20-vision-vllm-gx10/README.md) est préparé pour comparer les mêmes blocs d'images sur Ollama et vLLM après la clôture du protocole principal. Il ne mesurera pas non plus le parcours applicatif complet.
