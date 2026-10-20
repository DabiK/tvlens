#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/common.sh"

[[ $# == 2 ]] || fail 'USAGE: launch-corpus.sh NEW_CORPUS_ROOT NEW_STREAMING_ROOT'
root=$1
streaming=$2
require_new_root "$root"
require_source_root "$streaming"
[[ $root != "$streaming" ]] || fail 'ROOTS_COLLIDE'
require_docker_access

source_root=/home/nvidia/tvlens-setup/corpus-etendu-20261020T221045Z
night_source=/home/nvidia/tvlens-setup/nuit-20261020T210107Z
require_sha256 "$source_root/package.tar.gz" 4945225695ad42489465ba91c89262e97c9477d70fc0659b87fab52d94e941d3
require_sha256 "$night_source/package/scripts/night_common.py" e6bec0c7415c67ed1e4901e784a6ee33e6dd58b684bca46dc4ce7804dd30d6b5
require_package_payload "$source_root/package.tar.gz" "$source_root/package"

exec python3 "$source_root/package/scripts/queue.py" \
  --out "$root/results" \
  --streaming-root "$streaming/results" \
  --support "$night_source/package/scripts/night_common.py" \
  --repository /home/nvidia/tvlens \
  --deadline 2026-10-23T05:00:00Z \
  > "$root/launcher.stdout.log" 2> "$root/launcher.stderr.log"
