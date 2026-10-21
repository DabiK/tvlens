"""Confirmation bornée des images sur les blocs de référence Kennedy et Spring."""
import argparse
import base64
import datetime as dt
import fcntl
import hashlib
import json
import os
from pathlib import Path
import platform
import shutil
import signal
import subprocess
import sys
import time
import urllib.request

HERE = Path(__file__).resolve().parent.parent
MODEL = 'gemma3:4b'
MODEL_DIGEST = '68ceab7e468a31c988b44d5a4984a0e21f58c4f7158c6ce29c1804babac38df7'
CODE_SHA = '2035a2faad499659bcdf940c6104e50e311a9cd6'
RUNNER_SHA = 'c6ce9fda37336d5abf73af2347e91624daf7f3958dfe9e63469e8cad02e617eb'
SELECTION_SHA = 'a84258d284981d1293606fcd5d300f738972e68b24a587093381e2439c0d89ca'
BUDGET_SECONDS = 7200
MIN_MEMORY_BYTES = 8 * 1024 ** 3
MIN_DISK_BYTES = 40 * 1024 ** 3
LOCKS = ['/home/nvidia/tvlens-setup/night.lock',
         '/home/nvidia/tvlens-setup/reference-2026-10-20/execution.lock',
         '/home/nvidia/tvlens-setup/followup-gpu.lock']
STOP = None


def digest(raw):
    return hashlib.sha256(raw).hexdigest()


def read(path):
    return json.loads(Path(path).read_bytes())


def write(path, value):
    path = Path(path)
    temporary = path.with_name(path.name + '.tmp')
    temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n')
    temporary.replace(path)


def utc():
    return dt.datetime.now(dt.timezone.utc).isoformat()


def check_sha(path, expected):
    raw = Path(path).read_bytes()
    if digest(raw) != expected:
        raise ValueError('SHA_MISMATCH:' + str(path))
    return raw


def verify_repo(repo):
    actual_sha = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=repo, text=True).strip()
    if actual_sha != CODE_SHA:
        raise RuntimeError('CODE_SHA_CHANGED')
    check_sha(Path(repo) / 'scripts/replay-local-perception.cjs', RUNNER_SHA)
    return actual_sha


def verify_predecessor(path):
    root = Path(path).resolve()
    if (root / 'results').is_dir():
        root = root / 'results'
    integrity = read(root / 'integrite.json')
    files = integrity['files']
    if 'status.json' not in files or not files:
        raise ValueError('PREDECESSOR_SEAL_INCOMPLETE')
    actual = {str(p.relative_to(root)) for p in root.rglob('*') if p.is_file() and p != root / 'integrite.json'}
    if actual != set(files):
        raise ValueError('PREDECESSOR_FILE_SET_CHANGED')
    for name, sha in files.items():
        if Path(name).is_absolute() or '..' in Path(name).parts:
            raise ValueError('PREDECESSOR_PATH_INVALID')
        check_sha(root / name, sha)
    status = read(root / 'status.json')
    if status.get('status') != 'finished' or status.get('cleanupConfirmed') is not True:
        raise ValueError('PREDECESSOR_NOT_CLOSED')
    return {'path': str(root), 'sealedAtUtc': integrity.get('sealedAtUtc'),
            'statusSha256': files['status.json'], 'integritySha256': digest((root / 'integrite.json').read_bytes())}


def source_preflight(selection, reference):
    prepared = {}
    for video, spec in selection['videos'].items():
        root = reference / ('preparation-' + video)
        for name in ['preparation', 'manifest', 'blocks']:
            check_sha(root / (name + '.json'), spec[name + 'Sha256'])
        preparation = read(root / 'preparation.json')
        manifest = read(root / 'manifest.json')
        blocks = read(root / 'blocks.json')
        if preparation.get('complete') is not True or blocks.get('complete') is not True:
            raise ValueError('REFERENCE_NOT_COMPLETE:' + video)
        selected = []
        for row in spec['cases']:
            number = row['sequence']
            case = manifest['cases'][number]
            block = blocks['blocks'][number]
            if (case['id'], case['startMs'], case['endMs'], case['media']) != (
                    row['id'], row['startMs'], row['endMs'], row['media']):
                raise ValueError('REFERENCE_CASE_CHANGED:' + video + ':' + str(number))
            if block['sequence'] != number or block['startMs'] != row['startMs'] or block['endMs'] != row['endMs']:
                raise ValueError('REFERENCE_BLOCK_CHANGED:' + video + ':' + str(number))
            raw = check_sha(root / row['media']['path'], row['media']['sha256'])
            media = json.loads(raw)
            if len(media.get('frames', [])) != 5:
                raise ValueError('REFERENCE_FRAME_COUNT:' + video + ':' + str(number))
            for index, frame in enumerate(media['frames']):
                image = base64.b64decode(frame['dataUrl'].split(',', 1)[1], validate=True)
                if digest(image) != row['framesSha256'][index]:
                    raise ValueError('REFERENCE_FRAME_CHANGED:' + video + ':' + str(number))
            selected.append((case, media))
        prepared[video] = selected
    return prepared


def stage_inputs(root, selection, prepared):
    for arm, indices in selection['arms'].items():
        cases = []
        folder = root / 'inputs' / arm / 'media'
        folder.mkdir(parents=True)
        for video, selected in prepared.items():
            for case, media in selected:
                name = video + '-' + case['id'] + '.json'
                derived = dict(media, frames=[media['frames'][index] for index in indices])
                target = folder / name
                raw = (json.dumps(derived, ensure_ascii=False, indent=2) + '\n').encode()
                target.write_bytes(raw)
                item = dict(case, id=video + '-' + case['id'],
                            media={'path': 'media/' + name, 'sha256': digest(raw)},
                            lightweight={'value': False, 'source': 'explicit-default'})
                cases.append(item)
        write(root / 'inputs' / arm / 'manifest.json',
              {'version': 1, 'preparation': {'complete': True}, 'cases': cases,
               'derivation': {'selectedFrameIndices': indices, 'selectionSha256': digest((HERE / 'inputs.json').read_bytes())}})


def check_resources(root):
    if shutil.disk_usage(root).free < MIN_DISK_BYTES:
        raise RuntimeError('DISK_LOW')
    info = Path('/proc/meminfo').read_text()
    available = next(int(line.split()[1]) * 1024 for line in info.splitlines() if line.startswith('MemAvailable:'))
    if available < MIN_MEMORY_BYTES:
        raise RuntimeError('MEMORY_LOW')
    with urllib.request.urlopen('http://127.0.0.1:11434/api/ps', timeout=3) as response:
        json.load(response)


def gpu_processes():
    status = subprocess.run(['nvidia-smi'], capture_output=True, text=True, timeout=5)
    if status.returncode != 0:
        raise RuntimeError('GPU_UNAVAILABLE')
    apps = subprocess.run(['nvidia-smi', '--query-compute-apps=pid,process_name,used_memory', '--format=csv,noheader'],
                          capture_output=True, text=True, timeout=5)
    if apps.returncode != 0:
        raise RuntimeError('GPU_PROCESS_INVENTORY_UNAVAILABLE')
    for line in apps.stdout.splitlines():
        parts = line.split(',', 2)
        if len(parts) < 2 or 'ollama' not in parts[1].lower():
            raise RuntimeError('OTHER_GPU_PROCESS_ACTIVE')
    return {'nvidiaSmi': status.stdout, 'computeApps': apps.stdout}


def acquire_locks():
    handles = []
    try:
        for name in LOCKS:
            handle = Path(name).open('r+b')
            handles.append(handle)
            fcntl.flock(handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
        active = subprocess.run(['pgrep', '-f', 'replay-local-(stream|perception)|replay-reinspection'],
                                capture_output=True, timeout=5)
        if active.returncode != 1:
            raise RuntimeError('OTHER_REPLAY_ACTIVE_OR_UNKNOWN')
        with urllib.request.urlopen('http://127.0.0.1:11434/api/tags', timeout=3) as response:
            models = {model['name']: model['digest'] for model in json.load(response)['models']}
        if models.get(MODEL) != MODEL_DIGEST:
            raise RuntimeError('OLLAMA_MODEL_CHANGED')
        return handles, gpu_processes()
    except BaseException:
        for handle in handles:
            handle.close()
        raise


def interrupted(number, _frame):
    global STOP
    STOP = signal.Signals(number).name


def run_case(argv, folder, repo, deadline, root):
    folder.mkdir()
    entry = {'argv': argv, 'startedAtUtc': utc(), 'exitCode': None}
    write(folder / 'execution.json', entry)
    environment = {key: os.environ[key] for key in ['PATH', 'HOME', 'LANG', 'TMPDIR', 'LD_LIBRARY_PATH'] if key in os.environ}
    with (folder / 'stdout.log').open('wb') as stdout, (folder / 'stderr.log').open('wb') as stderr:
        child = subprocess.Popen(argv, cwd=repo, env=environment, stdout=stdout, stderr=stderr, start_new_session=True)
        started = time.monotonic()
        next_sample = started
        try:
            while child.poll() is None:
                if STOP or time.monotonic() >= deadline:
                    raise RuntimeError(STOP or 'BUDGET_EXPIRED')
                if time.monotonic() >= next_sample:
                    check_resources(root)
                    next_sample = time.monotonic() + 5
                campaign = folder / 'run/campaign.json'
                if campaign.exists():
                    recent = read(campaign).get('cases', [])
                    completed = [case for case in recent if case.get('status') in ['succeeded', 'error', 'refused']]
                    if len(completed) >= 3 and all(case['status'] != 'succeeded' for case in completed[-3:]):
                        raise RuntimeError('THREE_CONSECUTIVE_CASE_FAILURES')
                time.sleep(0.25)
        except BaseException:
            try:
                os.killpg(child.pid, signal.SIGTERM)
            except ProcessLookupError:
                pass
            try:
                child.wait(timeout=35)
            except subprocess.TimeoutExpired:
                try:
                    os.killpg(child.pid, signal.SIGKILL)
                except ProcessLookupError:
                    pass
                child.wait(timeout=5)
            raise
        finally:
            entry.update(exitCode=child.poll(), finishedAtUtc=utc(), durationSeconds=time.monotonic() - started)
            write(folder / 'execution.json', entry)
    if child.returncode != 0:
        raise RuntimeError('RUNNER_EXIT_' + str(child.returncode))
    report = read(folder / 'run/campaign.json')
    if report.get('complete') is not True or any(case.get('status') != 'succeeded' for case in report['cases']):
        raise RuntimeError('RUNNER_INCOMPLETE')
    return report


def summarize(root, selection):
    rows = []
    measures = []
    cadence = []
    prompt_pairs = {}
    for folder in sorted(root.glob('run-*/run/campaign.json')):
        report = read(folder)
        arm = folder.parent.parent.name.split('-')[-1]
        execution = read(folder.parent.parent / 'execution.json')
        duration = execution.get('durationSeconds')
        cadence.append({'run': folder.parent.parent.name, 'arm': arm, 'cases': len(report['cases']),
                        'durationSeconds': duration,
                        'casesPerSecond': len(report['cases']) / duration if duration else None})
        for case in report['cases']:
            request = case.get('request') or {}
            key = case.get('id')
            instructions = request.get('instructions') or ''
            frames = request.get('frames') or []
            times = '[' + ','.join(str(frame['atMs']) for frame in frames) + ']'
            marker = 'horodatées ' + times
            if marker not in instructions or digest(instructions.encode()) != request.get('promptSha256'):
                raise ValueError('PROMPT_TRACE_INVALID:' + str(key))
            if len(frames) != len(selection['arms'][arm]):
                raise ValueError('FRAME_COUNT_CHANGED:' + str(key))
            normalized = digest(instructions.replace(marker, 'horodatées <images>', 1).encode())
            prompt_pairs.setdefault(key, set()).add(normalized)
            diagnostics = case.get('diagnostics') or []
            provider = [item.get('metrics', {}).get('providerTimings') for item in diagnostics]
            provider = [item for item in provider if item]
            client = [item.get('metrics', {}).get('clientTimings') for item in diagnostics]
            measures.append({'run': folder.parent.parent.name, 'arm': arm, 'id': key,
                             'status': case.get('status'), 'providerCalls': len(provider),
                             'providerTimings': provider, 'clientTimings': [item for item in client if item],
                             'promptSha256': request.get('promptSha256'), 'normalizedPromptSha256': normalized,
                             'sentFrames': request.get('frames'), 'error': case.get('error')})
            rows.append({'run': folder.parent.parent.name, 'arm': arm, 'id': key,
                         'status': case.get('status'), 'request': request,
                         'diagnostics': case.get('diagnostics'), 'result': case.get('result'),
                         'error': case.get('error'), 'quality': None,
                         'ocr': None, 'briefAction': None, 'usefulDescription': None,
                         'inventedFact': None, 'reviewer': None})
    write(root / 'a-annoter.json', {'readyForScoring': False, 'expectedAnswersIncluded': False, 'rows': rows})
    write(root / 'mesures.json', {'readyForScoring': False, 'cadence': cadence, 'rows': measures})
    return all(len(values) == 1 for values in prompt_pairs.values()) and len(rows) == 96


def seal(root):
    files = {str(path.relative_to(root)): digest(path.read_bytes()) for path in sorted(root.rglob('*')) if path.is_file()}
    write(root / 'integrite.json', {'sealedAtUtc': utc(), 'files': files})


def execute(args):
    if platform.system() != 'Linux' or platform.machine() != 'aarch64':
        raise RuntimeError('GX10_LINUX_ARM64_REQUIRED')
    selection = json.loads(check_sha(HERE / 'inputs.json', SELECTION_SHA))
    if Path(args.reference).resolve() != Path(selection['referenceRoot']):
        raise RuntimeError('REFERENCE_ROOT_CHANGED')
    started = time.monotonic()
    deadline = started + BUDGET_SECONDS
    root = Path(args.out).resolve()
    root.mkdir()
    state = {'status': 'preparing', 'startedAtUtc': utc(), 'budgetSeconds': BUDGET_SECONDS,
             'readyForScoring': False, 'runs': []}
    write(root / 'status.json', state)
    locks = []
    try:
        predecessor = verify_predecessor(args.predecessor)
        locks, gpu_before = acquire_locks()
        predecessor = verify_predecessor(args.predecessor)
        actual_sha = verify_repo(args.repo)
        prepared = source_preflight(selection, Path(args.reference))
        check_resources(root)
        stage_inputs(root, selection, prepared)
        write(root / 'identity.json', {'predecessor': predecessor, 'codeSha': actual_sha,
                                       'runnerSha256': RUNNER_SHA,
                                       'model': MODEL, 'modelDigest': MODEL_DIGEST,
                                       'gpuBefore': gpu_before,
                                       'selectionSha256': digest((HERE / 'inputs.json').read_bytes()),
                                       'scriptSha256': digest(Path(__file__).read_bytes())})
        state['status'] = 'running'
        write(root / 'status.json', state)
        for index, arm in enumerate(selection['order']):
            if STOP or time.monotonic() >= deadline:
                raise RuntimeError(STOP or 'BUDGET_EXPIRED')
            name = f'run-{index + 1:02d}-{arm}'
            argv = ['node', 'scripts/replay-local-perception.cjs', '--manifest',
                    str(root / 'inputs' / arm / 'manifest.json'), '--out', str(root / name / 'run'),
                    '--backend', 'local', '--model', MODEL, '--url', 'http://127.0.0.1:11434',
                    '--num-ctx', '8192', '--keep-alive', '10m', '--execute']
            try:
                run_case(argv, root / name, args.repo, deadline, root)
            finally:
                state['runs'].append(name)
                write(root / 'status.json', state)
        state['promptConstant'] = summarize(root, selection)
        if time.monotonic() >= deadline:
            raise RuntimeError('BUDGET_EXPIRED')
        if not state['promptConstant']:
            raise RuntimeError('PROMPT_OR_CASE_COUNT_CHANGED')
        state['status'] = 'finished'
    except BaseException as error:
        state['status'] = 'blocked'
        state['error'] = {'type': type(error).__name__, 'message': str(error)}
    finally:
        if any(root.glob('run-*/run/campaign.json')) and not (root / 'mesures.json').exists():
            try:
                summarize(root, selection)
            except (OSError, ValueError, KeyError) as error:
                state['exportError'] = {'type': type(error).__name__, 'message': str(error)}
        state['finishedAtUtc'] = utc()
        state['elapsedSeconds'] = time.monotonic() - started
        for handle in locks:
            handle.close()
        state['cleanupConfirmed'] = True
        write(root / 'status.json', state)
        seal(root)
    print(json.dumps({'status': state['status'], 'out': str(root)}, ensure_ascii=False))
    return 0 if state['status'] == 'finished' else 1


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=['preflight', 'run'])
    parser.add_argument('--reference', default='/home/nvidia/tvlens-setup/reference-2026-10-20')
    parser.add_argument('--predecessor')
    parser.add_argument('--repo', default='/home/nvidia/tvlens')
    parser.add_argument('--out')
    args = parser.parse_args()
    signal.signal(signal.SIGINT, interrupted)
    signal.signal(signal.SIGTERM, interrupted)
    selection = json.loads(check_sha(HERE / 'inputs.json', SELECTION_SHA))
    if args.action == 'preflight':
        verify_repo(args.repo)
        source_preflight(selection, Path(args.reference))
        print(json.dumps({'status': 'validated', 'cases': 24, 'gpuUsed': False}))
        return 0
    if not args.predecessor or not args.out:
        parser.error('--predecessor et --out requis pour run')
    return execute(args)


if __name__ == '__main__':
    sys.exit(main())
