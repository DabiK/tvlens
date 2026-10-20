# Nuit GX10 — 20 au 21 octobre 2026

Objectif : comparer vitesse et pertinence, puis essayer vLLM sans modifier l'application TVLens.

**Lancement constaté à 21:02 UTC / 23:02 Paris** : processus distant Python PID 819916 dans tmux `tvlens-nuit`,
état `waiting-reference`, aucun stderr. Six campagnes de référence sur neuf terminées à ce point.
Chemins exacts et ID d’exécution dans `deployment.json` ; preuve brute dans `preuves/dispatched-state.json`.
Autorisation utilisateur : préparation en parallèle, poursuite des expériences pendant la nuit, vLLM inclus,
conservation de toutes les traces. Dabi a ensuite autorisé des commits locaux réguliers ;
les points de sauvegarde conservent sources, protocoles et preuves textuelles, sans modifier le lot distant.
Il a ensuite autorisé le téléchargement des poids visuels publics, le rapatriement progressif des rapports
et le push des commits sur `main`. L'[essai visuel complémentaire](../2026-10-20-vision-vllm-gx10/README.md)
reste séparé et doit attendre la clôture de cette séquence.

## Séquence et arrêt

Le lanceur attend la clôture du lot de référence (neuf campagnes) et vérifie leurs sorties, les cinq questions,
la confirmation d'archivage et la libération des ressources. Une abstention est conservée comme abstention ;
la validation technique n'est pas une validation de pertinence.
Les questions `done` mais `acquired:false` sont listées séparément dans `unacquiredQuestionIds` : elles ne sont
pas des réponses mesurées. Elles ne bloquent pas les nouvelles ablations indépendantes si la clôture est confirmée.

1. Ablation perception : cinq contre trois images, douze blocs, ordre A/B/B/A, plafond 45 minutes.
2. Ablation concurrence : vision pendant les questions activée/désactivée, CNRS entier, A/B/B/A, plafond 80 minutes.
3. Sonde questions Ollama : dix prompts CNRS/Kennedy figés, deux passages, plafond 20 minutes.
4. Téléchargement de l'image ARM64 et du modèle public, empreintes des fichiers, vérification CUDA.
5. Démarrage vLLM local ; mêmes dix prompts, deux passages, plafond 20 minutes.

Les téléchargements lourds et les inférences ne démarrent pas pendant le lot de référence. Aucun appel modèle
n'a été ajouté pendant la préparation. Les lectures SSH, la configuration Docker/CDI et le transfert du paquet
ont lieu pendant ce lot ; cette activité administrative légère reste une limite de contrôle de l'environnement.
Les étapes GPU sont séquentielles. Arrêt global le **21 octobre à 05:00 UTC / 07:00 Paris**, plus la marge
bornée de fermeture. Attente du lot initial : deux heures maximum. Aucun réessai automatique.

Un échec arrête la chaîne et conserve sa cause. Les verrous de la référence et des expériences sont vérifiés.
Le processus tourne sur le GX10 dans tmux et survit à la déconnexion du Mac. Le suivi Codex dépend du Mac actif.

Le 20 octobre à 22:35 UTC, le téléchargement Docker s'est arrêté sur un refus d'accès au socket ;
les étapes précédentes sont scellées. [L'incident, ses journaux et ses empreintes](incidents/20261020T2244/)
sont conservés à part pour la reprise des seules étapes incomplètes.

## Configuration vLLM figée

- Image officielle `vllm/vllm-openai:v0.28.0`, sélection ARM64 :
  `sha256:2a7cde230b59f3ce6cab33dd245ba6bee41aa87b38c9fe84f966ff24016813ce`.
- Modèle `nvidia/Qwen3.8-27B-NVFP4`, révision `482ca0f3832238542f8f5295dde86b5f22711d80`, public non gated.
- Port `127.0.0.1:8001`, contexte 16384, une séquence, KV FP8, fraction mémoire GPU 0,45,
  sortie 1024 tokens, température 0, raisonnement désactivé dans chaque requête, configuration de génération vLLM.
- Aucun code distant de modèle autorisé. Poids téléchargés séparément ; serveur en mode HF hors ligne.
- Conteneurs avec UUID, label de propriété et CID enregistrés. Arrêt vérifié après expérience ou incident ;
  une fermeture non confirmée est un échec. Les conteneurs arrêtés, images, caches et journaux sont conservés.

Le script actuel NVIDIA sur GitHub utilise v0.28.0 ; la page web mentionne encore le tag qwen38.
Le script GitHub est archivé dans `sources/`. Nous réduisons contexte, concurrence et mémoire, retirons
la spéculation DFlash et l'appel d'outils pour une première comparaison bornée. Ce paramétrage n'est pas optimal
par hypothèse et n'est pas encore validé par une inférence réelle au moment de la préparation.

Docker 28.3.3 était installé mais le compte nvidia n'appartenait pas au groupe docker et aucun GPU CDI n'était
déclaré. Groupe ajouté avec l'autorisation fournie ; `/etc/cdi/tvlens-gpu.yaml` généré par NVIDIA Container Toolkit.
Trois identifiants CDI sont désormais listés. Aucun redémarrage du démon ni modification d'Ollama.
Aucun mot de passe n'est enregistré dans les scripts, manifests ou résultats.

## Traces et interprétation

`deployment.json` donne les chemins distants exacts et la commande tmux. Le paquet transféré est empreinté,
ainsi que le corpus et les plans. `results/status.json` donne l'étape courante ; `events.jsonl` garde les transitions.
Chaque commande conserve arguments, dates, code de sortie, stdout/stderr. Télémétrie système/GPU toutes les cinq
secondes après la référence ; réponses brutes, requêtes, erreurs, citations, versions et SHA-256 sont conservés.
Les résultats sont scellés à la fermeture dans `integrite.json`. La référence reste intégralement dans son dossier
distant d'origine ; le suivi doit archiver et rapatrier les deux ensembles après clôture.

Le client expérimental traduit les deux protocoles HTTP. Un futur remplacement applicatif d'Ollama nécessitera
un adaptateur pour les outils et les événements ; ce lanceur ne change pas les backends de l'application.
La comparaison questions porte sur le composant de réponse depuis un contexte figé, pas sur le flux TV complet.
L'ordre est Ollama puis vLLM, deux passages chacun : effet de l'ordre et du temps non neutralisé.
Q4_K_M contre NVFP4 implique modèle quantifié, tokenizer/template et moteur : aucun gain attribué au moteur seul.
Premier appel conservé, état froid/chaud non supposé. TTFT non mesuré par la sonde non streaming ; délais complets
et métriques fournisseur disponibles sont conservés. Aucune note automatique de pertinence : `readyForScoring=false`.

## Vérification

Les fixtures locales vérifient clôture avec abstention, refus d'une ressource non libérée, code de sortie,
timeout, intégrité et propriété des conteneurs lors de leur fermeture. Les neuf scénarios HTTP factices de la
sonde sont conservés dans le kit client. Le contrôle `node scripts/check.mjs --changed` est vert ; bruts dans `preuves/`.
Ces contrôles ne prouvent pas la compatibilité effective du modèle avec le GX10 : le pré-vol nocturne la vérifiera.

Premier rapatriement : l'ablation perception est terminée et vérifiée techniquement. Ses 46 fichiers clos
(3 835 858 octets), hors médias et archive de code, sont dans
[`preuves/rapatriement-20261020/perception/`](preuves/rapatriement-20261020/perception/).
Une comparaison `rsync --checksum` n'a signalé aucun écart ;
[`l'inventaire SHA-256`](preuves/rapatriement-20261020/perception-inventaire.json) donne les empreintes.
La variation vision/questions est encore en cours au moment de cette copie ; aucun fichier actif de ce bras
n'a été rapatrié. Les résultats de l'ablation perception ne sont pas encore interprétés ni notés.

L'[ordre opérationnel et l'extension aux six vidéos](ordre-et-suite.md) distinguent les étapes lancées,
la file StreamingVLM en préparation et les variations de langue/audio encore à préparer.

Sources primaires consultées le 20 octobre :

- [NVIDIA Spark, instructions vLLM](https://build.nvidia.com/spark/vllm/instructions).
- [Script NVIDIA Spark 128 Go](https://github.com/NVIDIA/dgx-spark-playbooks/blob/main/nvidia/playbook-vllm/assets/sync-vllm-spark-128gb-qwen38-27b.sh).
- [Modèle NVIDIA](https://huggingface.co/nvidia/Qwen3.8-27B-NVFP4).
- [NVIDIA, génération CDI](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/cdi-support.html).
- [Docker, appareils CDI](https://docs.docker.com/reference/cli/docker/container/run/#cdi-devices).

Les réponses des registres, la configuration modèle et la recette sont archivées dans `sources/`.
