#!/bin/bash
# Waits for the CPU-only oracle media job to finish, then runs the instrumented reference replays.
set -eu
PKG=/home/nvidia/tvlens-setup/labo-claude/e1-reference-instrumentee
until ls /home/nvidia/tvlens-setup/oracle-medias-2026*/finished.txt >/dev/null 2>&1; do sleep 20; done
date -u +%FT%TZ > $PKG/gate-passed.txt
python3 -I $PKG/labo.py --plan $PKG/plan.json --repo /home/nvidia/tvlens \
  --night-common /home/nvidia/tvlens-setup/nuit-20261020T210107Z/package/scripts/night_common.py \
  --out /home/nvidia/tvlens-setup/labo-claude/e1-reference-instrumentee-results --deadline 2026-10-21T14:30:00+00:00
