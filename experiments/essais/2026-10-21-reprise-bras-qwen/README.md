# Suffixe Ollama et passage StreamingVLM après le corpus

## État et périmètre

Reprise **déployée et en attente sans charge GPU** depuis le 21 octobre 2026 à 00:25 UTC. Cette reprise corrige le
[faux rejet d’empreinte Qwen](../2026-10-21-incident-digest-qwen/README.md). Elle ajoute de nouveaux
dossiers de résultats sans modifier les paquets ni les traces gelés. Les modèles, prompts, médias,
révisions, paramètres et échéances restent ceux des essais d’origine. L’écart de métadonnée `F16`
Ollama / bfloat16 vLLM sera consigné et interdit d’affirmer une parité BF16 démontrée.

Les fichiers déployés ensemble sont [continuation.py](continuation.py) et
[guards.py](guards.py). Le premier orchestre les deux modes ; le second vérifie l’identité des
modules gelés, les sceaux, les campagnes et les empreintes. Le pré-vol GX10 a vérifié les 25
réponses vLLM et les SHA-256 des modules et paquets gelés avant le lancement des deux attentes.

## Contrat de reprise

1. Vérifier le sceau exact du Qwen d’origine et tous ses 144 fichiers, les 25 réponses vLLM et leurs
   empreintes, le défaut de préfixe et l’absence de tentative d’inférence Ollama dans ce run.
2. Attendre la clôture scellée du corpus `reprise-corpus-20261020T224923Z`, sans interrompre son travail.
   Un état `cleanup-failed` ou une fermeture incertaine bloque. Après prise des trois verrous, revérifier
   les prédécesseurs, les conteneurs possédés, l’absence de replay et l’inactivité GPU/Ollama.
   Pour un prédécesseur `blocked` dont `cleanupConfirmed` est absent, le statut seul ne suffit jamais :
   le contrôle Docker de tous les conteneurs possédés, l’absence de replay et l’inactivité GPU/Ollama
   fournissent la preuve équivalente, conservée dans `gate-probe.json` et `recovery-gate.json`.
3. S’il reste au moins une heure avant le **21 octobre à 05:00 UTC**, vérifier le modèle déjà présent,
   normaliser uniquement son préfixe SHA-256 puis exécuter le pré-vol Ollama d’un cas et les 24 cas
   complets avec la sonde figée. Aucun pull Qwen, changement de poids ou répétition vLLM.
4. Dès que moins d’une heure reste, y compris si le corpus travaille encore, clore le suffixe avec
   `ollamaArm=missing`, `attempted=false`, raison `NO_ONE_HOUR_SLOT_BEFORE_ORIGINAL_DEADLINE`. Le suffixe
   n’a alors aucune étape de commande. Cela signifie « non exécuté faute de créneau », jamais succès
   du modèle. Si le suffixe est démarré après 05:00 UTC, il ne produit que cette preuve d’absence.
5. Streaming attend **à la fois** ce suffixe et le corpus clos. Il accepte seulement un suffixe complet
   sans erreur ou cette absence bornée sans étape exécutée. Un échec d’inférence, de schéma, de
   compatibilité ou d’identité reste bloquant. Il revérifie le paquet Streaming inchangé, ses sources,
   l’image, les poids et les entrées selon le lanceur gelé. Échéance **12:00 UTC**, budget propre de
   **3,5 h**, première phase **90 min**. Aucune tentative après l’échéance.

Le changement de garde Streaming est explicite : le protocole original exigeait un prédécesseur Qwen
`finished` et refusait son `blocked`. `continuation.py` remplace seulement la fonction de garde du
module importé, après contrôle de son SHA-256, et conserve intégralement sa fonction de travail.
Les dossiers d’origine gardent leur état `blocked`. La preuve de continuation cite leurs empreintes.
Cette préparation ne relance aucun échec de compatibilité observé.

Le modèle Ollama conserve le `keep_alive=10m` de la requête originale. Le lanceur n’arrête aucun service
ni modèle résident ; le garde Streaming attend son déchargement naturel après le suffixe. Les conteneurs
Streaming restent gérés par leur propriétaire et arrêtés par le mécanisme gelé.

Le suffixe démarre le moniteur de ressources `Night` seulement après acquisition des verrous, validation
de l’identité et dernière vérification de la réserve d’une heure. Il conserve les requêtes, réponses,
durées, journaux et sceaux de la sonde originale. Ce moniteur additionnel échantillonne toutes les cinq
secondes ; sa présence doit être mentionnée lors d’une comparaison fine de latence avec le vLLM original.
Une absence de créneau ne démarre ni moniteur ni inférence.

## Déploiement et lancement

Les deux racines de résultats et la racine des sources ont été créées neuves, avec une connexion SSH
sans multiplexage possédant le groupe Docker. Les SHA-256 locaux et distants correspondent. Le
[lanceur exact](launch.sh) a ouvert deux sessions dans le socket `tmux` indépendant de la reprise ;
les deux statuts initiaux sont `waiting-corpus-and-predecessors`, zéro étape, stderr vide. Les chemins,
identités et échéances sont consignés dans [deployment.json](deployment.json). Aucun téléchargement ni
appel modèle n'a été déclenché par ce déploiement.

```sh
python3 -B continuation.py ollama --out /home/nvidia/tvlens-setup/reprise-SUFFIXE/results
python3 -B continuation.py streaming --out /home/nvidia/tvlens-setup/reprise-STREAMING/results \
  --suffix /home/nvidia/tvlens-setup/reprise-SUFFIXE/results
```

Les noms ci-dessus sont des exemples à remplacer. Les deux processus peuvent attendre simultanément ;
leurs gardes interdisent les charges concurrentes. Ne jamais lancer l’ancien Qwen complet à leur place.
Toute reprise après une erreur de modèle exige un nouvel arbitrage, sans boucle de réessai.

## Contrôles

Quatorze tests factices passent, sans GPU ni réseau : normalisation stricte, empreinte différente,
sceau altéré, nettoyage échoué, corpus actif, GPU occupé, libération des trois verrous, échéance dépassée,
absence de créneau sans commande, réserve revérifiée juste avant l’inférence, refus d’un suffixe
incompatible, contrôle des réponses scellées, fermeture inconnue et passage réel dans la fonction
`streaming.run` gelée avec les seules charges externes remplacées par des doubles.

```sh
python3 -B -m unittest discover -s experiments/essais/2026-10-21-reprise-bras-qwen/tests -v
node scripts/check.mjs --changed
```

Le contrôle `node scripts/check.mjs --changed` est vert : règles, format, lint, gel, cliquet et tests JS.
Ces tests ne prouvent ni la compatibilité Ollama Qwen ni celle de StreamingVLM sur GB10. Les résultats
restent `readyForScoring=false` jusqu’à l’annotation humaine.

## Résultat du suffixe Ollama

Après la clôture du corpus étendu, le suffixe `reprise-qwen-arm-20261021T002414Z` a terminé ses deux étapes avec code 0 le **21 octobre à 03:27:12 UTC**, fermeture confirmée. Il a produit un pré-vol et 24 réponses complètes, tous HTTP 200, sans nouveau téléchargement et sans rejouer vLLM. Les [traces rapatriées](rapatriements/reprise-qwen-arm-20261021T002414Z/RAPATRIEMENT.md) sont vérifiées par SHA-256.

Sur les 24 cas figés, la durée médiane complète HTTP Ollama est **12,35 s** (minimum 7,86 s ; maximum 17,72 s). Les 24 identifiants de cas et les empreintes de prompt et d'images correspondent au bras vLLM original. [La comparaison détaillée](../2026-10-20-vision-vllm-gx10/README.md) distingue le premier et le second passage ; elle ne mesure ni le premier token ni la qualité des observations. La métadonnée Ollama annonce F16 malgré le nom du tag. StreamingVLM attend le déchargement naturel de ce modèle avant de prendre les verrous GPU.
