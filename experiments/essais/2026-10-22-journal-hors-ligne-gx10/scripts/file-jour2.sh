#!/bin/bash
# Day queue of 22/10, revised after the Codex Astra review: after N6, replay the G5 journal variants A, B, D and E
# (GPU otherwise idle), then run J2, the 60-question reference (GPS with vision lacking topicSummary, no journal).
set -u
PKG=/home/nvidia/tvlens-setup/labo-claude/file-jour2
until [ -f /home/nvidia/tvlens-setup/labo-claude/n6-gps-sans-resume-bis-results/closure.json ]; do sleep 30; done
cd $PKG
echo "g5 départ $(date -u +%T)" >> file-status.txt
{ date -u +%FT%TZ; cat /proc/loadavg; nvidia-smi --query-compute-apps=pid,process_name --format=csv,noheader; } > etat-g5.txt
python3 -I rejouer_variantes.py --plan g5-preparation/plan-g5.json --out g5-resultats > g5.log 2>&1
echo "g5 exit $? $(date -u +%T)" >> file-status.txt
(cd g5-resultats 2>/dev/null && sha256sum * > ../g5-resultats.sha256)
echo "j2 départ $(date -u +%T)" >> file-status.txt
python3 -I $PKG/labo.py --plan $PKG/plan-j2-gps-sans-resume-60q.json --repo /home/nvidia/tvlens \
  --night-common /home/nvidia/tvlens-setup/nuit-20261020T210107Z/package/scripts/night_common.py \
  --out /home/nvidia/tvlens-setup/labo-claude/j2-gps-sans-resume-60q-results --deadline 2026-10-22T20:00:00+00:00 > j2.log 2>&1
echo "j2 exit $? $(date -u +%T)" >> file-status.txt
