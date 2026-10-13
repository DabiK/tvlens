import sys,unittest,tempfile,os,fcntl,json,subprocess
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
AMBIENT='org.tvlens.ambient'
class Screen:
 """What panel.main() sees of the TV: a fake Luna keyed on the endpoint, a clock that only moves when it sleeps."""
 def __init__(self,test,loops=2):
  self.temp=tempfile.TemporaryDirectory();test.addCleanup(self.temp.cleanup);root=Path(self.temp.name)
  self.now=100.0;self.calls=[];self.windows=[];self.loops=loops;self.layouts=[];self.polls=0
  self.display={'x':0,'y':0,'width':3840,'height':2160};self.vanish={};self.close_raises=False;self.supervisor=None;self.release_at=None
  self.paths={'LOCK':str(root/'panel.lock'),'GENERATION':root/'generation','LAYOUT_STATE':root/'layout-state.json','LAYOUT_REQUEST':root/'layout-request.json',
   'HEARTBEAT_PREFIX':str(root/'beat-'),'SCREEN_LOCK':root/'tvlens-screen.lock','AMBIENT_NOTICE':root/'tvlens-ambient-dismiss-panel.json','AMBIENT_GATE':root/'tvlens-ambient-gate.json'}
  for name,value in dict(self.paths,call=self.call,pause=self.pause,monotonic=lambda:self.now,stop=False).items():
   patcher=patch.object(panel,name,value);patcher.start();test.addCleanup(patcher.stop)
  for target in ('panel.subprocess.Popen','panel.signal.signal','builtins.print'):
   patcher=patch(target);patcher.start();test.addCleanup(patcher.stop)
  test.addCleanup(os.umask,os.umask(0o077));test.addCleanup(lambda:self.supervisor and self.supervisor.close())
 def hold_screen(self,release_at=None):
  """An ambient card is armed or shown: its supervisor holds the screen lock, and wrote its gate first."""
  self.paths['AMBIENT_GATE'].write_text(json.dumps({'v':2,'epoch':5,'state':'shown','nonce':'a'*32,'app':AMBIENT}))
  self.supervisor=open(self.paths['SCREEN_LOCK'],'a');fcntl.flock(self.supervisor,fcntl.LOCK_EX|fcntl.LOCK_NB);self.release_at=release_at
 def screen_held(self):
  with open(self.paths['SCREEN_LOCK'],'a') as probe:
   try:fcntl.flock(probe,fcntl.LOCK_EX|fcntl.LOCK_NB);return False
   except OSError:return True
 def pause(self,seconds):
  self.now+=seconds
  if self.supervisor and self.release_at is not None and self.now>=self.release_at:self.supervisor.close();self.supervisor=None
  if seconds==.7:
   self.layouts.append(json.loads(self.paths['LAYOUT_STATE'].read_text()));self.loops-=1
   if self.loops<=0:panel.stop=True
 def call(self,endpoint,payload):
  name=endpoint.rsplit('/',1)[1]
  self.calls.append((name,payload,self.now,self.paths['AMBIENT_NOTICE'].exists(),self.screen_held()))
  if name=='getStatus':return {'returnValue':True,'video':[{'sink':'MAIN','appId':'youtube.leanback.v4','connected':True,'context':'c1','fullScreen':True,'width':1920,'height':1080,'sourceInput':{'x':0,'y':0,'width':1920,'height':1080},'displayOutput':dict(self.display)}]}
  if name=='setDisplayWindow':self.display={k:v*2 for k,v in payload['displayOutput'].items()}
  if name=='launch':self.windows.append(payload['id'])
  if name=='closeByAppId':
   if self.close_raises and payload['id']==AMBIENT:raise subprocess.TimeoutExpired('luna-send',5)
   if payload['id'] in self.windows:self.windows.remove(payload['id'])
  if name=='getForegroundWindowInfo':
   self.polls+=1
   if self.polls in self.vanish:self.windows=list(self.vanish[self.polls])
   return {'returnValue':True,'windows':[{'appId':app} for app in self.windows]}
  return {'returnValue':True}
 def named(self,name):return [call for call in self.calls if call[0]==name]

class AmbientYield(unittest.TestCase):
 def test_free_screen_opens_as_before_with_a_notice_the_lock_and_the_video_rectangle(self):
  screen=Screen(self);panel.main()
  notice=json.loads(screen.paths['AMBIENT_NOTICE'].read_text())
  self.assertEqual((notice['atMono'],notice['pid']),(100.0,os.getpid()))
  # Notice written and screen lock held before the first call that changes anything.
  first=screen.named('setDisplayWindow')[0]
  self.assertEqual((first[2],first[3],first[4]),(100.0,True,True))
  self.assertEqual([c[1]['id'] for c in screen.named('launch')],[panel.APP])
  self.assertEqual([c[1]['id'] for c in screen.named('closeByAppId')],[panel.APP])
  # The application learns where the video is, to keep its own overlay off it.
  self.assertEqual(screen.layouts[0],{'active':True,'mode':'chat','requestId':None,'video':{'x':0,'y':135,'width':1440,'height':810}})
  self.assertEqual(json.loads(screen.paths['LAYOUT_STATE'].read_text()),{'active':False,'mode':'chat'})
  self.assertEqual(screen.display,{'x':0,'y':0,'width':3840,'height':2160})
  self.assertFalse(screen.screen_held())

 def test_card_on_screen_is_announced_and_awaited_before_any_change_of_the_video(self):
  screen=Screen(self);screen.hold_screen(release_at=100.5);panel.main()
  first=screen.calls[0]
  # Nothing was asked of Luna while the card held the screen; then the panel took the lock and opened.
  self.assertEqual((first[0],first[3],first[4]),('getStatus',True,True))
  self.assertTrue(100.5<=first[2]<102)
  self.assertEqual([c[1]['id'] for c in screen.named('closeByAppId')],[panel.APP])
  self.assertEqual(len(screen.named('setDisplayWindow')),2)

 def test_screen_never_given_back_opens_the_panel_after_two_seconds_even_if_the_close_fails(self):
  screen=Screen(self);screen.hold_screen();screen.close_raises=True;panel.main()
  closes=screen.named('closeByAppId')
  # Rakuten always opens the panel: a bounded wait, a direct close that may fail, and the opening goes on.
  self.assertEqual((closes[0][1],closes[0][3]),({'id':AMBIENT},True))
  self.assertTrue(102<=closes[0][2]<102.2)
  self.assertEqual([c[1]['id'] for c in screen.named('launch')],[panel.APP])
  self.assertTrue(screen.layouts[0]['active'])
  self.assertTrue(screen.screen_held())   # still the supervisor's: the panel never broke the lock

 def test_screen_lock_that_cannot_be_opened_never_keeps_rakuten_from_opening_the_panel_nor_closes_it(self):
  # The run directory of the ambient display does not exist (a trial mapper names one that nobody created).
  screen=Screen(self,loops=6)
  with patch.object(panel,'SCREEN_LOCK',Path(screen.temp.name)/'absent'/'tvlens-screen.lock'):
   self.assertRaises(OSError,panel.screen_lock)
   panel.main()
  # Opened at once, kept open for every turn of its loop (the lock is asked for again at each one), then restored as usual.
  self.assertEqual((screen.calls[0][0],screen.calls[0][2],[layout['active'] for layout in screen.layouts],[c[1]['id'] for c in screen.named('launch')]),('getStatus',100.0,[True]*6,[panel.APP]))
  self.assertEqual(([c[1]['displayOutput']['width'] for c in screen.named('setDisplayWindow')],[c[1]['id'] for c in screen.named('closeByAppId')]),([1440,1920],[panel.APP]))

 def test_panel_closed_once_by_a_late_ambient_window_is_relaunched_then_restored_the_second_time(self):
  screen=Screen(self,loops=9);screen.hold_screen(release_at=100.3)
  # First look: the ambient window born after the panel took its place. Third look: the panel is gone again.
  screen.vanish={1:[AMBIENT],3:[]};panel.main()
  self.assertEqual([c[1]['id'] for c in screen.named('launch')],[panel.APP,panel.APP])
  self.assertEqual([c[1]['id'] for c in screen.named('closeByAppId')],[AMBIENT,panel.APP])
  restores=screen.named('setDisplayWindow')
  # One reduction, one restoration: the relaunch did not restore the video in between.
  self.assertEqual([c[1]['displayOutput']['width'] for c in restores],[1440,1920])
  self.assertGreater(restores[1][2],screen.named('launch')[1][2])

 def test_panel_closed_by_the_viewer_is_not_relaunched_when_no_card_was_in_the_way(self):
  screen=Screen(self,loops=9);screen.vanish={1:[]};panel.main()
  self.assertEqual([c[1]['id'] for c in screen.named('launch')],[panel.APP])
  self.assertEqual([c[1]['displayOutput']['width'] for c in screen.named('setDisplayWindow')],[1440,1920])
  # Past the tolerance window a contended opening is not relaunched either.
  screen=Screen(self,loops=20);screen.hold_screen(release_at=100.3);screen.vanish={12:[]};panel.main()
  self.assertEqual([c[1]['id'] for c in screen.named('launch')],[panel.APP])
if __name__=='__main__':unittest.main()
