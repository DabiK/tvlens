# Pré-vol StreamingVLM sur GX10 — 21 octobre 2026

## Question et état

StreamingVLM peut-il garder un contexte visuel utile sur plusieurs minutes sans que la durée de calcul
et la mémoire augmentent continuellement sur le GPU GB10 ? Dabi a autorisé l'essai dès la fin des
campagnes en cours, y compris si elles se terminent pendant la nuit. Le protocole est **préparé, non
exécuté** ; aucun poids StreamingVLM n'a été téléchargé ni aucune inférence lancée au moment de sa
rédaction. La campagne nocturne GX10 puis la sonde Qwen visuelle gardent l'exclusivité GPU jusqu'à leur
clôture scellée et leur nettoyage confirmé. La file StreamingVLM doit alors démarrer sans attendre Dabi,
dans une fenêtre d'exécution bornée ; un échec des préconditions ou de compatibilité est consigné.

Ce pré-vol ne mesure ni l'application TVLens complète ni un effet causal du seul cache : le checkpoint
StreamingVLM diffère de Gemma3 et Qwen3-VL. Une comparaison avec le même checkpoint en mode recomputation
pourra isoler une partie de l'effet du cache après un premier fonctionnement réussi.

## Sources et configuration figées

- [Code StreamingVLM](https://github.com/mit-han-lab/streaming-vlm/commit/a940d8cbfa14eefe651b7f4adeb81825c28cc6c6) : commit `a940d8cbfa14eefe651b7f4adeb81825c28cc6c6`, licence MIT.
- [Checkpoint BF16](https://huggingface.co/mit-han-lab/StreamingVLM/tree/7ac1cef46d20432053a9814838760318cb26b348) : révision `7ac1cef46d20432053a9814838760318cb26b348`, environ 16,6 Go, Qwen2.5-VL 8B.
- Média témoin : `spring.mp4`, SHA-256 `c2c678f2a70338c060b33608bc34d0a1050cd284e249814b3dac0d85eaaa443a`, sans dialogue annoncé. Questions candidates dans [la fiche Spring](../../gx10/evaluation/fiches/spring.md), encore `readyForScoring=false`.
- Le code officiel utilise une fenêtre visuelle de 16 s, un cache KV compact et des commentaires générés à chaque bloc. Son [article](https://arxiv.org/abs/2510.09608v2) annonce jusqu'à 8 images/s sur H100 : cela ne prédit pas la vitesse sur GB10.

## Crédibilité et transfert au cas TVLens

L'article figure dans les [actes officiels d'ICLR 2026](https://proceedings.iclr.cc/paper_files/paper/2026/hash/6445dd88ebb9a6a3afa0b126ad87fe41-Abstract-Conference.html).
La version publiée liste sept auteurs (Ruyi Xu, Guangxuan Xiao, Yukang Chen, Liuning He, Kelly Peng,
Yao Lu, Song Han), associés au MIT, à NVIDIA et à First Intelligence ; la fiche arXiv v2 n'en affiche
que six, en omettant Kelly Peng. La citation doit donc préciser la version utilisée.

Le 20 octobre 2026, [OpenAlex pour la fiche arXiv](https://api.openalex.org/works/W4417136661)
indique une citation. Ce nombre ne couvre pas nécessairement l'article ICLR et n'est ni un verdict de
qualité ni un total bibliométrique consolidé. Le code, le checkpoint et les jeux de données sont publics,
mais aucune reproduction indépendante sur GB10 n'a été vérifiée. L'évaluation publiée concerne des vidéos
sportives longues et un duel jugé automatiquement ; TVLens doit encore mesurer sa propre vitesse et sa
pertinence sur ses extraits. Les chiffres H100 restent hors de ce bilan matériel.

L'[image PyTorch NVIDIA 26.09](https://catalog.ngc.nvidia.com/orgs/nvidia/-/containers/pytorch/26.09-py3/tags?_lr=1)
publie un manifeste ARM64 précis ; ses [notes de version](https://docs.nvidia.com/deeplearning/frameworks/pytorch-release-notes/rel-26-09.html)
annoncent CUDA 13.4.1 et FlashAttention 2. Cela fournit une base de pré-vol, mais ne démontre pas
que les noyaux FlashAttention requis par StreamingVLM fonctionnent sur GB10. Le pré-vol doit le tester
explicitement et conserver toute incompatibilité comme résultat.

Le [lanceur de file](scripts/queue.py) accepte cette image **seulement par digest**. Il vérifie les deux
campagnes précédentes scellées, la fermeture de leurs conteneurs, trois verrous exclusifs, le GPU inactif
et le média Spring avant tout téléchargement. Son échéance de démarrage et d'exécution est le
21 octobre à 12 h UTC ; après l'ouverture du créneau, il plafonne sa propre durée à trois heures et
demie, dont 90 minutes pour l'image, les dépendances, le checkpoint et le passage de 16 secondes.

Le dépôt officiel demande Decord 0.6.0, sans roue ARM64 publiée. Si absent de l'image NVIDIA, une
image dérivée temporaire compile [FFmpeg 4.4.8](https://ffmpeg.org/download.html) depuis son archive
contrôlée par SHA-256 puis [Decord v0.6.0](https://github.com/dmlc/decord/tree/v0.6.0) en décodage CPU,
avec un plafond de 40 minutes. Les autres modules Python nécessaires sont épinglés et installés sans
remplacer Torch, CUDA ni FlashAttention ; les versions avant/après, commandes et journaux sont conservés.
Une incompatibilité de compilation, d'import ou de noyau CUDA interrompt proprement l'essai.

## Étapes bornées

1. Après la fin scellée des campagnes de nuit, vérifier disque, RAM, GPU inactif, image ARM64, CUDA, versions et imports. Ne pas lancer `scripts/env_infer.sh` tel quel : il mélange plusieurs versions et montre une roue FlashAttention x86_64. Installer seulement dans un environnement ou conteneur isolé, avec versions et empreintes consignées. Un échec ARM64/FlashAttention est une mesure de compatibilité, pas un motif de modifier silencieusement le modèle.
2. Télécharger la révision publique du checkpoint dans un cache neuf et empreinter tous les fichiers ; préserver les poids hors Git. Vérifier la vidéo et démarrer un unique essai de 16 s avec le [lanceur borné](scripts/run_streamingvlm.py), sans sortie existante. Limite de préparation et essai court : 90 minutes ; un seul essai par configuration.
3. Si l'essai court fonctionne, traiter Spring par préfixes de 72 s puis jusqu'à 372 s dans des dossiers distincts. Relever temps par bloc (décodage vidéo, préparation, génération, maintenance du cache), latence totale, RAM/GPU, taille du cache, erreurs et texte brut. Plafond supplémentaire : deux heures. Arrêter si la cadence dérive, si la mémoire manque ou si le contexte est incohérent.
4. Seulement si les sorties sont fiables, comparer un préfixe court identique avec cache réutilisé et avec `recompute=True` du même code/checkpoint. Ne pas lancer les deux en parallèle. Conserver premier chargement et régime chaud séparément.

La question après un événement ancien demande une instrumentation supplémentaire : l'entrée CLI officielle
ne permet pas de poser une nouvelle question en milieu de flux. Le pré-vol de 16 s teste d'abord la boucle
continue et sa cadence ; il ne valide pas encore le rappel ancien. Le contrôle de pertinence attend la
relecture humaine des fiches. Les réponses, erreurs et absences de preuve restent disponibles pour annotation.

## Arrêt, traces et suite

Une seule charge GPU à la fois. Chaque commande garde stdout/stderr, heure, version, état des ressources,
code de sortie, entrées et SHA-256. Arrêt propre du conteneur possédé par ce run et preuve de fermeture ;
ne pas toucher aux services existants. Aucun essai sans borne de temps et aucun effacement de résultats.
Si le chemin officiel échoue sur GB10, documenter la cause exacte et préparer un autre environnement
compatible, sans présenter une sonde vLLM ordinaire comme un test du cache StreamingVLM.

Sources supplémentaires : [script d'installation officiel](https://github.com/mit-han-lab/streaming-vlm/blob/a940d8cbfa14eefe651b7f4adeb81825c28cc6c6/scripts/env_infer.sh), [dépendances officielles](https://github.com/mit-han-lab/streaming-vlm/blob/a940d8cbfa14eefe651b7f4adeb81825c28cc6c6/infer_requirements.txt), [guide NVIDIA Spark](https://build.nvidia.com/spark/unsloth/instructions), [FlashAttention](https://github.com/Dao-AILab/flash-attention).
