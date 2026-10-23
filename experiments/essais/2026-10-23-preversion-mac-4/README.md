# Préversion Mac 4 et installateur 3

Publication autorisée par le propriétaire. Source du paquet : `c09c4717f02adf8898882ff94daf8fcf8dddd69c`, checkout détaché propre, dépendances via npm ci. CI complète verte : run 40013652187.

Paquet arm64 signé avec le Developer ID habituel ; signature et contenu vérifiés, premier lancement testé avec profils isolés neuf/cache factice. Pas de notarisation, pas de modification des permissions ni de l’application utilisateur en cours.

ZIP : SHA-256 `364336b7fe5f1d11e319855f9a161ced71653784bb1637c067ca9b3f0be42323`.
Préversion : https://github.com/DabiK/tvlens/releases/tag/v0.1.0-mac-preview.4
Installateur publié : https://github.com/DabiK/tvlens/releases/tag/v0.1.0-mac-installer.3. URL et empreinte épinglées dans le script ; liens du README et du guide mis à jour ensemble. Anciennes releases conservées.

21 tests installateur réussis ; contrôle des changements vert. Vérification publique réussie : script téléchargé identique au dépôt, ZIP retéléchargé avec empreinte attendue, réinstallation idempotente avec le script publié en mode --app-only --no-open dans une destination isolée déjà peuplée par ce ZIP. Signature vérifiée par le script, sortie 0. Aucun remplacement de l’app utilisateur. Le provisionnement complet sur Mac vierge n’est pas testé ; les tests isolés couvrent les branches outils/modèle.
