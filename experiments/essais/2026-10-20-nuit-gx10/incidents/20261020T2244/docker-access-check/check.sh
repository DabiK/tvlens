#!/bin/sh
id
awk '/^(Uid|Gid|Groups):/' /proc/self/status
docker info --format '{{json .ServerVersion}}'
info_status=$?
docker ps --format '{{.ID}} {{.Names}} {{.Status}}'
ps_status=$?
printf 'docker_info_exit=%s docker_ps_exit=%s\n' "$info_status" "$ps_status"
[ "$info_status" = 0 ] && [ "$ps_status" = 0 ]
printf '%s\n' "$?" > /tmp/tvlens-docker-check-20261020T224534Z-4f69b3/exit-code
