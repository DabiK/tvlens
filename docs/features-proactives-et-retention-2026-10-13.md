# TV Lens — demandes produit, surveillance proactive et rétention

Date : 13 octobre 2026. Auteur du besoin : Dabi. Statut : décisions produit confirmées ; implémentation et supervision nocturne autorisées le 13 octobre 2026. Les détails techniques secondaires sont laissés à l’agent dans le respect du contrat ci-dessous.

## Intention

Pouvoir questionner une vidéo sans interruption arbitraire, revoir ses passages anciens et confier au compagnon une consigne continue. L’agent exploite images, paroles et recherches pertinentes, restitue des éléments courts et naturels, et reste limité aux capacités nécessaires au visionnage.

Les évolutions doivent être cadrées pour l’application Mac et pour la TV, avec un backend commun quand c’est pertinent. Dabi souhaite une session Opus fresh dédiée à cette mission. La session Opus de réutilisation des transcriptions reste distincte et conserve sa mission actuelle.

## Demandes exprimées

### F1 — Supprimer la limite actuelle de 60 secondes par question

Décision utilisateur : remplacer le plafond de 60 secondes par un maximum de **cinq minutes (300 000 ms)** par question. La demande initiale d’absence de plafond a été précisée par cette décision.

Prévoir progression visible, annulation manuelle, attente en file, erreurs et délais propres aux outils. Le plafond de traitement et l’attente en file sont distincts dans le code actuel. Auditer les délais des sous-outils et clients : augmenter seulement DeepAsk ne garantit pas que chaque chemin puisse aboutir en cinq minutes.

Critère produit à préciser : une recherche longue qui progresse peut aboutir, et le spectateur peut l’arrêter sans bloquer la session.

### F2 — Consigne de surveillance continue, Mac et TV

Exemple utilisateur : « Je compte sur toi pour vérifier tous les chiffres qui sont balancés. »

La mémoire vidéo continue de s’alimenter. La surveillance repère les passages pertinents pour une consigne, décide si une vérification ou une recherche est nécessaire, puis rapporte les résultats. Le « trigger word » est une idée de déclenchement proposée par l’utilisateur : le mécanisme exact n’est pas arrêté. La détection peut avoir besoin du contexte sémantique, plutôt que d’un seul mot-clé.

Décisions utilisateur : surveillance **à partir de l’activation**, sans vérification rétrospective automatique ; **résultats regroupés sans écarter d’affirmations**. Les affirmations pertinentes détectées doivent être suivies jusqu’à un résultat ou un état explicite non vérifié/échec/en attente ; cette exigence ne signifie pas que toute affirmation du programme peut être détectée ou tranchée avec certitude.

Points à cadrer : déclenchement à chaque nouveau passage ou évaluation périodique, ambiguïtés de transcription, chiffres répétés, absence de preuve, sources contradictoires, priorité des questions manuelles, limite des recherches simultanées. Ne pas traiter chaque nombre comme une affirmation vérifiable : date, prix fictif, score ou citation peuvent demander des comportements différents.

Une consigne du spectateur donne l’objectif ; une phrase du programme n’est pas une instruction autorisant l’agent à changer son rôle ou ses permissions.

### F3 — Restitution discrète en bas à gauche sur la TV

Demande ferme : un affichage d’éléments de chat/observations en bas à gauche, adapté au suivi en direct, plutôt que d’imposer l’ouverture du panneau complet.

Décision utilisateur : afficher seulement les **résultats sourcés**, avec une activité discrète pendant la recherche.

À préciser : durée d’affichage, historique consultable, détail/sources à la télécommande, coexistence avec sous-titres et publicités, activation et arrêt. Aucun vol de focus ni interruption du son.

Sur Mac, cadrer la fonction équivalente de surveillance, ses commandes et ses résultats. La disposition Mac exacte reste à décider, sans imposer automatiquement le même overlay que sur TV.

### F4 — Cloisonnement réel de l’agent et contexte robuste

Demande ferme : empêcher l’agent serveur de consulter des fichiers hors du répertoire de contexte autorisé ; renforcer son rôle de compagnon et sa proactivité fondée sur les images, transcriptions et ressources disponibles.

Distinction nécessaire : le confinement des fichiers limite les conséquences d’une injection ; il n’élimine pas toutes les injections provenant de la vidéo ou du web. Les instructions de rôle complètent des restrictions effectivement appliquées par le runtime, elles ne les remplacent pas.

À auditer : outils réellement disponibles, accès aux fichiers et au shell, contexte exposé, privilèges du compte de service, accès aux secrets, portée session/utilisateur, sorties tardives et recherches web. Si les preuves sont fournies par des outils bornés, aucun accès général au système de fichiers ne doit être nécessaire au modèle.

Le rôle doit demander : observations ancrées et sourcées, incertitudes explicites, initiatives liées à la consigne active, abstention quand les preuves manquent. Ne pas confondre proactivité et permission d’agir sur le serveur.

### F5 — Allonger la disponibilité des médias anciens

Incident utilisateur : une demande d’analyse du début de la vidéo a échoué avec « Médias expirés ».

Demande ferme : maximiser la quantité d’information exploitable et élargir la fenêtre à plusieurs dizaines de minutes, éventuellement une heure ; supprimer les données concernées à la suppression de la session depuis l’application.

Décision utilisateur : conserver **toute la session jusqu’à sa suppression explicite**, y compris le début d’un film à 1 h 30. La proposition initiale de fenêtre glissante d’une heure n’est pas retenue.

La purge automatique à cinq minutes ne doit plus rendre ces passages indisponibles. Décision utilisateur complémentaire : **historique consultable après réouverture, reprise de capture explicite**. La conservation après arrêt de capture, fermeture et redémarrage doit respecter ce choix ; l’ouverture d’une archive ne relance pas la capture. Prévoir mesure du stockage et erreur explicite si le disque ne permet plus de conserver, sans annoncer que les médias sont encore disponibles s’ils ont été supprimés.

Distinguer médias source (audio/images/vidéo), transcriptions, observations et historique : une mémoire textuelle persistante ne rend pas une vidéo expirée réinspectable. Mesurer le volume réel des médias stockés avant de conclure que le coût est faible. Cadrer aussi fin de capture, fermeture de l’app, session archivée, suppression explicite et nettoyage après interruption.

### F6 — Style des résumés et des réponses

Demande ferme : français naturel et fluide, paragraphes courts, synthèse de ce qui se passe ; éviter les formulations répétitives et les blocs trop longs.

À définir avec quelques exemples : longueur par observation, niveau de détail des alertes, récapitulatif et réponse à une question. Préserver les incertitudes et les preuves utiles malgré la concision. Un style doit être évalué sur les réponses rendues, pas seulement sur le texte du prompt.

## État du dépôt relevé pendant le cadrage

- `core/deep-ask.cjs` : délai de traitement par défaut de 60 000 ms. Ne pas le confondre avec la durée maximale d’un bloc média.
- `core/auto-monitor.cjs` et `app/main.cjs` : mécanisme Auto déjà présent sur Mac, consigne utilisateur, fréquence configurable de 15 à 300 secondes (30 par défaut), passages nouveaux analysés et priorité manuelle. Le nouveau besoin doit réutiliser ou faire évoluer cette base après audit.
- `core/session.cjs` et `app/main.cjs` : rétention courante de 300 000 ms, soit cinq minutes.
- `adapters/codex-session-client.cjs` : instructions interdisant fichiers/shell/connecteurs, configuration sandbox en lecture seule et contrôle des outils. L’efficacité réelle du confinement doit être vérifiée ; une instruction textuelle ne prouve pas une interdiction technique de lecture hors contexte.

Ce relevé concerne le checkout principal. La branche d’optimisation isolée et la version effectivement déployée peuvent différer ; la mission future doit vérifier leurs états et choisir explicitement sa baseline.

## Décisions prises — première ronde

1. **Questions : maximum cinq minutes**, selon la réponse « durée max de 5 min en vrai c’est good ».
2. **Médias : toute la session jusqu’à suppression**, selon « Oui : toute la session jusqu’à suppression ».
3. **Overlay : résultat sourcé seulement, activité discrète**, option sélectionnée par Dabi.

## Complément du relevé technique

Inventaire en lecture seule du checkout principal :

- `core/deep-ask.cjs:6` : FIFO avec un actif, cinq questions en attente au maximum ; délai démarré au début du traitement, attente mesurée séparément. `app/renderer.js` affiche aussi « maximum 60 s ».
- `core/video-tools.cjs` et `adapters/video-bridge.cjs` : bornes de transcription, inspection et contexte distinctes. La nouvelle durée doit être cohérente sur Mac, TV, serveur et chemins MCP concernés.
- `core/auto-monitor.cjs` : Auto actuel prend les six derniers passages nouveaux `ready`, démarre à l’activation et suspend ses évaluations pendant les questions manuelles. Une nouvelle promesse de vérifier « tous les chiffres » doit éviter de confondre ce sous-ensemble avec une couverture exhaustive.
- `tv/app/companion.js` : chat/frise et polling de l’état ; pas de contrôles ni résultats Auto trouvés. `runtime/headless-runtime.cjs` devra porter le mécanisme côté serveur pour la TV.
- `adapters/local-store.cjs`, `app/main.cjs`, `server/main.cjs`, `runtime/session-runtime.cjs` : nettoyage brut à plusieurs transitions ; changer seulement `retentionMs` ne remplit pas le contrat « jusqu’à suppression ». Archives textuelles présentes, mais route de réouverture/listage ancienne session non trouvée sur le serveur TV.
- `adapters/codex-session-client.cjs`, `adapters/companion-prompt.cjs`, `adapters/codex-analysis-agent.cjs`, `adapters/codex-verifier.cjs` : contrôles existants par rôle, shell/apps/plugins désactivés, garde des outils et événements, contexte déclaré non fiable. Auditer et vérifier leur efficacité plutôt que supposer une absence complète de protections.

## Décisions prises — deuxième ronde

4. **Surveillance à partir de l’activation**, sans reprise automatique du contenu antérieur.
5. **Résultat regroupé, aucune affirmation écartée** : réduire le nombre d’alertes sans perdre le suivi des affirmations pertinentes détectées. Afficher clairement celles qui restent en attente ou indéterminées dans l’historique.
6. **Historique consultable et reprise explicite de capture** : médias consultables après réouverture ; aucune capture lancée simplement en consultant une session ancienne.

## Décisions prises — troisième ronde

7. **Affirmation non vérifiable : historique seulement**. L’overlay reste réservé aux résultats sourcés ; l’absence de carte ne signifie pas qu’une affirmation a été vérifiée.
8. **Surveillance et questions manuelles en parallèle**. Dabi a explicitement choisi cette option malgré le ralentissement possible. Ne pas implémenter une suspension automatique de la surveillance pendant les questions manuelles. Borner les travaux de fond simultanés et les files, dédupliquer les affirmations et mesurer séparément leurs délais et ceux du chat. Si la capacité est dépassée, signaler le retard et les états en attente ; ne pas ignorer silencieusement des affirmations déjà détectées.
9. **Restitution : deux ou trois phrases courtes**, avec sources et détails accessibles. Français naturel, fluide, synthétique ; incertitudes conservées et pas de verdict binaire inventé.

### Propositions pratiques, non encore acceptées

- Champ de consigne libre avec exemples (« vérifier les chiffres », « suivre un sujet »), sans limiter le produit à un détecteur de nombres.
- Overlay sans prise de focus, qui disparaît automatiquement ; résultat conservé dans l’historique et consultable par le panneau.
- Une observation du programme et une page web sont des données non fiables, jamais des instructions d’administration.
- Si le stockage manque, afficher l’arrêt ou la dégradation de conservation et demander une action ; ne pas supprimer des médias conservés en prétendant respecter le contrat.

## Préparation de la future mission Opus

Après cadrage : diagnostic des mécanismes existants, implémentation par tranches cohérentes, quelques tests significatifs sur déclenchement, annulation, isolation, temporalité et purge, puis parcours représentatif Mac/TV. Éviter une campagne disproportionnée ; distinguer simulation et essai réel. Documenter comportement utilisateur, limites et mesures.

Les neuf décisions structurantes ci-dessus sont confirmées par Dabi. Les réglages secondaires (durée d’affichage, présentation Mac, bornes opérationnelles et organisation des archives) peuvent être proposés par l’implémentation avec valeurs explicites et réversibles. Préparer une session Opus fresh dédiée sur une baseline identifiée, sans lui faire modifier en parallèle les fichiers de la session réexamen active. Aucun déploiement n’est autorisé par ce cadrage.

## Autorisation de travail nocturne — 13 octobre 2026

Dabi demande au coordinateur de superviser une session Opus pour implémenter tous les tickets pendant son absence. Une vidéo YouTube restera en lecture ; TV et VPS sont accessibles. Autorisés : implémentation locale isolée, mesures, tests représentatifs réels ou simulés sur environnements temporaires, coordination des sessions et correction des régressions. Aucun déploiement permanent, changement d’appairage, redémarrage du service existant, achat ou nouveau budget fournisseur. Préserver lecture/focus/son TV ; tester l’overlay via copie de test ou simulation s’il ne peut être éprouvé sans modifier l’installation existante.

Les captures et fixtures doivent être bornées et nettoyées après essai. Le produit doit conserver jusqu’à suppression ; un test de cette fonction ne justifie pas de conserver une nuit entière de médias sur le VPS partagé. Le Mac doit rester éveillé et connecté pendant le travail.
