#!/usr/bin/env bash
# Installation de la GX10 pour les campagnes TVLens (Linux ARM64, root). Idempotent : chaque étape vérifie avant d'agir.
# Usage : sudo bash installer-gx10.sh /srv/tvlens-gx10
# Ce que le script installe : paquets système (git, ffmpeg, cmake, compilateurs), Node 24, Ollama (sans exposition
# publique : écoute sur 127.0.0.1 seulement), whisper.cpp compilé avec CUDA, poids Whisper. Il relève les versions dans
# <racine>/installation.txt. Les copies du code arrivent par le paquet Git du kit (copies.bundle), pas par Internet.
set -euo pipefail
ROOT=${1:?racine, par exemple /srv/tvlens-gx10}
KIT=$(cd "$(dirname "$0")" && pwd)
mkdir -p "$ROOT"/{copies,poids,videos,outils}
LOG="$ROOT/installation.txt"
note() { echo "$(date -Is) $*" | tee -a "$LOG"; }

note "machine : $(uname -a)"
note "système : $(. /etc/os-release && echo "$PRETTY_NAME")"
command -v nvidia-smi >/dev/null && note "GPU : $(nvidia-smi --query-gpu=name,driver_version,memory.total --format=csv,noheader)" || note "GPU : nvidia-smi absent"
command -v nvcc >/dev/null && note "CUDA : $(nvcc --version | tail -1)" || note "CUDA : nvcc absent (whisper.cpp sera compilé sans CUDA)"

# Paquets système.
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq git ffmpeg cmake build-essential curl ca-certificates tmux jq >/dev/null
note "ffmpeg : $(ffmpeg -version | head -1)"

# Node 24 (archive officielle nodejs.org, ARM64), si absent ou plus ancien.
if ! command -v node >/dev/null || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 24 ]; then
  V=$(curl -fsSL https://nodejs.org/dist/index.json | jq -r '[.[] | select(.version | startswith("v24."))][0].version')
  curl -fsSL "https://nodejs.org/dist/$V/node-$V-linux-arm64.tar.xz" -o "$ROOT/outils/node.tar.xz"
  curl -fsSL "https://nodejs.org/dist/$V/SHASUMS256.txt" | grep "node-$V-linux-arm64.tar.xz" | sed "s|node-$V-linux-arm64.tar.xz|$ROOT/outils/node.tar.xz|" | sha256sum -c -
  tar -xJf "$ROOT/outils/node.tar.xz" -C /usr/local --strip-components=1
fi
note "node : $(node --version)"

# Ollama : installeur officiel. Le service système est arrêté : l'exécuteur lance lui-même `ollama serve` sur
# 127.0.0.1 (aucun port public), avec les réglages de chaque campagne et les modèles sous <racine>/modeles-ollama.
if ! command -v ollama >/dev/null; then curl -fsSL https://ollama.com/install.sh | sh; fi
systemctl disable --now ollama 2>/dev/null || true
mkdir -p "$ROOT/modeles-ollama"
note "ollama : $(ollama --version 2>&1 | tail -1)"

# whisper.cpp avec CUDA si disponible.
if [ ! -x "$ROOT/outils/whisper.cpp/build/bin/whisper-cli" ]; then
  git clone --depth 1 https://github.com/ggml-org/whisper.cpp "$ROOT/outils/whisper.cpp"
  CUDA=OFF; command -v nvcc >/dev/null && CUDA=ON
  cmake -S "$ROOT/outils/whisper.cpp" -B "$ROOT/outils/whisper.cpp/build" -DGGML_CUDA=$CUDA -DCMAKE_BUILD_TYPE=Release >/dev/null
  cmake --build "$ROOT/outils/whisper.cpp/build" -j"$(nproc)" --config Release >/dev/null
fi
note "whisper.cpp : $(git -C "$ROOT/outils/whisper.cpp" rev-parse --short HEAD), CUDA $(grep -c 'GGML_CUDA:BOOL=ON' "$ROOT/outils/whisper.cpp/build/CMakeCache.txt" || true)"

# Poids Whisper (dépôt officiel des modèles ggml de whisper.cpp).
for m in base small medium large-v3-turbo; do
  f="$ROOT/poids/ggml-$m.bin"
  [ -s "$f" ] || curl -fsSL "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-$m.bin" -o "$f"
done
( cd "$ROOT/poids" && sha256sum ggml-*.bin ) | tee -a "$LOG"

# Copies du code depuis le paquet Git du kit : un clone par tag, dépendances de production.
if [ -f "$KIT/copies.bundle" ]; then
  for tag in $(git bundle list-heads "$KIT/copies.bundle" | awk '{print $2}' | sed -n 's|^refs/tags/||p'); do
    dir="$ROOT/copies/$tag"
    [ -d "$dir" ] || { git clone -q "$KIT/copies.bundle" "$dir" && git -C "$dir" checkout -q "$tag"; }
    [ -d "$dir/node_modules" ] || (cd "$dir" && npm ci --omit=dev --no-audit --no-fund >/dev/null)
    note "copie $tag : $(git -C "$dir" rev-parse HEAD)"
  done
fi
note "installation terminée"
