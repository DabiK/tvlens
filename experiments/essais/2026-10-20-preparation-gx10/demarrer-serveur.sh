#!/usr/bin/env bash
# Service initial sur le réseau Tailscale ; les modèles restent sur loopback.
set -euo pipefail
export PATH=/usr/local/cuda/bin:/usr/local/bin:/usr/bin:/bin
export TVLENS_BIND="$(tailscale ip -4)"
export TVLENS_PORT=8787
export TVLENS_SERVER_DATA=/srv/tvlens-gx10/service-data
export TVLENS_CONFIG=/home/nvidia/tvlens-setup/config-initiale.env
set -a
source "$TVLENS_CONFIG"
set +a
cd /home/nvidia/tvlens
exec node server/main.cjs
