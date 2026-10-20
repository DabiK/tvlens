---
name: research-whisper
description: "Comparer la transcription locale pour TVLens : modèles Whisper, langues, qualité ASR et latence, en distinguant whisper.cpp des backends Python."
license: MIT
metadata:
  upstream: Orchestra-Research/AI-Research-SKILLs
  upstream-commit: 773a52944ba4747a18bd4ae9ade53fff041adcbc
---

## Application TVLens

Le backend de référence est whisper.cpp compilé CUDA. Les exemples `openai-whisper`, Transformers ou PyTorch
amont décrivent d'autres implémentations : ne pas les substituer ni installer leurs dépendances implicitement.
Distinguer une variation du poids, des threads, du contexte audio, du GPU/CPU et du moteur.

Conserver modèle et SHA-256 des poids, commit du moteur, paramètres, langue, découpage audio,
transcription complète, temps par bloc, retard accumulé et charge concurrente.
Comparer la WER/CER seulement avec une transcription de référence vérifiée ;
noter aussi noms, nombres, hallucinations sur silence/musique et effet sur les réponses du compagnon.
Présenter FR, EN et témoin sans dialogue séparément. Une transcription plus rapide n'est pas nécessairement meilleure.

Lire [la fiche amont](UPSTREAM.md) pour les concepts ASR et options des backends Python,
puis vérifier la documentation du moteur réellement testé avant toute transposition.
Les services cloud proposés dans l'amont ne font pas partie du protocole local.

## Cadre local

Adaptation française pour TVLens ; l'original anglais est conservé dans `UPSTREAM.md`.
Les consignes du dépôt et le périmètre demandé priment sur les exemples amont.
Les essais réels laissent protocole, scripts, configuration et bruts dans `experiments/essais/<date>-<sujet>/`.
Ne pas perturber une campagne active, supprimer des résultats, committer ou pousser sans demande.
L'installation de cette skill fournit des instructions, pas une autorisation d'exécution supplémentaire.
