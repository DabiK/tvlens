# Installer TVLens — version Codex / Luna

## Prérequis

Mac Apple Silicon, Node.js 24+, Homebrew, Codex CLI installé et connecté à ton compte,
FFmpeg (`brew install ffmpeg`). `codex login status` doit confirmer la connexion.

Depuis le répertoire du projet :

```sh
npm install
npm run setup:speech
npm run setup:codex
npm start
```

`setup:speech` installe `whisper-cpp` si nécessaire et télécharge le modèle
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
```

La clé n'est jamais transmise à Codex ni exposée au renderer. Les paramètres importés
peuvent être sauvegardés chiffrés avec le stockage macOS. Aucun secret n'est empaqueté.

## App macOS et permissions

```sh
npm run package:mac
npm run open:mac
```

L'application est dans `dist/TVLens-darwin-arm64/TVLens.app`. `open:mac` lui transmet
le chemin du `.env.local` du projet. Autoriser TVLens à enregistrer l'écran et le son
système dans les réglages de confidentialité macOS. Relancer l'app après changement
de permission si nécessaire. Les contenus protégés peuvent rester incapturables.
Choisir une fenêtre vidéo pour éviter de capturer la barre flottante dans une capture
d'écran entière.

## Pause, reprise et mode flottant

Depuis le mode complet, sélectionner une source et démarrer l'analyse. Ou cliquer
**Mode flottant ↗**, puis **● Analyser**, choisir la fenêtre et lancer la capture.
La zone **TVLens ⠿** permet de déplacer la barre. **Chat ＋/−** déplie le chat,
**Résumer** pose une question sur les passages récents, **↗** revient au mode complet.

**■ Pause** arrête la capture mais conserve la session. **● Reprendre** permet de
choisir une source et de poursuivre avec les anciens résumés, questions et le même
fil Codex. Les identifiants de passages continuent leur numérotation ; la durée de
pause n'est pas ajoutée à la chronologie observée. Le buffer garde cinq minutes de
contenu observé et peut donc rester disponible pendant une pause prolongée.

**Nouvelle session**, dans le mode complet après arrêt de la capture et fin de son
analyse, efface le contexte actif. Les archives restent sur disque ; le média brut
est nettoyé. Fermer l'application termine les fils éphémères. La restauration d'un
fil après fermeture complète de l'app n'est pas implémentée.

## Modèles et confidentialité

**Réglages IA** : modèle du chat configurable ; descriptions d'images et réexamen
sur `gpt-6-luna` par défaut. Les suggestions proviennent du catalogue local Codex,
mais la disponibilité réelle dépend du compte. Les modèles doivent accepter les
images. Les anciens identifiants OpenRouter de perception sont migrés vers Luna.
Les changements de perception prennent effet dans une nouvelle session.

- Images et texte de transcription sont envoyés à Codex, avec les extraits utiles
  de conversation et de mémoire. Les outils web consultent des sources externes.
- L'audio brut est transcrit sur le Mac avec Whisper, puis conservé pour la relecture
  selon la fenêtre de rétention. Aucun envoi audio à OpenRouter.
- OpenRouter reçoit uniquement du texte à vectoriser. Sans clé, la recherche reste
  textuelle/temporelle avec une limite signalée.
- `models.json` dans les données Electron conserve les choix sans clé.

Le chat utilise un App Server Codex isolé, maintenu ouvert, avec un fil éphémère par
session. Son répertoire temporaire contient des liens vers l'authentification et le
catalogue du compte existant, sans copier la configuration personnelle ni les outils
des autres projets. Aucun shell/fichier/connecteur n'est accessible au modèle.
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
avec un plafond de **5 USD au total**, jamais remis à zéro. Les nouveaux appels sont
uniquement des embeddings. Le coût/quotas Codex sont distincts : une valeur technique
`cost: 0` dans un résultat de perception signifie zéro coût OpenRouter, pas que Codex
est sans coût ni quota.

```sh
npm test
npm run test:electron               # capture/agents simulés, véritable UI
npm run test:electron:full-live     # chat + outils + Luna + Whisper réels
node scripts/probe-chat-web.cjs     # web réel, mémoire de test
npm run test:codex:speed            # mesures sur un petit scénario contrôlé
```

Les tests live nécessitent le compte Codex et, pour les embeddings, une clé créditée.
[Résultats et limites](session-optimization.md). Les scripts de comparaison des
anciens modèles restent disponibles mais ne décrivent plus la configuration actuelle.

## Dépannage

- Capture introuvable : vérifier les permissions macOS et la source sélectionnée.
- Paroles indisponibles : lancer `npm run setup:speech`, vérifier le chemin du modèle.
- Modèle refusé : choisir un identifiant disponible sur le compte Codex.
- Codex déconnecté : vérifier le CLI et l'authentification. Après panne du processus,
  la question suivante reconstruit un fil depuis la mémoire récente disponible ;
  l'ancien contexte LLM complet n'est pas garanti.
- Recherche longue : étapes réelles visibles, file FIFO (5 en attente maximum), annulation par question, arrêt à 60 secondes de traitement. Le temps en file est affiché séparément.

Références : [Codex App Server](https://learn.chatgpt.com/docs/app-server),
[Whisper.cpp officiel](https://github.com/ggml-org/whisper.cpp).


## Visionnage et conservation

- « Garde ce moment » (overlay ou mode complet) copie les segments couvrant les
  30 dernières secondes disponibles. La copie et le texte sont conservés après
  fermeture, hors de la rétention glissante ; suppression explicite dans la bibliothèque.
- Le raccourci global par défaut est `CommandOrControl+Shift+S`. Modifier la combinaison
  dans « Rechercher / moments gardés ». Un conflit de raccourci est signalé.
- Rechercher dans la session renvoie des cartes et aperçus si le média est encore
  disponible. Après expiration, le texte reste interrogeable mais la relecture est désactivée.
- Auto : consigne libre, fréquence 15–300 secondes de visionnage, démarre à l’activation.
  Le segment déjà commencé à l’activation est exclu pour ne pas relire le passé.
  Les questions manuelles interrompent Auto, qui reprend plus tard ; les questions
  manuelles entre elles restent en file FIFO. Désactiver Auto n’efface pas ses résultats.
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
La rétention est accélérée à 45 secondes dans ce test ; production : 5 minutes.

Référence du raccourci global : [API Electron globalShortcut](https://www.electronjs.org/docs/latest/api/global-shortcut).

Les plafonds locaux Codex (réserve de 55 %) et OpenRouter (5 USD) ont été supprimés à la demande de l’utilisateur. Le quota Codex reste informatif ; le compteur OpenRouter conserve les dépenses antérieures et distingue les appels au coût inconnu. Les limites imposées par les fournisseurs restent applicables.
