# Journal du 17–18/10/2026 : chronologie et incidents

Vue transversale de la nuit et de la journée : ce que la boucle a intégré, ce que les contrôles réels ont trouvé, et
chaque incident, quelle que soit sa nature, avec son heure, sa cause, son impact et son statut. Heures de Paris. Les
détails chiffrés de chaque contrôle sont dans les comptes rendus de ce dossier ; les décisions, dans les tickets.

## Chronologie

| Heure | Événement |
| --- | --- |
| 17/10 22:36 | T223 intégré (`16be86b`) |
| 17/10 23:43 | T229 intégré (`cea4b0c`) : la boucle se relance seule après un ticket de harnais |
| 18/10 00:35 | Sonde Ollama (gemma3 4B puis 12B) lancée pendant T230 |
| 00:40 | T230, tentative 1 refusée : contrôle d'arrêt hors budget sous la charge de la sonde |
| 01:59 | T230 intégré (`af6efe4`), relance automatique |
| 02:21 | T231 bloqué ; la boucle s'arrête, le Mac se met en veille |
| 09:58 | Reprise par le propriétaire, T231 relancé depuis son archive |
| 10:07 | Recette TV et VPS, session 1 (parcours nominal, question citée) |
| 10:25 | T231, tentative 1 refusée : banc de la boucle à 244 s pour un budget de 240 s |
| 10:33 | Recette, session 2 (surveillance, fin, réouverture) |
| 10:41 | Fuseau `Europe/Paris` posé sur le VPS |
| 11:19 | T231 intégré (`c66f2f6`) |
| 11:57 | T263 intégré (`c6bf01a`) : questions par Ollama |
| 12:57 | T264 intégré (`dbcbf79`) : recherche par embeddings Ollama |
| 13:00 | Contrôle T269 (questions locales) : concluant |
| 13:27 | T255 intégré (`9e84275`) : chargement séparé du démarrage froid |
| 13:30 | Contrôle T270 : concluant |
| 14:23 | T265 intégré (`258d910`) : réexamen par Ollama |
| 14:25 | Contrôles T271 (réexamen local, concluant) et T276 (recherche locale, écart trouvé) |
| 15:26 | T257 intégré (`b9f5d56`) : rejeu de perception |
| 15:30 | Contrôle T272 : concluant |
| 16:16 | T262 intégré (`c13fd0e`) : conversion vidéo |
| 16:20 | Contrôle T273 : concluant |
| 16:59 | T258 intégré (`ce5ddd1`) : notation des rejeux |
| 17:11 | Une campagne de tests de T267 reste bloquée 25 min sur un test |
| 19:00 | Avis d'Astra sur la feuille de route, réorganisation validée au second passage (`fa3e15d`) |
| 19:30 | `main` reçoit l'état intégré de la branche (`71672f3`) |
| 20:06 | T277, T278 et T279 intégrés ; boucle arrêtée pour la copie A |
| 20:30 | Répétition de la copie A concluante, tag `gx10-copie-a`, `main` avancé (`6d8a1b9`) |
| 22:53 | T259, T261 et T260 intégrés ; boucle arrêtée pour la copie B |
| 22:54–23:24 | Campagne G3 de 30 min tout en local, concluante ; tag `gx10-copie-b`, `main` avancé (`70501e3`) |
| 23:51 | T268 intégré (`4606dca`) : panneau TV sur toute disposition YouTube |
| 23:56–00:03 | Contrôle T275 sur la TV, tag `recette-t268` : concluant, fermé sur décision du propriétaire (`c2a35b0`) |
| 00:13–00:16 | Sonde du panneau et de la capture sur le lecteur de fichiers LG : limite YouTube écrite dans le code, délai de la sidebar trop court |
| 00:20 | Tickets T285 à T289 (panneau et capture au-delà de YouTube) placés avant T283 (`751c769`) |
| 00:31 | T282 intégré (`4d92ced`) : raisonnement réglable par rôle local |
| 01:01, 01:31 | T285 (`28fe430`) puis T286 (`ec8d9d5`) intégrés : attente de la sidebar, panneau sur toute application |
| 01:44–01:49 | T287 refusé sur un test instable sans lien, puis bloqué : correction du test prête mais hors périmètre |
| 02:03 | Décision de l'orchestrateur, propriétaire absent : correction admise ; contrôle complet vert, smoke TV, relecture ; T287 intégré hors boucle (`1d8d64a`), T290 fermé, boucle relancée |
| 02:23–02:33 | T288 refusé sur un second test instable sans lien, puis bloqué : synchronisation du test prête, hors périmètre |
| 02:42 | Même décision : correction admise, contrôle complet vert, relecture ; T288 intégré hors boucle (`a2ed99d`), T291 fermé, boucle relancée sur T283 |
| 03:23 | T283 intégré (`479b376`) : modèle de réexamen dédié ; boucle arrêtée devant le contrôle T284 |
| 08:49–09:11 | Contrôle T284 sur le Mac : aucun réglage retenu, `gx10-copie-b` gardée |
| 09:29–09:58 | Contrôle T289 sur la TV avec le propriétaire, tag `recette-t289` : concluant ; `main` avancé (`59b5d25`) |
| 12:25–12:27 | Sonde image et son de Netflix sur la TV : image protégée, son présent ; chantier « son seul » T297 à T302 |
| 14:25–17:05 | T297 à T300 intégrés (`b893bae`, `38f45db`, `7c9e3b1`, `94293cb`) ; réserves converties en T303 à T305 |
| 17:10 | Quota Codex à 95 % (retour le 24/10) ; boucle réglée pour relancer avec la relève Claude au ticket suivant |
| 17:16–17:25 | Sonde du contrôle de noir sur la TV : 160×90 refusé, BMP 256×144 jugé en 10 ms ; T306 placé avant T303 |
| 18:13 | T306 intégré (`2035a2f`) : contrôle du noir en BMP 256×144 ; tag `gx10-copie-c` ; boucle mise en pause à T303 |
| 18:16 | Répétition de la copie C sur le Mac par l'exécuteur GX10 (G1, G3 de 6 min, banc Whisper) |

## Incidents

Statuts : **corrigé**, **ticket** (correctif écrit), **ouvert** (à décider), **constat** (à mesurer, rien à corriger).

### Fidélité des modèles locaux

| Heure | Incident | Cause établie ou probable | Impact | Statut |
| --- | --- | --- | --- | --- |
| 00:35 | Les modèles locaux décrivent l'image et résument peu la parole | taille du modèle, suivi de consigne | résumés moins utiles que Codex | constat, mesure G2 |
| 00:35 | Lecture fautive d'un titre (« réparties » pour « réprimée ») par le 4B | OCR d'un petit modèle | détail faux | constat, mesure G2 |
| 13:00 | `gemma3:4b` et `gemma3:12b` sans capacité `tools` | modèles eux-mêmes | seul `qwen3.8:27b` répond aux questions en local | constat de configuration |
| 13:00 | Swap de 15 à 28,7 Go avec `qwen3.8:27b` | 17 Go de poids sur 36 Go | Mac ralenti pendant l'essai | constat ; jamais pendant la boucle |
| 14:25 | Le 12B lit « RD SECQURS » pour « SECOURS » et contredit les résumés d'origine | OCR et description d'un modèle moyen | réponse prudente mais moins juste | constat, mesure G2 |
| 14:25 | Réexamen local en 17 à 19 s, contre environ 4 s pour Codex | calcul local | questions plus lentes | constat |
| 16:20 | Le 4B répond en anglais sur 2 blocs sur 9 d'un discours anglais | suivi de la consigne « en français » | sortie dans la mauvaise langue | corrigé par T279 : 4 / 4 en français le soir |
| 20:10 | `qwen3.8:27b` en vision dépasse le délai de 45 s de l'agent vision | raisonnement et lecture de 6 images | inutilisable pour la perception continue sur le Mac | constat, choix de modèle |
| 23:18 | Vision sautée sur 31 % des passages pendant les questions (campagne G3) | perception locale engorgée quand le 27B répond | descriptions manquantes, audio intact | constat, mesure GX10 |
| 23:19 | Deux lots d'embeddings coupés à 30 s sous 17 % de mémoire libre | trois modèles résidents sur 36 Go | index en retard sur quelques passages | constat ; diagnostic T278 visible |
| 20:12 | Le 4B invente des détails (insigne de l'Élysée, drapeau tenu) et nomme sans preuve | fidélité d'un petit modèle | 0 / 4 à la revue face à Codex | constat, mesure G2 |

### Configuration et déploiement

| Heure | Incident | Cause | Impact | Statut |
| --- | --- | --- | --- | --- |
| 10:30 | Titres de session à l'heure UTC sur le VPS | le serveur formate au fuseau de l'hôte | heure fausse de deux heures | corrigé par la configuration ; le code dépend toujours de l'hôte |
| 10:41 | L'unité systemd du VPS ne lit pas `runtime.env` | unité plus ancienne que `deploy/tvlens.service` | réglage posé au mauvais endroit, retiré aussitôt | ouvert, alignement au ménage |
| 10:15 | La TV exécute un `panel.py` antérieur au dépôt | déploiement partiel ancien | comportement non représentatif | réglé au déploiement de T268, à 23:56 |
| 16:20 | Discours anglais mal transcrit (« un temps de banane de 50 000 ans ») | langue de transcription française par défaut | paroles inutilisables | ouvert, ticket prévu |

### Défauts produit trouvés en réel

| Heure | Incident | Cause | Impact | Statut |
| --- | --- | --- | --- | --- |
| 10:15 | Panneau TV refusé, sans message, sur une vidéo à bandes noires | garde limitée au plein écran 4K | panneau inaccessible | corrigé par T268, contrôlé en réel (T275) |
| 14:27 | Embeddings locaux coupés à 8 s quand un autre modèle est chargé ; repli textuel sans trace | délai trop court pour un chargement de 12,7 s | recherche sémantique absente en tout-local | corrigé par T278 (30 s, diagnostic), contrôlé le soir |
| 13:27 | Le JSON d'un modèle Codex peut revendiquer des mesures | métriques reprises du JSON du modèle | comparaisons faussables | ticket T277 |
| 11:57 | Import Mac de questions locales incomplètes : démarrage suivant refusé | validation au démarrage, pas à l'import | app bloquée jusqu'à correction manuelle | ouvert, ticket prévu |
| 14:23 | Les vues légères de la TV publient le diagnostic de réexamen et son hôte | filtrage incomplet des vues | fuite d'une adresse locale vers la TV | ouvert, ticket prévu |
| 00:03 | En 4:3, la bande noire de YouTube masque le sixième gauche de la vidéo réduite | interface de YouTube dessinée au-dessus de la vidéo | image amputée à l'ouverture du panneau | ouvert, ticket à décider |
| 12:57 | Un fichier de cache d'embeddings par réouverture | identité d'instance voulue (ADR 0058) | disque | constat, cycle des archives |

### Performance

| Heure | Incident | Cause | Impact | Statut |
| --- | --- | --- | --- | --- |
| 10:07 | Whisper du VPS à 7,3 s pour 8 s d'audio (18 s au pire) ; passage prêt 16 s après son bloc | CPU partagé du VPS | marge de temps réel fragile | constat ; argument GPU (GX10) |
| 10:33 | Une détection de surveillance hors délai, puis relue | appel lent | aucun relevé perdu | constat |
| 10:38, 16:20 | Un passage reste partiel quand la session est archivée pendant son traitement | état transitoire figé par la fin de session | dernier passage incomplet | constat : vérifié le soir, « prêt » quand la session continue |

### Tests, harnais et exploitation

| Heure | Incident | Cause | Impact | Statut |
| --- | --- | --- | --- | --- |
| 00:40 | T230 refusé une fois | sonde Ollama lancée par l'orchestrateur pendant la boucle | une tentative perdue | corrigé : règle « aucun modèle local pendant un contrôle chronométré » |
| 02:21 | T231 bloqué | script de sonde déposé dans `experiments/` avec deux lignes de plus de 160 caractères | blocage nocturne | corrigé : dépôt des essais boucle arrêtée |
| 02:21–09:58 | Mac en veille, 7 h 30 perdues | `caffeinate` lié à la boucle seule | nuit sans travail | corrigé : maintien éveillé indépendant |
| 10:25 | Banc de la boucle à 244 s pour 240 s | suite de tests de la boucle trop lente | tentative refusée | corrigé dans T231 |
| 6 fois | Reprise de session Codex impossible (`--add-dir`) sur les tickets de harnais | option refusée par `codex exec resume` | session neuve, sans perte | ouvert, rétrospective |
| 17:11 | Une campagne de tests bloquée 25 min sur `mac-ipc-contract`, processus orphelins | blocage intermittent ; `check.mjs` coupé sans arrêter ses tests | campagne relancée | ouvert, tâche séparée proposée |
| 20:14 | Deux questions refusées `400 invalid-anchor` pendant la répétition | script de l'orchestrateur : repère vide | aucune réponse au premier essai | corrigé dans le script |
| 23:26 | Une commande de dépôt des essais bloquée en attente d'entrée | `python3` sans script dans une commande de l'orchestrateur | deux minutes perdues | corrigé à la main |
| 23:57 | TV jugée libre alors que le propriétaire était devant | accueil allumé pris pour une TV libre | il a ouvert le panneau sur la vidéo lancée par l'orchestrateur | réglé : annoncer avant de lancer une vidéo quand il est actif |
| 23:57 | Son de la TV joué 25 s au volume 10, à minuit | `master/setMuted` absent du firmware | bruit | corrigé : `master/muteVolume {"mute":true}` |
| 00:30 | Deux fichiers de l'orchestrateur disparus du scratchpad (script de surveillance de la boucle, une note du 16/10) | cause non établie ; aucune suppression lancée par l'orchestrateur | surveillance tombée quelques minutes | ouvert : script reconstruit depuis l'historique, outils copiés hors de `/tmp` |
| 01:44 | T287 refusé une fois : un test des publications de passages (`session-events`) échoue au contrôle complet, sans lien avec T287 | non établie ; 30 relances isolées vertes, le contrôle ne garde que le titre | une tentative perdue | corrigé dans T287 (`1d8d64a`) : cause reproduite (voies audio et vision en parallèle), barrière dans la doublure |
| 02:23 | T288 refusé une fois : un second test instable sans lien (`local-stream-replay`, annulation pendant un envoi retenu) | non établie ; le contrôle ne garde que le titre ; charge 4,7 | une tentative perdue | corrigé dans T288 (`a2ed99d`) : course reproduite (horloge virtuelle plus rapide que l'écriture réelle) ; garder le détail des échecs dans le contrôle, à proposer au propriétaire |
| 03:24–08:49 | Boucle arrêtée 5 h 25 devant le contrôle T284 | contrôle prévu dans la nuit, notification d'arrêt reçue par l'orchestrateur à 08:49 seulement | aucun ticket pendant 5 h 25 | ouvert : ne pas laisser un contrôle de nuit dépendre d'un réveil de l'orchestrateur |
| journée | Documentation en retard (code de sortie 5, questions locales, protocole GX10) | réserves hors périmètre | doc incomplète | confié à T260 et au ménage final |
| 16:15–17:05 | Réserves hors périmètre de T297 et T299 non extraites par la boucle (« nombre de constats discordant ») | le relecteur titre « Suivi des constats de la relecture 1 », la boucle ne lit que « Constats du rapport précédent » | réserves réduites à un renvoi au rapport | ouvert : rapports lus à la main, ticket de harnais à proposer |
| 17:16 | Contrôle du noir de T301 refusé par la vraie TV (PNG 160×90), tests verts | le faux `luna-send` accepte toute taille ; format jamais sondé | toutes les images seraient perdues en `captureFailed` | ticket : T306 (BMP 256×144), trouvé par la relecture puis la sonde avant tout déploiement |
| 18:15 | `gemma3:4b` du Mac remplacé par la dernière version publiée (851 Mo téléchargés, `a2af6cc3eb7f` → `68ceab7e468a`) sans accord | l'exécuteur GX10 lançait `ollama pull` même pour un modèle présent | modèle de la référence du 18/10 changé sur le Mac ; la GX10 aurait de toute façon reçu la nouvelle version | corrigé : un modèle présent n'est plus jamais retiré ; écart de poids noté pour la comparaison Mac/GX10 |
| 19:22 | T305 refusé une fois : les 12 derniers fichiers de tests annulés d'un coup (« event loop has already resolved »), aucune assertion en échec | non établie ; ni le diagnostic isolé (25/25, 106/106) ni deux contrôles complets ne reproduisent ; swap à 25,5 Go et tests de `lg-launcher` en parallèle | une tentative perdue | ouvert : à rouvrir sur le lanceur de tests (`scripts/check.mjs`) à la prochaine annulation de ce type |

## Ce que les contrôles réels ont apporté

Tous les tests automatiques étaient verts pour chaque ticket. Les contrôles réels ont pourtant trouvé un défaut de
fonctionnement que seul un vrai Ollama montre (T278), confirmé une réserve sans fondement pour le modèle retenu (T269),
et chiffré l'écart de fidélité des modèles locaux que G2 devra mesurer.
