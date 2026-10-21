"""Run a preregistered list of TVLens replays on the GX10, one passage at a time, behind the measuring proxy.

The plan (JSON, hashed before launch) names the videos, the arms and the order. An arm is a deep merge into the
base scenario plus overrides of the base config.env; nothing in the repository is modified. Each passage gets its
own proxy journal. Supervision, telemetry, deadlines and sealing come from the frozen night_common.Night.
"""
import argparse
import copy
import datetime
import fcntl
import hashlib
import importlib.util
import json
import platform
import shutil
import subprocess
import sys
import time
import urllib.request
from pathlib import Path

LOCKS = ['/home/nvidia/tvlens-setup/night.lock', '/home/nvidia/tvlens-setup/reference-2026-10-20/execution.lock',
         '/home/nvidia/tvlens-setup/followup-gpu.lock']
VALIDATION_TIMEOUT_SECONDS = 300
RUN_MARGIN_SECONDS = 600
PROXY_READY_SECONDS = 15
OVERHEAD_PROBES = 20


def digest(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def read(path):
    return json.loads(Path(path).read_text())


def write(path, value):
    Path(path).write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n')


def merge(base, extra):
    result = copy.deepcopy(base)
    for key, value in extra.items():
        result[key] = merge(result[key], value) if isinstance(value, dict) and isinstance(result.get(key), dict) else value
    return result


def acquire(path):
    handle = open(path, 'a+')
    try:
        fcntl.flock(handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError:
        handle.close()
        raise RuntimeError('LOCK_BUSY:' + str(path))
    return handle


def load_common(path):
    spec = importlib.util.spec_from_file_location('frozen_night_common', path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def environment_check(plan, args, common):
    if platform.system() != 'Linux' or platform.machine() != 'aarch64':
        raise RuntimeError('GX10_LINUX_ARM64_REQUIRED')
    sha = subprocess.run(['git', 'rev-parse', 'HEAD'], cwd=args.repo, capture_output=True, text=True, check=True).stdout.strip()
    if sha not in plan['codeShas']:
        raise RuntimeError('CODE_SHA_DIFFERENT')
    if digest(args.repo / 'scripts/replay-local-stream.cjs') != plan['runnerSha256']:
        raise RuntimeError('RUNNER_SHA_DIFFERENT')
    if digest(plan['configEnv']) != plan['configEnvSha256']:
        raise RuntimeError('CONFIG_SHA_DIFFERENT')
    other = common.capture(['pgrep', '-f', 'replay-local-(stream|perception)|replay-reinspection|whisper-cli -ng'])
    if other.get('exitCode') != 1:
        raise RuntimeError('OTHER_WORKLOAD_ACTIVE')
    gpu = common.capture(['nvidia-smi', '--query-compute-apps=pid,process_name', '--format=csv,noheader'])
    if gpu.get('exitCode') != 0 or any('ollama' not in row.lower() for row in gpu['stdout'].splitlines() if row.strip()):
        raise RuntimeError('OTHER_GPU_PROCESS_ACTIVE')
    tags = {m['name']: m['digest'] for m in common.api('http://127.0.0.1:11434/api/tags')['models']}
    missing = [name for name in plan.get('requiredModels', []) if name not in tags]
    if missing:
        raise RuntimeError('MODEL_MISSING:' + ','.join(missing))
    return {'codeSha': sha, 'ollamaModels': tags, 'gpuProcessesBefore': gpu, 'python': sys.version}


def stage_video(night, name, video, plan):
    source = Path(video['preparation'])
    destination = night.root / 'inputs' / name
    shutil.copytree(source, destination)
    scenario = read(destination / 'scenario.json')
    if digest(destination / 'blocks.json') != scenario['index']['sha256']:
        raise RuntimeError('INDEX_SHA_DIFFERENT:' + name)
    identity = {'scenarioSha256': digest(destination / 'scenario.json'), 'indexSha256': scenario['index']['sha256'],
                'files': {str(p.relative_to(destination)): digest(p) for p in sorted(destination.rglob('*')) if p.is_file()}}
    for arm, spec in plan['arms'].items():
        write(destination / ('scenario-' + arm + '.json'), merge(scenario, spec.get('scenario', {})))
    return scenario, identity


def write_configs(night, plan):
    base = Path(plan['configEnv']).read_text().splitlines()
    for arm, spec in plan['arms'].items():
        overrides = {**plan.get('envOverrides', {}), **spec.get('env', {})}
        lines = [line for line in base if line.split('=', 1)[0] not in overrides]
        lines += [key + '=' + value for key, value in overrides.items()]
        (night.root / ('config-' + arm + '.env')).write_text('\n'.join(lines) + '\n')


def start_proxy(night, plan, label):
    proxy = plan.get('proxy')
    if not proxy:
        return None
    roles = [role + '=' + str(port) for role, port in proxy['roles'].items()]
    argv = [sys.executable, '-I', str(night.root / 'ollama_proxy.py'), '--journal', str(night.root / 'proxy' / (label + '.jsonl'))]
    for role in roles:
        argv += ['--role', role]
    if proxy.get('bodyRoles'):
        argv += ['--body-dir', str(night.root / 'proxy' / (label + '-bodies'))]
        for role in proxy['bodyRoles']:
            argv += ['--body-role', role]
    (night.root / 'proxy').mkdir(exist_ok=True)
    log = (night.root / 'proxy' / (label + '.log')).open('wb')
    child = subprocess.Popen(argv, stdout=log, stderr=log, start_new_session=True)
    port = next(iter(proxy['roles'].values()))
    for _ in range(PROXY_READY_SECONDS * 2):
        try:
            urllib.request.urlopen('http://127.0.0.1:%d/api/version' % port, timeout=2).read()
            return child
        except OSError:
            time.sleep(0.5)
    child.terminate()
    raise RuntimeError('PROXY_NOT_READY')


def stop_proxy(child):
    if child is None:
        return True
    child.terminate()
    try:
        child.wait(timeout=10)
    except subprocess.TimeoutExpired:
        child.kill()
        child.wait(timeout=5)
    return child.poll() is not None


def overhead_probe(night, plan):
    """Same tiny embedding request, alternately direct and through the proxy, to bound the proxy's cost."""
    proxy = plan.get('proxy')
    if not proxy or 'embeddings' not in proxy['roles']:
        return None
    child = start_proxy(night, plan, 'overhead-probe')
    body = json.dumps({'model': plan['overheadModel'], 'input': 'mesure du surcoût du proxy'}).encode()
    samples = {'direct': [], 'proxy': []}
    try:
        for index in range(OVERHEAD_PROBES * 2):
            route = 'direct' if index % 2 == 0 else 'proxy'
            port = 11434 if route == 'direct' else proxy['roles']['embeddings']
            request = urllib.request.Request('http://127.0.0.1:%d/api/embed' % port, data=body,
                                             headers={'Content-Type': 'application/json'})
            started = time.monotonic()
            urllib.request.urlopen(request, timeout=60).read()
            samples[route].append(round((time.monotonic() - started) * 1000, 3))
    finally:
        stop_proxy(child)
    write(night.root / 'proxy-overhead.json', samples)
    return samples


def validate_campaign(path, scenario):
    report = read(path)
    if report.get('complete') is not True or report.get('status') != 'complete':
        raise RuntimeError('CAMPAIGN_INCOMPLETE')
    shutdown = report.get('shutdown') or {}
    if shutdown.get('archiveConfirmed') is not True or shutdown.get('releaseConfirmed') is not True:
        raise RuntimeError('CAMPAIGN_NOT_RELEASED')
    if [row.get('id') for row in report.get('questions', [])] != [row['id'] for row in scenario['questions']]:
        raise RuntimeError('CAMPAIGN_QUESTIONS_DIFFERENT')
    acquired = sum(1 for row in report.get('questions', []) if row.get('acquired') is True)
    return {'campaignSha256': digest(path), 'runId': report.get('runId'), 'acquired': acquired}


def run_passages(night, plan, args, scenarios):
    completed = []
    for video, arm in plan['order']:
        scenario = scenarios[video]
        label = video + '-' + arm + '-' + str(sum(1 for row in completed if row['video'] == video and row['arm'] == arm) + 1)
        staged = night.root / 'inputs' / video / ('scenario-' + arm + '.json')
        config = night.root / ('config-' + arm + '.env')
        base = ['node', 'scripts/replay-local-stream.cjs', '--scenario', staged, '--config', config]
        budget = (scenario['plannedDurationMs'] + scenario['finalWaitMs'] + scenario['closeWaitMs']) / 1000 + RUN_MARGIN_SECONDS
        child = start_proxy(night, plan, label)
        try:
            night.command(label + '-validation', base + ['--out', night.root / (label + '-validation') / 'run', '--validate'],
                          VALIDATION_TIMEOUT_SECONDS, cwd=args.repo)
            night.command(label, base + ['--out', night.root / label / 'run', '--execute'], budget, cwd=args.repo)
        finally:
            stopped = stop_proxy(child)
        result = validate_campaign(night.root / label / 'run/campaign.json', scenario)
        completed.append({'video': video, 'arm': arm, 'label': label, 'proxyStopped': stopped, **result})
        write(night.root / 'completed.json', completed)
    return completed


def execute(args):
    plan = read(args.plan)
    common = load_common(args.night_common)
    end = min(datetime.datetime.fromisoformat(args.deadline),
              datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(seconds=plan['budgetSeconds']))
    night = common.Night(args.out, end)
    locks, completed, success = [], [], False
    try:
        locks = [acquire(path) for path in LOCKS]
        shutil.copyfile(args.plan, night.root / 'plan.json')
        shutil.copyfile(__file__, night.root / 'labo.py')
        if plan.get('proxy'):
            shutil.copyfile(Path(__file__).with_name('ollama_proxy.py'), night.root / 'ollama_proxy.py')
        write(night.root / 'environment.json', environment_check(plan, args, common))
        scenarios, identities = {}, {}
        for name, video in plan['videos'].items():
            scenarios[name], identities[name] = stage_video(night, name, video, plan)
        write(night.root / 'input-identities.json', identities)
        write_configs(night, plan)
        night.start_monitor()
        overhead_probe(night, plan)
        completed = run_passages(night, plan, args, scenarios)
        success = len(completed) == len(plan['order'])
        night.event('workload-finished', readyForScoring=False)
    except BaseException as error:
        night.event('blocked', error={'type': type(error).__name__, 'message': str(error)})
    finally:
        for handle in reversed(locks):
            handle.close()
        stopped = all(stage.get('exitCode') is not None for stage in night.state['stages'])
        closure = {'complete': success and stopped, 'locksReleased': True, 'ownedProcessesStopped': stopped,
                   'completedPassages': len(completed), 'expectedPassages': len(plan['order'])}
        write(night.root / 'closure.json', closure)
        sealed = night.close()
    return 0 if closure['complete'] and sealed else 1


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--plan', type=Path, required=True)
    parser.add_argument('--repo', type=Path, required=True)
    parser.add_argument('--night-common', type=Path, required=True)
    parser.add_argument('--out', type=Path, required=True)
    parser.add_argument('--deadline', required=True, help='Fin absolue ISO 8601 avec fuseau horaire')
    return execute(parser.parse_args())


if __name__ == '__main__':
    sys.exit(main())
