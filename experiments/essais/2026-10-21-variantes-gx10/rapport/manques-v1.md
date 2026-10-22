# 6. CE QUI MANQUE — Campagne GX10, 20–22 octobre 2026

P0 : indispensable pour clore le dossier. P1 : réconcilier les preuves. P2 : qualifier les limites ou poursuivre plus tard.
Édition corrigée : H4 est désormais noté, J5b est négatif, T316 est en boucle selon la consigne. F1 reste en cours, sans résultat final intégré. Les constats historiques ci-dessous restent détaillés ; M02 et M19 sont actualisés.

Préfixes :

- E : `/Users/Dabi/Documents/ISN/tvlens/experiments/essais`
- L : `/private/tmp/claude-501/-Users-Dabi-Documents-ISN-tvlens/10f8a5c3-4f60-484e-82eb-5180ae7c9ba0/scratchpad/labo`
- P : `/Users/Dabi/Documents/ISN/tvlens-essai-f1`

## M01 — P0 — F1 : résultat complet et identité de l’exécution

Fichiers :

- `L/plan-f1-produit-journal-web-102q.json`
- `L/astra/plan-courant.md`
- `E/2026-10-21-variantes-gx10/README.md`

Constat : F1 est en cours selon la consigne. Le départ annoncé n’est pas corroboré par un journal de lancement identifié dans les fichiers lus. Le plan épingle cfa0bf8 ; aucune note finale F1 n’est incluse.

- [ ] Après clôture, archiver le statut terminal, le commit réellement exécuté, la configuration, les campagnes, erreurs et sceaux. Noter séparément vidéo, W, M, O. Garder cette édition du rapport comme état antérieur au résultat.

Sources :
- `/private/tmp/claude-501/-Users-Dabi-Documents-ISN-tvlens/10f8a5c3-4f60-484e-82eb-5180ae7c9ba0/scratchpad/rapport-gx10/consigne.md`
- `/private/tmp/claude-501/-Users-Dabi-Documents-ISN-tvlens/10f8a5c3-4f60-484e-82eb-5180ae7c9ba0/scratchpad/labo/plan-f1-produit-journal-web-102q.json`
- `/private/tmp/claude-501/-Users-Dabi-Documents-ISN-tvlens/10f8a5c3-4f60-484e-82eb-5180ae7c9ba0/scratchpad/labo/astra/plan-courant.md`

## M02 — CLOS — H4 : notation disponible et intégrée

Fichiers :

- `L/h4-resultats/status.json`
- `L/h4-resultats/calls.jsonl`
- `L/notation-h4/notes.json`
- `L/notation-h4/membres-tears.json`

Constat actualisé : les notes consolidées existent. Sur 30 questions W/M et un passage, début de page 14/30 (12/18 W, 2/12 M), 3 inventions ; début + extrait 14/30, 6 inventions ; fusion 12/30 ; BM25 10/30 ; proximité sémantique 8/30. La médiane de 6,1643 s du début de page couvre la réponse, hors recherche et préparation. Acquisition : 150 appels, tous HTTP 200.

- [x] Vérifier les agrégats de notes.json et calls.jsonl et intégrer les résultats au rapport corrigé. Le début de page suffit comme référence sur cet échantillon ; l’archivage durable et le coût complet restent ouverts en M03/M04.

Sources :
- `/private/tmp/claude-501/-Users-Dabi-Documents-ISN-tvlens/10f8a5c3-4f60-484e-82eb-5180ae7c9ba0/scratchpad/labo/h4-resultats/status.json`
- `/private/tmp/claude-501/-Users-Dabi-Documents-ISN-tvlens/10f8a5c3-4f60-484e-82eb-5180ae7c9ba0/scratchpad/labo/h4-resultats/calls.jsonl`
- `/private/tmp/claude-501/-Users-Dabi-Documents-ISN-tvlens/10f8a5c3-4f60-484e-82eb-5180ae7c9ba0/scratchpad/labo/notation-h4/cle.json`
- `/private/tmp/claude-501/-Users-Dabi-Documents-ISN-tvlens/10f8a5c3-4f60-484e-82eb-5180ae7c9ba0/scratchpad/labo/notation-h4/membres-tears.json`

## M03 — P0 — H4 : coût complet de la recherche et du classement

Fichiers :

- `L/rejouer_h4.py`
- `L/h4/cache_web.cjs`
- `L/h4-resultats/calls.jsonl`
- `L/astra/plan-courant.md`

Constat : wallMs couvre seulement post_with_nonce. searchMs vient du cache. Le coût des ouvertures et du classement ne fait pas partie de cette médiane ; V4 calcule ses embeddings avant le chronomètre.

- [ ] Consolider par question décision, recherche, ouvertures/extraction, classement/embeddings, réponse et attente. Ne pas additionner des médianes de populations différentes. Publier la latence totale observée avec son périmètre.

Sources :
- `/private/tmp/claude-501/-Users-Dabi-Documents-ISN-tvlens/10f8a5c3-4f60-484e-82eb-5180ae7c9ba0/scratchpad/labo/rejouer_h4.py`
- `/private/tmp/claude-501/-Users-Dabi-Documents-ISN-tvlens/10f8a5c3-4f60-484e-82eb-5180ae7c9ba0/scratchpad/labo/h4-resultats/calls.jsonl`
- `/private/tmp/claude-501/-Users-Dabi-Documents-ISN-tvlens/10f8a5c3-4f60-484e-82eb-5180ae7c9ba0/scratchpad/labo/astra/plan-courant.md`

## M04 — P0 — H2b et H4 : archiver les résultats hors du scratchpad

Fichiers :

- `L/h2b-resultats/`
- `L/notation-h2b/notes.json`
- `L/rejouer_h2b.py`
- `L/h4-resultats/`
- `L/notation-h4/`
- `E/README.md`

Constat : Les résultats sont dans le laboratoire. Aucun dossier dédié H2b/H4 n’est référencé dans l’index consulté. H2b est noté mais n’a pas de synthèse officielle dans le registre.

- [ ] Créer ensuite les dossiers d’essais avec définition des bras, captures d’entrée, scripts, notes, cache privé ou manifeste, empreintes et limites. Ajouter leur lien à l’index et au registre. Ne pas recommencer les essais pour combler ce défaut documentaire.

Sources :
- `/private/tmp/claude-501/-Users-Dabi-Documents-ISN-tvlens/10f8a5c3-4f60-484e-82eb-5180ae7c9ba0/scratchpad/labo/notation-h2b/notes.json`
- `/private/tmp/claude-501/-Users-Dabi-Documents-ISN-tvlens/10f8a5c3-4f60-484e-82eb-5180ae7c9ba0/scratchpad/labo/h2b-resultats/status.json`
- `/private/tmp/claude-501/-Users-Dabi-Documents-ISN-tvlens/10f8a5c3-4f60-484e-82eb-5180ae7c9ba0/scratchpad/labo/h4-resultats/status.json`
- `/Users/Dabi/Documents/ISN/tvlens/experiments/essais/README.md`
- `/Users/Dabi/Documents/ISN/tvlens/experiments/essais/2026-10-21-variantes-gx10/README.md`

## M05 — P0 — Configuration rapide : résumé de frise non préservé

Fichiers :

- `E/2026-10-22-journal-produit-gx10/README.md`
- `E/2026-10-22-resume-asynchrone-gx10/README.md`
- `P/docs/travail/tickets/313-*.md`

Constat : Le journal est dans le produit, mais J6 utilise encore le proxy vision sans topicSummary. J4/J5b n’envoient pas leurs résumés aux cartes. Leur fidélité n’est pas notée, volontairement après échec mécanique.

- [ ] Décrire la recette de démonstration exacte. Conserver le résumé produit ou accepter explicitement sa dégradation dans une démonstration expérimentale. Ne pas annoncer une intégration complète de la recette rapide.

Sources :
- `/Users/Dabi/Documents/ISN/tvlens/experiments/essais/2026-10-22-journal-produit-gx10/README.md`
- `/Users/Dabi/Documents/ISN/tvlens/experiments/essais/2026-10-22-resume-asynchrone-gx10/README.md`
- `/Users/Dabi/Documents/ISN/tvlens-essai-f1/docs/travail/tickets/313-give-local-questions-a-compact-digest-of-the-older-passages.md`

## M06 — P1 — Registre : états périmés de la fin de campagne

Fichiers :

- `E/2026-10-21-variantes-gx10/README.md`
- `E/2026-10-21-variantes-gx10/CHIFFRES.md`
- `E/2026-10-21-variantes-gx10/chiffres.json`
- `L/astra/plan-courant.md`

Constat : README : H2b encore en file, F1 retenu hors file. CHIFFRES : J5b encore en cours, alors que le README dédié le clôt négatif. Le JSON est daté avant ces résultats. Le plan juxtapose plusieurs anciennes files.

- [ ] Choisir un instant de référence et publier une table d’états unique. Conserver les anciens états dans un historique daté. Distinguer « fini côté appels », « noté » et « intégré ».

Sources :
- `/Users/Dabi/Documents/ISN/tvlens/experiments/essais/2026-10-21-variantes-gx10/README.md`
- `/Users/Dabi/Documents/ISN/tvlens/experiments/essais/2026-10-21-variantes-gx10/CHIFFRES.md`
- `/Users/Dabi/Documents/ISN/tvlens/experiments/essais/2026-10-21-variantes-gx10/chiffres.json`
- `/private/tmp/claude-501/-Users-Dabi-Documents-ISN-tvlens/10f8a5c3-4f60-484e-82eb-5180ae7c9ba0/scratchpad/labo/astra/plan-courant.md`
- `/Users/Dabi/Documents/ISN/tvlens/experiments/essais/2026-10-22-resume-asynchrone-gx10/README.md`

## M07 — P1 — Chiffres machine : règle de mémoire non harmonisée

Fichiers :

- `E/2026-10-21-variantes-gx10/chiffres.json : contexteQuestions.questionsPreuveAncienne`
- `E/2026-10-21-variantes-gx10/chiffres.json : g2Memoire.bras`
- `E/2026-10-21-variantes-gx10/chiffres.json : nuitVariantesGps.questionsFaitHorsFenetre`

Constat : Le champ général conserve 11/30 questions anciennes et G2 des sous-scores sur 22 réponses. La règle harmonisée de blocs compte 6/30 partiellement anciennes. Le commentaire général dit encore oracle v2 pour des essais v3.

- [ ] Conserver la règle d’origine de G2, la nommer, et ajouter une ventilation recalculée si nécessaire. Renseigner pour chaque essai oracle, règle temporelle et dénominateur ; ne pas réutiliser les sous-scores comme s’ils étaient homogènes.

Sources :
- `/Users/Dabi/Documents/ISN/tvlens/experiments/essais/2026-10-21-variantes-gx10/chiffres.json`
- `/Users/Dabi/Documents/ISN/tvlens/experiments/essais/2026-10-21-variantes-gx10/revues/astra-2026-10-22-revue.md`

## M08 — P1 — Notes variables : E1, GPSV et N2

Fichiers :

- `E/2026-10-21-questions-hors-ligne-gx10/notation/bilan.md`
- `E/2026-10-21-flux-6-videos-gx10/README.md`
- `E/2026-10-21-flux-journal-deux-phases-gx10/README.md`
- `E/2026-10-22-variantes-nuit-gx10/notation-n5-n6/notes.json`

Constat : E1 change de score entre paquets E2/E5 ; GPSV entre E5/E7 ; N2 garde son total mais change des statuts et le nombre d’inventions. Les divergences sont dues aux évaluations, pas nécessairement à de nouveaux runs.

- [ ] Ajouter paquet, version de grille et arbitre à chaque score. Joindre une table des réponses qui basculent, avec justification. Ne pas moyenner les scores de paquets différents.

Sources :
- `/Users/Dabi/Documents/ISN/tvlens/experiments/essais/2026-10-21-questions-hors-ligne-gx10/notation/bilan.md`
- `/Users/Dabi/Documents/ISN/tvlens/experiments/essais/2026-10-21-flux-6-videos-gx10/README.md`
- `/Users/Dabi/Documents/ISN/tvlens/experiments/essais/2026-10-21-flux-journal-deux-phases-gx10/README.md`
- `/Users/Dabi/Documents/ISN/tvlens/experiments/essais/2026-10-21-variantes-gx10/revues/periodique-20261022T1047Z-revue.md`

## M09 — P1 — H2 : titre et dénominateurs non représentatifs du produit

Fichiers :

- `E/2026-10-22-decision-web-hors-ligne-gx10/README.md`
- `E/2026-10-21-variantes-gx10/CHIFFRES.md`
- `L/astra/plan-courant.md`
- `P/docs/travail/tickets/314-*.md`

Constat : Les chiffres les plus favorables sont PT/PTQ avec titre. Le produit sans titre correspond à P/PQ. PQ ne note que les questions déclenchées ; sa médiane réponse inclut aussi des questions vidéo.

- [ ] Publier séparément décision, réponse conditionnelle et parcours complet. Inclure au dénominateur toutes les W/M planifiées et mesurer la question non déclenchée. Étiqueter précisément la population de chaque médiane.

Sources :
- `/Users/Dabi/Documents/ISN/tvlens/experiments/essais/2026-10-22-decision-web-hors-ligne-gx10/README.md`
- `/Users/Dabi/Documents/ISN/tvlens/experiments/essais/2026-10-21-variantes-gx10/revues/periodique-20261022T2058Z-revue.md`
- `/Users/Dabi/Documents/ISN/tvlens-essai-f1/docs/travail/tickets/314-let-the-local-model-decide-the-web-search-and-write-its-query.md`
- `/private/tmp/claude-501/-Users-Dabi-Documents-ISN-tvlens/10f8a5c3-4f60-484e-82eb-5180ae7c9ba0/scratchpad/rapport-gx10/verification-independante.md`

## M10 — P1 — E7 : base de contexte non recalculable dans la revue

Fichiers :

- `E/2026-10-21-variantes-gx10/chiffres.json : e7JournalDeuxPhases.contexteQuestionJetonsMedian`
- `E/2026-10-21-variantes-gx10/revues/astra-2026-10-22-revue.md`

Constat : La comparaison cite 4 323 contre 2 507 jetons. La revue confirme le premier nombre sur 36 appels renseignés, et ne retrouve pas le brut local de la référence.

- [ ] Fournir les lignes exactes, le rôle des appels et le filtre de calcul de chaque côté. Garder la comparaison comme documentaire tant que le second agrégat n’est pas recalculé.

Sources :
- `/Users/Dabi/Documents/ISN/tvlens/experiments/essais/2026-10-21-variantes-gx10/chiffres.json`
- `/Users/Dabi/Documents/ISN/tvlens/experiments/essais/2026-10-21-variantes-gx10/revues/astra-2026-10-22-revue.md`

## M11 — P1 — Oracles : statut de validation et limites humaines

Fichiers :

- `E/../gx10/evaluation/selection.json`
- `E/2026-10-21-relecture-fiches-gx10/README.md`
- `E/2026-10-21-oracle-notation-recherche-gx10/oracle/oracle-v2.json`
- `E/2026-10-22-oracle-60-questions-gx10/oracle-v3.json`
- `E/2026-10-22-oracle-v4-web-outils-gx10/README.md`

Constat : Les gels initiaux restent draft_requires_media_review / readyForScoring=false. Les résultats suivants reposent sur des juges modèles et de nouveaux oracles, sans validation humaine consignée.

- [ ] Écrire un statut explicite pour chaque oracle, avec version, empreinte et type de validation. Pour le dossier, conserver la mention « évaluation automatique ». Revoir prioritairement les désaccords visuels et les faits d’actualité si une validation humaine est réalisée.

Sources :
- `/Users/Dabi/Documents/ISN/tvlens/experiments/gx10/evaluation/selection.json`
- `/Users/Dabi/Documents/ISN/tvlens/experiments/essais/2026-10-21-oracle-notation-recherche-gx10/README.md`
- `/Users/Dabi/Documents/ISN/tvlens/experiments/essais/2026-10-22-oracle-60-questions-gx10/README.md`
- `/Users/Dabi/Documents/ISN/tvlens/experiments/essais/2026-10-22-oracle-v4-web-outils-gx10/README.md`
- `/Users/Dabi/Documents/ISN/tvlens/experiments/essais/2026-10-21-variantes-gx10/revues/README.md`

## M12 — P1 — Preuves privées : restauration incomplètement documentée

Fichiers :

- `E/2026-10-21-audit-nuit-gx10/README.md`
- `E/2026-10-21-audit-nuit-gx10/constats.json`
- `E/2026-10-21-oracle-medias-gx10/`
- `E/2026-10-22-web-outils-hors-ligne-gx10/bruts/empreintes.txt`

Constat : L’audit historique signale des logs ignorés, des liens cassés et des validations présentes uniquement sur GX10. Les médias et pages intégrales sont volontairement privés. Leur simple absence du dépôt n’est pas une perte démontrée.

- [ ] Produire un inventaire privé de restauration : fichiers, emplacement, taille, empreinte, exclusion publique et copie durable. Vérifier les manques de l’audit un par un ; ne pas supposer qu’ils persistent tous sans contrôle.

Sources :
- `/Users/Dabi/Documents/ISN/tvlens/experiments/essais/2026-10-21-audit-nuit-gx10/README.md`
- `/Users/Dabi/Documents/ISN/tvlens/experiments/essais/2026-10-21-oracle-notation-recherche-gx10/README.md`
- `/Users/Dabi/Documents/ISN/tvlens/experiments/essais/2026-10-22-web-outils-hors-ligne-gx10/README.md`

## M13 — P1 — N5, J5 et premier J5b : traces des interruptions

Fichiers :

- `E/2026-10-22-variantes-nuit-gx10/bruts/n5-gps-sans-resume-journal/`
- `E/2026-10-22-variantes-nuit-gx10/bruts/n5b-gps-sans-resume-journal-reprise/`
- `E/2026-10-22-resume-asynchrone-gx10/README.md`
- `L/launch-j5*.sh`

Constat : N5 a un sceau incomplet avant redémarrage. J5 puis un premier J5b ont été interrompus ; aucun dossier autonome complet de ces tentatives n’a été identifié dans l’index consulté.

- [ ] Relier chaque départ interrompu à son statut, son code, ses sorties partielles et son successeur. Dire explicitement quels fichiers sont absents, conservés seulement à distance ou non produits. Ne pas transformer ces tentatives en campagnes complètes.

Sources :
- `/Users/Dabi/Documents/ISN/tvlens/experiments/essais/2026-10-22-variantes-nuit-gx10/README.md`
- `/Users/Dabi/Documents/ISN/tvlens/experiments/essais/2026-10-22-resume-asynchrone-gx10/README.md`
- `/Users/Dabi/Documents/ISN/tvlens/experiments/essais/README.md`

## M14 — P1 — Passation demandée absente et index incomplet

Fichiers :

- `/Users/Dabi/Documents/ISN/tvlens/experiments/gx10/README.md (absent)`
- `E/README.md`
- `E/2026-10-21-streamingvlm-gx10/README.md`
- `E/2026-10-21-incident-streaming-queue/BILAN.md`

Constat : La passation au chemin demandé n’existe pas. Certaines reprises et certains résultats se trouvent dans des dossiers d’incident, hors de la liste principale. Le README StreamingVLM reste rédigé comme un pré-vol préparé.

- [ ] Créer une passation qui relie préparation, exécutions, reprises, notations, code produit et archives privées. Mettre un lien de clôture dans chaque README initial sans effacer son historique.

Sources :
- `/Users/Dabi/Documents/ISN/tvlens/experiments/essais/README.md`
- `/Users/Dabi/Documents/ISN/tvlens/experiments/essais/2026-10-21-incident-streaming-queue/BILAN.md`
- `/Users/Dabi/Documents/ISN/tvlens/experiments/essais/2026-10-21-audit-nuit-gx10/README.md`

## M15 — P1 — Contrôle de la référence et des pertes initiales

Fichiers :

- `E/2026-10-21-consolidation-gx10/BILAN.md`
- `E/2026-10-21-confirmation-pause-vision-gx10/BILAN.md`
- `E/2026-10-21-analyse-ablation-gx10/README.md`
- `E/2026-10-21-audit-nuit-gx10/README.md`

Constat : Les textes initiaux sous-estiment les réponses Kennedy A sous le seuil et attribuent mal certaines pertes CNRS B2. Le démarrage à froid et le relevé Kennedy partiel faussent la lecture du gain causal.

- [ ] Joindre un erratum renvoyant aux constats d’audit et aux runs complets. Séparer premier appel, régime chaud et passages appariés ; ne pas réimprimer les anciennes interprétations sans réserve.

Sources :
- `/Users/Dabi/Documents/ISN/tvlens/experiments/essais/2026-10-21-audit-nuit-gx10/README.md`
- `/Users/Dabi/Documents/ISN/tvlens/experiments/essais/2026-10-21-analyse-ablation-gx10/README.md`
- `/Users/Dabi/Documents/ISN/tvlens/experiments/essais/2026-10-21-consolidation-gx10/README.md`

## M16 — P2 — Résultats acquis mais non notés par décision

Fichiers :

- `E/2026-10-21-vision-hors-ligne-gx10/README.md`
- `E/2026-10-21-serie-g-gx10/README.md`
- `E/2026-10-22-resume-asynchrone-gx10/README.md`
- `E/2026-10-22-web-outils-hors-ligne-gx10/README.md`

Constat : Qualité absente pour plusieurs bras E3 initiaux, G4, J4/J5b et H1-C. L’absence est souvent volontaire après échec mécanique. E3b possède, lui, une notation.

- [ ] Marquer « non noté : arrêt sur critère mécanique » plutôt que laisser une cellule vide. Ne compléter que les évaluations susceptibles de modifier la décision ; ne pas relancer ces bras pour le dossier.

Sources :
- `/Users/Dabi/Documents/ISN/tvlens/experiments/essais/2026-10-21-vision-hors-ligne-gx10/README.md`
- `/Users/Dabi/Documents/ISN/tvlens/experiments/essais/2026-10-21-serie-g-gx10/README.md`
- `/Users/Dabi/Documents/ISN/tvlens/experiments/essais/2026-10-22-resume-asynchrone-gx10/README.md`
- `/Users/Dabi/Documents/ISN/tvlens/experiments/essais/2026-10-22-web-outils-hors-ligne-gx10/README.md`

## M17 — P2 — Pistes initiales : questions de recherche encore ouvertes

Fichiers :

- `E/2026-10-20-vision-vllm-gx10/README.md`
- `E/2026-10-21-incident-streaming-queue/BILAN.md`
- `E/2026-10-21-shadow-selection-gx10/README.md`

Constat : Qualité non établie pour les piles vLLM/Ollama initiales et StreamingVLM. StreamingVLM n’a pas de mémoire/cache consolidés comme demandé au protocole. Shadow n’a pas de rappel factuel mesuré.

- [ ] Conserver ces pistes comme exploration close ou reportée. Si elles sont reprises plus tard, contrôler longueurs de sortie, précision, cache, mémoire et qualité sur les mêmes médias avant un nouveau classement.

Sources :
- `/Users/Dabi/Documents/ISN/tvlens/experiments/essais/2026-10-20-vision-vllm-gx10/README.md`
- `/Users/Dabi/Documents/ISN/tvlens/experiments/essais/2026-10-21-incident-streaming-queue/BILAN.md`
- `/Users/Dabi/Documents/ISN/tvlens/experiments/essais/2026-10-21-shadow-selection-gx10/README.md`
- `/Users/Dabi/Documents/ISN/tvlens/experiments/essais/2026-10-21-audit-nuit-gx10/README.md`

## M18 — P2 — Web : échecs de preuve et actualité non ventilés

Fichiers :

- `E/2026-10-22-oracle-v4-web-outils-gx10/README.md`
- `L/h4-resultats/calls.jsonl`
- `L/notation-h4/`
- `E/2026-10-22-searxng-gx10/README.md`

Constat : Les sources manquent pour cnrs-m1 et cuisine-w2 dans le corpus figé. Les pages PubMed/Rice échouent. Le diagnostic H4 par étape n’est pas consolidé ; les suspensions amont fragilisent la répétabilité.

- [ ] Classer chaque échec : moteur, page inaccessible, fait absent, mauvais extrait, fait périmé, réponse fautive, source rejetée. Fixer date de référence et preuve pour l’actualité ; conserver les pages privées nécessaires à la reproduction.

Sources :
- `/Users/Dabi/Documents/ISN/tvlens/experiments/essais/2026-10-22-oracle-v4-web-outils-gx10/README.md`
- `/Users/Dabi/Documents/ISN/tvlens/experiments/essais/2026-10-22-web-outils-hors-ligne-gx10/README.md`
- `/Users/Dabi/Documents/ISN/tvlens/experiments/essais/2026-10-22-searxng-gx10/README.md`
- `/private/tmp/claude-501/-Users-Dabi-Documents-ISN-tvlens/10f8a5c3-4f60-484e-82eb-5180ae7c9ba0/scratchpad/labo/astra/plan-courant.md`

## M19 — P2 — Intégration T316 et combinaison finale non prouvées

Fichiers :

- `P/docs/travail/tickets/308-*.md à 315-*.md`
- `Objet Git local de feat/recherche-web-locale : docs/travail/tickets/316-extract-readable-pages-and-bound-local-web-latency.md`
- `L/plan-f1-produit-journal-web-102q.json`

Constat actualisé : T316 est en boucle selon la consigne, mais le ticket local conserve le statut a-faire et aucune livraison terminale n’est disponible. Extraction Readability et budget local de 14 s restent des objectifs. La branche F1 épinglée à cfa0bf8 ne contient pas T316. Les contrôles des autres tickets sont principalement simulés.

- [ ] Après éventuelle implémentation, relever commit, dépendances, contrôles et recette réelle. Ne pas attribuer à F1 des améliorations fusionnées après son départ. Documenter précisément ce qui rejoint main et ce qui reste sur branche.

Sources :
- `/private/tmp/claude-501/-Users-Dabi-Documents-ISN-tvlens/10f8a5c3-4f60-484e-82eb-5180ae7c9ba0/scratchpad/rapport-gx10/source-t316.md`
- `/private/tmp/claude-501/-Users-Dabi-Documents-ISN-tvlens/10f8a5c3-4f60-484e-82eb-5180ae7c9ba0/scratchpad/rapport-gx10/etat-branche.txt`
- `/private/tmp/claude-501/-Users-Dabi-Documents-ISN-tvlens/10f8a5c3-4f60-484e-82eb-5180ae7c9ba0/scratchpad/labo/plan-f1-produit-journal-web-102q.json`
- `/Users/Dabi/Documents/ISN/tvlens-essai-f1/docs/travail/tickets/310-retrieve-and-open-web-pages-through-a-self-hosted-searxng.md`
- `/Users/Dabi/Documents/ISN/tvlens-essai-f1/docs/travail/tickets/315-give-the-model-the-part-of-each-page-that-matches-the-question.md`

## M20 — P2 — Portée produit : O, session longue et transport réel

Fichiers :

- `E/2026-10-22-web-outils-hors-ligne-gx10/README.md`
- `E/2026-10-20-preparation-gx10/README.md`
- `E/2026-10-22-journal-produit-gx10/README.md`

Constat : O reste peu pertinent et sujet aux inventions. Les questions anciennes de J6 échouent encore souvent sur le visuel. Les replays ne mesurent pas capture TV, réseau, affichage, service prolongé ou consommation consolidée.

- [ ] Annoncer clairement le périmètre de démonstration. Garder O comme limite ouverte. Réserver à une campagne ultérieure la recette physique et les mesures de service qui ne sont pas déjà journalisées.

Sources :
- `/Users/Dabi/Documents/ISN/tvlens/experiments/essais/2026-10-22-web-outils-hors-ligne-gx10/README.md`
- `/Users/Dabi/Documents/ISN/tvlens/experiments/essais/2026-10-20-preparation-gx10/README.md`
- `/Users/Dabi/Documents/ISN/tvlens/experiments/essais/2026-10-22-journal-produit-gx10/README.md`
