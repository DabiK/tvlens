#!/bin/bash
# Relaunch of J2 after its first start was blocked (OTHER_GPU_PROCESS_ACTIVE at 10:50:05 UTC, right after G5 unloaded
# its model): wait until no non-Ollama compute process remains on the GPU, then run the 60-question reference.
set -u
PKG=/home/nvidia/tvlens-setup/labo-claude/file-jour2
for i in $(seq 1 60); do
  others=$(nvidia-smi --query-compute-apps=pid,process_name --format=csv,noheader | grep -vi ollama | grep -c .)
  [ "$others" = 0 ] && break
  sleep 5
done
cd $PKG
echo "j2 reprise départ $(date -u +%T)" >> file-status.txt
python3 -I $PKG/labo.py --plan $PKG/plan-j2-gps-sans-resume-60q.json --repo /home/nvidia/tvlens \
  --night-common /home/nvidia/tvlens-setup/nuit-20261020T210107Z/package/scripts/night_common.py \
  --out /home/nvidia/tvlens-setup/labo-claude/j2-gps-sans-resume-60q-results --deadline 2026-10-22T20:00:00+00:00 > j2-reprise.log 2>&1
echo "j2 reprise exit $? $(date -u +%T)" >> file-status.txt
