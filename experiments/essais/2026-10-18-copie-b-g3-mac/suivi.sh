#!/bin/zsh
# Suivi de la campagne G3 : une ligne par minute quand quelque chose change (envois, questions, erreurs, mémoire).
F=/private/tmp/claude-501/-Users-Dabi-Documents-ISN-tvlens/4adac547-eeec-4cad-9bcb-faf0fa91f853/scratchpad/t280/campagne/campaign.json
prev=""
while true; do
  line=$(python3 - "$F" <<'PY' 2>/dev/null
import json, sys, collections
try:
    r = json.load(open(sys.argv[1]))
except Exception:
    print("rapport en cours d'écriture"); sys.exit()
up = collections.Counter()
for u in r.get("uploads", []):
    a = u.get("attempts") or []
    up["accepté" if any(x.get("status") == 200 for x in a) else ("tenté" if a else "prévu")] += 1
q = collections.Counter(x.get("status") for x in r.get("questions", []))
print(f"statut {r.get('status')} complet {r.get('complete')} | envois {dict(up)} | questions {dict(q)} | "
      f"diagnostics {len(r.get('diagnostics') or [])} gardes {len(r.get('guardFailures') or [])}")
PY
)
  mem=$(memory_pressure | tail -1 | grep -o '[0-9]*%')
  if [[ "$line" != "$prev" ]]; then echo "$(date +%H:%M) $line | mémoire libre $mem"; prev="$line"; fi
  pgrep -f replay-local-stream.cjs >/dev/null || { echo "$(date +%H:%M) campagne terminée"; exit 0; }
  sleep 60
done
