#!/bin/bash
# Waits for E5 to close, then runs E6: best configuration with the two-phase question prototype (proxy rewrite).
set -eu
PKG=/home/nvidia/tvlens-setup/labo-claude/e6-flux
until [ -f /home/nvidia/tvlens-setup/labo-claude/e5-flux-results/closure.json ]; do sleep 30; done
date -u +%FT%TZ > $PKG/gate-passed.txt
python3 -I $PKG/labo.py --plan $PKG/plan.json --repo /home/nvidia/tvlens \
  --night-common /home/nvidia/tvlens-setup/nuit-20261020T210107Z/package/scripts/night_common.py \
  --out /home/nvidia/tvlens-setup/labo-claude/e6-flux-results --deadline 2026-10-22T06:00:00+00:00
