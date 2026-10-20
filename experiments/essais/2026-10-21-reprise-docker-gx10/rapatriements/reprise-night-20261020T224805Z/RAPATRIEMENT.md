# Rapatriement du suffixe vLLM texte

Source : `/home/nvidia/tvlens-setup/reprise-night-20261020T224805Z` sur GX10. Copie réalisée le 21 octobre 2026 après clôture du run à 23:39:35 UTC. Le dossier distant original reste intact.

Le suffixe a terminé ses six étapes avec code 0 : téléchargement de l'image Docker, téléchargement et empreintes du modèle, contrôle GPU, démarrage vLLM et sonde texte. La fermeture est confirmée. La sonde a obtenu 20 réponses HTTP 200 sur 20 requêtes ; sa durée moyenne de réponse est de 20 393,7 ms (minimum 12 319,9 ms, maximum 27 788,4 ms). Ces durées concernent la pile vLLM + Qwen3.8-27B-NVFP4 et cette sonde, pas le flux TVLens complet. Le délai avant le premier token n'a pas été mesuré. La qualité des réponses reste à annoter (`readyForScoring=false`).

La copie comprend 130 fichiers sous `results/`, le README et les deux journaux du lanceur, soit 934 446 octets. Elle exclut `telemetry.jsonl` et les trois fichiers `.cid` ; ces quatre fichiers restent dans l'original distant. Aucun poids, média ni archive de modèle n'a été rapatrié.

Vérification SHA-256 : le manifeste `results/integrite.json` a la même empreinte locale et distante, `ccacb415a154588d2db13c1a65d834a2481543d303df00549aa84bb8e83a3ea3`. Les 129 autres fichiers copiés sous `results/` correspondent tous à leur empreinte dans ce manifeste ; seuls les quatre fichiers explicitement exclus y manquent. Les empreintes du README et des journaux correspondent aussi à la source distante :

| Fichier | SHA-256 |
| --- | --- |
| `README.md` | `aa3e69b3ad806c2f5dfca5ce098940de98eb62c36bdbf96ca12d8fdb3ec228bc` |
| `launcher.stdout.log` | `ee1ea551df2bbe5d392d3765f8ef5028f3f36883e32f1c8b9ab1b457cb857e63` |
| `launcher.stderr.log` | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |

La comparaison avec la sonde Ollama originale devra porter sur les piles complètes, car les modèles et conditions de service ne sont pas identiques. Elle ne permet pas d'attribuer un écart au seul moteur d'inférence.
