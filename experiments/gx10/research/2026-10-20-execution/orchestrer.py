"""Orchestre les deux CLI TVLens existantes ; aucun fournisseur en mode validation."""
import argparse
import datetime
import fcntl
import hashlib
import json
import os
from pathlib import Path
import platform
import queue
import shutil
import signal
import subprocess
import sys
import tarfile
import threading
import time
import urllib.request
import uuid

HERE = Path(__file__).resolve().parent
STOP = None


def utc():
    return datetime.datetime.now(datetime.timezone.utc).isoformat()


def stamp():
    return {"utc": utc(), "monotonicNs": time.monotonic_ns()}


def digest(path):
    with path.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def write(path, value):
    temporary = path.with_name(path.name + '.tmp')
    temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n')
    temporary.replace(path)


def append(path, value):
    with path.open('a') as stream:
        stream.write(json.dumps(value, ensure_ascii=False) + '\n')
        stream.flush()
        os.fsync(stream.fileno())


def read(path):
    return json.loads(path.read_text())


def command(argv, cwd=None):
    try:
        result = subprocess.run(argv, cwd=cwd, capture_output=True, text=True, timeout=3)
        return {"exitCode": result.returncode, "stdout": result.stdout, "stderr": result.stderr}
    except (OSError, subprocess.TimeoutExpired) as error:
        return {"exitCode": None, "error": type(error).__name__}


def api(route):
    try:
        with urllib.request.urlopen('http://127.0.0.1:11434/api/' + route, timeout=2) as response:
            return json.load(response)
    except (OSError, ValueError) as error:
        return {"error": type(error).__name__}


def snapshot(gpu):
    value = {**stamp(), "loadAverage": os.getloadavg(), "ollama": api('ps') if gpu else None,
             "processes": command(['ps', '-axo', 'pid,ppid,comm,%cpu,%mem,rss'])}
    for name in ['meminfo', 'stat', 'loadavg']:
        file = Path('/proc') / name
        value[name] = file.read_text() if file.exists() else None
    if gpu:
        value['gpu'] = command(['nvidia-smi'])
        value['gpuProcesses'] = command(['nvidia-smi', '--query-compute-apps=pid,process_name,used_memory', '--format=csv'])
        value['services'] = command(['tmux', 'list-sessions', '-F', '#{session_name}'])
    value['finished'] = stamp()
    return value


def seal(root):
    target = root / 'integrite.json'
    if target.exists():
        raise ValueError('Scellement déjà présent ; aucun remplacement.')
    files = {str(p.relative_to(root)): digest(p) for p in sorted(root.rglob('*')) if p.is_file()}
    write(target, {"sealedAtUtc": utc(), "files": files})


def verify(root):
    files = read(root / 'integrite.json')['files']
    actual = {str(p.relative_to(root)) for p in root.rglob('*') if p.is_file() and p != root / 'integrite.json'}
    if actual != set(files) or any(digest(root / p) != value for p, value in files.items()):
        raise ValueError('Intégrité refusée : fichier ajouté, absent ou modifié.')


def interrupted(number, _frame):
    global STOP
    STOP = signal.Signals(number).name


def terminate(child, grace, log):
    # Le groupe appartient au Popen start_new_session ; aucun service existant n'est signalé.
    for number, timeout in [(signal.SIGTERM, grace), (signal.SIGKILL, 2)]:
        try:
            os.killpg(child.pid, number)
            append(log, {**stamp(), "signal": signal.Signals(number).name, "ownedGroup": child.pid})
        except ProcessLookupError:
            break
        try:
            child.wait(timeout=timeout)
            break
        except subprocess.TimeoutExpired:
            continue
    # Un descendant qui a survécu au leader reçoit aussi la fin du groupe possédé.
    try:
        os.killpg(child.pid, signal.SIGKILL)
    except ProcessLookupError:
        pass
    return child.wait(timeout=2)


def consecutive_failure(report, limit):
    lanes = [report.get('cases', [])]
    for role in report.get('roles', {}).values():
        lanes.append([x for x in role.get('evidence', []) if x.get('status') in ['returned', 'error', 'failed']])
    lanes.append([q for q in report.get('questions', []) if q.get('status') in ['done', 'error', 'refused']])
    for entries in lanes:
        count = 0
        for entry in entries:
            if entry.get('status') in ['validated', 'running', 'planned']:
                continue
            failed = entry.get('status') in ['error', 'failed', 'refused'] or entry.get('failed') is True
            count = count + 1 if failed else 0
            if count >= limit:
                return True
    return False


def resource_failure(sample, root, plan):
    if shutil.disk_usage(root).free < plan['minFreeDiskBytes']:
        return 'disk-low'
    memory = sample.get('meminfo')
    if memory:
        available = next((int(line.split()[1]) * 1024 for line in memory.splitlines() if line.startswith('MemAvailable:')), None)
        if available is not None and available < plan['minAvailableMemoryBytes']:
            return 'memory-low'
    if 'error' in (sample.get('ollama') or {}):
        return 'ollama-unavailable'
    return None


def run_child(argv, folder, repo, deadline, plan, gpu=False):
    folder.mkdir()
    result = {"id": str(uuid.uuid4()), "argv": argv, "started": stamp(), "status": 'running', "exitCode": None}
    write(folder / 'execution.json', result)
    samples = queue.Queue()
    finished = threading.Event()
    def monitor():
        while not finished.is_set():
            sample = snapshot(gpu)
            append(folder / 'systeme.jsonl', sample)
            samples.put(sample)
            finished.wait(plan['sampleSeconds'])
    sampler = threading.Thread(target=monitor, daemon=True)
    env = {key: os.environ[key] for key in ['PATH', 'HOME', 'TMPDIR', 'LANG', 'LD_LIBRARY_PATH'] if key in os.environ}
    with (folder / 'stdout.log').open('wb') as stdout, (folder / 'stderr.log').open('wb') as stderr:
        child = subprocess.Popen(argv, cwd=repo, env=env, stdout=stdout, stderr=stderr, start_new_session=True)
        sampler.start()
        result['pid'] = child.pid
        write(folder / 'execution.json', result)
        reason = None
        try:
            while child.poll() is None:
                reason = STOP or ('budget' if time.monotonic() >= deadline else None)
                campaign = folder / 'run/campaign.json'
                if campaign.exists() and consecutive_failure(read(campaign), plan['maxConsecutiveErrors']):
                    reason = reason or 'consecutive-errors'
                if not samples.empty() and not reason:
                    sample = samples.get_nowait()
                    reason = resource_failure(sample, folder, plan) if gpu else None
                if reason:
                    result['stopReason'] = reason
                    write(folder / 'execution.json', result)
                    terminate(child, plan['graceSeconds'], folder / 'signals.jsonl')
                    break
                time.sleep(plan['pollSeconds'])
        finally:
            finished.set()
            if child.poll() is None:
                terminate(child, plan['graceSeconds'], folder / 'signals.jsonl')
            sampler.join(timeout=20)
            result['monitorStopped'] = not sampler.is_alive()
        result.update({"exitCode": child.returncode, "finished": stamp(), "status": 'interrupted' if reason else 'exited'})
        result['durationMs'] = (result['finished']['monotonicNs'] - result['started']['monotonicNs']) / 1000000
        write(folder / 'execution.json', result)
    return result


def acquire(plan, reservation):
    if platform.system() != 'Linux' or platform.machine() != 'aarch64':
        raise ValueError('Exécution réservée à la GX10 Linux ARM64.')
    evidence = read(reservation)
    if evidence.get('exclusive') is not True or evidence.get('experiment') not in plan['experiments']:
        raise ValueError('Réservation exclusive explicite requise.')
    if datetime.datetime.fromisoformat(evidence['expiresAtUtc']) <= datetime.datetime.now(datetime.timezone.utc):
        raise ValueError('Réservation expirée.')
    batch = Path(plan['referenceBatch'])
    if not (batch / 'termine.txt').exists():
        raise ValueError('Lot de référence actif ou non terminé ; aucune charge autorisée.')
    locks = []
    try:
        for path, mode in [(batch / 'execution.lock', 'rb'), (Path(plan['gpuLock']), 'a+b')]:
            handle = path.open(mode)
            locks.append(handle)
            fcntl.flock(handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
        processes = command(['pgrep', '-f', 'replay-local-(stream|perception)|replay-reinspection'])
        if processes['exitCode'] != 1:
            raise ValueError('Autre rejeu détecté ou garde processus indisponible.')
        actual = {m['name']: m['digest'] for m in api('tags').get('models', [])}
        if any(actual.get(key) != value for key, value in plan['ollamaModels'].items()):
            raise ValueError('Digest de modèle absent ou modifié.')
    except BaseException:
        for handle in locks:
            handle.close()
        raise
    return locks


def stage(args, root, plan):
    actual_sha = command(['git', 'rev-parse', 'HEAD'], args.repo)['stdout'].strip()
    if actual_sha not in plan['acceptedCodeShas']:
        raise ValueError('SHA du dépôt différent du plan.')
    for name, expected in plan['frozenFiles'].items():
        if digest(HERE / name) != expected:
            raise ValueError('Entrée pré-enregistrée modifiée : ' + name)
    destination = root / 'inputs'
    destination.mkdir()
    if args.experiment == 'perception':
        for path in (HERE / 'entrees-perception').rglob('*'):
            if path.is_file():
                target = destination / path.relative_to(HERE / 'entrees-perception')
                target.parent.mkdir(parents=True, exist_ok=True)
                shutil.copyfile(path, target)
    else:
        source = Path(args.inputs).resolve()
        # Copie locale uniquement ; conserve toutes les preuves sans dépendre de liens modifiables.
        for name in ['blocks.json', 'preparation.json', 'manifest.json', 'blocks']:
            item = source / name
            if item.is_dir():
                shutil.copytree(item, destination / name)
            else:
                shutil.copyfile(item, destination / name)
        for name in plan['experiments']['vision']['arms'].values():
            shutil.copyfile(HERE / 'plans' / name, destination / name)
        config = Path(args.config)
        if digest(config) != plan['configSha256']:
            raise ValueError('Configuration différente du fichier sans secret pré-enregistré.')
        shutil.copyfile(config, root / 'config.env')
    files = command(['git', 'ls-files'], args.repo)['stdout'].splitlines()
    sources = {}
    with tarfile.open(root / 'code.tar.gz', 'x:gz') as archive:
        for name in files:
            if name.endswith(('.cjs', '.mjs', '.py')) or name in ['package.json', 'package-lock.json']:
                path = Path(args.repo) / name
                sources[name] = digest(path)
                if sources[name] != plan['codeSources'].get(name):
                    raise ValueError('Source différente du pré-enregistrement : ' + name)
                archive.add(path, arcname=name)
    write(root / 'code.json', {"sha": actual_sha, "sources": sources, "node": command(['node', '--version'])})
    write(root / 'inputs.sha256.json', {str(p.relative_to(destination)): digest(p) for p in destination.rglob('*') if p.is_file()})


def runner(args, root, arm, output, mode, plan):
    spec = plan['experiments'][args.experiment]
    file = str(root / 'inputs' / spec['arms'][arm])
    if args.experiment == 'perception':
        return ['node', 'scripts/replay-local-perception.cjs', '--manifest', file, '--out', str(output), '--backend', 'local',
                '--model', spec['model'], '--url', 'http://127.0.0.1:11434', '--num-ctx', str(spec['numCtx']),
                '--keep-alive', spec['keepAlive'], '--' + mode]
    return ['node', 'scripts/replay-local-stream.cjs', '--scenario', file, '--out', str(output),
            '--config', str(root / 'config.env'), '--' + mode]


def export(root):
    rows = []
    summaries = []
    for file in sorted(root.glob('*/run/campaign.json')):
        report = read(file)
        for entry in report.get('questions', report.get('cases', [])):
            rows.append({"trial": file.parts[-3], "runId": report.get('runId'), "id": entry.get('id'),
                         "index": entry.get('index'), "caseId": entry.get('caseId', entry.get('id')),
                         "question": entry.get('question'), "status": entry.get('status'), "acquired": entry.get('acquired'),
                         "request": entry.get('request'), "diagnostics": entry.get('diagnostics'),
                         "result": entry.get('result'), "metrics": entry.get('metrics'), "latency": entry.get('latency'),
                         "input": entry.get('input'), "error": entry.get('error'), "quality": None, "reviewer": None})
        summaries.append({"trial": file.parts[-3], "mode": report.get('mode'), "complete": report.get('complete'),
                          "summary": report.get('summary'), "shutdown": report.get('shutdown'), "quality": None})
    write(root / 'a-annoter.json', {"readyForScoring": False, "expectedAnswersIncluded": False, "rows": rows})
    write(root / 'synthese.json', {"readyForScoring": False, "runs": summaries})


def run(args):
    root = Path(args.out).resolve()
    root.mkdir()
    plan = read(HERE / 'plan.json')
    spec = plan['experiments'][args.experiment]
    runtime = {**plan, **spec}
    deadline = time.monotonic() + spec['budgetSeconds']
    state = {"id": str(uuid.uuid4()), "started": stamp(), "mode": args.mode, "experiment": args.experiment,
             "status": 'preparing', "readyForScoring": False, "runs": [], "budgetSeconds": spec['budgetSeconds']}
    write(root / 'index.json', state)
    write(root / 'plan.json', plan)
    shutil.copyfile(__file__, root / 'orchestrer.py')
    locks = []
    try:
        registration = read(HERE / 'preregistration.json')
        for name, expected in registration['files'].items():
            if digest(HERE / name) != expected:
                raise ValueError('Pré-enregistrement modifié : ' + name)
        write(root / 'preregistration.json', registration)
        if args.mode == 'execute':
            if not args.reservation or read(Path(args.reservation)).get('experiment') != args.experiment:
                raise ValueError('Réservation spécifique à cette expérience requise.')
            reservation = read(Path(args.reservation))
            remaining = (datetime.datetime.fromisoformat(reservation['expiresAtUtc']) - datetime.datetime.now(datetime.timezone.utc)).total_seconds()
            deadline = min(deadline, time.monotonic() + remaining - plan['graceSeconds'])
            locks = acquire(plan, Path(args.reservation))
            write(root / 'reservation.json', reservation)
        stage(args, root, plan)
        if STOP or time.monotonic() >= deadline:
            raise ValueError('Budget ou réservation expiré après préparation ; aucun runner démarré.')
        write(root / 'before.json', snapshot(args.mode == 'execute'))
        if args.mode == 'execute':
            write(root / 'models.json', {"tags": api('tags'), "version": api('version')})
            if args.experiment == 'vision':
                settings = dict(line.split('=', 1) for line in (root / 'config.env').read_text().splitlines() if '=' in line)
                whisper = {key: {"path": settings[key], "sha256": digest(Path(settings[key]))}
                           for key in ['TVLENS_WHISPER_BINARY', 'TVLENS_WHISPER_MODEL']}
                write(root / 'whisper.json', whisper)
                if whisper['TVLENS_WHISPER_MODEL']['sha256'] != plan['whisperBaseSha256']:
                    raise ValueError('Poids Whisper différents du plan.')
        schedule = [('validation-' + arm, arm, 'validate') for arm in ['A', 'B']]
        if args.mode == 'execute':
            schedule += [(item['id'], item['arm'], 'execute') for item in plan['order']]
        state['status'] = 'running'
        for name, arm, mode in schedule:
            if STOP or time.monotonic() >= deadline:
                state['stopReason'] = STOP or 'budget'
                break
            folder = root / name
            result = run_child(runner(args, root, arm, folder / 'run', mode, plan), folder, args.repo, deadline, runtime,
                               args.mode == 'execute')
            state['runs'].append({"name": name, "arm": arm, **result})
            write(root / 'index.json', state)
            append(root / 'index.jsonl', state['runs'][-1])
            if result['exitCode'] != 0 or result.get('stopReason'):
                state['stopReason'] = result.get('stopReason', 'runner-error')
                break
        state['status'] = 'finished' if len(state['runs']) == len(schedule) and not state.get('stopReason') else 'incomplete'
    except (OSError, ValueError, KeyError) as error:
        state.update({"status": 'blocked', "error": {"type": type(error).__name__, "message": str(error)}})
    finally:
        write(root / 'after.json', snapshot(args.mode == 'execute'))
        state['finished'] = stamp()
        write(root / 'index.json', state)
        export(root)
        for handle in locks:
            handle.close()
        seal(root)
    print(json.dumps({"status": state['status'], "out": str(root)}, ensure_ascii=False))
    return 0 if state['status'] == 'finished' else 1


def exercise(args):
    global STOP
    root = Path(args.out).resolve()
    root.mkdir()
    shutil.copyfile(__file__, root / 'orchestrer.py')
    plan = {"maxConsecutiveErrors": 3, "sampleSeconds": 5, "graceSeconds": 1, "pollSeconds": 0.05}
    results = []
    for name, delay, code, budget in [('normal', 0, 0, 5), ('failure', 0, 7, 5), ('budget', 10, 0, 0.3), ('interrupt', 10, 0, 5)]:
        STOP = None
        timer = threading.Timer(0.3, lambda: os.kill(os.getpid(), signal.SIGTERM)) if name == 'interrupt' else None
        if timer:
            timer.start()
        script = ('import time,sys; print("fixture sans modèle",flush=True); print("stderr fixture",file=sys.stderr,flush=True); '
                  'time.sleep(float(sys.argv[1])); sys.exit(int(sys.argv[2]))')
        result = run_child([sys.executable, '-c', script, str(delay), str(code)], root / name, str(HERE),
                           time.monotonic() + budget, plan)
        results.append({"name": name, **result})
        if timer:
            timer.join()
    assert [r['exitCode'] for r in results[:2]] == [0, 7]
    assert [r.get('stopReason') for r in results[2:]] == ['budget', 'SIGTERM']
    assert all(r['durationMs'] < 5000 for r in results)
    write(root / 'verification.json', {"fixtureOnly": True, "passed": True, "results": results})
    seal(root)
    verify(root)
    return 0


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=['run', 'exercise', 'seal', 'verify', 'archive'])
    parser.add_argument('--out', required=True)
    parser.add_argument('--experiment', choices=['perception', 'vision'])
    parser.add_argument('--mode', choices=['validate', 'execute'], default='validate')
    parser.add_argument('--repo', default=str(HERE.parents[3]))
    parser.add_argument('--inputs')
    parser.add_argument('--config')
    parser.add_argument('--reservation')
    parser.add_argument('--archive')
    args = parser.parse_args()
    for number in [signal.SIGINT, signal.SIGTERM]:
        signal.signal(number, interrupted)
    if args.action == 'run':
        if not args.experiment or (args.experiment == 'vision' and (not args.inputs or not args.config)):
            parser.error('Expérience requise ; --inputs et --config requis pour le flux vision.')
        return run(args)
    if args.action == 'exercise':
        return exercise(args)
    root = Path(args.out).resolve()
    if args.action == 'seal':
        seal(root)
    else:
        verify(root)
        if args.action == 'archive':
            if not args.archive:
                parser.error('--archive requis pour cette action.')
            target = Path(args.archive).resolve()
            if target.is_relative_to(root):
                parser.error('Archive requise hors du dossier scellé.')
            with tarfile.open(target, 'x:gz') as archive:
                archive.add(root, arcname=root.name)
            target.with_suffix(target.suffix + '.sha256').write_text(digest(target) + '  ' + target.name + '\n')
    return 0


if __name__ == '__main__':
    sys.exit(main())
