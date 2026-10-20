"""Place les six vidéos terminées dans le corpus et vérifie leur intégrité."""
import hashlib
import json
import shutil
import subprocess
from pathlib import Path

source = Path('/home/nvidia/tvlens-setup/corpus/videos')
target = Path('/srv/tvlens-gx10/videos')
rows = json.loads((source / 'corpus.json').read_text())
if {row['id'] for row in rows} != {'04', '05', '08', '09'}:
    raise RuntimeError('Le noyau téléchargé ne contient pas les quatre vidéos attendues')


def sha(file):
    with file.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


for row in rows:
    original = Path(row['file'])
    destination = target / original.name
    if destination.exists() and sha(destination) != row['sha256']:
        raise RuntimeError('Un fichier différent existe déjà : ' + destination.name)
    if not destination.exists():
        shutil.copy2(original, destination)
    if sha(destination) != row['sha256']:
        raise RuntimeError('Empreinte incorrecte : ' + destination.name)
    row['file'] = str(destination)

for name, language in [('kennedy-rice-7min.mp4', 'en'), ('spring.mp4', 'none')]:
    file = target / name
    duration = subprocess.check_output(['ffprobe', '-v', 'error', '-show_entries',
                                       'format=duration', '-of', 'csv=p=0', str(file)], text=True)
    rows.append({'id': name.split('.')[0], 'file': str(file), 'language': language,
                 'source': 'media/samples/' + name, 'sha256': sha(file),
                 'durationS': float(duration), 'bytes': file.stat().st_size})

manifest = target / 'corpus-6-videos.json'
manifest.write_text(json.dumps(rows, ensure_ascii=False, indent=2) + '\n')
print(json.dumps({'videos': len(rows), 'manifest': str(manifest)}, ensure_ascii=False))
