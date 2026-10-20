"""Sonde de fonctionnement de la vision locale ; aucune mesure comparative."""
import base64
import hashlib
import json
import time
from pathlib import Path
from urllib.request import Request, urlopen

root = Path('/home/nvidia/tvlens-setup/smoke/kennedy-16s')
frame = root / 'preparation/blocks/000000/frame-0.jpg'
image = frame.read_bytes()
payload = {'model': 'gemma3:4b', 'stream': False, 'keep_alive': '10m',
           'messages': [{'role': 'user', 'content': 'Décris brièvement ce qui est visible dans cette image.',
                         'images': [base64.b64encode(image).decode()]}],
           'options': {'num_ctx': 8192, 'num_predict': 96, 'temperature': 0}}
start = time.monotonic()
request = Request('http://127.0.0.1:11434/api/chat', json.dumps(payload).encode(),
                  {'Content-Type': 'application/json'})
with urlopen(request, timeout=180) as response:
    result = json.load(response)
with urlopen('http://127.0.0.1:11434/api/ps', timeout=20) as response:
    models = json.load(response)
output = {'usage': 'sonde de fonctionnement pendant les téléchargements, pas un benchmark',
          'imageSha256': hashlib.sha256(image).hexdigest(), 'wallS': time.monotonic() - start,
          'result': result, 'loadedModels': models}
(root / 'vision.json').write_text(json.dumps(output, ensure_ascii=False, indent=2) + '\n')
print(json.dumps(output, ensure_ascii=False))
