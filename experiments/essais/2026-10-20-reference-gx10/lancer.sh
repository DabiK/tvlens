#!/usr/bin/env bash
set -euo pipefail
ROOT=$(cd "$(dirname "$0")" && pwd)
cd /home/nvidia/tvlens
exec 9>"$ROOT/execution.lock"
flock -n 9 || exit 1
while ! test -f "$ROOT/preparation-terminee.txt"; do
  if ! tmux has-session -t tvlens-reference-preparation 2>/dev/null; then
    echo "Échec de préparation : voir les journaux"; exit 1
  fi
  sleep 5
done
for video in cnrs-apprentissage kennedy spring; do
  language=auto
  if [ "$video" = cnrs-apprentissage ]; then language=fr; fi
  if [ "$video" = kennedy ]; then language=en; fi
  node "$ROOT/scenario.cjs" "$ROOT/preparation-$video" "$ROOT/questions/$video.json" "$language"
  node scripts/replay-local-stream.cjs --scenario "$ROOT/preparation-$video/scenario.json" --out "$ROOT/validation-$video" --config "$ROOT/config.env" --validate > "$ROOT/validation-$video.log" 2>&1
done
for model in base small large-v3-turbo; do
  sed "s@ggml-base.bin@ggml-$model.bin@" "$ROOT/config.env" > "$ROOT/config-$model.env"
  for video in cnrs-apprentissage kennedy spring; do
    id="$model-$video"
    mkdir "$ROOT/$id"
    date -Iseconds > "$ROOT/$id/debut.txt"
    cp "$ROOT/config-$model.env" "$ROOT/$id/config.env"
    cp "$ROOT/preparation-$video/scenario.json" "$ROOT/$id/scenario-snapshot.json"
    git rev-parse HEAD > "$ROOT/$id/code-sha.txt"
    curl -fsS http://127.0.0.1:11434/api/tags > "$ROOT/$id/modeles.json"
    sha256sum "$ROOT/scenario.cjs" "$ROOT/lancer.sh" "$ROOT/config-$model.env" > "$ROOT/$id/empreintes.txt"
    (
      while true; do
        date -Iseconds
        free -b
        cat /proc/loadavg
        nvidia-smi
        curl -fsS http://127.0.0.1:11434/api/ps || true
        sleep 5
      done
    ) > "$ROOT/$id/systeme.log" 2>&1 &
    monitor=$!
    trap 'kill "$monitor" 2>/dev/null || true' EXIT
    set +e
    node scripts/replay-local-stream.cjs --scenario "$ROOT/preparation-$video/scenario.json" --out "$ROOT/$id/run" --config "$ROOT/config-$model.env" --execute > "$ROOT/$id/sortie.log" 2> "$ROOT/$id/erreurs.log"
    status=$?
    set -e
    kill "$monitor" 2>/dev/null || true
    wait "$monitor" 2>/dev/null || true
    trap - EXIT
    printf '%s\n' "$status" > "$ROOT/$id/code-sortie.txt"
    date -Iseconds > "$ROOT/$id/fin.txt"
    printf '%s %s %s\n' "$(date -Iseconds)" "$id" "$status" >> "$ROOT/index.log"
    available=$(df -Pk "$ROOT" | awk 'NR==2 {print $4}')
    if [ "$available" -lt 41943040 ]; then echo "Arrêt : moins de 40 Gio libres"; exit 1; fi
  done
done
date -Iseconds > "$ROOT/termine.txt"
