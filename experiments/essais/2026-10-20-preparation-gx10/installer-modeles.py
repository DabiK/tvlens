"""Télécharge les trois modèles locaux de départ sans lancer d'inférence."""
import json
from datetime import datetime, timezone
from urllib.request import Request, urlopen

API = 'http://127.0.0.1:11434'
MODELS = ['gemma3:4b', 'qwen3.8:27b', 'qwen3-embedding:0.6b']


def note(value):
    print(datetime.now(timezone.utc).isoformat(), value, flush=True)


for model in MODELS:
    note({'model': model, 'status': 'start'})
    request = Request(API + '/api/pull', json.dumps({'model': model}).encode(),
                      {'Content-Type': 'application/json'})
    previous = None
    with urlopen(request, timeout=1800) as response:
        for raw in response:
            data = json.loads(raw)
            if 'error' in data:
                raise RuntimeError(data['error'])
            bucket = int(data.get('completed', 0) * 10 / max(1, data.get('total', 1)))
            marker = (data.get('status'), bucket)
            if marker != previous:
                note({'model': model, **data})
                previous = marker
    if data.get('status') != 'success':
        raise RuntimeError('Téléchargement non confirmé : ' + model)

with urlopen(API + '/api/tags', timeout=30) as response:
    note({'installed': json.load(response)})
