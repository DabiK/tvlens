#!/bin/sh
set -eu

base=/home/nvidia/tvlens-setup
socket=tvlens-recovery-20261020T224805Z
code="$base/reprise-continuation-20261021T002414Z"
qwen="$base/reprise-qwen-arm-20261021T002414Z"
streaming="$base/reprise-streaming-arm-20261021T002414Z"

test -d "$code"
test -d "$qwen"
test -d "$streaming"
test ! -e "$qwen/results"
test ! -e "$streaming/results"
id -nG | grep -qw docker
docker ps >/dev/null
if tmux -L "$socket" has-session -t tvlens-reprise-qwen-arm 2>/dev/null; then
  echo 'SESSION_ALREADY_EXISTS:qwen' >&2
  exit 1
fi
if tmux -L "$socket" has-session -t tvlens-reprise-streaming-arm 2>/dev/null; then
  echo 'SESSION_ALREADY_EXISTS:streaming' >&2
  exit 1
fi

tmux -L "$socket" new-session -d -s tvlens-reprise-qwen-arm -c "$code" \
  "python3 -B $code/continuation.py ollama --out $qwen/results > $qwen/launcher.stdout.log 2> $qwen/launcher.stderr.log"
tmux -L "$socket" new-session -d -s tvlens-reprise-streaming-arm -c "$code" \
  "python3 -B $code/continuation.py streaming --out $streaming/results --suffix $qwen/results > $streaming/launcher.stdout.log 2> $streaming/launcher.stderr.log"

tmux -L "$socket" list-sessions
