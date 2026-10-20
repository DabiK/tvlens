#!/usr/bin/env bash
set -euo pipefail
umask 077

root=/home/nvidia/tvlens-setup/corpus-etendu-20261020T221045Z
streaming=/home/nvidia/tvlens-setup/streamingvlm-20261020T220235Z
night=/home/nvidia/tvlens-setup/nuit-20261020T210107Z

exec python3 "$root/package/scripts/queue.py" \
  --out "$root/results" \
  --streaming-root "$streaming/results" \
  --support "$night/package/scripts/night_common.py" \
  --repository /home/nvidia/tvlens \
  --deadline 2026-10-23T05:00:00Z \
  > "$root/launcher.stdout.log" 2> "$root/launcher.stderr.log"
