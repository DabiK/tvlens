# Préparation et commandes futures — non exécutées

Les fichiers `plans/` sont prêts structurellement, pas encore validés avec les médias par le runner.
Les médias restent dans la préparation GX10. Les commandes ci-dessous ne doivent être utilisées qu'après fin du lot,
réservation explicite de la machine et accord sur l'essai ; aucune commande d'installation ou d'inférence n'a été exécutée ici.
Déposer le protocole réel sous `experiments/essais/<date>-<sujet>/`, puis ajouter sa ligne d'index, hors boucle de tickets.

## Placer les entrées

Copier uniquement les JSON nécessaires de `plans/` à côté du `manifest.json`/`scenario.json` de la préparation CNRS existante.
Ne jamais copier le dossier recherche entier : il comprend rapports et protocole d'évaluation, inutiles au modèle.
Utiliser les noms préparés, vérifier leur absence avant copie, puis comparer les SHA-256.
Ces nouveaux noms conservent les chemins relatifs `blocks/...` sans modifier les manifestes ou médias originaux.
`scenario-reference.json`, `scenario-vision-paused.json` et `scenario-index-paused.json` gardent les mêmes empreintes
de `blocks.json` et `preparation.json`. La configuration du scénario prime sur les variables du fichier env pour ces options.

Sur GX10, les variables de travail suivantes désignent seulement les emplacements ; adapter `trial` à un dossier neuf :

```sh
cd /home/nvidia/tvlens
prepared=/home/nvidia/tvlens-setup/reference-2026-10-20/preparation-cnrs-apprentissage
trial=/home/nvidia/tvlens-setup/perception-followup-UNIQUE
config=/home/nvidia/tvlens-setup/reference-2026-10-20/config-base.env
```

Le dossier parent de chaque sortie doit exister ; chaque sortie `--out` doit être absente.
Les chaînes `UNIQUE`, `A` et `B` sont des repères à remplacer avant l'essai.

## Vision seule, deux bras

La variante à trois images doit être matérialisée par préparation CPU légère, après copie du manifeste source à côté des blocs :

```sh
python3 prepare-visual-ablation.py "$prepared/perception-nominal.json" "$trial/inputs"
```

Le script crée un répertoire neuf, vérifie les empreintes, écrit les deux ensembles et ne contacte aucun fournisseur.
Il conserve `lightweight=false` : la réduction d’images est explicite dans les médias dérivés.

Validation sans fournisseur, sur une sortie distincte :

```sh
node scripts/replay-local-perception.cjs \
  --manifest "$trial/inputs/perception-five-images.json" \
  --out "$trial/validation-nominal" --backend local --validate
node scripts/replay-local-perception.cjs \
  --manifest "$trial/inputs/perception-three-images.json" \
  --out "$trial/validation-lightweight" --backend local --validate
```

Après validation des annotations séparées et accord d'exécution, commande de chaque bras :

```sh
node scripts/replay-local-perception.cjs \
  --manifest "$trial/inputs/perception-five-images.json" \
  --out "$trial/run-A" --backend local --execute \
  --url http://127.0.0.1:11434 --model gemma3:4b --num-ctx 8192 --keep-alive 10m
node scripts/replay-local-perception.cjs \
  --manifest "$trial/inputs/perception-three-images.json" \
  --out "$trial/run-B" --backend local --execute \
  --url http://127.0.0.1:11434 --model gemma3:4b --num-ctx 8192 --keep-alive 10m
```

Pour G2, ajouter `--annotations <fichier-local-fige>` avant les appels. Le runner n'en conserve que l'empreinte.
Sans annotations figées, rester en diagnostic G1 ; ne pas annoncer un score qualité validé.
Pas d'autorelance après erreur. Le deuxième passage prévu utilise de nouvelles sorties et inverse B/A.
Le budget de 45 min doit être suivi par l'opérateur ; aucune boucle/automatisation n'est fournie.

## Flux CNRS, vision suspendue

```sh
node scripts/replay-local-stream.cjs \
  --scenario "$prepared/scenario-reference.json" \
  --out "$trial/validation-flow-A" --config "$config" --validate
node scripts/replay-local-stream.cjs \
  --scenario "$prepared/scenario-vision-paused.json" \
  --out "$trial/validation-flow-B" --config "$config" --validate
```

Exécution future, mêmes arguments et sorties neuves, remplacer `--validate` par `--execute`.
Le temps de visionnage est celui du média entier, environ 14 min 40 par bras, plus clôture.
Conserver le même poids Whisper entre A/B ; si un autre poids est retenu après le lot, changer `config` pour les deux bras.
Ne pas réutiliser les délais du lot base comme unique référence d'une variante small ou turbo.

Le scénario `scenario-index-paused.json` est une ablation séparée de l'index de fond : ne pas la combiner à la suspension vision.
La même validation s'applique. Les questions actuelles ne suffisent pas à noter le bénéfice du rappel ancien.

## Adaptations requises avant les autres pistes

- Les réponses questions ne conservent pas `prompt_eval_duration`, `eval_duration`, `eval_count` ni `load_duration`.
  Ajouter cette observation via les ports existants dans un ticket ; mesurer son surcoût avant comparaison.
- `num_predict` n'est pas exposé par `OllamaHttpClient` : l'ajouter dans un JSON de scénario ne suffit pas.
- La capacité de la file vision vaut deux et n'est pas exposée ; augmenter la file masque une perte en créant du retard.
- Il n'existe pas de CLI de questions sur mémoire figée. Une composition dédiée doit exclure le futur et les appels de perception.
- vLLM parle l'API OpenAI-compatible ; les adaptateurs locaux actuels utilisent `/api/chat` et `/api/embed` Ollama.
  Une URL différente n'est pas une intégration. JSON contraint, outils, métriques, erreurs et annulations doivent être adaptés.
- Aucun réglage global Ollama, conteneur, modèle ou service distant ne doit être modifié pendant le lot existant.
