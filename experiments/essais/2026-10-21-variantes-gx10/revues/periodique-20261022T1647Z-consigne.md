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

# État au 20261022T1647Z (UTC)

## GX10 : sessions et files
```
dyn: 1 windows (created Thu Oct 22 16:42:12 2026)
== file-dynamique/file-status.txt
j6-gps-sans-resume-journal-produit-60q départ 16:42:12 (/home/nvidia/tvlens-j6, 83cddd5)
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
j6-gps-sans-resume-journal-produit-60q-results kennedy-GPSR60P-1 dernière étape: kennedy-GPSR60P-1
n1-gps-bis-results finished dernière étape: artemis-GPS-1
n2-gps-sans-resume-results finished dernière étape: artemis-GPSR-1
n3-gps-journal-results finished dernière étape: artemis-GPSJ-1
n4-qps-results finished dernière étape: artemis-QPS-1
n5-gps-sans-resume-journal-results boeuf-bourguignon-GPSRJ-1 dernière étape: boeuf-bourguignon-GPSRJ-1
n5b-gps-sans-resume-journal-reprise-results finished dernière étape: artemis-GPSRJ-1
n6-gps-sans-resume-bis-results finished dernière étape: artemis-GPSR-1
50 %
16:47:06
```

## Plan courant (tenu par Claude)
Plan courant (22/10 ~16:45 UTC, mis à jour par Claude à chaque changement de file)

TRI DES ESSAIS (Dabi, 22/10 ~16:35 UTC : « ne pas perdre de temps sur des pistes dont le résultat est prévisible ;
une fois le port de recherche fini, aller là où il y a de la valeur ») :
- flux réel (90 min de GPU) seulement si le changement touche la perception ou le code produit ; les variantes côté
  questions se rejouent hors ligne sur les requêtes capturées ;
- pas de répétition quand trois mesures indépendantes concordent : J3bis et J2bis retirés à 16:33 UTC (journal :
  G2, G5, J3 ; J5 rejoue J3 côté questions, mêmes entrées) ;
- un bras qui échoue mécaniquement (erreurs, JSON invalide, boucles) est rapporté par ses compteurs, sans notation à
  l'aveugle (bras C de H1) ;
- une référence imposée par le produit (le mode local refuse le web) ne se rejoue pas dans le flux : F1 sans bras A ;
- outils génériques : paquet.py (paquets à l'aveugle, sources et limites gardées), bilan.py (par bras, par catégorie
  ou âge, test des signes face à une référence), flux de notation à deux juges plus arbitre.

Résultats acquis :
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
4. File du soir, tmux nuit3 sur la GX10 (remplace nuit2) : après H1, J5 seul = J3 + résumé asynchrone replié tous
   les 4 blocs, ~16:35–18:05 UTC ; J5 vaut aussi répétition de J3 côté questions. Ensuite le GPU reste libre pour
   J6 et F1.
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
b. Essai hors ligne H1 — FAIT 15:23–16:34 UTC, sceaux conformes, notation en cours (A, A2, B ; O0, OJ, OI).
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
   face à J3. Si T313 est intégré aussi : F1 et J6 en un seul passage sur une branche d'essai qui fusionne les deux
   (jamais main), sous réserve de l'accord de Dabi. T311 demandé à la session web à 16:33 UTC.
H1 : B récupère par plongements (qwen3-embedding, morceaux de 1 200 car.) sur tout le corpus (pas d'extraits présélectionnés) ; A/B même schéma et mêmes
règles ; B/C même corpus et même récupération ; pas de relance systématique en deux phases.
Ne doit pas retarder J3 ni J4. Revue Astra : proposer un découpage chiffré du temps GPU restant.

Règle de fin de phase (Dabi, 22/10) : quand un essai est clos, noté et consigné, compresser ses bruts (gzip -n),
lancer check --changed, committer seulement les dossiers d'essais et le registre, puis pousser main.

## Revue précédente
**1. Dérive — la priorité est désormais la pertinence réellement livrée ; optimiser encore la vitesse avant de valider mémoire, recherche et résumés ensemble aurait un rendement faible.**

- J3 : **38/60 pertinentes contre 28/60** (+16,7 points), **9 inventions contre 16**, médiane **6,3 contre 5,0 s**, toujours **60/60 sous 15 s**.
- Mais **13/19 questions entièrement anciennes restent en échec**, et **7 blocs vision sont perdus sur CNRS**, contre zéro dans J2. Les récentes restent à **25/33**, avec **5 gains et 5 pertes** : stabilité du total, pas des réponses.
- **J4 teste les résumés sans journal** : même réussi, il ne validera pas leur combinaison avec J3. C’est le principal trou de validation produit. [Résultats et configurations](/Users/Dabi/Documents/ISN/tvlens/experiments/essais/2026-10-21-variantes-gx10/CHIFFRES.md)

**2. Arrêter / continuer / commencer.** Les gains ci-dessous sont des objectifs, pas des prévisions.

| Action | Gain recherché / justification | Budget GX10 |
|---|---|---:|
| **Arrêter** J1, nouveaux modèles et variantes D/E | Préserver la fenêtre ; J1 économise ≈90 min | 0 |
| **Continuer** J4 puis H1 | J4 : ≤+1 s, zéro bloc perdu, ≥18/20 résumés fidèles. H1 : ≥+5/30 W/M, inventions non accrues | ≈35 + 40–60 min |
| **Continuer** l’analyse locale des 13 échecs anciens et des 7 blocs perdus | Distinguer fait absent du journal, tronqué ou mal exploité avant une nouvelle variante | 0 min |
| **Commencer** F1 A/B sur une configuration commune figée | Mesurer l’apport de la recherche seule, récupération et citations acceptées incluses | 180 min |
| **Commencer**, en réserve, J3 + résumés asynchrones sur v3 | Vérifier que les **38/60** et la cadence survivent à la combinaison | ≈90 min |

Pour H1, utiliser **A2/B** pour isoler l’apport des pages si A2 seul autorise déjà les connaissances extérieures ; **A/B** mesure alors le changement global. Garder **B/C** et **OJ/OI** comme comparaisons distinctes.

**3. File GX10 — garder J4 → H1 → F1 ; remplacer la répétition J3 seule par la validation combinée.**

| Depuis 14:47 UTC | Durée estimée | Fin indicative |
|---|---:|---:|
| J4 restant | ≈35 min | 15:22 |
| H1 | 40–60 min | 16:02–16:22 |
| F1 A/B, produit prêt et H1 concluant | 180 min | 19:02–19:22 |
| Réserve : J3 + résumés asynchrones | 90 min | 20:32–20:52 |
| Marge incidents | 30 min | **21:02–21:22** |

Soit **4 h 15–4 h 35 principales**, puis **2 h de réserve et marge**. Hors intégration et notation. Ce sont des durées d’occupation GX10, pas du calcul GPU mesuré. Si le produit tarde, avancer la réserve après H1.

**4. Depuis 12:37.** Les conseils principaux ont été suivis : J3 terminé et noté, J4 lancé, variantes secondaires arrêtées, F1 porté à **180 min**. Le journal franchit les critères proposés, mais sur **un seul passage par configuration**. L’oracle W/M/O apporte **42 questions**, avec source retrouvée pour **28/30 W/M** ; aucun résultat H1 acquis. [Oracle v4](/Users/Dabi/Documents/ISN/tvlens/experiments/essais/2026-10-22-oracle-v4-web-outils-gx10/README.md)

Une divergence documentaire reste à résoudre avant interprétation : le plan fourni annonce **BM25**, le registre mentionne encore **qwen3-embedding**. Le manifeste exécuté devra trancher. Les **3 s SearXNG** proviennent d’une requête de test et ne garantissent pas le budget complet de recherche.

**5. Décision humaine :** quelle est l’heure exacte de fermeture GX10 le **23/10** ? Elle détermine la possibilité d’une répétition comparative supplémentaire de **180 min**.

Lecture seule respectée : aucun fichier modifié, aucun réseau ni SSH utilisé.
