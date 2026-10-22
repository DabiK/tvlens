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

# État au 20261022T2058Z (UTC)

## GX10 : sessions et files
```
dyn: 1 windows (created Thu Oct 22 16:42:12 2026)
h4: 1 windows (created Thu Oct 22 20:57:13 2026)
h4cache: 1 windows (created Thu Oct 22 20:52:59 2026)
== file-dynamique/file-status.txt
j5b-gps-journal-produit-resume-asynchrone-60q-r2 départ 18:30:33 (/home/nvidia/tvlens-j6, 83cddd5)
j5b-gps-journal-produit-resume-asynchrone-60q-r2 exit 0 20:01:14
h2b départ 20:01:30
F1 retenu hors file 20:17:36 : priorité de Dabi = optimiser la recherche web hors ligne d abord, F1 une seule fois avec la meilleure configuration
h2b exit 0 20:18:02
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
20:58:07
```

## Plan courant (tenu par Claude)
Plan courant (22/10 ~21:10 UTC ; mis à jour par Claude à chaque changement)

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
**1. Dérive — le goulot principal devient la qualité des preuves transmises au répondeur ; optimiser encore le déclenchement ou la génération rapporte moins.**

- **H2 : déclenchement W/M 8/30 → 30/30 en 0,65 s**, mais pertinence inchangée : **26/60**. W gagne 6 réponses, M en perd 6 (**10/24 → 4/24**). La requête autonome ne suffit donc pas. [H2](/Users/Dabi/Documents/ISN/tvlens/experiments/essais/2026-10-22-decision-web-hors-ligne-gx10/README.md)
- Selon le plan fourni, sélectionner une fenêtre porte la présence du fait de **18/27 à 23/27** ; fusionner les recherches retrouve **52/60 pages attendues contre 45/60**. Ce sont des gains de récupération, **pas encore de réponses pertinentes**.
- **J6 : 40/60, 6,2 s, 0 rejet**, mais supériorité sur J3 non démontrée : **+9/−7, p≈0,80** ; critère d’inventions manqué (**10, plafond 9**). Le retenir comme référence opérationnelle, pas comme victoire statistique. Il reste **10/19 questions anciennes ratées**. [J6](/Users/Dabi/Documents/ISN/tvlens/experiments/essais/2026-10-22-journal-produit-gx10/README.md)

**2. Arrêter / continuer / commencer**

| Action | Gain attendu ou objectif | Occupation GX10 estimée |
|---|---|---:|
| **Arrêter** répétitions retirées, nouveaux modèles, H1-C | Préserver les **180 min** déjà économisées ; aucune nouvelle piste justifiée | 0 |
| **Arrêter** les interruptions de J5b pour changer les priorités | Éviter une nouvelle acquisition partielle et un troisième départ | 0 supplémentaire |
| **Continuer** J5b jusqu’au résultat | Vérifier **0 bloc perdu**, ≤**7,2 s**, ≥**37/60**, ≥**18/20** résumés fidèles | ≈73 min restantes |
| **Continuer** H2b | Vérifier que la fusion récupère les M sans perdre les W ; gain final inconnu | Budget **10–20 min**, non mesuré |
| **Continuer** F1 sur base J6 + recherche | Mesurer les **102 questions**, latences complètes, inventions, pertes de blocs et régressions v3 | ≈100 min |
| **Commencer** diagnostic des preuves manquantes et rejeu de fenêtres | Potentiel : **5/27 faits supplémentaires accessibles** ; isoler sélection des passages et fusion | Diagnostic **0 GPU** ; rejeu plafonné à **20 min** |

**3. File : garder J5b → H2b → F1 ; rendre F1b conditionnel.**

À partir de **18:47 UTC**, avec intégration prête :

| Étape | Durée | Fin indicative UTC |
|---|---:|---:|
| J5b restant | 73 min | 20:00 |
| H2b | 10–20 min | 20:10–20:20 |
| F1 | 100 min | 21:50–22:00 |
| Marge incidents | 30 min | **22:20–22:30** |

Soit **3 h 33–43 réservées**, hors notation/intégration. **Ne pas engager automatiquement 100 min supplémentaires pour F1b** : les changements côté questions se départagent d’abord hors ligne. Si fusion et fenêtres sont prometteuses, les tester séparément ; les changer ensemble empêcherait d’attribuer le gain. Une validation finale combinée reste possible, explicitement présentée comme telle.

**4. Depuis 16:47.** Conseils suivis : J6 priorisé et désormais noté, J5b aligné sur J6, répétitions supprimées. H2 ajouté à raison avant F1 : il corrige un déclencheur limité à **8/30**. Inverser F1/J5b était justifié par l’intégration en attente. Le registre a rattrapé H1/J6 ; le plan conserve toutefois des mentions périmées « J4/J6 en cours ». Nouveaux points à protéger : régression M, titres disponibles dans l’hôte réel, et différence entre meilleurs passages hors ligne et début de page produit.

**5. Aucune décision humaine nécessaire.** Les priorités données permettent ce tri.

Lecture seule respectée : aucun fichier modifié, aucun réseau, aucun SSH.
