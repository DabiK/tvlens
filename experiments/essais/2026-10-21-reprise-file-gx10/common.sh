#!/usr/bin/env bash
set -euo pipefail
umask 077

fail() {
  printf '%s\n' "$1" >&2
  exit 1
}

require_new_root() {
  local root=$1
  [[ $root == /home/nvidia/tvlens-setup/reprise-* ]] || fail 'RESULT_ROOT_NOT_RECOVERY'
  [[ -d $root && ! -L $root && ! -e $root/results ]] || fail 'RESULT_ROOT_NOT_NEW'
}

require_source_root() {
  local root=$1
  [[ $root == /home/nvidia/tvlens-setup/reprise-* ]] || fail 'PREDECESSOR_ROOT_NOT_RECOVERY'
  [[ -d $root && ! -L $root ]] || fail 'PREDECESSOR_ROOT_MISSING'
}

require_sha256() {
  local path=$1 expected=$2 actual
  [[ -f $path ]] || fail 'PACKAGE_MISSING'
  actual=$(sha256sum "$path")
  [[ ${actual%% *} == "$expected" ]] || fail 'PACKAGE_SHA_MISMATCH'
}

require_package_payload() {
  local archive=$1 package=$2
  python3 - "$archive" "$package" <<'PY'
import hashlib
from pathlib import Path
import sys
import tarfile

root = Path(sys.argv[2]).resolve()
with tarfile.open(sys.argv[1], 'r:gz') as source:
    for member in source:
        relative = Path(member.name)
        if relative.is_absolute() or '..' in relative.parts:
            raise SystemExit('PACKAGE_ARCHIVE_PATH_INVALID')
        if not member.isfile():
            continue
        local = (root / relative).resolve()
        if not local.is_relative_to(root) or not local.is_file():
            raise SystemExit('PACKAGE_CONTENT_MISSING')
        expected = hashlib.sha256(source.extractfile(member).read()).digest()
        observed = hashlib.sha256(local.read_bytes()).digest()
        if expected != observed:
            raise SystemExit('PACKAGE_CONTENT_MISMATCH')
PY
}

require_docker_access() {
  [[ " $(id -nG) " == *' docker '* ]] || fail 'DOCKER_GROUP_NOT_EFFECTIVE'
  docker ps --format '{{.ID}}' > /dev/null || fail 'DOCKER_SOCKET_UNAVAILABLE'
}
