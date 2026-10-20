#!/bin/zsh
# Retour arrière du runtime TV (T275) : restaure la sauvegarde prise avant le déploiement de recette-t268.
S=/private/tmp/claude-501/-Users-Dabi-Documents-ISN-tvlens/4adac547-eeec-4cad-9bcb-faf0fa91f853/scratchpad
BK=/Users/Dabi/Documents/TVLens-backups/tv-runtime-20261018-avant-recette-t268.tar
[ -s "$BK" ] || { echo "sauvegarde absente"; exit 1; }
$S/tvssh.sh "tar -xf - -C /media/developer/tvlens-remote" < "$BK" && $S/tvssh.sh 'md5sum /media/developer/tvlens-remote/runtime/panel.py'
