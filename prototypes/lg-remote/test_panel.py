import sys,unittest,tempfile,os,fcntl,json,time
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
 def test_valid_output_layouts_restore_the_current_rectangle(self):
  cases=[
   ((1668,1080),{'x':252,'y':0,'width':3336,'height':2160},False,
    {'x':126,'y':0,'width':1668,'height':1080},{'x':0,'y':74,'width':1440,'height':932}),
   ((1920,800),{'x':0,'y':280,'width':3840,'height':1600},False,
    {'x':0,'y':140,'width':1920,'height':800},{'x':0,'y':240,'width':1440,'height':600}),
   ((1920,1080),{'x':960,'y':540,'width':1920,'height':1080},False,
    {'x':480,'y':270,'width':960,'height':540},{'x':0,'y':135,'width':1440,'height':810}),
   ((1920,1080),{'x':1,'y':3,'width':3839,'height':2157},False,
    {'x':.5,'y':1.5,'width':1919.5,'height':1078.5},{'x':0,'y':135,'width':1440,'height':810}),
   ((1920,1080),{'x':0,'y':0,'width':3840,'height':2160},True,
    {'x':0,'y':0,'width':1920,'height':1080},{'x':0,'y':135,'width':1440,'height':810})]
  for dimensions,output,full_screen,logical,target_output in cases:
   with self.subTest(output=output):
    v=self.source()
    v['width'],v['height']=dimensions
    v['sourceInput']=dict(x=0,y=0,width=dimensions[0],height=dimensions[1])
    v.update(displayOutput=output,fullScreen=full_screen)
    try:
     restore,target=rectangles(v)
    except ValueError as error:
     self.fail(f'Valid output refused: {error}')
    self.assertEqual(restore,dict(sink='MAIN',context='test',fullScreen=full_screen,
     displayOutput=logical,appOutput=logical,sourceInput=v['sourceInput'],originalInput=v['sourceInput']))
    self.assertEqual(physical_rect(restore),output)
    self.assertEqual(target['displayOutput'],target_output)
    self.assertEqual(target['appOutput'],target_output)
    self.assertEqual(target['sourceInput'],v['sourceInput'])
    self.assertFalse(target['fullScreen'])
    self.assertEqual(v['displayOutput'],output)
 def test_refuses_malformed_or_out_of_screen_output(self):
  invalid=[None,[],{},dict(x=0,y=0,width=3840),dict(x=0,y=0,width=0,height=2160),
   dict(x=0,y=0,width=3840,height=-1),dict(x=-1,y=0,width=100,height=100),dict(x=0,y=-1,width=100,height=100),
   dict(x=252,y=0,width=3840,height=2160),dict(x=0,y=1,width=3840,height=2160)]
  for field in ('x','y','width','height'):
   for value in (True,None,'100',1.5):
    output=dict(x=0,y=0,width=100,height=100)
    output[field]=value
    invalid.append(output)
  for output in invalid:
   with self.subTest(output=output):
    v=self.source()
    v['displayOutput']=output
    with self.assertRaises(ValueError):
     rectangles(v)
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
 def test_refuses_home_disconnected_or_cropped_source(self):
  for key,value in [('appId','com.webos.app.home'),('connected',False),('sourceInput',{'x':1}),('displayOutput',{'width':1920})]:
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
  self.endpoints=[]
  self.windows=[]
  self.loops=loops
  self.layouts=[]
  self.polls=0
  self.requests=[]
  self.display={'x':0,'y':0,'width':3840,'height':2160}
  self.video_fields={}
  self.status_videos=None
  self.foreground_app='youtube.leanback.v4'
  self.extra_videos=[]
  self.toasts=[]
  self.toast_error=None
  self.toast_reply={'returnValue':True}
  self.close_error=None
  self.close_reply={'returnValue':True}
  self.vanish={}
  self.sidebar_delay=0
  self.launched_at=None
  self.visible_until=None
  self.paths={'LOCK':str(root/'panel.lock'),'GENERATION':root/'generation','LAYOUT_STATE':root/'layout-state.json',
   'LAYOUT_REQUEST':root/'layout-request.json','HEARTBEAT_PREFIX':str(root/'beat-')}
  for name,value in dict(self.paths,call=self.call,pause=self.pause,clock=lambda:self.now,stop=False).items():
   patcher=patch.object(panel,name,value)
   patcher.start()
   test.addCleanup(patcher.stop)
  self.watchdog=MagicMock()
  patcher=patch('panel.subprocess.Popen',return_value=self.watchdog)
  self.launch=patcher.start()
  test.addCleanup(patcher.stop)
  for target in ('panel.signal.signal','builtins.print'):
   patcher=patch(target)
   mocked=patcher.start()
   if target=='builtins.print':self.log=mocked
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
  self.endpoints.append((endpoint,payload,self.now))
  self.calls.append((name,payload,self.now))
  if name=='getForegroundAppInfo':
   return {'returnValue':True,'appId':self.foreground_app}
  if name=='getStatus':
   video={'sink':'MAIN','appId':'youtube.leanback.v4','connected':True,'context':'c1','fullScreen':True,
    'width':1920,'height':1080,'sourceInput':{'x':0,'y':0,'width':1920,'height':1080},'displayOutput':dict(self.display)}
   video.update(self.video_fields)
   return {'returnValue':True,'video':self.extra_videos+[video] if self.status_videos is None else self.status_videos}
  if endpoint=='com.webos.notification/createToast':
   self.toasts.append(payload)
   if self.toast_error:raise self.toast_error
   return self.toast_reply
  if endpoint=='com.webos.applicationManager/closeByAppId':
   if self.close_error:raise self.close_error
   if not self.close_reply.get('returnValue'):return self.close_reply
  if name=='setDisplayWindow':self.display={k:v*2 for k,v in payload['displayOutput'].items()}
  if name=='launch':
   self.windows.append(payload['id'])
   self.launched_at=self.now
   self.foreground_app=payload['id']
  if name=='closeByAppId' and payload['id'] in self.windows:self.windows.remove(payload['id'])
  if name=='getForegroundWindowInfo':
   self.polls+=1
   if self.polls in self.vanish:self.windows=list(self.vanish[self.polls])
   visible=list(self.windows)
   if self.launched_at is not None:
    elapsed=self.now-self.launched_at
    if elapsed<self.sidebar_delay or (self.visible_until is not None and elapsed>=self.visible_until):
     visible=[app for app in visible if app!=panel.APP]
   return {'returnValue':True,'windows':[{'appId':app} for app in visible]}
  return {'returnValue':True}
 def named(self,name):return [call for call in self.calls if call[0]==name]

class PanelLifecycle(unittest.TestCase):
 def test_lg_player_selects_its_connected_main_video_and_restores_with_sidebar_in_foreground(self):
  screen=Screen(self)
  screen.foreground_app='com.webos.app.mediadiscovery'
  screen.display={'x':0,'y':40,'width':3840,'height':2080}
  source=dict(x=0,y=0,width=1920,height=1040)
  screen.video_fields=dict(appId=screen.foreground_app,width=1920,height=1040,fullScreen=False,sourceInput=source)
  screen.extra_videos=[
   dict(sink='MAIN',appId='youtube.leanback.v4',connected=True,context='other'),
   dict(sink='MAIN',appId=screen.foreground_app,connected=False,context='disconnected'),
   dict(sink='SUB',appId=screen.foreground_app,connected=True,context='secondary')]
  panel.main()
  target={'x':0,'y':150,'width':1440,'height':780}
  saved={'x':0,'y':20,'width':1920,'height':1040}
  self.assertEqual(screen.foreground_app,panel.APP)
  self.assertEqual([call[1]['id'] for call in screen.named('launch')],[panel.APP])
  self.assertEqual(len(screen.layouts),2,'The sidebar must remain open while the saved video is unchanged')
  self.assertTrue(all(layout['active'] and layout['video']==target for layout in screen.layouts))
  windows=screen.named('setDisplayWindow')
  self.assertEqual([call[1]['displayOutput'] for call in windows],[target,saved])
  for _,rectangle,_ in windows:
   self.assertEqual(rectangle['context'],'c1')
   self.assertEqual(rectangle['sourceInput'],source)
   self.assertEqual(rectangle['originalInput'],source)
   self.assertEqual(rectangle['appOutput'],rectangle['displayOutput'])
   self.assertFalse(rectangle['fullScreen'])
  self.assertEqual(screen.display,{'x':0,'y':40,'width':3840,'height':2080})
  self.assertEqual(screen.toasts,[])
  self.assertEqual(json.loads(screen.paths['LAYOUT_STATE'].read_text()),{'active':False,'mode':'chat'})
  screen.watchdog.terminate.assert_called_once_with()

 def test_home_with_preview_and_live_tv_refuses_opening_without_changing_video(self):
  screen=Screen(self)
  screen.foreground_app='com.webos.app.home'
  screen.status_videos=[
   dict(sink='MAIN',appId='com.webos.app.home',connected=True,context='preview',fullScreen=False,width=1600,height=900,
    sourceInput=dict(x=0,y=0,width=1600,height=900),displayOutput=dict(x=300,y=46,width=1600,height=900)),
   dict(sink='MAIN',appId='com.webos.app.livetv',connected=True,context='live',fullScreen=False,
    displayOutput=dict(x=0,y=0,width=0,height=0))]
  self.assert_opening_refused(screen,'TVLens : lance une vidéo pour ouvrir le panneau.','TVLENS_PANEL_PLAYBACK_REQUIRED')

 def test_missing_foreground_application_refuses_even_with_a_connected_video(self):
  for app_id in (None,''):
   with self.subTest(app_id=app_id):
    screen=Screen(self)
    screen.foreground_app=app_id
    self.assert_opening_refused(screen,'TVLens : lance une vidéo pour ouvrir le panneau.','TVLENS_PANEL_PLAYBACK_REQUIRED')

 def test_foreground_video_apps_share_the_same_opening_and_restoration_contract(self):
  for app_id in ('youtube.leanback.v4','netflix','com.amazon.amazonvideo','custom.player'):
   with self.subTest(app_id=app_id):
    screen=Screen(self)
    screen.foreground_app=app_id
    screen.video_fields={'appId':app_id}
    panel.main()
    self.assertEqual([call[1]['id'] for call in screen.named('launch')],[panel.APP])
    self.assertEqual(len(screen.layouts),2)
    self.assertEqual([call[1]['displayOutput'] for call in screen.named('setDisplayWindow')],
     [{'x':0,'y':135,'width':1440,'height':810},{'x':0,'y':0,'width':1920,'height':1080}])
    self.assertEqual(screen.toasts,[])

 def test_saved_video_transition_closes_the_panel_without_restoring_a_replacement(self):
  for transition in ('context','missing','geometry'):
   with self.subTest(transition=transition):
    screen=Screen(self,loops=99)
    def pause_then_transition(seconds):
     screen.pause(seconds)
     if seconds!=.7:return
     if transition=='context':screen.video_fields={'context':'replacement'}
     if transition=='missing':screen.status_videos=[]
     if transition=='geometry':screen.display={'x':0,'y':0,'width':3840,'height':2160}
    with patch.object(panel,'pause',pause_then_transition):
     panel.main()
    self.assertEqual(screen.foreground_app,panel.APP)
    self.assertEqual(len(screen.layouts),1)
    windows=screen.named('setDisplayWindow')
    self.assertEqual(len(windows),2 if transition=='geometry' else 1)
    if transition=='geometry':
     self.assertEqual(windows[-1][1]['displayOutput'],{'x':0,'y':0,'width':1920,'height':1080})
    self.assertEqual([call[1]['id'] for call in screen.named('closeByAppId')],[panel.APP])
    self.assertEqual(len(screen.named('launch')),1)
    self.assertEqual(screen.toasts,[])
    self.assertEqual(json.loads(screen.paths['LAYOUT_STATE'].read_text()),{'active':False,'mode':'chat'})
    screen.watchdog.terminate.assert_called_once_with()

 def test_disconnected_saved_video_keeps_panel_open_and_restores_unchanged_geometry(self):
  screen=Screen(self,loops=3)
  def pause_then_disconnect(seconds):
   screen.pause(seconds)
   if seconds==.7:screen.video_fields={'connected':False}
  with patch.object(panel,'pause',pause_then_disconnect):
   panel.main()
  target={'x':0,'y':135,'width':1440,'height':810}
  self.assertEqual(len(screen.layouts),3,'A disconnection with stable geometry must keep the panel open')
  self.assertTrue(all(layout['active'] and layout['video']==target for layout in screen.layouts))
  self.assertEqual(screen.foreground_app,panel.APP)
  windows=screen.named('setDisplayWindow')
  self.assertEqual([call[1]['displayOutput'] for call in windows],[target,{'x':0,'y':0,'width':1920,'height':1080}])
  self.assertEqual(windows[-1][1]['context'],'c1')
  self.assertEqual(screen.display,{'x':0,'y':0,'width':3840,'height':2160})
  self.assertEqual([call[1]['id'] for call in screen.named('closeByAppId')],[panel.APP])
  self.assertEqual(len(screen.named('launch')),1)
  self.assertEqual(screen.toasts,[])
  self.assertEqual(json.loads(screen.paths['LAYOUT_STATE'].read_text()),{'active':False,'mode':'chat'})
  screen.watchdog.terminate.assert_called_once_with()

 def test_sidebar_timeout_uses_an_isolated_clock(self):
  shared_clock=time.monotonic
  screen=Screen(self,loops=99)
  screen.sidebar_delay=float('inf')
  panel.main()
  self.assertEqual(screen.named('createToast')[0][2]-screen.launched_at,8)
  self.assertIs(time.monotonic,shared_clock,'The simulated panel clock replaced the shared standard clock')

 def test_stop_during_sidebar_wait_restores_without_reporting_a_timeout(self):
  screen=Screen(self,loops=99)
  screen.sidebar_delay=float('inf')
  def pause_then_stop(seconds):
   screen.pause(seconds)
   if screen.now-screen.launched_at>=2:
    panel.on_stop()
  with patch.object(panel,'pause',pause_then_stop):
   panel.main()
  self.assertEqual(screen.named('setDisplayWindow')[-1][2]-screen.launched_at,2)
  self.assertEqual(screen.display,{'x':0,'y':0,'width':3840,'height':2160})
  self.assertEqual(screen.toasts,[])
  self.assertNotIn('TVLENS_PANEL_SIDEBAR_TIMEOUT',' '.join(str(call) for call in screen.log.call_args_list))
  self.assertEqual(len(screen.named('launch')),1)
  screen.watchdog.terminate.assert_called_once_with()

 def test_sidebar_at_the_deadline_opens_but_later_sidebar_times_out(self):
  for delay,notifications in ((8,0),(8.5,1)):
   with self.subTest(delay=delay):
    screen=Screen(self)
    screen.sidebar_delay=delay
    panel.main()
    self.assertEqual(len(screen.toasts),notifications)
    self.assertEqual(bool(screen.layouts),notifications==0)
    self.assertEqual(len(screen.named('launch')),1)
    self.assertEqual(screen.display,{'x':0,'y':0,'width':3840,'height':2160})

 def test_timeout_cleanup_failures_are_logged_without_escaping_or_retrying(self):
  cases=[
   ('close_error',OSError('close unavailable'),'TVLENS_PANEL_SIDEBAR_CLOSE_FAILED'),
   ('close_reply',{'returnValue':False,'errorCode':500},'TVLENS_PANEL_SIDEBAR_CLOSE_FAILED'),
   ('toast_error',OSError('notification unavailable'),'TVLENS_PANEL_NOTIFICATION_FAILED'),
   ('toast_reply',{'returnValue':False,'errorCode':500},'TVLENS_PANEL_NOTIFICATION_FAILED')]
  for field,value,code in cases:
   with self.subTest(field=field):
    screen=Screen(self,loops=99)
    screen.sidebar_delay=float('inf')
    setattr(screen,field,value)
    panel.main()
    closes=[call for call in screen.endpoints if call[0]=='com.webos.applicationManager/closeByAppId']
    self.assertEqual(len(closes),1)
    self.assertEqual(screen.toasts,[{'message':"TVLens : le panneau n'a pas pu s'afficher."}])
    self.assertEqual(len(screen.named('launch')),1)
    self.assertEqual(screen.display,{'x':0,'y':0,'width':3840,'height':2160})
    self.assertIn(code,' '.join(str(call) for call in screen.log.call_args_list))
    self.assertIn('TVLENS_PANEL_SIDEBAR_TIMEOUT',' '.join(str(call) for call in screen.log.call_args_list))
    self.assertEqual(json.loads(screen.paths['LAYOUT_STATE'].read_text()),{'active':False,'mode':'chat'})
    screen.watchdog.terminate.assert_called_once_with()

 def test_missing_sidebar_is_closed_after_timeout_with_one_notification_and_restore(self):
  screen=Screen(self,loops=99)
  screen.sidebar_delay=float('inf')
  screen.display={'x':960,'y':540,'width':1920,'height':1080}
  screen.video_fields={'fullScreen':False}
  panel.main()
  closes=[call for call in screen.endpoints if call[0]=='com.webos.applicationManager/closeByAppId']
  self.assertEqual(len(closes),1)
  self.assertEqual(closes[0][1],{'id':panel.APP})
  self.assertEqual(closes[0][2]-screen.launched_at,8)
  restored=screen.named('setDisplayWindow')[-1][1]
  self.assertEqual(restored['displayOutput'],{'x':480,'y':270,'width':960,'height':540})
  self.assertFalse(restored['fullScreen'])
  self.assertEqual(screen.toasts,[{'message':"TVLens : le panneau n'a pas pu s'afficher."}])
  self.assertEqual(len(screen.named('launch')),1)
  self.assertIn('TVLENS_PANEL_SIDEBAR_TIMEOUT',' '.join(str(call) for call in screen.log.call_args_list))
  self.assertEqual(screen.windows,[])
  self.assertEqual(json.loads(screen.paths['LAYOUT_STATE'].read_text()),{'active':False,'mode':'chat'})
  screen.watchdog.terminate.assert_called_once_with()
  screen.watchdog.wait.assert_called_once_with(timeout=3)

 def test_delayed_sidebar_stays_open_until_the_viewer_closes_it(self):
  screen=Screen(self,loops=99)
  screen.sidebar_delay=2.5
  screen.visible_until=5
  panel.main()
  target={'x':0,'y':135,'width':1440,'height':810}
  self.assertTrue(screen.layouts,'The delayed sidebar never stayed open')
  self.assertTrue(all(layout['active'] and layout['video']==target for layout in screen.layouts))
  windows=screen.named('setDisplayWindow')
  self.assertGreaterEqual(windows[-1][2]-screen.launched_at,5)
  self.assertEqual([call[1]['displayOutput'] for call in windows],
   [target,{'x':0,'y':0,'width':1920,'height':1080}])
  self.assertEqual(len(screen.named('launch')),1)
  self.assertEqual(screen.toasts,[])
  self.assertEqual(json.loads(screen.paths['LAYOUT_STATE'].read_text()),{'active':False,'mode':'chat'})

 def assert_opening_refused(self,screen,message,code):
  before=dict(screen.display)
  try:
   panel.main()
  except Exception as error:
   self.fail(f'Opening refusal escaped main: {error}')
  self.assertEqual(screen.toasts,[{'message':message}])
  self.assertEqual(len(screen.named('createToast')),1)
  self.assertEqual(screen.named('setDisplayWindow'),[])
  self.assertEqual(screen.named('launch'),[])
  self.assertEqual(screen.named('closeByAppId'),[])
  self.assertEqual(screen.display,before)
  screen.launch.assert_not_called()
  self.assertEqual({path.name for path in Path(screen.temp.name).iterdir()},{'panel.lock'})
  self.assertIn(code,' '.join(str(call) for call in screen.log.call_args_list))

 def test_refused_opening_names_the_cause_once_and_leaves_video_intact(self):
  playback='TVLens : lance une vidéo pour ouvrir le panneau.'
  crop='TVLens : la vidéo est rognée, le panneau ne peut pas s’ouvrir.'
  dimensions='TVLens : les dimensions de la vidéo sont invalides.'
  source='TVLens : la source vidéo est indisponible.'
  aspect='TVLens : les proportions de la vidéo sont incohérentes.'
  output='TVLens : le rectangle vidéo est invalide ou dépasse l’écran.'
  cases=[
   ({'appId':'netflix'},playback,'TVLENS_PANEL_PLAYBACK_REQUIRED'),
   ({'connected':False},playback,'TVLENS_PANEL_PLAYBACK_REQUIRED'),
   ({'sink':'SUB'},playback,'TVLENS_PANEL_PLAYBACK_REQUIRED'),
   ({'sourceInput':dict(x=1,y=0,width=1920,height=1080)},crop,'TVLENS_PANEL_SOURCE_CROPPED'),
   ({'sourceInput':dict(x=0,y=0,width=1440,height=1080)},aspect,'TVLENS_PANEL_SOURCE_INVALID'),
   ({'sourceInput':None},source,'TVLENS_PANEL_SOURCE_INVALID'),
   ({'width':0},dimensions,'TVLENS_PANEL_SOURCE_INVALID'),
   ({'displayOutput':dict(x=252,y=0,width=3840,height=2160)},output,'TVLENS_PANEL_OUTPUT_INVALID'),
   ({'displayOutput':dict(x=0,y=1,width=3840,height=2160)},output,'TVLENS_PANEL_OUTPUT_INVALID'),
   ({'displayOutput':dict(x=0,y=0,width=0,height=2160)},output,'TVLENS_PANEL_OUTPUT_INVALID'),
   ({'displayOutput':dict(x=True,y=0,width=100,height=100)},output,'TVLENS_PANEL_OUTPUT_INVALID'),
   ({'displayOutput':{'width':1920}},output,'TVLENS_PANEL_OUTPUT_INVALID'),
   ({'displayOutput':None},output,'TVLENS_PANEL_OUTPUT_INVALID')]
  for video_fields,message,code in cases:
   with self.subTest(video_fields=video_fields):
    screen=Screen(self)
    screen.video_fields=video_fields
    self.assert_opening_refused(screen,message,code)

 def test_no_video_names_the_missing_playback_once(self):
  screen=Screen(self)
  screen.status_videos=[]
  self.assert_opening_refused(screen,'TVLens : lance une vidéo pour ouvrir le panneau.',
   'TVLENS_PANEL_PLAYBACK_REQUIRED')

 def test_notification_exception_is_logged_without_escaping_or_retrying(self):
  for error in (OSError('notification unavailable'),ValueError('invalid notification reply')):
   with self.subTest(error=error):
    screen=Screen(self)
    screen.video_fields={'connected':False}
    screen.toast_error=error
    self.assert_opening_refused(screen,'TVLens : lance une vidéo pour ouvrir le panneau.',
     'TVLENS_PANEL_PLAYBACK_REQUIRED')
    self.assertIn('TVLENS_PANEL_NOTIFICATION_FAILED',' '.join(str(call) for call in screen.log.call_args_list))

 def test_notification_service_refusal_is_logged_without_retrying(self):
  screen=Screen(self)
  screen.video_fields={'connected':False}
  screen.toast_reply={'returnValue':False,'errorText':'service refused'}
  self.assert_opening_refused(screen,'TVLens : lance une vidéo pour ouvrir le panneau.',
   'TVLENS_PANEL_PLAYBACK_REQUIRED')
  self.assertIn('TVLENS_PANEL_NOTIFICATION_FAILED',' '.join(str(call) for call in screen.log.call_args_list))

 def test_failed_notification_allows_the_next_button_press_to_open(self):
  screen=Screen(self)
  screen.video_fields={'connected':False}
  screen.toast_error=OSError('notification unavailable')
  self.assert_opening_refused(screen,'TVLens : lance une vidéo pour ouvrir le panneau.',
   'TVLENS_PANEL_PLAYBACK_REQUIRED')
  screen.video_fields={}
  screen.toast_error=None
  panel.main()
  self.assertEqual(len(screen.toasts),1)
  self.assertEqual([call[1]['id'] for call in screen.named('launch')],[panel.APP])
  self.assertEqual(screen.display,{'x':0,'y':0,'width':3840,'height':2160})

 def test_letterboxed_video_opens_publishes_geometry_and_restores_saved_output(self):
  screen=Screen(self)
  screen.display={'x':252,'y':0,'width':3336,'height':2160}
  screen.video_fields=dict(width=1668,height=1080,fullScreen=False,sourceInput=dict(x=0,y=0,width=1668,height=1080))
  try:
   panel.main()
  except ValueError as error:
   self.fail(f'Valid output refused: {error}')
  target={'x':0,'y':74,'width':1440,'height':932}
  saved={'x':126,'y':0,'width':1668,'height':1080}
  self.assertEqual([call[1]['id'] for call in screen.named('launch')],[panel.APP])
  self.assertEqual(screen.layouts[0],{'active':True,'mode':'chat','requestId':None,'video':target})
  windows=screen.named('setDisplayWindow')
  self.assertEqual([call[1]['displayOutput'] for call in windows],[target,saved])
  self.assertEqual(windows[-1][1]['appOutput'],saved)
  self.assertFalse(windows[-1][1]['fullScreen'])
  self.assertEqual(screen.display,{'x':252,'y':0,'width':3336,'height':2160})
  self.assertEqual(json.loads(screen.paths['LAYOUT_STATE'].read_text()),{'active':False,'mode':'chat'})

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
