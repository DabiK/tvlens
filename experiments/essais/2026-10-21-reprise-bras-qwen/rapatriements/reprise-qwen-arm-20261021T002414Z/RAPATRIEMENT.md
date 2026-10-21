# Rapatriement du suffixe Qwen Ollama

Source : `/home/nvidia/tvlens-setup/reprise-qwen-arm-20261021T002414Z` sur GX10. Le suffixe est `finished`, deux étapes avec code 0 et fermeture confirmée le 21 octobre 2026 à 03:27:12 UTC. Il contient uniquement le bras Ollama manquant ; le bras vLLM d'origine n'a pas été rejoué.

La copie comprend **136 fichiers** sous `results/` et les deux journaux du lanceur, soit **636 025 octets**. [selection.txt](selection.txt) liste les chemins exacts et [remote-attestation.json](remote-attestation.json) donne les tailles et empreintes distantes. Les 138 fichiers copiés ont été revérifiés localement par SHA-256. Le manifeste `results/integrite.json` a la même empreinte locale et distante : `94398917d6d77e8c65e7a17ae045485279b955b643970653178501c5717be093`. Ses 135 autres fichiers sélectionnés correspondent au sceau d'origine.

Les 25 `request.json` qui embarquent des images et `telemetry.jsonl` restent dans l'original distant, avec leurs empreintes dans le manifeste et l'attestation. Aucun média, poids ou identifiant secret n'a été rapatrié. Les réponses brutes et leurs métriques de latence sont incluses ; la pertinence n'est pas notée (`readyForScoring=false`).
