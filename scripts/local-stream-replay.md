# Rejouer un calendrier de captures et de questions

`replay-local-stream.cjs` prépare la référence soutenue G3 avec le vrai runtime headless et son
serveur HTTP sur une adresse loopback et un port éphémère. La validation seule est le défaut :
elle lit les fichiers et leurs empreintes sans construire de fournisseur. Une exécution réelle
demande `--execute` et appartient à l'opérateur, hors boucle de tickets.

```sh
node scripts/replay-local-stream.cjs --help
node scripts/replay-local-stream.cjs --scenario scripts/fixtures/local-stream/nominal.json \
  --out /tmp/tvlens-calendrier-validation --validate
node scripts/replay-local-stream.cjs --scenario scripts/fixtures/local-stream/overload.json \
  --out /tmp/tvlens-surcharge-validation --validate
```

Le parent de la sortie doit exister ; le dossier demandé doit être neuf. Les données, les corps envoyés
et `campaign.json` restent dans ce dossier, y compris après SIGINT, SIGTERM ou délai dépassé. Aucun
nettoyage automatique ni écrasement d'une campagne précédente. La CLI retourne 1 pour une validation
refusée ou une campagne incomplète. `complete` décrit la fin du calendrier et de ses attentes ; il ne
signifie pas que toutes les questions ont réussi ni que G3 est établi.

## Scénario et sources

Les exemples fournis utilisent un corpus fictif de huit secondes, bouclé et déclaré comme tel.
Le nominal planifie trente minutes, 225 blocs de huit secondes et douze questions réparties, avec
une rafale de trois à quinze minutes. La surcharge est un scénario séparé avec huit questions à
la même échéance : le produit conserve un actif et cinq attentes ; le surplus reçoit son refus.
Ces fichiers sont des exemples de format, sans valeur de mesure du matériel ni de contenu inédit.
Les noms de modèles locaux sont des paramètres à remplacer avant toute exécution.

Un scénario version 1 contient :

| Champ | Sens |
| --- | --- |
| `kind` | `nominal` ou `overload` |
| `index` | `{path, sha256}` de l'index des gabarits HTTP |
| `provenance` | `kind`, `reference` descriptive, et préparation pour une vidéo |
| `plannedDurationMs` | Borne de fin du calendrier, relative à l'origine de session |
| `finalWaitMs`, `closeWaitMs` | Bornes du runner pour vidage et fermeture, distinctes des délais produit |
| `config` | Choix explicites des quatre backends et paramètres locaux |
| `selectedModels` | `observationModel`, `inspectionModel`, `codexModel` explicites pour la référence distante |
| `clips` | Liste ordonnée de `{id, block, occurrence, atMs, language}` |
| `questions` | Liste de `{id, atMs, question}`, avec `cancelAtMs` facultatif |
| `surveillance` | Facultatif : `{instruction}` ; rôle Codex distinct si activé |

`block` est la position dans l'index. `atMs` est le début prévu de cette occurrence ; l'envoi se
déclenche à sa clôture, sans attendre uploads, analyses ou réponses précédents. Les intervalles ne
se chevauchent pas. Chaque répétition reçoit une occurrence distincte, une séquence croissante,
des temps de bloc et d'images translatés. La répétition demande `provenance.kind: "looped-corpus"`
ou `loop: true` explicite. L'ancrage d'une question est l'heure effective de sa soumission sur
l'horloge de session ; aucun futur n'est ajouté pour compenser un retard.

Chaque extrait déclare `language: "fr"`, `"en"` ou `"auto"`. Le runner règle la session par
`/v1/settings/transcription` avant le premier envoi de chaque groupe de langue et conserve
l'accusé du réglage. Il relève aussi la langue au départ effectif de la transcription. Si un
changement de langue dépasse des audios encore en attente, la campagne porte
`TVLENS_REPLAY_TRANSCRIPTION_LANGUAGE_MISMATCH` et reste incomplète. Pour une charge soutenue
homogène, conserver une langue par campagne évite cette ambiguïté du réglage global du produit.
Cette garde conserve l'appel au transcripteur et son résultat : elle refuse seulement la qualification.

L'index version 1 porte `complete: true` et `blocks: [{caseId, body: {path, sha256}}]`. Les corps
sont ceux de `/v1/segments` : intervalle positif de 10 secondes au plus, une à cinq images
`{atMs, data}`, base64 sans préfixe, audio WAV facultatif limité à 2 100 000 octets décodés.
Le validateur produit contrôle également ordre, bornes, cadrages et tailles d'images. Un bloc de
six images est refusé avant toute exécution. Le runner ne le réduit pas.

Les chemins des références sont relatifs au document qui les contient, sans `..` ni chemin absolu.
Une empreinte erronée, un fichier absent ou une préparation incomplète refuse toute la campagne
avant construction d'un fournisseur. Les temps des gabarits restent ceux de leur source ; la
liaison à une session et les nouvelles séquences appartiennent au runner.

### Enregistrement fourni et médias de perception

Pour trente minutes fournies par le propriétaire, préparer des gabarits consécutifs depuis les
médias enregistrés, avec `provenance.kind: "tvlens-capture"` et une référence à l'enregistrement.
Un passage Mac peut porter six images ou davantage ; l'opérateur choisit explicitement au plus
cinq prises originales pour le contrat HTTP. Il conserve les sources et déclare les indices retenus.

Ce fragment Node, à lancer depuis la racine avec ses chemins et sa sélection adaptés, illustre la
préparation d'un cas du manifeste de perception. Il copie le corpus source sans le modifier,
retire seulement le préfixe des images choisies et conserve les identités vérifiables de perception :

```js
const fs = require('node:fs/promises');
const path = require('node:path');
const { readJson, loadCase, sha256 } = require('./scripts/perception-replay-input.cjs');
const sourceRoot = '/chemin/corpus-perception';
const destination = '/tmp/corpus-http-neuf';
await fs.mkdir(destination);
await fs.cp(sourceRoot, path.join(destination, 'source'), { recursive: true });
const manifest = await readJson(path.join(destination, 'source/manifest.json'));
const item = manifest.value.cases.find(item => item.id === 'CAS_CHOISI');
const loaded = await loadCase(item, path.join(destination, 'source'));
const media = await readJson(path.join(destination, 'source', item.media.path));
const frameIndices = [0, 1, 2, 3, 4]; // Choix explicite de prises originales existantes.
const body = { sessionId: 'template-only', sequence: 0,
  startMs: item.startMs, endMs: item.endMs,
  frames: frameIndices.map(index => ({ atMs: loaded.segment.frames[index].atMs,
    data: loaded.segment.frames[index].dataUrl.split(',')[1] })),
  ...(media.value.audio ? { audio: media.value.audio } : {}) };
const raw = JSON.stringify(body);
await fs.writeFile(path.join(destination, 'body.json'), raw);
const index = { version: 1, complete: true, blocks: [{ caseId: item.id,
  body: { path: 'body.json', sha256: sha256(raw) },
  perception: { caseId: item.id, frameIndices,
    manifest: { path: 'source/manifest.json', sha256: manifest.sha256 } } }] };
await fs.writeFile(path.join(destination, 'blocks.json'), JSON.stringify(index));
```

Ce fragment s'utilise dans une fonction `async` ou dans le REPL Node avec `await`. Répéter la
préparation pour chaque cas utile ; un passage de plus de dix secondes exige une préparation
adaptée de ses intervalles et médias, pas une simple déclaration. La référence `perception`
est facultative pour les index préparés autrement ; si présente, le runner vérifie cas, médias,
intervalle, audio et sélection exacte. Les indices et empreintes des data URL originales sont
conservés, y compris pour des images PNG. Aucun fichier source n'est réécrit et aucune image inventée.
Sans référence de perception, `frames[].bytesSha256` empreinte seulement les octets décodés du corps
HTTP ; aucune empreinte de data URL ni hypothèse de type d'image n'est ajoutée.

Pour boucler un petit corpus, déclarer `looped-corpus`, incrémenter `occurrence` à chaque tour
et translater `atMs` dans le scénario. Les huit secondes originales restent huit secondes de
contenu unique, même si le calendrier dure trente minutes.

### Vidéo convertie

La vidéo se prépare avant le calendrier avec [prepare-video-replay.md](prepare-video-replay.md).
Le `blocks.json` produit s'utilise directement : aucune deuxième conversion des corps ou des base64.
Le scénario référence son empreinte dans `index` et ajoute :

```json
{
  "provenance": {
    "kind": "converted-video",
    "reference": "Vidéo convertie ; capture LG et pertes avant livraison non mesurées.",
    "preparation": { "path": "preparation.json", "sha256": "EMPREINTE_DU_FICHIER" }
  }
}
```

Placer le scénario à côté de la préparation ou employer des chemins relatifs descendants. Construire
les clips avec les intervalles réellement acquis. Le rapport conserve source, empreinte, paramètres,
intervalle source et durée convertie réellement utilisée. Si la source est plus courte, déclarer
sa répétition par `loop: true` ; elle ne devient pas trente minutes inédites. Une vraie session TV
reste le témoin de fidélité de la capture LG et de ses pertes avant livraison.

## Backends et exécution hors boucle

`config.perceptionBackend`, `questionsBackend` et `inspectionBackend` valent `local` ou `codex`.
`embeddingsBackend` vaut `local`, `openrouter` ou `disabled`. Les paramètres locaux sont ceux des
compositions produit : `localVlm`, `localQuestions`, `localEmbeddings`, chacun avec URL et modèle
explicites. Les éventuels jetons et clés restent dans la configuration importée par `--config`
(défaut `.env`), jamais dans le scénario. Les budgets et les données sont isolés dans la sortie.

Exécution réservée à l'opérateur, après adaptation et validation du scénario :

```sh
node scripts/replay-local-stream.cjs --scenario /chemin/scenario-valide.json \
  --out /chemin/campagne-neuve --config /chemin/configuration --execute
```

Pour la référence Codex, fixer explicitement les sélections et modèles correspondants dans une
copie du scénario. Le rapport annonce `reference: "codex"` ; elle ne devient pas une mesure locale.
Le runner utilise `smoke: false`. Une perception locale sans `metrics.backend.kind: "ollama"`
ou une identité de questions locales inconnue refuse la qualification de la campagne. Chaque rôle
conserve sélection, identité effective, origine et invocation. Un rôle injecté, simulé, désactivé
ou non exercé garde `localMeasurement: false`. Les questions locales ne disposent pas du web et
une panne locale ne déclenche aucun repli Codex/OpenRouter. Embeddings et inspection restent
identifiés indépendamment dans le bilan de campagne.
La garde sur le résultat visuel consigne son diagnostic sans modifier le résultat livré à la session.

## Transport, sorties et limites

Chaque livraison suit `tv/transport.py` : lecture de `/v1/session`, puis `/v1/segments` ; au plus
5 secondes par requête, budget de 30 secondes depuis la clôture prévue du bloc. Les 408, 429, 5xx
et coupures réessaient après une seconde, avec le même corps sérialisé, séquence et temps. Le délai
de requête est borné au budget restant, avec son plancher de 100 ms ; le dernier repos est raccourci
et aucun essai ne démarre après expiration. Le plancher peut faire finir la dernière requête après
la borne. Stockage plein, archive en lecture seule ou session changée arrêtent les envois futurs.

`campaign.json` conserve les échéances, soumissions, accusés, refus codés, expirations, états des
questions, annulations et attentes restantes. Chaque tentative a sa route, son numéro, ses temps,
son délai, son statut HTTP et son code. `uploads/` conserve les corps exacts et leurs empreintes ;
`data/` contient les médias et archives de la session. SHA Git, diff et sources du runner sont
empreintés avant les envois. Les origines monotone, murale et session sont explicites.
Une écriture ou un renommage refusé conserve le dernier fichier confirmé et ajoute le diagnostic
`TVLENS_REPLAY_REPORT_WRITE_FAILED` avec le code système. Les sauvegardes suivantes reprennent ;
un échec de la sauvegarde finale attendue est remonté à l'appelant.

Le dépassement de l'attente finale ou l'interruption laisse une campagne `incomplete`. Une réponse
tardive après annulation n'est pas une réussite. `shutdown.archiveConfirmed` et
`shutdown.releaseConfirmed` restent séparés : une archive confirmée ne prouve pas la fermeture
d'un fournisseur ; une fermeture hors délai reste non confirmée avec son diagnostic.

## Journal et bilan de campagne

`journal.revisions` conserve une copie de chaque version de passage observée, avec son identité de
session, son canal et les métadonnées de perception, dont les métriques fournisseur et leurs durées
brutes. L'abonné public `session.events` relit seulement `session.memory.passage(id)` à la version
annoncée. Ce canal observe les publications de passage pendant son abonnement. La révision d'hôte
reste différente : `journal.httpStates` sonde réellement `/v1/state` chaque seconde et se déclare
échantillonné. Une réponse retenue ou absente ne crée aucune publication intermédiaire supposée.

Le même pas de 1 000 ms produit `journal.samples`, même quand aucun fournisseur ne publie : horloge
de session, bornes de capture et d'analyse, retard publié, dernières preuves audio et vision.
`ageMs` mesure le temps depuis leur publication ; `contentAgeMs` mesure le temps depuis la fin du
passage. Sans preuve disponible, l'âge vaut `null`. Ces calculs restent dans le domaine session ;
`clocks.fields` distingue estampilles de session, mural serveur, durées produit et nanosecondes
fournisseur. Un dernier passage prêt peut ramener le retard publié à zéro sans combler un trou.

`consultation` est la dernière vue `session.memory.view()` lue en processus avant fermeture.
Elle conserve les trous produit à 250 ms, les intervalles et les compteurs acquis. Les trous vus
au fil de la campagne restent dans `journal.productGaps`. Les `captureGaps` HTTP à 1 000 ms restent
séparés dans `journal.httpStates` : cette consultation en processus n'est pas une capacité HTTP.

`summary.coverage` calcule séparément l'union des intervalles reçus, des publications audio réussies
et des publications vision réussies, rapportée à toute la fenêtre planifiée. Ses intervalles
manquants incluent le début et la fin. Ni réessai reconnu comme doublon, ni compteur cumulatif relu
n'ajoute de couverture. Un audio `failed` ne couvre rien ; un refus HTTP ne crée pas de perte de
voie pour un passage absent. `journal.losses` déduplique les faits par passage, voie et révision ;
`summary.losses` garde leurs causes et durées, et `summary.lossCounters` garde à part les compteurs
produit sans les sommer entre échantillons. Aucun bilan ne se limite aux quarante derniers passages.

`summary.roles` fournit la table des rôles avec sélection, identité composée, paramètres connus,
preuves d'invocation et qualification. Les diagnostics d'inspection gardent l'identité d'origine
sur un résultat du cache. Les recherches lexicales restent indiquées même après une tentative
d'embeddings en échec. Détection de surveillance et recherche web ont des lignes distinctes ;
le web demeure distant. Les nombres de requêtes fournisseur inconnus restent `null`.
La configuration seule, une injection ou une sortie JSON de modèle ne qualifie pas une mesure locale.

Les issues successives des questions figurent dans `journal.questions`, refus et annulations
compris. `questions[].acquired` distingue une réponse acquise avant la fermeture du statut final
publié par le produit : une réponse terminée pendant la fermeture peut garder `status: "done"`,
avec `acquired: false`. Le journal marque ces observations `afterClose: true` et les bilans de
réussite ainsi que la qualification des rôles les excluent. Les réponses déjà acquises restent comptées.
Les paramètres configurés `reasoningEffort` et `workers` des rôles de surveillance sont conservés ;
`null` signifie que le défaut du produit s'applique, sans en recopier la valeur.

`questions[].latency` sépare accusé HTTP, délai soumission → résultat reçu par sondage HTTP
et métriques internes disponibles. Ce délai inclut le pas de sondage. Attente effective de l'agent,
premier token et réseau pur restent inconnus (`null`) ; les métriques brutes ne sont pas remplacées
par zéro. Une réponse après annulation ou début de fermeture ne devient pas une preuve acquise.

En fin incomplète, journaux, bilan partiel, attentes restantes, empreintes et provenance restent
dans `campaign.json`. Une vidéo convertie y reste une vidéo convertie avec ses paramètres.
Les tests accélérés avec faux serveurs ne prouvent ni débit GPU ni stabilité de trente minutes réelles.
