# Installer le serveur sur son propre Linux

Ce guide installe le moteur sans Electron. Il ne modifie aucune TV et ne donne accès à aucune installation existante. Le déploiement de référence est décrit séparément dans [le rapport VPS](vps-deployment.md).

> **Code du 13 octobre 2026 : exécuté sous Linux depuis le 13 octobre au matin, par quelques essais courts seulement.** Les sessions conservées, la surveillance, le plafond de cinq minutes et le cloisonnement des agents décrits ci-dessous sont prouvés par tests hors ligne et, pour le cloisonnement, par des tours réels sur un Mac. Ils ont été installés sur le serveur de référence le 13 octobre 2026 par la supervision ; le service y a d’abord planté deux fois, faute d’une limite de tâches suffisante (voir « Limite de tâches » plus bas et le livrable, section 13). Avant de les mettre en service, lire [le livrable](night-features-delivery.md), section « Avant tout déploiement », et [SECURITY.md](../SECURITY.md).

## Prérequis

- Linux x86_64 ou ARM64, Node.js 24+, npm, Git, Python 3, FFmpeg.
- Whisper.cpp et son exécutable `whisper-cli`, compilés pour l’hôte ; modèle multilingue base.
- Codex CLI compatible avec le client App Server du projet, authentifié avec un compte ayant accès aux modèles sélectionnés. La version 0.158.0 est celle du déploiement de référence, testée avec le code d’avant le 13 octobre 2026. Le cloisonnement du code actuel n’a été mesuré que sur `codex-cli 0.160.1`, sous macOS : sur toute autre version, suivre d’abord [SECURITY.md](../SECURITY.md), « Avant tout déploiement ».
- Pour la TV distante : serveur et appareil dans le même réseau Tailscale. Aucun exit node requis.

Le serveur partagé testé dispose de 8 Go de RAM. Ce chiffre n’est pas un minimum universel ni une garantie de débit continu ; voir les mesures de retard dans le rapport.

## Essai sous son utilisateur

```sh
git clone https://github.com/DabiK/tvlens.git
cd tvlens
npm ci --omit=dev
cp .env.example .env.local
```

Installer FFmpeg et Whisper.cpp avec les outils adaptés à son système. Par exemple, après avoir cloné les [sources officielles de Whisper.cpp](https://github.com/ggml-org/whisper.cpp) dans un répertoire dédié :

```sh
cmake -S /chemin/whisper.cpp -B /chemin/whisper.cpp/build -DCMAKE_BUILD_TYPE=Release
cmake --build /chemin/whisper.cpp/build --target whisper-cli -j2
export TVLENS_WHISPER_BINARY=/chemin/whisper.cpp/build/bin/whisper-cli
npm run setup:speech
```

`setup:speech` télécharge le modèle base et vérifie son SHA-256. Sur Linux, le script demande que Whisper soit déjà installé ; il ne lance pas Homebrew ni d’installation système automatique. Le modèle est placé dans `.local/models/ggml-base.bin`, ou dans `TVLENS_WHISPER_MODEL` si cette variable est définie.

Les exécutables sont cherchés dans le PATH, puis les emplacements usuels ; les chemins explicites `TVLENS_FFMPEG`, `TVLENS_WHISPER_BINARY` et `TVLENS_CODEX_BINARY` ont priorité. La configuration peut venir de `.env.local` ; les variables d’environnement ont priorité. Un fichier `.env.local` absent n’est pas une erreur : OpenRouter est facultatif.

```sh
codex login status
# Si nécessaire sur une machine sans navigateur : codex login --device-auth
export TVLENS_BIND=127.0.0.1
export TVLENS_SERVER_DATA="$HOME/.local/share/tvlens"
npm run start:server
```

Le serveur crée un jeton aléatoire dans `$TVLENS_SERVER_DATA/device-token`. Ne pas copier ce jeton dans un ticket ou un commit. Les routes applicatives refusent les requêtes non authentifiées.

## Service systemd

Les fichiers `deploy/` sont des modèles à adapter. Ils supposent :

| Élément | Emplacement du modèle |
| --- | --- |
| Code et dépendances serveur | `/opt/tvlens/app` |
| Codex 0.158.0, installation npm séparée | `/opt/tvlens/codex/node_modules/.bin/codex` |
| Whisper et modèle | `/opt/tvlens/whisper/build/bin/whisper-cli`, `/opt/tvlens/models/ggml-base.bin` |
| Utilisateur/service | `tvlens`, home `/var/lib/tvlens` |
| Configuration | `/etc/tvlens/server.env` et `/etc/tvlens/runtime.env` |
| Données et compteurs | `/var/lib/tvlens/data`, `/var/lib/tvlens/usage` |

Créer l’utilisateur système dédié, installer le code et les outils aux chemins choisis, puis préparer les répertoires et configurations :

```sh
sudo useradd --system --create-home --home-dir /var/lib/tvlens --shell /usr/sbin/nologin tvlens
sudo install -d -o tvlens -g tvlens -m 700 /var/lib/tvlens/data /var/lib/tvlens/usage /var/lib/tvlens/.codex
sudo install -d -o root -g tvlens -m 750 /etc/tvlens
sudo install -o root -g tvlens -m 640 deploy/server.env.example /etc/tvlens/server.env
sudo install -o root -g root -m 600 deploy/runtime.env.example /etc/tvlens/runtime.env
```

Adapter les chemins dans les fichiers et l’unité. Authentifier Codex sous l’utilisateur du service, plutôt que de recopier la configuration personnelle complète d’un autre compte :

```sh
sudo -u tvlens env HOME=/var/lib/tvlens CODEX_HOME=/var/lib/tvlens/.codex \
  /opt/tvlens/codex/node_modules/.bin/codex login --device-auth
```

Dans `/etc/tvlens/runtime.env`, remplacer `127.0.0.1` par **l’adresse de son propre serveur** donnée par `tailscale ip -4`. Garder loopback pour un essai local ; ne pas utiliser `0.0.0.0` pour une installation privée. Ne jamais recopier une adresse d’un rapport d’essai comme configuration réelle.

```sh
sudo install -m 644 deploy/tvlens.service /etc/systemd/system/tvlens.service
sudo systemd-analyze verify /etc/systemd/system/tvlens.service
sudo systemctl daemon-reload
sudo systemctl enable --now tvlens
sudo systemctl status tvlens
ss -ltn 'sport = :8787'
```

**Limite de tâches (`TasksMax`).** Chaque fil d’exécution de chaque processus du service compte, et chaque rôle Codex est un processus enfant : environ 38 tâches par rôle connecté (mesuré le 13 octobre 2026 sur un serveur à 2 vCPU, Codex 0.158.0, sans tour de modèle : cinq rôles connectés ensemble, 163 tâches ; neuf, 347). Le serveur garde au plus sept rôles vivants (chat, description des passages, réexamen, lecture de surveillance, un à trois postes de vérification ; cinq avec le poste unique par défaut), et un arrêt suivi d’un redémarrage de la surveillance fait coexister quelques secondes les rôles qui se ferment et les nouveaux : neuf arbres de processus au pire. Le modèle fixe donc `TasksMax=512`, qui couvre cette pointe. Avec l’ancienne valeur de 128, démarrer une surveillance suffisait à atteindre la limite : le noyau refusait un `fork`, puis, faute de tâche disponible, le traitement d’images du serveur faisait planter son processus (SIGSEGV, reproduit dans une unité isolée), qui redémarrait sans sa session — la TV affichait alors « Serveur redémarré ou session changée ». À 256, neuf connexions simultanées ne tiennent pas non plus (8 sur 9). Une unité installée avant cette date garde 128 tant qu’elle n’est pas réinstallée ou corrigée par un drop-in. Vérifier sur un service en marche :

```sh
systemctl show tvlens -p TasksCurrent -p TasksMax
journalctl -k --since today | grep 'fork rejected by pids controller'   # aucune ligne attendue
```

Le service lit `runtime.env` pour l’écoute et `server.env` pour les fournisseurs. Les réglages d’hôte (plafond des questions, conservation, seuils disque, surveillance) et ceux du cloisonnement sont lus dans l’**environnement du service**, donc dans `runtime.env` : écrits dans `server.env`, ils sont ignorés sans message. Les compteurs sont enregistrés dans `TVLENS_USAGE_DIR`, sans écriture dans `/etc`. L’unité limite les ressources et l’accès disque ; ajuster les limites après mesure sur sa propre machine. Aucun proxy public ni Tailscale Funnel n’est nécessaire.

## Modèles et langue audio

Dans `$TVLENS_SERVER_DATA/models.json`, définir les identifiants accessibles au compte du service. Exemple de configuration du déploiement de référence :

```json
{"codexModel":"gpt-6-luna","observationModel":"gpt-6-luna","inspectionModel":"gpt-6-luna"}
```

Créer ce fichier sous l’utilisateur du service, permissions `0600`. Sans fichier, chat = modèle par défaut du compte et vision/réexamen = Luna. Redémarrer le service pour charger les modèles ; cela archive la session en cours, qui reste sur disque et se rouvre depuis la liste des sessions.

`TVLENS_CHAT_REASONING_EFFORT=max` dans `runtime.env` configure l’effort du chat si le modèle le supporte. Sans variable, l’effort vaut `low`. Ce réglage n’accélère pas nécessairement les réponses et n’est pas appliqué à la vision/réexamen. Le traitement d’une question est plafonné à cinq minutes, hors file ; `TVLENS_QUESTION_TIMEOUT_MS` abaisse ce plafond.

La langue audio du serveur vaut `fr` au premier démarrage. Le bouton Audio de la TV enregistre `fr`, `en` ou `auto` dans `$TVLENS_SERVER_DATA/transcription.json`. Il concerne les prochains appels Whisper ; aucun redémarrage requis. L’app Mac autonome conserve sa propre configuration et la détection automatique.

Whisper s’exécute sur l’hôte ; Codex effectue l’inférence distante des images et du chat. OpenRouter est optionnel, uniquement pour les embeddings texte. Ni l’authentification Codex, ni les jetons d’appairage, ni les fichiers de données ne sont versionnés.

## Sessions, stockage et réglages d’hôte

Les médias d’une session sont gardés jusqu’à sa suppression explicite. Rien n’est nettoyé au démarrage ni à l’arrêt du service : un arrêt archive la session en cours, et le démarrage suivant la retrouve dans `$TVLENS_SERVER_DATA/sessions`. Chaque session a son dossier : `session.json`, `manifest.json`, `media/`, `thumbs/`, et selon l’usage `deep-answers.json`, `surveillance.json`, `embeddings.json`.

Prévoir le disque. L’estimation hors ligne, non vérifiée sur une vraie capture, est d’environ 9,6 Mo par minute de capture TV, soit de l’ordre de 0,86 Go pour un film de 90 minutes. Sous le plancher d’espace libre, `/v1/segments` répond `507` avec `code: "storage-full"`, la session se met en pause et **rien n’est supprimé** : c’est au spectateur de supprimer une session. `ReadWritePaths` de l’unité doit couvrir le dossier des données, ce qui est le cas du modèle fourni.

Réglages facultatifs, à écrire dans `/etc/tvlens/runtime.env`. Mal saisis, ils arrêtent le démarrage avec un message.

| Variable | Défaut | Effet |
| --- | --- | --- |
| `TVLENS_QUESTION_TIMEOUT_MS` | `300000` | Plafond de traitement d’une question, de 1 à 300 000 ms |
| `TVLENS_DISK_MIN_FREE_MB` | `1024` | Plancher d’espace libre sous lequel la capture est refusée |
| `TVLENS_DISK_WARN_FREE_MB` | `2048` | Seuil de l’état « espace faible » |
| `TVLENS_SURVEILLANCE_WORKERS` | `1` | Vérifications de surveillance en parallèle, de 1 à 3 |

`TVLENS_VISION_DURING_ASK` (défaut `1`) se lit, elle, dans `server.env` comme dans l’environnement : `0` retient la description visuelle pendant une question.

Routes ajoutées, toutes authentifiées par le jeton : `GET /v1/sessions`, `POST /v1/sessions/<uuid>/open`, `/resume`, `/delete`, `POST /v1/sessions/close`, `GET /v1/storage`, `POST /v1/questions/<deep-N>/cancel`, `POST /v1/surveillance/start`, `/stop`, `/retry`, `/history`, `/detail`, `GET /v1/surveillance`, `GET /v1/surveillance/overlay`. `POST /v1/session/end` archive.

L’état interrogé par le panneau existe en trois formes : `GET /v1/state` (complet, compatible avec un panneau ancien), `GET /v1/state?view=chat` et `GET /v1/state?view=panel` (vues légères). Chaque réponse porte un `ETag` ; une requête avec `If-None-Match` égal reçoit `304` sans corps. Un panneau non mis à jour continue de télécharger l’état complet, qui grossit avec la durée de la session.

## Réglage CPU de Whisper

Le transcripteur utilise `min(4, os.availableParallelism())` threads par défaut : deux sur le VPS de référence. `TVLENS_WHISPER_THREADS=2`, dans la configuration fournisseur ou l’environnement du service, permet de fixer explicitement une valeur entière entre 1 et 16. Redémarrer le service après modification. Les quotas cgroup d’un autre déploiement peuvent être inférieurs au nombre de CPU visibles : régler explicitement après mesure.

Le modèle base et la stratégie de décodage restent inchangés. Les métriques par passage (`metrics.whisper`) conservent les temps numériques de chargement, encodage/décodage, total et compteurs de fallback disponibles, ainsi que le nombre de threads. Les logs bruts Whisper, susceptibles de contenir des paroles, ne sont ni journalisés ni archivés ; seul un tampon borné en mémoire est analysé. Un résultat en cache ne reprend pas les anciennes durées d’inférence.

[Comparaison contrôlée 2/4 threads](whisper-threads-benchmark.json) : deux extraits réels, huit appels, textes identiques entre variantes, moyennes 4,83 s contre 5,55 s. Échantillon limité ; ce réglage ne garantit pas la disparition des pics ni le rattrapage des tâches sautées.

## Mise à jour reproductible

Pour identifier l’export, générer son `build-info.json` au moment de la construction : `npm run build:info -- --out /chemin/de/l-export`. Le JSON doit accompagner les sources à leur racine et être régénéré à chaque mise à jour. Le serveur le lit sans Git au démarrage et l’expose, avec sa version Node, sur `GET /v1/version`, authentifié par le jeton habituel. Sans fichier, `build` vaut `null` et le journal indique « Construction inconnue ». Voir [CI et construction Mac](ci-delivery.md) pour le schéma et les contrôles.

Déployer une révision Git identifiée après validation. Avant de mettre à jour, arrêter manuellement la capture, sauvegarder la configuration privée et noter `git rev-parse HEAD`. Ne pas écraser des modifications non commitées sur l’hôte. Installer les dépendances correspondant au lockfile, redémarrer le service, puis vérifier l’état et une capture réelle. Un retour à une révision précédente ne restaure pas une session en mémoire.

Les changements du serveur et ceux de `tv/app` se déploient séparément. Mettre à jour le panneau en préservant `connection.js`, puis le fermer et le rouvrir. L’installation Mac packagée doit également être reconstruite séparément.

Pour le code du 13 octobre 2026, les sessions créées avant la mise à jour apparaissent ensuite
« texte seul » : leurs médias n’avaient pas été gardés, et rien n’est migré ni effacé.

L’affichage ambient panneau fermé est retiré de l’arbre actuel selon l’[ADR 0017](adr/0017-retrait-de-l-affichage-ambient-panneau-ferme.md).
Les étapes ont retiré page et outils, superviseur et relais, gate de capture, puis intégrations de page
et documents ; aucun paquet ni protocole ambient n’est à déployer. La surveillance serveur et les
cartes du panneau ouvert restent disponibles, avec activité et réglages locaux d’alertes et de durée.
`GET /v1/surveillance/overlay`, sa projection, ses champs et ses ETags restent compatibles ; leur retrait
est différé. Les installations et essais du 13 octobre restent des faits datés dans
[LG : retrait et historique](lg-ambient.md). Ce retrait du dépôt n’annonce aucune mise à jour de la TV ou du VPS.

## Appairage et validation

Suivre [le guide d’installation LG](lg-installation.md) pour la répartition des composants. La TV doit disposer de l’adaptateur compatible et de sa propre configuration privée `{ "url": "http://ADRESSE_TAILSCALE:8787", "token": "JETON_DU_SERVEUR" }`. Le panneau et le contrôleur utilisent la même configuration ; leur format et leurs propriétaires sont détaillés dans [le runtime LG](lg-remote-runtime.md). La compatibilité est testée seulement sur la LG rootée de référence : ce guide n’automatise pas le root d’un autre téléviseur.

Vérifier l’écoute sur l’unique adresse choisie, le refus 401 sans jeton, puis un passage réel et une question. Pour lancer la sonde avec un extrait Kennedy acquis séparément :

```sh
TVLENS_CONFIG=/etc/tvlens/server.env \
TVLENS_CODEX_BINARY=/opt/tvlens/codex/node_modules/.bin/codex \
TVLENS_PROBE_VIDEO=/chemin/kennedy-rice-7min.mp4 \
node scripts/probe-refactor-live.cjs --require-timeline --report=/chemin/rapport-prive.json
```

Cette sonde utilise les secondes 30 à 38 et les vrais fournisseurs ; elle consomme du quota. Les médias ne sont pas fournis dans Git. Un redémarrage du moteur archive la session en cours ; le lancement automatique du service ne relance pas la capture TV, et une session archivée ne reprend que sur une demande explicite.
