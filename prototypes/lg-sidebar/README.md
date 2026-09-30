# LG sidebar feasibility probe

Experimental, not the production companion. Targets the tested LG 75QNED87T, webOS 25 / 10.3.2-33, software 33.31.75, rooted with existing SSH access.

This app is a transparent webOS overlay with a 25% right-hand panel, focused close button, key-event indicator and automatic closure after 45 seconds. It contains no inference, remote script, credentials or persistent service. The separate Python probe temporarily reduces the existing YouTube video plane before launching the overlay.

## Reproduce

1. Configure your existing key-based SSH alias `tv-lg`. Do not enable Developer Mode or change firmware for this test.
2. Build the self-contained package with `python3 prototypes/lg-sidebar/package.py`. Output is ignored under `dist/`.
3. Install that IPK through the existing homebrew/developer package installation mechanism. It installs only `org.tvlens.sidebarprobe`; no system app is patched. Merely building does not install anything.
4. Start a YouTube video, full-screen, and leave the content unchanged during the test.
5. Run `python3 prototypes/lg-sidebar/probe.py` from the Mac with Python 3 and SSH available.

The runner refuses a non-YouTube, disconnected, cropped or non-4K-fullscreen baseline. Evidence goes to `~/Documents/TVLens-private/sidebar-tests/`, outside Git. The script is specific to the measured 1920×1080 logical / 3840×2160 physical coordinate mapping; do not generalize it to other TVs.

## Restoration and limitations

A TV-side 55-second watchdog is armed before resizing. It closes this probe and attempts to restore the saved geometry only if the original media context still exists. The Mac also restores in its `finally` path. No boot hook is installed. A controller-kill test restored the original full-screen rectangle on the same pipeline. A frozen overlay process remains untested.

The app closes itself after 45 seconds. Closing it manually does not yet restore the video plane immediately: the runner/watchdog owns that operation. This is a probe, not the final lifecycle implementation.

YouTube can create a new media context on content/ad transitions. A new context can return to full-screen underneath the panel. The probe does not continuously force geometry or take ownership of a new media context. This limitation is a gate before the production companion: close/suspend the panel on a transition, then resize the new context before revealing it again.

No source capture should be taken from the whole composited display while the panel is visible. On the tested layout, the programme occupies `(0, 90, 960, 540)` in a 1280×720 screenshot. Derive that crop from the current verified geometry, never from a stale constant. The resulting image has lower spatial resolution; it cannot recover lost detail.

## Evidence

See [the LG-01 report](../../docs/lg-sidebar-validation.md). The code and package are a reproducible experiment, not proof that remote voice, long sessions or production recovery work.

Local UI check (Chrome installed): `node prototypes/lg-sidebar/smoke.cjs`. This checks DOM geometry/focus only; it does not emulate webOS.

## Voice reception probe (0.0.2)

Run `python3 prototypes/lg-sidebar/probe.py --duration 170` for the interactive voice test. The app receives standard text input/change/composition events and reports LG `keyboardStateChange`; it does not itself record the remote microphone or call a speech provider.

First press the physical microphone button while the initial button is focused (direct-path test). If LG takes over, activate **Activer le champ de dictée** and repeat (focused-field path). A text event cannot prove speech origin by itself: the observer must confirm the phrase was dictated. The diagnostic buffer stays in memory and is cleared with **Recommencer le test direct**; screenshots from the runner may contain dictated text and remain in the private evidence directory.

The runner polls the current media context, geometry and overlay presence. On a transition it closes the panel, rather than forcing the new programme geometry. This mitigates masking but is not seamless ad handling. Polling can leave a brief delay. The TV-side timeout scales with `--duration`; the app also has a bounded timeout.

References: [LG virtual keyboard](https://webostv.developer.lge.com/develop/guides/virtual-keyboard), [LG system UI visibility](https://webostv.developer.lge.com/develop/guides/system-ui-visibility). Voice recognition through LG may use LG services according to device settings; it is not the future local transcription adapter.
