#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/common.sh"

[[ $# == 3 ]] || fail 'USAGE: launch-streaming.sh NEW_STREAMING_ROOT NEW_NIGHT_ROOT NEW_QWEN_ROOT'
root=$1
night=$2
qwen=$3
require_new_root "$root"
require_source_root "$night"
require_source_root "$qwen"
[[ $root != "$night" && $root != "$qwen" && $night != "$qwen" ]] || fail 'ROOTS_COLLIDE'
require_docker_access

source_root=/home/nvidia/tvlens-setup/streamingvlm-20261020T220235Z
night_source=/home/nvidia/tvlens-setup/nuit-20261020T210107Z
require_sha256 "$source_root/package.tar.gz" c1fa9b1eb71b0051caf80338d74c5007034ec7f9ca075c095c4c6410b2d29115
require_sha256 "$source_root/upstream.tar.gz" b06647955747616ff91c8be46413bb20971f65a834ed76bdf481e266f4c39d1a
require_sha256 "$night_source/paquet-nuit.tar.gz" 4d6b610987f57cc47e4d2131a2e15f95f8df332fb6b853ee01182b2a883693fb
require_package_payload "$source_root/package.tar.gz" "$source_root/package"

exec python3 "$source_root/package/scripts/queue.py" \
  --support "$night_source/package/scripts" \
  --package "$source_root/package" \
  --upstream "$source_root/upstream" \
  --video /srv/tvlens-gx10/videos/spring.mp4 \
  --night-root "$night/results" \
  --sidecar-root "$qwen/results" \
  --night-lock /home/nvidia/tvlens-setup/night.lock \
  --gpu-lock /home/nvidia/tvlens-setup/followup-gpu.lock \
  --reference-lock /home/nvidia/tvlens-setup/reference-2026-10-20/execution.lock \
  --out "$root/results" \
  --image nvcr.io/nvidia/pytorch:26.09-py3@sha256:307c449df7dabed6b36e017a2b2f2e45bdec9dc203b81507111315f1e971de6e \
  > "$root/launcher.stdout.log" 2> "$root/launcher.stderr.log"
