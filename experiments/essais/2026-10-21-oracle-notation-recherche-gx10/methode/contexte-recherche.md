# Contexte commun — optimisation pertinence/vitesse de TVLens sur GX10 (21 octobre 2026)

## But
Maximiser, par vidéo, la part de réponses **pertinentes** rendues en moins de 20 s (idéalement 15 s), file comprise.
La pertinence prime ; aucune variante n'est « meilleure » sans notation. Six vidéos : CNRS (FR, cours, texte à
l'écran, 14:40), Bœuf bourguignon (FR, cuisine, 12:17), Kennedy (EN, discours, 7:00), Tears of Steel (EN, fiction
dialoguée, 12:14), Artemis (EN, direct bruité, 35:00), Spring (sans dialogue, animation, 7:44). Cinq questions par
vidéo posées en cours de lecture (« now », rappel ancien, ordre d'actions, texte à l'écran…).

## Pipeline actuel (code figé 2035a2f, entièrement local)
- Flux découpé en blocs de 8 s. Par bloc : audio → whisper.cpp CUDA (`base` par défaut, 8 threads) ; 5 images
  JPEG (≤1280×720, échantillonnées à 0 ; 1,6 ; 3,2 ; 4,8 ; 6,4 s) → VLM Ollama `gemma3:4b` Q4_K_M (num_ctx 8192)
  qui produit une observation structurée (format JSON) publiée dans le contexte de session ; index d'embeddings
  `qwen3-embedding:0.6b` en arrière-plan.
- Question : modèle `qwen3.8:27b` Q4_K_M (dense 27 B, num_ctx 16384, raisonnement désactivé, température 0) via
  `/api/chat` non streamé, avec outils (recherche dans l'index, réexamen d'un clip par `gemma3:4b`). La réponse doit
  citer des moments ; une validation des preuves peut la refuser.
- Un seul service Ollama 0.40.6 (NUM_PARALLEL=1, MAX_LOADED_MODELS=3, Flash Attention, cache KV q8_0) partagé par
  vision, questions, réexamen et embeddings : la vision et Whisper (GPU) concourent avec la question.

## Mesures disponibles (délais seulement ; pertinence pas encore notée)
- Kennedy : 35 appels visuels terminés sur 38 blocs, médiane 7,27 s, moyenne 8,28 s, max 17 s par bloc de 8 s :
  la vision n'a presque pas de marge. Corpus étendu : 74 publications visuelles perdues, dont 63 par retard ;
  couverture visuelle ~94,5 %.
- Questions : délai HTTP complet ~9 à 26 s. Exemple Kennedy-01 bras A : 25,4 s pour **un seul** appel au modèle,
  sans outil. Le partage préremplissage/génération n'a jamais été mesuré (instrumentation en cours ce jour).
- Pause des nouveaux départs de vision pendant une question : Kennedy médiane 18,78 → 11,21 s, Spring 12,19 →
  9,19 s ; mais couverture visuelle Spring 91,4 % → 82,8–89,7 % ; `spring-04/06` restent `insufficient`.
- 5 → 3 images par bloc (composant perception seul, blocs figés) : 48/48 paires plus rapides, −1,5 s médiane à froid.
- Ollama vs vLLM (Qwen visuel, texte) : Ollama plus rapide sur les piles testées (formats différents).
- StreamingVLM (cache KV continu) : fonctionne sur GX10 mais 0,616× temps réel sur Spring.
- Sélection adaptative 3/5 images *shadow* (différence de miniatures 32×18) : 616/667 blocs proposés à 3 images,
  51 replis, 142 blocs « statiques » candidats au saut ; aucun appel supprimé, rappel non mesuré.
- Preuves médias : plusieurs `insufficient` relèvent du système (mémoire des faits anciens : `spring-06`,
  `cuisine-07` dont la preuve audio est nette), pas de l'oracle.

## Matériel
ASUS Ascent GX10 : NVIDIA GB10 (Blackwell, FP4/NVFP4 natif), ~121,6 Gio de mémoire unifiée, bande passante
mémoire ~273 Go/s (décodage limité par la bande passante : débit ≈ inversement proportionnel aux octets de poids
actifs par jeton), CPU ARM 20 cœurs. Ubuntu 24.04, CUDA 13, pilote 580.

## Leviers testables SANS modifier l'application
- Par rôle (vision, questions, réexamen, embeddings) : modèle, num_ctx, raisonnement on/off, keep_alive, URL.
- Whisper : modèle (base/small/medium/large-v3-turbo), threads, contexte audio, **CPU au lieu du GPU** via un binaire
  enveloppe ajoutant `-ng` ; un binaire `parakeet-cli` existe aussi dans le build whisper.cpp (non intégré).
- `visionDuringAsk` (pause des nouveaux départs de vision pendant une question).
- Préparation des blocs : images par bloc, résolution (scale), qualité JPEG, durée de bloc.
- Réglages du service Ollama (parallélisme, nombre de modèles chargés, cache KV) — en consignant tout changement.
- Un **proxy** entre TVLens et Ollama : mesure aujourd'hui ; un prototype pourrait y réécrire une requête (images
  retenues, options `num_predict`, modèle) pour tester une hypothèse avant tout changement de code. Il doit alors
  être présenté comme prototype, pas comme le produit.
- Rejeu hors ligne des requêtes capturées (questions, vision) sur d'autres modèles : isole l'effet du modèle.

## Modèles candidats disponibles dans Ollama (tags exacts, tailles)
Questions : `qwen3.8:27b-mtp-q4_K_M` (même modèle + prédiction multi-jetons, 18 Go), `qwen3.8:27b-nvfp4` (18 Go),
`qwen3.6:35b-a3b-q4_K_M` (MoE ~3 B actifs, 24 Go), `qwen3.6:35b-a3b-mtp-q4_K_M` (23 Go), `gemma4:26b-a4b-it-q4_K_M`
(MoE ~4 B actifs, 18 Go), `gpt-oss:20b`, `qwen3:14b`, `qwen3.5:35b-a3b`, etc.
Vision : `gemma3:4b` (référence), `qwen3-vl:2b-instruct-q4_K_M` (1,9 Go), `qwen3-vl:4b-instruct-bf16` (installé),
`qwen3-vl:8b-instruct-q4_K_M` (6,2 Go), `gemma4:e4b-it-q4_K_M` (6,6 Go), `gemma4:e2b`, `qwen3-vl:30b-a3b-instruct-q4_K_M`
(MoE, 20 Go). Téléchargement en cours ~18 Mo/s (≈20 min par gros modèle).
Fenêtre GX10 : jusqu'au 23 octobre environ ; le GPU est la ressource rare, un seul essai GPU à la fois.

## Évaluation prévue
Oracle v2 automatique établi depuis les médias (transcription large-v3-turbo, SRT officiel, images toutes les 2 s),
puis notation à l'aveugle de chaque réponse par plusieurs juges indépendants (0–3, invention, abstention justifiée),
calibrée par l'accord entre juges. Métrique principale par vidéo : part pertinente (≥ 2/3, sans invention) sous
20 s et sous 15 s ; aussi p50/p95, inventions, abstentions, fraîcheur des preuves, couverture visuelle.
