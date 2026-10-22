**Je recommande CoreAudio Tap avec des lancements réels normalisés par LaunchServices**, après validation sur TVLens empaqueté. Le tableau justifie de retirer le repli universel ; il ne démontre pas encore la cause exacte de chaque échec.

**1. Explication et corrections du brief**

Les cinq résultats sont conformes aux bruts : Tap/macOS atteint **0,487 RMS, 24/50 mesures** ; ScreenCaptureKit/shell **0,352, 27/50** ; les trois autres essais restent à zéro.

L’explication TCC est plausible : ScreenCaptureKit relève de l’autorisation écran/audio (`kTCCServiceScreenCapture`), Tap de l’audio système (`kTCCServiceAudioCapture`). Electron documente que Tap exige la permission **et** `NSAudioCaptureUsageDescription` chez l’application responsable — potentiellement le terminal/IDE. Une permission absente peut produire directement une piste `ended`, sans erreur JavaScript. [Documentation Electron](https://github.com/electron/electron/blob/main/docs/api/desktop-capturer.md#macos-versions-142-or-higher).

Cela explique potentiellement Tap sous « claude », dont le plist n’a pas été lu. **Cela n’explique pas encore ScreenCaptureKit mort sous Electron malgré `screen=granted`** : identité différente, seconde entrée Electron, décision TCC ou défaut du backend restent à départager.

Essai discriminant : reproduire les deux échecs avec journaux Chromium/TCC, relever le processus responsable (`launchctl procinfo`) et son plist ; puis répéter Tap depuis **le même lanceur**, après correction de sa seule autorisation audio si la clé existe. Le passage `ended` → audio mesuré établirait ce lien causal. [Diagnostic du processus responsable, Qt](https://www.qt.io/blog/the-curious-case-of-the-responsible-process).

Corrections : le [README](/Users/Dabi/Documents/ISN/tvlens-main-app/experiments/essais/2026-10-22-son-capture-mac/README.md:50) affirme trop vite « la permission n’est pas en cause ». Le lancement terminal du **17/10 est supposé**, pas tracé ; Finder/Dock, fenêtres et paquet ne sont pas testés. Enfin, `getDisplayMedia` reçoit `audio:true` ; `'loopback'` appartient au handler Electron.

**2. Options, par préférence technique**

| Option | Limites et conséquences |
|---|---|
| **1. Tap + LaunchServices**, depuis macOS comme depuis les commandes | Durable avec Electron 45. Adapter les wrappers et prévoir une redirection unique des démarrages directs, avant le verrou d’instance ; transmettre chemins, configuration et environnement utiles. Le processus se détache : logs, attente, arrêt et contrôle par les agents doivent être prévus explicitement. Exclure le smoke test de cette redirection. |
| **2. Tap partout, autorisation audio de chaque terminal/agent responsable** | Préserve stdout, processus enfant et Playwright ; compatible 45. Nécessite la clé dans chaque application responsable et son consentement audio. Activer seulement « écran » ne suffit pas ; modifier le plist d’un terminal tiers n’est pas une solution produit durable. |
| **3. Tap/macOS, ScreenCaptureKit/shell au démarrage** | Petit correctif transitoire, sans détachement. Préférer un choix explicite par argument/variable dans les lanceurs maîtrisés. `ppid===1` est une heuristique : un processus orphelin peut aussi avoir ce parent. `TERM`, `app.isPackaged` ou les variables d’agent ne prouvent pas la responsabilité TCC. Les lancements directs inconnus restent ambigus. **Inopérant dès Electron 45.** |
| **4. Capture native séparée ou périphérique virtuel** | ScreenCaptureKit natif reste envisageable indépendamment du retrait Chromium ; davantage de packaging, synchronisation audio/vidéo et tests. Un périphérique virtuel ajoute installation et routage utilisateur. Aucun ne dispense de vérifier les permissions. |

**`app.relaunch()` ne passe pas par LaunchServices en 44.4.5** : le relanceur utilise `base::LaunchProcess` et redirige stdout/stderr vers `/dev/null`. Il ne remplace donc pas `open -n`. [Source versionnée](https://github.com/electron/electron/blob/v44.4.5/shell/browser/relauncher_mac.cc#L69). Le retrait du drapeau en 45 est confirmé officiellement. [Electron #53646](https://releases.electronjs.org/pr/53646).

**3. Vérification minimale avant remplacement de l’ADR**

Conserver la bannière de silence ; remplacer uniquement la politique universelle après **8 captures complètes** : Electron de développement et TVLens empaqueté × lancement macOS et entrée terminal normalisée × écran et fenêtre. Utiliser une vidéo parlée connue, vérifier aussi le routage Finder/Dock/`open`, `npm start` et binaire depuis shell/agent.

Pour chaque capture : identité responsable et backend consignés, piste vivante, échantillons réellement sonores, **`opus,audio` non muet dans les clips**, passages parlés correctement transcrits, arrêt/reprise fonctionnels. Archiver configuration, signatures, bruts et incidents. Refaire cette matrice avant adoption de 45.

Le [smoke test](/Users/Dabi/Documents/ISN/tvlens-main-app/scripts/smoke-electron.mjs:643) injecte un oscillateur : il vérifie le fonctionnement applicatif, pas TCC. Aucun fichier modifié, aucun test ni essai réel lancé.