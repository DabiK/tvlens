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
Le résumé de la carte reste court (les deux dernières descriptions distinctes,
900 caractères maximum) : ce n'est pas un résumé exhaustif d'un long débat.

Avant chaque analyse visuelle, le domaine transmet au port de perception un
contexte historique explicite : les trois passages précédents au maximum, leurs
transcriptions/résumés/incertitudes tronqués, et un aperçu extractif des huit
derniers sujets observés. Cet aperçu réutilise les descriptions existantes ; aucun
appel supplémentaire de synthèse n'est effectué. Cet apport explicite par appel est borné et non exhaustif. Le thread Codex de
perception reste réutilisé jusqu'à 20 appels avant renouvellement : son contexte
fournisseur accumulé peut donc dépasser cet apport. Le contexte explicite
n'inclut jamais les passages futurs déjà transcrits pendant l'attente de la vision.
Il reste disponible après pause/reprise et après expiration du média brut, grâce
aux observations archivées. Cette composition est commune au Mac et au serveur.

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
