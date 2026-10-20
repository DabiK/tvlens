#!/bin/zsh
# Contrôle T284, étape 1 : raisonnement de qwen3.8:27b en questions, off contre default, par le chemin produit.
# Une session archivée copiée à neuf pour chaque passage ; cinq paires en ordre alterné ; un passage froid à part.
# Boucle arrêtée obligatoire. Usage : mesures.sh <dossier de sortie>
S=/private/tmp/claude-501/-Users-Dabi-Documents-ISN-tvlens/4adac547-eeec-4cad-9bcb-faf0fa91f853/scratchpad
OUT=${1:?dossier de sortie}; mkdir -p "$OUT"
pgrep -f "scripts/loop/run.mjs" >/dev/null && { echo "boucle en marche : rien lancé"; exit 1; }
export QA_QUESTIONS='["Que dit exactement l'"'"'intervenant sur la mobilisation des lycéens ?","De quoi parle cette session, en trois points ?"]'
COMMON=(TVLENS_INSPECTION_BACKEND=local TVLENS_LOCAL_VLM_URL=http://127.0.0.1:11434 TVLENS_LOCAL_VLM_MODEL=gemma3:4b)
run() { # $1 nom, $2 réglage (off|default)
  local d="$OUT/$1"; rm -rf "$d"; mkdir -p "$d"; cp -R "$S/qa-t269/server" "$d/data"
  local extra=("${COMMON[@]}"); [[ "$2" == off ]] && extra+=(TVLENS_LOCAL_QUESTIONS_THINK=off)
  echo "== $1 ($2) $(date +%H:%M:%S)"
  QA_PORT=$((8800 + RANDOM % 100)) node "$S/qa-t269/qa-questions.mjs" "$d/data" "$d/rapport.json" "${extra[@]}" 2>&1 | tail -4
}
ollama ps | tail -n +2 | grep -q . && echo "attention : un modèle est déjà chargé"
run 0-froid default
for i in 1 2 3 4 5; do
  if (( i % 2 )); then run "$i-a-off" off; run "$i-b-default" default; else run "$i-a-default" default; run "$i-b-off" off; fi
done
echo "fin $(date +%H:%M:%S)"
