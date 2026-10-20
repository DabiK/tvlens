# Incident Docker du lot GX10 — 20 octobre 2026

À 22:35:59 UTC, la campagne nocturne s'est scellée en état `blocked` à l'étape
`docker-pull`, immédiatement après la sonde de questions Ollama. Le journal brut
`night/results/docker-pull/stderr.log` indique un refus d'accès à
`/var/run/docker.sock`. Les files Qwen visuel, StreamingVLM et corpus étendu,
encore sans charge GPU, se sont alors scellées en état `blocked` par dépendance.

Les étapes antérieures du lot principal ne sont pas à rejouer : les ablations
perception et vision/questions sont terminées et leurs sceaux correspondent au
sceau global ; la sonde Ollama compte 20 réponses retournées sur 20, et son
`campaign.json` est aussi couvert par le sceau global. Le téléchargement Docker
est la première étape incomplète. Aucune inférence vLLM n'a eu lieu dans ces
quatre dossiers.

La connexion SSH fraîche du compte `nvidia` voit le groupe Docker et exécute
`docker info` et `docker ps`. Le serveur `tmux` par défaut avait démarré avant
l'ajout du compte au groupe Docker et conservait ses anciens groupes, sans
Docker. Les nouvelles sessions créées sur ce même serveur hériteraient encore
de cet état. Un serveur `tmux` sur socket indépendant a été testé depuis une
connexion SSH fraîche : son processus possède le groupe Docker et `docker ps`
réussit. Son script et ses sorties sont dans `docker-access-check/`. Aucune modification du démon, des autres services ou des résultats
originaux n'est requise.

Les fichiers bruts de chaque file sont conservés dans les sous-dossiers
`night/`, `qwen/`, `streaming/` et `corpus/`. Leur archive de transfert, créée
sur le GX10 et copiée localement, avait le SHA-256
`6fd7aecbb6d56f2c2cf5edbfef5b5a9847a8872e307f7b14cb590caa55019f7b`
et 130 993 octets. Les fichiers extraits sont inventoriés dans
`fichiers-sha256.json`. Les originaux distants restent en place. Aucun poids,
média, identifiant ou configuration secrète n'a été copié dans ce dossier.

La reprise doit exécuter seulement la suite vLLM du lot principal dans un
dossier neuf horodaté, à protocole identique. Les files suivantes seront
recréées en dossiers neufs avec des références vers les nouveaux prédécesseurs,
une seule charge GPU à la fois et les mêmes échéances. Toute intervention,
commande de lancement et résultat sera ajoutée ici après vérification.
