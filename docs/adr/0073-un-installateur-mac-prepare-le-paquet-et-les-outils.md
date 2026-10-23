# 0073 — Un installateur Mac prépare le paquet et les outils

- Date : 2026-10-23
- Statut : acceptée

## Contexte

Le ZIP seul impose de préparer séparément Codex, Whisper, FFmpeg et le modèle vocal.
Le propriétaire choisit une distribution GitHub sans notarisation Apple, et demande un parcours
plus simple depuis le README. Une signature valide ne supprime pas toutes les confirmations Gatekeeper.

## Décision

Un script autonome compatible Bash 3.2 télécharge une archive versionnée, vérifie son SHA-256
épinglé, son intégrité et son identité Developer ID avant installation. Le README télécharge
le script entier dans un fichier temporaire avant exécution ; il ne transmet pas un flux au shell.
Le script annonce ses actions et demande confirmation. Il refuse une exécution sous root.

Les outils absents sont installés par Homebrew, lui-même préparé depuis sa source officielle si
nécessaire. Le modèle base est vérifié avant déplacement ; un modèle non vide existant est conservé.
Les préférences et sessions ne sont pas modifiées. Les outils à des chemins personnalisés restent
choisis par l’assistant ; le script ne réinterprète pas les réglages JSON de l’application.

Le remplacement utilise un dossier temporaire sur le volume de destination et restaure l’ancienne
app en cas d’échec. Un verrou empêche deux installations dans la même destination. Une app active
n’est pas remplacée ; une réexécution conserve une app identique correctement signée.

Le lancement passe par LaunchServices. Aucune suppression de quarantaine, modification Gatekeeper,
connexion Apple ou notarisation. La connexion Codex et les permissions écran/son restent interactives.
Le script et l’archive sont versionnés séparément ; une livraison publiée n’est pas remplacée.

## Limites et contrôles

Ce parcours réduit les manipulations, sans garantir zéro confirmation macOS. Homebrew peut demander
un compte administrateur et des outils Apple. Un outil présent doit encore passer le diagnostic
de l’assistant. Les dépendances ajoutées par Homebrew ne sont pas désinstallées si une étape échoue.

Les tests hors ligne couvrent les refus avant mutation, les échecs de transfert, les signatures,
la restauration, les chemins avec espaces, les réexécutions et la conservation des données.
La recette sur le Mac de développement ne prouve pas l’installation sur un Mac vierge ; ses conditions
et les étapes réellement observées sont dans le rapport d’essai.
