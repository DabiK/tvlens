# Préparer et conduire l’expérience GX10 figée

Ce guide prépare la copie B après T261 et l’intégration des préparatifs, **avant la phase Mémoire**
(T224–T227). L’orchestrateur répète sur Mac, puis utilise exactement le même SHA sur GX10.
La contraction de Mémoire sera recettée séparément après l’expérience (T281).
Les commandes d’inférence ci-dessous sont réservées à l’opérateur, hors boucle ; cette rédaction
vérifie uniquement les aides, validations, conversion synthétique et tests à fournisseurs contrôlés.
Aucun résultat matériel GX10 n’en découle.

Le [PRD V2, sections 4 et 5](PRD-V2.md), la [grille d’action](action-evaluation-rubric.md) et les
[mesures de latence](backend-latency-optimization.md) donnent le contexte. Les contrats exécutables
sont ceux des runners [G1](../scripts/perception-replay.md), [G2](../scripts/perception-replay-scoring.md),
[G3 et bilan T261](../scripts/local-stream-replay.md) et [conversion T262](../scripts/prepare-video-replay.md).
Les anciens bancs retirés ne sont pas requis (ADR 0016) ; fournisseurs et archives restent régis par
les ADR 0019 et 0048. Le banc synthétique de l’ADR 0028 ne prouve pas le débit réel.

## Responsabilités et ordre opératoire

1. **Codex** livre ce guide et ses vérifications sans fournisseur. Il ne répète pas avec Ollama,
   n’accède pas au GX10, ne crée ni copie gelée ni tag, et ne touche ni TV, VPS, identifiants ou pile.
2. **Le propriétaire** fournit une dizaine d’extraits français réels, les droits d’usage et l’accès
   matériel. **L’orchestrateur** prépare format et grille, fait figer les annotations avant les
   inférences, organise leur revue et arrête boucle, modèles et autres charges concurrentes avant répétition.
3. **L’orchestrateur** choisit la copie B après intégration, la répète sur Mac avec le SHA retenu,
   puis consigne répétition et tag. Un correctif impose un nouveau SHA et une nouvelle répétition.
   Il reporte le tag dans T254 ; la clôture de T254 attend la décision du propriétaire sur la phase 2.
4. **L’opérateur** établit accès privé authentifié, versions, mémoire et GPU effectif sans exposer
   publiquement Ollama. Sur le même SHA : G1 froid/chaud → revue G2 → G3 de trente minutes réelles,
   puis surcharge séparée. La préparation vidéo est terminée avant de démarrer le calendrier G3.
5. À chaque panne ou manque d’accès, conserver les preuves et un statut explicite. Le repli de
   démonstration reste `hackathon-rc`, dans une campagne distincte et identifiée. Il ne valide pas GX10.
   Pas de migration Ollama vers une autre pile pour sauver l’essai, ni poursuite silencieuse chez Codex/OpenRouter.

La recette opérateur Mac comprend réouverture d’archives (T208), capture audio réellement audible
(T246), disponibilité du binaire et des poids Whisper (T247), fermeture et libération des ressources.
Consigner chaque anomalie, dont un échec Whisper intermittent. T256 ne le déclare pas corrigé ;
aucun délai produit n’est augmenté pour le masquer. Répétition Ollama, tunnel privé, vérification GPU,
appels réels et éventuel banc Whisper GPU restent **non testés dans cette session**.
T266 (détection locale de surveillance) vient après l’expérience et n’est pas un prérequis.

## Identifier le code et isoler les données

Pour les vérifications documentées le 18 octobre 2026, la base suivie est `0f0682d` ; l’arbre contient
les modifications documentaires et des travaux locaux préexistants. Ce n’est pas la copie B gelée.
Les chemins suivants désignent ce contrôle local, avec des sorties conservées hors Git :

```sh
CODE=/Users/Dabi/Documents/ISN/tvlens
CHECK=/Users/Dabi/Documents/ISN/tvlens/.harness-state/tickets/T260/offline
FIXTURES="$CODE/scripts/fixtures"
cd "$CODE"
```

Pour rejouer le contrôle, choisir un autre `CHECK` absolu neuf et créer son parent. Les runners
refusent les dossiers de campagne existants ; garder ceux d’un échec au lieu de les effacer.
Les commandes réelles suivantes supposent une **copie explicite déjà préparée par l’orchestrateur**,
avec dépendances disponibles, configuration indépendante et outils/poids existants :

```sh
COPY=/Users/Dabi/Documents/TVLens-GX10/copie-b
RUN=/Users/Dabi/Documents/TVLens-GX10/campagnes/mac-reference-01
CORPUS=/Users/Dabi/Documents/TVLens-GX10/corpus-fr
CONFIG=/Users/Dabi/Documents/TVLens-GX10/config/campagne.env
WHISPER=/Users/Dabi/Documents/TVLens-GX10/poids/ggml-base.bin
WHISPER_BIN=/opt/homebrew/bin/whisper-cli
FFMPEG=/opt/homebrew/bin/ffmpeg
CODEX_BIN=/opt/homebrew/bin/codex
cd "$COPY"
git -C "$COPY" rev-parse HEAD > "$RUN/sha.txt"
git -C "$COPY" status --porcelain=v1 > "$RUN/etat-code.txt"
git -C "$COPY" diff --binary HEAD > "$RUN/code.diff"
node --version > "$RUN/node-version.txt"
shasum -a 256 "$WHISPER" "$WHISPER_BIN" "$FFMPEG" > "$RUN/outils-poids.sha256"
```

Les dossiers `RUN`, `CORPUS` et le parent de chaque sortie sont préparés avant ces commandes.
Adapter tous les chemins absolus sur GX10 et les inscrire dans la fiche ; ne pas reprendre les chemins
Mac comme preuves du GX10. Relever le SHA/tag de la copie, les différences et les fichiers non suivis
pertinents ; un rapport `dirty` ou une liste partielle de sources ne prouve pas un gel intégral.
L’orchestrateur conserve le manifeste complet de la copie et vérifie l’égalité avec la répétition.

Un worktree isole le code, **pas les données ni les poids absents du checkout**. Un lancement Electron
ordinaire de la copie utilise le `userData` partagé : si un cache existe et que le chiffrement est
accessible, l’import réécrit `provider.enc`, même si le fichier demandé manque ou est vide. Les sessions
rejoignent la bibliothèque habituelle. Le seul mode smoke isole automatiquement `userData` ; ce mode
simulé ne constitue pas la campagne réelle. Ne pas lancer Electron pour les commandes G1–G3.
Le `--root` de `replay-lg-stream.cjs` sélectionne des sources, sans garantir cette isolation.

G1 utilise son runner sans bibliothèque Electron ; G3 crée son serveur loopback sur port éphémère,
avec `data/`, sessions et budgets sous sa sortie neuve. Si l’opérateur utilise un serveur séparé,
il doit lui donner les deux chemins absolus et une racine différente de toute installation habituelle :

```sh
TVLENS_SERVER_DATA="$RUN/serveur-isole" TVLENS_CONFIG="$CONFIG" \
  TVLENS_USAGE_DIR="$RUN/serveur-isole/usage" TVLENS_BIND=127.0.0.1 TVLENS_PORT=8789 node "$COPY/server/main.cjs"
```

Cette alternative réelle n’a pas été lancée. Ne jamais recopier jetons ou identifiants dans les rapports.
Les chemins d’entrée CLI sont absolus ; à l’intérieur des manifestes, index et scénarios, les références
sont au contraire relatives au document, descendantes, sans `..`, avec SHA-256 exact.

## Choisir chaque rôle explicitement

Le fichier `CONFIG` d’une campagne réelle contient, par exemple, les choix suivants. Remplacer les
noms des modèles de questions et d’embeddings par des modèles préalablement validés par l’opérateur ;
ces deux noms sont des marqueurs, pas des recommandations. Aucun modèle n’est téléchargé ici.

```dotenv
TVLENS_WHISPER_MODEL=/Users/Dabi/Documents/TVLens-GX10/poids/ggml-base.bin
TVLENS_WHISPER_BINARY=/opt/homebrew/bin/whisper-cli
TVLENS_WHISPER_THREADS=2
TVLENS_WHISPER_AUDIO_CTX=0
TVLENS_FFMPEG=/opt/homebrew/bin/ffmpeg
TVLENS_PERCEPTION_BACKEND=local
TVLENS_LOCAL_VLM_URL=http://127.0.0.1:11434
TVLENS_LOCAL_VLM_MODEL=gemma3:4b
TVLENS_LOCAL_VLM_NUM_CTX=8192
TVLENS_LOCAL_VLM_KEEP_ALIVE=10m
TVLENS_LOCAL_VLM_THINK=default
TVLENS_QUESTIONS_BACKEND=local
TVLENS_LOCAL_QUESTIONS_URL=http://127.0.0.1:11434
TVLENS_LOCAL_QUESTIONS_MODEL=MODELE_QUESTIONS_VALIDE
TVLENS_LOCAL_QUESTIONS_NUM_CTX=8192
TVLENS_LOCAL_QUESTIONS_KEEP_ALIVE=10m
TVLENS_LOCAL_QUESTIONS_THINK=default
TVLENS_LOCAL_WEB_BACKEND=searxng
TVLENS_LOCAL_WEB_URL=http://127.0.0.1:8888
TVLENS_LOCAL_WEB_TRIGGER=auto
TVLENS_EMBEDDINGS_BACKEND=local
TVLENS_LOCAL_EMBEDDINGS_URL=http://127.0.0.1:11434
TVLENS_LOCAL_EMBEDDINGS_MODEL=MODELE_EMBEDDINGS_VALIDE
TVLENS_LOCAL_EMBEDDINGS_TIMEOUT_MS=30000
TVLENS_INSPECTION_BACKEND=local
TVLENS_VISION_DURING_ASK=1
TVLENS_BACKGROUND_INDEX=1
```

| Rôle | Valeurs et réglages admis | Refus et limites |
| --- | --- | --- |
| Perception | `TVLENS_PERCEPTION_BACKEND=codex` (défaut) ou `local` ; `TVLENS_LOCAL_VLM_*` | Choix inconnu/incomplet refusé. |
| Questions T263/T267 | `TVLENS_QUESTIONS_BACKEND=codex` (défaut) ou `local` | `TVLENS_LOCAL_QUESTIONS_*` ; aucun repli distant. |
| Embeddings T264 | `TVLENS_EMBEDDINGS_BACKEND=local`, `openrouter` ou `disabled` | `openrouter` exige une clé ; backend inconnu refusé. |
| Inspection | `TVLENS_INSPECTION_BACKEND=codex` (défaut) ou `local` | Agent propre ; conflit avec simulation refusé ; aucun repli en cas d'échec local. |
| Modèle de réexamen local | `TVLENS_LOCAL_INSPECTION_MODEL` et `_URL` | Modèle absent : tous les réglages `TVLENS_LOCAL_VLM_*` restent utilisés. Modèle présent : URL propre requise et validée ; aucun héritage des réglages de perception. |
| Paramètres de réexamen local | `TVLENS_LOCAL_INSPECTION_NUM_CTX`, `_KEEP_ALIVE`, `_TOKEN` | Facultatifs ; mêmes règles que la perception. Diagnostic : modèle et hôte réellement sélectionnés. |
| Raisonnement perception | `TVLENS_LOCAL_VLM_THINK=default`, `on` ou `off` | Utilisé aussi par le réexamen sans modèle dédié ; autre valeur refusée, réglage nommé. |
| Raisonnement réexamen dédié | `TVLENS_LOCAL_INSPECTION_THINK=default`, `on` ou `off` | Indépendant de la perception ; valeur invalide refusée avec le nom du réglage. |
| Raisonnement questions | `TVLENS_LOCAL_QUESTIONS_THINK=default`, `on` ou `off` | Indépendant du réglage VLM. |
| Web des questions locales | `TVLENS_LOCAL_WEB_BACKEND=corpus` (avec `TVLENS_LOCAL_WEB_CORPUS`) ou `searxng` (avec `TVLENS_LOCAL_WEB_URL`) ; `TVLENS_LOCAL_WEB_TRIGGER=auto` (défaut), `always` ou `model` | Absent ou vide : aucune récupération. Backend inconnu, dossier ou URL manquant, URL non http(s) ou avec identifiants, déclencheur inconnu : refus `TVLENS_LOCAL_WEB_CONFIG_INVALID` au démarrage, sans la valeur. Sans effet avec les questions Codex. |

Pour ces réglages de raisonnement, `default` ou l’absence omet le champ `think` de `/api/chat` ; le modèle
garde son défaut. `on` transmet `think:true`, `off` transmet `think:false`, à chaque tour, y compris
après un outil ou une redemande de langue. Une variable vide garde le choix importé, comme les
autres réglages. Ces choix persistent avec le fichier importé ; l’environnement reste prioritaire.
La prise en charge dépend du modèle et de la version d’Ollama
([documentation du raisonnement](https://docs.ollama.com/capabilities/thinking)) : l’identité publie
la demande envoyée, sans prétendre prouver que le fournisseur l’a honorée.

Consigner `think` depuis `metrics.backend` en perception, le diagnostic d’inspection, et
`job.metrics.backend.identity` pour les questions. `default` désigne une omission, jamais un booléen
déduit. Quand `message.thinking` est une chaîne, seul son nombre de caractères est publié dans
`metrics.thinkingChars` (ou `job.metrics.thinkingChars`) : total des tentatives de langue ou des
tours d’outils de l’appel. Une chaîne vide donne zéro ; un champ absent ou non textuel ne fournit
aucune mesure. Le texte de raisonnement n’est ni publié ni renvoyé au modèle. Les embeddings
n’ont aucun réglage de raisonnement et leurs requêtes restent sans champ `think`.

Pour perception/questions/inspection locales : URL `http(s)` sans identifiants, modèle non vide,
`NUM_CTX` entier strictement positif si fourni. `KEEP_ALIVE` est transmis tel quel au fournisseur,
avec `10m` par défaut ; il n’est pas validé comme une durée par le chargeur. Consigner sa valeur
réellement acceptée. Les jetons facultatifs `TVLENS_LOCAL_VLM_TOKEN`, `TVLENS_LOCAL_INSPECTION_TOKEN`, `TVLENS_LOCAL_QUESTIONS_TOKEN`,
`TVLENS_LOCAL_EMBEDDINGS_TOKEN` viennent du fichier privé ou de l’environnement ; ils ne sont pas
persistés dans le cache. Le transport partagé refuse notamment les retours ligne dans les jetons.
Le timeout embeddings est un entier de 1 à 2 147 483 647 ms, défaut 30 000 ; ce budget fournisseur
est distinct de l’attente bornée de la recherche. Les embeddings n’ont pas de réglage produit `NUM_CTX`/`KEEP_ALIVE` :
`/api/embed` transmet `truncate:false`. Les mentionner « non applicable » dans la fiche.

L’environnement prime sur le fichier importé ; les sélections de fichier persistent dans le cache
Electron chiffré. Sans choix embeddings, le comportement historique dépend de la présence d’une clé
OpenRouter : l’expérience doit donc toujours fixer ce choix. Le choix des questions ne choisit ni
recherche ni inspection. Sans `TVLENS_LOCAL_WEB_BACKEND`, les questions locales n’ont que les trois outils
vidéo existants, sans web, et une demande de source externe reçoit une limite explicite. Avec lui, une question
qui appelle le web (ou toutes, avec `TVLENS_LOCAL_WEB_TRIGGER=always`) reçoit d’abord les pages récupérées, et
seules les sources tirées de ces pages sont acceptées. Avec `TVLENS_LOCAL_WEB_TRIGGER=model`, le modèle des questions
décide d’abord, par un appel court sans outil (au plus 5 s), s’il faut chercher et écrit la requête à partir de la
question et des trois passages récents ; la réponse garde la question du spectateur. Si cet appel échoue ou rend une
décision inutilisable, la règle de `auto` décide sur la question brute. Cet appel compte comme une requête au
modèle. SearXNG (`searxng`) sort de la machine pour chercher et
ouvrir les pages : une campagne qui l’exerce est **hybride** ; le corpus figé (`corpus`) reste local. Le web de
surveillance reste distant,
avec détection Codex actuelle distincte. Relever ces deux rôles même s’ils sont non exercés.
Un rôle distant, dont un chat Codex, rend la campagne **hybride** ; ne pas l’annoncer « tout local ».

`gemma3:4b` reste le candidat initial de perception du PRD. `num_ctx=8192`, `keep_alive=10m` sont
les paramètres explicites de départ de cet exemple, à vérifier sur les entrées réelles ; ils ne
garantissent pas la capacité du contexte. Ne pas présumer ses capacités d’outils ou d’embeddings.
L’inspection partage ici son modèle/configuration avec la perception, mais doit être exercée et
jugée séparément. Les identités modèle/version/digest de chaque rôle restent à relever ou inconnues.

T264 refuse la réutilisation d’un index d’une autre identité : backend, modèle, paramètres et
révision définissent l’espace vectoriel, même si les dimensions sont identiques. Un tag local ne
prouve pas les poids ; l’instance Ollama reçoit une révision propre et reconstruit à la demande
après réouverture. Un changement annoncé de modèle condamne l’index (`TVLENS_EMBEDDINGS_IDENTITY_CHANGED`).
Un remplacement de poids non annoncé sous le même tag reste indétectable : les garder fixes durant
la campagne. Garder les diagnostics, l’identité du modèle de l’index et le mode lexical éventuel.

## Corpus commun, conversion et annotations

Le propriétaire fournit les extraits réels ; les fixtures suivantes sont fictives. Couvrir au moins
parole, geste bref, ordre inversé, répétition et preuve absente des images. Ajouter les cas critiques
de préfixe causal, futur interdit, trou, preuve tardive et provenance de source de la grille G2.
Conserver le média source, les temps, les images effectivement sélectionnées, l’audio et les empreintes.
Comparer les backends avec les mêmes entrées, transcript, contexte admissible, mode allégé et paramètres
hors backend. Déclarer chaque rôle qui change ; ne pas attribuer au seul modèle une différence de source.

Le manifeste de perception G1 accepte des médias avec data URL et la perception retient au plus
**six images Mac** (puis première/médiane/dernière en mode allégé). Le corps HTTP G3 exige des blocs
de **10 s au plus**, **une à cinq images base64 sans préfixe**, au plus 1 500 000 octets par image
et **2 100 000 octets audio WAV décodés**. Le runner refuse six images au lieu de les réduire.
Déclarer toute sélection, indices et temps ; un geste absent des images ne devient pas une erreur
de reconnaissance. La référence facultative `perception` de l’index vérifie cette sélection.

La chaîne T262 est : fichier vidéo → conversion → validation de `preparation.json` → validation
`manifest.json` → T257. En parallèle : `blocks.json` → validation du scénario/index → T259.
Les formats `manifest.json` et `blocks.json` restent distincts ; ne pas passer l’un à la place de l’autre.
La conversion crée JPEG 1280×720 au plus et WAV PCM mono 16 kHz ; positions équidistantes, fin exclue.
Elle conserve chemins, empreinte source, version/arguments ffmpeg, paramètres, intervalle source et durée
réellement convertie dans `preparation.json`. Une préparation incomplète est refusée, sans réparation implicite.

**Commandes opérateur non exécutées**, pour un fichier existant et le ffmpeg configuré :

```sh
VIDEO=/Users/Dabi/Documents/TVLens-GX10/sources/emission-fr.mp4
PREP=/Users/Dabi/Documents/TVLens-GX10/corpus-fr/video-preparee
TVLENS_FFMPEG="$FFMPEG" node "$COPY/scripts/prepare-video-replay.cjs" \
  --file "$VIDEO" --out "$PREP" --start-ms 0 --duration-ms 1800000 \
  --block-ms 10000 --frames 5 --jpeg-quality 3 --config "$CONFIG"
node "$COPY/scripts/prepare-video-replay.cjs" --validate --out "$PREP"
node "$COPY/scripts/replay-local-perception.cjs" --manifest "$PREP/manifest.json" \
  --out "$RUN/video-validation" --backend local --validate
```

La durée demandée ne rallonge pas une source courte. Déclarer vidéo continue, extrait court ou boucle,
durée unique et durée du calendrier. Trente minutes de boucle ne font pas trente minutes inédites.
Une **vidéo convertie** ne mesure ni capture LG ni pertes avant livraison. Une vraie session TV reste
le **témoin** de fidélité ; sans elle, fidélité LG non testée. La capture LG est hors de T262.
Le convertisseur ne transcrit pas : transcript vide/inconnu et contexte `null`, sauf apport documenté.
Pour G1, la langue/provenance du transcript apporté est conservée ; pour G3, régler chaque clip
`language: fr`, `en` ou `auto` et conserver accusé et langue effective. Préférer une langue par campagne
soutenue : changer le réglage global au-dessus d’audios en attente peut rendre la campagne incomplète.

### Grille humaine à figer avant G1

Préparer `attendus.json` séparément du manifeste, des transcriptions et des requêtes, avant les deux
inférences. La [spécification G2](../scripts/perception-replay-scoring.md) donne les schémas complets.
Format des attendus : `version:1`, `manifestSha256`, `cases:[{id,expected,reason,citations}]`, une ligne
par cas ; chaque citation vaut `{id,startMs,endMs}`. Renseigner l’empreinte avec `shasum -a 256` sur
les octets exacts du manifeste. Ne jamais injecter ces attendus dans le contexte ou le transcript.

Après chaque campagne, l’humain écrit une revue propre : `version`, `manifestSha256`,
`annotationsSha256`, `reportSha256`, `runId`, `reviewer`, puis `cases`. Chaque ligne porte
`id`, `status:reviewed`, `reason`, `dimensions` et `citations`. Chaque dimension contient `value`
et `reason`, même pour `na` : exactitude, invention, ordre, preuves images/paroles, description,
abstention, références, causalité et provenance. Une ligne `unreviewed` explique la non-revue ;
une omission reste non évaluée. L’annotation source et la revue d’une sortie restent deux documents.
Le runner G1 reçoit `--annotations` et n’enregistre que l’empreinte avant construction du fournisseur.
Sans cette preuve d’antériorité, G2 refuse la campagne ; ne pas compléter un ancien rapport après coup.
Il n’existe pas de CLI autonome de création/validation des seuls attendus : la validation du scoreur
contrôle l’ensemble manifeste/attendus/rapport/revue. Les fixtures permettent de l’exercer sans inférence.

### Corpus web figé

Les essais reproductibles de la voie locale n’interrogent pas le web : ils lisent un corpus de pages déjà extraites
en texte, sur le disque local (`adapters/web/frozen-corpus.cjs`, port `WebRetrievalPort` de `core/ports.cjs`).
Une même question rend toujours les mêmes pages. Le flux réel, lui, passe par SearXNG sur la GX10.

Pour l’activer sur les questions locales :

```dotenv
TVLENS_LOCAL_WEB_BACKEND=corpus
TVLENS_LOCAL_WEB_CORPUS=/chemin/vers/corpus-web
TVLENS_LOCAL_WEB_TRIGGER=always
```

Dans un scénario de rejeu, la même récupération se déclare dans `config.localWeb`, par exemple
`{"backend": "corpus", "corpus": "web/corpus"}` ; le chemin du corpus y est relatif au dossier du scénario,
descendant, sans `..`. Dans le rapport, `webRetrieval` ne porte ni chemin ni URL ; la copie du scénario
dans `parameters` garde le chemin relatif du corpus et l'URL déclarée, jamais un chemin complet ni une URL
avec identifiants (voir `scripts/local-stream-replay.md`).

Le dossier du corpus contient `corpus.json` et les fichiers de texte :

```json
{
  "version": 1,
  "documents": [
    {
      "url": "https://www.example.org/volcans/etna",
      "title": "Le volcan Etna",
      "publisher": "Revue de géologie imaginaire",
      "publishedAt": "2024-03-02",
      "file": "pages/etna.txt",
      "queries": ["Quelle est la hauteur du volcan Etna ?"]
    }
  ]
}
```

- `url`, `title` et `file` sont obligatoires ; `publisher`, `publishedAt` et `queries` sont facultatifs.
- `url` doit être une adresse publique que `sourceKey` (`adapters/external-links.cjs`) accepte : https, sans
  identifiants, sans IP ni domaine local. Elle est rendue sans son fragment. Une page dont l’adresse est refusée,
  qui répète une adresse déjà vue (la première gagne) ou dont le texte est vide est écartée.
- `file` est un chemin relatif sous le dossier du corpus, vers le texte UTF-8 de la page : ni chemin absolu, ni
  `..`, ni antislash.
- `queries` liste des questions exactes que la page traite.

Récupération, pour une question :

1. La requête est nettoyée (espaces réduits, longueur bornée) puis comparée sans casse ni accents aux `queries`.
   C’est la question brute avec les déclencheurs `auto` et `always`, mais la requête écrite par le modèle avec
   `model` : elle ne retrouve alors les `queries` que si elle les reprend, sinon le classement par mots s’applique.
   Si des pages la déclarent, elles sont rendues dans l’ordre du corpus.
2. Sinon, les pages sont classées par le nombre de mots distincts de la requête (hors mots vides, au moins trois
   lettres) qui figurent dans leur titre ou leur texte. Deux mots communs au moins sont exigés (un seul pour une
   requête d’un seul mot) ; à score égal, l’ordre du corpus décide.
3. Au plus trois pages sont rendues, chacune coupée à 20 000 caractères. L’agent local n’en donne au modèle que le
   début (1 000 caractères) et la fenêtre de 1 500 caractères qui recoupe le mieux la question et la requête.
   Les coupes et l’absence de page sont signalées dans `limits`.

Le corpus et tous les fichiers de texte sont lus une fois, à la première récupération. Un corpus illisible ou invalide
(JSON, version, champ manquant, chemin refusé, fichier absent) est refusé avec le code `TVLENS_WEB_CORPUS_INVALID`,
sans chemin dans le message.

Le dépôt GitHub est public : les pages réelles d’un corpus d’essai (texte extrait de sites tiers) restent hors de Git,
dans le dossier de l’opérateur. Les tests n’utilisent que des pages inventées, sur des domaines `example.org` ou `example.com`.

## Commandes vérifiées sans fournisseur

Avec les variables `CODE`, `CHECK`, `FIXTURES` du contrôle local :

```sh
node "$CODE/scripts/replay-local-perception.cjs" --help
node "$CODE/scripts/score-perception-replay.cjs" --help
node "$CODE/scripts/replay-local-stream.cjs" --help
node "$CODE/scripts/prepare-video-replay.cjs" --help
node "$CODE/scripts/bench-whisper.cjs" --help
node "$CODE/scripts/replay-local-perception.cjs" \
  --manifest "$FIXTURES/perception-replay/manifest.json" \
  --out "$CHECK/g1-validation" --backend local --validate
node "$CODE/scripts/score-perception-replay.cjs" \
  --manifest "$FIXTURES/perception-replay/manifest.json" \
  --annotations "$FIXTURES/perception-replay-scoring/annotations.json" \
  --report "$FIXTURES/perception-replay-scoring/campaign.json" \
  --review "$FIXTURES/perception-replay-scoring/review.json" --validate
node "$CODE/scripts/score-perception-replay.cjs" \
  --manifest "$FIXTURES/perception-replay/manifest.json" \
  --annotations "$FIXTURES/perception-replay-scoring/annotations.json" \
  --report "$FIXTURES/perception-replay-scoring/campaign.json" \
  --review "$FIXTURES/perception-replay-scoring/review.json" > "$CHECK/notation-fictive.json"
node "$CODE/scripts/replay-local-stream.cjs" --scenario "$FIXTURES/local-stream/nominal.json" \
  --out "$CHECK/g3-nominal-validation" --validate
node "$CODE/scripts/replay-local-stream.cjs" --scenario "$FIXTURES/local-stream/overload.json" \
  --out "$CHECK/g3-overload-validation" --validate
```

Préparation maîtrisée réellement exécutée : mire et sinus synthétiques de 2,5 s, sans parole ni modèle.
Le fichier `empty.env` est vide, préparé sous `CHECK`, sans lecture de configuration personnelle.

```sh
/opt/homebrew/bin/ffmpeg -version
/opt/homebrew/bin/ffmpeg -nostdin -v error \
  -f lavfi -i 'testsrc2=size=1600x900:rate=10:duration=2.5' \
  -f lavfi -i 'sine=frequency=440:sample_rate=48000:duration=2.5' \
  -c:v mpeg4 -q:v 3 -c:a pcm_s16le "$CHECK/synthetic.mkv"
TVLENS_FFMPEG=/opt/homebrew/bin/ffmpeg node "$CODE/scripts/prepare-video-replay.cjs" \
  --file "$CHECK/synthetic.mkv" --out "$CHECK/prepared" --start-ms 250 \
  --block-ms 1000 --frames 2 --jpeg-quality 3 --config "$CHECK/empty.env"
node "$CODE/scripts/prepare-video-replay.cjs" --validate --out "$CHECK/prepared"
node "$CODE/scripts/replay-local-perception.cjs" --manifest "$CHECK/prepared/manifest.json" \
  --out "$CHECK/converted-validation" --backend local --validate
```

Ce fragment vérifié prépare le calendrier court de la conversion synthétique. Il reprend les choix
explicites du nominal fictif ; ses modèles restent des marqueurs, utilisables en validation seulement.
Les questions sont ramenées à la durée acquise, en conservant la rafale. Cette préparation ne qualifie
pas G3. Pour le corpus réel, utiliser le même format avec trente minutes et douze questions réparties ;
remplacer les modèles et fixer contexte/résidence, puis figer le scénario avant les campagnes comparées.

```sh
node - "$CHECK/prepared" "$FIXTURES/local-stream/nominal.json" <<'NODE'
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const [root, nominal] = process.argv.slice(2);
const read = name => fs.readFileSync(path.join(root, name));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const state = JSON.parse(read('preparation.json'));
const index = JSON.parse(read('blocks.json'));
const scenario = JSON.parse(fs.readFileSync(nominal));
const previousDuration = scenario.plannedDurationMs;
scenario.index = { path: 'blocks.json', sha256: hash(read('blocks.json')) };
scenario.provenance = { kind: 'converted-video', reference: 'Mire synthétique, fidélité LG non testée.',
  preparation: { path: 'preparation.json', sha256: hash(read('preparation.json')) } };
scenario.plannedDurationMs = state.convertedDurationMs;
scenario.clips = index.blocks.map((block, i) => ({ id: 'clip-' + i, block: i,
  occurrence: 0, atMs: block.startMs, language: 'fr' }));
scenario.questions = scenario.questions.map(question => ({ ...question,
  atMs: Math.floor(question.atMs * state.convertedDurationMs / previousDuration) }));
fs.writeFileSync(path.join(root, 'scenario.json'), JSON.stringify(scenario, null, 2), { flag: 'wx' });
NODE
```

Pour une répétition de source courte, déclarer `loop:true` et chaque occurrence ; ne pas simplement
allonger la durée planifiée. Les champs et le fragment de préparation depuis des captures conservées
sont dans le contrat G3 lié plus haut. La commande suivante valide aussi l’index des corps convertis :

```sh
node "$CODE/scripts/replay-local-stream.cjs" --scenario "$CHECK/prepared/scenario.json" \
  --out "$CHECK/converted-stream-validation" --validate
```

## Exécuter G1 puis noter G2 — opérateur uniquement

Avant ces commandes non exécutées ici : copie identifiée, corpus/annotations figés, outils et accès
privé opérationnels, modèles attestés, charge concurrente arrêtée, fiche commencée et protocole froid/chaud
préparé. Les deux backends reçoivent le même manifeste et les mêmes attendus.

```sh
node "$COPY/scripts/replay-local-perception.cjs" --manifest "$CORPUS/manifest.json" \
  --annotations "$CORPUS/attendus.json" --out "$RUN/g1-local-froid" \
  --backend local --execute --url http://127.0.0.1:11434 \
  --model gemma3:4b --num-ctx 8192 --keep-alive 10m
node "$COPY/scripts/replay-local-perception.cjs" --manifest "$CORPUS/manifest.json" \
  --annotations "$CORPUS/attendus.json" --out "$RUN/g1-local-chaud" \
  --backend local --execute --url http://127.0.0.1:11434 \
  --model gemma3:4b --num-ctx 8192 --keep-alive 10m
node "$COPY/scripts/replay-local-perception.cjs" --manifest "$CORPUS/manifest.json" \
  --annotations "$CORPUS/attendus.json" --out "$RUN/g1-codex-reference" \
  --backend codex --execute --model gpt-6-luna --codex-binary "$CODEX_BIN"
```

`gpt-6-luna` est ici la référence Codex explicitement choisie pour G1/G2 ; l’opérateur confirme sa
disponibilité et consigne l’identité effective. Ne jamais la compter comme locale. G1 n’appelle pas
Whisper : il utilise le transcript déclaré, un agent neuf par cas et les seules entrées du manifeste.
Les durées sont celles du composant, sans capture, files du produit ou rendu des cartes.

Pour le froid, l’opérateur consigne l’absence effective de résidence avant la première requête,
les modèles/processus concurrents arrêtés, la méthode de libération et les horodatages. Si cette preuve
manque, état **inconnu**. Après un échauffement identifié dont on conserve la sortie, rejouer à chaud
pendant la résidence constatée, mêmes entrées et paramètres, avec dossier neuf. Documenter si le froid
concerne seulement le premier cas et les suivants deviennent chauds. Ne pas déduire froid/chaud d’un
seuil arbitraire de `loadMs` : `modelState` reste `unknown`, même avec une durée de chargement annoncée.
Pour Codex, relever connexion/fil et `coldStart` séparément ; aucun contrôle des poids distants n’est présumé.

Lire `clientTimings.queueMs` (attente cliente d’agent), `clientTimings.requestMs` (jusqu’au corps complet),
`providerTimings.rawNs` (durées annoncées en ns), leurs conversions et `modelState`. `visionMs` inclut
le transport et ne mesure pas le réseau pur. Les éventuelles deux tentatives de langue partagent le budget
client ; les durées fournisseur ne décrivent que la dernière réponse. Conserver diagnostics d’erreur
et compte de tentatives. Séparer file produit, attente cliente, aller-retour et temps fournisseur sans
soustractions présentées comme mesure réseau. Après annulation, observer l’occupation jusqu’à la fin
effective du calcul distant : l’abandon HTTP et la fermeture cliente ne prouvent pas la libération GPU.

Après revue humaine de chaque sortie, ces commandes **hors ligne**, applicables aux preuves réelles
mais non exécutées sur elles ici, valident et comparent :

```sh
node "$COPY/scripts/score-perception-replay.cjs" --manifest "$CORPUS/manifest.json" \
  --annotations "$CORPUS/attendus.json" --report "$RUN/g1-local-chaud/campaign.json" \
  --review "$RUN/revue-locale.json" --validate
node "$COPY/scripts/score-perception-replay.cjs" --manifest "$CORPUS/manifest.json" \
  --annotations "$CORPUS/attendus.json" --report "$RUN/g1-local-chaud/campaign.json" \
  --review "$RUN/revue-locale.json" --reference-report "$RUN/g1-codex-reference/campaign.json" \
  --reference-review "$RUN/revue-codex.json" > "$RUN/comparaison-g2.json"
```

Revoir chaque régression de causalité/provenance, chaque invention de geste, baisse de couverture,
perte et cas non apparié/non revu. `na` et `unknown` ne sont pas des réussites ; abstention justifiée
et réponse correcte sont comptées séparément. Une moyenne ne masque pas une violation individuelle.
Les seuils exploratoires du PRD (20 %, 10 %) ne décident pas automatiquement l’acceptation ; l’opérateur
choisit de conserver ou refuser le backend avec sa justification. Une inspection non exercée reste non testée.

## G3 soutenu et bilan — opérateur uniquement

Préparer `scenario-local.json` et `scenario-codex.json` à côté du corpus, conformément au nominal
livré. Le scénario exige les quatre sélections `config.perceptionBackend`, `questionsBackend`,
`embeddingsBackend`, `inspectionBackend` ; `localVlm`, `localQuestions`, `localEmbeddings` reprennent
les paramètres explicites ci-dessus. `selectedModels` fixe `observationModel:"gpt-6-luna"`,
`inspectionModel:"gpt-6-luna"`, `codexModel:"gpt-6"` pour la référence Codex G3. Dans cette référence,
passer perception/questions/inspection à `codex`, conserver embeddings et tous les autres paramètres
identiques pour isoler ces trois changements, ou déclarer précisément une autre comparaison.
Le scénario prime sur le fichier pour les rôles ; `--config` fournit outils et secrets, sans les copier
au scénario. Un rôle jamais appelé n’est pas une mesure locale même s’il est sélectionné.

```sh
node "$COPY/scripts/replay-local-stream.cjs" --scenario "$CORPUS/scenario-local.json" \
  --out "$RUN/g3-validation" --validate
node "$COPY/scripts/replay-local-stream.cjs" --scenario "$CORPUS/scenario-local.json" \
  --out "$RUN/g3-local" --config "$CONFIG" --execute
node "$COPY/scripts/replay-local-stream.cjs" --scenario "$CORPUS/scenario-codex.json" \
  --out "$RUN/g3-codex" --config "$CONFIG" --execute
node "$COPY/scripts/replay-local-stream.cjs" --scenario "$CORPUS/scenario-surcharge.json" \
  --out "$RUN/g3-surcharge" --config "$CONFIG" --execute
```

Ces exécutions réelles sont non testées ici. Trente minutes sont requises pour la tenue G3 :
le nominal fictif valide un calendrier de 1 800 000 ms, 225 blocs de huit secondes bouclés et douze
questions avec une rafale de trois ; sa validation n’attend pas trente minutes. La surcharge séparée
prévoit huit questions simultanées : un actif, cinq attentes, surplus refusé, sans augmenter le plafond.
Conserver FIFO, annulation, rejets, retards, attentes restantes et bornes de vidage/fermeture du runner,
qui restent distinctes des délais produit. Une campagne `complete` ne signifie pas G3 accepté.

Le bilan T261 est déjà dans `campaign.json`, sans CLI supplémentaire :

- `journal.revisions` conserve les versions de passages ; `journal.httpStates` les lectures HTTP
  échantillonnées. Elles n’ont pas la même révision ni la même exhaustivité.
- `journal.samples` relève chaque seconde retard et âges des preuves ; âge depuis publication et
  âge du contenu sont distincts. Les horloges de session, murales et durées fournisseur restent séparées.
- `summary.coverage` prend l’union reçue/audio réussie/vision réussie sur **toute la fenêtre planifiée**,
  début et fin compris. `journal.losses`, `summary.losses` et `summary.lossCounters` séparent faits,
  causes/durées et compteurs produit. Ne pas sommer les compteurs relus ni se limiter aux 40 derniers passages.
- `consultation` et `journal.productGaps` conservent les trous produit à 250 ms, distincts des
  `captureGaps` HTTP à 1 000 ms ; un retard final nul ne comble pas un trou.
- `summary.roles` conserve sélection, identité, paramètres, invocation et qualification ; le mode
  lexical et la provenance des réexamens en cache restent visibles. Une réponse après fermeture,
  `afterClose:true`, ne devient pas acquise ; vérifier `questions[].acquired`.
- `questions[].latency` sépare accusé HTTP et résultat reçu par sondage, pas réseau pur ni premier
  token. Avant T240, l’attente agent n’est pas isolée ; le champ inconnu reste `null`.
- `shutdown.archiveConfirmed` et `shutdown.releaseConfirmed` sont deux preuves distinctes.
  Un timeout ou une interruption laisse le bilan partiel, les fichiers acquis et les diagnostics.

L’opérateur collecte **CPU/RAM/GPU horodatés pendant toute la campagne**, avant, durant et après
annulation/fermeture, avec fréquence et outil consignés ; examiner dérive et concurrence, pas seulement
mémoire annoncée. La vérification du backend GPU effectif appartient à l’opérateur et doit garder
sa sortie brute. Aucun « GPU » ne se déduit du nom du modèle ou de la présence d’une carte.
Le runner ne prouve ni affichage d’une carte sur les clients, ni qualité d’une inspection non exercée :
recette visuelle Mac/TV et revue d’inspection restent hors boucle.

## Banc Whisper séparé

Seule l’aide a été exécutée ici. Le banc n’a aucun mode validation seule : `--no-text` retire le texte
du rapport mais calcule bien les transcriptions. Commande réelle **non exécutée**, réservée à l’opérateur
avec WAV conservés, poids et binaire existants, langue de chaque extrait fixée (`fr`, `en` ou `auto`) :

```sh
node "$COPY/scripts/bench-whisper.cjs" --model "$WHISPER" --binary "$WHISPER_BIN" \
  --language fr --threads 2,4 --audio-ctx 0,512,auto --repeats 3 --no-text \
  --out "$RUN/whisper.json" "$CORPUS/audio/extrait-fr.wav"
```

Relever version/empreinte du binaire, poids multilingues, threads, contexte, langue et backend GPU
réellement observé ; `--no-gpu` est une variante CPU explicite à consigner, sans conclure que son
absence garantit le GPU. La distance de mots compare des configurations au contexte complet du même
nombre de threads, **pas une vérité humaine de précision ASR**. Une évaluation ASR demande une
transcription humaine séparée. ASR résident et intégration Whisper GPU au produit restent hors périmètre.

## Fiche de campagne à remplir et décision

Copier cette fiche pour chaque machine, backend, répétition et état thermique/résidence. Écrire
`inconnu` pour une donnée indisponible et expliquer pourquoi ; aucun champ absent ne se déduit d’une mesure.
Conserver les fichiers bruts privés et leurs empreintes, même incomplets, avec les incidents.

| Champ | Valeur à renseigner et preuve |
| --- | --- |
| Campagne et responsabilité | Identifiant, opérateur, date UTC, G1/G2/G3, objectif, référence/candidat. |
| Copie | Chemin absolu, SHA/tag, état Git, diff, manifeste complet des sources, même SHA que répétition Mac. |
| Corpus | Chemins absolus vidéo/captures/médias/manifeste/index/scénario et empreinte SHA-256 de chacun. |
| Provenance | Vidéo convertie/capture TV témoin ; durée unique, durée réelle, boucle/occurrences et sélections déclarées. |
| Conversion | Outil/version/empreinte, arguments, paramètres, intervalle source, durée acquise, préparation complète/incomplète. |
| Attendus | Chemin et empreinte des annotations figées avant les deux inférences ; preuve `annotationsSha256`. |
| Rapport et revue | Chemins, `runId`, empreinte de rapport, identité du reviewer, empreinte de revue/notation/comparaison. |
| Versions | OS, Node, application/SHA, Codex, Ollama, ffmpeg, Whisper ; sortie de version brute ou inconnu. |
| Machine | Machine/CPU, mémoire annoncée, mémoire disponible au départ, GPU et backend effectivement observé. |
| Paramètres communs | Corpus, transcript/contexte et limites, langue `fr/en/auto`, sélection d’images, mode allégé. |
| Réglages de charge | Files/plafonds produit conservés, vision pendant questions, index de fond, délais du runner. |
| Froid/chaud | Méthode, état constaté avant chaque appel, échauffement, résidence/libération, heures et preuves. |
| Ressources | Fichier CPU/RAM/GPU horodaté sur toute la campagne, fréquence/outils, concurrence, dérive et fin du calcul distant. |
| Mesures | Attente cliente, aller-retour, durées fournisseur brutes, âges, retard, p50/p95 et taille d’échantillon. |
| Couverture/pertes | Intervalles sur toute la fenêtre, causes et durées des pertes par voie, trous, refus, annulations, non acquis. |
| Recette client | Carte effectivement affichée, fidélité LG, archives rouvertes, capture audio, inspection exercée et jugée ou non testé. |
| Fin et incidents | Codes, journaux/stdout/stderr, sorties partielles, archive confirmée, libération confirmée ou inconnue, écarts. |
| Décision | Statut ci-dessous, régressions revues, limites, justification opérateur, rôle(s) modifiés face à la référence. |

Remplir **une ligne distincte par rôle**, y compris ceux qui n’ont pas tourné.
État : exercé, non exercé, désactivé ou simulé ; toute identité absente reste inconnue :

| Rôle | Choix configuré | Backend effectif et identité modèle/version/digest ou poids | Paramètres | État et preuve |
| --- | --- | --- | --- | --- |
| Perception | à remplir | à remplir ou inconnu | `num_ctx`, `keep_alive`, température, `think` | exercé/non exercé/simulé |
| Questions | à remplir | à remplir ou inconnu | contexte/résidence, `think`, effort si distant | exercé/non exercé/simulé |
| Embeddings/recherche | à remplir | modèle/identité de l’index, révision/digest | troncature, timeout | état ; lexical/hybride |
| Inspection | à remplir | identité de l’appel ou origine du cache | VLM, `think`, sélection/stratégie | état ; cache ou appel |
| Transcription | à remplir | binaire/version/empreinte et poids | langue, threads, audio-ctx | exercé/non exercé/simulé |
| Surveillance : détection | Codex actuel ou non activé | à remplir ou inconnu | effort/workers configurés | exercé/non exercé |
| Surveillance : web | distant ou non activé | à remplir ou inconnu | paramètres connus ou inconnu | exercé/non exercé |

Les identités effectives viennent des métriques/diagnostics (`summary.roles`, `job.metrics.backend`,
`backend`, diagnostics d’inspection et de recherche), jamais du JSON revendiqué par le modèle.
Pour les digests et versions non acquis par ces frontières, l’opérateur garde le relevé de son backend
et des fichiers de poids ; sinon inscrire inconnu. `selectedModels` n’atteste pas à lui seul l’invocation.
Garder `campaign.json`, `uploads/`, `data/`, préparations, revues et sorties standard sans écraser les
preuves. Les `SIGINT`/`SIGTERM` conservent les états acquis ; une coupure brutale peut laisser `running`.

| Statut final | Conditions à expliquer dans le compte rendu |
| --- | --- |
| **validé sur GX10** | Preuves réelles du SHA retenu, G1/G2/G3, ressources, recette et décision opérateur favorables. |
| **fonctionnel mais qualité/débit insuffisants** | Contrat exécuté, régressions ou débit/qualité jugés insuffisants ; démo technique séparée possible. |
| **incompatible dans le budget** | Contrat ou accès/pile non exploitable dans le budget, sans migration supplémentaire. |
| **non testé** | Absence d’accès ou d’exécution ; nommer chaque rôle et vérification manquante. |
| **incomplet** | Interruption, preuve manquante, G3 raccourci ou campagne partiellement acquise ; garder le préfixe utile. |

Un p95 sur douze questions reste exploratoire. Les tests accélérés ne démontrent pas trente minutes
réelles ; une copie Mac réussie ne devient pas un GX10 validé. La décision de conserver le backend reste
à l’opérateur, après revue de chaque régression et des limites de fidélité, causalité et provenance.

## Relevé de vérification du guide

Le 18 octobre 2026 sur Mac, Node `v24.12.0`, ffmpeg `9.0.2`, base `0f0682d`,
commandes exactes et sorties conservées dans
`.harness-state/tickets/T260/commands.jsonl` et `offline-*.log` (hors Git). Les aides et validations
n’appellent aucun fournisseur ; les tests utilisent des doubles et des horloges contrôlées.

| Commande ou groupe ci-dessus | Résultat observé |
| --- | --- |
| Cinq aides, dont `bench-whisper --help` | Code 0 ; Whisper non lancé. |
| G1 validation de la fixture | Code 0, trois cas validés, aucune inférence. |
| G2 validation puis notation de fixture | Code 0, identités valides et agrégation fictive ; aucune validation de qualité réelle. |
| G3 nominal et surcharge en validation | Code 0, 225 et 7 envois planifiés ; calendrier non exécuté. |
| Conversion synthétique et validation T262 | Code 0, 2 250 ms acquis, trois blocs ; aucun modèle ni transcription. |
| Validation G1 de la conversion | Code 0, trois cas validés. |
| Calendrier dérivé et validation de son index converti | Code 0, trois envois planifiés sur 2 250 ms ; aucun appel. |
| Suites perception/notation/calendrier | 78 tests réussis, aucun échec ni ignoré ; séquentiel. |
| Suites vidéo/questions/embeddings/inspection/configuration | 107 tests réussis, aucun échec ni ignoré ; séquentiel. |
| Exemple dotenv via `loadConfig` avec environnement vide | Choix des quatre rôles et paramètres contrôlés ; aucun fournisseur construit. |
| `node --test tests/documentation-index.test.cjs` | 12 tests réussis ; liens locaux vérifiés aussi dans les quatre pages. |
| Huit recherches de contenu du ticket et `git diff --check` | Codes 0 ; sorties conservées, sans valeur de recette matérielle. |
| `node scripts/check.mjs --changed` | Vert. |
| `node scripts/check.mjs` | Vert : 2 883 tests JS et 47 tests Python réussis. |

Les vérifications de suites, liens et contenu sont consignées avec le ticket. Tout essai réel futur
laisse, boucle arrêtée, un dossier `experiments/essais/<date>-<sujet>/` (README, question, configuration
exacte, résultats bruts, scripts, lecture, limites et incidents), puis une ligne dans son index.
Répétition matérielle, gel/tag opérateur, mesures G1–G3 réelles et fidélité TV : **non testés ici**.
