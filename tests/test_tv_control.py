from concurrent.futures import ThreadPoolExecutor
from unittest.mock import MagicMock, patch
import fcntl
import json
import socket
from types import SimpleNamespace
from pathlib import Path
import sys
import tempfile
import threading
import time
import unittest
import urllib.request
import urllib.error
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'tv'))
import controller as device
from controller import CaptureController, DeviceServer
from transport import Transport, SessionChanged, StorageFull, ReadOnly

REFUSED_REPORTS=json.loads((Path(__file__).parent/'fixtures'/'tv-capture-refusals.json').read_text())

class ControlTests(unittest.TestCase):
 def test_boot_without_python_executable_uses_absolute_interpreter(self):
  with tempfile.TemporaryDirectory() as temp:
   with patch('controller.sys.executable', ''):
    controller=CaptureController(Path(temp)/'config',Path(temp)/'report',lock_file=str(Path(temp)/'lock'))
   with patch('controller.subprocess.Popen') as launch:
    launch.return_value.poll.return_value=None
    self.assertTrue(controller.start()['active'])
    self.assertEqual(launch.call_args.args[0][0],'/usr/bin/python3')

 def test_capture_is_bounded_to_six_hours_and_ends_after_ten_minutes_without_playback(self):
  with tempfile.TemporaryDirectory() as temp:
   command=CaptureController(Path(temp)/'config',Path(temp)/'report',lock_file=str(Path(temp)/'lock')).command
   option=lambda name:command[command.index(name)+1]
   self.assertEqual((option('--seconds'),option('--idle-seconds'),option('--lock'),option('--report')),('21600','600',str(Path(temp)/'lock'),str(Path(temp)/'report')))

 def test_concurrent_layout_requests_publish_complete_authenticated_messages(self):
  with tempfile.TemporaryDirectory() as temp:
   root=Path(temp)
   (root/'tvlens-panel-layout-state.json').write_text('{"active":true,"mode":"chat"}')
   controller=CaptureController(root/'config',root/'report')
   server=DeviceServer(('127.0.0.1',0),controller,'x'*64)
   thread=threading.Thread(target=server.serve_forever);thread.start()
   url='http://127.0.0.1:'+str(server.server_port)
   def request(index):
    mode='chat' if index%2 else 'timeline'
    req=urllib.request.Request(url+'/panel/'+mode,method='POST',headers={'Authorization':'Bearer '+'x'*64})
    with urllib.request.urlopen(req,timeout=5) as r:return json.load(r)
   try:
    with patch('controller.Path',side_effect=lambda value:root/Path(value).name):
     with ThreadPoolExecutor(max_workers=8) as pool:responses=list(pool.map(request,range(24)))
    published=json.loads((root/'tvlens-panel-layout-request.json').read_text())
    self.assertIn(published,responses)
    self.assertEqual(len({r['id'] for r in responses}),24)
    self.assertFalse(list(root.glob('*.tmp')))
   finally:server.shutdown();server.server_close();thread.join()

 def test_authenticated_idempotent_start_stop(self):
  with tempfile.TemporaryDirectory() as temp:
   controller=CaptureController(Path(temp)/'config',Path(temp)/'report',
       [sys.executable,'-c','import time; time.sleep(60)'],lock_file=str(Path(temp)/'lock'))
   server=DeviceServer(('127.0.0.1',0),controller,'x'*64)
   thread=threading.Thread(target=server.serve_forever);thread.start()
   url='http://127.0.0.1:'+str(server.server_port)
   def request(route,method='GET',token='x'*64):
    with urllib.request.urlopen(urllib.request.Request(url+route,method=method,headers={'Authorization':'Bearer '+token}),timeout=2) as r:return json.load(r)
   try:
    with self.assertRaises(urllib.error.HTTPError) as denied:request('/capture/start','POST','bad')
    self.assertEqual(denied.exception.code,401);denied.exception.close();self.assertFalse(controller.status()['active'])
    with open(Path(temp)/'lock','a') as locked:
     fcntl.flock(locked,fcntl.LOCK_EX|fcntl.LOCK_NB)
     refusal=request('/capture/start','POST');self.assertFalse(refusal['active']);self.assertIn('déjà active',refusal['report']['errors'][0])
    self.assertTrue(request('/capture/start','POST')['active']);pid=controller.child.pid
    request('/capture/start','POST');self.assertEqual(controller.child.pid,pid)
    request('/capture/stop','POST');controller.child.wait(timeout=3)
    self.assertFalse(request('/capture')['active']);request('/capture/stop','POST')
    with self.assertRaises(urllib.error.HTTPError) as missing:request('/shell','POST')
    self.assertEqual(missing.exception.code,404);missing.exception.close()
    # Removed routes follow the authenticated unknown-route response.
    with self.assertRaises(urllib.error.HTTPError) as absent:request('/ambient')
    self.assertEqual(absent.exception.code,404);absent.exception.close()
   finally:
    controller.stop();server.shutdown();server.server_close();thread.join()

class DeviceRoutes(unittest.TestCase):
 def setUp(self):
  temp=tempfile.TemporaryDirectory()
  self.addCleanup(temp.cleanup)
  self.root=Path(temp.name)
  self.capture=CaptureController(self.root/'config',self.root/'report',lock_file=str(self.root/'capture.lock'))
  self.server=DeviceServer(('127.0.0.1',0),self.capture,'x'*64)
  thread=threading.Thread(target=self.server.serve_forever)
  thread.start()
  def close():
   self.server.shutdown()
   self.server.server_close()
   thread.join()
  self.addCleanup(close)
 def request(self,route,method='GET',token='x'*64,origin='null'):
  headers={'Origin':origin}
  if token is not None:headers['Authorization']='Bearer '+token
  request=urllib.request.Request('http://127.0.0.1:'+str(self.server.server_port)+route,method=method,headers=headers)
  try:response=urllib.request.urlopen(request,timeout=5)
  except urllib.error.HTTPError as error:response=error
  with response:return response.status,json.load(response),response.headers

 def test_removed_display_routes_use_the_authenticated_unknown_route(self):
  routes=[('/ambient','GET'),('/ambient/start','POST'),('/ambient/ack/'+'a'*32,'POST'),
   ('/ambient/wait/'+'a'*32,'GET'),('/ambient/key/'+'a'*32,'POST'),('/ambient/stop','POST'),
   ('/ambient/test','POST'),('/ambient/alerts/on','POST'),('/ambient/seen/overlay/3','POST')]
  with patch.object(device.subprocess,'Popen') as launch:
   for route,method in routes:
    for token,status in ((None,401),('bad',401),('x'*64,404)):
     with self.subTest(route=route,token=token):
      actual,body,headers=self.request(route,method,token)
      self.assertEqual(actual,status)
      if status==404:self.assertEqual(body,{})
      self.assertEqual(headers['Access-Control-Allow-Origin'],'null')
   launch.assert_not_called()
  self.assertFalse(self.capture.status()['active'])

 def test_capture_and_panel_routes_keep_authentication_and_cors(self):
  with patch.object(device,'Path',side_effect=lambda value:self.root/Path(value).name),\
    patch.object(device.subprocess,'Popen') as launch:
   for route,method in (('/capture','GET'),('/capture/start','POST'),('/capture/stop','POST'),
     ('/panel','GET'),('/panel/chat','POST'),('/panel/timeline','POST')):
    self.assertEqual(self.request(route,method,token=None)[0],401,route)
   launch.assert_not_called()
   self.assertEqual(self.request('/capture')[:2],(200,{'active':False,'stopping':False,'exitCode':None,'report':{}}))
   self.assertEqual(self.request('/panel')[:2],(200,{'active':False,'mode':'chat'}))
   self.assertEqual(self.request('/panel/chat','POST')[0],409)
   self.assertFalse((self.root/'tvlens-panel-layout-request.json').exists())
   (self.root/'tvlens-panel-layout-state.json').write_text('{"active":true,"mode":"chat"}')
   for mode in ('chat','timeline'):
    status,body,headers=self.request('/panel/'+mode,'POST')
    self.assertEqual((status,body['mode']),(200,mode))
    self.assertEqual(json.loads((self.root/'tvlens-panel-layout-request.json').read_text()),body)
    self.assertEqual(headers['Access-Control-Allow-Origin'],'null')
    self.assertEqual(headers['Cache-Control'],'no-store')
   self.assertFalse(list(self.root.glob('*.tmp')))
   status,body,headers=self.request('/panel','OPTIONS',token=None)
   self.assertEqual((status,body),(200,{}))
   self.assertEqual(headers['Access-Control-Allow-Headers'],'Authorization, Content-Type')
   self.assertEqual(headers['Access-Control-Allow-Methods'],'GET, POST, OPTIONS')
   self.assertNotIn('Access-Control-Allow-Origin',self.request('/panel',origin='https://example.test')[2])
   launch.assert_not_called()

 def test_capture_process_is_started_once_and_stopped_through_http(self):
  stopped=threading.Event()
  child=MagicMock()
  child.poll.side_effect=lambda:0 if stopped.is_set() else None
  child.wait.side_effect=lambda **_:stopped.set()
  with patch.object(device.subprocess,'Popen',return_value=child) as launch:
   for _ in range(2):self.assertTrue(self.request('/capture/start','POST')[1]['active'])
   launch.assert_called_once()
   self.assertEqual(launch.call_args.args[0],self.capture.command)
   self.request('/capture/stop','POST')
   self.assertTrue(stopped.wait(5))
   self.assertFalse(self.request('/capture')[1]['active'])
   self.assertFalse(self.request('/capture/stop','POST')[1]['active'])
   child.terminate.assert_called_once_with()

 def test_capture_route_transmits_the_shared_refusal_reports_unchanged(self):
  for report in REFUSED_REPORTS.values():
   self.capture.report.write_text(json.dumps(report))
   status,body,_=self.request('/capture')
   self.assertEqual(status,200)
   self.assertEqual(body,{'active':False,'stopping':False,'exitCode':None,'report':report})

class DeviceLifecycle(unittest.TestCase):
 def test_startup_and_shutdown_launch_no_background_work(self):
  with tempfile.TemporaryDirectory() as temp:
   root=Path(temp)
   config=root/'connection.json'
   config.write_text(json.dumps({'token':'x'*64}))
   (root/'ambient.json').write_text('{"focus":"relay"}')
   gate=root/'tvlens-ambient-gate.json'
   gate.write_text('{"v":2,"epoch":3,"state":"shown"}')
   for termination in ('interrupt','signal'):
    with self.subTest(termination=termination):
     signals={}
     def serve(server):
      self.assertEqual(server.server_address[0],'127.0.0.1')
      if termination=='signal':signals[device.signal.SIGTERM](None,None)
      raise KeyboardInterrupt
     args=['controller.py','--config',str(config),'--port','0','--capture-report',str(root/'report'),
      '--capture-lock',str(root/'capture.lock')]
     with patch.object(sys,'argv',args),patch.dict(device.os.environ,{'TVLENS_AMBIENT_RUN':temp}),\
       patch.object(DeviceServer,'serve_forever',serve),patch.object(device.os,'umask'),\
       patch.object(device.signal,'signal',side_effect=lambda sig,handler:signals.update({sig:handler})),\
       patch.object(device.subprocess,'Popen') as launch,patch.object(device.threading,'Thread') as background:
      device.main()
     launch.assert_not_called()
     background.assert_not_called()
     self.assertEqual(json.loads(gate.read_text()),{'v':2,'epoch':3,'state':'shown'})

class DeliveryTests(unittest.TestCase):
 def setUp(self):
  self.session='one';self.failures=1;self.accepted=set();self.attempts=0;self.ambiguous=True;self.state={};self.refuse=None
  self.sequences=[];self.refusals=[]
  self.requests=[]
  self.blocks=[]
  self.disconnect=False
  self.after_get=lambda:None
  self.omit_id=False
  owner=self
  class Handler(BaseHTTPRequestHandler):
   def log_message(self,*_):pass
   def reply(self,code,value):
    self.send_response(code);self.end_headers();self.wfile.write(json.dumps(value).encode())
   def do_GET(self):
    owner.requests.append(('GET',self.path,self.headers.get('Authorization')))
    if owner.disconnect:
     self.connection.shutdown(socket.SHUT_RDWR)
     self.connection.close()
     return
    owner.after_get()
    if owner.failures:owner.failures-=1;return self.reply(503,{})
    state=dict({'id':owner.session,'accepting':True},**owner.state)
    if owner.omit_id:state.pop('id',None)
    self.reply(200,state)
   def do_POST(self):
    item=json.loads(self.rfile.read(int(self.headers['Content-Length'])))
    owner.requests.append(('POST',self.path,self.headers.get('Authorization')))
    owner.blocks.append(item)
    owner.attempts+=1
    owner.sequences.append(item['sequence'])
    if owner.refusals:return self.reply(*owner.refusals.pop(0))
    if owner.refuse:return self.reply(*owner.refuse)
    owner.accepted.add(item['sequence'])
    if owner.ambiguous:owner.ambiguous=False;return self.reply(503,{})
    self.reply(200,{'duplicate':True})
  self.server=ThreadingHTTPServer(('127.0.0.1',0),Handler)
  self.thread=threading.Thread(target=self.server.serve_forever);self.thread.start()
  self.stop=threading.Event();self.report={'sent':0,'dropped':0,'retries':0,'errors':[],'lastRefusal':None}
  self.transport=Transport({'url':'http://127.0.0.1:'+str(self.server.server_port),'token':'x'*64},self.stop,self.report)
 def tearDown(self):self.server.shutdown();self.server.server_close();self.thread.join()
 def prepare_delivery(self):
  self.failures=0
  self.ambiguous=False
  self.report.update(connection='capturing',stopReason=None)
  return {'sessionId':'one','sequence':23,'startMs':12000,'endMs':20000,
   'frames':[{'atMs':12000,'data':'image'}],'audio':'sound'}

 def test_accepted_block_reads_session_then_posts_unchanged_and_counts_once(self):
  item=self.prepare_delivery()
  expected=json.loads(json.dumps(item))
  with patch.object(self.stop,'wait',side_effect=AssertionError('accepted block must not retry')):
   self.assertTrue(self.transport.deliver(item,time.monotonic()))
  self.assertEqual(self.requests,[('GET','/v1/session','Bearer '+'x'*64),('POST','/v1/segments','Bearer '+'x'*64)])
  self.assertEqual(self.blocks,[expected])
  self.assertEqual(item,expected)
  self.assertEqual((self.report['sent'],self.report['dropped'],self.report['retries']),(1,0,0))
  self.assertEqual((self.report['connection'],self.report['stopReason'],self.report['lastRefusal']),('connected',None,None))

 def test_ambiguous_ack_repeats_the_entire_block_without_counting_a_second_delivery(self):
  item=self.prepare_delivery()
  expected=json.loads(json.dumps(item))
  self.ambiguous=True
  clock=[100.0]
  with patch('transport.time',SimpleNamespace(monotonic=lambda:clock[0])),\
    patch.object(self.stop,'wait',side_effect=lambda delay:clock.__setitem__(0,clock[0]+delay)):
   self.assertTrue(self.transport.deliver(item,100.0))
  self.assertEqual([(method,path) for method,path,_ in self.requests],
   [('GET','/v1/session'),('POST','/v1/segments')]*2)
  self.assertEqual(self.blocks,[expected,expected])
  self.assertEqual(item,expected)
  self.assertEqual(self.accepted,{23})
  self.assertEqual((self.report['sent'],self.report['dropped'],self.report['retries']),(1,0,1))
  self.assertEqual((self.report['connection'],self.report['stopReason'],self.report['lastRefusal']),
   ('connected',None,{'status':503,'code':None}))

 def assert_preflight_stop(self,state,error,reason,loss):
  item=self.prepare_delivery()
  self.state=state
  with patch.object(self.stop,'wait',side_effect=AssertionError('preflight refusal must not retry')):
   with self.assertRaises(error) as stopped:self.transport.deliver(item,time.monotonic())
  self.assertEqual(stopped.exception.reason,reason)
  self.assertEqual([(method,path) for method,path,_ in self.requests],[('GET','/v1/session')])
  self.assertEqual(self.blocks,[])
  self.assertEqual((self.report['sent'],self.report['dropped'],self.report['dropReasons'],self.report['retries']),
   (0,1,{loss:1},0))
  self.assertEqual((self.report['connection'],self.report['stopReason'],self.report['lastRefusal']),('capturing',None,None))
  self.assertFalse(self.stop.is_set())

 def test_changed_identity_stops_before_delivery_with_session_changed_loss(self):
  self.assert_preflight_stop({'id':'two'},SessionChanged,'session-changed','sessionChanged')

 def test_absent_identity_stops_before_delivery_with_the_same_session_changed_loss(self):
  self.omit_id=True
  self.assert_preflight_stop({},SessionChanged,'session-changed','sessionChanged')

 def test_same_identity_not_accepting_still_means_session_changed_today(self):
  self.assert_preflight_stop({'accepting':False},SessionChanged,'session-changed','sessionChanged')

 def test_same_identity_read_only_stops_before_delivery_with_its_own_loss(self):
  self.assert_preflight_stop({'readOnly':True,'accepting':False},ReadOnly,'read-only','readOnly')

 def test_same_identity_blocked_storage_stops_before_delivery_with_its_own_loss(self):
  self.assert_preflight_stop({'storage':{'state':'blocked'},'accepting':False},StorageFull,'storage-full','storageFull')

 def test_post_storage_full_with_code_is_final_and_keeps_the_refusal(self):
  self.assert_final_storage_refusal({'code':'storage-full'})

 def test_post_legacy_storage_full_without_code_is_final_and_keeps_the_status(self):
  self.assert_final_storage_refusal({})

 def assert_final_storage_refusal(self,body):
  item=self.prepare_delivery()
  self.refuse=(507,body)
  with patch.object(self.stop,'wait',side_effect=AssertionError('storage refusal must not reconnect')):
   with self.assertRaises(StorageFull) as stopped:self.transport.deliver(item,time.monotonic())
  self.assertEqual(stopped.exception.reason,'storage-full')
  self.assertEqual(self.blocks,[item])
  self.assertEqual(self.report['lastRefusal'],{'status':507,'code':body.get('code')})
  self.assertEqual((self.report['sent'],self.report['dropped'],self.report['dropReasons'],self.report['retries']),
   (0,1,{'storageFull':1},0))
  self.assertEqual((self.report['connection'],self.report['stopReason']),('capturing',None))

 def test_simulated_session_ended_rejects_only_its_block_and_the_next_block_can_deliver(self):
  item=self.prepare_delivery()
  # Réponse de compatibilité simulée ; la route segments actuelle ne produit pas ce 410.
  self.refusals=[(410,{'code':'session-ended','error':'Session terminée.'})]
  with patch.object(self.stop,'wait',side_effect=AssertionError('rejected block must not retry')):
   self.assertFalse(self.transport.deliver(item,time.monotonic()))
   self.assertEqual((self.report['connection'],self.report['stopReason']),('capturing',None))
   self.assertFalse(self.stop.is_set())
   self.assertTrue(self.transport.deliver(dict(item,sequence=24),time.monotonic()))
  self.assertEqual(self.blocks,[item,dict(item,sequence=24)])
  self.assertEqual(self.report['lastRefusal'],{'status':410,'code':'session-ended'})
  self.assertEqual((self.report['sent'],self.report['dropped'],self.report['dropReasons'],self.report['retries']),
   (1,1,{'deliveryRejected':1},0))
  self.assertEqual((self.report['connection'],self.report['stopReason'],self.report['errors']),('connected',None,['HTTP 410']))

 def test_continuous_network_loss_retries_until_monotone_expiration_without_a_post(self):
  item=self.prepare_delivery()
  self.disconnect=True
  clock=[100.0]
  waits=[]
  def wait(delay):
   waits.append(delay)
   clock[0]+=delay
  with patch('transport.time',SimpleNamespace(monotonic=lambda:clock[0])),patch.object(self.stop,'wait',side_effect=wait):
   self.assertFalse(self.transport.deliver(item,100.0))
  self.assertEqual(clock[0],130.0)
  self.assertEqual(waits,[1]*30)
  self.assertEqual([(method,path) for method,path,_ in self.requests],[('GET','/v1/session')]*30)
  self.assertEqual(self.blocks,[])
  self.assertEqual((self.report['sent'],self.report['dropped'],self.report['dropReasons'],self.report['retries']),
   (0,1,{'deliveryExpired':1},30))
  self.assertEqual((self.report['connection'],self.report['stopReason'],self.report['lastRefusal']),('reconnecting',None,None))

 def test_stop_during_network_recovery_prevents_new_attempts_before_the_deadline(self):
  item=self.prepare_delivery()
  self.disconnect=True
  clock=[100.0]
  def wait(delay):
   clock[0]+=delay
   self.stop.set()
  with patch('transport.time',SimpleNamespace(monotonic=lambda:clock[0])),patch.object(self.stop,'wait',side_effect=wait):
   self.assertFalse(self.transport.deliver(item,100.0))
  self.assertEqual(clock[0],101.0)
  self.assertEqual(len(self.requests),1)
  self.assertEqual(self.blocks,[])
  self.assertEqual((self.report['sent'],self.report['dropped'],self.report['dropReasons'],self.report['retries']),
   (0,1,{'stopped':1},1))
  self.assertEqual((self.report['connection'],self.report['stopReason'],self.report['lastRefusal']),('reconnecting',None,None))

 def test_expiration_while_reading_session_prevents_the_following_post(self):
  item=self.prepare_delivery()
  clock=[100.0]
  self.after_get=lambda:clock.__setitem__(0,130.0)
  with patch('transport.time',SimpleNamespace(monotonic=lambda:clock[0])):
   self.assertFalse(self.transport.deliver(item,100.0))
  self.assertEqual([(method,path) for method,path,_ in self.requests],[('GET','/v1/session')])
  self.assertEqual((self.report['sent'],self.report['dropped'],self.report['dropReasons'],self.report['retries']),
   (0,1,{'deliveryExpired':1},0))

 def test_recovery_and_ambiguous_ack_retry_same_sequence(self):
  self.assertTrue(self.transport.deliver({'sessionId':'one','sequence':1},time.monotonic(),ttl=5))
  self.assertEqual(self.report['retries'],2);self.assertEqual(self.accepted,{1});self.assertEqual(self.report['sent'],1)
 def test_expired_or_cancelled_buffer_is_not_sent(self):
  self.assertFalse(self.transport.deliver({'sessionId':'one','sequence':1},time.monotonic()-31))
  self.stop.set();self.assertFalse(self.transport.deliver({'sessionId':'one','sequence':2},time.monotonic()))
  self.assertEqual(self.attempts,0)
  # Every lost block names its cause; the total shown by the panel is unchanged.
  self.assertEqual(self.report['dropReasons'],{'deliveryExpired':1,'stopped':1});self.assertEqual(self.report['dropped'],2)
 def test_delivery_keeps_each_http_refusal_and_rejects_sequence_conflicts_without_retry(self):
  self.failures=0
  self.ambiguous=False
  for sequence,code in enumerate(('read-only','storage-full','stale-sequence','sequence-conflict','capture-changed'),1):
   expected=REFUSED_REPORTS[code]['lastRefusal']
   self.refuse=(expected['status'],{'code':expected['code'],'error':'Reformulé : 409 / 507, même refus.'})
   with self.subTest(code=code),patch.object(self.stop,'wait',side_effect=AssertionError('no retry for this refusal')):
    if code in ('read-only','storage-full'):
     with self.assertRaises(ReadOnly if code=='read-only' else StorageFull):
      self.transport.deliver({'sessionId':'one','sequence':sequence},time.monotonic())
    else:self.assertFalse(self.transport.deliver({'sessionId':'one','sequence':sequence},time.monotonic()))
    self.assertEqual(self.report.get('lastRefusal'),expected)
    self.assertEqual((self.attempts,self.report['dropped'],self.report['sent'],self.report['retries']),(sequence,sequence,0,0))
  self.assertEqual(self.report['dropReasons'],{'readOnly':1,'storageFull':1,'deliveryRejected':3})
  self.assertEqual(self.report['errors'],['HTTP 409']*3)
  self.refuse=None
  self.assertTrue(self.transport.deliver({'sessionId':'one','sequence':6},time.monotonic()))
  self.assertEqual((self.report.get('lastRefusal'),self.report['sent']),(REFUSED_REPORTS['capture-changed']['lastRefusal'],1))
 def test_storage_status_without_code_stops_but_a_foreign_code_keeps_the_retry_policy(self):
  self.failures=0
  self.ambiguous=False
  self.refusals=[(507,{'error':'Reformulé sans numéro.'})]
  with self.assertRaises(StorageFull):
   self.transport.deliver({'sessionId':'one','sequence':1},time.monotonic())
  self.assertEqual(self.report.get('lastRefusal'),{'status':507,'code':None})
  self.refusals=[(507,{'error':'Stockage plein 507 / lecture seule 409.','code':'other-refusal'})]
  clock=[0.0]
  with patch('transport.time.monotonic',side_effect=lambda:clock[0]),\
    patch.object(self.stop,'wait',side_effect=lambda delay:clock.__setitem__(0,clock[0]+delay)) as pause:
   try:delivered=self.transport.deliver({'sessionId':'one','sequence':2},0.0,ttl=5)
   except SessionChanged as error:delivered=error.reason
  self.assertIs(delivered,True)
  pause.assert_called_once_with(1)
  self.assertEqual(self.sequences,[1,2,2])
  self.assertEqual(self.report['lastRefusal'],{'status':507,'code':'other-refusal'})
  self.assertEqual((self.report['sent'],self.report['dropped'],self.report['dropReasons'],self.report['retries']),
   (1,1,{'storageFull':1},1))
 def test_network_failure_keeps_the_last_http_refusal_even_when_its_text_contains_status_numbers(self):
  previous=REFUSED_REPORTS['stale-sequence']['lastRefusal']
  self.report['lastRefusal']=previous
  with patch('transport.urllib.request.urlopen',side_effect=urllib.error.URLError('409 images / 507 octets')),\
    patch.object(self.stop,'wait',side_effect=lambda _:self.stop.set()):
   self.assertFalse(self.transport.deliver({'sessionId':'one','sequence':1},time.monotonic()))
  self.assertEqual(self.report['lastRefusal'],previous)
  self.assertEqual(self.report['connection'],'reconnecting')
  self.assertEqual((self.report['retries'],self.report['sent'],self.report['dropped'],self.report['dropReasons']),
   (1,0,1,{'stopped':1}))
  self.assertEqual(self.report['errors'],[])
 def test_internal_server_error_retries_the_same_sequence_then_counts_the_accepted_block(self):
  self.failures=0;self.ambiguous=False
  self.refusals=[(500,{'error':'Erreur interne du serveur.','code':'internal-error'})]
  clock=[0.0]
  def wait(delay):clock[0]+=delay
  with patch('transport.time.monotonic',side_effect=lambda:clock[0]),patch.object(self.stop,'wait',side_effect=wait) as pause:
   self.assertTrue(self.transport.deliver({'sessionId':'one','sequence':7},0.0,ttl=5))
  pause.assert_called_once_with(1)
  self.assertEqual(self.sequences,[7,7])
  self.assertEqual(self.accepted,{7})
  self.assertEqual(self.report,{'sent':1,'dropped':0,'retries':1,'errors':[],'connection':'connected',
   'lastRefusal':{'status':500,'code':'internal-error'}})
 def test_restart_does_not_move_buffer_into_new_session(self):
  self.failures=0;self.session='two'
  with self.assertRaises(SessionChanged):self.transport.deliver({'sessionId':'one','sequence':1},time.monotonic())
  self.assertEqual(self.attempts,0)
  # The block in flight is lost with the session: it is counted, with its cause.
  self.assertEqual(self.report['dropped'],1);self.assertEqual(self.report['dropReasons'],{'sessionChanged':1})
 def test_full_storage_is_an_answer_of_the_server_never_a_network_cut(self):
  self.failures=0;self.refuse=(507,{'error':'Espace disque insuffisant.','code':'storage-full'})
  with self.assertRaises(StorageFull) as stopped:self.transport.deliver({'sessionId':'one','sequence':1},time.monotonic(),ttl=5)
  # One attempt, no retry, no "reconnecting": the capture stops and says storage.
  self.assertEqual((stopped.exception.reason,self.attempts,self.report['retries'],self.report['dropReasons']),('storage-full',1,0,{'storageFull':1}))
  self.assertIsInstance(stopped.exception,SessionChanged);self.assertIn('Stockage plein',str(stopped.exception))
  self.assertNotIn('connection',self.report)
  # The paused session says so itself: the next block is not even posted, and the cause is still storage.
  self.refuse=None;self.state={'accepting':False,'storage':{'state':'blocked'}}
  with self.assertRaises(StorageFull):self.transport.deliver({'sessionId':'one','sequence':2},time.monotonic(),ttl=5)
  self.assertEqual((self.attempts,self.report['dropReasons'],self.report['dropped']),(1,{'storageFull':2},2))
 def test_archive_open_read_only_stops_by_name_and_a_plain_conflict_stays_a_rejected_block(self):
  self.failures=0;self.refuse=(409,{'error':'Session ouverte en lecture seule. Choisis Reprendre la capture ou Nouvelle session.','code':'read-only'})
  with self.assertRaises(ReadOnly) as stopped:self.transport.deliver({'sessionId':'one','sequence':1},time.monotonic(),ttl=5)
  self.assertEqual((stopped.exception.reason,self.report['dropReasons'],self.report['retries']),('read-only',{'readOnly':1},0))
  self.refuse=(409,{'error':'Séquence ancienne.'})
  self.assertFalse(self.transport.deliver({'sessionId':'one','sequence':2},time.monotonic(),ttl=5))
  self.assertEqual((self.report['dropReasons'],self.report['errors']),({'readOnly':1,'deliveryRejected':1},['HTTP 409']))
 def test_unreadable_image_is_dropped_after_one_http_400_without_retry(self):
  self.failures=0
  self.refuse=(400,{'error':'Image illisible.','code':'image-unreadable'})
  with patch.object(self.stop,'wait',side_effect=AssertionError('a content refusal must not wait for a retry')):
   self.assertFalse(self.transport.deliver({'sessionId':'one','sequence':1},time.monotonic(),ttl=5))
  self.assertEqual(self.attempts,1)
  self.assertEqual(self.accepted,set())
  self.assertEqual(self.report,{'sent':0,'dropped':1,'retries':0,'errors':['HTTP 400'],
   'dropReasons':{'deliveryRejected':1},'lastRefusal':{'status':400,'code':'image-unreadable'}})
if __name__=='__main__':unittest.main()
