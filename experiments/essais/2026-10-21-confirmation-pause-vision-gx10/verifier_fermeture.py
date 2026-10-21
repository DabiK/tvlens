"""Contrôle le sceau et la libération GPU avant l'essai suivant."""
import argparse
import fcntl
import hashlib
import json
from pathlib import Path
import subprocess
import sys


def digest(path):
    with path.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def verify_seal(root):
    seal = json.loads((root / 'integrite.json').read_text())['files']
    actual = {str(path.relative_to(root)) for path in root.rglob('*') if path.is_file() and path != root / 'integrite.json'}
    if actual != set(seal) or any(digest(root / name) != expected for name, expected in seal.items()):
        raise ValueError('OUTPUT_INTEGRITY_DIFFERENT')
    closure = json.loads((root / 'closure.json').read_text())
    status = json.loads((root / 'status.json').read_text())
    if status['status'] != 'finished' or closure != {
            'complete': True, 'locksReleased': True, 'ownedProcessesStopped': True,
            'containersCreated': False, 'completedPassages': 8, 'expectedPassages': 8,
            'readyForScoring': False}:
        raise ValueError('CONFIRMATION_NOT_CLOSED')
    return digest(root / 'integrite.json')


def verify(root, reference):
    seal_digest = verify_seal(root)
    locks = []
    try:
        for path in (Path('/home/nvidia/tvlens-setup/night.lock'), reference / 'execution.lock',
                     Path('/home/nvidia/tvlens-setup/followup-gpu.lock')):
            handle = path.open('rb')
            locks.append(handle)
            fcntl.flock(handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
        process = subprocess.run(['pgrep', '-f', 'replay-local-(stream|perception)|replay-reinspection'],
                                 capture_output=True, text=True, check=False)
        if process.returncode != 1:
            raise ValueError('REPLAY_STILL_ACTIVE_OR_PROCESS_GUARD_FAILED')
    finally:
        for handle in reversed(locks):
            handle.close()
    return {'closed': True, 'integritySha256': seal_digest, 'passages': 8}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--out', type=Path, required=True)
    parser.add_argument('--reference', type=Path, required=True)
    args = parser.parse_args()
    print(json.dumps(verify(args.out, args.reference), ensure_ascii=False))
    return 0


if __name__ == '__main__':
    sys.exit(main())
