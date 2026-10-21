"""Reprise bornée après dépendance transitive future absente, sans changer les entrées."""
import argparse
import importlib.util
import json
from pathlib import Path
import platform
import shutil
import sys
from types import SimpleNamespace

sys.dont_write_bytecode = True
BASE = Path('/home/nvidia/tvlens-setup')
PREVIOUS = BASE / 'reprise-streaming-buildkit-20261021T040610Z/results'
PREVIOUS_SEAL = '8364eb61e32712ce44bc9eff66511da506c58a35f6f1c53643c4ed8836e540b3'
RECOVERY = PREVIOUS.parent / 'continuation.py'
RECOVERY_SHA = '8841b402e40cb8aba364228a10bc3195d44585cd0fd24d79078d03dbf8b6680f'
DERIVED_ID = 'sha256:8d92f144e0a96c5bfb95104ef04748208b22726006cb0a9b4329eabeda74f26c'
DERIVED_TAG = 'tvlens-streaming-38c3c15dd2924a16bed873bd8dc8de45:dependencies'
FUTURE_SHA = '929292d34f5872e70396626ef385ec22355a1fae8ad29e1a734c3e43f9fbc216'
FUTURE_URL = ('https://files.pythonhosted.org/packages/da/71/'
              'ae30dadffc90b9006d77af76b393cb9dfbfc9629f339fc1574a1c52e6806/'
              'future-1.0.0-py3-none-any.whl')


def load_recovery():
    import hashlib
    if hashlib.sha256(RECOVERY.read_bytes()).hexdigest() != RECOVERY_SHA:
        raise RuntimeError('FROZEN_RECOVERY_CHANGED')
    spec = importlib.util.spec_from_file_location('frozen_buildkit_recovery', RECOVERY)
    recovery = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(recovery)
    return recovery


def verify_previous(guards, recovery, root=PREVIOUS):
    guards.sealed(root, PREVIOUS_SEAL)
    state = guards.terminal(root)
    if (state is None or state['status'] != 'blocked'
            or state.get('error', {}).get('message') != 'dependency-probe:EXIT_1'
            or [(s['name'], s['exitCode']) for s in state['stages']] !=
            [('dependency-build', 0), ('derived-packages', 0), ('dependency-probe', 1)]):
        raise RuntimeError('PREVIOUS_STAGE_HISTORY_CHANGED')
    logs = guards.read(root / 'dependency-probe-logs.json')
    if not logs.get('stderr', '').endswith("ModuleNotFoundError: No module named 'past'\n"):
        raise RuntimeError('PREVIOUS_FAILURE_NOT_MISSING_PAST')
    if 'from past.builtins import basestring' not in logs['stderr']:
        raise RuntimeError('PREVIOUS_IMPORT_CHAIN_CHANGED')
    if guards.read(root / 'protocol.json') != guards.read(recovery.ORIGINAL / 'protocol.json'):
        raise RuntimeError('PREVIOUS_PROTOCOL_CHANGED')
    info = json.loads(guards.read(root / 'derived-image.json')['stdout'])[0]
    if info.get('Id') != DERIVED_ID or info.get('Architecture') != 'arm64' or info.get('Os') != 'linux':
        raise RuntimeError('PREVIOUS_DERIVED_IMAGE_CHANGED')
    return state


def acquire_gate(night, args, ops, guards, recovery, streaming, corpus):
    handles = recovery.acquire_gate(night, args, ops, guards, streaming, corpus)
    try:
        state = verify_previous(guards, recovery)
        closures = corpus.check_owned_containers(PREVIOUS, state['id'], ops)
        provenance = ops.read(night.root / 'continuation.json')
        source = night.root / 'continuation-source/past-continuation.py'
        shutil.copyfile(Path(__file__), source)
        provenance.update({
            'immediatePredecessor': str(PREVIOUS), 'immediatePredecessorSealSha256': PREVIOUS_SEAL,
            'immediatePredecessorContainersStopped': closures,
            'sourceSha256': guards.digest(source), 'frozenRecoverySha256': RECOVERY_SHA,
            'reusedStages': ['image-pull', 'base-packages', 'dependency-build', 'derived-packages'],
            'dependencyAddition': {'distribution': 'future', 'version': '1.0.0', 'wheelSha256': FUTURE_SHA},
            'runtimeEnvironmentChanged': True, 'modelAndInputsChanged': False,
            'correctionStage': 'future-layer-build', 'automaticRetry': False})
        ops.write(night.root / 'continuation.json', provenance)
        night.event('missing-dependency-predecessor-locked')
        return handles
    except BaseException:
        for handle in handles:
            handle.close()
        raise


def correction_dockerfile():
    requirement = FUTURE_URL + '#sha256=' + FUTURE_SHA
    return '\n'.join([
        'FROM ' + DERIVED_TAG,
        'RUN python3 -m pip install --disable-pip-version-check --no-input --no-cache-dir '
        '--only-binary=:all: --no-deps --retries 0 --timeout 30 ' + requirement,
        'RUN python3 -c "from past.builtins import basestring; import ffmpeg; '
        "import importlib.metadata as m; assert m.version('future') == '1.0.0'\"",
        '',
    ])


def inspect_image(night, ops, streaming, image, filename):
    value = streaming.captured(night, ops, ['docker', 'image', 'inspect', image])
    ops.write(night.root / filename, value)
    if value.get('exitCode') != 0:
        raise RuntimeError('CORRECTION_IMAGE_INSPECT_FAILED')
    info = json.loads(value['stdout'])[0]
    if info.get('Architecture') != 'arm64' or info.get('Os') != 'linux':
        raise RuntimeError('CORRECTION_IMAGE_NOT_ARM64')
    return info


def isolated_dependencies(night, args, ops, started, phase_end, streaming, recovery, root=PREVIOUS):
    night.check()
    before = inspect_image(night, ops, streaming, DERIVED_TAG, 'reused-image-inspect.json')
    if before.get('Id') != DERIVED_ID:
        raise RuntimeError('REUSED_IMAGE_ID_CHANGED')
    for name in ('base-packages.json', 'derived-packages.json', 'dependency-plan.json'):
        shutil.copyfile(root / name, night.root / ('reused-' + name))
    ops.write(night.root / 'reused-stages.json', {'root': str(root), 'sealSha256': PREVIOUS_SEAL,
              'stages': ['dependency-build', 'derived-packages'], 'derivedImageId': DERIVED_ID})
    context = night.root / 'future-layer'
    context.mkdir()
    (context / 'Dockerfile').write_text(correction_dockerfile())
    ops.write(night.root / 'dependency-correction.json', {'baseImageId': DERIVED_ID,
              'addition': 'future==1.0.0', 'wheelUrl': FUTURE_URL, 'wheelSha256': FUTURE_SHA,
              'reusedPythonPins': streaming.PYTHON_PINS, 'noDependencies': True,
              'modelAndInputsChanged': False, 'automaticRetry': False})
    tag = 'tvlens-streaming-' + night.owner + ':future'
    night.command('future-layer-build', ['docker', 'build', '--pull=false', '--network=default',
                  '--progress=plain', '-t', tag, '-f', str(context / 'Dockerfile'), str(context)],
                  recovery.bounded(night, started, phase_end, 300))
    info = inspect_image(night, ops, streaming, tag, 'corrected-image-inspect.json')
    old_layers = before.get('RootFS', {}).get('Layers', [])
    if not old_layers or info.get('RootFS', {}).get('Layers', [])[:len(old_layers)] != old_layers:
        raise RuntimeError('CORRECTION_BASE_LAYERS_CHANGED')
    image = info['Id']
    after = streaming.package_versions(night, ops, image, 'corrected-packages',
                                      recovery.bounded(night, started, phase_end, 180))
    expected = ops.read(root / 'derived-packages.json')
    if after != expected:
        raise RuntimeError('EXISTING_PACKAGES_OR_CUDA_CHANGED')
    if any(after['packages'].get(name) != version for name, version in streaming.PYTHON_PINS.items()):
        raise RuntimeError('FROZEN_PINS_CHANGED')
    return image


def run(args, recovery, guards):
    recovery.verify_original(guards)
    verify_previous(guards, recovery)
    guards.verify_streaming_package()
    streaming, corpus, ops = (guards.load(name) for name in ('streaming', 'corpus', 'ops'))
    ops.Night = recovery.recovery_night(ops.Night, ops)
    streaming.gate = lambda night, options, support: acquire_gate(
        night, options, support, guards, recovery, streaming, corpus)
    streaming.isolated_dependencies = lambda night, options, support, started, phase_end: isolated_dependencies(
        night, options, support, started, phase_end, streaming, recovery)
    streaming.bounded = recovery.bounded
    # Une ressource occupée bloque immédiatement ; aucune boucle de réadmission.
    streaming.wait_idle = lambda night, support, limit: streaming.resources(night, support, 'idle-once')
    return streaming.run(args, ops)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--out', required=True, type=Path)
    selected = parser.parse_args()
    root = selected.out.parent
    if (selected.out.name != 'results' or root.parent != BASE or not root.name.startswith('reprise-streaming-past-')
            or not root.is_dir() or root.is_symlink() or selected.out.exists() or selected.out.is_symlink()):
        parser.error('dossier results neuf requis sous /home/nvidia/tvlens-setup/reprise-streaming-past-*')
    if platform.system() != 'Linux' or platform.machine() != 'aarch64':
        raise RuntimeError('GX10_LINUX_ARM64_REQUIRED')
    recovery = load_recovery()
    args = SimpleNamespace(out=selected.out, night_lock=BASE / 'night.lock', gpu_lock=BASE / 'followup-gpu.lock',
        reference_lock=BASE / 'reference-2026-10-20/execution.lock', image=recovery.IMAGE,
        package=BASE / 'streamingvlm-20261020T220235Z/package',
        upstream=BASE / 'streamingvlm-20261020T220235Z/upstream', video=Path('/srv/tvlens-gx10/videos/spring.mp4'))
    return run(args, recovery, recovery.load_guards())


if __name__ == '__main__':
    sys.exit(main())
