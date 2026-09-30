"""LG-01 feasibility probe, explicitly launched against SSH alias tv-lg.
Requires the probe IPK installed and YouTube playing full-screen on the tested 4K LG.
Writes private evidence outside Git; restores display and closes only the probe.
Not a persistent capture service or a production window manager.
"""
import argparse,json,subprocess,shlex,time,os
parser=argparse.ArgumentParser()
parser.add_argument("--duration",type=int,default=35,choices=range(10,171),metavar="10..170")
args=parser.parse_args()
from pathlib import Path
os.umask(0o077)
out=Path.home()/'Documents/TVLens-private/sidebar-tests'/time.strftime('%Y%m%d-%H%M%S');out.mkdir(parents=True)
remote='/tmp/tvlens-sidebar-'+str(int(time.time()))
def ssh(cmd,tty=False):
 r=subprocess.run(['ssh']+(['-tt'] if tty else [])+['-o','BatchMode=yes','-o','ConnectTimeout=5','tv-lg',cmd],capture_output=True,timeout=12)
 if r.returncode:raise RuntimeError(r.stderr.decode())
 return r.stdout
def command(endpoint,payload):return 'luna-send -n 1 -w 3000 luna://'+endpoint+' '+shlex.quote(json.dumps(payload,separators=(',',':')))
def call(endpoint,payload):return json.loads(ssh(command(endpoint,payload),True).decode().strip())
def capture(name):
 r=call('com.webos.service.capture/executeOneShot',{'path':remote+'/frame.png','method':'DISPLAY','format':'PNG','width':1280,'height':720})
 if r.get('returnValue'):(out/(name+'.png')).write_bytes(ssh('cat '+remote+'/frame.png'))
status=call('com.webos.service.videooutput/getStatus',{})
v=next(v for v in status['video'] if v['sink']=='MAIN')
assert v['appId']=='youtube.leanback.v4' and v['connected'], 'Open YouTube playback first'
assert v['displayOutput']=={'x':0,'y':0,'width':3840,'height':2160}, 'Probe restricted to full-screen 4K baseline'
assert v['sourceInput']=={'x':0,'y':0,'width':v['width'],'height':v['height']}, 'Probe requires an uncropped source'
print('Private evidence:',out,flush=True)
(out/'before.json').write_text(json.dumps(status,indent=2))
restore={k:v[k] for k in ['sink','context','fullScreen','displayOutput','sourceInput']}
restore['displayOutput']={k:val//2 for k,val in v['displayOutput'].items()}
restore['originalInput']=dict(v['sourceInput'])
restore['appOutput']=dict(restore['displayOutput'])
restorecmd=command('com.webos.service.videooutput/display/setDisplayWindow',restore)
ssh('mkdir '+remote)
# TV-owned rollback runs even if the controlling Mac disappears. Guard against a different programme pipeline.
check=command('com.webos.service.videooutput/getStatus',{})
closecmd=command('com.webos.surfacemanager/closeByAppId',{'id':'org.tvlens.sidebarprobe'})
script='#!/bin/sh\nsleep '+str(args.duration+10)+'\n'+closecmd+'\n'+check+' | grep -F '+shlex.quote(v['context'])+' >/dev/null && '+restorecmd+'\n'
subprocess.run(['ssh','tv-lg','cat > '+remote+'/restore.sh'],input=script.encode(),check=True)
watchdog_started=time.monotonic()
ssh('nohup sh '+remote+'/restore.sh > '+remote+'/restore.log 2>&1 < /dev/null &')
try:
 capture('before')
 target=dict(restore,displayOutput={'x':0,'y':135,'width':1440,'height':810},fullScreen=False)
 target['appOutput']=dict(target['displayOutput'])
 result=call('com.webos.service.videooutput/display/setDisplayWindow',target)
 (out/'resize.json').write_text(json.dumps(result))
 assert result.get('returnValue'),result
 time.sleep(1)
 call('com.webos.applicationManager/launch',{'id':'org.tvlens.sidebarprobe','params':{'durationMs':(args.duration+5)*1000}})
 end=time.monotonic()+args.duration
 i=0
 while time.monotonic()<end:
  time.sleep(2)
  state=call('com.webos.service.videooutput/getStatus',{})
  (out/('state-'+str(i)+'.json')).write_text(json.dumps(state,indent=2))
  current_video=next(x for x in state['video'] if x['sink']=='MAIN')
  if current_video.get('context')!=v['context'] or current_video['displayOutput']!={'x':0,'y':270,'width':2880,'height':1620}:
   print('Media transition / geometry change: closing probe to avoid masking.',flush=True)
   break
  windows=call('com.webos.surfacemanager/getForegroundWindowInfo',{})
  if not any(x['appId']=='org.tvlens.sidebarprobe' for x in windows.get('windows',[])):
   print('Panel closed: restoring programme geometry.',flush=True)
   break
  if i%3==0: capture('during-'+str(i))
  i+=1
 during=call('com.webos.service.videooutput/getStatus',{});(out/'during.json').write_text(json.dumps(during,indent=2))
 print(json.dumps({'output':str(out),'result':result,'during':during['video'][0]['displayOutput']}),flush=True)
finally:
 closed=call('com.webos.surfacemanager/closeByAppId',{'id':'org.tvlens.sidebarprobe'})
 (out/'close.json').write_text(json.dumps(closed))
 current=call('com.webos.service.videooutput/getStatus',{})
 if any(x.get('context')==v['context'] for x in current['video']):
  result=call('com.webos.service.videooutput/display/setDisplayWindow',restore)
  (out/'restore.json').write_text(json.dumps(result))
 time.sleep(2);capture('after')
 (out/'after.json').write_text(json.dumps(call('com.webos.service.videooutput/getStatus',{}),indent=2))
 # Let watchdog finish, then keep its result locally.
 time.sleep(max(0,args.duration+13-(time.monotonic()-watchdog_started)))
 (out/'watchdog.log').write_bytes(ssh('cat '+remote+'/restore.log'))
 ssh('rm -f '+remote+'/frame.png '+remote+'/restore.sh '+remote+'/restore.log; rmdir '+remote)
 after=json.loads((out/'after.json').read_text())['video'][0]
 restored=after.get('context')==v['context'] and after['displayOutput']==v['displayOutput']
 print(json.dumps({'same_pipeline_restored':restored,'note':'Pipeline transition requires separate validation' if not restored else 'Original display rectangle restored'}),flush=True)
