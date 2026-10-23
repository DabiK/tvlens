# Installer TVLens sur Mac

## Choisir son parcours

Ce guide décrit l’app Mac autonome. Le **companion LG rooté** utilise la même logique avec capture sur TV : voir [la frise et les commandes](lg-timeline.md). Pour héberger le moteur sur Linux sans Electron, suivre [le guide serveur Linux/Tailscale](server-installation.md). Les scripts Homebrew ci-dessous ne sont pas l’installation Linux.

## Installation guidée recommandée

Sur **Mac Apple Silicon, macOS 15 ou plus récent**, utilise le bloc à copier dans Terminal
du [README](../README.md#installer-sur-mac). Il télécharge un script complet avant de l’exécuter,
sans clone, Node.js ni compte GitHub. Tu peux [lire le script](../scripts/install-mac.sh) auparavant.

Le script annonce ses actions et demande confirmation, puis :

1. Télécharge la préversion Mac 2, vérifie son SHA-256 épinglé et sa signature Developer ID TVLens.
2. Prépare uniquement les outils absents : Codex, Whisper et FFmpeg ; installe Homebrew s’il manque.
3. Télécharge le modèle base avec vérification SHA-256 si aucun modèle non vide n’occupe son emplacement standard.
4. Installe TVLens dans `/Applications` si ce dossier est accessible, sinon dans `~/Applications`, puis demande son ouverture.

Homebrew peut demander un mot de passe administrateur et les outils Apple de ligne de commande.
Prévois plusieurs minutes et de l’espace disque pour Homebrew et ses dépendances. Le script ne lance
aucune inférence. Les téléchargements ont une limite de quinze minutes par tentative, avec deux nouvelles tentatives.
Une préparation Homebrew interrompue peut se reprendre en relançant le script.

**À terminer dans l’app :** connexion personnelle Codex, autorisation écran et son, puis **Vérifier à nouveau**.
Les chemins personnalisés, comptes, sessions et réglages existants restent inchangés ; les outils sont
recherchés dans le PATH, `~/.local/bin`, `/opt/homebrew/bin` et `/usr/local/bin`.
Un outil exclusivement renseigné par un chemin personnalisé dans TVLens peut donc être installé aussi
à l’emplacement standard ; le choix personnalisé reste prioritaire dans l’app.
Le diagnostic de l’app vérifie l’exécution des outils : leur seule présence ne suffit pas.

Le script n’est pas une notarisation. Une confirmation **Ouvrir quand même** peut rester nécessaire
([détails ci-dessous](#si-macos-bloque-le-premier-lancement)). Aucune protection macOS n’est désactivée.
Un fichier `.command` ou `.pkg` non notarisé ne garantirait pas davantage une ouverture sans alerte.

### Options et reprise

Après avoir [téléchargé le script](https://github.com/DabiK/tvlens/releases/download/v0.1.0-mac-installer.2/install-mac.sh),
les options suivantes s’utilisent dans Terminal :

```sh
# Seulement l’application, sans préparer les outils ni le modèle
/bin/bash ~/Downloads/install-mac.sh --app-only
# Préparer sans ouvrir l’application à la fin
/bin/bash ~/Downloads/install-mac.sh --no-open
# Utiliser le dossier Applications personnel
/bin/bash ~/Downloads/install-mac.sh --destination "$HOME/Applications"
```

`--yes` accepte la préparation annoncée, mais n’évite ni les demandes Homebrew ni les autorisations macOS.
Ne lance pas le script avec `sudo`. Tu peux le relancer : une version identique et correctement signée
est conservée. Pour remplacer une autre version, quitte TVLens auparavant. Un échec de téléchargement
ou de signature conserve l’app existante ; un échec de remplacement restaure l’ancienne app.
Les outils déjà ajoutés par Homebrew restent installés si une étape ultérieure échoue.

Si le message `[LOCK]` persiste **après avoir vérifié qu’aucune installation ne tourne**, supprime uniquement
le dossier vide `.tvlens-install-lock` dans le dossier Applications choisi, avec `rmdir`, puis réessaie.
N’efface pas les dossiers `.tvlens-install.*` si une erreur mentionne une ancienne app à restaurer.

## Depuis le paquet Mac (sans dépôt ni Node.js)

**[Télécharger TVLens pour Mac — ZIP](https://github.com/DabiK/tvlens/releases/download/v0.1.0-mac-preview.3/TVLens-mac-arm64.zip)** · [Détails de la préversion](https://github.com/DabiK/tvlens/releases/tag/v0.1.0-mac-preview.3)

Pour les Mac avec puce Apple (M1 et suivantes). Aucun compte GitHub, clone du dépôt ou Node.js n’est nécessaire. Le ZIP contient directement `TVLens.app` ; les archives « Source code » de GitHub sont réservées au développement.

1. Télécharger `TVLens-mac-arm64.zip` avec le lien ci-dessus, puis double-cliquer pour le décompresser.
2. Déplacer `TVLens.app` dans **Applications**, puis l’ouvrir depuis le Finder. Si macOS bloque le premier lancement, consulter l’aide ci-dessous.
3. L’assistant **Préparons ce Mac** s’ouvre. Il vérifie les outils locaux et guide les étapes manquantes. **Explorer pour le moment** permet de consulter l’application sans déclarer l’installation terminée.
4. Après une installation externe, cliquer sur **Vérifier à nouveau**. Si des chemins ou le modèle ont changé, quitter puis rouvrir TVLens depuis Applications. **Commencer** mémorise la fin de l’assistant lorsque tous les prérequis sont vérifiés. Si les outils sont prêts mais que macOS refuse encore l’accès écran, **Continuer sans capture** termine aussi l’assistant : l’application reste accessible et ne redemande pas cette étape à chaque lancement. La capture reste indisponible tant que macOS ne l’autorise pas.

Le bouton **Continuer sans capture** décrit ici est disponible dans le code source actuel ; le ZIP preview.3 lié ci-dessus ne l’intègre pas encore.

### Si macOS bloque le premier lancement

Cette préversion possède une signature Developer ID valide, mais n’est pas notarisée par Apple. Après avoir tenté de l’ouvrir, aller dans **Réglages Système → Confidentialité et sécurité → Ouvrir quand même**, puis confirmer **Ouvrir**, uniquement pour le fichier téléchargé ci-dessus. macOS mémorise cette exception pour l’app ; aucune connexion Apple ni commande Terminal n’est nécessaire. [Instructions Apple](https://support.apple.com/fr-fr/102445). Les permissions écran et son demandées ensuite servent à observer la vidéo choisie.

La préversion 1 présentait un défaut de signature susceptible de déclencher « TVLens est endommagé ». Retélécharger la dernière préversion avec le lien ci-dessus et remplacer l’ancienne `TVLens.app` dans Applications. Les sessions et réglages sont conservés séparément du paquet. Ne pas retirer la quarantaine ni désactiver Gatekeeper pour contourner une archive défectueuse.

### Préparer les outils avec l’assistant

Le parcours reste accessible dans **Réglages IA → Configurer ce Mac**, et par le bandeau d’installation incomplète. Une installation déjà terminée est revérifiée au lancement ; un outil supprimé est signalé sans masquer les sessions conservées.

| Étape | Vérification et action |
| --- | --- |
| Codex | Binaire exécutable et commande de version ; guide officiel et commande `brew install --cask codex` |
| Connexion Codex | Statut local de `codex login status` avec le même dossier de compte que l’application ; commande de connexion à copier dans Terminal |
| Whisper | Binaire `whisper-cli` exécutable et commande d’aide ; installation par `brew install whisper.cpp` |
| Modèle | Fichier lisible non vide ; sélection d’un modèle existant ou téléchargement explicite du modèle multilingue base, environ 142 Mio, depuis Hugging Face |
| FFmpeg | Binaire exécutable et commande de version ; installation par `brew install ffmpeg` |
| Écran et son | Statut d’autorisation écran ; le bouton ouvre la demande macOS si elle n’a pas encore été faite, puis les réglages correspondants |

Les sondes de commandes ont un délai de cinq secondes et n’effectuent aucune inférence. Un statut de connexion réussi ne garantit pas le quota, les droits sur un modèle ou la disponibilité du fournisseur. **Fichier présent** n’est pas une validation de transcription : un modèle choisi manuellement doit être compatible avec Whisper. Le téléchargement intégré vérifie son SHA-256 avant remplacement et écarte les fichiers incomplets. Il expire après dix minutes, sans téléchargement automatique au démarrage.

L’autorisation du **son système** se confirme lors de la première capture : le statut écran seul ne la garantit pas. Suivre la demande macOS puis quitter et rouvrir TVLens si nécessaire. Le microphone n’est pas requis pour écouter le son de la vidéo. Les bannières audio existantes restent actives.

### Accès au trousseau, seulement sur demande

Au premier lancement, sans configuration protégée existante, TVLens ouvre son assistant sans
solliciter le trousseau. Les chemins des outils, le modèle vocal et les sessions ne nécessitent pas cet accès.

Si des réglages chiffrés existent déjà sur ce Mac, l’écran **Retrouver mes réglages** propose :

- **Déverrouiller mes réglages** : seulement après ce clic, macOS peut demander l’accès à
  **TVLens Safe Storage**. Saisir le mot de passe du trousseau « session » (habituellement celui
  de la session Mac) uniquement dans la fenêtre macOS. TVLens ne reçoit pas ce mot de passe.
- **Continuer sans les charger** : ouvrir l’application avec les réglages par défaut, sans
  supprimer ni remplacer le fichier protégé. Quitter puis rouvrir TVLens pour retrouver ce choix.
  Les sessions et les chemins choisis dans l’assistant restent conservés.

Un refus d’accès laisse cet écran utilisable : réessayer ou continuer sans charger les réglages.
Les agents sont préparés après ce choix, pour éviter de démarrer avec une configuration puis
changer de fournisseur au milieu d’une session.

L’import avancé **Charger .env.local** explique l’accès avant toute demande macOS et propose
**Enregistrer de façon protégée**, **Pour cette ouverture seulement** ou **Annuler**.
L’utilisation temporaire ne touche pas au trousseau et ne remplace pas les réglages enregistrés.
Un fichier fourni au démarrage depuis les sources est également utilisé pour cette ouverture seulement ;
l’enregistrement durable passe par l’import explicite.

Cette autorisation concerne le stockage des réglages. Les confirmations Gatekeeper, Codex et écran/son
restent distinctes. Aucune protection macOS ni chiffrement n’est désactivé.

### Configuration conservée dans l’application

Les boutons **Choisir un autre emplacement…** ouvrent un sélecteur natif pour les outils, le modèle ou le dossier Codex. Aucun chemin n’est saisi comme une commande à exécuter. Les choix sont enregistrés dans `~/Library/Application Support/TVLens/installation.json`, sans clé API ni contenu d’authentification. Ils prennent priorité sur les chemins importés de `.env.local` et restent valables au lancement depuis le Finder. Une modification demande une réouverture pour que les agents et la transcription utilisent tous la même configuration ; fermer la session courante avant de modifier l’installation.

Le modèle téléchargé est conservé dans `~/Library/Application Support/TVLens/models/ggml-base.bin`. Sans chemin explicite, une app empaquetée cherche désormais son modèle à cet emplacement, quel que soit son répertoire de lancement. Les lancements de développement conservent `.local/models` par défaut.

La connexion se fait dans Codex lui-même. TVLens ne recueille aucun mot de passe et n’exige aucune clé API : OpenRouter reste facultatif et l’import chiffré de `.env.local` reste disponible pour les réglages avancés. L’installateur recommandé prépare Homebrew et les outils après confirmation.
L’assistant dans l’app fournit aussi les commandes et liens officiels pour le parcours manuel.

Références d’installation : [Codex CLI](https://developers.openai.com/codex/cli/), [Homebrew](https://brew.sh/), [formule Whisper](https://formulae.brew.sh/formula/whisper.cpp). `whisper.cpp` est le nom actuel de la formule anciennement appelée `whisper-cpp`.

## Depuis les sources — prérequis développeur

Mac Apple Silicon, Node.js 24+, Homebrew, Codex CLI installé et connecté à ton compte,
FFmpeg (`brew install ffmpeg`). `codex login status` doit confirmer la connexion.

Cloner le dépôt, puis entrer dans son répertoire :

```sh
git clone https://github.com/DabiK/tvlens.git
cd tvlens
```

Depuis le répertoire du projet :

```sh
npm ci
npm run setup:speech
npm start
# Facultatif, pour les clients Codex externes uniquement :
# npm run setup:codex
```

Sur Mac, `npm start` rouvre l'app par macOS, qui la tient alors pour responsable de l'accès à l'écran et au son :
sans cela, le son du système n'est pas capté (ADR 0065). La commande rend la main aussitôt, et les journaux de
l'app vont dans `~/Library/Logs/TVLens/main.log`. L'environnement du terminal lui est transmis.

`setup:speech` installe `whisper.cpp` si nécessaire et télécharge le modèle
multilingue `ggml-base.bin` (environ 142 Mio) dans `.local/models`, avec vérification
SHA-256. Cette installation n'est pas un appel d'inférence payant. Whisper peut
initialiser/compiler Metal au premier lancement : cette première transcription
peut être sensiblement plus lente que les suivantes.

La clé OpenRouter est facultative pour le chat, les images et la transcription.
Pour activer la recherche sémantique, créer `.env.local` avec :

```dotenv
OPENROUTER_API_KEY=ta_cle
# Facultatif : emplacement de l'authentification Codex existante
# TVLENS_CODEX_AUTH_HOME=/chemin/vers/le/home/codex
# Facultatif : chemins personnalisés pour l'audio et FFmpeg
# TVLENS_WHISPER_MODEL=/chemin/ggml-base.bin
# TVLENS_WHISPER_BINARY=/opt/homebrew/bin/whisper-cli
# TVLENS_FFMPEG=/opt/homebrew/bin/ffmpeg
# TVLENS_WHISPER_THREADS=4
# Facultatif : 0 retient la description visuelle pendant une question (défaut : 1)
# TVLENS_VISION_DURING_ASK=0
```

La clé n'est jamais transmise à Codex ni exposée au renderer. Les paramètres importés
peuvent être sauvegardés chiffrés avec le stockage macOS. Aucun secret n'est empaqueté.

## App macOS et permissions

La [CI et construction Mac](ci-delivery.md) décrit les contrôles du paquet, le ZIP de validation téléchargeable et ses limites. La préversion inclut l’assistant ; l’installateur guidé prépare les outils à côté de l’app, sans les embarquer dans son paquet.

```sh
npm run package:mac
npm run verify:mac -- dist/TVLens-darwin-arm64/TVLens.app
npm run open:mac
```

L'application est dans `dist/TVLens-darwin-arm64/TVLens.app`. `open:mac` lui transmet
le chemin du `.env.local` du projet. Autoriser TVLens à enregistrer l'écran et le son
système dans les réglages de confidentialité macOS. Relancer l'app après changement
de permission si nécessaire. Les contenus protégés peuvent rester incapturables.
Choisir une fenêtre vidéo pour éviter de capturer la barre flottante dans une capture
d'écran entière.

## Calcul partagé, exécution sur le Mac

L’app Electron et le serveur Linux utilisent les mêmes `runtime/session-runtime.cjs`, `runtime/conversation-runtime.cjs` et domaine `core/`. La transcription s’exécute sur le Mac ; la vision et le chat utilisent Codex distant. Le Mac autonome ne transfère pas sa capture au VPS. La configuration Luna/max du serveur ne remplace pas les choix de modèles du Mac.

L’analyse continue dispose de deux files bornées : une transcription, puis une description visuelle pour chaque passage. La transcription du passage suivant peut avancer pendant la vision du précédent. Le texte devient disponible avant la description complète, sous état partiel. La capture continue pendant les questions ; les files peuvent encore abandonner des tâches en surcharge, avec lacunes visibles.

Sur Mac, Whisper conserve la détection automatique de langue. Le bouton Français/Anglais/Auto est actuellement dans le companion TV et configure son serveur. Une modification du code partagé exige de relancer `npm start` ou de reconstruire le package ; une ancienne `.app` n’est pas mise à jour automatiquement.

## Pause, reprise et mode flottant

Depuis **Direct**, sélectionner une source et cliquer **Lancer l’observation**.
Le démarrage conserve le mode choisi. Le bouton de fenêtre en haut à droite ouvre
la barre flottante : **Demander** déploie le chat, le marque-page garde un moment,
et pause/reprise contrôle l’observation. Le menu **⋯** donne accès à la fenêtre
complète, la surveillance, la recherche, au changement de source et au résumé.

La pause conserve les résumés, questions et le fil Codex. La durée de pause n'est
pas ajoutée à la chronologie observée. Les médias de la session restent sur le
disque jusqu'à sa suppression : plus rien n'expire au bout de cinq minutes.

**Nouvelle session**, dans **Mémoire**, devient disponible après l'arrêt et la fin
d'analyse. Elle **archive** la session en cours : ses médias, miniatures, résumés,
questions et réponses restent sur disque. Fermer l'application archive de même.
Une session sans aucun passage ni question n'est pas gardée.

**Sessions**, dans **Mémoire**, liste les sessions conservées. Une session s'ouvre
en lecture seule ; la capture n'y reprend que par **Reprendre la capture**, après
confirmation. **Supprimer** efface cette session et elle seule. Après un
redémarrage, les questions d'une session rouverte sont retrouvées ; le fil Codex,
éphémère, ne l'est pas : une nouvelle question ouvre un fil neuf.

Sous 1 Gio d'espace libre, la capture est refusée et un bandeau l'explique ; rien
n'est supprimé pour faire de la place. Compter de l'ordre de 9 Mo par minute de
capture, d'après une estimation hors ligne non vérifiée sur une vraie capture.

Voir [le guide d'interface](interface.md) pour les actions et les réglages.

## Modèles et confidentialité

**Réglages IA** : modèle du chat configurable ; descriptions d'images et réexamen
sur `gpt-6-luna` par défaut. Les suggestions proviennent du catalogue local Codex,
mais la disponibilité réelle dépend du compte. Les modèles doivent accepter les
images. Les anciens identifiants OpenRouter de perception sont migrés vers Luna.
Les changements de perception prennent effet dans une nouvelle session.

Le réexamen demandé par le chat sélectionne au plus **12 images individuelles** par demande,
avec un **grand côté limité à 1280 pixels**, sans agrandir une source plus petite. Il conserve les
repères temporels et la diversité des instants ; les images ne sont plus réduites dans des
planches de six cellules. Si la vidéo ne peut pas être décodée, il utilise les images conservées
à la capture (768 pixels de large pour la capture Mac actuelle), avec une limite signalée.
Ce changement préserve davantage de détails, sans garantir la lecture de tout texte : la qualité
de la capture reste déterminante. Son coût en tokens et sa qualité OCR n’ont pas été mesurés.

- Images et texte de transcription sont envoyés à Codex, avec les extraits utiles
  de conversation et de mémoire. Les outils web consultent des sources externes.
- L'audio brut est transcrit sur le Mac avec Whisper, puis conservé avec sa session
  pour la relecture, jusqu'à la suppression de celle-ci. Aucun envoi audio à OpenRouter.
- OpenRouter reçoit uniquement du texte à vectoriser. Sans clé, la recherche reste
  textuelle/temporelle avec une limite signalée.
- `models.json` dans les données Electron conserve les choix sans clé.

Le chat utilise un App Server Codex cloisonné, maintenu ouvert, avec un fil éphémère
par session, ouvert sans environnement d'exécution. Son répertoire de travail est
vide ; un dossier séparé ne contient que des liens vers l'authentification et le
catalogue du compte existant, sans copier la configuration personnelle ni les outils
des autres projets. Sur ce Mac, avec la version de Codex mesurée, le modèle n'a ni
shell, ni lecteur de fichiers, ni outil de patch. Ce cloisonnement n'est pas absolu :
ce qui est empêché, ce qui n'est que détecté et ce qui reste inconnu sont décrits
dans [SECURITY.md](../SECURITY.md), avec les réglages de repli.
Les outils internes appellent les mêmes ports que le MCP externe.

Le modèle réutilise son contexte. Seuls les résumés nouveaux/modifiés sont réinjectés,
avec les bornes actuelles. Les citations sont validées côté domaine. Les étapes
réelles et le texte de réponse en cours sont affichés ; les raisonnements internes
bruts ne sont pas exposés. Le texte partiel n'est pas encore validé.

## MCP externe

`npm run setup:codex` configure le serveur `tvlens` sans clé API. Relancer les sessions
Codex externes déjà ouvertes pour le découvrir. L'app doit observer un contenu pour
fournir un contexte. Outils : `search_moments`, `get_transcript`, `inspect_clip`.
Le dernier utilise maintenant Luna et Whisper, pas une inférence OpenRouter.

## Budget et tests

Le compteur `.local/research-budget.json` conserve toutes les dépenses historiques,
sans plafond local, sans remise à zéro des dépenses antérieures. Les nouveaux appels sont
uniquement des embeddings. Le coût/quotas Codex sont distincts : une valeur technique
`cost: 0` dans un résultat de perception signifie zéro coût OpenRouter, pas que Codex
est sans coût ni quota.

```sh
npm test
npm run test:electron               # capture/agents simulés, véritable UI
npm run test:electron:full:live     # chat + outils + Luna + Whisper réels
node scripts/probe-chat-web.cjs     # web réel, mémoire de test
npm run test:codex-speed:live       # mesures sur un petit scénario contrôlé
```

Les tests live nécessitent le compte Codex et, pour les embeddings, une clé créditée.
[Résultats et limites](session-optimization.md). Les scripts de comparaison des
anciens modèles ont été retirés sans remplacement ; leurs rapports restent historiques
([ADR 0016](adr/0016-retrait-des-adaptateurs-d-evaluation-herites.md)).

## Dépannage

- Capture introuvable : vérifier les permissions macOS et la source sélectionnée.
- Paroles indisponibles : lancer `npm run setup:speech`, vérifier le chemin du modèle.
- Modèle refusé : choisir un identifiant disponible sur le compte Codex.
- Codex déconnecté : vérifier le CLI et l'authentification. Après panne du processus,
  la question suivante reconstruit un fil depuis la mémoire récente disponible ;
  l'ancien contexte LLM complet n'est pas garanti.
- Recherche longue : étapes réelles visibles, file FIFO (5 en attente maximum), annulation par question, arrêt à cinq minutes de traitement au plus. La carte affiche l'écoulé sur le plafond ; le temps en file est affiché séparément. `TVLENS_QUESTION_TIMEOUT_MS` abaisse ce plafond.
- Capture refusée, bandeau « espace disque » : libérer de la place ou supprimer une session dans Mémoire → Sessions, puis reprendre.

Références : [Codex App Server](https://learn.chatgpt.com/docs/app-server),
[Whisper.cpp officiel](https://github.com/ggml-org/whisper.cpp).


## Visionnage et conservation

- « Garde ce moment » (overlay ou mode complet) copie les segments couvrant les
  30 dernières secondes disponibles. La copie et le texte sont conservés après
  fermeture et suppression de la session ; suppression explicite dans la bibliothèque.
- Le raccourci global par défaut est `CommandOrControl+Shift+S`. Modifier la combinaison
  dans « Rechercher / moments gardés ». Un conflit de raccourci est signalé.
- Rechercher dans la session renvoie des cartes et aperçus si le média est
  disponible. S'il ne l'est pas (session ancienne, fichier absent ou média expiré
  dans une ancienne archive), le texte reste interrogeable, la relecture est désactivée et le motif est dit.
- Surveillance (onglet du même nom, qui remplace Auto) : consigne libre, démarre à
  l’activation et ne relit pas le passé. Elle continue pendant les questions
  manuelles, qui restent entre elles en file FIFO. Ses résultats sourcés arrivent en
  cartes en bas à gauche ; les affirmations indéterminées et les signalements restent
  dans son historique. Arrêter la surveillance n’efface pas ses résultats.
- Le quota Codex est lu à titre informatif (cache de 60 secondes). Aucun seuil
  de réserve local ne suspend les appels, même si la lecture du quota échoue.
  Les limites effectives du fournisseur restent appliquées par Codex.
- Les marque-pages sont dans `~/Library/Application Support/TVLens/saved-moments`.
  Ils ne sont jamais inclus dans le dépôt Git. Les résumés de sessions restent dans `sessions`.

Test vidéo réel (préparer un extrait avec FFmpeg puis lancer) :

```sh
ffmpeg -i media/samples/kennedy-rice-7min.mp4 -t 45 -vf scale=640:-2 -c:v libx264 -preset ultrafast -crf 28 -c:a aac /tmp/tvlens-source-live.mp4
node scripts/probe-video-chat-live.mjs /tmp/tvlens-source-live.mp4
node scripts/check-codex-quota.cjs
```

Le test réel substitue seulement le sélecteur de capture macOS par le flux décodé
par Chromium : vidéo, son, transcription locale, perception et chat/web sont réels.
Les médias sont gardés jusqu'à la suppression de la session, comme en production. Le script appelle `startSurveillance` avec une consigne libre.
Aucun rejeu n’est consigné depuis ce réalignement, signalé dans le
[livrable du 13 octobre 2026](night-features-delivery.md).

Référence du raccourci global : [API Electron globalShortcut](https://www.electronjs.org/docs/latest/api/global-shortcut).

Les plafonds locaux Codex (réserve de 55 %) et OpenRouter (5 USD) ont été supprimés à la demande de l’utilisateur. Le quota Codex reste informatif ; le compteur OpenRouter conserve les dépenses antérieures et distingue les appels au coût inconnu. Les limites imposées par les fournisseurs restent applicables.

## Réglages réversibles (13 octobre 2026)

Tous sont facultatifs. Absents, le défaut s'applique ; mal saisis, l'application
refuse de démarrer avec un message.

| Variable | Défaut | Effet |
| --- | --- | --- |
| `TVLENS_QUESTION_TIMEOUT_MS` | `300000` | Plafond de traitement d'une question, de 1 à 300 000 ms |
| `TVLENS_DISK_MIN_FREE_MB` | `1024` | Plancher d'espace libre sous lequel la capture est refusée |
| `TVLENS_DISK_WARN_FREE_MB` | `2048` | Seuil du bandeau « espace faible » |
| `TVLENS_SURVEILLANCE_WORKERS` | `1` | Vérifications de surveillance en parallèle, de 1 à 3 |
| `TVLENS_VISION_DURING_ASK` | `1` | `0` retient la description visuelle pendant une question |

**Où les poser.** Les cinq premières sont lues dans l'environnement du processus
seulement : les exporter dans le terminal avant `npm start`, qui en hérite.
Écrites dans `.env.local`, elles sont ignorées sans message. L'application
empaquetée ne les reçoit pas : ouverte depuis le Finder, elle n'a pas l'environnement
du terminal, et `npm run open:mac` ne lui transmet que `CODEX_HOME` et le chemin de
`.env.local`. Pour elle, ces cinq retours arrière sont aujourd'hui hors d'atteinte.
`TVLENS_VISION_DURING_ASK` peut, elle, être écrite dans `.env.local`.

Les réglages de cloisonnement des agents sont décrits dans
[SECURITY.md](../SECURITY.md) : chacun retire un contrôle et ne sert qu'à diagnostiquer.

Preuves, limites et ce qui n'a pas été essayé : [livrable de la nuit](night-features-delivery.md).

## Choisir le modèle et la langue de transcription

Dans **Réglages IA → Configurer ce Mac**, le sélecteur reste accessible même lorsqu’un modèle est
installé. Il propose 33 variantes Whisper, leur taille et le compromis attendu. Les téléchargements
vérifient le SHA-256 et expirent après une heure. Les modèles restent dans
`~/Library/Application Support/TVLens/models/ggml-<identifiant>.bin`. Le défaut reste `base`.
Choisis la langue des paroles, puis quitte et rouvre TVLens pour appliquer la configuration.
Le [guide des modèles de transcription](transcription-models.md) décrit les variantes et alternatives.
Le ZIP public preview.3 ne contient pas encore ce sélecteur ; il est disponible depuis les sources.
