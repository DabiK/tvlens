"""Pré-vol GX10 en lecture seule, transmis par SSH sans copie distante."""
import argparse
import datetime as dt
import json
from pathlib import Path
import shlex
import subprocess

from confirm_images import CODE_SHA, RUNNER_SHA, SELECTION_SHA, digest

HERE = Path(__file__).resolve().parent.parent

REMOTE = r'''
import base64
import hashlib
import json
from pathlib import Path
import subprocess
import sys

plan = json.load(sys.stdin)
selection = plan['selection']
root = Path(selection['referenceRoot'])
repo = Path('/home/nvidia/tvlens')
def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()
def same(path, expected):
    if sha(path) != expected:
        raise ValueError('SHA_MISMATCH:' + str(path))
same(repo / 'scripts/replay-local-perception.cjs', plan['runnerSha256'])
code = subprocess.check_output(['git', '-C', str(repo), 'rev-parse', 'HEAD'], text=True).strip()
if code != plan['codeSha']:
    raise ValueError('CODE_SHA_CHANGED:' + code)
count = 0
for video, spec in selection['videos'].items():
    source = root / ('preparation-' + video)
    for name in ['preparation', 'manifest', 'blocks']:
        same(source / (name + '.json'), spec[name + 'Sha256'])
    preparation = json.loads((source / 'preparation.json').read_bytes())
    manifest = json.loads((source / 'manifest.json').read_bytes())
    blocks = json.loads((source / 'blocks.json').read_bytes())
    if preparation.get('complete') is not True or blocks.get('complete') is not True:
        raise ValueError('REFERENCE_NOT_COMPLETE:' + video)
    for row in spec['cases']:
        index = row['sequence']
        case = manifest['cases'][index]
        block = blocks['blocks'][index]
        if (case['id'], case['startMs'], case['endMs'], case['media']) != (
                row['id'], row['startMs'], row['endMs'], row['media']):
            raise ValueError('REFERENCE_CASE_CHANGED:' + video + ':' + str(index))
        if block['sequence'] != index or block['startMs'] != row['startMs'] or block['endMs'] != row['endMs']:
            raise ValueError('REFERENCE_BLOCK_CHANGED:' + video + ':' + str(index))
        media_path = source / row['media']['path']
        same(media_path, row['media']['sha256'])
        media = json.loads(media_path.read_bytes())
        if len(media.get('frames', [])) != 5:
            raise ValueError('REFERENCE_FRAME_COUNT:' + video + ':' + str(index))
        for frame_index, frame in enumerate(media['frames']):
            image = base64.b64decode(frame['dataUrl'].split(',', 1)[1], validate=True)
            if hashlib.sha256(image).hexdigest() != row['framesSha256'][frame_index]:
                raise ValueError('REFERENCE_FRAME_CHANGED:' + video + ':' + str(index))
        count += 1
print(json.dumps({'status': 'validated', 'codeSha': code,
                  'runnerSha256': plan['runnerSha256'], 'cases': count, 'gpuUsed': False}))
'''


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--host', default='gx10-tvlens')
    parser.add_argument('--evidence')
    args = parser.parse_args()
    raw = (HERE / 'inputs.json').read_bytes()
    if digest(raw) != SELECTION_SHA:
        raise ValueError('SELECTION_SHA_CHANGED')
    payload = json.dumps({'selection': json.loads(raw), 'codeSha': CODE_SHA, 'runnerSha256': RUNNER_SHA})
    remote = 'python3 -c ' + shlex.quote(REMOTE)
    command = ['ssh', '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=10', args.host, remote]
    started = dt.datetime.now(dt.timezone.utc).isoformat()
    result = subprocess.run(command, input=payload, capture_output=True, text=True, timeout=120)
    if args.evidence:
        folder = Path(args.evidence)
        folder.mkdir(parents=True)
        (folder / 'stdout.json').write_text(result.stdout)
        (folder / 'stderr.txt').write_text(result.stderr)
        (folder / 'execution.json').write_text(json.dumps({'startedAtUtc': started,
            'finishedAtUtc': dt.datetime.now(dt.timezone.utc).isoformat(), 'hostAlias': args.host,
            'action': 'read-only SSH Python preflight', 'exitCode': result.returncode,
            'selectionSha256': SELECTION_SHA, 'scriptSha256': digest(Path(__file__).read_bytes())}, indent=2) + '\n')
    if result.returncode != 0:
        raise RuntimeError('SSH_PREFLIGHT_FAILED: ' + result.stderr.strip())
    report = json.loads(result.stdout)
    if report.get('status') != 'validated' or report.get('cases') != 24:
        raise RuntimeError('SSH_PREFLIGHT_INCOMPLETE')
    print(json.dumps(report, ensure_ascii=False))


if __name__ == '__main__':
    main()
