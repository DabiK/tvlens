# Confirmation de la pause vision pendant les questions — Kennedy et Spring

## Question et pré-enregistrement

Hypothèse : suspendre les **nouveaux départs** de la voie vision pendant une question réduit le délai HTTP complet sans perdre de fait utile ni de rappel ancien. Le bras A conserve `visionDuringAsk=true` ; le bras B fixe uniquement ce champ à `false`. Une inférence déjà en cours peut finir. Les deux bras utilisent le même média préparé, les mêmes cinq questions, les mêmes modèles, le même Whisper `base`, les mêmes clips de huit secondes et la même configuration. Les scénarios de référence de Kennedy et Spring sont copiés dans `reference/` avec leurs SHA-256 inscrits dans `confirmation.py`. Ils proviennent des passages `base-kennedy` et `base-spring` du lot de référence du 20 octobre.

L'ordre est **Kennedy A/B/B/A, puis Spring A/B/B/A**. Chaque passage possède son dossier `run/campaign.json`, ses journaux stdout/stderr, sa télémétrie et son statut. Les deux validations par vidéo sont exécutées avant ses quatre passages. Un échec arrête la suite ; aucune relance automatique. Le budget global, validation et fermeture comprises, est de **3 h maximum**. Un délai absolu plus tôt ou l'expiration de la réservation raccourcit ce budget. Le runner `scripts/replay-local-stream.cjs` est celui du code figé, dont le SHA-256 est contrôlé ; le lanceur de supervision `night_common.py` de la nuit est aussi contrôlé par empreinte. Aucun code applicatif ni harnais n'est modifié.

Les identités attendues sont celles de la référence : médias Kennedy `f542af18…a45035b2c611` et Spring `c2c678f2…4da9eaaa443a`, configuration `1c007271…c7`, Whisper `base` `60ed5bc3…fe`, binaire Whisper `53cff427…c43`, code `2035a2f` ou `d4183da`, et trois digests Ollama du plan de nuit. `package.sha256.json` pré-enregistre les deux scripts et les scénarios de ce dossier. Le pré-vol re-hache aussi les médias, tous les fichiers de blocs nommés dans `blocks.json`, la préparation, le manifeste, les poids et toutes les sources exécutables inscrites dans le plan de nuit figé. Le dépôt distant et la source de référence restent à leur place ; leurs fichiers ne sont pas réécrits.

## Conditions de lancement sur GX10

Le dossier a été transféré sur la GX10 le 21 octobre sous `/home/nvidia/tvlens-setup/confirmation-pause-20261021T081500Z/`, hors du dépôt Git figé. Les quatre empreintes de `package.sha256.json` concordent après copie. La référence `/home/nvidia/tvlens-setup/reference-2026-10-20/termine.txt` existe et le pré-vol distant en lecture seule n'a trouvé aucun écart. Le lanceur recontrôle le code, les médias, les blocs, les poids, le GPU et les trois verrous avant le premier replay.

La réservation de ce créneau est `{"exclusive":true,"experiment":"vision-pause-confirmation","expiresAtUtc":"2026-10-21T11:15:00+00:00"}`. Le dossier de sortie était inexistant avant le lancement. La commande exécutée par [launch.sh](launch.sh) est :

```sh
python3 /home/nvidia/tvlens-setup/confirmation-pause-20261021T081500Z/confirmation.py \
  --repo /home/nvidia/tvlens \
  --reference /home/nvidia/tvlens-setup/reference-2026-10-20 \
  --night-common /home/nvidia/tvlens-setup/nuit-20261020T210107Z/package/scripts/night_common.py \
  --frozen-plan /home/nvidia/tvlens-setup/nuit-20261020T210107Z/package/execution/plan.json \
  --reservation /home/nvidia/tvlens-setup/confirmation-pause-20261021T081500Z/reservation.json \
  --out /home/nvidia/tvlens-setup/confirmation-pause-20261021T081500Z/results \
  --deadline 2026-10-21T11:15:00+00:00
```

Le pré-vol prend les verrous `/home/nvidia/tvlens-setup/night.lock`, `reference-2026-10-20/execution.lock` et `/home/nvidia/tvlens-setup/followup-gpu.lock` sans attendre. Il refuse un autre replay ou un processus GPU étranger à Ollama. Les validations puis les huit exécutions sont séquentielles. Le superviseur échantillonne système, GPU, processus et résidence Ollama toutes les cinq secondes ; chaque commande a ses arguments, son code de sortie et ses journaux. `SIGINT`, `SIGTERM`, un plafond atteint, un manque de disque/mémoire ou un échec interrompent le processus enfant possédé et préservent les sorties partielles. Aucun conteneur n'est créé. Ne pas tuer manuellement les services existants.

## Fermeture et exploitation

Après une exécution complète, `status.json` doit indiquer `finished`, `closure.json` doit indiquer huit passages, `ownedProcessesStopped=true`, `locksReleased=true`, `containersCreated=false`, et `integrite.json` scelle tous les fichiers. Le point 4 attend le contrôle suivant, exécuté **sur la GX10** ; il re-hache les sorties, vérifie l'état et reprend brièvement les trois verrous pour prouver leur disponibilité immédiate :

```sh
python3 /home/nvidia/tvlens-setup/confirmation-pause-20261021T081500Z/verifier_fermeture.py \
  --out /home/nvidia/tvlens-setup/confirmation-pause-20261021T081500Z/results \
  --reference /home/nvidia/tvlens-setup/reference-2026-10-20
```

Son résultat `closed:true` et `integritySha256` constituent la condition de passage au second essai. Une sortie `blocked`, `cleanup-failed`, un processus encore actif, un verrou occupé ou un sceau divergent arrêtent la séquence. Le vérificateur ne mesure ni ne valide la pertinence.

Pour l'analyse, conserver les **40 délais individuels** et calculer par vidéo et bras p50/p95, part sous 20 s et sous 15 s, âge des preuves au moment des questions, publications perdues par cause et couverture visuelle. Comparer les mêmes questions entre les deux passages de chaque bras ; séparer premier et second passage. Les réponses restent `readyForScoring=false` tant que les fiches humaines ne sont pas validées. L'annotation devra vérifier faits utiles, invention et rappel ancien, notamment `spring-06` et `kennedy-06`. Avec cinq questions par vidéo, le p95 est fragile. Le bras B ne sera retenu que si le délai baisse sans perte factuelle importante ; aucun score automatique de qualité n'est produit.

## État réel

La session `tmux -L tvlens-day-20261021`, `tvlens-confirm-pause`, a démarré le 21 octobre
à 08:16:23 UTC avec [launch.sh](launch.sh). Les huit passages se sont terminés à
09:18:16 UTC. Le vérificateur distant a confirmé `closed=true`, huit passages, les
processus possédés arrêtés, les verrous libérés et l'intégrité SHA-256. Les
[rapports rapatriés](rapatriements/confirmation-pause-20261021T081500Z/RAPATRIEMENT.md),
le [bilan technique](BILAN.md) et les chemins/empreintes du [déploiement](deployment.json)
sont conservés. La qualité reste non notée tant que les fiches ne sont pas validées.

## Vérification locale sans GPU

`PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s tests -v` vérifie l'inventaire pré-enregistré, l'identité des deux bras, les cinq questions, le rejet d'une entrée modifiée, la clôture d'une campagne et le sceau. Ces tests n'appellent aucun fournisseur. Un [pré-vol GX10 en lecture seule](preuves/prevol-lecture-seule-20261021.json) a confirmé 470 sources, 888 sorties de blocs, médias, Whisper et Ollama sans écart ; il n'a pris aucun verrou ni lancé d'inférence. L'état du GPU et des fichiers doit être revérifié au lancement.
