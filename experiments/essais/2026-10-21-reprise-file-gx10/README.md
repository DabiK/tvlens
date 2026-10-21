# Reprise des files GX10 après l'incident Docker

Les files Qwen visuel, StreamingVLM et corpus étendu se sont arrêtées après l'échec de la nuit principale, avant tout téléchargement ou appel modèle propre à ces trois files. Leurs dossiers d'origine restent scellés et intacts. Cette reprise utilise les **mêmes paquets, entrées, images, modèles, paramètres et échéances**. Elle ne rejoue que ces trois files incomplètes, chacune dans un nouveau dossier horodaté. La reprise vLLM texte de la nuit est préparée séparément dans `../2026-10-21-reprise-docker-gx10/` et doit produire un dossier `results/` terminé et scellé.

Mise à jour à 22:50 UTC le 20 octobre : les trois nouvelles files sont [déployées](deployment.json)
et en attente de leurs nouveaux prédécesseurs, sans charge GPU propre à ce relevé.

| Ordre | Lanceur | Attend | Échéance inchangée |
| --- | --- | --- | --- |
| 1 | [Qwen visuel](launch-qwen.sh) | Nouvelle nuit vLLM texte `finished`, fermeture confirmée, sceau valide | 21 octobre, 05:00 UTC |
| 2 | [StreamingVLM](launch-streaming.sh) | Nouvelle nuit et nouveau Qwen `finished`, fermeture et sceaux valides | 21 octobre, 12:00 UTC, 3,5 h de travail au plus |
| 3 | [Corpus étendu](launch-corpus.sh) | Nouveau StreamingVLM terminal scellé, conteneurs possédés arrêtés | 23 octobre, 05:00 UTC |

Les scripts attendent des **dossiers neufs** sous `/home/nvidia/tvlens-setup/reprise-*`, créés sans `results/` avant lancement. Ils vérifient l'appartenance effective au groupe Docker, l'accès au socket, les SHA-256 des archives d'origine et le contenu extrait de chaque paquet. Le lanceur du corpus vérifie aussi l'empreinte de `night_common.py`. Le code des files garde les trois verrous GPU, attend l'inactivité du GPU et d'Ollama, contrôle le prédécesseur et scelle ses sorties ; aucun second ordonnanceur ne doit être lancé.

Déployer ensemble les quatre scripts `common.sh` et `launch-*.sh` dans un dossier de lanceurs neuf. Dans **une nouvelle connexion SSH** avec `ControlMaster=no` et `ControlPath=none`, créer un serveur `tmux` sur un socket unique, distinct du serveur par défaut qui héberge encore Ollama et TVLens. Vérifier dans une session de ce nouveau serveur `id -nG` et `docker ps` avant tout lancement. Ne pas tuer ou redémarrer le serveur `tmux` par défaut, Docker, Ollama ou TVLens. La fermeture des conteneurs ne concerne que ceux créés par ces essais.

Chaque lanceur accepte des racines, **sans** suffixe `/results` :

```sh
bash launch-qwen.sh NEW_QWEN_ROOT NEW_NIGHT_ROOT
bash launch-streaming.sh NEW_STREAMING_ROOT NEW_NIGHT_ROOT NEW_QWEN_ROOT
bash launch-corpus.sh NEW_CORPUS_ROOT NEW_STREAMING_ROOT
```

Les trois commandes se lancent dans des sessions distinctes du même nouveau serveur `tmux`. Elles peuvent rester en attente simultanément, mais **aucun calcul GPU** ne doit se chevaucher : les contrôles de prédécesseur et les verrous assurent la succession. En cas d'échec du Qwen, StreamingVLM se bloque au lieu de sauter silencieusement le prédécesseur. Si StreamingVLM se termine `blocked` pour incompatibilité avec fermeture vérifiée, le corpus peut encore démarrer, conformément à son protocole ; un échec de fermeture le bloque.

Avant de déployer, vérifier les originaux scellés, les fichiers bruts et les empreintes de l'incident, les conteneurs possédés et les processus actifs. Après lancement, consigner pour chaque nouvelle file le chemin, l'heure, l'ID de session, les empreintes des scripts, la session `tmux`, la preuve des groupes Docker et le lien vers les essais interrompus. Les sorties brutes restent sur GX10 ; rapatrier les rapports clos et leurs SHA-256 sans médias, poids ni secret. Aucun résultat de pertinence n'est noté avant annotation humaine (`readyForScoring=false`).

Vérification hors GPU : `bash -n common.sh launch-*.sh`, puis `python3 -m unittest discover -s tests -v` et `node scripts/check.mjs --changed` depuis la racine du dépôt.

Les [quatre dossiers scellés avant travail propre](PREDECESSEURS.md) ont été rapatriés avec leurs empreintes. Ils restent distincts des mesures des reprises.
