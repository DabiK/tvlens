#!/bin/bash
# Waits for the G queue resume to finish, then runs E5 (GPS and GPS + gemma4:e4b vision) in the real flow.
set -eu
PKG=/home/nvidia/tvlens-setup/labo-claude/e5-flux
until grep -q '^done-reprise' /home/nvidia/tvlens-setup/labo-claude/file-g/file-status.txt 2>/dev/null; do sleep 30; done
date -u +%FT%TZ > $PKG/gate-passed.txt
python3 -I $PKG/labo.py --plan $PKG/plan.json --repo /home/nvidia/tvlens \
  --night-common /home/nvidia/tvlens-setup/nuit-20261020T210107Z/package/scripts/night_common.py \
  --out /home/nvidia/tvlens-setup/labo-claude/e5-flux-results --deadline 2026-10-22T03:00:00+00:00
