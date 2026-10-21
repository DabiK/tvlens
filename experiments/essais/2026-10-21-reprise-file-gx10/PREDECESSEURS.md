# Files arrêtées avant leurs essais propres

Quatre dossiers antérieurs ont été scellés `blocked` à cause de leurs prédécesseurs. Ils n'ont exécuté **aucun** appel modèle, téléchargement ou replay qui leur soit propre. Leurs originaux distants restent intacts. Les copies ci-dessous comprennent tous les fichiers sous `results/` couverts par leurs manifestes, `integrite.json` et les deux journaux du lanceur ; chaque fichier copié a été comparé au SHA-256 distant. Les listes exactes et attestations sont dans chaque dossier.

| Dossier distant sur GX10 | Cause scellée | Copie vérifiée | SHA-256 du sceau |
| --- | --- | --- | --- |
| `vision-vllm-20261020T214231Z` | `NIGHT_FAILED` après l'incident Docker de la nuit | [12 fichiers](../2026-10-20-vision-vllm-gx10/rapatriements/vision-vllm-20261020T214231Z/) | `69926523b60a336dfc5947366d310cf2ad1ea70d578d02555e6fe2bd57bd4975` |
| `streamingvlm-20261020T220235Z` | `PREDECESSOR_FAILED` après la nuit | [6 fichiers](../2026-10-21-streamingvlm-gx10/rapatriements/streamingvlm-20261020T220235Z/) | `5dae5cbb5887369faec1f419f223c3175748e3107ea67697856f52f855795d82` |
| `corpus-etendu-20261020T221045Z` | `PREDECESSOR_DOCKER_UNKNOWN` | [5 fichiers](../2026-10-21-corpus-etendu-gx10/rapatriements/corpus-etendu-20261020T221045Z/) | `e4be47b0eea85f2b61a2bb3aec1b3a980d23521ed784bcb3a74cf64b0feb88fe` |
| `reprise-streaming-20261020T224923Z` | `PREDECESSOR_FAILED` après le faux rejet du digest Qwen | [6 fichiers](rapatriements/reprise-streaming-20261020T224923Z/) | `1525213d99f3eb2e28d172ad3d3e7a80e2deb30254a82a1921020856719edeaa` |

Le Qwen visuel a ensuite été exécuté dans `reprise-qwen-20261020T224923Z` puis complété par le suffixe Ollama `reprise-qwen-arm-20261021T002414Z`. Le corpus étendu a terminé ses neuf replays dans `reprise-corpus-20261020T224923Z`. La continuation StreamingVLM attend sa fenêtre dans `reprise-streaming-arm-20261021T002414Z`. Ces reprises restent des dossiers distincts : aucun résultat antérieur n'a été réécrit ni recompté.
