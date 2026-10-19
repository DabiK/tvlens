"""Manual, bounded TV -> host capture. Never launches, pauses or resizes a TV app."""
import argparse,base64,fcntl,json,os,queue,shutil,signal,subprocess,tempfile,threading,time
from transport import Transport, SessionChanged, drop, refusal, STORAGE_FULL, READ_ONLY
from blackness import is_black, CONTROL_WIDTH, CONTROL_HEIGHT
from pathlib import Path
FRAME_STEP=2          # seconds between two frames of a block
FRAMES_PER_BLOCK=4
MAX_SECONDS=21600     # six hours, then a manual restart
LUNA_PATIENCE=5       # blocks in a row lost to a mute Luna before the capture stops with an error
BLACK_BLOCK_PATIENCE=2
# Une entrée s'ajoute seulement après une sonde réelle d'image et de son sur la TV.
VERIFIED_APPLICATIONS={
 'youtube.leanback.v4':'YouTube',
 'com.webos.app.mediadiscovery':'lecteur de la TV',
 'netflix':'Netflix',
}

def luna(endpoint,payload):
 r=subprocess.run(['luna-send','-t','1','-w','3000','luna://'+endpoint,json.dumps(payload)],capture_output=True,timeout=5)
 for stream in (r.stderr.decode(),r.stdout.decode()):
  start=stream.find('{')
  if start>=0:
   try:return json.JSONDecoder().raw_decode(stream[start:])[0]
   except ValueError:pass
 raise RuntimeError('No Luna response')

def span(seconds):
 parts=[(seconds//3600,' h'),(seconds%3600//60,' min'),(seconds%60,' s')]
 return ' '.join(str(count)+unit for count,unit in parts if count) or '0 s'

def stop_message(reason,limits,application=None):
 """Every end of capture says why, in words the panel can show as they are. Nothing restarts by itself."""
 source='vidéo'
 if application:
  name=application['name']
  source=('du ' if name.startswith('lecteur ') else 'de ')+name
 return {'duration':'Limite de '+span(limits['seconds'])+' atteinte : relance la capture pour continuer.',
  'idle':span(limits['idleSeconds'])+' sans lecture '+source+' : relance la capture quand la vidéo reprend.',
  'stopped':'Capture arrêtée à la demande.','parent':'Contrôleur arrêté.',
  'session-changed':'Session serveur changée ou suspendue. Redémarrage manuel requis.',
  'storage-full':STORAGE_FULL,'read-only':READ_ONLY,'error':'Capture arrêtée sur une erreur.'}[reason]

def run(argv=None):
 parser=argparse.ArgumentParser();parser.add_argument('--config',required=True);parser.add_argument('--seconds',type=int,default=32);parser.add_argument('--idle-seconds',type=int,default=600);parser.add_argument('--report',default='/tmp/tvlens-capture-report.json');parser.add_argument('--lock',default='/tmp/tvlens-capture.lock');parser.add_argument('--parent-pid',type=int,default=0);args=parser.parse_args(argv)
 if not 8<=args.seconds<=MAX_SECONDS:raise ValueError('Duration must be 8..21600 seconds')
 if args.idle_seconds<0:raise ValueError('Idle limit must be 0 (off) or a number of seconds')
 os.umask(0o077)
 lock=open(args.lock,'w')
 fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
 cfg=json.loads(Path(args.config).read_text())
 # VIDEO ne capture que le plan vidéo ; ce choix reste à valider sur la TV.
 method=cfg.get('captureMethod') if cfg.get('captureMethod') in ('DISPLAY','VIDEO') else 'DISPLAY'
 stop_event=threading.Event();done=threading.Event();save_lock=threading.Lock()
 limits={'seconds':args.seconds,'idleSeconds':args.idle_seconds}
 report={'sessionId':None,'sent':0,'dropped':0,'dropReasons':{},'errors':[],'frames':0,'retries':0,'connection':'starting','stopped':False,'queued':0,
  'pid':os.getpid(),'framesMoved':0,'stopReason':None,'stopMessage':None,'limits':limits,'lastRefusal':None,'application':None,
  'soundOnly':0,'soundOnlyActive':False}
 def save():
  with save_lock:
   target=Path(args.report);tmp_report=target.with_suffix('.tmp')
   tmp_report.write_text(json.dumps(report));os.replace(tmp_report,target)
 def end(reason,say=True):
  # The first cause wins: a stop asked while the storage is full still says storage.
  if report['stopReason']:return
  report['stopReason']=reason
  report['stopMessage']=stop_message(reason,limits,report['application'])
  if say and report['stopMessage'] not in report['errors']:report['errors']=(report['errors']+[report['stopMessage']])[-10:]
 def stop(_signal,_frame):
  stop_event.set()
  raise KeyboardInterrupt
 signal.signal(signal.SIGTERM,stop);signal.signal(signal.SIGINT,stop)
 transport=Transport(cfg,stop_event,report,save)
 save()
 try:session=transport.request('/v1/session/start',{})
 except KeyboardInterrupt:
  # Stopped while the server was still being asked (up to five seconds): an end like any other, with its cause.
  stop_event.set();report['connection']='stopped';end('stopped',False);report['stopped']=True;save();return
 except Exception as error:
  # Un 409 sans identité ne prouve pas une archive ; le 507 ancien reste non ambigu sans code.
  status,code,_=refusal(error)
  if status is not None:
   report['lastRefusal']={'status':status,'code':code}
  if code=='read-only':reason='read-only'
  elif code=='storage-full' or (status==507 and not code):reason='storage-full'
  else:reason='error'
  report['connection']=reason;report['errors']=[str(error)] if reason=='error' else [];end(reason,reason!='error');report['stopped']=True;save();return
 anchor=time.monotonic();offset=session['elapsedMs'];report['sessionId']=session['id'];report['connection']='capturing';save()
 pending=queue.Queue(maxsize=3)
 sequence=int(time.monotonic()*1000)
 def upload():
  while not stop_event.is_set() and (not done.is_set() or not pending.empty()):
   try:item=pending.get(timeout=.5)
   except queue.Empty:continue
   try:
    created=item.pop('_created')
    if transport.deliver(item,created) and item.get('media',{}).get('video') is False:
     report['soundOnly']+=1
   except SessionChanged as error:
    report['connection']=error.reason;report['errors']=(report['errors']+[str(error)])[-10:];end(error.reason,False);stop_event.set()
   except Exception as error:
    # A delivery that fails for an unforeseen reason still counts its block: nothing is lost in silence.
    drop(report,'deliveryError');report['errors']=(report['errors']+[type(error).__name__+': '+str(error)])[-10:]
   finally:
    pending.task_done();report['queued']=pending.qsize();save()
 thread=threading.Thread(target=upload);thread.start()
 def stamp():return offset+(time.monotonic()-anchor)*1000
 os.umask(0o077);tmp=Path(tempfile.mkdtemp(prefix='tvlens-capture-'))
 last_activity=time.monotonic()
 mute=0
 black_blocks=0
 try:
  for chunk in range(args.seconds//8):
   if args.parent_pid and os.getppid()!=args.parent_pid:end('parent');stop_event.set()
   if stop_event.is_set():break
   # Une autre application ne prolonge jamais la capture suivie.
   if args.idle_seconds and time.monotonic()-last_activity>=args.idle_seconds:
    end('idle')
    break
   start=stamp()
   began=time.monotonic()
   audiofile=tmp/'audio.wav'
   frames=[]
   audio=subprocess.Popen(['arecord','-D','hw:0,13','-t','wav','-f','S16_LE','-r','48000','-c','2','-d','8',str(audiofile)],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
   valid=True;reason=None;failure=None;moved=0
   black_frames=0
   shots=1 if black_blocks>=BLACK_BLOCK_PATIENCE else FRAMES_PER_BLOCK
   try:
    for i in range(shots):
     if args.parent_pid and os.getppid()!=args.parent_pid:end('parent');stop_event.set()
     if stop_event.wait(max(0,began+i*FRAME_STEP-time.monotonic())):valid=False;reason=reason or 'stopped';break
     try:
      before=stamp();state=luna('com.webos.service.videooutput/getStatus',{})
      video=next((x for x in state['video'] if x['sink']=='MAIN'),{})
      app_id=video.get('appId')
      if not video.get('connected') or app_id not in VERIFIED_APPLICATIONS:
       valid=False
       reason=reason or 'foreignApp'
       continue
      if report['application'] is None:
       report['application']={'appId':app_id,'name':VERIFIED_APPLICATIONS[app_id]}
       save()
      if app_id!=report['application']['appId']:
       valid=False
       reason=reason or 'foreignApp'
       continue
      reply=luna('com.webos.service.capture/executeOneShot',{
       'path':str(tmp/'control.png'),'method':'DISPLAY','format':'PNG','width':CONTROL_WIDTH,'height':CONTROL_HEIGHT})
      if not reply.get('returnValue'):valid=False;reason=reason or 'captureFailed';continue
      try:
       black=is_black((tmp/'control.png').read_bytes(),video['displayOutput'])
      except ValueError:
       valid=False
       reason=reason or 'captureFailed'
       continue
      if not black:
       reply=luna('com.webos.service.capture/executeOneShot',{
        'path':str(tmp/'frame.png'),'method':method,'format':'PNG','width':1280,'height':720})
       if not reply.get('returnValue'):
        valid=False
        reason=reason or 'captureFailed'
        continue
      after=next((x for x in luna('com.webos.service.videooutput/getStatus',{})['video'] if x['sink']=='MAIN'),{})
      if after.get('appId')!=app_id or not after.get('connected'):
       valid=False
       reason=reason or 'foreignApp'
       continue
      # Another video context during the shot is another media pipeline (a change of video, of source): the
      # whole block is refused, as it always was.
      if after.get('context')!=video.get('context'):valid=False;reason=reason or 'geometryChanged';continue
      # Same context, and only the video rectangle moved while this frame was taken (the panel opened or
      # closed): the frame cannot be cut reliably and is left out. Its block keeps its sound and its other frames.
      if after.get('displayOutput')!=video['displayOutput']:moved+=1;continue
      if black:
       black_frames+=1
       continue
      rect=video['displayOutput'];crop={k:round(v/3) for k,v in rect.items()}
      last_activity=time.monotonic()
      frames.append({
       'atMs':before,
       'data':base64.b64encode((tmp/'frame.png').read_bytes()).decode(),
       'crop':crop,
      })
      report['frames']+=1
     except (RuntimeError,ValueError,KeyError,TypeError,OSError,subprocess.SubprocessError) as error:
      # One mute Luna call costs its block, counted with its cause, not a six-hour capture.
      valid=False;reason=reason or 'lunaFailed';failure=type(error).__name__+': '+str(error)
    # Le son dure toujours huit secondes : la cadence réduite retrouve le même point d'attente que quatre prises.
    if shots<FRAMES_PER_BLOCK:
     stop_event.wait(max(0,began+(FRAMES_PER_BLOCK-1)*FRAME_STEP-time.monotonic()))
    if stop_event.is_set():audio.kill()
    audio.wait(timeout=5)
   finally:
    if audio.poll() is None:audio.kill();audio.wait()
   end_ms=stamp()
   report['framesMoved']+=moved
   mute=mute+1 if reason=='lunaFailed' else 0
   if mute>=LUNA_PATIENCE:raise RuntimeError(failure or 'Luna muette')
   sound_only=black_frames>0 and not frames
   if not valid or (not frames and not sound_only) or audio.returncode or end_ms-start>10000:
    black_blocks=0
    report['soundOnlyActive']=False
    if not reason:
     if stop_event.is_set():reason='stopped'
     # Si toutes les prises traversent un déplacement, le bloc sans image garde cette cause explicite.
     elif moved and not frames:reason='geometryChanged'
     elif not frames and not sound_only:reason='noFrames'
     elif audio.returncode:reason='audioFailed'
     else:reason='tooLong'
    drop(report,reason)
    save()
    continue
   item={'sessionId':session['id'],'sequence':sequence+chunk,'startMs':start,'endMs':end_ms,'frames':frames,'audio':base64.b64encode(audiofile.read_bytes()).decode(),'_created':time.monotonic()}
   black_blocks=black_blocks+1 if sound_only else 0
   report['soundOnlyActive']=sound_only
   if sound_only:
    item['media']={'video':False,'audio':True}
    last_activity=time.monotonic()
   if pending.full():pending.get_nowait();pending.task_done();drop(report,'queueOverflow')
   pending.put_nowait(item);report['queued']=pending.qsize();save()
  else:end('duration')
 except KeyboardInterrupt:
  stop_event.set();report['stopped']=True;end('stopped',False)
 except Exception as error:
  stop_event.set();report['connection']='error';report['errors']=(report['errors']+[type(error).__name__+': '+str(error)])[-10:];end('error',False)
 finally:
  done.set();thread.join(timeout=35);shutil.rmtree(tmp,ignore_errors=True)
  if pending.qsize():drop(report,'leftAtStop',pending.qsize())
  # No end without a cause, whatever path led here.
  end('stopped',False)
  report['queued']=0;report['stopped']=True;save()
  encoded=json.dumps(report)
  try:print(encoded,flush=True)
  except OSError:pass
if __name__=='__main__':run()
