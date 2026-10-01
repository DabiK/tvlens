# Companion LG — identité alignée avec le Mac

La sidebar reprend le mot-symbole `TV<span>Lens</span>`, le blanc et l’accent citron `#c5ef8e`, le fond bleu nuit et la hiérarchie conversationnelle de l’application Mac. La police Avenir du Mac n’est pas distribuée : la TV utilise sa police disponible, avec des proportions proches.

La question apparaît dans une bulle, la réponse en texte aéré, et son statut (« observations », « sources », « hypothèse », « contexte insuffisant ») reste distinct. Les sources restent affichées comme texte : cette passe n’ajoute pas l’ouverture d’un navigateur ni la relecture. Les compteurs capturé/analysé, les lacunes et les limites restent visibles, mais secondaires. L’entrée, Dicter/Envoyer et le contrôle de capture restent regroupés en bas.

Le panneau garde sa largeur de 25 % ; la frise garde son tiers inférieur. Aucun changement de capture, d’inférence, de transport ni du domaine. La refonte se limite à l’adaptateur de présentation `tv/app/`.

## Navigation

Rakuten ouvre TVLens. Mémoire bascule vers la frise. Dans le chat, OK active le défilement haut/bas ; Retour revient aux actions, puis ferme le panneau. La capture reste accessible sous Dicter/Envoyer. Les boutons conservent un contour de focus contrasté.

## Validation du 1er octobre 2026

- Tests navigateur `scripts/smoke-lg-ui.mjs` : appairage, capture arrêt/reprise, focus, envoi en attente, clavier LG et Retour.
- Tests `scripts/smoke-tv-timeline.mjs` : disposition, miniatures, regroupement sans perte de focus, détail, question contextualisée et fin de session.
- Installation des seuls fichiers de présentation sur la TV ; sauvegarde locale TV de leur état précédent sous `tvlens-companion/ui-backup-20261001`. Les secrets d’appairage sont conservés.
- Capture réelle du panneau sur YouTube examinée, conservée hors Git dans le dossier privé `ui-review`. L’utilisateur confirme « Lisible, navigation fluide ».
- Le serveur n’avait pas de session/captures/questions au contrôle final : cette passe ne prétend pas revalider une réponse d’inférence complète. La présentation d’une réponse utilise le même contrat existant.
- L’utilisateur a signalé une perte de son, résolue en relançant sa vidéo ; aucune modification audio n’a été effectuée par cette passe.
- Le raccourci Rakuten était arrêté : le journal de démarrage montrait `PermissionError` sur un exécutable Python vide. Le hook utilise désormais `/usr/bin/python3`, et les lancements de sous-processus ont un repli explicite si `sys.executable` est vide. Service relancé et raccourci confirmé par l’utilisateur. Le redémarrage complet de la TV n’a pas été testé.
