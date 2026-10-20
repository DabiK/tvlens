# Vision locale Ollama et vLLM — essai supplémentaire du 20 au 21 octobre 2026

## Question et statut

Le coût de la vision TVLens sur le GX10 provient-il surtout du modèle et de la requête, ou une autre pile de service peut-elle traiter les mêmes blocs plus vite sans dégrader les observations ? Le lanceur a été **déployé à 21:43 UTC le 20 octobre et attend la fin scellée de la campagne principale**. Aucun modèle visuel supplémentaire n'a encore été téléchargé ni appelé au moment de cette observation. L'essai reste subordonné à un pré-vol multimodal réel et à la limite du 21 octobre 2026 à 05:00 UTC. Aucun résultat ne doit être déduit de ce seul démarrage.

La référence Kennedy du 20 octobre observait 35 appels visuels sur 38 blocs de huit secondes, médiane 7,272 s, moyenne 8,280 s et une perte pour retard. Voir [le diagnostic](../2026-10-20-nuit-gx10/diagnostic-vision.md). La campagne existante continue sans changement de code, de modèle ni d'ordonnancement.

## Bras et entrées

- Modèle commun : **Qwen3-VL-4B-Instruct BF16**, instructions explicites pour éviter l'alias Ollama `qwen3-vl:4b` qui désigne une variante Thinking.
- Ollama : `qwen3-vl:4b-instruct-bf16`, digest de manifeste attendu `sha256:1d2c81ea69a06341d1aaa9e4fbd655402681057c291754008f44fa6e74acc298`, environ 8,9 Go de couches ; vérifier le digest effectivement acquis.
- vLLM : `Qwen/Qwen3-VL-4B-Instruct` à la révision `ebb281ec70b05090aa6165b016eac8ec08e71b17`, poids BF16 publics ; même image ARM64 vLLM `v0.28.0` épinglée dans la campagne nocturne. Le checkpoint officiel n'exige pas de code distant.
- Corpus : douze blocs visuels déjà figés, images identiques et ordre conservé, consignes vision produites par le code TVLens. Deux passages par moteur, sorties brutes conservées. Le premier passage et la répétition sont analysés séparément à cause des caches.
- Réglages figés : contexte maximal 16 384, génération maximale 1 024 tokens, température zéro, une séquence vLLM, entrée de cinq images maximum, port local distinct. Tout écart effectif entre les moteurs est consigné.

Le lanceur doit calculer les empreintes des entrées, prompts, code, modèles, image et réponses ; conserver durées complètes, métriques fournisseur, erreurs, sorties tronquées et éventuelles pertes de cadence simulée à huit secondes. Une cadence simulée n'est **pas** une mesure des files du replay TVLens. Le premier token reste inconnu sans streaming instrumenté.

## Interprétation et contraintes

Le même nom de modèle et la même précision réduisent le biais, mais GGUF/Ollama et safetensors/vLLM peuvent différer par conversion, processeur d'images, template et kernels. Il s'agit d'une comparaison de piles de vision, pas de l'effet causal du seul moteur. Une meilleure latence n'est intéressante que si faits, OCR, chronologie et incertitude restent utiles aux réponses aval ; la pertinence reste à annoter humainement.

La sonde ne remplace pas l'adaptateur applicatif Ollama et ne prouve pas la vitesse du flux TVLens de bout en bout. Aucun essai ne doit se chevaucher avec le lot de référence, les ablations ou la comparaison textuelle. Un conteneur vLLM doit appartenir au run, s'arrêter avec preuve, et ne pas toucher aux autres services. Les sorties se déposent dans un dossier neuf ; aucun résultat partiel ne s'écrase. Une incompatibilité CUDA/modèle, une erreur de schéma, une troncature du pré-vol ou un manque de temps est conservé comme échec, sans changement silencieux de version ou de protocole.

## Lancement et contrôles

[`deployment.json`](deployment.json) donne le dossier distant, le paquet, son SHA-256 et la session tmux.
Le garde du lanceur exige la fin scellée et le nettoyage confirmé de la nuit principale, puis prend les
verrous de la nuit, du GPU et de la référence. Il refuse tout code TVLens distant différent du commit
figé. Il attend le déchargement spontané des modèles Ollama existants et ne les arrête pas.
Après vLLM, Ollama visuel ne commence que si **une heure** reste pour téléchargement, pré-vol, mesure et
fermeture. Sinon, ce bras est marqué manquant. Le délai global reste 05:00 UTC.

Le paquet a passé neuf tests de garde Python, trois tests de sonde sur serveurs factices et
`node scripts/check.mjs --changed`. Sur le GX10, la syntaxe a été vérifiée et la validation sans réseau
ni inférence a préparé 24 cas (douze blocs de cinq images, deux passages). Cette validation ne prouve
pas que vLLM acceptera effectivement cinq images ni que le modèle répondra au schéma.
[`La validation et son scellé`](preuves/validation-inputs/) sont rapatriés ; leur empreinte a été vérifiée
localement et comparée au GX10. Le suivi de nuit inclut désormais les deux lanceurs.

## Sources officielles consultées

- [Ollama, tags Qwen3-VL](https://ollama.com/library/qwen3-vl/tags).
- [Qwen, checkpoint Qwen3-VL-4B-Instruct](https://huggingface.co/Qwen/Qwen3-VL-4B-Instruct).
- [vLLM v0.28.0, modèles pris en charge](https://docs.vllm.ai/en/v0.28.0/models/supported_models/).
- [vLLM v0.28.0, entrées multimodales](https://docs.vllm.ai/en/v0.28.0/features/multimodal_inputs/).
