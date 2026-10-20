"""Lot de nuit GX10 : référence, deux ablations puis comparaison de composants."""
import argparse
import datetime
import fcntl
import platform
from pathlib import Path
import shutil
import sys
import time
sys.dont_write_bytecode = True
from night_common import Night, api, capture, digest, read, utc, write
from vllm_stage import compare


def lock(path):
    handle = Path(path).open('a+b')
    try:
        fcntl.flock(handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BaseException:
        handle.close()
        raise
    return handle


def validate_batch(batch):
    expected = [model + '-' + video for model in ['base', 'small', 'large-v3-turbo']
                for video in ['cnrs-apprentissage', 'kennedy', 'spring']]
    rows = [line.split() for line in (batch / 'index.log').read_text().splitlines() if line.strip()]
    if len(rows) != 9 or [row[1] for row in rows] != expected or any(row[2] != '0' for row in rows):
        raise RuntimeError('BATCH_INDEX_INCOMPLETE')
    summary = []
    for name in expected:
        report = read(batch / name / 'run/campaign.json')
        shutdown = report.get('shutdown', {})
        if (batch / name / 'code-sortie.txt').read_text().strip() != '0':
            raise RuntimeError('BATCH_EXIT_FAILURE:' + name)
        if report.get('complete') is not True or report.get('status') != 'complete':
            raise RuntimeError('BATCH_NOT_COMPLETE:' + name)
        if shutdown.get('archiveConfirmed') is not True or shutdown.get('releaseConfirmed') is not True:
            raise RuntimeError('BATCH_NOT_RELEASED:' + name)
        if any(report.get(key) for key in ['remaining', 'guardFailures']) or shutdown.get('errors'):
            raise RuntimeError('BATCH_GUARD_FAILURE:' + name)
        questions = report.get('questions', [])
        if len(questions) != 5 or any(q.get('status') != 'done' or not q.get('result') for q in questions):
            raise RuntimeError('BATCH_QUESTIONS_INCOMPLETE:' + name)
        summary.append({'id': name, 'sha256': digest(batch / name / 'run/campaign.json'),
                        'unacquiredQuestionIds': [q.get('id') for q in questions if q.get('acquired') is not True],
                        'summary': report.get('summary'), 'questions': questions})
    return {'validatedAtUtc': utc(), 'structuralValidation': True, 'readyForScoring': False, 'campaigns': summary}


def wait_batch(night, batch):
    night.event('waiting-reference')
    wait_end = min(night.deadline, time.monotonic() + 7200)
    while not (batch / 'termine.txt').exists():
        if time.monotonic() >= wait_end:
            raise RuntimeError('REFERENCE_WAIT_DEADLINE')
        night.sleep(30)
    with lock(batch / 'execution.lock'):
        write(night.root / 'reference-validation.json', validate_batch(batch))
    night.event('reference-validated')


def followup(night, kit, batch, repo, experiment, end):
    reservation = night.root / ('reservation-' + experiment + '.json')
    write(reservation, {'experiment': experiment, 'exclusive': True, 'operator': 'Codex — demande utilisateur nuit du 20 octobre',
                        'expiresAtUtc': end.isoformat()})
    output = night.root / ('trial-' + experiment)
    argv = ['python3', kit / 'orchestrer.py', 'run', '--experiment', experiment, '--mode', 'execute',
            '--repo', repo, '--reservation', reservation, '--out', output]
    if experiment == 'vision':
        argv += ['--inputs', batch / 'preparation-cnrs-apprentissage', '--config', batch / 'config-base.env']
    night.command(experiment, argv, 5100 if experiment == 'vision' else 3000, cwd=repo)
    night.command(experiment + '-verify', ['python3', kit / 'orchestrer.py', 'verify', '--out', output], 120)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--package', required=True)
    parser.add_argument('--out', required=True)
    parser.add_argument('--deadline', required=True)
    parser.add_argument('--repo', default='/home/nvidia/tvlens')
    args = parser.parse_args()
    if platform.system() != 'Linux' or platform.machine() != 'aarch64':
        raise RuntimeError('GX10_LINUX_ARM64_REQUIRED')
    package = Path(args.package).resolve()
    repo = Path(args.repo)
    end = datetime.datetime.fromisoformat(args.deadline)
    night = Night(args.out, end)
    locks = []
    success = False
    try:
        locks.append(lock('/home/nvidia/tvlens-setup/night.lock'))
        frozen = read(package / 'package.sha256.json')
        for name, expected in frozen.items():
            if digest(package / name) != expected:
                raise RuntimeError('PACKAGE_CHANGED:' + name)
        shutil.copytree(package / 'scripts', night.root / 'scripts')
        shutil.copyfile(package / 'package.sha256.json', night.root / 'package.sha256.json')
        batch = Path('/home/nvidia/tvlens-setup/reference-2026-10-20')
        wait_batch(night, batch)
        night.start_monitor()
        for experiment in ['perception', 'vision']:
            followup(night, package / 'execution', batch, repo, experiment, end)
        # Les wrappers gèrent leurs propres verrous : acquisition globale seulement après eux.
        locks += [lock(batch / 'execution.lock'), lock('/home/nvidia/tvlens-setup/followup-gpu.lock')]
        active = capture(['pgrep', '-f', 'replay-local-(stream|perception)|replay-reinspection'])
        if active.get('exitCode') != 1:
            raise RuntimeError('OTHER_REPLAY_ACTIVE')
        models = {m['name']: m['digest'] for m in api('http://127.0.0.1:11434/api/tags')['models']}
        if models.get('qwen3.8:27b') != read(package / 'execution/plan.json')['ollamaModels']['qwen3.8:27b']:
            raise RuntimeError('OLLAMA_MODEL_CHANGED')
        compare(night, package, repo)
        success = True
        night.event('workload-finished', finishedAtUtc=utc(), readyForScoring=False)
    except Exception as error:
        night.event('blocked', finishedAtUtc=utc(), error={'type': type(error).__name__, 'message': str(error)})
    finally:
        cleaned = night.close()
        success = success and cleaned
        for handle in locks:
            handle.close()
    return 0 if success else 1


if __name__ == '__main__':
    sys.exit(main())
