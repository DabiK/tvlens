# LG-01 — sidebar feasibility, 30 September 2026

**Verdict: basic coexistence and actual reduction demonstrated; full ticket remains open.**

Tested on rooted LG 75QNED87T, software 33.31.75, webOS 25 / 10.3.2-33. Existing YouTube app `youtube.leanback.v4`, not a replacement player. [Probe source](../prototypes/lg-sidebar/README.md).

## Observed results

- Installed a separate minimal package, `org.tvlens.sidebarprobe` 0.0.1. No firmware/system app edits, boot hook or VPN changes.
- The surface manager reports YouTube as CARD and the probe as OVERLAY simultaneously. A real display screenshot shows the panel while YouTube renders content. User confirmed it appeared.
- Actual output changed from `(0,0,3840,2160)` to `(0,270,2880,1620)`, keeping the full source input rectangle. This is reduction with preserved aspect ratio, not masking/cropping the source.
- Combining reduction and panel produced a complete video on the left and the panel on the right. The same media context remained connected in the short combined test; restoration returned its original full-screen rectangle.
- The first combined launch showed the panel before resizing. User reported masking despite a later successful screenshot. Corrected sequence: resize first, then reveal the panel. User then confirmed “Oui, cette fois la vidéo est entière à gauche”.
- During the longer test, five snapshots retained the reduced rectangle. A subsequent media context change returned the output to full-screen. Therefore transitions are **not handled**, and masking can recur. The user confirmed a YouTube advertisement at that moment; ad transitions must be handled.
- Whole-display capture includes the companion: capture exclusion must crop using current measured geometry. It is not automatically provided by the TV.

- Controller crash test: killed the Mac Python process after the first reduced sample. The TV-owned watchdog restored the original full-screen rectangle on the same media context; the overlay was absent at the final check. Evidence: `20260930-135610/crash-result.json`. The overlay had its own 45-second timeout; that observation alone does not prove a stuck overlay can be killed.

## Failures retained

| Trial | Result |
| --- | --- |
| Public API payload without context | `Context Error`, no reduction |
| Context plus source/output rectangles | `Invalid Parameters`, no reduction |
| Same incomplete payload in logical coordinates | `Invalid Parameters`, no reduction |
| Added original input and app output | Accepted, but media transition prevented a stable observation |
| Physical coordinates supplied where logical expected | Accepted but wrong placement/clipping; restored |
| Correct logical coordinates and complete payload | Actual 2880×1620 output, full source retained |
| Panel revealed before resize | User saw masking; launch ordering corrected |
| Initial close API payload used `appId` | Returned `undefined is not running`; changed to `id` and tested separately |
| New YouTube media context | Rectangle returned to full-screen; lifecycle handling still required |

Private screenshots and raw replies are under `~/Documents/TVLens-private/sidebar-tests/`. Key runs: `20260930-135140` (reduction), `20260930-135218` (combined + restored), `20260930-135313` (longer run and transition). No programme captures or raw device traces are committed.

## API findings, specific to this TV

The successful `setDisplayWindow` payload included sink, current media context, `fullScreen:false`, source input, original input, display output and app output. Original/source coordinates refer to the programme; output/app coordinates use the logical 1920×1080 space. The status reports physical pixels. Do not assume the status object can be copied back unmodified.

The [Homebrew app manifest guide](https://www.webosbrew.org/develop/guides/appinfo/) documents overlay windows. The [OSE videooutput reference](https://www.webosose.org/docs/reference/ls2-api/com-webos-service-videooutput/) helped identify the service, but marks it as internal/retired on OSE; its payload alone did not work on this retail TV. Installed service declarations and device replies were the deciding evidence.

The corrected forced-close call was also tested on the real TV: the overlay disappeared and YouTube remained foreground (`forced-close/result.json`). Physical remote focus/navigation remains to validate.

## Validation still required

- Physical remote navigation, close and focus return; sound continuity confirmed during the reduced layout.
- Repeat recovery with a frozen overlay process, beyond the successful controller-kill test.
- Immediate restoration when the panel closes, safe handling of media/context changes and app switching.
- Recorded audiovisual demonstration, beyond isolated screenshots and connection status.
- Long-running stability and reliable capture crop during transitions.

Browser smoke checks passed for panel geometry (480 pixels at 1920), initial close-button focus and displayed key events. Python scripts compile. No core/app Mac code was changed; these checks do not substitute for the remaining TV tests.

## LG-02 — premier test du micro physique

Version 0.0.2 installée : le panneau reçoit les événements texte et indique les événements clavier. Le premier essai avec le bouton micro sans champ actif ouvre l’interface LG, selon le retour utilisateur. Aucun chemin direct vers TVLens n’est validé. La dictée dans le champ actif reste à tester ; même si elle fonctionne, elle ne satisfait pas encore le contrat « bouton micro direct ».

The user subsequently confirmed **dictation through the LG keyboard works and the phrase appears in the TVLens panel**. This validates focused-field reception only. The user selected the Rakuten TV branded button as the desired panel opener. A bounded remapping trial is staged separately; see [remote prototype](../prototypes/lg-remote/README.md).

Rakuten trial: the user confirmed that pressing the branded button opens TVLens, but it closed immediately. TV logs identified a JSON parser exception on multiline `timingServiceResponse` replies from the surface manager. The controller's recovery path then closed the overlay and restored the video. Fixed parsing to decode the complete JSON object including multiline replies; five local tests now cover geometry, invalid baselines, compact/multiline/error and truncated replies. Stale recovery children from failed trials were stopped only after verifying full-screen restoration.

The user confirmed the parser fix: Rakuten now opens the panel successfully without immediate closure. Persistent mapper enabled with isolated boot hook `30-tvlens-remote`; disable/enable and process status checked on the TV. No reboot performed, so reboot persistence is configured rather than empirically confirmed. Existing panel time limit, YouTube-only layout support and ad-transition limitations remain.
