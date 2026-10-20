#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/common.sh"

[[ $# == 2 ]] || fail 'USAGE: launch-qwen.sh NEW_QWEN_ROOT NEW_NIGHT_ROOT'
root=$1
night=$2
require_new_root "$root"
require_source_root "$night"
[[ $root != "$night" ]] || fail 'ROOTS_COLLIDE'
require_docker_access

source_root=/home/nvidia/tvlens-setup/vision-vllm-20261020T214231Z
night_source=/home/nvidia/tvlens-setup/nuit-20261020T210107Z
require_sha256 "$source_root/package.tar.gz" 12262a8a0168af6a6a8100f0cd1dbc1435f40fefddc37c0827bc464fc34fb4a6
require_sha256 "$night_source/paquet-nuit.tar.gz" 4d6b610987f57cc47e4d2131a2e15f95f8df332fb6b853ee01182b2a883693fb
require_package_payload "$source_root/package.tar.gz" "$source_root/package"

exec python3 "$source_root/package/queue.py" \
  --support "$night_source/package/scripts" \
  --package "$source_root/package" \
  --manifest "$night_source/package/execution/entrees-perception/perception-five-images.json" \
  --repo /home/nvidia/tvlens \
  --night-root "$night/results" \
  --night-lock /home/nvidia/tvlens-setup/night.lock \
  --gpu-lock /home/nvidia/tvlens-setup/followup-gpu.lock \
  --reference-lock /home/nvidia/tvlens-setup/reference-2026-10-20/execution.lock \
  --out "$root/results" \
  > "$root/launcher.stdout.log" 2> "$root/launcher.stderr.log"
