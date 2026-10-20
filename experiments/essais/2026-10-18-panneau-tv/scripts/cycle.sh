# Cycle ouvrir puis fermer le panneau, lancé comme le répartiteur de touches ($1 : nom de l'essai).
cd /media/developer/tvlens-remote/runtime
etat "$1-avant"; shot "$1-avant"
setsid python3 panel.py > /tmp/tvlens-panel.log 2>&1 < /dev/null &
sleep 5; etat "$1-ouvert"; shot "$1-ouvert"
l com.webos.applicationManager/closeByAppId '{"id":"org.tvlens.sidebarprobe"}'
sleep 4; etat "$1-ferme"; shot "$1-ferme"
echo LOG; cat /tmp/tvlens-panel.log
