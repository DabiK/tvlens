"""Ambient display, native side: supervisor, display gate, watchdog, local controller routes.

Simulation only: fake Luna keyed on the endpoint (answers in the real timing-mode shape), injected clock, a
temporary run directory, a fake /proc. Nothing here is a proof on the TV: docs/lg-ambient.md lists what the
native protocol must still establish.
"""
from concurrent.futures import ThreadPoolExecutor
import fcntl
import json
import os
from pathlib import Path
import signal
import subprocess
import sys
import tempfile
import threading
import time
import unittest
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from unittest.mock import patch
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'tv'))
import ambient
import luna
from controller import AmbientController, CaptureController, DeviceServer

APP=ambient.APP
FULL=dict(ambient.FULL_SCREEN)
SERVER0=1790000000000
LUNA_ALLOWED={'getStatus','getForegroundWindowInfo','closeByAppId','launch','createToast'}

class Clock:
 def __init__(self):self.now=1000.0
 def __call__(self):return self.now
 def sleep(self,seconds):self.now+=max(0,seconds)

class Done:
 def __init__(self,reply):self.reply=reply
 def result(self):return self.reply

class FakeLuna:
 """Dispatcher keyed on the endpoint. Every call is recorded with the simulated time and the gate as it was."""
 def __init__(self,clock,gate):
  self.clock,self.gate=clock,gate
  self.calls=[];self.windows=[];self.video={'sink':'MAIN','appId':'youtube.leanback.v4','connected':True,'context':'c1','displayOutput':dict(FULL)}
  self.launch_reply={'returnValue':True};self.appears=True;self.sticky=False;self.mute=set();self.toast=True;self.hook=None
 def real(self,value):
  # The TV answers on stderr, behind a timing prefix, sometimes on several lines: the real parser reads it.
  return luna.parse_reply('','timingServiceResponse: '+json.dumps(value,indent=1)+'\nTiming: 2ms')
 def record(self,endpoint,payload):
  name=endpoint.rsplit('/',1)[1]
  assert name in LUNA_ALLOWED,'The ambient display must never call '+endpoint
  self.calls.append({'name':name,'payload':payload,'at':self.clock.now,'gate':ambient.read_gate(self.gate).get('state')})
  if self.hook:self.hook(name,payload)
  return name
 def call(self,endpoint,payload):
  name=self.record(endpoint,payload)
  if name in self.mute:raise subprocess.TimeoutExpired('luna-send',5)
  if name=='getStatus':return self.real({'returnValue':True,'video':[dict(self.video)]})
  if name=='getForegroundWindowInfo':return self.real({'returnValue':True,'windows':[{'appId':app} for app in self.windows]})
  if name=='closeByAppId':
   if not self.sticky and payload['id'] in self.windows:self.windows.remove(payload['id'])
   return self.real({'returnValue':True})
  if name=='createToast':return self.real({'returnValue':self.toast})
  raise AssertionError(endpoint)
 def spawn(self,endpoint,payload):
  self.record(endpoint,payload)
  if self.launch_reply.get('returnValue') and self.appears and payload['id'] not in self.windows:self.windows.append(payload['id'])
  return Done(self.launch_reply)
 def named(self,name):return [call for call in self.calls if call['name']==name]

def card(seq,age_ms=500,sources=1,kind='verification',now_ms=SERVER0):
 return {'id':'lot-%d'%seq,'kind':kind,'label':'Sources consultées','seq':seq,'text':'Résultat sourcé numéro %d.'%seq,'claimIds':['claim-%d'%seq],
  'interval':{'startMs':60000,'endMs':68000},'sources':[{'url':'https://www.insee.fr/fr/statistiques/%d?x=1'%seq,'title':'Insee, série %d'%seq,'publisher':'Insee'}][:sources],'finishedAt':now_ms-age_ms}

class Rig:
 """A supervisor on a temporary run directory, with a live mapper relay and a running, gated capture."""
 def __init__(self,test,focus='relay',start=True,gated=True,shared=True,**config):
  self.temp=tempfile.TemporaryDirectory();test.addCleanup(self.temp.cleanup);self.root=Path(self.temp.name)
  for name in ('run','proc'):(self.root/name).mkdir()
  self.clock=Clock()
  self.paths=ambient.AmbientPaths(self.root/'run',panel_layout=self.root/'run'/'panel-layout.json',capture_report=self.root/'capture-report.json')
  self.luna=FakeLuna(self.clock,self.paths.gate)
  self.status=self.root/'mapper-status.json';self.mapper=True;self.feed=None;self.settings={};self.acks=True;self.shown=[]
  self.config=dict({'focus':focus,'mapperStatus':str(self.status)},**config)
  self.lock=ambient.take_lock(self.paths.lock);test.addCleanup(lambda:self.lock.closed or self.lock.close())
  self.tokens=('%032x'%n for n in range(1,10000))
  self.relay();self.keys()
  if gated is not None:self.capture(gate=1 if gated else 0)
  self.sup=ambient.Supervisor(self.luna,lambda:self.feed,clock=self.clock,sleep=self.clock.sleep,paths=self.paths,settings=lambda:self.settings,config=self.config,
   lock=self.lock,wall=lambda:SERVER0/1000+self.clock.now-1000,proc_root=str(self.root/'proc'),control='http://127.0.0.1:8788',token=lambda:next(self.tokens),pid=4242,shared=shared)
  test.addCleanup(lambda:self.sup.screen and self.sup.screen.close())
  if start:self.sup.start()
 # --- the world around the supervisor
 def relay(self,**more):self.status.write_text(json.dumps(dict({'active':True,'ambientRelay':2,'panelYield':1,'updatedMono':self.clock.now},**more)))
 def keys(self,down=None,last=0,seq=0,syn=0,started=0):
  self.paths.keys.write_text(json.dumps({'v':1,'pid':99,'startedMono':started,'seq':seq,'down':down or {},'lastEventMono':last,'synDropped':syn}))
 def capture(self,gate=1,gate_path=None,pid=777,running=True,**report):
  entry=self.root/'proc'/str(pid)
  if running:entry.mkdir(exist_ok=True);(entry/'cmdline').write_bytes(b'\0'.join([b'/usr/bin/python3',b'/media/developer/tvlens-companion/capture.py',b'--config',b'c',b'--report',str(self.paths.capture_report).encode()])+b'\0')
  elif entry.exists():(entry/'cmdline').unlink();entry.rmdir()
  self.paths.capture_report.write_text(json.dumps(dict({'gate':gate,'pid':pid,'gatePath':gate_path or str(self.paths.gate),'stopped':not running,'limits':{'seconds':21600,'idleSeconds':600}},**report)))
 def server_now(self):return SERVER0+int(round((self.clock.now-1000)*1000))
 def publish(self,*cards,session='s1',seq=None,signals=None,**more):
  data={'sessionId':session,'enabled':True,'accepting':True,'serverNowMs':self.server_now(),'activity':{'state':'listening','label':'Surveillance active','waiting':0,'late':False},
   'overlay':{'seq':seq if seq is not None else max([c['seq'] for c in cards] or [0]),'cards':list(cards)},'signals':signals or {'seq':0,'cards':[]},'storage':{'state':'ok'}}
  data.update(more);self.feed={'ok':True,'data':data,'at':self.clock.now}
 def fresh(self,seq,**more):return card(seq,now_ms=self.server_now(),**more)
 def seen(self,kind,seq,session='s1'):
  """The panel declares what it showed itself, and for which session: written by the real controller, on the clock the supervisor reads."""
  AmbientController(self.root/'connection.json',run_dir=self.paths.root,command=[sys.executable,'-c','pass'],clock=self.clock).seen(kind,seq,session)
 def gate(self):return ambient.read_gate(self.paths.gate)
 def state(self):return json.loads(self.paths.state.read_text())
 def launches(self):return [call['payload'] for call in self.luna.named('launch')]
 def screen_free(self):
  with open(self.paths.screen,'a') as probe:
   try:fcntl.flock(probe,fcntl.LOCK_EX|fcntl.LOCK_NB);return True
   except OSError:return False
 # --- time
 def page(self):
  """The page: once launched with valid parameters it asks for the right to paint, and paints on 200 only."""
  gate=self.gate();launches=self.launches()
  if self.acks and gate.get('state')=='armed' and launches and launches[-1]['params']['nonce']==gate['nonce']:
   self.paths.ack.write_text(json.dumps({'nonce':gate['nonce'],'atMono':self.clock.now}))
 def tick(self,seconds=.25,count=1):
  for _ in range(count):
   if self.mapper:self.relay()
   self.sup.step()
   last=self.sup.last_shown
   if last and (not self.shown or self.shown[-1] is not last):self.shown.append(last)
   self.page()
   self.clock.now=round(self.clock.now+seconds,6)
 def until(self,done,seconds=.25,limit=400):
  for _ in range(limit):
   if done():return
   self.tick(seconds)
  raise AssertionError('never reached: '+json.dumps(self.state()))
 def begin(self,*cards):
  """First reading of the session (nothing replayed), then the cards."""
  self.publish();self.tick()
  self.publish(*(cards or [self.fresh(1)]))
 def show(self,*cards):
  self.begin(*cards);self.until(lambda:self.gate().get('state')=='shown')
  return self.gate()['nonce']

class Profiles(unittest.TestCase):
 def test_shipped_default_is_off_and_changes_nothing_on_the_tv(self):
  self.assertEqual(ambient.load_config('/nonexistent/ambient.json'),ambient.DEFAULT_CONFIG)
  self.assertEqual((ambient.DEFAULT_CONFIG['focus'],ambient.DEFAULT_CONFIG['fallback']),('off','off'))
  for broken in ({'focus':'always'},{'focus':'relay','app':'org.tvlens.sidebarprobe'},[],'x'):
   config=ambient.clean_config(broken)
   self.assertEqual(config['app'],APP)
   self.assertEqual(config['focus'],'relay' if isinstance(broken,dict) and broken.get('app') else 'off')
  rig=Rig(self,focus='off');rig.publish();rig.tick()
  # Ten sourced results published while the panel is closed.
  for batch in ((1,2,3,4,5),(6,7,8,9,10)):
   rig.publish(*[rig.fresh(seq) for seq in batch]);rig.tick(count=8)
  rig.paths.test.write_text(json.dumps({'id':'t1','atMono':rig.clock.now}));rig.tick(count=120)
  state=rig.state()
  self.assertEqual(rig.luna.calls,[])                       # no launch, no close, not even a status read
  self.assertFalse(rig.paths.gate.exists())                 # the gate was never closed: frames stay whole
  self.assertFalse(rig.paths.screen.exists())               # the screen lock was never taken
  self.assertEqual((state['status'],state['reason'],state['focus'],state['mode']),('disabled','profile-off','off','off'))
  self.assertEqual(state['message'],'Affichage panneau fermé non activé sur cette TV : validation native requise.')
  self.assertEqual((state['counts']['notShown'],state['counts']['shown'],state['queue'],state['cursor']['overlay']),(10,0,0,10))
  # The end of a capture is told in the state (and by the panel), never announced on screen in this profile.
  rig.capture(running=False,stopReason='idle',stopMessage='10 min sans lecture YouTube : relance la capture quand la vidéo reprend.');rig.tick(count=44)
  self.assertEqual((rig.state()['capture']['active'],rig.state()['capture']['stopReason']),(False,'idle'))
  self.assertEqual(rig.luna.calls,[])

 def test_gate_inherited_closed_is_reopened_at_start_even_in_profile_off(self):
  rig=Rig(self,focus='off',start=False)
  rig.paths.gate.write_text(json.dumps({'v':2,'epoch':41,'state':'shown','nonce':'d'*32,'app':APP,'rect':{'x':36,'y':616,'width':784,'height':296},'shownMono':900.0,'pid':1}))
  rig.luna.windows.append(APP);rig.sup.start()
  self.assertEqual([c['name'] for c in rig.luna.calls],['getForegroundWindowInfo','closeByAppId','getForegroundWindowInfo','getForegroundWindowInfo'])
  self.assertEqual((rig.gate()['state'],rig.gate()['lastNonce'],rig.gate()['epoch']),('clear','d'*32,42))
  rig.luna.calls.clear();rig.publish();rig.tick(count=20)
  self.assertEqual((rig.luna.calls,rig.gate()['epoch']),([],42))

 def test_relay_card_closes_the_gate_before_the_launch_and_reopens_it_after_a_verified_close(self):
  rig=Rig(self);rig.acks=False;rig.begin();rig.tick()
  (launch,)=rig.luna.named('launch')
  gate=rig.gate()
  # Armed BEFORE the launch, with the box plus its margin, and the screen is held.
  self.assertEqual((launch['gate'],gate['state'],gate['rect'],gate['profile'],gate['element']),('armed','armed',{'x':36,'y':616,'width':784,'height':296},'relay','card'))
  self.assertFalse(rig.screen_free())
  params=launch['payload']['params']
  self.assertEqual((launch['payload']['id'],params['v'],params['nonce'],params['control'],params['element'],params['profile'],params['box'],params['displayMs']),
   (APP,1,gate['nonce'],'http://127.0.0.1:8788','card','relay',{'x':48,'y':628,'width':760,'height':272},14000))
  # Hosts only, never an address; the page gets no source URL to draw or to open.
  self.assertEqual(params['card']['sources'],[{'title':'Insee, série 1','host':'insee.fr'}])
  self.assertNotIn('http',json.dumps(params['card']))
  self.assertEqual((params['card']['id'],params['card']['kind'],params['card']['label'],params['card']['claimCount'],params['card']['more']),('lot-1','verification','Sources consultées',1,0))
  # No paint before the page asks: the gate stays armed, nothing counts as shown.
  rig.tick(count=4);self.assertEqual((rig.gate()['state'],rig.state()['counts']['shown'],rig.state()['status']),('armed',0,'arming'))
  rig.acks=True;rig.page();rig.tick()
  shown=rig.gate();granted=shown['shownMono']
  self.assertEqual((shown['state'],shown['nonce'],rig.state()['status'],rig.state()['counts']['shown']),('shown',gate['nonce'],'showing',1))
  # Displayed for the chosen time from the grant, renewed meanwhile, then closed.
  rig.until(lambda:rig.gate()['state']=='closing')
  self.assertAlmostEqual(rig.gate()['closingMono']-granted,14,delta=.26)
  closing=rig.clock.now
  rig.until(lambda:rig.gate()['state']=='clear')
  looks=[c for c in rig.luna.named('getForegroundWindowInfo') if c['at']>=closing-.26]
  self.assertEqual(rig.luna.named('closeByAppId')[-1]['gate'],'closing')
  # Reopened only after two absences in a row and the guard; every write moved the epoch.
  self.assertGreaterEqual(len(looks),2)
  self.assertGreaterEqual(rig.gate()['clearedMono']-looks[1]['at'],ambient.GUARD)
  self.assertEqual((rig.gate()['lastNonce'],rig.gate()['epoch']>shown['epoch']>gate['epoch']),(gate['nonce'],True))
  self.assertTrue(rig.screen_free())
  self.assertEqual(rig.state()['lastShown']['id'],'lot-1')
  # The ambient display never touches the video geometry and never launches the panel application.
  self.assertEqual({c['name'] for c in rig.luna.calls},{'getStatus','launch','getForegroundWindowInfo','closeByAppId'})
  self.assertNotIn('setDisplayWindow',(ROOT/'tv'/'ambient.py').read_text().replace('setDisplayWindow interdit',''))

 def test_window_still_listed_keeps_the_gate_closed_and_says_stuck(self):
  rig=Rig(self);rig.show();rig.luna.sticky=True
  rig.until(lambda:rig.gate()['state']=='closing')
  rig.tick(count=60)
  self.assertEqual((rig.gate()['state'],rig.state()['status'],rig.state()['reason'],rig.state()['sticky']),('closing','disabled','stuck-window','stuck-window'))
  self.assertFalse(rig.screen_free())
  # It finally leaves: the gate reopens, but a focus anomaly stays until an explicit restart.
  rig.luna.sticky=False;rig.until(lambda:rig.gate()['state']=='clear')
  rig.publish(rig.fresh(1),rig.fresh(2));rig.tick(count=200)
  self.assertEqual((len(rig.launches()),rig.state()['reason'],rig.state()['counts']['notShown']),(1,'stuck-window',1))

class Grant(unittest.TestCase):
 """The supervisor alone grants a paint; the controller only carries the question and answers 404 otherwise."""
 def setUp(self):
  self.rig=Rig(self);self.rig.acks=False
  self.control=AmbientController(self.rig.root/'connection.json',run_dir=self.rig.paths.root,command=[sys.executable,'-c','import time;time.sleep(60)'],clock=self.rig.clock)
  self.control.ack_wait=.4
  self.rig.begin();self.rig.tick()
  self.nonce=self.rig.gate()['nonce']
 def ask(self,seconds=.02):
  answer=[]
  thread=threading.Thread(target=lambda:answer.append(self.control.page_ack(self.nonce)));thread.start()
  while thread.is_alive():self.rig.tick(seconds);time.sleep(.005)
  return answer[0]
 def test_granted_when_nothing_happened_since_the_arming(self):
  self.assertEqual(self.ask(),{})
  self.assertEqual((self.rig.gate()['state'],self.rig.state()['counts']['shown']),('shown',1))
 def test_refused_cases(self):
  rig=self.rig;armed=rig.gate()['armedMono']
  cases={
   'relay intent notice (ack between the close and the end of the guard)':lambda:rig.paths.dismiss_relay.write_text(json.dumps({'nonce':self.nonce,'phase':'intent','atMono':rig.clock.now,'code':106})),
   'key event after the arming':lambda:rig.keys(last=rig.clock.now,seq=1),
   'key held':lambda:rig.keys(down={'115':rig.clock.now}),
   'panel layout active':lambda:rig.paths.panel_layout.write_text('{"active":true,"mode":"chat"}'),
   'panel notice':lambda:rig.paths.dismiss_panel.write_text(json.dumps({'atMono':rig.clock.now,'pid':5})),
   'request after five seconds':lambda:setattr(rig.clock,'now',armed+5.5),
   'gate already closing':lambda:rig.sup.close(rig.clock.now,'elapsed'),
  }
  for name,spoil in cases.items():
   with self.subTest(name):
    self.setUp();rig=self.rig
    spoil()
    self.assertIsNone(self.ask(.25))
    rig.until(lambda:rig.gate()['state']=='clear')
    self.assertEqual((rig.state()['counts']['shown'],rig.luna.named('launch')[0]['gate']),(0,'armed'))
    self.assertFalse(any(c['gate']=='shown' for c in rig.luna.calls))

class Arming(unittest.TestCase):
 def test_nothing_is_armed_while_the_remote_is_in_use_or_the_screen_is_taken(self):
  held=lambda rig:rig.keys(down={'115':rig.clock.now-1},last=rig.clock.now-1)
  cases={'key-held':held,'recent-key':lambda rig:rig.keys(last=rig.clock.now-3.5),
   'mapper just started':lambda rig:rig.keys(started=rig.clock.now-2)}
  for name,spoil in cases.items():
   with self.subTest(name):
    rig=Rig(self);spoil(rig);rig.begin();rig.tick(count=3)
    self.assertEqual((rig.launches(),rig.gate()['state'],rig.state()['status']),([],'absent','paused'))
    self.assertEqual(rig.state()['reason'],'recent-key' if name!='key-held' else 'key-held')
    self.assertEqual(rig.luna.calls,[])                    # file conditions come first: Luna is not even asked
  rig=Rig(self)
  with open(rig.paths.screen,'a') as panel:
   fcntl.flock(panel,fcntl.LOCK_EX|fcntl.LOCK_NB)
   rig.begin();rig.tick(count=4)
   self.assertEqual((rig.launches(),rig.gate()['state'],rig.state()['reason']),([],'absent','panel'))
  rig.until(lambda:rig.gate()['state']=='shown')         # the card waited: it shows once the screen is free again

 def test_blocking_reason_reads_the_files_first_and_asks_luna_last(self):
  rig=Rig(self,start=False);reason=lambda **more:ambient.blocking_reason(rig.luna,rig.paths,rig.clock,**more)
  self.assertEqual((reason()[0],reason()[1]['appId'],len(rig.luna.calls)),(None,'youtube.leanback.v4',2))
  rig.luna.calls.clear();rig.paths.panel_layout.write_text('{"active":true,"mode":"timeline"}')
  self.assertEqual(reason(),('panel',None))
  rig.paths.panel_layout.write_text('{"active":false,"mode":"chat"}');rig.paths.dismiss_panel.write_text(json.dumps({'atMono':rig.clock.now-9,'pid':3}))
  self.assertEqual(reason(),('panel',None))                 # the panel announced itself less than 10 s ago
  rig.paths.dismiss_panel.write_text(json.dumps({'atMono':rig.clock.now-11,'pid':3}))
  self.assertEqual(reason(panel_at=rig.clock.now-2),('panel',None))   # and it closed less than 3 s ago
  rig.keys(down={'28':rig.clock.now-1},last=rig.clock.now-1);self.assertEqual(reason(),('key-held',None))
  self.assertEqual(rig.luna.calls,[])
  self.assertIsNone(reason(keys=False)[0])                  # a toast takes no focus: keys do not defer it
  rig.keys();rig.luna.mute={'getStatus'};self.assertEqual(reason(),('luna-unavailable',None))

 def test_key_between_the_arming_and_the_launch_aborts_without_any_launch(self):
  rig=Rig(self);write=rig.sup.gate.write;states=[]
  def spy(state,**fields):
   record=write(state,**fields);states.append(state)
   # The mapper published this key before reading the gate; the supervisor reads the keys after writing it.
   if state=='armed' and len(states)==1:rig.keys(last=rig.clock.now,seq=1)
   return record
  rig.sup.gate.write=spy
  rig.begin();rig.tick()
  self.assertEqual((states,rig.launches(),rig.gate()['state']),(['armed','clear'],[],'clear'))
  self.assertEqual((rig.state()['queue'],rig.state()['reason'],rig.screen_free()),(1,'recent-key',True))
  # No launch was emitted, so no safety deadline: the gate reopened at once. The card shows later.
  rig.until(lambda:rig.gate()['state']=='shown')
  self.assertEqual(rig.state()['counts']['shown'],1)

 def test_missed_release_does_not_freeze_the_display(self):
  rig=Rig(self);rig.keys(down={'115':rig.clock.now-21},last=rig.clock.now-21);rig.begin()
  rig.until(lambda:rig.gate()['state']=='shown')
  self.assertEqual(rig.state()['counts']['staleKeyDown'],1)

 def test_conditions_of_the_screen(self):
  cases={'panel':lambda rig:rig.paths.panel_layout.write_text('{"active":true,"mode":"chat"}'),
   'foreign-app':lambda rig:rig.luna.video.update(appId='netflix'),
   'not-fullscreen':lambda rig:rig.luna.video.update(displayOutput={'x':0,'y':270,'width':2880,'height':1620})}
  for reason,spoil in cases.items():
   with self.subTest(reason):
    rig=Rig(self);spoil(rig);rig.begin();rig.tick(count=12)
    self.assertEqual((rig.launches(),rig.state()['status'],rig.state()['reason'],rig.state()['queue']),([],'paused',reason,1))

 def test_change_of_media_context_closes_the_card_at_the_next_check_and_waits_for_a_stable_one(self):
  rig=Rig(self);rig.show(rig.fresh(1),rig.fresh(2));shown=rig.gate()['shownMono']
  rig.tick(count=8);rig.luna.video['context']='advertisement';changed=rig.clock.now
  rig.until(lambda:rig.gate()['state']=='closing')
  self.assertLessEqual(rig.gate()['closingMono']-changed,1.25)   # not after the 14 s of display
  self.assertLess(rig.gate()['closingMono']-shown,5)
  rig.until(lambda:rig.gate()['state']=='clear');cleared=rig.clock.now
  rig.tick(count=20);self.assertEqual((len(rig.launches()),rig.state()['reason']),(1,'media-transition'))
  rig.until(lambda:len(rig.launches())==2)
  self.assertGreaterEqual(rig.clock.now-changed,ambient.CONTEXT_STABLE)

class Duration(unittest.TestCase):
 def test_display_time_follows_the_setting_and_is_capped_at_twenty_seconds(self):
  for setting,expected in ((8000,8),(20000,20),(999999,20),('x',14),(-5,14)):
   with self.subTest(setting=setting):
    rig=Rig(self);rig.settings={'displayMs':setting};rig.show();shown=rig.gate()['shownMono']
    rig.until(lambda:rig.gate()['state']=='closing')
    self.assertAlmostEqual(rig.gate()['closingMono']-shown,expected,delta=.26)
    self.assertEqual(rig.launches()[0]['params']['displayMs'],expected*1000)

 def test_launch_without_a_paint_request_is_closed_after_five_seconds_and_three_in_a_row_suspend_the_display(self):
  rig=Rig(self);rig.acks=False;rig.begin();rig.tick();armed=rig.gate()['armedMono']
  rig.until(lambda:rig.gate()['state']=='closing')
  self.assertAlmostEqual(rig.gate()['closingMono']-armed,5,delta=.26)
  rig.until(lambda:len(rig.launches())==3);rig.until(lambda:rig.gate()['state']=='clear')
  state=rig.state()
  self.assertEqual((state['counts']['unconfirmed'],state['counts']['shown'],state['status'],state['reason']),(3,0,'disabled','launch-unconfirmed'))
  # Transient: a bounded probation, not a permanent switch-off.
  self.assertEqual((state['probation']['strike'],state['probation']['max'],state['sticky']),(1,3,None))
  rig.tick(count=100);self.assertEqual(len(rig.launches()),3)
  rig.acks=True;rig.clock.now+=10;rig.until(lambda:rig.gate()['state']=='shown')
  self.assertEqual((rig.state()['counts']['shown'],rig.state()['probation']),(1,None))

class Ladder(unittest.TestCase):
 def test_transient_refusals_get_a_bounded_probation_then_stick(self):
  rig=Rig(self);rig.luna.launch_reply={'returnValue':False,'errorText':'not installed'};rig.luna.appears=False
  rig.begin(rig.fresh(1));delays=[]
  for strike in (1,2,3):
   rig.until(lambda:(rig.state().get('probation') or {}).get('strike')==strike)
   state=rig.state();delays.append(round(state['probation']['remainingMs']/1000))
   self.assertEqual((state['status'],state['reason'],state['message'][:11],state['sticky']),('disabled','app-missing','Application',None))
   tried=len(rig.launches());rig.tick(count=8)
   self.assertEqual(len(rig.launches()),tried)          # nothing is tried while the probation runs
   rig.clock.now+=delays[-1];rig.publish(rig.fresh(strike+1))   # it is over: a fresh result gets one more attempt
  rig.until(lambda:rig.state()['sticky']=='app-missing')
  self.assertEqual((len(rig.launches()),delays),(4,[30,120,600]))
  # After the last strike it sticks: no further launch, however long one waits.
  rig.publish(rig.fresh(9));rig.clock.now+=3600;rig.tick(count=40)
  self.assertEqual((len(rig.launches()),rig.state()['probation'],rig.state()['status'],rig.state()['reason']),(4,None,'disabled','app-missing'))
  self.assertGreaterEqual(rig.state()['counts']['notShown'],1)
  self.assertFalse(any(c['gate']=='shown' for c in rig.luna.calls))

 def test_no_relay_or_outdated_panel_launcher_shows_nothing(self):
  for reason,status in (('no-relay',None),('no-relay',{'ambientRelay':0}),('no-relay',{'active':False}),('panel-outdated',{'panelYield':0})):
   with self.subTest(reason=reason,status=status):
    rig=Rig(self);rig.mapper=False
    if status is None:rig.status.unlink()
    else:rig.relay(**status)
    rig.begin();rig.tick(count=4)
    self.assertEqual((rig.launches(),rig.gate()['state'],rig.state()['status'],rig.state()['reason']),([],'absent','disabled',reason))
  # A mapper that stopped writing its status is not a relay any more, whatever the wall clock says.
  rig=Rig(self);rig.mapper=False;rig.clock.now+=7;rig.begin();rig.tick(count=4)
  self.assertEqual((rig.launches(),rig.state()['reason']),([],'no-relay'))

 def test_key_received_by_the_page_is_a_focus_anomaly(self):
  # Granted page, relay profile: the relay failed. Sticky.
  rig=Rig(self);nonce=rig.show(rig.fresh(1),rig.fresh(2))
  rig.paths.pagekey.write_text(json.dumps({'nonce':nonce,'atMono':rig.clock.now}))
  rig.until(lambda:rig.gate()['state']=='clear');rig.clock.now+=7200;rig.tick(count=40)
  state=rig.state()
  self.assertEqual((state['status'],state['reason'],state['sticky'],state['counts']['keysLostToPage'],state['counts']['notShown'],len(rig.launches())),('disabled','relay-failed','relay-failed',1,1,1))
  # Page not granted yet (empty window in flight): a distinct reason, sticky as well.
  rig=Rig(self);rig.acks=False;rig.begin();rig.tick()
  rig.paths.pagekey.write_text(json.dumps({'nonce':rig.gate()['nonce'],'atMono':rig.clock.now}))
  rig.until(lambda:rig.gate()['state']=='clear')
  self.assertEqual((rig.state()['reason'],rig.state()['counts']['shown'],rig.state()['counts']['keysLostToPage']),('key-lost-at-launch',0,1))
  # Passthrough disproved: the supervisor falls back to the relay profile, for good.
  rig=Rig(self,focus='passthrough');nonce=rig.show(rig.fresh(1),rig.fresh(2))
  self.assertEqual(rig.launches()[0]['params']['profile'],'passthrough')
  rig.paths.pagekey.write_text(json.dumps({'nonce':nonce,'atMono':rig.clock.now}))
  rig.until(lambda:len(rig.launches())==2)
  state=rig.state()
  self.assertEqual((rig.launches()[1]['params']['profile'],state['focus'],state['configured'],state['focusViolation'],state['sticky']),('relay','relay','passthrough',True,None))

 def test_relay_outcomes_reported_by_the_mapper(self):
  # A clean dismissal by a key: counted, nothing disabled.
  rig=Rig(self);nonce=rig.show(rig.fresh(1),rig.fresh(2))
  rig.paths.dismiss_relay.write_text(json.dumps({'nonce':nonce,'phase':'done','atMono':rig.clock.now,'code':106,'closed':True,'failed':None}))
  rig.luna.windows.clear();rig.tick()
  self.assertEqual((rig.gate()['state'],rig.state()['counts']['dismissedByKey']),('closing',1))
  rig.until(lambda:rig.gate()['state']=='clear');self.assertIsNone(rig.state()['sticky'])
  # The relay says it failed: sticky.
  rig=Rig(self);nonce=rig.show()
  rig.paths.dismiss_relay.write_text(json.dumps({'nonce':nonce,'phase':'done','atMono':rig.clock.now,'code':106,'closed':False,'failed':'still-listed'}))
  rig.until(lambda:rig.gate()['state']=='clear')
  self.assertEqual((rig.state()['reason'],rig.state()['sticky']),('relay-failed','relay-failed'))
  # The kernel dropped events while the relay was holding a key: a loss is declared.
  rig=Rig(self);nonce=rig.show()
  rig.paths.dismiss_relay.write_text(json.dumps({'nonce':nonce,'phase':'done','atMono':rig.clock.now,'code':106,'closed':True,'failed':None}))
  rig.keys(syn=1,seq=3,last=rig.clock.now);rig.luna.windows.clear()
  rig.until(lambda:rig.gate()['state']=='clear')
  self.assertEqual((rig.state()['reason'],rig.state()['counts']['synDropped']),('relay-lossy',1))
  # Window gone without being asked, relay profile: not a proof of a clean hand-back.
  rig=Rig(self);rig.show();rig.tick(count=6);rig.luna.windows.clear()
  rig.until(lambda:rig.gate()['state']=='clear')
  self.assertEqual((rig.state()['reason'],rig.state()['counts']['closedUnexpectedly']),('relay-failed',1))

 def test_anomaly_reported_after_the_gate_reopened_still_counts(self):
  # The relay announced the first key, the supervisor closed and reopened; only then does the relay say it failed.
  rig=Rig(self);nonce=rig.show()
  rig.paths.dismiss_relay.write_text(json.dumps({'nonce':nonce,'phase':'intent','atMono':rig.clock.now,'code':106}))
  rig.luna.windows.clear();rig.until(lambda:rig.gate()['state']=='clear')
  self.assertEqual((rig.state()['sticky'],rig.state()['counts']['dismissedByKey']),(None,1))
  rig.paths.dismiss_relay.write_text(json.dumps({'nonce':nonce,'phase':'done','atMono':rig.clock.now,'code':106,'closed':False,'failed':'budget'}))
  rig.tick(count=2)
  self.assertEqual((rig.state()['sticky'],rig.state()['status'],rig.state()['reason']),('relay-failed','disabled','relay-failed'))
  # A page that was never granted reports its key while it closes, after the gate has reopened.
  rig=Rig(self);rig.acks=False;rig.begin();rig.tick();nonce=rig.gate()['nonce']
  rig.keys(last=rig.clock.now,seq=1);rig.until(lambda:rig.gate()['state']=='clear')
  self.assertIsNone(rig.state()['sticky'])
  rig.paths.pagekey.write_text(json.dumps({'nonce':nonce,'atMono':rig.clock.now}));rig.tick(count=2)
  self.assertEqual((rig.state()['sticky'],rig.state()['counts']['keysLostToPage'],rig.state()['counts']['shown']),('key-lost-at-launch',1,0))

 def test_cutting_the_alerts_closes_the_card_and_the_surveillance_goes_on_being_counted(self):
  rig=Rig(self);rig.show(rig.fresh(1),rig.fresh(2));rig.settings={'alerts':False};rig.tick()
  self.assertEqual(rig.gate()['state'],'closing')
  rig.until(lambda:rig.gate()['state']=='clear');rig.publish(rig.fresh(1),rig.fresh(2),rig.fresh(3));rig.tick(count=40)
  state=rig.state()
  self.assertEqual((state['status'],state['reason'],state['counts']['shown'],state['counts']['notShown'],len(rig.launches())),('disabled','alerts-off',1,2,1))
  self.assertIn('la surveillance continue',state['message'])

 def test_toast_fallback_never_carries_the_result_and_closes_the_gate_without_a_rectangle(self):
  rig=Rig(self,focus='off',fallback='toast');rig.begin(rig.fresh(1),rig.fresh(2));rig.tick()
  (toast,)=rig.luna.named('createToast')
  self.assertEqual(toast['payload'],{'sourceId':'tvlens','message':'TV Lens · résultat sourcé disponible · Rakuten'})
  self.assertLessEqual(len(toast['payload']['message']),60)
  self.assertEqual((toast['gate'],rig.gate()['state'],rig.gate()['rect']),('armed','shown',None))
  shown=rig.gate()['shownMono'];rig.until(lambda:rig.gate()['state']=='clear')
  self.assertAlmostEqual(rig.gate()['clearedMono']-shown,8,delta=.26)
  state=rig.state()
  # Neither result was shown: one toast announced them, and each is counted as not shown.
  self.assertEqual((state['counts']['toasts'],state['counts']['notShown'],state['counts']['shown'],state['mode'],rig.launches()),(1,2,0,'toast',[]))
  rig.publish(rig.fresh(3),seq=3);rig.tick(count=40);self.assertEqual(len(rig.luna.named('createToast')),1)   # one a minute at most
  # A refused toast is the last rung: display off, explicit state.
  rig=Rig(self,focus='off',fallback='toast');rig.luna.toast=False;rig.begin();rig.tick(count=4)
  self.assertEqual((rig.gate()['state'],rig.state()['mode'],rig.state()['status'],rig.state()['reason']),('clear','off','disabled','profile-off'))

class Activity(unittest.TestCase):
 VERIFYING={'state':'verifying','label':'Vérification en cours…','waiting':2,'late':False}
 LISTENING={'state':'listening','label':'Surveillance active','waiting':0,'late':False}
 def test_relay_only_flashes_a_pill_or_it_would_hold_the_focus_and_the_gate(self):
  rig=Rig(self);rig.publish();rig.tick()
  rig.publish(activity=self.VERIFYING);rig.until(lambda:rig.gate().get('state')=='shown')
  params=rig.launches()[0]['params'];shown=rig.gate()['shownMono']
  self.assertEqual((params['element'],params['box'],params['displayMs'],params['activity'],'card' in params),('pill',{'x':48,'y':844,'width':440,'height':56},4000,{'label':'Vérification en cours…','waiting':2,'late':False},False))
  self.assertEqual((rig.gate()['element'],rig.gate()['rect']),('pill',{'x':36,'y':832,'width':464,'height':80}))
  rig.until(lambda:rig.gate()['state']=='closing');self.assertAlmostEqual(rig.gate()['closingMono']-shown,4,delta=.26)
  rig.until(lambda:rig.gate()['state']=='clear')
  self.assertEqual((rig.state()['counts']['pills'],rig.state()['counts']['shown']),(1,0))
  # At most one every 90 s, however often the verification restarts...
  for _ in range(3):
   rig.publish(activity=self.LISTENING);rig.tick(count=4);rig.publish(activity=self.VERIFYING);rig.tick(count=40)
  self.assertEqual(len(rig.launches()),1)
  # ...and once when the surveillance turns late.
  rig.publish(activity={'state':'late','label':'Surveillance en retard.','waiting':5,'late':True});rig.until(lambda:len(rig.launches())==2)
  self.assertEqual(rig.launches()[1]['params']['activity']['late'],True)
  # The viewer's setting cuts it.
  rig=Rig(self);rig.settings={'activity':False};rig.publish();rig.tick();rig.publish(activity=self.VERIFYING);rig.tick(count=40)
  self.assertEqual((rig.launches(),rig.state()['status']),([],'idle'))

 def test_passthrough_keeps_the_pill_while_something_runs_and_gives_way_to_a_card(self):
  rig=Rig(self,focus='passthrough');rig.publish();rig.tick()
  rig.publish(activity=self.VERIFYING);rig.until(lambda:rig.gate().get('state')=='shown')
  pill=rig.launches()[0]['params'];shown=rig.gate()['shownMono']
  self.assertEqual((pill['element'],pill['profile'],pill['displayMs']),('pill','passthrough',20000))
  rig.tick(count=24);renewed=rig.gate()
  self.assertEqual((renewed['state'],renewed['renewedMono']>shown),('shown',True))    # a long display keeps saying it is alive
  rig.publish(rig.fresh(1),activity=self.VERIFYING);rig.tick(count=2)
  self.assertEqual(rig.gate()['state'],'closing')            # a result is worth more than the pill
  rig.until(lambda:len(rig.launches())==2 and rig.gate()['state']=='shown')
  self.assertEqual((rig.launches()[1]['params']['element'],rig.launches()[1]['params']['card']['id']),('card','lot-1'))
  # Back to listening: the pill that came back after the card leaves at the next turn.
  rig.until(lambda:len(rig.launches())==3 and rig.gate()['state']=='shown',limit=600)
  rig.publish(rig.fresh(1),activity=self.LISTENING);rig.tick(count=2)
  self.assertEqual(rig.gate()['state'],'closing')

 def test_clock_not_shared_between_processes_arms_nothing(self):
  rig=Rig(self,shared=False);rig.begin();rig.tick(count=20)
  self.assertEqual((rig.launches(),rig.gate()['state'],rig.state()['status'],rig.state()['reason'],rig.state()['counts']['notShown']),([],'absent','disabled','clock-unshared',1))

class Queue(unittest.TestCase):
 """The cases shared with the application: one file, read by both suites."""
 FIXTURE=ROOT/'tests'/'fixtures'/'tv-overlay-queue-cases.json'
 def setUp(self):
  self.fixture=json.loads(self.FIXTURE.read_text());self.cases=self.fixture['cases']
  # The cases this side must not lose: a declaration bound to its session, a restored history that is not news.
  self.assertLessEqual({'seen-then-new-session','restored-history-is-not-news'},{case['name'] for case in self.cases})
 def test_shared_cases_exactly_on_the_queue_with_the_zero_latency_model(self):
  for case in self.cases:
   with self.subTest(case['name']):
    options=dict(self.fixture['defaults'],**case.get('options',{}))
    queue=ambient.AmbientQueue(limit=options['maxQueue'],fresh_ms=options['staleMs'])
    display=ambient.clean_settings({'displayMs':options['displayMs']})['displayMs']
    shown=[];current=None;paused=False;free_at=float('-inf');points={}
    for t in range(0,case['untilMs']+1,options['tickMs']):
     for step in case['steps']:
      if step['atMs']!=t:continue
      if step['op']=='feed':queue.ingest(step['feed'],t/1000)
      elif step['op']=='pause':paused=step['value']
      elif step['op']=='seen':queue.seen('overlay',step.get('sessionId',queue.session),step['seq'],t/1000)
     if current and t>=current['fromMs']+display:current['toMs']=t;current=None;free_at=t+options['gapMs']
     if not current and not paused and t>=free_at:
      item=queue.head(t/1000)
      if item:queue.take(item);current={'id':item['card']['id'],'fromMs':t};shown.append(current)
     points[t]={'atMs':t,'card':current and current['id'],'queue':len(queue.items)}
    expect=case['expect']
    self.assertEqual(shown,expect['shown'])
    self.assertEqual(dict({k:queue.counts[k] for k in expect['counts'] if k!='shown'},shown=len(shown)),expect['counts'])
    self.assertEqual((queue.cursor['overlay'],len(queue.items)),(expect['cursor'],expect['queue']))
    for point in case.get('checkpoints') or []:self.assertEqual(points[point['atMs']],point)

 def test_shared_cases_through_the_supervisor_with_its_launch_latency(self):
  # With a launch latency only the order, the counters, the cursor and what is left are compared.
  for case in self.cases:
   with self.subTest(case['name']):
    options=dict(self.fixture['defaults'],**case.get('options',{}))
    rig=Rig(self);rig.settings={'displayMs':options['displayMs']};base=rig.clock.now
    for t in range(0,case['untilMs']+1,options['tickMs']):
     rig.clock.now=base+t/1000
     for step in case['steps']:
      if step['atMs']!=t:continue
      if step['op']=='feed':rig.feed={'ok':True,'data':step['feed'],'at':rig.clock.now}
      elif step['op']=='pause':rig.luna.video['appId']='netflix' if step['value'] else 'youtube.leanback.v4'
      elif step['op']=='seen':rig.seen('overlay',step['seq'],step.get('sessionId',rig.feed['data']['sessionId']))
     rig.tick(0)
    state=rig.state();expect=case['expect']
    self.assertEqual([shown['id'] for shown in rig.shown],[shown['id'] for shown in expect['shown']])
    self.assertEqual({k:state['counts'][k] for k in expect['counts']},expect['counts'])
    self.assertEqual((state['cursor']['overlay'],state['queue']),(expect['cursor'],expect['queue']))

 def test_signals_are_never_displayed_only_counted_for_the_panel(self):
  rig=Rig(self);rig.publish();rig.tick()
  signal_card=dict(rig.fresh(1,sources=0,kind='signal'),label='Repéré dans la vidéo')
  rig.publish(signals={'seq':3,'cards':[signal_card]});rig.tick(count=40)
  self.assertEqual((rig.launches(),rig.luna.calls,rig.state()['signalsInPanel'],rig.state()['status']),([],[],3,'idle'))
  rig.seen('signals',3);rig.tick()
  self.assertEqual(rig.state()['signalsInPanel'],0)

class Declared(unittest.TestCase):
 """What the panel says it showed itself names its session: it is heard for the session being read, no other."""
 def arrive(self,rig,focus):
  """Three sourced results of session s2, whose numbering started over: none may vanish."""
  rig.publish(*[rig.fresh(seq) for seq in (1,2,3)],session='s2')
  if focus=='off':rig.tick(count=8)
  else:rig.until(lambda:rig.state()['counts']['shown']==3,limit=600)
  state=rig.state()
  self.assertEqual((state['counts']['notShown'],state['counts']['shown'],[shown['id'] for shown in rig.shown],state['cursor']['overlay']),
   (3,0,[],3) if focus=='off' else (0,3,['lot-1','lot-2','lot-3'],3))
  self.assertEqual((state['counts']['skippedOverflow'],state['counts']['skippedStale'],state['sessionId']),(0,0,'s2'))

 def test_seen_a9_then_session_b_from_zero_and_a_late_word_of_a_during_b_hides_no_card_of_b(self):
  for focus in ('off','relay'):
   with self.subTest(focus=focus):
    rig=Rig(self,focus=focus);rig.publish(session='s1',seq=7);rig.tick()
    rig.seen('overlay',9,'s1');rig.publish(session='s1',seq=9);rig.tick(count=2)
    self.assertEqual(rig.state()['cursor']['overlay'],9)            # believed for the session it names
    rig.publish(session='s2');rig.tick(count=2)
    self.assertEqual((rig.state()['sessionId'],rig.state()['cursor']['overlay']),('s2',0))
    # The panel of s1 answers late, while s2 is read, with numbers s2 reaches before this reader asks again:
    # no time can tell them apart, only the session they name.
    rig.seen('overlay',9,'s1');rig.tick();rig.seen('overlay',2,'s1');rig.tick()
    self.assertEqual(rig.state()['cursor']['overlay'],0)
    self.arrive(rig,focus)
    # Both records are kept, each under its session: the late word did not erase what s2 may declare.
    rig.seen('overlay',3,'s2')
    self.assertEqual({key:record['overlay'] for key,record in json.loads(rig.paths.seen.read_text())['sessions'].items()},{'s1':2,'s2':3})

 def test_declaration_of_an_earlier_session_or_of_none_never_hides_the_results_of_the_next_one(self):
  def left_in_the_file(rig):
   # Session s1 is over and its supervisor gone; the file stays. A new supervisor reads session s2.
   rig.seen('overlay',9,'s1');rig.clock.now+=600;rig.sup.start();rig.publish(session='s2');rig.tick()
  def same_supervisor(rig):
   rig.sup.start();rig.publish(session='s1',seq=7);rig.tick()
   rig.seen('overlay',9,'s1');rig.publish(session='s1',seq=9);rig.tick(count=2)
   self.assertEqual(rig.state()['cursor']['overlay'],9)
   rig.publish(session='s2');rig.tick(count=2)
  def panel_late(rig):
   # The supervisor already reads s2; a panel still on s1 declares one last card of s1.
   rig.sup.start();rig.publish(session='s2');rig.tick();rig.seen('overlay',2,'s1');rig.tick()
  def without_session(rig):
   # The route of an earlier panel: the controller answers and writes nothing at all.
   rig.sup.start();rig.publish(session='s2');rig.tick();rig.seen('overlay',2,None);rig.tick()
   self.assertFalse(rig.paths.seen.exists())
  def older_file(rig):
   # A file of an earlier controller (a number, no session) cannot be linked to any session.
   rig.paths.seen.write_text(json.dumps({'overlay':9,'atMono':{'overlay':rig.clock.now}}));rig.sup.start();rig.publish(session='s2');rig.tick()
  def numbering_started_over(rig):
   # Same session, but its registry started over on the server (not restored): an old word is still not believed.
   rig.seen('overlay',9,'s2');rig.clock.now+=600;rig.sup.start();rig.publish(session='s2');rig.tick()
  for focus in ('off','relay'):
   for before in (left_in_the_file,same_supervisor,panel_late,without_session,older_file,numbering_started_over):
    with self.subTest(focus=focus,case=before.__name__):
     rig=Rig(self,focus=focus,start=False);before(rig)
     self.assertEqual(rig.state()['cursor']['overlay'],0)   # never ahead of the server's own numbering
     self.arrive(rig,focus)

 def test_declaration_of_the_session_being_read_is_believed_whichever_screen_read_the_server_first(self):
  # Profile off, the panel ahead of this reader: what it showed is not counted as "not shown", the rest is.
  rig=Rig(self,focus='off');rig.publish();rig.tick()
  rig.seen('overlay',2);rig.tick()
  self.assertEqual(rig.state()['cursor']['overlay'],0)       # it waits for the server to publish that far
  rig.publish(*[rig.fresh(seq) for seq in (1,2,3)]);rig.tick()
  self.assertEqual((rig.state()['counts']['notShown'],rig.state()['cursor']['overlay']),(1,3))
  # A lower number said later in the same session moves nothing back.
  rig.seen('overlay',1);rig.publish(*[rig.fresh(seq) for seq in (1,2,3,4)]);rig.tick()
  self.assertEqual((rig.state()['counts']['notShown'],rig.state()['cursor']['overlay']),(2,4))
  # Relay, the panel behind this reader: the cards already waiting here are dropped, neither replayed nor counted.
  rig=Rig(self);rig.publish();rig.tick();rig.paths.panel_layout.write_text('{"active":true,"mode":"chat"}')
  rig.publish(*[rig.fresh(seq) for seq in (1,2,3)]);rig.tick(count=4)
  self.assertEqual((rig.state()['queue'],rig.state()['reason'],rig.launches()),(3,'panel',[]))
  rig.seen('overlay',2);rig.tick()
  self.assertEqual(rig.state()['queue'],1)
  rig.paths.panel_layout.write_text('{"active":false,"mode":"chat"}')
  rig.until(lambda:rig.state()['counts']['shown']==1);rig.until(lambda:rig.gate()['state']=='clear');rig.tick(count=80)
  state=rig.state()
  self.assertEqual(([launch['params']['card']['id'] for launch in rig.launches()],state['counts']['shown'],state['counts']['notShown'],state['queue']),(['lot-3'],1,0,0))
  # Without a clock common to the controller and the supervisor the time of a declaration means nothing:
  # it is not believed, and what the panel showed is counted rather than risked.
  rig=Rig(self,focus='off',shared=False);rig.publish();rig.tick();rig.seen('overlay',2)
  rig.publish(*[rig.fresh(seq) for seq in (1,2,3)]);rig.tick()
  self.assertEqual((rig.state()['counts']['notShown'],rig.state()['cursor']['overlay']),(3,3))

 def test_history_restored_by_the_server_is_not_news_and_what_waited_is_counted(self):
  restoring={'state':'restoring','label':'Restauration du suivi enregistré…','waiting':0,'late':False}
  for focus in ('off','relay'):
   with self.subTest(focus=focus):
    # The surveillance is activated on a session whose saved registry holds seven results: 0, then 7 once read.
    rig=Rig(self,focus=focus);rig.publish();rig.tick()
    rig.publish(activity=restoring);rig.tick(count=2)
    rig.publish(*[rig.fresh(seq) for seq in (5,6,7)],seq=7);rig.tick(count=8)
    state=rig.state()
    self.assertEqual((state['cursor']['overlay'],state['queue'],state['counts']['notShown'],state['counts']['skippedOverflow'],rig.launches()),(7,0,0,0,[]))
    rig.publish(*[rig.fresh(seq) for seq in (6,7,8)],seq=8)
    if focus=='off':rig.tick(count=4)
    else:rig.until(lambda:rig.state()['counts']['shown']==1)
    state=rig.state()
    self.assertEqual((state['cursor']['overlay'],state['counts']['notShown'],state['counts']['shown'],[shown['id'] for shown in rig.shown]),(8,1,0,[]) if focus=='off' else (8,0,1,['lot-8']))
  # A card still waiting when the registry is replaced under the same session is counted, never dropped in silence.
  rig=Rig(self);rig.publish();rig.tick();rig.paths.panel_layout.write_text('{"active":true,"mode":"chat"}')
  rig.publish(rig.fresh(1));rig.tick(count=4);self.assertEqual(rig.state()['queue'],1)
  rig.publish(activity=restoring);rig.tick(count=2)
  self.assertEqual((rig.state()['queue'],rig.state()['counts']['notShown'],rig.launches()),(0,1,[]))

class Watchdog(unittest.TestCase):
 def gate(self,rig,state='shown',nonce='e'*32,**more):
  record=dict({'v':2,'epoch':17,'state':state,'nonce':nonce,'app':APP,'rect':{'x':36,'y':616,'width':784,'height':296},'armedMono':rig.clock.now-3,'shownMono':rig.clock.now-2,'pid':4242},**more)
  rig.paths.gate.write_text(json.dumps(record));return record
 def beat(self,rig,age):rig.paths.beat.write_text(json.dumps({'generation':'g1','mono':rig.clock.now-age,'pid':4242}))
 def rig(self):
  rig=Rig(self,start=False);rig.paths.generation.write_text('g1');rig.luna.windows.append(APP);return rig
 def watch(self,rig,**more):
  kills=[]
  outcome=ambient.watchdog('g1',rig.paths,rig.luna,rig.clock,rig.clock.sleep,kill=lambda pid,sig:kills.append((pid,sig)),proc_root=str(rig.root/'proc'),rounds=1,**more)
  return outcome,kills

 def test_owner_alive_but_mute_closes_the_window_and_never_writes_the_gate(self):
  rig=self.rig();self.gate(rig);before=rig.paths.gate.read_bytes()
  self.beat(rig,14);self.assertEqual(self.watch(rig),('wait',[]));self.assertEqual(rig.luna.calls,[])
  self.beat(rig,16);self.assertEqual(self.watch(rig),('wait',[]))
  self.assertEqual([(c['name'],c['payload']) for c in rig.luna.calls],[('closeByAppId',{'id':APP})])
  # The lock is held: the supervisor lives, the gate is his. Frames stay cropped.
  self.assertEqual(rig.paths.gate.read_bytes(),before)
  # Mute for 45 s: killed only if the process is an ambient supervisor, checked on its command line.
  self.beat(rig,46);self.assertEqual(self.watch(rig)[1],[])
  entry=rig.root/'proc'/'4242';entry.mkdir();(entry/'cmdline').write_bytes(b'/usr/bin/python3\0/media/developer/tvlens-companion/ambient.py\0--config\0c\0')
  self.assertEqual(self.watch(rig)[1],[(4242,signal.SIGTERM),(4242,signal.SIGKILL)])
  self.assertEqual(rig.paths.gate.read_bytes(),before)

 def test_owner_dead_recovers_closes_checks_and_only_then_reopens(self):
  rig=self.rig();record=self.gate(rig);self.beat(rig,1);rig.lock.close()
  outcome,_=self.watch(rig)
  self.assertEqual(outcome,'cleared')
  # Seen, closed, then absent twice in a row; the gate stayed closed through all of it.
  self.assertEqual([c['name'] for c in rig.luna.calls],['getForegroundWindowInfo','closeByAppId','getForegroundWindowInfo','getForegroundWindowInfo'])
  self.assertTrue(all(c['gate']=='shown' for c in rig.luna.calls))
  gate=rig.gate()
  self.assertEqual((gate['state'],gate['lastNonce'],gate['epoch'],gate['recovered']),('clear',record['nonce'],18,True))
  # The watchdog gave the lock back: a new supervisor can start.
  lock=ambient.take_lock(rig.paths.lock);self.assertIsNotNone(lock);lock.close()

 def test_window_never_seen_waits_out_the_life_a_page_allows_itself(self):
  rig=self.rig();rig.luna.windows.clear();self.gate(rig);self.beat(rig,1);rig.lock.close();started=rig.clock.now
  self.assertEqual(self.watch(rig)[0],'cleared')
  # A granted page nobody saw listed may still be on its way: shownMono + 21.5 s, not earlier.
  self.assertGreaterEqual(rig.clock.now,started-2+ambient.PAGE_LIFE)
  rig=self.rig();rig.luna.sticky=True;self.gate(rig);self.beat(rig,1);rig.lock.close()
  self.assertEqual(self.watch(rig)[0],'stuck')
  self.assertEqual(rig.gate()['state'],'shown')              # still listed: never reopened on a guess

 def test_gate_changed_between_the_decision_and_the_write_is_left_alone(self):
  rig=self.rig();self.gate(rig);self.beat(rig,1);rig.lock.close()
  other={'v':2,'epoch':18,'state':'armed','nonce':'f'*32,'app':APP,'rect':None,'armedMono':rig.clock.now,'pid':9}
  def hook(name,payload):
   if name=='getForegroundWindowInfo':rig.paths.gate.write_text(json.dumps(other))
  rig.luna.hook=hook
  self.assertEqual(self.watch(rig)[0],'changed')
  self.assertEqual(json.loads(rig.paths.gate.read_text()),other)

 def test_clock_jump_and_other_generation_trigger_nothing(self):
  rig=self.rig();self.gate(rig);before=rig.paths.gate.read_bytes();self.beat(rig,2)
  # Wall time one hour ahead, beat file dated one hour ago: only the monotonic age counts.
  os.utime(rig.paths.beat,(time.time()-3600,time.time()-3600))
  with patch.object(ambient.time,'time',return_value=time.time()+3600):self.assertEqual(self.watch(rig),('wait',[]))
  self.assertEqual((rig.luna.calls,rig.paths.gate.read_bytes()),([],before))
  self.assertEqual(ambient.recovery_decision(False,{'generation':'g1','mono':100.0},'g1',114.9),'wait')
  self.assertEqual(ambient.recovery_decision(False,{'generation':'g1','mono':100.0},'g1',115.1),'close')
  self.assertEqual(ambient.recovery_decision(False,{'generation':'g1','mono':100.0},'g1',145.1),'kill')
  self.assertEqual(ambient.recovery_decision(True,{'generation':'g1','mono':100.0},'g1',100.5),'recover')
  self.assertEqual(ambient.recovery_decision(False,{'generation':'g1'},'g1',1e9),'wait')
  # Another generation owns the display: this watchdog leaves without a call, lock free or not.
  rig.paths.generation.write_text('g2');self.beat(rig,60);rig.lock.close()
  self.assertEqual(self.watch(rig),('exit',[]))
  self.assertEqual((rig.luna.calls,rig.paths.gate.read_bytes()),([],before))

 def test_gate_is_only_written_under_the_owner_lock(self):
  rig=self.rig();self.gate(rig);before=rig.paths.gate.read_bytes()
  with self.assertRaises(RuntimeError):ambient.GateWriter(rig.paths,None)
  rig.lock.close()
  with self.assertRaises(RuntimeError):ambient.recover(rig.luna,rig.paths,rig.lock,rig.clock,rig.clock.sleep)
  self.assertEqual((rig.paths.gate.read_bytes(),rig.luna.calls),(before,[]))

 def test_owner_lock_is_not_inherited_by_the_children_of_a_dead_supervisor(self):
  with tempfile.TemporaryDirectory() as temp:
   script=('import os,sys;sys.path.insert(0,%r);import ambient\n'
    'paths=ambient.AmbientPaths(%r);lock=ambient.take_lock(paths.lock)\n'
    'child=ambient.spawn_detached([sys.executable,"-c","import time;time.sleep(30)"])\n'
    'print(child.pid,flush=True);os._exit(0)\n')%(str(ROOT/'tv'),temp)
   done=subprocess.run([sys.executable,'-c',script],capture_output=True,timeout=20)
   child=int(done.stdout)
   try:
    os.kill(child,0)                                         # the child outlives the supervisor...
    lock=ambient.take_lock(ambient.AmbientPaths(temp).lock)  # ...and does not hold its lock
    self.assertIsNotNone(lock);lock.close()
   finally:os.kill(child,signal.SIGKILL)

class Reconciliation(unittest.TestCase):
 def test_controller_asks_for_a_recovery_when_its_child_is_gone_and_the_gate_is_not_clear(self):
  with tempfile.TemporaryDirectory() as temp:
   root=Path(temp);(root/'run').mkdir();marker=root/'recovered'
   control=AmbientController(root/'connection.json',run_dir=root/'run',command=[sys.executable,'-c','pass'],recover=[sys.executable,'-c','import os;open(%r,"a").write(os.environ["TVLENS_AMBIENT_RUN"])'%str(marker)])
   gate=control.paths.gate
   self.assertFalse(control.reconcile())                    # no gate: nothing to do
   gate.write_text(json.dumps({'v':2,'epoch':3,'state':'clear','pid':1}));self.assertFalse(control.reconcile())
   gate.write_text(json.dumps({'v':2,'epoch':4,'state':'shown','nonce':'a'*32,'app':APP,'rect':None,'pid':1}));before=gate.read_bytes()
   self.assertTrue(control.reconcile());control.recovering.wait(timeout=10)
   self.assertEqual(marker.read_text(),str(root/'run'))
   self.assertFalse(control.reconcile())                    # asked again later, never in a tight loop
   # The controller itself never writes the gate and never calls Luna.
   self.assertEqual(gate.read_bytes(),before)
   source=(ROOT/'tv'/'controller.py').read_text()
   self.assertNotIn('GateWriter',source);self.assertNotIn('luna',source.lower().replace('luna itself','').replace('calls luna','').replace('call luna',''))

 def test_recover_entry_reopens_the_gate_through_the_real_command_line(self):
  with tempfile.TemporaryDirectory() as temp:
   root=Path(temp);(root/'run').mkdir();(root/'luna').mkdir()
   gate=root/'run'/'tvlens-ambient-gate.json'
   gate.write_text(json.dumps({'v':2,'epoch':8,'state':'shown','nonce':'c'*32,'app':APP,'rect':{'x':36,'y':616,'width':784,'height':296},'shownMono':time.monotonic()-60,'pid':1}))
   (root/'luna'/'windows.json').write_text(json.dumps([APP]))
   env=dict(os.environ,PATH=str(ROOT/'tests'/'tv_fakes')+os.pathsep+os.environ['PATH'],TVLENS_FAKE_LUNA=str(root/'luna'),TVLENS_AMBIENT_RUN=str(root/'run'))
   done=subprocess.run([sys.executable,str(ROOT/'tv'/'ambient.py'),'recover'],env=env,capture_output=True,timeout=30)
   self.assertEqual(done.returncode,0,done.stderr.decode())
   calls=[json.loads(line)['endpoint'].rsplit('/',1)[1] for line in (root/'luna'/'calls.jsonl').read_text().splitlines()]
   self.assertEqual(calls,['getForegroundWindowInfo','closeByAppId','getForegroundWindowInfo','getForegroundWindowInfo'])
   self.assertEqual((ambient.read_gate(gate)['state'],ambient.read_gate(gate)['epoch']),('clear',9))
   # With a live owner the entry does nothing at all.
   gate.write_text(json.dumps({'v':2,'epoch':10,'state':'armed','nonce':'c'*32,'app':APP,'rect':None,'pid':1}));before=gate.read_bytes()
   owner=ambient.take_lock(root/'run'/'tvlens-ambient.lock')
   try:subprocess.run([sys.executable,str(ROOT/'tv'/'ambient.py'),'recover'],env=env,capture_output=True,timeout=30)
   finally:owner.close()
   self.assertEqual(gate.read_bytes(),before)

class Trial(unittest.TestCase):
 def test_trial_card_needs_no_server_and_keeps_the_screen_conditions(self):
  rig=Rig(self,trial=True,probe={'marker':True});rig.feed={'ok':False,'reason':'server-unreachable'}
  rig.tick(count=280)                                       # more than 60 s without a session: no spontaneous exit
  self.assertEqual((rig.sup.exit_reason,rig.state()['status'],rig.state()['trial'],rig.launches()),(None,'idle',True,[]))
  rig.paths.test.write_text(json.dumps({'id':'essai-1','atMono':rig.clock.now}))
  rig.paths.panel_layout.write_text('{"active":true,"mode":"chat"}');rig.tick(count=8)
  self.assertEqual((rig.launches(),rig.state()['reason']),([],'panel'))
  rig.paths.panel_layout.write_text('{"active":false,"mode":"chat"}')
  rig.until(lambda:rig.gate().get('state')=='shown')
  params=rig.launches()[0]['params']
  self.assertEqual((params['element'],params['card']['kind'],params['card']['text'],params['probe']),('notice','notice','Essai TV Lens : cette alerte se ferme seule.',{'marker':True}))
  # Outside trial mode probe options never travel, whatever ambient.json says.
  self.assertNotIn('probe',ambient.clean_config({'focus':'relay','probe':{'marker':True}}))

 def test_surveillance_off_for_a_minute_ends_the_supervisor_outside_trial_mode(self):
  rig=Rig(self);rig.publish(enabled=False);rig.tick(count=236)
  self.assertIsNone(rig.sup.exit_reason)
  rig.tick(count=8);self.assertEqual(rig.sup.exit_reason,'surveillance-off')
  # Unreachable is not "off": the supervisor stays and says the server is unreachable.
  rig=Rig(self);rig.feed={'ok':False,'reason':'server-unreachable'};rig.tick(count=280)
  self.assertEqual((rig.sup.exit_reason,rig.state()['server']),(None,'server-unreachable'))
  rig=Rig(self);rig.begin();rig.feed={'ok':False,'reason':'server-unsupported'};rig.tick(count=4)
  self.assertEqual((rig.state()['status'],rig.state()['reason'],rig.state()['message'],rig.launches()),('disabled','server-unsupported','Serveur à mettre à jour : il ne publie pas encore les alertes.',[]))

class CaptureLink(unittest.TestCase):
 def test_capture_that_does_not_read_this_gate_blocks_every_display(self):
  for name,spoil in (('no gate support',lambda rig:rig.capture(gate=0)),('another gate file',lambda rig:rig.capture(gate_path='/tmp/tvlens-ambient-gate.json')),('report of another process',lambda rig:rig.paths.capture_report.write_text(json.dumps({'gate':1,'pid':1,'gatePath':str(rig.paths.gate)})))):
   with self.subTest(name):
    rig=Rig(self);spoil(rig);rig.begin();rig.tick(count=12)
    self.assertEqual((rig.launches(),rig.gate()['state'],rig.state()['status'],rig.state()['reason'],rig.state()['capture']['gated']),([],'absent','paused','capture-not-gated',False))
    rig.capture();rig.until(lambda:rig.gate()['state']=='shown')   # it lifts by itself once the capture is a gated one
  # The toast fallback is a display like any other: nothing over a capture that does not read this gate.
  rig=Rig(self,focus='off',fallback='toast',gated=False);rig.begin(rig.fresh(1));rig.tick(count=12)
  self.assertEqual((rig.luna.named('createToast'),rig.gate()['state'],rig.state()['status'],rig.state()['reason'],rig.state()['counts']['toasts']),([],'absent','paused','capture-not-gated',0))
  rig.capture();rig.until(lambda:rig.state()['counts']['toasts']==1);rig.tick()
  self.assertEqual((len(rig.luna.named('createToast')),rig.gate()['rect'],rig.state()['counts']['notShown']),(1,None,1))
  # Found by its command line only: neither the panel lock nor the capture lock is ever opened here.
  source=(ROOT/'tv'/'ambient.py').read_text()
  self.assertNotIn('tvlens-panel.lock',source);self.assertNotIn('tvlens-capture.lock',source)
  # An ungated capture that starts while a card is up closes the card.
  rig=Rig(self);rig.show();rig.capture(gate=0);rig.until(lambda:rig.gate()['state']=='closing',limit=12)

 def test_end_of_capture_is_published_with_its_cause_and_announced_once(self):
  rig=Rig(self);rig.begin();rig.until(lambda:rig.gate()['state']=='clear' and rig.state()['counts']['shown']==1)
  rig.capture(running=False,stopReason='duration',stopMessage='Limite de 6 h atteinte : relance la capture pour continuer.',framesCropped=8,framesWithheld=1)
  rig.until(lambda:len(rig.launches())==2)
  capture_state=rig.state()['capture']
  self.assertEqual((capture_state['active'],capture_state['stopReason'],capture_state['stopMessage'],capture_state['overlay'],capture_state['limits']),
   (False,'duration','Limite de 6 h atteinte : relance la capture pour continuer.',{'cropped':8,'withheld':1},{'seconds':21600,'idleSeconds':600}))
  notice=rig.launches()[1]['params']
  self.assertEqual((notice['element'],notice['card']['kind'],notice['card']['text']),('notice','notice','Capture arrêtée : la surveillance ne reçoit plus rien. Rakuten pour la relancer.'))
  rig.until(lambda:rig.gate()['state']=='clear');rig.tick(count=200)
  # Once, and nothing restarts anything: no capture command exists on this side at all.
  self.assertEqual(len(rig.launches()),2)
  # A full disk on the server stops the feeding even if the capture process still runs.
  rig=Rig(self);rig.publish(storage={'state':'blocked'},accepting=False);rig.tick(count=12)
  self.assertEqual((rig.state()['capture']['active'],rig.state()['capture']['stopReason']),(False,'storage-full'))

class Exit(unittest.TestCase):
 def test_stop_during_a_card_closes_it_reopens_the_gate_and_gives_the_screen_back(self):
  rig=Rig(self);rig.show();rig.tick(count=6)
  rig.sup.exit('stopped');rig.sup.shutdown()
  self.assertEqual((rig.gate()['state'],rig.luna.windows,rig.screen_free()),('clear',[],True))
  self.assertEqual((rig.state()['status'],rig.state()['reason'],rig.paths.generation.read_text()),('stopped','stopped',''))
  # A window that will not close: the exit is bounded and the gate is left closed for `ambient.py recover`.
  rig=Rig(self);rig.show();rig.luna.sticky=True;started=rig.clock.now
  rig.sup.exit('parent');rig.sup.shutdown()
  self.assertEqual((rig.gate()['state'],rig.state()['status'],rig.state()['reason']),('closing','stopped','parent'))
  self.assertLessEqual(rig.clock.now-started,9)

 def test_watchdog_is_only_started_once_its_generation_and_a_first_beat_are_written(self):
  # In its own process the watchdog leaves at once when the generation file names another generation than its own.
  rig=Rig(self,start=False);rig.paths.generation.write_text('previous')
  self.assertEqual(ambient.recovery_decision(False,dict(ambient.read_json(rig.paths.beat) or {},generation=rig.paths.generation.read_text()),rig.sup.generation,rig.clock.now),'exit')
  rig.sup.declare()
  beat=ambient.read_json(rig.paths.beat)
  self.assertEqual((rig.paths.generation.read_text(),beat['generation'],beat['mono'],rig.gate()['state']),(rig.sup.generation,rig.sup.generation,rig.clock.now,'absent'))
  self.assertEqual(ambient.recovery_decision(False,dict(beat,generation=rig.paths.generation.read_text()),rig.sup.generation,rig.clock.now),'wait')
  # main() declares before it starts the watchdog, and only the profiles that display start one.
  order=[]
  with patch.object(ambient.Supervisor,'declare',lambda supervisor:order.append('declare')),patch.object(ambient,'spawn_detached',lambda command,env=None:order.append(command[-2])),\
   patch.object(ambient.Supervisor,'run',lambda supervisor:order.append('run')),patch.object(ambient,'AmbientPaths',lambda *_:rig.paths),patch.object(ambient.signal,'signal'),patch.object(ambient,'take_lock',lambda *_,**__:open(os.devnull)):
   for focus,expected in (('relay',['declare','watchdog','run']),('off',['run'])):
    (rig.root/'ambient.json').write_text(json.dumps({'focus':focus,'trial':True}));del order[:]
    self.assertEqual((ambient.main(['--config',str(rig.root/'connection.json')]),order),(0,expected))

 def test_parent_death_and_life_cap_end_the_supervisor(self):
  rig=Rig(self);rig.sup.parent_pid,rig.sup.ppid=4000,lambda:1;rig.tick()
  self.assertEqual(rig.sup.exit_reason,'parent')
  rig=Rig(self);rig.clock.now+=ambient.LIFE;rig.tick()
  self.assertEqual((rig.sup.exit_reason,ambient.LIFE),('duration',21600))

 def test_real_process_in_the_shipped_profile_starts_says_off_and_stops_on_sigterm(self):
  with tempfile.TemporaryDirectory() as temp:
   root=Path(temp);(root/'run').mkdir();(root/'luna').mkdir()
   (root/'connection.json').write_text(json.dumps({'url':'http://127.0.0.1:9','token':'x'*64}))
   env=dict(os.environ,PATH=str(ROOT/'tests'/'tv_fakes')+os.pathsep+os.environ['PATH'],TVLENS_FAKE_LUNA=str(root/'luna'),TVLENS_AMBIENT_RUN=str(root/'run'))
   child=subprocess.Popen([sys.executable,str(ROOT/'tv'/'ambient.py'),'--config',str(root/'connection.json')],env=env,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
   try:
    state_path=root/'run'/'tvlens-ambient-state.json';deadline=time.monotonic()+15
    while time.monotonic()<deadline and (not state_path.exists() or json.loads(state_path.read_text()).get('status')!='disabled'):time.sleep(.05)
    state=json.loads(state_path.read_text())
    self.assertEqual((state['status'],state['reason'],state['focus']),('disabled','profile-off','off'))
    self.assertIsNone(ambient.take_lock(root/'run'/'tvlens-ambient.lock'))   # the owner lock is held while it lives
    child.send_signal(signal.SIGTERM);self.assertEqual(child.wait(timeout=15),0)
   finally:
    if child.poll() is None:child.kill()
    child.communicate()
   self.assertEqual(json.loads(state_path.read_text())['status'],'stopped')
   self.assertFalse((root/'run'/'tvlens-ambient-gate.json').exists())
   self.assertFalse((root/'luna'/'calls.jsonl').exists())    # not one Luna call in the shipped profile
   lock=ambient.take_lock(root/'run'/'tvlens-ambient.lock');self.assertIsNotNone(lock);lock.close()

class ServerFeed(unittest.TestCase):
 def test_feed_revalidates_and_names_an_old_server_or_a_dead_one(self):
  owner=self;self.mode='ok';self.seen=[]
  class Handler(BaseHTTPRequestHandler):
   def log_message(self,*_):pass
   def do_GET(self):
    owner.seen.append((self.path,self.headers.get('Authorization'),self.headers.get('If-None-Match')))
    if owner.mode=='old':self.send_response(404);self.end_headers();return
    if self.headers.get('If-None-Match')=='"p-overlay-3"':self.send_response(304);self.send_header('ETag','"p-overlay-3"');self.end_headers();return
    body=json.dumps({'sessionId':'s1','enabled':True,'overlay':{'seq':0,'cards':[]},'serverNowMs':SERVER0}).encode()
    self.send_response(200);self.send_header('ETag','"p-overlay-3"');self.send_header('Content-Length',str(len(body)));self.end_headers();self.wfile.write(body)
  server=ThreadingHTTPServer(('127.0.0.1',0),Handler);thread=threading.Thread(target=server.serve_forever);thread.start()
  clock=Clock()
  try:
   feed=ambient.Feed({'url':'http://127.0.0.1:%d/'%server.server_port,'token':'t'*64},clock=clock)
   feed.poll();first=feed.snapshot()
   self.assertEqual((first['ok'],first['data']['sessionId'],first['at']),(True,'s1',1000.0))
   clock.now+=2;feed.poll();second=feed.snapshot()
   # 304: the body is kept with the time it was received at; the card ages are computed from that time.
   self.assertEqual((second['data'],second['at'],second['checked']),(first['data'],1000.0,1002.0))
   self.assertEqual(self.seen,[('/v1/surveillance/overlay','Bearer '+'t'*64,None),('/v1/surveillance/overlay','Bearer '+'t'*64,'"p-overlay-3"')])
   self.mode='old';feed.poll()
   self.assertEqual((feed.snapshot()['ok'],feed.snapshot()['reason']),(False,'server-unsupported'))
  finally:server.shutdown();server.server_close();thread.join()
  feed.poll()
  self.assertEqual((feed.snapshot()['ok'],feed.snapshot()['reason']),(False,'server-unreachable'))

class Controller(unittest.TestCase):
 A,B='aaaaaaaa-1111-4111-8111-111111111111','bbbbbbbb-2222-4222-8222-222222222222'
 def setUp(self):
  self.temp=tempfile.TemporaryDirectory();self.addCleanup(self.temp.cleanup);root=self.root=Path(self.temp.name);(root/'run').mkdir()
  (root/'ambient.json').write_text('{"focus":"relay"}')
  self.capture=CaptureController(root/'config',root/'report',[sys.executable,'-c','pass'],lock_file=str(root/'lock'))
  self.control=AmbientController(root/'config',run_dir=root/'run',command=[sys.executable,'-c','import time;time.sleep(60)'])
  self.control.ack_wait,self.control.wait_hold=.3,.6
  self.server=DeviceServer(('127.0.0.1',0),self.capture,'x'*64,self.control)
  self.thread=threading.Thread(target=self.server.serve_forever);self.thread.start()
  self.url='http://127.0.0.1:'+str(self.server.server_port)
  def close():
   self.control.stop()
   if self.control.child:self.control.child.wait(timeout=5)
   self.server.shutdown();self.server.server_close();self.thread.join()
  self.addCleanup(close)
 def request(self,route,method='GET',token='x'*64):
  headers={'Authorization':'Bearer '+token} if token else {}
  try:
   with urllib.request.urlopen(urllib.request.Request(self.url+route,method=method,headers=headers),timeout=5) as response:return response.status,json.load(response)
  except urllib.error.HTTPError as error:
   with error:return error.code,json.load(error)
 def gate(self,state,nonce='a'*32,**more):
  record=dict({'v':2,'epoch':5,'state':state,'app':APP,'rect':None,'armedMono':10.0,'pid':1},**more)
  if state=='clear':record['lastNonce']=nonce
  else:record['nonce']=nonce
  ambient.write_json_atomic(self.control.paths.gate,record)   # as its one writer does: never a partial file

 def test_panel_routes_need_the_token_and_form_a_closed_list(self):
  for route,method in (('/ambient','GET'),('/ambient/start','POST'),('/ambient/test','POST'),('/ambient/alerts/off','POST'),('/ambient/seen/overlay/3','POST'),('/ambient/seen/'+self.A+'/overlay/3','POST')):
   self.assertEqual(self.request(route,method,token='bad')[0],401,route)
  self.assertFalse(self.control.active())
  status,body=self.request('/ambient')
  self.assertEqual((status,body['supported'],body['active'],body['settings']),(200,True,False,{'alerts':True,'displayMs':14000,'activity':True,'position':'raised'}))
  self.assertEqual((body['state']['status'],body['state']['focus']),('stopped','relay'))
  # No route, and no setting, puts video signals on screen; no route takes a free value.
  for route in ('/ambient/signals/on','/ambient/signals/off','/ambient/display/15','/ambient/position/left','/ambient/seen/overlay/','/ambient/seen/overlay/1234567890','/ambient/seen/overlay/-1','/ambient/seen/claims/2','/ambient/recover','/ambient/gate','/shell'):
   self.assertEqual(self.request(route,'POST'),(404,{}),route)
  # A declaration names its session by a server identifier, nothing looser; nothing of the route becomes a path.
  for route in ('/s1/overlay/3','/'+self.A.upper()+'/overlay/3','/'+self.A[:-1]+'/overlay/3','/'+self.A+'x/overlay/3','/..%2F..%2Fetc/overlay/3','/'+self.A+'/overlay/','/'+self.A+'/overlay/1234567890','/'+self.A+'/claims/2','/'+self.A+'/overlay/3/4','/'+self.A+'/'+self.B+'/overlay/3'):
   self.assertEqual(self.request('/ambient/seen'+route,'POST'),(404,{}),route)
  self.assertFalse(self.control.paths.seen.exists())
  self.assertNotIn('signals',body['settings'])
  self.assertEqual(self.request('/ambient/unknown'),(404,{}))

 def test_settings_are_read_back_and_concurrent_writes_never_leave_a_partial_file(self):
  for route,key,value in (('/ambient/alerts/off','alerts',False),('/ambient/activity/off','activity',False),('/ambient/display/20','displayMs',20000),('/ambient/position/low','position','low')):
   status,body=self.request(route,'POST')
   self.assertEqual((status,body['settings'][key]),(200,value))
  self.assertEqual(self.request('/ambient')[1]['settings'],{'alerts':False,'displayMs':20000,'activity':False,'position':'low'})
  routes=['/ambient/display/8','/ambient/display/14','/ambient/display/20','/ambient/position/raised','/ambient/position/low','/ambient/alerts/on']
  with ThreadPoolExecutor(max_workers=8) as pool:answers=list(pool.map(lambda i:self.request(routes[i%len(routes)],'POST'),range(24)))
  self.assertEqual({status for status,_ in answers},{200})
  stored=json.loads((self.root/'ambient-settings.json').read_text())
  self.assertEqual(stored,ambient.clean_settings(stored))
  self.assertEqual((stored['alerts'],stored['displayMs'] in (8000,14000,20000),list(self.root.glob('*.tmp'))),(True,True,[]))
  # What the panel showed itself, filed under the session it names: the last declaration with its time (a lower
  # number gets through, the supervisor decides what it is worth), and a word of another session in its own record.
  before=time.monotonic()
  for value in (9,4):self.assertEqual(self.request('/ambient/seen/%s/overlay/%d'%(self.A,value),'POST'),(200,{}))
  self.assertEqual(self.request('/ambient/seen/%s/signals/2'%self.A,'POST'),(200,{}))
  self.assertEqual(self.request('/ambient/seen/%s/overlay/1'%self.B,'POST'),(200,{}))
  seen=json.loads(self.control.paths.seen.read_text())
  self.assertEqual((seen['v'],sorted(seen),{key:{kind:record.get(kind) for kind in ('overlay','signals')} for key,record in seen['sessions'].items()}),
   (2,['sessions','v'],{self.A:{'overlay':4,'signals':2},self.B:{'overlay':1,'signals':None}}))
  said=seen['sessions'][self.A]['atMono']
  self.assertTrue(before<=said['overlay']<=said['signals']<=seen['sessions'][self.B]['atMono']['overlay']<=time.monotonic())
  # The route of an earlier panel names no session: still answered, and not one byte moves.
  stored=self.control.paths.seen.read_bytes()
  self.assertEqual(self.request('/ambient/seen/overlay/7','POST'),(200,{}))
  self.assertEqual(self.control.paths.seen.read_bytes(),stored)
  # Bounded: the last few sessions only, the one just named among them.
  for n in range(3,9):self.request('/ambient/seen/%08d-0000-4000-8000-000000000000/overlay/%d'%(n,n),'POST')
  kept=json.loads(self.control.paths.seen.read_text())['sessions']
  self.assertEqual(sorted(kept),['%08d-0000-4000-8000-000000000000'%n for n in (5,6,7,8)])

 def test_start_stop_are_idempotent_and_start_nothing_else(self):
  status,body=self.request('/ambient/start','POST');pid=self.control.child.pid
  self.assertEqual((status,body['active']),(200,True))
  self.assertEqual((self.request('/ambient/start','POST')[1]['active'],self.control.child.pid),(True,pid))
  self.assertIsNone(self.capture.child)                       # the display never starts a capture
  self.assertEqual(self.request('/capture')[1]['active'],False)
  self.request('/ambient/stop','POST');self.control.child.wait(timeout=5)
  self.assertEqual(self.request('/ambient/stop','POST')[1]['active'],False)

 def test_trial_card_is_refused_in_the_shipped_profile(self):
  (self.root/'ambient.json').write_text('{"focus":"off"}')
  self.assertEqual(self.request('/ambient/test','POST'),(200,{'queued':False,'reason':'profile-off'}))
  (self.root/'ambient.json').unlink()
  self.assertEqual(self.request('/ambient/test','POST'),(200,{'queued':False,'reason':'profile-off'}))
  self.assertEqual((self.control.child,self.control.paths.test.exists()),(None,False))
  (self.root/'ambient.json').write_text('{"focus":"relay"}')
  self.assertEqual(self.request('/ambient/test','POST'),(200,{'queued':True}))
  self.assertTrue(self.control.active() and self.control.paths.test.exists())

 def test_page_routes_take_no_token_but_only_the_nonce_the_supervisor_made(self):
  def page(route,method='GET'):
   # The controller never writes the gate: the same bytes before and after the route (the test alone writes it).
   before=self.control.paths.gate.read_bytes();answer=self.request(route,method,token=None)
   self.assertEqual(self.control.paths.gate.read_bytes(),before,route);return answer
  self.gate('armed')
  for route,method in (('/ambient/ack/'+'b'*32,'POST'),('/ambient/key/'+'b'*32,'POST'),('/ambient/wait/'+'b'*32,'GET'),('/ambient/ack/short','POST'),('/ambient/ack/'+'A'*32,'POST'),('/ambient/ack/'+'a'*31+'/','POST'),('/ambient/wait/..%2F..%2Fetc','GET')):
   self.assertEqual(page(route,method),(404,{}),route)
  self.assertFalse(self.control.paths.ack.exists() or self.control.paths.pagekey.exists())
  # The right nonce: the question is carried; without a grant by the supervisor the answer is 404.
  self.assertEqual(page('/ambient/ack/'+'a'*32,'POST'),(404,{}))
  self.assertEqual(json.loads(self.control.paths.ack.read_text())['nonce'],'a'*32)
  threading.Timer(.1,lambda:self.gate('shown',shownMono=11.0)).start()
  self.assertEqual(self.request('/ambient/ack/'+'a'*32,'POST',token=None),(200,{}))
  self.assertEqual(page('/ambient/key/'+'a'*32,'POST'),(200,{}))
  self.assertEqual(json.loads(self.control.paths.pagekey.read_text())['nonce'],'a'*32)
  # wait: held while the card may stay; closes as soon as the gate moves on or a notice exists.
  self.assertEqual(page('/ambient/wait/'+'a'*32),(200,{'close':False}))
  self.control.paths.dismiss_relay.write_text(json.dumps({'nonce':'a'*32,'phase':'intent','atMono':12.0,'code':106}))
  self.assertEqual(page('/ambient/wait/'+'a'*32),(200,{'close':True}))
  self.control.paths.dismiss_relay.unlink()
  self.control.paths.dismiss_panel.write_text(json.dumps({'atMono':12.0,'pid':7}))
  self.assertEqual(page('/ambient/wait/'+'a'*32),(200,{'close':True}))
  self.control.paths.dismiss_panel.unlink()
  threading.Timer(.1,lambda:self.gate('closing')).start()
  started=time.monotonic();self.assertEqual(self.request('/ambient/wait/'+'a'*32,token=None),(200,{'close':True}))
  self.assertLess(time.monotonic()-started,.5)
  self.gate('clear');self.assertEqual(page('/ambient/wait/'+'a'*32),(200,{'close':True}))
  self.assertEqual(page('/ambient/ack/'+'a'*32,'POST'),(404,{}))

 def test_controller_without_the_ambient_part_answers_like_an_older_one(self):
  server=DeviceServer(('127.0.0.1',0),self.capture,'x'*64)      # the signature of before still works
  thread=threading.Thread(target=server.serve_forever);thread.start();url,self.url=self.url,'http://127.0.0.1:'+str(server.server_port)
  try:
   for route,method in (('/ambient','GET'),('/ambient/start','POST'),('/ambient/ack/'+'a'*32,'POST'),('/ambient/wait/'+'a'*32,'GET')):
    self.assertEqual(self.request(route,method),(404,{}),route)
   self.assertEqual(self.request('/capture')[0],200)
  finally:self.url=url;server.shutdown();server.server_close();thread.join()

if __name__=='__main__':unittest.main()
