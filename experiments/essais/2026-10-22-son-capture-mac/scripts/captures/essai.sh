#!/bin/zsh
# Eight real captures: dev Electron and packaged TVLens, opened by macOS or started from a terminal, screen and window.
W=/Users/Dabi/Documents/ISN/tvlens-main-app
CFG=/Users/Dabi/Documents/ISN/tvlens/.env.local
C=${0:A:h}
VIDEO=/Users/Dabi/Documents/ISN/tvlens/media/samples/kennedy-rice-7min.mp4
DEV_APP=$W/node_modules/electron/dist/Electron.app
PKG_APP=$W/dist/TVLens-darwin-arm64/TVLens.app
main_pid() { ps -eo pid,command | grep -E "Electron.app/Contents/MacOS/Electron $W|TVLens.app/Contents/MacOS/TVLens" | grep -v grep | awk '{print $1}' | head -1; }
quit_app() {
  local pid=$(main_pid); [ -z "$pid" ] && return
  kill $pid; for i in {1..30}; do ps -p $pid >/dev/null || break; sleep 0.5; done
  sleep 2
}
ffplay -loglevel error -nostats -loop 0 -window_title "Kennedy essai TVLens" -x 960 -y 540 $VIDEO &
PLAYER=$!
sleep 3
for build in dev paquet; do
  for launch in macos terminal; do
    for source in ecran fenetre; do
      label=$build-$launch-$source
      quit_app
      tail -1 /Users/Dabi/Documents/ISN/tvlens-recherche-web/.harness-state/loop/events.jsonl | cut -c1-160 > $C/$label.boucle.txt
      since=$(date -u +%Y-%m-%dT%H:%M:%SZ)
      case $build-$launch in
        dev-macos) /usr/bin/open -n --stdout $C/$label.app.log --stderr $C/$label.app.log $DEV_APP --args $W --config=$CFG --remote-debugging-port=9333 ;;
        dev-terminal) (cd $W && npm start -- --config=$CFG --remote-debugging-port=9333) > $C/$label.terminal.log 2>&1 ;;
        paquet-macos) /usr/bin/open -n --stdout $C/$label.app.log --stderr $C/$label.app.log $PKG_APP --args --config=$CFG --remote-debugging-port=9333 ;;
        paquet-terminal) $PKG_APP/Contents/MacOS/TVLens --config=$CFG --remote-debugging-port=9333 > $C/$label.terminal.log 2>&1 ;;
      esac
      sleep 4
      ps -eo pid,ppid,command | grep -E "Electron.app/Contents/MacOS/Electron $W|TVLens.app/Contents/MacOS/TVLens" | grep -v grep | cut -c1-300 > $C/$label.processus.txt
      pattern='^Écran\s1$'; [ $source = fenetre ] && pattern='Kennedy'
      echo "== $label" >> $C/resume.txt
      node $C/piloter-capture.mjs "$pattern" 30 $C/$label.fenetre.json >> $C/resume.txt 2>&1
      node $C/lire-session.mjs $since $C/$label.session.json >> $C/resume.txt 2>&1
    done
  done
done
quit_app
kill $PLAYER
echo "== fin $(date +%H:%M:%S)" >> $C/resume.txt
