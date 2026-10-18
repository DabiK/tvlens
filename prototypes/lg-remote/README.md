# Rakuten → TVLens (LG prototype)

> The sections below retain the prototype history. Current installation: [LG guide](../../docs/lg-installation.md). The shipped companion now includes chat, timeline and manual capture; its former test lifetime is removed. Reboot validation remains separate.

The selected binding is **Rakuten TV only**. Other input events are passed through by the upstream mapper. Tested target: rooted LG 75QNED87T, webOS 25 / internal 10.3.2-33. This is a prototype integration, not a general webOS remapper.

## Provenance

- Managed input loop/helpers: [afonsojramos/magic-mapper-webos](https://github.com/afonsojramos/magic-mapper-webos), commit `f7eb349047ec146679aa75ca4f2014bdcaa8d870`.
- Vendored mapper: [andrewfraley/magic_mapper](https://github.com/andrewfraley/magic_mapper), commit and verified SHA256 in `vendor/upstream.json`.
- MIT notices retained in `LICENSE.upstream`. No inputhook binary injection is used.

The managed loop grabs Magic Remote Builtin [0], forwarding unbound events to Builtin [1] on webOS 25. Upstream contains special Back-key handling for this version. The reported Rakuten code is 1044; physical remote confirmation is required. Closing the process releases its input grab. This necessarily touches the remote input path even though only one button is assigned a new action.

## TV-local action

`tvlens_mapper.py` ajoute une action locale au répartiteur amont inchangé. `panel.py` tourne dans un processus séparé :
l’ouverture du panneau ne bloque pas la transmission des touches. L’app `org.tvlens.sidebarprobe` doit être installée.

Le contrôleur accepte une vidéo YouTube connectée sur `MAIN` dont le rectangle `displayOutput` est entier, de dimensions
strictement positives et contenu dans l’écran physique 3840×2160. Plein écran 16:9, bandes noires et petite fenêtre sont
acceptés. La réduction conserve l’image source complète et son rapport ; la fermeture restaure le rectangle courant
sauvegardé, avec son indicateur `fullScreen`. Les coordonnées logiques sont les coordonnées physiques divisées par deux,
y compris les demi-pixels éventuels. Les sources rognées ou dont le rapport diffère de l’image décodée restent refusées.

Autre application, lecture absente, source invalide ou rectangle de sortie invalide : une seule notification système
nomme la cause en français, par exemple « TVLens : lance une vidéo YouTube pour ouvrir le panneau. ». Le refus laisse la
vidéo intacte et ne lance pas l’app. Le diagnostic technique reste dans `/tmp/tvlens-panel.log` ; un échec de notification
est journalisé sans interrompre le gestionnaire de touches.

Un processus de récupération distinct couvre la mort inattendue du contrôleur. Un changement de contexte média ou de
géométrie ferme le panneau ; les transitions publicitaires sans fermeture restent à traiter. Le verrou empêche les
contrôleurs en double. L’ouverture ne démarre pas l’analyse, qui se lance depuis la sidebar ; le micro physique reste
routé vers LG.

Ces dispositions et les refus sont couverts par l’écran simulé de `test_panel.py`. Cette correction n’a été ni déployée
ni validée visuellement sur la TV. Après intégration, remplacer tout le répertoire `runtime` depuis un tag, avec sauvegarde,
puis vérifier ouverture, fermeture et restauration sur une vidéo 16:9 et un autre format, ainsi que le message hors YouTube.

## Initial deployment and rollback

Files staged under `/media/developer/tvlens-remote`. First trial is bounded with `timeout -s TERM 120`; **no boot hook is installed for this trial**. Status is `/tmp/tvlens-remote-state/status.json`, diagnostics `/tmp/tvlens-remote.log` and `/tmp/tvlens-panel.log`.

Stopping the mapper restores Rakuten's normal routing. Identify the PID from the status file and verify its command line before sending SIGTERM. Closing TVLens restores the video separately. Uninstalling this prototype means stopping its processes before removing its isolated directory; do not change the existing SSH or VPN hooks.

Local checks: `python3 prototypes/lg-remote/test_panel.py` and Python compilation. Physical binding, passthrough and lifecycle must also be tested on the TV. No automatic-start success is claimed until separately enabled and checked.

## Validated binding and persistent installation

The physical Rakuten button was confirmed to open TVLens. An initial immediate-close bug came from parsing a multiline Luna reply; `panel.py` now decodes the entire JSON object. The user confirmed the corrected panel stays open. TV logs also show Back events and successful geometry restoration.

The mapper now runs without the temporary trial timeout. Boot hook: `/var/lib/webosbrew/init.d/30-tvlens-remote`, pointing to the isolated `control.py`. Startup hook installation is verified; a full TV reboot has **not** been performed. The sidebar itself retains its bounded test lifetime and still contains no AI chat integration.

Run from the Mac:

```sh
# Restore Rakuten's original function now and across subsequent boots:
ssh tv-lg 'python3 /media/developer/tvlens-remote/control.py disable'
# Enable TVLens again:
ssh tv-lg 'python3 /media/developer/tvlens-remote/control.py enable'
# Inspect enabled state / validated process identity:
ssh tv-lg 'python3 /media/developer/tvlens-remote/control.py status'
```

Disable/enable have been exercised on the actual TV. The controller verifies the exact process command before signalling it and serializes start/stop operations. Routine mapper stdout is discarded to avoid unbounded key logs; current status stays in `/tmp/tvlens-remote-state/status.json`. Startup failures go to `/tmp/tvlens-remote-start.log`. Existing SSH and VPN hooks are unchanged.

## Adaptive YouTube resolution (local correction)

A TV status captured on 2026-09-30 reported a 1280×720 decoded video with
an origin-aligned 1920×1080 `sourceInput`. The previous equality check
rejected it as a crop before launching the panel. The controller now keeps
Luna's reported source coordinate space when its aspect ratio matches the
decoded video, instead of requiring identical pixel dimensions. Both chat
and timeline use that rectangle, and restoration keeps it unchanged.

Offset crops, mismatched aspect ratios, invalid dimensions, foreign apps
and untested output layouts remain rejected. This is a bounded adaptation,
not support for arbitrary video geometry. Regression tests cover the observed
720p/1080p mismatch and 1080p/4K variants. TV deployment and visual validation
of this correction are still pending; no TV files were changed in this pass.

### Démarrage Python sur webOS (1er octobre 2026)

Un échec réel du service Rakuten a montré `PermissionError: [Errno 13] Permission denied: ''` lors du lancement du mapper. Certains environnements de boot ne renseignent pas `sys.executable`. Le hook emploie `/usr/bin/python3` explicitement ; le contrôleur et le lanceur du panneau utilisent ce chemin en repli. Le test `test_control.py` reproduit un exécutable vide. Relance du service et ouverture par Rakuten confirmées sur la TV ; reboot complet non effectué.
