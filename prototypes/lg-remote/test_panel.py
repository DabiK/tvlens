import sys,unittest,tempfile,os
from unittest.mock import patch
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
if __name__=='__main__':unittest.main()
