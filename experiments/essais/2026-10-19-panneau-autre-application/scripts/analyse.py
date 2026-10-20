"""Mesure une sonde : luminance de la capture dans le rectangle vidéo, niveau de l'audio enregistré.
Usage : python3 analyse.py <dossier brut> <nom>"""
import json, math, sys, wave, array
from pathlib import Path
from PIL import Image
base, name = Path(sys.argv[1]), sys.argv[2]
for shot in sorted(base.glob(f"{name}-*.png")):
    image = Image.open(shot).convert("L")
    pixels = list(image.getdata())
    dark = sum(p < 16 for p in pixels) / len(pixels)
    print(f"{shot.name} : luminance moyenne {sum(pixels) / len(pixels):.1f}, pixels noirs {dark:.0%}")
audio = base / f"{name}.wav"
if audio.exists():
    with wave.open(str(audio)) as w:
        samples = array.array("h", w.readframes(w.getnframes()))
    rms = math.sqrt(sum(s * s for s in samples) / max(1, len(samples)))
    peak = max((abs(s) for s in samples), default=0)
    print(f"{audio.name} : {len(samples) / 2 / 48000:.1f} s, RMS {20 * math.log10(max(rms, 1) / 32768):.1f} dBFS, crête {peak}")
