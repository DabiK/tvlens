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

# État au 20261023T0447Z (UTC)

## GX10 : sessions et files
```
dyn: 1 windows (created Thu Oct 22 16:42:12 2026)
== file-dynamique/file-status.txt
f1 bloqué à 21:20:14 par OTHER_WORKLOAD_ACTIVE : la garde a vu ma commande ssh (chemin du lanceur dans sa ligne) ; relance sous -r2
f1-produit-journal-web-102q-r2 départ 21:21:44 (/home/nvidia/tvlens-f1, cfa0bf8)
f1-produit-journal-web-102q-r2 exit 0 22:52:22
h4b départ 23:01:35
h4b exit 0 23:05:38
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
0 %
04:47:20
```

## Plan courant (tenu par Claude)
Plan courant (23/10 ~02:30 UTC ; mis à jour par Claude à chaque changement)

FAIT DEPUIS 00:40 : décisions de Dabi appliquées — échéance web 14 s → 30 s (ADR 0068 amendée) et journal mémoire T313
intégré sur main (ADR 0064 → 0072) ; deux relectures (4 mineurs corrigés), check complet vert (3 274 JS, 71 Python) ;
origin/main = dd945a5 (web T308–T318 + journal + 30 s). Les branches feat/recherche-web-locale et
feat/journal-memoire-local sont dépassées. Rien n'est mesuré en flux réel après F1 (GX10 hors fenêtre).
Réserve : commentaire de SLOW_ANSWER_MS (test) cite encore 12,6 s.
Revue 02:47 appliquée (01acddf) : F1 = « aucune baisse observée », pas « non-régression » ; journal, titre et 30 s notés
« sur main, non remesurés en flux » ; 30 s = marge produit (max mesuré 16,6 s). Quota Codex 73 % (stop du cron à 90 %).
Reste possible sans GPU : attribuer les 10 échecs H4 restants (sur 16).

FAIT DEPUIS 22:45 (poussé : ff604ff, 960a774, 6b140b7) :
- F1 noté : vidéo 44/60 (J6 39 même paquet), 7 inventions (11) ; W 8/18, M 5/12, O 0/12 ; question W 12,2 s (temps
  propre), 5 W/M sur 30 au-delà de 14 s ; 13 blocs perdus.
- H4b : mêmes requêtes que F1, pages de la requête écrite AVEC le titre : W 14/18 (F1 8), M 7/11 (5), 2 inventions (5),
  +8/−0 (p ≈ 0,008) : le titre est le levier principal du web.
- Rapport final PDF v5 par Astra (relecture adverse Opus), commité dans 2026-10-21-variantes-gx10/rapport/.
- T318 « titre de la source » (décision de Dabi : sous-agents au lieu de la boucle, puis intégration sur main sans sa
  validation finale) : relecture 2 acceptée, check complet vert (3 204 tests) ; branche web T308–T318 rebasée sur main
  (ADR web 0066 renumérotée 0070 : main a pris 0066 pour la livraison) ; check complet vert (3 233 tests) ; poussé :
  origin/main = 41ac522. Le checkout principal, sale (travail non commité d'une autre session), reste en retard de 22. Journal mémoire (T313, autre branche) non intégré sans accord de Dabi.
- Question ouverte posée à Dabi : échéance web de 14 s → 20 s ? (F1 : 3 W sur 18 au-delà de 14 s).
GX10 : plus de créneau prévu (fin de fenêtre ; revue Astra 01:03 : budget GPU 0). Quota Codex 58 % (rapports Astra).
Revue 01:03 appliquée : CHIFFRES remis à jour ; bilan échéance : 5 W/M > 14 s dont 2 pertinentes perdues à 14 s.

FAIT DEPUIS 21:10 (tout poussé, 43bed1b) :
- H4 noté (vraies pages, 30 W/M) : début de page 14/30 (W 12/18, M 2/12, 3 inv.) = fenêtre T315 14/30 (6 inv.) >
  fusion 12 > BM25 10 > plongements 8 : la version simple suffit.
- H2b noté (corpus figé) : fenêtre 29/60 > début 24 > fusion 21 : fusion abandonnée.
- C1 local contre Codex (gpt-6-luna effort faible, web live, mêmes contextes, même paquet de notation) : vidéo Codex
  42/60 contre local J6 38/60 ; W 11/18 contre 12/18 ; M 4/12 contre 2/12 ; inventions 7 contre 12 (vidéo), 2 contre 6
  (W+M) ; Codex 5,5 s (vidéo) et 10,8 s (W/M). Quota Codex consommé < 1 % (plafond fixé par Dabi : 20 % absolu).
- Avis Astra « usine à gaz » : principe proportionné, extraction HTML sur-construite → T316 (Readability + échéance
  14 s) intégré 0ecee6a ; effet de bord : l'échéance vise toutes les questions de chat → ticket demandé pour ne borner
  que les questions qui cherchent.
- Rapport consolidé PDF par Astra : v4 (5 pages + annexes) après relecture adverse d'Opus ; F1 à ajouter.
Revue Astra 22:47 appliquée (ff604ff) : lecture de C1 tempérée (délai local web = somme de médianes, renotations
séparées par paquet) ; F1b abandonné ; pas de nouveau créneau GPU avant notation de F1 et diagnostic des échecs W/M
(sous-agent en cours : causes des 16 échecs H4-V0 dont ~10 M, et des questions d'actualité). Quota Codex 9 %.
EN COURS : F1 (produit complet journal + web, cfa0bf8 sans T316, 102 questions) depuis 21:21 UTC, dernière vidéo
(Artemis) depuis 22:17, fin ~23:00.

NOUVELLE PRIORITÉ DE DABI (22/10 ~20:15 UTC) : « optimiser les recherches sur internet ; mettre de côté tout ce qui est
autour, on a déjà assez de chiffres ». Conséquences : F1 retenu hors file à 20:17 (une seule passe, avec la meilleure
configuration) ; H3, G6, répétition finale, J5c abandonnés ; J5b noté négatif sans notation de pertinence (8,1 s
contre 6,2 ; 14 blocs perdus). Réponses à Dabi : 2–4 lignes, très simples.
EN COURS : H4 = banc sur le vrai web. Cache (cache_web.cjs) : l'adaptateur SearXNG du produit ouvre les pages de la
requête du modèle (H2, bras P, sans titre) et de la question brute, texte gardé en entier (~59 recherches, une toutes
les 8 s). Variantes de texte transmis, 30 W/M, 1 passage : V0 début 2 500 (produit avant T315) ; V1 début 1 000 +
fenêtre 1 500 (T315) ; V2 fusion des deux recherches + fenêtre ; V3 5 meilleurs passages BM25 sur 10 pages ; V4 mêmes
passages par plongements qwen3-embedding. Puis notation à l'aveugle. H2b (FQ, PH, PW sur corpus figé) en notation.
T315 intégré (1d656ec, a314d48 : ADR renumérotées 0066/0067) et fusionné sur la branche d'essai : cfa0bf8, 260 tests.
Revue Astra 20:58 appliquée : H4 garde la référence SANS titre (H2-P, 29/30 déclenchées, PQ 21/58) et les 30 questions
au dénominateur ; V0/V1 isolent la fenêtre, V1/V2 la fusion, V3/V4 le classement (mêmes pages, découpage et budget),
V2/V3 n'est qu'une comparaison de configurations ; un passage sert à CHOISIR, pas à prouver. Après notation :
diagnostic des échecs sans GPU (page absente, fait absent de la page, mauvais extrait, réponse fautive ; 7 questions
d'actualité) et coût complet par variante (recherche + ouverture mesurées par le cache, plongements de V4 à chiffrer).
File : H4 → choix noté → une seule passe F1 (meilleure configuration intégrée, 102 questions) ; F1b supprimé.
J5b consigné et poussé (bbad514).

ÉCHÉANCE : vendredi 23/10 est le dernier jour (résultat du hackathon samedi), GX10 jusqu'à vendredi soir.
PRIORITÉ DABI jusqu'à la fin de la fenêtre GX10 : catégorie « connaissance extérieure et outils » (W web, M vidéo +
extérieur, O relecture d'images), jugée très nécessaire.
TRI DES ESSAIS (Dabi, 22/10 ~16:35 UTC) : pas de temps sur les pistes au résultat prévisible ; flux réel seulement pour
la perception ou le code produit ; variantes côté questions hors ligne ; pas de répétition quand trois mesures
concordent ; un bras qui échoue mécaniquement n'est pas noté ; ne plus interrompre un essai en cours (revue 18:47).
Règle de fin de phase : bruts gzip -n, check --changed, commit des dossiers d'essais et du registre, push main.

Acquis (tout poussé, dernier commit 6215309) :
- Meilleure configuration : N2 + journal mémoire du produit (J6, T313 83cddd5) : 40/60, 10 inventions, 0 rejet de
  citation, 6,2 s, 60/60 sous 15 s, 0 bloc perdu. Face à J3 (journal du proxy, renoté 38) : +9/−7, p ≈ 0,80 :
  référence opérationnelle, pas une victoire statistique. 10 questions anciennes sur 19 restent ratées (faits visuels).
- H1 : pages injectées (3 passages) W/M 0 → 26/60, +1,5 s ; 8 inventions (5 pièges d'actualité) ; outil en deux
  temps écarté (boucles) ; O : inspect_clip 4/24 avec 10 inventions.
- H2 : décision par le modèle, 0,65 s ; avec titre W 18/18, M 12/12, O 0/12, v3 3/60 à tort, stable 102/102 ; réponses
  avec sa requête 26/60 (W 22/36 contre 16, M 4/24 contre 10, 6 inventions contre 8).
- Récupération (hors GPU) : fusion requête du modèle + question brute → bonne page W 32/36, M 20/24 (modèle seul 29 et
  16). Texte transmis : le produit garde le début de page (2 500 car.) ; le fait y est pour 18/27 W/M, pour 23/27 avec
  début 1 000 + meilleure fenêtre lexicale 1 500 sur 20 000 (simuler_fenetres.py).
- SearXNG réparé à 18:33 UTC après suspension par Brave/DuckDuckGo/Google (rafale de H2) : bing, yahoo, qwant, mojeek,
  startpage, fr-FR. F1 : pas de rafale.

Produit (session recherche-web-locale, branche feat/recherche-web-locale, tête 8c2fd8f) :
- T308–T311 intégrés (b8e4241) ; T312 abandonné (Dabi) ; T314 (déclencheur model, requête du modèle) en boucle depuis
  ~18:34 UTC, fin ~19:30–19:45 ; T315 (début + fenêtre lexicale, + fusion si H2b la confirme) prêt, lancé après T314.
- Branche d'essai essai/f1-journal-web (décision de Dabi : journal + web, jamais main), worktree ../tvlens-essai-f1 :
  bcc303f = T313 + T311 ; 227 tests ciblés verts ; checkout GX10 /home/nvidia/tvlens-f1 prêt (à avancer sur T314).

File GX10 (dynamique, tmux dyn ; lanceurs tmux h2b) :
1. J5b-r2 = J6 + topicSummary asynchrone, en cours depuis 18:30 UTC, fin ~20:00 ; ne pas interrompre. Critères :
   0 bloc perdu, ≤ 7,2 s, ≥ 37/60, ≥ 18/20 résumés fidèles.
2. H2b (~17 min, hors ligne) : FQ = passages fusionnés ; PH = 3 pages du produit, début 2 500 car. ; PW = mêmes pages,
   début 1 000 + fenêtre 1 500. Isole fusion (FQ face à PTQ) et choix du texte (PW face à PH).
3. F1 EN FILE (file-h2/apres-h2b.txt, départ ~20:20 UTC) : branche d'essai df5da95 = T313 + T311 + T314 (05c1592),
   243 tests ciblés verts ; checkout /home/nvidia/tvlens-f1 ; plan plan-f1-produit-journal-web-102q.json (trigger
   model, SearXNG, empreintes du code web dans le plan) ; 102 questions, ~100 min ; v3 comparées à J6 ; version
   « début de page ». T315 (fenêtres) en boucle côté web.
4. F1b CONDITIONNEL (revue 18:47) : seulement si H2b montre un gain net de PW et/ou FQ et si T315 est intégré ; c'est
   alors une validation finale combinée, présentée comme telle.
À protéger : régression des M ; titre de la source connu ou non par l'hôte réel (le rejeu n'en a pas : F1 ≈ bras P) ;
écart entre meilleurs passages hors ligne et début de page du produit.

Écartés : J3bis, J2bis (répétitions), J1 et nouveaux modèles, H1-C (outil en deux temps). Non lancée : sonde vidéo brute
qwen3-vl (sans audio, résultat prévisible ; proposée à Dabi, sans réponse). Recherche inversée d'image (étude de
faisabilité par un agent, 22/10 ~19:15 UTC) : 0 question sur 102 en profiterait ; visages exclus (RGPD art. 9, AI Act) ;
lieux en local à la demande plus tard, sur un jeu dédié ; rien avant vendredi.

## Revue précédente
**1. Dérive — l’arrêt des variantes est justifié ; le risque principal devient de présenter le produit intégré comme mesuré, alors que l’attente et les pertes vidéo restent ouvertes.**

- **Titre : 13/29 → 21/29 pertinentes**, soit **+27,6 points**, inventions **5 → 2**. C’est le meilleur levier web observé, mais sur un rejeu avec titres connus, couverture **29/30**, pas sur le produit final. [H4b](/Users/Dabi/Documents/ISN/tvlens/experiments/essais/2026-10-22-web-reel-texte-gx10/README.md:51)
- **Extraction : 14/30** avec début seul ou fenêtre ; fusion **12**, BM25 **10**, plongements **8**. Aucun motif de poursuivre cette sophistication. [H4](/Users/Dabi/Documents/ISN/tvlens/experiments/essais/2026-10-22-web-reel-texte-gx10/README.md:27)
- **Flux réel : 13 blocs perdus contre 0**, vidéo **7,6 contre 6,2 s**. Les **44/60 contre 39/60**, p ≈ **0,23**, ne prouvent pas la non-régression affirmée dans le README. Avec attente, **12/30 W/M dépassent 20 s** dans ce scénario de questions enchaînées. [F1](/Users/Dabi/Documents/ISN/tvlens/experiments/essais/2026-10-22-produit-complet-web-gx10/README.md)

**2. Arrêter / continuer / commencer**

| Action | Gain attendu ou objectif | GPU |
|---|---|---:|
| **Arrêter** fusion, classement, nouveaux modèles et répétition finale | Aucun gain supplémentaire établi ; ≈ **100 min** économisées par répétition évitée | **0 min** |
| **Continuer** la voie simple avec titre réellement disponible | Signal **+8/29** ; transfert au produit encore non mesuré | **0 min** |
| **Continuer** la séparation des configurations et paquets de notation | Ne pas attribuer à la version finale les résultats combinés de F1 et H4b | **0 min** |
| **Commencer** la clôture des causes d’échec depuis les traces | **10/16** échecs H4 restent sans attribution systématique ; gain de pertinence inconnu | **0 min** |
| **Commencer** une dernière passe de cohérence documentaire | Corriger « journal pas sur main », « titre à faire » et « ne dégrade pas » | **0 min** |

**3. File GX10 — garder vide.** F1 terminé en **90 min 38 s**, H4b en **4 min 03 s**. Couper toute ancienne entrée résiduelle ; **budget supplémentaire : 0 min**. Le **0 %** fourni est un instantané, pas une vérification distante effectuée ici.

**4. Depuis 01:03.** Le bilan demandé est fait : **14 s aurait supprimé 2 réponses pertinentes sur 30 W/M**. CHIFFRES a été actualisé, mais conserve des statuts périmés. Le diagnostic H4 reste partiel.

Selon le plan fourni, journal et web sont maintenant intégrés, avec **3 274 tests JS + 71 Python** verts ; cela ne constitue pas une mesure en flux réel. Dabi a choisi **30 s**, plutôt que les **20 s** recommandées : décision applicable, mais **aucun gain additionnel observé entre 20 et 30 s** dans F1, dont le maximum propre est **16,6 s**. Les **10 s supplémentaires de plafond** sont une marge produit, pas un optimum démontré. [Bilan](/Users/Dabi/Documents/ISN/tvlens/experiments/essais/2026-10-21-variantes-gx10/CHIFFRES.md:47)

**5. Décision humaine : aucune nouvelle.** Conserver le choix des 30 s et expliciter ses limites dans le rapport.

Lecture seule respectée : aucun fichier modifié, aucun réseau, aucun SSH.
