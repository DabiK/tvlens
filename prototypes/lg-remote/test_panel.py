import sys,unittest,tempfile,os
from unittest.mock import patch
from pathlib import Path
sys.path.insert(0,str(Path(__file__).parent/'runtime'))
from panel import rectangles,parse_reply,recovery_due
import panel
class Rectangles(unittest.TestCase):
 def source(self):
  return {'appId':'youtube.leanback.v4','connected':True,'context':'test','fullScreen':False,'width':1920,'height':1080,'sourceInput':{'x':0,'y':0,'width':1920,'height':1080},'displayOutput':{'x':0,'y':0,'width':3840,'height':2160}}
 def test_preserves_full_source_and_aspect(self):
  v=self.source();restore,target=rectangles(v)
  self.assertEqual(target['sourceInput'],v['sourceInput'])
  self.assertEqual(target['displayOutput']['width']/target['displayOutput']['height'],16/9)
  self.assertEqual(restore['displayOutput']['width'],1920)
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
if __name__=='__main__':unittest.main()
