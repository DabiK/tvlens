#!/bin/bash
# Queue: after the E2/E3 queue reports done, run G1 (format/tools), G3 (MTP), G4 (vision output), then G2 (memory).
set -u
PKG=/home/nvidia/tvlens-setup/labo-claude/file-g
E1=/home/nvidia/tvlens-setup/labo-claude/e1-reference-instrumentee-results
until grep -q '^done' /home/nvidia/tvlens-setup/labo-claude/file-e2-e3/file-status.txt 2>/dev/null; do sleep 30; done
cd $PKG
python3 -I construire_plans_g.py --e1 $E1 --out $PKG > construire.log 2>&1
sha256sum plan-g1.json plan-g3.json plan-g4.json *.py > plans.sha256
for g in g1 g3 g4; do
  { date -u +%FT%TZ; cat /proc/loadavg; nvidia-smi --query-compute-apps=pid,process_name --format=csv,noheader; } > etat-$g.txt
  python3 -I rejouer_variantes.py --plan plan-$g.json --out $g-resultats > $g.log 2>&1
  echo "$g exit $? $(date -u +%T)" >> file-status.txt
  (cd $g-resultats 2>/dev/null && sha256sum * > ../$g-resultats.sha256)
done
python3 -I construire_g2.py --e1 $E1 --out $PKG/g2-preparation > construire-g2.log 2>&1
echo "g2-preparation exit $? $(date -u +%T)" >> file-status.txt
sha256sum g2-preparation/plan-g2.json g2-preparation/g2-construction.json >> plans.sha256
{ date -u +%FT%TZ; cat /proc/loadavg; } > etat-g2.txt
python3 -I rejouer_variantes.py --plan g2-preparation/plan-g2.json --out g2-resultats > g2.log 2>&1
echo "g2 exit $? $(date -u +%T)" >> file-status.txt
(cd g2-resultats 2>/dev/null && sha256sum * > ../g2-resultats.sha256)
echo done >> file-status.txt
