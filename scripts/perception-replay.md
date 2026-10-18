# Rejouer les entrées de perception

`replay-local-perception.cjs` valide un corpus transportable, puis appelle la fabrique partagée
et `observeVisual()` uniquement avec `--execute`. Il conserve le prompt, les bornes de production
(six premières images, puis première/médiane/dernière en allégé), la validation et les métriques.
Chaque cas utilise un nouvel agent : son contexte vient exclusivement du manifeste. Whisper ne tourne pas.
Ce rejeu de composant ne mesure ni la capture LG, ni les files, ni une tenue de trente minutes.

## Commandes sans fournisseur

Depuis la racine du dépôt, avec un dossier de sortie neuf dont le parent existe :

```sh
node scripts/replay-local-perception.cjs --help
node scripts/replay-local-perception.cjs \
  --manifest scripts/fixtures/perception-replay/manifest.json \
  --out /tmp/perception-validation --backend local --validate
```

L'absence de `--execute` signifie aussi validation seule. Le backend est toujours obligatoire.
L'aide n'ouvre aucun fichier et ne construit aucun agent. La validation vérifie tous les cas avant
la construction du premier fournisseur ; un cas refusé empêche toute inférence de la campagne.
Le dossier doit être neuf : une seconde commande ne remplace jamais les preuves précédentes.

Les opérations réelles appartiennent à l'opérateur, après préparation du corpus et des annotations :

```sh
node scripts/replay-local-perception.cjs --manifest corpus/manifest.json \
  --out /tmp/perception-local --backend local --execute \
  --url http://127.0.0.1:11434 --model NOM_MODELE --num-ctx 8192 --annotations corpus/annotations.json
node scripts/replay-local-perception.cjs --manifest corpus/manifest.json \
  --out /tmp/perception-reference --backend codex --execute \
  --model NOM_MODELE_CODEX --annotations corpus/annotations.json
```

Aucun fournisseur de repli. Aucun paramètre de commande ni outil n'est déduit du corpus.
La référence Codex porte `backend: codex` et `reference: codex` ; elle ne compte jamais comme locale.
Les URL n'acceptent pas d'identifiants. Ce runner n'ajoute pas de mécanisme de configuration de secrets.

## Manifeste version 1

L'exemple exécutable de validation est [fixtures/perception-replay/manifest.json](fixtures/perception-replay/manifest.json).
Il contient trois cas fictifs : capture documentée, capture dont l'entrée est inconnue, vidéo convertie.
Les pixels et provenances sont des fixtures de format, aucune capture LG ni conversion réelle n'est revendiquée.

La racine contient `version: 1` et `cases`, liste non vide. Le marqueur `preparation` est facultatif.
Lorsqu'il est présent, toute valeur de `preparation.complete` autre que `true` entraîne le refus
`TVLENS_REPLAY_PREPARATION_INCOMPLETE` avant de créer une campagne ou un fournisseur : un préfixe de
conversion acquis ne constitue pas un corpus complet. Chaque cas possède :

| Champ | Contrat |
| --- | --- |
| `id` | Identifiant non vide, unique dans la campagne. |
| `startMs`, `endMs` | Temps de session, positifs ou nuls, fin strictement après début, durée maximale 60 s. |
| `media` | `{path, sha256}` : JSON média existant, chemin relatif sans `..`, SHA-256 des octets exacts. |
| `provenance` | Capture TVLens ou vidéo convertie, selon les formes ci-dessous. |
| `transcript` | `{text, availability, limits, provenance? , audioLimit?}`. |
| `context` | `{value, limits, provenance?, prefix?}` : `value: null` pour une entrée inconnue. |
| `lightweight` | `{value: booléen, source: saved-metrics ou explicit-default}`. Le défaut déclaré vaut `false`. |

Le JSON média garde exactement `{frames: [{atMs, dataUrl}], audio: base64 ou null, startMs, endMs}`.
Les images sont déjà ordonnées, dans l'intervalle (bornes incluses), sous forme `data:image/...;base64,...`.
Le runner ne les trie pas. Il lit le son et en conserve l'empreinte sans l'envoyer ni le transcrire.
Une empreinte image porte sur la chaîne `dataUrl` UTF-8 exacte ; l'empreinte audio porte sur les octets décodés.
Le JSON média entier est vérifié, y compris les images au-delà de la borne d'inférence.
Les fichiers média sont lus sans modification ; aucune collection privée de Mémoire n'est parcourue.

### Capture conservée

`provenance` vaut `{kind: tvlens-capture, sessionId, passageId}`. Copier le JSON média conservé
sans en changer les images, le son ou l'intervalle ; reporter son SHA-256 avec `shasum -a 256 fichier.json`.
Le runner vérifie que l'intervalle déclaré et celui du média coïncident.

L'opérateur copie les paroles uniquement depuis `observation.transcript` de l'archive et donne une
référence explicite (fichier, identifiant, champ). Une archive finale prouve ce texte final, pas sa disponibilité
au départ de la vision : `availability: unknown`, provenance `kind: archive-observation`, et limite explicite.
Une disponibilité `known` exige une trace d'entrée ou un apport documenté de l'opérateur (`input-trace` ou `operator`).
Une provenance contient toujours `kind` et `reference` non vide. Sans texte récupérable : `text: ""`,
`availability: unknown` ou `absent`, avec sa limite. L'inconnu reste inconnu dans le rapport.

`limits` décrit la fiabilité et les limites du rejeu ; il n'est pas envoyé comme incertitude audio d'origine.
Seul `audioLimit`, facultatif et justifié par une provenance `input-trace`, rejoint cette incertitude.
Ne jamais y recopier l'incertitude finale mêlant audio et vision. Son absence reste une absence.

Sans trace du contexte exact au départ de la vision : `context.value: null` et limite explicite.
Ne pas recopier les observations finales ni recalculer `perceptionContext`. Le runner ne le fait pas.
`lightweight.source: saved-metrics` correspond aux métriques archivées ; sinon déclarer
`{value: false, source: explicit-default}`. Aucune valeur inconnue n'est déduite d'une durée ou d'un résultat.

### Contexte fourni

Une provenance `input-trace` ou `operator` documente l'origine et la disponibilité de ce contexte.
`prefix` contient les passages admissibles `{id, startMs, endMs}`, en ordre, sans chevauchement,
tous terminés au plus tard au début du cas. Il constitue la borne vérifiable de cette entrée.
Aucun passage actuel ni identifiant hors de ce préfixe n'est autorisé.

`value` accepte les champs du contexte produit : `kind`, `previousTopic`, `previousTopicSummary`,
`activeTopic`, `recent`, `sessionOutline`, `limits`. Les champs inconnus sont refusés.
Les éléments de `recent` ou `activeTopic.recent` portent leurs identifiants et intervalles exacts du préfixe,
puis des chaînes facultatives `status`, `topic`, `summary`, `transcript`, `uncertainty`.
`activeTopic` contient `firstId`, `startMs` et `recent` ; son début correspond au passage du préfixe.
Le résumé cumulatif contient `text`, `firstId`, `lastId`, `startMs`, `endMs`, `pendingPassages` facultatif.
Les bornes correspondent aux passages nommés ; ses passages en attente suivent sa fin et restent dans le préfixe.
Les éléments de `sessionOutline` portent aussi leurs premières/dernières identités et bornes.
Les mêmes refus s'appliquent aux champs historiques que la perception n'envoie pas au modèle.
Les textes restent des données non vérifiées dans le prompt de production, sans autorisation d'outil.

### Vidéo convertie

`provenance` vaut `{kind: converted-video, sourceSha256, sourceInterval: {startMs, endMs}, conversion}`.
`conversion` contient `tool: ffmpeg`, `version` et `arguments`, liste de chaînes conservée comme donnée.
Aucun argument n'est exécuté par le lecteur. Le fichier source n'est pas requis pour transporter le corpus :
son empreinte est une déclaration du convertisseur, tandis que celle du JSON média est revérifiée ici.
L'intervalle source utilise l'horloge du fichier vidéo, distincte des temps de session du média.
Transcript et contexte restent vides avec leurs limites, sauf apport documenté selon les règles précédentes.
Une vidéo convertie ne démontre pas la fidélité à une capture LG : une vraie session TV reste son témoin.

## Sorties et interruption

`campaign.json` est écrit par remplacement atomique, avant le premier appel puis après chaque état et diagnostic.
Il conserve identité UUID, dates, version Node, plateforme, SHA Git et état modifié (`dirty`).
`code.diffSha256` porte sur les octets du diff des fichiers suivis par rapport à HEAD, lus en flux sans les accumuler.
`code.sources` contient les empreintes individuelles d'une liste explicite : les six modules du runner
(`replay-local-perception`, `perception-replay-input`, `perception-replay-context`, `perception-replay-execution`,
`perception-replay-cli`, `perception-replay-identity` sous `scripts/`, extension `.cjs`),
`runtime/session-providers.cjs`, `adapters/codex-perception.cjs` et `adapters/local-vlm-agent.cjs`.
Cette liste n'est pas un inventaire de tous les modules exécutés. Les fichiers non suivis sont absents du diff ;
seuls ceux de cette liste sont aussi empreintés individuellement, les autres sont signalés uniquement par `dirty`.

Le rapport garde aussi le backend, la configuration utile et l'empreinte exacte du manifeste, les entrées validées
et les empreintes des médias/images/son. Avant l'appel, la configuration locale est lue sur l'agent construit :
modèle, hôte sans URL ni chemin privé, fenêtre et maintien réellement utilisés, avec une copie par cas dans `config`.
L'isolation et le mode de transcription sont également consignés. La température et le défaut de binaire Codex
ne sont pas observables à cette frontière et ne sont pas annoncés dans le rapport. Le prompt exact, son empreinte,
le schéma demandé et les indices/temps/empreintes des images effectivement passées à l'agent sont conservés.
Les observations et métriques de production restent dans `result`, les mesures acquises lors des échecs
restent dans `diagnostics` (durées clientes en ms, durées fournisseur brutes en ns, nombres de tokens si annoncés).
Les émissions qui enrichissent un même objet de mesure remplacent sa copie : une requête HTTP locale garde
un seul diagnostic final. Une erreur enveloppée conserve aussi sa cause codée et son éventuel statut HTTP,
sans message interne ni texte du fournisseur.
L'état du modèle local reste `unknown` même si une durée de chargement est annoncée.

Chaque cas garde `id`, `index` et une issue : `validated` (aucun appel tenté), `running`, `succeeded`,
`refused`, `error`, `cancelled`. Une erreur d'inférence laisse continuer les autres cas, sans réessai implicite.
`complete` signifie que le parcours demandé est terminé, pas que tous les cas ont réussi ; la CLI rend 1
sur refus, erreur ou interruption, 0 sur validation ou exécution entièrement réussie.
`SIGINT` et `SIGTERM` annulent l'appel courant et la campagne reste incomplète. Les cas suivants gardent
`validated`. Une coupure brutale peut laisser `running` et `complete: false` ; aucune reprise automatique.
Une réponse arrivant après annulation ne remplace jamais l'issue enregistrée.

Les annotations attendues se préparent dans un fichier distinct, avant inférence. `--annotations` enregistre
uniquement son empreinte acquise avant tout constructeur ; son contenu n'entre ni dans le prompt ni dans le rapport.
Sans cette empreinte, `g2Eligible: false` : G1 reste possible, la notation G2 à annotations figées est exclue.
Cette admissibilité indique la présence de la preuve d'antériorité ; elle ne constitue aucune note de qualité.
Le runner ne juge pas les réponses. Les champs d'annotation éventuels au niveau d'un cas sont ignorés.
