#!/bin/bash
# Dynamic GX10 queue (22/10 evening): each line of file-dynamique.txt is "label|lab dir|plan file|checkout". The first
# line is taken when the previous run ends, so runs can be added or reordered without stopping the queue; a line
# "stop" ends it. Each run waits for a GPU holding only Ollama.
set -u
B=/home/nvidia/tvlens-setup/labo-claude
Q=$B/file-dynamique/file-dynamique.txt
ST=$B/file-dynamique/file-status.txt
gpu_idle() {
  for i in $(seq 1 60); do
    others=$(nvidia-smi --query-compute-apps=pid,process_name --format=csv,noheader | grep -vi ollama | grep -c .)
    [ "$others" = 0 ] && return 0
    sleep 5
  done
}
while true; do
  line=$(head -n 1 "$Q" 2>/dev/null)
  if [ -z "$line" ]; then sleep 30; continue; fi
  sed -i 1d "$Q"
  [ "$line" = stop ] && { echo "fin de file $(date -u +%T)" >> $ST; exit 0; }
  IFS='|' read -r label dir plan repo <<< "$line"
  gpu_idle
  echo "$label départ $(date -u +%T) ($repo, $(git -C $repo rev-parse --short HEAD))" >> $ST
  python3 -I $dir/labo.py --plan $dir/$plan --repo $repo \
    --night-common /home/nvidia/tvlens-setup/nuit-20261020T210107Z/package/scripts/night_common.py \
    --out $B/$label-results --deadline 2026-10-23T18:00:00+00:00 > $B/file-dynamique/$label.log 2>&1
  echo "$label exit $? $(date -u +%T)" >> $ST
done
