# Essais réels

| Dossier | Objet |
| --- | --- |
| [2026-10-18-copie-b-g3-mac](2026-10-18-copie-b-g3-mac/) | Essai G3 de la copie B sur Mac ; voir son rapport. |
| [2026-10-19-repetition-copie-c-mac](2026-10-19-repetition-copie-c-mac/) | Répétition de la copie C sur Mac ; voir son rapport. |
| [2026-10-20-preparation-gx10](2026-10-20-preparation-gx10/) | SSH/Tailscale, service et six vidéos prêts ; rejeu local FR de trois minutes complet, deux réponses et une abstention ; délais encore à optimiser. |
| [2026-10-20-reference-gx10](2026-10-20-reference-gx10/) | Lot exploratoire lancé : neuf campagnes Whisper × CNRS/Kennedy/Spring, journaux complets conservés. |
| [2026-10-20-nuit-gx10](2026-10-20-nuit-gx10/) | Séquence de nuit lancée en attente de la référence : deux ablations puis sonde Ollama/vLLM, arrêt à 07 h Paris, traces et versions figées. |
| [2026-10-20-vision-vllm-gx10](2026-10-20-vision-vllm-gx10/) | Sonde visuelle Qwen : 25 réponses par pile sur blocs identiques ; Ollama plus rapide dans cette sonde, précision effective et pertinence à contrôler. |
| [2026-10-21-streamingvlm-gx10](2026-10-21-streamingvlm-gx10/) | Pré-vol StreamingVLM déployé en attente après la nuit et Qwen visuel ; Spring, durée bornée et compatibilité ARM64 tracées. |
| [2026-10-21-corpus-etendu-gx10](2026-10-21-corpus-etendu-gx10/) | Neuf replays terminés sur Bœuf, Tears et Artemis avec trois variantes Whisper ; 45 réponses acquises, pertinence à relire. |
| [2026-10-21-reprise-docker-gx10](2026-10-21-reprise-docker-gx10/) | Reprise bornée de la seule sonde vLLM textuelle après incident d'accès Docker ; cinq étapes antérieures conservées. |
| [2026-10-21-reprise-file-gx10](2026-10-21-reprise-file-gx10/) | Nouvelles files Qwen visuel, StreamingVLM et corpus étendu, enchaînées après la reprise dans un socket `tmux` indépendant. |
| [2026-10-21-incident-digest-qwen](2026-10-21-incident-digest-qwen/) | Faux rejet de l'empreinte Ollama Qwen à cause du préfixe `sha256:` ; preuves scellées et effet sur la file StreamingVLM. |
| [2026-10-21-reprise-bras-qwen](2026-10-21-reprise-bras-qwen/) | Suffixe Ollama Qwen terminé avec 25 réponses et traces vérifiées. |
| [2026-10-21-incident-streaming-buildkit](2026-10-21-incident-streaming-buildkit/) | Refus du réseau `bridge` par BuildKit ; reprise bornée de StreamingVLM dans un dossier neuf, avec image et inventaire déjà scellés. |
| [2026-10-21-incident-streaming-past](2026-10-21-incident-streaming-past/) | Dépendance Python transitive manquante après le build ; couche `future` figée et reprise de la sonde StreamingVLM sous les échéances initiales. |
| [2026-10-21-incident-streaming-queue](2026-10-21-incident-streaming-queue/) | Masquage du module Python `queue` corrigé ; quatre pilotes StreamingVLM terminés, traces vérifiées et bilan de vitesse sans note de pertinence. |
| [2026-10-21-consolidation-gx10](2026-10-21-consolidation-gx10/) | Bilan des cinq points du 21 octobre, matrice vitesse–pertinence par vidéo et paquets d'annotation aveugle encore non notés. |
| [2026-10-21-analyse-ablation-gx10](2026-10-21-analyse-ablation-gx10/) | Réanalyse appariée hors GPU des ablations CNRS, avec délais, pertes, fraîcheur et limites de notation. |
| [2026-10-21-relecture-fiches-gx10](2026-10-21-relecture-fiches-gx10/) | Gel provisoire des six fiches et paquet de 90 réponses anonymisées à noter après relecture des médias. |
| [2026-10-21-confirmation-pause-vision-gx10](2026-10-21-confirmation-pause-vision-gx10/) | Huit replays Kennedy/Spring clos : délais HTTP, couverture, pertes et réponses à annoter. |
| [2026-10-21-confirmation-images-gx10](2026-10-21-confirmation-images-gx10/) | Ablation appariée cinq contre trois images close sur 24 blocs Kennedy/Spring, 96 sorties et SHA vérifiés. |
| [2026-10-21-shadow-selection-gx10](2026-10-21-shadow-selection-gx10/) | Sélection adaptative shadow sur six vidéos, sans suppression d'appel VLM, avec sorties et empreintes GX10. |
| [2026-10-21-preuves-medias-fiches-gx10](2026-10-21-preuves-medias-fiches-gx10/) | Preuves médias (ASR large-v3-turbo CPU, images) de huit questions : cinq attendus confirmés, `spring-04`, `kennedy-06` et `kennedy-03` à corriger. |
| [2026-10-21-oracle-medias-gx10](2026-10-21-oracle-medias-gx10/) | Transcriptions large-v3-turbo complètes sur CPU et images toutes les 2 s des six vidéos, matériau de l'oracle v2. |
| [2026-10-21-reference-instrumentee-gx10](2026-10-21-reference-instrumentee-gx10/) | E1 : six vidéos en configuration produit derrière un proxy de mesure ; 30/30 réponses, la génération domine, aucun outil appelé. |
| [2026-10-21-questions-hors-ligne-gx10](2026-10-21-questions-hors-ligne-gx10/) | E2 : cinq modèles de questions rejoués sur les 30 requêtes d'E1 ; `gemma4:26b-a4b` 2× plus rapide avec plus de réponses gardées. |
| [2026-10-21-vision-hors-ligne-gx10](2026-10-21-vision-hors-ligne-gx10/) | E3 : cinq modèles de vision rejoués sur 36 blocs ; aucun ne bat `gemma3:4b` (6,7 s par bloc). |
| [2026-10-21-flux-gemma4-gx10](2026-10-21-flux-gemma4-gx10/) | E4 : flux réel avec Gemma 4, puis pause vision, puis Whisper small ; 10/15 pertinentes toutes sous 15 s, contre 0 sous 15 s aujourd'hui. |
| [2026-10-21-serie-g-gx10](2026-10-21-serie-g-gx10/) | Série G : le schéma JSON bloque les outils (0/40 contre 20/20 sans), le MTP double déjà la vitesse, sans `topicSummary` la vision passe de 6,7 à 5,2 s ; mémoire injectée en notation. |
| [2026-10-21-flux-6-videos-gx10](2026-10-21-flux-6-videos-gx10/) | E5 : six vidéos en flux réel ; Gemma 4 + pause + Whisper small porte les réponses pertinentes sous 15 s de 3 à 20 sur 30 ; la vision `gemma4:e4b` ne perd plus aucun bloc. |
| [2026-10-21-flux-deux-phases-gx10](2026-10-21-flux-deux-phases-gx10/) | E6 : prototype de répondeur en deux phases (outils permis au premier tour) ; négatif avec Gemma 4, Spring à 156 s de médiane. |
| [2026-10-21-flux-journal-deux-phases-gx10](2026-10-21-flux-journal-deux-phases-gx10/) | E7 : journal mémoire et deux phases dans le flux ; 17/30 pertinentes contre 19 pour GPSV, gains sur les faits anciens, pertes et délais dus au chemin à outils. |
| [2026-10-22-variantes-nuit-gx10](2026-10-22-variantes-nuit-gx10/) | Nuit N1–N4 : GPS rejoué (8 questions sur 30 basculent), vision sans `topicSummary` (21/30, médiane 5,7 s, aucun bloc perdu), journal seul, questions Qwen MoE ; notés dans un seul paquet. |
| [2026-10-22-oracle-60-questions-gx10](2026-10-22-oracle-60-questions-gx10/) | Oracle v3 : 30 nouvelles questions en français (19 entièrement sur des faits anciens) rédigées puis vérifiées depuis les médias ; jeu d'évaluation porté à 60 questions. |
| [2026-10-22-journal-hors-ligne-gx10](2026-10-22-journal-hors-ligne-gx10/) | G5 : quatre formes du journal mémoire rejouées hors ligne ; le journal complet porte les réponses pertinentes de 45 à 49/60 et divise presque par deux les inventions. |
| [2026-10-22-searxng-gx10](2026-10-22-searxng-gx10/) | SearXNG auto-hébergé en conteneur sur la GX10 (boucle locale, API JSON) pour la recherche web des essais ; 3 s par requête. |
| [2026-10-22-oracle-v4-web-outils-gx10](2026-10-22-oracle-v4-web-outils-gx10/) | Oracle v4 : 42 questions qui demandent internet (W, M) ou la relecture d'images (O), sources datées, corpus web figé hors Git (dépôt public). |
| [2026-10-22-flux-60-questions-gx10](2026-10-22-flux-60-questions-gx10/) | J2/J3 : sur 60 questions dans le flux réel, le journal mémoire porte les réponses pertinentes de 28 à 38 et réduit les inventions de 16 à 9, pour 1,3 s de plus. |
| [2026-10-22-resume-asynchrone-gx10](2026-10-22-resume-asynchrone-gx10/) | J4 : `topicSummary` calculé hors du chemin critique par le proxy ; négatif, 106 blocs de vision perdus car chaque repli retarde la vision suivante ; correctif pour J5. |
| [2026-10-22-web-outils-hors-ligne-gx10](2026-10-22-web-outils-hors-ligne-gx10/) | H1 hors ligne : 3 passages de pages injectés font passer les questions web et mixtes de 0 à 26 pertinentes sur 60 pour 1,5 s de plus ; l'outil de recherche en deux temps boucle ; relire les images anciennes invente. |
| [2026-10-22-journal-produit-gx10](2026-10-22-journal-produit-gx10/) | J6 : le journal mémoire construit par TVLens (T313) donne 40 réponses pertinentes sur 60 (journal du proxy 38), sans aucune réponse rejetée par la validation des citations ni bloc de vision perdu. |
| [2026-10-22-decision-web-hors-ligne-gx10](2026-10-22-decision-web-hors-ligne-gx10/) | H2 hors ligne : un appel de 0,65 s au modèle décide de la recherche web (toutes les questions web et mixtes, 3 questions vidéo sur 60 à tort) et écrit une requête qui nomme le sujet ; base du ticket T314. |
| [2026-10-22-web-reel-texte-gx10](2026-10-22-web-reel-texte-gx10/) | H4 : sur de vraies pages ouvertes par le produit, le simple début de page (14/30 questions web et mixtes, 12/18 web) fait aussi bien que les sélections plus fines et invente moins. |
| [2026-10-22-produit-complet-web-gx10](2026-10-22-produit-complet-web-gx10/) | F1 : le produit complet (journal + web) en flux réel sur 102 questions ; la vidéo ne régresse pas (44/60), les questions web restent faibles sans titre (8/18), 12,2 s par question web. |
| [2026-10-23-comparatif-codex-local](2026-10-23-comparatif-codex-local/) | C1 : sur les mêmes 102 questions et les mêmes contextes, la voie locale fait jeu égal avec Codex (vidéo 38 contre 42/60, web 12 contre 11/18), plus vite sur le web, mais invente davantage. |
| [2026-10-21-oracle-notation-recherche-gx10](2026-10-21-oracle-notation-recherche-gx10/) | Méthode commune : oracle v2 automatique, notation à l'aveugle des 150 réponses antérieures, recherche bibliographique et consignes des agents. |
| [2026-10-21-variantes-gx10](2026-10-21-variantes-gx10/) | Registre de toutes les variantes testées sur GX10 : ce qui change, statut, vitesse, pertinence, verdict. |
| [2026-10-21-audit-nuit-gx10](2026-10-21-audit-nuit-gx10/) | Audit indépendant de la nuit : 221 chiffres confirmés, 30/30 sceaux distants intacts ; gain de la pause surestimé (démarrage à froid), aveugle cassable, oracle hors Git. |
| [2026-10-22-son-capture-mac](2026-10-22-son-capture-mac/) | Son absent sur Mac : la voie audio dépend du lancement (par macOS : CoreAudio Tap ; terminal : ScreenCaptureKit). Avec Tap et une relance par macOS (ADR 0065), son capté et transcrit dans cinq captures, app empaquetée comprise. |
