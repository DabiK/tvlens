#!/usr/bin/env bash
# Les fichiers partiels restent distincts jusqu'à vérification de l'empreinte officielle.
set -euo pipefail
ROOT=/srv/tvlens-gx10/poids
while read -r model sha; do
  file="$ROOT/ggml-$model.bin"
  if test -f "$file" && echo "$sha  $file" | sha256sum -c - >/dev/null 2>&1; then
    echo "$model : déjà vérifié"
    continue
  fi
  aria2c --continue=true --max-connection-per-server=8 --split=8 --file-allocation=none \
    --console-log-level=warn --summary-interval=30 --max-tries=3 --retry-wait=5 \
    --checksum="sha-256=$sha" --dir="$ROOT" --out="ggml-$model.bin.part" \
    "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-$model.bin"
  echo "$sha  $file.part" | sha256sum -c -
  mv "$file.part" "$file"
done <<'MODELS'
medium 6c14d5adee5f86394037b4e4e8b59f1673b6cee10e3cf0b11bbdbee79c156208
large-v3-turbo 1fc70f774d38eb169993ac391eea357ef47c88757ef72ee5943879b7e8e2bc69
MODELS
