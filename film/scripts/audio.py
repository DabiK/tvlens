"""Local French guide voice + original, deterministic sound design. No API key."""
from pathlib import Path
import subprocess, json, math, wave, struct, random
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'public'/'audio'/'guide'; OUT.mkdir(parents=True,exist_ok=True)
lines=[
 ('ask',3.25,3.4,'Tu veux vérifier ? Demande simplement.'),
 ('context',11.25,4.2,'TV Lens sait déjà de quoi tu parles.'),
 ('answer',16.2,7.5,'Il retrouve l’affirmation, cherche les sources, et te montre ce qu’elles permettent réellement de conclure.'),
 ('followup',28.3,5.2,'Et le contexte ne disparaît pas quand la vidéo avance.'),
 ('memory',34.35,5.,'TV Lens garde la mémoire du programme.'),
 ('tv',40.25,4.0,'Directement sur la télévision.'),
 ('mac',45.25,2.5,'Et sur Mac.'),
 ('future',49.15,4.65,'Prochaine étape : tester la compréhension en local sur ASUS GX dix.'),
 ('end',54.1,3.75,'Tu regardes. Tu demandes. TV Lens cherche les preuves.'),
]
manifest=[]
for name,start,window,text in lines:
 aiff=OUT/f'{name}.aiff'; wav=OUT/f'{name}.wav'
 subprocess.run(['say','-v','Thomas','-r','185','-o',str(aiff),text],check=True)
 dur=float(subprocess.check_output(['ffprobe','-v','error','-show_entries','format=duration','-of','default=nw=1:nk=1',str(aiff)]))
 speed=max(1,dur/window)
 subprocess.run(['ffmpeg','-v','error','-y','-i',str(aiff),'-af',f'atempo={speed},afade=t=in:d=0.025,afade=t=out:st={min(window,dur)-.04}:d=0.04','-ar','48000',str(wav)],check=True)
 aiff.unlink()
 manifest.append({'name':name,'start':start,'text':text,'duration':round(dur/speed,3),'guideVoice':'macOS Thomas'})
 print(name,round(dur/speed,2),flush=True)
(OUT/'voiceover.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2))
# Quiet original pulse bed, chimes and clicks. Score ducks under every spoken line.
rate=24000; n=58*rate; samples=[0.0]*n
rng=random.Random(19)
def tone(at,duration,hz,amp):
 start=int(at*rate)
 for j in range(min(int(duration*rate),n-start)):
  t=j/rate; env=min(1,t/.015)*math.exp(-t*5/duration)
  samples[start+j]+=amp*env*(math.sin(2*math.pi*hz*t)+.22*math.sin(2*math.pi*2*hz*t))
for at in [1.5,3.4,7.3,9.6,11.7,12.6,16.3,24.25,28.4,35.7,37.,40.1,45.,49.,54.]:
 tone(at,.22,540 if at>3 else 130,.07)
 tone(at+.012,.35,1080,.018)
for beat in range(82):
 at=3.4+beat*.625
 if at>54:break
 if 24<at<28:continue
 tone(at,.23,65,.02)
 if beat%4==0:
  tone(at,1.6,[220,261.626,293.665,196][(beat//4)%4],.008)
tone(54.4,2.9,220,.019);tone(54.4,2.9,330,.013);tone(54.4,2.9,440,.008)
with wave.open(str(OUT.parent/'sound-design.wav'),'wb') as w:
 w.setnchannels(1);w.setsampwidth(2);w.setframerate(rate)
 w.writeframes(b''.join(struct.pack('<h',int(max(-.95,min(.95,x))*32767)) for x in samples))
