"""Confirme la retenue vision sur deux vidéos avec le replay local figé."""
import argparse
import copy
import datetime
import fcntl
import hashlib
import importlib.util
import json
from pathlib import Path
import platform
import shutil
import subprocess
import sys


HERE = Path(__file__).resolve().parent
ORDER = (('01-A', 'A'), ('02-B', 'B'), ('03-B', 'B'), ('04-A', 'A'))
VIDEOS = ('kennedy', 'spring')
BUDGET_SECONDS = 3 * 60 * 60
RUN_TIMEOUT_SECONDS = 6000
VALIDATION_TIMEOUT_SECONDS = 120
COMMON_SHA256 = 'e6bec0c7415c67ed1e4901e784a6ee33e6dd58b684bca46dc4ce7804dd30d6b5'
RUNNER_SHA256 = '532329d2f84707d0380c52fce59d7e025965ea0106c53c93eac1bd244ce9ef77'
FROZEN_PLAN_SHA256 = '070e4971aa05903604054962016032203910e2bd9a31b6f4eaadfdffd881b015'
CONFIG_SHA256 = '1c0072714e8501bc4a295c571cae664996feaabcbf146fff1c0c224a9e32fcc7'
WHISPER_SHA256 = '60ed5bc3dd14eea856493d334349b405782ddcaf0028d4b5df4088345fba2efe'
WHISPER_BINARY_SHA256 = '53cff4273af0bd48553145a2cb5ba4f8cf245278d3733884ed2635ecc9a97c43'
CODE_SHAS = {'2035a2faad499659bcdf940c6104e50e311a9cd6', 'd4183da6a10b05016564f3d6dd5f3d66651a9c02'}
MODELS = {
    'qwen3-embedding:0.6b': 'ac6da0dfba84a81fdbfbaf330198c33cd77c4cdfc53e8bc50eb581914a15621d',
    'qwen3.8:27b': 'aaee06c39dcf2437cde036998d960e1fc1494b8191be7cc9657d01e509097813',
    'gemma3:4b': '68ceab7e468a31c988b44d5a4984a0e21f58c4f7158c6ce29c1804babac38df7',
}
REFERENCE_SHA256 = {
    'kennedy': '8046399d943bde5f2e94306bb3c12eaf9a4350a3e2021e48863b8de076c68db1',
    'spring': '61c4ee15a8ce58d7f1d13e8e89a5b5437a734f2b25664cce85ebfad424c3387f',
}
MEDIA = {
    'kennedy': ('/srv/tvlens-gx10/videos/kennedy-rice-7min.mp4',
                'f542af18fda70d00bef6d4c167a9af4aa239a7a064fd306c6f1aa45035b2c611'),
    'spring': ('/srv/tvlens-gx10/videos/spring.mp4',
               'c2c678f2a70338c060b33608bc34d0a1050cd284e249814b3dac0d85eaaa443a'),
}


def digest(path):
    with Path(path).open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def read(path):
    return json.loads(Path(path).read_text())


def write(path, value):
    Path(path).write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n')


def verified(path, expected):
    if digest(path) != expected:
        raise ValueError('SHA256_DIFFERENT:' + str(path))


def verify_package():
    inventory = read(HERE / 'package.sha256.json')
    for name, expected in inventory['files'].items():
        verified(HERE / name, expected)
    return inventory


def reference(video):
    file = HERE / 'reference' / (video + '.json')
    verified(file, REFERENCE_SHA256[video])
    scene = read(file)
    if scene['config']['visionDuringAsk'] is not True or len(scene['questions']) != 5:
        raise ValueError('REFERENCE_INVALID:' + video)
    if any(not question['id'].startswith(video + '-') for question in scene['questions']):
        raise ValueError('REFERENCE_QUESTIONS_INVALID:' + video)
    return scene


def scenarios(scene):
    a = copy.deepcopy(scene)
    b = copy.deepcopy(scene)
    b['config']['visionDuringAsk'] = False
    return {'A': a, 'B': b}


def input_files(preparation):
    items = {'blocks.json': read(preparation / 'preparation.json')['index']['sha256']}
    details = read(preparation / 'preparation.json')
    items['manifest.json'] = details['manifest']['sha256']
    for block in read(preparation / 'blocks.json')['blocks']:
        for output in block['outputs']:
            key = output['path']
            if key in items and items[key] != output['sha256']:
                raise ValueError('DUPLICATE_OUTPUT:' + key)
            items[key] = output['sha256']
    return items


def verify_inputs(preparation, scene, video):
    verified(preparation / 'preparation.json', scene['provenance']['preparation']['sha256'])
    verified(preparation / 'blocks.json', scene['index']['sha256'])
    details = read(preparation / 'preparation.json')
    if details.get('complete') is not True or details['plannedDurationMs'] != scene['plannedDurationMs']:
        raise ValueError('PREPARATION_INCOMPLETE')
    source = details['source']
    media_path, expected_media = MEDIA[video]
    if source['sha256'] != expected_media or source['sha256'] != read(preparation / 'manifest.json')['cases'][0]['provenance']['sourceSha256']:
        raise ValueError('SOURCE_IDENTITY_DIFFERENT')
    verified(media_path, expected_media)
    for name, expected in input_files(preparation).items():
        verified(preparation / name, expected)
    return {'sourceSha256': source['sha256'], 'files': input_files(preparation)}


def acquire(path):
    handle = Path(path).open('a+b')
    try:
        fcntl.flock(handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BaseException:
        handle.close()
        raise
    return handle


def load_common(path):
    verified(path, COMMON_SHA256)
    spec = importlib.util.spec_from_file_location('frozen_night_common', path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def verify_environment(args, common):
    if platform.system() != 'Linux' or platform.machine() != 'aarch64':
        raise ValueError('GX10_LINUX_ARM64_REQUIRED')
    if not (args.reference / 'termine.txt').exists():
        raise ValueError('REFERENCE_NOT_CLOSED')
    reservation = read(args.reservation)
    if reservation.get('exclusive') is not True or reservation.get('experiment') != 'vision-pause-confirmation':
        raise ValueError('EXCLUSIVE_RESERVATION_REQUIRED')
    expires = datetime.datetime.fromisoformat(reservation['expiresAtUtc'])
    if expires <= datetime.datetime.now(datetime.timezone.utc):
        raise ValueError('RESERVATION_EXPIRED')
    sha = subprocess.run(['git', 'rev-parse', 'HEAD'], cwd=args.repo, capture_output=True, text=True, check=True).stdout.strip()
    if sha not in CODE_SHAS:
        raise ValueError('CODE_SHA_DIFFERENT')
    verified(args.frozen_plan, FROZEN_PLAN_SHA256)
    plan = read(args.frozen_plan)
    for name, expected in plan['codeSources'].items():
        verified(args.repo / name, expected)
    verified(args.repo / 'scripts/replay-local-stream.cjs', RUNNER_SHA256)
    verified(args.reference / 'config-base.env', CONFIG_SHA256)
    config = dict(line.split('=', 1) for line in (args.reference / 'config-base.env').read_text().splitlines() if '=' in line)
    verified(config['TVLENS_WHISPER_MODEL'], WHISPER_SHA256)
    verified(config['TVLENS_WHISPER_BINARY'], WHISPER_BINARY_SHA256)
    tags = {model['name']: model['digest'] for model in common.api('http://127.0.0.1:11434/api/tags')['models']}
    if any(tags.get(name) != value for name, value in MODELS.items()):
        raise ValueError('OLLAMA_MODEL_DIFFERENT')
    other = common.capture(['pgrep', '-f', 'replay-local-(stream|perception)|replay-reinspection'])
    if other.get('exitCode') != 1:
        raise ValueError('OTHER_REPLAY_ACTIVE')
    gpu = common.capture(['nvidia-smi', '--query-compute-apps=pid,process_name', '--format=csv,noheader'])
    if gpu.get('exitCode') != 0:
        raise ValueError('GPU_PROCESS_INSPECTION_UNAVAILABLE')
    if any('ollama' not in row.lower() for row in gpu['stdout'].splitlines() if row.strip()):
        raise ValueError('OTHER_GPU_PROCESS_ACTIVE')
    return {'codeSha': sha, 'runnerSha256': RUNNER_SHA256, 'configSha256': CONFIG_SHA256,
            'whisperSha256': WHISPER_SHA256, 'whisperBinarySha256': WHISPER_BINARY_SHA256,
            'ollamaModels': tags, 'gpuProcessesBefore': gpu, 'frozenPlanSha256': FROZEN_PLAN_SHA256,
            'codeSources': plan['codeSources']}


def stage_inputs(args, night):
    identity = {}
    for video in VIDEOS:
        scene = reference(video)
        source = args.reference / ('preparation-' + video)
        identity[video] = verify_inputs(source, scene, video)
        destination = night.root / 'inputs' / video
        shutil.copytree(source, destination)
        for name, expected in identity[video]['files'].items():
            verified(destination / name, expected)
        verified(destination / 'preparation.json', scene['provenance']['preparation']['sha256'])
        for arm, value in scenarios(scene).items():
            write(destination / ('scenario-' + arm + '.json'), value)
    shutil.copyfile(args.reference / 'config-base.env', night.root / 'config.env')
    write(night.root / 'input-identities.json', identity)
    return identity


def validate_campaign(path, video, scene):
    report = read(path)
    if report.get('complete') is not True or report.get('status') != 'complete':
        raise ValueError('CAMPAIGN_INCOMPLETE:' + video)
    shutdown = report.get('shutdown') or {}
    if shutdown.get('archiveConfirmed') is not True or shutdown.get('releaseConfirmed') is not True:
        raise ValueError('CAMPAIGN_NOT_RELEASED:' + video)
    if shutdown.get('errors') or report.get('remaining') or report.get('guardFailures'):
        raise ValueError('CAMPAIGN_GUARD_FAILURE:' + video)
    questions = report.get('questions', [])
    if [row.get('id') for row in questions] != [row['id'] for row in scene['questions']]:
        raise ValueError('CAMPAIGN_QUESTIONS_DIFFERENT:' + video)
    if any(row.get('status') != 'done' or row.get('acquired') is not True for row in questions):
        raise ValueError('CAMPAIGN_QUESTION_NOT_ACQUIRED:' + video)
    return {'campaignSha256': digest(path), 'runId': report.get('runId'), 'summary': report.get('summary')}


def terminal_failure(report):
    if report.get('guardFailures') or (report.get('shutdown') or {}).get('errors'):
        return True
    return any(row.get('status') in ('error', 'refused') for row in report.get('questions', []))


def execute(args):
    package = verify_package()
    common = load_common(args.night_common)
    requested = datetime.datetime.fromisoformat(args.deadline)
    reservation_end = datetime.datetime.fromisoformat(read(args.reservation)['expiresAtUtc'])
    end = min(requested, reservation_end, datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(seconds=BUDGET_SECONDS))
    class WatchedNight(common.Night):
        active_campaign = None

        def check(self):
            super().check()
            if self.active_campaign and self.active_campaign.exists():
                try:
                    campaign = read(self.active_campaign)
                except json.JSONDecodeError:
                    return
                if terminal_failure(campaign):
                    raise RuntimeError('CAMPAIGN_TERMINAL_FAILURE')

    night = WatchedNight(args.out, end)
    locks = []
    completed = []
    success = False
    try:
        locks.append(acquire('/home/nvidia/tvlens-setup/night.lock'))
        locks.append(acquire(args.reference / 'execution.lock'))
        locks.append(acquire('/home/nvidia/tvlens-setup/followup-gpu.lock'))
        environment = verify_environment(args, common)
        write(night.root / 'environment.json', environment)
        write(night.root / 'package.sha256.json', package)
        shutil.copyfile(args.frozen_plan, night.root / 'frozen-plan.json')
        shutil.copyfile(__file__, night.root / 'confirmation.py')
        shutil.copyfile(args.reservation, night.root / 'reservation.json')
        stage_inputs(args, night)
        night.start_monitor()
        for video in VIDEOS:
            scene = reference(video)
            for arm in ('A', 'B'):
                name = video + '-validation-' + arm
                argv = ['node', 'scripts/replay-local-stream.cjs', '--scenario',
                        night.root / 'inputs' / video / ('scenario-' + arm + '.json'), '--out', night.root / name / 'run',
                        '--config', night.root / 'config.env', '--validate']
                night.command(name, argv, VALIDATION_TIMEOUT_SECONDS, cwd=args.repo)
            for label, arm in ORDER:
                name = video + '-' + label
                argv = ['node', 'scripts/replay-local-stream.cjs', '--scenario',
                        night.root / 'inputs' / video / ('scenario-' + arm + '.json'), '--out', night.root / name / 'run',
                        '--config', night.root / 'config.env', '--execute']
                night.active_campaign = night.root / name / 'run/campaign.json'
                night.command(name, argv, RUN_TIMEOUT_SECONDS, cwd=args.repo)
                night.active_campaign = None
                result = validate_campaign(night.root / name / 'run/campaign.json', video, scene)
                completed.append({'video': video, 'passage': label, 'arm': arm, **result})
                write(night.root / 'completed.json', completed)
        success = len(completed) == len(VIDEOS) * len(ORDER)
        night.event('workload-finished', readyForScoring=False)
    except BaseException as error:
        night.event('blocked', error={'type': type(error).__name__, 'message': str(error)})
    finally:
        for handle in reversed(locks):
            handle.close()
        stopped = all(stage.get('exitCode') is not None for stage in night.state['stages'])
        closure = {'complete': success and stopped and len(locks) == 3, 'locksReleased': True,
                   'ownedProcessesStopped': stopped, 'containersCreated': False,
                   'completedPassages': len(completed), 'expectedPassages': len(VIDEOS) * len(ORDER),
                   'readyForScoring': False}
        write(night.root / 'closure.json', closure)
        sealed = night.close()
    return 0 if closure['complete'] and sealed else 1


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--repo', type=Path, required=True)
    parser.add_argument('--reference', type=Path, required=True)
    parser.add_argument('--night-common', type=Path, required=True)
    parser.add_argument('--frozen-plan', type=Path, required=True)
    parser.add_argument('--reservation', type=Path, required=True)
    parser.add_argument('--out', type=Path, required=True)
    parser.add_argument('--deadline', required=True, help='Fin absolue ISO 8601 avec fuseau horaire')
    args = parser.parse_args()
    return execute(args)


if __name__ == '__main__':
    sys.exit(main())
