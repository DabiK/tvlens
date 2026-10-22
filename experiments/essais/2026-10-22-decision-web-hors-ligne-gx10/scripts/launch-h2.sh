#!/bin/bash
# H2 between J6 and the rest of the dynamic queue: wait for J6 to end, run the offline replay, then hand the queue the
# lines kept in apres-h2.txt (the dynamic queue must stay empty meanwhile: H2 holds the run locks).
set -u
B=/home/nvidia/tvlens-setup/labo-claude
ST=$B/file-dynamique/file-status.txt
until grep -q 'j6-gps-sans-resume-journal-produit-60q exit' $ST; do sleep 20; done
for i in $(seq 1 60); do
  others=$(nvidia-smi --query-compute-apps=pid,process_name --format=csv,noheader | grep -vi ollama | grep -c .)
  [ "$others" = 0 ] && break
  sleep 5
done
echo "h2 départ $(date -u +%T)" >> $ST
python3 -I $B/file-h2/rejouer_h2.py --j2 $B/j2-gps-sans-resume-60q-results --questions $B/file-h2/questions-wmo.json   --oracle-v3 $B/file-h2/oracle-v3.json --corpus /home/nvidia/tvlens-setup/corpus-web-20261022   --searxng http://127.0.0.1:8888 --out $B/file-h2/h2-resultats > $B/file-h2/h2.log 2>&1
echo "h2 exit $? $(date -u +%T)" >> $ST
cat $B/file-h2/apres-h2.txt >> $B/file-dynamique/file-dynamique.txt
