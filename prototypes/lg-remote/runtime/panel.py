"""TV-local, bounded lifecycle for the sidebar prototype. No inference or network listener."""
import fcntl,json,os,signal,subprocess,time,uuid
from pathlib import Path
APP='org.tvlens.sidebarprobe'
stop=False
GENERATION=Path('/tmp/tvlens-panel-generation')
WATCHDOG_TIMEOUT=20
LAYOUT_REQUEST=Path('/tmp/tvlens-panel-layout-request.json')
LAYOUT_STATE=Path('/tmp/tvlens-panel-layout-state.json')

def layout_target(saved, mode):
    if mode not in ('chat','timeline'):raise ValueError('Unknown panel layout')
    area=(0,0,1440,1080) if mode=='chat' else (0,0,1920,720)
    source=saved['sourceInput']; ratio=source['width']/source['height']
    width=min(area[2],int(area[3]*ratio));height=int(width/ratio)
    rect={'x':area[0]+(area[2]-width)//2,'y':area[1]+(area[3]-height)//2,'width':width,'height':height}
    return dict(saved,fullScreen=False,displayOutput=rect,appOutput=rect)

def physical_rect(target):
    return {key:value*2 for key,value in target['displayOutput'].items()}

def write_layout(value):
    temporary=LAYOUT_STATE.with_suffix('.tmp')
    temporary.write_text(json.dumps(value));temporary.replace(LAYOUT_STATE)


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

def reported_source(v):
    """Keep Luna's source coordinate space across adaptive decoder resolutions.

    A 720p decoder may still report a 1080p source rectangle. Accept only
    positive, origin-aligned rectangles with the same aspect ratio; an
    offset or aspect-changing crop still needs separate validation.
    """
    source=v.get('sourceInput')
    if not isinstance(source,dict):raise ValueError('Missing source rectangle')
    dimensions=[v.get('width'),v.get('height'),source.get('width'),source.get('height')]
    if any(type(value) is not int or value<=0 for value in dimensions):
        raise ValueError('Invalid video dimensions')
    if source.get('x')!=0 or source.get('y')!=0:
        raise ValueError('Cropped source not supported')
    width,height,source_width,source_height=dimensions
    if source_width*height!=source_height*width:
        raise ValueError('Source aspect ratio differs from decoded video')
    return {key:source[key] for key in ('x','y','width','height')}

def rectangles(v):
    if v.get('appId')!='youtube.leanback.v4' or not v.get('connected'):
        raise ValueError('YouTube playback required')
    if v['displayOutput']!={'x':0,'y':0,'width':3840,'height':2160}:
        raise ValueError('Requires tested full-screen 4K layout')
    source=reported_source(v)
    restore={'sink':'MAIN','context':v['context'],'fullScreen':v['fullScreen'],
             'displayOutput':{'x':0,'y':0,'width':1920,'height':1080},
             'appOutput':{'x':0,'y':0,'width':1920,'height':1080},
             'sourceInput':source,'originalInput':source}
    target=layout_target(restore,'chat')
    return restore,target

def on_stop(*_):
    global stop
    stop=True

def restore_original(saved):
    write_layout({"active":False,"mode":"chat"})
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
    mode="chat";request_id=None
    LAYOUT_REQUEST.unlink(missing_ok=True)
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
        write_layout({'active':True,'mode':mode,'requestId':request_id})
        time.sleep(1)
        while not stop:
            v=video()
            if v.get('context')!=saved['context'] or v['displayOutput']!=physical_rect(target):
                print('Media transition: closing panel',flush=True);break
            windows=call('com.webos.surfacemanager/getForegroundWindowInfo',{})
            if not any(w['appId']==APP for w in windows.get('windows',[])):break
            try:requested=json.loads(LAYOUT_REQUEST.read_text())
            except (OSError,ValueError):requested={}
            if requested.get('id')!=request_id and requested.get('mode') in ('chat','timeline'):
                next_target=layout_target(saved,requested['mode'])
                result=call('com.webos.service.videooutput/display/setDisplayWindow',next_target)
                if not result.get('returnValue'):raise RuntimeError(result)
                target=next_target;mode=requested['mode'];request_id=requested['id']
                write_layout({'active':True,'mode':mode,'requestId':request_id})
            heartbeat.touch()
            time.sleep(.7)
    finally:
        write_layout({"active":False,"mode":"chat"})
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
