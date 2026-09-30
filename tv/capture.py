"""Manual, bounded TV -> host capture. Never launches, pauses or resizes a TV app."""
import argparse,base64,fcntl,json,os,queue,shutil,signal,subprocess,tempfile,threading,time
from transport import Transport, SessionChanged
from pathlib import Path

def luna(endpoint,payload):
 r=subprocess.run(['luna-send','-t','1','-w','3000','luna://'+endpoint,json.dumps(payload)],capture_output=True,timeout=5)
 for stream in (r.stderr.decode(),r.stdout.decode()):
  start=stream.find('{')
  if start>=0:
   try:return json.JSONDecoder().raw_decode(stream[start:])[0]
   except ValueError:pass
 raise RuntimeError('No Luna response')

def run():
 parser=argparse.ArgumentParser();parser.add_argument('--config',required=True);parser.add_argument('--seconds',type=int,default=32);parser.add_argument('--report',default='/tmp/tvlens-capture-report.json');parser.add_argument('--parent-pid',type=int,default=0);args=parser.parse_args()
 if not 8<=args.seconds<=1800:raise ValueError('Duration must be 8..1800 seconds')
 os.umask(0o077)
 lock=open('/tmp/tvlens-capture.lock','w')
 fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
 cfg=json.loads(Path(args.config).read_text())
 stop_event=threading.Event();done=threading.Event();save_lock=threading.Lock()
 report={'sessionId':None,'sent':0,'dropped':0,'errors':[],'frames':0,'retries':0,'connection':'starting','stopped':False,'queued':0}
 def save():
  with save_lock:
   target=Path(args.report);tmp_report=target.with_suffix('.tmp')
   tmp_report.write_text(json.dumps(report));os.replace(tmp_report,target)
 def stop(_signal,_frame):
  stop_event.set()
  raise KeyboardInterrupt
 signal.signal(signal.SIGTERM,stop);signal.signal(signal.SIGINT,stop)
 transport=Transport(cfg,stop_event,report,save)
 save()
 try:session=transport.request('/v1/session/start',{})
 except Exception as error:
  report['connection']='error';report['errors']=[str(error)];save();return
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
    report['connection']='session-changed';report['errors']=(report['errors']+[str(error)])[-10:];stop_event.set()
   finally:
    pending.task_done();report['queued']=pending.qsize();save()
 thread=threading.Thread(target=upload);thread.start()
 def stamp():return offset+(time.monotonic()-anchor)*1000
 os.umask(0o077);tmp=Path(tempfile.mkdtemp(prefix='tvlens-capture-'))
 try:
  for chunk in range(args.seconds//8):
   if args.parent_pid and os.getppid()!=args.parent_pid:report['errors']=['Contrôleur arrêté.'];stop_event.set()
   if stop_event.is_set():break
   start=stamp();began=time.monotonic();audiofile=tmp/'audio.wav';frames=[]
   audio=subprocess.Popen(['arecord','-D','hw:0,13','-t','wav','-f','S16_LE','-r','48000','-c','2','-d','8',str(audiofile)],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
   valid=True
   try:
    for i in range(4):
     if args.parent_pid and os.getppid()!=args.parent_pid:report['errors']=['Contrôleur arrêté.'];stop_event.set()
     if stop_event.wait(max(0,began+i*2-time.monotonic())):valid=False;break
     before=stamp();state=luna('com.webos.service.videooutput/getStatus',{})
     video=next(x for x in state['video'] if x['sink']=='MAIN')
     if video.get('appId')!='youtube.leanback.v4' or not video.get('connected'):valid=False;continue
     reply=luna('com.webos.service.capture/executeOneShot',{'path':str(tmp/'frame.png'),'method':'DISPLAY','format':'PNG','width':1280,'height':720})
     if not reply.get('returnValue'):valid=False;continue
     after=next(x for x in luna('com.webos.service.videooutput/getStatus',{})['video'] if x['sink']=='MAIN')
     if after.get('context')!=video.get('context') or after['displayOutput']!=video['displayOutput']:valid=False;continue
     rect=video['displayOutput'];crop={k:round(v/3) for k,v in rect.items()}
     frames.append({'atMs':before,'data':base64.b64encode((tmp/'frame.png').read_bytes()).decode(),'crop':crop});report['frames']+=1
    if stop_event.is_set():audio.kill()
    audio.wait(timeout=5)
   finally:
    if audio.poll() is None:audio.kill();audio.wait()
   end=stamp()
   if not valid or not frames or audio.returncode or end-start>10000:
    report['dropped']+=1;continue
   item={'sessionId':session['id'],'sequence':sequence+chunk,'startMs':start,'endMs':end,'frames':frames,'audio':base64.b64encode(audiofile.read_bytes()).decode(),'_created':time.monotonic()}
   if pending.full():pending.get_nowait();pending.task_done();report['dropped']+=1
   pending.put_nowait(item);report['queued']=pending.qsize();save()
 except KeyboardInterrupt:
  stop_event.set();report['stopped']=True
 except Exception as error:
  stop_event.set();report['connection']='error';report['errors']=(report['errors']+[type(error).__name__+': '+str(error)])[-10:]
 finally:
  done.set();thread.join(timeout=35);shutil.rmtree(tmp,ignore_errors=True)
  report['dropped']+=pending.qsize();report['queued']=0;report['stopped']=True;save()
  encoded=json.dumps(report)
  try:print(encoded,flush=True)
  except OSError:pass
if __name__=='__main__':run()
