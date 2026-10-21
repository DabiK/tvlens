#!/bin/sh
set -eu

base=/home/nvidia/tvlens-setup
socket=tvlens-recovery-20261020T224805Z
session=tvlens-reprise-streaming-buildkit
code=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
root=${1:?dossier de reprise neuf requis}
case "$root" in
  "$base"/reprise-streaming-buildkit-*) ;;
  *) echo 'RESULT_ROOT_INVALID' >&2; exit 1 ;;
esac
case "${root##*/}" in
  *[!a-zA-Z0-9_-]*) echo 'RESULT_ROOT_INVALID' >&2; exit 1 ;;
esac
test "$(dirname -- "$root")" = "$base"
test -d "$root"
test ! -L "$root"
test ! -e "$root/results"
test ! -e "$root/launcher.stdout.log"
test ! -e "$root/launcher.stderr.log"
test "$(dirname -- "$code")" = "$base"
test -f "$code/continuation.py"
case "$code" in
  "$base"/reprise-streaming-buildkit-*) ;;
  *) echo 'SOURCE_ROOT_INVALID' >&2; exit 1 ;;
esac
case "${code##*/}" in
  *[!a-zA-Z0-9_-]*) echo 'SOURCE_ROOT_INVALID' >&2; exit 1 ;;
esac
id -nG | grep -qw docker
docker ps >/dev/null
sessions=$(tmux -L "$socket" list-sessions -F '#{session_name}' 2>/dev/null || true)
case "$sessions" in
  *tvlens-reprise-*) echo 'RECOVERY_SESSION_ALREADY_EXISTS' >&2; exit 1 ;;
esac
# Le dossier créé atomiquement interdit une seconde admission, même avant la création de results.
mkdir "$root/launch-once"
tmux -L "$socket" new-session -d -s "$session" -c "$code" \
  "python3 -B $code/continuation.py --out $root/results > $root/launcher.stdout.log 2> $root/launcher.stderr.log"
tmux -L "$socket" list-sessions
