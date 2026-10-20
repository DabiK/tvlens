#!/usr/bin/env bash
set -euo pipefail
ROOT=$(cd "$(dirname "$0")" && pwd)
cd /home/nvidia/tvlens
for item in cnrs-apprentissage kennedy spring; do
  case "$item" in
    cnrs-apprentissage) video=04-cnrs-entrainement-ia.mp4 ;;
    kennedy) video=kennedy-rice-7min.mp4 ;;
    spring) video=spring.mp4 ;;
  esac
  duration=()
  if [ "$item" = spring ]; then duration=(--duration-ms 464000); fi
  node scripts/prepare-video-replay.cjs --file "/srv/tvlens-gx10/videos/$video" --out "$ROOT/preparation-$item" --start-ms 0 "${duration[@]}" --block-ms 8000 --frames 5 --jpeg-quality 3 --config "$ROOT/config.env" > "$ROOT/preparation-$item.log" 2>&1
done
printf 'Préparations terminées\n' > "$ROOT/preparation-terminee.txt"
