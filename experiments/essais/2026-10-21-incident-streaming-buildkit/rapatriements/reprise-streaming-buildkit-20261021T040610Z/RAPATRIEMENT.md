# Résultat clos de la reprise BuildKit

Run distant : `/home/nvidia/tvlens-setup/reprise-streaming-buildkit-20261021T040610Z/results`.
Statut scellé le 21 octobre 2026 à 04:09:34 UTC : `blocked`, `dependency-probe:EXIT_1`.

Le build des dépendances (`--network=default`) a réussi en 197,15 s. L'inventaire des versions a réussi, et la sonde a confirmé ARM64, CUDA disponible et le décodage de 11 138 images Spring par Decord. L'import de StreamingVLM s'est ensuite arrêté sur `ModuleNotFoundError: No module named 'past'`, depuis l'import Python de `ffmpeg`. Aucun poids de modèle n'a été téléchargé et aucune réponse StreamingVLM n'a été produite.

L'original distant est conservé intégralement. Son `integrite.json` couvre 38 fichiers ; les 38 empreintes ont été recalculées sur le GX10, sans écart. SHA-256 du manifeste : `8364eb61e32712ce44bc9eff66511da506c58a35f6f1c53643c4ed8836e540b3`.

Cette copie contient 35 fichiers couverts par ce manifeste, tous comparés à leur SHA-256 sans écart, plus `integrite.json` et les deux journaux du lanceur. `telemetry.jsonl` et deux fichiers `.cid` sont exclus de la copie destinée à Git, mais conservés sur le GX10 et vérifiés dans le manifeste distant. Aucun média, poids ou secret n'a été copié. La qualité des réponses n'est pas notée (`readyForScoring=false`).
