#!/usr/bin/env bash
set -euo pipefail
umask 077

root=/home/nvidia/tvlens-setup/reprise-night-20261020T224805Z
original=/home/nvidia/tvlens-setup/nuit-20261020T210107Z

exec python3 "$root/scripts/resume_vllm.py" \
  --original-root "$original/results" \
  --package "$original/package" \
  --repo /home/nvidia/tvlens \
  --out "$root/results" \
  > "$root/launcher.stdout.log" 2> "$root/launcher.stderr.log"
