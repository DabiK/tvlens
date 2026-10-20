# Référence exploratoire GX10 — 20 octobre 2026

Objectif : mesurer la configuration locale actuelle sur CNRS, Kennedy et Spring entiers, avant de varier un rôle.
Configuration : SHA 2035a2faad499659bcdf940c6104e50e311a9cd6, Whisper base CUDA 8 threads,
Gemma3 4B, Qwen3.8 27B, embeddings Qwen3 0.6B ; détails dans config.env.
Blocs de 8 s, 5 images, toutes les conversions terminées avant inférence ; aucune boucle vidéo.
Les questions seules sont transférées. Les attendus restent sur le Mac.

Le propriétaire a clarifié vouloir lancer les variations prévues, sans étape de correction préalable.
Les références sont gelées provisoirement, non validées pour notation ; aucun classement qualité.
Les questions existantes sont conservées ; readyForScoring reste false.
État froid/chaud non normalisé : relever les modèles résidents avant chaque passage, sans décharger le service.
Les services existants sont conservés ; pas de second serveur Ollama, pas de capture TV ni de VPS.
Firefox et le bureau distants sont présents : charge de fond à conserver dans les relevés.

État au 20 octobre, 21:29 UTC : préparation et neuf campagnes terminées. Le lot est exploitable pour
les mesures techniques ; la pertinence n'est pas notée tant que les fiches de référence ne sont pas
validées pour notation (`readyForScoring=false`). Pas de contrôle global produit exécuté.
Dossier distant : /home/nvidia/tvlens-setup/reference-2026-10-20.

Lot : neuf campagnes, Whisper base/small/large-v3-turbo × CNRS/Kennedy/Spring.
Chaque variante ne change que le poids Whisper. Même code, mêmes médias et questions.
Préparations et validations avant les mesures ; journaux système toutes les 5 secondes,
configurations, digests, sorties, erreurs, codes de sortie et rapports campaign.json conservés.
Aucun tri par réussite ; chaque échec reste dans index.log. Froid/chaud non normalisés.
Les variations vision/questions et extension aux trois autres vidéos restent à exécuter après ce lot.

Lancement confirmé : sessions tmux tvlens-reference-preparation et tvlens-variations.
L’orchestrateur attend la fin des trois conversions puis valide les scénarios avant toute inférence.
Les neuf campagnes tournent séquentiellement et survivent à la fermeture SSH.
Preuve de démarrage : lancement.txt. Syntaxe Bash et Node vérifiée, contrôle global non lancé.
Rapports bruts : dossier distant indiqué plus haut, sous <modèle>-<vidéo>/run/campaign.json.
Pour arrêter proprement le runner, envoyer SIGTERM à son PID, puis arrêter l’orchestrateur pour éviter la campagne suivante.

## Rapatriement progressif

Les 129 fichiers de résultats et journaux clos (32 759 181 octets) sont copiés dans
[`preuves/rapatriement-20261020/`](preuves/rapatriement-20261020/). Une comparaison `rsync --checksum`
après copie n'a signalé aucun écart. [`l'inventaire SHA-256`](preuves/rapatriement-20261020-inventaire.json)
donne l'empreinte et la taille de chaque fichier. Médias, copies de blocs, envois, `.env`, archives
et premier essai Spring interrompu restent sur le GX10 ; ce rapatriement intermédiaire ne prétend
donc pas être l'archive complète de la référence. L'archive complète sera vérifiée en fin de nuit.

## Incident de préparation Spring

Le premier lancement s’est arrêté avant toute inférence : TVLENS_VIDEO_IMAGE_MISSING dans
le dernier bloc de Spring, après 464000 ms converties sur 464170 ms annoncées par ffmpeg.
La tentative et ses journaux restent dans preparation-spring-echec-fin-video côté GX10.
Nouvelle conversion bornée explicitement à 464000 ms, sans modifier ni valider artificiellement
la sortie partielle. Les 170 dernières millisecondes sont exclues ; dernière question à 372000 ms.
CNRS et Kennedy étaient complets et sont réutilisés. Première sortie orchestrateur conservée
dans execution-premiere-tentative.log.
