l() { /usr/bin/luna-send -t 1 -w 3000 "luna://$1" "${2:-{\}}" 2>&1 | awk '/payload /{sub(/.*payload /,"");p=1} /^Total time|bytes sent|bytes received/{p=0} p'; }
etat() {
  echo "-- $1 $(date +%H:%M:%S)"
  l com.webos.service.videooutput/getStatus | python3 -c 'import json,sys; v=json.load(sys.stdin)["video"]; print(json.dumps([{k:x.get(k) for k in ("appId","connected","fullScreen","displayOutput","sourceInput","width","height","context")} for x in v if x["sink"]=="MAIN"]))'
  l com.webos.surfacemanager/getForegroundWindowInfo | python3 -c 'import json,sys; print("fenetres", [w.get("appId") for w in json.load(sys.stdin).get("windows",[])])'
  echo "panel.py: $(ps -ef | grep 'runtime/panel.py' | grep -v grep | grep -vc restore) controleur, $(ps -ef | grep 'panel.py restore' | grep -v grep | wc -l) recuperation"
  echo "layout: $(cat /tmp/tvlens-panel-layout-state.json 2>/dev/null)"
}
shot() { l com.webos.service.capture/executeOneShot "{\"path\":\"/tmp/t275-$1.png\",\"method\":\"DISPLAY\",\"format\":\"PNG\",\"width\":1280,\"height\":720}" >/dev/null; }
