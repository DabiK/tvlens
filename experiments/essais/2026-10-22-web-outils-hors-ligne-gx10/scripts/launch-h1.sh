#!/bin/bash
# Waits for J4 to close and for the GPU to hold only Ollama, then replays the oracle v4 W/M/O questions (H1).
set -u
PKG=/home/nvidia/tvlens-setup/labo-claude/file-h1
until [ -f /home/nvidia/tvlens-setup/labo-claude/j4-gps-resume-asynchrone-60q-results/closure.json ]; do sleep 30; done
for i in $(seq 1 60); do
  others=$(nvidia-smi --query-compute-apps=pid,process_name --format=csv,noheader | grep -vi ollama | grep -c .)
  [ "$others" = 0 ] && break
  sleep 5
done
cd $PKG
echo "h1 départ $(date -u +%T)" >> file-status.txt
{ date -u +%FT%TZ; cat /proc/loadavg; nvidia-smi --query-compute-apps=pid,process_name --format=csv,noheader; } > etat-h1.txt
python3 -I rejouer_h1.py --j2 /home/nvidia/tvlens-setup/labo-claude/j2-gps-sans-resume-60q-results --questions questions-wmo.json \
  --oracle-v3 oracle-v3.json --corpus /home/nvidia/tvlens-setup/corpus-web-20261022 --out h1-resultats > h1.log 2>&1
echo "h1 exit $? $(date -u +%T)" >> file-status.txt
(cd h1-resultats 2>/dev/null && sha256sum * > ../h1-resultats.sha256)
