# Interface Direct, Mémoire et mode flottant

## Direct

L’aperçu de la source et la conversation occupent deux colonnes. Le démarrage conserve le mode de fenêtre choisi. Le contexte récent vient du résumé automatique du dernier passage analysé : il ne constitue pas une vérification indépendante.

Le statut compact affiche l’attente ou les lacunes ; un clic dévoile la couverture détaillée. Les réglages IA, autorisations, import de configuration et compteurs se trouvent dans Réglages.

« Explique ce moment » ancre la demande immédiatement, termine le segment disponible puis lance l’explication sans dialogue de confirmation. Le raccourci global existant conserve son aperçu d’instant et ses choix avancés.

## Mémoire

L’onglet ouvre une vue dédiée aux résumés, passages récents, moments conservés et à Auto. La capture continue et le chat conserve son historique et son brouillon quand cette vue est ouverte. La recherche reste accessible depuis la loupe. « Nouvelle session » se trouve dans Mémoire et reste indisponible pendant la capture.

## Mode flottant

La barre propose Demander, Garder, pause/reprise et un menu. Demander déploie/replie le même chat ; fermer le chat ne stoppe pas la capture. Le brouillon reste conservé. Le menu donne accès à la fenêtre complète, l’explication, Auto, la recherche, au changement de source, au résumé et au repère de rattrapage.

Pour rendre le menu utilisable sans débordement, son ouverture depuis la barre repliée déploie la fenêtre. Changer de source met l’observation en pause et ouvre Direct pour choisir la nouvelle source. La pause concerne TVLens, pas le lecteur vidéo d’origine.

Les actions de la barre font 36 px de haut. La hauteur de la fenêtre tient compte de la décoration native macOS, afin de réserver réellement 64 px de contenu à la barre.

## Organisation du code

- `app/ui/shell.js` : adaptateur de présentation (navigation, état visuel, chrome de fenêtre), sans accès à Codex, au stockage ou aux API.
- `app/ui/icons.js` : pictogrammes locaux fixes, sans SVG externe ou contenu généré interprété.
- `app/ui/shell.css` : composition des deux vues et du mode flottant.
- `app/style.css` : fondations et composants existants (réponses, sources, dialogues, relecture).
- `app/renderer.js` : orchestration des interactions via les interfaces du preload. Les ports et services métier restent inchangés.

Un seul arbre DOM de conversation est partagé entre les modes : aucune copie d’historique ni deuxième état conversationnel.

## Validation

`npm test` couvre les services métier. `npm run test:electron` parcourt la vraie interface Electron avec capture audiovisuelle synthétique et adaptateurs IA déterministes : démarrage, navigation, sauvegarde, relecture, chat, vérification, file, pause/reprise, explication ancrée, rattrapage et remise à zéro. Il vérifie également la taille de la barre, l’uniformité des boutons, le focus et la conservation du brouillon après repli.

Ces tests d’interface ne mesurent pas la qualité ou la latence réelle de Codex. La recherche web et les modèles n’ont pas été modifiés par cette refonte.
