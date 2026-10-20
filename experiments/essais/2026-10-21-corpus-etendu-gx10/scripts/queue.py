"""File GX10 exclusive pour les trois médias non couverts par la référence."""
import argparse
import datetime as dt
import fcntl
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import shutil
import time
import urllib.request


SOURCE_COMMIT = '2035a2faad499659bcdf940c6104e50e311a9cd6'
SUPPORT_SHA256 = 'e6bec0c7415c67ed1e4901e784a6ee33e6dd58b684bca46dc4ce7804dd30d6b5'
DEADLINE_MAX = dt.datetime(2026, 10, 23, 5, tzinfo=dt.timezone.utc)
MODELS = {
    'gemma3:4b': '68ceab7e468a31c988b44d5a4984a0e21f58c4f7158c6ce29c1804babac38df7',
    'qwen3.8:27b': 'aaee06c39dcf2437cde036998d960e1fc1494b8191be7cc9657d01e509097813',
    'qwen3-embedding:0.6b': 'ac6da0dfba84a81fdbfbaf330198c33cd77c4cdfc53e8bc50eb581914a15621d',
}
VIDEOS = (
    {'id': 'boeuf-bourguignon', 'file': '05-boeuf-bourguignon.mp4', 'language': 'fr',
     'durationMs': 736000, 'sizeBytes': 72542226,
     'sha256': 'ec9d70f64ea55dc13a6e5c162a22ce88a383b65d97c442326e6a5045d7c478fd',
     'questionsSha256': 'a1ffd0e1afc30e222e38fcf9e71793946ed2e350a0193d40e2d3182209497639',
     'questionTimesMs': (200000, 248000, 456000, 548000, 656000)},
    {'id': 'tears-of-steel', 'file': '08-tears-of-steel.mov', 'language': 'en',
     'durationMs': 728000, 'sizeBytes': 372178639,
     'sha256': 'efa9062d9cdb7a338e40ad530dfdf234806743f29ae6a1a136b97ece4e588e8f',
     'questionsSha256': '4f57f2aeb6d042d626a6ed0bcb2d58b6b3a59988a3e1aba4cf760c3838e6b98e',
     'questionTimesMs': (48000, 216000, 264000, 408000, 552000)},
    {'id': 'artemis', 'file': '09-artemis-lancement.mp4', 'language': 'en',
     'durationMs': 2099000, 'sizeBytes': 244981763,
     'sha256': '6ac25c124375fdac03a2a3e2bd599ea3516a75e9fd03bb193de18d6575297710',
     'questionsSha256': '59c962065e54cbcb7d7cdece833b637898ab4f0c31b30e429f354665c8f60655',
     'questionTimesMs': (968000, 1248000, 1664000, 1792000, 2096000)},
)
WHISPER = {
    'base': '1c0072714e8501bc4a295c571cae664996feaabcbf146fff1c0c224a9e32fcc7',
    'small': 'da434a157bddc800be70d81f3f9374f73bdb07c70c6036a4681144a30c6d19de',
    'large-v3-turbo': '8b08e556f409411d724f583472fed30a0fb267b9031c7122f34dde6d7c55c01c',
}


def digest(path):
    with Path(path).open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def load_support(path):
    if digest(path) != SUPPORT_SHA256:
        raise RuntimeError('SUPPORT_SHA_MISMATCH')
    spec = importlib.util.spec_from_file_location('night_common', path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def predecessor(root, ops):
    status_file, seal_file, events_file = (root / name for name in
                                           ('status.json', 'integrite.json', 'events.jsonl'))
    if not status_file.exists() or not seal_file.exists() or not events_file.exists():
        return None
    status = ops.read(status_file)
    state = status.get('status')
    if state not in ('finished', 'blocked', 'cleanup-failed'):
        return None
    seal = ops.read(seal_file).get('files', {})
    if any(seal.get(name) != digest(root / name) for name in ('status.json', 'events.jsonl')):
        raise RuntimeError('PREDECESSOR_SEAL_INVALID')
    last = events_file.read_text().splitlines()
    if not last or json.loads(last[-1]).get('status') != state:
        raise RuntimeError('PREDECESSOR_EVENT_INVALID')
    if state == 'cleanup-failed':
        raise RuntimeError('PREDECESSOR_CLEANUP_FAILED')
    if state == 'finished' and status.get('cleanupConfirmed') is not True:
        raise RuntimeError('PREDECESSOR_CLEANUP_UNCONFIRMED')
    return status


def check_owned_containers(root, owner, ops):
    if not owner:
        raise RuntimeError('PREDECESSOR_OWNER_MISSING')
    listed = ops.capture(['docker', 'ps', '-aq', '--filter', 'label=tvlens.owner=' + owner], timeout=10)
    if listed.get('exitCode') != 0:
        raise RuntimeError('PREDECESSOR_DOCKER_UNKNOWN')
    ids = set(listed.get('stdout', '').split())
    ids.update(path.read_text().strip() for path in root.glob('*.cid') if path.read_text().strip())
    for cid in ids:
        result = ops.capture(['docker', 'inspect', cid], timeout=10)
        if result.get('exitCode') != 0:
            raise RuntimeError('PREDECESSOR_CONTAINER_UNKNOWN')
        container = json.loads(result['stdout'])[0]
        if (container.get('Config', {}).get('Labels', {}).get('tvlens.owner') != owner or
                container.get('State', {}).get('Running') is not False):
            raise RuntimeError('PREDECESSOR_CONTAINER_RUNNING_OR_UNOWNED')
    return sorted(ids)


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


def idle(ops):
    replay = ops.capture(['pgrep', '-f', 'replay-local-(stream|perception)|replay-reinspection'], timeout=5)
    gpu = ops.capture(['nvidia-smi', '--query-compute-apps=pid', '--format=csv,noheader,nounits'], timeout=10)
    try:
        with urllib.request.urlopen('http://127.0.0.1:11434/api/ps', timeout=3) as response:
            ollama = json.load(response)
    except (OSError, ValueError) as error:
        ollama = {'error': type(error).__name__}
    evidence = {'replay': replay, 'gpu': gpu, 'ollama': ollama}
    if replay.get('exitCode') != 1 or gpu.get('exitCode') != 0:
        return False, evidence
    if gpu.get('stdout', '').strip() and 'No running processes found' not in gpu['stdout']:
        return False, evidence
    return ollama.get('models') == [], evidence


def gate(night, args, ops):
    locks = (args.night_lock, args.gpu_lock, args.reference_lock)
    night.event('waiting-streamingvlm')
    while True:
        night.check()
        state = predecessor(args.streaming_root, ops)
        if state is not None:
            handles = acquire(locks)
            if handles:
                try:
                    state = predecessor(args.streaming_root, ops)
                    if state is None:
                        raise RuntimeError('PREDECESSOR_CHANGED')
                    containers = check_owned_containers(args.streaming_root, state.get('id'), ops)
                    available, evidence = idle(ops)
                    ops.write(night.root / 'gate-probe.json', {'predecessor': state,
                              'containerIds': containers, 'idle': evidence})
                    if available:
                        ops.write(night.root / 'gate.json', {'atUtc': ops.utc(),
                                  'predecessorStatus': state['status'],
                                  'predecessorStatusSha256': digest(args.streaming_root / 'status.json'),
                                  'predecessorSealSha256': digest(args.streaming_root / 'integrite.json'),
                                  'ownedContainersStopped': True, 'locks': [str(x) for x in locks]})
                        night.event('predecessor-locked', predecessorStatus=state['status'])
                        return handles
                finally:
                    if not (night.root / 'gate.json').exists():
                        for handle in handles:
                            handle.close()
        night.sleep(15)


def verify_inputs(night, args, ops):
    commit = ops.capture(['git', '-C', str(args.repository), 'rev-parse', 'HEAD'])
    if commit.get('exitCode') != 0 or commit.get('stdout', '').strip() != SOURCE_COMMIT:
        raise RuntimeError('SOURCE_COMMIT_MISMATCH')
    dirty = ops.capture(['git', '-C', str(args.repository), 'status', '--porcelain', '--',
                         'core', 'adapters', 'runtime', 'scripts'])
    if dirty.get('exitCode') != 0 or dirty.get('stdout', '').strip():
        raise RuntimeError('SOURCE_CODE_DIRTY')
    identities = {'codeCommit': SOURCE_COMMIT, 'supportSha256': SUPPORT_SHA256,
                  'queueSha256': digest(__file__), 'scenarioSha256': digest(args.scenario),
                  'videos': [], 'configs': {}, 'models': MODELS, 'readyForScoring': False}
    for video in VIDEOS:
        source = args.media_root / video['file']
        questions = args.questions_root / (video['id'] + '.json')
        if not source.is_file() or source.stat().st_size != video['sizeBytes'] or digest(source) != video['sha256']:
            raise RuntimeError('MEDIA_IDENTITY_MISMATCH:' + video['id'])
        if digest(questions) != video['questionsSha256']:
            raise RuntimeError('QUESTION_IDENTITY_MISMATCH:' + video['id'])
        records = ops.read(questions)['questions']
        if len(records) != 5 or tuple(item['atMs'] for item in records) != video['questionTimesMs']:
            raise RuntimeError('QUESTION_SCHEDULE_MISMATCH:' + video['id'])
        identities['videos'].append({'id': video['id'], 'source': str(source),
                                     'mediaSha256': video['sha256'], 'questions': str(questions),
                                     'questionsSha256': video['questionsSha256'],
                                     'language': video['language'], 'durationMs': video['durationMs']})
    for name, sha in WHISPER.items():
        config = args.reference_root / ('config-' + name + '.env')
        if digest(config) != sha:
            raise RuntimeError('CONFIG_IDENTITY_MISMATCH:' + name)
        identities['configs'][name] = {'path': str(config), 'sha256': sha}
    with urllib.request.urlopen('http://127.0.0.1:11434/api/tags', timeout=5) as response:
        tags = json.load(response)
    observed = {item['name']: item.get('digest') for item in tags.get('models', [])}
    if any(observed.get(name) != sha for name, sha in MODELS.items()):
        raise RuntimeError('OLLAMA_MODEL_IDENTITY_MISMATCH')
    identities['observedModelDigests'] = {name: observed[name] for name in MODELS}
    ops.write(night.root / 'identities.json', identities)


def bounded(night, seconds):
    remaining = night.deadline - time.monotonic()
    if remaining < 60:
        raise RuntimeError('GLOBAL_BUDGET_EXHAUSTED')
    return min(seconds, remaining)


def prepare(night, args, ops, video):
    folder = night.root / ('preparation-' + video['id'])
    command = ['node', str(args.repository / 'scripts/prepare-video-replay.cjs'),
               '--file', str(args.media_root / video['file']), '--out', str(folder),
               '--start-ms', '0', '--duration-ms', str(video['durationMs']),
               '--block-ms', '8000', '--frames', '5', '--jpeg-quality', '3',
               '--config', str(args.reference_root / 'config-base.env')]
    night.command('cmd-prepare-' + video['id'], command, bounded(night, 4500), cwd=args.repository)
    night.command('cmd-validate-preparation-' + video['id'],
                  ['node', str(args.repository / 'scripts/prepare-video-replay.cjs'),
                   '--validate', '--out', str(folder)], bounded(night, 900), cwd=args.repository)
    questions = args.questions_root / (video['id'] + '.json')
    night.command('cmd-scenario-' + video['id'],
                  ['node', str(args.scenario), str(folder), str(questions), video['language']],
                  bounded(night, 60), cwd=args.repository)
    night.command('cmd-validate-scenario-' + video['id'],
                  ['node', str(args.repository / 'scripts/replay-local-stream.cjs'),
                   '--scenario', str(folder / 'scenario.json'), '--out',
                   str(night.root / ('validation-' + video['id'])), '--validate'],
                  bounded(night, 900), cwd=args.repository)
    return folder


def summarize(report):
    questions = report.get('questions', [])
    if not isinstance(questions, list):
        questions = []
    return {'complete': report.get('complete'), 'status': report.get('status'),
            'runId': report.get('runId'), 'questionCount': len(questions),
            'questions': [{'id': item.get('id'), 'acquired': item.get('acquired'),
                           'status': item.get('status')} for item in questions],
            'guardFailures': report.get('guardFailures'),
            'diagnostics': report.get('diagnostics'),
            'shutdown': report.get('shutdown'), 'readyForScoring': False}


def run(night, args, ops, model, video, preparation):
    key = model + '-' + video['id']
    folder = night.root / ('run-' + key)
    limit = video['durationMs'] / 1000 + 180 + 30 + 1500
    night.command('cmd-run-' + key,
                  ['node', str(args.repository / 'scripts/replay-local-stream.cjs'),
                   '--scenario', str(preparation / 'scenario.json'), '--out', str(folder),
                   '--config', str(args.reference_root / ('config-' + model + '.env')),
                   '--execute'], bounded(night, limit), cwd=args.repository)
    report_file = folder / 'campaign.json'
    if not report_file.exists():
        raise RuntimeError('CAMPAIGN_REPORT_MISSING:' + key)
    report = ops.read(report_file)
    summary = summarize(report)
    ops.write(night.root / ('summary-' + key + '.json'), summary)
    shutdown = report.get('shutdown') or {}
    if (not report.get('complete') or report.get('status') != 'complete' or
            shutdown.get('archiveConfirmed') is not True or
            shutdown.get('releaseConfirmed') is not True):
        raise RuntimeError('CAMPAIGN_INCOMPLETE:' + key)
    night.event('run-complete', run=key)


def parse():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--out', type=Path, required=True, help='Dossier neuf de traces')
    parser.add_argument('--streaming-root', type=Path, required=True)
    parser.add_argument('--support', type=Path, required=True)
    parser.add_argument('--repository', type=Path, required=True)
    parser.add_argument('--media-root', type=Path, default=Path('/srv/tvlens-gx10/videos'))
    parser.add_argument('--reference-root', type=Path,
                        default=Path('/home/nvidia/tvlens-setup/reference-2026-10-20'))
    parser.add_argument('--scenario', type=Path, default=Path(__file__).with_name('scenario.cjs'))
    parser.add_argument('--questions-root', type=Path,
                        default=Path(__file__).resolve().parents[1] / 'questions')
    parser.add_argument('--night-lock', type=Path, default=Path('/home/nvidia/tvlens-setup/night.lock'))
    parser.add_argument('--gpu-lock', type=Path, default=Path('/home/nvidia/tvlens-setup/followup-gpu.lock'))
    parser.add_argument('--reference-lock', type=Path,
                        default=Path('/home/nvidia/tvlens-setup/reference-2026-10-20/execution.lock'))
    parser.add_argument('--deadline', required=True, help='Fin absolue ISO-8601 en UTC')
    result = parser.parse_args()
    deadline = dt.datetime.fromisoformat(result.deadline.replace('Z', '+00:00'))
    if deadline.tzinfo is None or deadline > DEADLINE_MAX:
        parser.error('deadline UTC requise, au plus tard le 23 octobre 2026 à 05:00 UTC')
    result.deadline_utc = deadline.astimezone(dt.timezone.utc)
    return result


def main():
    args = parse()
    ops = load_support(args.support)
    night = ops.Night(args.out, args.deadline_utc)
    handles = []
    try:
        handles = gate(night, args, ops)
        verify_inputs(night, args, ops)
        night.start_monitor()
        preparations = {video['id']: prepare(night, args, ops, video) for video in VIDEOS}
        night.event('preparations-validated')
        for model in WHISPER:
            for video in VIDEOS:
                night.check()
                run(night, args, ops, model, video, preparations[video['id']])
        night.event('workload-finished', readyForScoring=False)
    except BaseException as error:
        night.event('blocked', error=f'{type(error).__name__}:{error}', readyForScoring=False)
        raise
    finally:
        try:
            night.close()
        finally:
            for handle in handles:
                handle.close()


if __name__ == '__main__':
    main()
