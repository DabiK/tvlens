#!/bin/bash
# Waits for E4 to close, then replays the E3 complement (3 images fixed, gemma4:e4b without reasoning, final reference).
set -u
PKG=/home/nvidia/tvlens-setup/labo-claude/e3b
until [ -f /home/nvidia/tvlens-setup/labo-claude/e4-flux-results/closure.json ]; do sleep 30; done
{ date -u +%FT%TZ; cat /proc/loadavg; } > $PKG/etat-depart.txt
python3 -I $PKG/rejouer_vision.py --plan $PKG/plan.json --out $PKG/resultats > $PKG/e3b.log 2>&1
echo "e3b exit $? $(date -u +%T)" > $PKG/status.txt
