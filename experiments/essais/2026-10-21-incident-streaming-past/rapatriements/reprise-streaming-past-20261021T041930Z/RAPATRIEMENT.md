# Résultat clos de la reprise de dépendance Python

Run distant : `/home/nvidia/tvlens-setup/reprise-streaming-past-20261021T041930Z/results`.
Scellé `blocked` le 21 octobre 2026 à 04:31:02 UTC sur `pilot-16:EXIT_1`.

La couche `future==1.0.0`, l'inventaire et la sonde de dépendances ont réussi. Le checkpoint épinglé a été téléchargé entièrement (16/16 fichiers). Le premier pilote a échoué avant chargement du modèle : `ImportError: cannot import name 'Queue' from 'queue' (/runner/queue.py)`. Le nom du script auxiliaire masque le module standard Python. Aucune réponse StreamingVLM n'a été produite ; la compatibilité du checkpoint avec le GX10 reste inconnue.

Le manifeste principal distant couvre 62 fichiers ; les 62 SHA-256 ont été recalculés sans écart. SHA-256 du manifeste : `a1e4cd6aaf822fb0d4644d24c3888c8ee762216a0e36e8e01d818cb4088b5bcc`. La copie contient 57 fichiers couverts, tous comparés sans écart. Cinq fichiers (`telemetry.jsonl` et quatre `.cid`) restent seulement sur le GX10 ; leurs empreintes ont été vérifiées à distance. Les journaux du lanceur sont copiés séparément.

Le dossier `result-pilot-16` appartient à root et n'était pas lisible par le compte SSH. Ses trois JSON ont été lus et copiés via un conteneur éphémère **sans GPU, sans réseau et en lecture seule**, sur l'image locale déjà présente. Son manifeste couvre `protocol.json` et `status.json`, vérifiés sans écart ; SHA-256 du manifeste : `d48d434bce25f4e7214118ad6e80b3f74b21c4b94ab74090570ed09d02221b7d`. L'original distant reste intact.

Aucun média, poids, secret ou archive volumineuse n'est inclus dans Git. `readyForScoring=false` ; aucune qualité de réponse n'est notée.
