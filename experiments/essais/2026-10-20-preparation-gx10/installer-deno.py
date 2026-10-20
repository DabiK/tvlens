"""Installe Deno depuis la publication officielle GitHub, avec vérification du SHA-256."""
import hashlib
import io
import json
import zipfile
from pathlib import Path
from urllib.request import urlopen

VERSION = 'v2.9.7'
NAME = 'deno-aarch64-unknown-linux-gnu.zip'
with urlopen('https://api.github.com/repos/denoland/deno/releases/tags/' + VERSION, timeout=30) as response:
    release = json.load(response)
asset = next(item for item in release['assets'] if item['name'] == NAME)
with urlopen(asset['browser_download_url'], timeout=120) as response:
    archive = response.read()
actual = 'sha256:' + hashlib.sha256(archive).hexdigest()
if actual != asset['digest']:
    raise RuntimeError('Empreinte de Deno incorrecte')
root = Path.home() / '.deno/bin'
root.mkdir(parents=True, exist_ok=True)
with zipfile.ZipFile(io.BytesIO(archive)) as bundle:
    payload = bundle.read('deno')
target = root / 'deno'
target.write_bytes(payload)
target.chmod(0o755)
print(VERSION, actual, len(archive), 'octets : installé')
