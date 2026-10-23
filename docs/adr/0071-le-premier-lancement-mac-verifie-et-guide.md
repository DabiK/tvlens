# 0071 — Le premier lancement Mac vérifie les prérequis et guide leur préparation

- Date : 2026-10-23
- Statut : acceptée

## Contexte

Le paquet Mac ne contient ni Codex, ni FFmpeg, ni Whisper ou son modèle. Un lancement Finder n’hérite pas du terminal ; le modèle par défaut pouvait être recherché sous `/.local`. L’utilisateur devait préparer un dépôt et importer un fichier d’environnement pour configurer des chemins.

## Décision

Un assistant au premier lancement vérifie les exécutables, le statut local de connexion Codex, la présence du modèle et l’autorisation écran. Les vérifications asynchrones ne retardent pas la création de la fenêtre ; les commandes sont bornées à cinq secondes et ne lancent pas d’inférence. Le premier affichage ne demande pas de capture : le bouton d’autorisation sollicite explicitement macOS avant d’ouvrir ses réglages. L’audio système reste à confirmer à la première capture (ADR 0065).

Le parcours peut être reporté et reste accessible dans les réglages. Les fonctions complémentaires ne sont pas présentées comme indispensables à l’observation des images. Une installation complète est mémorisée après une action explicite ; les prérequis sont revérifiés au lancement suivant.

Les outils s’installent par des commandes proposées à l’utilisateur, jamais exécutées par un IPC générique. Les liens ouverts appartiennent à une liste fermée. Les chemins sont choisis par un dialogue natif et conservés séparément du cache chiffré du fournisseur, dans `installation.json` sous `userData`, sans secret. Ces choix explicites priment sur les chemins importés ; une modification demande une réouverture et est refusée lorsqu’une session est ouverte.

Un téléchargement explicite installe le modèle Whisper base dans `userData/models`, avec limite de taille, délai, fichier temporaire et SHA-256 attendu avant remplacement. Un modèle préexistant est conservé si le transfert échoue. Un fichier choisi manuellement est annoncé présent, pas validé par une inférence. Le paquet utilise `userData/models` par défaut ; le développement conserve `.local/models`.

La configuration des agents reste cohérente pendant une session : le parcours n’essaie pas de remplacer à chaud leurs exécutables. L’import avancé résout les chemins persistés avant de propager le compte aux clients.

## Limites

Aucune signature Apple, notarisation, mise à jour automatique ou installation silencieuse des outils. Le diagnostic ne certifie ni les quotas Codex, ni les permissions audio réelles, ni la compatibilité d’un modèle choisi manuellement. La recette automatisée utilise des sondes et fournisseurs simulés ; l’installation sur un Mac vierge reste à qualifier.

## Contrôles

Tests des préférences et du diagnostic, sélection native, refus d’actions arbitraires, concurrence d’installation, reprise après téléchargement, empreinte invalide, demande explicite d’autorisation et import préservant le compte. Le smoke Electron couvre le premier affichage, la persistance de fin, la réouverture, les dépendances absentes et l’erreur de téléchargement récupérable ; il rejoint le job Mac de CI.

Évolution : l’[ADR 0073](0073-un-installateur-mac-prepare-le-paquet-et-les-outils.md) ajoute un installateur externe guidé.
L’assistant dans l’app conserve sa responsabilité de diagnostic et de configuration.

## Autorisation écran différée

La fin de l’assistant exige les outils et leur configuration effective, mais permet de reporter
l’autorisation écran avec « Continuer sans capture ». Ce choix est mémorisé comme une fin
d’assistant ; il ne transforme pas une permission refusée en permission accordée. Le diagnostic
reste visible, les sources et la capture gardent leurs contrôles natifs. Cette séparation évite
qu’un désaccord entre les réglages macOS et son API de permission bloque l’accès à l’application.
