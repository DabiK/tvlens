"""Boucle mapper sur événements enregistrés, sans accès à la télécommande ni à Luna."""
import importlib.util, json, os, runpy, struct, subprocess, sys, tempfile, unittest
from pathlib import Path
from unittest.mock import patch
HERE=Path(__file__).resolve().parent
sys.path.insert(0,str(HERE/'runtime'))
import managed_mapper
import tvlens_mapper

BACK,POWER=412,116
RIGHT,OK,VOL_UP,MUTE,HOME,RAKUTEN,POINTER=106,28,115,113,773,1044,1198

class Clock:
 def __init__(self):
  self.now=500.0
  self.slept=[]
 def __call__(self):return self.now
 def sleep(self,seconds):
  self.slept.append(round(seconds,3))
  self.now+=max(0,seconds)

FORMAT='llHHi'
def pack(events):return b''.join(struct.pack(FORMAT,0,0,*event) for event in events)
def unpack(data):
 size=struct.calcsize(FORMAT)
 return [struct.unpack(FORMAT,data[i:i+size])[2:] for i in range(0,len(data),size)]
def tap(code):return [(1,code,1),(0,0,0),(1,code,0),(0,0,0)]
# Back, as the mapper has always sent it on webOS 25: the press and its sync are dropped, a clean
# keypress is replayed at the release (press, sync, release, sync), and the sync that followed the release passes.
BACK_REPLAYED=[(1,BACK,1),(0,0,0),(1,BACK,0),(0,0,0),(0,0,0)]

class InputLoop(unittest.TestCase):
 """managed_mapper.input_loop on recorded events: a file instead of the remote, a pipe instead of the device."""
 def run_loop(self,mapper,events,clock,execute=False):
  temp=tempfile.TemporaryDirectory()
  self.addCleanup(temp.cleanup)
  root=Path(temp.name)
  source=root/'input'
  source.write_bytes(pack(events))
  sink=root/'output'
  os.mkfifo(sink)
  reader=os.open(sink,os.O_RDONLY|os.O_NONBLOCK)
  self.addCleanup(os.close,reader)
  size=struct.calcsize(FORMAT)
  fired=[]
  fire_events=mapper.upstream.fire_events
  def fire(actions):
   fired.append((actions,clock()))
   if execute:fire_events(actions)
  class Feeder:
   def __init__(self):
    self.handle=open(source,'rb',buffering=0)
    self.left=len(events)
   def fileno(self):return self.handle.fileno()
   def read(self,count):
    self.left-=1
    if self.left<=0:mapper.STOP_REQUESTED=True
    return self.handle.read(count)
   def close(self):self.handle.close()
  def devices(name):return str(source) if name==mapper.upstream.DEVICE_NAME else str(sink)
  with patch.object(mapper,'open_input_device',lambda path:Feeder()),patch.object(mapper.upstream,'resolve_input_device_by_name',side_effect=devices),\
    patch.object(mapper.fcntl,'ioctl'),patch.object(mapper.upstream,'luna_send',return_value='{"appId":"youtube.leanback.v4"}') as luna,\
    patch.object(mapper.upstream,'fire_events',side_effect=fire),\
    patch.object(mapper.upstream,'WEBOS_MAJOR_VERSION',10,create=True),patch.object(mapper,'STATE_DIR',str(root/'state')),\
    patch.object(mapper,'APP_DIR',str(root)),patch.object(mapper,'STOP_REQUESTED',False),\
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

 def test_unbound_keys_back_and_rakuten_keep_their_expected_events(self):
  written,fired,toasts=self.run_loop(managed_mapper,self.EVERYDAY,Clock())
  # Independent expectation: everything unbound is forwarded as it is; Back is replayed clean at its release;
  # Rakuten is the binding and is not forwarded.
  expected=[e for e in self.EVERYDAY if e[:2]!=(1,RAKUTEN)]
  at=expected.index((1,BACK,1))
  expected[at:at+4]=BACK_REPLAYED
  self.assertEqual(unpack(written),expected)
  self.assertEqual((len(fired),toasts),(1,[]))
  self.assertEqual(fired[0][0],[{'function':'tvlens_open','inputs':{}}])
  # And against the loop as it was before this change, when Git can show it.
  shown=subprocess.run(['git','-C',str(HERE),'show','9758633:prototypes/lg-remote/runtime/managed_mapper.py'],capture_output=True)
  if shown.returncode:self.skipTest('baseline loop not available from Git: independent expectation checked only')
  with tempfile.TemporaryDirectory() as temp:
   (Path(temp)/'runtime').mkdir()
   (Path(temp)/'vendor').mkdir()
   (Path(temp)/'vendor'/'upstream.json').write_bytes((HERE/'vendor'/'upstream.json').read_bytes())
   (Path(temp)/'runtime'/'baseline_mapper.py').write_bytes(shown.stdout)
   spec=importlib.util.spec_from_file_location('baseline_mapper',Path(temp)/'runtime'/'baseline_mapper.py')
   baseline=importlib.util.module_from_spec(spec)
   spec.loader.exec_module(baseline)
   before,_,_=self.run_loop(baseline,self.EVERYDAY,Clock())
  self.assertEqual(written,before)

 def test_rakuten_opens_the_panel_once_through_the_bound_action(self):
  with tempfile.TemporaryDirectory() as temp:
   real_open=open
   def open_log(path,*args,**kwargs):
    if path=='/tmp/tvlens-panel.log':path=Path(temp)/'panel.log'
    return real_open(path,*args,**kwargs)
   with patch('builtins.open',side_effect=open_log),patch.object(tvlens_mapper.subprocess,'Popen') as launch:
    written,fired,toasts=self.run_loop(managed_mapper,tap(RAKUTEN),Clock(),execute=True)
   self.assertEqual(unpack(written),[(0,0,0),(0,0,0)])
   self.assertEqual((len(fired),toasts),(1,[]))
   launch.assert_called_once()
   self.assertEqual(launch.call_args.args[0],[sys.executable,str(HERE/'runtime'/'panel.py')])
   self.assertTrue(launch.call_args.kwargs['start_new_session'])
   self.assertTrue(launch.call_args.kwargs['stdout'].closed)

class MapperStartup(unittest.TestCase):
 def test_entry_point_publishes_only_mapper_status(self):
  with tempfile.TemporaryDirectory() as temp:
   root=Path(temp)
   config=root/'ambient.json'
   config.write_text('{"focus":"relay"}')
   def start():managed_mapper.write_status(True,{})
   with patch.dict(os.environ,{'TVLENS_AMBIENT_CONFIG':str(config),'TVLENS_AMBIENT_RUN':temp}),\
     patch.object(managed_mapper,'STATE_DIR',temp),patch.object(managed_mapper,'main',side_effect=start) as main,\
     patch.object(managed_mapper.time,'monotonic',return_value=812.5):
    runpy.run_path(str(HERE/'runtime'/'tvlens_mapper.py'),run_name='__main__')
   main.assert_called_once_with()
   status=json.loads((root/'status.json').read_text())
   self.assertEqual((status['active'],status['updatedMono']),(True,812.5))
   self.assertNotIn('ambientRelay',status)
   self.assertNotIn('panelYield',status)
   self.assertEqual({path.name for path in root.iterdir()},{'ambient.json','status.json'})

if __name__=='__main__':unittest.main()
