#!/bin/bash
# Queue: wait for the closed E1 and the end of the candidate pulls, then run E2 (questions) and E3 (vision) in turn.
set -u
PKG=/home/nvidia/tvlens-setup/labo-claude/file-e2-e3
E1=/home/nvidia/tvlens-setup/labo-claude/e1-reference-instrumentee-results
until [ -f $E1/closure.json ] && [ -f $E1/integrite.json ]; do sleep 30; done
until grep -q '^done' /home/nvidia/tvlens-setup/candidats-*/pulls.txt 2>/dev/null; do sleep 30; done
python3 -c "import json,sys; c=json.load(open('$E1/closure.json')); sys.exit(0 if c['completedPassages'] == 6 else 1)" \
  || { echo "E1 incomplete: E2/E3 not started" > $PKG/file-status.txt; exit 1; }
{ date -u +%FT%TZ; cat /proc/loadavg; curl -s http://127.0.0.1:11434/api/tags; } > $PKG/etat-depart.txt
python3 -I $PKG/construire_plans.py --e1 $E1 --out $PKG > $PKG/construire.log 2>&1
sha256sum $PKG/plan-e2.json $PKG/plan-e3.json $PKG/*.py > $PKG/plans.sha256
python3 -I $PKG/rejouer_questions.py --plan $PKG/plan-e2.json --out $PKG/e2-resultats > $PKG/e2.log 2>&1
echo "e2 exit $? $(date -u +%T)" >> $PKG/file-status.txt
python3 -I $PKG/rejouer_vision.py --plan $PKG/plan-e3.json --out $PKG/e3-resultats > $PKG/e3.log 2>&1
echo "e3 exit $? $(date -u +%T)" >> $PKG/file-status.txt
for d in e2-resultats e3-resultats; do (cd $PKG/$d 2>/dev/null && sha256sum * > ../$d.sha256); done
echo done >> $PKG/file-status.txt
