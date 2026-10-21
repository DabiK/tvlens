"""Capturer les preuves closes en lecture seule, sans API modèle ni poids."""
import hashlib
import json
from pathlib import Path
import subprocess


REMOTE = r'''
import datetime
import hashlib
import json
from pathlib import Path

base = Path('/home/nvidia/tvlens-setup')
roots = {
    'qwen': base / 'reprise-qwen-20261020T224923Z/results',
    'streaming': base / 'reprise-streaming-20261020T224923Z/results',
}
report = {'capturedAtUtc': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'roots': {}}
for label, root in roots.items():
    seal = json.loads((root / 'integrite.json').read_text())
    checked = {}
    for name, expected in seal['files'].items():
        path = root / name
        if path.is_symlink() or not path.resolve().is_relative_to(root.resolve()):
            raise RuntimeError('UNSAFE_SEALED_PATH')
        observed = hashlib.sha256(path.read_bytes()).hexdigest()
        checked[name] = {'expected': expected, 'actual': observed, 'match': expected == observed}
    names = ['status.json', 'events.jsonl', 'integrite.json', 'protocol.json']
    if label == 'qwen':
        names += ['ollama-tags-before.json', 'ollama-tags-after.json', 'ollama-pull/command.json',
                  'ollama-pull/stdout.log', 'ollama-pull/stderr.log', 'source/queue.py',
                  'source-files.json', 'vllm-preflight/campaign.json', 'vllm-full/campaign.json',
                  'vllm-preflight/integrite.json', 'vllm-full/integrite.json',
                  'vision-server-stopped.json', 'cuda-check-stopped.json', 'model-download-stopped.json']
    files = {}
    for name in names:
        path = root / name
        if path.is_file():
            data = path.read_bytes()
            files[name] = {'sha256': hashlib.sha256(data).hexdigest(), 'text': data.decode()}
    report['roots'][label] = {'root': str(root), 'checked': checked, 'files': files,
                              'allSealedFilesMatch': all(item['match'] for item in checked.values())}
print(json.dumps(report, ensure_ascii=False))
'''


def main():
    target = Path(__file__).resolve().parent / 'preuves' / 'capture.json'
    if target.exists():
        raise RuntimeError('CAPTURE_ALREADY_EXISTS')
    command = ['ssh', '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=15', '-o', 'ControlMaster=no',
               '-o', 'ControlPath=none', 'gx10-tvlens', 'python3 -']
    result = subprocess.run(command, input=REMOTE, text=True, capture_output=True, check=True, timeout=60)
    report = json.loads(result.stdout)
    if not all(item['allSealedFilesMatch'] for item in report['roots'].values()):
        raise RuntimeError('REMOTE_SEAL_MISMATCH')
    target.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({'path': str(target), 'sha256': hashlib.sha256(target.read_bytes()).hexdigest(),
                      'verifiedFiles': {key: len(value['checked']) for key, value in report['roots'].items()}}))


if __name__ == '__main__':
    main()
