# Registre des variantes GX10 — 21 au 23 octobre 2026

Une ligne par variante testée. Chaque variante ne change **qu'une chose** par rapport à sa référence.
Le détail (plan figé, bruts, empreintes) est dans le dossier de l'essai indiqué.
Pertinence : réponses notées ≥ 2/3 sans invention par deux juges automatiques à l'aveugle, contre l'oracle v2
(établi par des modèles depuis les médias, sans relecture humaine).

Statuts : en file · en cours · fait · abandonné (avec la raison).

Les chiffres réutilisables pour le rapport, avec leur source, sont dans [`CHIFFRES.md`](CHIFFRES.md)
(version machine : [`chiffres.json`](chiffres.json)). Revues indépendantes par Codex Astra (`gpt-6-astra`, lecture seule) :
[`revues/`](revues/).

## Réglages déjà en place, notés sur les essais existants (150 réponses)

| Variante | Ce qui change | Vitesse | Pertinence | Verdict |
| --- | --- | --- | --- | --- |
| Pause vision | La vision ne démarre pas de bloc pendant une question | CNRS : médiane 21 → 13 s ; Kennedy 19 → 11 s | CNRS : 9/10 pertinentes sous 20 s, contre 2/10 | Prometteur, à confirmer à chaud |
| Whisper small | `small` au lieu de `base` | ≈ égale | Spring 4/5 contre 2/5 ; ailleurs ≈ égale | Prometteur |
| Whisper turbo | `large-v3-turbo` au lieu de `base` | +1 à 2 s | Kennedy et Artemis 5/5 ; Spring 2/5 | Mitigé |

## Variantes en test sur le GX10

E2 et E3 sont des rejeux hors ligne des requêtes capturées en E1, sur le GPU seul : les délais sont ceux du
modèle sans la vision en parallèle. Référence `qwen3.8:27b` : 9,2 s médian, 21/30 pertinentes dont 17 gardées par TVLens
(4 perdues faute de citations), 5 inventions. « Gardées » = pertinentes et acceptées par la validation des preuves.

| ID | Essai | Ce qui change | Statut | Vitesse | Pertinence | Verdict |
| --- | --- | --- | --- | --- | --- | --- |
| E1 | [Référence instrumentée](../2026-10-21-reference-instrumentee-gx10/) | rien (mesure) | fait | HTTP médian 13–24 s ; génération 10–18 s | 30/30 acquises ; notation avec E2 | Base de comparaison |
| E2-a | Modèle de questions | `qwen3.8:27b-mtp` (même modèle, MTP déjà actif) | fait | identique à la référence (9,3 s, 24 jet/s) | identique (17/30 gardées) | Sans effet : le MTP est déjà actif |
| E2-b | Modèle de questions | MoE `qwen3.6:35b-a3b` | fait | **3,5 s** contre 9,2 s (64 jet/s) | 18/30 gardées (réf. 17) ; **8 inventions** (réf. 5) | Rapide mais invente plus |
| E2-c | Modèle de questions | MoE `qwen3.6:35b-a3b-mtp` | fait | **3,1 s** contre 9,2 s (80 jet/s) | 18/30 gardées ; **7 inventions** | Le plus rapide, invente plus |
| E2-d | Modèle de questions | MoE `gemma4:26b-a4b` | fait | **4,6 s** (54 jet/s) | **20/30 gardées** (réf. 17) ; 4 inventions (réf. 5) | **Meilleur compromis → E4** |
| E2-e | Modèle de questions | MoE `qwen3.6:35b-a3b-mtp` avec raisonnement | fait | 17,7 s (1 453 jetons) | 8/30 gardées ; JSON invalide 8/30 | Écarté |
| E2-x | Modèle de questions | `qwen3.8:27b-nvfp4` | abandonné : exige MLX, indisponible sous Linux | | | |
| E3-a | Modèle de vision | `qwen3-vl:2b` | fait | 8,2 s/bloc (réf. 6,7 s), 19/36 > 8 s | JSON invalide 16/36 | Écarté |
| E3-b | Modèle de vision | `qwen3-vl:4b` (BF16) | fait | 17,0 s/bloc | JSON invalide 8/36 | Écarté |
| E3-c | Modèle de vision | `qwen3-vl:8b` | fait | 15,9 s/bloc | JSON invalide 3/36 | Écarté |
| E3-d | Modèle de vision | `gemma4:e4b` | fait | 13,7 s/bloc ; 1 223 jetons écrits (raisonnement actif) mais préremplissage le plus rapide (1,7 s) | JSON valide 36/36 | Relancé sans raisonnement (E3b) |
| E3-e | Modèle de vision | MoE `qwen3-vl:30b-a3b` | fait | 11,3 s/bloc | JSON valide 36/36 | Écarté (trop lent) |
| E3-f | Modèle de vision | `gemma3:4b` avec 3 images au lieu de 5 | fait (E3b) | 5,6 s/bloc (réf. 6,7 s), 0/36 > 8 s | justesse 1,60/3 (réf. 1,57) ; invention dans 21/36 blocs (réf. 27) | Gain de vitesse seul |
| G1-b | Outils | sans schéma JSON imposé (le modèle peut-il appeler ses outils ?) | fait (16:05–16:15 UTC) | 5,1 s pour le 1er tour (avec schéma : 11,6 s) | **outils appelés 20/20** (avec schéma : 0/40), dont 12/12 sur les questions à fait ancien | **Cause du « zéro outil » confirmée** |
| G1-c | Outils | témoin : sans outils | fait | 11,3 s | JSON valide 20/20, aucun outil (attendu) | Témoin conforme |
| G3 | Vitesse | MTP désactivé (mesure du gain du MTP actuel) | fait (16:15–16:30 UTC) | sans MTP : 11,1 jet/s et 18,4 s ; avec : 23,6 jet/s et 10,4 s | même nombre de jetons (163) | **Le MTP actuel double déjà la vitesse** |
| G4-a | Sortie vision | sans résumé cumulatif `topicSummary` | fait (16:30–17:00 UTC, `gemma3:4b`, 48 blocs × 2) | **5,2 s** contre 6,7 s ; 125 jetons contre 213 ; 0 bloc > 8 s contre 11 | summary+visual quasi inchangés (333 contre 354 car.) ; non noté | Gain de vitesse sans perte visible |
| G4-b | Sortie vision | `topicSummary` plafonné à 300 caractères | fait | 6,5 s (médiane quasi égale) mais 0 bloc > 8 s contre 11 | summary+visual inchangés | Coupe les retards extrêmes seulement |
| G2-b | [Mémoire](../2026-10-21-serie-g-gx10/) | journal compact des passages anciens ajouté au contexte | fait | 13,4 s (A 10,5 s) ; contexte 4 906 jetons (A 2 662) | **47/60 pertinentes (A 38/60) ; 6 inventions (A 14)** ; abstentions 9 (A 14) | **Gain de pertinence le plus net → E7** |
| G2-c | Mémoire | 6 passages anciens retrouvés par recherche sémantique | fait | 11,0 s (A 10,5 s) ; contexte 3 557 jetons | 41/60 pertinentes ; 11 inventions ; abstentions 10 | Gain faible |
| E3b | Modèle de vision | `gemma4:e4b` **sans raisonnement** | fait | **4,2 s/bloc** (réf. 6,7 s), 0/36 > 8 s, JSON valide 36/36 | **justesse 2,58/3 (réf. 1,57) ; invention dans 4/36 blocs (réf. 27/36)** | **Gagnant → E5** |
| E5-GPSV | [Flux réel, 6 vidéos](../2026-10-21-flux-6-videos-gx10/) | GPS + vision `gemma4:e4b` sans raisonnement | fait | médiane 6,8 s ; **30/30 sous 15 s** ; **0 bloc vision perdu** | 20/30 pertinentes, 20 sous 15 s ; 5 inventions | Égal à GPS en pertinence, vision plus robuste |
| E5-GPS | Flux réel, 6 vidéos (Kennedy, Spring, CNRS repris d'E4) | Gemma 4 + pause + Whisper small | fait | médiane 7,1 s ; 28/30 sous 15 s | **21/30 pertinentes, 20 sous 15 s** (actuel : 16/30, 3 sous 15 s) ; 5 inventions (actuel 7) | Dépassée par N2 (voir N2 et N6) |
| E4-G | [Flux réel](../2026-10-21-flux-gemma4-gx10/) (Kennedy, Spring, CNRS) | questions `gemma4:26b-a4b` | fait (3 vidéos) | médiane 12,2 / 9,1 / 12,2 s contre 19,2 / 15,2 / 24,2 s en E1 ; 12/15 sous 15 s contre 3/15 | 9/15 pertinentes dont 7 sous 15 s (E1 : 8/15, 0 sous 15 s) | Gain net |
| E4-GP | Flux réel | + pause vision | fait | médiane 7,2 / 5,2 / 7,2 s ; **15/15 sous 15 s** (max 13,3 s) | 8/15 pertinentes, toutes sous 15 s | Gain net |
| E4-GPS | Flux réel | + Whisper `small` | fait | médiane 9,4 / 5,2 / 7,9 s ; 15/15 sous 15 s (max 14,5 s) | **10/15 pertinentes, toutes sous 15 s** ; 2 inventions (E1 : 3) | Dépassée par N2 (voir N2 et N6) |
| E6-GPSVT | [Flux réel, 6 vidéos](../2026-10-21-flux-deux-phases-gx10/) | GPSV + prototype « deux phases » (1er tour sans schéma JSON, outils permis ; réponse finale avec schéma), par le proxy | fait (20:07–21:38 UTC) | médiane 5,5 à 14,3 s hors Spring ; **Spring 156 s** (max 273 s) ; Gemma 4 appelle peu d'outils (8 appels sur 30 questions), donc des relances fréquentes de la requête d'origine | 18/30 pertinentes, 17 sous 15 s (GPSV : 20 et 20) ; Spring 0/5 | **Négatif avec Gemma 4** |
| E7-GPSVJT | [Flux réel, 6 vidéos](../2026-10-21-flux-journal-deux-phases-gx10/) | GPSV + journal mémoire (proxy) + deux phases | fait (21:38–23:09 UTC) | médiane 11,8 s (GPSV 6,8 s) ; contexte 4 323 jetons (2 507) ; Spring 146 s et Tears 41 s de médiane dès que les outils sont appelés ; 3 erreurs | 17/30 pertinentes, toutes sous 15 s (GPSV renotée : 19) ; gagnées 3 questions à fait sorti de la fenêtre de 48 s ; perdues 6 à fait récent | **Négatif en combinaison → N3 isole le journal** |
| N1 | [Flux réel, 6 vidéos](../2026-10-22-variantes-nuit-gx10/) | GPS rejoué à l'identique (variabilité) | fait (23:08–00:39 UTC) | médiane 8,5 s (GPS 7,1 s) ; 29/30 sous 15 s (28) ; vision `gemma3:4b` : Artemis 37 blocs perdus (GPS 14), 67/226 blocs > 8 s | 17/30 pertinentes, 17 sous 15 s (GPS renotée : 21 et 20) ; 9 inventions ; **8 questions sur 30 basculent** | **Variabilité : ±4 réponses par passage** |
| N2 | [Flux réel, 6 vidéos](../2026-10-22-variantes-nuit-gx10/) | GPS + vision sans `topicSummary` (proxy) | fait (00:39–02:10 UTC) | **médiane 5,7 s** (GPS 7,1 s, N1 8,5 s) ; **30/30 sous 15 s** ; vision `gemma3:4b` 4,9 à 5,4 s par bloc, 1/667 bloc > 8 s, **0 bloc perdu** (GPS : 1 à 14 par vidéo) ; réécriture appliquée aux 667 blocs | **21/30 pertinentes, 21 sous 15 s** ; 4 inventions | **Meilleure variante de la nuit**, plus rapide que GPS sur 25 questions sur 30 (test des signes, p ≈ 0,0003). **Pas transposable tel quel** : `topicSummary` alimente le résumé cumulatif des cartes de la frise TV ; il faut le sortir du chemin critique (au changement de sujet, tous les N blocs ou hors pause), pas le supprimer |
| N3 | [Flux réel, 6 vidéos](../2026-10-22-variantes-nuit-gx10/) | GPS + journal mémoire seul (proxy) | fait (02:10–03:41 UTC) | médiane 9,1 s (GPS 7,1 s, N1 8,5 s) ; 25/30 sous 15 s (max 22,2 s) ; contexte 4 762 jetons ; jusqu'à 70 passages anciens injectés ; aucune erreur, aucun outil | 21/30, 18 sous 15 s ; 4 inventions ; fait hors fenêtre **4/6** (GPS 1/6), faits dans la fenêtre 17/24 (GPS 20/24) | Gain sur la mémoire, solde nul |
| N4 | [Flux réel, 6 vidéos](../2026-10-22-variantes-nuit-gx10/) | questions `qwen3.6:35b-a3b-mtp` + pause + Whisper small | fait (03:41–05:12 UTC) | médiane 6,1 s (GPS 7,1 s) ; 29/30 sous 15 s (max 18,0 s) ; 44 jetons/s en sortie ; aucune erreur ; 3 `insufficient` sur Spring | 18/30, 17 sous 15 s ; 7 inventions | Écarté |
| N5 | [Flux réel, 6 vidéos](../2026-10-22-variantes-nuit-gx10/) | GPS + vision sans `topicSummary` + journal mémoire (proxy) | fait en deux parties : Kennedy, Spring, CNRS (05:25–05:55 UTC) ; GX10 redémarrée à la main à 06:04 UTC (Bœuf coupé) ; Bœuf, Tears, Artemis repris (07:59–09:00 UTC) | médiane 6,8 s (N2 5,7 s, N3 9,1 s) ; **30/30 sous 15 s** ; 0 bloc vision perdu | 22/30 pertinentes, 22 sous 15 s ; 4 inventions ; hors fenêtre 4/6 (N2 3/6) | Égal à N2 sur 30 questions ; à départager sur 60 (J2/J3) |
| N6 | [Flux réel, 6 vidéos](../2026-10-22-variantes-nuit-gx10/) | N2 rejoué à l'identique (variabilité) | fait (09:00–10:30 UTC) | médiane 5,2 s (N2 5,7 s) ; 30/30 sous 15 s ; 0 bloc vision perdu : la vitesse de N2 se reproduit | 22/30 pertinentes, 22 sous 15 s (N2 renotée : 21) ; 7 questions basculent | **N2 confirmé** (vitesse et pertinence) |
| G5 | [Mémoire, rejeu hors ligne](../2026-10-22-journal-hors-ligne-gx10/) des 30 questions de N2 (2 passages) | journal : A sans ; B celui de N3 ; D plafonné à 3 000 car. ; E placé après les passages récents ; F = A puis B si A s'abstient. C retiré (revue Astra) | fait (10:30–10:50 UTC) | médiane A 4,2 s ; **B 5,5 s** ; D 4,7 s ; E 5,5 s | **B 49/60 (A 45), 7 inventions (A 13), mémoire 10/12 (A 4)** ; D 46 ; E 45 ; F 45 | **B choisi pour J3** ; D et E écartés |
| J1 | Flux réel, 6 vidéos | GPSV (vision `gemma4:e4b`) + vision sans `topicSummary` | reporté (revue de Codex Astra : la mémoire sur 60 questions apporte plus aujourd'hui) | | | |
| O60 | [Oracle v3](../2026-10-22-oracle-60-questions-gx10/) | 5 nouvelles questions par vidéo (30 → 60), rédigées puis vérifiées par des sous-agents depuis les médias | fait (08:02–08:40 UTC) | — | 30 nouvelles : 15 acceptées, 15 corrigées, 0 rejetée ; 19 entièrement anciennes, 2 en partie (fenêtre réelle) | Jeu de 60 questions pour les essais suivants |
| J2 | Flux réel, 6 vidéos, **60 questions** (oracle v3) | N2 (GPS + vision sans `topicSummary`), sans journal : référence à 60 questions | fait : premier départ bloqué à 10:50 UTC (`OTHER_GPU_PROCESS_ACTIVE`, modèle de G5 en déchargement), relancé 10:51–12:21 UTC | **médiane 5,0 s ; 60/60 sous 15 s ; 0 bloc perdu** | à noter (avec J3) | |
| J3 | Flux réel, 6 vidéos, 60 questions | J2 + journal complet (bras B de G5) | en cours (départ 12:21 UTC) | | | |
| J4 | Flux réel, 6 vidéos, 60 questions | J2 + `topicSummary` calculé hors du chemin critique par le proxy (vision sans le champ, puis un appel texte qui replie les blocs du sujet quand le GPU est libre) | en file (après J3) | | | |

## Connaissance extérieure et outils (priorité depuis le 22/10)

Questions dont la réponse demande internet ou un outil, notées à part des 60 questions vidéo : W (web, faits stables et
actualité datée), M (fait de la vidéo + fait extérieur), O (relecture d'images anciennes avec `inspect_clip`).

| ID | Essai | Ce qui change | Statut | Vitesse | Pertinence | Verdict |
| --- | --- | --- | --- | --- | --- | --- |
| O4 | Oracle v4 | 2–3 W, 2 M, 2 O par vidéo, rédigées puis vérifiées depuis les médias et des sources datées ; corpus web figé | en cours (départ ~12:40 UTC) | — | — | |
| S1 | [SearXNG sur la GX10](../2026-10-22-searxng-gx10/) | moteur de recherche auto-hébergé en conteneur, boucle locale, API JSON (décision de Dabi) | fait (12:41 UTC) | 3,0 s par requête | 50 résultats sur la requête de test | Prêt pour F1 |
| H1 | Hors ligne, requêtes capturées | A sans source ; B extraits du corpus injectés + champ sources ; C recherche comme outil en deux phases ; O `inspect_clip` en deux phases | en file (après J4) | | | |
| T1 | Produit | port de recherche, adaptateurs corpus et web, récupération avant la réponse, sources validées par l'adaptateur Ollama | exploration en cours ; moteur réel : SearXNG sur la GX10 (S1) | | | |
| F1 | Flux réel, catégorie W/M/O | configuration retenue + récupération (après intégration de T1) | en file | | | |
