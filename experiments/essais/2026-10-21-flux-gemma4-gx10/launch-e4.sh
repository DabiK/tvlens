#!/bin/bash
# Waits for the G queue to finish, then runs the cumulative in-flow arms G, GP, GPS on Kennedy, Spring and CNRS.
set -eu
PKG=/home/nvidia/tvlens-setup/labo-claude/e4-flux
until grep -q '^done' /home/nvidia/tvlens-setup/labo-claude/file-g/file-status.txt 2>/dev/null; do sleep 30; done
date -u +%FT%TZ > $PKG/gate-passed.txt
python3 -I $PKG/labo.py --plan $PKG/plan.json --repo /home/nvidia/tvlens \
  --night-common /home/nvidia/tvlens-setup/nuit-20261020T210107Z/package/scripts/night_common.py \
  --out /home/nvidia/tvlens-setup/labo-claude/e4-flux-results --deadline 2026-10-21T23:00:00+00:00
