#!/bin/bash
# Night queue: waits for n4-qps to close, then runs n5b-gps-sans-resume-journal-reprise.
set -eu
PKG=/home/nvidia/tvlens-setup/labo-claude/n5b-gps-sans-resume-journal-reprise
until [ -f /home/nvidia/tvlens-setup/labo-claude/n4-qps-results/closure.json ]; do sleep 30; done
date -u +%FT%TZ > $PKG/gate-passed.txt
python3 -I $PKG/labo.py --plan $PKG/plan.json --repo /home/nvidia/tvlens \
  --night-common /home/nvidia/tvlens-setup/nuit-20261020T210107Z/package/scripts/night_common.py \
  --out /home/nvidia/tvlens-setup/labo-claude/n5b-gps-sans-resume-journal-reprise-results --deadline 2026-10-22T12:00:00+00:00
