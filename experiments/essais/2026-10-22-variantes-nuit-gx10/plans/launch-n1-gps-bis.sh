#!/bin/bash
# Night queue: waits for e7-flux to close, then runs n1-gps-bis.
set -eu
PKG=/home/nvidia/tvlens-setup/labo-claude/n1-gps-bis
until [ -f /home/nvidia/tvlens-setup/labo-claude/e7-flux-results/closure.json ]; do sleep 30; done
date -u +%FT%TZ > $PKG/gate-passed.txt
python3 -I $PKG/labo.py --plan $PKG/plan.json --repo /home/nvidia/tvlens \
  --night-common /home/nvidia/tvlens-setup/nuit-20261020T210107Z/package/scripts/night_common.py \
  --out /home/nvidia/tvlens-setup/labo-claude/n1-gps-bis-results --deadline 2026-10-22T12:00:00+00:00
