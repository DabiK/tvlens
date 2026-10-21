# Incident de résolution Python du pilote StreamingVLM

Le run `reprise-streaming-past-20261021T041930Z` a terminé sa couche `future`, sa sonde CUDA/amont
et son téléchargement de checkpoint. Il s'est arrêté à 04:31:02 UTC au premier pilote de 16 s :
`ImportError: cannot import name 'Queue' from 'queue' (/runner/queue.py)` pendant l'import de Torch.
Le répertoire du script `/runner` masquait le module standard `queue`. Aucun résultat du modèle
n'a été produit ; ceci ne démontre aucune incompatibilité du modèle avec GX10.

Le sceau terminal observé est `a1e4cd6aaf822fb0d4644d24c3888c8ee762216a0e36e8e01d818cb4088b5bcc`.
Le statut interne du pilote, root et 0700, a été lu via un conteneur sans réseau, GPU ni montage
inscriptible. Son SHA-256 est `01e0125e5488d42a0d086ee87b4a10e170da4f7b0614ab6ce026b2c3eaa7901d`.
Ce statut interne n'est pas couvert par le sceau externe, car le processus hôte ne pouvait pas
parcourir son répertoire ; la reprise le vérifie séparément par cette empreinte observée.

## Correction déployée

`continuation.py` reprend uniquement dans le dossier neuf
`/home/nvidia/tvlens-setup/reprise-streaming-queue-20261021T044930Z` :

- Ajout de `-P` à l'invocation Python 3.12 du script figé : son dossier n'est plus ajouté à `sys.path`.
  Le script, ses arguments, `__main__`, `__file__` et ses imports amont explicites sont conservés.
- Exécution des seuls pilotes avec UID:GID `1000:1000` et `HOME=/tmp`. Cela rend leurs nouveaux
  dossiers 0700 lisibles par le contrôleur nvidia et évite de déplacer le même problème vers la
  lecture finale du statut. Les anciens dossiers root restent inchangés.
- Réutilisation par ID exact de l'image corrigée
  `sha256:0ae5d7785eadb9a9983f149a6a3921cffb7e3c325e0cd183b06f2eed5d2d919d`, de la sonde réussie et du cache
  `streaming-hf-acb4fff8e97240408da9db3acdc6cb20` du prédécesseur. Chaque fichier du checkpoint est
  relu et rehaché avant utilisation ; aucun téléchargement, build ou nouvelle sonde GPU.
- Protocole, modèle, vidéo, package et amont figés, trois verrous et admission sans attente conservés.
  Aucun recommencement automatique. Le début reste 03:37:16.052779 UTC, la limite courte
  05:07:16.052779 UTC et la limite totale 07:07:16.052779 UTC. Un retard ne réinitialise aucun budget.

## Vérification observée

Cinq tests Python locaux réussis : reproduction du masquage puis suppression avec `-P`, conservation
sémantique de l'invocation, transformation limitée aux pilotes, empreintes du checkpoint et refus
après mutation, restitution des verrous et conservation des échéances. Syntaxe de `launch.sh` vérifiée.
Le contrôle global du projet n'a pas été lancé dans cette sous-tâche.

La sonde distante CPU [readonly-probe.json](readonly-probe.json), sans GPU ni réseau, a confirmé que
UID:GID 1000:1000 importe Torch, résout le `queue` standard et peut ouvrir les 16 fichiers du checkpoint.
L'image et le cache étaient montés en lecture seule ; seul `/tmp` était un tmpfs éphémère. La première
sonde, sans tmpfs, avait échoué car l'import de Torch/dill demande un répertoire temporaire inscriptible ;
ce problème provenait de la contrainte de lecture seule de la sonde, pas du futur pilote normal.
Les périphériques NVIDIA observés sont accessibles en lecture/écriture à tous, sans essai GPU exécuté.
L'inférence sous UID nvidia et la compatibilité effective du modèle restent à vérifier par la reprise.

L'orchestrateur a lancé une seule fois `launch.sh` à 04:49:31 UTC, après contrôle du SHA-256 des deux
sources sur le GX10. À 04:49:41 UTC, le run était au stade `pilot-16`, sans erreur enregistrée.
Les quatre pilotes ont ensuite fini avec un code de sortie nul : 16 s, 72 s, 372 s et 16 s avec
recalcul. Le run est scellé `finished` à 05:07:43 UTC, avec `cleanupConfirmed=true`. Les
78 fichiers de son manifeste ont été vérifiés sur le GX10 ; la copie locale vérifiée et ses exclusions
sont détaillées dans [RAPATRIEMENT.md](rapatriements/reprise-streaming-queue-20261021T044930Z/RAPATRIEMENT.md).
Les mesures et leur portée sont dans [BILAN.md](BILAN.md). Le modèle s'exécute sur le GX10, mais le
passage de 372 s n'atteint pas le temps réel et aucune pertinence n'est encore notée.
