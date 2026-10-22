#!/bin/bash
# H2 restarted after its import failure at 18:12 UTC, then J5b handed back to the dynamic queue under a new label.
set -u
B=/home/nvidia/tvlens-setup/labo-claude
ST=$B/file-dynamique/file-status.txt
echo "h2 départ $(date -u +%T) (reprise)" >> $ST
python3 -I $B/file-h2/rejouer_h2.py --j2 $B/j2-gps-sans-resume-60q-results --questions $B/file-h2/questions-wmo.json   --oracle-v3 $B/file-h2/oracle-v3.json --corpus /home/nvidia/tvlens-setup/corpus-web-20261022   --searxng http://127.0.0.1:8888 --out $B/file-h2/h2-resultats > $B/file-h2/h2.log 2>&1
echo "h2 exit $? $(date -u +%T)" >> $ST
echo 'j5b-gps-journal-produit-resume-asynchrone-60q-r2|/home/nvidia/tvlens-setup/labo-claude/file-jour3|plan-j5b-gps-journal-produit-resume-asynchrone-60q.json|/home/nvidia/tvlens-j6' >> $B/file-dynamique/file-dynamique.txt
