# Résultat clos de StreamingVLM sur GX10

Run distant : `/home/nvidia/tvlens-setup/reprise-streaming-queue-20261021T044930Z/results`.
Statut terminal `finished` à 05:07:43 UTC le 21 octobre 2026, `cleanupConfirmed=true`.

Les quatre pilotes se sont terminés sans erreur de commande : 16 secondes, 72 secondes, 372 secondes et 16 secondes avec recalcul. Leurs `status.json`, `timing.json`, `segments.vtt`, protocoles et journaux sont copiés ici. Ces résultats mesurent le modèle StreamingVLM et son runtime dédié sur Spring ; ils ne mesurent pas le flux TVLens complet. La pertinence n'a pas été notée (`readyForScoring=false`).

Le manifeste distant couvre 78 fichiers ; les 78 SHA-256 ont été recalculés sur le GX10, sans écart. SHA-256 du manifeste : `8d8f8ff53932012592102f3699c39010376e94f0157af69fd2524476bd20269d`. Cette copie contient 73 fichiers couverts, tous comparés sans écart, plus le manifeste et les deux journaux du lanceur. `telemetry.jsonl` et quatre fichiers `.cid` restent sur le GX10, où leurs empreintes ont été vérifiées. Aucun média, poids, secret ou archive volumineuse n'est inclus dans Git.
