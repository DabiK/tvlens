#!/bin/bash
# J6: the memory journal as the product builds it (T313), in a separate checkout so that the main one stays on J5's sha.
set -u
B=/home/nvidia/tvlens-setup/labo-claude
ST=$B/file-jour4/file-status.txt
for i in $(seq 1 60); do
  others=$(nvidia-smi --query-compute-apps=pid,process_name --format=csv,noheader | grep -vi ollama | grep -c .)
  [ "$others" = 0 ] && break
  sleep 5
done
echo "j6 départ $(date -u +%T)" >> $ST
python3 -I $B/file-jour4/labo.py --plan $B/file-jour4/plan-j6-gps-sans-resume-journal-produit-60q.json --repo /home/nvidia/tvlens-j6 \
  --night-common /home/nvidia/tvlens-setup/nuit-20261020T210107Z/package/scripts/night_common.py \
  --out $B/j6-gps-sans-resume-journal-produit-60q-results --deadline 2026-10-23T09:00:00+00:00 \
  > $B/file-jour4/j6.log 2>&1
echo "j6 exit $? $(date -u +%T)" >> $ST
