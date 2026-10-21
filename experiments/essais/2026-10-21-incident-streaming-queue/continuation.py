"""Reprise isolée du pilote après masquage de la bibliothèque standard queue."""
import argparse
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import platform
import shutil
import sys
from types import SimpleNamespace

sys.dont_write_bytecode = True
BASE = Path('/home/nvidia/tvlens-setup')
PREVIOUS = BASE / 'reprise-streaming-past-20261021T041930Z/results'
PREVIOUS_SEAL = 'a1e4cd6aaf822fb0d4644d24c3888c8ee762216a0e36e8e01d818cb4088b5bcc'
RECOVERY = BASE / 'reprise-streaming-buildkit-20261021T040610Z/continuation.py'
RECOVERY_SHA = '8841b402e40cb8aba364228a10bc3195d44585cd0fd24d79078d03dbf8b6680f'
IMAGE = 'sha256:0ae5d7785eadb9a9983f149a6a3921cffb7e3c325e0cd183b06f2eed5d2d919d'
CACHE = PREVIOUS.parent / 'streaming-hf-acb4fff8e97240408da9db3acdc6cb20'
PILOT_STATUS_SHA = '01e0125e5488d42a0d086ee87b4a10e170da4f7b0614ab6ce026b2c3eaa7901d'


def load_recovery():
    if hashlib.sha256(RECOVERY.read_bytes()).hexdigest() != RECOVERY_SHA:
        raise RuntimeError('FROZEN_RECOVERY_CHANGED')
    spec = importlib.util.spec_from_file_location('frozen_buildkit_recovery', RECOVERY)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def verify_previous(guards, recovery, root=PREVIOUS):
    guards.sealed(root, PREVIOUS_SEAL)
    state = guards.terminal(root)
    history = [('future-layer-build', 0), ('corrected-packages', 0), ('dependency-probe', 0),
               ('checkpoint-download', 0), ('pilot-16', 1)]
    if (not state or state['status'] != 'blocked' or state.get('error', {}).get('message') != 'pilot-16:EXIT_1'
            or [(s['name'], s['exitCode']) for s in state['stages']] != history):
        raise RuntimeError('PREVIOUS_STAGE_HISTORY_CHANGED')
    if guards.read(root / 'protocol.json') != guards.read(recovery.ORIGINAL / 'protocol.json'):
        raise RuntimeError('PREVIOUS_PROTOCOL_CHANGED')
    info = json.loads(guards.read(root / 'corrected-image-inspect.json')['stdout'])[0]
    if info.get('Id') != IMAGE or info.get('Architecture') != 'arm64' or info.get('Os') != 'linux':
        raise RuntimeError('PREVIOUS_IMAGE_CHANGED')
    return state


def verify_failure(night, ops, streaming):
    script = ("import hashlib,json; from pathlib import Path; "
              "p=Path('/evidence/result-pilot-16/status.json'); b=p.read_bytes(); "
              "print(json.dumps({'sha256':hashlib.sha256(b).hexdigest(),'status':json.loads(b)}))")
    result = streaming.captured(night, ops, ['docker', 'run', '--rm', '--network', 'none', '--read-only',
        '-v', str(PREVIOUS) + ':/evidence:ro', '--entrypoint', 'python3', IMAGE, '-P', '-c', script])
    if result.get('exitCode') != 0:
        raise RuntimeError('PREVIOUS_PILOT_UNREADABLE')
    data = json.loads(result['stdout'])
    error = data['status'].get('error', {})
    if (data.get('sha256') != PILOT_STATUS_SHA or data['status'].get('status') != 'failed'
            or error.get('type') != 'ImportError'
            or error.get('message') != "cannot import name 'Queue' from 'queue' (/runner/queue.py)"):
        raise RuntimeError('PREVIOUS_FAILURE_CHANGED')
    ops.write(night.root / 'previous-pilot-failure.json', data)


def acquire_gate(night, args, ops, guards, recovery, streaming, corpus):
    handles = recovery.acquire_gate(night, args, ops, guards, streaming, corpus)
    try:
        state = verify_previous(guards, recovery)
        closures = corpus.check_owned_containers(PREVIOUS, state['id'], ops)
        verify_failure(night, ops, streaming)
        source = night.root / 'continuation-source/queue-continuation.py'
        shutil.copyfile(Path(__file__), source)
        provenance = ops.read(night.root / 'continuation.json')
        provenance.update({'immediatePredecessor': str(PREVIOUS), 'immediatePredecessorSealSha256': PREVIOUS_SEAL,
            'immediatePredecessorContainersStopped': closures, 'sourceSha256': guards.digest(source),
            'frozenRecoverySha256': RECOVERY_SHA, 'correction': 'python3 -P; pilot user 1000:1000; HOME=/tmp',
            'reusedStages': ['image-pull', 'dependency-build', 'future-layer-build', 'corrected-packages',
                             'dependency-probe', 'checkpoint-download'],
            'modelAndInputsChanged': False, 'automaticRetry': False, 'readyForScoring': False})
        ops.write(night.root / 'continuation.json', provenance)
        night.event('queue-shadow-predecessor-locked')
        return handles
    except BaseException:
        for handle in handles:
            handle.close()
        raise


def reuse_image(night, args, ops, started, phase_end, streaming, root=PREVIOUS):
    night.check()
    inspected = streaming.captured(night, ops, ['docker', 'image', 'inspect', IMAGE])
    ops.write(night.root / 'reused-image-inspect.json', inspected)
    if inspected.get('exitCode') != 0:
        raise RuntimeError('REUSED_IMAGE_MISSING')
    info = json.loads(inspected['stdout'])[0]
    if info.get('Id') != IMAGE or info.get('Architecture') != 'arm64' or info.get('Os') != 'linux':
        raise RuntimeError('REUSED_IMAGE_CHANGED')
    for name in ('corrected-packages.json', 'dependency-probe.json'):
        shutil.copyfile(root / name, night.root / ('reused-' + name))
    return IMAGE


def reuse_checkpoint(night, args, ops, image, started, phase_end, streaming, root=PREVIOUS, cache=CACHE):
    if image != IMAGE:
        raise RuntimeError('REUSED_IMAGE_CHANGED')
    record = ops.read(root / 'checkpoint-files.json')
    if record.get('repo') != streaming.MODEL or record.get('revision') != streaming.REVISION:
        raise RuntimeError('CHECKPOINT_IDENTITY_CHANGED')
    snapshot = cache / 'models--mit-han-lab--StreamingVLM/snapshots' / streaming.REVISION
    files = {}
    for path in sorted(snapshot.rglob('*')):
        night.check()
        if path.is_file():
            if not path.resolve().is_relative_to(cache.resolve()):
                raise RuntimeError('CHECKPOINT_PATH_ESCAPE')
            files[str(path.relative_to(snapshot))] = {'bytes': path.stat().st_size, 'sha256': ops.digest(path)}
    if not files or files != record.get('files') or sum(x['bytes'] for x in files.values()) != record.get('totalBytes'):
        raise RuntimeError('CHECKPOINT_CONTENT_CHANGED')
    ops.write(night.root / 'checkpoint-files.json', record)
    ops.write(night.root / 'checkpoint-reused.json', {'cache': str(cache), 'predecessor': str(root),
              'predecessorSealSha256': PREVIOUS_SEAL, 'allFilesRehashed': True, 'downloadAttempted': False})
    return cache


def safe_pilot_night(original_class):
    class SafePilotNight(original_class):
        def container(self, stage, arguments, timeout):
            if stage not in ('pilot-16', 'pilot-72', 'pilot-372', 'pilot-16-recompute'):
                raise RuntimeError('UNEXPECTED_CONTAINER_STAGE:' + stage)
            expected = ['--entrypoint', 'python3', IMAGE, '/runner/run_streamingvlm.py']
            position = arguments.index('--entrypoint')
            if arguments[position:position + 4] != expected or '--user' in arguments:
                raise RuntimeError('PILOT_INVOCATION_CHANGED')
            arguments = (['--user', '1000:1000', '-e', 'HOME=/tmp'] + arguments[:position + 3]
                         + ['-P'] + arguments[position + 3:])
            return super().container(stage, arguments, timeout)
    return SafePilotNight


def run(args, recovery, guards):
    recovery.verify_original(guards)
    verify_previous(guards, recovery)
    guards.verify_streaming_package()
    streaming, corpus, ops = (guards.load(name) for name in ('streaming', 'corpus', 'ops'))
    ops.Night = safe_pilot_night(ops.Night)
    streaming.gate = lambda night, options, support: acquire_gate(
        night, options, support, guards, recovery, streaming, corpus)
    streaming.image_preflight = lambda *params: reuse_image(*params, streaming)
    streaming.download = lambda *params: reuse_checkpoint(*params, streaming)
    streaming.bounded = recovery.bounded
    streaming.wait_idle = lambda night, support, limit: streaming.resources(night, support, 'idle-once')
    return streaming.run(args, ops)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--out', required=True, type=Path)
    selected = parser.parse_args()
    root = selected.out.parent
    if (selected.out.name != 'results' or root.parent != BASE or not root.name.startswith('reprise-streaming-queue-')
            or not root.is_dir() or root.is_symlink() or selected.out.exists() or selected.out.is_symlink()):
        parser.error('dossier results neuf requis sous /home/nvidia/tvlens-setup/reprise-streaming-queue-*')
    if platform.system() != 'Linux' or platform.machine() != 'aarch64' or (os.getuid(), os.getgid()) != (1000, 1000):
        raise RuntimeError('GX10_NVIDIA_USER_REQUIRED')
    recovery = load_recovery()
    args = SimpleNamespace(out=selected.out, night_lock=BASE / 'night.lock', gpu_lock=BASE / 'followup-gpu.lock',
        reference_lock=BASE / 'reference-2026-10-20/execution.lock', image=recovery.IMAGE,
        package=BASE / 'streamingvlm-20261020T220235Z/package',
        upstream=BASE / 'streamingvlm-20261020T220235Z/upstream', video=Path('/srv/tvlens-gx10/videos/spring.mp4'))
    return run(args, recovery, recovery.load_guards())


if __name__ == '__main__':
    sys.exit(main())
