# Rapatriement de la sonde Qwen vLLM

Source : `/home/nvidia/tvlens-setup/reprise-qwen-20261020T224923Z` sur GX10. Le dossier original est scellé `blocked` après le bras vLLM ; les 25 réponses vLLM sont conservées. Aucune inférence Ollama n'a été tentée dans ce dossier. La cause est le [faux rejet du préfixe SHA-256](../../../2026-10-21-incident-digest-qwen/README.md), distinct d'un échec modèle.

La copie comprend **117 fichiers** sous `results/` et les deux journaux du lanceur, soit **1 745 699 octets**. [selection.txt](selection.txt) liste les chemins exacts et [remote-attestation.json](remote-attestation.json) donne les tailles et empreintes distantes. Les 119 fichiers copiés ont été revérifiés localement par SHA-256. Le manifeste `results/integrite.json` a la même empreinte locale et distante : `17660b79ce96c940ca1c5412ceb2fdcd23851824a3566d07871f8df12b63b026`. Ses 116 autres fichiers sélectionnés correspondent au sceau d'origine.

Les 25 `request.json` qui embarquent des images et trois fichiers `.cid` restent dans l'original distant. Leurs SHA-256 restent dans le manifeste et l'attestation. Aucun média, poids ou identifiant secret n'a été rapatrié. Les réponses brutes et leurs métriques de latence sont incluses ; la pertinence n'est pas notée (`readyForScoring=false`).
