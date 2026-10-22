#!/bin/bash
# Waits for J3 to close and for the GPU to hold only Ollama, then runs J4 (J2 with the topicSummary computed off the
# critical path by the proxy, 60 questions).
set -u
PKG=/home/nvidia/tvlens-setup/labo-claude/file-jour3
until [ -f /home/nvidia/tvlens-setup/labo-claude/j3-gps-sans-resume-journal-60q-results/closure.json ]; do sleep 30; done
for i in $(seq 1 60); do
  others=$(nvidia-smi --query-compute-apps=pid,process_name --format=csv,noheader | grep -vi ollama | grep -c .)
  [ "$others" = 0 ] && break
  sleep 5
done
cd $PKG
echo "j4 départ $(date -u +%T)" >> file-status.txt
python3 -I $PKG/labo.py --plan $PKG/plan-j4-gps-resume-asynchrone-60q.json --repo /home/nvidia/tvlens \
  --night-common /home/nvidia/tvlens-setup/nuit-20261020T210107Z/package/scripts/night_common.py \
  --out /home/nvidia/tvlens-setup/labo-claude/j4-gps-resume-asynchrone-60q-results --deadline 2026-10-22T20:00:00+00:00 > j4.log 2>&1
echo "j4 exit $? $(date -u +%T)" >> file-status.txt
