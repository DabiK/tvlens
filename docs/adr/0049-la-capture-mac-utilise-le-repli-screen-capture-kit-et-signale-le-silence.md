# 0049 — La capture Mac utilise le repli ScreenCaptureKit et signale le silence

- Date : 2026-10-17
- Ticket : `docs/travail/tickets/246-capture-the-mac-system-audio-on-recent-macos-and-warn-when-no-sound-is-captured.md`
- Statut : remplacée par l’ADR 0065 pour la voie audio ; son avertissement durable reste

## Contexte

Sur le Mac du propriétaire (macOS 26.3, Electron 44.4.5), la capture ne produit plus de piste audio.
Les mêmes captures avec CoreAudio Tap désactivé produisent du son et des transcriptions. La clé
`NSAudioCaptureUsageDescription` est déjà présente ; elle ne prouve pas que la permission est accordée.
Le [changement Electron 39](https://github.com/electron/electron/blob/main/docs/breaking-changes.md)
documente le flux mort possible sous macOS 14.2 et plus, sans erreur de capture.

## Décision

Avant `whenReady`, `app/main.cjs` désactive `MacCatapLoopbackAudioForScreenShare` sur macOS seulement,
en conservant les autres valeurs de `disable-features` et sans dupliquer cette option.
Ce repli vers ScreenCaptureKit est celui documenté pour Electron 39 à 44. L'option est retirée dans
Electron 45 : **avant toute montée à 45**, il faudra accorder et vérifier la permission CoreAudio Tap
avec une capture réellement sonore, ou adopter une autre voie de capture.

Le contrôleur de capture Mac expose un état audio indépendant du statut passager. Sans piste vivante,
il avertit immédiatement. Pendant l'enregistrement, dix secondes sans RMS supérieur à `1e-7`
(plancher du silence numérique, environ −140 dBFS) déclenchent le même avertissement. L'absence de
messages du worklet compte aussi : une piste vivante ne garantit pas qu'elle livre des échantillons.
Les minuteries sont injectées ; l'aperçu seul n'accumule pas le délai d'enregistrement.

L'avertissement reste jusqu'au retour du son ou à la libération de la capture. Le son, même faible,
réarme les dix secondes ; la fin de la dernière piste vivante avertit immédiatement. L'arrêt libère
la minuterie et les callbacks. Un arrêt refusé qui conserve la capture conserve aussi sa surveillance.

La vue conserve une bannière visible avec la permission à vérifier et la consigne de relancer l'app.
Le mode flottant compact affiche « Son absent » à la place de la marque ; ce bouton déplie la fenêtre
pour lire la bannière. Les statuts, notices et redessins ordinaires ne l'effacent pas.

## Alternatives écartées

- Se fier à la présence de `NSAudioCaptureUsageDescription` : déjà présente sur le Mac en échec.
- Attendre une erreur de `getDisplayMedia` ou n'afficher qu'un statut : le flux peut être mort sans erreur,
  et le statut est remplacé au démarrage de l'enregistrement.
- Appliquer un seuil de parole : confondrait un son faible avec une capture défaillante.

## Conséquences

La capture continue pendant l'avertissement, notamment pour conserver les images. Une vidéo réellement
silencieuse peut donc afficher cette consigne ; elle ne constitue pas un diagnostic de permission.
La version d'Electron, l'empaquetage, la capture TV et le serveur restent inchangés.
Les preuves simulées ne garantissent pas les permissions du Mac. Après intégration, l'orchestrateur
doit vérifier une piste audio non muette et les transcriptions sans option en ligne de commande.
L'app empaquetée n'a pas été essayée.

## Protégée par

- `tests/mac-ipc-contract.test.cjs` : vrai processus principal sous doublure Electron, option présente
  dès `whenReady`, fusion et absence d'ajout sous Linux et Windows.
- `tests/capture-controller.test.cjs` : vrai contrôleur et vraie vue des commandes, flux et worklet
  simulés, avertissement durable, silence à dix secondes, son faible et retour du son, fin de piste,
  absence d'échantillons et maintien du suivi après refus d'arrêt.
