> Archive de cadrage initial : certaines décisions ont évolué. Voir [état actuel](viewing-upgrade.md) et le README.

# TVLens — Proposition de roadmap et de tickets

**Statut : proposition complète à valider ; aucun ticket publié et aucune implémentation commencée.**

Cette proposition applique le [skill to-tickets](https://github.com/mattpocock/skills/blob/main/skills/engineering/to-tickets/SKILL.md) demandé par l’utilisateur. Chaque ticket livre un parcours observable de bout en bout. Les tests de comportement appartiennent au ticket qui crée ce comportement ; le ticket de mesure comparative ajoute un protocole et un rapport utilisables.

## Base de décision

- Le grill est validé par l’utilisateur ; les décisions ultérieures ajoutent une app Mac Electron et un overlay.
- Le dépôt ne contient pour l’instant que le PRD et les documents de cadrage ; aucun code applicatif ni dépôt Git n’existe ici au moment de la préparation. Aucun préfactoring n’est donc nécessaire.
- POC : OpenRouter, source vidéo sur Mac, mémoire détaillée configurable de cinq minutes, résumés persistants, Ask texte et Auto par consigne.
- Produit complet convenu : app Mac avec overlay, voix, sessions et reprise sur erreur ; moteur portable ; validation sur GX10 ; utilisation TV par caméra/micro et second écran.
- La capture d’une fenêtre via Electron n’est pas annoncée comme une capture isolée d’onglet. Le ticket 02 fixe ce qui fonctionne réellement avec l’extrait YouTube, l’image et le son.
- Les interfaces métier sont introduites au fil des parcours et restent indépendantes d’Electron, de la TV et des fournisseurs. Le moteur séparé arrive au ticket 22 ; aucun besoin de microservices pour le POC.
- Le matériel distant du challenge ne permet pas de prétendre que le flux domestique reste dans le logement. Le test local physique est distinct.

## Ordre et priorités

Les numéros sont stables dans cette proposition et placent toujours les prérequis avant leurs dépendants. Ils ne forcent pas une chaîne strictement séquentielle : une tâche sans prérequis ouvert peut commencer. « Dépendance externe » indique un accès, du matériel ou une information que fermer un autre ticket ne fournit pas automatiquement.

- **P0** : candidature et contrat POC. Ce n’est pas une promesse de terminer tous les P0 en six jours.
- **P1** : app Mac complète et portabilité utilisable.
- **P2** : matériel GX10/TV et distribution pilote, après disponibilité des prérequis.
- **S** : parcours ciblé ; **M** : intégration plus incertaine. Ces tailles comparent les tickets, elles ne constituent pas une estimation calendaire. Chaque ticket vise une session de travail avec contexte frais ; scinder avant exécution si les essais révèlent une portée trop grande.

## Jalons de livraison

| Jalon | Résultat à montrer | Tickets | Condition de passage |
| --- | --- | --- | --- |
| Dossier | Présenter honnêtement le projet et la preuve disponible | 01 puis 21 | Réponses relisibles, liens réels, réalisé/prévu distincts ; soumission séparée |
| Première preuve | Une vraie capture et une réponse sur ce qui est observé | 02, 03, 17 | Image + son contrôlés, modèle effectivement testé, appels bornés |
| Mémoire | Présent, passé récent et résumé ancien interrogeables | 04–08 | Bons moments retrouvés, preuves réexaminables, expiration et limites visibles |
| POC complet | Ask et Auto, vérification, overlay et suivi continu | 09–14, 16, 20 | Rapport de validation sur débat + fiction ; erreurs exposées |
| App Mac complète | Voix, historique géré, paquet installable et reprise | 15, 18, 19, 32 | Parcours réalisés depuis le paquet sur Mac, récupération sans contexte inventé |
| Moteur portable | Même domaine derrière app et second écran | 22, 23 | Contrats identiques, reconnexion et accès contrôlés |
| GX10 validé | Même expérience exécutée et mesurée sur le GX10 | 24–28 | Comparaison de qualité et de retard ; aucune inférence cloud cachée |
| TV utilisable | Caméra/micro → GX10 → second écran | 29–31 | Essai physique reproductible, qualité audio/vidéo et confidentialité décrites honnêtement |
| Pilotes | Installer sur le Mac d’un autre utilisateur | 33 | Distribution signée testée, identité de signature autorisée |

## Trajectoire des six jours avant candidature

Le texte fourni demande une candidature avant le 4 octobre 2026, puis organise un accès distant au matériel pour huit projets sélectionnés. L’heure exacte de clôture et les formats de formulaire restent à vérifier.

1. **Dès le début** : préparer 01, lancer 02 et vérifier le budget/configuration nécessaires à 03. Si la capture image + audio échoue, traiter ce point avant de construire une grande interface.
2. **Première preuve** : terminer 03 avec le contrôle d’usage de 17 ; obtenir une question contextualisée réelle. Le ticket 21 peut déjà être préparé à partir de cette preuve.
3. **Valeur différenciante** : 04 puis 05, pour retrouver le bon passage du passé. Le dossier indique le niveau réellement atteint.
4. **Si le rythme le permet** : 09 pour la vérification, 10 pour une consigne Auto simple et 13 pour l’overlay. Ces parcours enrichissent la vidéo de candidature sans conditionner son existence.
5. **Marge finale** : intégrer les résultats dans 21 et relire les champs du formulaire ; ne pas sacrifier le dossier pour terminer une intégration.

Le contrat POC complet reste le jalon dédié, incluant ses autres tickets. Une candidature avec une preuve partielle honnête n’est pas renommée « POC complet ». L’app Mac complète et la validation TV/GX10 ne sont pas promises dans ces six jours.

## Publication proposée

Le tracker n’est pas configuré pour ce projet. Le skill demande dans ce cas `/setup-matt-pocock-skills`. La configuration locale proposée à valider est : un fichier par ticket sous `.scratch/tvlens/issues/`, numérotation dans l’ordre des dépendances, statut `ready-for-agent`, avec dépendances et blocages externes explicites. Ce statut indique un ticket suffisamment spécifié ; seuls ceux dont tous les prérequis sont levés sont exécutables.

La proposition ci-dessous et le JSON associé sont des brouillons de revue, pas le tracker publié. Après validation, publication locale par défaut ; une destination GitHub ou Linear doit être identifiée avant toute publication distante. Aucun dépôt, aucune issue distante et aucune soumission au concours ne sont créés ici.

## Découpage numéroté à relire


1. **Préparer les réponses projet de la candidature ASUS** — Candidature · P0 · S

   **Bloqué par :** Aucun — peut commencer immédiatement.

   **Livrable :** Lire les réponses projet dans l’ordre des champs fournis et comprendre ce que l’accès distant au GX10 permettra de valider.

2. **Lancer TVLens sur Mac et observer une source vidéo avec son audio** — POC Mac · P0 · M

   **Bloqué par :** Aucun — peut commencer immédiatement.

   **Livrable :** Lire un extrait YouTube dans une fenêtre dédiée, sélectionner cette source, voir l’image et le vumètre réagir, puis arrêter et constater la libération de la source.

3. **Poser une question sur le moment présent via OpenRouter** — POC Mac · P0 · M

   **Bloqué par :** 02.

   **Livrable :** Demander « que vient-il de dire et que voit-on ? » et afficher une réponse reliée à l’intervalle analysé.

4. **Revoir les cinq dernières minutes réellement capturées** — POC Mac · P0 · M

   **Bloqué par :** 02.

   **Livrable :** Après plus de cinq minutes de capture, relire un passage récent puis constater qu’un passage sorti de la fenêtre n’est plus accessible.

5. **Interroger les cinq dernières minutes et retrouver le bon moment** — POC Mac · P0 · M

   **Bloqué par :** 03, 04.

   **Livrable :** Demander « quel chiffre a-t-il annoncé il y a deux minutes ? » et ouvrir le passage correspondant, sans indiquer soi-même la position.

6. **Retrouver les résumés et les réponses après fermeture de session** — POC Mac · P0 · M

   **Bloqué par :** 05.

   **Livrable :** Fermer puis relancer TVLens, ouvrir une session passée et lire son résumé sans prétendre pouvoir rejouer un enregistrement supprimé.

7. **Réexaminer une preuve pour répondre à un détail visuel ou sonore** — POC Mac · P0 · M

   **Bloqué par :** 05.

   **Livrable :** Sélectionner un graphique apparu quatre minutes plus tôt et demander une valeur qui n’était pas dans son résumé initial.

8. **Répondre sans inventer lorsque le contexte est ambigu ou incomplet** — POC Mac · P0 · M

   **Bloqué par :** 06.

   **Livrable :** Demander « pourquoi il fait ça ? » sur un passage ambigu, sélectionner un moment, puis poser une question dont la réponse n’a pas encore été révélée.

9. **Vérifier une affirmation choisie avec des preuves externes** — POC Mac · P0 · M

   **Bloqué par :** 05.

   **Livrable :** Sur un débat, vérifier un chiffre puis ouvrir les sources qui l’étayent, le nuancent ou le contredisent.

10. **Activer une consigne Auto de surveillance ou d’extraction** — POC Mac · P0 · M

   **Bloqué par :** 05.

   **Livrable :** Activer « relève les chiffres annoncés » au milieu d’une vidéo et voir uniquement les occurrences postérieures avec leurs moments sources.

11. **Expliquer automatiquement les éléments ciblés par la consigne** — POC Mac · P0 · S

   **Bloqué par :** 08, 10.

   **Livrable :** Activer une consigne d’explication et voir une carte sur un terme réellement entendu, avec sa définition et son moment source.

12. **Vérifier automatiquement les affirmations correspondant à la consigne** — POC Mac · P0 · M

   **Bloqué par :** 09, 10.

   **Livrable :** Activer « vérifie les chiffres du débat », continuer le visionnage et consulter une vérification sourcée arrivée en arrière-plan.

13. **Poser une question depuis un overlay discret au-dessus de la vidéo** — POC Mac · P0 · M

   **Bloqué par :** 05.

   **Livrable :** Regarder YouTube, ouvrir Lens au clavier, poser une question, consulter la réponse puis replier le panneau sans perdre le visionnage.

14. **Recevoir les résultats Auto dans l’overlay sans interrompre le visionnage** — POC Mac · P0 · S

   **Bloqué par :** 10, 13.

   **Livrable :** Une occurrence Auto apparaît brièvement, se replie et reste consultable après plusieurs minutes.

15. **Gérer et supprimer ses sessions et leurs données** — Mac complet · P1 · S

   **Bloqué par :** 06.

   **Livrable :** Renommer une session, relancer l’app, la retrouver puis la supprimer et vérifier qu’elle ne revient pas.

16. **Continuer à suivre la vidéo pendant Ask et les tâches Auto** — POC Mac · P0 · M

   **Bloqué par :** 12.

   **Livrable :** Introduire volontairement des réponses lentes, poser une question, puis observer un retard indiqué et une récupération sans avalanche de résultats anciens.

17. **Voir et limiter la consommation des API** — POC Mac · P0 · S

   **Bloqué par :** 03.

   **Livrable :** Fixer un petit plafond de requêtes, le consommer en test et constater l’arrêt des nouveaux appels pendant que la capture locale reste disponible.

18. **Poser une question à la voix sans confondre le spectateur et le programme** — Mac complet · P1 · M

   **Bloqué par :** 08, 17.

   **Livrable :** Pendant une vidéo, dicter une question, corriger sa transcription si nécessaire, puis recevoir la même réponse sourcée que dans Ask texte.

19. **Installer et lancer une version Mac de démonstration** — Mac complet · P1 · S

   **Bloqué par :** 02.

   **Livrable :** Copier le paquet de démo, le lancer depuis Finder et refaire une capture image/audio.

20. **Mesurer la qualité du POC sur débat et fiction** — POC Mac · P0 · M

   **Bloqué par :** 07, 11, 14, 16, 17.

   **Livrable :** Exécuter le parcours sur deux extraits et lire un rapport qui relie chaque question, réponse, moment de référence, coût disponible et délai.

21. **Assembler une candidature avec une preuve réelle du prototype** — Candidature · P0 · S

   **Bloqué par :** 01, 03.

   **Livrable :** Ouvrir le dossier final, regarder une capture réelle du prototype et identifier sans ambiguïté les fonctions démontrées et celles encore prévues.

22. **Faire tourner le moteur indépendamment de l’app Electron** — Portabilité · P1 · M

   **Bloqué par :** 06, 12, 17.

   **Livrable :** Lancer le moteur séparément, connecter l’app Mac et capturer, poser une question et retrouver une réponse Auto dans la même session.

23. **Utiliser Ask et Auto depuis un second écran web** — Portabilité · P1 · M

   **Bloqué par :** 18, 22.

   **Livrable :** Capturer une vidéo sur Mac puis poser et dicter une question depuis un téléphone ou un autre navigateur relié au même moteur.

24. **Répondre sur une séquence avec un modèle exécuté sur GX10** — GX10 · P2 · M

   **Bloqué par :** 22.

   **Livrable :** Choisir le profil GX10, traiter un extrait court et lire la réponse avec l’identité du moteur réellement utilisé.

25. **Construire la mémoire audiovisuelle en continu sur GX10** — GX10 · P2 · M

   **Bloqué par :** 24.

   **Livrable :** Faire défiler un extrait de plus de cinq minutes sur le client puis retrouver un événement passé analysé par le GX10.

26. **Exécuter Ask et Auto sur GX10 avec recherche externe séparée** — GX10 · P2 · M

   **Bloqué par :** 16, 25.

   **Livrable :** Lancer Auto sur GX10, poser une question pendant son traitement puis demander une vérification qui affiche les seules recherches externes nécessaires.

27. **Comparer le GX10 au POC API pendant un visionnage prolongé** — GX10 · P2 · M

   **Bloqué par :** 20, 26.

   **Livrable :** Lire un rapport comparatif qui montre précision, moments retrouvés, latences, retard, mémoire et configuration des deux profils.

28. **Vérifier les fonctions locales sans sortie Internet d’inférence** — GX10 · P2 · S

   **Bloqué par :** 26.

   **Livrable :** Bloquer la sortie Internet du moteur après chargement des modèles, garder le lien client nécessaire et poser une question sur un passage déjà observé.

29. **Observer une télévision par caméra avec calibration manuelle** — TV · P2 · M

   **Bloqué par :** 22.

   **Livrable :** Filmer une TV en biais, ajuster les quatre coins, puis retrouver dans la mémoire une image redressée capturée.

30. **Comprendre l’audio d’une TV et l’associer à l’image caméra** — TV · P2 · M

   **Bloqué par :** 25, 29.

   **Livrable :** Lire un débat sur une TV, observer les niveaux audio puis poser une question sur une phrase en ouvrant le passage audiovisuel correspondant.

31. **Utiliser TVLens devant une TV avec un second écran** — TV · P2 · M

   **Bloqué par :** 23, 27, 28, 30.

   **Livrable :** Regarder un contenu sur TV, demander sur téléphone ce qui a été dit plus tôt, puis consulter une vérification Auto et ses sources.

32. **Récupérer proprement après coupure de capture ou arrêt inattendu** — Mac complet · P1 · M

   **Bloqué par :** 15, 16, 19.

   **Livrable :** Interrompre la capture puis relancer l’app ; retrouver les résumés et reprendre une source avec un trou de contexte clairement affiché.

33. **Distribuer une version Mac signée pour des utilisateurs pilotes** — Distribution · P2 · M

   **Bloqué par :** 18, 20, 32.

   **Livrable :** Installer le paquet sur un autre Mac compatible et réaliser capture, Ask et consultation d’une session.


## Fiches proposées et critères d’acceptation

Les fiches suivantes sont autonomes pour la revue. Au moment de leur publication, chacune deviendra un ticket distinct avec le statut prévu par le tracker. Les chemins de fichiers ou les détails de framework non décidés ne sont pas imposés aux implémenteurs.


### 01 — Préparer les réponses projet de la candidature ASUS

**Jalon :** Candidature · **Priorité :** P0 · **Taille :** S · **Statut :** proposé

**À construire :** Produire un dossier relisible décrivant TVLens, sa mémoire audiovisuelle, les modes Ask et Auto, le prototype Mac via OpenRouter et les expériences prévues sur GX10. Le dossier distingue systématiquement réalisé, prévu et non mesuré.

**Bloqué par :** Aucun — peut commencer immédiatement.

**Dépendance externe :** Aucun

**Démonstration :** Lire les réponses projet dans l’ordre des champs fournis et comprendre ce que l’accès distant au GX10 permettra de valider.

**Critères d’acceptation :**

- [ ] Les 17 intitulés fournis sont recensés sans supposer lesquels des 14 annoncés obligatoires sont facultatifs.

- [ ] Les rubriques nom, description, domaine IA, technologies envisagées, avancement, tests GX10 et pertinence matérielle ont une réponse exploitable ; aucune fonctionnalité non construite n’est présentée comme existante.

- [ ] Les coordonnées, liens ou éléments personnels absents sont explicitement à compléter ; les emplacements vidéo et démo ne contiennent pas de lien inventé.

- [ ] La priorité expérimentale est mesurable : qualité des réponses et retard de traitement pendant un visionnage continu ; aucune soumission au formulaire n’est effectuée.


**Vérification :** Relecture croisée des champs fournis et des réponses, sans test automatisé de prose. Vérifier la cohérence des promesses avec l’état réel du prototype.


**Limite de périmètre :** La préparation du dossier démarre immédiatement ; la vidéo réelle et les liens sont ajoutés au ticket 21. Pas de publication ni de transmission de coordonnées.


### 02 — Lancer TVLens sur Mac et observer une source vidéo avec son audio

**Jalon :** POC Mac · **Priorité :** P0 · **Taille :** M · **Statut :** proposé

**À construire :** Livrer une app Electron lançable sur le Mac de développement. L’utilisateur choisit explicitement une source, voit son aperçu et le niveau audio réellement reçu, puis arrête la capture. Introduire le contrat de capture portable à travers ce premier parcours, sans socle abstrait isolé.

**Bloqué par :** Aucun — peut commencer immédiatement.

**Dépendance externe :** Autorisation macOS de capture au premier essai ; action utilisateur éventuelle dans les réglages système.

**Démonstration :** Lire un extrait YouTube dans une fenêtre dédiée, sélectionner cette source, voir l’image et le vumètre réagir, puis arrêter et constater la libération de la source.

**Critères d’acceptation :**

- [ ] La source réellement capturée est identifiée ; une fenêtre ou un écran ne sont jamais présentés comme un onglet isolé si cette isolation n’est pas disponible.

- [ ] Les pistes image et audio sont contrôlées séparément ; absence de piste ou silence prolongé sont visibles et ne sont pas annoncés comme une capture audio validée.

- [ ] Un refus de permission explique comment réessayer ; une annulation n’ouvre pas une capture de remplacement à l’insu de l’utilisateur.

- [ ] Arrêter la session ou quitter l’app libère les pistes et les ressources. Le domaine reçoit des observations horodatées sans dépendre des objets Electron.

- [ ] Un court rapport consigne macOS, Electron, type de source, périmètre audio constaté et résultat réel du test YouTube.


**Vérification :** Test manuel de permission refusée puis accordée, aperçu animé et son connu. Test de contrat avec une source synthétique pour vérifier début/arrêt et horodatage.


**Limite de périmètre :** Aucun contournement DRM ni promesse Netflix. Aucun appel IA nécessaire. Le choix précis des API de capture est fixé par cet essai.


### 03 — Poser une question sur le moment présent via OpenRouter

**Jalon :** POC Mac · **Priorité :** P0 · **Taille :** M · **Statut :** proposé

**À construire :** Configurer OpenRouter dans l’app et obtenir une première réponse à partir d’un court intervalle réellement observé, avec image et audio. Le parcours traverse interface, cas d’usage, port de perception et adaptateur fournisseur remplaçable.

**Bloqué par :** 02 — Lancer TVLens sur Mac et observer une source vidéo avec son audio.

**Dépendance externe :** Compte OpenRouter et modèle accessibles ; clé renseignée par l’utilisateur. Aucun crédit supplémentaire supposé.

**Démonstration :** Demander « que vient-il de dire et que voit-on ? » et afficher une réponse reliée à l’intervalle analysé.

**Critères d’acceptation :**

- [ ] La clé reste hors de l’interface exposée, des logs et des exports ; le stockage utilise un mécanisme approprié au système, avec suppression possible.

- [ ] Le modèle et ses modalités nécessaires sont vérifiés sur un essai ; si une transcription séparée est nécessaire, elle reste derrière un port distinct et sa configuration est explicite.

- [ ] La réponse distingue ce qui est entendu et vu, indique le moment capturé et ne complète pas un contenu absent en prétendant l’avoir observé.

- [ ] Sans clé, en cas de quota épuisé ou de modèle incompatible, un état compréhensible est affiché. Un clic ne déclenche pas de retries payants infinis.

- [ ] Les appels ne démarrent qu’après configuration et activation par l’utilisateur ; un plafond de requêtes simple borne les essais. Le domaine est testable avec un fournisseur simulé, clairement réservé aux tests.


**Vérification :** Contrat fournisseur testé avec réponses valides, erreurs et modalités manquantes ; un appel réel seulement après configuration par l’utilisateur, avec mesure du délai et de l’usage.


**Limite de périmètre :** Une courte séquence et une question à la fois suffisent. Les quotas disponibles déterminent le test ; pas de modèle précis imposé par la roadmap.


### 04 — Revoir les cinq dernières minutes réellement capturées

**Jalon :** POC Mac · **Priorité :** P0 · **Taille :** M · **Statut :** proposé

**À construire :** Conserver une fenêtre glissante audiovisuelle consultable dans l’app. L’utilisateur peut sélectionner un moment et relire le passage, pendant que la capture continue. La durée est configurable et réglée à cinq minutes par défaut.

**Bloqué par :** 02 — Lancer TVLens sur Mac et observer une source vidéo avec son audio.

**Dépendance externe :** Aucun

**Démonstration :** Après plus de cinq minutes de capture, relire un passage récent puis constater qu’un passage sorti de la fenêtre n’est plus accessible.

**Critères d’acceptation :**

- [ ] Les segments conservés sont décodables individuellement ou avec leurs dépendances conservées ; le replay ne repose pas sur des fragments inutilisables.

- [ ] La rétention borne le volume ; les données brutes expirées sont effectivement libérées, sans supprimer les métadonnées nécessaires aux références historiques.

- [ ] Le temps correspond à l’ordre observé : revenir en arrière dans le lecteur crée de nouvelles observations plutôt que de réécrire les précédentes.

- [ ] Le replay ne met pas en pause la capture ; les interruptions et segments manquants sont identifiés.

- [ ] Augmenter la durée ne fait pas réapparaître des données déjà expirées ; diminuer la durée applique la nouvelle limite.


**Vérification :** Tests avec horloge contrôlée sur expiration, modification de durée et trous ; essai réel de capture/relecture avec inspection du volume conservé.


**Limite de périmètre :** Fenêtre bornée, pas d’archive permanente du film. Les fichiers temporaires ne sont pas inclus dans les exports ni dans les résumés.


### 05 — Interroger les cinq dernières minutes et retrouver le bon moment

**Jalon :** POC Mac · **Priorité :** P0 · **Taille :** M · **Statut :** proposé

**À construire :** Construire progressivement des observations synchronisées et permettre à Ask de répondre sur le passé récent. Chaque réponse présente les moments qui l’étayent ; l’utilisateur peut ouvrir les preuves disponibles.

**Bloqué par :** 03 — Poser une question sur le moment présent via OpenRouter ; 04 — Revoir les cinq dernières minutes réellement capturées.

**Dépendance externe :** Aucun

**Démonstration :** Demander « quel chiffre a-t-il annoncé il y a deux minutes ? » et ouvrir le passage correspondant, sans indiquer soi-même la position.

**Critères d’acceptation :**

- [ ] Les observations relient descriptions visuelles, transcription ou contenu audio interprété et intervalle de capture ; la résolution temporelle est explicite.

- [ ] Les questions relatives sont ancrées sur l’instant de la demande, même si l’inférence termine plus tard.

- [ ] La réponse contient uniquement des identifiants de moments existants dans la session et des cartes permettant leur consultation.

- [ ] Un passage non observé ou un intervalle encore non analysé n’est pas présenté comme connu ; le délai d’analyse est visible.

- [ ] La construction du contexte ne réenvoie pas systématiquement toute la session ; la quantité de contexte transmise est mesurable.


**Vérification :** Scénarios fixes avec événements semblables à des instants différents, retour arrière du lecteur et question pendant une analyse en cours. Vérifier le moment source, pas seulement une réponse plausible.


### 06 — Retrouver les résumés et les réponses après fermeture de session

**Jalon :** POC Mac · **Priorité :** P0 · **Taille :** M · **Statut :** proposé

**À construire :** Conserver une mémoire résumée de toute la session et sauvegarder résumés et réponses. L’utilisateur ouvre une ancienne session, demande un récapitulatif et comprend ce qui reste consultable quand les preuves détaillées ont expiré.

**Bloqué par :** 05 — Interroger les cinq dernières minutes et retrouver le bon moment.

**Dépendance externe :** Aucun

**Démonstration :** Fermer puis relancer TVLens, ouvrir une session passée et lire son résumé sans prétendre pouvoir rejouer un enregistrement supprimé.

**Critères d’acceptation :**

- [ ] Les résumés couvrent la session avec leurs intervalles et références ; leur provenance reste distinguée des observations détaillées.

- [ ] Résumés, questions et réponses survivent à un redémarrage ; les données brutes restent soumises à leur expiration et ne deviennent pas une archive permanente.

- [ ] Une question sur un ancien résumé peut recevoir une réponse, mais une demande de détail absent indique que le passage n’est plus disponible.

- [ ] Le récapitulatif rend visibles les périodes non observées ; une ancienne session ne se mélange pas silencieusement avec la session active.


**Vérification :** Test de persistance après arrêt/redémarrage ; test d’un ancien détail volontairement absent du résumé ; vérifier qu’aucune référence expirée n’ouvre un autre passage.


**Limite de périmètre :** Résumé hiérarchique évolutif, sans exiger une base vectorielle ou un graphe de connaissances.


### 07 — Réexaminer une preuve pour répondre à un détail visuel ou sonore

**Jalon :** POC Mac · **Priorité :** P0 · **Taille :** M · **Statut :** proposé

**À construire :** Quand le contexte compact est insuffisant, permettre à Ask de réexaminer un passage conservé ou un moment sélectionné. Ce parcours doit répondre à une question non anticipée lors de l’analyse initiale.

**Bloqué par :** 05 — Interroger les cinq dernières minutes et retrouver le bon moment.

**Dépendance externe :** Aucun

**Démonstration :** Sélectionner un graphique apparu quatre minutes plus tôt et demander une valeur qui n’était pas dans son résumé initial.

**Critères d’acceptation :**

- [ ] Le passage choisi est transmis à un traitement approprié avec ses limites temporelles ; les images et l’audio utilisés sont traçables.

- [ ] Une réponse corrigée après réexamen indique sa nouvelle preuve sans transformer une ancienne approximation en citation certaine.

- [ ] Un détail illisible ou une voix inintelligible produit une limite explicite, pas une valeur devinée.

- [ ] Une preuve expirée entre sélection et traitement produit un résultat « détail expiré » ; la rétention reste bornée même pendant les demandes.


**Vérification :** Cas avec graphique peu lisible, geste silencieux et valeur omise du résumé ; fournisseur simulé pour tester l’expiration pendant la demande, plus essai multimodal réel si configuré.


### 08 — Répondre sans inventer lorsque le contexte est ambigu ou incomplet

**Jalon :** POC Mac · **Priorité :** P0 · **Taille :** M · **Statut :** proposé

**À construire :** Rendre explicite le contrat des réponses Ask : observation, explication, hypothèse et information indisponible. Les références ambiguës proposent des moments candidats ; les questions narratives n’utilisent pas des événements futurs pour combler la mémoire.

**Bloqué par :** 06 — Retrouver les résumés et les réponses après fermeture de session.

**Dépendance externe :** Aucun

**Démonstration :** Demander « pourquoi il fait ça ? » sur un passage ambigu, sélectionner un moment, puis poser une question dont la réponse n’a pas encore été révélée.

**Critères d’acceptation :**

- [ ] Lorsque plusieurs moments correspondent, l’interface propose des candidats horodatés plutôt que de choisir silencieusement un événement incertain.

- [ ] Les réponses distinguent les observations de la session des explications générales et des hypothèses.

- [ ] Le parcours narratif n’effectue pas de recherche du résumé complet du film ; des cas de spoiler sont inclus dans la validation, sans promettre une garantie absolue fondée sur un prompt.

- [ ] Une question sans réponse dans le contexte, une capture interrompue et un détail expiré ont des états distincts.

- [ ] Les consignes présentes dans la vidéo ou la transcription sont traitées comme du contenu observé, pas comme des instructions de l’utilisateur.


**Vérification :** Batterie de cas adverses et narratifs avec réponse absente, homonymes, référence ambiguë et instruction affichée dans la vidéo. Vérifier abstention et références, pas une phrase exacte.


### 09 — Vérifier une affirmation choisie avec des preuves externes

**Jalon :** POC Mac · **Priorité :** P0 · **Taille :** M · **Statut :** proposé

**À construire :** À partir d’un moment sélectionné ou de « vérifie ça », retrouver l’affirmation, montrer ce qui va être vérifié, rechercher des preuves et afficher une réponse sourcée distincte du contenu de la vidéo.

**Bloqué par :** 05 — Interroger les cinq dernières minutes et retrouver le bon moment.

**Dépendance externe :** Accès à un service de recherche documenté et compatible avec le budget existant.

**Démonstration :** Sur un débat, vérifier un chiffre puis ouvrir les sources qui l’étayent, le nuancent ou le contredisent.

**Critères d’acceptation :**

- [ ] L’affirmation et son instant source sont visibles ; plusieurs affirmations candidates nécessitent un choix ou une clarification.

- [ ] La comparaison tient compte de l’entité, de l’indicateur, de la période et de la géographie disponibles ; un élément manquant est signalé.

- [ ] Les liens et extraits proviennent des résultats effectivement récupérés ; des URLs inventées par le modèle ne sont pas acceptées comme preuves.

- [ ] La réponse peut confirmer, nuancer, contredire ou rester indécise. Une recherche sans résultat ne devient pas un verdict de fausseté.

- [ ] Le recours au réseau, la progression, l’échec et l’absence de sources sont visibles ; la capture continue.


**Vérification :** Cas avec données compatibles, indicateurs différents, sources contradictoires et panne de recherche. Vérifier la provenance des URLs et la fidélité des citations.


**Limite de périmètre :** La recherche est un port distinct ; ne pas supposer que tout modèle OpenRouter fournit automatiquement des sources fiables.


### 10 — Activer une consigne Auto de surveillance ou d’extraction

**Jalon :** POC Mac · **Priorité :** P0 · **Taille :** M · **Statut :** proposé

**À construire :** L’utilisateur formule une consigne, lit sa reformulation et active Auto. Les nouvelles observations produisent des cartes ciblées, par exemple les chiffres énoncés ou les ingrédients montrés, sans rejouer le passé.

**Bloqué par :** 05 — Interroger les cinq dernières minutes et retrouver le bon moment.

**Dépendance externe :** Aucun

**Démonstration :** Activer « relève les chiffres annoncés » au milieu d’une vidéo et voir uniquement les occurrences postérieures avec leurs moments sources.

**Critères d’acceptation :**

- [ ] Une seule consigne est active ; sa reformulation expose la tâche retenue et refuse les actions hors des capacités prévues.

- [ ] L’activation enregistre un instant et une version de consigne ; seuls les événements postérieurs sont éligibles.

- [ ] Chaque carte identifie le moment, la consigne et sa version ; les répétitions d’un même événement sont dédupliquées.

- [ ] Modifier ou désactiver Auto empêche les tâches anciennes de publier comme si elles relevaient de la nouvelle consigne.

- [ ] Les notifications ne prennent pas le focus et la capture reste active.


**Vérification :** Tests d’activation tardive, répétition, changement de consigne et réponse fournisseur arrivant après désactivation ; démonstration d’extraction sur un extrait connu.


### 11 — Expliquer automatiquement les éléments ciblés par la consigne

**Jalon :** POC Mac · **Priorité :** P0 · **Taille :** S · **Statut :** proposé

**À construire :** Étendre Auto à l’explication : une consigne telle que « explique les termes économiques » produit des explications courtes et reliées aux occurrences observées.

**Bloqué par :** 08 — Répondre sans inventer lorsque le contexte est ambigu ou incomplet ; 10 — Activer une consigne Auto de surveillance ou d’extraction.

**Dépendance externe :** Aucun

**Démonstration :** Activer une consigne d’explication et voir une carte sur un terme réellement entendu, avec sa définition et son moment source.

**Critères d’acceptation :**

- [ ] L’explication générale est distinguée de la citation ou de l’observation qui l’a déclenchée.

- [ ] Une même occurrence ne déclenche pas une série de cartes identiques ; une fréquence bornée évite de couvrir l’écran.

- [ ] Le mode ne lance pas de recherche externe sans que la tâche le nécessite et que cette utilisation soit visible.

- [ ] Les limites contextuelles et narratives d’Ask s’appliquent aussi aux explications Auto.


**Vérification :** Cas de terme répété, terme mal transcrit et dialogue de fiction ; vérifier l’absence d’attribution d’une explication au locuteur.


### 12 — Vérifier automatiquement les affirmations correspondant à la consigne

**Jalon :** POC Mac · **Priorité :** P0 · **Taille :** M · **Statut :** proposé

**À construire :** Une consigne Auto de vérification sélectionne les affirmations pertinentes, lance le parcours de preuves et affiche des résultats sourcés, sans recherche sur chaque phrase.

**Bloqué par :** 09 — Vérifier une affirmation choisie avec des preuves externes ; 10 — Activer une consigne Auto de surveillance ou d’extraction.

**Dépendance externe :** Aucun

**Démonstration :** Activer « vérifie les chiffres du débat », continuer le visionnage et consulter une vérification sourcée arrivée en arrière-plan.

**Critères d’acceptation :**

- [ ] La sélection distingue autant que possible faits vérifiables, opinions et prédictions ; les données nécessaires sont conservées avec la citation.

- [ ] Les affirmations répétées ou déjà en cours ne déclenchent pas des recherches en double ; leur moment d’apparition reste identifiable.

- [ ] La fréquence et la file de recherches sont bornées ; les résultats restent rattachés à la version de consigne qui les a produits.

- [ ] Un résultat sans source, en échec ou dépassé est affiché comme tel ; il n’est pas transformé en vérification réussie.


**Vérification :** Séquence mêlant chiffre, opinion, répétition et nouvelle consigne ; vérifier les appels réellement lancés et l’attribution des réponses tardives.


### 13 — Poser une question depuis un overlay discret au-dessus de la vidéo

**Jalon :** POC Mac · **Priorité :** P0 · **Taille :** M · **Statut :** proposé

**À construire :** Ajouter une petite fenêtre flottante qui se déplie en Ask par clic ou raccourci, affiche la réponse et permet d’ouvrir sa preuve. Le moteur et la session sont partagés avec la fenêtre principale.

**Bloqué par :** 05 — Interroger les cinq dernières minutes et retrouver le bon moment.

**Dépendance externe :** Aucun

**Démonstration :** Regarder YouTube, ouvrir Lens au clavier, poser une question, consulter la réponse puis replier le panneau sans perdre le visionnage.

**Critères d’acceptation :**

- [ ] La pastille est déplaçable ; ouvrir, replier et masquer le panneau fonctionnent sans créer une nouvelle session ou dupliquer les appels.

- [ ] Le panneau interactif reçoit le clavier uniquement lorsqu’on le sollicite ; le mode passif laisse les interactions prévues à l’application sous-jacente.

- [ ] Le plein écran, les espaces macOS et le changement de moniteur font l’objet d’essais ; les comportements réellement supportés sont documentés.

- [ ] Une stratégie vérifiée empêche l’analyse récursive de l’overlay : capture de la fenêtre source privilégiée ou exclusion démontrée. Une simple option non testée n’est pas considérée suffisante.

- [ ] Les cartes de preuve renvoient à la même session que dans la fenêtre principale.


**Vérification :** Essais manuels avec vidéo fenêtrée/plein écran, saisie, clic sur le lecteur, deux écrans si disponibles ; vérifier sur la capture si l’overlay est inclus.


**Limite de périmètre :** Overlay sur le bureau Mac. Ce ticket ne promet aucun overlay sur une application native de la TV.


### 14 — Recevoir les résultats Auto dans l’overlay sans interrompre le visionnage

**Jalon :** POC Mac · **Priorité :** P0 · **Taille :** S · **Statut :** proposé

**À construire :** Afficher les résultats Auto sous forme de cartes discrètes dans l’overlay, avec compteur de résultats non lus et accès au détail dans l’historique.

**Bloqué par :** 10 — Activer une consigne Auto de surveillance ou d’extraction ; 13 — Poser une question depuis un overlay discret au-dessus de la vidéo.

**Dépendance externe :** Aucun

**Démonstration :** Une occurrence Auto apparaît brièvement, se replie et reste consultable après plusieurs minutes.

**Critères d’acceptation :**

- [ ] Les résultats ne volent pas le focus et ne masquent pas durablement la vidéo ; les notifications peuvent être suspendues sans arrêter la capture.

- [ ] Chaque carte conserve moment source, type de tâche et statut de recherche ; les détails expirés sont indiqués.

- [ ] Un afflux de résultats est regroupé ou limité sans perdre leur historique ; une nouvelle carte n’écrase pas une question Ask en cours.

- [ ] Les réponses d’ancienne consigne restent étiquetées correctement dans la fenêtre principale et dans l’overlay.


**Vérification :** Rejouer un lot de résultats rapides et une recherche retardée pendant une saisie Ask ; vérifier focus, déduplication et consultation ultérieure.


### 15 — Gérer et supprimer ses sessions et leurs données

**Jalon :** Mac complet · **Priorité :** P1 · **Taille :** S · **Statut :** proposé

**À construire :** Permettre de renommer, consulter et supprimer les sessions sauvegardées. L’utilisateur distingue clairement les résumés persistants des enregistrements temporaires et peut effacer les données locales d’une session.

**Bloqué par :** 06 — Retrouver les résumés et les réponses après fermeture de session.

**Dépendance externe :** Aucun

**Démonstration :** Renommer une session, relancer l’app, la retrouver puis la supprimer et vérifier qu’elle ne revient pas.

**Critères d’acceptation :**

- [ ] La suppression efface les résumés, réponses, références et éventuelles preuves locales encore présentes pour la session ciblée.

- [ ] Une suppression pendant une tâche en cours ne laisse pas la réponse tardive recréer la session.

- [ ] La session active et les sessions archivées ne mélangent pas leurs moments ; changer de programme peut créer explicitement une nouvelle session.

- [ ] L’interface explique que l’effacement local ne constitue pas une suppression des données éventuellement conservées par des fournisseurs externes.


**Vérification :** Tests de suppression après redémarrage et pendant une réponse en attente ; inspection du stockage local pour les identifiants supprimés.


### 16 — Continuer à suivre la vidéo pendant Ask et les tâches Auto

**Jalon :** POC Mac · **Priorité :** P0 · **Taille :** M · **Statut :** proposé

**À construire :** Garder l’expérience utilisable lorsque les fournisseurs ralentissent. Prioriser Ask, borner les files et rendre visible le retard de compréhension sans interrompre l’acquisition.

**Bloqué par :** 12 — Vérifier automatiquement les affirmations correspondant à la consigne.

**Dépendance externe :** Aucun

**Démonstration :** Introduire volontairement des réponses lentes, poser une question, puis observer un retard indiqué et une récupération sans avalanche de résultats anciens.

**Critères d’acceptation :**

- [ ] La capture continue indépendamment des recherches ; le dernier instant capturé et le dernier instant compris sont distincts.

- [ ] Une demande Ask est prioritaire sur les nouvelles tâches Auto ; les limites des appels déjà partis sont explicites et leur annulation locale ne prétend pas annuler une facturation.

- [ ] La file, les retries et les données temporaires restent bornés ; les tâches dépassées sont écartées avec une trace compréhensible.

- [ ] Une panne suivie d’une reprise produit un trou de contexte ou un rattrapage identifié, jamais une continuité inventée.

- [ ] Arrêter une session interdit toute publication tardive de ses résultats dans une autre session.


**Vérification :** Tests d’ordonnancement avec fournisseur lent, réponses hors ordre, timeout et arrêt/reprise ; essai continu mesurant l’écart capture/compréhension et la mémoire utilisée.


### 17 — Voir et limiter la consommation des API

**Jalon :** POC Mac · **Priorité :** P0 · **Taille :** S · **Statut :** proposé

**À construire :** Afficher les appels et les usages réellement rapportés par les fournisseurs, avec un plafond configurable et un état d’arrêt de l’inférence lorsque le budget ou le quota disponible est atteint.

**Bloqué par :** 03 — Poser une question sur le moment présent via OpenRouter.

**Dépendance externe :** Aucun

**Démonstration :** Fixer un petit plafond de requêtes, le consommer en test et constater l’arrêt des nouveaux appels pendant que la capture locale reste disponible.

**Critères d’acceptation :**

- [ ] Le compteur distingue perception, Ask, Auto et recherche ; un coût inconnu n’est jamais affiché comme nul.

- [ ] Un plafond de requêtes peut être appliqué avant l’appel ; les estimations monétaires et coûts retournés sont clairement distingués.

- [ ] Toutes les voies d’appel passent par le même contrôle, y compris recherche et retries ; aucun rechargement automatique n’est effectué.

- [ ] L’utilisateur peut désactiver les appels externes et supprimer sa clé ; les tâches en attente ne continuent pas à lancer des appels ensuite.


**Vérification :** Tests à la limite du plafond, appels concurrents, coût absent et suppression de clé. Une fausse réponse de fournisseur suffit pour vérifier le blocage sans dépense.


### 18 — Poser une question à la voix sans confondre le spectateur et le programme

**Jalon :** Mac complet · **Priorité :** P1 · **Taille :** M · **Statut :** proposé

**À construire :** Ajouter un bouton maintenir-pour-parler ou un raccourci équivalent. La parole de l’utilisateur devient une question Ask relisible et corrigeable, tandis que l’audio du programme reste une source de contexte séparée.

**Bloqué par :** 08 — Répondre sans inventer lorsque le contexte est ambigu ou incomplet ; 17 — Voir et limiter la consommation des API.

**Dépendance externe :** Permission microphone et service ou modèle de transcription disponible.

**Démonstration :** Pendant une vidéo, dicter une question, corriger sa transcription si nécessaire, puis recevoir la même réponse sourcée que dans Ask texte.

**Critères d’acceptation :**

- [ ] L’accès au microphone est demandé uniquement pour cette fonction et son activation est visible ; le refus laisse Ask texte utilisable.

- [ ] La transcription utilisateur n’est pas insérée dans la transcription du programme ni interprétée comme une nouvelle observation vidéo.

- [ ] L’instant de référence de la question correspond au déclenchement de la prise de parole et reste stable pendant la transcription.

- [ ] La capture micro s’arrête après relâchement, annulation ou erreur ; le texte peut être corrigé avant envoi.

- [ ] Les appels éventuels de transcription passent par le contrôle d’usage commun.


**Vérification :** Essai avec programme audible en arrière-plan, question annulée et permission refusée ; contrat de transcription testé avec sorties partielles et erreur.


**Limite de périmètre :** Pas de wake word permanent ni de synthèse vocale imposée.


### 19 — Installer et lancer une version Mac de démonstration

**Jalon :** Mac complet · **Priorité :** P1 · **Taille :** S · **Statut :** proposé

**À construire :** Produire un paquet macOS de développement qui se lance sans terminal et conserve les permissions et données dans des emplacements adaptés. L’utilisateur ouvre TVLens, choisit une source et quitte proprement.

**Bloqué par :** 02 — Lancer TVLens sur Mac et observer une source vidéo avec son audio.

**Dépendance externe :** Aucun

**Démonstration :** Copier le paquet de démo, le lancer depuis Finder et refaire une capture image/audio.

**Critères d’acceptation :**

- [ ] Le paquet cible l’architecture du Mac testée et porte un nom, une version et une identité stables.

- [ ] Les descriptions d’utilisation de la capture et du microphone nécessaires sont présentes ; le périmètre audio est retesté depuis le paquet, pas seulement depuis un terminal.

- [ ] Le démarrage ne dépend pas d’un serveur de développement et aucune clé ni donnée personnelle n’est embarquée.

- [ ] Les limites liées à une version non signée/notarisée sont décrites honnêtement ; la fermeture libère capture et traitements.


**Vérification :** Construction depuis une installation de dépendances propre puis lancement du paquet et capture manuelle. Contrôle du contenu du paquet pour absence de secrets.


**Limite de périmètre :** Version personnelle de démonstration. La distribution signée pour d’autres utilisateurs est séparée au ticket 33.


### 20 — Mesurer la qualité du POC sur débat et fiction

**Jalon :** POC Mac · **Priorité :** P0 · **Taille :** M · **Statut :** proposé

**À construire :** Fournir une procédure reproductible et un rapport de validation du contrat produit : questions libres, événements visuels, rappel temporel, résumé ancien, Auto et vérification. Le rapport permet de rejouer les mêmes scénarios avec un autre fournisseur.

**Bloqué par :** 07 — Réexaminer une preuve pour répondre à un détail visuel ou sonore ; 11 — Expliquer automatiquement les éléments ciblés par la consigne ; 14 — Recevoir les résultats Auto dans l’overlay sans interrompre le visionnage ; 16 — Continuer à suivre la vidéo pendant Ask et les tâches Auto ; 17 — Voir et limiter la consommation des API.

**Dépendance externe :** Aucun

**Démonstration :** Exécuter le parcours sur deux extraits et lire un rapport qui relie chaque question, réponse, moment de référence, coût disponible et délai.

**Critères d’acceptation :**

- [ ] Deux extraits préparés, débat et fiction, sont référencés avec leur provenance et leur disponibilité ; la lecture est réelle, sans réponses applicatives préécrites.

- [ ] Dix questions d’évaluation non codées en dur incluent au moins deux questions visuelles, deux références au passé et une information absente ; une référence humaine permet de juger réponse et moment source.

- [ ] Le rapport expose le nombre de questions correctement contextualisées sur dix ; la cible est au moins huit, avec abstention sur le cas sans réponse. Un échec n’est pas masqué par une modification a posteriori des questions.

- [ ] Une consigne Auto, une vérification avec sources, un résumé ancien et un détail expiré sont démontrés pendant que la capture continue.

- [ ] Les délais de réponse et de compréhension, erreurs et usages sont enregistrés ; les cibles de 5 s et 30 s restent identifiées comme objectifs si non atteintes.


**Vérification :** Revue du rapport et reproduction d’au moins un succès et un échec. Le ticket peut livrer le protocole même si le score échoue, mais le jalon POC ne passe pas tant que les critères produit ne sont pas atteints.


**Limite de périmètre :** Rapport mesuré, pas promesse de robustesse sur n’importe quelle vidéo. Les questions de validation ne servent pas à coder des réponses dédiées.


### 21 — Assembler une candidature avec une preuve réelle du prototype

**Jalon :** Candidature · **Priorité :** P0 · **Taille :** S · **Statut :** proposé

**À construire :** Compléter le dossier préparé tôt avec une courte vidéo du comportement réellement disponible et les liens fournis ou autorisés. Décrire précisément ce que la phase GX10 doit encore développer ou valider.

**Bloqué par :** 01 — Préparer les réponses projet de la candidature ASUS ; 03 — Poser une question sur le moment présent via OpenRouter.

**Dépendance externe :** Coordonnées et liens personnels pour la version finale ; formulaire réel pour les contraintes exactes.

**Démonstration :** Ouvrir le dossier final, regarder une capture réelle du prototype et identifier sans ambiguïté les fonctions démontrées et celles encore prévues.

**Critères d’acceptation :**

- [ ] La vidéo montre au minimum une capture et une réponse contextualisée réelles ; elle ne fait pas passer une interface simulée pour de l’inférence.

- [ ] L’avancement du dossier reflète les tickets terminés au moment de la préparation ; des fonctionnalités manquantes peuvent rester annoncées comme prévues sans bloquer toute la candidature.

- [ ] Les liens de vidéo, dépôt, démo ou portfolio sont vérifiés lorsqu’ils existent ; les éléments manquants sont signalés plutôt qu’inventés.

- [ ] Le texte indique que l’accès est distant et que le respect d’un fonctionnement physiquement local restera à démontrer ensuite.

- [ ] Un paquet de réponses relisible est remis à l’utilisateur ; aucune soumission définitive au concours ni publication publique n’est effectuée par ce ticket.


**Vérification :** Relecture factuelle face à la vidéo et au prototype. Vérifier les champs obligatoires et limites de longueur dans le formulaire réel lorsque disponible.


**Limite de périmètre :** Ce ticket ne dépend pas du rapport complet 20 : la candidature doit pouvoir partir à temps avec un avancement honnête. L’envoi reste une action distincte de l’utilisateur.


### 22 — Faire tourner le moteur indépendamment de l’app Electron

**Jalon :** Portabilité · **Priorité :** P1 · **Taille :** M · **Statut :** proposé

**À construire :** Exécuter le moteur de sessions, mémoire et Ask/Auto dans un service autonome, puis connecter le client Mac à ce service. L’expérience reste identique lorsque moteur et interface ne partagent plus le même processus.

**Bloqué par :** 06 — Retrouver les résumés et les réponses après fermeture de session ; 12 — Vérifier automatiquement les affirmations correspondant à la consigne ; 17 — Voir et limiter la consommation des API.

**Dépendance externe :** Aucun

**Démonstration :** Lancer le moteur séparément, connecter l’app Mac et capturer, poser une question et retrouver une réponse Auto dans la même session.

**Critères d’acceptation :**

- [ ] Les données échangées sont versionnées et transportent identifiants de session, intervalles, preuves et erreurs ; aucun objet Electron n’est nécessaire au moteur.

- [ ] Le même domaine et les mêmes cas d’usage sont exercés par le transport local et par le service ; pas de seconde implémentation de la mémoire.

- [ ] Le service refuse un client non autorisé, borne les entrées et n’expose pas ses clés fournisseur au client.

- [ ] Une déconnexion est visible ; une reconnexion ne duplique pas les observations ou les tâches déjà acceptées.

- [ ] Les références de preuve restent consultables avec contrôle de session et respect de l’expiration.


**Vérification :** Parcours de contrat depuis deux transports ; tests de duplication, client non autorisé, coupure réseau et référence expirée.


**Limite de périmètre :** Un utilisateur et une machine moteur ; pas de plateforme multi-tenant ni de microservices. Le protocole peut rester simple.


### 23 — Utiliser Ask et Auto depuis un second écran web

**Jalon :** Portabilité · **Priorité :** P1 · **Taille :** M · **Statut :** proposé

**À construire :** Ouvrir une interface web sur un second appareil pour consulter la session en cours, poser une question en texte ou par maintien-pour-parler et modifier Auto pendant que la source continue à être capturée ailleurs.

**Bloqué par :** 18 — Poser une question à la voix sans confondre le spectateur et le programme ; 22 — Faire tourner le moteur indépendamment de l’app Electron.

**Dépendance externe :** Aucun

**Démonstration :** Capturer une vidéo sur Mac puis poser et dicter une question depuis un téléphone ou un autre navigateur relié au même moteur.

**Critères d’acceptation :**

- [ ] Le client réutilise la présentation et les contrats utiles sans dépendre d’Electron ; il n’a pas besoin de capturer la vidéo lui-même.

- [ ] La session sélectionnée, les réponses et les cartes Auto sont cohérentes entre clients ; une reconnexion ne déclenche pas de nouvel appel IA.

- [ ] Les preuves récentes sont consultables et les anciennes sont marquées expirées ; aucune URL brute du stockage local n’est exposée.

- [ ] Le moteur n’est pas ouvert anonymement sur le réseau ; une connexion explicite autorise le client et la perte de connexion est visible.

- [ ] La présentation reste utilisable sur petit écran avec clavier tactile.

- [ ] Le micro du second écran utilise le même parcours de transcription utilisateur que le client Mac ; le contexte de connexion compatible avec cette permission est configuré, et le refus laisse la saisie texte utilisable.


**Vérification :** Essai réel Mac + navigateur secondaire : texte, question dictée, permission micro refusée, accès non autorisé, reconnexion et consultation d’une preuve expirée.


**Limite de périmètre :** Interface second écran. Ni app LG native ni capture depuis le navigateur de la TV promises.


### 24 — Répondre sur une séquence avec un modèle exécuté sur GX10

**Jalon :** GX10 · **Priorité :** P2 · **Taille :** M · **Statut :** proposé

**À construire :** Brancher un premier adaptateur d’inférence sur le GX10 distant et répondre à une question sur une courte séquence de test dans la même interface. Établir un premier résultat local au serveur, sans fallback cloud silencieux.

**Bloqué par :** 22 — Faire tourner le moteur indépendamment de l’app Electron.

**Dépendance externe :** Sélection au challenge, accès distant GX10 et droit de déployer les modèles nécessaires.

**Démonstration :** Choisir le profil GX10, traiter un extrait court et lire la réponse avec l’identité du moteur réellement utilisé.

**Critères d’acceptation :**

- [ ] Le modèle, le runtime, les modalités et la configuration matérielle disponibles sont relevés à partir de la machine, sans supposer leur compatibilité.

- [ ] L’adaptateur respecte le contrat existant et les cas d’usage restent inchangés ; une modalité indisponible est signalée.

- [ ] Une erreur du moteur GX10 ne bascule pas automatiquement vers OpenRouter ; les appels sortants d’inférence sont observables.

- [ ] Le résultat et le délai sont enregistrés sur le même exemple que la référence API.

- [ ] L’interface précise que la machine est distante : les données envoyées à ce serveur ne sont pas décrites comme restant dans le logement.


**Vérification :** Essai réel sur le matériel avec capture des versions, résultat, latence et journal des sorties réseau d’inférence.


**Limite de périmètre :** Premier parcours court ; aucun engagement de temps réel continu à ce stade.


### 25 — Construire la mémoire audiovisuelle en continu sur GX10

**Jalon :** GX10 · **Priorité :** P2 · **Taille :** M · **Statut :** proposé

**À construire :** Faire produire les observations audio et visuelles du flux par les modèles exécutés sur GX10, puis interroger leur mémoire temporelle depuis le client existant.

**Bloqué par :** 24 — Répondre sur une séquence avec un modèle exécuté sur GX10.

**Dépendance externe :** GX10 accessible et modèles audio/vision opérationnels au ticket 24.

**Démonstration :** Faire défiler un extrait de plus de cinq minutes sur le client puis retrouver un événement passé analysé par le GX10.

**Critères d’acceptation :**

- [ ] La transcription ou compréhension audio et l’analyse visuelle sont exécutées par les adaptateurs GX10 avec horodatages conservés.

- [ ] Le sampling, les résolutions et la compression sont explicites ; les changements de paramètres ne modifient pas silencieusement le sens des références temporelles.

- [ ] Le retard et les ressources sont observables ; une saturation applique des limites plutôt qu’une croissance illimitée de la file.

- [ ] Le rappel temporel ouvre le bon passage et conserve les états de détail expiré ou de contexte manquant.

- [ ] Aucune inférence cloud de secours n’est utilisée sans changement explicite de profil.


**Vérification :** Séquence audiovisuelle comprenant nombres parlés, texte affiché et événement silencieux ; mesure du retard de compréhension pendant toute la séquence.


### 26 — Exécuter Ask et Auto sur GX10 avec recherche externe séparée

**Jalon :** GX10 · **Priorité :** P2 · **Taille :** M · **Statut :** proposé

**À construire :** Faire tourner les décisions Ask/Auto, la mémoire et les explications sur le GX10, tout en conservant un accès externe explicite pour les vérifications qui demandent des sources.

**Bloqué par :** 16 — Continuer à suivre la vidéo pendant Ask et les tâches Auto ; 25 — Construire la mémoire audiovisuelle en continu sur GX10.

**Dépendance externe :** GX10 et service de recherche disponibles pour le scénario sourcé.

**Démonstration :** Lancer Auto sur GX10, poser une question pendant son traitement puis demander une vérification qui affiche les seules recherches externes nécessaires.

**Critères d’acceptation :**

- [ ] Les modes surveiller, extraire et expliquer utilisent les composants locaux configurés ; leurs limites de qualité sont visibles.

- [ ] Une vérification externalise une requête de recherche bornée plutôt que le flux audiovisuel brut ; la destination et les données envoyées sont documentées.

- [ ] La priorité Ask sur Auto et la gestion des réponses tardives fonctionnent aussi avec le runtime local.

- [ ] La provenance de chaque traitement distingue moteur GX10, fournisseur de recherche et éventuel client distant.

- [ ] Désactiver la recherche externe laisse les fonctions ne dépendant que de la mémoire utilisables.


**Vérification :** Contrôle des destinations réseau et parcours Ask/Auto concurrent avec serveur de recherche indisponible ; vérifier absence de fallback cloud d’inférence.


### 27 — Comparer le GX10 au POC API pendant un visionnage prolongé

**Jalon :** GX10 · **Priorité :** P2 · **Taille :** M · **Statut :** proposé

**À construire :** Produire un benchmark reproductible des deux profils sur les mêmes extraits et questions, puis tester une durée de visionnage suffisante pour détecter une accumulation de retard.

**Bloqué par :** 20 — Mesurer la qualité du POC sur débat et fiction ; 26 — Exécuter Ask et Auto sur GX10 avec recherche externe séparée.

**Dépendance externe :** Accès GX10 d’une durée suffisante et budget API disponible pour la référence.

**Démonstration :** Lire un rapport comparatif qui montre précision, moments retrouvés, latences, retard, mémoire et configuration des deux profils.

**Critères d’acceptation :**

- [ ] Les contenus, questions et règles de notation sont identiques entre profils ; les versions et réglages de modèles sont enregistrés.

- [ ] Les latences sont séparées entre capture, perception, retrieval, réponse et recherche externe quand mesurables ; le réseau distant n’est pas assimilé au temps de calcul local.

- [ ] Un essai d’au moins 30 minutes permet de visualiser la tendance du retard et les pertes de contexte ; 30 minutes est un protocole proposé, pas une durée déjà validée.

- [ ] Les fenêtres détaillées de 5 minutes puis au moins une valeur supérieure sont comparées sans prétendre garantir une extension illimitée.

- [ ] Le rapport inclut les échecs et la configuration recommandée ; les optimisations éventuelles doivent montrer leur effet avant/après.


**Vérification :** Reproduction d’un scénario sur chaque profil et contrôle des données brutes de mesure. Un résultat négatif documente une limite et ne valide pas la promesse de temps réel.


### 28 — Vérifier les fonctions locales sans sortie Internet d’inférence

**Jalon :** GX10 · **Priorité :** P2 · **Taille :** S · **Statut :** proposé

**À construire :** Démontrer que Ask, les résumés et les tâches Auto purement contextuelles restent utilisables lorsque les services externes sont indisponibles, en distinguant l’accès distant au GX10 d’un déploiement dans le logement.

**Bloqué par :** 26 — Exécuter Ask et Auto sur GX10 avec recherche externe séparée.

**Dépendance externe :** Possibilité de contrôler la sortie réseau du moteur sans perdre l’accès d’administration distant.

**Démonstration :** Bloquer la sortie Internet du moteur après chargement des modèles, garder le lien client nécessaire et poser une question sur un passage déjà observé.

**Critères d’acceptation :**

- [ ] Les modèles nécessaires sont chargés avant le test ; aucune dépendance implicite à une API distante n’est masquée.

- [ ] Les parcours Ask/recap contextuels fonctionnent ou affichent une limite réelle ; Verify explique pourquoi de nouvelles sources ne sont pas disponibles.

- [ ] Le rapport précise où résident capture, stockage et inférence et quels liens réseau restent utilisés.

- [ ] Le test sur GX10 distant n’est pas présenté comme « le flux ne quitte jamais la pièce ». Une preuve physique sur réseau local est distincte et prévue pour le parcours TV.


**Vérification :** Observation des sorties réseau et comparaison de scénarios avec recherche active puis indisponible.


### 29 — Observer une télévision par caméra avec calibration manuelle

**Jalon :** TV · **Priorité :** P2 · **Taille :** M · **Statut :** proposé

**À construire :** Ajouter une source caméra sélectionnable, calibrer manuellement les quatre coins de la télévision et transmettre l’image redressée au même moteur. Le client affiche l’aperçu réellement analysé.

**Bloqué par :** 22 — Faire tourner le moteur indépendamment de l’app Electron.

**Dépendance externe :** Caméra et télévision accessibles ; permission caméra.

**Démonstration :** Filmer une TV en biais, ajuster les quatre coins, puis retrouver dans la mémoire une image redressée capturée.

**Critères d’acceptation :**

- [ ] Le périphérique et la zone calibrée sont visibles et modifiables ; la perspective est corrigée avant analyse.

- [ ] Le cache détaillé et les horodatages fonctionnent sans dépendre d’un lecteur vidéo ou du système de la TV.

- [ ] Une caméra débranchée, une image noire ou une calibration devenue invalide produisent un état explicite.

- [ ] Le traitement du reste de la pièce est minimisé en recadrant avant envoi au moteur ; l’aperçu permet de contrôler ce qui sera transmis.

- [ ] Les observations traversent le même contrat de source que la capture Mac.


**Vérification :** Essai sur TV physique avec changement d’angle, texte affiché et caméra débranchée ; comparaison de l’image brute et du recadrage.


**Limite de périmètre :** Calibration manuelle d’abord. Pas d’intégration LG ni d’accès direct au flux DRM requis.


### 30 — Comprendre l’audio d’une TV et l’associer à l’image caméra

**Jalon :** TV · **Priorité :** P2 · **Taille :** M · **Statut :** proposé

**À construire :** Associer un microphone choisi à la caméra TV, conserver leur synchronisation et rendre visible la qualité de l’audio ambiant avant de prétendre comprendre le programme.

**Bloqué par :** 25 — Construire la mémoire audiovisuelle en continu sur GX10 ; 29 — Observer une télévision par caméra avec calibration manuelle.

**Dépendance externe :** TV, microphone et GX10 disponibles pour l’essai intégré ; placement physique maîtrisable.

**Démonstration :** Lire un débat sur une TV, observer les niveaux audio puis poser une question sur une phrase en ouvrant le passage audiovisuel correspondant.

**Critères d’acceptation :**

- [ ] Le microphone du programme est distinct de celui utilisé pour dicter Ask ; leur rôle est visible.

- [ ] Les horodatages et le décalage audio/vidéo sont mesurés sur un signal connu et corrigés dans une tolérance explicitée.

- [ ] La transcription incertaine, le silence ou le bruit de pièce sont signalés ; une phrase mal entendue ne devient pas une citation certaine.

- [ ] Les performances sont testées avec son de TV seul puis conversations ambiantes ; les limites sont documentées.

- [ ] Le branchement caméra/micro peut alimenter le GX10 via le service sans logique métier spécifique à LG.


**Vérification :** Test réel avec repère audiovisuel synchronisé et plusieurs conditions sonores ; vérifier le moment source des citations et le comportement en débranchement.


### 31 — Utiliser TVLens devant une TV avec un second écran

**Jalon :** TV · **Priorité :** P2 · **Taille :** M · **Statut :** proposé

**À construire :** Livrer le parcours complet caméra/micro vers moteur GX10 et interface second écran : mémoire, Ask, Auto, preuves et gestion des sessions, avec une installation documentée reproductible.

**Bloqué par :** 23 — Utiliser Ask et Auto depuis un second écran web ; 27 — Comparer le GX10 au POC API pendant un visionnage prolongé ; 28 — Vérifier les fonctions locales sans sortie Internet d’inférence ; 30 — Comprendre l’audio d’une TV et l’associer à l’image caméra.

**Dépendance externe :** Accès physique à une TV/caméra/micro et à une machine locale adaptée. Un GX10 uniquement distant ne suffit pas pour la preuve de confidentialité dans le logement.

**Démonstration :** Regarder un contenu sur TV, demander sur téléphone ce qui a été dit plus tôt, puis consulter une vérification Auto et ses sources.

**Critères d’acceptation :**

- [ ] Le parcours ne dépend pas d’une API Netflix, YouTube ou LG ; les limites de qualité de la capture optique et du son restent visibles.

- [ ] Les cinq minutes détaillées, résumés sauvegardés, voix si disponible et séparation Ask/Auto gardent les mêmes contrats que sur Mac.

- [ ] Le profil local physique est testé sans sortie Internet pour les fonctions contextuelles ; la recherche externe conserve son état séparé.

- [ ] Le second écran affiche source, session, retard et provenance du traitement, sans prétendre dessiner un overlay sur la TV elle-même.

- [ ] Une procédure permet de refaire installation, calibration, démarrage et arrêt sur le matériel utilisé.


**Vérification :** Démonstration complète sur TV réelle et second écran, avec un événement passé, une preuve expirée et une coupure du service de recherche.


**Limite de périmètre :** Produit utilisable avec la TV via second écran. Application TV native et box HDMI restent des extensions distinctes.


### 32 — Récupérer proprement après coupure de capture ou arrêt inattendu

**Jalon :** Mac complet · **Priorité :** P1 · **Taille :** M · **Statut :** proposé

**À construire :** Rendre une utilisation prolongée récupérable : après interruption du lecteur, retrait de permission ou arrêt inattendu, TVLens retrouve les données sauvegardées et aide à reprendre une source sans inventer le contexte manquant.

**Bloqué par :** 15 — Gérer et supprimer ses sessions et leurs données ; 16 — Continuer à suivre la vidéo pendant Ask et les tâches Auto ; 19 — Installer et lancer une version Mac de démonstration.

**Dépendance externe :** Aucun

**Démonstration :** Interrompre la capture puis relancer l’app ; retrouver les résumés et reprendre une source avec un trou de contexte clairement affiché.

**Critères d’acceptation :**

- [ ] Les résumés/réponses validés ne sont pas perdus lors d’un arrêt ; un écrit partiel ne rend pas tout l’historique illisible.

- [ ] Les segments temporaires orphelins sont nettoyés selon la rétention au redémarrage ; aucune ancienne capture ne repart sans sélection appropriée.

- [ ] Une permission retirée, un appareil disparu et un fournisseur indisponible ont des parcours de reprise distincts.

- [ ] Une erreur ne boucle pas en demandes de permission, fenêtres ou appels payants ; le diagnostic exportable exclut clés et contenu audiovisuel par défaut.

- [ ] La session reprise marque l’interruption plutôt que de joindre artificiellement deux moments.


**Vérification :** Scénarios d’arrêt forcé, écriture interrompue, permission retirée et réseau coupé ; vérifier les données récupérées et l’absence de retries non bornés.


### 33 — Distribuer une version Mac signée pour des utilisateurs pilotes

**Jalon :** Distribution · **Priorité :** P2 · **Taille :** M · **Statut :** proposé

**À construire :** Préparer une distribution macOS versionnée et signée, puis vérifier qu’un utilisateur pilote peut installer, configurer sa propre clé, accorder les permissions et suivre une vidéo sans environnement de développement.

**Bloqué par :** 18 — Poser une question à la voix sans confondre le spectateur et le programme ; 20 — Mesurer la qualité du POC sur débat et fiction ; 32 — Récupérer proprement après coupure de capture ou arrêt inattendu.

**Dépendance externe :** Identité Apple Developer autorisée et Mac pilote pour signature/notarisation et test. Si indisponibles, rester sur la distribution personnelle 19.

**Démonstration :** Installer le paquet sur un autre Mac compatible et réaliser capture, Ask et consultation d’une session.

**Critères d’acceptation :**

- [ ] Les architectures et versions macOS effectivement testées sont documentées ; une version non testée n’est pas annoncée supportée.

- [ ] La signature et la notarisation sont réalisées avec une identité autorisée ; aucun achat de compte ou utilisation de certificat tiers n’est implicite.

- [ ] Le paquet ne contient aucune clé ni session du développeur ; la configuration du pilote reste locale.

- [ ] Le parcours d’installation et de première capture est testé hors de l’environnement de développement, avec guide de diagnostic des permissions.

- [ ] Les limites connues, les données envoyées aux fournisseurs et les fonctions encore expérimentales sont visibles dans les notes de version.


**Vérification :** Vérification du paquet signé et essai de première installation sur un autre compte ou Mac, puis parcours Ask/Auto de base.


**Limite de périmètre :** Diffusion à des pilotes. Pas de publication App Store ni de système de mise à jour automatique dans ce ticket.


## Couverture du produit

| Promesse ou contrainte | Tickets responsables |
| --- | --- |
| Source réelle sur Mac, permissions et son vérifié | 02, 19, 32 |
| Présent compris via API, fournisseur remplaçable | 03 |
| Fenêtre détaillée cinq minutes configurable | 04 |
| Références au passé et preuve horodatée | 05, 07 |
| Session résumée et sauvegardée | 06, 15 |
| Ambiguïtés, trous, absence d’information, spoilers | 08 |
| Vérification fondée sur des sources | 09, 12 |
| Auto : surveiller, extraire, expliquer, vérifier | 10–12 |
| Overlay discret et interaction Ask | 13, 14 |
| Capture continue, priorité Ask, files bornées | 16 |
| Coûts/quota et contrôle des appels externes | 03, 17 |
| Voix utilisateur distincte de l’audio du programme | 18 |
| Validation débat/fiction et critères du grill | 20 |
| Candidature et vidéo honnêtes | 01, 21 |
| Domaine indépendant de la plateforme et UI réutilisable | 02–05, 22, 23 |
| Modèles sur GX10, rythme continu et preuve réseau | 24–28 |
| Capture TV optique, calibration, audio de pièce | 29, 30 |
| Expérience TV avec second écran | 31 |
| Livraison installable et utilisation pilote | 19, 32, 33 |

## Extensions qui ne sont pas des engagements de cette livraison

Le PRD initial évoque aussi une app TV native, une box HDMI/overlay TV, des profils multi-utilisateurs, des recommandations, traduction et accessibilité spécialisées. Le grill n’a pas retenu ces produits comme obligations du POC ni précisé leurs contrats. Ils restent des pistes à cadrer, sans les déclarer terminés grâce à un assistant générique. Une identification contextuelle peut être fournie par Ask lorsqu’elle est étayée ; aucun moteur universel d’identification faciale n’est promis.

Un overlay Electron ne se transpose pas directement à l’OS LG. La capture caméra est la voie TV retenue ; aucune capture DRM numérique ou intégration fournisseur n’est supposée disponible. L’autocalibration caméra et les mises à jour automatiques pourront faire l’objet de tickets si nécessaires après les premières installations.

## Questions de revue du skill

1. La granularité convient-elle : ces 33 parcours sont-ils trop gros ou trop fins ?
2. Les dépendances reflètent-elles de vrais blocages, et faut-il en enlever ou en ajouter ?
3. Quels tickets fusionner ou scinder avant publication ?

Confirmer aussi la destination : tracker local proposé, ou lien du dépôt/projet distant à utiliser. La publication attend la validation de ce découpage conformément au skill demandé.

## Sources et décisions

- Conversation et synthèse privée du grill (non distribuée), incluant ses corrections ultérieures : validation du cadrage, app Mac Electron et overlay.
- Champs de candidature fournis en conversation (notes privées non distribuées).
- [Skill to-tickets source](https://github.com/mattpocock/skills/blob/main/skills/engineering/to-tickets/SKILL.md), lu pour le découpage vertical et la revue avant publication.
- [Capture Electron](https://www.electronjs.org/docs/latest/api/desktop-capturer) et [fenêtres Electron](https://www.electronjs.org/docs/latest/api/base-window) : sources techniques consultées ; les tickets exigent néanmoins des essais sur machine.
- [Documentation audio OpenRouter](https://openrouter.ai/docs/guides/overview/multimodal/audio) et [recherche web](https://openrouter.ai/docs/guides/features/plugins/web-search) : modalités et fournisseur précis à valider, pas une garantie de disponibilité.
