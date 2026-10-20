#!/bin/zsh
# Retour arrière TV de la recette T289 : runtime du panneau, capture et contrôleur, page (connection.js jamais touché).
S=/private/tmp/claude-501/-Users-Dabi-Documents-ISN-tvlens/4adac547-eeec-4cad-9bcb-faf0fa91f853/scratchpad; B=/Users/Dabi/Documents/TVLens-backups; A=/media/developer/apps/usr/palm/applications/org.tvlens.sidebarprobe
$S/tvssh.sh "tar -xf - -C /media/developer/tvlens-remote" < $B/tv-runtime-20261019-avant-recette-t289.tar
$S/tvssh.sh "tar -xf - -C /media/developer/tvlens-companion" < $B/tv-companion-20261019-avant-recette-t289.tar
$S/tvssh.sh "tar -xf - -C $A" < $B/tv-app-20261019-avant-recette-t289.tar && echo "TV restaurée"
