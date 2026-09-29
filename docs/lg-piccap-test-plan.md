# Plan TV : essais sans modification système

Statut : plan, aucun test matériel réalisé. Complément à `lg-piccap-exploration.md`.

## Plan retenu pour la LG 75QNED87T (2024)

La TV n'est ni rootée ni équipée de PicCap. Le propriétaire exclut les manipulations susceptibles d'affecter sa garantie. Aucune procédure de root, modification firmware ou installation PicCap n'est prévue. L'effet contractuel exact du root sur la garantie n'a pas été vérifié ; nous ne prétendons pas qu'il annule automatiquement toute garantie.

1. **Mac → HDMI → TV.** Lire Spring ou une vidéo non protégée sur le Mac, afficher le lecteur sur la TV et sélectionner sa fenêtre dans TVLens. Vérifier image, son système, question contextuelle et citation rejouable pendant 10 minutes. Cela valide le visionnage sur TV, pas la capture des applications webOS.
2. **TV autonome → caméra + micro → Mac.** Préparer un adaptateur de capture externe. Vérifier cadrage, texte lisible, transcription et synchronisation avec une mire flash/bip. Aucun accès système à la TV n'est nécessaire. Cette source n'est pas encore implémentée dans l'app.
3. **Comparer sur les mêmes dix extraits.** Évaluer compréhension de l'action, citation du bon intervalle, transcription et délai. Conserver images noires, reflets, gels et erreurs de transcription dans le rapport. Cible proposée : au moins 8/10 actions et 8/10 passages correctement restitués.
4. **Valider 20 minutes de session.** Pause/reprise, questions en file, recherche web, marque-page, expiration des médias, Auto et déconnexion de la caméra. Les lacunes doivent rester visibles.

Matériel à confirmer avant achat : câble/adaptateur HDMI du Mac ; caméra et microphone disponibles. Le premier test peut réutiliser l'app actuelle, tandis que le second exige du développement de capture. Ne pas acheter de matériel uniquement sur la base de ce plan.

## Archive conditionnelle — piste PicCap non retenue

Les étapes ci-dessous documentent l'exploration technique initiale. Elles ne constituent pas le plan autorisé pour cette TV et ne doivent pas être exécutées dans le scénario sans modification système.

## Décision recherchée

Déterminer si la TV peut fournir une source utile à TVLens : image lisible, audio exploitable et synchronisé, puis capture continue avec relecture. La réussite peut être limitée à certaines entrées ; ne pas généraliser un succès HDMI à une application intégrée.

Les seuils ci-dessous sont des cibles proposées pour le POC, pas des performances établies de PicCap.

## 0. Inventaire et compatibilité — avant toute installation

Relever modèle complet, firmware, version webOS, état root/Homebrew/PicCap, sources utilisées (YouTube intégré, HDMI, lecteur local), connexion réseau et sorties audio disponibles. Conserver les versions exactes des logiciels et du backend dans le rapport.

Vérifier la compatibilité dans les documentations actuelles. Le README PicCap requiert root, webOS 3.4+ et Homebrew Channel ; cela ne suffit pas à établir la compatibilité d'un modèle particulier. Aucune modification système ou procédure de root n'est lancée par ce plan. Si root est nécessaire et absent, décider séparément de cette modification avec le propriétaire, une fois sa méthode et ses conséquences connues.

**Passage à l'étape suivante :** configuration compatible identifiée, accès requis disponible. Sinon, noter le blocage ; la piste caméra + micro reste un scénario de repli distinct.

## 1. Première image réelle — diagnostic indépendant de TVLens

Utiliser PicCap avec un récepteur Hyperion compatible existant et son aperçu, sur le Mac si disponible pour sa plateforme, sinon sur un hôte local compatible. Ne pas écrire d'abord notre propre protocole : cette référence permet de séparer un défaut de capture d'un défaut de notre récepteur.

Afficher une vidéo de test non protégée avec compteur incrusté, mouvement, texte et changements de plan. Une mire statique ou les menus seuls ne valident pas la capture du programme.

Tester séparément : lecteur local si disponible, YouTube intégré avec un extrait autorisé, même extrait depuis HDMI si disponible. Pour les applications protégées : consigner le résultat observé sans chercher à contourner leurs protections. Les menus, l'image noire et l'image figée sont des résultats distincts.

**Réussite :** pendant 2 minutes, voir sur le récepteur le compteur et les changements de la vidéo réellement diffusée. Enregistrer des captures et la configuration gagnante. À défaut, tester seulement les backends documentés compatibles ; conserver les échecs.

## 2. Qualité et stabilité visuelles — 20 à 30 minutes

Pour chaque source/backend, mesurer dimensions reçues, cadence de messages, cadence de mises à jour utiles, trous de réception, débit et durée des gels. Une scène naturellement immobile ne doit pas être assimilée à une panne : utiliser le compteur de la mire pour distinguer les deux.

Commencer avec une sortie modeste, puis augmenter progressivement les paramètres permis par le matériel. La résolution d'un aperçu ne prouve pas la résolution native reçue : mesurer les images décodées. Conserver au moins une couverture régulière, même si les frames similaires ne sont pas toutes soumises à l'IA.

Tests de lisibilité : 10 textes/chiffres/bandeaux de tailles variées, vérifiés manuellement avant tout appel IA. Cible : 8/10 lisibles ; une image trop réduite ne permettra pas un OCR fiable.

Tests d'action : 10 courtes séquences incluant mouvement discret, répétition, action rapide, coupe et scène immobile. Préserver les clips et leurs réponses attendues dans un jeu d'évaluation séparé, jamais injecté dans le modèle.

Mesurer le délai écran → aperçu en filmant ensemble le compteur de la TV et celui de l'aperçu du récepteur. Rapporter médiane et p95 sur au moins 20 mesures et la précision de la mesure. Cible initiale : p95 < 2 s. Cible de continuité : aucun gel inexpliqué > 3 s sur 20 minutes. Si ces objectifs échouent, qualifier la source pour contexte lent seulement avant de poursuivre.

## 3. Audio et synchronisation — validation indépendante

Ne pas présumer que le transport PicCap contient l'audio. Identifier une entrée réellement disponible sur le Mac : micro USB près de la TV pour le premier essai, ou capture matérielle d'une sortie TV compatible si disponible. Conserver le choix dans le rapport ; un micro ne constitue pas une capture audio native.

Lire un clip de test contenant un flash et un bip simultanés toutes les 30 secondes, plus 10 phrases connues comportant noms et nombres. Enregistrer image et audio sur une horloge monotone du Mac. Distinguer temps d'arrivée, éventuel temps source et correction mesurée ; ne pas inventer un timestamp de capture précis.

Mesurer décalage initial et dérive après 15 minutes. Cibles : décalage résiduel absolu <= 300 ms après calibration, variation <= 200 ms. Vérifier manuellement les 10 phrases après transcription locale : au moins 8 correctement restituées, avec résultat séparé pour les noms et les chiffres. Répéter avec bruit de pièce et volume TV réduit.

Sans audio valide, livrer uniquement un diagnostic visuel clairement marqué « sans audio », sans annoncer le debunk de paroles ou produire une transcription supposée.

## 4. Adaptateur hexagonal — seulement après preuve de capture

Constat du dépôt : `core/ports.cjs` décrit CapturedSegment ; `app/main.cjs:validateSegment` impose un clip non vide, 1–8 frames JPEG et des limites de taille ; `adapters/local-store.cjs` stocke le clip en WebM pour la relecture. Il n'existe pas encore de récepteur réseau PicCap interchangeable prêt à brancher.

Travaux proposés :

1. Inspecter et figer une version du schéma et du client FlatBuffers : cadrage TCP, inscription, réponses, formats d'image, reconnexion. Ajouter fixtures de messages valides, tronqués et surdimensionnés.
2. Récepteur LG dans un adaptateur dédié : connexions autorisées, tailles/résolutions bornées, files bornées, indicateurs de pertes. Ne pas supposer une authentification native du protocole ; limiter interface réseau et pairs autorisés.
3. Assembleur de segments indépendant du transport : images + source audio optionnelle + horloge injectée → CapturedSegment. Produire un WebM rejouable avec les vrais intervalles reçus. Ne pas interpoler des actions ni masquer un gel par duplication silencieuse de frames.
4. Extraire la validation commune de l'entrée Electron pour la réutiliser avant l'ingestion réseau ; aucune dépendance Hyperion/webOS dans les services métier.
5. Déclarer les capacités et la provenance de la source : audio présent/absent, cadence, qualité de timing, relecture reconstruite à partir d'images. Une relecture issue d'images PicCap n'est pas le fichier vidéo original.
6. Ajouter « TV LG » au choix de source, avec connexion, perte du signal et retard visibles. Conserver Codex pour chat/vision, transcription locale et OpenRouter uniquement pour embeddings.

Réutiliser la mémoire, les questions et le réexamen existants. Conserver 5 minutes détaillées, ancrage à l'envoi, file FIFO, annulation ciblée, délai de traitement de 60 s hors attente, et capture indépendante.

## 5. Validation intégrée — même contenu, deux sources

Comparer capture Mac actuelle et source LG sur les mêmes 10 clips, mêmes questions, modèle et réglages. Pour LG, le son doit provenir de la chaîne audio testée ; ne pas fournir discrètement une transcription parfaite issue du fichier original.

Mesurer séparément arrivée du signal, disponibilité de la transcription, fin d'analyse, premier retour utile et réponse finale. Évaluer les réponses complètes : action exacte, absence de mouvement inventé, citation du bon intervalle, transcription, qualité des sources pour les questions factuelles. Une absence de preuve doit rester visible. Cible : >= 8/10 actions ET >= 8/10 passages correctement cités ; publier aussi les scores par scénario et les échecs.

Exécuter ensuite :

- deux questions successives, attente et annulation ciblée ;
- « ce qu'il vient de dire » posé avant une attente ;
- pause/reprise de TVLens, conservation du fil, capture poursuivie pendant recherche ;
- lien d'article en relance et réutilisation des preuves ;
- marque-page, recherche, expiration du média après rétention ;
- Auto activé à un instant précis, priorités manuelles ;
- changement d'application/entrée TV et retour ;
- coupure réseau de 10 s, reconnexion, veille/réveil de la TV ;
- audio absent, image noire, image gelée, débit trop élevé, consommateur lent.

Lors d'une interruption, afficher le trou de capture et ne pas remplacer le contexte actuel par une vieille frame présentée comme récente. Cible : reconnexion en moins de 10 s après retour effectif du service, ou diagnostic explicite si une intervention est nécessaire.

## Rapport à conserver

Une ligne par essai : date, modèle/firmware, versions PicCap/backend/récepteur, source, paramètres, dimensions, FPS reçu/utile, délai médian/p95, gels/pertes, audio, décalage/dérive, lisibilité, résultat, chemin des preuves et limites.

Décision finale : compatible audiovisuel / compatible visuel seulement / compatible sur certaines sources / inutilisable sur cette configuration. L'interface webOS et la télécommande vocale restent un chantier ultérieur.

## Ordre et effort indicatifs

Inventaire : 15–30 min. Première capture : 1–2 h si la TV est déjà prête et compatible. Qualité + audio : une demi-journée. Adaptateur et intégration : 2–4 jours selon le protocole et la nécessité d'encoder les segments. Le root éventuel et les problèmes de compatibilité ne sont pas inclus : ils peuvent bloquer la piste.

## Références revérifiées

- PicCap : https://github.com/TBSniller/piccap/blob/main/README.md — exigences, limites des applications protégées, conflits possibles avec les fonctions AI de la TV.
- hyperion-webos : https://github.com/webosbrew/hyperion-webos — service et backends.
- Définitions FlatBuffers citées dans la note initiale : à inspecter au commit retenu avant développement ; le dossier n'a pas pu être chargé via l'outil web lors de cette revue.
