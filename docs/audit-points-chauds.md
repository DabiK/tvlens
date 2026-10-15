# Audit des points chauds, 15/10

Audit en lecture seule du code à `9d9774e` (branche `refactor/maintenabilite`), fait par Codex (GPT-6.1 Sol, effort xhigh) pour choisir la file « base saine ». Les affirmations clés ont été vérifiées par l'orchestrateur contre le code. Les repères `chemin:ligne` valent pour ce commit ; les tickets qui s'en servent les ont revérifiés à `e92c6a6`.

Je recommande une **file de 18 tickets après T150**, avec les horloges et les tests avant les déplacements de code. Je recommande aussi de **rouvrir seulement cette sélection**, en laissant T145 retenir le reste.

Audit réalisé sur **`9d9774ec32307e9c5ceba030abad2a5a530efc7f`**, branche `refactor/maintenabilite`. Ce SHA était encore `HEAD` au dernier relevé. Les lectures portent sur les blobs committés ; les modifications de la boucle sont exclues. **Aucun test, smoke, `check.mjs`, installation ou script produit n’a été exécuté. Aucun fichier n’a été écrit.** Les commandes proposées ci-dessous sont des critères pour les futurs tickets.

Les coûts sont des estimations : **S**, moins d’une heure de session ; **M**, une session substantielle ; **L**, à redécouper. Ils ne constituent pas des durées observées.

**A. Carte des points chauds à `HEAD`**

Les seuils du dépôt sont bien 400 lignes utiles par fichier, 80 lignes par fonction et une complexité de 15. Les mesures ci-dessous comptent les **lignes physiques**, commentaires et blancs compris ; elles ne mesurent donc pas directement ces seuils. [Standards:11](../docs/standards.md:11)

| Fichier | Lignes physiques | Commits depuis le 15/09 |
|---|---:|---:|
| [tv/app/companion.js:1](../tv/app/companion.js:1) | 1 251 | 7 |
| [tv/app/surveillance-view.js:1](../tv/app/surveillance-view.js:1) | 1 238 | — |
| [runtime/headless-runtime.cjs:1](../runtime/headless-runtime.cjs:1) | 1 113 | 13 |
| [tv/ambient.py:1](../tv/ambient.py:1) | 1 075 | — |
| [scripts/smoke-tv-overlay.mjs:1](../scripts/smoke-tv-overlay.mjs:1) | 1 045 | — |
| [core/surveillance.cjs:1](../core/surveillance.cjs:1) | 921 | — |
| [adapters/codex-session-client.cjs:1](../adapters/codex-session-client.cjs:1) | 874 | 8 |
| [app/renderer.js:1](../app/renderer.js:1) | 854 | 12 |
| [tv/app/sessions-view.js:1](../tv/app/sessions-view.js:1) | 706 | — |
| [scripts/smoke-electron.mjs:1](../scripts/smoke-electron.mjs:1) | 678 | — |
| [runtime/session-runtime.cjs:1](../runtime/session-runtime.cjs:1) | 622 | 9 |
| [scripts/smoke-tv-ambient.mjs:1](../scripts/smoke-tv-ambient.mjs:1) | 612 | — |
| [app/main.cjs:1](../app/main.cjs:1) | 557 | 14 |

Périmètre : code de `app/`, `adapters/`, `core/`, `mcp/`, `runtime/`, `server/`, `tv/` et `scripts/`, hors dépendances, fichiers générés, prototypes, `film/` et `promo/`. « — » signifie que le chiffre de churn n’est pas présenté, pas zéro.

Le classement du churn vient de `git log 9d9774ec --since=2026-09-15 --name-only`, en nombre de commits touchant chaque chemin, sans suivi des renommages. Les autres fichiers produit en tête sont :

| Fichier | Commits |
|---|---:|
| [core/session.cjs:1](../core/session.cjs:1) | 9 |
| [adapters/local-store.cjs:1](../adapters/local-store.cjs:1) | 8 |
| [adapters/codex-perception.cjs:1](../adapters/codex-perception.cjs:1) | 8 |
| [tv/app/index.html:1](../tv/app/index.html:1) | 6 |
| [core/video-tools.cjs:1](../core/video-tools.cjs:1) | 6 |

Le signal le plus net est donc **taille et changements fréquents dans les compositions**, particulièrement `main`, `headless-runtime`, `session-runtime` et le renderer.

Les fonctions les plus longues ont été mesurées par leurs positions dans l’AST, avec le parseur déjà installé, sans exécuter les modules analysés :

| Fonction | Plage | Lignes |
|---|---|---:|
| `createSurveillanceRuntime` | [runtime/surveillance-runtime.cjs:43](../runtime/surveillance-runtime.cjs:43), jusqu’à 547 | 505 |
| `createSessionRuntime` | [runtime/session-runtime.cjs:49](../runtime/session-runtime.cjs:49), jusqu’à 550 | 502 |
| callback de `app.whenReady()` | [app/main.cjs:49](../app/main.cjs:49), jusqu’à 537 | 489 |
| gestionnaire HTTP `handle` | [server/http.cjs:26](../server/http.cjs:26), jusqu’à 291 | 266 |
| `CodexSessionClient.event` | [adapters/codex-session-client.cjs:555](../adapters/codex-session-client.cjs:555), jusqu’à 701 | 147 |
| `jobBlocks` | [app/ui/job-card.js:34](../app/ui/job-card.js:34), jusqu’à 174 | 141 |
| `describeSurveillance` | [app/ui/surveillance-view.mjs:137](../app/ui/surveillance-view.mjs:137), jusqu’à 268 | 132 |
| `CodexSessionClient.run` | [adapters/codex-session-client.cjs:702](../adapters/codex-session-client.cjs:702), jusqu’à 819 | 118 |
| `connect` | [adapters/codex-session-client.cjs:257](../adapters/codex-session-client.cjs:257), jusqu’à 365 | 109 |
| constructeur de `HeadlessRuntime` | [runtime/headless-runtime.cjs:234](../runtime/headless-runtime.cjs:234), jusqu’à 336 | 103 |
| `MomentSearch.search` | [core/moment-search.cjs:48](../core/moment-search.cjs:48), jusqu’à 149 | 102 |
| `DeepAsk.run` | [core/deep-ask.cjs:77](../core/deep-ask.cjs:77), jusqu’à 158 | 82 |

Les enveloppes webOS amplifient encore les fonctions longues : l’IIFE de `companion.js` couvre **903 lignes**, celle de `surveillance-view.js` 1 238. Ce sont des enveloppes de module, pas des fonctions métier homogènes. [companion:349](../tv/app/companion.js:349), [surveillance-view:1](../tv/app/surveillance-view.js:1)

La mesure physique sous-estime inversement certains problèmes : `renderSaved` tient sur une seule ligne très dense. Un classement par longueur de fonction ne suffit pas à l’identifier. [renderer:576](../app/renderer.js:576)

La duplication entre les deux hôtes a déjà nettement reculé :

- La sauvegarde des questions utilise maintenant `createQuestionCheckpoint` des deux côtés. [main:150](../app/main.cjs:150), [headless:263](../runtime/headless-runtime.cjs:263)
- Le préchauffage et la consigne active passent par les fonctions partagées. [main:154](../app/main.cjs:154), [headless:282](../runtime/headless-runtime.cjs:282), [headless:625](../runtime/headless-runtime.cjs:625)
- Les fermetures passent déjà par `closeSession` et `settleQuestions`. Il serait faux de reproposer leur unification. [main:343](../app/main.cjs:343), [headless:809](../runtime/headless-runtime.cjs:809)

Deux duplications restent intéressantes :

| Règle répétée | Preuves | Traitement |
|---|---|---|
| Déduire `watch.asking`, publier et relancer `drain` à la fin des questions | [main:157](../app/main.cjs:157), [headless:284](../runtime/headless-runtime.cjs:284) | Petite porte partagée dans `runtime/`, après caractérisation des différences : filtrage de session côté Mac, fermeture côté serveur. |
| Compléter les lignes de bibliothèque avec les chiffres de la session chargée | [main:304](../app/main.cjs:304), [headless:883](../runtime/headless-runtime.cjs:883) | Extraire éventuellement le calcul commun des compteurs ; conserver les politiques de titre, dates et limite propres aux hôtes. |

T150 dit explicitement que les lignes Mac et serveur restent distinctes. Ce choix préserve leurs réponses ; il laisse néanmoins un calcul commun possible pour une étape ultérieure. [T150:115](../docs/travail/tickets/150-move-the-moment-actions-and-session-rows-of-the-mac-host.md:115)

**Tests dépendant du texte des sources.** Le relevé trouve **14 fichiers de tests JavaScript produit** concernés :

| Zone | Lecteurs |
|---|---|
| Architecture et compositions | [architecture:8](../tests/architecture.test.cjs:8), [architecture-f05:624](../tests/architecture-f05.test.cjs:624), [architecture-f07:579](../tests/architecture-f07.test.cjs:579), [chat-trace:55](../tests/chat-trace.test.cjs:55) |
| Mac | [mac-ipc-contract:91](../tests/mac-ipc-contract.test.cjs:91), [mac-ui:1052](../tests/mac-ui.test.cjs:1052), [recording:32](../tests/recording.test.cjs:32) |
| Questions et sauvegarde | [question-ceiling:207](../tests/question-ceiling.test.cjs:207), [question-checkpoint:208](../tests/question-checkpoint.test.cjs:208), [server-sessions:635](../tests/server-sessions.test.cjs:635) |
| Surveillance et TV | [surveillance:624](../tests/surveillance.test.cjs:624), [tv-ambient-params:105](../tests/tv-ambient-params.test.cjs:105), [tv-app-compat:14](../tests/tv-app-compat.test.cjs:14), [tv-panel:83](../tests/tv-panel.test.cjs:83) |

Ce relevé distingue deux problèmes :

- Les gardes d’architecture peuvent légitimement inspecter les sources.
- Les assertions de comportement ou de placement restent fragiles : présence de `closeSession({` dans un fichier précis, position de `startPreview`, réécriture des imports de l’enregistreur. T015 a rendu plusieurs gardes moins sensibles au format, sans supprimer leur dépendance au placement. [architecture-f07:583](../tests/architecture-f07.test.cjs:583), [mac-ui:1030](../tests/mac-ui.test.cjs:1030), [recording:32](../tests/recording.test.cjs:32)

Le Python possède aussi des gardes de texte, notamment l’interdiction d’un appel vidéo dans le superviseur ambient. [test_tv_ambient.py:216](../tests/test_tv_ambient.py:216)

**Horloges et attentes.** Le repérage statique trouve **33 appels `setTimeout` dans 23 fichiers de tests**, hors les deux tests de harnais ignorés, et **50 appels `setImmediate` dans 34 fichiers**. Ce sont des candidats à examiner, pas 33 défauts prouvés : certaines expirations font précisément partie du comportement testé.

Les cas à traiter en priorité sont plus précis :

| Dépendance | Preuves |
|---|---|
| Timer global simulé dans un test qui utilise HTTP | [server-sessions:708](../tests/server-sessions.test.cjs:708), [server-sessions:771](../tests/server-sessions.test.cjs:771) |
| Attente fixe de 120 ms et attente bornée muette | [review-regressions:24](../tests/review-regressions.test.cjs:24), [review-regressions:132](../tests/review-regressions.test.cjs:132) |
| Attente fixe de 20 ms | [chat-instruction:53](../tests/chat-instruction.test.cjs:53) |
| Attente réelle d’expiration par pas de 10 ms, avec assertion sur le temps écoulé | [question-ceiling:200](../tests/question-ceiling.test.cjs:200) |
| 300 tours de microtasks | [mac-ui:16](../tests/mac-ui.test.cjs:16), [surveillance:8](../tests/surveillance.test.cjs:8) |
| Horloge de test importée depuis un script | [question-ceiling:6](../tests/question-ceiling.test.cjs:6) |
| Vrai timer capturé pour contourner les timers simulés | [mac-ipc-contract:19](../tests/mac-ipc-contract.test.cjs:19), [architecture-f07:22](../tests/architecture-f07.test.cjs:22) |

Les autres fichiers portant des appels `setTimeout` sont `architecture-f06`, `architecture-f08`, `architecture-f10`, `clip-unreadable`, `codex-abandoned-turn`, `codex-confinement`, `codex-stream-decoding`, `codex-thread-rotation`, `local-vlm-agent`, `media-asr-options`, `quality-check`, `reinspection-transcript-reuse`, `server-ingest-path`, `server-surveillance`, `server-warm-up`, `surveillance-runtime`, `transcriber-sharing`, `transcription-language`, `video-research` et `whisper-diagnostics`. Exemples représentatifs : [architecture-f06:35](../tests/architecture-f06.test.cjs:35), [transcriber-sharing:23](../tests/transcriber-sharing.test.cjs:23), [server-surveillance:14](../tests/server-surveillance.test.cjs:14), [whisper-diagnostics:35](../tests/whisper-diagnostics.test.cjs:35)

**Frontières.** Aucun import externe à `core/`, ni accès à `process`, `fetch` ou au disque n’a été trouvé dans les sources du cœur. Cela ne vaut pas exécution des tests d’architecture. Leur couverture reste plate : les parcours de `core/`, `runtime/` et `server/` ne sont pas récursifs. [architecture.test:5](../tests/architecture.test.cjs:5), [architecture.test:15](../tests/architecture.test.cjs:15)

La fuite de frontière la plus concrète est une **mutation du domaine depuis sa composition** : `runtime/` écrit directement `watch.ending`, `watch.accepting` et `watch.asking`. C’est le sujet encore valable de T123. [session-closing:73](../runtime/session-closing.cjs:73), [session-runtime:470](../runtime/session-runtime.cjs:470)

**Cliquet.** Recalcul indépendant des comptages textuels, sur les blobs du SHA figé, sans lancer `metrics.mjs` :

| Mesure | `HEAD` | Baseline | Sens |
|---|---:|---:|---|
| `lignes_longues_prod` | 539 | 539 | maximum |
| `lignes_longues_tests` | 1 717 | 1 717 | maximum |
| `catch_vides_prod` | 40 | 40 | maximum |
| `tests_nommes_par_chantier` | 9 | 9 | maximum |
| `process_env_hors_config` | 8 | 8 | maximum |
| `inner_html` | 2 | 2 | maximum |
| `cas_de_test` | 954 | 813 | minimum |

Définitions et périmètre : [metrics:6](../scripts/quality/metrics.mjs:6), [metrics:47](../scripts/quality/metrics.mjs:47), [metrics:69](../scripts/quality/metrics.mjs:69). Valeurs enregistrées : [baseline:2](../scripts/quality/baseline.json:2).

Trois limites comptent pour les arbitrages :

- `cas_de_test` compte des lignes `test(`, **pas des tests exécutés**, et ignore le Python. [metrics:72](../scripts/quality/metrics.mjs:72)
- Le périmètre de production ignore notamment `tv/*.py` et `scripts/`. La coupe ambient serait donc mal reflétée par ces compteurs. [metrics:6](../scripts/quality/metrics.mjs:6)
- Les deux `innerHTML` sont des gabarits constants ; ce relevé ne prouve aucune insertion de contenu modèle par HTML. [sessions-view:553](../tv/app/sessions-view.js:553), [timeline-view:227](../tv/app/timeline-view.js:227)

Les huit lecteurs de `process.env` hors des trois fichiers autorisés sont `chat-trace`, `codex-confinement`, `codex-session-client`, `codex-verifier`, `codex-video-agent`, `companion-prompt`, `model-settings` et `system-paths`. Ce compteur mesure des **fichiers**, pas des occurrences. [metrics:15](../scripts/quality/metrics.mjs:15), [metrics:67](../scripts/quality/metrics.mjs:67)

**B. Découpage des trois gros fichiers**

Pour le renderer :

| Responsabilité | Plages actuelles | Couture naturelle |
|---|---|---|
| État de page, ressources, regroupement des dessins | [renderer:19](../app/renderer.js:19), jusqu’à 44 | État explicite, ordonnanceur injecté |
| Sources, aperçu, audio, enregistrement, arrêt | [renderer:46](../app/renderer.js:46), jusqu’à 177 | Contrôleur de capture recevant navigateur, bridge et callbacks |
| Relecture, réception d’état, frise, bandeaux | [renderer:178](../app/renderer.js:178), jusqu’à 269 | Réception et présentation séparées de la capture |
| Conversation, vérification, actions déléguées | [renderer:271](../app/renderer.js:271), jusqu’à 369 | Contrôleur de conversation ; constructeurs DOM déjà séparés |
| Fenêtre flottante et choix de source | [renderer:393](../app/renderer.js:393), jusqu’à 473 | Commandes de capture appelant le même contrôleur |
| Archives et suppression | [renderer:475](../app/renderer.js:475), jusqu’à 565 | Contrôleur de bibliothèque |
| Moments gardés et recherche | [renderer:567](../app/renderer.js:567), jusqu’à 602 | Recherche déjà contrôlée ; rendu des moments à isoler |
| Surveillance, registre, préférences et pile | [renderer:604](../app/renderer.js:604), jusqu’à 747 | Contrôleur de panneau, propriétaires explicites des timers |
| Actions instantanées et récapitulatif | [renderer:749](../app/renderer.js:749), jusqu’à 854 | Deux contrôleurs distincts |

Le filet existant couvre les modèles et certains contrôleurs : recherche, réception du récapitulatif, requêtes de chat et contrôles. Il couvre encore plusieurs branchements par lecture du renderer. Les six tests de l’enregistreur passent par une réécriture du source. [mac-ui:673](../tests/mac-ui.test.cjs:673), [mac-ui:891](../tests/mac-ui.test.cjs:891), [mac-ui:1025](../tests/mac-ui.test.cjs:1025), [recording:32](../tests/recording.test.cjs:32)

Pour le companion :

| Responsabilité | Plages actuelles | Couture naturelle |
|---|---|---|
| Modèles de question, politique de polling, fusion, badges | [companion:1](../tv/app/companion.js:1), jusqu’à 348 | Un script classique de modèles, chargeable sans navigateur |
| Export CommonJS et démarrage de page | [companion:349](../tv/app/companion.js:349), jusqu’à 414 | Façade compatible et composition |
| Télécommande, dialogues, clavier LG | [companion:415](../tv/app/companion.js:415), jusqu’à 554 | Contrôleur de navigation |
| Langue, contrôleur local, géométrie, fin de capture | [companion:561](../tv/app/companion.js:561), jusqu’à 685 | Actions nommées des transports |
| Surveillance, réglages et coordination ambient | [companion:686](../tv/app/companion.js:686), jusqu’à 832 | Composition du panneau ; retrait ambient séparé |
| Horloges, cartes, progression et état affiché | [companion:833](../tv/app/companion.js:833), jusqu’à 1104 | Vue de conversation recevant état et actions |
| Réception, boucle de polling, envoi et timers | [companion:1105](../tv/app/companion.js:1105), jusqu’à 1251 | Contrôleur de polling injecté |

Les modèles et le transport sont testés directement dans `tv-panel`; `chat-error-ui` fixe aussi les exports publics. T130 a ajouté 21 tests de navigation par la vraie page. **Ce banc démarre toutefois une page non appairée**, puis active des boutons pour parcourir la colonne : il ne prouve pas le fonctionnement de la boucle appairée. [tv-panel:29](../tests/tv-panel.test.cjs:29), [tv-panel:90](../tests/tv-panel.test.cjs:90), [chat-error-ui:18](../tests/chat-error-ui.test.cjs:18), [tv-remote-navigation:6](../tests/tv-remote-navigation.test.cjs:6), [tv-page:152](../tests/helpers/tv-page.cjs:152)

Pour le runtime headless :

| Responsabilité | Plages actuelles | Couture naturelle |
|---|---|---|
| Projections et historique de surveillance | [headless:29](../runtime/headless-runtime.cjs:29), jusqu’à 231 | **Déjà prévue par T147** |
| Composition, événements, horloges et stockage | [headless:234](../runtime/headless-runtime.cjs:234), jusqu’à 404 | Hôte et dépendances injectées |
| ETag, snapshot, vues et mémoïsation | [headless:405](../runtime/headless-runtime.cjs:405), jusqu’à 565 | T147 pour les calculs ; compteurs dans l’hôte |
| Adoption, démarrage et pause | [headless:566](../runtime/headless-runtime.cjs:566), jusqu’à 647 | Coordinateur de session chargée |
| Admission, préparation, stockage et annulation des blocs | [headless:651](../runtime/headless-runtime.cjs:651), jusqu’à 765 | Propriétaire unique des opérations de capture |
| Questions et commandes de surveillance | [headless:766](../runtime/headless-runtime.cjs:766), jusqu’à 795 ; [1038](../runtime/headless-runtime.cjs:1038)–1073 | Façade des cas d’usage |
| Fin, archives, reprise, suppression, arrêt de l’hôte | [headless:805](../runtime/headless-runtime.cjs:805), jusqu’à 1037 ; [1074](../runtime/headless-runtime.cjs:1074)–1105 | Coordinateur utilisant le protocole partagé |

Le filet est substantiel : vues bornées et absence de lecture disque lors du polling, ingestion, fermetures des deux hôtes, sessions durables, surveillance et préchauffage. Il conserve des attentes sur des champs internes et une garde imposant l’emplacement textuel du protocole. [server-state-views:29](../tests/server-state-views.test.cjs:29), [server-ingest-path:36](../tests/server-ingest-path.test.cjs:36), [architecture-f07:169](../tests/architecture-f07.test.cjs:169), [architecture-f07:187](../tests/architecture-f07.test.cjs:187), [architecture-f07:578](../tests/architecture-f07.test.cjs:578), [server-warm-up:68](../tests/server-warm-up.test.cjs:68)

T121 a livré le décorateur d’inspecteur révocable. **Il n’a pas découpé les 502 lignes de `createSessionRuntime`.** Les fabriques de fournisseurs, la persistance du manifeste, la restauration et la fermeture y restent réunies. [T121:14](../docs/travail/tickets/121-revoke-the-inspector-of-a-closed-session-through-a-core.md:14), [session-runtime:49](../runtime/session-runtime.cjs:49), [session-runtime:320](../runtime/session-runtime.cjs:320), [session-runtime:461](../runtime/session-runtime.cjs:461)

Les tickets déjà décidés évitent de refaire une partie de ce travail :

| Ticket | Livraison déjà prévue |
|---|---|
| T146 | Six fabriques de fournisseurs simulés hors de `main` et de `createSessionRuntime`, sans changement de leurs réponses. [T146:60](../docs/travail/tickets/146-serve-the-simulated-providers-of-the-smoke-mode-from-one.md:60) |
| T147 | Calcul des vues headless dans `runtime/state-views.cjs`, avec au moins 200 lignes retirées de l’hôte. **Ce ticket concerne le serveur.** [T147:15](../docs/travail/tickets/147-compute-the-polled-state-views-of-the-server-host-in-pure.md:15) |
| T148 | Les neuf valeurs de session Mac réunies dans un objet chargé. [T148:15](../docs/travail/tickets/148-hold-the-loaded-mac-session-in-one-object-instead-of-nine.md:15) |
| T149 | Mode de fenêtre et sources capturées dans deux fabriques injectées. [T149:55](../docs/travail/tickets/149-move-the-window-and-capture-source-handlers-of-the-mac-host.md:55) |
| T150 | Actions sur les moments et projection des lignes Mac hors de `main`. [T150:49](../docs/travail/tickets/150-move-the-moment-actions-and-session-rows-of-the-mac-host.md:49) |

Voici le découpage proposé. **N1 à N8 sont des repères du rapport, pas des identifiants à mettre dans le code.** Les chemins nouveaux sont proposés ; aucun n’a été créé.

| Temps | Ticket et titre anglais | Livraison et critères vérifiables | Dépendances |
|---|---|---|---|
| Étendre — Mac | **T016**, rafraîchi | Gardes non vacues ; imports réels des modules importables ; erreurs nommant le fichier si un relevé devient vide. Une entrée à guillemets doubles et import multiligne reste examinée. | T015 terminé |
| Migrer — Mac | **N1 — Move Mac preview and recording into an injected capture controller** | Fabrique proposée `app/ui/capture-controller.mjs`. Déplacer aperçu, audio, observation et arrêt, avec navigateur, recorder, bridge et callbacks injectés. Tests publics : ordre démarrage/arrêt, arrêt simultané exécuté une fois, erreur de capture, arrêt des pistes et fermeture audio. Garder provisoirement les petites fonctions de délégation du renderer. | T016, T021, T129 |
| Contracter — Mac | **N2 — Keep Mac capture resources inside one controller** | Faire passer les commandes flottantes, reprise d’archive et checkpoints par ce contrôleur. Retirer du renderer les propriétaires concurrents `stream`, `context`, `worklet`, `recorder` et `flushes`. Les tests vérifient que les chemins plein/flottant utilisent la même instance et que l’arrêt ne laisse aucune ressource détenue. Remplacer les gardes de placement touchées par une preuve de leur comportement. | N1 |
| Étendre — TV | **N3 — Expose TV chat models through a dedicated classic script** | Script proposé `tv/app/chat-model.js`, sans DOM. Déplacer les modèles et conserver la façade CommonJS de `companion.js`. Même liste d’exports et mêmes résultats sur les tests existants ; une seule définition de chaque modèle. Le chargement par `index.html` et le banc de page inclut le nouveau script. | T130, T132 terminés |
| Migrer — TV | **N4 — Move TV polling into an injected controller** | Contrôleur proposé `tv/app/poll-controller.js`, recevant client, horloge, timers et callbacks. Tests : un seul appel en vol ; kick pendant un appel ; 304 sans redessin ; repli des vues ; backoff ; arrêt des timers. Les tests conduisent la vraie boucle, pas seulement `PollPlan`. | N3, T058 |
| Contracter — TV | **N5 — Keep TV chat cards and submission state inside one view** | Vue proposée `tv/app/chat-view.js` pour cartes, progression, écho d’envoi et résultat d’envoi. Retirer les doubles propriétaires de cartes et d’envoi du companion. Vérifier DOM et actions avec le document minimal du banc TV, enrichi seulement des opérations nécessaires. Conserver navigation et interface `window.tvlensPanel`. | N4 |
| Étendre — domaine/runtime | **T123 — Let a watch session raise its own ending and close its intake** | Deux transitions nommées, sans publication supplémentaire ; tests de leurs effets ; garde contre les écritures directes depuis les compositions. Conserver les deux axes d’état : ne pas inventer une phase exclusive qui empêcherait `ending` et `accepting` de coexister. | T150 ; retrait de T028 à valider |
| Migrer — headless | **N7 — Move headless capture admission into one intake owner** | Module proposé `runtime/capture-intake.cjs` possédant admissions, préparations annulées et stockages en cours. Tests : préparation annulée à la fin, stockage déjà commencé attendu, opération d’une ancienne capture refusée, préparation tardive toujours détenue après le délai. Les réponses HTTP restent identiques. | T066, T123, T147 |
| Contracter — headless | **N8 — Move headless session transitions into one coordinator** | Coordinateur proposé `runtime/headless-session-lifecycle.cjs` pour démarrer, ouvrir, reprendre, terminer et supprimer. L’hôte délègue ; chaque état de transition n’a qu’un propriétaire. Les tests HTTP de fermeture et de sessions gardent leurs assertions. La garde de source suit le module propriétaire du protocole au lieu d’exiger son placement dans `headless-runtime.cjs`. | N7 |

Ces tickets réalisent un premier découpage utile. Ils ne promettent pas de faire passer immédiatement tous ces fichiers sous 400 lignes : les zones surveillance et bibliothèque du renderer, notamment, restent des étapes ultérieures.

**C. Latence**

Il faut distinguer **le fond qui enrichit la mémoire** et **la question qui consulte cette mémoire**.

| Étape | Chemin actuel et instrumentation |
|---|---|
| Capture Mac | `RollingRecorder` ferme un premier passage de 2 s, puis ceux de la durée configurée ; prépare images/audio et attend l’ingestion. [recording:34](../app/recording.js:34), [recording:70](../app/recording.js:70) |
| Capture TV | Tranches de huit secondes, quatre prises d’image, audio et file d’envoi distincte. [capture.py:145](../tv/capture.py:145), [capture.py:167](../tv/capture.py:167) |
| Réception et préparation | HTTP admet le bloc avant l’assemblage ; `RemoteMedia` mesure `assembleMs`. [http:252](../server/http.cjs:252), [remote-media:119](../adapters/remote-media.cjs:119) |
| Stockage et attente audio | `WatchSession` date la réception avant le stockage, puis le démarrage de transcription. [session:87](../core/session.cjs:87), [session:101](../core/session.cjs:101), [session:270](../core/session.cjs:270) |
| Transcription | Whisper local ; durée et diagnostics d’étapes dans ses métriques. La transcription est publiée avant la vision. [local-transcriber:37](../adapters/local-transcriber.cjs:37), [local-transcriber:105](../adapters/local-transcriber.cjs:105), [session:282](../core/session.cjs:282) |
| Vision | Attente, démarrage et publication séparément datés ; images et transcription vont au modèle. [session:172](../core/session.cjs:172), [session:312](../core/session.cjs:312), [session:341](../core/session.cjs:341) |
| Question | Ancrage et disponibilité figés à l’envoi ; attente dans la file puis construction du contexte. Elle n’attend pas automatiquement que toute la capture précédente soit analysée. [deep-ask:62](../core/deep-ask.cjs:62), [deep-ask:94](../core/deep-ask.cjs:94) |
| Modèle de réponse | Préparation du client, démarrage du tour, progression, outils, validation des preuves. [codex-session-agent:73](../adapters/codex-session-agent.cjs:73), [codex-session-client:769](../adapters/codex-session-client.cjs:769), [deep-ask:120](../core/deep-ask.cjs:120) |
| Affichage Mac | État poussé, dessin regroupé par frame avec timer de secours à 100 ms. [renderer:40](../app/renderer.js:40), [renderer:317](../app/renderer.js:317) |
| Affichage TV | Polling actif à 250 ms, inactif à 1 s, backoff maximal de 8 s ; réception puis rendu. [companion:25](../tv/app/companion.js:25), [companion:1106](../tv/app/companion.js:1106), [companion:1143](../tv/app/companion.js:1143) |

La question écrite n’est pas transcrite par Whisper : celui-ci transcrit le programme capturé. Le code reçoit du texte issu du champ LG ; il ne permet pas de mesurer ici la latence interne de sa dictée. [companion:429](../tv/app/companion.js:429), [companion:1187](../tv/app/companion.js:1187)

`core/latency-trace.cjs` mesure déjà huit grandeurs par passage : durée du bloc, arrivée après fermeture, attente audio, durée audio, attente vision, durée vision, publication du transcript après fermeture et disponibilité complète après fermeture. Son résumé porte par défaut sur les 40 derniers passages, avec nombre, moyenne et maximum. [latency-trace:4](../core/latency-trace.cjs:4), [latency-trace:12](../core/latency-trace.cjs:12)

Ses appelants réels sont :

- `WatchSession.snapshot()`, qui publie `latency`. [session:487](../core/session.cjs:487)
- Les tests de latence, avec horloge conduite et valeurs attendues. [session-latency:4](../tests/session-latency.test.cjs:4), [session-latency:38](../tests/session-latency.test.cjs:38)
- Le banc backend, qui fabrique des passages portant ces champs pour ses mesures locales. Ce banc mesure le temps machine réel et peut écrire une sortie ; il n’a pas été lancé. [bench-backend:2](../scripts/bench-backend.cjs:2), [bench-backend:39](../scripts/bench-backend.cjs:39)

La question possède aussi `waitMs`, `contextMs`, premières progressions/texte/résultat utile, durée de traitement, durée depuis acceptation et durées d’outils. [deep-ask:149](../core/deep-ask.cjs:149), [video-tools:121](../core/video-tools.cjs:121)

Il manque surtout :

1. **Une corrélation continue** entre passage, question, publication, réception client et rendu.
2. **Le délai de livraison à la vue**, puis le rendu effectif ; `stats.renders` est un compteur, pas une durée. [companion:1047](../tv/app/companion.js:1047)
3. **Une sortie commune et stable** réunissant ces mesures. La trace actuelle est une trace chat conditionnelle, horodatée à l’horloge murale et écrite sur stderr. [chat-trace:40](../adapters/chat-trace.cjs:40)
4. Une séparation explicite entre temps du passage, temps mural serveur et temps monotone client. La TV extrapole déjà correctement l’heure serveur avec un delta monotone ; cette précaution doit être conservée. [companion:842](../tv/app/companion.js:842)

Je propose **un seul ticket de mesure** :

**N6 — Report deterministic capture-to-display latency**

- **Livraison :** un scénario hors ligne conduisant capture simulée, perception à deux voies, question et livraison aux vues Mac/TV ; une sortie tableau français et une sortie JSON versionnée, sur stdout par défaut.
- **Horloges :** `manualClock` et doublures différées ; aucun fournisseur, binaire média ou sommeil réel pour faire avancer le scénario.
- **Trois cas bornés :** mémoire prête ; audio/vision en retard ; question attendant derrière une autre. Rapporter séparément premier texte utile et réponse finale.
- **Champs :** identifiants stables, fermeture/réception du passage, attente et traitement audio/vision, acceptation/démarrage de question, premier texte, fin validée, réception client et application par la vue.
- **Critères :** mêmes valeurs simulées sur deux exécutions ; une augmentation contrôlée d’un délai apparaît dans les seules mesures attendues ; 304 sans nouveau rendu ; attente de file distincte du traitement ; champs manquants rendus `null`, jamais zéro inventé ; aucune minuterie restante.
- **Dépendances :** T058, T066, T146, N2 et N5.
- **Limite annoncée :** mesure déterministe de l’ordonnancement et de la remise à la vue. Elle ne mesure ni le débit d’un vrai modèle ni l’apparition physique des pixels sur la TV.

Ce ticket passe avant toute optimisation de latence. Il donnera une référence comparable avant les deux derniers déplacements headless.

**D. Coupes**

| Coupe | Verdict à `HEAD` | Volume et dépendances | Décision |
|---|---|---|---|
| Ambient panneau fermé | **Toujours valable**, mais trop large pour un simple nettoyage | 10 fichiers dédiés, **3 092 lignes**, plus 3 fichiers de tests dédiés, **1 561 lignes et 78 cas déclarés**. Nombreuses intégrations partagées à retirer séparément. | Oui |
| T100 | **Valable, à rafraîchir après T147** | Deux éléments réellement morts, exports inutiles et déplacement d’une fonction temporelle de 11 lignes ; test de caractérisation et garde d’import à ajouter. | Réouverture sélective et retrait de T028 |
| T101 | **Valable, à rafraîchir après T130/T132** | 19 lignes de branche/alias supprimables dans deux fichiers ; cinq fichiers touchés en comptant ignore et commentaires. Aucun cas de test à supprimer. | Réouverture sélective et retrait de T028 |
| T139 | **Valable, à rafraîchir** | 7 fichiers complets, **356 lignes**, deux helpers du vérificateur, trois entrées npm et cinq cas de test. | Oui |
| T007 | **Toujours valable**, mais ne coupe aucun code produit | Deux fichiers à créer, outil et tests ; volume futur inconnu. Sans T012, le lanceur reste inutilisé par les commandes courantes. | Relecture de l’exception harnais |
| T098 | **Urgent et petit**, critère 3 à corriger | Cinq renommages npm, deux documents d’instructions, un test nouveau ; aucune entrée npm retirée. | Exception au critère 3 à accepter |

Pour **ambient**, le code dédié est :

- `tv/ambient.py` : 1 075 lignes ; page, style et manifeste ambient : 266 lignes ; relais natif : 270 lignes. [ambient.py:1](../tv/ambient.py:1), [ambient.js:1](../tv/app/ambient.js:1), [ambient_relay.py:1](../prototypes/lg-remote/runtime/ambient_relay.py:1)
- Construction, sonde, simulation et smoke dédiés : 1 481 lignes. [package-tv-ambient:1](../scripts/package-tv-ambient.mjs:1), [probe-tv-ambient-capture:1](../scripts/probe-tv-ambient-capture.mjs:1), [simulate-tv-ambient:1](../scripts/simulate-tv-ambient.mjs:1), [smoke-tv-ambient:1](../scripts/smoke-tv-ambient.mjs:1)
- Tests dédiés : 55 Python superviseur, 17 Python relais et 6 JavaScript paramètres. [test_tv_ambient:1](../tests/test_tv_ambient.py:1), [test_ambient_relay:1](../prototypes/lg-remote/test_ambient_relay.py:1), [tv-ambient-params:1](../tests/tv-ambient-params.test.cjs:1)

Le profil livré reste explicitement `off`. Cela prouve son inactivité par défaut dans le code, pas la configuration actuelle d’une TV. [ambient.py:58](../tv/ambient.py:58)

Les dépendances supplémentaires comprennent `AmbientController` et ses routes, le gate de capture, la coordination du panneau natif, les appels `/ambient` du companion et la présentation des réglages. Les cartes du **panneau ouvert** utilisent encore `surveillance-overlay.js` : supprimer ce fichier entier serait incorrect. [controller.py:73](../tv/controller.py:73), [controller.py:292](../tv/controller.py:292), [capture.py:7](../tv/capture.py:7), [panel.py:122](../prototypes/lg-remote/runtime/panel.py:122), [companion:748](../tv/app/companion.js:748)

Je recommande de séparer le retrait de l’interface/construction du retrait superviseur/relais/gate. Le volume exact supprimable dans les fichiers partagés dépend de cette décision ; il n’est pas établi ici.

Pour **T100**, `needsInspection` n’a toujours aucun appelant, `OPEN_ACTIONS` n’est toujours pas lu et la recherche importe toujours la session pour sa fonction temporelle. [deep-ask:2](../core/deep-ask.cjs:2), [codex-confinement:442](../adapters/codex-confinement.cjs:442), [moment-search:3](../core/moment-search.cjs:3), [session:512](../core/session.cjs:512)

Deux rafraîchissements sont nécessaires :

- T147 impose provisoirement de préserver les réexports, dont `VIEWS` ; T100 doit inventorier ses lecteurs **après** cette livraison. [T147:67](../docs/travail/tickets/147-compute-the-polled-state-views-of-the-server-host-in-pure.md:67)
- Les critères d’absence doivent exclure les documents historiques qui nomment précisément le code retiré, dont l’audit. Sinon ils échouent sans dépendance restante dans le produit. [T100:111](../docs/travail/tickets/100-remove-dead-exports-and-move-the-temporal-target-out-of-the.md:111), [audit:3421](../docs/audit-maintenabilite.md:3421)

Pour **T101**, la branche du dialogue est bien inaccessible par le chemin clavier courant : `dialogKeys` rend `true` avant l’appel à `timeline.handleKey`. Les 13 lignes de cette branche et les six lignes d’alias/commentaire sont encore présentes. [companion:445](../tv/app/companion.js:445), [companion:470](../tv/app/companion.js:470), [timeline-view:390](../tv/app/timeline-view.js:390), [surveillance-overlay:494](../tv/app/surveillance-overlay.js:494)

La phrase du ticket « aucun test ne pilote ce dialogue » a vieilli : T130 le teste maintenant. Ces tests doivent être conservés comme preuve de la suppression. [T101:45](../docs/travail/tickets/101-remove-unreachable-tv-panel-code-and-let-test-fixtures.md:45), [tv-remote-navigation:173](../tests/tv-remote-navigation.test.cjs:173)

Pour **T139**, les sept fichiers et leurs usages historiques sont toujours présents ; les hôtes actifs utilisent les compositions et clients actuels. Les cinq tests visent bien les deux adaptateurs hérités. [openrouter:8](../adapters/openrouter.cjs:8), [codex-video-agent:1](../adapters/codex-video-agent.cjs:1), [codex-verifier:18](../adapters/codex-verifier.cjs:18), [adapters.test:25](../tests/adapters.test.cjs:25), [chat-codex:22](../tests/chat-codex.test.cjs:22)

Le ticket autorise une baisse de cinq du plancher si nécessaire. **À ce SHA, 954 − 5 reste supérieur à 813 : aucune baisse ne serait nécessaire.** Cette marge devra être remesurée après T150, car la boucle peut resserrer le plancher entre-temps. Il faut aussi retirer les critères supposant déjà présents les tests et l’inventaire de scripts de tickets encore parqués. [T139:112](../docs/travail/tickets/139-remove-the-legacy-openrouter-and-codex-exec-adapters-and-the.md:112), [T139:158](../docs/travail/tickets/139-remove-the-legacy-openrouter-and-codex-exec-adapters-and-the.md:158)

Pour **T007**, le besoin reste réel : `npm test` n’a pas de délai propre et `check` possède seulement un budget global de vingt minutes. Mais je ne le juge pas indispensable aux refactors retenus : les corrections directes des attentes sont prioritaires, et le contrôle actuel est déjà globalement borné. L’absence actuelle de blocage n’a pas été testée. [package:11](../package.json:11), [check:27](../scripts/check.mjs:27), [T007:14](../docs/travail/tickets/007-add-a-test-launcher-that-stops-and-names-a-test-file-that.md:14)

Pour **T098**, les cinq noms incohérents sont toujours là. Son critère 3 ne peut pas réussir tel quel : l’audit historique contient plusieurs occurrences des anciens noms, alors que le ticket demande de laisser les rapports historiques inchangés. **J’accepte la décision proposée : exclure `docs/audit-maintenabilite.md` de ce critère.** [package:13](../package.json:13), [T098:73](../docs/travail/tickets/098-give-every-paying-npm-script-the-live-suffix-and-test-the.md:73), [T098:85](../docs/travail/tickets/098-give-every-paying-npm-script-the-live-suffix-and-test-the.md:85), [audit:3183](../docs/audit-maintenabilite.md:3183)

**E. Tickets parqués à forte valeur**

Le parcours des en-têtes trouve **125 tickets portant T145 dans `bloque_par`**, soit **126 fiches en comptant T145 lui-même**. Le verrou n’est pas une session d’implémentation : son texte prévoit une relecture des fiches contre le code laissé par le plan court. [T145:15](../docs/travail/tickets/145-hold-the-full-remediation-queue-until-the-owner-reopens-it.md:15), [T145:31](../docs/travail/tickets/145-hold-the-full-remediation-queue-until-the-owner-reopens-it.md:31)

Les revalidations de nuit ont été utilisées comme pistes, puis corrigées contre ce SHA. En particulier, le verdict de L03 sur Prettier est dépassé, et les anciens repères de T066, T100 et T101 ne sont plus utilisables directement. [L03:17](#) (revalidation de nuit, L03.md:17), [L06:16](#) (revalidation de nuit, L06.md:16), [L09:27](#) (revalidation de nuit, L09.md:27)

Voici les candidats que je retiens pour cette file ou sa réserve immédiate. Tous sont `harnais: non`.

| Ticket | Valeur | Coût | Risque | État et vérification à `HEAD` |
|---|---|---|---|---|
| T098 | Forte | S | Faible | **À rafraîchir** : critère 3 et nombre de scripts ; défaut intact. [package:13](../package.json:13) |
| T055 | Forte | M | Faible | **À rafraîchir** : helpers absents, comptages de tests anciens ; fondation utile, mais il conserve volontairement certaines pauses fixes. [T055:75](../docs/travail/tickets/055-share-the-wait-helpers-of-the-tests-and-make-every-bounded.md:75) |
| T058 | Forte | M | Moyen | **À rafraîchir** : horloges toujours dupliquées et import depuis le script ; dépend de T055. [question-ceiling:6](../tests/question-ceiling.test.cjs:6), [moment-index:17](../tests/moment-index.test.cjs:17) |
| T021 | Forte | M | Faible | **Tel quel sur le fond** : six scénarios et chirurgie du source toujours présents ; actualiser les lignes. [recording.test:32](../tests/recording.test.cjs:32) |
| T066 | Forte | M | Moyen | **À réécrire dans son périmètre** : injecter dans `question-checkpoint`, puis câbler les deux hôtes ; plus dans d’anciennes méthodes disparues. [question-checkpoint:11](../runtime/question-checkpoint.cjs:11) |
| T129 | Forte | M | Moyen | **À rafraîchir** : les trois lectures non gardées subsistent ; réduire les dépendances de banc à celles réellement nécessaires. [renderer:315](../app/renderer.js:315), [renderer:509](../app/renderer.js:509) |
| T046 | Forte | M | Moyen | **À rafraîchir** : le `catch` avale encore les exceptions du gestionnaire ; T028 est une dépendance de chantier à réexaminer. [codex-rpc:67](../adapters/codex-rpc.cjs:67) |
| T016 | Forte | M | Faible | **À rafraîchir** : les boucles de relevé d’imports et d’IDs restent vacuement satisfaites si leur motif ne trouve rien. [mac-ui:1056](../tests/mac-ui.test.cjs:1056), [mac-ui:1066](../tests/mac-ui.test.cjs:1066) |
| T123 | Forte | M | Moyen | **À rafraîchir** : transitions toujours écrites depuis `runtime/` ; ne pas annoncer que L11 a déjà supprimé les affectations de `asking`. [session-runtime:470](../runtime/session-runtime.cjs:470) |
| T100 | Forte | M | Faible | **À rafraîchir après T147** : couplage recherche/session et code mort encore présents ; critères d’absence à resserrer sur le code. [moment-search:3](../core/moment-search.cjs:3) |
| T101 | Moyenne | S | Faible | **À rafraîchir** : coupe valable ; le dialogue dispose désormais de tests. [timeline-view:390](../tv/app/timeline-view.js:390), [tv-remote-navigation:173](../tests/tv-remote-navigation.test.cjs:173) |
| T009 | Moyenne | S | Faible | **À rafraîchir** : prérequis ffmpeg encore inégalement traités. [video-research:60](../tests/video-research.test.cjs:60), [clip-unreadable:130](../tests/clip-unreadable.test.cjs:130) |
| T010 | Forte | M | Moyen | **À rafraîchir** : choix du vrai home et liens de caches encore dans le confinement, même si le client sait recevoir un faux transport. [codex-confinement:237](../adapters/codex-confinement.cjs:237), [codex-session-client:116](../adapters/codex-session-client.cjs:116) |
| T099 | Forte | M | Moyen | **À rafraîchir après T150** : packager toujours fondé sur `dir: "."` et exclusions ; fermeture des imports et volume à recalculer. Aucun contenu de paquet n’a été inspecté. [package.mjs:2](../scripts/package.mjs:2) |
| T120 | Moyenne | S | Faible | **Tel quel sur le fond** : bon petit filet des règles pures de surveillance ; repères à actualiser. [surveillance:181](../core/surveillance.cjs:181), [surveillance:220](../core/surveillance.cjs:220) |
| T122 | Forte | M | Moyen | **À rafraîchir** : validation des preuves toujours concentrée dans `DeepAsk.run` ; excellente réserve pour le cœur. [deep-ask:120](../core/deep-ask.cjs:120) |
| T131 | Moyenne | M | Faible | **Tel quel sur le fond** : miniature hors transport partagé et trois routes littérales restantes. [remote-client:116](../tv/app/remote-client.js:116), [companion:576](../tv/app/companion.js:576), [sessions-view:481](../tv/app/sessions-view.js:481) |
| T133 | Forte | M | Moyen | **À rafraîchir selon la décision ambient** : lancements et arrêts enfants dupliqués ; chemins de layout fixés dans le handler. [controller.py:54](../tv/controller.py:54), [controller.py:130](../tv/controller.py:130), [controller.py:327](../tv/controller.py:327) |

Je laisse hors de la file immédiate :

- Les renommages et rangements T078–T086 : gain de navigation, mais peu de protection supplémentaire avant ces refactors. [INDEX:86](../docs/travail/tickets/INDEX.md:86)
- Le grand passage formatage/lint/types : dépendances nombreuses et plusieurs tickets de harnais ; T026 est déjà livré, mais cela ne rend pas T028 automatiquement prêt. [INDEX:35](../docs/travail/tickets/INDEX.md:35)
- Les barrières générales T071–T074 : utiles, mais l’ensemble disque/session/hôte dépasse le coût d’une petite stabilisation. T073 suppose déjà la barrière T072 et décrit encore les anciens champs du checkpoint. [T073:25](../docs/travail/tickets/073-give-the-server-host-a-barrier-that-resolves-once-nothing-is.md:25), [T073:34](../docs/travail/tickets/073-give-the-server-host-a-barrier-that-resolves-once-nothing-is.md:34)
- T096–T097 tant que le sort d’ambient n’est pas tranché ; les fiabiliser avant de les supprimer serait du travail perdu. [INDEX:104](../docs/travail/tickets/INDEX.md:104)
- Les travaux documentaires et de livraison non requis par les extractions, ainsi que T138/T140 qui attendent une décision distincte. [INDEX:116](../docs/travail/tickets/INDEX.md:116), [INDEX:146](../docs/travail/tickets/INDEX.md:146)
- T007/T012 et T139 **tels qu’écrits**, parce qu’ils ouvrent du travail de harnais qui n’est pas indispensable à cette sélection. T139 mérite néanmoins une décision de suppression, puis un nouveau cadrage.

**F. File finale après T150**

Les dix tickets existants doivent être relus et leur en-tête corrigé avant lancement. **Il ne faut pas simplement terminer T145**, ce qui libérerait aussi les autres fiches encore bloquées par lui.

Les critères des tickets nouveaux sont détaillés en B et C. Pour les tickets existants, conserver les critères comportementaux de leurs fiches et corriger les repères ou prérequis indiqués ci-dessus. Les commandes de validation futures sont celles de chaque fiche, exécutées en séquentiel.

| Ordre | ID et titre anglais | Valeur | Coût | Dépendances utiles | Harnais | Décision propriétaire | État |
|---:|---|---|---|---|---|---|---|
| 1 | **T098 — Give every paying npm script the :live suffix and test the rule** | Évite qu’une commande présentée comme un test consomme du quota sans le signaler. | S | T150 ; ouverture sélective | Non | Exception au critère 3 | À rafraîchir |
| 2 | **T055 — Share the wait helpers of the tests and make every bounded wait fail aloud** | Remplace les attentes muettes par des échecs nommant le fait manquant. | M | Retirer T028 après cadrage | Non | Ouverture sélective | À rafraîchir |
| 3 | **T058 — Share the simulated clocks of the tests instead of importing one from a script** | Fournit l’horloge commune aux corrections de timers et à la mesure de latence. | M | T055 | Non | Ouverture sélective | À rafraîchir |
| 4 | **T021 — Import the rolling recorder in its tests instead of rewriting its source** | Protège l’extraction de capture avec le vrai module et un environnement maîtrisé. | M | Ouverture sélective | Non | Ouverture sélective | Tel quel sur le fond |
| 5 | **T066 — Drive the question checkpoint with injected timers** | Supprime le gel des timers HTTP dans les tests de sauvegarde. | M | T055, T058, T118 terminé | Non | Nouveau périmètre partagé | À rafraîchir |
| 6 | **T129 — Keep a pushed state from being overwritten by an older read in the Mac window** | Corrige une course pouvant faire reculer ou disparaître une carte de question. | M | T055 ; bancs existants | Non | Dépendances réduites à valider | À rafraîchir |
| 7 | **T046 — Reject the active Codex turn when its event handler throws** | Termine explicitement une question dont le gestionnaire a échoué. | M | Retirer T028 après cadrage | Non | Ouverture sélective | À rafraîchir |
| 8 | **T016 — Make the static guards of the Mac renderer fail when they scan nothing** | Empêche qu’un déplacement rende silencieusement les gardes inutiles. | M | T015 terminé | Non | Ouverture sélective | À rafraîchir |
| 9 | **T123 — Let a watch session raise its own ending and close its intake** | Rend au domaine la propriété de ses transitions de fermeture. | M | T150 ; retrait de T028 | Non | Ouverture sélective | À rafraîchir |
| 10 | **T100 — Remove dead exports and move the temporal target out of the session module** | Coupe du code mort et la dépendance inversée de la recherche envers la session. | M | T147 ; retrait de T028 | Non | Critères sur documents historiques | À rafraîchir |
| 11 | **NOUVEAU N1 — Move Mac preview and recording into an injected capture controller** | Rend la capture testable sans lancer toute la fenêtre. | M | T016, T021, T129 | Non | Aucune autre | À écrire |
| 12 | **NOUVEAU N2 — Keep Mac capture resources inside one controller** | Élimine les propriétaires concurrents des ressources de capture. | M | N1 | Non | Aucune autre | À écrire |
| 13 | **NOUVEAU N3 — Expose TV chat models through a dedicated classic script** | Sépare les règles testables du démarrage et du DOM du companion. | M | T130, T132 terminés | Non | Aucune autre | À écrire |
| 14 | **NOUVEAU N4 — Move TV polling into an injected controller** | Teste la vraie boucle appairée avec réseau et temps contrôlés. | M | N3, T058 | Non | Aucune autre | À écrire |
| 15 | **NOUVEAU N5 — Keep TV chat cards and submission state inside one view** | Réunit l’état et le rendu de la conversation dans un module vérifiable. | M | N4 | Non | Aucune autre | À écrire |
| 16 | **NOUVEAU N6 — Report deterministic capture-to-display latency** | Établit une référence lisible avant toute optimisation et avant les derniers déplacements runtime. | M | T058, T066, T146, N2, N5 | Non | Aucune autre | À écrire |
| 17 | **NOUVEAU N7 — Move headless capture admission into one intake owner** | Réduit le risque de stocker un bloc dans une session ou une capture déjà remplacée. | M | T066, T123, T147 | Non | Aucune autre | À écrire |
| 18 | **NOUVEAU N8 — Move headless session transitions into one coordinator** | Isole le cycle de vie restant après la sortie des vues et de l’ingestion. | M | N7 | Non | Aucune autre | À écrire |

Pour T066 et T129, je ne réactive pas toute leur ancienne chaîne T057/T059/T062/T063/T064 : leurs bancs actuels existent déjà. Le rafraîchissement doit démontrer qu’ils peuvent utiliser les helpers T055/T058 et les fixtures présentes ; si un prérequis s’avère réellement nécessaire, il faut le nommer et redécouper, sans lancer toute la chaîne par défaut. Les dépendances anciennes sont visibles dans leurs en-têtes. [T066:5](../docs/travail/tickets/066-drive-the-question-checkpoint-of-the-server-host-with-an.md:5), [T129:5](../docs/travail/tickets/129-keep-a-pushed-state-from-being-overwritten-by-an-older-read.md:5)

Les arbitrages à trancher sont les suivants :

1. **Rouvrir seulement ces 18 tickets, en laissant T145 bloquer le reste ?**  
   **Recommandation : oui.** Retirer T145 des seules fiches retenues ; ne pas terminer globalement le verrou.

2. **Retirer les dépendances de chantier T028 et les dépendances de helpers devenues inutiles, après relecture des fiches retenues ?**  
   **Recommandation : oui.** Garder uniquement les prérequis nécessaires à leurs critères actuels ; le formatage global ne doit pas retenir ces corrections locales.

3. **Exclure `docs/audit-maintenabilite.md` du critère 3 de T098, en conservant ce rapport historique inchangé ?**  
   **Recommandation : oui.** Appliquer la même distinction entre code actif et références historiques aux critères d’absence de T100 et T139.

4. **Supprimer définitivement l’affichage ambient panneau fermé, son superviseur, son relais et ses outils dédiés, tout en conservant la surveillance et les cartes du panneau ouvert ?**  
   **Recommandation : oui**, avec deux tickets de retrait distincts. Ne pas supprimer `surveillance-overlay.js` en bloc.

5. **Supprimer les deux adaptateurs hérités, leurs cinq scripts d’évaluation, trois entrées npm et cinq tests, en acceptant la perte de ces évaluations historiques ?**  
   **Recommandation : oui.** Rafraîchir T139 après T150 ; ne modifier le plancher que si le comptage au début du ticket le rend strictement nécessaire, avec l’autorisation explicite correspondante.

6. **Ajouter T007 et T012 à cette file pour installer puis brancher le lanceur de tests ?**  
   **Recommandation : pas dans ces 18 tickets.** Leur apport opérationnel est réel, mais T007 seul resterait inutilisé et le contrôle actuel possède déjà son plafond global. Les corrections ciblées des attentes passent d’abord.