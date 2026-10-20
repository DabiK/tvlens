# Essais exécutés

Un dossier par essai réellement lancé : question, configuration exacte, résultats, lecture, limites et incidents, avec
les résultats bruts et les scripts de sonde. Les contrôles réels qui suivent les tickets critiques (T269 à T276) y
sont consignés, comme les recettes sur la TV et le VPS.

| Date | Essai | Contrôle | Verdict |
| --- | --- | --- | --- |
| 18/10 | [Perception locale sur le Mac, gemma3 4B et 12B](2026-10-18-perception-locale-mac/README.md) | sonde | branchement réel validé ; le 4B tient le rythme d'un passage, le 12B non |
| 18/10 | [Recette réelle sur la TV et le VPS](2026-10-18-recette-tv-vps/README.md) | T233 | concluant ; deux écarts antérieurs corrigés à part ; Whisper du VPS à la limite du temps réel |
| 18/10 | [Questions répondues par Ollama sur le Mac](2026-10-18-questions-locales-mac/README.md) | T269 | concluant ; outils appelés malgré le schéma imposé ; abstention juste sur session réelle |
| 18/10 | [Chargement du modèle local séparé du démarrage froid](2026-10-18-chargement-modele-local/README.md) | T270 | concluant ; attente, aller-retour et chargement séparés |
| 18/10 | [Réexamen de clips par un modèle vision local](2026-10-18-reexamen-local-mac/README.md) | T271 | concluant ; refus nommé sans repli ; qualité du 12B en retrait sur Codex |
| 18/10 | [Recherche d'une vraie session par des embeddings Ollama](2026-10-18-recherche-embeddings-locale/README.md) | T276 | écart corrigé par T278, contrôle refait dans la répétition de la copie A |
| 18/10 | [Rejeu d'une vraie capture par la perception de production](2026-10-18-rejeu-perception-mac/README.md) | T272 | concluant ; local et référence Codex 4/4 ; média altéré refusé avant appel |
| 18/10 | [Une vraie vidéo convertie en blocs TV, rejouée et envoyée au serveur](2026-10-18-conversion-video-mac/README.md) | T273 | concluant ; 13 / 13 rejoués en local, 4 / 4 blocs acceptés ; langue à surveiller |
| 18/10 | [Répétition de la copie A du GX10, tout en local sur le Mac](2026-10-18-copie-a-repetition/README.md) | T274, T276 | concluant ; tout tourne en local ; 4B 0 / 4 face à Codex 4 / 4 à la revue ; tag `gx10-copie-a` |
| 18/10 | [Trente minutes soutenues, tout en local sur le Mac (copie B, G3)](2026-10-18-copie-b-g3-mac/README.md) | T280 | concluant ; 227 / 227 envois, audio intact, 31 % de vision perdue sous charge, 8 / 8 questions justes ; tag `gx10-copie-b` |
| 18-19/10 | [Panneau de la TV sur une vidéo 16:9, une vidéo 4:3 et hors de YouTube](2026-10-18-panneau-tv/README.md) | T275 | concluant ; refus nommé une fois ; bande noire de YouTube sur le 4:3, à traiter à part |
| 19/10 | [Panneau et capture sur une autre application que YouTube](2026-10-19-panneau-autre-application/README.md) | sonde | limite écrite dans le code ; image, son et réduction exploitables ; délai de la sidebar trop court (T285) |
| 19/10 | [Raisonnement des questions et modèle de réexamen, tout en local sur le Mac](2026-10-19-raisonnement-reexamen-mac/README.md) | T284 | aucun réglage retenu : sans raisonnement, 10 / 10 refus ; réexamen par le 27B, 3 / 3 abstentions ; `gx10-copie-b` gardée |
| 19/10 | [Panneau et capture de la TV au-delà de YouTube](2026-10-19-recette-tv-au-dela-youtube/README.md) | T289 | concluant ; 4:3 entier, panneau tenu sur le lecteur de la TV, capture du lecteur sans perte, accueil compté en perte |
| 19/10 | [Image et son de Netflix sur la TV](2026-10-19-son-netflix/README.md) | sonde | image noire (protégée) ; son présent, plus bas que YouTube : audio seul faisable |
| 19/10 | [Image de contrôle du noir sur la vraie TV](2026-10-19-controle-noir-tv/README.md) | sonde | contrôle PNG 160×90 de T301 refusé par la TV ; 256×144 au moins ; BMP jugé en 10 ms (T306) |
| 19/10 | [Répétition de la copie C sur le Mac, par l'exécuteur GX10](2026-10-19-repetition-copie-c-mac/README.md) | copie C | concluant ; G1 15 / 15, G3 45 / 45 envois, vision 60 %, 2 / 2 questions ; `gemma3:4b` remplacé par erreur |
