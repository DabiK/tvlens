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
SCREEN_WIDTH=3840
SCREEN_HEIGHT=2160
DISPLAY_SCALE=2
TVLENS_PANEL_PLAYBACK_REQUIRED='TVLENS_PANEL_PLAYBACK_REQUIRED'
TVLENS_PANEL_SOURCE_CROPPED='TVLENS_PANEL_SOURCE_CROPPED'
TVLENS_PANEL_SOURCE_INVALID='TVLENS_PANEL_SOURCE_INVALID'
TVLENS_PANEL_OUTPUT_INVALID='TVLENS_PANEL_OUTPUT_INVALID'
TVLENS_PANEL_NOTIFICATION_FAILED='TVLENS_PANEL_NOTIFICATION_FAILED'
PLAYBACK_MESSAGE='TVLens : lance une vidéo YouTube pour ouvrir le panneau.'
OUTPUT_MESSAGE='TVLens : le rectangle vidéo est invalide ou dépasse l’écran.'
pause=time.sleep

class PanelRefusal(ValueError):
    def __init__(self,code,detail,message):
        super().__init__(detail)
        self.code=code
        self.user_message=message

def layout_target(saved, mode):
    if mode not in ('chat','timeline'):raise ValueError('Unknown panel layout')
    area=(0,0,1440,1080) if mode=='chat' else (0,0,1920,720)
    source=saved['sourceInput']; ratio=source['width']/source['height']
    width=min(area[2],int(area[3]*ratio));height=int(width/ratio)
    rect={'x':area[0]+(area[2]-width)//2,'y':area[1]+(area[3]-height)//2,'width':width,'height':height}
    return dict(saved,fullScreen=False,displayOutput=rect,appOutput=rect)

def physical_rect(target):
    return {key:value*DISPLAY_SCALE for key,value in target['displayOutput'].items()}

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
    try:
        return next(v for v in call('com.webos.service.videooutput/getStatus',{})['video'] if v['sink']=='MAIN')
    except StopIteration as error:
        raise PanelRefusal(TVLENS_PANEL_PLAYBACK_REQUIRED,'No MAIN video reported',PLAYBACK_MESSAGE) from error

def reported_source(v):
    """Keep Luna's source coordinate space across adaptive decoder resolutions.

    A 720p decoder may still report a 1080p source rectangle. Accept only
    positive, origin-aligned rectangles with the same aspect ratio; an
    offset or aspect-changing crop still needs separate validation.
    """
    source=v.get('sourceInput')
    if not isinstance(source,dict):
        raise PanelRefusal(TVLENS_PANEL_SOURCE_INVALID,'Missing source rectangle',
                           'TVLens : la source vidéo est indisponible.')
    dimensions=[v.get('width'),v.get('height'),source.get('width'),source.get('height')]
    if any(type(value) is not int or value<=0 for value in dimensions):
        raise PanelRefusal(TVLENS_PANEL_SOURCE_INVALID,'Invalid video dimensions',
                           'TVLens : les dimensions de la vidéo sont invalides.')
    if source.get('x')!=0 or source.get('y')!=0:
        raise PanelRefusal(TVLENS_PANEL_SOURCE_CROPPED,'Cropped source not supported',
                           'TVLens : la vidéo est rognée, le panneau ne peut pas s’ouvrir.')
    width,height,source_width,source_height=dimensions
    if source_width*height!=source_height*width:
        raise PanelRefusal(TVLENS_PANEL_SOURCE_INVALID,'Source aspect ratio differs from decoded video',
                           'TVLens : les proportions de la vidéo sont incohérentes.')
    return {key:source[key] for key in ('x','y','width','height')}

def logical_output(v):
    output=v.get('displayOutput')
    if not isinstance(output,dict):
        raise PanelRefusal(TVLENS_PANEL_OUTPUT_INVALID,'Missing output rectangle',OUTPUT_MESSAGE)
    values=[output.get(key) for key in ('x','y','width','height')]
    if any(type(value) is not int for value in values):
        raise PanelRefusal(TVLENS_PANEL_OUTPUT_INVALID,'Invalid output coordinates',OUTPUT_MESSAGE)
    x,y,width,height=values
    if x<0 or y<0 or width<=0 or height<=0 or x+width>SCREEN_WIDTH or y+height>SCREEN_HEIGHT:
        raise PanelRefusal(TVLENS_PANEL_OUTPUT_INVALID,'Output rectangle outside screen',OUTPUT_MESSAGE)
    return {key:value//DISPLAY_SCALE if value%DISPLAY_SCALE==0 else value/DISPLAY_SCALE
            for key,value in zip(('x','y','width','height'),values)}

def rectangles(v):
    if v.get('appId')!='youtube.leanback.v4' or not v.get('connected'):
        raise PanelRefusal(TVLENS_PANEL_PLAYBACK_REQUIRED,'YouTube playback required',PLAYBACK_MESSAGE)
    output=logical_output(v)
    source=reported_source(v)
    restore={'sink':'MAIN','context':v['context'],'fullScreen':v['fullScreen'],
             'displayOutput':output,'appOutput':output,
             'sourceInput':source,'originalInput':source}
    target=layout_target(restore,'chat')
    return restore,target

def on_stop(*_):
    global stop
    stop=True

def notify_refusal(error):
    print(error.code,str(error),flush=True)
    try:
        result=call('com.webos.notification/createToast',{'message':error.user_message})
        if not result.get('returnValue'):
            print(TVLENS_PANEL_NOTIFICATION_FAILED,json.dumps(result),flush=True)
    except Exception as notification_error:
        print(TVLENS_PANEL_NOTIFICATION_FAILED,str(notification_error),flush=True)

def restore_original(saved):
    write_layout({"active":False,"mode":"chat"})
    try:
        call('com.webos.surfacemanager/closeByAppId',{'id':APP})
    finally:
        if video().get('context')==saved['context']:
            result=call('com.webos.service.videooutput/display/setDisplayWindow',saved)
            print('restore',json.dumps(result),flush=True)

def main():
    lock=open(LOCK,'w')
    try:fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
    except BlockingIOError:return
    signal.signal(signal.SIGTERM,on_stop);signal.signal(signal.SIGINT,on_stop)
    try:
        saved,target=rectangles(video())
    except PanelRefusal as error:
        try:
            notify_refusal(error)
        finally:
            lock.close()
        return
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
        # `video` is the logical rectangle the application must keep clear of its own overlay.
        write_layout({'active':True,'mode':mode,'requestId':request_id,'video':target['displayOutput']})
        pause(1)
        while not stop:
            v=video()
            if v.get('context')!=saved['context'] or v['displayOutput']!=physical_rect(target):
                print('Media transition: closing panel',flush=True);break
            windows=call('com.webos.surfacemanager/getForegroundWindowInfo',{})
            listed=[w.get('appId') for w in windows.get('windows',[])]
            if APP not in listed:break
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
