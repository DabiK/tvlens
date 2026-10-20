# Agent researcher et skills de recherche

Agent local : `.codex/agents/researcher.toml`, modèle et effort hérités du parent.
Utilisation : « Délègue au researcher l'analyse vitesse/pertinence du dernier lot GX10. »
Les quatre skills projet sont aussi invocables directement : `$research-autoresearch`,
`$research-phoenix`, `$research-whisper`, `$research-vllm`.
Elles sont reliées au rôle par ses instructions, sans exclusivité ni isolation de permissions.

Installées depuis Orchestra-Research/AI-Research-SKILLs au commit
`773a52944ba4747a18bd4ae9ade53fff041adcbc` via l'installateur Codex, puis adaptées à TVLens.
Le manifeste voisin conserve les chemins et empreintes originales. Licence MIT incluse dans chaque dossier.
Les ressources amont restent en anglais pour préserver leur provenance ; les entrées locales sont en français.

- Autoresearch : protocole et synthèse retenus ; cron permanent et commits automatiques écartés.
- Phoenix : utile pour l'observabilité future ; aucune instrumentation créée par cette installation.
- Whisper : utile à la comparaison ASR ; ses exemples Python ne remplacent pas whisper.cpp CUDA.
- vLLM : utile à l'étude GX10/Cosmos ; compatibilité matérielle et adaptateur à vérifier avant essai.
- LLaVA : non retenu, moins ciblé sur la compréhension temporelle vidéo et notre piste NVIDIA.

Aucune dépendance Python, aucun modèle et aucun service installé. Aucun accès GX10 modifié.
Référence de format agent : https://learn.chatgpt.com/docs/agent-configuration/subagents

Validation : quatre SKILL.md validés par quick_validate.py ; TOML chargé avec tomllib ;
ressources amont comparées octet par octet au commit source ; node scripts/check.mjs --changed vert.
Le chargement effectif du nouveau rôle à la prochaine découverte Codex reste à observer ;
aucune exécution de recherche ni installation moteur déclenchée pour cette validation.

- [Préparation traçable des deux premiers essais GX10](2026-10-20-execution/README.md) : corpus 5/3 images validés, orchestration bornée et traces ; flux complet et inférence encore conditionnels.
