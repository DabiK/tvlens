# Installer le serveur sur son propre Linux

Ce guide installe le moteur sans Electron. Il ne modifie aucune TV et ne donne accès à aucune installation existante. Le déploiement de référence est décrit séparément dans [le rapport VPS](vps-deployment.md).

## Prérequis

- Linux x86_64 ou ARM64, Node.js 24+, npm, Git, Python 3, FFmpeg.
- Whisper.cpp et son exécutable `whisper-cli`, compilés pour l’hôte ; modèle multilingue base.
- Codex CLI compatible avec le client App Server du projet (version testée : 0.158.0), authentifié avec un compte ayant accès aux modèles sélectionnés.
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

Le service lit `runtime.env` pour l’écoute et `server.env` pour les fournisseurs. Les compteurs sont enregistrés dans `TVLENS_USAGE_DIR`, sans écriture dans `/etc`. L’unité limite les ressources et l’accès disque ; ajuster les limites après mesure sur sa propre machine. Aucun proxy public ni Tailscale Funnel n’est nécessaire.

## Modèles et langue audio

Dans `$TVLENS_SERVER_DATA/models.json`, définir les identifiants accessibles au compte du service. Exemple de configuration du déploiement de référence :

```json
{"codexModel":"gpt-6-luna","observationModel":"gpt-6-luna","inspectionModel":"gpt-6-luna"}
```

Créer ce fichier sous l’utilisateur du service, permissions `0600`. Sans fichier, chat = modèle par défaut du compte et vision/réexamen = Luna. Redémarrer le service pour charger les modèles ; cela termine la session en mémoire.

`TVLENS_CHAT_REASONING_EFFORT=max` dans `runtime.env` configure l’effort du chat si le modèle le supporte. Sans variable, l’effort vaut `low`. Ce réglage n’accélère pas nécessairement les réponses et n’est pas appliqué à la vision/réexamen. La limite de traitement d’une question reste 60 secondes, hors file.

La langue audio du serveur vaut `fr` au premier démarrage. Le bouton Audio de la TV enregistre `fr`, `en` ou `auto` dans `$TVLENS_SERVER_DATA/transcription.json`. Il concerne les prochains appels Whisper ; aucun redémarrage requis. L’app Mac autonome conserve sa propre configuration et la détection automatique.

Whisper s’exécute sur l’hôte ; Codex effectue l’inférence distante des images et du chat. OpenRouter est optionnel, uniquement pour les embeddings texte. Ni l’authentification Codex, ni les jetons d’appairage, ni les fichiers de données ne sont versionnés.

## Réglage CPU de Whisper

Le transcripteur utilise `min(4, os.availableParallelism())` threads par défaut : deux sur le VPS de référence. `TVLENS_WHISPER_THREADS=2`, dans la configuration fournisseur ou l’environnement du service, permet de fixer explicitement une valeur entière entre 1 et 16. Redémarrer le service après modification. Les quotas cgroup d’un autre déploiement peuvent être inférieurs au nombre de CPU visibles : régler explicitement après mesure.

Le modèle base et la stratégie de décodage restent inchangés. Les métriques par passage (`metrics.whisper`) conservent les temps numériques de chargement, encodage/décodage, total et compteurs de fallback disponibles, ainsi que le nombre de threads. Les logs bruts Whisper, susceptibles de contenir des paroles, ne sont ni journalisés ni archivés ; seul un tampon borné en mémoire est analysé. Un résultat en cache ne reprend pas les anciennes durées d’inférence.

[Comparaison contrôlée 2/4 threads](whisper-threads-benchmark.json) : deux extraits réels, huit appels, textes identiques entre variantes, moyennes 4,83 s contre 5,55 s. Échantillon limité ; ce réglage ne garantit pas la disparition des pics ni le rattrapage des tâches sautées.

## Mise à jour reproductible

Déployer une révision Git identifiée après validation. Avant de mettre à jour, arrêter manuellement la capture, sauvegarder la configuration privée et noter `git rev-parse HEAD`. Ne pas écraser des modifications non commitées sur l’hôte. Installer les dépendances correspondant au lockfile, redémarrer le service, puis vérifier l’état et une capture réelle. Un retour à une révision précédente ne restaure pas une session en mémoire.

Les changements du serveur et ceux de `tv/app` se déploient séparément. Mettre à jour le panneau en préservant `connection.js`, puis le fermer et le rouvrir. L’installation Mac packagée doit également être reconstruite séparément.

## Appairage et validation

Suivre [le guide d’installation LG](lg-installation.md) pour la répartition des composants. La TV doit disposer de l’adaptateur compatible et de sa propre configuration privée `{ "url": "http://ADRESSE_TAILSCALE:8787", "token": "JETON_DU_SERVEUR" }`. Le panneau et le contrôleur utilisent la même configuration ; leur format et leurs propriétaires sont détaillés dans [le runtime LG](lg-remote-runtime.md). La compatibilité est testée seulement sur la LG rootée de référence : ce guide n’automatise pas le root d’un autre téléviseur.

Vérifier l’écoute sur l’unique adresse choisie, le refus 401 sans jeton, puis un passage réel et une question. Pour lancer la sonde avec un extrait Kennedy acquis séparément :

```sh
TVLENS_CONFIG=/etc/tvlens/server.env \
TVLENS_CODEX_BINARY=/opt/tvlens/codex/node_modules/.bin/codex \
TVLENS_PROBE_VIDEO=/chemin/kennedy-rice-7min.mp4 \
node scripts/probe-refactor-live.cjs --require-timeline --report=/chemin/rapport-prive.json
```

Cette sonde utilise les secondes 30 à 38 et les vrais fournisseurs ; elle consomme du quota. Les médias ne sont pas fournis dans Git. Un redémarrage du moteur met fin à la session en mémoire ; le lancement automatique du service ne relance pas automatiquement la capture TV.
