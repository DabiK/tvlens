# CI de navigation et installation Mac

Le run GitHub 39993909845 a réussi les deux jobs qualité (3 359 tests JS et 71 Python), mais échoué dans le smoke Electron : il cherchait les références du résumé depuis Bibliothèque, après leur déplacement vers Accueil > Chapitres.

Le parcours ouvre désormais Chapitres puis Explorer les passages avant la relecture. Les retours du mode flottant cliquent directement la flèche. Il vérifie également la vue courante par défaut et le choix de source sans démarrer la capture. Aucune assertion existante retirée.

## Essais locaux

- Une première correction a confirmé un second blocage : références dans les détails fermés de la carte. Échec conservé.
- Smoke Electron complet corrigé : PASS, capture et fournisseurs simulés, profil isolé. Relecture, surveillance, archives et refus pour manque de disque vérifiés.
- Contrôle des fichiers modifiés vert ; pas de nouvelle exécution de toute la suite unitaire à cette étape.
- Installateur : 21 tests sur 21 ; script public téléchargé identique au dépôt, syntaxe Bash valide.
- ZIP public préversion 3 téléchargé : SHA-256 `3e3df2ba5d843149558e69ba878f349d92b9adc36ed726c22691094f5293ca06`, extraction et signature Team ID/bundle ID vérifiées avec la fonction de l’installateur.
- Limite : la commande publique cible encore la préversion 3, pas le main actuel. Aucun remplacement de l’application utilisateur ni installation Homebrew effectué lors de cette vérification.

CI GitHub confirmée verte sur `c09c471` : [run 40013652187](https://github.com/DabiK/tvlens/actions/runs/40013652187), qualité Linux, qualité Mac, paquet Apple Silicon et statut CI complète réussis. Rapport brut dans `github-run.json`.

## Vérifications complémentaires

Les autres commandes du job Mac passent localement : identité, assistant, configuration, construction propre, vérification du paquet et ouverture du paquet avec profil neuf/cache factice. Construction `c09c471`, signature ad hoc de validation.

Le script public non modifié a terminé avec `--yes --app-only --no-open --destination /tmp/tvlens-installer-validation/extracted`, après dépôt du ZIP extrait identique dans cette destination : chemin réel de réinstallation idempotente, empreinte et signature contrôlées. Ce test ne démontre pas une première installation des dépendances sur un Mac vierge ; les chemins de remplacement/échec sont couverts par les 21 tests isolés.
