# Propositions GX10 — 20 octobre 2026

État : préparation documentaire et analyse CPU, sans nouvelle inférence. Le lot Whisper existant reste inchangé.
La priorité est la pertinence ; réponse complète en moins de 20 s acceptable, moins de 15 s souhaitée, file comprise.
Les références restent `readyForScoring: false` : aucun classement qualité n'est établi ici.

## Diagnostic provisoire

Capture du lot à **20:20:26 UTC** : CNRS/base complet ; Kennedy/base incomplet, malgré ses cinq réponses déjà acquises.
Les deux copies exactes, sans médias ni secrets, totalisent environ 6,2 Mo. Leurs empreintes et leur origine sont dans
[captures/manifest.json](captures/manifest.json). L'état après cette capture peut avoir changé.
Le runner distant est `2035a2faad499659bcdf940c6104e50e311a9cd6`. Les nouveaux fichiers restent dans ce dossier uniquement.

| CNRS/base complet | Mesure observée |
| --- | --- |
| Délais des cinq questions, dans l'ordre | 27,950 ; 19,901 ; 21,007 ; 25,999 ; 22,821 s |
| Médiane ; réponses sous 20 s / sous 15 s | 22,821 s ; 1/5 / 0/5, **sans qualifier leur pertinence** |
| Attente produit | 2 à 8 ms ; contexte construit en 2 à 8 ms |
| Appels questions | Une requête fournisseur par question ; aucun outil, aucune recherche, aucun réexamen |
| Audio | 110 appels, médiane 1,658 s, maximum 4,710 s ; aucune perte ; couverture 100 % |
| Vision | 103 appels, médiane 7,030 s ; 20 dépassent 8 s ; 101 retours et deux erreurs |
| Pertes vision | Sept backlog, deux erreurs ; neuf blocs, soit 72 s ; couverture 91,82 % |
| Retard d'analyse | Maximum échantillonné 56 s ; nul à la clôture, ce qui n'annule pas les pertes |
| Temps vision fournisseur sur les 101 retours | Médiane préremplissage 3,052 s, génération 3,758 s |

Sources : `questions[].metrics`, `roles.{perception,transcription}.evidence`, `journal.samples`, `summary` des copies.
Les deux instruments transcription décrivent le même appel : exclure les entrées `scope: transcriber` pour compter les blocs.
Les médianes préremplissage et génération sont calculées séparément, leur somme n'est pas la médiane totale.

Les erreurs vision `TVLENS_VISION_TRANSIENT` durent environ 45 s, cohérentes avec le timeout local de 45 s :
368–376 s (appel commencé vers 378,4 s), puis 632–640 s (appel commencé vers 641,3 s).
La première ne chevauche aucune question. La seconde commence avant la question à 648 s.
Il serait donc injustifié d'attribuer tous les blocages à la concurrence des questions ou à Whisper.
Les 101 retours vision déclarent une seule tentative de langue ; les tentatives des erreurs sont inconnues.

Le coût des questions se trouve principalement dans leur appel fournisseur, sans ventilation actuellement conservée
entre chargement, préremplissage, génération et attente Ollama. La file produit mesurée n'explique pas les 20–28 s.
`coldStart: false` est une valeur d'adaptateur : ce n'est pas une preuve de poids chauds.
Le premier appel vision annonce d'ailleurs 3,606 s de chargement.

Kennedy/base partiel : cinq délais de 15,188 ; 18,234 ; 19,707 ; 15,366 ; 12,798 s.
Dernier échantillon à 415,344 s : quatre pertes vision backlog, retard d'analyse 48 s ; aucune synthèse finale à cette capture.
Une réponse contient l'incohérence interne « demi-année » associée à « half a century ».
C'est un cas d'analyse ASR → observation → réponse, pas une note globale contre une référence validée.

Les questions actuelles sont surtout proches du passage observé. L'absence d'outil ne valide donc ni la recherche ancienne
ni les embeddings. Ne pas investir d'abord dans un remplacement du moteur de recherche sur la seule preuve de ces latences.
Les sondes historiques de préparation, concurrentes à l'encodage, sont exclues de la référence de vitesse.

## Six expériences, par priorité

### 1. Vision : mesurer la marge sur un bloc de huit secondes

**Hypothèse.** Cinq images et la génération de résumés rendent la vision trop proche du débit d'arrivée ; les appels longs
débordent la file. La variante à trois images pourrait réduire le préremplissage tout en conservant les faits utiles.

**Référence et variation.** Même Gemma3 4B, moteur, paramètres, ASR figée et contexte absent explicitement dans les deux bras.
Seule la liste des images passe de cinq à trois : première/médiane/dernière, sans changer le prompt ni les autres champs.
Le script CPU `prepare-visual-ablation.py` prépare les deux ensembles à partir des médias existants.
Cela change l'échantillonnage visuel, donc peut perdre une preuve ; ce n'est pas une optimisation gratuite.
Douze blocs CNRS comprennent les deux erreurs, leurs voisins et six témoins répartis dans le parcours.
Le [manifeste source préparé](plans/perception-nominal.json) contient les ASR non corrigées et aucune réponse attendue.
Le script doit encore matérialiser les médias dérivés et leurs empreintes sur la GX10, après le lot.
Le mode `lightweight=true` n’est pas forgé : le runner ne l’accepte que depuis des métriques archivées, absentes ici.

**Prédiction et mesures.** Diminution du préremplissage, nombre d'appels dépassant 8 s et timeouts ; conserver prompt/tokens,
génération, images réellement envoyées, faits couverts, inventions, OCR et causalité temporelle.
Comparer les 12 paires individuellement. Un gain de composant n'est pas un gain de réponse complète prouvé.
Les sorties doivent être jugées contre les images effectivement fournies et contre le passage complet, en distinguant les deux.

**Budget.** Deux bras × 12 blocs × deux passages contrebalancés = 48 appels, arrêt global après 45 minutes.
Conserver les timeouts ; arrêter après trois échecs consécutifs dans un bras ou anomalie mémoire/service.
Pas de sélection du meilleur des deux passages. Déclarer les premiers appels et le maintien des modèles.
**Limite.** Le contexte original n'est pas capturé ; ce test n'est pas une reproduction exacte des erreurs du flux.
S'il ne reproduit rien, l'étape suivante est la capture du contexte réellement envoyé, pas l'augmentation aveugle du timeout.
Après un résultat prometteur, confirmer sur Spring puis dans le flux continu : le runner de composant ne mesure aucune file.

### 2. Concurrence : suspendre le démarrage de la vision pendant les questions

**Hypothèse.** Réserver temporairement le GPU aux questions améliore leur délai, au prix d'un rattrapage vision mesurable.
**Variation unique.** `visionDuringAsk: true → false` ; audio, index, modèle questions et découpage restent identiques.
Le scénario CNRS est [préparé](plans/scenario-vision-paused.json), ainsi que sa [référence](plans/scenario-reference.json).
La suspension ne garantit pas l'annulation d'un appel vision déjà engagé ; ne pas interpréter cela comme un GPU exclusif.

**Mesures.** Toutes les cinq questions, endToEndMs et délai HTTP sondé, qualité/citations/abstentions,
pertes `visionSkippedAsking` et backlog, couverture, âge des preuves au départ et après réponse, temps de rattrapage.
Une réponse plus rapide avec perte de preuve visuelle n'est pas nécessairement meilleure.
**Budget.** Premier tri CNRS : A puis B (environ 30 min de média, plafond 45 min avec clôture).
Si favorable, confirmer B puis A sur CNRS et effectuer A/B Spring (plafond supplémentaire 75 min).
Arrêt au budget, anomalie service/mémoire ou trois erreurs fournisseur consécutives ; conserver les données partielles.
**Biais.** Froid/chaud, appels déjà engagés, index concurrent et ordre des bras ; geler le modèle Whisper choisi après le lot.
Réexécuter une référence contemporaine : le seul ancien passage base ne suffit pas au test causal.

### 3. Questions : séparer préremplissage et génération, puis réduire un coût réel

**Hypothèse.** Le coût d'une réponse structurée du 27B domine davantage que la recherche.
**Prérequis.** Conserver les durées et compteurs Ollama côté questions, longueur/empreinte du prompt et terminaison,
comme le fait déjà la vision. Ces champs existent chez le fournisseur mais sont perdus par `OllamaQuestionAgent`.
Un ticket séparé est nécessaire ; aucune modification ici. Phoenix n'est pas requis pour obtenir ces premiers chiffres.

**Variation choisie après la décomposition.** Si la génération domine, tester une consigne plus concise à contexte identique
ou un plafond de sortie explicitement supporté ; un bras à la fois. Si le préremplissage domine, réduire le contexte envoyé,
avec preuves essentielles conservées. Passer `num_ctx` de 16384 à 8192 ne prouve pas qu'on a réduit le prompt et peut le tronquer.
Un modèle plus petit est ensuite une expérience distincte : choisir un checkpoint et digest après validation de son support,
pas simplement un nom supposé disponible. Aucun modèle supplémentaire proposé ici n'est installé.

**Corpus/budget.** Quinze questions CNRS/Kennedy/Spring, deux bras, un passage exploratoire ; plafond 90 min tout compris.
Conserver réponses incomplètes/JSON invalides et références temporelles. Critère principal : qualité, puis pertinent sous 20 s.
Un rejeu question seule sur mémoire figée est souhaitable mais aucun CLI actuel ne le fournit : ne pas simuler cette isolation
en relançant le runner complet. Le prompt figé doit respecter le préfixe disponible à la question.

### 4. Mémoire : distinguer extraction immédiate et rappel ancien

**Hypothèse.** Les cinq questions actuelles par vidéo sous-testent le rappel ; changer le moteur d'embedding ne peut être jugé ici.
Préparer trois rappels anciens et une abstention par vidéo, sur CNRS/Kennedy/Spring, avec faits hors des six passages récents,
puis validation humaine avant exécution. Exemples à valider : revenir sur l'analogie initiale de Kennedy à 360 s ;
demander à CNRS à 792 s sa distinction initiale petite/grande IA ; demander dans Spring une parole absente du film.
Ne pas réutiliser ces propositions comme attentes déjà acquises.

**Variation unique.** Index de fond actif ou inactif (`backgroundIndex`) pendant toute la campagne, recherche et modèle inchangés.
Ce n’est pas une pause limitée aux questions : distinguer la baisse de concurrence et la perte de couverture de l’index.
Un [scénario d'ablation sur les questions actuelles](plans/scenario-index-paused.json) est déjà préparé pour mesurer le coût
de fond seul ; il ne mesure pas le bénéfice sémantique. Le scénario de rappel ancien reste à construire après validation.
Mesurer couverture des faits anciens, nombre de recherches et modes hybride/lexical, âge et couverture de l'index,
abstention, citations, délais ; ne pas attribuer à l'index une erreur de résumé déjà présente en amont.
Budget : 12 questions × deux bras, plafond 90 min ; aucun nouveau modèle. Une archive fixe serait préférable pour le composant.

### 5. vLLM : comparaison de stack bornée, puis attribution du gain

**Hypothèse.** Une recette adaptée à GB10 peut réduire le coût d'inférence des questions.
La recette NVIDIA Spark actuelle nomme Qwen3.8-27B NVFP4 et `vllm/vllm-openai:qwen38`.
La référence TVLens est Q4_K_M sous Ollama : changer les deux est une **comparaison de stack**, pas une preuve du gain vLLM seul.
Pour isoler le moteur, obtenir un checkpoint/quantification commun pris en charge et un template équivalent ; sinon conserver
explicitement la confusion, vérifier la qualité et ne pas donner un pourcentage de gain au moteur seul.

**Pré-vol nécessaire.** Valider architecture ARM64 de l'image, digest/version, GB10 SM121, pilote/CUDA, modèle exact,
quantification, JSON contraint et outils ; adaptation de l'API native Ollama vers OpenAI-compatible.
Recette DGX Spark documentaire, compatibilité ASUS GX10 inférée, aucune exécution ici.
Serveur isolé en loopback, port distinct ; aucune charge tant que le lot et les autres services ne sont pas réservés.
Budget proposé après accord : 90 min de pré-vol, abandon si incompatibilité ; 10 prompts identiques × deux passages,
plafond 45 min d'inférence. Collecter chargement/mémoire/tokens/délai complet, puis seulement confirmer dans TVLens.

### 6. Cosmos Reason : un candidat vision, VSS comme référence d'architecture

**Hypothèse.** Un VLM spécialisé peut mieux conserver événements et relations spatiales sur Spring et cuisine.
Tester d'abord Cosmos-Reason2-2B comme candidat borné, puis 8B seulement si un déficit mesuré justifie le coût.
Comparer 12 passages visuels annotés, mêmes images/ASR/préfixes et format de sortie, contre Gemma3.
Ne pas transférer d'emblée les réglages vidéo 4 fps et sorties de milliers de tokens : ils changeraient le budget et les entrées.
Si le moteur diffère aussi, nommer la comparaison de stack. Noter français, inventions, chronologie, preuves absentes et délai.
Budget : 90 min de pré-vol puis 24 appels, plafond 45 min ; arrêt incompatibilité, mémoire ou trois échecs consécutifs.

La documentation Reason2 indique une inférence testée sur DGX Spark/CUDA13, mais le dépôt annonce désormais une maintenance
limitée et renvoie vers Cosmos3. La supériorité TVLens et la compatibilité GX10 restent non mesurées.
VSS est une architecture/services d'analyse vidéo, pas un modèle ni un moteur interchangeable avec Gemma3.
VSS latest cite Spark, mais n'y liste que les profils avec LLM distant ; le déploiement entièrement local reste annoncé à venir.
Il ne répond donc pas actuellement à la contrainte locale comme remplacement validé de TVLens.
Les principes intéressants sont l'indexation temporelle, la séparation ingestion/question et l'observabilité, à éprouver par composants.

## Séquence recommandée

1. Laisser finir le lot Whisper ; capturer ses neuf sorties, états/erreurs et transcriptions, sans éliminer les campagnes échouées.
   Comparer temps ASR et qualité FR/EN/sans dialogue ; pas de WER/CER sans transcription humaine vérifiée.
2. Valider les références avant classement. Geler les nouvelles annotations avant de montrer les réponses aux évaluateurs.
3. Faire l'expérience 1, courte et localisée sur le problème observé, puis 2 dans le flux.
4. Instrumenter les questions avant 3 ; lancer 4 lorsque les rappels anciens sont validés.
5. Réserver 5 et 6 aux cas où les premiers essais établissent une limite réelle du moteur ou du modèle.

Les expériences ne forment pas une grille à lancer intégralement. Chaque résultat décide de la suivante.
Les étapes avec installation ou code produit restent des propositions, sans autorisation implicite d'exécution.

## Évaluation honnête

Suivre [la grille existante](../../evaluation/relecture.md) : notes 0–3, inventions, citations et abstentions séparées.
Zéro pour absence de réponse/erreur majeure ; une abstention n'est correcte que si l'information manque au préfixe accessible.
Conserver dénominateur complet, erreurs, refus, interruptions et état partiel. Exclure du classement uniquement les questions
non validées, avec leur motif, sans effacer leurs sorties. Les annotateurs ne doivent pas construire l'attendu depuis la réponse.

Pour attribuer une erreur, distinguer : preuve hors préfixe ; image non échantillonnée ; ASR erronée ; observation déformée ;
oubli dans résumé ; passage non récupéré ; mauvaise synthèse finale. Annoter le premier maillon fautif avec ses traces.
Un évaluateur LLM éventuel serait auxiliaire et local, calibré contre l'humain ; il ne valide pas l'oracle.

Rapporter tous les délais individuels, médiane et nombre sous 15/20 s ; avec cinq questions, le p95 est trop fragile pour trancher.
Le score « pertinent et sous 20 s » attend la validation des références. Agréger d'abord par vidéo puis entre vidéos,
et garder FR, EN et visuel séparés. Confirmer les finalistes par trois parcours, ordre contrebalancé et conditions thermiques déclarées,
puis vidéos non utilisées au choix (cuisine, fiction, Artemis). Un holdout ne se transforme pas en nouveau jeu d'ajustement.

## Livrables et limites de vérification

- [Commandes préparées](commandes.md) : validation et exécution future, jamais lancées ici.
- [Sources primaires](sources.md) : consultation actuelle, distinctions matériel/modèle/moteur/architecture.
- `plans/` : scénarios et manifestes sans attendus, avec références médias relatives à la préparation distante.
- `verification.json` : syntaxe/structures/invariants observés ; la validation complète du runner nécessite les médias distants.
- `empreintes.json` : gel horodaté des fichiers ; ne pas modifier silencieusement ces protocoles après résultat.

Aucune installation, inférence, décharge de modèle, modification produit, commit/push ni automatisation.
Le contrôle global produit n'a pas été lancé. Les lectures SSH n'ont écrit aucun fichier distant.
