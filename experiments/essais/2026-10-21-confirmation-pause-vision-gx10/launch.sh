#!/bin/sh
set -eu

trial_root=/home/nvidia/tvlens-setup/confirmation-pause-20261021T081500Z
exec python3 "$trial_root/confirmation.py" \
  --repo /home/nvidia/tvlens \
  --reference /home/nvidia/tvlens-setup/reference-2026-10-20 \
  --night-common /home/nvidia/tvlens-setup/nuit-20261020T210107Z/package/scripts/night_common.py \
  --frozen-plan /home/nvidia/tvlens-setup/nuit-20261020T210107Z/package/execution/plan.json \
  --reservation "$trial_root/reservation.json" \
  --out "$trial_root/results" \
  --deadline 2026-10-21T11:15:00+00:00
