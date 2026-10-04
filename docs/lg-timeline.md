# Companion LG : chat et frise de session

## Contrat

Le companion propose deux vues exclusives : chat à droite, ou frise dans le tiers inférieur. La vidéo YouTube continue et reste entière dans l’espace restant. Aucun second lecteur n’est ajouté. Après les tests logiciels et le déploiement, l’utilisateur a confirmé le 30 septembre 2026 que la frise fonctionne correctement sur sa LG.

La frise couvre la session entière. Les miniatures arrivent dès que le Mac reçoit un segment (capture actuelle par blocs d’environ huit secondes), avant la description IA. Les sujets/événements reçoivent ensuite un titre neutre et un résumé. Les états en attente ou en erreur restent visibles.

`CodexPerception` produit `topic` dans son appel de description existant, en conservant le titre précédent si le même sujet continue. Aucun appel de classement ou embedding supplémentaire n’est ajouté. `sessionTimeline` regroupe uniquement les passages contigus ayant le même sujet normalisé. Il ne traverse ni lacune de capture ni passage non analysé. Les anciens passages sans sujet structuré restent séparés. La qualité et la stabilité de ces titres restent dépendantes du modèle ; aucun changement de sujet n’est prétendu certain.

## Navigation

- Ouvrir avec Rakuten. Depuis les actions du chat, Haut sélectionne la conversation, puis Haut (hors mode lecture) atteint **Frise ↔**. Le pointeur LG peut aussi cliquer directement.
- Dans la frise, Gauche/Droite parcourent les cartes ; OK ouvre le détail. Haut rejoint les commandes ; Bas revient aux cartes.
- **Retour au direct** reprend le suivi des dernières cartes. La navigation manuelle le désactive : de nouvelles captures ne déplacent pas la sélection.
- Si le regroupement absorbe une carte sélectionnée, une représentation de cette sélection reste accessible jusqu’à ce qu’on la quitte. Le détail fige ses passages ; l’IA ne peut pas y ajouter silencieusement du contenu arrivé plus tard.
- Le détail montre image, résumé, intervalle et limites. **Voir les paroles** expose la transcription disponible ; le focus dans la zone de texte permet le défilement Haut/Bas.
- **Questionner ce moment** ouvre le chat avec un contexte explicite. **Détacher** revient aux questions sur le direct. Le serveur valide les IDs et borne la question à leur intervalle ; l’attente dans la file n’en change pas le sens.
- Retour ferme d’abord le détail, puis le companion. Fermer le panneau n’arrête pas la capture.
- **Terminer la session** demande confirmation, arrête d’abord la capture TV puis supprime les miniatures et médias de travail. Les archives de résumés/réponses restent sur le Mac. **Arrêter la capture** conserve, lui, toute la session pour la reprise.

## Architecture et conservation

- `core/session-timeline.cjs` : projection par sujets et validation des sélections, sans IO ni fournisseur.
- `adapters/session-thumbnails.cjs` : JPEG réduits à 320 × 180 maximum, fichiers privés sous `<session>/thumbnails`, indépendants des clips. Pas de changement de rétention audio/vidéo.
- `WatchSession` indique la disponibilité des miniatures avant de lancer l’analyse, et conserve cet indicateur avec les observations archivées.
- `runtime/headless-runtime.cjs` expose la projection et les questions bornées. Fin de session attend les ingestions déjà engagées avant de supprimer les fichiers.
- `server/http.cjs` sert les miniatures via une route authentifiée comprenant l’ID de session ; aucune clé dans les URL. Ancienne session ou miniature absente : 410.
- `tv/app/timeline-view.js` gère la présentation et le focus, avec un nombre borné de cartes dans le DOM et 16 URL de miniatures en cache. Les objets URL sont révoqués au changement/à la fin de session.
- `tv/controller.py` accepte seulement les dispositions nommées `chat` et `timeline`. La géométrie est gérée par le processus de panneau, avec restauration/watchdog existants. Le navigateur attend l’accusé d’application avant de basculer.

Les miniatures survivent aux cinq minutes de rétention et à pause/reprise, mais pas à une fin de session ou au nettoyage du démarrage suivant. Elles ne rendent pas les anciens clips rejouables. Il n’y a pas de restauration de session après redémarrage. Le stockage des miniatures croît avec la durée du visionnage ; les images sont réduites mais aucune limite de durée totale de session n’est nouvellement annoncée. Une invocation de capture TV reste bornée à 30 minutes.

## Validation et incidents

- Tests Node : 112 tests passent. Regroupement contigu, lacunes/pending/erreurs, détail ancien, miniature avant analyse, expiration des clips, pause/reprise et purge. Test HTTP authentifié : image interdite sans jeton, 410 après fin, sélection ancienne bornée malgré du contenu récent, conservation des archives textuelles. La fin de session attend une écriture engagée avant la purge ; un test retarde réellement cette écriture. Les sélections utilisent deux IDs de borne afin de rester compactes même pour un sujet de 1 200 passages, sans inclure les passages ultérieurs.
- UI headless : frise basse, vignettes issues d’une vraie vidéo de démonstration, sélection conservée lors d’un regroupement, détail/paroles, question attachée, retour au direct et fin de session. Les résumés de ce test UI sont des fixtures, pas une évaluation de l’IA.
- Premier test UI : l’arrivée d’une nouvelle carte pouvait rétablir l’ancienne sélection pendant le réordonnancement DOM et casser le suivi du direct. Correction : conserver explicitement la sélection cible pendant la restauration du focus. Le scénario passe ensuite.
- Géométrie Python : source entière inchangée, proportion préservée, vidéo dans les 720 pixels supérieurs sur l’interface 1920 × 1080 (rectangle physique multiplié par deux sur la TV 4K).
- Essai fournisseur réel sur vidéo Kennedy : `node scripts/probe-refactor-live.cjs --require-timeline --report=docs/tv-timeline-live-report.json`. Titre de sujet réel, image authentifiée, Whisper local, Luna, chat, outil de transcription, pause/reprise et réexamen. Voir [le rapport](tv-timeline-live-report.json).
- Smoke Electron existant : passe, 14 segments, audio, relecture, chat et vérification simulés. Smoke LG historique et tests Python capture/réseau passent.
- **Retour physique reçu** le 30 septembre 2026 : « la frise marche impec ». Ce retour valide l’usage général sur la LG ; il ne constitue pas un relevé détaillé de chaque touche ni un test de panne ou de redémarrage.
- Revue finale : correction d’une collision possible entre publications simultanées de changement de vue. Chaque requête utilise désormais son fichier temporaire, avec publication atomique et erreur explicite. Un test HTTP concurrent couvre 24 demandes. Son premier lancement a révélé un défaut d’isolation du chemin de destination dans le test ; le chemin est maintenant construit uniformément et le test ne publie rien hors de son dossier temporaire.

Mise à jour préparée dans l’application TV existante, sans ouverture automatique. Sauvegarde des fichiers remplacés sur la TV : `/media/developer/tvlens-backups/timeline-1790778385`. La configuration privée d’appairage est conservée et exclue des packages. Le serveur Mac doit être relancé pour charger les nouvelles routes ; la frise commence avec les captures de sa nouvelle session.

## État de livraison

Les dix fichiers de l’interface et des contrôleurs avaient été comparés par SHA-256 avec les sources testées lors du déploiement. Le serveur et l’interface ont ensuite été testés par l’utilisateur sur la TV. La correction de concurrence du contrôleur issue de la revue est couverte localement ; elle sera chargée au prochain redéploiement du contrôleur, sans interrompre la capture actuelle.

Implémentation, tests automatisés, essai fournisseur réel et validation utilisateur sont effectués. Les essais de panne réseau, publicités et redémarrage complet restent hors de cette validation de la frise. Le déploiement VPS fait l’objet de l’étape suivante.

### Continuité du sujet et contexte de perception

Les segments de capture et de transcription restent indépendants (8 secondes sur
la TV), avec leurs identifiants et horodatages d'origine. Une carte n'a **aucune
limite de durée** : tant que le sujet continue, elle s'enrichit. Un changement de
plan, de personne qui parle ou de formulation ne constitue pas à lui seul un
changement de sujet. Le détail conserve les paroles de chaque segment, horodatées.
Le résumé de la carte est cumulatif et borné à 1 600 caractères. Sans agrégat
valide, un repli explicitement nommé « Extraits récents » présente les deux
dernières descriptions distinctes (900 caractères maximum).

Avant chaque analyse visuelle, le domaine prépare un contexte historique explicite.
L'adaptateur n'envoie que les trois passages précédents au maximum appartenant au
sujet contigu actif, avec leurs transcriptions/résumés/incertitudes tronqués, et
le résumé cumulatif précédent. L'aperçu des autres sujets reste dans le domaine,
sans être envoyé dans cet appel. Aucun appel supplémentaire de synthèse n'est
effectué. Le thread de perception est renouvelé aux frontières du sujet, aux
lacunes, lors d'un réexamen et au plus tard après vingt appels. Le contexte
explicite n'inclut jamais les passages futurs déjà transcrits pendant l'attente.
Il reste disponible après pause/reprise et expiration du média brut, grâce aux
observations archivées. Cette composition est commune au Mac et au serveur.

Luna distingue ce contexte historique des preuves du passage actuel et indique
la continuité du sujet. En cas de continuation, l'adaptateur conserve le titre
précédent exactement, évitant une nouvelle carte pour une simple reformulation.
Une analyse absente ou un trou de capture n'établit pas de continuité : ces
passages restent visibles séparément. Une vision réussie peut conserver le sujet
même si l'audio échoue, mais la carte garde son état partiel.

Les descriptions, OCR et transcriptions restent non vérifiés : les accusations
rapportées ne deviennent pas des faits parce qu'elles réapparaissent dans le
contexte. Ce cadrage ne garantit pas l'absence d'erreur du modèle. Les métriques
`recentContextCount` et `contextChars` permettent de contrôler le contexte envoyé
sans journaliser les paroles. L'ajout de contexte peut augmenter la latence ; il
ne change ni les files audio/vision, ni leur traitement des retards. Aucun prompt
de contexte Whisper ni streaming audio n'est ajouté.

### Validation réelle du contexte — 4 octobre 2026

Déployé sur le VPS après revue indépendante et correction d'une frontière de
sujet ignorée dans l'aperçu historique. **139 tests Node**, 21 tests ciblés sur le
VPS, smoke Electron et smoke frise passent. Voir le
[rapport du visionnage réel](topic-context-live.json).

Sur 124 secondes de YouTube sur la LG : 12 passages reçus, 11 analysés et un encore
partiel à la fin du relevé, sans abandon d'analyse sur les passages reçus. Des
cartes regroupent trois ou quatre blocs. Le contexte explicite atteint trois
passages et 4 805 caractères. Vision : moyenne 4,12 s, maximum 5,26 s, contre
4,31 s sur dix analyses précédentes. Les contenus diffèrent : ce relevé ne prouve
ni gain de vitesse ni amélioration chiffrée de précision. Trois blocs ont été
écartés par la capture ; leur cause détaillée n'est pas disponible dans le rapport.

Limites effectivement observées : un titre trop large après deux publicités dans
un même bloc ; une comparaison de taille à une pièce de deux euros mal reformulée
comme un montant. Ces erreurs sont conservées dans le rapport. Le regroupement
n'est pas une validation des affirmations. La rétention du thread sur vingt
appels et les sessions longues restent à mesurer au-delà de cet essai. Aucun
changement d'assets TV ni nouveau test physique de télécommande dans cette passe.

### Résumé cumulatif d’une carte

Une carte suit le même sujet sans durée maximale. L’appel visuel Luna existant
produit deux textes distincts : `observation.summary` décrit exclusivement le
passage actuel ; `topicSummary` enrichit le résumé antérieur avec ce nouveau
passage. Le cœur attribue à ce résumé les bornes et IDs exacts du sujet. Il reste
séparé des observations utilisées comme preuves et pour la recherche. Aucun appel
supplémentaire, changement de modèle ou prompt Whisper n’est introduit.

Le résumé cumulatif est borné à 1 600 caractères. Le modèle doit conserver les
arguments importants du début, les réponses, désaccords, attributions et
incertitudes, tout en condensant les répétitions. C’est une compression imparfaite,
pas une transcription exhaustive ni une validation externe. Les blocs de huit
secondes et leurs paroles horodatées restent inchangés. Un changement explicite,
une continuité incertaine, une lacune d’analyse ou de capture démarre un nouveau
résumé. Un simple changement de plan ou de locuteur ne suffit pas.

Les miniatures et résumés survivent à l’expiration des médias et à pause/reprise
dans la même session. Le détail utilise les bornes sélectionnées : il ne montre
jamais le résumé plus récent d’une carte qui continue à grandir, ni un résumé
incluant le début d’un sujet absent de la sélection. Sans agrégat valide couvrant
exactement l’intervalle, la carte et le détail signalent **Extraits récents** : les
deux dernières descriptions disponibles, sans prétendre résumer tout le sujet.
Cela concerne les anciennes sessions, les sous-sélections et un champ cumulatif
absent, vide ou trop long. Après un champ cumulatif rejeté, les trois derniers passages au plus peuvent être
réintégrés au prochain appel à partir du dernier agrégat valide ; au-delà, le
repli reste explicite. Une carte ancienne ne devient pas rétroactivement
exhaustive : le résumé cumulatif complet reprend au prochain nouveau sujet.

Les tests couvrent la conservation d’un argument initial après plusieurs mises à
jour, la séparation des preuves actuelles, les frontières, les détails figés,
l’archivage et les sorties invalides. Les tests avec réponses contrôlées vérifient
le contrat logiciel ; ils ne mesurent pas à eux seuls la fidélité de Luna sur une
vidéo réelle.

Un essai réel a révélé une fuite de contexte : après une lacune de capture,
Luna réintroduisait dans le nouveau résumé des faits observés avant cette lacune.
Le premier correctif (consigne textuelle seule) ne suffisait donc pas. L’entrée
visuelle est maintenant limitée au sujet contigu actif : ni extraits plus anciens
ni aperçu global des autres sujets. Le thread d’analyse est réinitialisé aux
frontières connues et lors d’un passage au réexamen ; le contexte explicite borné
conserve la continuité utile. Cette isolation ne garantit pas la fidélité des
résumés, mais retire les données hors intervalle qui causaient cette fuite. La
reconnexion aux frontières peut ajouter de la latence, sans appel d’inférence
supplémentaire. Les réponses anciennes incorrectes restent dans le rapport de test.

### Validation du résumé cumulatif — 4 octobre 2026

[Rapport des deux essais réels](cumulative-summary-live.json). Le premier essai a
échoué : après une lacune de capture, le modèle réintroduisait des faits antérieurs
à la nouvelle carte. L'isolation du contexte envoyé et le renouvellement du thread
aux frontières corrigent cette voie de contamination ; l'échec est conservé.

Second essai TV → VPS sur 165 secondes : 11 passages entièrement analysés, aucun
passage reçu abandonné par l'analyse. La première carte conserve l'information
initiale sur six passages ; après une pause volontaire de capture (YouTube non
interrompu), quatre passages constituent un résumé distinct. Lecture manuelle des
réponses complètes : pas de détails pré-lacune réintroduits dans ce deuxième résumé,
et les formulations d'incertitude sont conservées. Cela ne constitue pas une mesure
d'exactitude contre une transcription humaine. Les erreurs de transcription et
l'attribution d'une histoire racontée au locuteur restent des limites observables.

Vision, synthèse incluse : moyenne **7,335 s**, maximum **9,448 s** sur onze appels.
Le relevé précédent sans synthèse cumulative était proche de 4,12 s sur un autre
contenu : on ne peut pas en déduire un surcoût contrôlé, mais la nouvelle fonction
n'est pas présentée comme gratuite en latence. Aucun appel supplémentaire par
passage ; coût monétaire Codex non retourné, aucune nouvelle inférence OpenRouter.

150 tests Node passent, dont 32 tests ciblés sur le VPS ; review indépendante,
smokes Electron et TV favorables. Le contrôle visuel a rencontré une publicité et
un panneau fermé (HTTP 409 lors d'une demande de frise). La navigation physique
avec la télécommande n'est pas nouvellement validée. Le média, les descriptions
et leurs incertitudes restent les références pour consulter les détails.
