"""Reprise unique après refus du mode réseau BuildKit, sans changer le protocole."""
import argparse
import datetime
import importlib.util
import json
from pathlib import Path
import platform
import shutil
import sys
import time
from types import SimpleNamespace

sys.dont_write_bytecode = True
BASE = Path('/home/nvidia/tvlens-setup')
ORIGINAL = BASE / 'reprise-streaming-arm-20261021T002414Z/results'
ORIGINAL_SEAL = '29c2285651790458c73ec217dd782c810ba533ec488877f486ae28770710c8b1'
SUFFIX = BASE / 'reprise-qwen-arm-20261021T002414Z/results'
GUARDS = BASE / 'reprise-continuation-20261021T002414Z/guards.py'
GUARDS_SHA = 'ab9be23fac11438b699951a35f7229b2abb9a632bc70e8ae50745e124aaa15e7'
IMAGE = 'nvcr.io/nvidia/pytorch:26.09-py3@sha256:307c449df7dabed6b36e017a2b2f2e45bdec9dc203b81507111315f1e971de6e'
ERROR = ('ERROR: failed to build: network mode "bridge" not supported by buildkit - '
         'you can define a custom network for your builder using the network driver-opt in buildx create')


def load_guards():
    import hashlib
    if hashlib.sha256(GUARDS.read_bytes()).hexdigest() != GUARDS_SHA:
        raise RuntimeError('GUARDS_CHANGED')
    spec = importlib.util.spec_from_file_location('frozen_recovery_guards', GUARDS)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def verify_original(guards, root=ORIGINAL, expected=ORIGINAL_SEAL):
    guards.sealed(root, expected)
    state = guards.terminal(root)
    stages = state.get('stages', [])
    if (state['status'] != 'blocked' or state.get('error', {}).get('message') != 'dependency-build:EXIT_1'
            or [(s['name'], s['exitCode']) for s in stages] !=
            [('image-pull', 0), ('base-packages', 0), ('dependency-build', 1)]):
        raise RuntimeError('ORIGINAL_STAGE_HISTORY_CHANGED')
    if (root / 'dependency-build/stderr.log').read_text().strip() != ERROR:
        raise RuntimeError('ORIGINAL_FAILURE_NOT_NETWORK_MODE')
    if stages[-1]['argv'].count('--network=bridge') != 1:
        raise RuntimeError('ORIGINAL_BUILD_COMMAND_CHANGED')
    protocol = guards.read(root / 'protocol.json')
    if (protocol.get('image') != IMAGE or protocol.get('wallBudgetSeconds') != 12600
            or protocol.get('shortPhaseSeconds') != 5400):
        raise RuntimeError('ORIGINAL_PROTOCOL_CHANGED')
    origin = datetime.datetime.fromisoformat(guards.read(root / 'recovery-gate.json')['atUtc'])
    return {'root': str(root), 'sealSha256': guards.digest(root / 'integrite.json'),
            'originalWorkloadStartUtc': origin.isoformat(),
            'shortDeadlineUtc': (origin + datetime.timedelta(seconds=5400)).isoformat(),
            'effectiveDeadlineUtc': (origin + datetime.timedelta(seconds=12600)).isoformat()}


def acquire_gate(night, args, ops, guards, streaming, corpus):
    handles = streaming.acquire([args.night_lock, args.gpu_lock, args.reference_lock])
    if not handles:
        raise RuntimeError('EXCLUSIVE_LOCK_UNAVAILABLE')
    try:
        provenance = verify_original(guards)
        guards.verify_streaming_package()
        guards.verify_original()
        suffix_state = guards.verify_suffix(SUFFIX)
        if not suffix_state or suffix_state.get('status') != 'finished':
            raise RuntimeError('QWEN_SUFFIX_NOT_FINISHED')
        closures = {}
        for root in (guards.NIGHT, guards.CORPUS, guards.ORIGINAL, guards.STREAMING, SUFFIX, ORIGINAL):
            state = guards.terminal(root)
            if state is None:
                raise RuntimeError('PREDECESSOR_NOT_TERMINAL')
            if root in (guards.NIGHT, guards.CORPUS) and state['status'] != 'finished':
                raise RuntimeError('PREDECESSOR_NOT_FINISHED')
            closures[str(root)] = corpus.check_owned_containers(root, state['id'], ops)
        idle, evidence = corpus.idle(ops)
        ops.write(night.root / 'gate-probe.json', {'containersStopped': closures, 'idle': evidence})
        if not idle:
            raise RuntimeError('GPU_REPLAY_OR_OLLAMA_NOT_IDLE')
        now = datetime.datetime.now(datetime.timezone.utc)
        effective = datetime.datetime.fromisoformat(provenance['effectiveDeadlineUtc'])
        short = datetime.datetime.fromisoformat(provenance['shortDeadlineUtc'])
        night.deadline = min(night.deadline, time.monotonic() + (effective - now).total_seconds())
        night.short_deadline = min(night.deadline, time.monotonic() + (short - now).total_seconds())
        if night.short_deadline - time.monotonic() < 30:
            raise RuntimeError('ORIGINAL_SHORT_BUDGET_EXHAUSTED')
        source = night.root / 'continuation-source'
        source.mkdir()
        shutil.copyfile(Path(__file__), source / 'continuation.py')
        ops.write(night.root / 'continuation.json', {
            **provenance, 'sourceSha256': guards.digest(source / 'continuation.py'),
            'networkCorrection': '--network=bridge -> --network=default for dependency-build only',
            'reusedStages': ['image-pull', 'base-packages'], 'workloadProtocolChanged': False,
            'budgetReset': False, 'automaticRetry': False, 'readyForScoring': False})
        night.event('recovery-predecessors-locked')
        return handles
    except BaseException:
        for handle in handles:
            handle.close()
        raise


def recovery_night(original_class, ops, root=ORIGINAL):
    class RecoveryNight(original_class):
        def command(self, name, argv, timeout, cwd=None):
            if name == 'image-pull':
                if argv != ['docker', 'pull', '--platform', 'linux/arm64', IMAGE]:
                    raise RuntimeError('REUSED_IMAGE_COMMAND_CHANGED')
                self.check()
                folder = self.root / name
                folder.mkdir()
                ops.write(folder / 'reused.json', {'root': str(root / name), 'sealSha256': ORIGINAL_SEAL})
                self.event('image-pull-reused')
                return folder
            if name == 'dependency-build':
                if argv[:3] != ['docker', 'build', '--pull=false'] or argv.count('--network=bridge') != 1:
                    raise RuntimeError('BUILD_COMMAND_CHANGED')
                source_file = Path(argv[argv.index('-f') + 1])
                if ops.digest(source_file) != ops.digest(root / 'dependency-layer/Dockerfile'):
                    raise RuntimeError('DEPENDENCY_DOCKERFILE_CHANGED')
                argv = ['--network=default' if value == '--network=bridge' else value for value in argv]
            return super().command(name, argv, timeout, cwd)
    return RecoveryNight


def reuse_packages(original, ops, root=ORIGINAL):
    def packages(night, passed_ops, image, stage, timeout):
        if stage != 'base-packages':
            return original(night, passed_ops, image, stage, timeout)
        if image != IMAGE:
            raise RuntimeError('BASE_IMAGE_CHANGED')
        night.check()
        value = ops.read(root / 'base-packages.json')
        ops.write(night.root / 'base-packages.json', value)
        ops.write(night.root / 'base-packages-reused.json', {'root': str(root), 'sealSha256': ORIGINAL_SEAL})
        return value
    return packages


def bounded(night, started, phase_end, wanted):
    phase_cap = night.short_deadline if phase_end - started <= 5400 else night.deadline
    remaining = min(night.deadline, phase_cap) - time.monotonic()
    if remaining < 30:
        raise RuntimeError('PILOT_TIME_BUDGET_EXHAUSTED')
    return min(wanted, remaining)


def run(args, guards):
    verify_original(guards)
    guards.verify_streaming_package()
    streaming, corpus, ops = (guards.load(name) for name in ('streaming', 'corpus', 'ops'))
    ops.Night = recovery_night(ops.Night, ops)
    streaming.gate = lambda night, options, support: acquire_gate(night, options, support, guards, streaming, corpus)
    streaming.package_versions = reuse_packages(streaming.package_versions, ops)
    streaming.bounded = bounded
    return streaming.run(args, ops)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--out', required=True, type=Path)
    selected = parser.parse_args()
    root = selected.out.parent
    if (selected.out.name != 'results' or root.parent != BASE or not root.name.startswith('reprise-')
            or not root.is_dir() or root.is_symlink() or selected.out.exists() or selected.out.is_symlink()):
        parser.error('dossier results neuf requis sous /home/nvidia/tvlens-setup/reprise-*')
    if platform.system() != 'Linux' or platform.machine() != 'aarch64':
        raise RuntimeError('GX10_LINUX_ARM64_REQUIRED')
    args = SimpleNamespace(out=selected.out, night_lock=BASE / 'night.lock', gpu_lock=BASE / 'followup-gpu.lock',
        reference_lock=BASE / 'reference-2026-10-20/execution.lock', image=IMAGE,
        package=BASE / 'streamingvlm-20261020T220235Z/package',
        upstream=BASE / 'streamingvlm-20261020T220235Z/upstream', video=Path('/srv/tvlens-gx10/videos/spring.mp4'))
    return run(args, load_guards())


if __name__ == '__main__':
    sys.exit(main())
