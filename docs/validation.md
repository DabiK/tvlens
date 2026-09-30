# Validation

## Préparation à la publication

114 tests Node réussis après ajout de deux régressions : résolution des exécutables via PATH/override et configuration facultative avec compteurs dans un dossier inscriptible. Les essais VPS ci-dessous restent les mesures de la version effectivement déployée ; la publication ne redéploie pas les appareils existants.

## État actuel — companion LG et VPS privé, 30 septembre 2026

| Périmètre | Résultat et portée |
| --- | --- |
| Node | 112 tests réussis sur Mac et Linux : domaine, ports, file, mémoire, miniatures et routes authentifiées |
| Python | 5 tests contrôleur/transport et 7 tests géométrie réussis ; inclut 24 demandes de disposition concurrentes |
| UI LG | Smoke historique et frise réussis : focus, dictée simulée, détail, paroles, question attachée, suivi du direct et purge |
| Fournisseurs réels | Whisper, Luna, chat Codex, outils, FIFO, fil partagé, pause/reprise et réexamen : [rapport Mac](tv-timeline-live-report.json), [rapport VPS](vps-live-report.json) |
| TV réelle → VPS | 24 s, 12 images, 3 tranches reçues, aucun abandon/retry/erreur ; trois observations et une réponse avec citation |
| Retour utilisateur | Frise confirmée sur la LG ; nouveau parcours via VPS également confirmé |
| Accès réseau | Écoute uniquement sur IP Tailscale ; sans jeton : 401 ; port public inaccessible lors du test depuis le Mac |
| Persistance | Services TVLens et Tailscale activés sur VPS ; démarrage Tailscale configuré sur TV. Reboot complet non testé |

**Latence VPS :** 19,559 s, 21,778 s et 15,447 s pour trois blocs de 8 secondes. Le chemin fonctionne mais ce débit ne prouve pas la tenue d’un flux continu. Ne pas présenter les 24 secondes de capture sans perte comme 24 secondes d’analyse sans retard.

Échecs et corrections : perte de suivi du direct lors d’un regroupement de cartes corrigée ; course entre demandes de disposition corrigée ; test concurrent initial mal isolé corrigé. Sur la TV, le groupe `wam` n’existe pas : l’appairage VPS a repris UID/GID de la sauvegarde. Les détails sont dans [la frise](lg-timeline.md) et [le déploiement](vps-deployment.md).

Les tests UI utilisent des modèles simulés ; les tests fournisseurs sont séparés. Les questions du corpus historique d’actions ne prouvent pas automatiquement la qualité de Luna. Aucun résultat GX10, caméra externe, Netflix/Prime ou embeddings multimodaux n’est revendiqué.

## Historique — refonte Mac et présentation du dépôt

- **97 tests Node réussis** (`npm test`).
- **Parcours Electron réussi sur Mac** (`npm run test:electron`) après extraction du rendu de récapitulatif dans `app/ui/recap-view.js`. Capture synthétique et modèles simulés pour cette suite.
- **Essai réel de présentation réussi** sur Spring : perception, chat et récapitulatif Codex, transcription Whisper locale. Quatre captures de la vraie interface sont dans [screenshots/current](../screenshots/current/README.md). Détails : [showcase-validation.json](showcase-validation.json).
- La vidéo est lue depuis un fichier et recapturée dans une instance isolée ; cet essai ne valide pas la capture système macOS ni les dialogues, absents du film.
- Le retard de perception est visible. Le temps d’une réponse sur un court extrait ne constitue pas un benchmark.
- Échecs conservés : premier script de capture interrogé avant création de session ; attentes asynchrones donnant des captures prématurées, remplacées après correction du polling. Un premier parcours Electron a expiré en attente de lecture du média ; le parcours complet suivant est passé sans modification de la relecture. Cette intermittence reste à surveiller.

Les sections suivantes conservent les résultats historiques et ne décrivent pas nécessairement les modèles ou budgets actuels.

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
