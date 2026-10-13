"""Capture and display gate: the text of an ambient card never enters an analysed frame.

Simulation only (fake luna-send and arecord ahead in PATH, fake inference server on an ephemeral port).
Nothing here is a proof on the TV: see docs/lg-ambient.md, phase D.
"""
from fractions import Fraction
import json
import os
from pathlib import Path
import random
import signal
import subprocess
import sys
import tempfile
import threading
import time
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'tv'))
import ambient
import capture
from capture import safe_crop, frame_decision, settle_block

FULL={'x':0,'y':0,'width':1280,'height':720}
CHAT={'x':0,'y':90,'width':960,'height':540}        # panel open, chat layout
TIMELINE={'x':213,'y':0,'width':853,'height':480}   # panel open, timeline layout

def rect_of(element,position):
 """The rectangle the supervisor writes in the gate for a box: the box plus its margin (single source: tv/ambient.py)."""
 x,y,w,h=ambient.BOXES[element][position];m=ambient.RECT_MARGIN
 return {'x':x-m,'y':y-m,'width':w+2*m,'height':h+2*m}

def intersects(crop,rect):
 """Exact, in logical pixels: a capture pixel is 3/2 logical pixels. Independent of the arithmetic under test."""
 s=Fraction(3,2)
 return crop['x']*s<rect['x']+rect['width'] and rect['x']<(crop['x']+crop['width'])*s and crop['y']*s<rect['y']+rect['height'] and rect['y']<(crop['y']+crop['height'])*s

def gate(state,epoch=7,rect=None,**more):
 value={'v':2,'epoch':epoch,'state':state,'nonce':'a'*32,'app':'org.tvlens.ambient'}
 if state!='clear':value['rect']=rect
 value.update(more);return value

CARD=rect_of('card','raised')
ABSENT={'state':'absent','epoch':0}

class Crop(unittest.TestCase):
 def test_four_boxes_keep_the_announced_share_of_a_full_screen_frame(self):
  expected={('card','raised'):410,('card','low'):504,('pill','raised'):554,('pill','low'):648}
  for (element,position),height in expected.items():
   with self.subTest(element=element,position=position):
    crop=safe_crop(FULL,rect_of(element,position))
    self.assertEqual(crop,{'x':0,'y':0,'width':1280,'height':height})
    self.assertFalse(intersects(crop,rect_of(element,position)))
  # 57 % / 70 % of the height for the card, 77 % / 90 % for the pill, as the design announces.
  self.assertEqual([round(100*h/720) for h in expected.values()],[57,70,77,90])

 def test_crop_never_intersects_the_card_whatever_the_geometry(self):
  boxes=[rect_of(e,p) for e in ('card','pill') for p in ('raised','low')]
  for video in (FULL,CHAT,TIMELINE):
   for rect in boxes:
    crop=safe_crop(video,rect)
    if crop is None:continue
    self.assertFalse(intersects(crop,rect),(video,rect,crop))
    self.assertTrue(video['x']<=crop['x'] and video['y']<=crop['y'] and crop['x']+crop['width']<=video['x']+video['width'] and crop['y']+crop['height']<=video['y']+video['height'])
  # A pill at the bottom lies under the timeline video: nothing of it can be in the frame, which stays whole.
  self.assertEqual(safe_crop(TIMELINE,rect_of('pill','low')),TIMELINE)
  self.assertEqual(safe_crop(CHAT,CARD),{'x':0,'y':90,'width':960,'height':320})
  rng=random.Random(7);kept=0
  for _ in range(4000):
   video={'x':rng.randrange(0,400),'y':rng.randrange(0,200),'width':rng.randrange(320,880),'height':rng.randrange(180,520)}
   rect={'x':rng.randrange(0,1900),'y':rng.randrange(0,1060),'width':rng.randrange(1,900),'height':rng.randrange(1,500)}
   crop=safe_crop(video,rect)
   if crop is None:continue
   kept+=1
   self.assertFalse(intersects(crop,rect),(video,rect,crop))
   self.assertTrue(crop['width']>=320 and crop['height']>=180 and crop['y']+crop['height']<=video['y']+video['height'])
  self.assertGreater(kept,1000)

 def test_too_little_left_or_unknown_rectangle_keeps_nothing(self):
  # 179 capture pixels above the card: below the floor of 320x180.
  self.assertIsNone(safe_crop(FULL,{'x':0,'y':269,'width':1920,'height':300}))
  self.assertEqual(safe_crop(FULL,{'x':0,'y':270,'width':1920,'height':300})['height'],180)
  self.assertIsNone(safe_crop(FULL,None))

class Decision(unittest.TestCase):
 def test_table_of_gate_readings(self):
  closed=gate('shown',rect=CARD,shownMono=100);armed=gate('armed',rect=CARD,armedMono=100)
  rows=[
   ('no gate file: whole frame, as before',ABSENT,ABSENT,'full',None),
   ('clear twice, same epoch',gate('clear',7),gate('clear',7),'full',None),
   ('closed before only (card left during the shot)',gate('closing',8,rect=CARD,closingMono=100),gate('clear',9),'crop',None),
   ('closed after only (card arrived during the shot)',gate('clear',7),armed,'crop',None),
   ('closed at both readings',closed,closed,'crop',None),
   ('clear twice but two epochs: a whole show may have fitted',gate('clear',7),gate('clear',11),'withhold','gateCycled'),
   ('file created during the shot',ABSENT,gate('clear',1),'withhold','gateCycled'),
   ('closed without a rectangle (toast)',gate('shown',rect=None,shownMono=100),gate('shown',rect=None,shownMono=100),'withhold','overlayUnplaced'),
   ('unreadable file',{'state':'unreadable'},gate('clear',7),'withhold','gateUnreadable'),
   ('card too tall to leave a usable frame',gate('shown',rect={'x':0,'y':100,'width':1920,'height':900}),gate('clear',9),'withhold','overlayTooLarge'),
  ]
  for name,before,after,action,cause in rows:
   with self.subTest(name):
    decision=frame_decision(before,after,FULL,101)
    self.assertEqual(decision['action'],action)
    self.assertEqual(decision.get('cause'),cause)
    if action=='crop':self.assertEqual(decision['crop'],{'x':0,'y':0,'width':1280,'height':410})
    if action=='full':self.assertEqual(decision['crop'],FULL)

 def test_gate_file_states_are_read_as_the_table_expects(self):
  with tempfile.TemporaryDirectory() as temp:
   path=Path(temp)/'gate.json'
   self.assertEqual(ambient.read_gate(path),ABSENT)
   for broken in ('{','[]','{"v":1,"epoch":3,"state":"clear"}','{"v":2,"epoch":"3","state":"clear"}','{"v":2,"epoch":3,"state":"open"}','{"v":2,"epoch":3,"state":"shown","rect":{"x":1}}'):
    path.write_text(broken);self.assertEqual(ambient.read_gate(path),{'state':'unreadable'},broken)
   path.write_text(json.dumps(gate('shown',rect=CARD)));self.assertEqual(ambient.read_gate(path)['rect'],CARD)

 def test_a_gate_closed_for_31_seconds_still_crops_and_says_it_is_stale(self):
  fresh=frame_decision(gate('shown',rect=CARD,shownMono=100,renewedMono=130),gate('shown',rect=CARD,shownMono=100,renewedMono=130),FULL,159)
  stale=frame_decision(gate('shown',rect=CARD,shownMono=100,renewedMono=130),gate('shown',rect=CARD,shownMono=100,renewedMono=130),FULL,161)
  self.assertEqual((fresh['action'],fresh['stale']),('crop',False))
  # The capture never decides alone that the card is gone.
  self.assertEqual((stale['action'],stale['stale'],stale['crop']['height']),('crop',True,410))

class Blocks(unittest.TestCase):
 def sample(self,at,before,after,video=FULL):
  return {'atMs':at,'data':'AAAA','video':video,'decision':frame_decision(before,after,video,101)}
 def test_block_without_a_card_is_exactly_the_block_of_before(self):
  frames,overlay,causes=settle_block([self.sample(i,ABSENT,ABSENT) for i in range(4)])
  self.assertEqual(frames,[{'atMs':i,'data':'AAAA','crop':FULL} for i in range(4)])
  self.assertEqual((overlay,causes),({'cropped':0,'withheld':0},{}))

 def test_one_cut_frame_cuts_its_neighbours_to_the_same_size_and_each_is_declared(self):
  shown=gate('shown',rect=CARD,shownMono=100)
  frames,overlay,causes=settle_block([self.sample(0,gate('clear',7),gate('clear',7)),self.sample(1,gate('clear',7),shown),self.sample(2,shown,shown),self.sample(3,shown,gate('clear',9))])
  self.assertEqual({(f['crop']['width'],f['crop']['height']) for f in frames},{(1280,410)})
  self.assertEqual([f.get('overlay') for f in frames],['cropped']*4)
  self.assertEqual((overlay,causes),({'cropped':4,'withheld':0},{}))
  self.assertTrue(all(not intersects(f['crop'],CARD) for f in frames))

 def test_withheld_frames_do_not_void_the_block_and_are_counted_with_their_cause(self):
  shown=gate('shown',rect=CARD,shownMono=100)
  frames,overlay,causes=settle_block([self.sample(0,shown,shown),self.sample(1,gate('clear',7),gate('clear',9)),self.sample(2,{'state':'unreadable'},shown),self.sample(3,shown,shown)])
  self.assertEqual([f['atMs'] for f in frames],[0,3])
  self.assertEqual(overlay,{'cropped':2,'withheld':2})
  self.assertEqual(causes,{'gateCycled':1,'gateUnreadable':1})
  # Every frame withheld: nothing to send, and the caller names the cause (overlayVisible).
  frames,overlay,_=settle_block([self.sample(i,gate('shown',rect=None),gate('shown',rect=None)) for i in range(4)])
  self.assertEqual((frames,overlay),([],{'cropped':0,'withheld':4}))

 def test_mixed_video_rectangles_never_leave_two_sizes_in_one_block(self):
  shown=gate('shown',rect=CARD,shownMono=100)
  frames,overlay,causes=settle_block([self.sample(0,shown,shown),self.sample(1,shown,shown),self.sample(2,shown,shown,CHAT),self.sample(3,gate('clear',9),gate('clear',9))])
  self.assertEqual({(f['crop']['width'],f['crop']['height']) for f in frames},{(1280,410)})
  self.assertEqual((overlay,causes),({'cropped':3,'withheld':1},{'sizeMismatch':1}))

class Server:
 """Fake inference host: session start, session identity, segments. Port 0, loopback."""
 def __init__(self,start=(200,{'id':'s1','elapsedMs':0}),segment=(200,{'id':'moment-1','duplicate':False}),state=None):
  self.start,self.segment,self.state=start,segment,state or {'id':'s1','accepting':True,'readOnly':False,'storage':{'state':'ok'}}
  self.segments=[];self.starts=0;owner=self
  # Set by a test to keep the answer of the session start pending, as a slow or distant server does.
  self.hold=None
  class Handler(BaseHTTPRequestHandler):
   def log_message(self,*_):pass
   def reply(self,code,value):
    body=json.dumps(value).encode();self.send_response(code);self.send_header('Content-Length',str(len(body)));self.end_headers();self.wfile.write(body)
   def do_GET(self):self.reply(200,owner.state)
   def do_POST(self):
    body=json.loads(self.rfile.read(int(self.headers['Content-Length'])))
    if self.path=='/v1/session/start':
     owner.starts+=1
     if owner.hold:
      owner.hold.wait(10)
      try:return self.reply(*owner.start)
      except OSError:return   # the capture left before the answer
     return self.reply(*owner.start)
    owner.segments.append(body);self.reply(*owner.segment)
  self.http=ThreadingHTTPServer(('127.0.0.1',0),Handler);self.thread=threading.Thread(target=self.http.serve_forever);self.thread.start()
  self.url='http://127.0.0.1:'+str(self.http.server_port)
 def close(self):self.http.shutdown();self.http.server_close();self.thread.join()

class CaptureRun(unittest.TestCase):
 """The real capture.py, in its own process, against the fakes. Only the pace between frames is shortened."""
 def setUp(self):
  self.temp=tempfile.TemporaryDirectory();self.root=Path(self.temp.name)
  (self.root/'run').mkdir();(self.root/'luna').mkdir()
  self.gate=self.root/'run'/'tvlens-ambient-gate.json'
  self.addCleanup(self.temp.cleanup)
 def run_capture(self,server,seconds=8,idle=600,slow=False):
  (self.root/'connection.json').write_text(json.dumps({'url':server.url,'token':'x'*64}))
  env=dict(os.environ,PATH=str(ROOT/'tests'/'tv_fakes')+os.pathsep+os.environ['PATH'],TVLENS_FAKE_LUNA=str(self.root/'luna'),TVLENS_AMBIENT_RUN=str(self.root/'run'))
  args=['--config',str(self.root/'connection.json'),'--seconds',str(seconds),'--idle-seconds',str(idle),'--lock',str(self.root/'capture.lock'),'--report',str(self.root/'report.json')]
  if slow:command=[sys.executable,str(ROOT/'tv'/'capture.py')]+args
  else:
   env['TVLENS_FAKE_ARECORD_SECONDS']='0.05'
   command=[sys.executable,'-c','import sys;sys.path.insert(0,sys.argv.pop(1));import capture;capture.FRAME_STEP=0.02;capture.run(sys.argv[1:])',str(ROOT/'tv')]+args
  done=subprocess.run(command,env=env,capture_output=True,timeout=90)
  self.assertEqual(done.returncode,0,done.stderr.decode())
  report=json.loads((self.root/'report.json').read_text())
  # A capture that ran prints its last report; a start that was refused only writes it.
  if done.stdout.strip():self.assertEqual(json.loads(done.stdout.decode()),report)
  return report

 def scenario_with_a_card(self,slow=False):
  shown=gate('shown',5,rect=CARD,shownMono=-1e9,renewedMono=1e12,nonce='b'*32)
  self.gate.write_text(json.dumps(gate('clear',4)))
  # The card arrives during the last shot of the first block (only the reading AFTER the shot can see it) and
  # leaves during the first shot of the third (only the reading BEFORE can); a whole show fits inside the 11th.
  (self.root/'luna'/'oneshot.json').write_text(json.dumps({'4':{'gate':shown},'9':{'gate':gate('clear',6)},'11':{'gate':gate('clear',8)}}))
  server=Server()
  try:report=self.run_capture(server,seconds=32,slow=slow)
  finally:server.close()
  first,second,third,fourth=sorted(server.segments,key=lambda s:s['sequence'])
  for block,count in ((first,4),(second,4),(third,3)):
   # No frame of a block touched by the card kept its bottom, every one says so, and the sound left with them.
   self.assertEqual([f['crop'] for f in block['frames']],[{'x':0,'y':0,'width':1280,'height':410}]*count)
   self.assertEqual([f.get('overlay') for f in block['frames']],['cropped']*count)
   self.assertEqual(block['overlay'],{'cropped':count,'withheld':4-count})
   self.assertTrue(block['audio'])
  # Once the card is gone a block is exactly what it was before the gate existed: no new field at all.
  self.assertEqual(set(fourth),{'sessionId','sequence','startMs','endMs','frames','audio'})
  self.assertEqual([(f['crop'],set(f)) for f in fourth['frames']],[(FULL,{'atMs','data','crop'})]*4)
  self.assertEqual((report['sent'],report['dropped'],report['framesCropped'],report['framesWithheld'],report['withheldReasons']),(4,0,11,1,{'gateCycled':1}))
  self.assertEqual((report['gate'],report['gatePath'],report['stopReason'],report['stopped']),(1,str(self.gate),'duration',True))
  self.assertEqual(report['limits'],{'seconds':32,'idleSeconds':600})
  self.assertIn('32 s',report['stopMessage'])

 def test_card_shown_during_a_block_is_cropped_out_declared_and_the_sound_still_leaves(self):
  self.scenario_with_a_card()

 @unittest.skipUnless(os.environ.get('TVLENS_SLOW'),'real pace (about 35 s): set TVLENS_SLOW=1')
 def test_same_scenario_at_the_real_pace_of_the_tv(self):
  self.scenario_with_a_card(slow=True)

 def test_without_a_gate_file_the_capture_sends_what_it_sent_before(self):
  server=Server()
  try:report=self.run_capture(server)
  finally:server.close()
  (block,)=server.segments
  self.assertEqual(set(block),{'sessionId','sequence','startMs','endMs','frames','audio'})
  self.assertEqual([set(f) for f in block['frames']],[{'atMs','data','crop'}]*4)
  self.assertEqual([f['crop'] for f in block['frames']],[FULL]*4)
  self.assertEqual((report['framesCropped'],report['framesWithheld'],report['gateStale']),(0,0,False))
  self.assertFalse(self.gate.exists())

 def test_a_block_whose_frames_are_all_withheld_is_dropped_with_its_cause(self):
  self.gate.write_text(json.dumps(gate('shown',5,rect=None,shownMono=-1e9)))
  server=Server()
  try:report=self.run_capture(server)
  finally:server.close()
  self.assertEqual(server.segments,[])
  self.assertEqual((report['dropped'],report['dropReasons'],report['framesWithheld'],report['withheldReasons']),(1,{'overlayVisible':1},4,{'overlayUnplaced':4}))
  # The gate has been closed far longer than 30 s: said in the report, still obeyed.
  self.assertTrue(report['gateStale'])

 def test_full_storage_ends_the_capture_cleanly_and_is_never_called_a_network_cut(self):
  server=Server(segment=(507,{'error':'Espace disque insuffisant.','code':'storage-full'}))
  try:report=self.run_capture(server,seconds=40)
  finally:server.close()
  self.assertEqual((report['stopReason'],report['connection'],report['retries']),('storage-full','storage-full',0))
  self.assertEqual(len(server.segments),1)
  self.assertIn('Stockage plein',report['errors'][-1])
  self.assertEqual(report['dropReasons'].get('storageFull'),1)
  self.assertEqual(report['dropped'],sum(report['dropReasons'].values()))

 def test_archive_open_read_only_refuses_the_start_in_plain_words(self):
  server=Server(start=(409,{'error':'Session ouverte en lecture seule. Choisis Reprendre la capture ou Nouvelle session.','code':'read-only'}))
  try:report=self.run_capture(server)
  finally:server.close()
  self.assertEqual((report['stopReason'],report['connection'],report['stopped'],report['sent']),('read-only','read-only',True,0))
  self.assertEqual(report['errors'],['Session ouverte en lecture seule. Choisis Reprendre la capture ou Nouvelle session.'])
  self.assertEqual((server.starts,server.segments),(1,[]))

 def test_stop_asked_while_the_session_start_is_still_pending_ends_with_its_cause_like_any_other(self):
  server=Server();server.hold=threading.Event()
  (self.root/'connection.json').write_text(json.dumps({'url':server.url,'token':'x'*64}))
  env=dict(os.environ,PATH=str(ROOT/'tests'/'tv_fakes')+os.pathsep+os.environ['PATH'],TVLENS_FAKE_LUNA=str(self.root/'luna'),TVLENS_AMBIENT_RUN=str(self.root/'run'))
  child=subprocess.Popen([sys.executable,str(ROOT/'tv'/'capture.py'),'--config',str(self.root/'connection.json'),'--seconds','40','--lock',str(self.root/'capture.lock'),'--report',str(self.root/'report.json')],
   env=env,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
  try:
   deadline=time.monotonic()+15
   while server.starts<1 and time.monotonic()<deadline:time.sleep(.02)
   self.assertEqual((server.starts,json.loads((self.root/'report.json').read_text())['connection']),(1,'starting'))
   # The controller stops the capture (SIGTERM) while the server has not answered yet.
   child.send_signal(signal.SIGTERM);_,stderr=child.communicate(timeout=15)
  finally:
   if child.poll() is None:child.kill();child.communicate()
   server.hold.set();server.close()
  self.assertEqual((child.returncode,stderr.decode()),(0,''))
  report=json.loads((self.root/'report.json').read_text())
  self.assertEqual((report['stopReason'],report['stopMessage'],report['stopped'],report['connection'],report['errors'],report['sent'],report['sessionId']),
   ('stopped','Capture arrêtée à la demande.',True,'stopped',[],0,None))

 def test_no_youtube_playback_stops_the_capture_as_idle_and_counts_every_block(self):
  foreign=dict(json.loads(json.dumps({'sink':'MAIN','appId':'netflix','connected':True,'context':'x','displayOutput':{'x':0,'y':0,'width':3840,'height':2160}})))
  (self.root/'luna'/'replies.json').write_text(json.dumps({'com.webos.service.videooutput/getStatus':{'returnValue':True,'video':[foreign]}}))
  server=Server()
  try:report=self.run_capture(server,seconds=21600,idle=1)
  finally:server.close()
  self.assertEqual((report['stopReason'],report['stopped'],report['sent']),('idle',True,0))
  self.assertEqual(set(report['dropReasons']),{'foreignApp'})
  self.assertEqual(report['dropped'],report['dropReasons']['foreignApp'])
  self.assertEqual(report['limits'],{'seconds':21600,'idleSeconds':1})
  self.assertEqual(server.segments,[])

 def test_a_panel_opened_during_one_shot_costs_that_frame_not_the_whole_block(self):
  """Seen on the real TV on 13 Oct 2026: 2 blocks of 10 lost in an 85 s capture, 3 of 5 in another.

  The video rectangle changes while one frame is being taken (the panel opens: YouTube goes from the full screen
  to 2560x1440 at x=640, values read on the TV). The whole 8 s block used to be dropped as geometryChanged, with
  its sound and its three good frames, at the very moment the viewer opens the panel to ask about what was just
  said. Only the frame taken across the change is left out, as for a frame withheld under a card — as long as the
  video context is the same: a change of context still refuses the whole block.
  """
  full=json.loads(json.dumps({'sink':'MAIN','appId':'youtube.leanback.v4','connected':True,'context':'c','fullScreen':True,'displayOutput':{'x':0,'y':0,'width':3840,'height':2160}}))
  beside=dict(full,fullScreen=False,displayOutput={'x':640,'y':0,'width':2560,'height':1440})
  def run(readings,seconds=8):
   # Two readings per frame, before and after the shot.
   for name in ('counts.json','calls.jsonl'):(self.root/'luna'/name).unlink(missing_ok=True)
   (self.root/'luna'/'replies.json').write_text(json.dumps({'com.webos.service.videooutput/getStatus':[{'returnValue':True,'video':[v]} for v in readings]}))
   server=Server()
   try:return self.run_capture(server,seconds=seconds),server.segments
   finally:server.close()
  # The panel opens during the second shot of the block: that frame alone is missing, the sound left.
  report,segments=run((full,full,full,beside,beside))
  self.assertEqual((report['sent'],report['dropped'],report['dropReasons'],report['framesMoved'],report['frames']),(1,0,{},1,3))
  (block,)=segments
  self.assertTrue(block['audio'])
  # Each frame is cut by the rectangle it was really taken in: the full screen before, the smaller picture after.
  self.assertEqual([frame['crop'] for frame in block['frames']],[{'x':0,'y':0,'width':1280,'height':720}]+[{'x':213,'y':0,'width':853,'height':480}]*2)
  # Every shot of a block taken across a change: nothing to show, and the block is counted with that cause.
  report,segments=run((full,beside)*4)
  self.assertEqual((report['sent'],report['dropped'],report['dropReasons'],report['framesMoved'],segments),(0,1,{'geometryChanged':1},4,[]))
  # Another video context during a shot is not a move of the picture: the whole block is refused as before,
  # with or without a change of rectangle, and no frame is counted as merely moved.
  other=dict(full,context='another-video')
  for readings in ((full,full,full,other,other),(full,full,full,dict(beside,context='another-video'),dict(beside,context='another-video'))):
   report,segments=run(readings)
   self.assertEqual((report['sent'],report['dropped'],report['dropReasons'],report['framesMoved'],segments),(0,1,{'geometryChanged':1},0,[]))

 def test_duration_bounds(self):
  for seconds in ('7','21601'):
   with self.assertRaises(ValueError):capture.run(['--config','unused','--seconds',seconds])

if __name__=='__main__':unittest.main()
