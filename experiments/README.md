# Expérimentations : perception, flux et contexte

La livraison à trois jours est désormais pilotée par le [PRD / roadmap V2](../docs/PRD-V2.md). Le présent dossier conserve les pistes de recherche ; son registre n’est pas une liste de travaux à exécuter intégralement pour la V2.

État au 12 octobre 2026 : **préparation documentaire, aucune expérience exécutée**. Ce dossier consolide les intentions de l’utilisateur et les enseignements critiqués des analyses indépendantes Astra et Claude Fable. Il ne constitue ni une spécification d’implémentation ni une décision de modèle. Aucun benchmark, installation, connexion GX10 ou changement de code n’est autorisé par cette étape documentaire.

## Intentions exprimées par l’utilisateur

1. **Comparer images et vidéo.** Évaluer l’information sémantique récupérée, la compréhension des mouvements et de l’ordre temporel, le délai, le calcul et l’intérêt produit. Distinguer couverture de la capture et capacité d’interprétation du modèle. Un fichier vidéo ne garantit pas un traitement temporel dense.
2. **Explorer un harness asynchrone de bout en bout.** Continuer l’ingestion ; rendre les traitements indépendants lorsqu’ils sont décorrélables ; servir chaque preuve utile dès sa disponibilité. Une transcription ou une observation visuelle partielle ne doit pas attendre inutilement toutes les autres modalités. L’objectif est de supprimer les attentes évitables et de minimiser le chemin entre arrivée et utilisation des données, en mesurant contention et régulation de charge. Ce n’est pas une promesse de zéro goulot ni une demande de parallélisme illimité.
3. **Explorer la navigation agentique du contexte.** Donner éventuellement à l’agent d’analyse des outils pour retrouver des checkpoints historiques, la transcription et les preuves visuelles d’un passage, sans charger d’emblée un contexte superflu. Comparer contexte automatique, récupération ciblée et hybride. Il ne s’agit pas d’une exigence d’extraction de « métadonnées vidéo ».

Les futurs essais peuvent utiliser un GX10 distant. L’inférence est alors locale à cette machine, mais le transfert depuis la capture reste distant et fait partie du délai. L’ambition à terme est une machine proche et maîtrisée si le bénéfice est confirmé. Le maintien provisoire de services Codex dans une baseline ne fait pas du cloud la cible définitive.

Les modalités à comparer sont audio isolé, visuel isolé et combinaison synchronisée lorsque pertinente. Aucun modèle omni n’est choisi. Le comportement produit doit rester vérifiable : ancrages temporels, absence de futur, scopes, citations et provenance, abstention, mémoire et lacunes, outils et web lorsque le scénario les exige.

## Lire et prolonger ce dossier

| Document | Rôle |
| --- | --- |
| [Registre des expériences](registre.md) | Questions, hypothèses, baselines, variantes, mesures et critères encore ouverts. |
| [Options du harness et des outils contextuels](harness-et-contexte.md) | Dépendances actuelles, publication partielle, causalité, ordonnancement et navigation ; aucune architecture imposée. |
| [Bibliographie primaire commentée](bibliographie.md) | Ce que les travaux scientifiques permettent de tester et ce qu’ils ne démontrent pas pour TV Lens. |
| [Essais exécutés](essais/README.md) | Configuration exacte, résultats bruts, limites et incidents de chaque essai réellement lancé, dont les contrôles réels qui suivent les tickets critiques ; index daté dans [essais/README.md](essais/README.md). |
| [Campagnes GX10 et passation](gx10/README.md) | Kit des campagnes de la GX10 (exécuteur, installation, corpus, plan) et état du projet pour reprendre le travail. |

L’ordre du registre est une **proposition de travail de l’analyse**, pas un ordre d’exécution approuvé. Les seuils, corpus, budgets et modèles restent à définir. Toute nouvelle exécution devra ajouter sa configuration exacte, ses résultats, échecs et limites ; ne pas remplacer « inconnu » par une estimation présentée comme mesure.

## Point de départ observé

Révision examinée : `3d2e320760c6dfa46de19504cede23b5c45c0225`. Ces constats sont datés et devront être revérifiés avant un essai.

- Le [chemin Mac](../app/recording.js) conserve un média natif ; le [chemin LG](../tv/capture.py) acquiert quatre captures espacées d’environ deux secondes par bloc audio de huit secondes. La [reconstruction LG](../adapters/remote-media.cjs) ne restitue pas les images absentes.
- La [session](../core/session.cjs) publie l’audio avant la vision, mais n’enfile la vision du même segment qu’après sa transcription. Audio et vision de segments différents peuvent se chevaucher. Une question empêche de nouveaux départs vision ; un travail déjà lancé peut finir.
- Le [chat possède déjà](../core/video-tools.cjs) `search_moments`, `get_transcript` et `inspect_clip`, avec bornes et disponibilité des médias. La [perception](../adapters/codex-perception.cjs) reçoit du contexte fourni par l’application et demande explicitement de ne consulter aucun outil. L’expérimentation porte notamment sur ce second rôle.
- Les [mesures historiques](../docs/validation.md) ne sont pas un benchmark GX10 ni un essai de concurrence complet. Neuf segments français ont un temps moyen ASR de 5,182 s pour environ huit secondes d’audio : coût de fraîcheur réel, pas preuve que l’ASR seul ne tient jamais le débit.

Les analyses indépendantes originales sont conservées hors dépôt ; leurs recommandations ne sont pas des décisions utilisateur. Cette documentation synthétise leurs constats recoupés et renvoie aux sources primaires, sans dépendre de chemins privés pour être lisible.
