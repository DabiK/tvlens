"""Key relay of the ambient display and its hook in the mapper loop.

Simulation only: fake Luna, injected clock, recorded input events instead of the remote. None of this proves
the behaviour of the TV (docs/lg-ambient.md, phase C).
"""
import importlib.util, json, os, struct, subprocess, sys, tempfile, unittest
from pathlib import Path
from unittest.mock import patch
HERE=Path(__file__).resolve().parent
sys.path.insert(0,str(HERE/'runtime'))
import managed_mapper
import tvlens_mapper
from ambient_relay import Relay, BACK, POWER

APP='org.tvlens.ambient'
RIGHT,OK,VOL_UP,VOL_DOWN,MUTE,HOME,RAKUTEN,POINTER=106,28,115,114,113,773,1044,1198
N1,N2,N3='1'*32,'2'*32,'3'*32

class Clock:
 def __init__(self):self.now=500.0;self.slept=[]
 def __call__(self):return self.now
 def sleep(self,seconds):self.slept.append(round(seconds,3));self.now+=max(0,seconds)

class Rig:
 """A relay on a temporary run directory, with a Luna that costs simulated time and obeys its timeout."""
 def __init__(self,test,exempt=()):
  self.temp=tempfile.TemporaryDirectory();test.addCleanup(self.temp.cleanup);self.root=Path(self.temp.name)
  self.clock=Clock();self.calls=[];self.fired=[];self.windows=[APP]
  self.cost={'closeByAppId':.2,'getForegroundWindowInfo':.1};self.sticky=False;self.broken=set();self.page_leaves_at=None
  self.relay=Relay(str(self.root),luna=self.luna,clock=self.clock,sleep=self.clock.sleep,exempt=exempt,fire=self.fire)
 def notice(self):
  try:return json.loads((self.root/'tvlens-ambient-dismiss-relay.json').read_text())
  except OSError:return None
 def keys(self):return json.loads((self.root/'tvlens-ambient-keys.json').read_text())
 def gate(self,state='shown',nonce=N1,**more):
  value={'v':2,'epoch':3,'state':state,'nonce':nonce,'app':APP,'element':'card','profile':'relay','settleMs':700,'closeVia':'surface','rect':{'x':36,'y':616,'width':784,'height':296}}
  value.update(more);(self.root/'tvlens-ambient-gate.json').write_text(json.dumps(value))
 def luna(self,endpoint,payload,timeout):
  name=endpoint.rsplit('/',1)[1]
  self.calls.append({'name':name,'payload':payload,'at':self.clock.now,'timeout':timeout,'notice':self.notice()})
  if self.cost[name]>timeout:self.clock.now+=timeout;raise subprocess.TimeoutExpired('luna-send',timeout)
  self.clock.now+=self.cost[name]
  if name in self.broken:raise ValueError('No complete Luna response received')
  if self.page_leaves_at is not None and self.clock.now>=self.page_leaves_at and APP in self.windows:self.windows.remove(APP)
  if name=='closeByAppId':
   if not self.sticky and payload['id'] in self.windows:self.windows.remove(payload['id'])
   return {'returnValue':True}
  return {'returnValue':True,'windows':[{'appId':app} for app in self.windows]}
 def fire(self,endpoint,payload):
  self.fired.append((endpoint.rsplit('/',1)[1],payload,self.notice()))
  class Child:
   def poll(self):return 0
  return Child()
 def names(self):return [call['name'] for call in self.calls]

class RelayRules(unittest.TestCase):
 def test_key_state_is_published_before_the_gate_is_read_and_the_intent_before_any_luna_call(self):
  rig=Rig(self);rig.gate();seen={}
  read=rig.relay.read_gate
  def spy():seen['keys']=rig.keys();return read()
  rig.relay.read_gate=spy
  self.assertIsNone(rig.relay.on_event(1,RIGHT,1))
  # Write yours, then read the other's: the press was already published when the gate was read.
  self.assertEqual((seen['keys']['seq'],seen['keys']['down'],seen['keys']['lastEventMono']),(1,{str(RIGHT):500.0},500.0))
  first=rig.calls[0]
  self.assertEqual((first['name'],first['notice']['phase'],first['notice']['nonce'],first['notice']['code'],first['notice']['atMono']),('closeByAppId','intent',N1,RIGHT,500.0))

 def test_first_key_closes_waits_checks_again_then_gives_the_key_back(self):
  rig=Rig(self);rig.gate()
  self.assertIsNone(rig.relay.on_event(1,RIGHT,1))
  self.assertEqual(rig.names(),['closeByAppId','getForegroundWindowInfo'])
  self.assertEqual(rig.clock.slept,[.7])
  notice=rig.notice()
  self.assertEqual((notice['phase'],notice['closed'],notice['failed'],notice['elapsedMs']),('done',True,None,1000))
  self.assertEqual([name for name,_ in notice['steps']],['intent','close','settled','checked'])
  self.assertEqual([at for _,at in notice['steps']],sorted(at for _,at in notice['steps']))
  # Still listed at the second look: one more close, and the outcome is declared either way.
  rig=Rig(self);rig.gate();rig.sticky=True
  self.assertIsNone(rig.relay.on_event(1,RIGHT,1))
  self.assertEqual(rig.names(),['closeByAppId','getForegroundWindowInfo','closeByAppId','getForegroundWindowInfo'])
  self.assertEqual((rig.notice()['closed'],rig.notice()['failed']),(False,'still-listed'))

 def test_close_through_the_page_waits_for_it_then_falls_back_on_the_surface(self):
  rig=Rig(self);rig.gate(closeVia='page');rig.page_leaves_at=500.25
  self.assertIsNone(rig.relay.on_event(1,RIGHT,1))
  self.assertNotIn('closeByAppId',rig.names())
  self.assertEqual((rig.notice()['closed'],rig.notice()['failed']),(True,None))
  rig=Rig(self);rig.gate(closeVia='page')
  self.assertIsNone(rig.relay.on_event(1,RIGHT,1))
  self.assertEqual(rig.names().count('closeByAppId'),1)
  self.assertGreaterEqual(next(call['at'] for call in rig.calls if call['name']=='closeByAppId'),500.6)
  self.assertTrue(rig.notice()['closed'])

 def test_pursuit_looks_again_on_later_presses_for_six_seconds_only(self):
  rig=Rig(self);rig.gate()
  rig.relay.on_event(1,RIGHT,1);rig.relay.on_event(1,RIGHT,0);rig.calls.clear()
  rig.clock.now+=1;self.assertIsNone(rig.relay.on_event(1,OK,1))
  self.assertEqual(rig.names(),['getForegroundWindowInfo'])
  # The release is never held: a held release would turn a short Rakuten press into a long one.
  self.assertIsNone(rig.relay.on_event(1,OK,0));self.assertEqual(len(rig.calls),1)
  # A window born after the close (launch in flight) is closed before the key leaves.
  rig.windows.append(APP);rig.calls.clear();rig.clock.now+=1
  self.assertIsNone(rig.relay.on_event(1,OK,1))
  self.assertEqual(rig.names(),['getForegroundWindowInfo','closeByAppId','getForegroundWindowInfo'])
  rig.calls.clear();rig.clock.now+=6
  self.assertIsNone(rig.relay.on_event(1,OK,1));self.assertEqual(rig.calls,[])

 def test_the_key_is_never_held_beyond_the_budget(self):
  rig=Rig(self);rig.gate();rig.cost['closeByAppId']=3;rig.sticky=True
  self.assertIsNone(rig.relay.on_event(1,RIGHT,1))
  self.assertLessEqual(rig.clock.now-500.0,2.5+1e-9)
  self.assertEqual((rig.notice()['closed'],rig.notice()['failed']),(False,'budget'))
  self.assertTrue(all(call['timeout']<=1.2 for call in rig.calls))
  # Once the budget is spent nothing more is asked of Luna: no process is started only to be killed.
  rig=Rig(self);rig.gate();rig.cost={'closeByAppId':3,'getForegroundWindowInfo':.6};rig.sticky=True
  self.assertIsNone(rig.relay.on_event(1,RIGHT,1))
  self.assertEqual((rig.names(),rig.notice()['failed'],rig.clock.now),(['closeByAppId','getForegroundWindowInfo'],'budget',502.5))
  self.assertTrue(all(call['timeout']>0 for call in rig.calls))
  # A guard asked for by the native sweep widens the budget, up to a hard ceiling.
  rig=Rig(self);rig.gate(settleMs=3000);rig.cost['closeByAppId']=3;rig.sticky=True
  self.assertIsNone(rig.relay.on_event(1,RIGHT,1))
  self.assertLessEqual(rig.clock.now-500.0,4.8+1e-9)
  self.assertEqual(rig.notice()['failed'],'budget')

 def test_a_failed_close_or_an_unreadable_gate_never_keeps_a_key(self):
  rig=Rig(self);rig.gate();rig.broken={'closeByAppId','getForegroundWindowInfo'}
  self.assertIsNone(rig.relay.on_event(1,RIGHT,1))
  self.assertEqual((rig.notice()['closed'],rig.notice()['failed']),(False,'close'))
  for content in ('{','{"v":1}','[]',''):
   rig=Rig(self);(rig.root/'tvlens-ambient-gate.json').write_text(content)
   self.assertIsNone(rig.relay.on_event(1,RIGHT,1))
   self.assertEqual((rig.calls,rig.notice()),([],None))
  # Whatever breaks inside the hook, the key is given back.
  rig=Rig(self);rig.gate()
  def boom():raise RuntimeError('unexpected')
  rig.relay.read_gate=boom
  self.assertIsNone(rig.relay.on_event(1,RIGHT,1))

 def test_back_on_a_card_closes_it_and_is_the_only_key_not_forwarded(self):
  rig=Rig(self);rig.gate()
  self.assertEqual(rig.relay.on_event(1,BACK,1),'swallow')
  self.assertEqual((rig.names(),rig.clock.slept),(['closeByAppId'],[]))
  self.assertEqual((rig.notice()['phase'],rig.notice()['closed']),('done',True))
  # The gate may reopen before the release arrives: the release of a swallowed press is swallowed too.
  rig.gate('clear')
  self.assertEqual(rig.relay.on_event(1,BACK,2),'swallow')
  self.assertEqual(rig.relay.on_event(1,BACK,0),'swallow')
  self.assertIsNone(rig.relay.on_event(1,BACK,1))
  # Back that comes after another key already closed the card is an ordinary key again.
  rig=Rig(self);rig.gate();rig.relay.on_event(1,RIGHT,1);rig.relay.on_event(1,RIGHT,0)
  self.assertIsNone(rig.relay.on_event(1,BACK,1))

 def test_a_lost_release_of_a_swallowed_back_never_costs_the_next_back_pressed_without_a_card(self):
  # Back on a card is swallowed; its release is lost by the kernel (SYN_DROPPED); the gate reopens.
  rig=Rig(self);rig.gate()
  self.assertEqual(rig.relay.on_event(1,BACK,1),'swallow')
  self.assertIsNone(rig.relay.on_event(0,3,0))
  rig.gate('clear');rig.clock.now+=600
  # Ten minutes later, no card on screen: press and release both reach the video application.
  self.assertEqual((rig.relay.on_event(1,BACK,1),rig.relay.on_event(1,BACK,0)),(None,None))
  self.assertEqual((rig.relay.swallowed,rig.relay.press_sent,rig.keys()['synDropped']),(set(),{},1))
  # Same loss without the kernel saying so: a new press is a key of its own, never kept for an older one.
  rig=Rig(self);rig.gate()
  self.assertEqual(rig.relay.on_event(1,BACK,1),'swallow')
  rig.gate('clear');rig.clock.now+=600
  self.assertEqual((rig.relay.on_event(1,BACK,1),rig.relay.on_event(1,BACK,2),rig.relay.on_event(1,BACK,0)),(None,None,None))
  # And on the next card Back is still the key that closes it without being forwarded, repeats and release included.
  rig.gate(nonce=N2);rig.windows=[APP]
  self.assertEqual((rig.relay.on_event(1,BACK,1),rig.relay.on_event(1,BACK,2),rig.relay.on_event(1,BACK,0)),('swallow','swallow','swallow'))

 def test_back_is_never_swallowed_in_passthrough_nor_for_a_pill_and_always_closes(self):
  rig=Rig(self);rig.gate(profile='passthrough')
  # Passthrough: the other keys do nothing at all.
  self.assertIsNone(rig.relay.on_event(1,RIGHT,1));self.assertIsNone(rig.relay.on_event(1,RIGHT,0))
  self.assertEqual((rig.calls,rig.fired,rig.notice()),([],[],None))
  self.assertIsNone(rig.relay.on_event(1,BACK,1));self.assertIsNone(rig.relay.on_event(1,BACK,0))
  self.assertEqual([(name,payload) for name,payload,_ in rig.fired],[('closeByAppId',{'id':APP})])
  self.assertEqual(rig.fired[0][2]['phase'],'intent')
  self.assertEqual((rig.calls,rig.clock.slept),([],[]))
  self.assertEqual(rig.keys()['down'],{})
  rig=Rig(self);rig.gate(element='pill')
  self.assertIsNone(rig.relay.on_event(1,BACK,1))
  self.assertEqual(rig.names(),['closeByAppId','getForegroundWindowInfo'])
  self.assertIsNone(rig.relay.on_event(1,BACK,0))

 def test_power_is_forwarded_at_once_and_global_keys_are_handled_like_any_other(self):
  rig=Rig(self);rig.gate()
  self.assertIsNone(rig.relay.on_event(1,POWER,1))
  self.assertEqual((rig.calls,rig.clock.now,[name for name,_,_ in rig.fired]),([],500.0,['closeByAppId']))
  self.assertEqual((rig.notice()['phase'],rig.notice()['code']),('intent',POWER))
  for code in (VOL_UP,VOL_DOWN,MUTE,HOME,RAKUTEN,POINTER):
   with self.subTest(code=code):
    rig=Rig(self);rig.gate()
    self.assertIsNone(rig.relay.on_event(1,code,1))
    self.assertEqual((rig.names(),rig.notice()['closed'],rig.notice()['code']),(['closeByAppId','getForegroundWindowInfo'],True,code))
  # Exempted keys (none by default) are left alone; Back can never be exempted from closing.
  rig=Rig(self,exempt=[VOL_UP,VOL_DOWN,MUTE,BACK]);rig.gate()
  self.assertIsNone(rig.relay.on_event(1,VOL_UP,1))
  self.assertEqual((rig.calls,rig.notice()),([],None))
  self.assertEqual(rig.relay.on_event(1,BACK,1),'swallow')

 def test_repeat_lone_release_and_wheel_count_as_a_first_key(self):
  for event in ((1,RIGHT,2),(1,RIGHT,0),(2,8,1)):
   with self.subTest(event=event):
    rig=Rig(self);rig.gate()
    self.assertIsNone(rig.relay.on_event(*event))
    self.assertEqual((rig.names(),rig.notice()['closed']),(['closeByAppId','getForegroundWindowInfo'],True))

 def test_held_keys_and_dropped_events_are_published(self):
  rig=Rig(self)
  self.assertEqual((rig.keys()['down'],rig.keys()['seq'],rig.keys()['startedMono'],rig.keys()['synDropped']),({},0,500.0,0))
  rig.relay.on_event(1,VOL_UP,1);rig.clock.now+=.1;rig.relay.on_event(1,OK,1)
  self.assertEqual(rig.keys()['down'],{str(VOL_UP):500.0,str(OK):500.1})
  rig.relay.on_event(1,OK,0)
  self.assertEqual((rig.keys()['down'],rig.keys()['lastEventMono'],rig.keys()['seq']),({str(VOL_UP):500.0},500.1,3))
  # Repeats are not written one by one, but a held key never looks stale for more than half a second.
  rig.clock.now+=.2;rig.relay.on_event(1,VOL_UP,2);self.assertEqual(rig.keys()['seq'],3)
  rig.clock.now+=.4;rig.relay.on_event(1,VOL_UP,2);self.assertEqual((rig.keys()['seq'],rig.keys()['down'][str(VOL_UP)]),(5,500.7))
  # SYN_DROPPED: the kernel lost events, the key state is unknown.
  self.assertIsNone(rig.relay.on_event(0,3,0))
  self.assertEqual((rig.keys()['down'],rig.keys()['synDropped']),({},1))
  self.assertIsNone(rig.relay.on_event(0,0,0));self.assertIsNone(rig.relay.on_event(4,4,1))
  self.assertEqual(rig.calls,[])

 def test_a_release_queued_behind_a_held_press_keeps_eighty_milliseconds(self):
  rig=Rig(self);rig.gate()
  rig.relay.on_event(1,RIGHT,1);rig.clock.slept.clear()
  self.assertIsNone(rig.relay.on_event(1,RIGHT,0))
  self.assertEqual(rig.clock.slept,[.08])
  # A long press keeps its real length.
  rig=Rig(self);rig.gate();rig.relay.on_event(1,RIGHT,1);rig.clock.slept.clear();rig.clock.now+=1.2
  self.assertIsNone(rig.relay.on_event(1,RIGHT,0));self.assertEqual(rig.clock.slept,[])

class Installation(unittest.TestCase):
 def tearDown(self):managed_mapper.key_hook,managed_mapper.status_extra=None,{}
 def test_shipped_default_puts_nothing_on_the_key_path(self):
  with tempfile.TemporaryDirectory() as temp:
   path=Path(temp)/'ambient.json'
   for content in (None,'{','{"focus":"off"}','{"focus":"always"}','[]'):
    with self.subTest(content=content):
     managed_mapper.key_hook=object()
     if content is None:path.unlink(missing_ok=True)
     else:path.write_text(content)
     self.assertFalse(tvlens_mapper.install_ambient(str(path)))
     self.assertIsNone(managed_mapper.key_hook)
     self.assertEqual(managed_mapper.status_extra,{'ambientRelay':0,'panelYield':1})
 def test_experimental_profiles_install_the_hook_and_say_so_in_the_status(self):
  with tempfile.TemporaryDirectory() as temp:
   for focus in ('relay','passthrough'):
    (Path(temp)/'ambient.json').write_text(json.dumps({'focus':focus,'relay':{'exempt':[VOL_UP]}}))
    with patch.dict(os.environ,{'TVLENS_AMBIENT_CONFIG':str(Path(temp)/'ambient.json'),'TVLENS_AMBIENT_RUN':temp}):
     self.assertTrue(tvlens_mapper.install_ambient())
    self.assertEqual(managed_mapper.key_hook.__self__.exempt,{VOL_UP})
    self.assertEqual(managed_mapper.status_extra,{'ambientRelay':2,'panelYield':1})
   with patch.object(managed_mapper,'STATE_DIR',temp),patch.object(managed_mapper.time,'monotonic',return_value=812.5):
    managed_mapper.write_status(True,{})
   status=json.loads((Path(temp)/'status.json').read_text())
   self.assertEqual((status['ambientRelay'],status['panelYield'],status['updatedMono'],status['active']),(2,1,812.5,True))

FORMAT='llHHi'
def pack(events):return b''.join(struct.pack(FORMAT,0,0,*event) for event in events)
def unpack(data):
 size=struct.calcsize(FORMAT)
 return [struct.unpack(FORMAT,data[i:i+size])[2:] for i in range(0,len(data),size)]
def tap(code):return [(1,code,1),(0,0,0),(1,code,0),(0,0,0)]
# Back outside a card, as the mapper has always sent it on webOS 25: the press and its sync are dropped, a clean
# keypress is replayed at the release (press, sync, release, sync), and the sync that followed the release passes.
BACK_REPLAYED=[(1,BACK,1),(0,0,0),(1,BACK,0),(0,0,0),(0,0,0)]

class InputLoop(unittest.TestCase):
 """managed_mapper.input_loop on recorded events: a file instead of the remote, a pipe instead of the device."""
 def run_loop(self,mapper,events,clock,hook=None):
  temp=tempfile.TemporaryDirectory();self.addCleanup(temp.cleanup);root=Path(temp.name)
  source=root/'input';source.write_bytes(pack(events))
  sink=root/'output';os.mkfifo(sink);reader=os.open(sink,os.O_RDONLY|os.O_NONBLOCK);self.addCleanup(os.close,reader)
  size=struct.calcsize(FORMAT);fired=[]
  class Feeder:
   def __init__(self):self.handle=open(source,'rb',buffering=0);self.left=len(events)
   def fileno(self):return self.handle.fileno()
   def read(self,count):
    self.left-=1
    if self.left<=0:mapper.STOP_REQUESTED=True
    return self.handle.read(count)
   def close(self):self.handle.close()
  def devices(name):return str(source) if name==mapper.upstream.DEVICE_NAME else str(sink)
  with patch.object(mapper,'open_input_device',lambda path:Feeder()),patch.object(mapper.upstream,'resolve_input_device_by_name',side_effect=devices),\
    patch.object(mapper.fcntl,'ioctl'),patch.object(mapper.upstream,'luna_send',return_value='{"appId":"youtube.leanback.v4"}') as luna,\
    patch.object(mapper.upstream,'fire_events',side_effect=lambda actions:fired.append((actions,clock()))),\
    patch.object(mapper.upstream,'WEBOS_MAJOR_VERSION',10,create=True),patch.object(mapper,'STATE_DIR',str(root/'state')),\
    patch.object(mapper,'APP_DIR',str(root)),patch.object(mapper,'STOP_REQUESTED',False),patch.object(mapper,'key_hook',hook,create=True),\
    patch.object(mapper.time,'time',clock),patch.object(mapper.time,'sleep',clock.sleep),patch('builtins.print'):
   mapper.input_loop({'rakuten':{'function':'tvlens_open','inputs':{}}})
   toasts=[call for call in luna.call_args_list if 'createToast' in call.args[0]]
  written=b''
  try:
   while True:
    chunk=os.read(reader,65536)
    if not chunk:break
    written+=chunk
  except BlockingIOError:pass
  # Nothing forwarded is ever read back: not one byte was written on the input.
  self.assertEqual(source.read_bytes(),pack(events))
  self.assertEqual(len(written)%size,0)
  return written,fired,toasts

 EVERYDAY=tap(RIGHT)+tap(VOL_UP)+tap(BACK)+tap(OK)+[(2,8,1),(0,0,0)]+tap(POINTER)+tap(RAKUTEN)+[(0,3,0)]+tap(POWER)+tap(HOME)+tap(MUTE)

 def test_without_the_hook_the_loop_writes_what_it_wrote_before_byte_for_byte(self):
  written,fired,toasts=self.run_loop(managed_mapper,self.EVERYDAY,Clock())
  # Independent expectation: everything unbound is forwarded as it is; Back is replayed clean at its release;
  # Rakuten is the binding and is not forwarded.
  expected=[e for e in self.EVERYDAY if e[:2]!=(1,RAKUTEN)]
  at=expected.index((1,BACK,1));expected[at:at+4]=BACK_REPLAYED
  self.assertEqual(unpack(written),expected)
  self.assertEqual((len(fired),toasts),(1,[]))
  # Experimental profile but no card on screen (gate absent, then clear): the hook is on the path and changes
  # nothing of what is written, and asks nothing of Luna.
  for state in (None,'clear'):
   rig=Rig(self)
   if state:rig.gate(state)
   hooked,fired,toasts=self.run_loop(managed_mapper,self.EVERYDAY,rig.clock,rig.relay.on_event)
   self.assertEqual((hooked,len(fired),toasts,rig.calls,rig.notice()),(written,1,[],[],None))
   self.assertEqual(rig.keys()['synDropped'],1)
  # And against the loop as it was before this change, when Git can show it.
  shown=subprocess.run(['git','-C',str(HERE),'show','9758633:prototypes/lg-remote/runtime/managed_mapper.py'],capture_output=True)
  if shown.returncode:self.skipTest('baseline loop not available from Git: independent expectation checked only')
  self.assertNotIn(b'key_hook',shown.stdout)
  with tempfile.TemporaryDirectory() as temp:
   (Path(temp)/'runtime').mkdir();(Path(temp)/'vendor').mkdir()
   (Path(temp)/'vendor'/'upstream.json').write_bytes((HERE/'vendor'/'upstream.json').read_bytes())
   (Path(temp)/'runtime'/'baseline_mapper.py').write_bytes(shown.stdout)
   spec=importlib.util.spec_from_file_location('baseline_mapper',Path(temp)/'runtime'/'baseline_mapper.py')
   baseline=importlib.util.module_from_spec(spec);spec.loader.exec_module(baseline)
   before,_,_=self.run_loop(baseline,self.EVERYDAY,Clock())
  self.assertEqual(written,before)

 def test_with_the_hook_no_key_is_doubled_lost_or_read_back_and_rakuten_is_not_a_long_press(self):
  rig=Rig(self);clock=rig.clock;rig.cost={'closeByAppId':.5,'getForegroundWindowInfo':.3}
  # Four stretches: a card answered by Back, a card answered by Rakuten, a card answered by ordinary and
  # global keys, then no card at all.
  first=tap(BACK);second=tap(RAKUTEN);third=tap(RIGHT)+tap(VOL_UP)+tap(MUTE)+tap(HOME)+tap(POWER)+tap(POINTER)+[(2,8,1),(0,0,0)]+[(1,OK,1),(1,OK,2),(1,OK,0),(0,0,0)];fourth=tap(BACK)+tap(OK)
  events=first+second+third+fourth
  marks={0:lambda:rig.gate(nonce=N1),len(first):lambda:(rig.windows.append(APP),rig.gate(nonce=N2)),len(first+second):lambda:(rig.windows.append(APP),rig.gate(nonce=N3)),len(first+second+third):lambda:rig.gate('clear')}
  seen=[];notices=[]
  def hook(event_type,code,value):
   if len(seen) in marks:marks[len(seen)]()
   seen.append((event_type,code,value))
   return rig.relay.on_event(event_type,code,value)
  written,fired,toasts=self.run_loop(managed_mapper,events,clock,hook)
  self.assertEqual(seen,events)
  out=unpack(written)
  # Back on a card: swallowed, press, release and their syncs, with no replay. Rakuten: the binding, as today.
  expected=[e for e in second if e[:2]!=(1,RAKUTEN)]+third+BACK_REPLAYED+tap(OK)
  self.assertEqual(out,expected)
  # Every key event of the card stretches left exactly once, in order: none doubled, none lost.
  keys=[e for e in out[:-len(BACK_REPLAYED+tap(OK))] if e[0]==1]
  self.assertEqual(keys,[e for e in third if e[0]==1])
  # The hook ran before the Rakuten action, and its wait did not turn the short press into a long one.
  self.assertEqual((len(fired),toasts),(1,[]))
  self.assertGreaterEqual(fired[0][1]-500.0,1.0)
  self.assertEqual((rig.notice()['nonce'],rig.notice()['closed']),(N3,True))

if __name__=='__main__':unittest.main()
