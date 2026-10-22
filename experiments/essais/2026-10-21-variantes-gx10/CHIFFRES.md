# Chiffres clés GX10 pour le rapport

Mis à jour à chaque résultat. Chaque chiffre renvoie à son essai ; la version machine est
[`chiffres.json`](chiffres.json). Pertinence : oracle v2 et juges automatiques (modèles), sans relecture humaine.
« Gardée » : réponse pertinente (≥ 2/3, sans invention) que TVLens accepte aussi (citations remplies).

## Matériel et configuration de référence

| Chiffre | Valeur | Source |
| --- | --- | --- |
| Mémoire unifiée GB10 | ~121,6 Gio | [préparation](../2026-10-20-preparation-gx10/) |
| Configuration produit | Whisper `base`, vision `gemma3:4b`, questions `qwen3.8:27b`, blocs de 8 s à 5 images | [E1](../2026-10-21-reference-instrumentee-gx10/) |
| MTP du modèle de questions | déjà actif (`draft_num_predict 4`) ; il **double** la génération : 23,6 contre 11,1 jet/s, 10,4 contre 18,4 s (G3) | `ollama show`, 21/10 12:07 UTC ([E2](../2026-10-21-questions-hors-ligne-gx10/)) |
| Surcoût du proxy de mesure | ~1 ms par requête (7,5 → 8,5 ms) | [E1, `proxy-overhead.json`](../2026-10-21-reference-instrumentee-gx10/bruts/proxy-overhead.json) |

## Où passe le temps (E1, flux réel, six vidéos)

| Chiffre | Valeur | Source |
| --- | --- | --- |
| Délai HTTP médian d'une question | 13,2 s (Tears) à 24,2 s (CNRS) | [E1](../2026-10-21-reference-instrumentee-gx10/analyse-e1.json) |
| Génération de la réponse | 10–18 s, à 10–14 jetons/s en flux | E1 |
| Même modèle seul sur le GPU | 24 jetons/s, 9,2 s médian | [E2](../2026-10-21-questions-hors-ligne-gx10/) |
| Préremplissage d'une question | 2,8–5,7 s (2 100–2 700 jetons de contexte) | E1 |
| Chargement à froid du modèle de questions | 13,4 s à la première question | E1 Kennedy |
| Vision par bloc de 8 s | médiane 6,0–7,4 s ; 129 appels sur 612 au-delà de 8 s | E1 |
| Part de `topicSummary` dans la sortie vision (inutile aux questions, mais résumé cumulatif des cartes de la frise TV) | 32–44 % | E1 ; usages produit : `core/memory/lanes.cjs:297`, `core/perception-context.cjs:59`, `docs/lg-timeline.md` |
| Blocs de vision perdus | 1 à 14 par vidéo | E1 |
| Appels d'outils par le modèle de questions | 0 sur 180 questions (E1 + 150 archivées) | E1, [audit](../2026-10-21-audit-nuit-gx10/) |
| **Mémoire : journal compact injecté (G2, 30 questions × 2)** | 47/60 pertinentes contre 38/60 ; inventions 6 contre 14 ; +2,9 s (13,4 contre 10,5 s) | [série G](../2026-10-21-serie-g-gx10/) |
| Mémoire : 6 passages retrouvés par recherche (G2) | 41/60 pertinentes ; inventions 11 ; +0,5 s | série G |
| Cause : le schéma JSON imposé bloque les outils | avec schéma 0/40 appels ; sans schéma 20/20 (dont 12/12 sur faits anciens) | G1 (`qwen3.8:27b`, 10 questions × 2) |
| Contexte vu par une question | 6 derniers passages (48 s) ; 6 questions sur 30 demandent un fait plus ancien (fenêtre réelle [P − 56 s, P − 8 s)) | code `core/video-tools.cjs`, oracle v2 |

## Pertes de pertinence identifiées

| Chiffre | Valeur | Source |
| --- | --- | --- |
| Réponses justes rejetées par la validation (citations vides) | 3/5 sur Kennedy en E1 ; 2/150 dans les essais antérieurs | E1, `core/deep-ask.cjs:242-255` |
| Citations non remplies, modèle actuel | 9/30 (rejeu) | E2 |
| Citations non remplies, MoE | 2/30 | E2 |
| Abstentions injustifiées (essais antérieurs) | 21/150 | [notation v0](../2026-10-21-oracle-notation-recherche-gx10/notation-v0/) |
| Inventions, vidéo cuisine (essais antérieurs) | 3–4 réponses sur 5 | notation v0 |

## Résultat principal (E5, flux réel, six vidéos, 30 questions)

| Configuration | Pertinentes | dont sous 15 s | Inventions | Abstentions injustifiées | Délai médian | Blocs vision perdus |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| Actuelle (E1) | 16/30 | **3** | 7 | 10 | 17,5 s | 1 à 14 par vidéo |
| **Gemma 4 + pause + Whisper small (GPS)** | **21/30** | **20** | 5 | 3 | 7,1 s | 1 à 14 par vidéo |
| GPS + vision `gemma4:e4b` sans raisonnement (GPSV) | 20/30 | 20 | 5 | 6 | 6,8 s | **0** |
| GPSV + répondeur en deux phases (E6) | 18/30 | 17 | 6 | 6 | 9,3 s | Spring : médiane 156 s |
| GPSV + journal mémoire + deux phases (E7) | 17/30 | 17 | 6 | 7 | 11,8 s | Spring 146 s, Tears 41 s ; 3 erreurs |

Source : [E5](../2026-10-21-flux-6-videos-gx10/), notation à l'aveugle d'E1, GPS et GPSV dans un même paquet (GPS de
Kennedy, Spring et CNRS repris d'E4). Pertinentes sous 15 s : de 3 à 20 sur 30. [E6](../2026-10-21-flux-deux-phases-gx10/)
et [E7](../2026-10-21-flux-journal-deux-phases-gx10/) sont notés chacun contre GPSV dans leur propre paquet ; GPSV y
obtient 20/30 puis 19/30, soit une réponse d'écart d'un paquet à l'autre.

## Nuit du 22 octobre : variantes de GPS (six vidéos, un seul paquet de notation)

| Variante | Pertinentes | dont sous 15 s | Inventions | Délai médian | Blocs vision perdus | Fait hors fenêtre / dans la fenêtre |
| --- | ---: | ---: | ---: | ---: | --- | --- |
| GPS (E4/E5, renotée) | 21/30 | 20 | 5 | 7,1 s | 1 à 14 par vidéo | 1/6 · 20/24 |
| N1 : GPS rejoué à l'identique | 17/30 | 17 | 9 | 8,5 s | 0 à 37 | 2/6 · 15/24 |
| **N2 : vision sans `topicSummary`** | **21/30** | **21** | **4** | **5,7 s** | **0** | 2/6 · 19/24 |
| N3 : journal mémoire seul | 21/30 | 18 | 4 | 9,1 s | 0 à 25 | **4/6** · 17/24 |
| N4 : questions `qwen3.6:35b-a3b-mtp` | 18/30 | 17 | 7 | 6,1 s | 0 à 16 | 1/6 · 17/24 |
| N5 : N2 + journal mémoire | 22/30 | 22 | 4 | 6,8 s | 0 | 4/6 · 18/24 |
| N6 : N2 rejoué à l'identique | 22/30 | 22 | 5 | 5,2 s | 0 | 3/6 · 19/24 |

N1 à N4 sont notés dans un premier paquet ; N5 et N6 dans un second, avec GPS et N2, qui y obtiennent 21/30 chacun.

| Chiffre | Valeur | Source |
| --- | --- | --- |
| **Variabilité d'un passage à l'autre** | GPS rejoué : 8 questions sur 30 basculent (21 puis 17) ; N2 rejoué : 7 (21 puis 22) | [nuit](../2026-10-22-variantes-nuit-gx10/) |
| Vision `gemma3:4b` sans `topicSummary`, dans le flux | 4,9–5,4 s par bloc ; 1 bloc sur 667 au-delà de 8 s | nuit, N2 |
| N2 plus rapide que GPS, question par question | 25 sur 30 (test des signes, p ≈ 0,0003) ; que N1 : 26 sur 30 | nuit, N2 |
| Condition pour le produit | `topicSummary` sert aux cartes de la frise TV et au contexte de la vision suivante : le calculer hors du chemin critique (changement de sujet, tous les N blocs, hors pause) plutôt que le supprimer | code, `docs/lg-timeline.md` |
| Contexte des questions avec journal | 4 762 jetons (GPS ≈ 2 500) ; +2 s par question | nuit, N3 |
| Questions qui demandent un fait hors de la fenêtre de 48 s (fenêtre réelle [P − 56 s, P − 8 s)) | 6 sur 30 en partie, aucune entièrement ; oracle v3 : 19 entièrement et 2 en partie sur les 30 nouvelles | nuit, [oracle v3](../2026-10-22-oracle-60-questions-gx10/) |

Source : [nuit du 22 octobre](../2026-10-22-variantes-nuit-gx10/). Un passage par variante : en dessous de 4 à
5 réponses, un écart de pertinence n'est pas un signal.

## Premier résultat (E4, flux réel, Kennedy + Spring + CNRS, 15 questions)

| Configuration | Pertinentes | dont sous 15 s | Inventions | Abstentions injustifiées | Délai médian |
| --- | ---: | ---: | ---: | ---: | ---: |
| Actuelle (E1) | 8/15 | **0** | 3 | 7 | 19,2 s |
| Questions `gemma4:26b-a4b` | 9/15 | 7 | 2 | 2 | 12,2 s |
| + pause vision | 8/15 | 8 | 2 | 4 | 7,2 s |
| **+ Whisper `small`** | **10/15** | **10** | 2 | 2 | 7,0 s |

Source : [E4](../2026-10-21-flux-gemma4-gx10/), notation à l'aveugle E1 et E4 dans le même paquet. Un passage par
configuration, réglages ajoutés un par un ; Spring reste faible dans toutes les configurations (1/5 au mieux).

## Variantes testées

| Variante | Vitesse | Pertinence | Source |
| --- | --- | --- | --- |
| Questions `qwen3.8:27b` (référence, modèle seul) | 9,2 s médian | 17/30 gardées, 5 inventions | E2 |
| **Questions `gemma4:26b-a4b` (MoE)** | **4,6 s** (×2) | **20/30 gardées**, 4 inventions | E2 |
| Questions `qwen3.6:35b-a3b-mtp` (MoE) | 3,1 s (×3) | 18/30, 7 inventions | E2 |
| Questions `qwen3.6:35b-a3b` (MoE) | 3,5 s | 18/30, 8 inventions | E2 |
| Questions avec raisonnement (MoE Qwen) | 17,7 s | 8/30, JSON invalide 8/30 | E2 |
| **Flux réel, questions `gemma4:26b-a4b` (E4-G, provisoire)** | médiane Kennedy 12,2 s, Spring 9,1 s, CNRS 12,2 s (E1 : 19,2 / 15,2 / 24,2 s) ; 12/15 sous 15 s contre 3/15 | `insufficient` 2/15 contre 7/15 ; 0 rejet par la validation contre 3 ; pertinence à noter | E4, 21/10 15:02 UTC |
| **Flux réel, gemma4 + pause vision (E4-GP)** | médiane Kennedy 7,2 s, Spring 5,2 s, CNRS 7,2 s ; **15/15 sous 15 s**, max 13,3 s | à noter | E4, clos 15:50 UTC |
| Flux réel, gemma4 + pause + Whisper small (E4-GPS) | médiane 9,4 / 5,2 / 7,9 s ; 15/15 sous 15 s, max 14,5 s | à noter | E4 |
| Blocs vision perdus en E4 (par passage) | 1 dans 6 passages, 12 dans 3 (E1 : 1 / 14 / 14 sur ces vidéos) | — | E4 |
| Pause vision pendant une question (essais antérieurs) | CNRS 21 → 13 s ; Kennedy 19 → 11 s | CNRS 9/10 pertinentes sous 20 s contre 2/10 | [nuit](../2026-10-20-nuit-gx10/), [pause](../2026-10-21-confirmation-pause-vision-gx10/) ; gain Kennedy surestimé (démarrage à froid, audit) |
| Whisper `small` au lieu de `base` (essais antérieurs) | ≈ égal | Spring 4/5 contre 2/5 | [référence](../2026-10-20-reference-gx10/), notation v0 |
| Vision `gemma3:4b` (référence, modèle seul, 36 blocs) | 6,7 s/bloc, 3/36 > 8 s | JSON valide 36/36 | [E3](../2026-10-21-vision-hors-ligne-gx10/) |
| Vision `qwen3-vl` 2b / 4b / 8b / 30b-a3b | 8,2 / 17,0 / 15,9 / 11,3 s/bloc | JSON invalide 16 / 8 / 3 / 0 sur 36 | E3 |
| Vision `gemma4:e4b` (raisonnement actif) | 13,7 s/bloc, 1 223 jetons ; préremplissage 1,7 s (le plus rapide) | JSON valide 36/36 | E3 |
| **Vision `gemma4:e4b` sans raisonnement** | **4,2 s/bloc** (réf. 6,7 s), 0/36 > 8 s | **justesse 2,58/3 contre 1,57 ; couverture 2,11 contre 1,65 ; invention dans 4/36 blocs contre 27/36** | [E3b](../2026-10-21-vision-hors-ligne-gx10/complement/) |
| Vision sans `topicSummary` (`gemma3:4b`, G4) | 5,2 s/bloc contre 6,7 s ; 125 jetons contre 213 ; 0/96 > 8 s contre 11/96 | summary+visual quasi inchangés ; non noté | G4 |
| Vision avec `topicSummary` plafonné à 300 car. (G4) | 6,5 s/bloc ; 0/96 > 8 s contre 11/96 | inchangés | G4 |
| Vision `gemma3:4b` avec 3 images | 5,6 s/bloc, 0/36 > 8 s | justesse 1,60/3 ; invention dans 21/36 blocs | E3b |
| Vision actuelle `gemma3:4b` : blocs avec au moins une invention | — | 27/36 (exemples : « Kennedy tient le drapeau », citation d'un passage antérieur) | E3b |
| Blocs envoyés avec 3 images seulement par le produit | 8/36 | — | E3 |
| 5 → 3 images par bloc (composant vision) | −1,5 s médian à froid, 48/48 paires plus rapides | non notée | [images](../2026-10-21-confirmation-images-gx10/) |

## Qualité des travaux de la nuit (audit)

| Chiffre | Valeur | Source |
| --- | --- | --- |
| Chiffres publiés recalculés depuis les bruts | 221 confirmés, 17 écarts, 21 invérifiables | [audit](../2026-10-21-audit-nuit-gx10/) |
| Sceaux SHA-256 sur la GX10 | 30/30 intacts | audit |
| Attendus v1 face aux médias (oracle v2) | 21 confirmés, 8 corrigés, 1 mal posé (`spring-04`) | [oracle v2](../2026-10-21-oracle-notation-recherche-gx10/oracle/) |
| Accord des deux juges automatiques | 138/138 notes identiques (notation v0) | [notation v0](../2026-10-21-oracle-notation-recherche-gx10/notation-v0/) |
