#!/bin/sh
# Device adapter only: private TV/VPS network, independent of capture and CyberGhost.
set -eu
umask 077
unset LD_PRELOAD LD_LIBRARY_PATH LD_AUDIT LD_DEBUG
BASE=/media/developer/tvlens-tailscale
STATE="$BASE/state"
BIN="$BASE/bin"
running() {
    [ -s "$STATE/daemon.pid" ] || return 1
    pid=$(cat "$STATE/daemon.pid")
    case "$pid" in ''|*[!0-9]*) return 1;; esac
    [ "$(readlink "/proc/$pid/exe" 2>/dev/null)" = "$BIN/tailscaled" ]
}
case "${1:-status}" in
    start)
        mkdir -p "$STATE"
        running && exit 0
        # Preferences (no DNS takeover, no exit node/subnet routes) live in private state.
        GOMEMLIMIT=64MiB nohup "$BIN/tailscaled" \
            --state="$STATE/tailscaled.state" --socket="$STATE/tailscaled.sock" \
            --tun=tailscale0 --no-logs-no-support \
            >"$STATE/daemon.log" 2>&1 </dev/null &
        echo $! >"$STATE/daemon.pid"
        ;;
    stop)
        # SIGTERM lets tailscaled remove its routes; preserves pairing/preferences.
        if running; then
            kill -TERM "$pid"
            count=0
            while running && [ "$count" -lt 10 ]; do sleep 1; count=$((count+1)); done
            if running; then echo "Tailscale still stopping" >&2; exit 1; fi
        fi
        rm -f "$STATE/daemon.pid"
        ;;
    status)
        "$BIN/tailscale" --socket="$STATE/tailscaled.sock" status
        ;;
    *)
        echo "Usage: $0 start|stop|status" >&2
        exit 2
        ;;
esac
