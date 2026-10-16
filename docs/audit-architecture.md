# Audit d'architecture, 16/10

Deux audits indépendants, en lecture seule, du code à `8340014`, après les 41 tickets de la file « base saine » :
- **le rapport A** est d'Opus 5.5 (effort xhigh) ;
- **le rapport B** est de Codex GPT-6 Astra (effort high).

La consigne commune demandait :
- une carte de l'architecture ;
- les problèmes qui gênent l'évolution ou la fiabilité ;
- le tri des 93 réserves de la nuit ;
- des refactors à forte valeur ;
- ce qu'il ne faut pas faire ;
- les arbitrages à soumettre au propriétaire.

## Synthèse de l'orchestrateur

### Vérifié dans le code par l'orchestrateur

- **Une publication peut bloquer la perception (rapport B, B1) : confirmé.**
  - Dans `core/session.cjs:280-282`, `audioRunning` et `running` passent à `true`, puis `emit()` est appelé, et tout cela avant le `try/finally`. Si un observateur lève, la voie audio reste bloquée.
  - La voie vision a la même disposition.
- **Les deux hôtes n'ont pas la même règle de session vide (rapport A, B1) : confirmé.**
  - Le serveur n'efface que les sessions qu'il a lui-même démarrées (`this.fresh`, `runtime/headless-session-lifecycle.cjs:141-145`).
  - Le Mac n'a pas cette garde (`app/main.cjs:354`). Une archive reprise sans passage, et sans question chargée, peut donc être effacée à sa fermeture.
- **Le `TypeError` de `sessionRows` côté Mac (rapport A, C) : infirmé.**
  - `app/session-rows.cjs` relit la session chargée après l'attente, et chaque déréférencement est gardé. Le rapport B a raison sur ce point.
  - La lecture incohérente côté serveur (rapport B, B3) reste à traiter.

### Points d'accord des deux rapports

1. Les erreurs se reconnaissent à leur texte, d'une couche et d'un processus à l'autre.
   - Le serveur répond 400 à toute erreur sans statut.
   - La page TV lit `409`, `507` et des phrases.
   - La reprise d'une perception dépend de messages exacts.
2. Les hôtes écrivent `watch.asking` et recopient la glue « question en cours ».
3. `WatchSession.ask()` est un chemin mort. Le mode simulé emprunte une voie que la production n'utilise pas (rapport A, B3).
4. La zone surveillance est le prochain gros chantier.
5. Le contrat serveur–TV n'est jamais exercé de bout en bout, et le fil `/v1` n'a pas de version.
6. Le code installé sur la TV vit sous `prototypes/`.
7. Côté Python, Luna existe en trois copies et YouTube est écrit en dur.
8. Il reste des tests qui lisent le texte du source, et des assistants de test dupliqués.

### Désaccord principal, tranché pour la vague 1

- Le rapport A recommande un coordinateur de session commun aux deux hôtes (D6, six tickets).
- Le rapport B recommande de ne pas fusionner les hôtes : leurs ordres de fin diffèrent volontairement (ADR 0007).
- La vague 1 partage les **règles** (session vide, question en cours, lignes de bibliothèque, disque plein) et corrige les divergences prouvées. Le coordinateur commun sera réévalué ensuite.

### Vague 1

Fiabilité, cœur et tests, défauts isolés tirés des réserves, et un nettoyage du harnais. La vague 2 suit : surveillance, contrats serveur–TV et Python–page, sortie de `prototypes/`, préparation des sources. La liste des tickets est dans `docs/travail/tickets/INDEX.md`, section « Itération 2 ».

---

# Rapport A — Opus 5.5



Les chemins sont relatifs à la racine du dépôt. Les repères `chemin:ligne` valent pour `8340014`.

**Méthode.**
- Lecture seule : aucun test, aucun `check.mjs`, aucun script lancé.
- Les fichiers suivis de l'arbre de travail sont identiques à `8340014`, sauf la fiche du ticket 178 (`git diff --stat 8340014`).
- Le travail en cours de T178 (fichiers non suivis) est ignoré.
- Les comptages viennent de `rg`, `wc` et `git grep`. Ce sont des comptages de texte, pas des mesures d'exécution.
- Je n'ai pas consulté le travail de l'autre auditeur.

## Verdict

1. **La nuit a nettoyé la coquille, pas le cœur.** Elle a assaini l'hôte serveur, la composition de session, le transport HTTP, le client Codex, la capture Mac et la boucle TV. En revanche, `core/` n'a reçu que 62 lignes (`git diff --stat 3202de5 8340014 -- core`). L'hôte Mac et la zone surveillance sont restés intacts. C'est là que se trouve la saleté qui reste.
2. **Le problème n°1 n'est plus la taille des fichiers.** Les cas d'usage de session existent deux fois :
   - extraits côté serveur, dans `runtime/headless-session-lifecycle.cjs` ;
   - en ligne côté Mac, dans la fonction d'environ 490 lignes de `app/main.cjs:58-547`.

   J'ai relevé une douzaine de divergences entre les deux (B1).
3. **Le cœur garde des chemins morts que seuls les tests font vivre.** Le mode simulé emprunte l'un d'eux : au moins 12 fichiers de tests d'hôte vérifient une voie d'analyse que la production n'utilise jamais (B3).
4. **Les erreurs se reconnaissent à leur texte français.** C'est vrai entre adaptateurs, entre le serveur et la page TV, et entre le Python et le JavaScript. Le fil `/v1` n'a ni version ni test de bout en bout avec le vrai client.
5. **Pour aller au-delà de YouTube, le premier obstacle est côté TV.** Il y a deux contrôles `youtube.leanback.v4`, une hypothèse d'écran 4K et trois copies de l'appel Luna. Pour l'audio seul, l'exigence « au moins une image » est écrite à trois endroits, et le format WebM est supposé dans trois modules de plus.

## A. Carte de l'architecture à `8340014`

### A.1 Couches et dépendances réelles

Le tableau compte les `require` et `import` relatifs.

| Couche | Rôle observé | Dépend de |
|---|---|---|
| `core/` (24 fichiers, ~3 300 lignes) | domaine : session, questions, surveillance, recherche, outils vidéo | `core/` seulement (14 imports internes) |
| `adapters/` (42 fichiers) | Codex, Whisper, ffmpeg, disque, embeddings, fournisseurs simulés | `core/` (7 imports, dont `core/session.cjs` pour `restorable` en `adapters/session-library.cjs:4` et `core/deep-ask.cjs` pour une constante en `adapters/video-bridge.cjs:2`) |
| `runtime/` (14 fichiers) | compositions partagées, coordinateur serveur | `adapters/` (22), `core/` (13) |
| `app/` | hôte Electron et présentation Mac | `adapters/` (16), `runtime/` (7), `core/` (5, dont `app/recording.js:1` → `core/frame-policy.mjs` dans le navigateur) |
| `server/` (8 fichiers) | transport HTTP | `adapters/` (9), `runtime/` (1) |
| `mcp/` (2 fichiers) | processus MCP séparé | `core/` (2), et HTTP local vers `VideoBridge` (`mcp/server.cjs:11-45`) |
| `tv/app/` | page webOS, scripts classiques | rien (HTTP seulement) ; l'ordre de chargement est fixé par `tv/app/index.html:191-202` |
| `tv/*.py` et `prototypes/lg-remote/` | capture, contrôleur local, panneau natif | — ; le code installé sur la TV vit dans `prototypes/` (`docs/lg-installation.md:20-21`) |

**Aucune dépendance inverse.** Le sens des couches est tenu partout.

**Ce que la garde ne vérifie pas :**
- les imports `adapters` → `runtime`/`app` et `runtime` → `app` ;
- les minuteries globales dans `core/` (`core/deep-ask.cjs:85,91`, `core/living-recap.cjs:107`) ;
- l'écriture de `watch.asking`, absente de la liste protégée `ending|accepting|readOnly|closed` (`tests/architecture.test.cjs:34`).

### A.2 Racines de composition

- **Hôte Mac.** Tout se compose dans une seule fermeture, `app.whenReady().then(async () => {…})` (`app/main.cjs:58-547`).
  - Construits : configuration, garde disque, bibliothèque, modèles, fenêtre, table IPC, moments gardés, checkpoint, conversation, actions de moment, pont MCP, surveillance, résumé, vérification, sources de capture.
  - Session par session : `compose()` (`app/main.cjs:296-304`).
  - État d'hôte : variables `let` de module (`app/main.cjs:43-48`).
  - Transitions écrites en ligne (`app/main.cjs:344-499`).
- **Fenêtre Mac.** `app/renderer.js` fait 677 lignes. Le shell, la capture, la livraison d'état et le chat sont injectés. La surveillance (`:492-640`), les sessions (`:378-450`), les moments gardés (`:454-470`) et le résumé (`:646-677`) sont encore en ligne.
- **Hôte serveur.** Deux étages :
  - `server/main.cjs:22-52` : réglages, jeton, configuration ;
  - le constructeur de `HeadlessRuntime` (`runtime/headless-runtime.cjs:81-173`), qui construit lui-même garde disque, bibliothèque, conversation, surveillance, ingestion, coordinateur et deux `setInterval`.
- **Compositions partagées.**
  - Par session : `createSessionRuntime` (`runtime/session-runtime.cjs:28-231`), complété par les fournisseurs, le manifeste et le cycle de vie.
  - Par hôte : conversation (`runtime/conversation-runtime.cjs:16-69`), surveillance (`runtime/surveillance-runtime.cjs:43-551`), checkpoint des questions, protocole de fin (`runtime/session-closing.cjs:53-135`).
- **Page TV.** `tv/app/companion.js` compose deux clients HTTP, l'un vers le serveur, l'autre vers le contrôleur local (`:228`, `:249-252`). Elle compose aussi la frise, les sessions, la carte, la surveillance, le polling et le chat.
- **TV native.** `tv/controller.py:119-140` lance `tv/capture.py`. La disposition du panneau est gérée par `prototypes/lg-remote/runtime/panel.py`.

### A.3 D'une capture à une réponse affichée

**Côté Mac**
1. `RollingRecorder` découpe le flux et appelle `env.ingest` (`app/recording.js:90`). Cette fonction est injectée par `app/ui/browser-capture.mjs:34`, puis passe par `app/preload.cjs:64`.
2. `app/main.cjs:419-434` contrôle la session, appelle `validateSegment` (`runtime/session-runtime.cjs:249-283`) puis `watch.ingest`.
3. Dans `core/session.cjs` :
   - `ingest` et `land` (`:95-155`) ;
   - `drainAudio` (`:271-308`) → transcription Whisper ;
   - `drainVision` (`:317-375`) → `observeVisual` (`adapters/codex-perception.cjs:136`) → `CodexAnalysisAgent` → client Codex.
4. Chaque `emit()` (`core/session.cjs:506`) traverse l'enveloppe de session : index de fond et manifeste (`runtime/session-runtime.cjs:176-180`). Il atteint ensuite l'hôte (`app/main.cjs:299-303`), puis `bindPushedStates` (`app/ui/state-delivery.mjs:62`).
5. Une question part de `watch:ask` (`app/main.cjs:500-503`) vers `deep.start` (`core/deep-ask.cjs:57-75`), puis `run` (`:81-172`), qui valide les citations (`:129-145`). Le résultat suit la glue d'hôte (`app/main.cjs:147-163`) et le canal `deep:state`.

**Côté TV**
1. `tv/capture.py:90-150` prend quatre images par Luna et 8 s d'`arecord`. `Transport.deliver` (`tv/transport.py:50-95`) envoie ensuite le bloc.
2. Le serveur le reçoit dans cet ordre :
   - `server/http.cjs:123-146` ;
   - `server/routes.cjs:17-29` ;
   - `ingestBlock` (`server/ingest-routes.cjs:7-55`) : validation du fil, admission, époque, doublons, créneau unique.
3. `RemoteMedia.assemble` (`adapters/remote-media.cjs:70-130`) produit un WebM avec sharp et ffmpeg.
4. L'ingestion (`runtime/capture-intake.cjs:98-128`) revalide par `validateSegment`, puis appelle `watch.ingest` : à partir de là, c'est le même cœur que sur Mac.
5. `published` puis `emit` incrémentent la révision (`runtime/headless-runtime.cjs:241-254`).
6. La page interroge `GET /v1/state?view=…` avec un ETag (`tv/app/remote-client.js:90`). Le serveur répond depuis `runtime/headless-runtime.cjs:276-343` et `runtime/state-views.cjs:201-303`. La page fusionne la réponse (`tv/app/companion.js:560`), puis appelle `chatView.receive` (`:554`).
7. Une question passe par `POST /v1/questions`, puis `HeadlessRuntime.ask` (`runtime/headless-runtime.cjs:416-435`), puis le même `DeepAsk`.

### A.4 Où vit l'état, et qui le possède

| État | Propriétaire | Persistance |
|---|---|---|
| Passages, files, couverture | `WatchSession`, une par session | `session.json` = `snapshot()` (`core/session.cjs:513`). Le même objet est l'état publié, le format disque et la source des vues TV |
| Questions | `DeepAsk`, **une instance par hôte** | `deep-answers.json`, écrit par l'hôte (`app/main.cjs:159-162`, `runtime/headless-runtime.cjs:133`) |
| Surveillance | `Surveillance` et son runtime, **un par hôte** | `surveillance.json`, avec sa propre machine d'adoption |
| Résumé vivant | `LivingRecap`, Mac seulement | `living-recap.json`, écrit par `app/main.cjs:207` |
| Manifeste | `createSessionManifest` | `manifest.json`. Le titre est posé de l'extérieur (`app/main.cjs:409`) |
| Session chargée, transitions | serveur : `HeadlessSessionLifecycle` (`runtime/headless-session-lifecycle.cjs:39-49`) ; Mac : `loaded`, `transition`, `switching` dans `app/main.cjs` | — |
| Doublons et séquence des blocs | `RemoteServer` (`server/http.cjs:106-109`), modifié par la route (`server/ingest-routes.cjs:16-20,44-47`) | — |
| Réglages | objet `config` partagé, modifié après composition (B6) | `provider.enc`, `models.json`, `transcription.json` |
| Page TV | fermeture de `tv/app/companion.js:53-68` ; préférences en `localStorage` | — |
| TV native | rapport `/tmp/tvlens-capture-report.json` (`tv/capture.py:31,44-47`) ; disposition `/tmp/tvlens-panel-layout-*.json` (`tv/controller.py:91,102-105`, `panel.py:8-9`) | fichiers, sans schéma partagé |

### A.5 Où les frontières tiennent, où elles fuient

**Elles tiennent :**
- le cœur n'importe rien et le sens des couches est respecté ;
- Electron reste confiné à `app/` ;
- les modules extraits cette nuit reçoivent leurs dépendances ;
- la page TV ne parle qu'au transport HTTP.

**Elles fuient :**
- **Le domaine est piloté de l'extérieur.**
  - `watch.asking` est écrit par les deux hôtes (`app/main.cjs:150-153`, `runtime/headless-runtime.cjs:127-130`).
  - Ses tableaux internes sont lus directement (`app/main.cjs:313,531,535`, `server/session-routes.cjs:27`, `runtime/headless-session-lifecycle.cjs:144`).
  - L'hôte Mac écrit `deep.jobs = []` (`app/main.cjs:374`) et `store.manifest =` (`:409`).
- **Un cas d'usage commun vit dans un hôte** (B1).
- **Le cœur émet du texte qui sert d'identifiant ailleurs** (B4).
- **Le code installé sur la TV est hors des dossiers contrôlés.** `prototypes/` est exclu par `.prettierignore` et absent de `PROD_DIRS` (`scripts/quality/metrics.mjs:6`).

## B. Problèmes d'architecture, par gravité

### B1 — Critique : les cas d'usage de session existent deux fois, et ils divergent

**Preuve.** Côté serveur, ils sont dans `runtime/headless-session-lifecycle.cjs` (ADR 0024). Côté Mac, ils sont en ligne dans `app/main.cjs:344-499`, dans une fonction gelée en `max-lines-per-function`.

| Règle | Mac | Serveur |
|---|---|---|
| Session « vide », effacée au lieu d'archivée | `!readOnly && !passages && !deep.jobs.length` (`app/main.cjs:354`) | `fresh && !deep.jobs.length && !watch.questions.length && !passages` (`runtime/headless-session-lifecycle.cjs:141-145`) |
| Restaurer la surveillance | seulement si `sessionId === id` (`app/main.cjs:464`) | sans contrôle (`runtime/headless-session-lifecycle.cjs:232`) |
| Question en cours | filtrée sur la session chargée (`app/main.cjs:149`) | toute question ou fermeture (`runtime/headless-runtime.cjs:126`) |
| Questions sauvegardées | filtrées par session (`app/main.cjs:159-162`) | toutes (`runtime/headless-runtime.cjs:133`) |
| Ordre de fin | résumé, surveillance, questions, chat, capture (`app/main.cjs:358-368`) | préparations, capture, questions, surveillance, chat (`runtime/headless-session-lifecycle.cjs:147-164`) |
| Refus pendant une fin | drapeau `switching` (`app/main.cjs:132,171,346`) | `moving()` (`runtime/headless-runtime.cjs:417`) |
| Ouverture refusée si… | capture **ou analyse** en cours (`app/main.cjs:450`) | capture ou ingestion en cours (`runtime/headless-session-lifecycle.cjs:198-203,214`) |
| Lignes de bibliothèque | `app/session-rows.cjs:1-31` | `runtime/headless-runtime.cjs:464-515` |
| Disque plein à l'ingestion | `app/main.cjs:428-431` | `runtime/capture-intake.cjs:117-125` |
| Question sur un moment | invite construite (`app/moment-actions.cjs:16-27`) | sans cette invite (`runtime/headless-runtime.cjs:426-434`) |
| Tick de surveillance | sans garde (`app/main.cjs:184`) | gardé (`runtime/headless-runtime.cjs:217-222`) |
| Réglages d'environnement | `app/main.cjs:70-83` | `server/main.cjs:9-21` |

**Effet concret.**
- Une correction faite sur un hôte n'existe pas sur l'autre ; le tick Mac sans garde (réserve T177) en est un exemple.
- La même question sur un moment ne reçoit pas la même invite selon l'hôte.
- La garde `architecture-f07` vérifie par le texte que les deux hôtes appellent `closeSession` (`tests/architecture-f07.test.cjs:578-590`). Elle ne vérifie pas qu'ils appliquent les mêmes règles.

**Ce qui casse si on n'y touche pas.** Chaque fonctionnalité de cycle de vie, chaque étape propre à une source et tout troisième hôte se paieront deux fois. Exemple établi par lecture, non reproduit :
- sur Mac, on reprend une archive sans passage ;
- son `deep-answers.json` est illisible ;
- elle satisfait alors la règle « vide » et son dossier est effacé (`runtime/session-closing.cjs:113-121`).

### B2 — Critique : la session est éclatée entre des singletons d'hôte rebranchés à la main

**Preuve.**
- Seule la `WatchSession` est créée par session.
- Questions, surveillance, résumé, actions de moment et checkpoint sont des instances d'hôte. Chaque hôte les rebranche dans son propre ordre :
  - Mac : `app/main.cjs:458-470` à l'ouverture, `:370-375` à la fin ;
  - serveur : `runtime/headless-session-lifecycle.cjs:74-83,229-232`.
- Au moins quatre propriétaires écrivent dans le même dossier de session (A.4).
- Les liaisons tardives en portent la trace :
  - `getInstruction` doit attendre une surveillance composée plus bas (`app/main.cjs:144-145`, `runtime/headless-runtime.cjs:116-119`) ;
  - les accesseurs de `HeadlessRuntime` tolèrent un coordinateur encore absent (`this.lifecycle?.session`, `runtime/headless-runtime.cjs:185-196`).

**Effet.** L'intégrité d'une session dépend de l'ordre des appels écrit dans chaque hôte. C'est la cause de B1.

**Ce qui casse.** Tout nouvel état par session (une source, des préférences de session, une fonctionnalité proactive) deviendra un singleton de plus, à rebrancher deux fois.

### B3 — Majeur : chemins morts du cœur, et un mode simulé qui ne teste pas la production

**Preuve.**
- **`WatchSession.ask()`** (`core/session.cjs:386-425`), `selectEvidence` (`:524-536`) et le port `answer` n'ont aucun appelant de production.
  - Les deux hôtes passent par `DeepAsk` (`app/main.cjs:132`, `runtime/headless-runtime.cjs:427`).
  - Le port `answer` est câblé sur la perception (`runtime/session-runtime.cjs:170`), et `CodexPerception` n'a pas de méthode `ask` (`adapters/codex-perception.cjs:113,131,136`).
  - Seuls des tests l'appellent (`tests/session.test.cjs:32-80`, `tests/topic-summary.test.cjs:127`, `tests/watch-session-ending.test.cjs:112`).
- **La voie série** `drain()` (`core/session.cjs:237-268`) ne sert qu'aux perceptions qui n'ont que `observe` (`:59`).
  - Or la perception simulée n'a que `observe` et `ask` (`adapters/simulated-providers.cjs:40-58`). Elle est choisie dès que `smoke` est vrai (`runtime/session-providers.cjs:153-154`).
  - 21 fichiers de tests passent `smoke: true` ; 12 d'entre eux ne surchargent jamais la perception (relevé `rg`, dont `server-ingest-path`, `server-state-views`, `architecture-f05`, `-f06`, `-f07`). D'autres construisent eux-mêmes une perception `observe` seule (`tests/session-durable.test.cjs:405,571,610,973,1001`).
- **La déclaration d'images masquées** (`core/session.cjs:25-45,121-122,252,351` ; `adapters/remote-media.cjs:11-26,37,128`) n'a plus d'émetteur : `tv/capture.py` n'envoie plus `overlay` depuis T181.
- **`asking` est un mutateur public.** Les hôtes l'écrivent puis appellent `emit` et `drain` à la main.
  - La même glue est recopiée dans `tests/question-ceiling.test.cjs:40-42` et `scripts/simulate-stream.cjs:280`.
  - Une trentaine d'écritures directes existent dans les tests (`tests/session-latency.test.cjs:98-211`, `tests/split-perception.test.cjs:71-120`).
- **`core/session.cjs` est le fichier le plus central et l'un des plus denses.** Il est gelé en complexité ×7 et `max-lines`. 24 lignes dépassent 160 caractères, jusqu'à 580.

**Effet.** Une régression des deux voies réelles peut échapper aux bancs d'hôte.

**Ce qui casse.** Ajouter une voie (audio seul, sous-titres) dans une classe qui en porte déjà trois.

### B4 — Majeur : les erreurs se reconnaissent à leur texte, à travers couches et processus

**Preuve.**
- **Reprise d'une description (ADR 0008).** Elle repose sur des ensembles de messages français exacts écrits par d'autres modules (`adapters/codex-perception.cjs:23-55`). Le vérificateur fait de même (`adapters/codex-verifier.cjs:26-28`).
- **La page TV lit le texte des erreurs du serveur.**
  - Elle détecte un serveur sans vues par la regex `/vue d.état inconnue/` (`tv/app/chat-model.js:219`), qui vise le message de `runtime/headless-runtime.cjs:271`.
  - Elle détecte un disque plein ou une archive par `/\b507\b/` et `/\b409\b/` dans le texte (`tv/app/sessions-view.js:253,255`).
- **Les motifs de surveillance sont des phrases.** Ils sont émis en français (`core/surveillance.cjs:248,267,723`), et chacune des deux interfaces les traduit en d'autres phrases (`app/ui/surveillance-view.mjs:31-36`, `tv/app/surveillance-view.js:29-36`).
- **Codes et messages en double.**
  - `TVLENS_STORAGE_FULL` : `core/session.cjs:7` et `adapters/disk-guard.cjs:4`.
  - `TVLENS_VISION_TRANSIENT` : `core/session.cjs:10` et `adapters/codex-perception.cjs:16`.
  - La phrase « lecture seule » existe trois fois (`runtime/capture-intake.cjs:6`, `app/main.cjs:392`, `tv/transport.py:20`).
- **Le transport HTTP classe mal les erreurs.**
  - Toute erreur sans statut reçoit un 400 avec son message brut (`server/http.cjs:89-99`).
  - Pour la TV, un 4xx est un rejet définitif : le bloc est perdu (`tv/transport.py:85-88`). Un défaut de l'hôte devient donc une faute de la TV.
  - La sortie d'erreur de ffmpeg entre dans le message (`adapters/remote-media.cjs:62`), qui part vers le client. ffmpeg y cite d'ordinaire le chemin de son entrée, ce que je n'ai pas observé ici. C'est contraire à `docs/standards.md` (section Erreurs).
- **L'IPC Mac** ne transporte que le message ; le code est perdu (`app/preload.cjs:5-7`).

**Effet.** Reformuler une phrase change en silence une politique de reprise, une capacité détectée ou un libellé affiché.

**Ce qui casse.** Les refus d'une nouvelle source (application non prise en charge, pas de vidéo) suivront la même pente. Déjà décrit dans les fiches parquées T124, T125, T051 et T052.

### B5 — Majeur : contrats implicites entre serveur et TV, et entre Python et page

**Preuve.**
- **Aucun test bout en bout.** Aucun fichier de test ne cite à la fois `RemoteServer` et un script de `tv/app` (relevé `rg`). La fiche T038, qui le prévoit, est parquée.
- **Ni version ni capacités.** La page devine les vues à partir d'une erreur (B4). Elle garde un chemin « ancien serveur » (`tv/app/chat-model.js:190-205,229-246`).
- **Les questions partent vers la TV par liste d'exclusion.** La vue légère d'une question retire des champs (`runtime/state-views.cjs:61-98`), alors que l'en-tête de session liste ceux qu'il garde (`:15-35`). Tout champ ajouté à un job de `DeepAsk` part donc vers la TV.
- **Les libellés de carte et de verdict existent trois fois** (`core/surveillance.cjs:68-70`, `app/ui/surveillance-view.mjs:19-20`, `tv/app/surveillance-view.js:10-18`).
- **Python ↔ page.**
  - Le rapport de capture n'a pas de schéma : il est écrit par `tv/capture.py:42-52` et lu par `tv/app/sessions-view.js:241-320`.
  - Les causes de perte ne sont protégées que par une regex JavaScript appliquée au texte du Python (`tests/tv-panel.test.cjs:518-521`).
  - La disposition du panneau passe par des fichiers `/tmp` : écrits par `panel.py` (`:8-9,120,136`), servis bruts par `tv/controller.py:90-92`, lus par `tv/app/companion.js:257-283`.
  - Les textes « YouTube » sont écrits deux fois (`tv/capture.py:25`, `tv/app/sessions-view.js:301`).

**Effet.** La TV et le VPS ne se livrent pas ensemble (`docs/architecture.md:5`). Un écart ne se voit qu'à l'usage.

### B6 — Majeur : état mutable partagé et caché

**Preuve.**
- **La langue de transcription passe par une mutation de `config`.** `config.transcriptionLanguage` est modifié (`runtime/headless-runtime.cjs:179`) et lu tard par `getLanguage` (`runtime/session-providers.cjs:56`).
- **Côté Mac, `config` est modifié puis réaffecté.**
  - Modifié aux lignes `app/main.cjs:72-74,89,267`, puis réaffecté à l'import (`:272`).
  - La conversation et la surveillance gardent l'ancien objet (`:142-146`, `:175-181`).
  - L'hôte recopie alors `authHome` et `model` champ par champ (`:265-266,272`).
- **Des adaptateurs sont corrigés de l'extérieur :**
  - `this.deep.now =` (`runtime/headless-runtime.cjs:140`) ;
  - `thumbnails.bytes =` (`runtime/session-lifecycle.cjs:19`) ;
  - `saved.transcriber =` (`app/main.cjs:307`) ;
  - `deep.jobs = []` (`:374`) ;
  - `store.manifest =` (`:409`).
- **Des champs de l'ère OpenRouter restent dans la configuration** (`adapters/config.cjs:12-23`). `inspectionStrategy` et `budgetFile` n'ont aucun lecteur ; `model` et `audioInput` ne servent plus qu'à l'affichage (`app/main.cjs:257`).

**Effet.** Changer de compte, de modèle ou de langue marche par énumération manuelle des destinataires. Un oubli laisse un rôle sur l'ancien réglage.

**Ce qui casse.** Des réglages propres à une source prendraient la même voie.

### B7 — Majeur : la zone surveillance, intacte, est la moins découpée

**Preuve.**
- **`core/surveillance.cjs`** (921 lignes) mélange :
  - des heuristiques de texte français (`:118-350`) ;
  - la machine d'états des affirmations et des lots ;
  - l'ordonnancement ;
  - des libellés (`:68-80`) ;
  - quatre projections dans un seul `snapshot()` de 85 lignes (`:826-910`).

  Il est gelé en complexité ×9, `max-lines` et 13 ternaires imbriqués. 73 lignes dépassent 160 caractères.
- **`runtime/surveillance-runtime.cjs`** est une fermeture d'environ 500 lignes.
  - Une quinzaine de variables mutables (`:74-101`) forment une machine d'états implicite, avec un délai de 5 s (`:12`).
  - Un registre se valide en construisant un cœur jetable (`:324-334`).
- **Le tick dépend de deux minuteries d'hôte**, qui ne se gardent pas pareil (B1).
- **Les règles d'affichage sont redites dans les deux vues** (`app/ui/surveillance-view.mjs:5-17`, `tv/app/surveillance-view.js:5-9`). La vue TV fait 1 102 lignes et est gelée en complexité ×8.
- **Les tests sont minces.**
  - 300 tours de micro-tâches (`tests/surveillance.test.cjs:8`).
  - Une lecture du source (`:624`).
  - 2 cas seulement en 257 lignes (`tests/server-surveillance.test.cjs`).
- **Deux réserves T177 sont de vrais défauts** (C).

**Effet.** La fonction la plus appelée à évoluer est la plus coûteuse à changer. Ajouter un état d'affirmation demande trois modifications.

### B8 — Moyen : dette des tests

**Tests qui lisent le source.**
- `tests/helpers/source-shape.cjs` normalise le JavaScript pour en comparer des fragments. Il est utilisé 44 fois dans `tests/mac-ui.test.cjs` (par exemple `:357-359`, `:706-711`, `:809-810`) et dans `tests/mac-ipc-contract.test.cjs:91-94`.
- Des gardes de pureté sont écrites fichier par fichier (`tests/question-checkpoint.test.cjs:243-249`, `tests/architecture-f07.test.cjs:578-590`, `tests/chat-trace.test.cjs:55`, `tests/surveillance.test.cjs:624`).
- `preload.cjs` est exécuté par `new Function` à quatre endroits (`tests/mac-ipc-contract.test.cjs:53`, `tests/mac-ui.test.cjs:1242`, `tests/architecture-f05.test.cjs:624`, `tests/architecture-f07.test.cjs:218`).

**Assistants dupliqués.** `tests/helpers/wait.cjs:21` exporte `deferred`, mais 21 fichiers le redéfinissent ; de même `tick` dans 21 fichiers et `settle` dans 17.

**Horloge.**
- 63 occurrences de `setTimeout` dans 33 fichiers de tests (comptage de texte, qui inclut des usages légitimes).
- `DeepAsk` capture `Date.now` à sa construction (`tests/question-ceiling.test.cjs:27-28`) : l'horloge doit être installée avant.

**Noms par chantier.** Neuf fichiers (`architecture-f04` à `-f10`, `refactor-boundaries`, `review-regressions`), environ 3 300 lignes, portent les preuves des protocoles de fin et d'ingestion.

**Cliquet.** `cas_de_test` compte toutes les lignes `test(` (`scripts/quality/metrics.mjs:72`). Environ 330 des 1 305 cas portent sur le harnais et l'outillage :

| Fichiers | Cas |
|---|---:|
| `ticket-loop` | 124 |
| `loop-view*` | 106 |
| `watch-loop*` | 35 |
| `agent-guards` | 32 |
| `coverage-report` | 16 |
| `quality-check` | 15 |
| `npm-scripts` | 4 |

**Des tests qui dictent le design.**
- Le coordinateur passe par la façade de l'hôte pour que les sondes des tests le voient (`runtime/headless-runtime.cjs:63-68`, `tests/architecture-f07.test.cjs:180`).
- Il en reste une vingtaine de délégations. Cinq n'ont plus aucun appelant : `leave`, `adopt`, `located`, et les accesseurs `releasing` et `transition` (`runtime/headless-runtime.cjs:203-211,371-373,447-449,456-458`).

### B9 — Moyen : l'app TV en scripts classiques

**Preuve.**
- Les dépendances sont portées par l'ordre des balises (`tv/app/index.html:191-202` ; ADR 0011, section Conséquences).
- L'enveloppe UMD et l'astuce `module.require` sont recopiées dans chaque script (`tv/app/companion.js:3-4`).
- `companion.js` garde :
  - la navigation à la télécommande (`:137-218`) ;
  - deux orchestrations entre deux serveurs, en temps réel non injecté : la bascule de disposition (`:260-283`) et la fin de session (`:328-343`).
- `surveillance-overlay.js` garde ses propres `clock` et `plural` (`:63,83`), alors que leur justification, la page ambiante, a disparu. `OverlayQueue.prototype.seen` survit aussi (`:286`).

**Effet.** Chaque écran ajoute des globales et des contraintes d'ordre. Les deux orchestrations ne se testent pas sans vraie horloge.

**Ce qui casse.** Rien d'immédiat. Le coût monte à chaque écran.

### B10 — Moyen : le côté Python de la TV

**Preuve.**
- **`tv/capture.py`.** `run()` fait 135 lignes (`:30-164`). Sont écrits en dur : le contrôle YouTube (`:108`), le périphérique ALSA (`:99`), la géométrie (`:109,118`). Il a son propre analyseur Luna (`:9-16`).
- **Luna existe en trois copies.** `tv/luna.py`, injectable, n'a aucun importeur (réserve T166). Une troisième copie est dans `panel.py:34-50`.
- **`panel.py`** n'accepte que YouTube, en 4K plein écran (`:75-78`).
- **Le code installé échappe au contrôle.** Il vit dans `prototypes/`, et ses 18 tests ne sont pas lancés : le contrôle ne découvre que `tests/` (`scripts/check.mjs:182`).
- **Les chemins `/tmp`** de `tv/controller.py` ne sont pas injectables (`:91,102-105`).
- **Aucun lint ni cliquet sur le Python.**

**Effet.** C'est le premier obstacle pour Netflix.

### B11 — Moyen : la source de capture n'est pas un concept du code

**Preuve.**
- `CapturedSegment` suppose un clip et des images (`core/ports.cjs:7`).
- « Au moins une image » est exigée :
  - par `validateRemote` (`adapters/remote-media.cjs:32`) ;
  - par `validateSegment` (`runtime/session-runtime.cjs:268-282`), qui sert aux deux hôtes (`app/main.cjs:421`, `runtime/capture-intake.cjs:105`) ;
  - par la capture TV (`tv/capture.py:137`).
- Un clip non vide est exigé (`runtime/session-runtime.cjs:257-262`).
- Le format WebM est supposé partout :
  - `RemoteMedia` le fabrique toujours depuis les images (`adapters/remote-media.cjs:100-109`) ;
  - la perception tronque les images (`adapters/codex-perception.cjs:142`) ;
  - l'inspecteur lit un `.webm` (`adapters/clip-inspector.cjs:27`).
- Les bornes n'ont pas de nom et diffèrent selon la couche :
  - 5 images sur le fil TV, 8 au contrôle canonique ;
  - 10 s sur le fil TV, 60 s au cœur (`core/session.cjs:97`) ;
  - la tolérance de 3 000 ms est écrite trois fois (`runtime/session-runtime.cjs:254`, `server/ingest-routes.cjs:4`, `runtime/headless-runtime.cjs:422`).
- La session ne dit pas sa source : le manifeste porte seulement `host`.
- La politique de découpage existe en deux langages (`app/recording.js:50`, `tv/capture.py:90-104`).

**Effet.** Une source audio seule touche cinq couches.

### B12 — Faible : documentation et résidus

- **`docs/architecture.md` est périmé.**
  - Il ne cite aucun des 14 modules créés cette nuit (zéro occurrence de `capture-intake`, `headless-session-lifecycle`, `state-views`, `poll-controller`, `chat-view`, etc.).
  - Il se dit « État du 13 octobre » (`:5`).
  - Il annonce encore des adaptateurs `observe` et des stratégies OpenRouter, retirés par l'ADR 0016.
- **`saveAuto`** n'a aucun appelant (`adapters/local-store.cjs:188`), mais `auto.json` est encore lu (`adapters/session-library.cjs:137`).
- **`close({ purge })`** n'a d'appelants que dans les tests (`runtime/session-lifecycle.cjs:82-101`).
- **`/v1/surveillance/overlay`** n'a pour consommateur qu'un banc (`scripts/bench-perceived.cjs:252`). Son commentaire cite encore l'affichage ambiant (`runtime/headless-runtime.cjs:344`).
- **Deux routes font la même fin** (`server/session-routes.cjs:63-64`).
- **La densité du code échappe aux seuils.** `.prettierignore` exclut tout le JavaScript, et les seuils ESLint comptent des lignes. Un cœur écrit en lignes de 300 à 700 caractères échappe donc à `max-lines-per-function`, comme `DeepAsk.run` (`core/deep-ask.cjs:81-172`).

## C. Tri des 93 réserves

Les lignes citées par les réserves datent de leur ticket. « (vérifié) » marque celles que j'ai revérifiées à `8340014`.

| Thème | Réserves (ticket) | Nb | Verdict | Suite |
|---|---|---:|---|---|
| Bruit d'extraction (« Nombre de constats discordant ») | T032, T147, T148, T168, T173, T174, T177, T181, T182 | 9 | Rien côté produit : défaut de l'extracteur du harnais | ticket de harnais, hors itération |
| Écarts acceptés, processus | T046 ×2, T139 ×3, T147, T148 ×2, T163, T168, T171, T174, T176 ×2, T179 ×2, T184 (plancher), T185 | 18 | Rien | — |
| Obsolètes (« ESLint non lancé ») | T021, T148, T150 | 3 | Rien : T031 a installé ESLint | — |
| Limites de preuve | T101 (smoke frise), T168 (capture Mac réelle), T176 R5, T182 (smokes) | 4 | Rien à coder | passage manuel TV et Mac avant tout déploiement |
| Documentation, ADR, commentaires périmés | T031 ×2 (règle annoncée par `docs/standards.md:42`), T032, T139 ×2 (`.env.example:9-10`, `adapters/codex-confinement.cjs:11` (vérifié)), T165 ×2, T168 (ADR 0018), T169 ×2 (ADR 0011), T170 ×2, T182 | 13 | Dette | **D3** ; résidus de T139 → **D2** ; consignes → harnais |
| Résidus des retraits ambient | T166 ×2 (`tv/luna.py` (vérifié)), T181 (fixture de porte), T182 ×3 (`seen` (vérifié), commentaires (vérifié), mock `/ambient`) | 6 | Dette | **D2** (avec F2) ; `luna.py` → **D7** |
| Constantes en double ou sans nom | T046 ×2 (4 000 000), T147 (`'fr'` ×2 (vérifié)), T149 ×2 (1000/720 (vérifié)), T150 ×2 (1600 (vérifié)) | 7 | Dette mineure | pas de ticket : **D6**, **D11**, **D4** |
| Erreurs et diagnostics | T147 (`refusal`), T173 (format des erreurs de fin en double (vérifié) : `runtime/session-lifecycle.cjs:1,60` contre `session-closing.cjs:10-11`), T176 R1, R2, R3, R4, R6, T184 (`release`) | 8 | R2 et R4 sont des **défauts potentiels**, le reste est de la dette | **R2 : ticket à part** (arbre privé lié aux identifiants laissé sans diagnostic) ; **R4 : petit ticket** (index reconstruit en silence, refacturé) ; T147, T173, R1, R3 → **D4** ; R6, T184 : rien pour l'instant |
| Vrais défauts de comportement | T148 constat 2 (vérifié : `id` lu avant l'`await` en `app/main.cjs:319-321`, puis `loaded.runtime` déréférencé en `app/session-rows.cjs:27-28`), T177 (tick Mac sans garde (vérifié) `app/main.cjs:184`), T177 ×2 (tick partiel, `toldAs` avancé avant la publication), T100 ×2 (échec Whisper à 5 003 ms, cause inconnue) | 6 | Vrais défauts, établis par lecture | **trois tickets à part** : garde du tick Mac, `sessionRows`, reproduction de l'échec Whisper ; tick partiel et `toldAs` → **D12** |
| Outillage | T031 ×2 (ESLint déprécié), T163 ×5, T182 (`ResourceWarning`) | 8 | Dette faible | ticket `installe: oui` ; harnais ; **D9** |
| Dette de tests | T016, T021 (contenu non repris par la réserve), T148 constat 3 (lectures tardives), T168 (environnement par défaut du recorder (vérifié) `app/recording.js:16-24`), T174, T180 ×2 (gardes f07 aveugles), T183 (deux faux DOM) | 8 | Dette | **D3**, **D13**, **D14** |
| Minuteries globales | T175 ×2 (vérifié : `adapters/codex-session-client.cjs:486-490`) | 2 | Dette | **D10** |
| Produit | T171 (navigation vers une citation) | 1 | Rien | ticket produit |

**Bilan.** 34 réserves ne demandent rien : 9 de bruit, 18 écarts acceptés, 3 obsolètes, 4 limites de preuve. Sur les 59 autres, 8 décrivent 7 défauts réels ou probables. Cinq méritent un ticket à part :
1. la garde du tick Mac ;
2. `sessionRows` ;
3. l'arbre privé laissé sans diagnostic (T176 R2) ;
4. l'index reconstruit en silence (T176 R4) ;
5. la reproduction de l'échec Whisper.

Le reste se règle dans les chantiers de D.

## D. Recommandations, classées par rapport valeur / coût

Les tailles sont en tickets d'une session. Les numéros T renvoient aux fiches existantes, à rafraîchir.

### D1 — Le domaine possède l'état « question en cours »

- **Ce qu'elle livre.** Les hôtes n'écrivent plus le domaine. La glue « en cours → émettre → relancer » disparaît des deux hôtes, des tests et des scripts.
- **Forme cible.**
  - `watch.setQuestionPending(busy)` remplace le mutateur `asking`.
  - Une fonction partagée de `runtime/` décide si une question de *cette* session est active, ce qui tranche la divergence B1.
  - La garde d'architecture protège aussi `asking`.
- **Preuve.** B3, B1.
- **Risques.** Le temps de vision retenu dépend du mutateur (`core/session.cjs:76-82`). Une trentaine d'écritures sont à migrer.
- **Séquence.**
  - Étendre : ajouter la méthode.
  - Migrer : les hôtes, `question-ceiling`, `session-latency`, `split-perception`, `architecture-f08`, `scripts/simulate-stream.cjs`.
  - Contracter : retirer le mutateur, étendre la garde.
- **Taille.** 1 à 2 tickets.
- **Dépendances.** Aucune.

### D2 — Couper les chemins morts du cœur et faire passer le mode simulé par les deux voies

- **Ce qu'elle livre.**
  - Les bancs d'hôte vérifient enfin la voie de production.
  - `core/session.cjs` perd environ 100 lignes.
  - Disparaissent aussi : la déclaration d'overlay, `saveAuto` et la lecture d'`auto.json`, les cinq délégations mortes, les champs de configuration sans lecteur.
- **Forme cible.**
  - La perception simulée expose `transcribe` et `observeVisual`.
  - `WatchSession` n'a plus `ask`, `selectEvidence`, `answer`, ni la voie série.
  - `core/ports.cjs` ne décrit que les deux voies.
- **Preuve.** B3, B12.
- **Risques.**
  - Des tests réglés sur l'ordre série rougiront : chaque rouge est à lire.
  - La règle « réponse sans citation → insuffisante » (`core/session.cjs:413-417`) doit être confirmée dans `DeepAsk` avant la suppression.
  - Les anciennes archives portent `questions` : continuer à les lire.
  - Le plancher `cas_de_test` baisse (F1).
- **Séquence.**
  - Étendre : deux voies dans le simulé, avec un test qui prouve que le mode simulé passe par `drainAudio` et `drainVision`.
  - Migrer : les tests de `ask` qui valent d'être gardés passent sur `DeepAsk`.
  - Contracter : suppressions et commentaires.
- **Taille.** 3 tickets.
- **Dépendances.** D1 ; décisions F1 et F2.
- **Nouvelle source.** Une voie de moins à porter : ajouter une voie devient un changement local.

### D3 — Une carte d'architecture vérifiée, et une règle de modules à la place des gardes textuelles

- **Ce qu'elle livre.**
  - Une seule table des couches dans `tests/architecture.test.cjs` : sens autorisés, minuteries de `core/` avec une liste d'exceptions qui doit décroître, drapeaux du domaine.
  - Une liste de « modules purs » vérifiée par une seule règle, qui remplace les gardes de pureté dispersées.
  - `docs/architecture.md` réécrit depuis cette table.
- **Preuve.** A.1, B8, B12, réserves T174 et T180.
- **Risques.** Faibles : la garde reste textuelle, ce que `docs/standards.md` admet pour l'architecture.
- **Séquence.**
  - Étendre : la table, à côté des gardes existantes.
  - Migrer : retirer les gardes une à une.
  - Contracter : la documentation ne dit plus que ce que la table vérifie.
- **Taille.** 2 tickets (T025, T030 et T108 rafraîchis, sans leurs chaînes de dépendances).
- **Dépendances.** Aucune ; à faire tôt, car elle protège D6.
- **Nouvelle source.** Fixe où une source a le droit de vivre.

### D4 — Codes d'erreur stables, de l'émetteur au client

- **Ce qu'elle livre.**
  - Chaque erreur lue par une autre couche porte un `code` exporté par son émetteur.
  - Les classifications lisent ces codes.
  - Le fil HTTP répond 500, avec un message générique, à toute erreur sans statut.
  - Les codes traversent l'IPC Mac.
  - La TV ne lit plus aucun texte d'erreur.
- **Forme cible.**
  - `core/errors.cjs` pour les codes du domaine : stockage plein, lecture seule, description passagère, motifs de surveillance.
  - Les codes Codex et du modèle local vivent dans leurs adaptateurs.
  - `sendError` n'a plus de repli 400.
  - L'IPC renvoie `{ message, code }`.
  - La sortie de ffmpeg va en `cause`, pas dans le message.
- **Preuve.** B4.
- **Risques.**
  - Passer de 400 à 500 fait **renvoyer** par la TV ce qu'elle jetait, pendant les 30 s de vie du bloc (`tv/transport.py:50-92`).
  - Les motifs passés en codes changent `surveillance.json` : lire les deux formes.
- **Séquence.**
  - Étendre : codes posés sans changer les messages (T124).
  - Migrer : lecteurs, puis fil 500 (T125, T051, T052).
  - Contracter : supprimer les ensembles de messages et les regex ; une garde refuse toute comparaison de `.message` en production.
- **Taille.** 4 tickets.
- **Dépendances.** Retirer de ces fiches leurs dépendances T028 et T038.
- **Nouvelle source.** Une source déclare ses refus par code, et chaque client les traduit une fois.

### D5 — Figer et tester les contrats de données : le fil `/v1` et l'archive de session

- **Ce qu'elle livre.**
  - Un test où le vrai client du panneau (`RemoteClient` et la fusion d'état) parle au vrai `RemoteServer`, sur un `HeadlessRuntime` simulé (T038).
  - `GET /v1/session` annonce `api` et `capabilities` (T044).
  - La vue légère d'une question devient une liste d'inclusion.
  - Une archive de référence figée doit se rouvrir (T037), et `session.json` reçoit un champ de format.
- **Preuve.** B5 ; A.4 (`snapshot()` sert aussi de format disque).
- **Risques.**
  - La liste d'inclusion peut retirer un champ lu par une carte : l'inventaire se fait par le test de bout en bout.
  - Les TV installées gardent l'ancien client (F4).
- **Séquence.**
  - Étendre : test de bout en bout et archive figée, sans rien changer.
  - Migrer : `api` et capacités, puis leur lecture par la page, puis la liste d'inclusion.
  - Contracter : supprimer la détection par message (après D4), puis plus tard le chemin legacy.
- **Taille.** 3 à 4 tickets.
- **Dépendances.** D4 pour la contraction.
- **Nouvelle source.** Les capacités disent à un client ce que le serveur sait faire, par exemple une session sans vidéo, sans qu'il ait à deviner.

### D6 — Un coordinateur de session partagé par les deux hôtes (le chantier structurant)

- **Ce qu'elle livre.**
  - Démarrer, ouvrir, reprendre, terminer, supprimer et quitter s'écrivent une fois.
  - L'hôte Mac ne garde que l'IPC, la fenêtre et ses étapes propres : résumé, actions de moment, pont MCP, balayage d'horloge.
  - Chaque règle du tableau B1 n'existe plus qu'une fois.
- **Forme cible.**
  - `runtime/session-host.cjs` (`createSessionHost`) généralise `HeadlessSessionLifecycle`. Il reçoit des crochets d'hôte : `beginEnd`, `extraSteps`, `onAdopt`, `onLetGo`, `onOpened`.
  - `createCaptureIntake` sert aussi l'IPC Mac, sans la préparation HTTP.
  - Les lignes de bibliothèque deviennent une fonction pure partagée.
  - Une seule fonction lit les réglages d'environnement.
  - Nouvel ADR qui prolonge les ADR 0007 et 0024.
- **Preuve.** B1, B2.
- **Risques.**
  - L'ordre de fin Mac change (F3).
  - `switching` garde aussi le pont MCP et les questions (`app/main.cjs:132,171`) : il devient `moving()`.
  - Le banc IPC lit `main.cjs` par sa forme : il faut le migrer au fil des tickets.
- **Séquence.**
  - Étendre :
    1. règles pures partagées : vide, question en cours (D1), lignes, disque plein ;
    2. crochets d'hôte dans le coordinateur, sans changement côté serveur.
  - Migrer :
    3. Mac `start`, `pause`, `resume` ;
    4. Mac `open` ;
    5. Mac fin, suppression, sortie.
  - Contracter :
    6. supprimer `transition`, `switching` et les façades mortes ; la garde f07 cible le module partagé.
- **Taille.** 6 tickets.
- **Dépendances.** D1, D3 ; D2 conseillé.
- **Nouvelle source.** Ses étapes de fin propres s'ajoutent une seule fois. Un troisième hôte réutilise le coordinateur.

### D7 — Côté TV : une politique « application regardée », un seul module Luna, `capture.py` découpé

- **Ce qu'elle livre.**
  - Un seul endroit décide quelles applications se capturent et sous quel nom.
  - Un seul module appelle Luna.
  - La capture devient des unités à horloge injectée.
- **Forme cible.**
  - `tv/sources.py` contient une seule entrée, `{'youtube.leanback.v4': 'YouTube'}`, lue par `tv/capture.py:108` et `panel.py:75`.
  - Le rapport porte le nom de l'application, et les textes deviennent « sans lecture de {application} ».
  - `tv/luna.py` remplace `capture.luna` et `panel.call`.
  - `run()` se découpe en : échantillonneur d'images, enregistreur audio, assembleur de bloc, boucle. Cela remplace `capture.FRAME_STEP = 0.02` dans les tests (`tests/test_tv_capture.py:33`).
- **Preuve.** B10, réserve T166.
- **Risques.**
  - Aucun essai sur l'appareil dans la boucle : tout passe par de faux exécutables.
  - L'hypothèse 4K est une contrainte matérielle validée : la nommer, pas la lever.
- **Séquence.**
  - Étendre : `sources.py` et `luna.py`, branchés en parallèle.
  - Migrer : `capture.py`, puis `panel.py`.
  - Contracter : supprimer les copies et les littéraux.
- **Taille.** 3 tickets.
- **Dépendances.** D9, pour le panneau.
- **Nouvelle source.** C'est la recommandation qui prépare Netflix sans la construire : une application de plus devient une entrée de table, plus un essai sur la TV.

### D8 — Un contrat de segment unique, aux bornes nommées et aux modalités dites

- **Ce qu'elle livre.**
  - `validateSegment` quitte la composition de session.
  - Toutes ses bornes ont un nom ; la tolérance de 3 000 ms existe une fois.
  - Les exigences de modalité sont écrites, et non sous-entendues dans cinq couches.
- **Forme cible.**
  - `runtime/segment-contract.cjs` exporte `SEGMENT_LIMITS` et `validateCapturedSegment(input, { now })`.
  - Les validateurs du fil restent propres à chaque transport.
  - Un champ `media: { video, audio }`, dérivé de ce qui est présent, accompagne le passage.
  - « Sans image » reste refusé : on écrit la règle, on ne l'assouplit pas.
- **Preuve.** B11.
- **Risques.** Le fil TV ne change pas. Ouvrir l'audio seul ici serait construire d'avance.
- **Séquence.**
  - Étendre : le module, appelé par les deux hôtes.
  - Migrer : les constantes.
  - Contracter : supprimer les littéraux.
- **Taille.** 2 tickets.
- **Dépendances.** D2.
- **Nouvelle source.** Le jour de l'audio seul, on change une règle, puis on suit les lecteurs de `media.video`.

### D9 — Un contrat Python ↔ page, et le code installé sorti de `prototypes/`

- **Ce qu'elle livre.**
  - Les causes de perte, les raisons d'arrêt et les champs du rapport sont déclarés une fois en Python et lus par les deux suites (T022).
  - Les chemins `/tmp` et les champs de disposition deviennent des constantes communes à `controller.py` et `panel.py`.
  - Le panneau et le mapper passent sous `tv/`, et leurs tests tournent dans le contrôle (T102, T103, T014).
- **Preuve.** B5, B10.
- **Risques.** Le chemin d'installation change dans la documentation. T102 est marqué `harnais: oui` et a neuf dépendances.
- **Séquence.**
  - Étendre : déclaration Python.
  - Migrer : test du panneau sur cette déclaration, puis déplacement seul.
  - Contracter : supprimer la regex sur le Python (`tests/tv-panel.test.cjs:518-521`).
- **Taille.** 3 tickets.
- **Dépendances.** F7.
- **Nouvelle source.** Une raison d'arrêt propre à une source arrive avec son libellé, prouvé par test.

### D10 — Un cœur lisible : `DeepAsk` découpé, minuteries injectées, format appliqué module par module

- **Ce qu'elle livre.**
  - La validation des preuves sort de `DeepAsk.run` (T122).
  - `DeepAsk` et `LivingRecap` reçoivent leurs minuteries et leur horloge, comme le checkpoint (ADR 0015).
  - `HeadlessRuntime` n'a plus deux paires d'options de minuteries, mais un seul objet.
  - Chaque module découpé est aussi formaté.
- **Preuve.**
  - `core/deep-ask.cjs:85,91,145,164` : minuteries globales, lignes de 697 caractères.
  - `runtime/headless-runtime.cjs:140`.
  - Réserve T175.
- **Risques.**
  - Formater sans découper fait apparaître des infractions que le gel refuse (F6).
  - Le contrat de libération de l'ADR 0004 est subtil.
- **Séquence.**
  - Étendre : options, avec les mêmes défauts.
  - Migrer : les tests du plafond ; extraire la validation.
  - Contracter : formater `deep-ask.cjs`, puis `video-tools.cjs` et `session.cjs`.
- **Taille.** 3 tickets.
- **Dépendances.** D2 avant `session.cjs`.

### D11 — Des réglages immuables, une reconfiguration explicite

- **Ce qu'elle livre.**
  - `config` est gelé après lecture.
  - La langue, les modèles et le compte passent par un objet de réglages injecté et observable.
  - Une seule fonction reconfigure les rôles Codex.
  - La langue par défaut n'existe qu'une fois.
- **Forme cible.**
  - `runtime/host-settings.cjs` expose `read()` et `onChange()`.
  - `applyModelSelection(roles, selection)` est partagée par les deux hôtes.
- **Preuve.** B6, réserve T147.
- **Risques.**
  - Les appels en cours doivent garder leur réglage.
  - Le banc Mac remplace des champs après import.
- **Séquence.**
  - Étendre : l'objet de réglages.
  - Migrer : langue, puis modèles, puis compte.
  - Contracter : `Object.freeze(config)`.
- **Taille.** 2 tickets (T134 en partie).
- **Dépendances.** D6 conseillé.
- **Nouvelle source.** Les réglages propres à une source ont un propriétaire.

### D12 — La surveillance découpée : texte, registre, projections, persistance

- **Ce qu'elle livre.**
  - Trois modules purs : texte, registre, projections (complète, brève, cartes).
  - Une persistance qui est un objet à états nommés, et non une fermeture à quinze variables.
  - Un tick possédé par le runtime, avec une minuterie injectée.
  - Motifs et libellés servis par le serveur ; les vues ne recopient plus les règles d'éligibilité.
- **Preuve.** B7, réserves T177.
- **Risques.** La zone a le filet de tests le plus mince, et la barrière d'archive dépend du dernier refus d'écriture (ADR 0002).
- **Séquence.**
  - Étendre :
    1. caractérisation à la frontière publique (T120) ;
    2. extraction du texte.
  - Migrer :
    3. projections ;
    4. persistance (corrige `toldAs` et le tick partiel) ;
    5. tick dans le runtime.
  - Contracter :
    6. retirer libellés et règles des vues.
- **Taille.** 6 tickets.
- **Dépendances.** D4, D1.
- **Priorité.** À monter en tête si la prochaine fonctionnalité touche la surveillance.

### D13 — La présentation Mac finie en contrôleurs injectés, sans gardes textuelles

- **Ce qu'elle livre.**
  - La surveillance, les sessions, les moments gardés et le résumé sortent de `app/renderer.js` en contrôleurs injectés, sur le modèle de `capture-controller.mjs`.
  - Les 44 assertions sur la forme du code deviennent des tests de comportement.
  - `RollingRecorder` perd son environnement par défaut, qui dépend de `window.tvlens`.
- **Preuve.** B8, réserves T148 et T168.
- **Risques.** La fraîcheur des lectures (ADR 0025) doit être conservée.
- **Séquence.**
  - Étendre et migrer : un contrôleur par ticket.
  - Contracter : supprimer `source-shape.cjs`.
- **Taille.** 4 tickets.
- **Dépendances.** D3.

### D14 — Des assistants de test uniques, des fichiers nommés par comportement

- **Ce qu'elle livre.**
  - `deferred`, `tick` et `settle` viennent tous de `tests/helpers/wait.cjs` (T062).
  - Les neuf fichiers nommés par chantier sont renommés et répartis par comportement (T078-T086).
  - En option, les cas du harnais sont comptés à part (F8).
- **Preuve.** B8.
- **Risques.** Toucher `metrics.mjs` est un ticket de harnais.
- **Séquence.**
  - Étendre : les assistants existent déjà.
  - Migrer : par lots de fichiers.
  - Contracter : une règle refuse les redéfinitions locales.
- **Taille.** 3 tickets, plus 1 ticket de harnais.

### Ordre proposé

1. D1, D2, D3, avec les cinq tickets à part de C.
2. D4, puis D5.
3. D6.
4. D7, D8 et D9, avant toute nouvelle source.
5. D10 et D11 au fil de l'eau.
6. D12, D13 et D14 selon la prochaine fonctionnalité.

## E. Ce qu'il ne faut pas faire

- **Passer l'app TV en modules ES avec un bundler, ou en framework.** La page se charge en `file://` sur un moteur dont la version n'est écrite nulle part (`tests/tv-app-compat.test.cjs:7-9`), et aucun essai sur l'appareil n'est possible dans la boucle. Un bundle séparerait ce qui est testé de ce qui tourne.
- **Fusionner les modèles de vue Mac et TV.** Les textes diffèrent volontairement (`app/ui/sessions-view.mjs:150-160` contre `tv/app/sessions-view.js:187-203`) et les systèmes de modules sont incompatibles. Le vrai gain est de remonter les règles au serveur (D4, D12).
- **Créer un `DeepAsk` ou une `Surveillance` par session.** Les clients et processus Codex vivent par hôte (ADR 0005). D6 apporte le bénéfice sans recâbler la propriété des processus.
- **Construire une abstraction « Source » à greffons.** On ne sait pas encore ce qu'exigeront Netflix ou l'audio seul, ni ce que la TV permet de capturer. D7 et D8 isolent les points de décision, et rien de plus.
- **Changer le format du fil TV pour unifier les charges utiles.** Les TV installées ne suivraient pas. On normalise après la réception (D8).
- **Formater tout le dépôt d'un coup (T028).** Le diff serait énorme, le blame noyé, et le gel refuserait les infractions mises au jour.
- **Viser « tout fichier sous 400 lignes » ou vider le gel.** Ce serait de la chasse aux métriques : `core/moment-index.cjs` et `tv/app/timeline-view.js` ne gênent rien d'identifié.
- **Lever T145 en bloc.** 111 fiches le portent encore (relevé `rg`), avec des chaînes artificielles (T028, T038). Rouvrir seulement les fiches citées en D.
- **Ajouter un conteneur d'injection ou un bus d'événements.** Il cacherait le câblage que D3 veut rendre visible.
- **Internationaliser le cœur.** Seuls les textes qui servent d'identifiants posent problème, et D4 les traite.
- **Retirer le chemin « ancien serveur » de la page avant D5.** On casserait les couples TV/VPS désynchronisés.

## F. Questions au propriétaire

1. **Supprimer `WatchSession.ask()`, la voie série, la déclaration d'overlay et `close({ purge })`, avec la baisse exacte du plancher `cas_de_test` ?**
   Recommandation : oui, dans D2, avec l'inventaire des cas retirés, comme pour les ADR 0016 et 0017.
2. **Une TV installée interroge-t-elle encore `/v1/surveillance/overlay` ?** Le dépôt ne permet pas de le savoir.
   Recommandation : si aucune ne le fait, retirer la route dans D2 ; sinon, au prochain déploiement TV.
3. **Le Mac adopte-t-il l'ordre de fin du serveur (préparations et capture d'abord) et sa règle « vide » fondée sur `fresh` ?**
   Recommandation : oui. L'ordre Mac actuel n'a de sens que pour la sortie de l'application, et la règle serveur est la plus prudente.
4. **Versionner le fil `/v1` et dater le retrait du chemin « ancien serveur » ?**
   Recommandation : versionner maintenant, retirer après un premier déploiement synchronisé TV + VPS.
5. **Répondre 500 et non plus 400 à une erreur sans statut ?** La TV renverra alors le bloc au lieu de le perdre.
   Recommandation : oui (T052), avec un message générique et la cause gardée au journal.
6. **Formater un module du cœur seulement s'il est découpé assez pour ne pas augmenter le gel, ou autoriser une hausse ponctuelle ?**
   Recommandation : la première option, sans aucune hausse du gel.
7. **Sortir de `prototypes/` le code installé sur la TV et faire tourner ses tests, en levant les dépendances de T102 ?**
   Recommandation : oui, avec un déplacement seul d'abord.
8. **Compter à part, dans le cliquet, les cas du produit et ceux du harnais (environ 330 sur 1 305) ?** C'est un ticket de harnais.
   Recommandation : oui. Sinon, supprimer un test mort du produit dépend des tests du harnais.
9. **Les motifs et libellés de surveillance deviennent-ils des codes servis par le serveur, chaque client gardant sa formulation ?** `surveillance.json` serait lu en rétrocompatibilité.
   Recommandation : oui, dans D4 puis D12.
10. **La prochaine itération commence-t-elle par la fiabilité (D1 à D6) ou par la préparation des sources (D7, D8) ?**
    Recommandation : la fiabilité d'abord. D7 et D8 sont courts et peuvent suivre D3 dès qu'une source est décidée.
11. **Rouvrir sélectivement T022, T037, T038, T044, T051, T052, T062, T102, T103, T120, T122, T124 et T125, en coupant leurs dépendances inutiles ?**
    Recommandation : oui. Elles décrivent déjà une bonne part de D.

## Ce que je ne sais pas

- Les résultats des tests et la couverture par module : rien n'a été lancé.
- La version du moteur web de la TV.
- La cause de l'échec Whisper à 5 003 ms.
- Si ffmpeg écrit réellement des chemins dans les messages renvoyés.
- Le contenu exact des réserves T016 et T021, au-delà de leur emplacement.

### Critical Files for Implementation

- app/main.cjs
- runtime/headless-session-lifecycle.cjs
- core/session.cjs
- adapters/codex-perception.cjs
- tv/capture.py

---

# Rapport B — Codex GPT-6 Astra

**Le principal chantier restant concerne la maîtrise des transitions et des erreurs, davantage que la taille des fichiers.** Une publication peut interrompre une transition métier ; certains refus perdent leur identité entre serveur et TV ; une lecture asynchrone peut mélanger deux sessions. La surveillance cumule ensuite plusieurs responsabilités qui rendent ces garanties difficiles à vérifier. Les preuves sont détaillées en B.

Audit effectué sur les blobs de **`8340014`**, sans prendre en compte les modifications non committées de T178. Aucun test, contrôle qualité, installation ou modification de fichier n’a été effectué. Les références `chemin:ligne` désignent ce commit. Les conséquences déduites du code sont distinguées des comportements décrits par les tests : **aucun résultat de test n’est annoncé comme exécuté ici**.

**A. Carte de l’architecture**

**Les couches et leurs dépendances**

| Couche | Responsabilité et dépendances réelles |
|---|---|
| `core/` | Possède les sessions, preuves, questions, recherche, surveillance et règles de conservation. Reçoit ses collaborateurs par injection ; les imports examinés restent internes au cœur. Les ports sont déclarés par contrats structurels. `core/ports.cjs:1`, `core/session.cjs:48`, `core/deep-ask.cjs:15`. |
| `adapters/` | Réalise les accès aux modèles, processus, fichiers et médias. Le stockage possède sa sérialisation ; le client Codex possède son transport et ses ressources ; `RemoteMedia` prépare les blocs TV. `adapters/local-store.cjs:20`, `adapters/codex-session-client.cjs:597`, `adapters/remote-media.cjs:70`. |
| `runtime/` | Compose cœur et adaptateurs, puis coordonne leurs cycles de vie. Les compositions session, conversation et surveillance servent les deux hôtes. Il contient aussi le coordinateur propre au serveur. `runtime/session-runtime.cjs:95`, `runtime/conversation-runtime.cjs:37`, `runtime/headless-runtime.cjs:112`. |
| `app/` | Hôte Electron, IPC, capture navigateur et présentation Mac. `main.cjs` compose les services et conserve encore des règles de coordination. Le renderer reçoit les états et pilote ses vues. `app/main.cjs:142`, `app/main.cjs:175`, `app/main.cjs:296`, `app/renderer.js:200`. |
| `server/` | Point d’entrée Node et transport HTTP : authentification, lecture des requêtes, distribution des routes, réponses et déduplication des blocs. `server/main.cjs:22`, `server/http.cjs:101`, `server/http.cjs:123`, `server/ingest-routes.cjs:21`. |
| `mcp/` | Processus stdio distinct, client du pont HTTP local créé par Electron. Il réutilise les outils de la conversation par ce pont ; ce n’est pas une troisième composition autonome des sessions. `mcp/server.cjs:24`, `mcp/server.cjs:32`, `app/main.cjs:171`. |
| `tv/` | Deux ensembles : capture/contrôle Python sur la TV, et page webOS en scripts classiques. Python transmet les blocs au serveur ; la page conserve l’état de présentation et interroge les projections serveur. `tv/capture.py:57`, `tv/capture.py:148`, `tv/app/remote-client.js:4`, `tv/app/poll-controller.js:29`. |

La frontière principale tient : **les fournisseurs et les plateformes sont choisis hors du cœur**. La fabrique de session choisit les adaptateurs, construit l’horloge et injecte le tout dans `WatchSession` ; la conversation construit ses outils avec une session et un préfixe de preuves explicites. `runtime/session-runtime.cjs:110`, `runtime/session-runtime.cjs:165`, `runtime/conversation-runtime.cjs:38`.

Les frontières moins solides sont comportementales :

- les callbacks d’observation peuvent intervenir dans le succès d’une transition du cœur ;
- les hôtes manipulent directement des objets métier et des clients concrets ;
- un constructeur d’erreurs HTTP vit dans le module des projections ;
- certaines minuteries du cœur restent globales malgré la règle d’injection.  
  Preuves : `core/session.cjs:282`, `app/main.cjs:149`, `app/main.cjs:183`, `runtime/state-views.cjs:37`, `core/deep-ask.cjs:85`.

**Les deux racines de composition**

**Mac :** `app/main.cjs`, dans l’initialisation Electron. Il assemble configuration, stockage, conversation, surveillance, résumé vivant, vérification, pont MCP et sessions. La composition d’une session est partagée ; la composition de l’hôte demeure substantielle. `app/main.cjs:58`, `app/main.cjs:142`, `app/main.cjs:175`, `app/main.cjs:201`, `app/main.cjs:296`.

**Serveur :** `server/main.cjs` assemble le processus, `HeadlessRuntime`, `RemoteServer` et `RemoteMedia`. `HeadlessRuntime` compose ensuite bibliothèque, admission des captures, conversation, surveillance et coordinateur des sessions. `server/main.cjs:46`, `runtime/headless-runtime.cjs:98`, `runtime/headless-runtime.cjs:108`, `runtime/headless-runtime.cjs:157`.

Cette différence est légitime : Electron possède notamment fenêtre et MCP ; le serveur possède les préparations HTTP. Le protocole commun de fermeture existe déjà et laisse aux hôtes leur ordre spécifique. Il ne faut pas recommencer cette extraction. `runtime/session-closing.cjs:1`, `docs/adr/0007-fin-de-session-par-un-meme-protocole-sur-les-deux-hotes.md:37`.

**D’une capture à une réponse affichée**

1. **Acquisition.** Sur Mac, `RollingRecorder` produit clip, images horodatées et audio, puis appelle l’ingestion. Sur TV, Python acquiert images et audio, construit un bloc identifié par session et séquence, puis l’envoie. `app/recording.js:40`, `app/recording.js:68`, `tv/capture.py:97`, `tv/capture.py:148`.

2. **Admission et préparation.** L’IPC Mac valide le bloc avant `watch.ingest`. Le serveur valide, déduplique, réserve l’admission et transforme les médias TV ; le WebM distant est reconstruit à partir des images. `app/main.cjs:419`, `server/ingest-routes.cjs:8`, `server/ingest-routes.cjs:21`, `adapters/remote-media.cjs:90`.

3. **Conservation et perception.** `WatchSession` stocke le passage et alimente ses files. L’audio est transcrit, publié, puis le passage rejoint la vision ; les deux voies peuvent avancer séparément. La surcharge est représentée par des pertes explicites. `core/session.cjs:95`, `core/session.cjs:159`, `core/session.cjs:271`, `core/session.cjs:317`.

4. **Question.** La réponse n’est pas une conséquence automatique de chaque capture. Une demande utilisateur entre dans `DeepAsk`, qui fixe l’ancrage et les outils disponibles. `VideoTools` reste lié à cette session ; les preuves peuvent être rafraîchies dans le périmètre initial. `core/deep-ask.cjs:57`, `runtime/conversation-runtime.cjs:41`, `runtime/conversation-runtime.cjs:49`.

5. **Réponse et preuves.** L’agent répond via les outils ; `DeepAsk` valide les citations et publie l’état du travail. `core/deep-ask.cjs:126`, `core/deep-ask.cjs:128`, `core/deep-ask.cjs:155`.

6. **Présentation.** Le Mac pousse `deep:state` et sauvegarde les questions. Le serveur publie une révision et des projections ; le contrôleur de polling TV remet les réponses à la présentation. `app/main.cjs:157`, `app/main.cjs:159`, `runtime/headless-runtime.cjs:241`, `runtime/headless-runtime.cjs:306`, `tv/app/poll-controller.js:29`.

**Qui possède l’état ?**

| État | Propriétaire actuel | Point de vigilance |
|---|---|---|
| Passages, files audio/vision, couverture, activité de perception | `WatchSession` — `core/session.cjs:48` | Les hôtes modifient encore `asking` et déclenchent eux-mêmes publication et drainage. |
| Questions, file, travail actif, annulation | `DeepAsk` — `core/deep-ask.cjs:15` | Publication synchrone non protégée ; contexte de nettoyage conservé si sa libération échoue. |
| Session chargée sur Mac | Objet `loaded` — `app/main.cjs:305` | Les callbacks lisent cet objet à des moments différents. |
| Session chargée et transitions serveur | Coordinateur — `runtime/headless-session-lifecycle.cjs:39` | L’adoption est synchrone, mais les lectures asynchrones de l’hôte ne sont pas toutes cohérentes avec elle. |
| Fermeture d’un runtime de session | `SessionLifecycle` — `runtime/session-lifecycle.cjs:33` | Archive et arrêt des ressources ont des garanties distinctes. |
| Écritures, baux média, confirmation des sauvegardes | `LocalSessionStore` — `adapters/local-store.cjs:20` | Ce propriétaire existe déjà ; une nouvelle base de données n’est pas justifiée par les défauts trouvés. |
| Affirmations, passages surveillés, lots, travaux actifs | `Surveillance` — `core/surveillance.cjs:372` | Historique, planification et projections restent fortement liés. |
| Adoption/restauration et persistance de la surveillance | Fabrique runtime — `runtime/surveillance-runtime.cjs:74` | Nombreux états de coordination, notification et écriture dans le même propriétaire. |
| Révisions serveur et états dérivés | `HeadlessRuntime` — `runtime/headless-runtime.cjs:83` | Double représentation : session vivante et dernier instantané publié. |
| État de page, réponses retenues, détails ouverts | Client et vues TV — `tv/app/remote-client.js:4`, `tv/app/surveillance-view.js:597` | Plusieurs propriétaires locaux ; certaines mutations sont encore faites dans `companion.js:444`. |
| Rapport de capture TV | Dictionnaire Python partagé — `tv/capture.py:40` | Modifié par le thread de capture et celui d’envoi ; le verrou couvre l’écriture, pas toutes les mutations. |

**B. Problèmes d’architecture par gravité**

P1 désigne ici un scénario pouvant bloquer le traitement ou orienter l’utilisateur vers une mauvaise action. P2 désigne une dette substantielle de fiabilité ou d’évolution. Aucun incident de production n’a été reproduit pendant cet audit.

**B1 — P1 : publier un état peut casser la transition qui le produit**

Dans `drainAudio`, le code positionne `audioRunning`, retire le passage de la file et appelle `emit()` **avant d’entrer dans le `try/finally`**. Si le callback lève, le drapeau reste positionné. La vision possède la même disposition. `core/session.cjs:280`, `core/session.cjs:282`, `core/session.cjs:299`, `core/session.cjs:322`.

`DeepAsk` présente une variante : le travail devient actif, puis la publication intervient avant le lancement de `run`. Une exception peut laisser un travail actif sans exécution. `core/deep-ask.cjs:73`, `core/deep-ask.cjs:78`.

Ce ne sont pas des callbacks nécessairement triviaux : la publication de session alimente index, manifeste et hôte ; celle du serveur appelle tous les abonnés sans isolation. `runtime/session-runtime.cjs:176`, `runtime/headless-runtime.cjs:246`.

**Effet concret :** un défaut de présentation ou d’observateur peut devenir un arrêt de la perception ou des questions. **Sans correction :** chaque nouvel abonné élargit les conditions de panne du métier. Le scénario est déduit du contrôle de flux, pas reproduit.

La surveillance évite une partie de cette propagation, mais perd alors l’information : `toldAs` avance avant `onChange`, et une publication refusée n’est pas réessayée pour le même statut. Ce comportement est explicitement caractérisé dans les tests. `runtime/surveillance-runtime.cjs:159`, `runtime/surveillance-runtime.cjs:172`, `tests/surveillance-runtime.test.cjs:116`.

Enfin, les hôtes divergent sur les exceptions échappant au runtime de surveillance : le serveur les absorbe sans diagnostic, le Mac appelle directement le tick depuis son intervalle. Le cœur protège déjà son propre `tick` ; il serait donc faux de dire que toute erreur interne de surveillance remonte au processus Mac. `core/surveillance.cjs:485`, `runtime/surveillance-runtime.cjs:486`, `runtime/headless-runtime.cjs:217`, `app/main.cjs:184`.

**B2 — P1 : l’identité des erreurs se perd entre couches**

Le serveur transforme par défaut une exception sans statut en HTTP 400, expose `error.message` et omet le code pour les réponses 400. Une panne interne peut donc devenir une « mauvaise demande » avec un détail système. `server/http.cjs:89`.

Ce risque a des sources concrètes : les erreurs disque hors manque d’espace peuvent remonter depuis le stockage ; la préparation média peut produire une erreur contenant la sortie de FFmpeg. `adapters/local-store.cjs:62`, `adapters/remote-media.cjs:62`.

Côté TV, `describeCapture` interprète **tout texte contenant `409` comme une lecture seule**, alors que l’ingestion emploie aussi 409 pour une séquence ancienne. `tv/app/sessions-view.js:245`, `server/ingest-routes.cjs:31`. Le transport Python distingue mieux ces cas, mais les réaplatit dans le rapport. `tv/transport.py:76`.

**Effet concret :** diagnostic trompeur et mauvaises actions proposées pour un conflit de séquence. Le mauvais classement de l’interface est établi par lecture ; le test Python ne vérifie que le transport, pas son rendu. `tests/test_tv_control.py:237`.

La politique de reprise de la perception dépend aussi de listes de messages exacts. Changer une formulation peut changer le comportement de reprise. `adapters/codex-perception.cjs:23`.

**Sans correction :** chaque nouveau fournisseur ou source ajoute des messages à interpréter, au lieu d’étendre un contrat. Cela contredit directement les règles sur les codes stables et les messages internes. `docs/standards.md:34`.

**B3 — P2 : une liste peut mélanger l’identité d’une session et les chiffres d’une autre**

`HeadlessRuntime.sessions()` capture `loaded` et `current`, attend `library.list`, puis utilise **le `this.sessionState` courant** avec l’identité, l’horloge et le stockage du `loaded` précédent. `runtime/headless-runtime.cjs:464`.

Si A est remplacée par B pendant l’attente, la ligne A peut recevoir couverture et nombre de passages de B. L’adoption remplace bien l’état publié ; la lecture n’a simplement pas capturé un ensemble cohérent. `runtime/headless-session-lifecycle.cjs:74`.

**Effet :** liste et métriques contradictoires pendant un changement de session. **Sans correction :** l’ajout de lectures asynchrones multipliera ces mélanges. Course déduite, non exécutée.

La réserve historique T148 sur un `TypeError` Mac n’est plus ce défaut : le code actuel transmet `loaded` après l’attente à une projection qui traite son absence. `app/main.cjs:318`, `app/session-rows.cjs:1`.

**B4 — P2 : la garantie d’arrêt Codex s’arrête à l’instance du client**

`finish()` peut retourner `false` lorsque la disparition du groupe n’est pas confirmée ; `close()` attend cette tentative mais ne transmet pas ce résultat. Un nouveau client peut ensuite être construit pour la même fonction. `adapters/codex-session-client.cjs:597`, `adapters/codex-session-client.cjs:628`, `runtime/session-providers.cjs:93`, `runtime/session-providers.cjs:155`.

Ce résidu est **déjà reconnu par l’ADR**, qui limite explicitement la barrière au client et décrit le chevauchement possible entre clients successifs. `docs/adr/0005-groupe-codex-attendu-avant-d-etre-remplace-et-contextes-revoques-en-fin-de-session.md:35`, même fichier `:63`.

**Effet :** ressources et arbres privés peuvent survivre sans propriétaire applicatif chargé de retenter leur nettoyage. **Sans correction :** les changements de session peuvent multiplier les ressources incertaines après ce type d’échec. Fréquence réelle et consommation mémoire inconnues ; ce n’est pas une fuite mesurée.

**B5 — P2 : la surveillance concentre trop de politiques dans les mêmes objets**

Le cœur réunit validation des détections, application des verdicts, composition des textes, ordonnancement, registre et projections. `core/surveillance.cjs:181`, `:233`, `:339`, `:567`, `:689`, `:826`.

Le runtime ajoute adoption, restauration, état de persistance, notifications, écritures et arrêt. `runtime/surveillance-runtime.cjs:74`, `:159`, `:179`, `:381`, `:396`.

Deux conséquences précises :

- Le plafond de 600 affirmations porte sur le registre total ; une fois atteint, la détection se suspend, y compris si les anciennes affirmations sont terminées. C’est annoncé dans l’état, donc pas une perte silencieuse, mais c’est une limite de service à arbitrer. `core/surveillance.cjs:50`, `:588`, `:854`.
- La projection brève parcourt passages et affirmations, construit des collections et clone les métriques avant de supprimer plusieurs champs lourds. Une réponse réseau compacte ne signifie donc pas un calcul compact. `core/surveillance.cjs:830`, `:843`, `:895`, `:902`, `:904`.

**Sans correction :** modifier une règle de détection ou de restitution oblige à comprendre persistance, concurrence et historique ensemble. Le coût en longue session reste à mesurer ; je ne lui attribue pas une latence observée.

**B6 — P2 : les hôtes possèdent encore des morceaux de règles communes**

Mac et serveur calculent l’activité des questions, modifient `watch.asking`, publient et redémarrent le drainage. Les conditions diffèrent, mais la mécanique est dupliquée. `app/main.cjs:149`, `runtime/headless-runtime.cjs:126`.

Le Mac connaît aussi la structure interne des clients de surveillance et parcourt directement les lots pour ouvrir une source. `app/main.cjs:183`, `app/main.cjs:198`.

**Effet :** une évolution du cœur ou d’un fournisseur exige de modifier la composition de l’hôte ; une correction de coordination peut n’atteindre qu’un hôte. **Sans correction :** l’ajout d’une modalité ou d’un état métier accroît ce couplage.

Les différences d’ordre de fermeture ne doivent pas être confondues avec cette duplication : elles sont intentionnelles et documentées. `docs/adr/0007-fin-de-session-par-un-meme-protocole-sur-les-deux-hotes.md:44`.

**B7 — P2 : les tests vérifient encore parfois la forme du programme ou le passage du temps**

Exemples de dépendance au texte du source :

- assertions sur la forme du renderer et des gestionnaires IPC : `tests/mac-ui.test.cjs:1181`, `tests/mac-ipc-contract.test.cjs:88` ;
- lecture de fichiers JavaScript et extraction textuelle des appels Python à `drop` : `tests/tv-panel.test.cjs:84`, `tests/tv-panel.test.cjs:518` ;
- garde de fermeture à liste de fichiers devenue incomplète après extraction des routes et du coordinateur : `tests/architecture-f07.test.cjs:575`.

Exemples de synchronisation temporelle fragile :

- faux processus retardé de 400 ms puis attente réelle de 120 ms : `tests/review-regressions.test.cjs:120`, `:130` ;
- polling réel de l’état d’un double : `tests/architecture-f08.test.cjs:20`, `:364` ;
- attente de préchauffage par polling jusqu’à dix secondes : `tests/server-warm-up.test.cjs:9`, `:60`.

Des helpers contrôlés existent déjà ; les variantes locales de `tick` et d’attente persistent. `tests/helpers/clock.cjs:16`, `tests/helpers/wait.cjs:31`, `tests/session-durable.test.cjs:18`, `tests/split-perception.test.cjs:7`.

**Effet :** faux positifs lors d’une extraction, trous après déplacement de code, sensibilité à la charge. **Sans correction :** les prochains refactors coûteront surtout en réparation du banc.

Les gardes d’architecture statiques restent légitimes. Les délais de sécurité bornant un processus ne sont pas non plus des défauts par principe. La distinction doit porter sur **ce qui synchronise le scénario**, conformément à `docs/standards.md:41`.

Le cliquet enregistré contient 1 305 cas et zéro `catch` vide ; ce sont des compteurs stockés, pas une preuve de ces garanties comportementales. `scripts/quality/baseline.json:4`, `:8`.

**B8 — P2 : la présentation surveillance et les contrôles TV restent difficiles à isoler**

La vue surveillance TV réunit projection, pont overlay, DOM, pagination, détails et commandes. Le Mac possède ses propres règles de présentation. `tv/app/surveillance-view.js:1`, `:450`, `:593`, `app/ui/surveillance-view.mjs:19`, `:137`.

Les scripts classiques sont un choix assumé, pas un défaut en soi. Leur ordre de chargement et les globals résolus au chargement constituent cependant un contrat réel. `tv/app/index.html:191`, `tv/app/companion.js:1`, `docs/adr/0011-un-script-partage-du-panneau-tv-est-une-iife-exposee-sur-la-page-et-par-commonjs.md:18`.

La boucle principale de polling a déjà son propriétaire. Les contrôles périphériques restent moins propres : polling capture sans arrêt exposé, attente de disposition avec horloge globale, intervalles d’affichage, miniature contournant une partie des dépendances du client. `tv/app/poll-controller.js:46`, `tv/app/capture-control.js:37`, `tv/app/companion.js:260`, `:642`, `tv/app/remote-client.js:118`.

**Sans correction :** changements de page et contrôles supplémentaires accroîtront les callbacks tardifs et les divergences entre banc Node et navigateur TV.

**B9 — P2 : la capture Python mélange acquisition, transport, rapport et arrêt**

`run()` possède configuration, verrous, signaux, processus audio, appels Luna, file d’envoi, rapport et nettoyage. `tv/capture.py:30`.

Le verrou de `save` protège le remplacement du fichier, mais les deux threads modifient le même dictionnaire hors de ce verrou. Le fichier peut donc être valide tout en décrivant des champs issus de moments différents. `tv/capture.py:44`, `:75`, `:125`.

Les budgets d’arrêt sont distincts : le contrôleur attend 12 secondes avant de tuer le groupe ; la capture attend jusqu’à 35 secondes le thread d’envoi. Le transport est coopératif, donc cela ne prouve pas une perte à chaque arrêt. `tv/controller.py:51`, `tv/capture.py:156`, `tv/transport.py:53`.

**Sans correction :** ajouter une source ou un mécanisme d’acquisition augmente la complexité de chaque chemin d’arrêt et les possibilités de rapport incohérent.

**B10 — P2 : une partie du produit installé reste classée comme prototype**

La disposition TV passe par des fichiers partagés entre `tv/controller.py` et `prototypes/lg-remote/runtime/panel.py`. Ce dernier est bien installé et lancé par la chaîne hook → contrôleur → mapper → panneau. `tv/controller.py:90`, `prototypes/lg-remote/runtime/panel.py:129`, `docs/lg-installation.md:14`, `prototypes/lg-remote/control.py:53`, `prototypes/lg-remote/runtime/tvlens_mapper.py:5`.

**Ce n’est pas un composant oublié sans lancement.** C’est une dépendance opérationnelle documentée, dont le classement rend le périmètre de production ambigu.

**Sans correction :** un nettoyage de prototypes peut casser une fonction supportée, et les responsabilités de validation restent dispersées. L’état réellement installé sur la TV est inconnu ; le guide conserve des limites de validation du redémarrage. `docs/lg-installation.md:43`.

**B11 — P2 d’évolution : le contrat de média confond encore source, preuve et vidéo rejouable**

La capture TV exige YouTube et refuse un bloc sans image. Le serveur exige des images ; le runtime exige clip et images. `tv/capture.py:106`, `:137`, `adapters/remote-media.cjs:29`, `runtime/session-runtime.cjs:249`.

Le contrat central décrit lui aussi un clip et des images obligatoires, et les baux supposent le couple média conservé. `core/ports.cjs:7`, `:29`.

**Ce n’est pas un défaut du périmètre YouTube actuel.** En revanche, accepter demain de l’audio seul ne sera pas l’ajout d’un simple adaptateur. **Sans clarification :** chaque nouvelle source sera tentée de fabriquer une fausse vidéo ou des images artificielles pour satisfaire le contrat.

La possibilité matérielle de capturer Netflix ou une autre application n’est pas établie par cet audit.

**B12 — P2 de maintenance : deux chemins de réponse subsistent, dont un sans appelant produit identifié**

`WatchSession.ask()` conserve sélection des preuves, appel à `answer.ask`, citations et historique de questions. `core/session.cjs:386`.

Les hôtes utilisent `DeepAsk`. La composition transmet pourtant encore `answer: perception` à `WatchSession`, tandis que les usages trouvés de l’ancien chemin sont dans les tests. `app/main.cjs:132`, `runtime/headless-runtime.cjs:427`, `runtime/session-runtime.cjs:170`, `tests/session.test.cjs:32`, `tests/topic-summary.test.cjs:127`.

**Effet :** deux modèles de conversation et de preuves à maintenir, dont un peut donner une impression trompeuse de couverture du produit. **Sans correction :** les futurs ports continueront d’être conçus autour d’une interface historique. Les anciennes données archivées doivent être distinguées de cette API avant tout retrait.

**C. Tri des 93 réserves**

Je numérote **R01 à R93 les 93 puces**, dans leur ordre dans le [fichier des réserves](#annexe--les-93-réserves-de-la-nuit). La notation `R73@122` signifie « réserve 73, ligne 122 de ce fichier ».

Les groupes ci-dessous couvrent les 93 entrées, sans omission. **Une réserve extraite n’est pas nécessairement un défaut, et plusieurs décrivent le même sujet.**

| Groupe et références | Qualification à `8340014` | Destination |
|---|---|---|
| **Publication et tick** — R73@122, R74@123, R75@124 | **Vrais défauts de contrat** : notification perdue, diagnostic absent, divergence entre hôtes. Nuance : le cœur intercepte déjà ses erreurs de tick ; les exceptions échappant au runtime restent le problème. `runtime/surveillance-runtime.cjs:159`, `:486`. | Tickets prioritaires **D1**, puis **D7**. |
| **Erreurs, persistance et nettoyage** — R22@41, R25@44, R58@99, R65@112, R66@113, R67@114, R68@115, R70@117, R91@152 | **Dette réelle**, avec omissions visibles : moments illisibles silencieusement absents ; absence/refus disque insuffisamment distingués. Le cache embeddings est reconstructible ; un échec secondaire de nettoyage ne doit pas remplacer l’erreur primaire. Une fuite mémoire après `release` reste inconnue. `adapters/saved-moment-store.cjs:11`, `adapters/embedding-store.cjs:7`, `core/deep-ask.cjs:36`. | **D2** pour les diagnostics et erreurs de fermeture ; **D10** pour confinement et libération. Pas neuf tickets indépendants. |
| **Temps et couverture des lectures tardives** — R15@28, R28@49, R63@108, R64@109 | **Dette** pour attente murale et minuteries globales. R28 reste une **couverture inconnue**, pas la preuve du défaut headless B3. `tests/review-regressions.test.cjs:120`, `adapters/codex-session-client.cjs:486`. | **D4** ; lectures de session dans **D3/D6**. |
| **Tests source et gardes incomplètes** — R01@4, R04@11, R06@13, R60@103, R79@132, R80@133 | **Dette réelle**. La règle documentaire n’est pas son automatisation ; certaines gardes ne suivent plus les extractions. `docs/standards.md:42`, `tests/architecture-f07.test.cjs:575`. | **D4**, avec autorisation explicite du périmètre harnais lors de l’implémentation. |
| **Constantes et environnement de capture** — R03@8, R10@21, R11@22, R23@42, R32@55, R33@56, R34@59, R36@61, R47@80 | **Petite dette**, pas un chantier architectural autonome : dimensions des canvas, seuil RPC, langue par défaut, dimensions de fenêtre, limite de texte et environnement du recorder. `app/recording.js:28`, `app/moment-actions.cjs:2`. | Absorber par **D6/D15** et les prochaines modifications des propriétaires concernés. R03 concerne la capture, pas un test lisant le source. |
| **Luna inutilisé** — R45@76, R46@77 | **Dette de code sans propriétaire** : la capture a sa propre fonction Luna ; aucun importeur de `tv/luna.py` n’a été identifié. `tv/capture.py:9`, `tv/luna.py:6`. | **D11** : retirer le module inutilisé ou choisir explicitement l’implémentation conservée. Ne pas raccorder du code mort pour justifier sa présence. |
| **Documentation et consignes** — R08@17, R48@81, R52@87, R53@88, R54@91, R55@92, R84@141 | **Dette documentaire** : périmètre protégé, API de capture, exposition des scripts, commentaire du banc, index documentaire ambient. | Documentation comprise dans **D4/D13/D15** ; un petit ticket documentaire peut regrouper le reste. Ne pas réécrire l’histoire des ADR. |
| **Outillage qualité** — R05@12, R07@14, R38@65, R39@66, R40@67, R41@68 | **Dette de maintenance** : version déclarée dépréciée dans le verrou, diagnostics texte de couverture, budgets locaux. Ce n’est pas un défaut d’architecture produit. | Un ticket outillage distinct et autorisé ; budgets/diagnostics avec **D4**. Aucun motif pour modifier le cliquet à la baisse. |
| **Résidus ambient et API overlay** — R81@136, R83@140, R85@142, R86@143 | **Dette faible**, dont une partie est une compatibilité volontaire. La projection overlay est explicitement conservée. `docs/architecture.md:110`, `docs/architecture.md:116`. | Nettoyage avec **D9/D12**, après décision sur les consommateurs. Aucun retrait aveugle de l’API. |
| **Validation matérielle absente** — R16@31, R49@82, R87@144 | **Dette de validation**, pas défaut démontré : navigateur réel, capture Mac, déchargement Electron, packaging, TV/VPS. | Critères de validation finale des chantiers concernés. Pas un ticket de refactor prétendant « corriger » l’absence de smoke. |
| **Incidents et limites non établis** — R14@27, R37@64, R42@69, R69@116, R88@145 | **Inconnues à conserver** : timeout Whisper non reproduit ; dénominateurs de couverture variables ; repli de sortie non exercé ; `ResourceWarning`. Le code actuel du test panneau utilise un `with open`, donc le warning ne s’explique pas par cette seule lecture. `prototypes/lg-remote/test_panel.py:162`. | R69 avec **D10**, couverture avec **D4**. Ticket d’investigation seulement si preuve/reproduction pour Whisper et warning ; aucune attribution arbitraire à la charge. |
| **Réserves résolues ou insuffisantes** — R02@7, R17@34, R18@35, R27@48, R29@50, R35@60, R43@72, R44@73 | **Rien à rouvrir sur cette seule base.** ESLint est désormais configuré, sans que cela prouve son exécution historique ; le `TypeError` Mac a été traité ; architecture et README distinguent maintenant retrait ambient et histoire. Les références nues `.env.example` et confinement ne démontrent pas d’anomalie actuelle. `eslint.config.mjs:11`, `app/session-rows.cjs:1`, `docs/architecture.md:116`, `README.md:89`. | Aucun ticket pour ces réserves. |
| **Écarts acceptés et informations de procédure** — R12@23, R13@24, R19@36, R20@37, R21@38, R26@47, R31@52, R51@84, R56@95, R57@96, R62@105, R71@118, R72@119, R77@128, R78@129, R90@149, R92@153, R93@156 | **Rien côté architecture.** Élagages du gel, faux positifs de grep, compléments de tests, responsabilités de boucle. La navigation de citation absente relève d’un produit futur. Les helpers DOM distincts répondent à des besoins différents. | Aucun ticket « réserve » à créer. |
| **Discordances de l’extracteur** — R09@18, R24@43, R30@51, R50@83, R59@100, R61@104, R76@125, R82@137, R89@146 | **Défaut du suivi**, pas neuf défauts produit. Le fichier avertit lui-même que l’extraction est incomplète. Le contenu manquant ne peut pas être inventé. | Un ticket du harnais pour fiabiliser l’extraction et récupérer les constats originaux, si ce suivi doit alimenter automatiquement le backlog. |

Le gel ESLint aide à localiser la surveillance — cœur, runtime et vues y cumulent des exceptions — mais ne dit pas quelle séparation serait utile. Les responsabilités identifiées en B5/B8 donnent cette justification. `eslint-suppressions.json:250`, `:306`, `:598`.

**D. Quinze refactors classés par valeur / coût**

Les tailles sont des **estimations de tickets réalisables en une session chacun**, avec périmètre et preuve comportementale bornés. Ce n’est pas une recommandation de lancer les quinze chantiers simultanément.

**D1 — Rendre les publications incapables de bloquer le métier — 2 à 3 tickets**

- **Livrable et cible :** transitions terminées indépendamment de la livraison aux observateurs ; erreurs de publication diagnostiquées ; état courant récupérable ; reprise bornée de la notification de persistance.
- **Preuve :** `core/session.cjs:282`, `core/deep-ask.cjs:78`, `runtime/surveillance-runtime.cjs:162`.
- **Étendre :** injecter des observateurs qui lèvent à chaque étape sensible ; préciser ce qui doit continuer et ce qui doit être signalé.
- **Migrer :** séparer mutation, publication et travail suivant ; appliquer le même contrat aux deux hôtes.
- **Contracter :** supprimer les publications dangereuses au milieu des transitions et le marquage prématuré de notification livrée.
- **Risques :** masquer un défaut interne ou créer une boucle de notifications. Pas de `catch` silencieux universel.
- **Dépendances :** aucune ; base de D7.

**D2 — Donner une identité stable aux erreurs de bout en bout — 3 à 4 tickets**

- **Livrable et cible :** codes applicatifs, message public sûr, diagnostic interne séparé ; mappings HTTP/IPC explicites ; rapport Python structuré. Une erreur inconnue ne devient plus automatiquement 400.
- **Preuve :** `server/http.cjs:94`, `tv/app/sessions-view.js:255`, `adapters/codex-perception.cjs:23`.
- **Étendre :** définir une petite table des erreurs existantes et des fixtures serveur → Python → vue.
- **Migrer :** convertir refus, décisions de reprise et affichages ; distinguer liste partielle de moments et cache embeddings reconstruit.
- **Contracter :** retirer les regex de messages, les listes de phrases de reprise et `refusal` du module des vues.
- **Risques :** changer les décisions de reprise des anciens clients ; conserver une compatibilité transitoire explicite.
- **Dépendances :** aucune ; facilite D10/D12 et l’intégration de fournisseurs ou sources supplémentaires.

**D3 — Garantir des lectures cohérentes pendant les changements de session — 1 à 2 tickets**

- **Livrable et cible :** un objet de lecture contenant identité, état et métriques de la même session ; règle explicite après une attente : restituer cet instantané ou recommencer.
- **Preuve :** `runtime/headless-runtime.cjs:465`, `:475`, `:484`.
- **Étendre :** scénario avec `library.list` différé et remplacement A → B.
- **Migrer :** liste et métriques associées vers cette lecture cohérente ; examiner les lectures Mac signalées par R28.
- **Contracter :** supprimer les mélanges de références capturées et d’état courant.
- **Risques :** boucles de nouvelle tentative sous transitions répétées ; préférer une politique bornée.
- **Dépendances :** aucune.

**D4 — Faire porter les tests sur les coutures désormais disponibles — 3 à 4 tickets**

- **Livrable et cible :** scénarios pilotés par promesses, événements et horloge contrôlée ; gardes architecturales couvrant les bons fichiers ; petit ensemble de helpers partagés.
- **Preuve :** `tests/review-regressions.test.cjs:120`, `tests/architecture-f07.test.cjs:575`, `tests/tv-panel.test.cjs:518`.
- **Étendre :** ajouter les assertions comportementales qui détectent les défauts visés par les tests textuels.
- **Migrer :** remplacer les attentes fonctionnelles murales et les doubles locaux réellement équivalents.
- **Contracter :** retirer les assertions de forme devenues redondantes ; conserver les gardes d’architecture et délais de sécurité utiles.
- **Risques :** perdre une assertion pendant le déplacement ; exigence de correspondance explicite entre ancienne garantie et nouveau scénario.
- **Dépendances :** peut accompagner D1/D3 ; modifications du harnais à cadrer séparément.

**D5 — Retirer le chemin de réponse historique de `WatchSession` — 1 à 2 tickets**

- **Livrable et cible :** `WatchSession` possède capture/perception ; `DeepAsk` possède les questions ; les anciennes archives restent lisibles.
- **Preuve :** `core/session.cjs:386`, `runtime/session-runtime.cjs:170`, `app/main.cjs:132`.
- **Étendre :** inventorier contrats archivés et transférer les garanties utiles de citations/temps vers le chemin actif.
- **Migrer :** tests et derniers contrats vers `DeepAsk` ; préserver la lecture des champs historiques.
- **Contracter :** retirer `ask`, `selectEvidence` et le port devenu sans appelant.
- **Risques :** confondre API morte et données anciennes ; gonfler artificiellement les tests pour respecter un compteur.
- **Dépendances :** D4 utile. Clarifie le port à fournir pour une nouvelle modalité.

**D6 — Encapsuler l’activité des questions et l’accès à la surveillance — 2 tickets**

- **Livrable et cible :** commande métier pour changer l’activité des questions ; coordination commune dans `runtime/` ; façade surveillance pour configuration et résolution d’une source.
- **Preuve :** `app/main.cjs:149`, `runtime/headless-runtime.cjs:126`, `app/main.cjs:183`, `:198`.
- **Étendre :** caractériser les différences légitimes entre hôtes, notamment fermeture et filtrage par session.
- **Migrer :** faire déléguer les deux hôtes ; attacher le drainage différé à la bonne session.
- **Contracter :** retirer mutations directes et connaissance des clients internes.
- **Risques :** effacer une différence de politique en voulant mutualiser.
- **Dépendances :** D1 ; D3 facilite la cohérence des références.

**D7 — Donner à la persistance surveillance son propriétaire propre — 2 à 3 tickets**

- **Livrable et cible :** un coordinateur explicite de chargement, adoption, écriture et arrêt ; le cœur ne voit que des commandes et états métier.
- **Preuve :** `runtime/surveillance-runtime.cjs:74`, `:179`, `:381`, `:506`.
- **Étendre :** matrice des événements : restauration lente/refusée, changement de session, écriture en vol, arrêt, publication refusée.
- **Migrer :** déplacer ces transitions dans un propriétaire injecté, avec état observable et invariants.
- **Contracter :** réduire la fabrique à la composition et retirer les variables de coordination dispersées.
- **Risques :** écrire un registre dans la mauvaise session ou réécrire une archive seulement consultée.
- **Dépendances :** D1 et contrat de diagnostic D2.

**D8 — Séparer les politiques de surveillance et expliciter sa capacité — 3 à 4 tickets**

- **Livrable et cible :** validation/verdicts purs, registre, ordonnanceur, projections distinctes ; chemin bref ne construisant pas les éléments qu’il retire ensuite.
- **Preuve :** `core/surveillance.cjs:181`, `:567`, `:826`, `:904`.
- **Étendre :** fixtures des états et invariants de file ; caractériser précisément l’arrivée au plafond du registre.
- **Migrer :** extraire les fonctions pures, puis les projections, puis seulement les transitions d’ordonnancement.
- **Contracter :** supprimer les accès transversaux et calculs inutiles ; conserver l’historique durable.
- **Risques :** modifier l’ordre de détection, les reprises ou les compteurs ; ne pas introduire d’éviction silencieuse.
- **Dépendances :** D7 souhaitable ; décision du propriétaire sur la limite de capacité. Prépare une surveillance fondée sur les preuves disponibles plutôt que sur une source particulière.

**D9 — Aligner la sémantique des vues surveillance — 2 à 3 tickets**

- **Livrable et cible :** projections de présentation communes servies par les runtimes, fixtures partagées de statuts et cartes ; DOM Mac et TV séparés.
- **Preuve :** `tv/app/surveillance-view.js:44`, `:593`, `app/ui/surveillance-view.mjs:80`, `:137`.
- **Étendre :** corpus des cas : registre plein, retard, restauration, source absente, signalement, erreur et reprise.
- **Migrer :** faire consommer ces projections aux deux vues ; séparer projection et manipulation DOM dans la vue TV.
- **Contracter :** retirer règles et constantes dupliquées ; traiter les résidus overlay selon la compatibilité décidée.
- **Risques :** imposer au Mac les contraintes de navigation de la TV, ou inversement.
- **Dépendances :** D8 pour les projections, D2 pour les erreurs.

**D10 — Garder un propriétaire des ressources Codex non libérées — 2 à 3 tickets**

- **Livrable et cible :** résultat explicite de libération et propriétaire borné à l’hôte pour les groupes/contextes encore incertains ; diagnostic sûr des refus de nettoyage.
- **Preuve :** `adapters/codex-session-client.cjs:597`, `:642`, `core/deep-ask.cjs:36`.
- **Étendre :** définir ce qui reste détenu après libération partielle et comment une tentative ultérieure le traite.
- **Migrer :** transmettre ce résultat au propriétaire d’hôte ; intégrer refus de préparation/balayage et repli de sortie.
- **Contracter :** retirer les ressources abandonnées sans suivi et les messages promettant une barrière par rôle alors qu’elle est par client.
- **Risques :** bloquer l’archivage, supprimer sous un processus vivant, ou introduire un registre non borné.
- **Dépendances :** D2 et amendement explicite de l’ADR 0005. L’archive doit rester possible malgré un arrêt non confirmé.

**D11 — Séparer acquisition Python, livraison et rapport — 3 tickets**

- **Livrable et cible :** acquisition injectable, file de livraison possédée, rapport mis à jour par un propriétaire cohérent, arrêt avec budget documenté.
- **Preuve :** `tv/capture.py:30`, `:44`, `:71`, `:156`.
- **Étendre :** doubles de Luna, audio, transport et horloge ; scénarios arrêt pendant acquisition et pendant envoi.
- **Migrer :** transférer les responsabilités une par une ; choisir une seule implémentation Luna.
- **Contracter :** supprimer les mutations concurrentes libres du rapport et le code Luna sans usage.
- **Risques :** modifier les motifs de perte ou vider la file différemment ; conserver explicitement leur comptabilité.
- **Dépendances :** D2 ; D12 pour les fixtures de transport. Prépare directement une deuxième source d’acquisition.

**D12 — Rendre le contrat serveur–TV vérifiable indépendamment des implémentations — 3 tickets**

- **Livrable et cible :** exemples JSON versionnés et validateurs aux frontières pour admission, séquence, session, erreur, arrêt et projections ; fixtures communes aux tests JavaScript/Python.
- **Preuve :** `server/ingest-routes.cjs:21`, `tv/transport.py:50`, `tv/app/sessions-view.js:255`.
- **Étendre :** décrire les comportements existants, dont accusé perdu, renvoi identique, séquence ancienne et changement de session.
- **Migrer :** faire tester chaque producteur/consommateur contre ce corpus ; documenter les budgets de requête et de remise.
- **Contracter :** retirer interprétations implicites et duplication des valeurs contractuelles.
- **Risques :** casser les TV non mises à jour ; prévoir des ajouts compatibles avant tout retrait.
- **Dépendances :** D2. Les cinq secondes côté client, quinze par commande média et trente de remise appellent un contrat mesuré, pas leur égalisation arbitraire : l’idempotence existe déjà. `tv/transport.py:43`, `:50`, `adapters/remote-media.cjs:49`, `server/ingest-routes.cjs:35`.

**D13 — Terminer les cycles de vie des contrôles de page TV — 2 tickets**

- **Livrable et cible :** contrôleurs capture/disposition avec `start`, `stop`, horloge et minuteries injectées ; transport miniature cohérent avec le client.
- **Preuve :** `tv/app/capture-control.js:37`, `tv/app/companion.js:260`, `tv/app/remote-client.js:118`.
- **Étendre :** scénarios arrêt de page, réponse tardive, changement de disposition et échec miniature.
- **Migrer :** reprendre la forme déjà employée par le contrôleur de polling ; valider le chargement de la page complète.
- **Contracter :** supprimer minuteries orphelines et dépendances globales contournant les coutures.
- **Risques :** navigation télécommande et compatibilité du moteur webOS.
- **Dépendances :** D4 ; conserve les scripts classiques.

**D14 — Sortir le runtime TV supporté de son statut de prototype — 1 à 2 tickets**

- **Livrable et cible :** emplacement et propriétaire de production explicites pour panneau, mapper et protocole de disposition ; installation documentée depuis ce périmètre.
- **Preuve :** `docs/lg-installation.md:14`, `prototypes/lg-remote/control.py:53`, `prototypes/lg-remote/runtime/panel.py:129`.
- **Étendre :** inventorier fichiers installés, commandes, chemins et compatibilité avec l’installation existante.
- **Migrer :** déplacer le composant supporté avec ses tests et adapter l’empaquetage ; conserver les relais nécessaires.
- **Contracter :** supprimer les anciens chemins après validation de la migration.
- **Risques :** chemin codé en dur sur une TV déjà installée ; validation matérielle nécessaire avant retrait.
- **Dépendances :** contrat de disposition de D12. Ne pas promouvoir tout le dossier de prototypes.

**D15 — Clarifier le contrat des preuves avant une nouvelle source — 2 tickets**

- **Livrable et cible :** distinction documentée et testée entre origine, preuves audio/visuelles disponibles et média rejouable ; contrat correspondant aux producteurs actuels.
- **Preuve :** `core/ports.cjs:7`, `runtime/session-runtime.cjs:249`, `tv/capture.py:106`, `:137`.
- **Étendre :** décrire les capacités actuelles et les hypothèses que consommateurs, stockage et inspection en déduisent.
- **Migrer :** centraliser validation et métadonnées des producteurs existants ; aligner composition du recorder et contrat de capture.
- **Contracter :** retirer les hypothèses accidentelles sur YouTube des couches qui n’ont pas à connaître l’application source.
- **Risques :** rendre « disponible » un passage impossible à rejouer, ou accepter prématurément une modalité non traitée.
- **Dépendances :** D11/D12. **Ne livre ni Netflix ni l’audio seul** ; rend leur futur coût explicite sans construire une plateforme de plugins.

**E. Ce qu’il ne faut pas faire**

- **Recommencer les découpages de cette nuit pour atteindre une taille cible.** Le coordinateur headless, les fournisseurs de session et le protocole de fermeture ont désormais des responsabilités identifiables. Leur taille seule ne justifie pas une nouvelle extraction. `runtime/headless-session-lifecycle.cjs:39`, `runtime/session-providers.cjs:49`, `runtime/session-closing.cjs:1`.

- **Remplacer toute l’app TV par un framework ou imposer ESM immédiatement.** Le défaut est dans les dépendances et cycles de vie implicites ; les scripts classiques disposent déjà d’un contrat de partage et d’un banc de chargement. `docs/adr/0011-un-script-partage-du-panneau-tv-est-une-iife-exposee-sur-la-page-et-par-commonjs.md:18`, `:60`.

- **Unifier les deux hôtes dans une énorme machine à états unique.** Fin, libération et arrêt sont des axes distincts ; les ordres Mac/serveur ne sont pas interchangeables. `docs/adr/0024-un-coordinateur-possede-les-transitions-headless.md:18`, `docs/adr/0007-fin-de-session-par-un-meme-protocole-sur-les-deux-hotes.md:44`.

- **Introduire une base de données, un bus d’événements ou un conteneur d’injection pour “professionnaliser” le dépôt.** Les défauts établis concernent des propriétaires et contrats précis ; le stockage possède déjà une file d’écriture et des confirmations. `adapters/local-store.cjs:20`, `runtime/session-lifecycle.cjs:118`.

- **Transformer zéro suppression ESLint en objectif produit.** Le gel accepte des dettes existantes ; un callback commenté peut encore perdre une notification ou bloquer un travail. `eslint-suppressions.json:250`, `runtime/surveillance-runtime.cjs:165`, `core/deep-ask.cjs:78`.

- **Fusionner tous les helpers DOM et toutes les attentes.** Le helper Mac répond à des opérations absentes du double TV ; les délais de sécurité des tests processus ont une fonction différente des attentes de synchronisation. Réserve R90, `tests/helpers/wait.cjs:31`.

- **Supprimer l’API overlay avec les derniers commentaires ambient.** Son maintien est une décision de compatibilité distincte du retrait de l’affichage. `docs/architecture.md:110`.

- **Accélérer le nettoyage en libérant les preuves dès l’annulation ou en supprimant un arbre Codex après un simple délai.** L’agent peut encore utiliser les preuves ; l’absence du groupe doit être confirmée. `core/deep-ask.cjs:93`, `adapters/codex-session-client.cjs:601`.

- **Construire maintenant des adaptateurs Netflix ou audio fictifs.** Le verrou actuel est suffisamment concret pour préparer le contrat ; la capture réelle de ces sources reste inconnue. `tv/capture.py:106`, `runtime/session-runtime.cjs:249`.

**F. Questions au propriétaire**

1. **Le prochain lot doit-il privilégier les garanties de fonctionnement ou la réduction du stock de lint ?**  
   **Recommandation :** D1, D2 et D3 d’abord, avec leurs preuves comportementales. Le nettoyage esthétique accompagne les fichiers touchés.

2. **Que doit faire la surveillance quand son registre atteint sa capacité ?**  
   **Recommandation :** conserver l’historique durable et distinguer capacité active et historique. En attendant cette décision, garder l’arrêt explicite actuel ; aucune éviction silencieuse.

3. **Après un arrêt Codex non confirmé, accepte-t-on qu’une nouvelle instance du même rôle démarre ?**  
   **Recommandation :** conserver la possibilité d’archiver, mais confier l’incertitude à un propriétaire d’hôte borné et empêcher l’accumulation sans diagnostic. Cela amende une limite assumée de l’ADR 0005, pas un simple détail d’implémentation.

4. **Quels clients externes ou installations anciennes doivent encore consommer l’API overlay ?**  
   **Recommandation :** la conserver jusqu’à inventaire des consommateurs et stratégie de migration. Les seuls appels absents de la page actuelle ne suffisent pas à autoriser son retrait.

5. **Le cliquet de nombre de tests doit-il empêcher le retrait d’une API morte et de ses tests propres ?**  
   **Recommandation :** préserver les garanties utiles sur le chemin actif, puis autoriser explicitement une évolution de politique pour les suppressions démontrées. Ne jamais fabriquer des cas ni abaisser discrètement le plancher pour faire passer D5.

6. **Quel périmètre TV est désormais considéré comme produit supporté ?**  
   **Recommandation :** inclure capture, contrôle, panneau et mapper effectivement installés ; leur donner un propriétaire et une validation de démarrage, arrêt et mise à jour. Les autres expériences peuvent rester sous `prototypes/`.

7. **Quelle sera la première extension réelle : autre application vidéo ou audio seul ?**  
   **Recommandation :** décider avant de modifier les invariants de stockage. D15 peut clarifier les capacités dès maintenant ; l’acceptation d’une nouvelle modalité doit ensuite être guidée par un producteur réel.

8. **Quelle preuve matérielle clôturera l’itération ?**  
   **Recommandation :** un passage distinct sur Mac et TV réels couvrant capture, changement de session, fermeture, reprise après erreur et installation. Les réserves de smoke et les bancs simulés ne permettent pas d’annoncer cette validation aujourd’hui.
---

# Annexe — les 93 réserves de la nuit

Réserves laissées par les 41 tickets intégrés du 15 au 16/10, dans l'ordre où les rapports les numérotent (R01 à R93).


## T016 — 016-make-the-static-guards-of-the-mac-renderer-fail-when-they.md
- .harness-state/tickets/T016/relecture-1.md : **1. `tests/mac-ui.test.cjs:1072` (`importRendererModule`) — hors périmètre**

## T021 — 021-import-the-rolling-recorder-in-its-tests-instead-of.md
- ESLint non lancé par les contrôles : absent ou non configuré dans le dépôt.
- .harness-state/tickets/T021/relecture-1.md : `app/recording.js:29-33` (avec `:28` et `:65`) : `hors périmètre`

## T031 — 031-lint-with-eslint-in-the-quality-check-and-freeze-the.md
- Relecture 1, constat 2 hors périmètre : docs/standards.md conserve la mention « relecture, puis règle ESLint avec liste d’exceptions » pour la comparaison du texte source dans les tests. À reprendre dans le ticket qui ajoutera cette règle.
- Relecture 1, constat 3 hors périmètre : ESLint 9.39.5 est marqué deprecated dans package-lock.json ; cette version exacte est imposée par le ticket. Révision ultérieure par un ticket installe: oui.
- .harness-state/tickets/T031/relecture-2.md : `docs/standards.md:42` : « relecture, puis règle ESLint avec liste d'exceptions » (hors périmètre)
- .harness-state/tickets/T031/relecture-2.md : `package-lock.json:1600` : ESLint 9.39.5 marqué « deprecated » (hors périmètre)

## T032 — 032-refuse-any-growth-of-the-frozen-lint-violations-in-the.md
- Constat 3 de relecture-1.md, hors périmètre : mettre à jour .claude/skills/decoupage/SKILL.md:45, CLAUDE.md:35 et .claude/agents/implementeur.md:33 pour citer eslint.config.mjs, .prettierrc.json et .prettierignore parmi les fichiers du harnais, dans un ticket autorisé à modifier ces consignes.
- .harness-state/tickets/T032/relecture-2.md : Nombre de constats discordant : CONSTATS annonce 2 hors périmètre ; 0 constat(s) extrait(s). Consulter le rapport pour l'ensemble des constats hors périmètre.

## T046 — 046-reject-the-active-codex-turn-when-its-event-handler-throws.md
- Réserve hors périmètre de la relecture 1, constat 2 : adapters/codex-rpc.cjs conserve le seuil de tampon 4000000 sans constante nommée. Ce nombre préexistait au ticket ; il n'a pas été modifié pendant la correction.
- .harness-state/tickets/T046/relecture-2.md : `adapters/codex-rpc.cjs:73` (hors périmètre, reconduit)
- .harness-state/tickets/T046/relecture-2.md : **Écart accepté, périmètre (élagage du gel ESLint).** Inchangé depuis la relecture 1 : `no-empty` passe de 3 à 1, comme les standards l'exigent.
- .harness-state/tickets/T046/relecture-2.md : **Écart accepté, critère 3 étendu au vrai transport (complément dans `run`).** La nouvelle forme, écouter `done` dès l'attente de `turn/start`, rend à l'appelant le premier motif de rejet. Le défaut de gestionnaire ne passe plus devant un refus de la garde ou un diagnostic 401. L'affirmation de `ecarts.md` est exacte : « un succès du tour ne remplace pas l'acquittement attendu de `turn/start` ». Le test « a completed turn still waits for the start acknowledgment » la prouve.

## T100 — 100-remove-dead-exports-and-move-the-temporal-target-out-of-the.md
- Réserve de stabilité historique : l’échec Whisper de la première tentative (5003,68 ms) n’est pas reproduit et sa cause reste inconnue. Il n’est pas déclaré corrigé ou attribué à la charge ; les passes actuelles ne prouvent pas l’absence d’intermittence. Les tests et leurs délais restent inchangés.
- .harness-state/tickets/T100/relecture-1.md : **1. `tests/review-regressions.test.cjs:112`, hors périmètre**

## T101 — 101-remove-unreachable-tv-panel-code-and-let-test-fixtures.md
- Smoke visuel scripts/smoke-tv-timeline.mjs non vérifié : non lancé, vérification distincte des critères automatisés. Aucun smoke navigateur exécuté.

## T139 — 139-remove-the-legacy-openrouter-and-codex-exec-adapters-and-the.md
- .harness-state/tickets/T139/relecture-1.md : `.env.example:9-10` — hors périmètre
- .harness-state/tickets/T139/relecture-1.md : `adapters/codex-confinement.cjs:11` — hors périmètre
- .harness-state/tickets/T139/relecture-1.md : **Écart accepté, élagage de `eslint-suppressions.json`** : `docs/standards.md` oblige tout ticket qui rend une suppression inutile à l'élaguer, même hors de son périmètre. Le diff retire seulement les deux entrées des adaptateurs supprimés, sans rien ajouter ni augmenter. Le fichier ne fait pas partie des chemins protégés contrôlés par le critère 4.
- .harness-state/tickets/T139/relecture-1.md : **Écart accepté, M = P = 1102 au lieu de 966** : ce n'est pas un écart à un critère. Le ticket demande de relever M et P au début de la session ; 966 était la valeur à `e92c6a6`. La cible M − 5 = P − 5 = 1097 est tenue.
- .harness-state/tickets/T139/relecture-1.md : **Écart accepté, `tests/npm-scripts.test.cjs` présent** : le critère 5 prévoit ce cas. Le test a été lancé, il est vert, et sa liste payante est conservée.

## T147 — 147-compute-the-polled-state-views-of-the-server-host-in-pure.md
- Relecture 1, constat 4 hors périmètre : refusal reste dans le module de vues bien que l’hôte l’utilise aussi pour ses autres refus ; envisager un module d’erreurs de transport dans un travail ultérieur.
- Relecture 1, constat 5 hors périmètre : la langue par défaut fr reste dupliquée entre stateView et snapshot, que le ticket maintient dans l’hôte.
- .harness-state/tickets/T147/relecture-2.md : Nombre de constats discordant : CONSTATS annonce 2 hors périmètre ; 0 constat(s) extrait(s). Consulter le rapport pour l'ensemble des constats hors périmètre.
- .harness-state/tickets/T147/relecture-2.md : **Écart accepté, `refusal` déplacé dans le module (déclaré dans `ecarts.md`) :** même décision qu'à la relecture 1, et pour la même raison. `surveillanceHistory` et `surveillanceDetail`, que le ticket ordonne de déplacer, ont besoin de `refusal`. Le laisser dans l'hôte aurait obligé à le recopier. Le problème de cohésion reste en réserve 1.

## T148 — 148-hold-the-loaded-mac-session-in-one-object-instead-of-nine.md
- Écart déclaré au critère 1, demandé par la relecture 1 : le grep exact rend un faux positif sur une lecture de .watch. dans la déclaration de archive. Le fond du critère est tenu ; écart documenté dans ecarts.md et au journal, à trancher par la relecture suivante.
- Constat 2 hors périmètre : bug latent préexistant dans sessionRows si une fermeture remet loaded à null pendant await library.list ; risque de TypeError sur loaded.runtime dans la projection. À traiter par un ticket ultérieur, sans changement de comportement dans T148.
- Constat 3 hors périmètre : la mutation simultanée ne démontre individuellement que la détection d’une lecture figée de sessionState. Couverture des autres lectures tardives inconnue (deux getSession, getInstruction, microtask drain, titre de compose.onChange, sweep, sessionRows), à examiner avant T149/T150 ; aucun test ajouté.
- ESLint non lancé : absent ou non configuré dans le dépôt.
- .harness-state/tickets/T148/relecture-2.md : Nombre de constats discordant : CONSTATS annonce 2 hors périmètre ; 1 constat(s) extrait(s). Consulter le rapport pour l'ensemble des constats hors périmètre.
- .harness-state/tickets/T148/relecture-2.md : **Écart accepté, critère 1.** La commande du critère rend une ligne, `506:    let archive = id === loaded?.runtime.watch.id ? …`, alors que le critère attend une sortie vide.

## T149 — 149-move-the-window-and-capture-source-handlers-of-the-mac-host.md
- Réserve hors périmètre, relecture-1 constat 2 : centraliser les tailles minimales du mode plein (1000 et 720) encore répétées entre app/window-mode.cjs et la création de BrowserWindow dans app/main.cjs. Cette création n'est pas autorisée à modification par le ticket ; à traiter dans un ticket suivant.
- .harness-state/tickets/T149/relecture-2.md : `app/main.cjs:89-90` (hors périmètre) : toujours en réserve

## T150 — 150-move-the-moment-actions-and-session-rows-of-the-mac-host.md
- Relecture 1, constat 3 hors périmètre : une source commune reste à établir pour la limite de 1600 caractères entre app/index.html (maxlength) et l’hôte ; le commentaire explicite maintenant ce lien.
- Lint non lancé par le contrôle : ESLint absent ou non configuré.
- .harness-state/tickets/T150/relecture-2.md : `app/index.html:111` et `app/moment-actions.cjs:2-3` (hors périmètre, reporté de la relecture 1)

## T163 — 163-report-the-test-coverage-of-each-module.md
- Écart natif accepté au critère 3 (relecture-3.md, section Écarts et contestations) : dénominateurs de branches variables sur adapters/codex-session-client.cjs, adapters/config.cjs, adapters/model-settings.cjs, runtime/state-views.cjs et runtime/surveillance-runtime.cjs. Preuves dans coverage-run{1,2}.json, coverage-comparison.json, native-probe-{1,2}.json et native-probe-comparison.json. Les positions des branches des collectes complètes ne sont pas localisables rétrospectivement ; celles des sondes ne les remplacent pas. Aucun arrondi ni test produit modifié.
- Hors périmètre, relecture-3.md constat 2 : le mode texte affiche le code et le message générique sur stderr ; les causes détaillées sont disponibles dans le champ details du JSON. Affichage détaillé sur stderr à traiter lors d'une prochaine reprise de ce code.
- Hors périmètre, relecture-3.md constat 3 (report du constat 8 de relecture-1.md) : budgets de durée et de sortie locaux ; mutualisation avec check.mjs et TVLENS_TEST_BUDGET_MS nécessitant un ticket autorisant une modification du harnais.
- .harness-state/tickets/T163/relecture-4.md : `scripts/coverage.mjs:147-148` — hors périmètre (constat 2 de `relecture-3.md`)
- .harness-state/tickets/T163/relecture-4.md : `scripts/coverage.mjs:11-12` — hors périmètre (constat 3 de `relecture-3.md`, à l'origine constat 8 de `relecture-1.md`)
- .harness-state/tickets/T163/relecture-4.md : **Écart accepté, critère 3.** Je maintiens la décision des relectures 2 et 3, car la correction ne touche ni la collecte ni les mesures. `ecarts.md` ne déclare aucun nouvel écart.

## T165 — 165-remove-the-closed-panel-ambient-page-its-build-and-its-dedicated-tools.md
- .harness-state/tickets/T165/relecture-1.md : **`docs/architecture.md:116`** (hors périmètre)
- .harness-state/tickets/T165/relecture-1.md : **`README.md:89`** (hors périmètre)

## T166 — 166-remove-the-ambient-supervisor-its-relay-and-their-routes.md
- Réserve hors périmètre, relecture 1 constat 2 : tv/luna.py n’a plus d’importeur ni de test après le retrait du superviseur. T181 ou un cadrage distinct décidera de le raccorder à la capture avec un test, conformément à docs/travail/fiches/tv-et-python.md, ou de le retirer. Module laissé inchangé dans T166.
- .harness-state/tickets/T166/relecture-2.md : `tv/luna.py:1` : hors périmètre (repris du rapport 1)

## T168 — 168-keep-mac-capture-resources-inside-one-controller.md
- Relecture 2, constat 2 hors périmètre : l’environnement par défaut de RollingRecorder dans app/recording.js fait doublon avec la composition navigateur, notamment pour ingest. Ce fichier reste intact ; retrait ou alignement à traiter ultérieurement.
- Relecture 2, constat 3 hors périmètre : ADR 0018 cite encore openCapture parmi les commandes publiques et les anciennes délégations textuelles de mac-ui. Aucune révision d’ADR autorisée par ce ticket ; document laissé intact.
- Vérifications hors ligne : capture matérielle Mac et moment exact du départ IPC pendant un vrai déchargement Electron non exercés. La résolution de release est testée sans supposer que le navigateur attend sa promesse à la fermeture.
- .harness-state/tickets/T168/relecture-3.md : Nombre de constats discordant : CONSTATS annonce 2 hors périmètre ; 3 constat(s) extrait(s). Consulter le rapport pour l'ensemble des constats hors périmètre.
- .harness-state/tickets/T168/relecture-3.md : **Écart accepté, relecture 2** (`ecarts.md`, section « Relecture 2 ») : aucun critère n'est affaibli. Il complète le test de composition existant avec des dépendances de temps et de média simulées, et ne laisse aucun changement de production. C'est ce que montre l'interdiff.

## T169 — 169-expose-tv-chat-models-through-a-dedicated-classic-script.md
- Réserve hors périmètre, constat 2 de relecture-1.md : actualiser séparément docs/adr/0011-un-script-partage-du-panneau-tv-est-une-iife-exposee-sur-la-page-et-par-commonjs.md pour documenter module.require dans les scripts touchés et le passage de vingt à vingt et un tests de navigation. Ticket adr: non ; ADR inchangé.
- .harness-state/tickets/T169/relecture-2.md : `docs/adr/0011-un-script-partage-du-panneau-tv-est-une-iife-exposee-sur-la-page-et-par-commonjs.md:24` (hors périmètre)

## T170 — 170-move-tv-polling-into-an-injected-controller.md
- Réserve hors périmètre de la relecture 1, constat 2 : scripts/bench-perceived.cjs:149 renvoie encore à companion.js et décrit approximativement le modèle conduit par le banc ; à corriger dans un ticket autorisant scripts/.
- .harness-state/tickets/T170/relecture-2.md : `scripts/bench-perceived.cjs:149` (hors périmètre)

## T171 — 171-keep-tv-chat-cards-and-submission-state-inside-one-view.md
- Écart déclaré pour relecture dans ecarts.md, conformément au constat 1 : aucune navigation de citation n’existait à injecter ; les citations restent du texte. Une navigation future relève d’un ticket produit.
- .harness-state/tickets/T171/relecture-2.md : **Écart accepté, périmètre (« actions injectées … navigation vers les citations ») :**

## T173 — 173-move-the-restore-and-close-of-a-session-runtime-into-their-own-module.md
- Hors périmètre, relecture 1 constat 3 : unifier ultérieurement la borne et la mise en forme des erreurs de fermeture entre session-lifecycle.cjs et session-closing.cjs. La duplication préexistait ; le ticket interdit de modifier session-closing.cjs.
- .harness-state/tickets/T173/relecture-2.md : Nombre de constats discordant : CONSTATS annonce 1 hors périmètre ; 0 constat(s) extrait(s). Consulter le rapport pour l'ensemble des constats hors périmètre.

## T174 — 174-route-the-server-http-handler-through-one-module-per-route-group.md
- Hors périmètre, relecture 1 constat 2 : la garde du message de fermeture dans tests/architecture-f07.test.cjs ne lit que server/http.cjs côté transport serveur ; les nouveaux server/*-routes.cjs échappent à cette garde. Elle reste vraie aujourd'hui et la suite reste inchangée conformément au ticket.
- .harness-state/tickets/T174/relecture-2.md : Nombre de constats discordant : CONSTATS annonce 1 hors périmètre ; 0 constat(s) extrait(s). Consulter le rapport pour l'ensemble des constats hors périmètre.
- .harness-state/tickets/T174/relecture-2.md : **Écart accepté, `eslint-suppressions.json` (élagage, sans numéro de critère).** Décision inchangée depuis la relecture 1 : `docs/standards.md` impose de retirer une suppression devenue inutile, et aucun gel n'est ajouté.

## T175 — 175-split-the-event-and-run-handling-of-the-codex-session-client.md
- Hors périmètre, relecture 1 constat 4 : refuse utilise encore setTimeout/clearTimeout globaux pour la minuterie de drain, alors que le module de tour reçoit ses minuteries par injection. Harmonisation à traiter séparément.
- .harness-state/tickets/T175/relecture-2.md : `adapters/codex-session-client.cjs:486` — hors périmètre (réserve maintenue)

## T176 — 176-handle-or-justify-every-empty-catch-in-the-adapters.md
- R1 — adapters/codex-confinement.cjs/createContext : refus accès/lien confondu avec absence, authentification possiblement indisponible sans cause spécifique. Manquent refus disque injectés via createContext/prepare ; travail futur : distinguer absence/refus et définir un diagnostic sûr.
- R2 — adapters/codex-confinement.cjs/sweepStaleContexts : candidat non supprimable pouvant garder ses liens privés sans diagnostic. Manquent refus lstat/rm et preuve de poursuite vers un autre candidat ; travail futur : canal de refus testé sans affaiblir les protections du balayage.
- R3 — adapters/saved-moment-store.cjs/list : élément illisible omis silencieusement, fichiers conservés. Manquent refus lecture/parsing avec élément suivant lisible ; travail futur : préciser la visibilité des refus puis tester le contrat de liste partielle.
- R4 — adapters/embedding-store.cjs/load : reconstruction silencieuse et coût fournisseur éventuel ; structure invalide pouvant arrêter le chargement après des entrées déjà mémorisées. Manquent refus lecture/header et structure tardive ; travail futur : définir/tester tolérance au schéma et diagnostic.
- R5 — adapters/codex-rpc.cjs/atHostExit : allocation refusée non exercée, grâce sautée et SIGKILL demandé sans confirmation synchrone. Travail futur : preuve du repli par sortie contrôlée et signaux doublés ; aucune nouvelle garantie de disparition.
- R6 — adapters/remote-media.cjs/cleanup : méthode de classe stricte ; affectation sur chaîne/nombre, null/undefined, Error gelée, accesseur/Proxy qui lèvent atteint le catch. Preuve réobservée pour ces sept cas via assemble et disque doublé (signal doublé uniquement pour undefined), cible de rm désormais vérifiée hors du code testé. Diagnostic secondaire perdu, raison primaire conservée ; aucune réussite du nettoyage revendiquée. Si une visibilité du diagnostic est requise, définir et tester un canal distinct de l’erreur primaire.
- .harness-state/tickets/T176/relecture-3.md : **Écart accepté, critères 2 et 4 :** pas de test ni de rouge causal exigé pour de simples commentaires. Le ticket admet les justifications de comportement inchangé ; je maintiens la décision des relectures 1 et 2.
- .harness-state/tickets/T176/relecture-3.md : **Écart accepté, élagage de `eslint-suppressions.json` :** les standards l'imposent, et ce fichier ne fait pas partie du harnais protégé.

## T177 — 177-handle-or-justify-every-empty-catch-in-app-runtime-server-and-the-tv-app.md
- Réserve autorisée : sur le headless, le catch du tick permet la suite quota/disque et le prochain appel, prouvés par injection. Un tick partiel dans le cœur, ses effets et sa reprise ne sont pas garantis ; writeIfDue est sauté si le cœur lève. Définir diagnostic et contrat de reprise dans un travail distinct, puis tester le cœur et les deux hôtes.
- Constat 2 de relecture, hors périmètre : app/main.cjs appelle surveillance.tick() dans setInterval sans garde. Une exception y remonte comme exception non interceptée du processus principal Electron, contrairement au headless. Établi par lecture, sans panne Mac exercée. Intégrer cette différence au travail sur le contrat de reprise ; aucune correction du tick Mac dans ce ticket.
- Réserve autorisée : toldAs avance avant la publication hôte ; son échec perd la notification et le même statut de persistance n'est pas renotifié. Le catch de publish masque aussi l'échec au diagnostic du cœur : snapshot().error reste null, ce que le nouveau test et sa mutation établissent. Le registre reste consultable et les écritures continuent. Définir un diagnostic, la confirmation, une reprise bornée et la livraison partielle des notifications dans un travail distinct.
- .harness-state/tickets/T177/relecture-2.md : Nombre de constats discordant : CONSTATS annonce 1 hors périmètre ; 0 constat(s) extrait(s). Consulter le rapport pour l'ensemble des constats hors périmètre.

## T179 — 179-move-headless-capture-admission-into-one-intake-owner.md
- .harness-state/tickets/T179/relecture-2.md : **Écart accepté, repères de lignes historiques** : le transport vit bien dans `server/ingest-routes.cjs` depuis T174. Ce n'est pas un écart à un critère.
- .harness-state/tickets/T179/relecture-2.md : **Écart accepté, options `setPreparationTimer` / `clearPreparationTimer`** : c'est le câblage des minuteries injectées que demande le périmètre. Il garde le contrat de l'ADR 0015, où `setTimer`/`clearTimer` restent réservés au checkpoint.

## T180 — 180-move-headless-session-transitions-into-one-coordinator.md
- Constat 2 de relecture-1, hors périmètre : la garde finale de tests/architecture-f07.test.cjs ne scanne plus runtime/headless-runtime.cjs contre une réintroduction du journal de fin ou du protocole. À traiter dans un futur ticket ; le critère 6 actuel limite le diff des tests au changement de cible. La correction laisse cette garde inchangée.
- .harness-state/tickets/T180/relecture-2.md : `tests/architecture-f07.test.cjs:580-589` (hors périmètre) — reste en réserve

## T181 — 181-remove-the-ambient-capture-gate.md
- Réserve hors périmètre (relecture 1, constat 3) : tests/test_tv_control.py:168-186 conserve une fixture tvlens-ambient-gate.json et vérifie que le contrôleur ne la modifie pas. À traiter dans un ticket ultérieur ; ce fichier reste inchangé.
- .harness-state/tickets/T181/relecture-2.md : Nombre de constats discordant : CONSTATS annonce 1 hors périmètre ; 0 constat(s) extrait(s). Consulter le rapport pour l'ensemble des constats hors périmètre.

## T182 — 182-remove-the-ambient-integrations-of-the-tv-page-and-its-documents.md
- Constat 4 hors périmètre : OverlayQueue.prototype.seen et sa documentation résiduelle restent avec la file, ses fixtures et ses tests ; reprise au cadrage différé du retrait de l'API overlay.
- Constat 5 hors périmètre : description ancienne de lg-ambient.md dans docs/README.md ; reprise dans un ticket documentaire.
- Constat 6 hors périmètre : commentaires de runtime/headless-runtime.cjs, runtime/state-views.cjs et tests/server-surveillance.test.cjs citant l'ancien consommateur ambient ; reprise avec le retrait différé de l'API overlay.
- Constat 7 hors périmètre : mock /ambient et filtre du premier cas appairé antérieur conservés ; le scénario ajouté couvre l'absence d'appels, les assertions des cas livrés restent inchangées.
- Smokes navigateur/natifs, Electron, packaging et vérification physique TV/VPS non exécutés, non requis par le ticket. Aucune preuve de déploiement ou de rendu matériel.
- ResourceWarning préexistant dans prototypes/lg-remote/test_panel.py:164 sur panel.lock non fermé, observé sans échec ; code Python inchangé.
- .harness-state/tickets/T182/relecture-2.md : Nombre de constats discordant : CONSTATS annonce 4 hors périmètre ; 0 constat(s) extrait(s). Consulter le rapport pour l'ensemble des constats hors périmètre.

## T183 — 183-deliver-the-pushed-state-of-the-mac-window-through-one-tested-seam.md
- .harness-state/tickets/T183/relecture-2.md : **Écart accepté (helper de document) :** `ecarts.md` ne déclare aucun écart aux critères. La note sur le helper `tests/helpers/mac-document.cjs` reste acceptée, pour la même raison qu'en relecture 1 : le helper TV ne fournit pas les opérations DOM dont `KeyedList` a besoin.

## T184 — 184-handle-or-justify-every-empty-catch-in-the-core.md
- Réserve initiale conservée : core/deep-ask.cjs, release(job). Un refus synchrone préserve réponse/annulation et file mais peut laisser retenus préfixe et dépendances ; aucun nouvel essai ni succès du nettoyage n'est attesté. Manquent le devenir des références après libération partielle et une mesure mémoire réelle. Travail distinct requis : définir puis tester un contrat de reprise/diagnostic du nettoyage (ADR 0004). Les doublures ne prouvent aucune panne matérielle ni absence de fuite.
- Relecture de correction et resserrement du plancher réservés à la boucle.

## T185 — 185-drive-the-paired-tv-page-in-the-test-bench.md
- .harness-state/tickets/T185/relecture-2.md : **Écart accepté, structure du DOM :** `ecarts.md` déclare l'extraction du DOM dans `tests/helpers/tv-document.cjs`. Ce n'est pas un écart à un critère : le critère 3 reste tenu, avec un seul document et un seul chargeur pour les deux modes. Même décision qu'en relecture 1.
