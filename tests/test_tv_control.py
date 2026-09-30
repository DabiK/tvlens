import fcntl
import json
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
from controller import CaptureController, DeviceServer
from transport import Transport, SessionChanged

class ControlTests(unittest.TestCase):
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
    missing.exception.close()
   finally:
    controller.stop();server.shutdown();server.server_close();thread.join()

class DeliveryTests(unittest.TestCase):
 def setUp(self):
  self.session='one';self.failures=1;self.accepted=set();self.attempts=0;self.ambiguous=True
  owner=self
  class Handler(BaseHTTPRequestHandler):
   def log_message(self,*_):pass
   def reply(self,code,value):
    self.send_response(code);self.end_headers();self.wfile.write(json.dumps(value).encode())
   def do_GET(self):
    if owner.failures:owner.failures-=1;return self.reply(503,{})
    self.reply(200,{'id':owner.session,'accepting':True})
   def do_POST(self):
    item=json.loads(self.rfile.read(int(self.headers['Content-Length'])))
    owner.attempts+=1;owner.accepted.add(item['sequence'])
    if owner.ambiguous:owner.ambiguous=False;return self.reply(503,{})
    self.reply(200,{'duplicate':True})
  self.server=ThreadingHTTPServer(('127.0.0.1',0),Handler)
  self.thread=threading.Thread(target=self.server.serve_forever);self.thread.start()
  self.stop=threading.Event();self.report={'sent':0,'dropped':0,'retries':0,'errors':[]}
  self.transport=Transport({'url':'http://127.0.0.1:'+str(self.server.server_port),'token':'x'*64},self.stop,self.report)
 def tearDown(self):self.server.shutdown();self.server.server_close();self.thread.join()
 def test_recovery_and_ambiguous_ack_retry_same_sequence(self):
  self.assertTrue(self.transport.deliver({'sessionId':'one','sequence':1},time.monotonic(),ttl=5))
  self.assertEqual(self.report['retries'],2);self.assertEqual(self.accepted,{1});self.assertEqual(self.report['sent'],1)
 def test_expired_or_cancelled_buffer_is_not_sent(self):
  self.assertFalse(self.transport.deliver({'sessionId':'one','sequence':1},time.monotonic()-31))
  self.stop.set();self.assertFalse(self.transport.deliver({'sessionId':'one','sequence':2},time.monotonic()))
  self.assertEqual(self.attempts,0)
 def test_restart_does_not_move_buffer_into_new_session(self):
  self.failures=0;self.session='two'
  with self.assertRaises(SessionChanged):self.transport.deliver({'sessionId':'one','sequence':1},time.monotonic())
  self.assertEqual(self.attempts,0)
if __name__=='__main__':unittest.main()
