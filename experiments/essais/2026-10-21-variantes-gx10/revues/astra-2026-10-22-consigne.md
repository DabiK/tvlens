Tu es relecteur indépendant et co-planificateur des expériences GX10 de TVLens (compagnon de visionnage : blocs de 8 s,
Whisper + vision VLM par bloc, puis un LLM répond aux questions avec les 6 derniers passages, soit 48 s). Lecture seule :
ne modifie aucun fichier, ne lance aucune commande réseau ni SSH. Réponds en français, de façon concise et chiffrée.

À lire (dans cet ordre) :
1. Registre des variantes : experiments/essais/2026-10-21-variantes-gx10/README.md et CHIFFRES.md (chiffres.json = version machine).
2. Nuit N1–N4 : experiments/essais/2026-10-22-variantes-nuit-gx10/README.md ; notes à l'aveugle : notation/notes.json
   (une ligne par réponse : cfg, q, s = délai en s, score, invention, relevant…) ; campagnes brutes : bruts/*/campagnes/*.json.
3. E5, E6, E7 : experiments/essais/2026-10-21-flux-6-videos-gx10/, -flux-deux-phases-gx10/, -flux-journal-deux-phases-gx10/.
4. Oracle v3 (60 questions) : experiments/essais/2026-10-22-oracle-60-questions-gx10/README.md et oracle-v3.json.
5. Méthode (oracle, notation, recherche) : experiments/essais/2026-10-21-oracle-notation-recherche-gx10/README.md.
6. Essai en file G5 (variantes du journal rejouées hors ligne) : /private/tmp/claude-501/-Users-Dabi-Documents-ISN-tvlens/10f8a5c3-4f60-484e-82eb-5180ae7c9ba0/scratchpad/labo/construire_g5.py et le proxy /private/tmp/claude-501/-Users-Dabi-Documents-ISN-tvlens/10f8a5c3-4f60-484e-82eb-5180ae7c9ba0/scratchpad/labo/ollama_proxy.py.

État de la GX10 maintenant (22/10 ~09:10 UTC) : N5b (GPS + vision sans topicSummary + journal, 3 vidéos restantes) tourne ;
puis N6 (N2 rejoué), G5 (5 bras × 2 passages × 30 questions, hors ligne), J1 (GPSV + vision sans topicSummary). Environ
8 h de GPU restent aujourd'hui ; un passage de flux réel sur 6 vidéos dure ~90 min, un rejeu hors ligne de 300 appels ~45 min.
Contrainte produit : topicSummary alimente le résumé cumulatif des cartes de la frise TV (core/memory/lanes.cjs,
core/perception-context.cjs, docs/lg-timeline.md) ; on ne peut pas le supprimer, seulement le sortir du chemin critique.

Rends un rapport en quatre parties :
A. Vérification : recalcule depuis notes.json et les campagnes les chiffres clés de la nuit (pertinentes, sous 15 s,
   inventions, délais médians, faits anciens/récents, questions basculées) et d'E7. Liste chaque écart avec le chiffre
   publié et le chiffre recalculé. Dis « aucun écart » si c'est le cas.
B. Méthode : les 3 à 5 faiblesses qui menacent le plus les conclusions (variance d'un passage, juges et oracle écrits par
   des modèles, plafond de langue, confusions dans G5, comparabilité 30/60 questions…), chacune avec un correctif concret.
C. Plan : pour le reste de la journée, au plus 6 essais classés par information attendue rapportée au temps GPU. Chacun
   ne change qu'une chose, avec sa référence, sa durée et le critère de décision chiffré. Inclus une manière de tester un
   topicSummary hors du chemin critique (par le proxy ou autrement), en vérifiant dans le code comment TVLens réagit si le
   champ manque sur un bloc.
D. Ce que tu changerais dans la file actuelle (ordre, contenu), et pourquoi.
