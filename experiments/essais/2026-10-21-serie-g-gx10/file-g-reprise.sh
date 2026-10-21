#!/bin/bash
# Resume of the G queue (the first attempt failed at import): after E4 and E3b, run G1, G3, G4 then G2 on the plans
# already built and hashed at 14:18 UTC.
set -u
PKG=/home/nvidia/tvlens-setup/labo-claude/file-g
until [ -f /home/nvidia/tvlens-setup/labo-claude/e3b/status.txt ]; do sleep 30; done
cd $PKG
echo "reprise $(date -u +%T)" >> file-status.txt
for g in g1 g3 g4; do
  { date -u +%FT%TZ; cat /proc/loadavg; nvidia-smi --query-compute-apps=pid,process_name --format=csv,noheader; } > etat-$g.txt
  python3 -I rejouer_variantes.py --plan plan-$g.json --out $g-resultats > $g.log 2>&1
  echo "$g exit $? $(date -u +%T)" >> file-status.txt
  (cd $g-resultats 2>/dev/null && sha256sum * > ../$g-resultats.sha256)
done
{ date -u +%FT%TZ; cat /proc/loadavg; } > etat-g2.txt
python3 -I rejouer_variantes.py --plan g2-preparation/plan-g2.json --out g2-resultats > g2.log 2>&1
echo "g2 exit $? $(date -u +%T)" >> file-status.txt
(cd g2-resultats 2>/dev/null && sha256sum * > ../g2-resultats.sha256)
echo "done-reprise" >> file-status.txt
