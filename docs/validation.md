# Validation

## Actions de visionnage et « Jusqu’ici » — 29 septembre 2026

- **96 tests Node réussis** via `npm test`.
- **Parcours Electron réussi** via `xvfb-run -a npm run test:electron` : démarrage,
  pause/reprise, chat, actions ciblées, réexamen borné, repère de rattrapage,
  affichage du récapitulatif en grand/petit format, horodatages rejouables,
  archive locale et remise à zéro lors d’une nouvelle session.
- Tests du récapitulatif : provenance complète, originaux conservés, expiration,
  priorité manuelle, annulation et résultats tardifs, erreurs, délai maximal,
  limite d’entrée et absence de notifications redondantes.
- Vérification visuelle : correction d’une course entre l’ingestion et l’affichage
  des vignettes ; sources supplémentaires repliées pour limiter la densité.
- Review par sous-agents terminée sans bloqueur restant.

Ces tests utilisent une capture synthétique et des modèles simulés. Ils valident
l’intégration, pas la qualité du résumé du fournisseur réel, sa latence ou la
capture native macOS. Le récapitulatif réel reste à évaluer sur un visionnage
connecté. Les mesures locales antérieures sont dans
[latency-local.json](latency-local.json), avec leurs [limites](friction-latency.md).

Captures : [grand écran](../screenshots/tvlens-jusqu-ici.png),
[petite fenêtre](../screenshots/tvlens-jusqu-ici-small.png).

## Archives : premier parcours — 28 septembre 2026


Pour les essais antérieurs, voir [la validation du réexamen](reexamen-validation.md)
et [la comparaison des stratégies](strategy-comparison.md). Les relevés ci-dessous
documentent les étapes antérieures.

## Vérifications automatiques

- 13 tests Node réussis : mémoire et expiration, priorité Ask, surcharge de la file,
  erreurs fournisseur, ordre d’observation, références inventées ou hors période,
  stockage et relecture HTTP Range, isolation du cœur, budget persistant.
- Test Electron réussi avec vidéo synthétique animée et son généré : vraie capture
  MediaRecorder + AudioWorklet, WAV 16 kHz, passage via IPC, stockage sur disque,
  réponse d’un adaptateur factice et relecture du fichier WebM référencé.
- App macOS empaquetée, clé et compteur de budget absents du bundle. Configuration
  de la clé chiffrée côté processus principal via safeStorage.

## Essai réel OpenRouter

Modèle : `google/gemini-2.5-flash-lite`.
Les deux extraits de Spring (60–75 s et 120–135 s du fichier source) sont présentés
comme deux passages successifs de 15 secondes dans une session de test. Ce test
n’est pas une capture live complète du film : il valide l’adaptateur et le cœur
avec des médias réels, indépendamment du test Electron.

| Vérification | Résultat |
| --- | --- |
| Deux descriptions image + audio | Réponses structurées reçues, environ 4 s chacune |
| Question sur le présent | Référence au second passage |
| Question sur le passé | Référence au premier passage après résolution temporelle par le cœur |
| Information absente (village de naissance) | Abstention explicite |
| Expiration après avancement de l’horloge | 0 média détaillé restant, 2 résumés conservés |
| Latence Ask sur ces trois questions | 1,475 à 2,915 s |
| Coût annoncé pour ces cinq appels | 0,001646 $ |

Détails reproductibles : [live-validation.json](live-validation.json).
Ces quelques essais ne constituent pas une mesure générale d’exactitude ni de latence.
Les descriptions comportent des interprétations et peuvent confondre des objets.

## Limites constatées

- L’endpoint Nemotron gratuit a retourné `AUDIO_ABSENT` sur une phrase synthétique,
  et plusieurs requêtes ont échoué avec une erreur fournisseur. Sa modalité audio
  n’est pas validée dans cette intégration, malgré sa fiche multimodale.
- Gemini a reconnu la phrase synthétique « Le parapluie vert coûte trente-sept euros »,
  mais a transcrit « 30 euros ». La transcription précise des chiffres n’est donc
  pas validée. Ne pas brancher un debunk automatique sur ces transcriptions sans
  une étape de validation supplémentaire.
- Avant correction, une question historique a cité le présent. La référence temporelle
  est maintenant calculée par le domaine, transmise au modèle et contrôlée sur les
  citations retournées. Le cas est couvert par un test de non-régression.
- L’observation visionne des images échantillonnées; les actions courtes peuvent être
  manquées. Les médias complets restent disponibles pour comparaison humaine.
- Le contrôle interactif final sur la capture de fenêtre macOS est confirmé par
  l’utilisateur : réponse Ask reçue et relecture du bon passage après 30–45 secondes
  d’observation. L’expiration de cinq minutes reste validée par horloge simulée,
  pas par un essai utilisateur chronométré de cinq minutes.

## Vérification sourcée dans le chat — 28 septembre 2026

Les 19 tests Node passent. Le test Electron couvre le formulaire de correction,
les états de progression et d’erreur, les sources et la sauvegarde du résultat.
Un second essai dans l’interface utilise réellement Codex pour vérifier
« Le premier alunissage habité a eu lieu en 1972 » : réponse en 38,8 secondes,
trois sources NASA, affirmation contredite. La capture synthétique et Ask
(simulé pour cet essai) continuent pendant la recherche. Aucun appel OpenRouter
n’est nécessaire pour ce test. Rapport : [verification-ui-live.json](verification-ui-live.json).
Cette durée est une mesure ponctuelle, pas une garantie de latence.

## Budget des essais OpenRouter

Plafond autorisé : 1 $ pour l’ensemble des essais payants. Au dernier relevé avant
le test utilisateur, 11 appels avaient coûté 0,0034122 $ au total, sans réservation
restante. Ce total inclut le diagnostic audio et les essais ayant révélé des bugs.
Le compteur persistant se trouve dans `.local/trial-budget.json` (ignoré par Git).
