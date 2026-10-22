#!/bin/bash
# Periodic fresh-eyes roadmap review by Codex Astra (read-only): snapshot the GX10 queue and the registry, ask Astra
# whether the plan drifts or over-invests in one bottleneck, and write its one-page answer next to the snapshot.
set -u
L=/private/tmp/claude-501/-Users-Dabi-Documents-ISN-tvlens/10f8a5c3-4f60-484e-82eb-5180ae7c9ba0/scratchpad/labo
REPO=/Users/Dabi/Documents/ISN/tvlens
OUT=$L/astra/periodique
STAMP=$(date -u +%Y%m%dT%H%MZ)
SSH="ssh -o BatchMode=yes -o ConnectTimeout=30 -o ControlMaster=no -o ControlPath=none gx10-tvlens"
mkdir -p $OUT
if pgrep -f "codex exec.*gpt-6-astra" >/dev/null; then echo "revue précédente encore en cours, rien lancé"; exit 0; fi

{
  echo "# État au $STAMP (UTC)"
  echo; echo "## GX10 : sessions et files"; echo '```'
  $SSH 'cd /home/nvidia/tvlens-setup/labo-claude; tmux -L tvlens-claude ls 2>&1; for f in */file-status.txt; do echo "== $f"; tail -5 $f; done;
        for d in *-results; do s=$d/status.json; [ -f $s ] && python3 -c "import json,sys; d=json.load(open(sys.argv[1]));
st=[x[\"name\"] for x in d.get(\"stages\",[])]; print(sys.argv[1].split(\"/\")[0], d.get(\"status\"), \"dernière étape:\",
st[-1] if st else \"-\")" $s; done 2>/dev/null | tail -8;
        nvidia-smi --query-gpu=utilization.gpu --format=csv,noheader; date -u +%T' 2>&1
  echo '```'
  echo; echo "## Plan courant (tenu par Claude)"; cat $L/astra/plan-courant.md
  echo; echo "## Revue précédente"; ls -t $OUT/revue-*.md 2>/dev/null | head -1 | xargs -I{} cat {}
} > $OUT/etat-$STAMP.md

cat > $OUT/consigne-$STAMP.md <<EOF
Tu es Codex Astra, regard neuf sur la feuille de route des expériences GX10 de TVLens, appelé toutes les deux heures.
Lecture seule : ne modifie aucun fichier, aucun réseau, aucun SSH. Réponds en français, une page au plus, chiffré.

But du projet : améliorer le rapport pertinence / rapidité des réponses de TVLens sur la GX10 (fenêtre GX10 jusqu'au
23/10), et laisser des chiffres fiables pour le rapport final. Chaque essai ne change qu'une chose et est tracé.

Lis d'abord l'état ci-dessous (file GX10, plan courant, ta revue précédente), puis seulement ce qui est utile parmi :
- registre : $REPO/experiments/essais/2026-10-21-variantes-gx10/README.md, CHIFFRES.md, revues/ ;
- dossiers d'essais récents : $REPO/experiments/essais/2026-10-2*-*/README.md (et leurs notation/notes.json).

Rends :
1. Dérive : insiste-t-on sur un point qui ne le mérite plus (rendement décroissant, goulot secondaire) ? Que néglige-t-on
   qui pèse plus sur la pertinence ou la vitesse ? Une phrase de diagnostic, puis les preuves chiffrées.
2. Arrêter / continuer / commencer : au plus 3 points chacun, avec le gain attendu et le coût GPU.
3. File GX10 : garder, réordonner ou couper, avec les durées.
4. Ce qui a changé depuis ta revue précédente et si ses conseils ont été suivis ou à raison écartés.
5. Au plus une décision à faire trancher par l'humain, s'il y en a une vraiment.

$(cat $OUT/etat-$STAMP.md)
EOF

if [ "${DRY:-0}" = 1 ]; then echo "consigne : $OUT/consigne-$STAMP.md"; exit 0; fi

for attempt in 1 2 3; do
  codex exec -m gpt-6-astra -c model_reasoning_effort="medium" -s read-only -C $REPO -o $OUT/revue-$STAMP.md - \
    < $OUT/consigne-$STAMP.md > $OUT/log-$STAMP-$attempt.txt 2>&1
  if [ -s $OUT/revue-$STAMP.md ] && ! grep -q "at capacity" $OUT/log-$STAMP-$attempt.txt; then break; fi
  echo "tentative $attempt sans rapport complet" >> $OUT/echecs-$STAMP.txt
  sleep 120
done
f=$(ls -t ~/.codex/sessions/*/*/*/rollout-*.jsonl 2>/dev/null | head -1)
grep '"rate_limits"' "$f" | tail -1 | python3 -c "import json,sys; l=sys.stdin.read(); d=json.loads(l)['payload'] if l else {}; \
r=(d.get('rate_limits') or {}).get('primary') or {}; print('quota Codex hebdomadaire utilisé :', r.get('used_percent'), '%')" \
  > $OUT/quota-$STAMP.txt 2>/dev/null
echo "revue : $OUT/revue-$STAMP.md"; cat $OUT/quota-$STAMP.txt
