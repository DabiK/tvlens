# Rapatriement du corpus étendu GX10

Source : `/home/nvidia/tvlens-setup/reprise-corpus-20261020T224923Z` sur GX10. Copie réalisée après la clôture confirmée du 21 octobre 2026 à 03:11:36 UTC. Le dossier distant reste intact.

La sélection contient **72 fichiers** sous `results/` et les deux journaux du lanceur, soit **62 361 923 octets**. Elle comprend statuts, événements, sceau, identité, résumés, préparations sans médias, campagnes, transcriptions et réponses brutes. [selection.txt](selection.txt) donne la liste exacte ; [remote-attestation.json](remote-attestation.json) garde taille et SHA-256 distant de chaque copie.

Les 74 copies correspondent toutes, octet pour octet, aux empreintes distantes vérifiées après transfert. Le SHA-256 local et distant de `results/integrite.json` est `3124f87dd9d0181edeaa4d4ba58732a9f5640d0024c15d9fad55c6e5554b8ab5`. Les 71 autres résultats sélectionnés correspondent au manifeste scellé ; les deux journaux ont été contrôlés séparément. Le manifeste distant référence 9 067 fichiers, conservés sur GX10.

Les fichiers JPEG/WAV, `uploads/` contenant des médias encodés, `media/`, `thumbs/`, les embeddings et la télémétrie détaillée restent à distance. La télémétrie exclue est scellée avec SHA-256 `1d7b6b5b366c2258a0f4d98d8dd8426bbd2e6366a6b78c500110e7129fe9cd45`. Aucun poids, secret, vidéo ou archive volumineuse n'est inclus. Les métriques et limites sont dans le [README du protocole](../../README.md) ; les réponses attendent la relecture humaine (`readyForScoring=false`).
