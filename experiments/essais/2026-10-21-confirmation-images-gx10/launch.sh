#!/usr/bin/env bash
set -euo pipefail

root=/home/nvidia/tvlens-setup/confirmation-images-20261021T082000Z
python3 "$root/scripts/confirm_images.py" run \
  --predecessor /home/nvidia/tvlens-setup/confirmation-pause-20261021T081500Z/results \
  --repo /home/nvidia/tvlens \
  --reference /home/nvidia/tvlens-setup/reference-2026-10-20 \
  --out "$root/results" \
  > "$root/launcher.stdout.log" \
  2> "$root/launcher.stderr.log"
