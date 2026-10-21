"""Suffixe Ollama puis StreamingVLM, à déployer seulement après relecture."""
import argparse
from pathlib import Path
import platform
import shutil
import sys
import time

sys.dont_write_bytecode = True

import guards


def record_sources(night, ops):
    source = night.root / 'continuation-source'
    source.mkdir()
    for name in ('continuation.py', 'guards.py'):
        shutil.copyfile(Path(__file__).with_name(name), source / name)
    ops.write(night.root / 'continuation-source.json', {
        path.name: guards.digest(path) for path in source.iterdir()})


def missing(night, ops):
    ops.write(night.root / 'ollama-missing.json', {
        'atUtc': ops.utc(), 'reason': guards.MISSING_REASON,
        'remainingSeconds': night.deadline - time.monotonic(), 'attempted': False})
    night.event('workload-finished', ollamaArm='missing', readyForScoring=False)


def wait_gate(night, args, ops, vision, corpus, suffix=None, reserve=0):
    night.event('waiting-corpus-and-predecessors')
    while True:
        # Le manque de créneau clôt un suffixe sans commande et sans accès GPU.
        if reserve and night.deadline - time.monotonic() < reserve:
            return []
        night.check()
        corpus_state = guards.terminal(guards.CORPUS)
        suffix_state = guards.verify_suffix(suffix) if suffix else True
        if corpus_state and suffix_state:
            handles = vision.acquire([args.night_lock, args.gpu_lock, args.reference_lock])
            if handles:
                accepted = False
                try:
                    if not guards.terminal(guards.CORPUS) or (suffix and not guards.verify_suffix(suffix)):
                        raise RuntimeError('PREDECESSOR_CHANGED_AFTER_LOCK')
                    if not vision.night_finished(guards.NIGHT, ops):
                        raise RuntimeError('ORIGINAL_NIGHT_NOT_FINISHED')
                    guards.verify_original()
                    closures = {}
                    for root in (guards.ORIGINAL, guards.STREAMING, guards.CORPUS, guards.NIGHT):
                        state = guards.terminal(root)
                        closures[str(root)] = corpus.check_owned_containers(root, state.get('id'), ops)
                    available, evidence = corpus.idle(ops)
                    ops.write(night.root / 'gate-probe.json', {
                        'atUtc': ops.utc(), 'containersStopped': closures, 'idle': evidence})
                    if available:
                        ops.write(night.root / 'recovery-gate.json', {
                            'atUtc': ops.utc(), 'corpusRoot': str(guards.CORPUS),
                            'corpusStatusSha256': guards.digest(guards.CORPUS / 'status.json'),
                            'corpusSealSha256': guards.digest(guards.CORPUS / 'integrite.json'),
                            'suffixRoot': str(suffix) if suffix else None,
                            'suffixSealSha256': guards.digest(suffix / 'integrite.json') if suffix else None,
                            'ownedContainersStopped': True, 'replayAbsent': True,
                            'gpuIdle': True, 'ollamaIdle': True})
                        accepted = True
                        night.event('recovery-predecessors-locked')
                        return handles
                finally:
                    if not accepted:
                        for handle in handles:
                            handle.close()
        night.sleep(15)


def ollama_arm(night, args, ops, vision):
    tags = ops.api('http://127.0.0.1:11434/api/tags')
    ops.write(night.root / 'ollama-tags-before.json', tags)
    matches = [row for row in tags.get('models', []) if row.get('name') == guards.MODEL]
    if len(matches) != 1 or guards.normalized_digest(matches[0].get('digest')) != guards.DIGEST:
        raise RuntimeError('INSTALLED_MODEL_IDENTITY_CHANGED')
    ops.write(night.root / 'model-precision-note.json', {
        'tag': guards.MODEL, 'digest': matches[0]['digest'],
        'observedQuantizationMetadata': matches[0].get('details', {}).get('quantization_level'),
        'interpretation': 'Tag bf16, métadonnée F16 observée ; parité BF16 des moteurs non démontrée.'})
    if night.deadline - time.monotonic() < vision.OLLAMA_MIN_SECONDS:
        missing(night, ops)
        return
    night.start_monitor()
    vision.probe(night, args, ops, 'ollama', 'preflight')
    vision.probe(night, args, ops, 'ollama', 'full')
    guards.verify_cases(night.root, 'ollama', guards.MODEL)
    after = ops.api('http://127.0.0.1:11434/api/tags')
    ops.write(night.root / 'ollama-tags-after.json', after)
    matches = [row for row in after.get('models', []) if row.get('name') == guards.MODEL]
    if len(matches) != 1 or guards.normalized_digest(matches[0].get('digest')) != guards.DIGEST:
        raise RuntimeError('MODEL_CHANGED_DURING_PROBE')
    night.event('workload-finished', ollamaArm='complete', readyForScoring=False)


def run_ollama(args, ops, vision, corpus):
    night = ops.Night(args.out, vision.DEADLINE)
    handles = []
    success = False
    try:
        original = guards.verify_original()
        record_sources(night, ops)
        ops.write(night.root / 'continuation.json', {
            'original': original, 'corpusRoot': str(guards.CORPUS),
            'deadlineUtc': vision.DEADLINE.isoformat(), 'onlyMissingArm': 'ollama',
            'digestCorrection': 'optional sha256: prefix only; same 64 lowercase hex digits',
            'downloadsAllowed': False, 'readyForScoring': False})
        ops.write(night.root / 'protocol.json', ops.read(guards.ORIGINAL / 'protocol.json'))
        source = night.root / 'source'
        shutil.copytree(guards.ORIGINAL / 'source', source)
        if guards.digest(args.manifest) != guards.MANIFEST_SHA:
            raise RuntimeError('MANIFEST_CHANGED')
        handles = wait_gate(night, args, ops, vision, corpus, reserve=vision.OLLAMA_MIN_SECONDS)
        if not handles or night.deadline - time.monotonic() < vision.OLLAMA_MIN_SECONDS:
            missing(night, ops)
        else:
            vision.verify_repo(night, ops, args.repo)
            vision.resources(night, ops, 'before-ollama-continuation')
            ollama_arm(night, args, ops, vision)
        success = True
    except Exception as error:
        night.event('blocked', error={'type': type(error).__name__, 'message': str(error)}, readyForScoring=False)
    finally:
        try:
            success = night.close() and success
        finally:
            for handle in handles:
                handle.close()
    return 0 if success else 1


def run_streaming(args, ops, vision, corpus):
    streaming = guards.load('streaming')
    guards.verify_streaming_package()
    guards.sealed(guards.STREAMING, guards.STREAMING_SEAL)
    state = guards.terminal(guards.STREAMING)
    expected_error = 'PREDECESSOR_FAILED:' + str(guards.ORIGINAL)
    if state.get('error', {}).get('message') != expected_error or state.get('stages'):
        raise RuntimeError('STREAMING_ALREADY_ATTEMPTED_OR_OTHER_FAILURE')

    def gate(night, _args, _ops):
        record_sources(night, ops)
        ops.write(night.root / 'continuation.json', {
            'original': guards.verify_original(), 'corpusRoot': str(guards.CORPUS),
            'suffixRoot': str(args.suffix), 'originalStreamingRoot': str(guards.STREAMING),
            'gateAmendment': 'corpus terminal, original Qwen digest-prefix incident, suffix complete or missing for time',
            'deadlineUtc': streaming.DEADLINE.isoformat(), 'workloadProtocolChanged': False})
        return wait_gate(night, args, ops, vision, corpus, suffix=args.suffix)

    # Seule la dépendance de file change ; le protocole de travail gelé reste celui du paquet d'origine.
    streaming.gate = gate
    return streaming.run(args, ops)


def parse():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('mode', choices=('ollama', 'streaming'))
    parser.add_argument('--out', type=Path, required=True, help='Dossier results neuf sous reprise-*')
    parser.add_argument('--suffix', type=Path, help='Dossier results du suffixe Ollama, requis pour Streaming')
    args = parser.parse_args()
    root = args.out.parent
    if (args.out.name != 'results' or root.parent != guards.BASE or not root.name.startswith('reprise-')
            or not root.is_dir() or root.is_symlink() or args.out.exists() or args.out.is_symlink()):
        parser.error('dossier results neuf requis, sous /home/nvidia/tvlens-setup/reprise-*')
    if args.mode == 'streaming' and (not args.suffix or args.suffix == args.out):
        parser.error('--suffix distinct requis')
    args.night_lock = guards.BASE / 'night.lock'
    args.gpu_lock = guards.BASE / 'followup-gpu.lock'
    args.reference_lock = guards.BASE / 'reference-2026-10-20/execution.lock'
    args.repo = Path('/home/nvidia/tvlens')
    args.manifest = guards.BASE / 'nuit-20261020T210107Z/package/execution/entrees-perception/perception-five-images.json'
    args.package = guards.BASE / 'streamingvlm-20261020T220235Z/package'
    args.upstream = guards.BASE / 'streamingvlm-20261020T220235Z/upstream'
    args.video = Path('/srv/tvlens-gx10/videos/spring.mp4')
    args.image = 'nvcr.io/nvidia/pytorch:26.09-py3@sha256:307c449df7dabed6b36e017a2b2f2e45bdec9dc203b81507111315f1e971de6e'
    return args


def main():
    args = parse()
    if platform.system() != 'Linux' or platform.machine() != 'aarch64':
        raise RuntimeError('GX10_LINUX_ARM64_REQUIRED')
    ops, vision, corpus = (guards.load(name) for name in ('ops', 'vision', 'corpus'))
    if args.mode == 'ollama':
        return run_ollama(args, ops, vision, corpus)
    return run_streaming(args, ops, vision, corpus)


if __name__ == '__main__':
    sys.exit(main())
