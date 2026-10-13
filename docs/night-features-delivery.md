# TV Lens — livrable de la nuit du 13 octobre 2026

Branche `codex/tvlens-night-features`, base `9758633` plus des différences héritées non commitées. Deux faits, à ne pas confondre :

- **Cette session n’a rien commité, poussé ni déployé, et n’a envoyé aucune commande distante.**
- **La supervision a installé la version de la nuit sur le VPS et sur la TV entre 07 h 20 et 07 h 31, avec l’autorisation de Dabi.** Pendant l’essai réel qui a suivi, le serveur installé a planté deux fois. Ces faits sont lus dans `.local/night-features/deployment/` ; cette session ne les a pas revérifiés (section 13).

D’après ces fichiers, la TV et le VPS ne tournent donc plus sur la version d’avant la mission. Pour autant, ce document ne déclare vérifiés ni la TV native ni le VPS.

Ce document dit ce qui a été fait pendant la nuit, ce qui est prouvé, à quel niveau, et ce qui ne l’est pas. Il s’adresse à quelqu’un qui n’a pas suivi la nuit.

Une première version a été écrite entre 05 h 10 et 05 h 40, puis relue par un relecteur indépendant. Celle-ci la complète après le gel de l’arbre, à 07 h 07, à partir des fichiers de résultats de `.local/night-features/results/` (dossier local, hors Git). Il n’y reste aucun marqueur en attente : quand une preuve prévue n’existe pas, le texte dit « non exécuté » ou « non mesuré », avec la raison. Cette version finale a été relue une fois. Le relecteur y a trouvé un défaut majeur : elle affirmait « rien n’est déployé, production inchangée » alors que l’installation venait d’avoir lieu. Il est corrigé ici, dans une reprise terminée à 09 h 20, et cette reprise n’a pas encore été relue. Elle s’appuie sur les fichiers datés jusqu’à 08 h 07 ; à 09 h 20, aucun fichier de code ni de preuve n’était plus récent. Les heures sont celles de Paris.

## 1. En une page

### Ce qui est livré dans l’arbre de travail

- **Questions de cinq minutes.** Une question peut être traitée jusqu’à 300 000 ms, attente en file non comprise. Le plafond est publié avec chaque question ; les textes en dérivent.
- **Sessions durables.** Les médias, miniatures, paroles, observations et réponses d’une session restent sur disque jusqu’à sa suppression explicite. « Terminer » archive. Une archive se liste, s’ouvre en lecture seule, se reprend explicitement.
- **Suppression et disque.** Supprimer efface une session et elle seule. Sous un plancher d’espace libre, la capture est refusée et rien n’est supprimé.
- **Vidéo illisible.** Un passage dont le fichier vidéo est vide n’est plus annoncé rejouable. Il est dit « vidéo illisible », reste analysé, et son réexamen se fait sur les images gardées à la capture.
- **Cloisonnement des agents.** Les fils Codex s’ouvrent sans environnement d’exécution. La création de sous-agents est empêchée par configuration. **Par défaut, une connexion Codex dont le cloisonnement n’est pas confirmé est refusée.** Le vérificateur manuel passe par la même voie que le chat.
- **Surveillance en parallèle du chat.** Une consigne libre, lue à partir de son activation. Les affirmations détectées sont suivies jusqu’à un état explicite. Une question ne suspend plus rien. Pendant une surveillance, le chat répond depuis la vidéo et ne refait pas la vérification web confiée à la surveillance, sauf demande explicite.
- **Résultats regroupés.** Une carte par lot d’affirmations sourcées. Les cas indéterminés et les signalements restent dans l’historique.
- **Mac.** Onglet Surveillance à la place d’Auto, pile de cartes sourcées en bas à gauche, panneau Sessions, bandeau disque, avis quand le suivi n’est pas enregistré.
- **Serveur.** Routes de sessions, de surveillance et de stockage ; vues légères de l’état avec revalidation `ETag` / `304`.
- **TV.** Code du panneau (surveillance, sessions, question de cinq minutes, sondage par vues légères) et du mode ambiant panneau fermé (superviseur natif, relais des touches, porte de capture, page ambiante). **L’affichage panneau fermé est désactivé par défaut** (profil livré `focus: "off"`).
- **Réexamen.** Le correctif d’une autre session (réutilisation de la transcription du passage) est intégré par fusion.

### Ce qui est prouvé, et à quel niveau

Les fichiers cités sont dans `.local/night-features/results/`.

| Niveau | Ce qui a tourné | Résultat | Sortie |
| --- | --- | --- | --- |
| **Simulation ou tests hors ligne** | Suite Node complète sur l’arbre figé, 07 h 07 | 63 fichiers, 473 tests, 0 échec, 15,3 s. Avant la mission : 287 | `suite-node-finale.txt` |
| | Tests Python de la TV, services de l’appareil simulés | 83 tests dont 1 sauté, puis 15, 17 et 1 pour les prototypes, 0 échec. Avant la mission : 6 | `suite-python-finale.txt` |
| | Contrôle indépendant de la supervision, 07 h 09 | Node : 473 réussis sur 473, fichiers lancés un par un, code de sortie 0, empreintes de 252 fichiers identiques avant et après. Python : code de sortie 0 | `supervisor-final-node.*`, `supervisor-final-python.*` |
| **Navigateur de bureau sur copie temporaire** | Interface TV dans Chrome 155 de bureau, sans fenêtre, sans `connection.js` | panneau : 10 scénarios sur 10, dont un contre le vrai serveur de l’arbre ; page ambiante : 17 vérifications sur 17 ; panneau LG et frise : réussis ; simulation ambiante : 2 passes sur 2 | `tv/final-*.txt` |
| **Electron réel à fournisseurs simulés** | Parcours définitif sur une copie figée de 91 fichiers | réussi au second lancement ; le premier a échoué sur un défaut du script | `electron/definitif-*` |
| **Fournisseur réel sur ce Mac**, sonde de cloisonnement | Douze tours, `codex-cli 0.160.1` | consigne de rôle neutralisée : ni shell, ni lecteur de fichiers, ni `apply_patch` pour le chat et le vérificateur ; fichier canari jamais revenu | `04-confinement-*` |
| **Fournisseur réel sur ce Mac avec perception simulée par des textes écrits** | Cinq parcours « question pendant une surveillance active », deux parcours « question seule » | chat et surveillance travaillent en même temps ; 3 affirmations détectées sur 4 textes à chaque parcours ; l’affirmation fausse contredite 5 fois sur 5 ; 3 sourcées sur 3 dans les deux derniers parcours, 2 sur 3 dans les trois premiers | `reel/*.json` |
| **Natif sur la TV** | — | **NON EXÉCUTÉ** par cette session. Le protocole natif de l’overlay n’a été passé par personne | — |
| **VPS** | — | **aucun essai par cette session** (section 5) | — |

Ces totaux valent pour l’arbre figé à 07 h 07. L’arbre a été rouvert à 07 h 35 pour corriger le plantage du serveur installé. Une suite complète a tourné à 07 h 55 sur l’arbre ainsi corrigé : 474 tests Node, 0 échec ; tests Python de la TV 84 dont 1 sauté, prototypes 15, 17 et 1, 0 échec (`suite-node-apres-incident.txt`, `suite-python-apres-incident.txt`). Des fichiers ont encore changé après elle, jusqu’à 08 h 05 : aucune suite complète n’a tourné sur l’arbre tel qu’il est à l’heure de cette reprise (section 13).

**Hors de ces niveaux : l’installation faite par la supervision.** Entre 07 h 20 et 08 h 07, la supervision a installé la version de la nuit sur le VPS et sur la TV, puis mené des essais réels. Ses fichiers rapportent : quatre rôles Codex connectés et confirmés sur le serveur, 43 tests ciblés réussis sous Linux, 26 fichiers conformes sur la TV, une capture bornée de la TV reçue et analysée, puis **deux plantages du serveur** au démarrage de la surveillance, une limite de tâches relevée, un correctif de la capture installé sur la TV, et deux essais courts sans plantage. Cette session a lu ces fichiers et n’a rien revérifié. Ce n’est pas une preuve de cette session, et cela ne valide ni le panneau à la télécommande, ni l’affichage panneau fermé, ni la stabilité du service (section 13).

### Délais des questions

**Aucun gain général de délai des questions n’est établi.** Deux choses seulement sont mesurées.

1. **Banc synthétique côté client TV** (boucle locale, agent simulé à délai fixe de 1,6 s). L’ancienne boucle téléchargeait l’état complet chaque seconde ; la boucle du panneau sonde dès l’envoi, sur des vues légères. La carte d’une question apparaît en 9 ms au lieu de 623 ms sur une session de 10 minutes, en 36 ms au lieu de 661 ms sur 2 heures. Une question coûte 134 ko au lieu de 527 ko, et 271 ko au lieu de 5,7 Mo. C’est un gain de cadence et de transport. Ce n’est ni le temps du modèle, ni une mesure sur la TV (section 4.1).
2. **Sur ce Mac, fournisseur réel, perception simulée par des textes écrits.** Une question de récapitulatif posée pendant une surveillance active est passée de 12,3 à 17,5 s (trois parcours) à 5,9 s (un parcours). La raison est connue : le chat ne refait plus la vérification web confiée à la surveillance. Sans surveillance, la même question prenait 5,9 et 6,8 s. Petit échantillon, textes fournis, une seule machine (section 4.6).

Le calcul local du serveur n’a ni gagné ni perdu (section 4.1).

### Ce qui n’est pas prouvé

- **Cette session n’a rien exécuté sur la TV.** Natif sur la TV : NON EXÉCUTÉ. L’installation et la capture bornée faites par la supervision ne valident ni l’usage du panneau à la télécommande ni l’affichage panneau fermé.
- **VPS : aucun essai par cette session.** La lecture SSH du VPS a été refusée par la politique de permissions et n’a pas été contournée. Les mesures VPS du lot « réexamen » viennent d’une autre session (section 4.8). L’installation de la supervision est lue, non revérifiée.
- **Le serveur installé n’est pas établi comme stable.** Il a planté deux fois, à 07 h 35 et 07 h 36, en atteignant la limite de 128 tâches de son unité systemd. La supervision a relevé cette limite en direct, à 256 puis à 512, sans redémarrage. Deux essais courts sont rapportés ensuite, sans plantage ; son propre compte rendu dit « essai court, pas garantie de stabilité indéfinie » (section 13).
- **Ticket 07 : incomplet, validation native non exécutée.** Avec le profil livré, qui est aussi le profil installé, rien ne s’affiche panneau fermé sur la TV.
- **Ticket 04 : non clos.** Le cloisonnement n’est pas absolu. Linux et le VPS ne sont pas mesurés par cette session ; la supervision y rapporte une connexion confirmée des quatre rôles, sans sonde adverse.
- **La surveillance n’a jamais lu une vraie émission.** Dans les parcours réels, ni capture, ni Whisper, ni vision. Le script `scripts/probe-surveillance.cjs` n’a pas été exécuté.
- **Aucune question réelle de cinq minutes** n’a été tentée.
- **Volume disque** : mesuré une fois par cette session, sur la capture synthétique du parcours Electron. Jamais sur une vraie émission. Un relevé court de la supervision existe sur le serveur installé ; il est de seconde main (section 4.7).
- **Plusieurs corrections tardives n’ont pas eu de relecteur dédié** (section 6). Elles sont couvertes par la suite finale, pas par une relecture.
- **Les bancs avant/après datent de 05 h 52 à 06 h 43.** Ils n’ont pas été rejoués après le gel.

### Ce que Dabi doit décider ou autoriser

1. **Garder ou retirer la version installée.** D’après les fichiers de la supervision, elle est en service sur le VPS depuis 07 h 24 et installée sur la TV depuis 07 h 29. Le serveur a planté deux fois sous la limite de 128 tâches. La supervision a ensuite relevé cette limite en direct, à 256 puis à 512, de façon persistante d’après son compte rendu ; aucun redémarrage n’a été rejoué. Elle a aussi installé sur la TV, à 08 h 00, un correctif de la capture écrit après l’incident. Deux essais courts ont suivi, sans plantage. Le retour arrière du serveur est décrit dans `deployment/report.md` (section 13).
2. **Lecture SSH du VPS et essais sur la TV par cette session.** Dabi a autorisé l’installation et des essais réels ; la supervision les mène seule. Cette session n’a toujours aucun accès distant. Tant que c’est le cas, ses preuves sur la TV et le serveur restent au niveau « navigateur de bureau » ou « tests hors ligne », et celles de la supervision restent de seconde main (section 9).
3. **Version de Codex du VPS : relevée par la supervision avant la bascule.** Codex 0.158.0, non mis à jour ; les quatre rôles s’y connectent, confirmés, sous-agents bloqués. Le refus de connexion redouté ne s’est donc pas produit. Reste à décider : rejouer ou non sur le serveur les sondes adverses de [SECURITY.md](../SECURITY.md), absentes de ces preuves (section 8).
4. **Passer le protocole natif de [LG : alertes panneau fermé](lg-ambient.md) avant d’activer l’affichage panneau fermé.** L’application ambiante est installée, profil `off`. Tant que le protocole n’est pas passé, le profil reste `off`.
5. **Confirmer ou non le choix « le chat ne refait pas la vérification web de la surveillance ».** Il a été pris vers 07 h 00 sans lui, et il est réversible (ticket 05).
6. **Figer une révision.** Rien n’est commité ni poussé. La version installée a été construite depuis l’arbre de travail, pas depuis une révision Git, et l’arbre a encore changé après elle.
7. **Le lien `../node_modules`**, créé pour la mission au-dessus de l’arbre, est gardé : les tests en dépendent. À retirer quand il ne sert plus.
8. **Décider des protections du serveur contre le manque de ressources** (section 13). La limite de tâches est relevée à 512, mais rien dans le produit n’empêche un nouvel épuisement de faire tomber le serveur. Trois corrections courtes sont proposées et non faites : refuser de démarrer un rôle Codex quand le service approche de sa limite ; poser l’écouteur d’erreur avant tout accès aux flux dans les quatre sites de lancement (défaut reproduit localement à l’épuisement des descripteurs de fichiers) ; ne connecter le premier poste de vérification qu’à la première affirmation.

Les autres décisions prises sans lui sont en section 12.

**Aucun ticket n’est déclaré « terminé ».** L’état par ticket est en section 3 et dans [l’index des tickets](tvlens-night-tickets.md).

## Comment lire ce document

**Six niveaux de preuve.** Ils ne se valent pas et ne sont jamais mélangés.

| Niveau | Ce que c’est | Ce que cela ne dit pas |
| --- | --- | --- |
| **Simulation ou tests hors ligne** | Tests Node et Python, horloge contrôlée, faux fournisseurs, faux App Server, faux services de la TV ; simulations à temps virtuel ; bancs synthétiques en boucle locale | La vitesse et la qualité de Codex, de Whisper, du réseau, de la TV |
| **Navigateur de bureau sur copie temporaire** | Interface TV chargée dans Chrome 155 de bureau, sans fenêtre, sur une copie temporaire sans `connection.js` ; serveur et contrôleur simulés, sauf un scénario contre le vrai serveur de l’arbre et une simulation avec le vrai contrôleur local | La télécommande, le focus, le compositeur, la police et le processeur de la TV |
| **Electron réel à fournisseurs simulés** | Vrai processus principal, vrai pont IPC, vraie fenêtre ; perception, chat, vérificateur et surveillance factices ; capture d’une vidéo de démonstration synthétique | La latence, la qualité, la capture d’une vraie application |
| **Fournisseur réel sur ce Mac avec perception simulée par des textes écrits** | Codex réel, déjà authentifié (`codex-cli 0.160.1`), web ouvert, par la vraie composition de l’hôte serveur ; les passages sont quatre courts textes écrits, remis comme paroles | Une vraie émission, la capture, Whisper, la vision, Linux, le VPS, une autre version de Codex ; la variabilité, puisqu’il y a un parcours par mesure |
| **Natif sur la TV** | Commandes exécutées sur la LG | **NON EXÉCUTÉ** par cette session. Le protocole natif de l’overlay n’a été passé par personne |
| **VPS** | Essais sur le serveur | **Aucun essai par cette session.** La lecture SSH a été refusée par la politique de permissions et n’a pas été contournée ; les mesures VPS du lot « réexamen » viennent d’une autre session |

La sonde de cloisonnement est aussi un essai à fournisseur réel sur ce Mac. Elle n’utilise aucune perception : elle interroge le modèle sur ses outils.

**Une provenance à part : la supervision.** La supervision est la session parente, qui suit la mission et parle à Dabi. Après la rédaction, elle a installé la version de la nuit sur le VPS et sur la TV et y a mené des essais réels. Ce document cite ses fichiers sous la mention « lu, non revérifié ». Ce n’est pas un septième niveau de preuve de cette session : aucune case de ticket ne s’appuie dessus, et « natif sur la TV : NON EXÉCUTÉ » comme « VPS : aucun essai par cette session » restent vrais de cette session. Tout est en section 13.

**Les lots.** Le travail a été découpé en lots. Chaque lot a un propriétaire de fichiers et un relecteur indépendant chargé de le réfuter. Leurs noms servent à retrouver les comptes rendus `lot-*.json` : S pour la surveillance, C pour le cloisonnement, B pour les sessions, H pour les hôtes, TV, FIN pour les finitions, avec un chiffre par reprise. Le coordinateur est l’agent qui a réparti les lots et tenu le journal.

**Le gel.** À 07 h 07, l’arbre a été figé. Les validations finales portent sur cet état. Deux séries de changements l’ont suivi :

- à 07 h 09, le script du parcours Electron (ticket 08), revalidé par le lancement définitif ;
- à partir de 07 h 35, après le plantage du serveur installé : le modèle d’unité `deploy/tvlens.service`, un test nouveau (`tests/deploy-unit.test.cjs`), la capture TV (`tv/capture.py`) et son test (`tests/test_tv_capture_gate.py`), un paragraphe de [installer son serveur](server-installation.md). Ces changements ne sont ni dans la suite de 07 h 07 ni dans la version installée à 07 h 24. Une suite complète les couvre à 07 h 55 ; les fichiers ont encore été modifiés après elle, jusqu’à 08 h 05. La supervision a installé la capture corrigée sur la TV à 08 h 00 et appliqué la limite de 512 tâches au service (section 13).

Cette rédaction n’a modifié que des documents : ce livrable, l’index des tickets, les tickets et une phrase du README.

## 2. Origine des changements

L’arbre de travail mêle trois origines. Aucune n’est commitée.

| Origine | Contenu | Preuve de l’origine |
| --- | --- | --- |
| **Baseline héritée** | L’optimisation de latence du backend, antérieure à cette mission : [latence et architecture du backend](backend-latency-optimization.md). HEAD `9758633` plus des différences non commitées | Manifeste figé de 163 fichiers, 0 écart au départ. Suite rejouée avant tout changement : **287 tests Node réussis, 0 échec** ; **6 tests Python réussis** (`python3 -m unittest tests/test_tv_control.py`) |
| **Cette session** | Les huit tickets : plafond de cinq minutes, sessions durables, suppression et garde disque, cloisonnement, surveillance, cartes regroupées, interfaces Mac et TV, mode ambiant TV, vues d’état | Journal des tranches et comptes rendus des lots, dans `.local/night-features/` (dossier local, hors Git) |
| **Session réexamen, intégrée par fusion** | Réutilisation de la transcription du passage par `inspect_clip`, option `exactSpeech`, intervalles distincts images et paroles : [document de cette session](reinspection-transcript-reuse.md) | Bundle de 7 fichiers de base et 10 entrants (dont 3 nouveaux), sommes vérifiées. 6 fichiers copiés tels quels, `core/video-tools.cjs` fusionné à trois voies sans conflit |

Le correctif du réexamen n’est **pas** un travail de cette session. Ses mesures et ses réserves sont celles de son auteur ; elles sont reprises en section 4.8 sans être présentées comme un gain produit de cette nuit. Un de ses fichiers, `adapters/clip-inspector.cjs`, a été modifié ici après l’intégration (ticket 02) : à reporter lors d’un futur rapprochement avec cette autre session.

Une copie figée de la baseline (code, tests et scripts) sert de point de comparaison pour les mesures « avant ».

## 3. Ticket par ticket

Les fichiers cités existent dans l’arbre. Les totaux de tests donnés par lot sont ceux de chaque lot à son heure. Le total qui vaut pour l’arbre final est celui de la suite complète (section 1) ; sa sortie ne donne pas de sous-total par fichier.

Les parcours navigateur de la TV sont décrits une fois, au ticket 07, avec leurs commandes. Les autres tickets citent le scénario qui les concerne. **Aucun de ces parcours n’a tourné sur la TV.**

### Ticket 01 — Questions de cinq minutes

**État : partiel.** Cœur, serveur et Mac livrés et prouvés par tests hors ligne. Panneau TV : prouvé dans un navigateur de bureau sur copie temporaire ; natif sur la TV : NON EXÉCUTÉ. Aucun essai à fournisseur réel d’une question longue.

**Pour le spectateur, sur Mac.** Une recherche qui progresse n’est plus coupée à 60 secondes. La carte de la question affiche le temps écoulé sur le plafond, par exemple « 01:12 / 05:00 », et sa place dans la file. À la limite, le message est « Limite de 5 minutes atteinte. ». Un délai, une erreur ou une annulation ne sont plus présentés comme « preuves insuffisantes ». La carte dit aussi ce que la question pouvait consulter. Pendant le traitement, c’est la phrase entière : « Mémoire disponible jusqu’à 00:29 au moment de l’envoi · dernier passage reçu : 00:27–00:29 ». Une fois la réponse rendue, c’est un libellé court, « Mémoire jusqu’à 11:58 » ; la phrase entière reste en infobulle et dans « Détails du traitement ».

**Pour le spectateur, sur TV.** Le code du panneau affiche le même écoulé sur plafond, à partir de l’heure du serveur et non de l’horloge de la TV. Un bouton fixe « Annuler la question en cours » est dans le parcours des flèches. Ces écrans ont été installés sur la TV par la supervision à 07 h 29 ; les fichiers lus ne contiennent aucune preuve de leur usage sur la TV (section 13).

**Ce qui change dans le code.**

- `core/deep-ask.cjs` : `QUESTION_TIMEOUT_MS = 300000`, `job.timeoutMs` publié avec chaque question, messages dérivés par `limitLabel`. La file reste de cinq questions en attente. L’attente en file n’est pas comptée dans le plafond.
- `runtime/conversation-runtime.cjs` : `config.questionTimeoutMs` validé à la composition (entier de 1 à 300 000, sinon refus au démarrage).
- `adapters/video-bridge.cjs`, `mcp/server.cjs` : contexte MCP externe et appel d’outil alignés sur le même plafond.
- `adapters/config.cjs` : la description visuelle continue pendant une question (`visionDuringAsk` vrai par défaut).
- `core/video-tools.cjs`, `core/deep-ask.cjs` : fraîcheur de la question (`job.availability`). Un refus d’outil pour intervalle hors d’atteinte nomme l’intervalle réellement consultable. Le préfixe figé n’est jamais élargi.
- `runtime/headless-runtime.cjs`, `server/http.cjs` : `serverNowMs` dans l’état ; `POST /v1/questions/<deep-N>/cancel` rend `{cancelled, status}`.
- `server/main.cjs`, `app/main.cjs` : lecture de `TVLENS_QUESTION_TIMEOUT_MS`.
- `app/ui/job-view.mjs`, `app/ui/job-card.js`, `app/renderer.js`, `tv/app/companion.js` : affichage.

**Preuves exécutées.**

| Preuve | Niveau | Résultat |
| --- | --- | --- |
| `node --test tests/question-ceiling.test.cjs` | tests hors ligne, horloge virtuelle, composition réelle, faux en mémoire | 4 réussis. Une question dépasse 60 s et s’arrête à exactement 300 000 ms ; une recherche de 250 s qui progresse aboutit ; une annulation libère la file ; 130 passages sur 130 reçus, transcrits et décrits pendant ce temps |
| Sonde de mutation, hors dépôt : plafond forcé à 60 s | tests hors ligne | les 4 tests échouent, comme attendu |
| Relecteur indépendant du lot 01, sur une copie isolée « baseline plus fichiers du lot » | tests hors ligne | verdict « pass » ; 291 réussis, 0 échec |
| `tests/deep-ask-restore.test.cjs` (réouverture des questions d’une archive) | tests hors ligne | 3 tests à son premier relevé ; 44 réussis, 0 échec sur les 7 fichiers liés |
| `tests/question-freshness.test.cjs` (fraîcheur, refus qui nomme l’intervalle consultable) | tests hors ligne | 3 tests ; 69 réussis, 0 échec sur les 11 fichiers liés |
| `tests/server-sessions.test.cjs` (réglages de `server/main.cjs`), `tests/mac-ipc-contract.test.cjs`, `tests/mac-ui.test.cjs` | tests hors ligne | lecture stricte de la variable ; écoulé sur plafond et place en file dans le modèle de vue Mac |
| Démarrage réel de `server/main.cjs` sur port éphémère, données isolées, sans session | hors dépôt, sans fournisseur | plafond de 60 000 ms appliqué quand la variable le demande ; une valeur invalide arrête le démarrage avec un message en français |
| Suite complète sur l’arbre figé | tests hors ligne | 473 tests, 0 échec, ces fichiers compris. Derniers totaux par fichier, relevés à 05 h 50 par le relecteur de la documentation : `question-ceiling` 4, `question-freshness` 3, `deep-ask-restore` 4 |
| Scénario « question longue » du parcours du panneau (ticket 07) | navigateur de bureau sur copie temporaire | réussi : écho immédiat, sondage dès l’envoi, écoulé sur plafond à l’horloge du serveur sans reconstruire la carte, position en file, annulation aux flèches. Sortie : `tv/final-smoke-tv-overlay.txt` |
| Parcours Electron définitif (ticket 08) | Electron réel à fournisseurs simulés | réponse citée ; fraîcheur en libellé court au-dessus d’une réponse terminée, phrase entière dans le bloc de détail |

**Limites.**

- Aucun fournisseur réel sur une question longue : ces tests prouvent l’orchestration, pas la vitesse. Les délais internes du Codex App Server restent inconnus. Les sept questions réelles de la nuit ont duré de 5,9 à 17,7 s (section 4.6).
- Le délai de 300 s de `mcp/server.cjs` n’est prouvé que par une assertion sur le texte du fichier.
- La file peut faire attendre jusqu’à 5 × 300 s avant le démarrage d’une question. Les clients affichent la place en file ; le cœur n’envoie qu’un rappel, à 30 s.
- Contrepartie de la vision pendant les questions : un appel de vision peut tourner en même temps que le chat sur le même compte Codex. Mesuré en simulation seulement (section 4.4).
- Sur Mac, les réglages d’hôte ne sont lus que dans l’environnement du processus, pas dans le `.env.local` importé. L’application empaquetée ne les reçoit donc pas (section 7).

**Réglages réversibles.** `TVLENS_QUESTION_TIMEOUT_MS` (par exemple `60000` pour revenir à l’ancien plafond). `TVLENS_VISION_DURING_ASK=0` pour retenir de nouveau la vision pendant une question.

### Ticket 02 — Sessions durables et archives

**État : partiel.** Socle, serveur et Mac livrés et prouvés par tests hors ligne. Panneau Sessions de la TV : prouvé dans un navigateur de bureau sur copie temporaire ; natif sur la TV : NON EXÉCUTÉ. Volume : mesuré une fois sur une capture synthétique, jamais sur une vraie émission.

**Pour le spectateur.** Le début d’un film reste réexaminable à 1 h 30. Arrêter la capture, fermer l’application ou redémarrer le serveur ne supprime plus rien. « Terminer la session » sur TV, « Nouvelle session » et la fermeture de l’application sur Mac **archivent**. Une archive s’ouvre en lecture seule : on y lit la frise, on y pose des questions, on y rejoue les passages. La capture ne reprend que sur une action explicite, « Reprendre la capture », confirmée sur Mac. Lancer une capture sur une archive ouverte demande de choisir : reprendre ici, ou nouvelle session.

Sur Mac, le panneau **Sessions** est dans la vue Mémoire. Sur TV, le code ajoute un panneau « Sessions » accessible depuis la frise. Il fait partie des fichiers installés par la supervision ; son usage sur la TV n’a aucune preuve (section 13).

**Ce qui change dans le code.**

- `core/session.cjs`, `runtime/session-runtime.cjs` : conservation jusqu’à suppression par défaut. Une durée finie rend la fenêtre glissante.
- `adapters/local-store.cjs`, `adapters/session-thumbnails.cjs` : par session, des dossiers `media/` et `thumbs/`, et un `manifest.json`. L’ancien nettoyage ne peut pas les atteindre.
- `adapters/session-library.cjs` (nouveau) : liste, lecture et suppression d’une session.
- `runtime/headless-runtime.cjs`, `server/http.cjs` : `GET /v1/sessions`, `POST /v1/sessions/<uuid>/open`, `/resume`, `/delete`, `POST /v1/sessions/close`, `GET /v1/media/<uuid>/<moment-N>`. `POST /v1/session/end` archive. `POST /v1/session/start` sur une archive en lecture seule répond 409.
- `app/main.cjs`, `app/preload.cjs` : canaux `sessions:*`, protocole `tvlens-media://` étendu à toute la session chargée.
- `core/deep-ask.cjs` (`restore`), `core/living-recap.cjs` (`restore`) : questions et résumé rouverts avec l’archive.
- `app/ui/sessions-view.mjs`, `app/ui/sessions-dom.js`, `tv/app/sessions-view.js` : interfaces.

**Format et données anciennes.** Le format est additif. Rien n’est migré, rien n’est effacé. Une archive d’avant la mission, sans manifeste, est listée « Texte seul » : ses médias n’avaient pas été gardés, et le produit le dit. Un passage indisponible porte son motif : non conservé, introuvable, illisible, ou expiré si la fenêtre glissante est réactivée. Une session coupée par un arrêt brutal est listée « interrompue » et se rouvre ; un média complet resté hors de la frise y est remis, un média incomplet est compté, jamais effacé.

**Passage à vidéo illisible (ajout de 06 h 36 à 07 h 07).** Entre 06 h 25 et 06 h 32, le parcours Electron a échoué deux fois sur trois à la relecture du premier passage : son fichier vidéo pesait 110 octets. La cause a été reproduite à l’identique hors du produit, avec Electron 44.4.5 : quand l’enregistreur de Chromium reçoit le son mais aucune image pendant un passage, il écrit un en-tête WebM sans aucun bloc. Avant correction, ce passage était annoncé « vidéo disponible », et son réexamen aurait échoué.

- `core/clip-container.cjs` (nouveau) lit le conteneur Matroska ou WebM et dit s’il porte au moins un bloc média. Aucun seuil de taille. Il ne dit rien d’un fichier qui n’est pas du Matroska.
- `core/session.cjs` : à la réception, un conteneur vide rend le passage non rejouable, motif `unreadable`. Ses fichiers restent sur le disque. Il est analysé comme les autres et reste « illisible » après réouverture d’une archive. Le compteur `coverage.videoUnreadable` n’est présent que si le cas s’est produit.
- `adapters/clip-inspector.cjs`, `core/video-tools.cjs` : le réexamen d’un tel passage n’est plus refusé. Il se fait sur les images gardées à la capture, et la réponse dit d’abord la limite : « Vidéo illisible pour le passage … : réexamen fait sur N images conservées à la capture, sans le mouvement entre elles. »
- Clients : « vidéo illisible » sur la frise, le bouton de relecture et les citations du Mac, et dans le panneau TV. La route média du serveur répond 410.

Preuves : `tests/clip-unreadable.test.cjs`, 5 tests sur les deux fichiers réels de Chromium gardés comme entrées de test (tests hors ligne) ; relecteur indépendant, verdict « pass », huit constats mineurs, aucun faux « illisible » sur 17 conteneurs réels produits par ffmpeg 8.1.1 ni sur le fichier réel de Chromium (`lot-CLIP-ILLISIBLE-verify.json`) ; parcours Electron définitif, où le cas est reproduit exprès (ticket 08).

Limites laissées telles quelles :

- le contrôle n’a lieu qu’à la réception. Une archive enregistrée avant lui, comme celles des essais de la nuit, ou un passage retrouvé sur le disque après une coupure, n’est pas rejugé et peut encore être annoncé rejouable ;
- une piste audio seule, sans image, n’est pas détectée ;
- dans Electron à fournisseurs simulés l’inspecteur est factice : le réexamen sur les images gardées est prouvé par le test Node et par le relecteur avec le vrai ffmpeg, pas par le parcours ;
- avec la stratégie `native-slow`, hors du chemin produit, le réexamen d’un tel passage échoue avec un message ;
- le relecteur n’a rien revérifié après 07 h 00 environ. Le journal ne mentionne aucune seconde relecture des reprises faites par le coordinateur entre ce verdict et le gel.

**Preuves exécutées.**

| Preuve | Niveau | Résultat |
| --- | --- | --- |
| `tests/session-durable.test.cjs` | tests hors ligne, temps simulé | 13 réussis à la reprise H2. Début du film rejouable et réexaminable après 95 minutes, un arrêt et une réouverture ; capture seulement sur reprise explicite ; archive ancienne listée « texte seul » et inchangée octet pour octet |
| `tests/server-sessions.test.cjs` | tests hors ligne, serveur HTTP sur port éphémère | 7 réussis. Début du film servi 95 minutes plus tard, après un arrêt et un redémarrage ; archive en lecture seule jusqu’à la reprise ; une archive « jusqu’à suppression » garde ce contrat sur un hôte réglé en fenêtre glissante |
| `tests/mac-ipc-contract.test.cjs` | tests hors ligne, vrai `app/main.cjs` derrière le vrai preload, Electron de substitution | 7 réussis à la reprise H2. Session archivée au lieu d’être purgée, listée, rouverte sans écriture, reprise seulement sur demande. De 05 h 18 à 05 h 29, un autre test de ce fichier a été rouge (ticket 05) |
| Relecteur de la reprise B2 | tests hors ligne et sondes | verdict « pass » ; 23 fichiers lancés une fois, 0 échec. Ses notes disent 146 tests ; la liste détaillée de son compte rendu en totalise 150. L’écart est à la source, il n’est pas tranché ici. Arrêts brutaux réels d’un processus enfant (SIGKILL) : session relistée et rouverte, dossier identique octet pour octet |
| `tests/chat-instruction.test.cjs`, second test : fin de session pendant qu’un passage atterrit | tests hors ligne, hôte serveur | le passage est gardé dans l’archive et aucune analyse n’est lancée pour lui ; 33 réussis, 0 échec sur les 6 fichiers liés. Sans la correction, sur une copie hors dépôt, ce test échoue |
| Scénario « sessions aux flèches » du parcours du panneau (ticket 07) | navigateur de bureau sur copie temporaire | réussi : liste, ouverture en lecture seule sans capture, dialogue à trois choix, refus 507 dit en clair, reprise explicite, cause de fin de capture, suppression confirmée, nouvelle session. Le refus 409 n’est pas joué dans le navigateur ; il est couvert par un test Node du modèle de vue (`tests/tv-panel.test.cjs`) |
| Parcours Electron définitif (ticket 08) | Electron réel à fournisseurs simulés | archivage, ouverture en lecture seule avec sa propre conservation, reprise explicite, suppression d’une seule session |

**Limites.**

- **Le volume n’est pas mesuré sur une vraie émission.** Le seul relevé réel porte sur une capture synthétique (section 4.7).
- Le repli de lecture des archives anciennes est testé sur des fichiers fabriqués. Aucune archive réelle de ce Mac n’a été ouverte.
- Un clip tronqué par un arrêt brutal, dont le fichier compagnon est complet, serait annoncé disponible : le bail vérifie la présence des deux fichiers, pas leur intégrité.
- Une archive enregistrée en fenêtre glissante prend la fenêtre de l’hôte qui la reprend.
- Sur Mac, une question ou une recherche sur une archive ouverte peut appeler le fournisseur d’embeddings et écrire `embeddings.json` dans l’archive, si une clé est configurée. Seule l’ouverture est garantie sans écriture.
- Les moments gardés et les anciennes vérifications ne partent pas avec la session ; le dialogue de suppression le dit.
- Une session terminée sans aucun passage ni question n’est pas conservée.
- Avant la nuit, la capture TV s’arrêtait à 30 minutes par lancement. Le code de la nuit porte ce plafond à 6 heures (`tv/capture.py`). La capture installée par la supervision annonce bien 21 600 s, et 600 s sans lecture (`deployment/tv-live-capture.txt`, lu, non revérifié). Aucune capture longue n’a été faite.

**Réglages réversibles.** `TVLENS_MEDIA_RETENTION_MS` : une durée en millisecondes rétablit la fenêtre glissante (par exemple `300000`).

### Ticket 03 — Suppression explicite et limites disque

**État : partiel.** Serveur et Mac livrés et prouvés par tests hors ligne. Panneau TV : suppression et bandeau disque prouvés dans un navigateur de bureau sur copie temporaire ; natif sur la TV : NON EXÉCUTÉ. Aucun essai sur un volume réellement plein.

**Pour le spectateur.** Supprimer une session efface cette session et elle seule : ses médias, ses miniatures, ses textes, son index, son registre de surveillance. La suppression est refusée pendant la capture. Une question ou une surveillance en cours sur cette session est annulée. Sous le plancher d’espace libre, la capture s’arrête, un bandeau persistant l’explique, et **rien n’est supprimé pour faire de la place**. Le message donne un seul chiffre, par exemple « Il manque environ 257 Mo d’espace libre. » La lecture et les questions restent possibles.

**Ce qui change dans le code.**

- `adapters/disk-guard.cjs` (nouveau) : états `ok`, `low`, `blocked`, `unknown`, avec hystérésis. Plancher de 1 Gio, alerte à 2 Gio.
- `adapters/session-library.cjs` : suppression d’une session par identifiant strict ; scellement contre les écritures tardives.
- `server/http.cjs`, `runtime/headless-runtime.cjs` : `/v1/segments` répond 507 `{error, code:'storage-full'}` ; `GET /v1/storage` ; `storage` dans l’état.
- `server/main.cjs`, `app/main.cjs` : plus aucun nettoyage au démarrage ni aux transitions.

**Preuves exécutées.**

| Preuve | Niveau | Résultat |
| --- | --- | --- |
| `tests/session-delete.test.cjs`, `tests/disk-guard.test.cjs` | tests hors ligne | 3 et 4 réussis. Suppression d’une seule session, aucune écriture tardive ne la fait revenir ; passage refusé avant toute écriture sous le plancher |
| `tests/server-sessions.test.cjs` | tests hors ligne | suppression refusée pendant la capture ; question et surveillance annulées ; 507 sans rien écrire ; la session se met en pause, reste lisible, et capture de nouveau quand la place revient ; plus de balayage au démarrage |
| Relecteur du lot H-serveur : démarrage réel du point d’entrée sur une session pré-semée | hors dépôt, sans fournisseur | médias, fichier brut de l’ancien format et miniatures conservés après démarrage puis SIGTERM |
| Premier scénario du parcours du panneau (ticket 07) | navigateur de bureau sur copie temporaire | réussi : bandeau « Espace disque faible sur le serveur » redessiné quand le stockage change, puis « Espace disque insuffisant sur le serveur : capture suspendue pour ne rien supprimer », avec les chiffres du serveur |
| Scénario « sessions aux flèches » du même parcours | navigateur de bureau sur copie temporaire | réussi : refus 507 dit en clair ; suppression confirmée, le choix « Annuler » venant en premier |
| Parcours Electron définitif, second lancement avec un plancher inatteignable (ticket 08) | Electron réel à fournisseurs simulés | capture refusée sous le plancher, bandeau persistant, rien de supprimé ; suppression d’une seule session |

**Limites.**

- Le disque plein est **simulé** : espace libre injecté, erreur d’écriture provoquée. Aucun volume n’a été réellement rempli.
- La garde ne couvre que l’écriture des médias. Les miniatures, `session.json` et l’index comptent sur la réserve du plancher.
- Aucune éviction automatique : quand le disque est plein, c’est au spectateur de supprimer une session.
- Une écriture de média qui ne reviendrait jamais bloque la fin de session.

**Réglages réversibles.** `TVLENS_DISK_MIN_FREE_MB` (défaut 1024), `TVLENS_DISK_WARN_FREE_MB` (défaut 2048).

### Ticket 04 — Cloisonnement technique et rôle du compagnon

**État : non clos.** Confinement renforcé, prouvé sur ce Mac pour le fil principal du chat et du vérificateur. **Il n’est pas absolu.** Sous-agents : prévention mesurée sur une seule version de Codex, garde réactive, portée non mesurée. Linux et le VPS ne sont pas mesurés par cette session ; sur le VPS, la supervision rapporte la connexion confirmée des quatre rôles, sans sonde adverse (section 13). Aucune case du ticket n’est cochée.

La référence est [SECURITY.md](../SECURITY.md), qui sépare ce qui est empêché, ce qui n’est que détecté après coup, et ce qui est inconnu. Ce qui suit en est le résumé.

**Ce que l’audit a établi au départ.** Le bac à sable « lecture seule » laisse lire tout le disque. Le refus observé en baseline tenait à l’absence d’outil de lecture et à la consigne, pas à un contrôle des fichiers. Le modèle voyait `apply_patch`, utilisable comme oracle de lecture hors contexte.

**Ce qui change dans le code.**

- `adapters/codex-confinement.cjs` (nouveau), `adapters/codex-session-client.cjs` : fils ouverts sans environnement d’exécution (`environments: []`) ; réponse de Codex relue à chaque ouverture ; trois dossiers temporaires distincts par processus ; environnement en liste blanche ; liste blanche d’éléments par rôle.
- Prévention des sous-agents : `agents.enabled=false` et `features.multi_agent_v2.max_concurrent_threads_per_session=1`, relus par `config/read` avant d’annoncer `subAgents: 'blocked'`.
- **Refus par défaut (correction C4, puis extension du coordinateur).** Une connexion est refusée, pour les quatre rôles, quand le blocage des sous-agents n’est pas confirmé : avant tout lancement si le binaire refuse les réglages ou ne répond pas, sinon après `config/read` et avant l’ouverture du fil. Elle l’est aussi quand la réponse d’ouverture du fil ne redit pas l’absence d’environnement d’exécution. Il n’y a plus de repli silencieux moins protégé.
- **Mode diagnostic.** `TVLENS_CODEX_CONFINEMENT=report` lance sans rien refuser. Il se dit **non confiné** : `confined: false`, et une ligne au journal à chaque connexion.
- `adapters/codex-verifier.cjs` : le vérificateur manuel ne passe plus par `codex exec`. Il tourne sur le client App Server, rôle `verifier`, web seul, aucun outil. Son effort de raisonnement est désormais fixé à `low`.
- `core/verification.cjs`, client de session : une source n’est gardée que si sa page a été ouverte ; une ouverture groupée compte toutes ses pages. Depuis une correction faite vers 06 h 05, entre le deuxième et le troisième parcours réel, une page que Codex rapporte comme « vue » est créditée quel que soit le nom de l’action, jamais pour une simple recherche.
- `adapters/companion-prompt.cjs` : consigne ramenée de 4 908 à 665 caractères fixes par tour de chat, mesurés sans consigne active. Avec une consigne active, le tour porte en plus une ligne « portée de la consigne » (ticket 05) ; sa longueur n’a pas été remesurée. La demande et la consigne active du spectateur sont hors du bloc de données déclaré non fiable.
- `core/deep-ask.cjs`, hôtes : la consigne de surveillance active est transmise au chat (`getInstruction`), tant que la surveillance tourne. Un lien Markdown écrit par le modèle est ramené à ses mots, l’adresse retirée ; les pages restent dans les sources.
- `adapters/codex-rpc.cjs` : SIGTERM puis SIGKILL après trois secondes.

**Preuves exécutées.**

| Preuve | Niveau | Résultat |
| --- | --- | --- |
| `node scripts/probe-confinement.cjs --steps a,b,c,d,e,f`, six tours | fournisseur réel sur ce Mac, sonde | consigne neutralisée : ni `apply_patch`, ni shell, ni lecteur de fichiers ; outil de code sans entrées-sorties ; canari jamais revenu. Une injection placée dans un passage n’a entraîné ni lecture ni appel vers l’adresse piégée : un seul essai, et c’est le modèle qui ne l’a pas suivie, aucun contrôle ne bloquait l’ouverture de l’adresse |
| Contrôle négatif : fil ouvert sans `environments: []` contre le vrai App Server | réel, sans tour de modèle | refusé par le client |
| Reprise C2, étapes g, h, i, k, quatre tours | fournisseur réel sur ce Mac, sonde | vérificateur sans shell ni lecteur, limité à l’horloge et au web ; en production, verdict avec deux sources gardées sur une ouverture groupée observée |
| Reprise C3, étapes k et m, deux tours | fournisseur réel sur ce Mac, sonde | aucun outil de collaboration énuméré ; avec le premier réglage retiré exprès, création refusée par le moteur (« agent thread limit reached »), deux variantes |
| Vrai binaire Codex, modèle remplacé par un script local | scripté, sans modèle | les quatre rôles ne déclarent aucun outil de collaboration au lancement du produit |
| Correction C4 : refus par le chemin réel de lancement, avec de faux binaires Codex | tests hors ligne | quatre cas de refus, le cas nominal, un échec passager retenté après 10 s. 13 fichiers, 115 réussis, 0 échec ; `tests/codex-confinement.test.cjs` 17, `tests/verification.test.cjs` 10. 24 mutations du code livré, sur copie hors dépôt, toutes détectées |
| Vérification finale sans aucun tour de modèle, 06 h 01, code final, mode par défaut | réel sur ce Mac, sans tour de modèle | les quatre rôles se connectent avec `confined: true`, `verified: true`, `subAgents: 'blocked'` ; les deux réglages relus ; fil sans environnement, bac à sable en lecture seule sans réseau, approbation `never` ; renouvellement de fil sur le même processus. Sortie : `04-confinement-final-sans-tour.json` |
| Les sept parcours réels de la passe finale (ticket 05) | fournisseur réel sur ce Mac avec perception simulée par des textes écrits | client du chat en mode par défaut : `confined: true`, `verified: true`, sous-agents bloqués |
| `tests/chat-instruction.test.cjs` (consigne active transmise au chat) | tests hors ligne, hôte serveur, agent de chat factice | la consigne arrive pendant la surveillance, ni avant ni après ; 24 réussis, 0 échec sur les 7 fichiers liés relancés. **Observée ensuite dans cinq tours réels** (ticket 05) : dans les trois premiers, le chat, qui recevait la consigne « Vérifie les chiffres annoncés. », a de lui-même vérifié le chiffre sur le web |
| `tests/opened-pages.test.cjs` | tests hors ligne, sur les formes réellement enregistrées | pages ouvertes par référence créditées, une simple liste de résultats jamais ; 9 fichiers liés relancés : 90 réussis, 0 échec, d’après le journal |
| Relecteurs indépendants | — | lot C : « fail » (un défaut majeur, corrigé) ; C2 : « pass » ; C3 : « pass », sept constats mineurs ; **C4 : « pass », sept constats mineurs** |

Sorties brutes, dossier local : `04-confinement-probe-apres.txt`, `-reprise.txt`, `-sous-agent.txt`, le rapport `04-confinement-apres.md`, `lot-C4-impl.json`, `lot-C4-verify.json`.

**Ce qui est empêché, détecté, inconnu.**

- **Empêché, mesuré avec un vrai modèle sur `codex-cli 0.160.1`, macOS** : shell, lecteur de fichiers et `apply_patch` pour le chat et le vérificateur ; création de sous-agents pour le chat.
- **Empêché sans modèle seulement** : la création de sous-agents pour la surveillance, le vérificateur et l’analyse ; l’absence d’outil pour la surveillance et l’analyse.
- **Refusé par défaut, prouvé sur de faux binaires seulement** : une connexion dont le blocage n’est pas confirmé. Aucun refus n’a été observé sur un vrai Codex ; sur le vrai `0.160.1`, seul le cas nominal existe. Sur le VPS, sous Linux et Codex 0.158.0, c’est aussi le cas nominal que la supervision rapporte : les quatre rôles connectés, `confined: true`, `verified: true`, sous-agents bloqués (`deployment/vps-preflight.txt` pour les rôles, `deployment/report.md` pour la version ; lus, non revérifiés).
- **Détecté après coup** : un fil que l’application n’a pas ouvert ferme le processus.
- **Inconnu** : ce qu’un sous-agent atteindrait réellement ; l’effet des réglages sous Linux et sur une autre version au-delà de cette connexion nominale, ou avec un autre modèle. Les fichiers lus ne contiennent aucune sonde adverse jouée sur le serveur.

**Constats défavorables, gardés tels quels.**

- Avant la prévention, **un sous-agent a pu être créé** par `collaboration.spawn_agent` pendant un tour réel. Codex ne l’a pas annoncé. La garde a fermé le processus à la première notification ; ce qu’il pouvait atteindre n’est pas mesuré.
- Sur 259 essais à fournisseur scripté du lancement d’avant la prévention, **une requête d’inférence de sous-agent est partie une fois après le signal de fermeture**. Les fichiers bruts de cet essai ont été **écrasés** par une relance de l’implémenteur ; il n’en reste que la sortie d’inspection. Aucune reproduction n’est archivée. La garde réactive ne garantit donc pas qu’un sous-agent ne reçoit rien.
- Le filtre « source gardée si sa page a été ouverte » a produit **deux faux négatifs** au cours de la nuit. Le premier, présenté à tort comme un succès : une source réellement ouverte, en second dans un appel groupé, était écartée. Le second, trouvé par la passe réelle : Codex rapporte une ouverture groupée par référence sous un nom d’action que le comptage ne reconnaissait pas, et une affirmation exacte finissait « indéterminée ». Les deux sont corrigés. **Un résidu n’est pas élucidé** : dans le troisième parcours réel, une autre affirmation exacte est restée indéterminée, trois sources proposées, deux retenues (ticket 05).
- `functions.exec` (outil de code), `wait` et `request_user_input` restent déclarés au modèle. La liste blanche de l’application ne voit pas ce qui passe par l’outil de code.
- Le web reste un canal de sortie non borné. Le texte provisoire s’affiche avant la validation des sources.
- **Injection : aucun refus technique démontré pour la partie « ouvrir une adresse ».** L’essai réel est unique : un modèle, une formulation. Le modèle n’a pas suivi l’injection. Sa demande de lire un fichier n’avait aucun moyen d’aboutir sur le fil principal ; sa demande d’ouvrir une adresse piégée n’était bloquée par rien, le web étant ouvert au chat sans filtre d’adresse. Le critère « une injection représentative refusée par contrôle technique » n’est donc tenu que pour la lecture hors contexte ; la case du ticket reste vide.
- La sonde n’a pas exercé les rôles surveillance et analyse avec un vrai modèle, consigne neutralisée. La surveillance a tourné en réel dans la passe finale, mais sans que ses outils soient sondés.
- **Connexions non anticipées vers le fournisseur.** Pendant sa recherche, l’implémenteur de C3 a lancé cinq fois le vrai App Server sans identité, et un fil s’est ouvert : Codex a tenté de lui-même une connexion de préchauffage vers `api.openai.com`, refusée en 401. Aucune inférence, aucune identité. Il a aussi envoyé trois requêtes de documentation par l’outil `ctx7`.
- La vérification réelle sans tour de C4 a ouvert neuf fils et non quatre, sur cinq processus, avec une lecture des quotas du compte. Écart déclaré par l’implémenteur, confirmé par le relecteur. Aucun tour de modèle.
- Autres écarts de conduite déclarés par les implémenteurs : deux étapes de sonde ajoutées hors consigne (un tour réel chacune, plus un début d’inférence de sous-agent pour l’une) ; une étape qui désactivait la garde, écrite puis retirée sans avoir jamais été lancée.

**Réglages.** Les réglages de cloisonnement et leurs replis sont décrits dans [SECURITY.md](../SECURITY.md) et dans `deploy/runtime.env.example`. Chaque repli retire un contrôle ; aucun n’est à poser hors diagnostic. La conséquence du refus par défaut pour un serveur est en section 8.

### Ticket 05 — Surveillance à consigne libre, en parallèle du chat

**État : partiel.** Cœur commun, serveur et Mac livrés, prouvés par simulation et par la suite finale. Cinq parcours à fournisseur réel sur ce Mac, avec perception simulée par des textes écrits. Vue Surveillance de la TV : prouvée dans un navigateur de bureau sur copie temporaire ; natif sur la TV : NON EXÉCUTÉ. La correction de 05 h 28 n’a pas eu de relecteur dédié. Le script `scripts/probe-surveillance.cjs` n’a pas été exécuté.

**Pour le spectateur, sur Mac.** L’onglet **Surveillance** remplace Auto. On y écrit une consigne libre (« vérifie les chiffres qui sont annoncés »), on démarre, on arrête. La surveillance lit ce qui commence après son activation, jamais le passé. Une activité discrète dit ce qu’elle fait : restauration, écoute, lecture, vérification, retard. **Poser une question ne la suspend pas et ne l’annule pas.** Si la lecture échoue, l’interface le dit : « lecture des passages en échec : 3 passages non lus », et non « rien à signaler ». Quand le suivi n’est pas enregistré sur le disque, un avis le dit au-dessus de toutes les vues, sans proposer aucune action.

**Pour le spectateur, sur TV.** Le code ajoute une vue Surveillance à la télécommande : activer, arrêter, consulter l’historique, le détail et les sources. Elle fait partie des fichiers installés par la supervision ; son usage à la télécommande n’a aucune preuve. Sur le serveur installé, le service est mort deux fois juste après le démarrage d’une surveillance, avant le relèvement de la limite de tâches (section 13).

**Ce qui change dans le code.**

- `core/surveillance.cjs` (nouveau) : curseur par passage, registre d’affirmations à états explicites, file bornée non perdante, un poste de vérification par défaut. Il ne lit aucun indicateur du chat.
- `adapters/codex-surveillance-agent.cjs`, `adapters/surveillance-prompt.cjs` : un rôle de lecture sans web ni outil, un rôle de vérification avec web et sans outil, un fil neuf par tour.
- `adapters/simulated-surveillance-agent.cjs` : agent déterministe, sans réseau, pour les démonstrations et les tests.
- `runtime/surveillance-runtime.cjs` : composition commune aux deux hôtes ; registre écrit dans `surveillance.json` de la session ; bloc `registry:{ready, persisted, status, message}` toujours présent dans l’état.
- Serveur : `POST /v1/surveillance/start`, `/stop`, `/retry`, `/history`, `/detail`, `GET /v1/surveillance`, `GET /v1/surveillance/overlay`. Cette dernière publie aussi `registry`, ajout fait entre 06 h 10 et 06 h 36.
- Mac : canaux `surveillance:*` ; `core/auto-monitor.cjs` et les canaux `auto:*` sont retirés.
- Phrase du cœur corrigée à la source, entre 06 h 53 et 06 h 58 : quand une seule vérification est en retard sans rien derrière elle, il ne dit plus « Vérifications en retard : 0 affirmation en attente. » mais « Vérification en cours : elle a pris du retard. »

**Ce que « sans perte silencieuse » veut dire ici.** Tout passage postérieur à l’activation est lu, ou compté comme non lu avec sa cause. Toute affirmation détectée reçoit un identifiant et finit dans un état explicite : sourcée, indéterminée, relevée, en erreur, annulée, ou encore en attente. Un arriéré est drainé du plus ancien au plus récent. Un retard est dit (`late`). Un élément rejeté par la validation laisse une trace sur son passage. Le dédoublonnage ne fusionne que des énoncés quasi identiques : « 7 % » et « 9 % » restent deux affirmations.

**Chat et surveillance : qui vérifie quoi (choix fait vers 07 h 00, à confirmer).** La consigne active est transmise au chat. Dans les trois premiers parcours réels, le chat la prenait pour lui : à une simple question de récapitulatif, il allait vérifier le chiffre sur le web, ce que la surveillance faisait déjà. Depuis ce choix, le tour de chat porte une ligne « portée de la consigne » : la surveillance exécute la consigne de son côté ; une demande sur ce qui vient d’être dit ou montré se répond depuis la vidéo, sans recherche web ; le web reste ouvert si la demande le réclame (vérifier, chercher, sourcer, « c’est vrai ? », un lien) ou si la réponse dépend d’un fait que la vidéo ne donne pas ; un chiffre venu de la vidéo se dit annoncé, jamais confirmé. Sans consigne active, le tour est inchangé. Le changement est dans le texte de la consigne seulement (`adapters/companion-prompt.cjs`) ; il n’a pas de réglage dédié. Non fait, volontairement : transmettre au chat les résultats déjà vérifiés par la surveillance.

**Preuves exécutées.**

| Preuve | Niveau | Résultat |
| --- | --- | --- |
| `tests/surveillance.test.cjs` | simulation, horloge injectée | 16 réussis après la reprise S2. Lecture après l’activation seulement, aucune preuve venue du futur ; arriéré de quarante passages drainé sans perte ; arrêt qui annule et ignore les résultats tardifs ; un chat occupé ne suspend rien |
| `tests/surveillance-runtime.test.cjs` | simulation, vrai client Codex sur simulateur RPC | 14 réussis après la correction de 05 h 28 |
| `tests/server-surveillance.test.cjs` | tests hors ligne, serveur HTTP | chat et surveillance se chevauchent sur l’hôte serveur, aucun ne retient l’autre, leurs mesures restent séparées |
| `tests/mac-ipc-contract.test.cjs` | tests hors ligne | à la reprise H2 (04 h 40) : 7 réussis, dont « une question ne suspend ni n’annule la surveillance ; quitter archive, le démarrage suivant retrouve la session et son registre ». **Après la reprise S3 (05 h 18) : 6 réussis, 1 échec**, sur ce test précisément. Attente du test adaptée par le coordinateur à 05 h 29 : 39 réussis, 0 échec sur les 5 fichiers liés |
| Sonde du relecteur du lot H-serveur, vision libre pendant les questions | hors dépôt, simulation | deux lots sourcés pendant une question en cours ; question servie sans attente pendant qu’un lot est bloqué |
| Reprise S3 : séquence jouée une fois sur le vrai magasin de session, en dossier temporaire | simulation | registre tronqué, activation, fin, ouverture d’une archive saine, tic : archive identique octet pour octet, registre tronqué intact |
| Scénario « vue Surveillance aux flèches » du parcours du panneau (ticket 07) | navigateur de bureau sur copie temporaire | réussi : activer avec un exemple, durée 8, 14 ou 20, alertes, historique paginé, détails d’une vérification, d’un signalement et d’une indéterminée, « Questionner ce moment », Retour par niveaux, arrêter. Le dernier scénario active puis arrête la surveillance contre le vrai serveur de l’arbre |
| Parcours Electron définitif (ticket 08) | Electron réel à fournisseurs simulés | activation répondue « restauration » puis « écoute » ; aucune interruption par une question ; avis quand l’historique n’est pas enregistré |
| Cinq parcours « question pendant une surveillance active » | fournisseur réel sur ce Mac avec perception simulée par des textes écrits | détail ci-dessous |
| Relecteurs indépendants | — | lot S : « fail », trois défauts majeurs, corrigés ; reprise S2 : « fail », un défaut majeur, corrigé ; **reprise S3 : « fail »**, un défaut corrigé, un test dont l’attente a été adaptée |

**Reprise S3, verdict « fail » (05 h 18).** Elle ajoute un état d’activité « restauration du suivi enregistré » tant que le registre n’est pas relu, et dit toujours comment le registre est tenu (prêt, en mémoire seulement, illisible, écriture en échec), sans jamais proposer de le supprimer. Le relecteur a trouvé deux défauts bloquants :

- **Un test rouge.** L’activation répond « restauration » même pour une session neuve, dont le dossier est vide. Le test de l’hôte Mac qui attend « écoute » échoue donc, de façon déterministe.
- **Un défaut réel, non déclaré par l’implémenteur.** Après un dossier lent ou une erreur de lecture passagère, puis une fin de session et la réouverture de l’archive, l’archive était affichée en entier mais annoncée « registre illisible », ce qui était faux ; et rien n’était plus écrit pour elle jusqu’à la fin du processus. Aucun test ne jouait cette séquence.

**Correction de 05 h 28.**

- Le défaut réel est reproduit avec la sonde du relecteur, puis corrigé : l’archive rouverte est de nouveau annoncée prête et la surveillance y est enregistrée. Un test ajouté le couvre. En vérifiant, le correcteur a trouvé un trou voisin, antérieur au lot : un registre qui ne se restaurait qu’à moitié pouvait être réécrit par-dessus le fichier. Il est fermé ; une telle archive s’ouvre désormais sans historique de surveillance, et sans avertissement à l’ouverture.
- **Le test rouge n’était pas un défaut du produit, d’après le coordinateur.** À 05 h 29, il a acté ce changement de contrat et adapté l’attente du test, sans modifier les hôtes pour masquer cet état : restauration immédiate, sans numéro d’activation, puis « écoute » dans un délai borné.

**Cette correction n’a pas eu de relecteur dédié.** Le relecteur de S3 a rendu son verdict à 05 h 18, avant elle ; aucun compte rendu de relecture ne la suit (`lot-S3-fix.json` est le compte rendu du correcteur). Ce qui la couvre :

- le test ajouté, que trois mutations sur copie hors dépôt font échouer chacune (13 réussis sur 14) ;
- la suite finale sur l’arbre figé et le contrôle de la supervision (section 1) ;
- le parcours Electron définitif, qui confirme par le vrai pont l’enchaînement « restauration » puis « écoute », et l’avis « suivi non enregistré » (`electron/definitif-essai-2-pass.txt`) ;
- les cinq parcours réels : sur le vrai hôte serveur, l’activation répond « restauration » 5 à 7 ms après le début, la lecture commence au premier passage, 12 à 15 ms après le début, et le registre finit prêt et enregistré.

Conséquence visible possible, non mesurée sur un vrai client : « Restauration du suivi enregistré… » affiché un court instant à la première activation, même quand il n’y a rien à restaurer.

**Passe réelle (06 h 01 à 07 h 01).** `scripts/probe-surveillance.cjs` n’a pas été exécuté. À sa place, sept parcours ont tourné avec `scripts/probe-overlap-live.cjs` : cinq avec surveillance, deux sans (option `--chat-only`).

- **Nature exacte.** Codex réel sur ce Mac, déjà authentifié, web ouvert, par la vraie composition de l’hôte serveur (session, file des questions, surveillance). **La perception est simulée** : quatre textes écrits remis comme paroles. Ce sont la hauteur de la tour Eiffel, un leurre (l’annonce d’une publicité), la distance de la Terre à la Lune, et une altitude du mont Blanc volontairement fausse. Ni capture, ni Whisper, ni vision. Un parcours par mesure, sans mesure de variabilité : ce n’est pas un banc de concurrence.
- **Consigne** : « Vérifie les chiffres annoncés. » **Question** des quatre premiers parcours : « En deux phrases : de quoi vient-on de parler, et quelle hauteur a été donnée pour la tour Eiffel ? » Le cinquième demande explicitement une vérification sur le web.

| Parcours | Début | Détectées | Sourcées | Indéterminées | Lectures | Lots | Recherches web | Affirmation → résultat, moyenne et pire |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 06 h 01 | 3 | 2 | 1 (tour Eiffel) | 5 | 2 | 5 | 33,9 s et 41,3 s |
| 2 | 06 h 02 | 3 | 2 | 1 (tour Eiffel) | 5 | 2 | 5 | 34,3 s et 41,6 s |
| 3, après correction du comptage des pages | 06 h 06 | 3 | 2 | 1 (Lune) | 4 | 2 | 5 | 27,1 s et 32,9 s |
| 4, après la ligne de portée | 06 h 59 | 3 | 3 | 0 | 3 | 2 | 4 | 26,9 s et 32,3 s |
| 5, vérification explicite demandée au chat | 07 h 00 | 3 | 3 | 0 | 5 | 2 | 4 | 39,7 s et 49,8 s |

Sorties : `reel/chevauchement-reel-1.json` à `-5-verification-explicite.json`.

- **Pertes.** Aucune dans les cinq parcours : 4 passages lus sur 4, 0 lecture en échec, 0 lot en échec, 0 délai dépassé, 0 élément rejeté. Les trois affirmations indéterminées restent dans l’historique avec leur raison, « sources non confirmées ».
- **Leurre et affirmation fausse.** Le leurre est laissé 5 fois sur 5. Le mont Blanc à 5 200 mètres est contredit 5 fois sur 5, source IGN.
- **Chevauchement.** Dans les cinq parcours, la surveillance a travaillé pendant que la question tournait. Les délais du chat sont en section 4.6.
- **Défaut trouvé et corrigé.** Dans les parcours 1 et 2, l’affirmation exacte sur la tour Eiffel finissait indéterminée, alors que le chat obtenait la même source. Deux tours de diagnostic l’ont expliqué : c’était un faux négatif de notre comptage des pages ouvertes (ticket 04). Après correction, elle est sourcée.
- **Résidu non élucidé.** Dans le parcours 3, c’est l’affirmation sur la Lune qui reste indéterminée. Soit le modèle a cité une page qu’il n’a pas ouverte, et la règle stricte joue son rôle ; soit une autre forme d’ouverture n’est pas reconnue. Non diagnostiqué.
- **Ce que cela ne dit pas.** La qualité de la détection sur une vraie émission, sur des paroles transcrites, sur un passage qui porte un nombre sans être une affirmation, sur une consigne de signalement. Le leurre de l’essai ne contenait aucun nombre.

**Limites.**

- **La surveillance n’a jamais lu une vraie émission.** Hors les cinq parcours réels, tout est prouvé par simulation. La consommation du quota Codex partagé avec le chat n’est pas mesurée au-delà du décompte de la section 5.
- La surveillance ne promet pas de détecter toute affirmation du programme. Elle promet de suivre celles qu’elle a détectées.
- Le dédoublonnage strict crée une vérification de plus quand le détecteur reformule. Surcoût non mesuré.
- Registre plein (600 affirmations par défaut) : la lecture s’arrête pour la session, l’état le dit, rien n’est purgé.
- Un passage abandonné pendant une panne est relu une fois quand la lecture se rétablit ; s’il échoue encore, il reste compté. Le rétablissement n’est constaté qu’à la lecture d’un nouveau passage.
- Un registre illisible n’est jamais remplacé : la surveillance tourne alors en mémoire et le dit, mais ses nouvelles activations ne survivent pas à un redémarrage.
- Une archive dont le registre est illisible s’ouvre sans historique de surveillance et sans avertissement ; l’illisibilité n’est dite qu’à l’activation suivante.
- Sur l’hôte serveur, la réouverture d’une archive ne compare pas l’identifiant de session du registre à celui de l’archive, contrairement à l’hôte Mac. Constat du correcteur de S3, hors de son lot ; aucune donnée n’est touchée. Non repris.
- Sur l’hôte Mac, le chevauchement prouvé est une vérification en vol qui aboutit pendant une question. La lecture de nouveaux passages pendant une question n’y est pas prouvée, la perception simulée s’arrêtant pendant une question.

**Réglages réversibles.** `TVLENS_SURVEILLANCE_WORKERS` : 1 à 3 postes de vérification, 1 par défaut.

### Ticket 06 — Résultats regroupés, historique, style bref

**État : partiel.** Regroupement, états et filtre de l’overlay livrés, prouvés par simulation. Style observé sur huit cartes réelles : petit échantillon, textes fournis. Overlay et historique de la TV : prouvés dans un navigateur de bureau sur copie temporaire ; natif sur la TV : NON EXÉCUTÉ.

**Pour le spectateur.** Plusieurs affirmations vérifiées ensemble donnent **une** carte, deux ou trois phrases au plus, avec ses sources. La carte dit « Concorde avec les sources », « Contredit par les sources » ou « Sources partagées », jamais vrai ou faux. Seuls les résultats sourcés ont une carte. Une affirmation non vérifiable, en attente, en erreur ou annulée reste dans l’historique, avec son passage d’origine. L’absence de carte ne veut pas dire que l’affirmation a été vérifiée.

Un **signalement** est autre chose : la consigne demandait de prévenir ou de suivre un sujet, pas de vérifier. Sa carte s’intitule « Repéré dans la vidéo », porte son intervalle et sa citation, et n’a aucune source web. Elle ne paraît que dans le panneau et l’historique. **Elle n’entre jamais dans l’affichage en bas à gauche, ni sur Mac ni sur TV, et aucun réglage ne le permet.**

Sur Mac, les cartes sourcées s’empilent en bas à gauche, 14 secondes par défaut (8, 14 ou 20 au choix), sans prendre le focus. Dans la barre flottante repliée, la carte tient en une ligne.

**Ce qui change dans le code.** `core/surveillance.cjs` (lots `kind:'verification'` et `kind:'signal'`, `composeLotText` : trois phrases et 420 caractères au plus, sans adresse ni Markdown, texte de repli déterministe sinon) ; `app/ui/surveillance-view.mjs`, `app/ui/card-queue.mjs` (la file refuse toute carte qui n’est pas une vérification) ; `tv/app/surveillance-overlay.js`. Finitions du Mac : les pluriels sont accordés, et seulement dans les neuf phrases connues du cœur ; un texte rédigé par l’agent est laissé tel qu’il est écrit.

**Preuves exécutées.**

| Preuve | Niveau | Résultat |
| --- | --- | --- |
| `tests/surveillance.test.cjs` | simulation | un lot terminé donne au plus une carte, limitée aux affirmations dont la page citée a vraiment été ouverte ; un signalement n’est jamais une vérification web ni une carte d’overlay ; un résumé contenant un verdict binaire ou une adresse nue est remplacé par le texte de repli |
| `tests/surveillance-runtime.test.cjs` | simulation, vrai client sur simulateur | un lot ne crédite que les pages ouvertes par son propre tour ; un lot abandonné ne transmet ni son fil ni ses pages au suivant |
| `tests/mac-ui.test.cjs` | tests hors ligne, modèles de vue | 14 réussis après les finitions du Mac. Une carte par lot sourcé, signalement dessiné à part, indéterminés dans l’historique seulement |
| `tests/tv-overlay-queue.test.cjs` | tests hors ligne, file de cartes de la TV | 23 réussis à 06 h 53 ; cas de file partagés avec la file native |
| Contrôles DOM dans Chrome sans fenêtre, pont factice | navigateur de bureau, hors dépôt | 35 et 71 contrôles réussis d’après le correcteur du lot. Ce n’est pas Electron |
| Parcours du panneau TV, scénarios de la carte et du registre restauré (ticket 07) | navigateur de bureau sur copie temporaire | réussis : carte sourcée hors de la vidéo, masquée pendant une bascule de disposition et sous un dialogue, disparue à 14 s sans le serveur, aucun signalement affiché, aucun focus pris ; aucune carte quand l’image occupe son emplacement ; historique restauré ni affiché ni compté, résultat suivant affiché |
| Page ambiante (ticket 07) | navigateur de bureau sur copie temporaire | 17 vérifications sur 17 : un signalement ou une carte sans source ferme la page sans rien peindre |
| Parcours Electron définitif (ticket 08) | Electron réel, agent simulé | signalement dans le panneau et l’historique seulement ; carte sourcée en bas à gauche et dans la barre repliée. Les sources y sont marquées « Source simulée — aucune page réelle consultée » |
| Sorties des cinq parcours réels, relues par le coordinateur | fournisseur réel sur ce Mac avec perception simulée par des textes écrits | détail ci-dessous |

**Sorties réelles relues pour le style, les sources et les doublons (07 h 13).** Matière : les cinq parcours du ticket 05. Petit échantillon : 15 affirmations, 8 cartes, 7 réponses de chat. La relecture est celle du coordinateur, pas d’un relecteur indépendant.

- **Style des cartes.** Une à deux phrases chacune, en français courant, sans adresse dans le texte, sans verdict sec. Les sources sont données à part : `toureiffel.paris`, `spaceplace.nasa.gov`, `ign.fr`. Exemple réel : « Le site officiel de la tour Eiffel confirme une hauteur de 330 mètres, antenne comprise. Cette hauteur a été atteinte le 15 mars 2022 ; le guide cité n’est toutefois pas identifié. »
- **Regroupement.** Deux affirmations vérifiées dans un même lot donnent une seule carte, à deux sources, dans les parcours 1, 2, 4 et 5. Dans le parcours 3, une seule des deux est sourcée : la carte ne porte qu’elle, avec le texte de repli.
- **Doublons.** Aucun dans le registre ni dans les cartes : trois affirmations distinctes par parcours. Dans quatre parcours sur cinq, le détecteur a reproposé deux affirmations déjà enregistrées ; le cœur les a reconnues et ne les a pas comptées deux fois.
- **Aucun signalement** n’a été émis : la consigne ne demandait que des vérifications.
- **Défaut de cohérence observé, non corrigé.** Une affirmation classée « indéterminée » garde dans le registre une conclusion rédigée comme une confirmation (« Les sources officielles confirment… »). Elle n’est jamais montrée dans l’overlay, mais elle est lisible dans l’historique à côté de l’état « indéterminée ».
- **Chat.** Sept réponses réelles relues, cinq sous surveillance et deux sans. Six font deux phrases avec deux citations vidéo ; les trois premières y ajoutent une source web. La septième, la vérification explicite du parcours 5, répond depuis le web : aucune citation vidéo, une source, et un lien Markdown brut dans le texte. Le cœur retire désormais l’adresse et garde les mots. Le journal résumait ces sept réponses d’une seule formule ; ce décompte suit les fichiers `reel/*.json`.
- Pendant la sonde de cloisonnement, quatre autres sorties réelles avaient été lues : deux réponses de chat et deux conclusions de vérificateur, deux phrases chacune, en français, texte brut.

**Limites.**

- « Deux ou trois phrases naturelles » est tenu par une borne technique et un repli. Sur huit cartes réelles, on observe une à deux phrases : trop peu pour conclure, et sur des textes écrits pour l’essai.
- Le style du chat est jugé sur neuf réponses réelles au total. La ligne de portée du ticket 05 n’a que deux parcours réels derrière elle. `TVLENS_COMPANION_PROMPT=legacy` rend l’ancienne consigne.
- Le filtre de verdict est une liste fermée de mots français. Il refuse aussi des formulations légitimes (« le vrai chiffre »), d’où un repli plus fréquent ; il laisse passer « le chiffre cité est juste ».
- Le découpage en phrases est heuristique.
- La pastille de l’onglet Mac compte ensemble résultats sourcés et signalements.
- Sur Mac, un lot sourcé terminé moins de 60 s avant un redémarrage peut reparaître une fois en carte après la restauration. Limite déclarée par le lot des finitions.

### Ticket 07 — Overlay TV discret en bas à gauche

**État : incomplet — validation native non exécutée.** Natif sur la TV : NON EXÉCUTÉ.

Le besoin est un affichage en bas à gauche qui n’impose pas d’ouvrir le panneau, pendant tout le visionnage. Sur la TV, rien ne tourne en JavaScript panneau fermé, et la capture photographie l’écran composé. Il a donc fallu un chemin natif.

**Ce qui est écrit.**

- **Panneau fermé (mode ambiant).** Un superviseur natif (`tv/ambient.py`) interroge `GET /v1/surveillance/overlay`, décide quand afficher, et lance une application minuscule (`tv/app/ambient.html`) qui dessine une carte puis se ferme. Trois profils : `off`, `relay`, `passthrough`.
- **Touches.** En profil `relay`, la première touche ferme la carte puis part vers YouTube (`prototypes/lg-remote/runtime/ambient_relay.py`).
- **Capture.** Une porte d’affichage fait recadrer ou retenir les images pendant qu’une carte est à l’écran, pour que la surveillance ne relise pas son propre texte. Toute image recadrée ou retenue est déclarée au serveur, qui l’écrit dans l’incertitude du passage.
- **Panneau ouvert.** Carte hors du rectangle vidéo, vue Surveillance à la télécommande, 14 secondes par défaut (8, 14 ou 20), sources en texte seul.
- **Durée.** Plafond de capture porté de 30 minutes à 6 heures, arrêt après 10 minutes sans lecture, toute fin de capture visible.

**Le profil livré est `focus: "off"`.** Avec lui, rien ne s’affiche panneau fermé sur la TV et rien ne change à la télécommande. Les profils `relay` et `passthrough` sont expérimentaux : ils ne s’activent que par configuration explicite, après le protocole natif de [LG : alertes panneau fermé](lg-ambient.md). **Avec le réglage livré, le besoin n’est donc pas rendu sur la TV.** Le dépôt ne prouve aucune impossibilité matérielle : il constate une absence d’essai.

Le détail, les profils, les routes locales, la sûreté des touches et le protocole sont dans [LG : alertes panneau fermé](lg-ambient.md).

**Preuves, par niveau.**

*Simulation ou tests hors ligne.*

| Preuve | Résultat | Sortie |
| --- | --- | --- |
| Tests Python de la TV sur l’arbre figé : `tests/test_tv_control.py`, `tests/test_tv_ambient.py`, `tests/test_tv_capture_gate.py` | 83 tests dont 1 sauté (un scénario au rythme réel), 0 échec. Par fichier, au relevé du lot à 06 h 20 : contrôle 9, ambiant 55, capture 19 | `suite-python-finale.txt`, `tv/01-python-tests-tv.txt` |
| Prototypes sur l’arbre figé : `prototypes/lg-remote/test_panel.py`, `test_ambient_relay.py`, `test_control.py` | 15, 17 et 1, 0 échec | `suite-python-finale.txt` |
| Tests Node de la TV : `tv-overlay-queue`, `tv-panel`, `tv-ambient-params`, `tv-app-compat`, `chat-error-ui` | 60 sur 60 à 06 h 53 (23, 19, 6, 5, 7). Ils font partie des 473 de la suite finale | `tv/12-fix-node-tests-tv.txt` |
| Contrôle de la supervision | Python : code de sortie 0, services de l’appareil simulés | `supervisor-final-python.*` |
| Analyse syntaxique sous Python 3.9.6 et 3.11.14 | 10 fichiers sous chaque version. Le lot a lancé ses tests sous Python 3.14.2 ; la version 3.10 de la TV est absente du Mac | `tv/03-python-parse-3.9-3.11.txt` |
| Déclaration des images masquées, côté serveur : `tests/session-durable.test.cjs`, `tests/server-ingest-path.test.cjs` | réussis. Ce format n’a pas été éprouvé avec la vraie capture TV | suite finale |

*Navigateur de bureau sur copie temporaire.* Chrome 155 de bureau, sans fenêtre, copie temporaire sans `connection.js`. Les dossiers temporaires et de sortie sont passés en paramètres.

| Commande | Heure | Résultat | Sortie |
| --- | --- | --- | --- |
| `node scripts/smoke-tv-overlay.mjs` (panneau) | 07 h 08, arbre figé | 10 scénarios sur 10. Le dernier parle au vrai serveur de l’arbre, sur port éphémère, avec un agent scripté | `tv/final-smoke-tv-overlay.txt` |
| `node scripts/smoke-tv-ambient.mjs` (page ambiante) | 06 h 55 | 17 vérifications sur 17 : rien de peint avant l’accord du contrôleur, aucun élément focalisable, fermeture à la première touche, à l’échéance et page cachée | `tv/final-smoke-tv-ambient.txt` |
| `node scripts/smoke-lg-ui.mjs` (panneau LG) | 06 h 55 | réussi : appairage, capture, focus, écho immédiat, Retour, dictée | `tv/final-smoke-lg-ui.txt` |
| `node scripts/smoke-tv-timeline.mjs` (frise) | 06 h 56 | réussi : disposition, vignettes, détails, question ciblée, fin de session qui archive | `tv/final-smoke-tv-timeline.txt` |
| `node scripts/simulate-tv-ambient.mjs --only off,relay` | 06 h 57 | 2 passes sur 2 : vrais `tv/controller.py` et `tv/ambient.py` sur port éphémère, faux Luna, faux serveur | `tv/final-simulate-tv-ambient.txt` |

Les dix scénarios du panneau : revalidation et bandeau de stockage ; serveur ancien ; carte sourcée ; rectangle vidéo ; registre restauré ; vue Surveillance aux flèches ; contrôleur ancien ; question longue ; sessions aux flèches ; vrai serveur de l’arbre. Les quatre parcours de 06 h 55 à 06 h 57 précèdent le gel. Un fichier TV a changé après eux : `tv/app/companion.js`, à 06 h 57, pour le libellé « vidéo illisible ». Les parcours du panneau LG et de la frise n’ont pas été rejoués sur cette version ; le parcours du panneau de 07 h 08, sur l’arbre figé, la charge.

*Natif sur la TV.* **NON EXÉCUTÉ.** Cette session n’a envoyé aucune commande à la TV. Aucune phase du protocole natif n’a été passée, par personne. Hors de cette session, la supervision a installé à 07 h 29 le panneau, le contrôleur et l’application ambiante, profil `off`, état « stopped » (section 13) : c’est une installation, pas une validation.

**Verdicts des relecteurs.**

| Lot | Verdict | Suite |
| --- | --- | --- |
| TV natif | **fail** : la déclaration « déjà vu par le panneau » survivait à la session et effaçait en silence les premiers résultats de la suivante (reproduit) | corrigé par son propriétaire, puis complété par le lot final : la déclaration porte l’identifiant de session |
| TV application, page ambiante | pass, quatre constats mineurs | — |
| TV application, panneau | pass, cinq constats mineurs | — |
| Lot TV final (FIN-TV) | **fail** : la pastille pouvait afficher « Vérifications en retard · 0 en attente » | corrigé à 06 h 53 : une seule vérification en retard se dit « Vérification en cours · en retard ». Cette correction n’a pas eu de relecteur dédié ; le correcteur a relancé la sonde du relecteur |

Le lot final a aussi livré : la fermeture redemandée et bornée de la page ambiante ; la page de sonde qui reçoit les deux évènements de lancement ; un sondage qui ne reste plus sur l’état complet après une erreur passagère, et qui recule pendant une panne ; les libellés d’activité et les pluriels ; le libellé « vidéo illisible ».

**Trois constats mineurs du relecteur du lot final restent ouverts** (`lot-FIN-TV-verify.json`) :

- en profil `off`, le compteur des résultats non montrés peut surcompter : jamais d’omission, mais une carte lue par le superviseur avant que le panneau la déclare reste comptée ;
- quand le panneau active lui-même la surveillance, le compteur de l’en-tête peut annoncer un historique restauré comme des nouveautés. La file de cartes, elle, est correcte ;
- dans la file native, la règle « historique restauré » ne joue que si une lecture du superviseur tombe pendant la restauration, ce qui est rare ; c’est alors la règle « première lecture de session » qui protège.

**Limites.**

- Rien de ce chemin n’est validé sur la TV : ni le focus, ni le retour des touches à YouTube, ni la continuité du son, ni le recadrage des images pendant une carte, ni la lisibilité des textes avec la police de la TV. Deux points ont un début de fait depuis l’installation, lu et non revérifié : l’application ambiante est enregistrée par webOS, et la capture lit la porte d’affichage. Aucune image n’y est recadrée ni retenue, puisqu’aucune carte ne s’affiche en profil `off`.
- Les briques existantes ne garantissent ni la première touche ni les touches globales.
- Aucune garantie n’est écrite pour le pointeur : pendant une carte, il pourrait ne pas piloter YouTube.
- Une conception préalable a été critiquée par un relecteur chargé de la réfuter : un défaut critique et cinq majeurs, tous de conception, corrigés avant le code.
- Le modèle de perception n’est pas informé qu’une image est recadrée ; seule une mention fixe le dit. Les preuves données au chat ne portent pas cette mention.
- Un contrôleur de version antérieure répond 404 à la nouvelle route de déclaration ; le panneau cesse alors de lui parler jusqu’à sa prochaine lecture. Aucun repli vers l’ancienne route, volontairement.
- En disposition frise, la pastille fait 296 px et son libellé y reste coupé, comme avant.
- Quatre constats mineurs des premiers relecteurs ne sont pas repris ; ils sont listés dans `lot-FIN-TV-impl.json`.

**Réglages réversibles.** `ambient.json` sur la TV (profil, repli), `ambient-settings.json` (alertes, durée, activité, position). Défaut : profil `off`.

### Ticket 08 — Vérification proportionnée et livraison

**État : non clos.** La passe finale est faite hors ligne et sur ce Mac. Le flux TV/VPS temporaire n’a pas été exécuté par cette session. La supervision a fait autre chose, après la rédaction : une installation sur le VPS et la TV, suivie d’essais réels (section 13). La production a donc changé, et le serveur installé a planté deux fois.

**Ce qui a été fait.**

- Chaque lot a eu un propriétaire de fichiers et un relecteur indépendant chargé de le réfuter. Les verdicts « fail » ont donné lieu à une reprise.
- Les tests ont été lancés par lot, sur les fichiers ciblés. La suite complète a tourné sur l’arbre figé (section 1), puis une seconde fois, indépendamment, par la supervision, qui n’a modifié aucun fichier du produit. Elle a tourné une troisième fois à 07 h 55, après les correctifs de l’incident du serveur : 474 tests Node, 0 échec, 15,9 s ; Python 84 dont 1 sauté, puis 15, 17 et 1, 0 échec (`suite-node-apres-incident.txt`, `suite-python-apres-incident.txt`). L’arbre a encore bougé après ce troisième passage (section 13).
- Le parcours Electron réel a été lancé huit fois (ci-dessous).
- Ce document, les huit tickets et les guides ont été mis à jour.

**Suites préliminaires, avant le gel.** 06 h 37 : 467 tests, 0 échec. 06 h 53 : 472 tests, 0 échec. Sorties : `suite-node-preliminaire-0637.txt`, `-0653.txt`.

**Contrôles ciblés relancés après les dernières corrections.** Ces totaux viennent du journal du coordinateur ; ils n’ont pas de fichier de sortie propre. La suite finale les recouvre tous.

| Correction | Fichiers relancés | Total |
| --- | --- | --- |
| Refus étendu à une réponse d’ouverture de fil incomplète (06 h 02) | 13 fichiers du cloisonnement | 115 réussis, 0 échec |
| Comptage des pages ouvertes (vers 06 h 05) | 9 fichiers liés, dont `tests/opened-pages.test.cjs` | 90 réussis, 0 échec |
| Accord des pluriels et avis « suivi non enregistré » (06 h 30) | `tests/mac-ui.test.cjs`, `mac-ipc-contract`, `chat-error-ui` | 28 réussis, 0 échec |
| Route overlay qui publie `registry` | test du serveur étendu | 10 réussis |
| Clip sans image (06 h 36 à 06 h 52) | `tests/clip-unreadable.test.cjs` | 5 réussis, 0 échec |
| Phrase du cœur « Vérification en cours : elle a pris du retard. » (vers 06 h 55) | tests liés | 89 réussis, 0 échec |
| Ligne de portée de la consigne, lien Markdown retiré (vers 07 h 00) | `tests/codex-confinement.test.cjs`, `tests/chat-instruction.test.cjs` étendus | total non relevé à part |

**Parcours Electron réel.** Vrai Electron 44.4.5 piloté par playwright-core 1.63.0 (Node 24.12.0), vrai processus principal, vrai pont IPC, vraie fenêtre. Fournisseurs simulés (`--smoke-test`) : perception, chat, vérificateur, surveillance et inspecteur de réexamen sont factices. Capture d’une vidéo de démonstration synthétique. Données utilisateur dans un dossier temporaire ; l’application installée n’est pas touchée. Script : `scripts/smoke-electron.mjs`.

| Lancement | Heure | Arbre | Résultat | Sortie |
| --- | --- | --- | --- | --- |
| Intermédiaire 1 | 04 h 30 | copie de 90 fichiers, non finale | **échec du script** : un sélecteur placé dans un bloc de réglages replié | `electron/intermediaire-1-run1-echec.txt` |
| Intermédiaire 2 | 04 h 30 | même copie | réussite, 72 s d’après le journal | `electron/intermediaire-1-run2-pass.txt` |
| Essai 1 | vers 06 h 25 | copie de 90 fichiers, avant le gel | **échec** : le premier passage ne se relit pas | `electron/final-essai-1-echec-relecture.txt` |
| Essai 2, avec diagnostic | vers 06 h 30 | même copie | **échec** au même endroit : fichier de 110 octets | `electron/final-essai-2-echec-diagnostic.txt` |
| Essai 3 | vers 06 h 32 | même copie | réussite | `electron/final-essai-3-pass-avant-gel.txt` |
| Essai 4, cas du clip sans image reproduit exprès | 06 h 49 | après correction, avant le gel | réussite | `electron/final-essai-4-pass-passage-sans-image-avant-gel.txt` |
| **Définitif 1** | 07 h 08 | **copie figée** | **échec du script**, pas du produit : il lisait le son du premier passage, qui cette fois n’en avait pas, et l’état le disait | `electron/definitif-essai-1-echec-script-audio-premier-passage.txt` |
| **Définitif 2** | 07 h 09 | **copie figée**, script corrigé | **réussite** du parcours et du stockage bloqué | `electron/definitif-essai-2-pass.txt` |

Soit huit lancements : quatre réussites, quatre échecs. Deux échecs viennent du script. Deux viennent du défaut produit du clip sans image, corrigé depuis (ticket 02).

**Parcours définitif.** Copie figée des 91 fichiers de `app`, `core`, `adapters`, `runtime` et `mcp`, empreinte `0fec27b27bac84b19666f03fc9ce55570c45af4c9a1c3f26f491c1d6bcabecdd` (`electron/definitif-freeze.json`). Le script est le seul fichier modifié entre le gel et ce parcours ; il est hors de ces 91 fichiers, et son empreinte d’avant et d’après est dans le même fichier. Le parcours n’a pas été rejoué après les correctifs de l’incident du serveur. Ceux-ci ne touchent aucun de ces 91 fichiers : à 08 h 01, aucun fichier de ces cinq dossiers ne porte une date de modification postérieure au parcours. Durée du parcours : non relevée dans la sortie ; la capture y dure 55,1 s.

Ce que le lancement réussi établit : 25 passages capturés, audio en WAV 16 kHz, relecture WebM par le protocole à plages ; réponse citée ; vérification, succès et erreur simulés ; fraîcheur courte ; surveillance « restauration puis écoute », signalement dans le panneau et l’historique seulement, carte sourcée en bas à gauche et dans la barre repliée, aucune interruption par une question, avis quand l’historique n’est pas enregistré ; sessions (archivage, ouverture en lecture seule avec sa propre conservation, reprise explicite, suppression d’une seule session) ; puis second lancement avec un plancher disque inatteignable. Pour le passage sans image, reproduit exprès : fichier de 110 octets conservé, passage analysé, dit « vidéo illisible », aucune relecture proposée.

Ce qu’il n’établit pas : la latence et la qualité, les modèles étant simulés ; la capture d’une vraie application ; le réexamen d’un passage illisible, l’inspecteur étant factice ; le cas « premier passage sans son » du premier lancement définitif, qui n’a pas été rejoué.

Captures gardées : `captures/electron-definitif/` (17 fichiers, dont 16 images) et `captures/tv-simulee/`. Deux images ont été relues à l’œil par le coordinateur.

**Ce qui n’a pas été fait.** Le critère « un flux TV/VPS temporaire borné » n’est **pas** tenu : cette session n’a eu aucun accès au VPS ni à la TV (section 5). Les essais réels de la supervision ne le remplacent pas. Ils ne sont pas temporaires, puisque l’installation a remplacé la version en service. Ils ne couvrent ni une question de cinq minutes, ni la réouverture d’une archive, ni une suppression, ni des sources. Et leurs preuves ne sont pas revérifiées ici.

Le critère « production inchangée, aucun push/deploy » n’est **pas** tenu non plus : la production a changé, par la supervision et avec l’autorisation de Dabi. La case correspondante du ticket est vide.

## 4. Mesures avant/après

Chaque mesure porte sa nature. **Aucune mesure de cette session ne porte sur Whisper, le réseau ou le processeur de la TV.** Seule la section 4.6 mesure Codex, sur sept parcours. La section 4.8 reprend les mesures d’une autre session. Les relevés ont été faits sur un Mac chargé.

### 4.1 Client TV : octets et délai perçu — banc synthétique

Avec la conservation durable, l’état complet d’une session grossit sans borne, et la TV le téléchargeait en entier chaque seconde. Le serveur expose maintenant des vues légères et une revalidation.

Nature : `scripts/bench-perceived.cjs`. Vrai serveur HTTP en boucle locale, vrai client TV, session **synthétique**, six questions, agent de chat **simulé** à délais fixes (1,6 s par question). Ni réseau, ni webOS, ni fournisseur. « Avant » est la copie figée de la baseline, « après » l’arbre courant ; même script, mêmes tailles. Relevés de 06 h 39 et 06 h 43, une exécution par arbre. **Non rejoué après le gel de 07 h 07.** Charge de la machine : moyennes de 2,3, 2,6 et 2,7 pour « avant », de 3,0, 2,7 et 2,7 pour « après », sur 10 cœurs.

Octets par interrogation (`bench-perceived-avant.json`, `-apres.json`) :

| Session | Arbre | État complet | Vue `panel` | Vue `chat` | Réponse 304 | Overlay ambiant |
| --- | --- | --- | --- | --- | --- | --- |
| 10 min, 75 passages | avant | 222 766 o | absente | absente | absente | absent |
| 10 min, 75 passages | après | 232 978 o | 37 584 o | 9 678 o | 0 o | 453 o |
| 2 h, 900 passages | avant | 2 452 756 o | absente | absente | absente | absent |
| 2 h, 900 passages | après | 2 637 793 o | 85 644 o | 9 684 o | 0 o | 454 o |

Un premier relevé, à 03 h 29, donnait les mêmes ordres de grandeur ; le relecteur du lot serveur l’avait reproduit à quelques octets près.

Délai perçu par le client, en moyenne sur six questions (`bench-perceived-comparatif.json`) :

| Session | Arbre et boucle de sondage | Carte | Premier texte | Fin | Octets par question | Au repos, en 10 s |
| --- | --- | --- | --- | --- | --- | --- |
| 10 min | avant, état complet chaque seconde | 623 ms | 783 ms | 1 968 ms | 526 730 o | 2 397 260 o |
| 10 min | après, boucle du panneau | 9 ms | 770 ms | 1 784 ms | 134 024 o | 0 o |
| 2 h | avant, état complet chaque seconde | 661 ms | 1 169 ms | 2 039 ms | 5 730 100 o | 22 228 173 o |
| 2 h | après, boucle du panneau | 36 ms | 800 ms | 1 821 ms | 270 536 o | 0 o |

La ligne « après » utilise la politique de sondage, la fusion des vues et la revalidation du client TV de l’arbre, exécutées dans Node. Ce n’est pas le rendu du panneau sur webOS.

À lire ainsi :

- C’est un **gain de cadence et de transport côté client, sur banc synthétique**. Ce n’est **ni une baisse du temps du modèle, ni une mesure sur la TV**. Sur les 1,8 à 2,0 s de la colonne « Fin », 1,6 s sont le délai fixe du faux agent.
- L’état complet est **plus lourd** qu’avant, tous les passages restant en mémoire. Un client TV non mis à jour télécharge donc davantage : avec l’ancienne boucle sur le nouvel arbre, 550 982 o par question au lieu de 526 730 à 10 minutes, et 6 162 393 o au lieu de 5 730 100 à 2 heures.
- La vue `chat` est bornée. La vue `panel` ne l’est pas strictement : elle grossit avec la frise.
- Tant que rien n’est publié, la réponse est un 304 sans corps. Les champs dérivés du temps vieillissent alors côté client ; c’est pourquoi le client extrapole l’heure du serveur.

**Calcul local du serveur : inchangé.** Nature : banc hors ligne, dos à dos, cette machine (`bench-backend-avant.json`, `-apres.json`, 06 h 33). À 2 heures, 900 passages : lecture de l’état 1,97 puis 1,94 ms ; outils de question 2,85 puis 2,89 ms ; état complet du cœur 2 441 253 puis 2 441 329 octets. Charge : 2,47, 2,79 et 2,83 puis 2,43, 2,77 et 2,82. Aucun gain ni régression de calcul local.

### 4.2 Taille de l’état de session — fichiers synthétiques

Nature : mesure du cœur seul, lot B, passages synthétiques. Rejouée à 675 passages par le relecteur, mêmes ordres de grandeur.

| Passages | Avant | Après |
| --- | --- | --- |
| 675 (90 min), état sérialisé | 1 040 450 o | 951 966 o |
| 675, `snapshot()` | 0,209 ms | 0,347 ms |
| 1 350, état sérialisé | 2 089 793 o | 1 907 484 o |

Lister 675 passages archivés prend 2,0 ms, les rouvrir 8,3 ms, sur disque temporaire avec des médias synthétiques de 2 Ko. Ces chiffres comptent des fichiers et du temps de calcul, pas le poids réel des médias.

### 4.3 État interrogé de la surveillance — mesure synthétique

Nature : jeu de données construit, cinq cartes de trois sources, affirmations de 275 à 277 caractères. L’état compact passe de 16 893 à 10 891 octets après allègement des cartes. Ce n’est pas une borne : rien ne plafonne cet état en octets.

### 4.4 Orchestration et vision pendant une question — temps virtuel

Nature : simulation déterministe en temps virtuel (`scripts/simulate-stream.cjs`), fournisseurs **modélisés**, même graine, six scénarios, aucun appel réel. Elle valide l’orchestration, jamais la vitesse de Whisper, de Codex ou du réseau. Synthèse : `latence-comparatif-simulation.json` (05 h 52, avant le gel).

**À réglages égaux**, c’est-à-dire avec la vision retenue pendant les questions comme dans la baseline, les dix mesures comparées sont identiques dans les six scénarios : délais de passage complet, vision retenue, durée des questions, pertes, causalité. L’orchestration héritée n’a pas régressé. Le fichier complet diffère par ailleurs, des champs ayant été ajoutés : l’identité n’est affirmée que sur les mesures listées.

**Avec le nouveau défaut**, la vision continue pendant les questions :

| Scénario | Vision retenue, avant | Après | Passage complet, 95e centile | Question la plus longue |
| --- | --- | --- | --- | --- |
| `lg-vps` | 34 882 ms | 0 ms | 18,9 → 15,6 s | 19,7 → 19,2 s |
| `mac` | 23 086 ms | 0 ms | 8,7 → 7,7 s | 13,7 → 16,0 s |
| `lg-vps-backlog` | 15 231 ms | 0 ms | 29,0 → 29,0 s | 16,7 → 16,7 s |
| `long-lg` (2 h) | 70 923 ms | 0 ms | 15,5 → 15,1 s | 17,7 → 19,9 s |

Contrepartie mesurée dans la même simulation : deux appels de modèle peuvent tourner ensemble au lieu d’un, dans cinq scénarios sur six. La question la plus longue est parfois plus longue, parfois plus courte ; la médiane des questions ne change pas ; aucune violation de causalité. Le simulateur ne facture rien à deux appels simultanés : il ne dit rien d’un ralentissement réel du chat.

À l’horloge virtuelle, sur un même scénario de 39 passages (`tests/question-ceiling.test.cjs`) : avec l’ancienne retenue rétablie (`TVLENS_VISION_DURING_ASK=0`), une question qui va au plafond de cinq minutes laisse 2 passages décrits sur 39, dont 35 sautés à cause de la question ; avec le défaut de la mission, 39 sont décrits sur 39. La capture et les paroles sont intactes dans les deux cas. À part, un autre test du même fichier relève 130 passages décrits sur 130.

### 4.5 Consigne du chat — caractères

Le texte fixe envoyé à chaque tour de chat passe de 4 908 à 665 caractères, mesurés sans consigne de surveillance active. Le texte de rôle (2 210 caractères) est envoyé une fois par fil. C’est une longueur, pas une latence. La ligne de portée ajoutée vers 07 h 00 quand une consigne est active n’est pas comptée dans ces chiffres.

### 4.6 Chat et surveillance en même temps — sept parcours réels

Nature : fournisseur réel sur ce Mac avec perception simulée par des textes écrits ; un parcours par ligne, aucune mesure de variabilité (détail au ticket 05). Les délais du chat et de la surveillance sont relevés séparément par le produit.

| Parcours | Surveillance | Demande | Chat : premier texte | Chat : réponse complète | Recherche web du chat | Surveillance : affirmation → résultat, moyenne |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | active | récapitulatif | 13,2 s | 16,5 s | oui, une source | 33,9 s |
| 2 | active | récapitulatif | 14,2 s | 17,5 s | oui, une source | 34,3 s |
| 3 | active | récapitulatif | 10,5 s | 12,3 s | oui, une source | 27,1 s |
| Question seule 1 | aucune | récapitulatif | 4,0 s | 5,9 s | non | — |
| Question seule 2 | aucune | récapitulatif | 5,1 s | 6,8 s | non | — |
| 4, après la ligne de portée | active | récapitulatif | 4,1 s | 5,9 s | non | 26,9 s |
| 5, après la ligne de portée | active | vérification explicite | 13,3 s | 17,7 s | oui, une source | 39,7 s |

Sorties : `reel/chevauchement-reel-*.json`, `reel/question-seule-reel-1.json` et `-2.json`.

À lire ainsi :

- Avant la ligne de portée, la question sous surveillance prenait 12,3 à 17,5 s parce que le chat **refaisait une vérification web**. Sans surveillance, 5,9 et 6,8 s. Après le changement, sous surveillance, 5,9 s, et la réponse dit « d’après le guide cité dans la vidéo », pas « confirmé ».
- L’écart mesuré venait donc d’un travail supplémentaire. **Ces sept parcours ne mesurent pas la contention** entre le chat et la surveillance, et **ne fondent aucun gain général**.
- Quand la demande réclame une vérification, le web est conservé : 17,7 s, une source.
- Pertes : aucune (ticket 05). Dans le parcours 4, pendant la question, la surveillance a lancé une lecture et un lot de vérification.
- La surveillance met de l’ordre de 27 à 40 s, en moyenne, entre la détection d’une affirmation et son résultat, sur ces textes.

### 4.7 Stockage

**Estimation hors ligne, pas une capture réelle.** Les vrais adaptateurs ont été exécutés hors ligne sur une image du dépôt et un audio synthétique.

| | TV vers serveur | Mac |
| --- | --- | --- |
| Par minute | ≈ 9,6 Mo | ≈ 8,7 Mo |
| Film de 90 min | ≈ 0,86 Go | ≈ 0,78 Go |

La taille des images dépend du contenu ; ± 50 % est plausible. Avec une réserve de 1 Gio et les 4,4 Go libres annoncés pour le VPS (non mesurés par cette session), cela fait de l’ordre de 5,8 heures de capture TV. Depuis, un fichier de la supervision donne la lecture du serveur installé lui-même : 4 576 168 252 octets libres, soit 326 minutes de capture avant le plancher à son propre rythme estimé (`deployment/startup-debug/live-overlap-final-state.json`, lu, non revérifié).

**Seul volume réellement stocké : le parcours Electron définitif.** 4 025 243 octets pour 55,1 s de capture, 31 passages dont 30 gardés avec leur vidéo, soit environ 4,4 Mo par minute (`electron/definitif-essai-2-pass.txt`). Hôte : ce Mac, voie de capture du Mac. La source est une vidéo de démonstration synthétique, en 640 × 360 d’après le journal : ce n’est pas une émission, et ce chiffre ne se compare pas à l’estimation ci-dessus. **Non mesuré par cette session** : une vraie émission, la voie TV vers serveur, le VPS.

**Un relevé de la supervision, hors de cette session.** Pendant son essai réel sur la TV et le VPS, vers 07 h 50, le serveur installé comptait 15 820 161 octets pour une session de 11 passages captés sur la TV, et estimait lui-même son rythme à 10 721 014 octets par minute, soit environ 10,7 Mo (même fichier d’état que ci-dessus). Un seul relevé, court, lu et non revérifié : il est du même ordre que l’estimation hors ligne de la voie TV, et ne vaut pas mesure sur un film.

### 4.8 Réexamen — mesures de l’autre session

Ces mesures viennent de la session réexamen. Elles sont reprises avec **ses** réserves et ne sont pas un gain de cette nuit. Détail : [réutiliser la transcription du passage](reinspection-transcript-reuse.md).

| Mesure | Avant | Après | Nature |
| --- | --- | --- | --- |
| Whisper lancés par un réexamen | 1 | 0 | toutes les passes |
| Durée d’`inspect_clip`, médiane | 19,6 s | 8,3 s | VPS à 2 vCPU, trois paires, Whisper réel, **vision et chat simulés** |
| Durée de la question, médiane | 28,1 s | 16,9 s | même essai |
| Durée d’`inspect_clip` | 7,3 s | 5,9 s | Mac, modèles simulés |
| Durée de la question | 10,5 s | 8,4 s | Mac, **vrais modèles, une paire** |

Réserves de leur auteur :

- **Une seule paire à vrais modèles, sur Mac.** Elle ne mesure pas un gain de temps : le Whisper retiré y vaut 1,4 s, moins que l’écart d’un appel de modèle à l’autre. Une seconde passe « après », sur le code final, a duré 13,1 s.
- **Les mesures du VPS utilisent un Whisper réel mais une vision et un chat simulés**, et elles sont **antérieures à cinq retouches** du code. Le VPS n’a pas été rejoué ensuite.
- **Aucun essai sur la TV.** L’essai réel d’origine (23,3 s de transcription) n’est pas rejouable : son audio est purgé.

Ce que cette session a vérifié de son côté : l’intégrité du bundle, la fusion sans conflit, et 95 tests réussis sur 13 fichiers après application.

## 5. Ce qui n’a pas été fait, ou pas prouvé

**Natif sur la TV : NON EXÉCUTÉ. VPS : aucun essai par cette session.** À 01 h 44, une reconnaissance en lecture seule du VPS (`df`, `uptime`, état du service) a été **refusée par la politique de permissions de la session**. Ce refus a été respecté, pas contourné. En conséquence :

- cette session n’a envoyé aucune commande au VPS ni à la TV, ni avant ni après l’installation ;
- elle n’a exécuté aucun flux TV/VPS temporaire ;
- la version de Codex du serveur (0.158.0) est un relevé de la supervision (`deployment/report.md`), pas de cette session ;
- l’espace libre du VPS est une lecture de la supervision : 4,3 Gio d’après `df`, disque plein à 96 % (`deployment/startup-debug/native-crash-info.txt`).

Chaque preuve garde sa provenance. Sur le VPS, il existe deux séries de mesures, et aucune n’est de cette session : celles de la session réexamen (Whisper réel, vision et chat simulés), antérieures à l’intégration de son correctif ici (section 4.8) ; et celles de la supervision après l’installation (section 13).

**Ni la TV native ni le VPS ne sont vérifiés.** D’après les fichiers de la supervision, la version de la nuit s’installe, les quatre rôles Codex se connectent sur le serveur, et une capture bornée de la TV est reçue et analysée. D’après les mêmes fichiers, le serveur installé a planté deux fois. Ils ne disent rien du panneau à la télécommande, d’une question longue, d’une archive, d’une suppression, des cartes sourcées, ni de l’affichage panneau fermé.

**Validation native de l’overlay : non exécutée.** Aucune phase du protocole n’a été lancée, par personne. Le profil livré, qui est aussi le profil installé, reste `off`.

**Linux : cloisonnement non éprouvé par cette session.** Outils exposés, réponse relue à l’ouverture d’un fil, drapeaux connus du binaire, réglages de sous-agents, garde de fil étranger, refus par défaut : cette session n’a rien éprouvé sous Linux. La supervision y rapporte seulement le cas nominal : quatre rôles connectés et confirmés. Aucune consigne neutralisée, aucun cas de refus, aucune sonde adverse.

**Sous-agents.** Ce qu’un sous-agent atteindrait réellement n’est pas mesuré ; aucun n’a été laissé tourner. La prévention n’est mesurée avec un vrai modèle que sur le rôle chat, deux tours, une version.

**Ce qui n’a pas été essayé avec un fournisseur réel.** Une question de cinq minutes ; un film entier ; une vraie émission, avec capture, Whisper et vision ; une consigne de signalement ; la surveillance par le script `scripts/probe-surveillance.cjs`.

**Usage réel du fournisseur pendant la nuit.** Total décomposé, à lire comme un **ordre de grandeur** : il additionne des comptes rendus et des compteurs de fichiers, et suppose un tour par essai de l’audit. Il ne compte que les appels du produit et de ses sondes à Codex, pas les agents qui ont écrit le code.

| Moment | Ce qui a tourné | Tours de modèle | Source |
| --- | --- | --- | --- |
| Audit, avant tout changement | trois essais réels de la sonde de référence, rôle chat | 3 | `04-confinement-probe-baseline.txt` |
| Lot C | sonde, étapes a à f | 6 | `04-confinement-probe-apres.txt` |
| Reprise C2 | sonde, étapes g, h, i, k | 4, plus un début d’inférence de sous-agent, compté comme un tour par le coordinateur | `04-confinement-probe-reprise.txt` |
| Reprise C3 | sonde, étapes k et m | 2 | `04-confinement-probe-sous-agent.txt` |
| Reprise C3, recherche | cinq lancements du vrai App Server sans identité ; connexion de préchauffage refusée en 401 | 0 | `lot-C3-impl.json` |
| C4, puis vérification finale | connexions des quatre rôles, fils ouverts, une lecture des quotas | 0 | `lot-C4-impl.json`, `04-confinement-final-sans-tour.json` |
| Passe réelle, cinq parcours de chevauchement et deux questions seules | 7 questions de chat, 22 lectures de détection, 10 lots de vérification (23 recherches web) | 39 | `reel/*.json` |
| Diagnostic des pages ouvertes | deux tours de vérification isolés | 2 | `reel/diagnostic-sources-*.json` |
| **Total** | | **de l’ordre de 57** | |

S’y ajoutent trois requêtes de documentation envoyées par l’outil `ctx7` (reprise C3), qui ne sont pas des appels de modèle du produit. La paire à vrais modèles du réexamen appartient à l’autre session.

**Interfaces.** La fenêtre du Mac n’a tourné contre le vrai processus principal que pendant les parcours Electron, avec des fournisseurs simulés. Aucune mesure de temps de rendu : le gain du rendu par carte est prouvé en identité de nœuds, pas en millisecondes. La capture d’écran réelle d’une autre application et le chemin audio réel ne sont pas exercés par ces parcours. Ce que montrent les interfaces Mac et TV quand toute connexion Codex est refusée n’a pas été vu.

**Disque.** Aucun volume réellement plein. Aucun volume de capture mesuré sur une vraie émission.

**Scripts non rejoués.** `scripts/probe-surveillance.cjs`, `scripts/probe-live.cjs`, `scripts/probe-video-chat-live.mjs` (réaligné sur la surveillance par le lot des finitions du Mac, jamais lancé) et les sondes de chat à fournisseur réel n’ont pas été lancés.

## 6. Défauts trouvés en relecture

Chaque lot a été relu par un agent indépendant chargé de le réfuter. Ce qu’ils ont trouvé est gardé ici.

| Lot | Verdict | Défauts | Suite |
| --- | --- | --- | --- |
| 01 cinq minutes | pass | points mineurs | — |
| S surveillance | **fail** | le dédoublonnage fusionnait des affirmations distinctes de même chiffre, la seconde n’était jamais vérifiée ; après un lot abandonné, le suivant héritait des pages ouvertes ; une panne totale de lecture s’affichait « Surveillance active. » | reproduits puis corrigés |
| S2 surveillance | **fail** | après un registre illisible, une écriture partait dans le dossier d’une autre session. En le reproduisant, le correcteur a trouvé plus grave : une fermeture pendant la lecture du dossier remplaçait l’historique enregistré par un registre vide | corrigés ; reprise S3 lancée |
| S3 surveillance | **fail** | un test de la suite devenu rouge (`tests/mac-ipc-contract.test.cjs`, 6 sur 7) ; une archive rouverte après un dossier lent annoncée « illisible » à tort et plus jamais enregistrée | second défaut corrigé à 05 h 28, **sans relecteur dédié** (ticket 05) ; attente du test adaptée par le coordinateur, qui a acté le changement de contrat |
| TV natif | **fail** | la déclaration « vu » d’une carte survivait à la session et effaçait les premières cartes de la suivante | corrigé, puis identifiant de session explicite dans le lot TV final |
| TV application, page ambiante et panneau | pass | quatre et cinq mineurs | traités en partie par le lot TV final |
| TV final (FIN-TV) | **fail** | la pastille pouvait afficher « Vérifications en retard · 0 en attente » | corrigé à 06 h 53, **sans relecteur dédié** ; trois mineurs ouverts (ticket 07) |
| B sessions | **fail** | un script de parcours lisait les médias à l’ancien emplacement (hors des fichiers du lot) | corrigé par le lot propriétaire du script |
| B2 sessions | pass | deux mineurs | traités en H2, puis par le coordinateur |
| C cloisonnement | **fail** | faux négatif du filtre de sources, présenté comme un succès | corrigé, document rectifié |
| C2, C3, C4 cloisonnement | pass | huit, sept, puis sept mineurs | traités ou déclarés |
| H-serveur, H-Mac, H2 | pass | mineurs, dont une archive durable qui perdait son début à la reprise sur un hôte en fenêtre glissante | corrigé en H2 |
| UI-Mac | **fail** | les signalements entraient dans la pile en bas à gauche et un réglage « signalements à l’écran » était livré ; des tests figeaient cette violation ; activité fausse pendant une panne de lecture | corrigés |
| Finitions du Mac (FIN-MAC) | pass | deux mineurs : l’accord des pluriels réécrivait aussi les limites rédigées par l’agent, au risque de changer leur sens ; l’avis « suivi non enregistré » dépendait d’une phrase de l’hôte | corrigés par le coordinateur : accord limité aux neuf phrases du cœur ; avis affiché dès que l’état le dit |
| Clip sans image | pass | huit mineurs, dont la limite « vidéo illisible » écrite pour toute panne du décodeur | repris par le coordinateur avant le gel, sauf les limites du ticket 02 |
| Conception TV | à réviser | un défaut critique, cinq majeurs, de conception | révisée avant le code |
| Documentation (ce livrable et les tickets), première version | **fail** | sur le ticket 04, la case « une injection représentative et une lecture hors contexte refusées par contrôle technique » était cochée, alors que seule la lecture hors contexte est tenue par un contrôle technique ; huit mineurs | case décochée ; les huit mineurs sont corrigés dans la version finale |
| Documentation, version finale | **fail** | sur le ticket 08, la case « nettoyage, production inchangée, aucun push/deploy » était cochée sur une déduction (« aucun accès, donc aucun déploiement »), et le livrable, l’index et sept tickets affirmaient « rien n’est déployé ». C’était faux à l’heure de leur écriture : la supervision avait installé la version sur le VPS et la TV entre 07 h 20 et 07 h 31. Quatre mineurs (`lot-DOC-FINAL-verify.json`) | case décochée ; affirmation remplacée partout par les deux faits et leur provenance ; section 13 ajoutée. Deux mineurs de fait corrigés (un fichier TV modifié après quatre parcours navigateur ; la septième réponse réelle du chat, sans citation vidéo). Deux mineurs laissés au coordinateur : quelques lignes de tableau portent une précision de niveau hors des six termes ; quelques chiffres viennent du journal seul, et le disent. Cette reprise n’a pas encore été relue |

**Corrections faites par le coordinateur lui-même, hors lot.** Le journal ne mentionne aucun relecteur dédié pour : le refus étendu à une réponse d’ouverture de fil incomplète ; le comptage des pages ouvertes ; l’accord des pluriels et l’avis « suivi non enregistré » ; la route overlay qui publie `registry` ; la phrase du cœur sur le retard ; la ligne de portée de la consigne ; le retrait des liens Markdown. Chacune a un test ajouté ou étendu, et la suite finale les couvre. Le correctif du clip sans image, lui, a été relu.

À savoir aussi :

- **Trois décisions du coordinateur ont été corrigées en cours de nuit.** Il avait d’abord réduit le ticket 07 au panneau ouvert ; puis autorisé l’affichage des signalements dans l’overlay. Les deux allaient contre le contrat et ont été retirées ; le défaut critique du lot UI-Mac venait de la seconde. À 06 h 33, face au clip sans image, il avait assoupli le script du parcours Electron (« au moins une source se relit ») ; sur consigne de la supervision, cet assouplissement a été retiré à 06 h 40 et le défaut corrigé dans le produit.
- **Deux défauts trouvés par les essais, pas par les relecteurs** : le clip sans image, par le parcours Electron ; le faux négatif du comptage des pages ouvertes, par la passe réelle.
- **Un incident de test.** Entre 04 h 00 et 04 h 09 environ, une collision de nom introduite par un implémenteur faisait échouer la fermeture du serveur ; un autre agent a lancé des tests dans cette fenêtre. Ces échecs sont à rejouer, pas à interpréter.
- **Un échec intermittent non élucidé** a été vu une fois dans un test de surveillance, pendant des mutations hors dépôt. Il n’a pas été reproduit.
- **Des preuves hors dépôt.** Les sondes, mutations et mesures des lots vivaient dans le dossier temporaire de la session, nettoyé en fin de mission (section 10). La suite ne les rejoue pas.

### Tests existants adaptés sciemment

Aucun test n’a été supprimé en silence. Ceux qui figeaient un comportement que le contrat change ont été adaptés, et chaque lot l’a déclaré.

| Test | Ce qui a changé | Pourquoi |
| --- | --- | --- |
| `tests/media-asr-options.test.cjs`, `tests/review-regressions.test.cjs` | quatre assertions : `visionDuringAsk` attendu à vrai | nouveau défaut du ticket 01 |
| `tests/chat-error-ui.test.cjs`, `tests/stream-simulation.test.cjs` | un littéral et un libellé | « 60 secondes » périmé |
| `tests/remote-server.test.cjs`, `tests/session-latency.test.cjs` | rétention de 300 000 ms passée explicitement | l’expiration n’est plus le défaut ; son chemin reste couvert |
| `tests/timeline-server.test.cjs` | deux tests retitrés, assertions de purge inversées | la fin de session archive |
| `tests/session-timeline.test.cjs` | les miniatures survivent à la fin de session | même raison |
| `tests/viewing-features.test.cjs` | deux tests du mode Auto **retirés** ; test des moments gardés réécrit | la suspension et la préemption par une question sont inversées par la décision 8 ; ce qui reste vrai est prouvé par les tests de surveillance |
| `tests/verification.test.cjs` | sources conditionnées aux pages ouvertes ; tests du vérificateur réécrits ; un binaire qui accepte les réglages est simulé | filtre de sources ; vérificateur porté sur le client App Server ; refus par défaut |
| `tests/codex-confinement.test.cjs` | un test **retiré**, un réécrit ; puis attentes réécrites sur le refus par défaut, faux programme Codex complet, délai de mémorisation d’un échec ramené de 60 à 10 s ; puis une réponse d’ouverture de fil incomplète attend un refus ; test de la consigne étendu à la ligne de portée | il exerçait le lancement `codex exec` du vérificateur, qui n’existe plus ; correction C4 ; extension du coordinateur ; arbitrage chat et surveillance |
| un test existant, que le journal ne nomme pas | pages ouvertes par référence créditées | correction du comptage, vers 06 h 05 |
| `tests/session-durable.test.cjs` | une assertion inversée | elle figeait le défaut corrigé (archive durable prenant la fenêtre de l’hôte) |
| `tests/disk-guard.test.cjs` | textes du refus | message à un seul chiffre |
| `tests/mac-ipc-contract.test.cjs` | l’état attendu juste après l’activation de la surveillance : « restauration », puis « écoute » dans un délai borné | changement de contrat acté par le coordinateur après la reprise S3 |
| `tests/mac-ui.test.cjs` | assertions sur une lecture en échec et sur le libellé des passages masqués ; expression interdite pendant la restauration durcie | finitions du Mac |
| `tests/test_tv_ambient.py`, `tests/tv-overlay-queue.test.cjs`, `tests/tv-panel.test.cjs`, `tests/chat-error-ui.test.cjs` | déclaration « vu » rangée par session ; libellés courts de la pastille ; pluriels accordés ; exports ajoutés | lot TV final et sa correction |

## 7. Réglages réversibles

Tous sont facultatifs. Absents, le défaut du produit s’applique. Mal saisis, ils arrêtent le démarrage avec un message en français.

| Variable | Défaut | Effet | Où elle est lue |
| --- | --- | --- | --- |
| `TVLENS_QUESTION_TIMEOUT_MS` | `300000` | Plafond de traitement d’une question, de 1 à 300 000 ms. Ne peut que l’abaisser | environnement du processus |
| `TVLENS_MEDIA_RETENTION_MS` | absent : jusqu’à suppression | Une durée positive rétablit la fenêtre glissante | environnement du processus |
| `TVLENS_DISK_MIN_FREE_MB` | `1024` | Plancher d’espace libre : en dessous, la capture est refusée | environnement du processus |
| `TVLENS_DISK_WARN_FREE_MB` | `2048` | Seuil d’alerte « espace faible » | environnement du processus |
| `TVLENS_SURVEILLANCE_WORKERS` | `1` | Postes de vérification en parallèle, de 1 à 3 | environnement du processus |
| `TVLENS_VISION_DURING_ASK` | `1` | `0` retient de nouveau la description visuelle pendant une question | fichier de configuration ou environnement |

« Environnement du processus » : ces variables ne sont **pas** lues dans `.env.local` ni dans `/etc/tvlens/server.env`. Sur le serveur, elles se posent dans l’environnement du service (`/etc/tvlens/runtime.env`). Sur Mac, `npm start` hérite du terminal. **L’application Mac empaquetée ne les reçoit pas** : ouverte depuis le Finder elle n’a pas l’environnement du terminal, et `npm run open:mac` ne lui transmet que `CODEX_HOME`. Pour elle, ces cinq retours arrière sont aujourd’hui hors d’atteinte.

Cloisonnement : `TVLENS_CODEX_CONFINEMENT` (`enforce` par défaut, qui refuse une connexion non confirmée ; `strict` ; `report`, mode diagnostic **non confiné**), `TVLENS_CODEX_ITEM_GUARD`, `TVLENS_CODEX_REAL_HOME`, `TVLENS_COMPANION_PROMPT`. Leurs valeurs et leurs risques sont dans [SECURITY.md](../SECURITY.md).

TV : `ambient.json` et `ambient-settings.json`, décrits dans [LG : alertes panneau fermé](lg-ambient.md).

## 8. Avant tout déploiement

Cette liste a été écrite avant l’installation. La supervision a installé la version de la nuit entre 07 h 20 et 07 h 31, avec l’autorisation de Dabi (section 13). La liste vaut donc pour toute installation à venir ; chaque point dit aussi ce que les fichiers de la supervision rapportent pour celle qui a eu lieu, lu et non revérifié.

**Les mesures de cette session ne suffisent pas à garantir une mise en service.** Le point 5 l’a montré. Dans l’ordre :

1. **Lire ce document en entier.**
2. **Figer une révision.** L’arbre n’est pas commité. Un déploiement part d’une révision Git identifiée, pas d’un arbre de travail. *Installation du 13 octobre* : construite depuis l’arbre de travail, 146 fichiers, sous le nom `night-20261013T052056Z-e02590ce2a` (`deployment/release.json`).
3. **Cloisonnement sur le serveur.** Suivre la section « Avant tout déploiement » de [SECURITY.md](../SECURITY.md) : relever la version de Codex, vérifier que le binaire accepte les deux réglages de sous-agents, rejouer la sonde sous Linux avec un compte de test, lire la sortie brute. Un Codex qui ne connaît pas ces réglages est un cas à traiter avant, pas après : voir ci-dessous. *Installation du 13 octobre* : version relevée et connexion des quatre rôles confirmée avant la bascule ; la sonde sous Linux ne figure pas dans les fichiers lus.
4. **Disque du serveur.** Mesurer l’espace libre réel. La conservation est durable : un film coûte de l’ordre du gigaoctet, d’après une estimation non vérifiée. Le plancher par défaut est de 1 Gio. *Installation du 13 octobre* : 4,3 Gio libres, disque plein à 96 % (section 5).
5. **Ressources du service.** La surveillance ajoute des processus Codex : un pour la lecture, un par poste de vérification, et le vérificateur manuel en démarre un par vérification. Cette session n’avait pas mesuré leur nombre face aux limites de l’unité systemd fournie (`MemoryMax=2G`, `TasksMax=128`). Ce livrable le disait non mesuré ; d’après le journal, le point manquait dans les prérequis transmis à la supervision à 07 h 20. *Installation du 13 octobre* : **la limite de 128 tâches a été atteinte et le serveur a planté deux fois** (section 13). D’après le compte rendu de la supervision, le serveur garde jusqu’à sept rôles Codex, et neuf arbres de processus pendant qu’une surveillance s’arrête et repart. Le modèle d’unité de l’arbre porte maintenant `TasksMax=512`, valeur que la supervision a appliquée au service. Mémoire : jusqu’à 628 080 640 octets relevés pendant un essai de 94 s, sous la limite de 2 G de l’unité (`deployment/startup-debug/live-capacity.txt`) ; un seul relevé.
6. **Serveur et client TV ensemble.** Un client TV non mis à jour continue de télécharger l’état complet, un peu plus lourd qu’avant. Les vues légères ne servent que si le panneau est mis à jour lui aussi. Un contrôleur TV non mis à jour répond 404 à la nouvelle déclaration « vu » du panneau. *Installation du 13 octobre* : serveur d’abord, à 07 h 24 ; puis, à 07 h 29, le panneau, les cinq modules du contrôleur et le programme de télécommande ensemble.
7. **Données existantes.** Les sessions d’avant apparaîtront « Texte seul ». Rien n’est migré ni effacé. Un retour à l’ancienne version ne peut pas effacer les dossiers `media/` et `thumbs/` créés par la nouvelle (prouvé hors ligne). *Installation du 13 octobre* : sauvegardes faites sur le serveur et sur la TV ; le compte rendu de la supervision demande de ne pas restaurer les données à l’aveugle après de nouveaux essais.
8. **Mode ambiant TV.** Le déployer et l’activer sont deux décisions distinctes de Dabi. Tant que le protocole natif n’est pas passé, le profil reste `off`. *Installation du 13 octobre* : application ambiante enregistrée, profil `off`, état « stopped ».
9. **Mise à jour.** Capture arrêtée, configuration privée sauvegardée, appairage préservé : voir [installer son serveur](server-installation.md) et [installation LG](lg-installation.md). *Installation du 13 octobre* : trois configurations privées préservées sur la TV.

**Point 3 : conséquence opérationnelle du refus par défaut.** Elle est livrée, et prouvée sur de faux binaires seulement : aucun refus n’a été observé sur un vrai Codex. Sous Linux, cette session n’a rien mesuré.

- **Ce qui se passe.** Après déploiement de cette branche, un serveur dont le Codex ne connaît pas les deux réglages de sous-agents, ne les relit pas, ou ne confirme pas l’absence d’environnement d’exécution à l’ouverture d’un fil, **refuse toute connexion Codex** : chat, surveillance, vérification manuelle, description des passages, réexamen, résumé. La capture et la transcription locale ne passent pas par Codex. L’application n’a pas été essayée dans cet état.
- **Pourquoi c’était le cas à vérifier, et ce qu’il en est.** Le blocage a été mesuré par cette session sur `0.160.1`, sous macOS ; le VPS est en `codex-cli 0.158.0` d’après la supervision. Elle a vérifié la connexion avant la bascule, sans mettre Codex à jour : les quatre rôles (chat, analyse, surveillance, vérificateur) se connectent sur le serveur, `confined: true`, `verified: true`, sous-agents bloqués (`deployment/vps-preflight.txt` ; version dans `deployment/report.md`). Le refus ne s’est donc pas produit sur ce serveur. Cette session ne l’a pas revérifié. Le risque reste entier pour un autre serveur, ou après un changement de version de Codex.
- **Le message.** « Confinement Codex non confirmé (sous-agents) : connexion refusée. » Il dit ensuite ce qui n’est pas confirmé, la version installée quand `codex --version` répond, la version mesurée, et les deux issues : mettre Codex à jour puis relancer TVLens, ou demander explicitement le mode diagnostic.
- **Où il apparaît.** Au premier usage, dans le message de la question ou de la vérification, et dans le journal du service. Rien ne l’affiche au démarrage.
- **Diagnostiquer.** Sur le serveur, avec le binaire et le compte du service : `codex --version` ; puis les trois commandes `codex features list` de SECURITY.md, qui doivent sortir en code 0 ; puis `node scripts/probe-confinement.cjs --out <dossier neuf> --steps r --max-turns 0`, qui ne consomme aucun tour de modèle. Réserve du relecteur : sans l’option `--binary`, la sonde prend le `codex` du chemin de l’opérateur, pas forcément celui du service.
- **Après une mise à jour de Codex, relancer TVLens** : un refus du binaire est gardé en mémoire jusqu’au redémarrage.
- **Mode diagnostic.** `TVLENS_CODEX_CONFINEMENT=report` lance sans rien refuser et s’annonce non confiné dans le journal à chaque connexion. Il n’a été exercé que hors ligne et sur de faux binaires. À ne poser que pour diagnostiquer.

## 9. Protocole borné de preuves réelles, TV et VPS

Rien de ce qui suit n’a été exécuté par cette session, sauf la ligne marquée « fait ». C’est ce qui manque pour passer de « prouvé hors ligne » à « prouvé en réel ». Chaque étape est bornée et se défait. L’installation de la supervision (section 13) n’a pas suivi ce protocole : elle répondait à une autorisation directe de Dabi. Le tableau dit ce qu’elle a déjà rapporté.

**Règles.** YouTube garde le focus, le son et la lecture. Aucune étape n’arrête la capture en cours, ne remplace le mapper installé, ne touche à l’appairage ni au service existant. Une étape qui l’exigerait attend une décision explicite de Dabi. Les captures sont courtes, les corpus petits, tout est nettoyé après l’essai.

| Étape | Où | Ce qu’elle établit | Référence |
| --- | --- | --- | --- |
| Relevé en lecture seule : version de Codex, espace libre, état du service | VPS | les informations de seconde main | **rapporté par la supervision** (sections 5 et 13), non revérifié par cette session |
| Sonde de cloisonnement sous Linux, compte de test | VPS | le ticket 04 hors du Mac | [SECURITY.md](../SECURITY.md), « Avant tout déploiement » ; non exécuté, d’après les fichiers lus |
| Serveur temporaire sur port éphémère, données dans un dossier jetable, une courte capture, une question longue, une consigne de surveillance | Mac d’abord, puis VPS | délais réels du chat et de la surveillance sur une vraie capture, volume réel par minute, pertes | commande préparée par le lot 01, non exécutée. La supervision a fait un essai court sur le serveur installé, pas sur un serveur temporaire (section 13) |
| Essai réel de la surveillance sur des textes écrits | Mac | chevauchement, sources, style des cartes | **fait** avec `scripts/probe-overlap-live.cjs` (ticket 05) ; `scripts/probe-surveillance.cjs` reste à lancer |
| Essai réel de la surveillance sur une vraie émission | Mac | qualité de détection sur des paroles transcrites | non exécuté |
| Phase A du protocole natif : lecture seule, aucune installation | TV | politique réelle du compositeur, durée d’un appel Luna, plans de capture | [LG : alertes panneau fermé](lg-ambient.md) |
| Phases B à E : paquet de sonde, relais, capture, durée | TV | focus, première touche, son, non-contamination de la capture | même document ; **décision de Dabi requise** |
| Phase F : décision | — | profil `relay` ou `passthrough`, ou rejet mesuré | même document |

Trois verdicts sont possibles pour l’overlay, et ne doivent pas être confondus : réglage rejeté, mécanisme rejeté après balayage, impossibilité matérielle. Aucun n’existe aujourd’hui.

## 10. Nettoyage et état du dépôt

- **Par cette session : aucun commit, aucun push, aucun déploiement, aucune commande vers la TV ni vers le VPS.** Le dernier commit est toujours `9758633`, et les modifications sont non commitées : c’est ce que montre l’état Git relevé au lancement de cette reprise. L’absence de push n’a pas été vérifiée par une commande ; c’est le journal qui la dit, et aucun commit nouveau n’existe. D’après le journal, 189 fichiers étaient modifiés ou nouveaux dans l’arbre de travail au gel. Les différences héritées sont préservées ; aucune commande Git destructive n’a été utilisée.
- **La production a changé, par la supervision.** Entre 07 h 20 et 07 h 31, avec l’autorisation de Dabi, elle a installé la version de la nuit sur le VPS et sur la TV, à partir de l’arbre de travail. Des sauvegardes ont été faites des deux côtés. Cette session n’a eu aucun accès à la TV ni au VPS ; elle lit ces faits dans `.local/night-features/deployment/` sans les revérifier (section 13).
- **`~/.codex`.** Les sondes ont lu l’authentification par liens ; `auth.json` et `config.toml` sont inchangés d’après les relevés des lots. Seize binaires Codex installés y ont été exécutés en lecture seule, avec un dossier jetable. Les connexions non anticipées vers le fournisseur sont dites au ticket 04. Non vérifié : si un processus Codex lancé par le produit peut écrire le cache de modèles à travers le lien que son dossier temporaire contient.
- **Dossiers temporaires supprimés.** À 07 h 12, les 19 dossiers `tvlens-*` créés cette nuit par les essais ont été supprimés (liste : `nettoyage-dossiers-temporaires-supprimes.txt`). La liste comprend les trois dossiers que deux relecteurs n’avaient pas pu supprimer eux-mêmes. Vérifié à la rédaction : aucun des 19 n’existe plus. Neuf dossiers `tvlens-*` restent dans le répertoire temporaire ; d’après le journal ils sont antérieurs à la mission, et ils n’ont pas été touchés.
- **Dossier de travail de la session.** Ramené de 177 Mo à 9,9 Mo d’après le journal. Il y reste la copie figée du parcours Electron et la copie de la baseline.
- **Conservés.** Les résultats bruts et le journal, dans `.local/night-features/` ; les captures finales (`captures/electron-definitif/`, `captures/tv-simulee/`, 5,2 Mo). Ce dossier et `.scratch/tvlens-night/issues/` (tickets) sont ignorés par Git.
- **Non touchés par cette session.** Toute donnée utilisateur, les autres arbres de travail, `~/.codex`. Sur le VPS et la TV, ce que la supervision a remplacé et préservé est en section 13.
- **Lien de dépendances : gardé.** `node_modules` n’existe pas dans cet arbre. Un lien `../node_modules`, **au-dessus** de l’arbre et hors Git, pointe vers les dépendances du dépôt principal, qui n’a pas été modifié. Les tests en dépendent. À retirer quand il ne sert plus.
- **Espace disque du Mac.** D’après le journal, sans fichier de sortie : 9,2 Gio libres au début de la mission, 3,7 Gio à 05 h 08, 6,6 Gio après le nettoyage. L’empreinte identifiée de la session n’explique pas la baisse. Piste relevée par le coordinateur, non chiffrée par cause : la mémoire d’échange du système est restée presque pleine (19,7 Gio sur 20), la machine étant sous forte pression mémoire ; les nombreux agents et tests lancés en parallèle y ont très probablement contribué.

## 11. Documentation

Mis à jour par cette mission : [README](../README.md), [index](README.md), [architecture](architecture.md), [interface](interface.md), [installation Mac](installation.md), [installer son serveur](server-installation.md), [vérification](verification.md), [résumé progressif](living-recap.md), `.env.example`, `deploy/server.env.example`, [index des tickets](tvlens-night-tickets.md). Écrits par d’autres lots : [SECURITY.md](../SECURITY.md), [LG : alertes panneau fermé](lg-ambient.md). Venu de l’autre session : [réexamen](reinspection-transcript-reuse.md).

Complétés par une note datée, sans réécriture : [VPS privé](vps-deployment.md) (relevé du déploiement d’avant la nuit ; il ne décrit pas la version installée depuis par la supervision), [rôles des agents](refactor-runtime.md), [premier runtime TV vers Mac](lg-remote-runtime.md).

**Laissés tels quels, à dessein** : les documents historiques et leurs mesures datées, dont [latence du backend](backend-latency-optimization.md) et les rapports JSON. [Goal livré](active-goal.md) et [chat et outils de visionnage](viewing-upgrade.md), que l’audit classait « à corriger » pour leur délai de 60 secondes, portent désormais en tête un avis « Document historique (29 septembre 2026) » : ils ne sont plus comptés parmi les documents périmés.

**Encore périmés sur un point**, hors du périmètre de cette rédaction :

- [frise LG](lg-timeline.md) décrit une fin de session qui supprime les miniatures et les médias, et un nettoyage au démarrage suivant ;
- [capture LG](lg-capture-control.md) annonce une rétention de cinq minutes ;
- [validation](validation.md) reste l’état daté du 4 octobre ;
- le tableau des réglages de [latence du backend](backend-latency-optimization.md) donne `0` pour défaut de `TVLENS_VISION_DURING_ASK`, qui vaut maintenant `1` ;
- `deploy/runtime.env.example` ne liste pas encore les cinq réglages d’hôte de la section 7, qui se posent pourtant dans ce fichier ;
- [SECURITY.md](../SECURITY.md), à l’étape 6 de sa procédure, présente encore `strict` comme le moyen de refuser une réponse d’ouverture de fil incomplète ; depuis 06 h 02, le mode par défaut la refuse déjà ;
- [architecture](architecture.md) dit de la surveillance que « tout cela est prouvé par simulation » ; cinq parcours réels existent depuis, sur des textes écrits ;
- [installation Mac](installation.md), [installer son serveur](server-installation.md) et [VPS privé](vps-deployment.md) ne disent pas que, par défaut, une connexion Codex non confirmée est refusée ; ils renvoient à SECURITY.md.

Les deux premiers décrivaient aussi l’installation en service avant 07 h 20. Depuis l’installation faite par la supervision, ils sont périmés pour elle aussi.

**Devenus faux à 07 h 24, hors du périmètre de cette reprise.** Plusieurs documents écrits pendant la nuit disent encore que le code du 13 octobre n’est ni déployé ni essayé sur la TV ou le VPS. Ce n’est plus vrai depuis l’installation :

- [README](../README.md), l’encadré « Version installée sur la TV de test » et la ligne « Changements du 13 octobre 2026 » de l’état des preuves ;
- [interface](interface.md), l’encadré qui distingue la version installée du code du 13 octobre ;
- [installer son serveur](server-installation.md), l’encadré « jamais exécuté sous Linux », qui dit ce code non déployé sur le serveur de référence ;
- [VPS privé](vps-deployment.md), le complément titré « non déployé », qui dit qu’aucune commande n’a été envoyée à ce VPS ;
- [LG : alertes panneau fermé](lg-ambient.md), la ligne « Natif sur la TV » de son tableau, qui dit « aucun déploiement, aucune installation » : l’application ambiante est installée, et c’est sa validation qui n’est pas faite ;
- [rôles des agents](refactor-runtime.md) et [premier runtime TV vers Mac](lg-remote-runtime.md), leurs notes datées « non déployé ».

Cette reprise ne pouvait écrire qu’une phrase du README, déjà utilisée ; ces corrections sont demandées au coordinateur.

## 12. Décisions prises sans Dabi, à confirmer

Toutes sont réversibles.

1. « Terminer la session » archive ; la suppression est une action distincte, confirmée.
2. Une capture lancée sur une archive ouverte demande de choisir entre reprendre et nouvelle session.
3. Aucune éviction automatique quand le disque est plein. Plancher 1 Gio, alerte 2 Gio.
4. Les moments gardés et les anciennes vérifications ne sont pas supprimés avec leur session.
5. La description visuelle continue pendant une question.
6. Un poste de vérification par défaut pour la surveillance.
7. Les signalements restent dans le panneau et l’historique ; aucun réglage ne les met à l’écran.
8. Cartes affichées 14 secondes par défaut.
9. Profil ambiant TV livré `off` ; plafond de capture TV porté à 6 heures dans le code. Les deux sont dans la version installée par la supervision (section 13).
10. Le vérificateur manuel tourne à l’effort `low`.
11. Avec un contexte MCP externe de cinq minutes, un client MCP garde le même préfixe figé cinq minutes au lieu d’une.
12. **Pendant une surveillance, le chat ne refait pas la vérification web confiée à la surveillance**, sauf demande explicite (ticket 05). Choix fait vers 07 h 00, appuyé sur deux parcours réels. Il vit dans le texte de la consigne ; `TVLENS_COMPANION_PROMPT=legacy` rend l’ancienne consigne entière.
13. **Par défaut, une connexion Codex dont le cloisonnement n’est pas confirmé est refusée** (section 8). `TVLENS_CODEX_CONFINEMENT=report` la laisse passer, non confinée.
14. Un passage dont la vidéo est vide est gardé, analysé et dit « vidéo illisible » ; son réexamen se fait sur les images gardées.
15. Un lien Markdown écrit par le modèle dans une réponse est ramené à ses mots ; la page reste dans les sources.
16. Le lien `../node_modules` est gardé en fin de mission.
17. Le modèle d’unité du service porte `TasksMax=512` au lieu de 128 (section 13) ; la supervision a appliqué cette valeur au service installé.
18. Sur la TV, un déplacement du rectangle vidéo pendant la prise d’une image n’écarte plus que cette image, et non le bloc de 8 s ; un changement de contexte vidéo refuse toujours le bloc. Affinement que la supervision dit autorisé par Dabi, installé par elle (section 13).

## 13. Installation sur le VPS et la TV, faite par la supervision (07 h 20 à 08 h 07)

**Provenance.** Tout ce qui suit a été fait par la supervision, la session parente, avec l’autorisation explicite de Dabi. **Cette session n’a exécuté aucune commande distante.** Elle a lu les fichiers que la supervision a déposés dans `.local/night-features/deployment/` et le journal, sans rien revérifier à distance. Les heures des fichiers du serveur sont en temps universel ; elles sont données ici à l’heure de Paris. Cette section est arrêtée au compte rendu d’incident de la supervision, daté de 08 h 07 (`deployment/startup-debug/report.md`).

**Rien ici ne vaut « vérifié ».** Ni la TV native ni le VPS ne sont marqués vérifiés, et aucune case de ticket ne s’appuie sur cette section.

### Ce qui a été installé

*Serveur (VPS), 07 h 20 à 07 h 25.*

| Fait rapporté | Fichier |
| --- | --- |
| Version `night-20261013T052056Z-e02590ce2a`, construite depuis l’arbre de travail, 146 fichiers | `release.json` |
| 43 tests ciblés réussis sous Linux, 0 échec | `vps-targeted-tests.txt` |
| Quatre rôles Codex (chat, analyse, surveillance, vérificateur) connectés, `confined: true`, `verified: true`, sous-agents bloqués ; Codex 0.158.0, non mis à jour | `vps-preflight.txt`, `report.md` |
| Sauvegarde de 13 Mo ; ancien arbre gardé | `backup.txt`, `report.md` |
| Service actif sur la nouvelle version depuis 07 h 24, par un complément d’unité systemd dédié | `vps-switch.txt`, `report.md` |
| État, sessions et stockage répondent 200 avec jeton, 401 sans ; stockage « ok » ; plafond de question de 300 000 ms | `vps-post-check.txt` |

*TV, 07 h 28 à 07 h 31.*

| Fait rapporté | Fichier |
| --- | --- |
| Panneau, cinq modules du contrôleur et programme de télécommande remplacés ; 26 fichiers conformes à leurs empreintes | `tv-manifest.json`, `report.md` |
| Sauvegarde créée sur la TV ; trois configurations privées préservées ; contrôleur prêt | `tv-install.txt` |
| Application ambiante `org.tvlens.ambient` 0.1.0 enregistrée par webOS ; état « stopped », **profil `off`** | `tv-install.txt`, `report.md` |
| Capture bornée : 13 images, 2 blocs envoyés, 1 écarté parce qu’une autre application était au premier plan, 0 erreur ; plafond annoncé de 21 600 s | `tv-live-capture.txt` |
| Les deux passages reçus par le serveur, paroles et images prêtes ; 24,2 s captées et analysées | `report.md` |

L’application Mac n’a pas été installée ni modifiée. Le retour arrière du serveur tient en une ligne du compte rendu : retirer le complément d’unité, recharger systemd, relancer le service.

### Le serveur installé a planté deux fois

- **Symptôme.** Pendant son essai, Dabi a vu sur la TV « Serveur redémarré ou session changée » (journal).
- **Faits.** Le processus principal du service est mort par SIGSEGV à 07 h 35 et à 07 h 36, 24 s puis 3 s après l’ouverture des rôles de surveillance ; systemd l’a relancé chaque fois (`startup-debug/errors-only.txt`, `vps-journal.txt`). Le noyau avait écrit « fork rejected by pids controller » pour ce service à 07 h 32, puis deux secondes avant le second plantage (`native-crash-info.txt`). L’unité installée limitait le service à 128 tâches (`service-limits.txt`). Côté TV, la capture s’est arrêtée sur « Session serveur changée ou suspendue. Redémarrage manuel requis. », 1 bloc envoyé et 4 écartés ; le serveur n’avait plus de session (`tv-state.txt`).
- **Cause, reproduite par la supervision sans tour de modèle.** Cinq connexions Codex ouvertes ensemble dans une unité limitée à 128 tâches : une connexion interrompue, 49 refus du noyau. À 256 : cinq sur cinq, pic à 163 tâches, aucun refus. Avec neuf connexions : à 256, huit sur neuf et 138 refus ; à 512, neuf sur neuf, pic à 347, aucun refus (`quota128-journal.txt`, `quota256-journal.txt`, `quota-nine-256-journal.txt`, `quota-nine-512-journal.txt`). D’après le compte rendu de la supervision, le serveur garde sept rôles Codex au plus, et peut avoir neuf arbres de processus pendant qu’une surveillance s’arrête et repart.
- **Pourquoi un refus du noyau fait tomber tout le serveur.** Une sonde isolée, limite remplie exprès, montre que plusieurs traitements d’images lancés ensemble font mourir le processus Node par SIGSEGV quand il ne reste aucune tâche, alors que le lancement d’un processus enfant échoue proprement (`native-quota-probe-journal.txt`). Ce maillon est reproduit en isolation ; il n’est pas observé dans le plantage réel, faute de trace de pile. La supervision l’écrit ainsi : « une reproduction compatible, et non une autopsie de ce crash ».
- **D’où vient le défaut.** La branche de la nuit garde plus de rôles Codex vivants en même temps, et la limite de l’unité n’avait pas été revue. Ce livrable disait ces ressources non mesurées (section 8, point 5) ; d’après le journal, le point manquait dans les prérequis transmis à la supervision.

### Ce qui a été fait ensuite

- **Limite relevée en direct par la supervision**, sans redémarrage : à 256 à 07 h 45, puis à 512 à 07 h 55 (`capacity-fix.txt`, `capacity-fix512.txt`). Son compte rendu dit le réglage de 512 persistant. Au dernier contrôle, à 08 h 02, le service est le même processus depuis le second plantage, sans nouveau refus du noyau (`final-capacity-check.txt`). Aucun redémarrage du service ou de la machine n’a été rejoué pour le vérifier.
- **Un essai repris sous 256, vers 07 h 48** (`live-overlap-final-state.json`, `live-overlap-final-capacity.txt`) : capture de la TV, 8 blocs envoyés et 2 écartés ; surveillance active, 7 passages lus, aucune lecture en échec, **aucune affirmation détectée**, donc aucune carte ; une question de récapitulatif répondue en 11,0 s, premier texte à 9,7 s, avec deux citations vidéo. Pic à 159 tâches, aucun refus, aucun redémarrage. Un seul relevé : il ne fonde aucun gain de délai, et ne dit rien d’un film entier.
- **Blocs de capture perdus.** Dans ces essais, 3 puis 2 blocs ont été écartés sous la cause `geometryChanged` (`tv-state.txt`, `live-overlap-final-state.json`). D’après le journal, le rectangle vidéo change pendant une prise d’image quand le panneau s’ouvre ou se ferme, et tout le bloc de 8 s est alors perdu ; la règle est antérieure à la nuit.
- **Correctif de la capture installé sur la TV à 08 h 00, par la supervision.** Seule l’image prise pendant le déplacement du rectangle est laissée de côté ; un vrai changement de contexte vidéo refuse encore le bloc. Le fichier installé a la même empreinte que `tv/capture.py` de l’arbre (`capture-fix-install.txt` ; empreinte locale recalculée par cette session, identique). La capture a repris dans la même session. Essai réel d’environ 47 s, panneau ouvert puis refermé pendant la capture : 5 blocs envoyés, 22 images, 1 image écartée pour déplacement, 0 bloc écarté, 0 erreur ; les cinq passages sont ensuite prêts, paroles et images (`capture-fixed-real-trial.txt`, `capture-fixed-analysis-final.json`). Le panneau y est ouvert par un script, pas à la télécommande.
- **Correctifs écrits dans l’arbre après l’incident**, par d’autres lots que cette rédaction : `deploy/tvlens.service` (`TasksMax=512`), `tests/deploy-unit.test.cjs` (nouveau), `tv/capture.py` et `tests/test_tv_capture_gate.py`, un paragraphe de [installer son serveur](server-installation.md). Suite complète à 07 h 55 sur l’arbre ainsi corrigé : 474 tests Node, 0 échec ; Python 84 dont 1 sauté, puis 15, 17 et 1, 0 échec (`results/suite-node-apres-incident.txt`, `suite-python-apres-incident.txt`). Ces fichiers ont encore été modifiés après elle, jusqu’à 08 h 05 d’après leurs dates. Seuls des contrôles ciblés ont suivi : les tests Python de la TV relancés d’après le journal, 84 dont 1 sauté, sans fichier de sortie ; côté supervision, 20 tests ciblés dont 1 sauté (`capture-targeted-tests.txt`) et le test de l’unité. **Suite complète sur l’arbre final, à 09 h 24** (simulation ou tests hors ligne, aucun fournisseur, aucune commande distante) : 64 fichiers Node, 474 tests, 0 échec ; Python TV 84 dont 1 sauté, puis 15, 17 et 1, 0 échec (`results/suite-node-arbre-final.txt`, `suite-python-arbre-final.txt`). Empreinte de l’arbre à cet instant, 260 fichiers de `adapters app core mcp prototypes runtime scripts server tests tv deploy` : `fe20ad89…f2a28135` (`results/arbre-final-empreinte.json`). Seuls des documents ont été modifiés ensuite.

### Ce que cela ne prouve pas

- **La robustesse du serveur devant un manque de ressources.** Un lecteur indépendant du code (lecture seule, `results/incident-map-failures.json`) a relevé des dettes que personne n’a corrigées : à l’épuisement des descripteurs de fichiers, le lancement d’un rôle Codex fait tomber le serveur (reproduit localement, jamais observé en production) ; le serveur n’a aucun gestionnaire d’erreur non rattrapée ; la vraie cause d’un lancement refusé n’est jamais dite à l’écran ; un refus de lancement de ffmpeg à la réception d’un bloc répond 400, que la TV ne réessaie pas ; après un redémarrage le serveur ne dit pas qu’il a redémarré. Le même lecteur établit que le serveur garde cinq rôles Codex par défaut, sept au plus, et qu’il n’y a pas de fuite de processus (`results/incident-map-lifecycle.json`).
- **La stabilité du serveur installé.** Deux plantages, une limite relevée à chaud, deux essais courts ensuite. Aucun essai long. La supervision l’écrit elle-même : « essai court, pas garantie de stabilité indéfinie ». Rien dans le produit n’empêche un nouvel épuisement des tâches de faire tomber le serveur de la même façon ; d’après le journal, cette garde est proposée, non faite.
- **L’affichage panneau fermé.** Profil `off` ; le protocole natif de [LG : alertes panneau fermé](lg-ambient.md) n’est pas passé. Le compte rendu de la supervision le dit lui-même.
- **Le panneau à la télécommande.** Aucun fichier lu ne montre l’usage des écrans de la nuit sur la TV : question longue, sessions, suppression, vue Surveillance.
- **Une carte sourcée sur la TV.** L’essai n’a détecté aucune affirmation.
- **Le cloisonnement sous Linux au-delà de la connexion.** Aucune consigne neutralisée, aucun cas de refus, aucune sonde adverse dans ces fichiers.
- **Ce que devient une session coupée par un plantage.** Après chaque relance, le serveur n’avait plus de session courante. Les fichiers lus ne disent pas si la session coupée se retrouve, « interrompue », dans la liste des archives, comme les tests hors ligne le montrent (ticket 02).
- **Une question de cinq minutes, une archive rouverte, une suppression, un disque plein** sur le serveur réel.
