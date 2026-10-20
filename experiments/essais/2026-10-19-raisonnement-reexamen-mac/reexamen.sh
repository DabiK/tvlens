#!/bin/zsh
# Contrôle T284, étape 2 : réexamen par qwen3.8:27b sans raisonnement (modèle dédié, T283) contre gemma3:4b (modèle de
# perception, sans modèle dédié). Questions : qwen3.8:27b, raisonnement par défaut. Trois paires, ordre alterné.
S=/private/tmp/claude-501/-Users-Dabi-Documents-ISN-tvlens/4adac547-eeec-4cad-9bcb-faf0fa91f853/scratchpad
OUT=${1:?dossier de sortie}; mkdir -p "$OUT"
pgrep -f "scripts/loop/run.mjs" >/dev/null && { echo "boucle en marche : rien lancé"; exit 1; }
export QA_QUESTIONS='["Qu'"'"'est-ce qui est écrit à l'"'"'écran au début du live ?"]'
BASE=(TVLENS_INSPECTION_BACKEND=local TVLENS_LOCAL_VLM_URL=http://127.0.0.1:11434 TVLENS_LOCAL_VLM_MODEL=gemma3:4b)
DEDIE=(TVLENS_LOCAL_INSPECTION_URL=http://127.0.0.1:11434 TVLENS_LOCAL_INSPECTION_MODEL=qwen3.8:27b
  TVLENS_LOCAL_INSPECTION_THINK=off TVLENS_LOCAL_INSPECTION_NUM_CTX=16384)
run() { # $1 nom, $2 gemma|qwen
  local d="$OUT/$1"; rm -rf "$d"; mkdir -p "$d"; cp -R "$S/qa-t269/server" "$d/data"
  local extra=("${BASE[@]}"); [[ "$2" == qwen ]] && extra+=("${DEDIE[@]}")
  echo "== $1 ($2) $(date +%H:%M:%S)"
  QA_PORT=$((8900 + RANDOM % 100)) node "$S/qa-t269/qa-questions.mjs" "$d/data" "$d/rapport.json" "${extra[@]}" 2>&1 | tail -3
}
for i in 1 2 3; do
  if (( i % 2 )); then run "$i-a-qwen" qwen; run "$i-b-gemma" gemma; else run "$i-a-gemma" gemma; run "$i-b-qwen" qwen; fi
done
echo "fin $(date +%H:%M:%S)"
