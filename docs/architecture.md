# Architecture actuelle

Cette page décrit les propriétaires et les chemins présents dans le dépôt. Elle ne déduit pas
l’état d’une installation TV ou VPS de l’état des sources. Les relevés d’essais sont classés par
époque dans l’[index documentaire](README.md).

La [cible du domaine](domaine.md), figée le 16 octobre 2026, et les ADR 0029 et 0030 décrivent
l’évolution prévue. Le rangement par contextes commence avec l’entrée publique de Mémoire ;
le coordinateur unique des deux hôtes reste à réaliser.

## Couches et frontières

Les règles applicatives reçoivent leurs dépendances par injection. La table `DEPENDENCY_ZONES`
de [la garde d’architecture](../tests/architecture.test.cjs) autorise les imports relatifs suivants,
en parcourant récursivement les sources JavaScript :

| Couche | Responsabilité | Cibles internes autorisées |
| --- | --- | --- |
| `core/` | Session, perception, preuves, questions, recherche, surveillance et contrats des ports | `core/` |
| `adapters/` | Modèles, transcription, médias, stockage et transports sortants | `adapters/`, `core/` |
| `runtime/` | Assemblage partagé, politiques de session et projections | `runtime/`, `core/`, `adapters/` |
| `server/` | HTTP authentifié, validation, traduction des erreurs et routes TV | `server/`, `core/`, `adapters/`, `runtime/` |
| `mcp/` | Pont et outils pour clients externes | `mcp/`, `core/` |
| `app/` | Hôte Electron, IPC, capture Mac et présentation | `app/`, `core/`, `adapters/`, `runtime/` |

Le cœur refuse tout import externe et les accès hôte contrôlés par la garde (`process`, réseau,
DOM, IPC, stockage navigateur, `Buffer`). Les autres couches acceptent les imports littéraux
`node:` et les paquets de `dependencies`, sous-chemins compris. Les builtins sans préfixe et les
paquets de développement sont refusés ; `electron` n’est permis que dans `app/main.cjs` et
`app/preload.cjs`. `runtime/` et `server/` restent indépendants d’Electron.

`app/ui/` importe uniquement dans son dossier, sauf `browser-capture.mjs` vers `app/recording.js`.
`tv/app/` utilise des scripts classiques : aucune syntaxe ES import/export, même dynamique.
Ses chargements CommonJS sont relatifs, internes au dossier et sous garde Node explicite
`typeof module === "object" && module && module.exports`.

La garde interdit aussi aux compositions `.cjs` des hôtes et du runtime d’écrire directement
`watch.ending`, `accepting`, `readOnly`, `closed` ou `asking`. Le domaine porte ces transitions.
Les services du cœur n’importent pas `core/session.cjs` ; `Surveillance` ne dépend ni de `DeepAsk`
ni des indicateurs de planification du chat.

**Temps et modules purs.** `CORE_TIME_STOCK` fige par fichier et opération les accès globaux au
temps encore présents dans le cœur : `Date.now`, les quatre fonctions de minuterie et
`AbortSignal.timeout`. Ce stock est une dette exacte, pas une autorisation d’ajout : toute nouvelle
référence doit être injectée, toute suppression doit réduire l’exception correspondante.
`PURE_MODULE_POLICIES` interdit imports, `process` et réseau à `runtime/session-closing.cjs` et
`runtime/question-checkpoint.cjs`. Le premier refuse aussi le temps global ; le second conserve
ses défauts injectables `setTimeout` et `clearTimeout` (ADR 0015). Les gardes reconnaissent aussi
les accès qualifiés, optionnels, calculés par chaîne littérale et les expressions des gabarits.
[Le banc des gardes](../tests/architecture-guard.test.cjs) éprouve ces interdictions par violations locales.

## Propriétaires et compositions

Les deux hôtes composent `runtime/session-runtime.cjs`, `conversation-runtime.cjs` et
`surveillance-runtime.cjs`. Le premier construit les objets de session et expose leur façade ;
les choix de fournisseur et les transitions ont leurs propriétaires propres.

`core/memory/index.cjs` publie le contrat de consultation de Mémoire. La façade de session expose
`memory.view()`, `memory.passage(id)` et `memory.recentPassages(limit)` ; ces lectures détachées
ne rappellent pas le snapshot. `memoryMedia.read(id)` et `memoryMedia.lease(ids)` donnent séparément
accès aux images et au son conservés, avec baux, sans chemin local ni mutateur de stockage.
Les lecteurs actuels conservent leur snapshot pendant leur migration progressive. Le même index publie
`toArchive` et `fromArchive`, seuls à écrire et à décoder le format versionné de `session.json`.

| Module | Responsabilité et frontière |
| --- | --- |
| `runtime/session-providers.cjs` | Construit transcription, perception, inspection révocable et index ; reçoit options et substitutions de fournisseurs. |
| `runtime/session-manifest.cjs` | Construit et écrit le manifeste ; cadence monotone de 30 secondes et historique des 100 dernières captures. |
| `runtime/session-lifecycle.cjs` | Restaure, met en pause/reprend, révoque l’inspecteur, libère les ressources et confirme l’archive de cette vie. |
| `runtime/session-closing.cjs` | Protocole de fin commun : étapes tentées, erreurs nommées, archivage ou scellement/effacement, libération de l’hôte. |
| `runtime/capture-intake.cjs` | Possède les opérations headless dès l’admission, leur validité, leur annulation et l’attente des stockages admis. |
| `runtime/headless-session-lifecycle.cjs` | Sérialise les transitions serveur, possède la session chargée, l’époque de capture et le résultat de fin. |
| `runtime/state-views.cjs` | Projette en mémoire les vues chat/panel, l’overlay serveur et l’historique de surveillance ; aucun transport ni disque. |

`session-manifest` lit la confirmation finale détenue par `session-lifecycle` ; il ne la déduit
pas du manifeste d’une ancienne vie. `HeadlessRuntime` compose les propriétaires et délègue sans
recopier leur état. `empty-session`, `session-rows` et `capture-storage` portent les règles pures
communes de session vide, de liste et de pause disque. Les lectures de bibliothèque capturent les
faits de la session avant leur première attente (ADR 0036 et 0037).

**Mac.** `app/main.cjs` compose Electron et garde la table IPC ; `preload.cjs` expose un bridge limité.
Les fabriques de fenêtre, sources et actions reçoivent leurs dépendances et gardent leur état dans
leur instance. Le renderer compose `app/ui/capture-controller.mjs` via `browser-capture.mjs` :
ce contrôleur possède flux, audio, recorder et flushes. Les actions et contrôles lui délèguent ;
l’arrêt attend le recorder et ses ingestions, puis l’hôte, avant de libérer pistes et audio.
`app/ui/state-delivery.mjs` adopte immédiatement les états poussés et regroupe leurs dessins par
frame, avec secours à 100 ms. `bindPushedStates` garde la fraîcheur des lectures initiales et des
archives face aux poussées ; la libération retire abonnements, lectures, frames et minuteries.
Le chat conserve un seul arbre DOM entre fenêtre complète et mode flottant.

**Codex.** `adapters/codex-session-client.cjs` possède transport App Server, fils, activité et drain.
`codex-session-events.cjs` distribue les notifications avec les gardes de fil/tour et les effets
reçus ; `codex-session-run.cjs` conduit préparation, accusé de démarrage, interruption, watchdog et
nettoyage sur ce même état. Ces modules ne créent pas un second client. Le remplacement d’un groupe
de processus attend son arrêt ; les accès ouverts sur une session sont révoqués à sa fin.
Les rôles sont cloisonnés selon [SECURITY.md](../SECURITY.md), avec les limites qui y sont documentées.

**HTTP et TV.** `server/http.cjs` garde authentification, limites, réponses et traduction des erreurs ;
`server/routes.cjs` répartit les groupes sessions, ingestion, questions, surveillance et état.
Le transport possède séquences, doublons et créneau de préparation ; l’ingestion métier reste dans
`capture-intake`. `tv/app/index.html` charge modèles, contrôleur de polling et vue avant le companion.
`chat-model.js` porte fusion d’état, progression et plan de polling ; `poll-controller.js` possède
une seule lecture en vol, accélérations regroupées, timer et invalidation des retours après arrêt.
`chat-view.js` possède cartes, écho, verrou d’envoi et progression ; un changement de session invalide
un envoi tardif. `companion.js` compose ces objets, conserve sélection/ancrage et navigation.
Le contenu des modèles et du réseau s’affiche comme texte.

## De la capture à la question

Sur Mac, `RollingRecorder` produit un premier segment de 2 secondes puis des segments de 8 secondes,
avec clip WebM, images JPEG horodatées et audio WAV. Un checkpoint ferme le segment pour une action
ciblée. Sur LG, `tv/capture.py` envoie images et audio au serveur ; `RemoteMedia` prépare les fichiers.
Le WebM reconstruit à partir d’images fixes n’est pas une vidéo native. Les deux captures rejoignent
`WatchSession` après validation par leur hôte et stockage par `LocalSessionStore`.

**Deux voies.** `core/memory/lanes.cjs` possède les deux FIFO privées, leurs appels et une retenue
vision générique. `WatchSession` traduit encore l'activité des questions et les noms historiques,
puis publie les versions et sauvegarde. Snapshot et consultation lisent les mêmes comptes détachés.
Chaque voie possède un appel actif et une FIFO de références, sans médias bruts :

- L’audio appelle `transcribe`, puis publie immédiatement les paroles. Par défaut `maxPending = 2` :
  seuls les deux derniers passages en attente gardent leur transcription ; les plus anciens sont
  marqués `audioStatus: skipped`. La file conserve jusqu’à `maxPending × 3` références (six par défaut),
  hors appel actif, pour transmettre encore les images dans l’ordre. Au-delà, les plus anciens
  sont abandonnés entièrement, avec perte vision `backlog` comptée.
- La vision appelle `observeVisual` sur images et transcription disponible du même passage.
  Sa file attend au plus `maxPending` passages (deux par défaut), hors appel actif. Un passage dont
  la transcription a été sautée en surcharge saute aussi la vision si la file est pleine ; il
  n’évince pas les passages déjà en attente. Sinon, un débordement évince le plus ancien.
  Le statut conserve les preuves partielles.

L’audio du passage suivant peut avancer pendant la vision du précédent. Les fournisseurs simulés
suivent le même contrat à deux voies. La session ne sélectionne plus de voie série ; la méthode
combinée `CodexPerception.observe` subsiste seulement pour une sonde explicite (ADR 0038).
Codex reçoit images et texte ; le WAV est transcrit par `LocalTranscriber` sur l’hôte.
Une description échouant sur une erreur transitoire identifiée peut être redemandée une seule fois,
uniquement si la voie est libre et la session encore utilisable (ADR 0008 et 0031).

**Questions.** `conversation-runtime` compose `DeepAsk`, `CodexSessionAgent` et `VideoTools`.
`DeepAsk` fige l’ancrage et le préfixe admissible à l’envoi, accepte cinq questions en attente,
publie progression et annulation ciblée, et applique au traitement un plafond de cinq minutes,
abaissable par `TVLENS_QUESTION_TIMEOUT_MS`. `job.timeoutMs` et `job.availability` décrivent le
plafond et la disponibilité figée. `WatchSession.setQuestionPending` possède le fait `asking`.
La transcription continue ; la vision continue avec le réglage hôte par défaut
`TVLENS_VISION_DURING_ASK=1`. Avec `0`, les questions retiennent la vision en attente et les pertes
sont classées `asking` ou `backlog` selon la cause. La surveillance n’utilise pas cette file.

`VideoTools` conserve session, bornes et identifiants des passages autorisés. Au démarrage de la
réponse et avant chaque outil, il relit leurs versions disponibles ; aucun passage ultérieur ne
rejoint la question. Les citations sont validées et les consultations journalisées. Une annulation
ne rend les outils qu’au retour effectif de l’agent. Les baux protègent les médias d’un réexamen.

Les anciennes archives peuvent contenir `questions` dans `session.json` : validation, restauration
et snapshot conservent ces données. Elles ne rétablissent ni `WatchSession.ask`, ni `selectEvidence`,
ni un port de réponse historique. Les travaux du chat actif sont conservés dans `deep-answers.json`.
Ouvrir puis refermer une archive ne réanalyse ni ne réécrit son contenu.

## Mémoire, recherche et surveillance

`WatchSession` enregistre `PassageReceived` après ajout du passage et `AdmissionSuspended` après
fermeture de l'admission pour disque plein. `PassageUpdated` annonce les enrichissements, disponibilités
et miniatures ; `PassageLost` nomme la voie et la cause de chaque perte comptée. Ces changements font
avancer la révision du passage ; les faits acquis dans une même transition partagent cette version.
La composition partagée livre ces messages bornés par
`core/shared/events.cjs`, via son diffuseur injectable `events` : abonnements synchrones, publications
imbriquées en FIFO, données immuables et échecs isolés. Les messages nomment session, passage et
révision ; le refus sans passage porte deux identités nulles. Aucun lecteur actuel ne migre et
`onChange` garde son contrat. Les faits ne sont ni rejoués à la restauration ni chargés de sauvegarder.

L’horloge suit l’ordre d’observation, même si le lecteur revient en arrière. Les médias et miniatures
restent jusqu’à suppression explicite. Les anciens réglages de rétention ne sont plus lus par les hôtes.
Une archive rouverte devient durable après décodage de ses motifs historiques, sans réécriture à l’ouverture.
Le retrait en deux lots est décrit dans l’[ADR 0048](adr/0048-les-hotes-et-les-archives-reprises-conservent-les-medias-jusqua-suppression.md).
`session.json`, `manifest.json`, `media/` et `thumbs/` portent état, liste et médias ; les usages ajoutent
questions, résumé vivant, surveillance et embeddings. `SessionLibrary` liste par manifeste et supprime
une session ciblée. Les archives anciennes sans manifeste restent lisibles comme texte seul.

`available` indique la relecture vidéo. Un conteneur sans bloc média est conservé avec
`mediaReason: unreadable` ; ses images et paroles restent analysables. Le réexamen peut se rabattre
sur les images conservées, en annonçant sa limite. Les autres indisponibilités sont `missing`,
`expired` et `not-kept`. `DiskGuard` refuse une écriture sous le plancher d’espace libre sans rien
supprimer ; l’hôte met la capture et son horloge en pause. `SavedMoments` copie les médias gardés
hors de la session, jusqu’à suppression propre de ces moments.

`MomentSearch` combine classement lexical et embeddings optionnels ; une référence temporelle
reconnue contourne l’index. `session-providers` compose `MomentIndex`, `EmbeddingStore` et
`OpenRouterEmbeddings`. L’indexation de fond est bornée et groupée ; sans clé ou en échec, la recherche
reste lexicale avec ses limites signalées. Le texte vectorisé part vers OpenRouter.
`ClipInspector` prépare les preuves derrière le port d’inspection ; le runtime actif utilise les
planches adaptatives `sheets-diverse`. Cache et révocation enveloppent l’inspection.
Les adaptateurs OpenRouter d’évaluation et leurs scripts ont été retirés (ADR 0016) ; les préparateurs
de stratégies encore présents ne constituent pas un banc d’évaluation disponible.
Les [comparaisons du 28 septembre 2026](strategy-comparison.md) restent des résultats historiques.

`Surveillance` lit la consigne à partir de son activation, passage par passage : d’abord les paroles,
puis la description si elle arrive. Lecture sans web ni outil, vérification avec web seul : les rôles
Codex sont distincts du chat. La composition partagée persiste `surveillance.json` et confirme les
publications réellement remises ; un tick peut retenter uniquement l’état courant refusé.
Les cartes sourcées sont regroupées ; les signalements sans source restent dans l’historique.
`LivingRecap` conserve chapitres et provenance et attend les observations complètes ; les passages
partiels exclus sont signalés. Perception et résumé utilisent `CodexAnalysisAgent`, sans outil ni web.

L’affichage ambient panneau fermé est retiré selon l’ADR 0017. Les cartes, files, compteurs,
activité et réglages du panneau ouvert restent. La route serveur `/v1/surveillance/overlay` et son
contrat d’ETags sont conservés ; leur retrait est différé. Voir [retrait et historique LG](lg-ambient.md).

## Fin de session et hôtes

Pause et reprise gardent la session et la discussion ; la pause fige l’horloge sans ajouter de temps
observé. L’ouverture d’une archive est silencieuse, en lecture seule et sans préchauffage ; seule une
reprise explicite rétablit la capture. Le fil Codex éphémère n’est pas restauré avec les questions.

Le protocole partagé de l’ADR 0007 lève la fin avant toute attente, tente chaque étape et garde les
échecs nommés. Chaque hôte lui remet encore son propre ordre :

| Moment | Mac (`app/main.cjs`) | Serveur (`headless-session-lifecycle.cjs`) |
| --- | --- | --- |
| Début synchrone | Révocation des contextes MCP | Annulation des préparations média |
| Étapes propres | Résumé vivant, surveillance, questions/checkpoint, chat, stockages puis pause si capture active | Pause sauf suppression, stockages/préparations, questions/checkpoint, surveillance, chat |
| Sort commun | Archive confirmée, ou scellement puis effacement si vide/supprimée | Même protocole ; résultat de fin conservé par le coordinateur |

Le cycle des ressources révoque l’inspecteur avant attente, ferme l’admission, attend les ingestions
admises, ferme les ressources puis attend états et manifeste final. L’archivage n’est confirmé qu’après
réussite du disque. Un refus d’adaptateur n’empêche pas les autres fermetures ; un refus disque laisse
le dernier état confirmé. Rien n’est effacé sans scellement ni si l’hôte ne peut lâcher la session.
La règle commune de session vide exige une création de cette vie sans passage ni question historique
ou active. L’ADR 0036 précise ainsi le critère des hôtes de l’ADR 0007 ; l’ADR 0030 prévoit leur futur
coordinateur commun, encore distinct des propriétaires présents.

L’ingestion serveur possède un bloc avant sa préparation : signal, objet session et époque doivent
encore correspondre avant stockage. Un stockage commencé atterrit en entier ; une préparation annulée
est attendue dans une borne de 1000 ms par défaut, sans libérer l’opération ni le créneau HTTP si elle
continue. Le transport ne les rend qu’à son `finish`.

Les vues légères `GET /v1/state?view=chat` et `?view=panel` sont calculées depuis l’état publié et les
faits en mémoire ; le polling ne lit pas le disque. Les ETags distinguent ressource et processus ;
un état inchangé rend 304 sans corps. La TV fusionne les corps, conserve les questions par identifiant
et extrapole le temps entre deux réceptions. Le contrat `/v1` porte aussi sur les refus et séquences
(ADR 0042). Sur TV, arrêt de capture locale et fin distante sont deux confirmations distinctes.

Les tests locaux et les bancs simulés protègent ces contrats ; ils ne prouvent ni la qualité des modèles,
ni le débit soutenu, ni l’état installé. Les mesures datées et leurs limites sont dans
[validation](validation.md). Le backend local optionnel est raccordé par `LocalVlmAgent` ; une validation
matérielle GX10 reste distincte des preuves contre un faux serveur.

## Décisions

Chaque entrée renvoie au texte daté de la décision. Les statuts et preuves historiques de ces ADR
restent ceux de leur rédaction ; les amendements ci-dessous distinguent la cible de l’état livré.

- [ADR 0001](adr/0001-resultats-de-recherche-lies-a-leur-session.md) :
  Un résultat de recherche reste attaché à la session qui l’a demandé.

- [ADR 0002](adr/0002-archive-confirmee-avant-d-etre-annoncee.md) :
  Une archive n’est annoncée qu’après confirmation de ses états finaux sur disque.

- [ADR 0003](adr/0003-dernier-etat-par-fichier-et-publication-avant-sauvegarde.md) :
  Le dernier état de chaque fichier est sérialisé ; la publication précède la sauvegarde.

- [ADR 0004](adr/0004-contexte-de-question-rendu-quand-l-agent-a-fini.md) :
  Le contexte d’une question est rendu quand son agent a effectivement fini.

- [ADR 0005](adr/0005-groupe-codex-attendu-avant-d-etre-remplace-et-contextes-revoques-en-fin-de-session.md) :
  Le remplacement Codex attend le groupe précédent ; la fin révoque les accès à la session.

- [ADR 0006](adr/0006-bloc-possede-des-son-admission-et-preparation-annulee-quand-sa-session-part.md) :
  Un bloc est possédé dès admission ; sa préparation est annulée quand sa session part.

- [ADR 0007](adr/0007-fin-de-session-par-un-meme-protocole-sur-les-deux-hotes.md) :
  Les hôtes partagent le protocole de fin et gardent leurs ordres ; 0030 prévoit sa future unification.

- [ADR 0008](adr/0008-description-redemandee-une-fois-apres-un-echec-passager.md) :
  Une description transitoirement échouée est retentée une fois si la voie est libre ;
  0031 remplace sa classification textuelle par des champs stables.

- [ADR 0009](adr/0009-synthese-refusee-pour-sa-taille-retentee-seulement-si-son-entree-change.md) :
  Une synthèse refusée pour sa taille attend une modification de son entrée avant nouvelle tentative.

- [ADR 0010](adr/0010-une-plage-de-clip-ne-lit-que-les-octets-qu-elle-renvoie.md) :
  Une lecture Range de clip ne lit que les octets qu’elle renvoie.

- [ADR 0011](adr/0011-un-script-partage-du-panneau-tv-est-une-iife-exposee-sur-la-page-et-par-commonjs.md) :
  Les scripts TV partagés sont des IIFE page/CommonJS ; le consommateur ambient a été retiré par 0017.

- [ADR 0012](adr/0012-la-boucle-separe-codex-et-son-relecteur-claude.md) :
  La boucle sépare implémentation Codex et relecture Claude.

- [ADR 0013](adr/0013-formatage-prettier-reglages-par-defaut.md) :
  Le formatage suit les réglages par défaut de Prettier.

- [ADR 0014](adr/0014-eslint-gel-des-infractions.md) :
  Les infractions ESLint existantes sont gelées par fichier et règle.

- [ADR 0015](adr/0015-les-minuteries-du-checkpoint-des-questions-sont-injectees.md) :
  Les deux hôtes injectent les minuteries du checkpoint des questions.

- [ADR 0016](adr/0016-retrait-des-adaptateurs-d-evaluation-herites.md) :
  Les adaptateurs d’évaluation hérités et leurs scripts sont retirés sans remplacement du banc.

- [ADR 0017](adr/0017-retrait-de-l-affichage-ambient-panneau-ferme.md) :
  L’affichage ambient panneau fermé est retiré ; les cartes du panneau ouvert et la route overlay restent.

- [ADR 0018](adr/0018-un-controleur-injecte-possede-la-capture-du-mac.md) :
  Un contrôleur injecté possède les ressources de capture Mac et leur libération.

- [ADR 0019](adr/0019-fournisseurs-et-manifeste-separes-de-l-assemblage-de-session.md) :
  Les fabriques de fournisseurs et de manifeste sont séparées de l’assemblage de session ;
  0020 confie ensuite la confirmation finale au cycle de vie.

- [ADR 0020](adr/0020-le-cycle-de-vie-possede-la-restauration-et-la-fin-du-runtime-de-session.md) :
  Le cycle des ressources possède restauration et fin confirmée du runtime de session.

- [ADR 0021](adr/0021-le-transport-http-distribue-les-routes-par-groupe.md) :
  Le transport HTTP distribue les routes par groupes et conserve ses validations communes.

- [ADR 0022](adr/0022-le-client-codex-delegue-les-notifications-et-l-execution-des-tours.md) :
  Le client Codex délègue notifications et tours en gardant un seul état de connexion.

- [ADR 0023](adr/0023-un-proprietaire-possede-l-ingestion-headless.md) :
  Un propriétaire possède l’ingestion headless dès son admission, jusqu’au finish du transport.

- [ADR 0024](adr/0024-un-coordinateur-possede-les-transitions-headless.md) :
  Un coordinateur possède les transitions headless et le transfert synchrone de session et questions.

- [ADR 0025](adr/0025-la-livraison-des-etats-mac-possede-ses-dessins-et-ses-attentes.md) :
  La livraison Mac possède adoption des états, dessins regroupés et attentes annulables.

- [ADR 0026](adr/0026-un-controleur-injecte-possede-la-boucle-de-polling-tv.md) :
  Un contrôleur injecté possède la boucle de polling TV et ignore les retours après arrêt.

- [ADR 0027](adr/0027-une-vue-possede-les-cartes-et-les-envois-du-chat-tv.md) :
  Une vue possède les cartes et les envois du chat TV, invalidés au changement de session.

- [ADR 0028](adr/0028-une-mesure-synthetique-correle-la-capture-et-la-remise-aux-vues.md) :
  Le banc synthétique corrèle capture et remise aux vues, sans mesurer le matériel ou les modèles réels.

- [ADR 0029](adr/0029-le-code-se-range-par-contextes-du-domaine-en-hexagone.md) :
  La cible range le code par contextes en hexagone ; ce rangement reste à réaliser.

- [ADR 0030](adr/0030-un-seul-coordinateur-de-sessions-pour-les-deux-hotes.md) :
  La cible prévoit un coordinateur unique des deux hôtes et amende 0007 ; la migration reste à réaliser.

- [ADR 0031](adr/0031-les-erreurs-de-perception-et-de-verification-se-classent-par-champs-stables.md) :
  Les échecs de perception et vérification se classent par champs stables, jamais par message.

- [ADR 0032](adr/0032-les-notifications-d-etat-ne-peuvent-pas-interrompre-les-transitions.md) :
  Les refus de notification d’état ne peuvent interrompre les transitions applicatives.

- [ADR 0033](adr/0033-la-surveillance-confirme-la-livraison-et-retente-seulement-l-etat-courant.md) :
  La surveillance confirme la livraison et retente seulement l’état courant refusé.

- [ADR 0034](adr/0034-les-refus-http-portent-un-code-dans-le-json-ou-un-en-tete-media.md) :
  Les refus HTTP portent un code JSON ou média ; 0040 remplace son repli historique des erreurs inattendues.

- [ADR 0035](adr/0035-la-session-possede-la-transition-de-question-en-cours.md) :
  La session possède la transition de question en cours ; 0038 retire ensuite son ancienne API ask.

- [ADR 0036](adr/0036-les-hotes-partagent-trois-regles-pures-de-session.md) :
  Les hôtes partagent les règles pures de session vide, de liste et de pause disque.

- [ADR 0037](adr/0037-les-lectures-de-bibliotheque-capturent-la-session-a-l-entree.md) :
  Les lectures de bibliothèque capturent les faits de la session à leur entrée.

- [ADR 0038](adr/0038-la-session-utilise-deux-voies-et-conserve-les-questions-historiques.md) :
  La session utilise seulement les deux voies et conserve les questions historiques dans les archives.

- [ADR 0039](adr/0039-les-codes-de-refus-suivent-leur-module-emetteur.md) :
  Les codes de refus sont déclarés par leur module émetteur ; la traduction HTTP reste dans l’hôte.

- [ADR 0040](adr/0040-les-erreurs-http-inattendues-repondent-500-et-restent-au-journal.md) :
  Les erreurs HTTP inattendues répondent 500 avec texte générique et sont journalisées ; le repli de 0034 est remplacé.

- [ADR 0041](adr/0041-les-refus-http-restent-structures-jusqu-au-rapport-de-capture-tv.md) :
  Les refus structurés par statut et code parviennent jusqu’au rapport de capture TV.

- [ADR 0042](adr/0042-le-fil-v1-conserve-les-comportements-lus-par-les-clients-tv.md) :
  Le contrat v1 conserve les comportements, refus et séquences lus par les clients TV, au-delà de la forme JSON.

- [ADR 0043](adr/0043-les-raccords-du-renderer-mac-passent-par-une-composition-importable.md) :
  Les raccords du renderer Mac passent par une composition importable, vérifiée par ses comportements publics.

- [ADR 0044](adr/0044-la-garde-declare-les-contextes-et-les-exceptions-de-migration.md) :
  La garde déclare les contextes, le noyau partagé, les entrées publiques et les exceptions exactes de migration.

- [ADR 0045](adr/0045-les-faits-de-memoire-sont-livres-par-un-diffuseur-isole.md) :
  Les faits de réception et de suspension sont livrés après transition, par un diffuseur isolé sans rejeu.

- [ADR 0046](adr/0046-la-memoire-publie-une-vue-detachee-et-des-capacites-media-separees.md) :
  La Mémoire publie une vue détachée, des lectures bornées et des capacités média séparées avec baux.

- [ADR 0047](adr/0047-session-json-porte-un-format-et-une-version-lus-par-un-convertisseur.md) :
  session.json porte un format et une version, écrits et lus par le seul convertisseur de la Mémoire.

- [ADR 0048](adr/0048-les-hotes-et-les-archives-reprises-conservent-les-medias-jusqua-suppression.md) :
  Les hôtes conservent les médias jusqu'à suppression ; la reprise garde les motifs historiques,
  sans réactiver de fenêtre. Le retrait de l'élagage interne suit dans un second lot.

- [ADR 0049](adr/0049-la-capture-mac-utilise-le-repli-screen-capture-kit-et-signale-le-silence.md) :
  La capture Mac utilise le repli ScreenCaptureKit d'Electron 39–44 et avertit durablement quand le son manque.

- [ADR 0050](adr/0050-les-versions-consultables-et-les-pertes-de-voie-publient-leur-revision.md) :
  Les versions consultables et les pertes de voie publient leur révision, après transition et sans snapshot.

- [ADR 0051](adr/0051-les-voies-de-perception-possedent-leurs-files-et-une-retenue-generique.md) :
  Les voies possèdent files, appels et retenue générique ; la session traduit la politique et publie les versions.
