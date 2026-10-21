# Corpus étendu GX10 — file expérimentale préparée

Question : la configuration locale de référence tient-elle la cadence et répond-elle de façon exploitable sur trois contenus encore non rejoués : cuisine française parlée, fiction anglaise dialoguée et direct NASA anglais ? On ne compare pas encore la pertinence : les fiches ont le statut `draft_requires_media_review` et `readyForScoring=false`.

Cette file reprend sans modification du produit les rôles de la référence : vision et inspection Gemma3 4B, questions Qwen3.8 27B, embeddings Qwen3 0.6B, trois poids Whisper CUDA (`base`, `small`, `large-v3-turbo`), blocs de 8 s à cinq images JPEG qualité 3, questions aux temps de la sélection. Les neuf replays sont séquentiels et sans transport TV. Les fichiers `questions/` sont les quinze questions seules, sans réponses ni attendus. Leurs SHA-256 et les empreintes des médias vérifiés sur GX10 sont épinglés dans `scripts/queue.py`.

| Média | Langue | Durée rejouée | SHA-256 source |
| --- | --- | ---: | --- |
| Bœuf bourguignon | français | 736 s / 737,501 s | `ec9d70f64ea55dc13a6e5c162a22ce88a383b65d97c442326e6a5045d7c478fd` |
| Tears of Steel | anglais | 728 s / 734,167 s | `efa9062d9cdb7a338e40ad530dfdf234806743f29ae6a1a136b97ece4e588e8f` |
| Artemis I | anglais | 2099 s / 2100 s | `6ac25c124375fdac03a2a3e2bd599ea3516a75e9fd03bb193de18d6575297710` |

Les fins sont bornées sous la durée ffmpeg pour éviter la panne observée sur le dernier bloc de Spring. La dernière question Artemis est à 2096 s, trois secondes avant la borne choisie : elle sera *déclenchée*, mais la fenêtre de contexte après la question est courte ; cette limite doit rester visible dans le rapport. Le tag de flux audio Bœuf indique `eng` alors que la fiche/vidéo est francophone : la langue du scénario est celle de la fiche, et l'écart de métadonnées reste une limite à vérifier à l'écoute. Aucun sous-titre annexe n'est injecté.

## Succession et budgets

Le lanceur attend le statut terminal et le sceau SHA-256 de StreamingVLM. Un échec de compatibilité `blocked` peut être suivi du corpus seulement si ses conteneurs possédés sont inspectés et arrêtés ; `cleanup-failed` bloque. Il prend ensuite, sans attente concurrente sur GPU, les verrous nuit, GPU et référence. Il recontrôle les conteneurs, les processus de replay, les processus GPU et les modèles résidents Ollama. Un état inconnu bloque ou attend ; aucune seconde file GPU n'est autorisée. L'état du prédécesseur et ses empreintes sont copiés dans `gate.json`.

Les trois préparations vidéo sont limitées à 75 minutes chacune, leurs validations à 15 minutes ; chaque replay est limité à durée vidéo + 28,5 minutes. Le plafond global est l'heure `--deadline` (au plus tard 23 octobre 05:00 UTC) ; après celui-ci, aucun nouveau passage ne commence. Durée minimale des neuf médias : environ 2 h 58 ; avec les fins de replay et calcul, réserver environ 5–8 h, sans garantie avant mesure. Une erreur ferme la file sans réessai silencieux. La fermeture n'arrête que les conteneurs créés par ce run (aucun prévu ici), laisse Ollama et les autres services intacts, scelle tous les fichiers du dossier d'essai, puis libère les verrous.

Chaque run garde le `campaign.json` brut, réponses et `acquired:false`, envois, corps et erreurs, les journaux stdout/stderr, mesures de durée et télémétrie CPU/RAM/GPU/Ollama toutes les cinq secondes. `identities.json` fige code, config et modèles ; `integrite.json` scelle les sorties. Les résumés indiquent `readyForScoring=false` et ne calculent aucune note de qualité. Les préparations JPEG/WAV restent côté GX10 et ne vont pas dans Git ; les empreintes et rapports peuvent être rapatriés sans médias/poids/secrets.

## État et lancement

Au 21 octobre, le code et les tests factices sont préparés localement. La file est **déployée et en attente** sur GX10 depuis 22:11 UTC le 20 octobre ; aucune conversion ni inférence de ces trois vidéos n'a été lancée à ce relevé. Son lanceur et ses empreintes sont conservés dans [deployment.json](deployment.json). La commande exacte est figée dans [launch.sh](launch.sh) ; elle est déjà active dans l'unique session `tmux` de ce lot. Le point d'entrée est :

```sh
python3 /home/nvidia/tvlens-setup/corpus-etendu-20261020T221045Z/package/scripts/queue.py \
  --out /home/nvidia/tvlens-setup/corpus-etendu-20261020T221045Z/results \
  --streaming-root /home/nvidia/tvlens-setup/streamingvlm-20261020T220235Z/results \
  --support /home/nvidia/tvlens-setup/nuit-20261020T210107Z/package/scripts/night_common.py \
  --repository /home/nvidia/tvlens \
  --deadline 2026-10-23T05:00:00Z
```

Le dossier `--out` était absent au démarrage. Ne pas lancer une seconde instance : le suivi lit la session et le dossier de résultats existants. Vérification locale hors GPU : `python3 -m unittest discover -s experiments/essais/2026-10-21-corpus-etendu-gx10/tests -v`, puis `node scripts/check.mjs --changed`.

## Résultats du replay étendu

La reprise dans `reprise-corpus-20261020T224923Z` est **terminée** le 21 octobre à 03:11:36 UTC : 21 étapes sur 21 avec code 0, dont neuf replays, et fermeture confirmée. Les [rapports rapatriés](rapatriements/reprise-corpus-20261020T224923Z/RAPATRIEMENT.md) ont été vérifiés par SHA-256 ; l'original et les médias restent sur le GX10.

Les neuf replays ont soumis cinq questions chacun. Les **45 réponses sont acquises** (`acquired=true`), sans annulation ni erreur de question ; 40 résultats sont de type `observation` et cinq de type `insufficient`. La qualité n'est pas notée : `readyForScoring=false` et les fiches de référence demandent encore une relecture humaine. Les durées ci-dessous mesurent la réponse HTTP complète à la question, et non le premier token.

| Whisper | Vidéo | Durée du replay | Médiane HTTP des 5 questions | Pertes de vision : retard / erreur |
| --- | --- | ---: | ---: | ---: |
| base | Bœuf | 745,4 s | 21,44 s | 1 / 0 |
| base | Tears | 737,8 s | 12,23 s | 4 / 1 |
| base | Artemis | 2 120,2 s | 19,11 s | 12 / 3 |
| small | Bœuf | 758,0 s | 18,66 s | 6 / 1 |
| small | Tears | 735,9 s | 11,37 s | 5 / 1 |
| small | Artemis | 2 122,3 s | 18,32 s | 13 / 2 |
| large-v3-turbo | Bœuf | 746,5 s | 23,21 s | 3 / 0 |
| large-v3-turbo | Tears | 746,4 s | 11,41 s | 6 / 1 |
| large-v3-turbo | Artemis | 2 126,4 s | 17,15 s | 13 / 2 |

Au total, la vision a omis **74 publications** : 63 par retard (`backlog`) et 11 par erreur, soit 592 secondes non couvertes sur 10 689 secondes planifiées et environ 94,5 % de couverture temporelle. Aucune perte audio n'est signalée. Ces pertes de vision sont distinctes des réponses aux questions et peuvent réduire la fraîcheur des preuves disponibles au moment de répondre.

Les cinq résultats `insufficient` concernent la dernière question : Bœuf dans les trois variantes, Tears en `base`, Artemis en `base`. Ils sont prioritaires à relire, avec toutes les autres réponses, contre la vidéo et les fiches corrigées. La borne de la dernière question Artemis laisse peu de contexte ultérieur. Ni ces sorties ni les différences de durée ci-dessus ne démontrent une meilleure pertinence d'une variante Whisper ; il faut d'abord une annotation humaine à l'aveugle. Ces mesures concernent un replay local, sans transport ni affichage TV.
