# Réexamen : images individuelles et installation Mac

## Question et configuration

Livrer le réexamen sans réduction en cellules de 384 pixels. Build testé et installé :
`a57d1b084895c660050599c5a3e2b6a5da67553b`, dépôt propre, Node 24.12.0,
Electron 44.4.5, sharp 0.35.5, Mac Apple Silicon. Au plus 12 images individuelles,
grand côté plafonné à 1280 pixels sans agrandissement ; sélection diverse et
association passage/horodatage conservées. Analyse automatique inchangée.

## Résultats observés

- Revue fonctionnelle : aucun blocage ; revue standards : deux erreurs sans code
  stable corrigées avant livraison, puis revue du correctif par l’agent principal.
- Contrôle complet : 3 322 tests JavaScript et 71 tests Python réussis ; règles,
  format, lint, gel et cliquet verts. Dernier contrôle ciblé : 52 tests réussis.
- Tests sur vidéos synthétiques : 1280×720 conservé, 1920×1080 réduit à 1280×720,
  320×180 conservé ; budget et repli sur captures vérifiés sans modèle réel.
- Paquet : 4 780 fichiers vérifiés, 182 sources identiques au checkout ; signature
  intègre et sonde native sharp réussie. Signature Developer ID du même Team ID
  que l’application précédemment installée.
- Démarrage du paquet : deux cas simulés réussis (avec/sans réglages protégés),
  sans demande de capture. Les données de ces tests sont isolées.
- Installation dans `/Applications/TVLens.app`, après fermeture propre ; ancien
  paquet sauvegardé dans `~/Library/Application Support/TVLens-update-backups/before-a57d1b0/TVLens.app`.
- Empreinte ASAR installé identique au paquet vérifié :
  `59a9e53a1821af7aa8d9c1060238d8b23c76fb5ef97887ceb209ef9959ce058b`.
- Ouverture par macOS puis lecture de l’interface via CUA : écran Direct visible,
  « Prêt à observer », « Écran autorisé · Choisis une source ». Aucune capture lancée.

## Lecture et limites

La résolution et le transport des images sont vérifiés ; la lecture du nom de la
chaîne par Luna et le coût en tokens restent non mesurés, conformément à la demande
sans essais de modèles. Les sessions utilisateur ne sont pas modifiées par le script
d’installation ; la fermeture normale peut archiver la session courante.
Aucune publication de release, notarisation ou évaluation Gatekeeper réalisée.

## Incidents et preuves

Le premier passage ciblé avait un échec : un test attendait l’ancienne planche
1200×868. L’attente a été adaptée aux images individuelles sans affaiblir les autres
assertions ; les suites finales sont vertes. Le packager signale l’absence du format
optionnel `.icon` ; la construction signée et sa vérification ont réussi.

Les journaux bruts et le rapport du paquet sont dans ce dossier. `installer.sh`
conserve les commandes exactes de la recette locale ; il refuse une réexécution
sur les mêmes chemins de sauvegarde. Les tests de comportement sont dans
`tests/individual-frame-inspection.test.cjs` et les suites existantes de réexamen.
