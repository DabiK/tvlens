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

# État au 20261022T1447Z (UTC)

## GX10 : sessions et files
```
h1: 1 windows (created Thu Oct 22 13:24:49 2026)
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
j2 exit 1 10:50:05
j2 reprise départ 10:51:24
j2 reprise exit 0 12:21:18
j3 départ 12:21:25
j3 exit 0 13:51:59
== file-jour3/file-status.txt
j4 départ 13:52:01
j4-gps-resume-asynchrone-60q-results artemis-GPSA60-1 dernière étape: artemis-GPSA60-1
n1-gps-bis-results finished dernière étape: artemis-GPS-1
n2-gps-sans-resume-results finished dernière étape: artemis-GPSR-1
n3-gps-journal-results finished dernière étape: artemis-GPSJ-1
n4-qps-results finished dernière étape: artemis-QPS-1
n5-gps-sans-resume-journal-results boeuf-bourguignon-GPSRJ-1 dernière étape: boeuf-bourguignon-GPSRJ-1
n5b-gps-sans-resume-journal-reprise-results finished dernière étape: artemis-GPSRJ-1
n6-gps-sans-resume-bis-results finished dernière étape: artemis-GPSR-1
0 %
14:47:29
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
- J3 (N2 + journal, 60 q) : 38/60 contre 28/60 (J2), inventions 9 contre 16, anciennes 6/19 contre 0/19, récentes 25/33 =,
  +1,3 s, 60/60 sous 15 s : nouvelle meilleure configuration (critères Astra remplis).
- Tout est committé et poussé jusqu'à J2/J3 (097807b).

File GX10 :
1–2. J2 et J3 faits et notés (voir résultats).
3. J4 (J2 + topicSummary asynchrone par le proxy, 60 questions) — en cours depuis 13:52 UTC ; critères : surcoût
   médian ≤ 1 s face à J2, 0 bloc perdu, ≥ 18/20 résumés fidèles.
4. Réserve : répétition J3 si le temps le permet ; mémoire des faits entièrement anciens encore faible (6/19).
5. J1 (GPSV sans topicSummary) — reporté ; nouvelles variantes de modèles ou de deux phases : arrêtées.

ÉCHÉANCE : vendredi 23/10 est le dernier jour (résultat du hackathon samedi) ; aller au plus vite.
PRIORITÉ DABI jusqu'à la fin de la fenêtre GX10 (22/10, ~12:40 UTC) : catégorie « connaissance extérieure et outils »,
jugée très nécessaire. Le benchmark ne mesurait que des réponses tirées de la vidéo. Étapes et durées :
a. Oracle v4 (Mac, sans GPU) : par vidéo W 2–3 (web, ≥1 stable, ≥1 actualité datée), M 2 (vidéo + extérieur),
   O 2 (relecture d'images anciennes, inspect_clip), poses = instants existants — FAIT : 42 questions (18 W dont 7
   actualité, 12 M, 12 O), corpus 51/54 pages, committé 58685cb.
b. Essai hors ligne H1 — EN FILE sur la GX10 après J4 (~15:20 UTC) : W/M bras A, A2, B, C ; O bras O0, OJ, OI ;
   ~420 appels, ~40 min. Critère : B ≥ +5 W/M
   pertinentes face à A, sans hausse des inventions, < 3 s de plus.
c. Produit : session recherche-web-locale (branche feat/recherche-web-locale) : T308, T309 intégrés (c7ad6fa,
   l'agent Ollama répond depuis les pages récupérées, sources validées, ADR) ; T310 (adaptateur) en boucle ; T311
   ensuite, dernier requis ; T312 facultatif. Session journal-memoire-produit (feat/journal-memoire-local) : T313 en
   boucle. Les deux boucles tournent en même temps sur le Mac (swap presque plein) : risque pour les contrôles ; puis ticket unique (skill ticket, worktree frère) ou découpage + boucle sur sa
   branche. Port de recherche + adaptateur corpus + adaptateur web ; récupération avant la réponse injectée au
   contexte ; l'adaptateur Ollama accepte une réponse extérieure si ses sources viennent de la recherche. Moteur réel :
   SearXNG sur la GX10 (décision de Dabi, installé à 12:41 UTC, 127.0.0.1:8888, 3 s par requête).
d. Flux réel W/M/O en comparaison A/B (référence sans recherche / avec recherche, ~180 min) une fois le ticket intégré
   et le checkout GX10 + codeShas mis à jour (revue Astra 12:37).
H1 : B récupère par recherche BM25 sur tout le corpus (pas d'extraits présélectionnés) ; A/B même schéma et mêmes
règles ; B/C même corpus et même récupération ; pas de relance systématique en deux phases.
Ne doit pas retarder J3 ni J4. Revue Astra : proposer un découpage chiffré du temps GPU restant.

Règle de fin de phase (Dabi, 22/10) : quand un essai est clos, noté et consigné, compresser ses bruts (gzip -n),
lancer check --changed, committer seulement les dossiers d'essais et le registre, puis pousser main.

## Revue précédente
**1. Dérive.** La priorité W/M/O est justifiée ; le risque devient de multiplier les mécanismes avant de mesurer séparément l’apport des sources, leur récupération et les outils.

- **Vitesse stabilisée :** J2 atteint **5,0 s médian, 60/60 sous 15 s, zéro bloc perdu** ; sa pertinence reste à noter. N2/N6 laissent encore **8–9 réponses non pertinentes sur 30**. [Chiffres locaux](/Users/Dabi/Documents/ISN/tvlens/experiments/essais/2026-10-21-variantes-gx10/CHIFFRES.md).
- **Mémoire prometteuse, non acquise :** G5 B/A = **49/60 contre 45/60**, **9 gains/5 pertes**, inventions **7 contre 13**, coût **+1,28 s**. Mais ce sont **30 questions répétées deux fois** ; les réponses récentes reculent de **41/48 à 39/48**. [G5](/Users/Dabi/Documents/ISN/tvlens/experiments/essais/2026-10-22-journal-hors-ligne-gx10/README.md).
- **Angle mort W/M/O :** aucun résultat acquis. Le plan représente **24–30 questions W/M + 12 O**. Injecter des extraits présélectionnés mesure leur utilité, pas la capacité d’un moteur à les retrouver.

**2. Arrêter / continuer / commencer.** Les gains ci-dessous sont des critères proposés, pas des prévisions.

| Action | Gain attendu ou critère | Budget GX10 |
|---|---|---:|
| **Arrêter** les variantes de modèles, J1 et l’optimisation du journal D/E | Concentrer la validation ; J1 économise ≈90 min | 0 |
| **Continuer** J3 puis J4 | J3 : ≥+5/60, inventions non accrues, perte ≤1 sur les 33 récentes ; J4 : ≤+1 s, zéro bloc perdu, ≥18/20 résumés fidèles | ≈73 + 90 min restantes |
| **Commencer** H1 en trois comparaisons distinctes | A/B : ≥+5 W/M sur 24–30, sans hausse des inventions, <+3 s ; B/C : apport du déclenchement par outil ; O : apport de la relecture | **60 min plafonnées** |
| **Commencer** une comparaison F1 A/B en flux | Mesurer le gain réellement livré, citations acceptées et délai complet inclus | **180 min**, conditionnelles |
| **Continuer** notation et arbitrage des bascules | Ventiler mémoire/récent, W/M/O, inventions, citations et erreurs techniques | **0 min GX10** |

Pour H1, garder **le même schéma de réponse et les mêmes règles de validation** entre A/B ; entre B/C, conserver le même corpus et la même récupération. Les attendus restent exclus des entrées. Ne pas réintroduire une relance systématique en deux phases : E6 atteignait **156 s médian sur Spring**.

**3. File GX10 : garder J3 → J4, placer W/M/O avant la répétition facultative.**

| Ordre depuis l’état de 12:37 UTC | Durée restante | Fin indicative, le 22/10 |
|---|---:|---:|
| J3 | ≈73 min | 13:50 |
| J4 | 90 min | 15:20 |
| H1 | 60 min | 16:20 |
| F1 référence + variante, si produit prêt et H1 concluant | 180 min | 19:20 |
| Répétition J2/J3, seulement si elle peut changer le choix | 180 min | 22:20 |

Soit **6 h 43 de file principale**, puis **3 h de réserve** et **30 min de marge**, jusqu’à **≈22:50 UTC**. Hors préparation, intégration et notation. Les **90 min initialement prévues pour F1** suffisent à une recette, pas à une comparaison en flux : J2 utilise un autre questionnaire.

**4. Depuis la revue précédente.** G5 terminé en **≈21 min**, contre 36 estimées ; journal B retenu, D/E écartés à raison ; J2 terminé, J3 lancé et J4 préparé. L’audit demandé existe désormais : **46/51 statuts concordants**, mais **8 textes visuels jugés contre l’oracle seul**. Il réduit l’incertitude sans établir une vérité indépendante des médias. La formule persistante « moins de 4–5 réponses n’est pas un signal » reste injustifiée comme seuil statistique. [Audit](/Users/Dabi/Documents/ISN/tvlens/experiments/essais/2026-10-21-variantes-gx10/revues/README.md).

**5. Décision humaine utile :** préciser **l’heure exacte de fermeture le 23/10** ; le budget restant au-delà de cette file est autrement indéterminé.

Lecture seule : aucun fichier modifié, aucun réseau ni SSH utilisé.
