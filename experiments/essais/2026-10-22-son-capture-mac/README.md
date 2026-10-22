# Son absent de la capture Mac malgré les autorisations

## Question

L'app lancée depuis le code (`Electron.app` de `node_modules`) affiche « Le son n'est pas capté » alors que
« Electron » est autorisé dans Enregistrement de l'écran et des sons du système. Le son marchait le 17/10 après le
ticket 246. Est-ce une permission manquante, ou la voie de capture audio choisie par l'ADR 0049 ?

## Configuration

- Mac M5 Max, macOS 26.3, Electron 44.4.5 (`node_modules/electron/dist/Electron.app`, signature ad hoc,
  identifiant `com.github.Electron`), le 22/10 entre 16 h 40 et 17 h 10.
- Autorisations vues dans Réglages Système : « Electron » (icône Electron) activé dans Enregistrement de l'écran
  et des sons du système ; une seconde entrée « Electron » (icône d'exécutable) désactivée ; « claude » activé ;
  « Terminal » désactivé ; « TVLens » activé dans les deux listes. Aucune autorisation modifiée pendant l'essai.
- Sonde : `getDisplayMedia({ video: true, audio: true })`, auquel le gestionnaire du processus principal répond par
  le premier écran et `audio: 'loopback'`, comme `app/main.cjs` ; puis 50 mesures de RMS à 100 ms d'écart.
  Deux sons système joués pendant la mesure (`afplay` Ping puis Glass).
- Deux variantes, à une ligne près (`scripts/`) :
  - `sonde-screencapturekit` : `MacCatapLoopbackAudioForScreenShare` désactivé, comme `app/main.cjs` (ADR 0049) ;
  - `sonde-coreaudio-tap` : option laissée par défaut, donc CoreAudio Tap.
- Deux lancements :
  - par macOS : `open -n Electron.app --args <sonde>`, comme une app ouverte depuis le Finder ; macOS juge alors
    « Electron » ;
  - depuis un terminal : le binaire `Electron` lancé directement par le shell de Claude Code ; macOS juge alors
    l'app qui a lancé le terminal (« claude »).

## Résultats

| Lancement | Voie audio | Piste audio | RMS max | Mesures au-dessus de 1e-7 | Brut |
| --- | --- | --- | --- | --- | --- |
| macOS (`open`) | ScreenCaptureKit | `ended` | 0 | 0 / 50 | `screencapturekit-1.log` |
| macOS (`open`) | ScreenCaptureKit | `ended` | 0 | 0 / 50 | `screencapturekit-2.log` |
| macOS (`open`) | CoreAudio Tap | `live` | 0,487 | 24 / 50 | `coreaudio-tap-1.log` |
| terminal | ScreenCaptureKit | `live` | 0,352 | 27 / 50 | `screencapturekit-depuis-shell.log` |
| terminal | CoreAudio Tap | `ended` | 0 | 0 / 50 | `coreaudio-tap-depuis-shell.log` |

La permission écran vaut `granted` dans les cinq cas. `permission-ecran.log` vient d'une sonde antérieure de la
même session : permission `granted` et 12 sources listées.

`sessions-mac.csv` relit les sessions de l'app sur ce Mac (premier clip par `ffprobe`, état audio des passages) :

| Date | Voie audio | Son |
| --- | --- | --- |
| 29/09 | CoreAudio Tap (défaut) | oui |
| 17/10 13 h 45 – 13 h 46 | CoreAudio Tap | non (constat du ticket 246) |
| 17/10 13 h 48 – 13 h 52 | ScreenCaptureKit (option en ligne de commande) | oui, `opus` |
| 22/10 16 h 16 – 16 h 25 | ScreenCaptureKit (code de `main`), app lancée par `open` | non |

## Lecture

Le code n'a pas changé depuis le 17/10, et aucune autorisation affichée ne manque à l'app. La voie qui capte le son
dépend de l'app que macOS juge responsable : lancée par macOS, seule CoreAudio Tap capte le son ; lancée depuis un
terminal, seule ScreenCaptureKit le capte. L'échec de Tap depuis le terminal s'explique par l'app responsable :
Electron documente que Tap exige la permission audio et la clé `NSAudioCaptureUsageDescription` chez elle, et
l'`Info.plist` de « claude » (`com.anthropic.claude-code`) n'a pas cette clé. L'échec de ScreenCaptureKit lancé par
macOS, malgré la permission écran accordée, reste inexpliqué (seconde entrée « Electron », décision TCC ou défaut
de Chromium). Le constat du ticket 246 a été fait depuis un terminal, et l'ADR 0049 l'a
généralisé à tous les lancements. L'app ouverte normalement perd donc le son : c'est une régression introduite le
17/10, qui ne s'est vue qu'aujourd'hui, au premier lancement par macOS depuis.

## Captures complètes après la correction (ADR 0065)

Code de la branche `fix/source-listing-visible-refusal` : plus d'option `disable-features`, et un lancement depuis
un terminal se rouvre par `open -n`. L'app empaquetée a été construite depuis le worktree (`npm run package:mac`,
signature ad hoc). Vidéo : `media/samples/kennedy-rice-7min.mp4` (discours en anglais, AAC) jouée en boucle par
`ffplay` dans une fenêtre « Kennedy essai TVLens ». Chaque capture a été pilotée par le port de débogage
(`scripts/captures/piloter-capture.mjs`) : source choisie, 30 s d'observation, pause, 30 s d'analyse. La session a
ensuite été relue (`scripts/captures/lire-session.mjs` : `ffprobe` des clips, `volumedetect`, transcriptions).
Configuration : `.env.local` du checkout principal, Whisper `ggml-base.bin` local.

| App | Lancement | Source | Passages avec son | Clips `opus` | Volume moyen (3 premiers clips) | Transcrits | Avertissement |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Electron de développement | macOS (`open -n`) | Écran 1 | 5 / 5 | 5 / 5 | −21,8 · −25,2 · −24,5 dB | 5 / 5 | non |
| Electron de développement | macOS (`open -n`) | fenêtre Kennedy | 5 / 5 | 5 / 5 | −18,8 · −24,8 · −26,2 dB | 5 / 5 | non |
| Electron de développement | terminal (`npm start`, rouvert) | choisie par Dabi | 7 / 7 | non relevé | non relevé | 7 / 7 | non relevé |
| TVLens.app empaquetée | macOS (`open -n`) | Écran 1 | 4 / 4 | 4 / 4 | −21,0 · −25,7 · −24,9 dB | 4 / 4 | non |
| TVLens.app empaquetée | terminal (binaire direct, rouvert) | Écran 1 | 5 / 5 | 5 / 5 | −18,8 · −24,9 · −26,1 dB | 5 / 5 | non |

Les transcriptions reprennent bien le discours (« did we develop penicillin and television and nuclear power… »).
Les deux lancements depuis un terminal tournent ensuite avec launchd pour parent et la marque
`--opened-by-launch-services` (`*.processus.txt`). Le terminal a affiché où vont les journaux, puis a rendu la main.
La ligne de la session de Dabi (16 h 40) ne recopie pas ses transcriptions (`dev-terminal-session-de-dabi.json`).
Pendant les captures, la boucle était en phase « session » de T310, hors contrôle chronométré (`*.boucle.txt`).
Bruts dans `bruts/captures/`.

Lecture : avec CoreAudio Tap et un lancement toujours rouvert par macOS, le son est capté et transcrit dans les
cinq configurations essayées, empaquetée comprise ; aucune nouvelle autorisation n'a été demandée pour le paquet.

## Limites et incidents

- Une ou deux mesures par case dans la matrice des sondes, sur un écran.
- Le lancement du 29/09 n'est pas connu ; ceux du 17/10 sont supposés faits depuis un terminal.
- La seconde entrée « Electron », désactivée, n'a pas été identifiée.
- Plan de huit captures réduit à quatre, plus la session de Dabi, sur décision de Dabi : le son marchait déjà pour
  l'Electron de développement, et Tap capte le son du système quel que soit l'écran ou la fenêtre. Non faits :
  Electron de développement depuis le terminal sur l'écran et la fenêtre (couvert par la session de Dabi, source non
  relevée), app empaquetée sur une fenêtre (deux cas).
- Premier lot perdu sur une erreur du script : macOS nomme l'écran « Écran 1 » avec une espace insécable (U+00A0),
  que le motif `^Écran 1$` ne reconnaissait pas (`bruts/captures/incidents/echec-motif/`). Corrigé par `\s`.
- Le lot relancé a été arrêté pendant le lancement de la troisième capture, par la réduction
  (`bruts/captures/incidents/interrompu/`).
- Pendant l'essai, j'ai fermé deux fois l'app que Dabi utilisait, dont sa capture de 16 h 40 (coupée à 16 h 41 pour
  empaqueter).
- Deux lignes trop longues de `scripts/captures/*.mjs` ont été coupées après les captures, pour les règles du dépôt,
  sans changer ce que font les scripts.

## Revue Codex Astra

`revue-astra/` contient le brief et la réponse de Codex Astra (`gpt-6-astra`, lecture seule, 22/10). Venus d'Astra :
les chiffres recalculés depuis les bruts (conformes), la correction de la description de la sonde et d'une lecture
trop affirmative, l'explication de l'échec de Tap par la clé manquante (clé vérifiée ensuite dans l'`Info.plist`),
le constat qu'`app.relaunch()` ne passe pas par LaunchServices en Electron 44.4.5 (source citée, non vérifiée ici),
et un plan de vérification de huit captures : Electron de développement et app empaquetée, lancement par macOS et
depuis un terminal, écran et fenêtre.
