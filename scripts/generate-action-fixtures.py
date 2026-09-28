"""Fixed synthetic temporal corpus; no labels or answers drawn in the frames."""
from PIL import Image, ImageDraw
import subprocess, pathlib, json, math
root=pathlib.Path('.local/action-fixtures'); root.mkdir(parents=True,exist_ok=True)
cases=[
 ('red-crossing','Un carré rouge traverse de gauche à droite.', [['rouge'],['gauche'],['droite']]),
 ('blue-falling','Un cercle bleu descend du haut vers le bas.', [['bleu'],['descend','bas']]),
 ('green-expanding','Un rectangle vert s’élargit.', [['vert'],['élarg','elarg','grand','étend','etend','augmen']]),
 ('yellow-blinks','Un cercle jaune apparaît deux fois.', [['jaune'],['deux','2']]),
 ('square-color','Le carré rouge devient bleu puis redevient rouge.', [['bleu'],['rouge']]),
 ('swap-positions','Le cercle rouge et le carré bleu échangent leurs positions.', [['rouge'],['bleu'],['échang','echang','invers','crois']]),
 ('orange-triangle','Un triangle orange apparaît brièvement.', [['triangle'],['orange']]),
 ('purple-shrinking','Un cercle violet rétrécit.', [['violet','pourpre'],['rétr','retr','diminu','petit']]),
 ('green-rotation','Une barre verte tourne de l’horizontale à la verticale.', [['vert'],['vertical','tourn','rotat']]),
 ('cyan-converging','Deux cercles cyan se rapprochent.', [['deux','2'],['rapproch','converg','rejoi']])]
manifest=[]
for index,(name,expected,terms) in enumerate(cases):
 target=root/f'{index+1:02d}.webm'
 ff=subprocess.Popen(['/opt/homebrew/bin/ffmpeg','-y','-hide_banner','-loglevel','error','-f','rawvideo','-pixel_format','rgb24','-video_size','384x216','-framerate','10','-i','pipe:0','-c:v','libvpx','-deadline','realtime','-b:v','500k',str(target)],stdin=subprocess.PIPE)
 for frame in range(60):
  t=frame/10; active=1<=t<4; u=max(0,min(1,(t-1)/3))
  img=Image.new('RGB',(384,216),(245,245,240));d=ImageDraw.Draw(img)
  def rect(x,y,w,h,c):d.rectangle((x-w/2,y-h/2,x+w/2,y+h/2),fill=c)
  def circle(x,y,r,c):d.ellipse((x-r,y-r,x+r,y+r),fill=c)
  if index==0 and active:rect(40+300*u,108,44,44,'red')
  if index==1 and active:circle(192,30+155*u,22,'blue')
  if index==2 and active:rect(192,108,25+270*u,45,'green')
  if index==3 and (1<=t<1.8 or 2.5<=t<3.3):circle(192,108,32,'gold')
  if index==4:rect(192,108,60,60,'blue' if active else 'red')
  if index==5:
   v=u if active else (1 if t>=4 else 0)
   if t>=4.5:v=0
   circle(65+250*v,78,25,'red');rect(315-250*v,145,50,50,'blue')
  if index==6 and active:d.polygon([(192,55),(140,150),(244,150)],fill='orange')
  if index==7 and active:circle(192,108,65-50*u,'purple')
  if index==8 and active:
   a=math.pi/2*u;dx=75*math.cos(a);dy=75*math.sin(a);d.line((192-dx,108-dy,192+dx,108+dy),fill='green',width=18)
  if index==9 and active:circle(50+110*u,108,25,'cyan');circle(334-110*u,108,25,'cyan')
  if frame in (0,50):img.save(root/f'{index+1:02d}-{frame}.jpg')
  ff.stdin.write(img.tobytes())
 ff.stdin.close(); assert ff.wait()==0
 manifest.append({'id':index+1,'file':target.name,'question':'Décris précisément le changement ou mouvement bref observé dans ce passage, avec sa couleur, sa direction ou son nombre de répétitions si pertinent.','expected':expected,'matchGroups':terms,'eventStartMs':1000,'eventEndMs':4500})
(root/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2))
print('10 clips synthétiques fixes générés (6 secondes, 10 images/s).')
