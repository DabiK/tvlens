"""TV-local, bounded lifecycle for the sidebar prototype. No inference or network listener."""
import fcntl,json,os,signal,subprocess,time,uuid
from pathlib import Path
APP='org.tvlens.sidebarprobe'
stop=False
GENERATION=Path('/tmp/tvlens-panel-generation')
WATCHDOG_TIMEOUT=20
LAYOUT_REQUEST=Path('/tmp/tvlens-panel-layout-request.json')
LAYOUT_STATE=Path('/tmp/tvlens-panel-layout-state.json')
LOCK='/tmp/tvlens-panel.lock'
HEARTBEAT_PREFIX='/tmp/tvlens-panel-'
# Shared with the ambient display (tv/ambient.py): the panel and an ambient card are never on screen together.
AMBIENT_RUN=Path(os.environ.get('TVLENS_AMBIENT_RUN') or '/tmp')
SCREEN_LOCK=AMBIENT_RUN/'tvlens-screen.lock'
AMBIENT_NOTICE=AMBIENT_RUN/'tvlens-ambient-dismiss-panel.json'
AMBIENT_GATE=AMBIENT_RUN/'tvlens-ambient-gate.json'
AMBIENT_APP='org.tvlens.ambient'
SCREEN_WAIT=2
RELAUNCH_WINDOW=8
monotonic=time.monotonic
pause=time.sleep

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

def screen_lock():
    """The screen lock if it is free, else None. Never blocking: Rakuten must always open the panel.
    A lock file that cannot be opened raises OSError: every caller swallows it."""
    handle=open(SCREEN_LOCK,'a')
    try:fcntl.flock(handle,fcntl.LOCK_EX|fcntl.LOCK_NB);return handle
    except OSError:handle.close();return None

def ambient_app():
    try:
        app=json.loads(AMBIENT_GATE.read_text()).get('app')
        return app if isinstance(app,str) and app.startswith('org.tvlens.') and app!=APP else AMBIENT_APP
    except (OSError,ValueError,AttributeError):return AMBIENT_APP

def ambient_yield():
    """Ask an ambient card to leave before the panel touches anything. Returns (screen lock or None, contended).

    A notice first (a file, no Luna call): the ambient supervisor refuses any paint from now on. Then the screen
    lock is awaited for two seconds at most. Without it the card is closed directly and the panel opens anyway.
    Bounded, and every exception is swallowed: nothing here may keep Rakuten from opening the panel.
    """
    held=None;contended=False
    try:
        temporary=AMBIENT_NOTICE.with_name(AMBIENT_NOTICE.name+'.'+str(os.getpid())+'.tmp')
        temporary.write_text(json.dumps({'atMono':monotonic(),'pid':os.getpid()}));temporary.replace(AMBIENT_NOTICE)
        deadline=monotonic()+SCREEN_WAIT
        held=screen_lock()
        # A lock that is taken means a card is armed, shown or still in flight.
        contended=held is None
        while held is None and monotonic()<deadline:
            pause(.1);held=screen_lock()
        if held is None:call('com.webos.surfacemanager/closeByAppId',{'id':ambient_app()})
    except Exception:pass
    return held,contended

def main():
    lock=open(LOCK,'w')
    try:fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
    except BlockingIOError:return
    signal.signal(signal.SIGTERM,on_stop);signal.signal(signal.SIGINT,on_stop)
    # After the panel's own lock and before any mutation.
    screen,contended=ambient_yield()
    saved,target=rectangles(video())
    mode="chat";request_id=None
    LAYOUT_REQUEST.unlink(missing_ok=True)
    # Renew a private heartbeat instead of closing a healthy panel on a fixed timer.
    os.umask(0o077)
    generation=uuid.uuid4().hex;GENERATION.write_text(generation)
    heartbeat=Path(HEARTBEAT_PREFIX+generation);heartbeat.touch()
    watchdog=subprocess.Popen(['/usr/bin/python3',__file__,'restore',json.dumps(saved),str(heartbeat),generation],
                              stdin=subprocess.DEVNULL,start_new_session=True)
    try:
        result=call('com.webos.service.videooutput/display/setDisplayWindow',target)
        if not result.get('returnValue'):raise RuntimeError(result)
        result=call('com.webos.applicationManager/launch',{'id':APP})
        if not result.get('returnValue'):raise RuntimeError(result)
        launched=monotonic();relaunched=False
        # `video` is the logical rectangle the application must keep clear of its own overlay.
        write_layout({'active':True,'mode':mode,'requestId':request_id,'video':target['displayOutput']})
        pause(1)
        while not stop:
            if screen is None:
                # Asked for again at each turn. A lock file that cannot be opened (run directory absent) is no
                # reason to close a panel the viewer just opened: it goes on without the lock.
                try:screen=screen_lock()
                except OSError:pass
            v=video()
            if v.get('context')!=saved['context'] or v['displayOutput']!=physical_rect(target):
                print('Media transition: closing panel',flush=True);break
            windows=call('com.webos.surfacemanager/getForegroundWindowInfo',{})
            listed=[w.get('appId') for w in windows.get('windows',[])]
            if APP not in listed:
                # An ambient window launched in flight may be born after the panel and, on a compositor that
                # keeps one overlay surface, close it. Tolerated once, shortly after the launch, and only when
                # a card was really in the way: close it, relaunch the panel, do not restore.
                ambient=ambient_app()
                if relaunched or monotonic()-launched>RELAUNCH_WINDOW or not (contended or ambient in listed):break
                relaunched=True
                try:call('com.webos.surfacemanager/closeByAppId',{'id':ambient})
                except Exception:pass
                result=call('com.webos.applicationManager/launch',{'id':APP})
                if not result.get('returnValue'):raise RuntimeError(result)
                heartbeat.touch();pause(1);continue
            try:requested=json.loads(LAYOUT_REQUEST.read_text())
            except (OSError,ValueError):requested={}
            if requested.get('id')!=request_id and requested.get('mode') in ('chat','timeline'):
                next_target=layout_target(saved,requested['mode'])
                result=call('com.webos.service.videooutput/display/setDisplayWindow',next_target)
                if not result.get('returnValue'):raise RuntimeError(result)
                target=next_target;mode=requested['mode'];request_id=requested['id']
                write_layout({'active':True,'mode':mode,'requestId':request_id,'video':target['displayOutput']})
            heartbeat.touch()
            pause(.7)
    finally:
        write_layout({"active":False,"mode":"chat"})
        restore_original(saved)
        watchdog.terminate();watchdog.wait(timeout=3)
        heartbeat.unlink(missing_ok=True)
        # The screen is given back only once the video is restored: the ambient display resumes after that.
        if screen is not None:screen.close()
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
