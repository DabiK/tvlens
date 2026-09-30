"""TV-local, bounded lifecycle for the sidebar prototype. No inference or network listener."""
import fcntl,json,os,signal,subprocess,time,uuid
from pathlib import Path
APP='org.tvlens.sidebarprobe'
stop=False
GENERATION=Path('/tmp/tvlens-panel-generation')
WATCHDOG_TIMEOUT=20

def recovery_due(heartbeat, generation, now=None):
    if GENERATION.read_text()!=generation:return False
    return (time.time() if now is None else now)-Path(heartbeat).stat().st_mtime>WATCHDOG_TIMEOUT

def parse_reply(stdout,stderr):
    # Timing mode prefixes stderr and may pretty-print the JSON across lines.
    for stream in (stderr,stdout):
        marker=stream.find('timingServiceResponse')
        candidate=stream[marker:] if marker>=0 else stream
        start=candidate.find('{')
        if start<0:continue
        try:
            value,_=json.JSONDecoder().raw_decode(candidate[start:])
            if isinstance(value,dict) and 'returnValue' in value:return value
        except json.JSONDecodeError:
            continue
    raise ValueError('No complete Luna response received')

def call(endpoint,payload):
    r=subprocess.run(['/usr/bin/luna-send','-t','1','-w','3000','luna://'+endpoint,json.dumps(payload)],capture_output=True,timeout=5)
    return parse_reply(r.stdout.decode('utf-8','replace'),r.stderr.decode('utf-8','replace'))

def video():
    return next(v for v in call('com.webos.service.videooutput/getStatus',{})['video'] if v['sink']=='MAIN')

def rectangles(v):
    if v.get('appId')!='youtube.leanback.v4' or not v.get('connected'):
        raise ValueError('YouTube playback required')
    if v['displayOutput']!={'x':0,'y':0,'width':3840,'height':2160}:
        raise ValueError('Requires tested full-screen 4K layout')
    source={'x':0,'y':0,'width':v['width'],'height':v['height']}
    if v['sourceInput']!=source:raise ValueError('Cropped source not supported')
    restore={'sink':'MAIN','context':v['context'],'fullScreen':v['fullScreen'],
             'displayOutput':{'x':0,'y':0,'width':1920,'height':1080},
             'appOutput':{'x':0,'y':0,'width':1920,'height':1080},
             'sourceInput':source,'originalInput':source}
    target=dict(restore,fullScreen=False,displayOutput={'x':0,'y':135,'width':1440,'height':810},appOutput={'x':0,'y':135,'width':1440,'height':810})
    return restore,target

def on_stop(*_):
    global stop
    stop=True

def restore_original(saved):
    try:
        call('com.webos.surfacemanager/closeByAppId',{'id':APP})
    finally:
        if video().get('context')==saved['context']:
            result=call('com.webos.service.videooutput/display/setDisplayWindow',saved)
            print('restore',json.dumps(result),flush=True)

def main():
    lock=open('/tmp/tvlens-panel.lock','w')
    try:fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
    except BlockingIOError:return
    signal.signal(signal.SIGTERM,on_stop);signal.signal(signal.SIGINT,on_stop)
    saved,target=rectangles(video())
    # Renew a private heartbeat instead of closing a healthy panel on a fixed timer.
    os.umask(0o077)
    generation=uuid.uuid4().hex;GENERATION.write_text(generation)
    heartbeat=Path('/tmp/tvlens-panel-'+generation);heartbeat.touch()
    watchdog=subprocess.Popen(['/usr/bin/python3',__file__,'restore',json.dumps(saved),str(heartbeat),generation],
                              stdin=subprocess.DEVNULL,start_new_session=True)
    try:
        result=call('com.webos.service.videooutput/display/setDisplayWindow',target)
        if not result.get('returnValue'):raise RuntimeError(result)
        result=call('com.webos.applicationManager/launch',{'id':APP})
        if not result.get('returnValue'):raise RuntimeError(result)
        time.sleep(1)
        while not stop:
            v=video()
            if v.get('context')!=saved['context'] or v['displayOutput']!={'x':0,'y':270,'width':2880,'height':1620}:
                print('Media transition: closing panel',flush=True);break
            windows=call('com.webos.surfacemanager/getForegroundWindowInfo',{})
            if not any(w['appId']==APP for w in windows.get('windows',[])):break
            heartbeat.touch()
            time.sleep(.7)
    finally:
        restore_original(saved)
        watchdog.terminate();watchdog.wait(timeout=3)
        heartbeat.unlink(missing_ok=True)
        lock.close()

if __name__=='__main__':
    import sys
    if len(sys.argv)>1 and sys.argv[1]=='restore':
        heartbeat,generation=sys.argv[3:5]
        try:
            while GENERATION.read_text()==generation:
                if recovery_due(heartbeat,generation):
                    restore_original(json.loads(sys.argv[2]));break
                time.sleep(1)
        except FileNotFoundError:pass
        finally:Path(heartbeat).unlink(missing_ok=True)
    else:main()
