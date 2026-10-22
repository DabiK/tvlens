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

# État au 20261022T1237Z (UTC)

## GX10 : sessions et files
```
j3: 1 windows (created Thu Oct 22 11:03:54 2026)
j4: 1 windows (created Thu Oct 22 12:26:00 2026)
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
== file-jour2/file-status.txt
j2 départ 10:50:05
j2 exit 1 10:50:05
j2 reprise départ 10:51:24
j2 reprise exit 0 12:21:18
j3 départ 12:21:25
j3-gps-sans-resume-journal-60q-results cnrs-apprentissage-GPSR60J-1 dernière étape: cnrs-apprentissage-GPSR60J-1
n1-gps-bis-results finished dernière étape: artemis-GPS-1
n2-gps-sans-resume-results finished dernière étape: artemis-GPSR-1
n3-gps-journal-results finished dernière étape: artemis-GPSJ-1
n4-qps-results finished dernière étape: artemis-QPS-1
n5-gps-sans-resume-journal-results boeuf-bourguignon-GPSRJ-1 dernière étape: boeuf-bourguignon-GPSRJ-1
n5b-gps-sans-resume-journal-reprise-results finished dernière étape: artemis-GPSRJ-1
n6-gps-sans-resume-bis-results finished dernière étape: artemis-GPSR-1
90 %
12:37:56
```

## Plan courant (tenu par Claude)
Plan courant (22/10 ~11:00 UTC, mis à jour par Claude à chaque changement de file)

Résultats acquis :
- N2 = questions gemma4:26b-a4b + pause vision + Whisper small + vision gemma3:4b sans topicSummary : 21/30
  pertinentes (deux paquets), médiane 5,7 s ; rejoué (N6) : 22/30, 5,2 s, 0 bloc perdu. Confirmé.
- N5 = N2 + journal mémoire : 22/30, 6,8 s ; +4/−3 face à N2, comme N6 : aucun avantage du journal démontré sur 30 q.
- Bruit : rejouer une config fait basculer 7 à 8 questions sur 30 ; renoter les mêmes réponses change 2 statuts sur 30.
- topicSummary ne peut pas être supprimé en produit (cartes de la frise TV) : à calculer hors du chemin critique.
- Oracle v3 : 60 questions, dont 27 qui testent la mémoire (19 entièrement anciennes, 8 mixtes).
- G5 noté : journal complet B 49/60 (sans journal 45), inventions 7 (13), mémoire 10/12 (4/12), +1,3 s ; D et E écartés.
- Audit des juges par Astra : 46/51 statuts identiques (90 %).
- Tout est committé et poussé jusqu'à la phase G5 (2e37573).

File GX10 :
1. J2 fait (10:51–12:21 UTC) : médiane 5,0 s, 60/60 sous 15 s, 0 bloc perdu ; à noter avec J3.
2. J3 (J2 + journal complet B, 60 questions) — en cours depuis 12:21 UTC, fin vers 13:50 UTC.
3. J4 (J2 + topicSummary asynchrone par le proxy, 60 questions) — en file, démarre seul après J3 ; critères : surcoût
   médian ≤ 1 s face à J2, 0 bloc perdu, ≥ 18/20 résumés fidèles.
4. Réserve : répétition J2/J3 (180 min) si J3 montre un écart à confirmer.
5. J1 (GPSV sans topicSummary) — reporté ; nouvelles variantes de modèles ou de deux phases : arrêtées.

PRIORITÉ DABI jusqu'à la fin de la fenêtre GX10 (22/10, ~12:40 UTC) : catégorie « connaissance extérieure et outils »,
jugée très nécessaire. Le benchmark ne mesurait que des réponses tirées de la vidéo. Étapes et durées :
a. Oracle v4 (Mac, sans GPU) : par vidéo W 2–3 (web, ≥1 stable, ≥1 actualité datée), M 2 (vidéo + extérieur),
   O 2 (relecture d'images anciennes, inspect_clip), poses = instants existants ; rédacteur + vérificateur ; corpus
   web figé avec empreintes — en cours depuis ~12:40 UTC, ~1 h.
b. Essai hors ligne W/M/O (bras A sans source, B extraits du corpus injectés + champ sources, C recherche comme outil
   en deux phases, O inspect_clip en deux phases) — ~1 h de GPU, après J4 (~15:30 UTC). Critère : B ≥ +5 W/M
   pertinentes face à A, sans hausse des inventions, < 3 s de plus.
c. Produit : explorateur en cours ; puis ticket unique (skill ticket, worktree frère) ou découpage + boucle sur sa
   branche. Port de recherche + adaptateur corpus + adaptateur web ; récupération avant la réponse injectée au
   contexte ; l'adaptateur Ollama accepte une réponse extérieure si ses sources viennent de la recherche. Moteur réel :
   SearXNG sur la GX10 ou API à clé — question posée à Dabi.
d. Flux réel W/M/O (~90 min) une fois le ticket intégré et le checkout GX10 + codeShas mis à jour.
Ne doit pas retarder J3 ni J4. Revue Astra : proposer un découpage chiffré du temps GPU restant.

Règle de fin de phase (Dabi, 22/10) : quand un essai est clos, noté et consigné, compresser ses bruts (gzip -n),
lancer check --changed, committer seulement les dossiers d'essais et le registre, puis pousser main.

## Revue précédente
**1. Dérive — la file reste pertinente, mais gagner encore des secondes devient secondaire face aux 8–9 réponses sur 30 non pertinentes et à l’incertitude de notation.**

Recalcul du dernier [paquet de notes](/Users/Dabi/Documents/ISN/tvlens/experiments/essais/2026-10-22-variantes-nuit-gx10/notation-n5-n6/notes.json) :

| Configuration | Pertinentes | Inventions | Médiane¹ | <15 s¹ | Blocs perdus¹ |
|---|---:|---:|---:|---:|---:|
| N2, sans résumé | 21/30 | 5 | 5,7 s | 30/30 | 0 |
| N5, + journal | 22/30 | 4 | 6,8 s | 30/30 | 0 |
| N6, répétition N2 | 22/30 | 5 | 5,2 s | 30/30 | 0 |

¹ Mesures consignées dans le [dossier d’essai](/Users/Dabi/Documents/ISN/tvlens/experiments/essais/2026-10-22-variantes-nuit-gx10/README.md).

N5 et N6 font chacun **+4 gains/−3 pertes** face à N2 : aucun avantage du journal démontré, pour **+1,1 s** médian avec N5. Le risque négligé est la qualité des preuves : **2/30 réponses N2 changent de statut pertinent entre deux notations des mêmes réponses**, malgré le total inchangé. Les sept bascules au rejeu ne constituent pas un seuil statistique « ±4 ».

**2. Arrêter / continuer / commencer**

| Action | Gain attendu ou critère proposé | Coût GX10 estimé |
|---|---|---:|
| **Arrêter** les nouvelles variantes de modèles et de deux phases ; maintenir J1 reporté | Préserver le temps de validation ; aucune amélioration actuelle démontrée justifiant leur priorité | 0 ; ≈90 min évitées pour J1 |
| **Continuer** G5, sans ajouter de bras | Choisir un journal compact ; rechercher ≥1 s gagnée pour D/B, perte ≤1/60 | ≈36 min au total |
| **Continuer** J2/J3 appariés | Tester un gain exploratoire ≥5/60, perte ≤1 sur les questions récentes, inventions non accrues | 180 min |
| **Commencer** la vérification indépendante des bascules et de 12 questions fixes contre les médias | Distinguer erreur du juge, perception manquante et réponse incorrecte ; gain de pertinence encore inconnu | 0 min GX10 |
| **Commencer** le prototype de résumé asynchrone | Conserver les cartes avec surcoût médian ≤1 s, zéro bloc perdu et ≥18/20 résumés fidèles sans invention | 90 min |

Ces seuils servent à décider de la suite, pas à prouver une significativité.

**3. File GX10 — garder l’ordre, borner l’exploration.**

**G5 → J2 (90 min) → J3 (90 min) → résumé asynchrone (90 min)** : **4 h 30 après G5**, soit **≈5 h 06 depuis son départ**, hors notation et préparation. L’extrait fourni ne permet pas d’estimer précisément son temps restant.

G5 contient **30 questions distinctes répétées deux fois**, dont seulement **6 partiellement anciennes** : un résultat nul ne doit pas éliminer J3. L’[oracle v3](/Users/Dabi/Documents/ISN/tvlens/experiments/essais/2026-10-22-oracle-60-questions-gx10/oracle-v3.json) contient bien **19 questions entièrement anciennes, 8 mixtes et 33 récentes**. Choisir un seul journal pour J3 ; réserver ensuite **180 min** à une répétition J2/J3 si le résultat justifie une confirmation.

**4. Depuis la précédente revue**

Conseils suivis : N6 terminé, notation commune N2/N5/N6, retrait de C dans G5, comparaison à 60 questions et report justifié de J1. La vitesse de N2 se reproduit ; N5 apporte désormais un résultat de pertinence, encore indécis. Le décompte temporel de l’oracle a été corrigé.

Restent sans preuve dans les éléments lus : audit indépendant des 12 questions, séparation langue/exactitude, vérification effective du plafond D et des citations. La stabilité des totaux entre paquets ne suffit donc pas à valider les juges.

**5. Décision humaine : aucune nécessaire maintenant.**

Lecture seule effectuée ; aucun fichier modifié, aucun réseau ni SSH utilisé.
