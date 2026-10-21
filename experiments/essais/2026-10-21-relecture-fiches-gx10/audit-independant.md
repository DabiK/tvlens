# Audit indépendant des trente questions exportées

Lecture des fiches, des preuves ASR/SRT et des images ponctuelles déjà conservées le 21 octobre. Ce relevé n'utilise aucune réponse de la campagne comme oracle. Il ne remplace ni l'écoute ni le visionnage des six préfixes : les transcriptions automatiques peuvent déformer les mots, les sous-titres n'identifient pas tous les locuteurs et les images fixes n'établissent pas la durée d'une action. Les six fiches restent provisoires et `readyForScoring=false`.

| Vidéo | Questions dont le texte attendu est soutenu par les preuves disponibles | Contrôles avant validation |
| --- | --- | --- |
| CNRS | `cnrs-01`, `02`, `04`, `05`, `06` : les cinq thèmes apparaissent dans [`cnrs-W_8OhdeQs4Y.segments.json`](../../gx10/evaluation/preuves/fr/cnrs-W_8OhdeQs4Y.segments.json). | Réécouter les passages, puis vérifier chaque pose et la piste réellement donnée au replay. L'ASR automatique seul ne valide pas les attendus. |
| Bœuf | `cuisine-02`, `03`, `05`, `06`, `07` : ingrédients, ordre et durées se retrouvent dans [`cuisine-koEDMDuAw0k.segments.json`](../../gx10/evaluation/preuves/fr/cuisine-koEDMDuAw0k.segments.json). | Identifier la piste française employée et contrôler audio/vidéo, surtout `cuisine-07` où les trois réponses initiales sont `insufficient`. |
| Kennedy | `kennedy-01` et `05` ont une concordance ASR nette dans [`kennedy-asr.json`](../../gx10/evaluation/preuves/kennedy-asr.json). | Réécouter `03`, `06`, `08` ; leurs formulations ou fenêtres de preuve sont ambiguës ou trop courtes. |
| Tears | `tears-07` suit « 90 % » puis « complete » dans le [SRT](../../gx10/evaluation/preuves/en/TOS-en.srt). | Vérifier les locuteurs de `01`, `03`, `04`, `06` sur la vidéo ; le SRT soutient les répliques, pas leur attribution. |
| Artemis | `artemis-01`, `02`, `04`, `05` sont soutenues par l'[ASR](../../gx10/evaluation/preuves/en/artemis-2h50-3h25.json). | Écouter la source et réaligner `artemis-07`. Le fragment à 03:24:43 complète « 30 seconds now until » à 03:24:40 ; il n'annonce pas, à lui seul, une coupure déjà survenue. |
| Spring | `spring-01`, `02`, `03`, `06` sont cohérentes avec les [images ponctuelles](../../gx10/evaluation/preuves/spring/). | Contrôler les images réellement soumises et le film continu ; à `04:28`, l'image témoin de `spring-04` est déjà vieille de 18 s. |

## Corrections candidates, non appliquées à l'oracle

| Question | État figé | Proposition à confirmer sur le média source |
| --- | --- | --- |
| `kennedy-03` | Attendu « problèmes, dangers et ignorance nouveaux ; coûts et risques élevés, bénéfices importants », preuve 01:36–02:00, pose 02:08. | Conserver temps et sens, mais réécouter « risks/benefits » : l'ASR [`kennedy-asr.json`](../../gx10/evaluation/preuves/kennedy-asr.json) rend des mots absurdes dans ce segment. Ne pas corriger le texte d'après l'ASR seul. |
| `kennedy-06` | Preuve 04:00–04:24, pose 04:32. | Étendre provisoirement la fenêtre à 04:00–04:32 et déplacer la pose vers 04:40 : connaissance/compréhension apparaissent dans le bloc ASR 04:24–04:32. Réécouter pour confirmer le terme manquant avant de figer. |
| `kennedy-08` | Preuve 05:20–05:52, pose 06:00. | Étendre provisoirement à 05:20–06:00 et poser vers 06:08 : le mot « war » apparaît dans le bloc ASR 05:52–06:00. Confirmer à l'écoute la formulation opposée. |
| `artemis-07` | Preuve source 03:24:22–03:24:28, pose locale 34:56. | Étendre la preuve jusqu'à environ 03:24:45 pour inclure « 30 seconds until core stage main engine cut off » et vérifier l'alignement source/local à l'écoute. Ne pas assimiler la phrase à une coupure déjà survenue. |
| `spring-04` | Image témoin 04:10, pose 04:28. | Un contrôle direct du fichier local entre 04:06 et 04:33, par images toutes les trois secondes, montre le bâton lumineux au début puis un autre plan où il n'est plus visible à la pose. Vérifier les images et la mémoire du replay ; avancer éventuellement la pose vers 04:10–04:15 ou reformuler en rappel, puis regeler toutes les variantes sur la même pose. |

Les heures ci-dessus sont des **candidats de correction**, pas une nouvelle vérité terrain. Les snapshots et les réponses des campagnes restent inchangés. Après relecture humaine datée, publier un oracle corrigé séparé, de nouveaux SHA-256 et un paquet de notation correspondant ; ne jamais modifier rétroactivement les résultats bruts.

Le contrôle ponctuel du film `spring.mp4` a utilisé le fichier local au SHA-256 `c2c678f2a70338c060b33608bc34d0a1050cd284e249814b3dac0d85eaaa443a` et la commande `ffmpeg -ss 246 -i media/samples/spring.mp4 -t 27 -vf 'fps=1/3,scale=480:-1,tile=9x1' -frames:v 1 ...`. Le photogramme composite temporaire n'est pas un nouveau média de référence et n'est pas versionné. Il confirme un changement de plan, pas la visibilité dans toutes les images effectivement envoyées au VLM.
