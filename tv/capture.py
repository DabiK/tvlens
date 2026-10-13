"""Manual, bounded TV -> host capture. Never launches, pauses or resizes a TV app."""
import argparse,base64,fcntl,json,math,os,queue,shutil,signal,subprocess,tempfile,threading,time
from transport import Transport, SessionChanged, drop, refusal, STORAGE_FULL, READ_ONLY
from pathlib import Path
# The display gate belongs to the ambient supervisor. Without that module, or if it cannot be loaded, the capture
# runs as before and says gate:0 in its report: a supervisor then refuses to display anything while it runs.
try:from ambient import AmbientPaths,read_gate,GATE_STALE
except Exception:AmbientPaths=read_gate=None;GATE_STALE=30

FRAME_STEP=2          # seconds between two frames of a block
MAX_SECONDS=21600     # six hours, then a manual restart
MIN_KEEP=(320,180)    # below this a cropped frame says nothing: it is withheld
LUNA_PATIENCE=5       # blocks in a row lost to a mute Luna before the capture stops with an error
ABSENT={'state':'absent','epoch':0}

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

def stop_message(reason,limits):
 """Every end of capture says why, in words the panel can show as they are. Nothing restarts by itself."""
 return {'duration':'Limite de '+span(limits['seconds'])+' atteinte : relance la capture pour continuer.',
  'idle':span(limits['idleSeconds'])+' sans lecture YouTube : relance la capture quand la vidéo reprend.',
  'stopped':'Capture arrêtée à la demande.','parent':'Contrôleur arrêté.',
  'session-changed':'Session serveur changée ou suspendue. Redémarrage manuel requis.',
  'storage-full':STORAGE_FULL,'read-only':READ_ONLY,'error':'Capture arrêtée sur une erreur.'}[reason]

def safe_crop(video_crop,rect):
 """Part of the video rectangle that lies above the card, or None when too little is left.

 rect is the painted box plus its margin, in logical 1920x1080 pixels; a capture pixel is 1.5 of them, and the
 conversion rounds outward. A card outside the video rectangle leaves it whole.
 """
 if not rect or not video_crop:return None
 left,top=math.floor(rect['x']*2/3),math.floor(rect['y']*2/3)
 right,bottom=math.ceil((rect['x']+rect['width'])*2/3),math.ceil((rect['y']+rect['height'])*2/3)
 v=video_crop
 if right<=v['x'] or left>=v['x']+v['width'] or bottom<=v['y'] or top>=v['y']+v['height']:return dict(v)
 height=top-v['y']
 if v['width']<MIN_KEEP[0] or height<MIN_KEEP[1]:return None
 return {'x':v['x'],'y':v['y'],'width':v['width'],'height':height}

def frame_decision(gate_before,gate_after,video_crop,now_mono):
 """What one frame may keep, from the gate read just before and just after the shot.

 full: no card can be in it. crop: only what lies above the card(s). withhold: the frame is not sent.
 A closed gate never ages into an open one here: only its writer may say that the card is gone.
 """
 states=(gate_before.get('state'),gate_after.get('state'))
 if 'unreadable' in states:return {'action':'withhold','cause':'gateUnreadable'}
 closed=[gate for gate in (gate_before,gate_after) if gate['state'] not in ('clear','absent')]
 if not closed:
  # Two readings of one epoch bracket no card. Another epoch means a whole show may have fitted in between.
  if states[0]!=states[1] or gate_before.get('epoch')!=gate_after.get('epoch'):return {'action':'withhold','cause':'gateCycled'}
  return {'action':'full','crop':video_crop}
 stale=any(now_mono-next((gate[key] for key in ('renewedMono','shownMono','armedMono') if isinstance(gate.get(key),(int,float))),now_mono)>GATE_STALE for gate in closed)
 if any(gate.get('rect') is None for gate in closed):return {'action':'withhold','cause':'overlayUnplaced','stale':stale}
 crop=video_crop
 for gate in closed:
  crop=safe_crop(crop,gate['rect'])
  if crop is None:return {'action':'withhold','cause':'overlayTooLarge','stale':stale}
 return {'action':'crop','crop':crop,'rects':[gate['rect'] for gate in closed],'stale':stale}

def settle_block(samples):
 """Frames of one block as they are sent, at ONE size, with what was cut or held back.

 The server concatenates the frames of a block into one clip: a frame cut above a card cuts its neighbours
 the same way. samples: [{'atMs','data','video','decision'}]. Returns (frames, {'cropped','withheld'}, causes).
 """
 causes={};kept=[]
 for sample in samples:
  if sample['decision']['action']=='withhold':causes[sample['decision']['cause']]=causes.get(sample['decision']['cause'],0)+1
  else:kept.append(sample)
 rects=[rect for sample in kept for rect in sample['decision'].get('rects',[])]
 if not rects:
  # No card in this block: exactly the frames of before the gate existed.
  return [{'atMs':s['atMs'],'data':s['data'],'crop':s['video']} for s in kept],{'cropped':0,'withheld':len(samples)-len(kept)},causes
 cut=[]
 for sample in kept:
  crop=sample['video']
  for rect in rects:crop=safe_crop(crop,rect) if crop else None
  if crop is None:causes['overlayTooLarge']=causes.get('overlayTooLarge',0)+1
  else:cut.append((sample,crop))
 # Video rectangles may differ inside a block (panel opened meanwhile): the most frequent size is kept.
 sizes=[(crop['width'],crop['height']) for _,crop in cut]
 size=max(sizes,key=sizes.count) if sizes else None
 frames=[]
 for sample,crop in cut:
  if (crop['width'],crop['height'])!=size:causes['sizeMismatch']=causes.get('sizeMismatch',0)+1;continue
  frame={'atMs':sample['atMs'],'data':sample['data'],'crop':crop}
  # Declared frame by frame: the server must never present a scene whose bottom was hidden as seen whole.
  if crop!=sample['video']:frame['overlay']='cropped'
  frames.append(frame)
 return frames,{'cropped':sum(1 for f in frames if f.get('overlay')),'withheld':len(samples)-len(frames)},causes

def run(argv=None):
 parser=argparse.ArgumentParser();parser.add_argument('--config',required=True);parser.add_argument('--seconds',type=int,default=32);parser.add_argument('--idle-seconds',type=int,default=600);parser.add_argument('--report',default='/tmp/tvlens-capture-report.json');parser.add_argument('--lock',default='/tmp/tvlens-capture.lock');parser.add_argument('--parent-pid',type=int,default=0);args=parser.parse_args(argv)
 if not 8<=args.seconds<=MAX_SECONDS:raise ValueError('Duration must be 8..21600 seconds')
 if args.idle_seconds<0:raise ValueError('Idle limit must be 0 (off) or a number of seconds')
 os.umask(0o077)
 lock=open(args.lock,'w')
 fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
 cfg=json.loads(Path(args.config).read_text())
 # VIDEO (video plane only) is a lever to validate on the TV; the gate applies in both cases.
 method=cfg.get('captureMethod') if cfg.get('captureMethod') in ('DISPLAY','VIDEO') else 'DISPLAY'
 gate_path=AmbientPaths().gate if AmbientPaths else None
 stop_event=threading.Event();done=threading.Event();save_lock=threading.Lock()
 limits={'seconds':args.seconds,'idleSeconds':args.idle_seconds}
 report={'sessionId':None,'sent':0,'dropped':0,'dropReasons':{},'errors':[],'frames':0,'retries':0,'connection':'starting','stopped':False,'queued':0,
  'pid':os.getpid(),'gate':1 if gate_path else 0,'gatePath':str(gate_path) if gate_path else None,'gateStale':False,
  'framesCropped':0,'framesWithheld':0,'framesMoved':0,'withheldReasons':{},'stopReason':None,'stopMessage':None,'limits':limits}
 def save():
  with save_lock:
   target=Path(args.report);tmp_report=target.with_suffix('.tmp')
   tmp_report.write_text(json.dumps(report));os.replace(tmp_report,target)
 def end(reason,say=True):
  # The first cause wins: a stop asked while the storage is full still says storage.
  if report['stopReason']:return
  report['stopReason']=reason;report['stopMessage']=stop_message(reason,limits)
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
  # 409: the server holds an archive open for reading. 507: its disk is full. Both are answers, said as such.
  status,code,message=refusal(error)
  reason='read-only' if code=='read-only' or status==409 else 'storage-full' if code=='storage-full' or status==507 else 'error'
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
    transport.deliver(item,created)
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
 last_youtube=time.monotonic();mute=0
 try:
  for chunk in range(args.seconds//8):
   if args.parent_pid and os.getppid()!=args.parent_pid:end('parent');stop_event.set()
   if stop_event.is_set():break
   # Ten minutes without a single YouTube frame: this is not a permanent recorder of the TV.
   if args.idle_seconds and time.monotonic()-last_youtube>=args.idle_seconds:end('idle');break
   start=stamp();began=time.monotonic();audiofile=tmp/'audio.wav';samples=[]
   audio=subprocess.Popen(['arecord','-D','hw:0,13','-t','wav','-f','S16_LE','-r','48000','-c','2','-d','8',str(audiofile)],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
   valid=True;reason=None;failure=None;moved=0
   try:
    for i in range(4):
     if args.parent_pid and os.getppid()!=args.parent_pid:end('parent');stop_event.set()
     if stop_event.wait(max(0,began+i*FRAME_STEP-time.monotonic())):valid=False;reason=reason or 'stopped';break
     try:
      before=stamp();state=luna('com.webos.service.videooutput/getStatus',{})
      video=next((x for x in state['video'] if x['sink']=='MAIN'),{})
      if video.get('appId')!='youtube.leanback.v4' or not video.get('connected'):valid=False;reason=reason or 'foreignApp';continue
      # Read just before and just after the shot: a card that shows, or goes, during it is seen by one reading.
      gate_before=read_gate(gate_path) if gate_path else ABSENT
      reply=luna('com.webos.service.capture/executeOneShot',{'path':str(tmp/'frame.png'),'method':method,'format':'PNG','width':1280,'height':720})
      gate_after=read_gate(gate_path) if gate_path else ABSENT
      if not reply.get('returnValue'):valid=False;reason=reason or 'captureFailed';continue
      after=next((x for x in luna('com.webos.service.videooutput/getStatus',{})['video'] if x['sink']=='MAIN'),{})
      # Another video context during the shot is another media pipeline (a change of video, of source): the
      # whole block is refused, as it always was.
      if after.get('context')!=video.get('context'):valid=False;reason=reason or 'geometryChanged';continue
      # Same context, and only the video rectangle moved while this frame was taken (the panel opened or
      # closed): the frame cannot be cut reliably and is left out. Its block keeps its sound and its other frames.
      if after.get('displayOutput')!=video['displayOutput']:moved+=1;continue
      rect=video['displayOutput'];crop={k:round(v/3) for k,v in rect.items()}
      decision=frame_decision(gate_before,gate_after,crop,time.monotonic())
      report['gateStale']=bool(decision.get('stale'));last_youtube=time.monotonic()
      # A withheld frame is never read: it stays on the TV and is overwritten by the next shot.
      samples.append({'atMs':before,'data':None if decision['action']=='withhold' else base64.b64encode((tmp/'frame.png').read_bytes()).decode(),'video':crop,'decision':decision});report['frames']+=1
     except (RuntimeError,ValueError,KeyError,TypeError,OSError,subprocess.SubprocessError) as error:
      # One mute Luna call costs its block, counted with its cause, not a six-hour capture.
      valid=False;reason=reason or 'lunaFailed';failure=type(error).__name__+': '+str(error)
    if stop_event.is_set():audio.kill()
    audio.wait(timeout=5)
   finally:
    if audio.poll() is None:audio.kill();audio.wait()
   end_ms=stamp()
   frames,overlay,causes=settle_block(samples)
   # A frame held back does not void its block: the other frames and the sound still leave.
   report['framesWithheld']+=overlay['withheld'];report['framesMoved']+=moved
   for cause,count in causes.items():report['withheldReasons'][cause]=report['withheldReasons'].get(cause,0)+count
   mute=mute+1 if reason=='lunaFailed' else 0
   if mute>=LUNA_PATIENCE:raise RuntimeError(failure or 'Luna muette')
   if not valid or not frames or audio.returncode or end_ms-start>10000:
    # Every frame taken across a change of the rectangle: nothing to show of this block, said with its own cause.
    drop(report,reason or ('stopped' if stop_event.is_set() else 'overlayVisible' if overlay['withheld'] and not frames else 'geometryChanged' if moved and not frames else 'noFrames' if not frames else 'audioFailed' if audio.returncode else 'tooLong'));save();continue
   item={'sessionId':session['id'],'sequence':sequence+chunk,'startMs':start,'endMs':end_ms,'frames':frames,'audio':base64.b64encode(audiofile.read_bytes()).decode(),'_created':time.monotonic()}
   # Additive, and absent when nothing was cut: an older server ignores it, and a block without a card is unchanged.
   if overlay['cropped'] or overlay['withheld']:item['overlay']=overlay
   report['framesCropped']+=overlay['cropped']
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
