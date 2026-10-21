# Dépendance Python `past` absente — reprise préparée

État au 21 octobre 2026 à 04:31 UTC : **reprise scellée `blocked` au premier pilote**. La couche corrective,
l'inventaire, la sonde de dépendances et le téléchargement du checkpoint ont réussi.
Le diagnostic préalable s'est limité à des lectures et à l'acquisition/libération immédiate des trois
verrous existants. Les détails de lancement sont dans `deployment.json`.

## Incident distinct

Le run `/home/nvidia/tvlens-setup/reprise-streaming-buildkit-20261021T040610Z/results` est scellé,
`blocked` depuis `2026-10-21T04:09:34.545646Z`, sur `dependency-probe:EXIT_1`.
Le manifeste complet a été vérifié par SSH fraîche ; SHA-256 :
`8364eb61e32712ce44bc9eff66511da506c58a35f6f1c53643c4ed8836e540b3`.

`dependency-build` et `derived-packages` ont réussi. Avant de bloquer, le probe a décodé la première
image de Spring et annoncé ARM64, CUDA 13.4 disponible, capacité `[12, 1]`, Decord 0.6.0,
Transformers 4.52.4 et FlashAttention importé. Cela ne valide pas les noyaux utilisés par le modèle.
L'import StreamingVLM suit ensuite `patch_model.py → ffmpeg → ffmpeg.nodes → past.builtins` et échoue :
`ModuleNotFoundError: No module named 'past'`.

Le [setup.py de ffmpeg-python 0.2.0](https://github.com/kkroening/ffmpeg-python/blob/0.2.0/setup.py)
déclare `future` comme dépendance. Le Dockerfile figé installe `ffmpeg-python==0.2.0` avec `--no-deps`
mais ne comprend pas `future`. C'est une omission de dépendance transitive déterminée, distincte du refus
BuildKit précédent et ne démontrant aucune incompatibilité ARM64, CUDA ou du checkpoint.
Context7 a confirmé l'installation standard de ffmpeg-python ; le détail de la dépendance a été vérifié
dans la source officielle du tag 0.2.0.

## Correction bornée et portée du protocole

Le protocole autorise des dépendances isolées, épinglées, sans remplacement de Torch/CUDA/FlashAttention.
Cette omission est récupérable par **un ajout explicite de `future==1.0.0`**. Il s'agit d'une modification
consignée de l'environnement Python ; le modèle, sa révision, le code amont, la vidéo, ses empreintes,
les durées et les paramètres d'inférence restent figés. La correction ne garantit pas que tous les
imports ultérieurs ni l'inférence fonctionneront. Toute nouvelle erreur termine le nouveau run.

La [métadonnée PyPI de future 1.0.0](https://pypi.org/pypi/future/1.0.0/json) fournit une roue universelle
`future-1.0.0-py3-none-any.whl` de 491326 octets, déclarant Python 3.12, SHA-256 :
`929292d34f5872e70396626ef385ec22355a1fae8ad29e1a734c3e43f9fbc216`.
La roue n'a pas été téléchargée ici. Le script emploie son URL exacte avec vérification d'empreinte,
`--no-deps`, `--only-binary=:all:` et `--retries 0`.

`continuation.py` charge la reprise BuildKit précédente et les modules d'origine seulement après
vérification de leurs empreintes. Il réutilise `image-pull`, `base-packages`, `dependency-build` et
`derived-packages`, en conservant leur provenance. Il vérifie que l'image locale correspondant au tag
réutilisé a toujours l'identifiant :
`sha256:8d92f144e0a96c5bfb95104ef04748208b22726006cb0a9b4329eabeda74f26c`.

Il prépare un seul build correctif de 300 secondes au plus, partant de cette image locale, avec
`--pull=false`, sans recompiler FFmpeg ou Decord. Le build vérifie `past.builtins`, `ffmpeg` et la version
de `future`. Les couches de l'image précédente doivent rester le préfixe exact de l'image corrigée.
Un inventaire corrigé doit être exactement égal à l'inventaire précédent pour toutes les dépendances
figées, Torch, FlashAttention et CUDA. Les étapes suivantes utilisent l'ID de l'image corrigée.

Puis seul le probe non réussi est repris, suivi du téléchargement et des pilotes déjà prévus par le
code d'origine. Aucun essai de modèle n'avait été tenté. Ni le corpus ni Qwen ne sont réexécutés.

## Admission et échéances

Sous les trois verrous, la reprise vérifie les manifestes complets des deux incidents, la clôture des
prédécesseurs, leurs conteneurs possédés, le corpus, Qwen, le GPU sans processus, l'absence de replay et
Ollama sans modèle résident. Une ressource indisponible bloque immédiatement : pas de boucle d'attente.
La source amont et la vidéo sont vérifiées par les fonctions d'origine avant tout build correctif.

Les budgets sont conservés, sans nouveau départ :

- origine : `2026-10-21T03:37:16.052779Z` ;
- phase courte : `2026-10-21T05:07:16.052779Z` ;
- fin totale : `2026-10-21T07:07:16.052779Z`.

Si la phase courte a moins de 30 secondes, la reprise est refusée. Les durées de commandes sont
plafonnées par le budget restant. Le script a été placé dans le **dossier distant neuf**
`/home/nvidia/tvlens-setup/reprise-streaming-past-20261021T041930Z` avec `launch.sh`, puis appelé une seule fois à 04:19:44 UTC.
Le lanceur refuse une session `tvlens-reprise-*`, des résultats/logs existants, ou un second passage
par son admission atomique `launch-once`. Au contrôle de 04:19:52 UTC, `future-layer-build`,
`corrected-packages` et `dependency-probe` avaient réussi ; `checkpoint-download` débutait. Il a fini
16/16 fichiers, puis `pilot-16` s'est arrêté avant chargement du modèle : `/runner/queue.py` masque le
module standard `queue` requis par PyTorch. Aucune réponse StreamingVLM n'a été produite. Voir [les
preuves vérifiées](rapatriements/reprise-streaming-past-20261021T041930Z/RAPATRIEMENT.md) ; une autre
reprise, si validée, devra rester dans un dossier neuf et conserver les mêmes limites horaires.

## Vérifications observées et limites

Le relevé `evidence/remote-readonly-verification.json` à **04:17:12 UTC** confirme les deux manifestes
complets, le paquet figé, Qwen terminé, les conteneurs arrêtés, les trois verrous disponibles, GPU/replay
inactifs, Ollama vide et l'identifiant ARM64/Linux de l'image réutilisée. Ce relevé ne vaut pas admission
future : les contrôles sont réexécutés sous verrous au lancement.

10 tests Python locaux avec Docker simulé ont réussi : réutilisation, seule correction construite,
refus de dérive d'image/couches/versions, échec sans retry, budget épuisé, libération des verrous,
historique et manifeste du prédécesseur, budgets conservés. `sh -n launch.sh` a réussi.
Les tests ne prouvent pas la réussite réelle de la future installation ni de l'inférence.
Le contrôle général `node scripts/check.mjs --changed` a été observé vert par l'orchestrateur avant le lancement.

```sh
python3 -B -m unittest discover -s experiments/essais/2026-10-21-incident-streaming-past/tests -v
sh -n experiments/essais/2026-10-21-incident-streaming-past/launch.sh
```

Les preuves antérieures restent dans
`../2026-10-21-incident-streaming-buildkit/rapatriements/reprise-streaming-buildkit-20261021T040610Z/`.
Aucun ancien dossier n'a été modifié ; aucun fichier de télémétrie ni fichier `.cid` n'a été copié ici.
