# Architecture actuelle

TVLens suit une architecture hexagonale : les règles applicatives dépendent de contrats injectés ; les choix de plateforme, de modèle et de stockage appartiennent aux adaptateurs. Le point de composition est `app/main.cjs`.

## Organisation

| Couche | Responsabilité | Principaux fichiers |
| --- | --- | --- |
| Domaine applicatif | Session, temps observé, rétention, file de questions, preuves et priorité | `core/session.cjs`, `session-clock.cjs`, `deep-ask.cjs`, `video-tools.cjs` |
| Cas d’usage | Recherche, moments gardés, Auto, rattrapage et résumé progressif | `core/moment-search.cjs`, `saved-moments.cjs`, `auto-monitor.cjs`, `viewing-actions.cjs`, `living-recap.cjs` |
| Contrats | Perception, agent, transcription, média, archivage, embeddings, inspection | `core/ports.cjs` |
| Adaptateurs sortants | Codex, Whisper, OpenRouter embeddings, fichiers locaux | `adapters/` |
| Adaptateurs entrants | Capture navigateur, IPC Electron, serveur MCP | `app/recording.js`, `app/preload.cjs`, `mcp/server.cjs` |
| Présentation | Commandes utilisateur, Direct/Mémoire, overlay, recap et citations | `app/renderer.js`, `app/ui/` |

`tests/architecture.test.cjs` interdit les dépendances externes dans le cœur. Les vues reçoivent des données et des callbacks ; elles n'appellent pas directement un fournisseur ou le disque.

## De la capture à la réponse

1. `RollingRecorder` produit un premier segment de 2 secondes, puis des segments de 8 secondes : clip WebM, frames JPEG horodatées et audio WAV. `checkpoint` permet de terminer le segment à l'instant d'une action ciblée.
2. Le processus principal valide les entrées IPC et les transmet à `WatchSession`. `LocalSessionStore` conserve les médias et sérialise les archives.
3. `CodexPerception` décrit les images ; `LocalTranscriber` transcrit l'audio avec Whisper sur le Mac. Les images et le texte sont envoyés à Codex, pas le WAV brut.
4. `DeepAsk` ancre chaque question à l'envoi, gère la file FIFO, la progression réelle, l'annulation ciblée et le délai de 60 secondes hors attente.
5. `CodexSessionAgent` garde un transport App Server et un fil par session. Ses outils dynamiques consultent `VideoTools` pour retrouver et réexaminer les passages. Le même service est accessible via l'adaptateur MCP.
6. Les résultats comprennent des citations validées. La relecture utilise les fichiers locaux avec prise en charge des plages d'octets ; les sources externes passent par les contrôles de liens.

La capture reste indépendante des recherches. La file de perception est bornée ; en surcharge, certains passages sont marqués comme non analysés plutôt que de prétendre à une couverture complète. Leur média reste disponible dans la rétention.

## Mémoire et cycle de vie

Le temps est monotone dans l'ordre d'observation : un retour arrière dans le lecteur ne remonte pas l'horloge TVLens. La rétention détaillée vaut cinq minutes par défaut. Un segment qui chevauche la borne expire lorsqu'il en sort entièrement.

Pause/reprise conserve la session, ses résumés et la discussion ; la pause n'ajoute pas de temps observé. Nouvelle session remplace cet état. Fermer l'app termine les processus et fils actifs : l'archive textuelle ne restaure pas encore un fil conversationnel complet au prochain lancement.

`SavedMoments` copie explicitement le média hors de la rétention. La suppression est une action utilisateur. `LivingRecap` conserve la provenance des chapitres et les textes après expiration des médias ; l'interface désactive alors la relecture.

## Recherche et réexamen

`MomentSearch` combine intervalle explicite, termes exacts et embeddings texte. `OpenRouterEmbeddings` et `EmbeddingStore` assurent vectorisation et cache ; sans clé ou en cas d'échec, le mode lexical reste disponible et signalé.

`VideoTools` fige session et ancrage, borne les intervalles et le nombre d'appels/inspections, puis valide les citations. Les baux média empêchent l'effacement d'un passage utilisé par un réexamen en cours.

`ClipInspector` prépare les preuves derrière `ClipInspectionPort`. Dans l'app actuelle, Codex utilise **les planches adaptatives `sheets-diverse`**, avec six frames numérotées et horodatées par planche. Le choix de préparation, FFmpeg et les appels modèle restent hors du domaine. `CachedInspector` réutilise un résultat uniquement quand la question, l'intervalle et l'identité des médias correspondent.

Les stratégies vidéo native ralentie et autres variantes OpenRouter sont conservées pour les expériences historiques. Elles ne sont pas le chemin actif du chat ou de la vision. Les résultats Gemini anciens ne valident pas automatiquement Luna : voir [les comparaisons](strategy-comparison.md).

## Auto et résumé progressif

`AutoMonitor` surveille une consigne à partir de son activation, avec cadence et dédoublonnage. Les demandes manuelles ont priorité ; elles ne s'annulent pas mutuellement.

`ViewingActions` conserve l'ancrage des actions ciblées et le repère de rattrapage. `LivingRecap` possède une synthèse injectée ; `CodexRecap` reçoit les passages et chapitres sans outils web. Les synthèses de fond peuvent être annulées au profit des questions. Une génération protège contre les résultats tardifs.

## Interface et dépendances

- `ViewingShell` gère la navigation, les états de couverture et le chrome visuel.
- `renderRecapView` rend les snapshots dans le panneau Mémoire et le dialogue compact ; `replay` et `notice` sont injectés.
- `format.js` contient les helpers de présentation ; les textes des modèles sont insérés avec `textContent`.
- Le chat garde un seul arbre DOM entre mode complet et flottant : historique, brouillon et file ne sont pas dupliqués.
- `preload.cjs` expose une API limitée ; les renderers n'ont pas accès directement à Node.

## Données et consommation

L'audio brut et les médias de session restent sur le Mac ; images et transcriptions vont à Codex. Les embeddings optionnels envoient du texte à OpenRouter. Les sources web sortent du périmètre local.

`CodexQuota` est informatif. `UsageLedger` conserve les dépenses OpenRouter connues et les montants encore inconnus, sans plafond local. Aucune réserve locale n'interdit les appels ; les limites des fournisseurs restent applicables.

## Portabilité : ce qui reste à construire

Le GX10 nécessitera des adaptateurs de modèle locaux et une validation du débit continu. Une caméra + microphone doit produire le contrat `CapturedSegment` existant, avec un média rejouable et des horodatages cohérents.

Une source LG réseau n'est pas prête à brancher : l'ingestion actuelle attend des clips, pas seulement des images. La piste PicCap requiert root et reste exclue du POC sur la TV de l'utilisateur sans modification système. Les embeddings multimodaux et l'interface webOS restent dans la roadmap.
