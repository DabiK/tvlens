# Registre des variantes GX10 — 21 au 23 octobre 2026

Une ligne par variante testée. Chaque variante ne change **qu'une chose** par rapport à sa référence.
Le détail (plan figé, bruts, empreintes) est dans le dossier de l'essai indiqué.
Pertinence : réponses notées ≥ 2/3 sans invention par deux juges automatiques à l'aveugle, contre l'oracle v2
(établi par des modèles depuis les médias, sans relecture humaine).

Statuts : en file · en cours · fait · abandonné (avec la raison).

Les chiffres réutilisables pour le rapport, avec leur source, sont dans [`CHIFFRES.md`](CHIFFRES.md)
(version machine : [`chiffres.json`](chiffres.json)).

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
| E5-GPSV | Flux réel, 6 vidéos | GPS + vision `gemma4:e4b` sans raisonnement | en cours (départ 17:37 UTC) | | | |
| E5-GPS | Flux réel, Bœuf / Tears / Artemis | meilleure config E4 sur les 3 autres vidéos | en file | | | |
| E4-G | [Flux réel](../2026-10-21-flux-gemma4-gx10/) (Kennedy, Spring, CNRS) | questions `gemma4:26b-a4b` | fait (3 vidéos) | médiane 12,2 / 9,1 / 12,2 s contre 19,2 / 15,2 / 24,2 s en E1 ; 12/15 sous 15 s contre 3/15 | 9/15 pertinentes dont 7 sous 15 s (E1 : 8/15, 0 sous 15 s) | Gain net |
| E4-GP | Flux réel | + pause vision | fait | médiane 7,2 / 5,2 / 7,2 s ; **15/15 sous 15 s** (max 13,3 s) | 8/15 pertinentes, toutes sous 15 s | Gain net |
| E4-GPS | Flux réel | + Whisper `small` | fait | médiane 9,4 / 5,2 / 7,9 s ; 15/15 sous 15 s (max 14,5 s) | **10/15 pertinentes, toutes sous 15 s** ; 2 inventions (E1 : 3) | **Meilleure configuration à ce stade** |
| E6-GPSVT | Flux réel, 6 vidéos | GPSV + prototype « deux phases » (1er tour sans schéma JSON, outils permis ; réponse finale avec schéma), par le proxy | en file (après E5, ~21:00 UTC) | | | |
| E7-GPSVJT | Flux réel, 6 vidéos | GPSV + journal mémoire (proxy) + deux phases | en file (après E6, ~23:00 UTC) | | | |
