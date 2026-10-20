"""Empreintes des poids et configurations réellement téléchargés."""
from pathlib import Path
import sys
from night_common import digest, utc, write

root = Path(sys.argv[1]) / 'models--nvidia--Qwen3.8-27B-NVFP4/snapshots/482ca0f3832238542f8f5295dde86b5f22711d80'
files = {str(p.relative_to(root)): {'sha256': digest(p), 'bytes': p.stat().st_size} for p in sorted(root.rglob('*')) if p.is_file()}
if not files or not any(name.endswith('.safetensors') for name in files):
    raise RuntimeError('MODEL_WEIGHTS_MISSING')
write(sys.argv[2], {'atUtc': utc(), 'files': files})
