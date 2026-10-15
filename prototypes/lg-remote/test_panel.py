import sys,unittest,tempfile,os,fcntl,json
from unittest.mock import patch,MagicMock
from pathlib import Path
sys.path.insert(0,str(Path(__file__).parent/'runtime'))
from panel import rectangles,parse_reply,recovery_due,layout_target,physical_rect
import panel
class Rectangles(unittest.TestCase):
 def source(self):
  return {'appId':'youtube.leanback.v4','connected':True,'context':'test','fullScreen':False,'width':1920,'height':1080,'sourceInput':{'x':0,'y':0,'width':1920,'height':1080},'displayOutput':{'x':0,'y':0,'width':3840,'height':2160}}
 def test_preserves_full_source_and_aspect(self):
  v=self.source();restore,target=rectangles(v)
  self.assertEqual(target['sourceInput'],v['sourceInput'])
  self.assertEqual(target['displayOutput']['width']/target['displayOutput']['height'],16/9)
  self.assertEqual(restore['displayOutput']['width'],1920)
 def test_adaptive_resolution_keeps_reported_coordinate_space(self):
  for decoded,reported in [((1280,720),(1920,1080)),((1920,1080),(1280,720)),((3840,2160),(1920,1080)),((1280,720),(1280,720))]:
   with self.subTest(decoded=decoded,reported=reported):
    v=self.source();v['width'],v['height']=decoded
    v['sourceInput']={'x':0,'y':0,'width':reported[0],'height':reported[1]}
    restore,target=rectangles(v)
    self.assertEqual(restore['sourceInput'],v['sourceInput'])
    self.assertEqual(target['sourceInput'],v['sourceInput'])
    self.assertEqual(target['displayOutput'],{'x':0,'y':135,'width':1440,'height':810})
    self.assertEqual(layout_target(restore,'timeline')['displayOutput'],{'x':320,'y':0,'width':1280,'height':720})
    self.assertEqual(v['sourceInput']['width'],reported[0])
 def test_rejects_crops_and_invalid_dimensions(self):
  for source in [dict(x=1,y=0,width=1920,height=1080),dict(x=0,y=0,width=1440,height=1080),dict(x=0,y=0,width=0,height=1080),dict(x=0,y=0,width=-1920,height=1080),dict(x=0,y=0,width=True,height=1080),dict(x=0,y=0,width=1920,height='1080')]:
   with self.subTest(source=source):
    v=self.source();v['sourceInput']=source
    with self.assertRaises(ValueError):rectangles(v)
  for width in [0,-1,None,True,'1920']:
   v=self.source();v['width']=width
   with self.assertRaises(ValueError):rectangles(v)
 def test_bottom_layout_preserves_video_above_lower_third(self):
  restore,_=rectangles(self.source());target=layout_target(restore,'timeline')
  self.assertEqual(target['sourceInput'],restore['sourceInput'])
  self.assertEqual(target['displayOutput'],{'x':320,'y':0,'width':1280,'height':720})
  self.assertEqual(physical_rect(target),{'x':640,'y':0,'width':2560,'height':1440})
  self.assertEqual(layout_target(restore,'chat')['displayOutput'],{'x':0,'y':135,'width':1440,'height':810})
  with self.assertRaises(ValueError):layout_target(restore,'arbitrary')
 def test_refuses_foreign_or_cropped_source(self):
  for key,value in [('appId','netflix'),('connected',False),('sourceInput',{'x':1}),('displayOutput',{'width':1920})]:
   v=self.source();v[key]=value
   with self.assertRaises(ValueError):rectangles(v)
class LunaReplies(unittest.TestCase):
 def test_multiline_timing_reply(self):
  reply='timingServiceResponse: {\n "returnValue": true,\n "windows": [{"appId":"test"}]\n}\nTiming: 2ms'
  self.assertEqual(parse_reply('',reply)['windows'][0]['appId'],'test')
 def test_compact_and_stdout(self):
  self.assertTrue(parse_reply('', 'timingServiceResponse: {"returnValue":true}')['returnValue'])
  self.assertFalse(parse_reply('{"returnValue":false,"errorText":"no"}', '')['returnValue'])
 def test_rejects_truncated_reply(self):
  with self.assertRaises(ValueError):parse_reply('', 'timingServiceResponse: {')
class Watchdog(unittest.TestCase):
 def test_healthy_panel_can_live_beyond_old_deadline_and_stale_owner_recovers(self):
  with tempfile.TemporaryDirectory() as directory:
   owner=Path(directory)/'owner';beat=Path(directory)/'beat'
   owner.write_text('first');beat.touch();os.utime(beat,(1000,1000))
   with patch.object(panel,'GENERATION',owner):
    self.assertFalse(recovery_due(beat,'first',1010))
    self.assertTrue(recovery_due(beat,'first',1021))
    os.utime(beat,(2000,2000));self.assertFalse(recovery_due(beat,'first',2001))
    owner.write_text('second');self.assertFalse(recovery_due(beat,'first',3000))
class Screen:
 """Luna simulée et horloge avancée uniquement par les pauses du panneau."""
 def __init__(self,test,loops=2):
  self.temp=tempfile.TemporaryDirectory()
  test.addCleanup(self.temp.cleanup)
  root=Path(self.temp.name)
  self.now=100.0
  self.calls=[]
  self.windows=[]
  self.loops=loops
  self.layouts=[]
  self.polls=0
  self.requests=[]
  self.display={'x':0,'y':0,'width':3840,'height':2160}
  self.vanish={}
  self.paths={'LOCK':str(root/'panel.lock'),'GENERATION':root/'generation','LAYOUT_STATE':root/'layout-state.json',
   'LAYOUT_REQUEST':root/'layout-request.json','HEARTBEAT_PREFIX':str(root/'beat-')}
  for name,value in dict(self.paths,call=self.call,pause=self.pause,stop=False).items():
   patcher=patch.object(panel,name,value)
   patcher.start()
   test.addCleanup(patcher.stop)
  self.watchdog=MagicMock()
  patcher=patch('panel.subprocess.Popen',return_value=self.watchdog)
  self.launch=patcher.start()
  test.addCleanup(patcher.stop)
  for target in ('panel.signal.signal','builtins.print'):
   patcher=patch(target)
   patcher.start()
   test.addCleanup(patcher.stop)
  test.addCleanup(os.umask,os.umask(0o077))
 def pause(self,seconds):
  self.now+=seconds
  if seconds==.7:
   self.layouts.append(json.loads(self.paths['LAYOUT_STATE'].read_text()))
   self.loops-=1
   if self.loops<=0:panel.stop=True
  if self.requests:
   self.paths['LAYOUT_REQUEST'].write_text(json.dumps(self.requests.pop(0)))
 def call(self,endpoint,payload):
  name=endpoint.rsplit('/',1)[1]
  self.calls.append((name,payload,self.now))
  if name=='getStatus':
   video={'sink':'MAIN','appId':'youtube.leanback.v4','connected':True,'context':'c1','fullScreen':True,
    'width':1920,'height':1080,'sourceInput':{'x':0,'y':0,'width':1920,'height':1080},'displayOutput':dict(self.display)}
   return {'returnValue':True,'video':[video]}
  if name=='setDisplayWindow':self.display={k:v*2 for k,v in payload['displayOutput'].items()}
  if name=='launch':self.windows.append(payload['id'])
  if name=='closeByAppId' and payload['id'] in self.windows:self.windows.remove(payload['id'])
  if name=='getForegroundWindowInfo':
   self.polls+=1
   if self.polls in self.vanish:self.windows=list(self.vanish[self.polls])
   return {'returnValue':True,'windows':[{'appId':app} for app in self.windows]}
  return {'returnValue':True}
 def named(self,name):return [call for call in self.calls if call[0]==name]

class PanelLifecycle(unittest.TestCase):
 def test_panel_lifecycle_creates_only_its_own_state(self):
  screen=Screen(self)
  panel.main()
  self.assertEqual([call[1]['id'] for call in screen.named('launch')],[panel.APP])
  self.assertEqual(screen.display,{'x':0,'y':0,'width':3840,'height':2160})
  self.assertEqual({path.name for path in Path(screen.temp.name).iterdir()},{'panel.lock','generation','layout-state.json'})
  screen.launch.assert_called_once()
  command=screen.launch.call_args.args[0]
  self.assertEqual(command[:3],['/usr/bin/python3',panel.__file__,'restore'])
  screen.watchdog.terminate.assert_called_once_with()
  screen.watchdog.wait.assert_called_once_with(timeout=3)

 def test_open_panel_publishes_video_geometry_and_restores_on_exit(self):
  screen=Screen(self)
  panel.main()
  first=screen.named('setDisplayWindow')[0]
  self.assertEqual(first[2],100.0)
  self.assertEqual([c[1]['id'] for c in screen.named('launch')],[panel.APP])
  self.assertEqual([c[1]['id'] for c in screen.named('closeByAppId')],[panel.APP])
  self.assertEqual(screen.layouts[0],{'active':True,'mode':'chat','requestId':None,'video':{'x':0,'y':135,'width':1440,'height':810}})
  self.assertEqual(json.loads(screen.paths['LAYOUT_STATE'].read_text()),{'active':False,'mode':'chat'})
  self.assertEqual(screen.display,{'x':0,'y':0,'width':3840,'height':2160})

 def test_panel_closed_by_the_viewer_is_not_relaunched(self):
  screen=Screen(self,loops=9)
  screen.vanish={1:[]}
  panel.main()
  self.assertEqual([c[1]['id'] for c in screen.named('launch')],[panel.APP])
  self.assertEqual([c[1]['displayOutput']['width'] for c in screen.named('setDisplayWindow')],[1440,1920])

 def test_layout_requests_change_between_timeline_and_chat_before_restoring(self):
  screen=Screen(self,loops=3)
  screen.requests=[{'id':'first','mode':'timeline'},{'id':'second','mode':'chat'}]
  panel.main()
  self.assertEqual([c[1]['displayOutput'] for c in screen.named('setDisplayWindow')],[
   {'x':0,'y':135,'width':1440,'height':810},{'x':320,'y':0,'width':1280,'height':720},
   {'x':0,'y':135,'width':1440,'height':810},{'x':0,'y':0,'width':1920,'height':1080}])
  self.assertEqual([layout['mode'] for layout in screen.layouts],['timeline','chat','chat'])
  self.assertEqual([layout['requestId'] for layout in screen.layouts],['first','second','second'])

 def test_panel_owner_lock_prevents_a_second_launch(self):
  screen=Screen(self)
  with open(screen.paths['LOCK'],'a') as owner:
   fcntl.flock(owner,fcntl.LOCK_EX|fcntl.LOCK_NB)
   panel.main()
  self.assertEqual(screen.calls,[])
  screen.launch.assert_not_called()

if __name__=='__main__':unittest.main()
