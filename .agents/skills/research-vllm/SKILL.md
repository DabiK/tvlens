---
name: research-vllm
description: "Étudier une alternative vLLM à Ollama pour TVLens sur GX10 : compatibilité ARM64/GB10, VLM, débit et délai de réponse."
license: MIT
metadata:
  upstream: Orchestra-Research/AI-Research-SKILLs
  upstream-commit: 773a52944ba4747a18bd4ae9ade53fff041adcbc
---

## Application TVLens

Cette skill prépare une comparaison de moteurs ; elle ne prouve pas la compatibilité GX10.
Vérifier via sources primaires actuelles et ctx7 : Linux ARM64, GB10, pilote/CUDA,
version vLLM, image ou build, architecture exacte du modèle, quantification et entrée image/vidéo.
Pour Cosmos/NVIDIA, vérifier séparément le modèle et le moteur ; ne pas confondre Cosmos avec le blueprint VSS.

Lire [la fiche amont](UPSTREAM.md) et ses références ciblées pour serving, batching et mémoire.
Les exemples x86, multi-GPU ou écoute 0.0.0.0 ne sont pas des réglages GX10 validés.
Pour un essai autorisé, utiliser un environnement isolé et un port loopback distinct,
après fin des campagnes en cours. Conserver la référence Ollama et les mêmes entrées.
Vérifier le protocole de l'adaptateur : une API OpenAI-compatible n'est pas l'API native Ollama.

Mesurer chargement, mémoire, débit, premier token si instrumenté, délai complet et qualité de réponse.
Fixer les sorties maximales, contexte, décodage et concurrence ; documenter les écarts inévitables.
Aucun téléchargement, installation de vLLM, remplacement d'Ollama ou déchargement de modèles
ne découle de la seule lecture de cette skill.

## Cadre local

Adaptation française pour TVLens ; l'original anglais est conservé dans `UPSTREAM.md`.
Les consignes du dépôt et le périmètre demandé priment sur les exemples amont.
Les essais réels laissent protocole, scripts, configuration et bruts dans `experiments/essais/<date>-<sujet>/`.
Ne pas perturber une campagne active, supprimer des résultats, committer ou pousser sans demande.
L'installation de cette skill fournit des instructions, pas une autorisation d'exécution supplémentaire.
