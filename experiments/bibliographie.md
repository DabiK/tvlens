# Bibliographie primaire et hypothèses transposables

Sources revérifiées le 12 octobre 2026 à partir des papiers et dépôts d’auteurs. Sélection issue des recherches indépendantes Astra/Fable et de leur confrontation ; les références supplémentaires non recoupées du rapport brut ne sont pas reprises ici. Les résultats sont ceux des auteurs, jamais des mesures TV Lens ou GX10. Aucun classement inter-papiers n’est justifié par des scores obtenus avec des corpus, modèles et budgets différents.

## Préserver le mouvement sans tout envoyer au gros modèle

**[SlowFast Networks for Video Recognition](https://arxiv.org/abs/1812.03982)** — [code officiel](https://github.com/facebookresearch/SlowFast). Deux voies associent sémantique spatiale lente et observation temporelle rapide à peu de canaux. Les résultats concernent reconnaissance et détection d’actions. Hypothèse E01/E02 : une voie temporelle légère peut préserver des indices de mouvement à coût réduit. Limite : classes d’actions, pas QA ouverte ; aucune latence complète TV Lens démontrée.

**[MoViNets: Mobile Video Networks for Efficient Video Recognition](https://arxiv.org/abs/2103.11511)** — [implémentations officielles](https://github.com/tensorflow/models/tree/master/official/vision). Des tampons de flux et opérations causales bornent la mémoire sur les longues séquences. Les auteurs mesurent classification d’actions et efficacité sur leurs matériels. Hypothèse E01/E04 : observer fréquemment avec état borné peut être dissocié d’un raisonnement lourd. Limite : reconnaissance à classes prédéfinies ; performances CPU/GPU du papier non transférables au GX10.

**[TimeChat-Online](https://arxiv.org/abs/2504.17343)** — [code officiel](https://github.com/yaolinli/TimeChat-Online). Le filtrage différentiel retire des tokens visuels redondants après encodage initial ; les auteurs rapportent 82,8 % de tokens en moins avec environ 98 % de leur performance StreamingBench dans la configuration étudiée à 1 fps. Hypothèse E02 : réduire le coût aval tout en préservant des changements. Limite : ce n’est ni 82,8 % de captures ni de tout le calcul économisés ; un geste absent à l’acquisition reste absent.

## Dissocier observation, mémoire et réponse

**[Flash-VStream: Efficient Real-Time Understanding for Long Video Streams](https://arxiv.org/abs/2506.23825)** — [code officiel](https://github.com/IVGSZ/Flash-VStream). Un processus maintient des mémoires de synopsis et de détails, un autre répond aux questions. Le résultat de latence inférieur à une seconde concerne question → premier token, sur A100 BF16 et budget visuel borné. Hypothèse E03/E04 : découpler l’entretien de la mémoire du décodage des réponses. Limite : disponibilité des preuves, capture et transfert ne sont pas couverts par ce seul chiffre ; le processus visuel peut lui-même prendre du retard.

**[StreamingVLM](https://arxiv.org/abs/2510.09608)** — [code officiel](https://github.com/mit-han-lab/streaming-vlm). Cache KV borné, attention sinks et fenêtres texte/vision différentes, avec entraînement adapté au flux. Les auteurs rapportent jusqu’à 8 fps sur H100. Hypothèse E04/E05 : un état interne borné peut réduire les recalculs de préfixes. Limite : modèle spécialisé notamment en commentaire sportif anglais ; les anciennes représentations visuelles sont évincées. Ce cache n’équivaut pas à un historique de preuves navigable et ne valide ni le français ni le débit GB10.

**[Towards Sparse Video Understanding and Reasoning — ReViSe](https://arxiv.org/abs/2602.13602)**. Sélection itérative de nouvelles images et état distinguant observations, hypothèses et incertitudes. Le travail étudie une variante utilisable sans entraînement et une variante entraînée : leurs gains ne sont pas interchangeables. Hypothèse E05 : une récupération ciblée peut éviter du contexte superflu. Limite : travailler sur une vidéo disponible ne démontre pas une bonne fraîcheur en flux réel ; plusieurs tours de sélection ajoutent une latence à mesurer.

## Évaluer la qualité temporelle et l’apport des modalités

**[TemporalBench: Benchmarking Fine-grained Temporal Understanding for Multimodal Video Models](https://arxiv.org/abs/2410.10818)**. Évalue notamment fréquence d’action, amplitude du mouvement et ordre des événements. Les auteurs montrent que ces détails restent difficiles pour les modèles étudiés. Usage E01/E02 : concevoir des questions temporelles discriminantes, au-delà d’une description statique. Limite : les scores historiques ne caractérisent pas les modèles actuels ; annotations et jugement humain restent nécessaires pour le corpus TV Lens.

**[StreamingBench: Assessing the Gap for MLLMs to Achieve Streaming Video Understanding](https://arxiv.org/abs/2411.03628)**. Questions posées à différents instants, couvrant compréhension visuelle, multi-source et contextuelle. Usage E03–E06 : construire des questions ancrées dans un préfixe de flux. Limite : une QA sur préfixe ne mesure pas à elle seule encodage en temps réel, réseau, concurrence et retard ; ajouter le replay causal du [registre](registre.md).

**[Qwen3-Omni Technical Report](https://arxiv.org/abs/2509.17765)**. Compréhension de plusieurs modalités et architecture Thinker/Talker. Usage E06 : candidat conceptuel pour comparer audio brut synchronisé et transcript + vision. Limite : le chiffre de 234 ms mis en avant concerne un premier paquet de parole dans un cadre théorique spécifique, pas une réponse vidéo complète sourcée ; aucune compatibilité ou performance GX10 n’est validée ici. Ce papier ne constitue pas un choix de modèle.

## Règles d’interprétation

### Codes réutilisables pour la variante B — sélection finalisée

Le premier choix est [le code TV Lens existant](../core/frame-policy.mjs), alimenté par la vidéo Mac dense, sans entraînement ni nouvelle dépendance. Le score combine variation globale, locale par tuiles et contours ; la sélection bornée conserve des repères temporels et favorise avant/changement. Cela ne mesure pas l’importance sémantique ni ne garantit un geste de 100 ms après réduction d’image.

| Méthode / code | Réemploi et limites | Licence / décision |
| --- | --- | --- |
| [FFmpeg scdet, documentation](https://ffmpeg.org/ffmpeg-filters.html#scdet), [implémentation](https://github.com/FFmpeg/FFmpeg/blob/master/libavfilter/vf_scdet.c) | Détection de changements/coupes de scène, utile comme signal complémentaire ; manque possible de petits objets, pas de budget X intégré. | [Licence selon le build LGPL/GPL](https://www.ffmpeg.org/legal.html). FFmpeg est déjà utilisé ; n’activer ce complément que si nécessaire. |
| [PySceneDetect, détecteurs](https://www.scenedetect.com/docs/latest/api/detectors.html), [code](https://github.com/Breakthrough/PySceneDetect) | ContentDetector compare les images adjacentes ; AdaptiveDetector utilise un voisinage pouvant attendre des images suivantes. Réglages par défaut de voisinage et longueur minimale défavorables aux événements très brefs ; adapter et mesurer avant usage causal. | BSD-3-Clause ; dépendances Python/OpenCV/NumPy. Alternative différée, pas ajoutée en plus de FFmpeg dans les trois jours. |
| [Farnebäck, papier](https://www.ida.liu.se/ext/WITAS-ev/Computer_Vision_Technologies/PaperInfo/farneback03.html), [documentation OpenCV](https://docs.opencv.org/4.13.0/d4/dee/tutorial_optical_flow.html), [exemple de code](https://github.com/opencv/opencv/blob/4.x/samples/python/opt_flow.py) | Flux optique dense entre deux images grises : estime le déplacement, pas la pertinence sémantique. Coût CPU, mouvements caméra et coupes à traiter. | [Apache 2.0 pour les versions récentes d’OpenCV](https://opencv.org/license/). Différé : prototype et fiabilisation dépasseraient le simple réemploi visé. |

Le [PRD V2](../docs/PRD-V2.md) et [E02](registre.md) fixent l’ordre de réemploi et le timebox. Les études AdaFrame, ColorTrigger et TimeChat-Online éclairent la sélection, mais ne sont pas importées comme solutions prêtes à brancher. Aucun de ces codes n’a été installé ni évalué ici.

### Reranking image-texte : référence de rôle, pas composant retenu

[CLIP — Learning Transferable Visual Models From Natural Language Supervision](https://arxiv.org/abs/2103.00020), [code officiel](https://github.com/openai/CLIP), fournit des représentations image/texte dans un espace commun pour les comparer. Le dépôt est sous licence MIT ; cela ne valide ni la pile ARM/GB10 ni les poids/configurations futurs. Le score ne prouve pas une action, une identité ou la pertinence d’une région, et ne se combine pas directement avec les vecteurs du fournisseur texte de TV Lens. L’essai éventuel est conditionné à un manque constaté dans E02 ; aucun nouveau modèle n’est adopté. La proposition nommée « JEV » n’a pas été identifiée et n’est pas assimilée à CLIP ou à une autre famille.

### Limites communes

Ces travaux distinguent des leviers complémentaires : acquisition, encodage, sélection, mémoire, récupération et génération. Réduire les tokens après encodage ne réduit pas nécessairement le coût de capture. Répondre vite à partir d’une mémoire ancienne ne prouve pas que le flux est compris à jour. Préserver davantage d’images peut améliorer une réponse sans que le modèle raisonne mieux à information constante.

Les études doivent orienter des hypothèses réfutables dans le [registre](registre.md). La sélection précise des poids, versions et runtimes GX10 relève d’une vérification matérielle séparée avant tout essai ; capacité mémoire, débit texte et performances vidéo concurrentes ne sont pas équivalents.
