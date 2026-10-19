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

class BlockCapture:
 """Résultat d'une prise : médias, activité et première cause de perte explicites."""
 def __init__(self,start_ms):
  self.start_ms=start_ms
  self.end_ms=0
  self.frames=[]
  self.black_frames=0
  self.moved=0
  self.reason=None
  self.failure=None
  self.last_activity=None
  self.sound_only=False


def main_video():
 state=luna('com.webos.service.videooutput/getStatus',{})
 return next((video for video in state['video'] if video['sink']=='MAIN'),{})


def follow_video(video,report,save):
 app_id=video.get('appId')
 if not video.get('connected') or app_id not in VERIFIED_APPLICATIONS:return False
 if report['application'] is None:
  report['application']={'appId':app_id,'name':VERIFIED_APPLICATIONS[app_id]}
  save()
 return app_id==report['application']['appId']


def capture_images(tmp,method,video):
 reply=luna('com.webos.service.capture/executeOneShot',{
  'path':str(tmp/'control.bmp'),'method':'DISPLAY','format':'BMP','width':CONTROL_WIDTH,'height':CONTROL_HEIGHT})
 if not reply.get('returnValue'):return None
 try:
  black=is_black((tmp/'control.bmp').read_bytes(),video['displayOutput'])
 except ValueError:
  return None
 if not black:
  reply=luna('com.webos.service.capture/executeOneShot',{
   'path':str(tmp/'frame.png'),'method':method,'format':'PNG','width':1280,'height':720})
  if not reply.get('returnValue'):return None
 return black


def capture_frame(tmp,method,stamp,report,save,block):
 before=stamp()
 video=main_video()
 if not follow_video(video,report,save):
  block.reason=block.reason or 'foreignApp'
  return
 black=capture_images(tmp,method,video)
 if black is None:
  block.reason=block.reason or 'captureFailed'
  return
 after=main_video()
 if after.get('appId')!=video['appId'] or not after.get('connected'):
  block.reason=block.reason or 'foreignApp'
  return
 # Un autre contexte désigne un autre pipeline média et refuse toujours le bloc entier.
 if after.get('context')!=video.get('context'):
  block.reason=block.reason or 'geometryChanged'
  return
 # Un rectangle déplacé dans le même contexte écarte seulement cette image, sans perdre le son.
 if after.get('displayOutput')!=video['displayOutput']:
  block.moved+=1
  return
 if black:
  block.black_frames+=1
  return
 rect=video['displayOutput']
 crop={k:round(v/3) for k,v in rect.items()}
 block.last_activity=time.monotonic()
 block.frames.append({'atMs':before,'data':base64.b64encode((tmp/'frame.png').read_bytes()).decode(),'crop':crop})
 report['frames']+=1


def capture_frames(tmp,method,shots,began,stop_event,stamp,check_parent,report,save,block):
 for i in range(shots):
  check_parent()
  if stop_event.wait(max(0,began+i*FRAME_STEP-time.monotonic())):
   block.reason=block.reason or 'stopped'
   break
  try:
   capture_frame(tmp,method,stamp,report,save,block)
  except (RuntimeError,ValueError,KeyError,TypeError,OSError,subprocess.SubprocessError) as error:
   # Un appel Luna muet coûte son bloc, pas six heures de capture.
   block.reason=block.reason or 'lunaFailed'
   block.failure=type(error).__name__+': '+str(error)


def classify_block(block,audio_returncode,stopped):
 sound_only=block.black_frames>0 and not block.frames
 if block.reason:
  return sound_only,block.reason
 if not block.frames and not sound_only or audio_returncode or block.end_ms-block.start_ms>10000:
  if stopped:return sound_only,'stopped'
  # Toutes les prises déplacées gardent cette cause explicite, même sans image exploitable.
  if block.moved and not block.frames:return sound_only,'geometryChanged'
  if not block.frames and not sound_only:return sound_only,'noFrames'
  if audio_returncode:return sound_only,'audioFailed'
  return sound_only,'tooLong'
 return sound_only,None


def capture_block(tmp,method,black_blocks,stop_event,stamp,check_parent,report,save):
 """Prend un bloc ; publie immédiatement l'application et les images dans le rapport fourni."""
 block=BlockCapture(start_ms=stamp())
 began=time.monotonic()
 audiofile=tmp/'audio.wav'
 audio=subprocess.Popen(['arecord','-D','hw:0,13','-t','wav','-f','S16_LE','-r','48000','-c','2','-d','8',str(audiofile)],
  stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
 shots=1 if black_blocks>=BLACK_BLOCK_PATIENCE else FRAMES_PER_BLOCK
 try:
  capture_frames(tmp,method,shots,began,stop_event,stamp,check_parent,report,save,block)
  # Le son dure huit secondes : la cadence réduite retrouve le même point d'attente que quatre prises.
  if shots<FRAMES_PER_BLOCK:
   stop_event.wait(max(0,began+(FRAMES_PER_BLOCK-1)*FRAME_STEP-time.monotonic()))
  if stop_event.is_set():audio.kill()
  audio.wait(timeout=5)
 finally:
  if audio.poll() is None:
   audio.kill()
   audio.wait()
 block.end_ms=stamp()
 block.sound_only,block.reason=classify_block(block,audio.returncode,stop_event.is_set())
 return block


def parse_arguments(argv):
 parser=argparse.ArgumentParser()
 parser.add_argument('--config',required=True)
 parser.add_argument('--seconds',type=int,default=32)
 parser.add_argument('--idle-seconds',type=int,default=600)
 parser.add_argument('--report',default='/tmp/tvlens-capture-report.json')
 parser.add_argument('--lock',default='/tmp/tvlens-capture.lock')
 parser.add_argument('--parent-pid',type=int,default=0)
 args=parser.parse_args(argv)
 if not 8<=args.seconds<=MAX_SECONDS:raise ValueError('Duration must be 8..21600 seconds')
 if args.idle_seconds<0:raise ValueError('Idle limit must be 0 (off) or a number of seconds')
 return args


def capture_report(args):
 save_lock=threading.Lock()
 limits={'seconds':args.seconds,'idleSeconds':args.idle_seconds}
 report={'sessionId':None,'sent':0,'dropped':0,'dropReasons':{},'errors':[],'frames':0,'retries':0,
  'connection':'starting','stopped':False,'queued':0,'pid':os.getpid(),'framesMoved':0,'stopReason':None,
  'stopMessage':None,'limits':limits,'lastRefusal':None,'application':None,'soundOnly':0,'soundOnlyActive':False}
 def save():
  with save_lock:
   target=Path(args.report)
   tmp_report=target.with_suffix('.tmp')
   tmp_report.write_text(json.dumps(report))
   os.replace(tmp_report,target)
 def end(reason,say=True):
  # La première cause gagne, même si un arrêt est demandé pendant un stockage plein.
  if report['stopReason']:return
  report['stopReason']=reason
  report['stopMessage']=stop_message(reason,limits,report['application'])
  if say and report['stopMessage'] not in report['errors']:
   report['errors']=(report['errors']+[report['stopMessage']])[-10:]
 return report,save,end


def start_session(transport,stop_event,report,save,end):
 try:
  return transport.request('/v1/session/start',{})
 except KeyboardInterrupt:
  # L'arrêt pendant le démarrage conserve sa cause, comme tout autre arrêt.
  stop_event.set()
  report['connection']='stopped'
  end('stopped',False)
 except Exception as error:
  # Un 409 sans identité ne prouve pas une archive ; le 507 ancien reste non ambigu sans code.
  status,code,_=refusal(error)
  if status is not None:report['lastRefusal']={'status':status,'code':code}
  if code=='read-only':reason='read-only'
  elif code=='storage-full' or (status==507 and not code):reason='storage-full'
  else:reason='error'
  report['connection']=reason
  report['errors']=[str(error)] if reason=='error' else []
  end(reason,reason!='error')
 report['stopped']=True
 save()
 return None


def upload_blocks(transport,pending,stop_event,done,report,save,end):
 while not stop_event.is_set() and (not done.is_set() or not pending.empty()):
  try:item=pending.get(timeout=.5)
  except queue.Empty:continue
  try:
   created=item.pop('_created')
   if transport.deliver(item,created) and item.get('media',{}).get('video') is False:
    report['soundOnly']+=1
  except SessionChanged as error:
   report['connection']=error.reason
   report['errors']=(report['errors']+[str(error)])[-10:]
   end(error.reason,False)
   stop_event.set()
  except Exception as error:
   # Une livraison imprévue en échec compte aussi son bloc, avec sa cause.
   drop(report,'deliveryError')
   report['errors']=(report['errors']+[type(error).__name__+': '+str(error)])[-10:]
  finally:
   pending.task_done()
   report['queued']=pending.qsize()
   save()


def queue_block(block,tmp,session_id,sequence,pending,report,save):
 item={'sessionId':session_id,'sequence':sequence,'startMs':block.start_ms,'endMs':block.end_ms,
  'frames':block.frames,'audio':base64.b64encode((tmp/'audio.wav').read_bytes()).decode(),'_created':time.monotonic()}
 report['soundOnlyActive']=block.sound_only
 if block.sound_only:
  item['media']={'video':False,'audio':True}
  block.last_activity=time.monotonic()
 if pending.full():
  pending.get_nowait()
  pending.task_done()
  drop(report,'queueOverflow')
 pending.put_nowait(item)
 report['queued']=pending.qsize()
 save()


def finish_capture(done,thread,tmp,pending,report,save,end):
 done.set()
 thread.join(timeout=35)
 shutil.rmtree(tmp,ignore_errors=True)
 if pending.qsize():drop(report,'leftAtStop',pending.qsize())
 # Aucune fin sans cause, quel que soit le chemin suivi.
 end('stopped',False)
 report['queued']=0
 report['stopped']=True
 save()
 encoded=json.dumps(report)
 try:print(encoded,flush=True)
 except OSError:pass


def consecutive_luna_failures(block,mute):
 mute=mute+1 if block.reason=='lunaFailed' else 0
 if mute>=LUNA_PATIENCE:raise RuntimeError(block.failure or 'Luna muette')
 return mute


def run(argv=None):
 args=parse_arguments(argv)
 os.umask(0o077)
 lock=open(args.lock,'w')
 fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
 cfg=json.loads(Path(args.config).read_text())
 # VIDEO ne capture que le plan vidéo ; ce choix reste à valider sur la TV.
 method=cfg.get('captureMethod') if cfg.get('captureMethod') in ('DISPLAY','VIDEO') else 'DISPLAY'
 stop_event=threading.Event()
 done=threading.Event()
 report,save,end=capture_report(args)
 def stop(_signal,_frame):
  stop_event.set()
  raise KeyboardInterrupt
 def check_parent():
  if args.parent_pid and os.getppid()!=args.parent_pid:
   end('parent')
   stop_event.set()
 signal.signal(signal.SIGTERM,stop)
 signal.signal(signal.SIGINT,stop)
 transport=Transport(cfg,stop_event,report,save)
 save()
 session=start_session(transport,stop_event,report,save,end)
 if session is None:return
 anchor=time.monotonic()
 offset=session['elapsedMs']
 report['sessionId']=session['id']
 report['connection']='capturing'
 save()
 pending=queue.Queue(maxsize=3)
 sequence=int(time.monotonic()*1000)
 thread=threading.Thread(target=lambda:upload_blocks(transport,pending,stop_event,done,report,save,end))
 thread.start()
 def stamp():return offset+(time.monotonic()-anchor)*1000
 os.umask(0o077)
 tmp=Path(tempfile.mkdtemp(prefix='tvlens-capture-'))
 last_activity=time.monotonic()
 mute=0
 black_blocks=0
 try:
  for chunk in range(args.seconds//8):
   check_parent()
   if stop_event.is_set():break
   # Une autre application ne prolonge jamais la capture suivie.
   if args.idle_seconds and time.monotonic()-last_activity>=args.idle_seconds:
    end('idle')
    break
   block=capture_block(tmp,method,black_blocks,stop_event,stamp,check_parent,report,save)
   if block.last_activity is not None:last_activity=block.last_activity
   report['framesMoved']+=block.moved
   mute=consecutive_luna_failures(block,mute)
   if block.reason:
    black_blocks=0
    report['soundOnlyActive']=False
    drop(report,block.reason)
    save()
    continue
   black_blocks=black_blocks+1 if block.sound_only else 0
   queue_block(block,tmp,session['id'],sequence+chunk,pending,report,save)
   if block.sound_only:last_activity=block.last_activity
  else:end('duration')
 except KeyboardInterrupt:
  stop_event.set()
  report['stopped']=True
  end('stopped',False)
 except Exception as error:
  stop_event.set()
  report['connection']='error'
  report['errors']=(report['errors']+[type(error).__name__+': '+str(error)])[-10:]
  end('error',False)
 finally:
  finish_capture(done,thread,tmp,pending,report,save,end)

if __name__=='__main__':run()
