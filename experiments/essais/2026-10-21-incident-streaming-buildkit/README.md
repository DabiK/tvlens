# Refus du mode réseau BuildKit — reprise préparée

État au 21 octobre 2026 à 04:09 UTC : le build a réussi, puis le run s'est scellé **blocked** sur l'import Python des dépendances.
L'image et l'inventaire déjà réussis ont été réutilisés ; aucun poids de modèle ni réponse StreamingVLM n'a été produit.

## Question et diagnostic

Le run `/home/nvidia/tvlens-setup/reprise-streaming-arm-20261021T002414Z/results` s'est arrêté
à `2026-10-21T03:56:51Z`, après `image-pull` et `base-packages` réussis. `dependency-build` a échoué en
0,501 s, avant une installation, avec :

> ERROR: failed to build: network mode "bridge" not supported by buildkit

Son manifeste `integrite.json` a pour SHA-256
`29c2285651790458c73ec217dd782c810ba533ec488877f486ae28770710c8b1`.
Les preuves sélectionnées sont dans
`../2026-10-21-streamingvlm-gx10/rapatriements/reprise-streaming-arm-20261021T002414Z/`.
Le test du manifeste complet ajoute les deux fichiers omis par ce transfert sélectif, conservés dans `evidence/`.
**`evidence/telemetry.jsonl` et `evidence/base-packages.cid` restent locaux, à ne pas pousser.**

Une lecture SSH fraîche a observé Docker Buildx `v0.26.1`, le builder `default` avec driver `docker`,
BuildKit `v0.23.2` et plateforme `linux/arm64`.
La [documentation officielle Buildx](https://github.com/docker/buildx/blob/master/docs/reference/buildx_build.md#network)
consultée via Context7 précise que les valeurs de `build --network` sont `default`, `none`, `host`.
Le mode `bridge` du worker BuildKit est une configuration différente ; il ne justifie pas l'option de build utilisée.

Conclusion : incident de lancement déterminé, **pas une preuve d'incompatibilité ARM64, CUDA ou StreamingVLM**.
La compilation de Decord/FFmpeg, les versions Python et l'import CUDA restent à éprouver après cette correction.

## Correction et invariants

`continuation.py` charge les modules distants gelés après vérification de leurs hashes.
Il conserve le paquet d'origine et remplace uniquement `--network=bridge` par `--network=default`
dans la commande `dependency-build`. Le Dockerfile généré doit être identique octet pour octet au Dockerfile scellé.
Il n'ajoute ni builder, ni privilège réseau hôte, ni installation globale.

Les étapes réussies `image-pull` et `base-packages` sont réutilisées avec provenance explicite ;
l'inspection actuelle de l'image par digest, les vérifications des versions dérivées,
Torch/FlashAttention/CUDA, source amont, vidéo et toutes les sondes restantes restent actives.
Le réseau `bridge` des conteneurs de téléchargement n'est pas changé : Docker run accepte cette valeur.

Le verrouillage reprend les trois verrous existants, sans boucle d'attente ni nouvelle file.
Sous verrou, il vérifie les clôtures et conteneurs des prédécesseurs, le suffixe Qwen, le corpus,
l'absence de replay, de processus GPU et de modèle Ollama résident.
Un verrou occupé, une preuve modifiée, un prédécesseur incomplet ou une ressource inconnue bloque la reprise.
Le corpus et Qwen ne sont jamais réexécutés.

Les budgets ne redémarrent pas : origine conservatrice du premier gate à `03:37:16.052779 UTC` ;
phase courte jusqu'à **05:07:16.052779 UTC**, fin totale jusqu'à **07:07:16.052779 UTC**.
Le plafond original du 21 octobre à 12:00 UTC reste dans le protocole ; le plafond effectif plus strict prévaut.
Une erreur de build, d'import, de téléchargement ou de modèle clôt le nouveau run sans relance automatique.
Les résultats précédents sont seulement lus. Les résultats nouveaux et leur manifeste sont écrits dans un dossier neuf.

## Contrôles observés

- 9 tests Python hors GPU réussis : manifeste complet, altération refusée, Docker simulé,
  conservation exacte du Dockerfile et des pins, réutilisation des étapes réussies,
  absence de retry, budgets sans remise à zéro, exclusivité et libération sur échec.
- Syntaxe POSIX de `launch.sh` vérifiée avec `sh -n`.
- Premier passage : le test du manifeste a signalé les deux fichiers absents du transfert sélectif.
  Ils ont été récupérés par lecture SSH, puis le manifeste complet a été validé sans changer le test d'intégrité.
- Contrôle général `node scripts/check.mjs --changed` : vert, observé par l'orchestrateur avant le déploiement.

Commande des tests (les deux preuves locales sont requises) :

```sh
python3 -B -m unittest discover -s experiments/essais/2026-10-21-incident-streaming-buildkit/tests -v
```

## Déploiement et suivi

Le parent a relu le code et créé un seul dossier distant neuf :
`/home/nvidia/tvlens-setup/reprise-streaming-buildkit-20261021T040610Z`.
Seuls `continuation.py` et `launch.sh` y ont été copiés ; leurs SHA-256 ont été vérifiés après transfert.
La source distante `reprise-continuation-20261021T002414Z/guards.py` est vérifiée à son SHA gelé par le programme.
Aucun secret ou fichier d'environnement n'est lu.

Depuis une connexion SSH fraîche (`BatchMode=yes`, `ControlMaster=no`, `ControlPath=none`),
`launch.sh` a été appelé une fois à 04:06 UTC. La session `tvlens-reprise-streaming-buildkit` a été créée ;
à 04:06:51 UTC, le statut était `dependency-build` sans erreur.
Le script refuse un résultat ou log existant, toute session `tvlens-reprise-*` encore présente sur le socket indépendant
`tvlens-recovery-20261020T224805Z`, et une deuxième admission grâce au dossier atomique `launch-once`.
Il crée une seule session `tvlens-reprise-streaming-buildkit`.
La vérification GPU sous les verrous reste la décision d'admission définitive du programme.

Si la phase courte originale n'a plus 30 secondes, le programme refuse la reprise.
Un refus est conservé comme incident ; il ne faut ni effacer `launch-once` ni relancer automatiquement.
Après clôture, vérifier le nouveau manifeste et rapatrier les résultats suivant la sélection habituelle.
Le build des dépendances a réussi en 197,15 s. La sonde a confirmé ARM64, CUDA visible et décodage de Spring par Decord, puis a échoué avec `ModuleNotFoundError: No module named 'past'` dans l'import de `ffmpeg`. Il s'agit d'une fermeture incomplète des dépendances Python du paquet figé ; la compatibilité du modèle reste inconnue. Voir `deployment.json` pour les empreintes et chemins exacts, et [le rapatriement](rapatriements/reprise-streaming-buildkit-20261021T040610Z/RAPATRIEMENT.md) pour les preuves brutes vérifiées. Une éventuelle correction de ce second incident exige un nouveau dossier et des limites conservées.
