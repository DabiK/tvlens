# Installation Mac et recette réelle — 23 octobre 2026

## Demande et périmètre

Créer une icône plus simple et neutre, puis tester l’installation et le fonctionnement réel jusqu’au bout sur ce Mac. La demande autorise ici le téléchargement du modèle et l’utilisation des fournisseurs déjà configurés. Aucun accès TV ou VPS. Les 28 sessions préexistantes sont conservées.

## Configuration

- Mac Apple Silicon, macOS 26.3, Node 24.12.0, Electron 44.4.5 ; base `c7f04f4` avec les changements locaux d’installation et d’icône.
- Paquet construit dans `dist/real-validation/TVLens-darwin-arm64/TVLens.app`, vérifié puis copié dans `/Applications/TVLens.app`, absent avant la recette.
- Lancement par les services natifs de macOS, sans `--smoke-test` ni substitution de capture. L’interface utilisée est bien `file:///Applications/TVLens.app/Contents/Resources/app.asar/app/index.html`.
- Vidéo publique locale : `media/samples/kennedy-rice-7min.mp4`, ouverte dans QuickTime ; seule cette fenêtre est sélectionnée, pas le bureau.
- Codex, FFmpeg, Whisper et les autorisations écran étaient déjà disponibles. Aucun mot de passe ni jeton n’a été lu ou recopié dans les preuves.

## Icône

Le premier rendu vert et en relief a été écarté à la demande de l’utilisateur. Le rendu retenu est anthracite et blanc cassé, écran et lentille sans décoration. Master et ICNS dans [assets/macos](../../../assets/macos/), avec le prompt exact et la méthode de conversion. Le paquet contient les mêmes octets ICNS que la source, vérifiés par empreinte.

## Étapes observées

1. Huit tests d’empaquetage réussis ; contrôle qualité de `scripts/package.mjs` réussi ; construction et inspection native du paquet réussies.
2. Premier lancement installé : 5 prérequis sur 6, seul le modèle manque. L’assistant reconnaît les outils et le compte Codex réels.
3. Bouton de téléchargement utilisé : fichier de 147 951 465 octets dans `~/Library/Application Support/TVLens/models/ggml-base.bin`, SHA-256 `60ed5bc3dd14eea856493d334349b405782ddcaf0028d4b5df4088345fba2efe` confirmé. Aucun modèle n’a été copié manuellement.
4. Quitter par le bouton de l’assistant, rouvrir l’app installée : 6 prérequis sur 6. « Commencer » mémorise `completed: true` dans `installation.json`.
5. Après la fin du contrôle qualité concurrent, lecture QuickTime et capture native de sa fenêtre pendant 44,69 secondes, puis pause. Sept passages sauvegardés, tous avec audio, transcription et analyse visuelle terminés. Le premier clip contient VP8 et Opus mono 48 kHz ; volume moyen mesuré : −24,9 dB.
6. Question réelle : « Quelle comparaison l’orateur fait-il pour raconter l’histoire humaine dans ce passage ? Explique les exemples entendus et cite les passages correspondants. » Réponse terminée en 16,390 secondes, avec six citations dont les identifiants et bornes correspondent exactement aux passages enregistrés. Elle explique l’échelle imagée du demi-siècle, les peaux animales, les abris et l’écriture, tout en signalant les repères temporels mal transcrits.
7. Ouverture de la citation 00:26–00:34 et relecture vidéo. Fermeture effective par le menu natif « Quit TVLens », puis réouverture sans assistant de configuration. La session apparaît dans Mémoire, avec 44 secondes et sept passages.
8. Ouverture de l’archive en lecture seule : question, réponse et citations conservées. L’extrait cité se lit de 0:00 à 0:07 ; activation du son constatée dans le lecteur (volume 100, bouton « muet »), puis seconde lecture. L’inspection de la piste et la transcription établissent la présence de son enregistré ; aucune mesure acoustique des haut-parleurs n’a été effectuée.
9. État archivé, clips, passages et questions identiques avant et après réouverture. Les 28 dossiers de sessions antérieures sont toujours présents ; les 501 éléments des travaux exclus sont inchangés par rapport à leur inventaire initial.

Les sorties et captures sont conservées dans `preuves/`. `inspect-session.mjs` ne lit que l’unique nouvelle session identifiée par différence avec l’inventaire initial. La recette a utilisé la vraie application installée et les fournisseurs configurés, sans capture ni réponse simulée.

## Qualité et incidents observés

La chaîne installation → capture → transcription → réponse sourcée → archive → relecture fonctionne sur cet essai. Cela ne prouve pas une qualité générale des réponses. Le premier fragment de 2,5 secondes a été transcrit partiellement en polonais ; le dernier fragment de deux secondes est également erroné. Plusieurs résumés locaux perdent le contexte métaphorique des « années », que la réponse finale récupère en rapprochant les passages. Le début de la comparaison n’a pas été capturé intégralement.

L’extraction d’accessibilité utilisée par l’automatisation semblait interrompre la réponse après « chariot à roues, ». Vérification de la capture `preuves/reponse-reelle.png` : la suite est entièrement visible, jusqu’à « restituer fidèlement. ». La réponse sauvegardée et le rendu DOM contiennent tous deux les 674 caractères. C’est donc une limite de l’extraction de texte du test, sans troncature visible de la réponse.

Le raccourci clavier envoyé par l’outil d’automatisation n’a pas fermé l’application ; la commande du menu natif a correctement déclenché la fermeture et l’archivage. Aucun processus n’a été tué pour simuler cette étape.

## Limites

Ce Mac dispose déjà des outils et autorisations nécessaires. Cette recette ne remplace pas une installation sur un Mac vierge, ni un téléchargement du paquet avec mise en quarantaine Gatekeeper. Le paquet est signé ad hoc, sans signature Developer ID ni notarisation.

## Intégration avant publication

Les changements ont été appliqués dans un worktree isolé sur `41ac522`, sans les modifications des autres travaux du dossier principal. La décision du premier lancement est renumérotée ADR 0071 pour conserver les ADR du web local déjà intégrés. Le contrôle complet réussit : 3 251 tests JavaScript, 71 tests Python, règles, format, lint et cliquet. Les trois recettes Electron (principale, identité, installation) réussissent également. Le paquet intégré est construit et vérifié : 4 770 fichiers, 172 sources, module Sharp chargé dans Electron, icône native identique à l’ICNS source. Les sorties sont dans `preuves/integration/`. Cette vérification automatisée ne rejoue pas les fournisseurs réels ; la recette audiovisuelle précédente reste associée à sa construction `c7f04f4` modifiée.
