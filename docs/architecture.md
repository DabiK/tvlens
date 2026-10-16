# Architecture actuelle

TVLens suit une architecture hexagonale : les règles applicatives dépendent de contrats injectés ; les choix de plateforme, de modèle et de stockage appartiennent aux adaptateurs. Les hôtes `app/main.cjs` (Electron) et `runtime/headless-runtime.cjs` (serveur TV) utilisent les compositions partagées `runtime/session-runtime.cjs`, `runtime/conversation-runtime.cjs` et `runtime/surveillance-runtime.cjs`.

> **État du 13 octobre 2026.** Cette page décrit le code de la branche `codex/tvlens-night-features`, qui n’est ni commitée ni déployée : la TV et le VPS tournent encore sur la version précédente. Ce qui est prouvé, et à quel niveau, est dans [le livrable de la nuit](night-features-delivery.md).

## Organisation

| Couche | Responsabilité | Principaux fichiers |
| --- | --- | --- |
| Domaine applicatif | Session, temps observé, conservation, file de questions, preuves et priorité | `core/session.cjs`, `session-clock.cjs`, `deep-ask.cjs`, `video-tools.cjs` |
| Cas d’usage | Recherche, moments gardés, surveillance, rattrapage et résumé progressif | `core/moment-search.cjs`, `saved-moments.cjs`, `surveillance.cjs`, `viewing-actions.cjs`, `living-recap.cjs` |
| Contrats | Perception, agent, transcription, média, archivage, embeddings, inspection, détection et vérification d’affirmations, bibliothèque de sessions, espace disque | `core/ports.cjs` |
| Adaptateurs sortants | Codex, Whisper, OpenRouter embeddings, fichiers locaux, bibliothèque de sessions, garde disque | `adapters/` |
| Adaptateurs entrants | Capture navigateur/TV, IPC Electron, HTTP et serveur MCP | `app/recording.js`, `app/preload.cjs`, `tv/capture.py`, `server/http.cjs`, `mcp/server.cjs` |
| Présentation | Commandes utilisateur, Direct/Mémoire/Surveillance, cartes en bas à gauche, companion LG chat/frise/surveillance/sessions | `app/renderer.js`, `app/ui/`, `tv/app/` |

`tests/architecture.test.cjs` interdit les dépendances externes dans le cœur. Les vues reçoivent des données et des callbacks ; elles n'appellent pas directement un fournisseur ou le disque.

## De la capture à la réponse

Deux adaptateurs alimentent le même domaine. Sur LG, `tv/capture.py` envoie quatre images espacées d’environ deux secondes et huit secondes d’audio par tranche. `server/http.cjs` authentifie et valide les requêtes ; `RemoteMedia` normalise les fichiers. Le WebM reconstruit avec les images fixes n’est pas une vidéo native. Sur Mac, le chemin Electron suit les étapes ci-dessous.

1. `RollingRecorder` produit un premier segment de 2 secondes, puis des segments de 8 secondes : clip WebM, frames JPEG horodatées et audio WAV. `checkpoint` permet de terminer le segment à l'instant d'une action ciblée.
2. Le processus principal valide les entrées IPC et les transmet à `WatchSession`. `LocalSessionStore` conserve les médias et sérialise les archives.
3. `WatchSession` orchestre deux files FIFO bornées (un travail actif et deux en attente chacune). `LocalTranscriber` transcrit d’abord l’audio du passage sur l’hôte Mac ou VPS et publie le texte immédiatement. `CodexPerception.observeVisual` reçoit ensuite les images et ce texte pour le même intervalle. L’audio du passage suivant peut avancer pendant cette vision. Codex reçoit images et transcription, pas le WAV brut. Les adaptateurs historiques `observe` restent compatibles.
4. `DeepAsk` ancre chaque question à l'envoi, gère la file FIFO (cinq en attente au plus), la progression réelle, l'annulation ciblée et un plafond de traitement de cinq minutes, hors attente. Le plafond appliqué est publié avec chaque question (`job.timeoutMs`) : les clients en dérivent leurs textes et l’écoulé. `TVLENS_QUESTION_TIMEOUT_MS` peut seulement l’abaisser. Chaque question publie aussi ce qu’elle pouvait consulter au moment de son gel (`job.availability`).
5. `CodexSessionAgent` gère la conversation et les preuves externes ; `CodexSessionClient` garde le transport App Server et le fil par session. La perception change de fil à chaque sujet sans relancer le processus. Les outils dynamiques consultent `VideoTools`. L’adaptateur MCP expose les mêmes contrats à des clients externes ; son pont est lancé par Electron, pas par le serveur TV.
6. Les résultats comprennent des citations validées. La relecture utilise les fichiers locaux avec prise en charge des plages d'octets ; les sources externes passent par les contrôles de liens.

La capture reste indépendante des recherches. La file de perception est bornée ; en surcharge, certains passages sont marqués comme non analysés plutôt que de prétendre à une couverture complète. Leur média reste disponible avec la session.

## Mémoire et cycle de vie

Le temps est monotone dans l'ordre d'observation : un retour arrière dans le lecteur ne remonte pas l'horloge TVLens.

**Conservation.** Les médias d’une session sont gardés jusqu’à sa suppression explicite : rien n’expire à cinq minutes, rien n’est nettoyé au démarrage ni à la fermeture. Une durée dans `TVLENS_MEDIA_RETENTION_MS` rétablit une fenêtre glissante ; un segment qui chevauche la borne expire alors lorsqu'il en sort entièrement. Une archive enregistrée « jusqu’à suppression » garde ce contrat même reprise sur un hôte réglé en fenêtre glissante.

**Dossier de session.** `session.json`, `manifest.json`, les médias dans `media/`, les miniatures dans `thumbs/`, et selon l’usage `deep-answers.json`, `living-recap.json`, `surveillance.json`, `embeddings.json`. `SessionLibrary` (`adapters/session-library.cjs`) liste par manifeste, lit, et supprime une session et elle seule. Le format est additif : une archive antérieure, sans manifeste, est listée « texte seul » et n’est ni migrée ni effacée. Un passage indisponible porte son motif (`mediaReason` : `expired`, `missing`, `not-kept`, `unreadable`).

**Vidéo illisible.** Un enregistreur qui reçoit le son mais aucune image écrit un conteneur WebM valide et vide (un en-tête, aucun bloc média). À la réception, `core/clip-container.cjs` lit la structure du conteneur — pas sa taille — et un conteneur vide rend le passage `available: false`, `mediaReason: 'unreadable'`. `available` ne dit que « la vidéo peut être relue » : les fichiers du passage restent sur le disque tels qu’ils sont arrivés, le passage est analysé comme les autres à partir de ses images et de son son, et son réexamen se fait sur les images conservées à la capture, avec une limite dite en premier. Le même repli sert quand `ffmpeg` refuse un clip ou n’en tire aucune image ; la limite dit alors seulement que le réexamen repose sur les images conservées, sans qualifier la vidéo d’illisible. Un `ffmpeg` absent ou tué reste une erreur du décodeur. L’agent voit `mediaReason: "unreadable"` dans ses outils et sait que ce passage reste réexaminable. Ce contrôle ne garantit pas qu’un clip non vide se décode : un fichier abîmé n’est découvert qu’à la relecture ou au réexamen. Il n’est fait qu’à la réception : une archive enregistrée avant lui, ou un passage retrouvé sur le disque après une coupure, n’est pas rejugé.

**Cycle de vie.** Pause/reprise conserve la session, ses résumés et la discussion ; la pause n'ajoute pas de temps observé. « Nouvelle session » et la fermeture de l’application sur Mac, « Terminer la session » et l’arrêt du service sur le serveur, **archivent**. Une archive s’ouvre en lecture seule, horloge figée : questions, frise et relecture restent possibles, la capture ne reprend que sur une reprise explicite. Les questions d’une archive sont rouvertes avec elle ; le fil Codex, éphémère, ne l’est pas : une nouvelle question ouvre un fil neuf. Une session terminée sans passage ni question n’est pas conservée.

**Disque.** `DiskGuard` (`adapters/disk-guard.cjs`) mesure l’espace libre du volume des sessions : sous le plancher (1 Gio par défaut), le passage est refusé avant toute écriture, la capture s’arrête et rien n’est supprimé ; sous l’alerte (2 Gio), l’état dit « espace faible ». Il n’y a aucune éviction automatique.

`SavedMoments` copie explicitement le média dans la bibliothèque des moments gardés, qui ne part pas avec la session. La suppression est une action utilisateur. `LivingRecap` conserve la provenance des chapitres et les textes ; si un média devient indisponible, l'interface désactive la relecture.

## Recherche et réexamen

`MomentSearch` sélectionne l’intervalle et classe les passages (55 % lexical, 45 % similarité). `MomentIndex` crée et réutilise les vecteurs via les ports embeddings/cache. `OpenRouterEmbeddings` appelle `text-embedding-3-small` ; `EmbeddingStore` persiste un index JSON local, pas une base vectorielle serveur.

Quand une clé d’embeddings est configurée, les passages publiés alimentent l’index **en arrière-plan** : un lot à la fois, file bornée, une entrée par passage, envois groupés toutes les trente secondes. Leur texte part donc vers OpenRouter au fil de la session ; `TVLENS_BACKGROUND_INDEX=0` revient à un index alimenté par les seules recherches. Une recherche demande les passages de son préfixe, attend au plus 1,5 s, puis classe lexicalement ce qui manque et l’annonce (`semantic`, avertissement). Une référence temporelle reconnue contourne les embeddings. Sans clé, recherche lexicale ; en cas d’échec du fournisseur, repli lexical avec avertissement. `EmbeddingStore` écrit un journal en ajout seul.

La perception et le résumé vivant passent par `CodexAnalysisAgent` : aucun outil déclaré et web désactivé. Ils ne choisissent pas eux-mêmes de parcourir la mémoire. Voir [les responsabilités et la validation du refactor](refactor-runtime.md).

`VideoTools` fige session, ancrage, liste des passages et bornes, limite le nombre d'appels/inspections, puis valide les citations. Au démarrage de la réponse et avant chaque outil, il relit la version courante de ces mêmes passages ; un journal garde chaque révision remise à l'agent. Aucun passage n'est ajouté après l'envoi de la question. Les baux média empêchent l'effacement d'un passage utilisé par un réexamen en cours.

`ClipInspector` prépare les preuves derrière `ClipInspectionPort`. Dans l'app actuelle, Codex utilise **les planches adaptatives `sheets-diverse`**, avec six frames numérotées et horodatées par planche. Le choix de préparation, FFmpeg et les appels modèle restent hors du domaine. `CachedInspector` réutilise un résultat uniquement quand la question, l'intervalle et l'identité des médias correspondent.

Les stratégies vidéo native ralentie et autres variantes OpenRouter sont conservées pour les expériences historiques. Elles ne sont pas le chemin actif du chat ou de la vision. Les résultats Gemini anciens ne valident pas automatiquement Luna : voir [les comparaisons](strategy-comparison.md).

## Surveillance et résumé progressif

`Surveillance` (`core/surveillance.cjs`) remplace l’ancien mode Auto, retiré. Une consigne libre du spectateur est lue à partir de son activation, passage par passage, du plus ancien au plus récent. Chaque affirmation détectée reçoit un identifiant et finit dans un état explicite : sourcée, indéterminée, relevée (signalement), en erreur, annulée, ou encore en attente. La file est bornée et ne perd rien en silence : un retard ou une panne de lecture sont dits dans l’état.

- **En parallèle du chat.** Le module ne lit aucun indicateur de question. Une question ne suspend ni n’annule la surveillance, et inversement.
- **Deux rôles Codex.** Lecture : ni web ni outil. Vérification : web seul, aucun outil, un poste par défaut (`TVLENS_SURVEILLANCE_WORKERS`, 1 à 3). Un fil neuf par tour.
- **Résultats regroupés.** Un lot de vérification donne au plus une carte, limitée aux affirmations dont la page citée a été ouverte. Un signalement (« Repéré dans la vidéo ») est une observation de la vidéo, sans source web : il ne va jamais dans l’affichage en bas à gauche.
- **Composition commune.** `runtime/surveillance-runtime.cjs` sert les deux hôtes et écrit le registre dans `surveillance.json`. Un agent simulé (`adapters/simulated-surveillance-agent.cjs`) sert les tests et le mode de démonstration.
- **Consigne et chat.** Tant que la surveillance est active, sa consigne est transmise au tour de chat comme un champ à part, jamais dans les données.

Tout cela est prouvé par simulation ; la qualité de la détection avec un vrai modèle n’est pas mesurée. Voir [le livrable](night-features-delivery.md).

`ViewingActions` conserve l'ancrage des actions ciblées et le repère de rattrapage. `LivingRecap` possède une synthèse injectée ; `CodexRecap` reçoit les passages et chapitres sans outils web. Les synthèses de fond peuvent être annulées au profit des questions. Une génération protège contre les résultats tardifs.

## Interface et dépendances

Les logiques propres à l’hôte Mac suivent la forme de `app/window-mode.cjs` et
`app/capture-sources.cjs` : une fabrique reçoit les objets Electron en paramètres et garde tout
l’état mutable dans son instance. Elle ne charge ni Electron, ni les compositions `runtime/`, ni
les adaptateurs substitués par les bancs Mac ; les choix d’environnement lui sont transmis par
`app/main.cjs`. Les bancs remplacent Electron à chaque lancement mais gardent les nouveaux modules
en cache : aucune dépendance Electron ni aucun état d’un lancement ne doit donc vivre au niveau
du module. `main.cjs` conserve la table des canaux et événements (`handle` et `send`), avec une
ligne par canal qui appelle le module ; les gardes du contrat IPC continuent ainsi de lire cette
table dans un seul fichier. Les fabriques se testent sans Electron, avec des objets injectés.

- `ViewingShell` gère la navigation, les états de couverture et le chrome visuel.
- Les modèles de vue purs (`app/ui/job-view.mjs`, `surveillance-view.mjs`, `sessions-view.mjs`, `card-queue.mjs`) sont testés sans DOM ; le chat et la frise sont redessinés par entrée, sans défilement forcé.
- `renderRecapView` rend les snapshots dans le panneau Mémoire et le dialogue compact ; `replay` et `notice` sont injectés.
- `format.js` contient les helpers de présentation ; les textes des modèles sont insérés avec `textContent`.
- Le chat garde un seul arbre DOM entre mode complet et flottant : historique, brouillon et file ne sont pas dupliqués.
- `preload.cjs` expose une API limitée ; les renderers n'ont pas accès directement à Node.

## Données et consommation

En mode Mac, l’audio brut et les médias sont stockés sur le Mac. En mode TV → VPS, la TV envoie images et audio au VPS via Tailscale, et Whisper y transcrit les paroles. Dans les deux modes, images et transcriptions vont à Codex. Les embeddings optionnels envoient du texte à OpenRouter. Les sources web sortent du périmètre local.

`CodexQuota` est informatif. `UsageLedger` conserve les dépenses OpenRouter connues et les montants encore inconnus, sans plafond local. Aucune réserve locale n'interdit les appels ; les limites des fournisseurs restent applicables.

## Sources et hôtes portables

Un agent pour modèle local (`adapters/local-vlm-agent.cjs`, API Ollama) peut remplacer Codex pour la description des passages via `TVLENS_PERCEPTION_BACKEND=local` ; il n'a été testé que contre un faux serveur. Le GX10 reste à valider, débit continu compris. Une caméra + microphone doit produire le contrat `CapturedSegment` existant, avec un média rejouable et des horodatages cohérents.

Les chemins LG → Mac et LG → VPS utilisent la même ingestion HTTP authentifiée. Le lecteur reste dans l’application YouTube native ; le companion webOS alterne chat droit et frise basse. Dictée via le clavier LG, pause/reprise, frise et réponses sur VPS ont été confirmées par l’utilisateur. Le bouton micro physique direct n’est pas détourné.

`core/session-timeline.cjs` projette les passages en cartes contiguës par sujet. `SessionThumbnails` conserve des JPEG réduits dans le dossier `thumbs/` de la session ; ils restent jusqu’à sa suppression. Les questions attachées à une carte gardent leurs bornes malgré de nouvelles captures.

**État interrogé par la TV.** Avec la conservation durable, l’état complet grossit avec la session. `GET /v1/state` reste compatible ; `GET /v1/state?view=chat` et `?view=panel` rendent des vues légères, et `GET /v1/surveillance/overlay` conserve sa projection compacte, ses champs et son contrat
d’ETags ; son retrait est différé selon l’[ADR 0017](adr/0017-retrait-de-l-affichage-ambient-panneau-ferme.md). Chaque réponse porte un `ETag` qui ne change qu’avec un changement publié : une requête avec `If-None-Match` égal reçoit un `304` sans corps. Aucune de ces interrogations ne lit le disque. Le gain mesuré est un gain de transport, sur banc synthétique ; un client TV non mis à jour continue de télécharger l’état complet.

Le serveur Linux exécute `server/main.cjs` sans Electron, sous utilisateur dédié et systemd. Il écoute exclusivement sur l’adresse Tailscale du VPS. Les fournisseurs IA restent distants ; Tailscale protège le transport TV/hôte, pas une promesse d’inférence locale. Les premiers essais séquentiels prenaient 15–22 s par tranche de 8 s. Après séparation et langue française, un essai court de neuf passages mesure 5,18 s de transcription moyenne pour environ 8 s de son, hors vision et attente. Cela ne valide pas un débit soutenu sur une longue session ; voir [validation](validation.md).

La parité d’interface n’est pas complète : marque-pages durables, recherche dédiée, résumé progressif et relecture restent côté Mac. La surveillance et les sessions archivées partagent le même cœur et les mêmes routes ; leurs écrans TV sont écrits dans `tv/app/`, pas encore déployés ni validés sur l’appareil. Les outils de recherche du chat TV utilisent le runtime commun. Une session n’est pas migrée entre les hôtes. Après un redémarrage, l’hôte retrouve ses sessions sur disque, archivées, ou marquées interrompues après un arrêt brutal.

**Affichage TV.** L’affichage ambient panneau fermé est retiré du dépôt conformément à l’[ADR 0017](adr/0017-retrait-de-l-affichage-ambient-panneau-ferme.md).
Les quatre étapes ont retiré page et outils, superviseur et relais, gate de capture, puis intégrations
de page et documents. Le panneau ouvert conserve les cartes sourcées, la file, l’activité, les compteurs
locaux et les réglages `alerts`/`displayMs`, sans appel local `/ambient`. La surveillance démarre et
s’arrête sur le serveur. Ce retrait n’annonce aucun déploiement ; les faits datés restent dans
[LG : retrait et historique](lg-ambient.md).

**Cloisonnement des agents.** Les fils Codex sont ouverts sans environnement d’exécution, dans des dossiers séparés des identifiants, avec une liste blanche d’éléments par rôle ; le vérificateur manuel suit la même voie. Ce cloisonnement n’est pas absolu et n’est mesuré que sur Mac : voir [SECURITY.md](../SECURITY.md).

Voir [runtime LG](lg-remote-runtime.md), [frise](lg-timeline.md), [déploiement VPS](vps-deployment.md) et [Tailscale](lg-tailscale.md). L’inférence GX10, le moteur embarqué TV et les embeddings multimodaux restent à explorer.


## État partiel et configuration audio

`audioStatus` et `visionStatus` distinguent les étapes ; `partial` expose une preuve réellement disponible sans inventer les éléments manquants. Les outils de contexte et la frise acceptent ces preuves partielles. `LivingRecap` attend encore les observations complètes ; le récapitulatif signale les passages partiels exclus. La surveillance, elle, lit un passage dès que ses paroles sont publiées, puis une seule fois de plus quand la description arrive. Une question conserve son ancrage et sa liste de passages. Un résultat tardif portant sur l’un de ces passages est lu à la consultation suivante (démarrage de la réponse, puis chaque outil) ; un passage absent de l’instantané initial n’est jamais ajouté, et rien n’est relu après la fin ou l’annulation de la question.

La transcription continue pendant les questions manuelles. Depuis le 13 octobre 2026, la description visuelle continue elle aussi, un appel à la fois : une question peut durer cinq minutes et ne doit pas priver de description ce qui est capturé entre-temps. `TVLENS_VISION_DURING_ASK=0` rétablit l’ancienne retenue. Chaque passage porte ses horodatages de réception, de début de voie et de publication, ainsi qu'une révision ; l'état expose `latency`, `coverage` (pertes par cause, temps de vision retenu par les questions), `visionGaps` et `audioGaps`. En surcharge audio, la transcription d'un passage saute mais ses images restent décrites tant qu'une place est libre dans la file vision ; au-delà de deux passages sans paroles par rafale, les suivants sont perdus en entier et comptés. Voir [latence et architecture du backend](backend-latency-optimization.md). L’interface affiche capture et analyse, sans prétendre que tous les indicateurs internes sont exposés séparément. La fermeture annule les travaux ; les appels interactifs de réexamen peuvent encore partager le transcripteur avec le fond.

`TranscriptionSettings` persiste la langue du serveur (français par défaut). Le port de transcription reçoit son choix via la composition ; les appels en cours gardent leur langue, et le cache distingue langue + audio. Les observations et réexamens déjà mis en cache ne sont pas recalculés au changement. Le streaming audio n’est pas activé : [essai isolé et limites](audio-stream-probe-20261004.json).

Le résumé cumulatif de sujet vit dans `segment.topicSummary`, hors de
`segment.observation` : il ne constitue pas une preuve du bloc courant.
`core/topic-summary.cjs` possède les bornes du résumé et le choix d’une restitution
compatible avec la sélection. `perceptionContext` fournit le résumé précédent au
port de perception ; l’adaptateur Codex retourne le texte agrégé dans le même
appel que la description actuelle. Le cœur vérifie les limites et assigne les
IDs, conserve l’agrégat lors de l’archivage, et repart du passage actuel à chaque
frontière. La frise et son détail utilisent la même projection, avec un repli
explicitement limité aux extraits quand aucun agrégat ne couvre l’intervalle.
