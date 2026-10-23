# 0074 — Le trousseau est sollicité après un choix explicite

- Date : 2026-10-23
- Statut : acceptée

## Contexte

Le chargement de la configuration consultait `safeStorage` avant de créer la fenêtre.
macOS pouvait demander l’accès à « TVLens Safe Storage » sans explication, y compris
avant toute découverte de l’app. Une sonde de disponibilité peut elle-même solliciter le trousseau.
Les agents sont composés au démarrage : remplacer la configuration après cette composition
ne suffit pas à changer tous leurs comptes, fournisseurs et outils de façon cohérente.

## Décision

`app/config-access.cjs` ne reçoit qu’une fabrique du stockage protégé. Sans cache chiffré,
le démarrage ne l’appelle jamais. Les fichiers explicitement fournis au lancement sont utilisés
sans persistance ; enregistrer les secrets exige un import interactif.

Avec un cache existant, `app/config-welcome.cjs` affiche d’abord une fenêtre explicative.
Le déverrouillage exige un clic. Continuer sans charger les réglages conserve leurs octets et
utilise les valeurs par défaut pour cette ouverture. La composition des agents suit le choix,
ce qui conserve les backends et comptes restaurés sans remplacement à chaud.
Une note dans les réglages rappelle comment retrouver le choix à la prochaine ouverture.

Le preload de l’accueil n’expose qu’un choix fermé, validé côté hôte et réservé à la fenêtre
principale de cet accueil. Un refus natif ou des données illisibles laissent disponibles la
possibilité de réessayer ou de continuer. Deux actions ne peuvent pas lancer deux déverrouillages concurrents.

L’import explique l’usage du trousseau avant tout accès et offre une option temporaire,
sélectionnée par défaut, ainsi qu’une annulation. Une sauvegarde explicitement demandée échoue
si le stockage est indisponible : elle n’est jamais annoncée comme faite, ni remplacée par du
texte clair. Un import sans clé ne peut pas écraser une ancienne clé devenue illisible.

## Limites et contrôles

Le mécanisme conserve `safeStorage` et le chiffrement existants ; il ne modifie aucun réglage
macOS, fuse Electron ou attribut de quarantaine. Une autorisation de trousseau peut rester
nécessaire après le clic, notamment si l’identité de signature a changé.

Les tests de configuration, de choix et d’IPC vérifient l’ordre des accès, la conservation,
les annulations et refus. Le smoke Electron utilise un profil neuf et un cache factice pour
la continuation ; le refus est injecté et ne représente pas un déverrouillage réel du trousseau.
Ce smoke rejoint la CI Mac. Il ne prouve ni capture réelle, ni notarisation, ni installation
sur un Mac vierge. La [documentation d’installation](../installation.md) décrit les choix.
