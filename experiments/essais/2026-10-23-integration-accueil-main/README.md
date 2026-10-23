# Intégration de l’accueil et du sélecteur sur main

Fusion de `4b78d87` (branche accueil) avec `ce251ba` (main), le 23 octobre 2026.
Les conflits combinent les vignettes sur demande avec le diagnostic de capture native et l’invalidation des anciennes sources en cas d’échec. Les tests des deux branches sont conservés.

## Validation locale

- Aucun modèle Ollama chargé au démarrage du contrôle.
- Contrôle complet : 3 359 tests JavaScript, 71 tests Python ; règles, format, lint et cliquet verts.
- Paquet Mac arm64 construit, puis vérifié avec `scripts/verify-package.mjs`.
- Construction de validation dans `/tmp/tvlens-home-main-merge`, signature ad hoc ; aucune installation ni interruption de la capture utilisateur.
- Avertissement du packager sur le format optionnel `.icon` absent ; construction réussie.
- Aucune recette visuelle ou fournisseur réel supplémentaire. Les limites de validation du sélecteur et du bouton flottant restent celles des dossiers précédents.

Les sorties brutes sont jointes dans ce dossier.

## Réinstallation après demande de redémarrage

La première réouverture a révélé une ancienne interface dans `/Applications/TVLens.app`. Le commit `dc5341d` a été reconstruit avec la signature Developer ID habituelle, vérifié, installé puis relancé. La version précédente est conservée dans `~/Library/Application Support/TVLens-update-backups/before-main-restart/TVLens.app`. L’arbre d’accessibilité de la nouvelle fenêtre confirme Accueil, Nouvelle session, En ce moment sélectionné, Chapitres et le choix de source avec aperçu. Aucune capture ni requête fournisseur lancée par l’agent.
