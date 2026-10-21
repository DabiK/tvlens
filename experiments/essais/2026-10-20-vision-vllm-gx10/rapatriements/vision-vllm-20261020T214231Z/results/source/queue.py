"""Attendre la nuit GX10 puis conduire une comparaison vision locale bornée."""
import argparse
import datetime
import fcntl
import json
import os
from pathlib import Path
import platform
import shutil
import socket
import sys
import time

DEADLINE = datetime.datetime(2026, 10, 21, 5, tzinfo=datetime.timezone.utc)
IMAGE_DIGEST = 'sha256:2a7cde230b59f3ce6cab33dd245ba6bee41aa87b38c9fe84f966ff24016813ce'
IMAGE = 'vllm/vllm-openai@' + IMAGE_DIGEST
IMAGE_VERSION = '0.28.0'
MODEL = 'Qwen/Qwen3-VL-4B-Instruct'
REVISION = 'ebb281ec70b05090aa6165b016eac8ec08e71b17'
REPO_COMMIT = '2035a2faad499659bcdf940c6104e50e311a9cd6'
OLLAMA_MODEL = 'qwen3-vl:4b-instruct-bf16'
OLLAMA_DIGEST = 'sha256:1d2c81ea69a06341d1aaa9e4fbd655402681057c291754008f44fa6e74acc298'
VLLM_PORT = 8002
MIN_DISK = 50 * 1024 ** 3
MIN_MEMORY = 32 * 1024 ** 3
OLLAMA_MIN_SECONDS = 60 * 60
SOURCE_FILES = ['adapters/codex-perception.cjs', 'adapters/local-vlm-agent.cjs',
                'scripts/perception-replay-input.cjs', 'scripts/perception-replay-context.cjs',
                'core/visual-observation.cjs']


def acquire(paths):
    handles = []
    try:
        for path in paths:
            handle = Path(path).open('a+b')
            handles.append(handle)
            fcntl.flock(handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
        return handles
    except (OSError, BlockingIOError):
        for handle in handles:
            handle.close()
        return None


def night_finished(root, ops):
    status_file = root / 'status.json'
    seal_file = root / 'integrite.json'
    if not status_file.exists():
        return False
    status = ops.read(status_file)
    if status.get('status') in ['blocked', 'cleanup-failed']:
        raise RuntimeError('NIGHT_FAILED')
    if status.get('status') != 'finished' or status.get('cleanupConfirmed') is not True:
        return False
    if not seal_file.exists():
        return False
    seal = ops.read(seal_file).get('files', {})
    if seal.get('status.json') != ops.digest(status_file) or seal.get('events.jsonl') != ops.digest(root / 'events.jsonl'):
        raise RuntimeError('NIGHT_SEAL_INVALID')
    events = (root / 'events.jsonl').read_text().splitlines()
    if not events or json.loads(events[-1]).get('status') != 'finished':
        raise RuntimeError('NIGHT_FINISH_EVENT_MISSING')
    return True


def wait_for_night(night, args, ops):
    night.event('waiting-night')
    paths = [args.night_lock, args.gpu_lock, args.reference_lock]
    while True:
        night.check()
        if night_finished(args.night_root, ops):
            handles = acquire(paths)
            if handles:
                try:
                    if not night_finished(args.night_root, ops):
                        raise RuntimeError('NIGHT_CHANGED_AFTER_LOCK')
                    ops.write(night.root / 'night-gate.json', {'atUtc': ops.utc(), 'nightRoot': str(args.night_root),
                              'statusSha256': ops.digest(args.night_root / 'status.json'), 'locks': [str(p) for p in paths]})
                    night.event('night-locked')
                    return handles
                except BaseException:
                    for handle in handles:
                        handle.close()
                    raise
        night.sleep(15)


def available_memory():
    lines = Path('/proc/meminfo').read_text().splitlines()
    return next(int(line.split()[1]) * 1024 for line in lines if line.startswith('MemAvailable:'))


def verify_repo(night, ops, repo):
    commit = captured(night, ops, ['git', '-C', str(repo), 'rev-parse', 'HEAD'])
    modified = captured(night, ops, ['git', '-C', str(repo), 'status', '--porcelain', '--', *SOURCE_FILES])
    record = {'expectedCommit': REPO_COMMIT, 'commit': commit, 'modifiedSources': modified}
    ops.write(night.root / 'repo-identity.json', record)
    if (commit.get('exitCode') != 0 or commit.get('stdout', '').strip() != REPO_COMMIT or
            modified.get('exitCode') != 0 or modified.get('stdout', '').strip()):
        raise RuntimeError('REPO_SOURCE_CHANGED')


def captured(night, ops, argv):
    result = ops.capture(argv)
    record = {'atUtc': ops.utc(), 'argv': argv, 'result': result}
    with (night.root / 'captured-commands.jsonl').open('a') as stream:
        stream.write(json.dumps(record, ensure_ascii=False) + '\n')
        stream.flush()
        os.fsync(stream.fileno())
    return result


def resources(night, ops, phase, gpu_idle=True):
    disk = shutil.disk_usage(night.root).free
    memory = available_memory()
    gpu = captured(night, ops, ['nvidia-smi', '--query-compute-apps=pid', '--format=csv,noheader,nounits'])
    processes = captured(night, ops, ['pgrep', '-f', 'replay-local-(stream|perception)|replay-reinspection'])
    try:
        resident = ops.api('http://127.0.0.1:11434/api/ps')
    except (OSError, ValueError) as error:
        resident = {'error': type(error).__name__}
    record = {'atUtc': ops.utc(), 'freeDiskBytes': disk, 'availableMemoryBytes': memory,
              'gpuProcesses': gpu, 'replays': processes, 'ollamaResident': resident}
    ops.write(night.root / ('resources-' + phase + '.json'), record)
    if disk < MIN_DISK or memory < MIN_MEMORY:
        raise RuntimeError('RESOURCES_LOW')
    if gpu.get('exitCode') != 0 or processes.get('exitCode') != 1:
        raise RuntimeError('GPU_OR_REPLAY_UNKNOWN')
    lines = gpu.get('stdout', '').strip()
    if gpu_idle and lines and 'No running processes found' not in lines:
        raise RuntimeError('GPU_BUSY')
    if gpu_idle and (not isinstance(resident.get('models'), list) or resident['models']):
        raise RuntimeError('OLLAMA_RESIDENT_OR_UNKNOWN')
    return record


def wait_idle(night, ops, phase, minimum_remaining=0):
    attempt = 0
    while night.deadline - time.monotonic() > minimum_remaining:
        night.check()
        try:
            resources(night, ops, f'{phase}-{attempt}')
            return True
        except RuntimeError as error:
            if str(error) not in ['GPU_BUSY', 'OLLAMA_RESIDENT_OR_UNKNOWN']:
                raise
        attempt += 1
        night.sleep(15)
    return False


def image_and_cuda(night, ops):
    night.command('image-pull', ['docker', 'pull', '--platform', 'linux/arm64', IMAGE], 3600)
    image = captured(night, ops, ['docker', 'image', 'inspect', IMAGE])
    ops.write(night.root / 'image-inspect.json', image)
    if image.get('exitCode') != 0:
        raise RuntimeError('IMAGE_INSPECT_FAILED')
    details = json.loads(image['stdout'])[0]
    if (details.get('Os') != 'linux' or details.get('Architecture') != 'arm64' or
            not any(value.endswith('@' + IMAGE_DIGEST) for value in details.get('RepoDigests', []))):
        raise RuntimeError('IMAGE_IDENTITY_MISMATCH')
    script = ('import json,torch,vllm; print(json.dumps({"vllm":vllm.__version__,'
              '"cuda":torch.version.cuda,"available":torch.cuda.is_available(),'
              '"capability":torch.cuda.get_device_capability(0)}))')
    folder = night.container('cuda-check', ['--device', 'nvidia.com/gpu=all',
                             '-e', 'NVIDIA_VISIBLE_DEVICES=void', '--entrypoint', 'python3', IMAGE, '-c', script], 180)
    lines = (folder / 'stdout.log').read_text().splitlines()
    info = next(json.loads(line) for line in reversed(lines) if line.startswith('{') and '"vllm"' in line)
    ops.write(night.root / 'cuda.json', info)
    if (not info.get('available') or not info.get('cuda') or info.get('capability') != [12, 1] or
            info.get('vllm') != IMAGE_VERSION):
        raise RuntimeError('CUDA_OR_VLLM_MISMATCH')


def model_files(night, cache, ops):
    root = cache / 'models--Qwen--Qwen3-VL-4B-Instruct' / 'snapshots' / REVISION
    if not root.is_dir():
        raise RuntimeError('MODEL_SNAPSHOT_MISSING')
    files = {}
    for file in sorted(root.rglob('*')):
        if file.is_file():
            night.check()
            files[str(file.relative_to(root))] = {'bytes': file.stat().st_size, 'sha256': ops.digest(file)}
    if not any(name.endswith('.safetensors') for name in files) or 'config.json' not in files:
        raise RuntimeError('MODEL_WEIGHTS_MISSING')
    ops.write(night.root / 'model-files.json', {'model': MODEL, 'revision': REVISION, 'files': files,
              'totalBytes': sum(value['bytes'] for value in files.values())})
    return root


def download_model(night, ops):
    cache = night.root.parent / ('vision-hf-' + night.owner)
    cache.mkdir(mode=0o700)
    script = ("from huggingface_hub import snapshot_download; "
              "print(snapshot_download('Qwen/Qwen3-VL-4B-Instruct', "
              "revision='ebb281ec70b05090aa6165b016eac8ec08e71b17', "
              "cache_dir='/cache', token=False, max_workers=4), flush=True)")
    night.container('model-download', ['-e', 'HF_HUB_DISABLE_IMPLICIT_TOKEN=1',
                    '-e', 'HF_HUB_DISABLE_TELEMETRY=1', '-v', str(cache) + ':/cache',
                    '--entrypoint', 'python3', IMAGE, '-c', script], 3600)
    return cache, model_files(night, cache, ops)


def port_free():
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as handle:
        handle.bind(('127.0.0.1', VLLM_PORT))


def start_vllm(night, cache, ops):
    port_free()
    path = '/cache/models--Qwen--Qwen3-VL-4B-Instruct/snapshots/' + REVISION
    args = ['-d', '--device', 'nvidia.com/gpu=all', '--network', 'host', '--shm-size', '8g',
            '--memory', '80g', '--memory-swap', '80g', '-e', 'NVIDIA_VISIBLE_DEVICES=void',
            '-e', 'HF_HUB_OFFLINE=1', '-e', 'HF_HUB_DISABLE_IMPLICIT_TOKEN=1',
            '-e', 'VLLM_NO_USAGE_STATS=1', '-v', str(cache) + ':/cache:ro',
            '--entrypoint', 'vllm', IMAGE, 'serve', path, '--served-model-name', MODEL,
            '--host', '127.0.0.1', '--port', str(VLLM_PORT), '--dtype', 'bfloat16',
            '--max-model-len', '16384', '--max-num-seqs', '1', '--limit-mm-per-prompt',
            '{"image":5,"video":0}', '--generation-config', 'vllm', '--gpu-memory-utilization', '0.45']
    night.container('vision-server', args, 120)
    cidfile = night.root / 'vision-server.cid'
    cid = cidfile.read_text().strip()
    started = time.monotonic()
    while time.monotonic() - started < 900:
        night.check()
        state = captured(night, ops, ['docker', 'inspect', '--format', '{{.State.Running}}', cid])
        if state.get('exitCode') != 0 or state.get('stdout', '').strip() != 'true':
            raise RuntimeError('VLLM_EXITED_BEFORE_READY')
        try:
            models = ops.api(f'http://127.0.0.1:{VLLM_PORT}/v1/models')
            if MODEL in [item.get('id') for item in models.get('data', [])]:
                ops.write(night.root / 'vllm-ready.json', {'atUtc': ops.utc(), 'models': models,
                          'loadSeconds': time.monotonic() - started, 'containerId': cid})
                return cidfile
        except (OSError, ValueError):
            pass
        night.sleep(5)
    raise RuntimeError('VLLM_STARTUP_DEADLINE')


def probe(night, args, ops, backend, mode):
    limit, repeats = (1, 1) if mode == 'preflight' else (12, 2)
    output = night.root / f'{backend}-{mode}'
    model = MODEL if backend == 'vllm' else OLLAMA_MODEL
    url = f'http://127.0.0.1:{VLLM_PORT}' if backend == 'vllm' else 'http://127.0.0.1:11434'
    argv = ['node', night.root / 'source/vision-probe.cjs', '--repo', args.repo,
            '--manifest', args.manifest, '--backend', backend, '--out', output,
            '--model', model, '--url', url, '--limit', str(limit), '--repeats', str(repeats), '--execute']
    night.command(f'{backend}-{mode}-command', argv, 120 if mode == 'preflight' else 1260, cwd=args.repo)
    report = ops.read(output / 'campaign.json')
    if (report.get('complete') is not True or len(report.get('cases', [])) != limit * repeats or
            any(item.get('status') != 'returned' for item in report['cases'])):
        raise RuntimeError('PROBE_FAILED:' + backend + ':' + mode)
    if mode == 'preflight' and len(report['cases'][0].get('frameSha256', [])) != 5:
        raise RuntimeError('PREFLIGHT_NOT_FIVE_IMAGES')
    if not (output / 'integrite.json').exists():
        raise RuntimeError('PROBE_UNSEALED')
    ops.write(night.root / f'{backend}-{mode}-result.json', {'atUtc': ops.utc(),
              'campaignSha256': ops.digest(output / 'campaign.json'), 'cases': limit * repeats})


def ollama_arm(night, args, ops):
    before = ops.api('http://127.0.0.1:11434/api/tags')
    ops.write(night.root / 'ollama-tags-before.json', before)
    found = next((item.get('digest') for item in before.get('models', []) if item.get('name') == OLLAMA_MODEL), None)
    if found and found != OLLAMA_DIGEST:
        raise RuntimeError('OLLAMA_EXISTING_DIGEST_MISMATCH')
    if not found:
        night.command('ollama-pull', ['ollama', 'pull', OLLAMA_MODEL], 1800)
    after = ops.api('http://127.0.0.1:11434/api/tags')
    ops.write(night.root / 'ollama-tags-after.json', after)
    actual = next((item.get('digest') for item in after.get('models', []) if item.get('name') == OLLAMA_MODEL), None)
    if actual != OLLAMA_DIGEST:
        raise RuntimeError('OLLAMA_DIGEST_MISMATCH')
    probe(night, args, ops, 'ollama', 'preflight')
    probe(night, args, ops, 'ollama', 'full')


def run(args, ops):
    night = ops.Night(args.out, DEADLINE)
    locks = []
    success = False
    try:
        ops.write(night.root / 'protocol.json', {'deadlineUtc': DEADLINE.isoformat(), 'image': IMAGE,
                  'model': MODEL, 'revision': REVISION, 'ollamaModel': OLLAMA_MODEL,
                  'ollamaDigest': OLLAMA_DIGEST, 'manifestSha256': ops.digest(args.manifest)})
        source = night.root / 'source'
        source.mkdir()
        for file in [Path(__file__), *sorted((args.package / 'scripts').glob('vision-*.cjs'))]:
            shutil.copyfile(file, source / file.name)
        required = ['vision-probe.cjs', 'vision-input.cjs', 'vision-transport.cjs']
        if any(not (source / name).is_file() for name in required):
            raise RuntimeError('PROBE_SOURCES_MISSING')
        ops.write(night.root / 'source-files.json', {file.name: ops.digest(file) for file in source.iterdir()})
        ops.write(night.root / 'repo-code.json', {name: ops.digest(args.repo / name) for name in SOURCE_FILES})
        locks = wait_for_night(night, args, ops)
        verify_repo(night, ops, args.repo)
        if not wait_idle(night, ops, 'before-vllm'):
            raise RuntimeError('IDLE_WAIT_DEADLINE')
        image_and_cuda(night, ops)
        resources(night, ops, 'before-download')
        cache, _ = download_model(night, ops)
        resources(night, ops, 'before-server')
        cidfile = start_vllm(night, cache, ops)
        probe(night, args, ops, 'vllm', 'preflight')
        probe(night, args, ops, 'vllm', 'full')
        if not night.stop_container(cidfile):
            raise RuntimeError('VLLM_CLEANUP_UNCONFIRMED')
        night.event('vllm-finished', containerStopped=True)
        remaining = night.deadline - time.monotonic()
        if remaining >= OLLAMA_MIN_SECONDS:
            if wait_idle(night, ops, 'before-ollama', OLLAMA_MIN_SECONDS):
                ollama_arm(night, args, ops)
                night.event('ollama-finished', ollamaArm='complete')
            else:
                remaining = night.deadline - time.monotonic()
                ops.write(night.root / 'ollama-missing.json', {'atUtc': ops.utc(), 'reason': 'IDLE_WAIT_USED_RESERVED_HOUR',
                          'remainingSeconds': max(0, remaining)})
                night.event('ollama-missing', ollamaArm='missing')
        else:
            ops.write(night.root / 'ollama-missing.json', {'atUtc': ops.utc(), 'reason': 'LESS_THAN_RESERVED_HOUR',
                      'remainingSeconds': max(0, remaining)})
            night.event('ollama-missing', ollamaArm='missing')
        success = True
        night.event('workload-finished', readyForScoring=False)
    except Exception as error:
        night.event('blocked', error={'type': type(error).__name__, 'message': str(error)}, readyForScoring=False)
    finally:
        try:
            cleaned = night.close()
            success = success and cleaned
        finally:
            for handle in locks:
                handle.close()
    return 0 if success else 1


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for flag in ['support', 'package', 'manifest', 'repo', 'night-root', 'night-lock',
                 'gpu-lock', 'reference-lock', 'out']:
        parser.add_argument('--' + flag, required=True)
    values = parser.parse_args()
    if platform.system() != 'Linux' or platform.machine() != 'aarch64':
        raise RuntimeError('GX10_LINUX_ARM64_REQUIRED')
    for key in ['support', 'package', 'manifest', 'repo', 'night_root', 'night_lock',
                'gpu_lock', 'reference_lock', 'out']:
        setattr(values, key, Path(getattr(values, key)).resolve())
    sys.path.insert(0, str(values.support))
    import night_common as ops
    return run(values, ops)


if __name__ == '__main__':
    sys.exit(main())
