# Commandes de préparation et d'exécution future

Depuis la racine du dépôt. Toutes les sorties doivent être absentes ; aucun `--resume` n'existe.

## Validation locale, sans modèle

```sh
kit=experiments/gx10/research/2026-10-20-execution
trial=$(python3 -c 'import uuid; print(uuid.uuid4())')
python3 "$kit/orchestrer.py" exercise --out "/tmp/tvlens-wrapper-$trial"
python3 "$kit/orchestrer.py" run --experiment perception --mode validate \
  --out "/tmp/tvlens-perception-$trial"
python3 "$kit/orchestrer.py" verify --out "/tmp/tvlens-perception-$trial"
```

Pour reproduire les dérivés dans un dossier neuf, le script utilisé est :

```sh
python3 experiments/gx10/research/2026-10-20-propositions/prepare-visual-ablation.py \
  "$kit/entrees-source/perception-nominal.json" "/tmp/tvlens-images-$trial"
```

## Sur GX10, après fin du lot et réservation

Ces commandes **n'ont pas été exécutées**. Placer uniquement `orchestrer.py`, `plan.json`, `preregistration.json`,
`README.md`, `commandes.md`, `plans/` et `entrees-perception/` dans un nouveau dossier local à la GX10, par transfert autorisé ultérieurement.
Ne pas recopier les fiches/attendus dans ces entrées. La machine contient déjà le dépôt et les médias.
Adapter `kit` au dossier transféré. `--repo` est explicite parce que le kit peut être hors du dépôt.

```sh
kit=/home/nvidia/tvlens-setup/preparation-experiences-UNIQUE
batch=/home/nvidia/tvlens-setup/reference-2026-10-20
trial=$(python3 -c 'import uuid; print(uuid.uuid4())')
python3 "$kit/orchestrer.py" run --experiment vision --mode validate \
  --repo /home/nvidia/tvlens --inputs "$batch/preparation-cnrs-apprentissage" \
  --config "$batch/config-base.env" --out "/home/nvidia/tvlens-setup/validation-vision-$trial"
```

La validation du flux avec tous les médias doit réussir avant de prétendre le scénario prêt.
L'exécution refait également les validations A/B dans ses propres dossiers avant la première inférence.
Elle refuse toute configuration différente de la référence base pré-enregistrée.

Après contrôle du lot, des clients actifs et réservation exclusive, créer hors des entrées modèles un
fichier `reservation.json` avec cette forme ; remplacer les dates et l'expérience effectivement réservée.
Ce fichier est une attestation de l'opérateur, pas une acquisition automatique de la machine.

```json
{
  "experiment": "perception",
  "exclusive": true,
  "operator": "NOM",
  "expiresAtUtc": "DATE-UTC-AVEC-FUSEAU"
}
```

Prévoir 45 min + marge pour perception, 80 min + marge pour vision ; un créneau plus court arrêtera le lot.
La date doit être ISO 8601 avec fuseau, par exemple la forme `AAAA-MM-JJTHH:MM:SS+00:00`.

```sh
python3 "$kit/orchestrer.py" run --experiment perception --mode execute \
  --repo /home/nvidia/tvlens --reservation /chemin/reservation.json \
  --out "/home/nvidia/tvlens-setup/perception-$trial"
```

Pour l'autre expérience, nouvelle réservation `experiment: "vision"`, nouvel UUID et nouveau dossier :

```sh
python3 "$kit/orchestrer.py" run --experiment vision --mode execute \
  --repo /home/nvidia/tvlens --inputs "$batch/preparation-cnrs-apprentissage" \
  --config "$batch/config-base.env" --reservation /chemin/reservation-vision.json \
  --out "/home/nvidia/tvlens-setup/vision-$trial"
```

Ne pas lancer les deux commandes ensemble. Pas de modèle déchargé ou service modifié pour obtenir une
condition froide. SIGINT/SIGTERM du wrapper conserve l'essai interrompu et ses sorties.

## Archivage et rapatriement vérifiés

Sur GX10, après fermeture, `verify` contrôle l'ensemble exact des fichiers et leurs SHA-256.
`archive` refuse une archive existante et crée son empreinte séparée. Les sources du runner sont déjà
conservées dans l'essai en `code.tar.gz`. Une sortie interrompue/échouée s'archive aussi.

```sh
python3 "$kit/orchestrer.py" verify --out /chemin/essai
python3 "$kit/orchestrer.py" archive --out /chemin/essai --archive /chemin/essai.tar.gz
```

Lors d'une future session autorisant ce dépôt de preuves, sur Mac, rapatrier dans un dossier neuf
`experiments/essais/<date>-<sujet>/`, vérifier avant extraction puis après extraction :

```sh
scp gx10-tvlens:/chemin/essai.tar.gz gx10-tvlens:/chemin/essai.tar.gz.sha256 /chemin/dossier-neuf/
cd /chemin/dossier-neuf
shasum -a 256 -c essai.tar.gz.sha256
tar -xzf essai.tar.gz
python3 /chemin/orchestrer.py verify --out /chemin/dossier-neuf/essai
```

Conserver les neuf campagnes du lot de référence, y compris les échecs. Ajouter le README d'essai et
une ligne à `experiments/essais/README.md`, boucle de tickets arrêtée, puis relier cet essai au présent plan.
Ne jamais modifier un résultat scellé pour l'annoter : produire un fichier de relecture séparé et empreinté.
