# GX10 — consolidation des essais et plan du 21 octobre 2026

Cette note confronte les résultats clos de la nuit aux pistes de recherche. Elle prépare la journée ;
elle ne lance aucun nouvel essai. Objectif : augmenter la part de réponses pertinentes rendues en moins
de 20 s, avec une cible souhaitée sous 15 s, sans inventer de gain de qualité avant annotation.
Les six fiches restent `readyForScoring=false` dans
[`selection.json`](../../gx10/evaluation/selection.json). Les corrections de référence doivent être
intégrées, relues contre les vidéos et figées avant un classement de pertinence.

## Ce que la nuit permet de conclure

| Observation | Lecture défendable | Ce qu'elle ne prouve pas |
| --- | --- | --- |
| Sur Kennedy, 35 appels visuels pour 38 blocs de 8 s : 7,272 s en médiane, 8,280 s en moyenne et un bloc perdu pour retard. Le corpus étendu perd 74 publications visuelles, dont 63 par retard. | La voie visuelle manque de marge et la cadence soutenue compte autant que la médiane. [Diagnostic](../2026-10-20-nuit-gx10/diagnostic-vision.md), [corpus étendu](../2026-10-21-corpus-etendu-gx10/README.md). | La part exacte du modèle, du prompt, de l'encodage des images ou de la file. |
| Sur CNRS, quatre replays A/B/B/A donnent environ 20,97 et 21,50 s de médiane HTTP avec vision active pendant les questions, contre 12,06 et 13,53 s avec nouveaux départs visuels suspendus ; 20/20 réponses sont acquises. | La suspension est le premier candidat à confirmer sur d'autres contenus. [Bruts](../2026-10-20-nuit-gx10/rapatriements/nuit-20261020T210107Z/results/trial-vision/). | Une meilleure pertinence ou une preuve visuelle aussi fraîche : couverture et pertes diffèrent selon le bras. |
| Cinq contre trois images sur douze blocs CNRS : médianes 6,78/5,34 s au premier passage, puis 3,76/3,65 s au second, dans l'ordre A/B/B/A. | L'analyse doit être appariée par bloc et séparée entre passage froid et chaud. [Bruts](../2026-10-20-nuit-gx10/rapatriements/nuit-20261020T210107Z/results/trial-perception/). | Un gain stable de trois images : l'effet de l'ordre et de l'échauffement est important. |
| Sur 24 blocs Qwen identiques, Ollama est plus rapide que vLLM à chaque paire ; médianes 13,81/17,62 s au premier passage et 10,58/16,58 s au second. | La pile Ollama mérite d'être conservée comme base de comparaison visuelle. [Sonde](../2026-10-20-vision-vllm-gx10/README.md). | Une supériorité du moteur seul : Ollama annonce F16, vLLM BF16 ; formats, prétraitements et ordre diffèrent. |
| Les sondes textuelles ont chacune rendu 20/20 réponses HTTP : 9,04 s de moyenne Ollama contre 20,39 s vLLM ; deux sorties vLLM sont `insufficient`. | Les piles testées donnent un signal de vitesse et des sorties à relire. [Ollama](../2026-10-20-nuit-gx10/rapatriements/nuit-20261020T210107Z/results/answers-ollama/), [vLLM](../2026-10-21-reprise-docker-gx10/rapatriements/reprise-night-20261020T224805Z/RAPATRIEMENT.md). | Un effet du moteur seul ou une préférence qualité : Q4_K_M et NVFP4, modèles servis et ordre changent. |
| StreamingVLM réduit le temps du préfixe de 16 s de 160,90 à 111,96 s avec cache, mais traite 372 s de Spring en 603,94 s. | Le cache de ce runtime fonctionne sur GX10 ; son passage long reste à 0,616× le temps réel. [Bilan](../2026-10-21-incident-streaming-queue/BILAN.md). | Une accélération du flux TVLens complet ou une pertinence accrue. |

Les neuf replays de référence et les neuf du corpus étendu ont acquis chacun 45/45 questions.
Le second lot contient cinq réponses `insufficient` et aucune perte audio, mais environ 94,5 % de
couverture temporelle visuelle. Les variantes Whisper et les deux sondes textuelles ont des durées
descriptives, sans conclusion causale : modèle, quantification, ordre ou état chaud/froid changent.
Sur la référence, `small` a été le plus rapide en médiane sur Kennedy et Spring, tandis que
`large-v3-turbo` l'a été sur CNRS ; une seule exécution par combinaison et aucune qualité validée
empêchent de choisir un Whisper aujourd'hui sur ces seuls chiffres.
Les réponses et incidents sont conservés dans les dossiers de référence, de nuit et de reprise.
Un statut `observation` ou `insufficient` n'est jamais une note de qualité.

## Travail ordonné pour aujourd'hui

| Priorité et budget de travail | Action et livrable | Condition de passage |
| --- | --- | --- |
| **1 — Matin, 2 à 3 h** | Réconcilier les six fiches et leurs temps avec les médias ; intégrer les corrections, figer les SHA-256 et préparer une annotation à l'aveugle. Commencer par `cuisine-07` dans les trois Whisper, `tears-07` et `artemis-07` en `base`, puis les sorties homologues ; contrôler aussi `spring-06` et `kennedy-06`. Noter 0–3, invention, preuve temporelle et abstention justifiée. | Sans fiche validée, conserver `readyForScoring=false` ; avancer sur les seules mesures techniques. Ne pas utiliser une réponse du modèle pour rédiger l'attendu. |
| **2 — Matin, 1 à 2 h, sans GPU** | Recalculer les comparaisons appariées des deux ablations : tous les délais individuels, p50/p95, tokens et appels, pertes par retard/erreur, blocs livrés avant l'échéance suivante et âge des preuves au moment des questions. Séparer passage 1/2 et français, anglais, sans dialogue. Produire une table des cas où le gain de délai s'accompagne d'une preuve plus ancienne ou manquante. | Analyse descriptive seulement jusqu'à l'annotation ; aucune moyenne globale qui masque les langues ou les vidéos. |
| **3 — Premier créneau GPU, plafond 3 h** | Préenregistrer puis confirmer la suspension des nouveaux départs vision pendant les questions sur **Kennedy et Spring**, mêmes médias, cinq questions, configuration Whisper et poids figés, ordre A/B/B/A et sorties séparées. Mesurer délai HTTP complet, p95, âge des preuves, publications perdues et qualité annotée ultérieurement. | GPU et trois verrous libres, identités/entrées SHA-256 fixées, aucun replay concurrent. Arrêter au premier échec non corrigible ou au plafond ; préserver les sorties partielles. Ne retenir le bras que si les faits utiles et le rappel ancien tiennent. |
| **4 — Second créneau GPU, plafond 2 h** | Si le premier essai est scellé, étendre l'ablation **5 contre 3 images** aux mêmes blocs figés de Kennedy et Spring. Apparier chaque bloc et relever OCR, actions brèves, descriptions utiles, erreurs, temps de préremplissage/génération et cadence. Ne changer ni prompt ni modèle dans ce bras. | Ne lancer qu'après fermeture confirmée du premier essai. Un gain de temps sans préservation des faits n'est pas un gain du produit. |
| **5 — En parallèle CPU, puis fin de journée** | Étudier en mode *shadow* une sélection d'images par changement de plan et différence visuelle, sans supprimer d'appel VLM. Compter appels évitables présumés et événements qui auraient été manqués ; choisir ensuite un seul protocole de confirmation. Publier une matrice vitesse–pertinence par vidéo et les questions encore à relire. | Ne transformer le filtre en suppression réelle qu'après contrôle du rappel sur les six vidéos. Aucun nouvel ordonnanceur GPU concurrent. |

L'ordre 3 puis 4 évite de modifier plusieurs causes dans le même replay. Chaque essai GPU doit avoir
son propre dossier daté sous `experiments/essais/`, une hypothèse, une référence, une variation unique,
un budget, des conditions d'arrêt, les SHA-256 des entrées et modèles, et ses résultats bruts. Le
premier token n'était pas mesuré par les sondes nocturnes ; l'instrumenter dans un essai futur, sans
le déduire des durées HTTP. À la clôture, comparer la qualité par vidéo, les inventions, la part
pertinente **et** sous 20 s, la part sous 15 s, p50/p95, pertes et fraîcheur ; publier aussi les délais
individuels car cinq questions par vidéo donnent un p95 fragile. Aucun seuil de qualité chiffré
nouveau n'est présumé accepté.

## Pistes de recherche après ces décisions

1. **Réduire le travail par bloc** avant de changer de moteur : observation plus courte, synthèse
   cumulative moins fréquente, puis sélection adaptative à couverture minimale. La sélection de
   trames est étudiée par [VidF4](https://arxiv.org/abs/2407.15047) ; [FFmpeg](https://ffmpeg.org/ffmpeg-filters.html)
   documente des détecteurs de scènes. Leur gain sur TVLens reste une hypothèse. Risque : manquer
   une action ou un texte sans coupe franche.
2. **Mémoire horodatée récupérée à la question** : pour `spring-06` et les questions sur des faits
   anciens, comparer le contexte cumulatif actuel à un journal d'événements/indices borné, à
   ingestion identique. [VideoStreaming](https://arxiv.org/abs/2405.16009) motive la récupération
   liée à la question ; sa performance sur GX10 n'est pas établie. Risque : oublier la preuve utile.
3. **Cascade petit/grand VLM** : seulement après une mesure de rappel en *shadow*. Le principe de
   [FrugalGPT](https://arxiv.org/abs/2305.05176) vient des LLM textuels ; sa transposition à la
   vision continue est incertaine, et deux modèles résidents peuvent coûter plus cher qu'un seul.
4. **StreamingVLM et autres moteurs** : conserver comme piste de recherche. Son cache apporte un
   gain interne, mais le débit observé est sous le temps réel et son intégration TVLens reste à faire.
   [Papier](https://arxiv.org/abs/2510.09608), [code officiel](https://github.com/mit-han-lab/streaming-vlm).
   Ne pas prioriser un simple remplacement Ollama→vLLM aujourd'hui : les sondes ne montrent pas
   de gain sur les piles testées, sans isoler l'effet du moteur.

**Décision de fin de journée :** retenir seulement les variantes dont la vitesse et la qualité
annotée progressent ensemble, ou dont le délai baisse sans perte factuelle importante. Si les
fiches ne sont pas validées, livrer la frontière de vitesse et la liste d'annotations restantes,
sans déclarer de gagnant. Les expériences nocturnes sont closes et leur automation est en pause ;
ce plan n'a réactivé aucune charge sur le GX10.
