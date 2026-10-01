"""Import the approved Yann take and compose a quiet original instrumental bed.

Run from any directory: python3 film/scripts/prepare-audio.py
Cuts were aligned using local French transcription and silence detection.
The source hash prevents applying these cuts to a different recording.
"""
from pathlib import Path
from array import array
import hashlib
import json
import math
import shutil
import subprocess
import wave

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'public/audio'
WORK = ROOT / '.cache/audio'
WORK.mkdir(parents=True, exist_ok=True)
SOURCE = OUT / 'imports/tvlens-voix-complete.mp3'
EXPECTED = 'f5a6762af71c3e2e2fcbb40e21b40bf981a51c5e078b117c3605b4ae649680c7'
if hashlib.sha256(SOURCE.read_bytes()).hexdigest() != EXPECTED:
    raise SystemExit('Different recording: realign the cuts before importing.')

def ffmpeg(*args):
    subprocess.run(['ffmpeg', '-v', 'error', '-y', *map(str, args)], check=True)

plan = json.loads((ROOT / 'scripts/voiceover.json').read_text())
cuts = [(0.04, 2.27), (2.44, 4.62), (4.87, 12.18), (12.49, 15.918),
        (15.918, 18.15), (18.30, 19.95), (20.07, 20.785),
        (20.785, 25.96), (26.10, 29.67)]
# Normalize the full performance together to retain the narrator's dynamics.
ffmpeg('-i', SOURCE, '-af', 'loudnorm=I=-18:TP=-2:LRA=7',
       '-ar', 48000, '-ac', 1, WORK / 'normalized.wav')
manifest = []
for cue, (start, end) in zip(plan, cuts):
    window = cue['durationInFrames'] / 30
    speed = max(1.0, (end - start) / (window - .06))
    assert speed <= 1.15, 'Adjust the scene instead of rushing the voice.'
    duration = (end - start) / speed
    ffmpeg('-i', WORK / 'normalized.wav',
           '-af', f'atrim=start={start}:end={end},asetpts=PTS-STARTPTS,atempo={speed},afade=t=in:d=0.008,afade=t=out:st={duration-.018}:d=0.018',
           '-ar', 48000, WORK / f"{cue['name']}.wav")
    manifest.append({**cue, 'sourceStart': start, 'sourceEnd': end,
                     'playbackRate': round(speed, 6), 'duration': round(duration, 6),
                     'voice': 'Yann · ElevenLabs website import'})

# Warm sustained chords, soft stereo plucks, no vocals or samples.
RATE = 24000
N = 58 * RATE
left, right = array('f', [0]) * N, array('f', [0]) * N
def hz(midi):
    return 440 * 2 ** ((midi - 69) / 12)

def note(at, length, midi, gain, pan=0, pad=False):
    first = int(at * RATE)
    freq = hz(midi)
    lg, rg = math.sqrt((1-pan)/2), math.sqrt((1+pan)/2)
    for j in range(min(int(length * RATE), N-first)):
        t = j / RATE
        if pad:
            env = min(1, t / 1.3) * min(1, (length-t)/1.8)
            val = .65 * math.sin(2*math.pi*freq*t) + .25 * math.sin(2*math.pi*freq*1.0018*t)
        else:
            env = min(1, t/.012) * math.exp(-t/0.34) * min(1, (length-t)/.12)
            val = math.sin(2*math.pi*freq*t) + .18*math.sin(2*math.pi*freq*2*t)
        val *= env * gain
        left[first+j] += val * lg
        right[first+j] += val * rg

chords = [[50,57,61,66,69], [47,54,57,62,66], [43,50,54,57,62],
          [45,52,57,59,64], [50,57,61,66,69], [50,57,61,66,74]]
for bar, chord in enumerate(chords):
    at = 2.6 + 10 * bar
    for k, pitch in enumerate(chord):
        note(at, min(11.5, 58-at), pitch, .024 if k else .036, (k-2)*.25, True)
    for step in range(16):
        onset = at + step*.625
        if onset >= 54 or 23.8 < onset < 28:
            continue
        pitch = chord[[2,3,4,3,1,3,4,2][step % 8]] + 12
        pan = -.38 if step % 2 == 0 else .38
        note(onset, 1.3, pitch, .023 if step % 4 == 0 else .013, pan)
        note(onset+.3125, 1.5, pitch, .004, -pan)

def smooth(x):
    x = max(0, min(1, x))
    return x*x*(3-2*x)

pcm = array('h')
for i in range(N):
    t = i / RATE
    gain = smooth((t-2.5)/1.2) * smooth((58-t)/1.4)
    # Music ducks around actual speech; reading-source scene stays restrained.
    duck = 1.0
    for cue in manifest:
        start = cue['from']/30
        end = start + cue['duration']
        influence = smooth((t-start+.18)/.18) * smooth((end+.38-t)/.38)
        duck = min(duck, 1-.5*influence)
    if 24 <= t <= 28:
        duck = min(duck, .6)
    gain *= duck
    pcm.extend((int(max(-1, min(1, left[i]*gain))*32767),
                int(max(-1, min(1, right[i]*gain))*32767)))
with wave.open(str(WORK / 'music-raw.wav'), 'wb') as wav:
    wav.setnchannels(2)
    wav.setsampwidth(2)
    wav.setframerate(RATE)
    wav.writeframes(pcm.tobytes())
ffmpeg('-i', WORK / 'music-raw.wav', '-af', 'loudnorm=I=-32:TP=-9:LRA=12',
       '-ar', 48000, WORK / 'music-bed.wav')

for cue in manifest:
    shutil.copy2(WORK / f"{cue['name']}.wav", OUT / f"{cue['name']}.wav")
shutil.copy2(WORK / 'music-bed.wav', OUT / 'music-bed.wav')
(OUT / 'voiceover.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2)+'\n')
(ROOT / 'src/voiceover-state.ts').write_text(
    '// Enabled after the complete imported narration was aligned.\nexport const voiceoverReady = true;\n')
for cue in manifest:
    print(f"{cue['name']}: {cue['duration']:.2f}s at {cue['from']/30:.2f}s, speed {cue['playbackRate']:.3f}")
print('Original music bed: 58s, stereo, target -32 LUFS, ducked under narration.')
