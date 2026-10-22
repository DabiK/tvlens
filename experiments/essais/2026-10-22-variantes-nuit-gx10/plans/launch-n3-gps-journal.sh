#!/bin/bash
# Night queue: waits for n2-gps-sans-resume to close, then runs n3-gps-journal.
set -eu
PKG=/home/nvidia/tvlens-setup/labo-claude/n3-gps-journal
until [ -f /home/nvidia/tvlens-setup/labo-claude/n2-gps-sans-resume-results/closure.json ]; do sleep 30; done
date -u +%FT%TZ > $PKG/gate-passed.txt
python3 -I $PKG/labo.py --plan $PKG/plan.json --repo /home/nvidia/tvlens \
  --night-common /home/nvidia/tvlens-setup/nuit-20261020T210107Z/package/scripts/night_common.py \
  --out /home/nvidia/tvlens-setup/labo-claude/n3-gps-journal-results --deadline 2026-10-22T12:00:00+00:00
