# Architecture hexagonale

Le domaine dépend de contrats, jamais des choix de plateforme ou de modèle.
La composition des dépendances reste dans `app/main.cjs`.

| Élément | Responsabilité | Dépendances permises |
| --- | --- | --- |
| `core/session.cjs` | Ingestion ordonnée, fenêtre de mémoire, priorité Ask, sélection temporelle, validation des références | Contrats injectés uniquement |
| `core/ports.cjs` | Contrats perception, réponse, média, archivage, horloge | Aucune |
| `adapters/openrouter.cjs` | HTTP, contenu multimodal, prompts, validation JSON, erreurs fournisseur | API OpenRouter, runtime Node |
| `adapters/local-store.cjs` | Fichiers de passages et archives, expiration, réponse média avec plages d’octets | Système de fichiers Node |
| `adapters/config.cjs` | Lecture de configuration et cache chiffré de la clé | Fichiers, chiffrement injecté par l’hôte |
| `core/verification.cjs` | Vérification d’une affirmation et contrôle des preuves | `VerificationPort` injecté uniquement |
| `adapters/codex-verifier.cjs` | Recherche externe par CLI isolé, sortie structurée | Processus Codex, fichiers temporaires |
| `app/recording.js` et `audio-worklet.js` | Adaptateur de capture navigateur : WebM, images JPEG, audio WAV | API navigateur |
| `app/main.cjs` | Composition Electron, contrôle IPC, permissions, cycle de vie | Domaine et adaptateurs |
| `app/renderer.js` | Affichage et commandes utilisateur | Pont IPC exposé par preload |

Les entrées applicatives sont `ingest`, `ask`, `stop`, `prune`.
L’essai séparé de vérification expose `VerificationService.verify({ claim, context })`;
voir [le contrat et l’isolation](verification.md). L’UI le déclenche via un pont IPC
explicite; sa progression et ses résultats rejoignent la conversation Ask.
L’événement de sortie `onChange(snapshot)` permet à toute interface de suivre la session.
La mémoire ne connaît ni fenêtre Electron, ni clé API, ni URL OpenRouter, ni chemin disque.

Pour une cible GX10, remplacer `PerceptionPort` et `AnswerPort` par des adaptateurs
locaux. Le protocole des modèles, leur traitement des images et leurs contraintes
audio appartiennent à ces adaptateurs. Pour une télévision, remplacer la capture
navigateur par caméra + microphone produisant le même contrat `CapturedSegment`.
Un hôte serveur peut utiliser le même domaine et exposer les commandes à une
interface web. Ces adaptateurs futurs ne sont pas encore implémentés.

La fenêtre détaillée est configurée au constructeur (300 000 ms par défaut).
Un passage qui chevauche la borne reste disponible jusqu’à expiration complète :
la granularité de rétention est celle du segment (2 secondes au démarrage, puis 8 secondes). Le nettoyage est
effectué toutes les cinq secondes et avant les questions/ingestions.
Les temps sont monotones depuis le début d’observation, indépendants des retours
arrière du lecteur. Les segments, résumés et réponses restent attachés à leur session.

La file de perception contient au plus deux passages en attente. En surcharge,
les anciennes analyses en attente sont sautées et marquées comme telles; les médias
restent consultables pendant leur rétention. Ask ne bloque pas l’ingestion et
empêche de démarrer une nouvelle analyse de fond tant que sa réponse est en cours.
Une analyse déjà en vol peut se terminer en parallèle d’Ask.

Le test `architecture.test.cjs` interdit les dépendances externes dans le cœur.
Les tests du domaine utilisent des adaptateurs en mémoire, sans Electron, réseau,
clé API ni fichiers vidéo. Le test Electron vérifie la capture jusqu’à la relecture
avec un modèle factice explicite. Le test API réel est séparé et volontaire.

## Réexamen vidéo et MCP

Le domaine `VideoTools` fige l’ancrage, la session et les passages accessibles.
Il valide les intervalles, contrôle huit appels/deux inspections et rejette les
citations inconnues ou hors intervalle. `DeepAsk` gère progression, annulation,
limite de 60 secondes et restitution partielle ; un résultat tardif ne remplace
jamais celui d’une nouvelle question.

`MomentSearch` combine temps explicite, termes exacts et similarité cosinus.
`OpenRouterEmbeddings` et `EmbeddingStore` apportent les embeddings texte et leur
cache persistant. La recherche fonctionne en mode lexical signalé si l’API échoue.
Le modèle d’embeddings fait partie de la version du cache.

`VideoTools` prend un bail borné sur le brut. `ClipInspector` décode un extrait avec FFmpeg,
prépare jusqu’à 32 images et un MP4 borné, aligne le WAV et appelle le port multimodal.
L’adaptateur actuel privilégie l’entrée vidéo native ; les images restent disponibles
pour un futur adaptateur acceptant seulement des images.
Le MP4 et son audio sont ralentis quatre fois pour augmenter la résolution temporelle
effective des fournisseurs qui sous-échantillonnent la vidéo. L’adaptateur convertit
les temps internes retournés vers les temps originaux de la session ; ce calcul ne
dépend pas du modèle. Cela ne garantit pas de détecter tous les gestes.
Les observations horodatées sont séparées des hypothèses. La relecture reste locale.

Le serveur MCP stdio est un adaptateur entrant vers ces cas d’usage, via le pont
loopback authentifié hébergé par Electron. `CodexVideoAgent` reçoit une capacité
par recherche et aucune clé OpenRouter. Le serveur personnel peut également
ouvrir un contexte de consultation de la session en cours. La vérification Web
reste sur son port et son adaptateur distincts.

Voir [installation et diagnostic](installation.md) pour la configuration effective,
les limites d’isolation et les commandes de test.

## Préparation interchangeable des preuves

Le port `ClipInspectionPort` reste inchangé. L'adaptateur `ClipInspector` reçoit
une stratégie de préparation injectée : `NativeVideoStrategy` ou
`ContactSheetStrategy`. Le domaine ne sélectionne ni FFmpeg, ni Sharp, ni une
forme de prompt. La composition se fait dans `app/main.cjs` via
`TVLENS_INSPECTION_STRATEGY`.

Les candidats sont bornés à 32 frames pour la voie native/uniforme, 160 pour la
sélection adaptative, à 8 fps maximum et une résolution maximale de 768×768.
`frame-selection.cjs` calcule un changement RGB local et conserve la couverture
temporelle. Les planches exposent au plus 30 frames et 10 images (5 complètes,
5 crops). Les plans complets et recadrés partagent les mêmes timestamps. Le
rectangle sélectionné est fixe ; aucune transformation par frame ne suit l'objet.

L'appel éventuel de sélection de région utilise le même modèle et le même
AbortSignal que l'analyse. Il entre dans le budget global de la recherche,
pas dans un délai séparé de 60 secondes. Le choix actuel reste `native-slow`,
les variantes en planches ayant échoué à la validation qualitative du corpus.

## Mise à jour du 29 septembre : fil persistant et perception Codex

`WatchSession.resume` et `SessionClock` restent dans le cœur portable. Le bootstrap
Electron conserve la même session lors d'une pause et ne crée un nouvel ensemble
mémoire/agents que sur « Nouvelle session ». `DeepAsk` reste propriétaire de la
limite de 60 s, de l'annulation et de la validation des preuves.

`CodexSessionAgent` implémente le port d'agent via un transport App Server JSON-RPC
persistant (`CodexRpc`). Un fil par session reçoit des deltas de résumés et dispose
d'outils dynamiques qui appellent `VideoTools`. Le MCP externe continue d'utiliser
le même service. Les événements exposés à l'UI sont des étapes d'outils et des deltas
de réponse, jamais le raisonnement interne brut.

`CodexPerception` implémente observation et inspection avec Luna. `LocalTranscriber`
implémente le port de transcription avec Whisper.cpp. Le réexamen fournit des
planches adaptatives, pas de vidéo native pour ce fournisseur. Ces adaptateurs sont
remplaçables sans changement des règles de domaine. OpenRouter ne sert plus qu'au
port d'embeddings. Les descriptions identiques et requêtes identiques sont réutilisées
par le cache, sans supprimer les timestamps distincts de leurs passages.

## Extension visionnage (29 septembre 2026)

`DeepAsk` possède désormais une file FIFO, l’ancrage à l’envoi et l’annulation ciblée.
`SavedMoments` dépend d’un port d’archive durable ; `SavedMomentStore` copie les
médias hors rétention. `AutoMonitor` dépend d’un évaluateur injecté et possède la
cadence, la priorité manuelle et le dédoublonnage. `CachedInspector` décore n’importe
quel port de réexamen. `frame-policy.mjs` reçoit des deltas calculés par la capture,
indépendamment d’Electron. `CodexQuota` contrôle la réserve avant les appels ;
les services du domaine ne connaissent aucun SDK fournisseur. Les contrats de
queue actuels remplacent l’ancienne annulation automatique à chaque question.

## Actions immédiates et récapitulatif progressif

`ViewingActions` fige l’intervalle des actions ciblées, conserve le repère de
rattrapage et valide sa progression depuis les citations de la réponse.
`RollingRecorder.checkpoint` scelle le passage en cours à cet instant ; le
réexamen réutilise les bornes originales. `DeepAsk` expose un aperçu provisoire
sourcé et les durées de préparation, attente et réponse.

`LivingRecap` observe les passages analysés et leur historique. Il conserve les
originaux, valide la couverture des IDs sources et calcule les horodatages des
chapitres. Son port de synthèse est injecté ; `CodexRecap` le réalise avec un agent
séparé, sans outils web ou vidéo. Chaque synthèse reçoit les originaux, les
chapitres précédents et les nouveaux passages. La cadence normale est de 25 s,
avec un délai de traitement de 45 s. Les questions et vérifications manuelles
annulent la synthèse ; une génération protège contre les résultats tardifs.

Le bootstrap relie les événements de session, la priorité manuelle et le cycle
de vie du récapitulatif. `LocalSessionStore.saveRecap` sérialise atomiquement
`living-recap.json` avec les textes sources. L’expiration du média désactive la
relecture sans supprimer les textes. Le renderer partage le rendu entre panneau
principal et dialogue flottant. Voir [les limites de capacité](living-recap.md).
