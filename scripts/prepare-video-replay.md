# Préparer un rejeu depuis une vidéo

La préparation convertit un fichier local avec le seul `config.ffmpeg` de TVLens. Elle n'appelle aucun
modèle, Whisper, fournisseur, TV ou VPS. Le dossier de sortie doit être neuf et son parent exister.
Aucun téléchargement, installation ou corpus n'est fourni. L'opérateur vérifie ses codecs et son fichier.

Depuis la racine du dépôt :

```sh
node scripts/prepare-video-replay.cjs --help
node scripts/prepare-video-replay.cjs --file /chemin/emission.mp4 --out /tmp/emission-preparee \
  --start-ms 0 --duration-ms 1800000 --block-ms 10000 --frames 5 --jpeg-quality 3
node scripts/prepare-video-replay.cjs --validate --out /tmp/emission-preparee
node scripts/replay-local-perception.cjs --manifest /tmp/emission-preparee/manifest.json \
  --out /tmp/emission-validation --backend local --validate
```

`--config fichier` choisit la configuration TVLens (défaut `.env`). `TVLENS_FFMPEG` dans l'environnement
prime sur le fichier. Ni aide ni validation d'une préparation ne lancent ffmpeg ou un fournisseur.
Les erreurs affichent un code stable et la CLI rend 1. Un dossier existant est refusé sans écrasement.

Le rejeu de perception T257 avec inférence appartient à l'opérateur, hors boucle :

```sh
node scripts/replay-local-perception.cjs --manifest /tmp/emission-preparee/manifest.json \
  --out /tmp/emission-perception --backend local --execute \
  --url http://127.0.0.1:11434 --model NOM_MODELE
```

Ce parcours est conversion → validation du manifeste de perception → rejeu. Les paramètres explicites
ne déclenchent aucun repli. Pour une référence Codex, utiliser les commandes de [perception-replay.md](perception-replay.md).
Les annotations attendues restent dans un fichier séparé, préparé avant le rejeu puis passé via `--annotations`.
L'opérateur peut fournir transcript ou contexte selon le contrat documenté du manifeste ; il conserve alors
séparément l'original et documente cet apport, sa provenance et les nouvelles empreintes.

## Deux sorties pour deux usages

- `manifest.json` : manifeste de perception version 1, lisible directement par T257. Chaque cas référence
  `blocks/000000/media.json`, puis les suivants. Les images et l'audio correspondent au corps du même bloc.
  Provenance `converted-video` (« vidéo convertie »), intervalle source et empreinte sont conservés.
  Transcript inconnu et vide, contexte historique `null`, limites explicites, `lightweight: false` explicite.
  Aucun contexte, annotation, transcription ou résultat de modèle n'est inventé.
- `blocks.json` : index de gabarits HTTP pour T259, distinct du manifeste de perception. Chaque entrée
  référence `blocks/000000/body.json` et son SHA-256. Le corps contient `sessionId`, `sequence`,
  `startMs`, `endMs`, `frames: [{atMs, data}]` et, si présent, `audio` WAV. Les base64 n'ont aucun préfixe.
  `audio: absent` dans l'index signifie qu'aucune piste audio n'a été détectée ; le corps omet alors le son.
  Aucune transcription ni aucun silence de substitution n'est produit. Un échec d'extraction reste un échec.
- `preparation.json` : état de préparation, durée planifiée et durée réellement acquise, origine des temps,
  intervalle source, empreinte de la vidéo lue en flux, paramètres, version et commande de sondage ffmpeg,
  empreintes du manifeste et de l'index. L'index porte les empreintes de chaque JPEG, WAV et JSON publié.

Les temps des corps et du manifeste commencent à zéro au début de l'intervalle source demandé.
Ils sont des temps relatifs de gabarit, sans horloge de session réelle. L'identifiant
`video-template-validation-only` sert exclusivement à `validateRemote` et ne désigne aucune session réelle.
À chaque occurrence, T259 doit rattacher le corps à la session courante : nouvel identifiant, séquence neuve,
translation de tous les temps sur son horloge, livraison après clôture du bloc. Le convertisseur ne réalise
ni ce rattachement, ni calendrier, transport, réessai ou bouclage.

## Échantillonnage et limites

Les intervalles sont contigus et durent au plus `--block-ms`, dans les bornes de `validateRemote` (10 s,
une à cinq images). Le dernier intervalle garde sa durée partielle. Les prises d'images sont équidistantes
à partir du début du bloc, borne de fin exclue : avec cinq images dans dix secondes, les positions demandées
sont 0, 2, 4, 6 et 8 secondes. Ce sont des positions de recherche ffmpeg, avec la précision du décodage du codec.
La durée disponible provient des métadonnées d'entrée affichées par ffmpeg ; une durée indéterminable est refusée.
L'origine est le début de lecture du fichier, indépendant du timestamp interne initial du conteneur.

Chaque JPEG est mis à l'échelle dans 1280×720 sans agrandissement, avec conservation du rapport des dimensions.
Ses dimensions et son décodage sont contrôlés avant publication ; `validateRemote` contrôle les bornes des corps,
notamment 1 500 000 octets par image et 2 100 000 octets pour le WAV. L'audio est PCM 16 bits, mono, 16 kHz.
Les blocs se préparent un par un : aucun tableau de trente minutes de médias ne reste en mémoire.
La préparation est terminée avant le rejeu soutenu et ne ralentit donc pas les arrivées de T259.

`--duration-ms` fixe une borne demandée, limitée à la durée restante du fichier. Sans cette option, tout le
reste est converti. Un fichier plus court conserve sa durée réelle ; un fichier suffisamment long peut fournir
trente minutes sans répétition. Seul T259 peut boucler une source courte, en le déclarant.

Une vraie session TV reste le témoin de fidélité : les blocs convertis ne mesurent ni capture LG, ni pertes
avant livraison, ni fidélité du rythme de ses prises d'images. La préparation vérifie un contrat de conversion,
pas l'équivalence des pixels sélectionnés par la TV.

## Préparation interrompue

`preparation.json`, le manifeste et l'index portent `complete: false` tant que tout n'est pas acquis.
Un bloc n'est publié qu'après extraction et validation complètes, par renommage de son dossier temporaire.
Sur erreur, SIGINT ou SIGTERM, les blocs précédents restent disponibles ; la sortie partielle courante est
retirée après la fin du processus. Une coupure brutale peut laisser un dossier `.work-*`, sans bloc déclaré complet.
Ni la validation de préparation ni le runner de perception n'acceptent un manifeste marqué incomplet.
Il faut préparer dans un nouveau dossier après correction ; aucune reprise ou réparation implicite.
