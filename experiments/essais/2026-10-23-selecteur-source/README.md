# Vue courante par défaut et sélecteur visuel — 23 octobre 2026

Base : fc34dc2, branche codex/home-chapter-cards. Mac local, Electron44.4.5 en mode smoke,
profil temporaire séparé et archive copiée. Aucun fournisseur, nouvelle capture ou installation.

Question : afficher En ce moment par défaut et choisir la source par ses aperçus.

Implémentation : onglet En ce moment avant Chapitres. Modale avec cartes, nom, image éventuelle,
actualisation et annulation. Aperçus480×270 uniquement sur demande explicite et permission écran
accordée. Aucun changement aux images de l’analyse. La sélection ne démarre pas la capture.

Recette réelle de présentation : rechargement renderer, onglet En ce moment sélectionné,
modale ouverte depuis le bouton source, source de démonstration présentée avec fallback honnête,
Échap ferme sans changement de source et restitue le focus au bouton. Pas de capture déclenchée.

Limites : cette instance smoke ne fournit aucune vignette native. Le handler main de l’instance
était celui du lancement précédent, sans l’option d’aperçu ; le nouveau handler et le preload sont
couverts par les tests de contrat IPC. Aucune preuve d’aperçu natif macOS n’est revendiquée.
Le contrôle complet n’a pas été relancé : contrôle changed final vert, 84 tests sur 5 fichiers.
Les tests ciblés du worker incluent aussi mac-ui. Capture d’écran de la modale gardée hors Git
avec les visualisations de la conversation (tvlens-accueil/selecteur-source.png).

Reproduction de la recette : lancer electron . --smoke-test, ouvrir le sélecteur de source,
constater le nom et le fallback, fermer par Échap. Pour vérifier les vignettes natives, utiliser
une instance normale avec autorisation écran ; ce second parcours n’a pas été exécuté ici.

Une conversion de miniature défectueuse est isolée par source et couverte par test.
Le risque de source disparue ou de catalogue renouvelé reste traité par le refus existant
Source indisponible lors de la sélection native ; aucune source périmée n’est forcée.

## Ouverture réelle demandée par l’utilisateur

Démonstration et ancienne instance en pause fermées. Le lancement de développement n’est pas
resté ouvert (cause non établie). Paquet construit par `npm run package:mac -- --out
/tmp/tvlens-source-picker-app`, puis ouvert par LaunchServices avec la configuration locale du
checkout principal. Aucun remplacement de /Applications/TVLens.app ni capture lancée.

Fenêtre réelle constatée à l’URL app.asar du paquet temporaire. Setup : Codex, connexion Codex,
FFmpeg, Whisper et modèle de transcription reconnus (5/6). Autorisation écran non accordée à
ce paquet ; laissée à l’utilisateur. Pas de preuve de vignette native tant que cette autorisation
n’est pas accordée. Capture UI hors Git : tvlens-accueil/application-reelle.png.

## Correction de l’instance ouverte et installation

Après retour utilisateur, processus observé : ancienne /Applications/TVLens.app, sans nouveaux
onglets. Reconstruction avec identité Developer ID Application du même développeur, vérification
scripts/verify-package.mjs réussie. Ancienne instance inactive fermée par son bouton de fermeture.
Installation via copie staging, vérification signature, déplacement réversible de l’ancienne app
vers ~/Library/Application Support/TVLens-update-backups/before-home-source-picker/TVLens.app.

ASAR installé égal au paquet : 17b1bf501d316b7bb50a70f40cda3bb611eaba2be6506f37fb87e8a10e88aa1a.
Fenêtre observée depuis /Applications : Accueil/Bibliothèque, En ce moment puis Chapitres et bouton
source visuel. Ensuite capture active constatée pendant les interactions utilisateur, sans action
Lancer l’observation par l’agent. Sélecteur correctement désactivé durant cette capture ; agent
n’interrompt pas ce test utilisateur. Modale de miniatures natives non vérifiée dans ce parcours.
