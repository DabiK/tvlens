#!/usr/bin/env bash
set -euo pipefail
umask 077

root=/home/nvidia/tvlens-setup/streamingvlm-20261020T220235Z
night=/home/nvidia/tvlens-setup/nuit-20261020T210107Z
sidecar=/home/nvidia/tvlens-setup/vision-vllm-20261020T214231Z
image=nvcr.io/nvidia/pytorch:26.09-py3@sha256:307c449df7dabed6b36e017a2b2f2e45bdec9dc203b81507111315f1e971de6e

exec python3 "$root/package/scripts/queue.py" \
  --support "$night/package/scripts" \
  --package "$root/package" \
  --upstream "$root/upstream" \
  --video /srv/tvlens-gx10/videos/spring.mp4 \
  --night-root "$night/results" \
  --sidecar-root "$sidecar/results" \
  --night-lock /home/nvidia/tvlens-setup/night.lock \
  --gpu-lock /home/nvidia/tvlens-setup/followup-gpu.lock \
  --reference-lock /home/nvidia/tvlens-setup/reference-2026-10-20/execution.lock \
  --out "$root/results" \
  --image "$image" \
  > "$root/launcher.stdout.log" 2> "$root/launcher.stderr.log"
