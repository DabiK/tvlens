# Sonde d'une application ($1 : nom) : état, capture, 3 s d'audio, puis panneau 5 s ouvert et refermé.
N="$1"
lecture() { l com.webos.media/getForegroundAppInfo | python3 -c 'import json,sys; print("lecture", [(a.get("appId"),a.get("playState")) for a in json.load(sys.stdin).get("foregroundAppInfo",[])])'; }
etat "$N-avant"; lecture; shot "$N-avant"
arecord -D hw:0,13 -t wav -f S16_LE -r 48000 -c 2 -d 3 /tmp/t-sonde-$N.wav 2>&1 | tail -1
setsid python3 /tmp/sonde-panel.py > /tmp/tvlens-panel.log 2>&1 < /dev/null &
sleep 5; etat "$N-ouvert"; lecture; shot "$N-ouvert"
l com.webos.applicationManager/closeByAppId '{"id":"org.tvlens.sidebarprobe"}'
sleep 4; etat "$N-ferme"; lecture; shot "$N-ferme"
echo LOG; cat /tmp/tvlens-panel.log
