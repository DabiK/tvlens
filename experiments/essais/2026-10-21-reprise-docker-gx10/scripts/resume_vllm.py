"""Reprendre la seule sonde vLLM textuelle après un échec Docker documenté."""

import argparse
import datetime as dt
import fcntl
import importlib
import json
from pathlib import Path
import platform
import sys
import time
import urllib.request


DEADLINE = dt.datetime(2026, 10, 21, 5, tzinfo=dt.timezone.utc)
SOURCE_COMMIT = '2035a2faad499659bcdf940c6104e50e311a9cd6'
STAGES = ('perception', 'perception-verify', 'vision', 'vision-verify',
          'probe-ollama', 'docker-pull')
SEALED_FILES = ('status.json', 'events.jsonl', 'reference-validation.json',
                'trial-perception/integrite.json', 'trial-vision/integrite.json',
                'answers-ollama/campaign.json', 'answers-ollama/integrite.json',
                'scripts/vllm_stage.py', 'package.sha256.json')
LOCKS = ('/home/nvidia/tvlens-setup/night.lock',
         '/home/nvidia/tvlens-setup/reference-2026-10-20/execution.lock',
         '/home/nvidia/tvlens-setup/followup-gpu.lock')


def file_sha(path):
    import hashlib
    with Path(path).open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def load_frozen(package):
    manifest = json.loads((package / 'package.sha256.json').read_text())
    if not manifest or any(file_sha(package / name) != expected
                           for name, expected in manifest.items()):
        raise RuntimeError('FROZEN_PACKAGE_MISMATCH')
    sys.path.insert(0, str(package / 'scripts'))
    return (importlib.import_module('night_common'),
            importlib.import_module('vllm_stage'), file_sha(package / 'package.sha256.json'))


def validate_original(root, package, ops):
    status_path = root / 'status.json'
    events_path = root / 'events.jsonl'
    seal_path = root / 'integrite.json'
    status = ops.read(status_path)
    if (status.get('status') != 'blocked' or
            status.get('error', {}).get('message') != 'docker-pull:EXIT_1'):
        raise RuntimeError('ORIGINAL_FAILURE_CHANGED')
    stages = status.get('stages', [])
    if ([stage.get('name') for stage in stages] != list(STAGES) or
            [stage.get('exitCode') for stage in stages] != [0, 0, 0, 0, 0, 1]):
        raise RuntimeError('ORIGINAL_STAGE_SEQUENCE_INVALID')
    events = events_path.read_text().splitlines()
    if not events or json.loads(events[-1]).get('status') != 'blocked':
        raise RuntimeError('ORIGINAL_NOT_TERMINAL')
    seal = ops.read(seal_path).get('files', {})
    for name in SEALED_FILES:
        path = root / name
        if not path.is_file() or seal.get(name) != file_sha(path):
            raise RuntimeError('ORIGINAL_SEAL_INVALID:' + name)
    if file_sha(root / 'package.sha256.json') != file_sha(package / 'package.sha256.json'):
        raise RuntimeError('ORIGINAL_PACKAGE_CHANGED')
    if file_sha(root / 'scripts/vllm_stage.py') != file_sha(package / 'scripts/vllm_stage.py'):
        raise RuntimeError('ORIGINAL_VLLM_SOURCE_CHANGED')
    report = ops.read(root / 'answers-ollama/campaign.json')
    cases = report.get('cases', [])
    if (report.get('complete') is not True or len(cases) != 20 or
            any(row.get('status') != 'returned' or row.get('fixtureServer') for row in cases)):
        raise RuntimeError('ORIGINAL_OLLAMA_PROBE_INCOMPLETE')
    return {'originalRoot': str(root), 'originalRunId': status.get('id'),
            'originalStatusSha256': file_sha(status_path),
            'originalSealSha256': file_sha(seal_path),
            'originalOllamaCampaignSha256': file_sha(root / 'answers-ollama/campaign.json'),
            'completedStages': list(STAGES[:-1]), 'failedStage': STAGES[-1],
            'ollamaReturnedCases': len(cases), 'readyForScoring': False}


def acquire_locks():
    handles = []
    try:
        for name in LOCKS:
            handle = Path(name).open('a+b')
            handles.append(handle)
            fcntl.flock(handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
        return handles
    except (OSError, BlockingIOError):
        for handle in handles:
            handle.close()
        raise RuntimeError('GPU_LOCK_UNAVAILABLE') from None


def verify_repository(repo, package, ops):
    head = ops.capture(['git', '-C', str(repo), 'rev-parse', 'HEAD'])
    dirty = ops.capture(['git', '-C', str(repo), 'status', '--porcelain', '--',
                         'core', 'adapters', 'runtime', 'scripts'])
    if (head.get('exitCode') != 0 or head.get('stdout', '').strip() != SOURCE_COMMIT or
            dirty.get('exitCode') != 0 or dirty.get('stdout', '').strip()):
        raise RuntimeError('SOURCE_REPOSITORY_CHANGED')
    plan = ops.read(package / 'execution/plan.json')
    models = {row['name']: row.get('digest') for row in
              ops.api('http://127.0.0.1:11434/api/tags').get('models', [])}
    if models.get('qwen3.8:27b') != plan['ollamaModels']['qwen3.8:27b']:
        raise RuntimeError('OLLAMA_MODEL_CHANGED')


def verify_previous_containers(run_id, ops):
    result = ops.capture(['docker', 'ps', '-q', '--filter', 'label=tvlens.owner=' + run_id])
    if result.get('exitCode') != 0:
        raise RuntimeError('DOCKER_UNAVAILABLE')
    if result.get('stdout', '').strip():
        raise RuntimeError('ORIGINAL_CONTAINER_RUNNING')


def wait_idle(night, ops):
    while True:
        night.check()
        replay = ops.capture(['pgrep', '-f',
                              'replay-local-(stream|perception)|replay-reinspection'])
        gpu = ops.capture(['nvidia-smi', '--query-compute-apps=pid',
                           '--format=csv,noheader,nounits'], timeout=10)
        resident = ops.api('http://127.0.0.1:11434/api/ps')
        evidence = {'atUtc': ops.utc(), 'replay': replay, 'gpu': gpu, 'ollama': resident}
        ops.write(night.root / 'idle-probe.json', evidence)
        if replay.get('exitCode') not in (0, 1) or gpu.get('exitCode') != 0:
            raise RuntimeError('RESOURCE_STATE_UNKNOWN')
        gpu_processes = gpu.get('stdout', '').strip()
        if (replay.get('exitCode') == 1 and
                (not gpu_processes or 'No running processes found' in gpu_processes) and
                resident.get('models') == []):
            return
        night.sleep(15)


def run_suffix(night, package, repo, ops, stage):
    cache = night.root.parent / ('huggingface-' + night.owner)
    cache.mkdir()
    stage.download(night, package, cache)
    code = ('import json,torch,vllm; print(json.dumps({"torch":torch.__version__,"cuda":torch.version.cuda,'
            '"vllm":vllm.__version__,"device":torch.cuda.get_device_name(0),"capability":torch.cuda.get_device_capability(0)}));'
            'assert torch.cuda.is_available(); assert torch.cuda.get_device_capability(0)==(12,1)')
    checked = night.container('gpu-check', ['--device', 'nvidia.com/gpu=all',
                              '-e', 'NVIDIA_VISIBLE_DEVICES=void', '--entrypoint',
                              'python3', stage.IMAGE, '-c', code], 120)
    lines = (checked / 'stdout.log').read_text().splitlines()
    version = next(json.loads(line) for line in reversed(lines)
                   if line.startswith('{') and '"vllm"' in line)
    identity = night.root / 'vllm-identity.json'
    ops.write(identity, {'modelRevision': stage.REVISION, 'imageDigest': stage.IMAGE_DIGEST,
                         'vllmVersion': version['vllm'], 'maxModelLen': 16384,
                         'generationConfig': 'vllm', 'fixture': False})
    stage.start_server(night, cache)
    for phase in ('before', 'after'):
        if phase == 'after':
            stage.probe(night, package, repo, 'vllm', identity)
        try:
            with urllib.request.urlopen('http://127.0.0.1:8001/metrics', timeout=3) as response:
                (night.root / ('vllm-metrics-' + phase + '.txt')).write_bytes(response.read())
        except OSError as error:
            ops.write(night.root / ('vllm-metrics-' + phase + '-error.json'),
                      {'type': type(error).__name__})


def execute(args, ops, stage):
    night = ops.Night(args.out, DEADLINE)
    handles = []
    success = False
    try:
        original = validate_original(args.original_root, args.package, ops)
        handles = acquire_locks()
        verify_previous_containers(original['originalRunId'], ops)
        verify_repository(args.repo, args.package, ops)
        ops.write(night.root / 'resume.json', {**original,
                  'packageManifestSha256': file_sha(args.package / 'package.sha256.json'),
                  'recoveryScriptSha256': file_sha(__file__), 'atUtc': ops.utc()})
        night.event('predecessor-validated', resumedFrom=original['originalRunId'])
        night.start_monitor()
        wait_idle(night, ops)
        run_suffix(night, args.package, args.repo, ops, stage)
        night.event('workload-finished', finishedAtUtc=ops.utc(), readyForScoring=False)
        success = True
    except Exception as error:
        night.event('blocked', error={'type': type(error).__name__, 'message': str(error)},
                    readyForScoring=False)
    finally:
        try:
            cleaned = night.close()
            success = success and cleaned
        finally:
            for handle in handles:
                handle.close()
    return 0 if success else 1


def parse():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--original-root', required=True, type=Path)
    parser.add_argument('--package', required=True, type=Path)
    parser.add_argument('--out', required=True, type=Path)
    parser.add_argument('--repo', required=True, type=Path)
    args = parser.parse_args()
    for name in ('original_root', 'package', 'out', 'repo'):
        setattr(args, name, getattr(args, name).resolve())
    if platform.system() != 'Linux' or platform.machine() != 'aarch64':
        parser.error('GX10_LINUX_ARM64_REQUIRED')
    if dt.datetime.now(dt.timezone.utc) >= DEADLINE:
        parser.error('NIGHT_DEADLINE')
    return args


def main():
    args = parse()
    ops, stage, _ = load_frozen(args.package)
    return execute(args, ops, stage)


if __name__ == '__main__':
    sys.exit(main())
