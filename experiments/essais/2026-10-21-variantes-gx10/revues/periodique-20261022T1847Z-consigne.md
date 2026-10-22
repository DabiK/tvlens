Tu es Codex Astra, regard neuf sur la feuille de route des expériences GX10 de TVLens, appelé toutes les deux heures.
Lecture seule : ne modifie aucun fichier, aucun réseau, aucun SSH. Réponds en français, une page au plus, chiffré.

But du projet : améliorer le rapport pertinence / rapidité des réponses de TVLens sur la GX10 (fenêtre GX10 jusqu'au
23/10), et laisser des chiffres fiables pour le rapport final. Chaque essai ne change qu'une chose et est tracé.

Lis d'abord l'état ci-dessous (file GX10, plan courant, ta revue précédente), puis seulement ce qui est utile parmi :
- registre : /Users/Dabi/Documents/ISN/tvlens/experiments/essais/2026-10-21-variantes-gx10/README.md, CHIFFRES.md, revues/ ;
- dossiers d'essais récents : /Users/Dabi/Documents/ISN/tvlens/experiments/essais/2026-10-2*-*/README.md (et leurs notation/notes.json).

Rends :
1. Dérive : insiste-t-on sur un point qui ne le mérite plus (rendement décroissant, goulot secondaire) ? Que néglige-t-on
   qui pèse plus sur la pertinence ou la vitesse ? Une phrase de diagnostic, puis les preuves chiffrées.
2. Arrêter / continuer / commencer : au plus 3 points chacun, avec le gain attendu et le coût GPU.
3. File GX10 : garder, réordonner ou couper, avec les durées.
4. Ce qui a changé depuis ta revue précédente et si ses conseils ont été suivis ou à raison écartés.
5. Au plus une décision à faire trancher par l'humain, s'il y en a une vraiment.

# État au 20261022T1847Z (UTC)

## GX10 : sessions et files
```
dyn: 1 windows (created Thu Oct 22 16:42:12 2026)
h2b: 1 windows (created Thu Oct 22 18:45:29 2026)
== file-dynamique/file-status.txt
j5b-gps-journal-produit-resume-asynchrone-60q exit 1 18:13:33
j5b arrêté par SIGTERM 18:13:35 : H2 avait échoué au départ (import), H2 passe d'abord
h2 départ 18:13:43 (reprise)
h2 exit 0 18:30:23
j5b-gps-journal-produit-resume-asynchrone-60q-r2 départ 18:30:33 (/home/nvidia/tvlens-j6, 83cddd5)
== file-e2-e3/file-status.txt
e2 exit 0 13:18:36
e3 exit 1 14:18:27
done
== file-g/file-status.txt
g1 exit 0 16:15:00
g3 exit 0 16:30:27
g4 exit 0 17:00:32
g2 exit 0 17:36:56
done-reprise
== file-h1/file-status.txt
h1 départ 15:23:20
h1 exit 0 16:34:28
== file-jour2/file-status.txt
j2 exit 1 10:50:05
j2 reprise départ 10:51:24
j2 reprise exit 0 12:21:18
j3 départ 12:21:25
j3 exit 0 13:51:59
== file-jour3/file-status.txt
j4 départ 13:52:01
j4 exit 0 15:22:55
== file-nuit2/file-status.txt
nuit2 arrêtée (remplacée par file-nuit3, J3bis et J2bis retirés) 16:33:11
j5 départ 16:34:41
j5 exit 1 16:41:48
fin de file 16:41:48
j5 arrêté par SIGTERM à 16:41 UTC (premier passage Kennedy en cours) : J6 passe avant, J5 repris après
j6-gps-sans-resume-journal-produit-60q-results finished dernière étape: artemis-GPSR60P-1
n1-gps-bis-results finished dernière étape: artemis-GPS-1
n2-gps-sans-resume-results finished dernière étape: artemis-GPSR-1
n3-gps-journal-results finished dernière étape: artemis-GPSJ-1
n4-qps-results finished dernière étape: artemis-QPS-1
n5-gps-sans-resume-journal-results boeuf-bourguignon-GPSRJ-1 dernière étape: boeuf-bourguignon-GPSRJ-1
n5b-gps-sans-resume-journal-reprise-results finished dernière étape: artemis-GPSRJ-1
n6-gps-sans-resume-bis-results finished dernière étape: artemis-GPSR-1
96 %
18:47:39
```

## Plan courant (tenu par Claude)
Plan courant (22/10 ~18:55 UTC, mis à jour par Claude à chaque changement de file)

TRI DES ESSAIS (Dabi, 22/10 ~16:35 UTC : « ne pas perdre de temps sur des pistes dont le résultat est prévisible ;
une fois le port de recherche fini, aller là où il y a de la valeur ») :
- flux réel (90 min de GPU) seulement si le changement touche la perception ou le code produit ; les variantes côté
  questions se rejouent hors ligne sur les requêtes capturées ;
- pas de répétition quand trois mesures indépendantes concordent : J3bis et J2bis retirés à 16:33 UTC (journal :
  G2, G5, J3 ; J6 le remesure dans le produit). Correction (revue Astra 16:47) : J5 n'est pas une répétition de J3,
  les replis de résumé peuvent faire perdre des blocs et changer les entrées des questions ;
- un bras qui échoue mécaniquement (erreurs, JSON invalide, boucles) est rapporté par ses compteurs, sans notation à
  l'aveugle (bras C de H1) ;
- une référence imposée par le produit (le mode local refuse le web) ne se rejoue pas dans le flux : F1 sans bras A ;
- outils génériques : paquet.py (paquets à l'aveugle, sources et limites gardées), bilan.py (par bras, par catégorie
  ou âge, test des signes face à une référence), flux de notation à deux juges plus arbitre.

Résultats acquis :
- J6 (journal du produit, T313, 83cddd5) : 40/60 (J3 renoté dans le même paquet 38), 10 inventions, 0 rejet de
  citation (J3 8), anciennes 9/19, 6,2 s, 60/60 sous 15 s, 0 bloc perdu : NOUVELLE MEILLEURE CONFIGURATION, poussée
  (9062d7b).
- H2 (18:13–18:30 UTC) : décision du modèle en 0,65 s médiane, sans erreur ; avec titre W 18/18, M 12/12, O 0/12,
  v3 à tort 3/60, décisions stables 102/102 ; bonne page du corpus 22–23/30 (question brute 21/30). Chiffres et
  prompt envoyés à la session web à ~18:35 UTC : boucle T314 autorisée. Notation des réponses H2 en cours.
- SearXNG : suspendu par Brave, DuckDuckGo et Google CSE après ~80 requêtes en rafale (H2) ; corrigé dans le conteneur
  (bing, yahoo, qwant, mojeek, startpage activés ; default_lang fr-FR ; sauvegarde settings.yml.avant-moteurs-20261022) :
  les requêtes du modèle trouvent les bonnes pages. F1 : pas de rafale (~37 recherches en 90 min).
- H2 noté et poussé (6215309) : réponses avec la requête du modèle (PTQ) 26/60 W/M = H1-B 26 ; W 22/36 (16), M 4/24
  (10), 6 inventions (8). T314 (déclencheur model, requête du modèle seule) en boucle depuis ~18:34 UTC, fin ~19:30–19:45.
- Fusion requête du modèle + question brute (T315 en brouillon) : au niveau des pages, W 32/36 et M 20/24 (modèle 29 et
  16, brute 24 et 18). H2b (réponses avec passages fusionnés, 60 appels) en file juste après J5b (~20:00 UTC).
- Écart produit relevé par la session web : SearXNG et le corpus figé ne gardent que les 2 500 premiers caractères de
  chaque page (H1/H2 prenaient les meilleurs passages). Simulation hors GPU (simuler_fenetres.py) : fait présent dans le
  texte transmis pour 18/27 W/M (début), 23/27 avec début 1 000 + meilleure fenêtre lexicale 1 500 sur 20 000 : ticket
  de suite accepté (avec la fusion si H2b la confirme). F1 sur T314 mesurera la version « début de page » ; F1b ensuite.
- N2 = questions gemma4:26b-a4b + pause vision + Whisper small + vision gemma3:4b sans topicSummary : 21/30
  pertinentes (deux paquets), médiane 5,7 s ; rejoué (N6) : 22/30, 5,2 s, 0 bloc perdu. Confirmé.
- N5 = N2 + journal mémoire : 22/30, 6,8 s ; +4/−3 face à N2, comme N6 : aucun avantage du journal démontré sur 30 q.
- Bruit : rejouer une config fait basculer 7 à 8 questions sur 30 ; renoter les mêmes réponses change 2 statuts sur 30.
- topicSummary ne peut pas être supprimé en produit (cartes de la frise TV) : à calculer hors du chemin critique.
- Oracle v3 : 60 questions, dont 27 qui testent la mémoire (19 entièrement anciennes, 8 mixtes).
- G5 noté : journal complet B 49/60 (sans journal 45), inventions 7 (13), mémoire 10/12 (4/12), +1,3 s ; D et E écartés.
- Audit des juges par Astra : 46/51 statuts identiques (90 %).
- J3 (N2 + journal, 60 q) : 38/60 contre 28/60 (J2), inventions 9 contre 16, anciennes 6/19 contre 0/19, récentes 25/33 =,
  +1,3 s, 60/60 sous 15 s : nouvelle meilleure configuration (critères Astra remplis).
- Tout est committé et poussé jusqu'à J2/J3 (097807b).

File GX10 :
1–2. J2 et J3 faits et notés (voir résultats).
3. J4 (J2 + topicSummary asynchrone par le proxy, 60 questions) — en cours depuis 13:52 UTC ; critères : surcoût
   médian ≤ 1 s face à J2, 0 bloc perdu, ≥ 18/20 résumés fidèles.
4. File dynamique sur la GX10 (tmux dyn, file-dynamique/file-dynamique.txt : une ligne par essai, prise à la fin
   du précédent ; remplace nuit2 et nuit3) :
   - J5 lancé 16:34, arrêté par SIGTERM 16:41 (Kennedy en cours) pour passer J6 d'abord ;
   - J6 = J2 + journal du produit (T313, 83cddd5, checkout /home/nvidia/tvlens-j6, sans réécriture questions) —
     en cours depuis 16:42, fin ~18:15 ; critères : rejets ≤ 2 (J3 8), pertinentes ≥ 38/60, inventions ≤ 9, 60/60
     sous 15 s ;
   - H2 fait (premier départ raté sur une erreur d'import à 18:12, J5b arrêté 1 min, H2 relancé 18:13–18:30) ;
   - J5b-r2 en cours depuis 18:30 UTC, fin ~20:00 ;
   - F1 après T311 + T314, inséré dans la file après H2 ;
   - J5b = J6 + résumé asynchrone seul (revue Astra 16:47 : isoler son effet sur la base de J6) ; critères : 0 bloc
     perdu, surcoût ≤ 1 s face à J6, ≥ 18/20 résumés fidèles, pertinence ≥ J6 − 3.
   Diagnostic J3 (corrigé) : les 13 échecs anciens ont le fait dans le journal ; 7 sont des réponses REJETÉES par la
   validation des citations (passages du journal injectés par le proxy, absents des preuves de DeepAsk), 4 abstentions
   sur faits visuels, 2 inventions. J3 sous-estime le journal ; T313 rend les entrées citables : essai J6 sur le sha
   T313 (journal produit, sans réécriture du proxy) dès qu'il est intégré.
5. J1 (GPSV sans topicSummary) — reporté ; nouvelles variantes de modèles ou de deux phases : arrêtées.

ÉCHÉANCE : vendredi 23/10 est le dernier jour (résultat du hackathon samedi), GX10 jusqu'à vendredi soir sans heure
fixée (Dabi : « ne prends pas ça en compte, va au plus vite »).
PRIORITÉ DABI jusqu'à la fin de la fenêtre GX10 (22/10, ~12:40 UTC) : catégorie « connaissance extérieure et outils »,
jugée très nécessaire. Le benchmark ne mesurait que des réponses tirées de la vidéo. Étapes et durées :
a. Oracle v4 (Mac, sans GPU) : par vidéo W 2–3 (web, ≥1 stable, ≥1 actualité datée), M 2 (vidéo + extérieur),
   O 2 (relecture d'images anciennes, inspect_clip), poses = instants existants — FAIT : 42 questions (18 W dont 7
   actualité, 12 M, 12 O), corpus 51/54 pages, committé 58685cb.
b. Essai hors ligne H1 — FAIT, NOTÉ, POUSSÉ (d8e6390) : A 0/60, A2 3/60, B 26/60 (W 16/36, M 10/24), 8 inventions
   (A 2 ; 5 pièges d'actualité), +1,5 s ; O : O0 0/24, OJ 0/24, OI 4/24 avec 10 inventions.
   Bras C (outil search_web en deux temps) écarté sur compteurs : 3 erreurs (répétition), 12 réponses > 60 s, 13
   sans appel d'outil, 4 réponses sourcées sur 60. Rappel de la récupération de B : une source de l'oracle dans les
   3 passages pour 21 questions W/M sur 30. Prévu à l'origine : W/M bras A, A2, B, C ; O bras O0, OJ, OI ;
   ~420 appels, ~40 min. Critère : B ≥ +5 W/M
   pertinentes face à A, sans hausse des inventions, < 3 s de plus.
c. Produit : session recherche-web-locale (branche feat/recherche-web-locale) : T308, T309 intégrés (c7ad6fa,
   l'agent Ollama répond depuis les pages récupérées, sources validées, ADR) ; T310 (adaptateur) en boucle ; T311
   ensuite, dernier requis ; T312 facultatif. Session journal-memoire-produit (feat/journal-memoire-local) : T313 en
   boucle. Les deux boucles tournent en même temps sur le Mac (swap presque plein) : risque pour les contrôles ; puis ticket unique (skill ticket, worktree frère) ou découpage + boucle sur sa
   branche. Port de recherche + adaptateur corpus + adaptateur web ; récupération avant la réponse injectée au
   contexte ; l'adaptateur Ollama accepte une réponse extérieure si ses sources viennent de la recherche. Moteur réel :
   SearXNG sur la GX10 (décision de Dabi, installé à 12:41 UTC, 127.0.0.1:8888, 3 s par requête).
d. Flux réel F1 : un seul bras avec recherche (SearXNG) sur les 102 questions (60 v3 + 42 W/M/O), ~100 min. La
   référence sans recherche est connue (refus du mode local, H1-A) ; les 60 v3 mesurent les déclenchements à tort
   face à la référence. Revue Astra 16:47 : F1 sur la même base que J6 + recherche, pour isoler la recherche face à
   J6 et mesurer le produit complet en un passage. DÉCISION DE DABI (22/10 ~17:20 UTC) : F1 sur une branche d'essai
   qui fusionne feat/journal-memoire-local et feat/recherche-web-locale, jamais main. Worktree frère
   ../tvlens-essai-f1, branche essai/f1-journal-web : fusion d'essai à T310 = 300f058 (conflits de doc et de
   baseline.json seulement, 220 tests ciblés verts, contrôle complet non lancé) ; à refusionner avec T311 et T314.
   Session web prévenue pour T314 (déclencheur « model » + requête du modèle + dater les faits), boucle après H2. T311 en boucle depuis
   16:38 UTC (chaîné par la boucle).
   BLOCAGE PRÉVISIBLE DE F1 (calculé hors GPU, 16:58 UTC) : le déclencheur auto du produit (callsForWeb, règle de
   mots-clés) ne lance la recherche que sur 8 W/M sur 30 (7 W, 1 M), 0 O, et 2 v3 sur 60 à tort ; la requête est la
   question brute. Les 9 W/M où H1-B rate la source : 7 désignent leur sujet sans le nommer (« ce film », « cette
   mission », « cette nuit-là »), 1 PubMed bloqué, 1 voisin. F1 en auto plafonnerait donc vers 8/30 : ne pas le
   lancer tel quel. Suite : H2 hors ligne (~25 min GPU après J6, script rejouer_h2.py prêt, testé à blanc) — le modèle décide de la recherche et écrit une
   requête autonome (champ du schéma de réponse puis second appel avec les pages, ou pré-appel court) ; puis ticket
   T314 sur la branche web ; F1 après T311 + T314. File : J6 → J5b → H2 → F1.
H1 : B récupère par plongements (qwen3-embedding, morceaux de 1 200 car.) sur tout le corpus (pas d'extraits présélectionnés) ; A/B même schéma et mêmes
règles ; B/C même corpus et même récupération ; pas de relance systématique en deux phases.
Ne doit pas retarder J3 ni J4. Revue Astra : proposer un découpage chiffré du temps GPU restant.

Règle de fin de phase (Dabi, 22/10) : quand un essai est clos, noté et consigné, compresser ses bruts (gzip -n),
lancer check --changed, committer seulement les dossiers d'essais et le registre, puis pousser main.

## Revue précédente
**1. Dérive — le risque principal est désormais de perdre de la perception ou des réponses à la validation ; gagner encore sur la génération est secondaire.**

- **J4 échoue** : **106 blocs vision perdus**, médiane **6,3 s contre 5,0 s** pour J2, malgré **60/60 réponses sous 15 s**. Les résumés prennent **4,9 s** chacun : « asynchrone » ne supprime pas la concurrence GPU. [Essai J4](/Users/Dabi/Documents/ISN/tvlens/experiments/essais/2026-10-22-resume-asynchrone-gx10/README.md)
- **J6 vise le bon problème** : parmi les **13 échecs anciens de J3**, **7 rejets de citations**, **4 abstentions visuelles**, **2 inventions**. Les 7 rejets sont un potentiel à vérifier, pas 7 bonnes réponses garanties. [Diagnostic J3](/Users/Dabi/Documents/ISN/tvlens/experiments/essais/2026-10-22-flux-60-questions-gx10/README.md)
- Recherche : selon l’état fourni, H1-B retrouve une source attendue dans le top 3 pour **21/30 W/M**. Les **9 restantes** méritent une analyse avant toute nouvelle variante. Les **28/30** précédents mesuraient la disponibilité dans le corpus, pas cette récupération.

**2. Arrêter / continuer / commencer**

| Action | Gain recherché ou économie | Occupation GX10 |
|---|---|---:|
| **Arrêter** J3bis/J2bis, nouveaux modèles et relance H1-C | ≈180 min économisées sur les répétitions ; C : seulement 4/60 réponses sourcées | 0 |
| **Continuer** J6 | Mesurer les réponses réellement récupérées grâce aux citations produit ; surveiller les blocs perdus | ≈85 min restantes |
| **Continuer** notation H1 et diagnostic des 9 récupérations manquées | Décider sur A2/B ; objectif ≥+5/30 pertinentes, inventions non accrues, surcoût <3 s | 0 GPU GX10 |
| **Commencer** F1, produit prêt | Valider recherche réelle, citations et déclenchements intempestifs sur les 60 questions vidéo | ≈100 min |
| **Continuer** J5, après F1 si celui-ci est prêt | Objectifs : zéro bloc perdu, ≥18/20 résumés fidèles ; pertinence préservée | ≈90 min |

**J5 n’est pas une répétition de J3** : même avec les mêmes questions, les résumés peuvent changer les blocs perçus et donc les entrées des réponses. Pour isoler leur effet avec le journal produit, figer J5 sur la même configuration que J6, résumés seuls en différence.

**3. File recommandée : J6 → F1 → J5 ; couper les répétitions retirées.**

| Depuis 16:47 UTC | Durée | Fin indicative |
|---|---:|---:|
| J6 restant | 85 min | 18:12 |
| F1, même base que J6 + recherche | 100 min | 19:52 |
| J5, même base que J6 + résumés | 90 min | 21:22 |
| Marge incidents | 30 min | **21:52** |

Total : **5 h 05**, hors intégration et notation ; occupation estimée, pas calcul GPU mesuré. Si F1 n’est pas prêt à 18:12, inverser F1/J5. Ne plus fusionner J6 et F1 : J6 est lancé et fournit une référence utile pour isoler la recherche.

**4. Depuis la revue précédente.** Diagnostic mémoire suivi, J4 clos négatif, H1 terminé en **71 min**, J6 correctement priorisé. Mon F1 A/B de **180 min** a été écarté à raison pour éviter de remesurer le refus web imposé ; le passage unique reste une validation produit, pas une comparaison contrôlée complète. Les répétitions supprimées économisent **180 min**, sans démontrer la reproductibilité exacte de J3. Le registre est en retard : il annonce encore H1 et les répétitions en file. H1/J6 restent sans résultat noté vérifiable dans les fichiers locaux consultés.

**5. Aucune décision humaine nécessaire.** La consigne « aller au plus vite » répond déjà à ma précédente question sur l’heure de fermeture.

Lecture seule respectée : aucune modification, aucun réseau, aucun SSH.
