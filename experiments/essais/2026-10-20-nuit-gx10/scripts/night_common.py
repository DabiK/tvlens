"""Exécution bornée et traces locales, sans secret ni relance automatique."""
import datetime
import hashlib
import json
import os
from pathlib import Path
import shutil
import signal
import subprocess
import threading
import time
import urllib.request
import uuid


def utc():
    return datetime.datetime.now(datetime.timezone.utc).isoformat()


def read(path):
    return json.loads(Path(path).read_text())


def write(path, data):
    path = Path(path)
    temporary = path.with_name(path.name + '.tmp')
    temporary.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n')
    temporary.replace(path)


def digest(path):
    with Path(path).open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def api(url):
    with urllib.request.urlopen(url, timeout=3) as response:
        return json.load(response)


def capture(argv, timeout=5):
    try:
        p = subprocess.run(argv, capture_output=True, text=True, timeout=timeout)
        return {'exitCode': p.returncode, 'stdout': p.stdout, 'stderr': p.stderr}
    except (OSError, subprocess.TimeoutExpired) as error:
        return {'error': type(error).__name__}


class Night:
    def __init__(self, root, end):
        self.root = Path(root)
        self.root.mkdir()
        self.deadline = time.monotonic() + (end - datetime.datetime.now(datetime.timezone.utc)).total_seconds()
        self.stop = None
        self.owner = uuid.uuid4().hex
        self.state = {'id': self.owner, 'startedAtUtc': utc(), 'deadlineUtc': end.isoformat(), 'status': 'preparing', 'stages': []}
        self.monitor_stop = threading.Event()
        self.monitor = None
        self.containers = []
        for number in [signal.SIGTERM, signal.SIGINT]:
            signal.signal(number, self.interrupt)
        self.event('created')

    def interrupt(self, number, _frame):
        self.stop = signal.Signals(number).name

    def event(self, status, **data):
        self.state.update(status=status, updatedAtUtc=utc(), **data)
        write(self.root / 'status.json', self.state)
        with (self.root / 'events.jsonl').open('a') as stream:
            stream.write(json.dumps({'atUtc': utc(), 'status': status, **data}) + '\n')
            stream.flush()
            os.fsync(stream.fileno())
        print(status, flush=True)

    def check(self):
        if self.stop or time.monotonic() >= self.deadline:
            raise RuntimeError(self.stop or 'NIGHT_DEADLINE')
        if shutil.disk_usage(self.root).free < 40 * 1024 ** 3:
            raise RuntimeError('DISK_LOW')
        if Path('/proc/meminfo').exists():
            memory = Path('/proc/meminfo').read_text().splitlines()
            available = next(int(x.split()[1]) * 1024 for x in memory if x.startswith('MemAvailable:'))
            if available < 8 * 1024 ** 3:
                raise RuntimeError('MEMORY_LOW')

    def sleep(self, seconds):
        end = time.monotonic() + seconds
        while time.monotonic() < end:
            self.check()
            time.sleep(max(0, min(1, end - time.monotonic())))

    def command(self, name, argv, timeout, cwd=None):
        self.check()
        folder = self.root / name
        folder.mkdir()
        entry = {'name': name, 'argv': [str(x) for x in argv], 'startedAtUtc': utc(), 'exitCode': None}
        self.state['stages'].append(entry)
        self.event(name)
        write(folder / 'command.json', entry)
        started = time.monotonic()
        deadline = min(self.deadline, started + timeout)
        environment = {key: os.environ[key] for key in ['PATH', 'HOME', 'LANG'] if key in os.environ}
        with (folder / 'stdout.log').open('wb') as stdout, (folder / 'stderr.log').open('wb') as stderr:
            child = subprocess.Popen(entry['argv'], cwd=cwd, env=environment, stdout=stdout, stderr=stderr, start_new_session=True)
            try:
                while child.poll() is None:
                    self.check()
                    if time.monotonic() >= deadline:
                        raise RuntimeError('STAGE_DEADLINE')
                    time.sleep(0.5)
            except BaseException as error:
                entry['error'] = str(error)
                try:
                    os.killpg(child.pid, signal.SIGTERM)
                    child.wait(timeout=45)
                except subprocess.TimeoutExpired:
                    os.killpg(child.pid, signal.SIGKILL)
                    child.wait(timeout=5)
                except ProcessLookupError:
                    pass
                raise
            finally:
                entry.update(exitCode=child.poll(), finishedAtUtc=utc(), durationSeconds=time.monotonic() - started)
                write(folder / 'command.json', entry)
                write(self.root / 'status.json', self.state)
        if child.returncode != 0:
            raise RuntimeError(name + ':EXIT_' + str(child.returncode))
        return folder

    def start_monitor(self):
        def sample():
            while not self.monitor_stop.is_set():
                value = {'atUtc': utc(), 'monotonicNs': time.monotonic_ns(), 'stage': self.state['status'],
                         'memory': Path('/proc/meminfo').read_text(), 'load': os.getloadavg(),
                         'gpu': capture(['nvidia-smi']),
                         'processes': capture(['ps', '-axo', 'pid,ppid,comm,%cpu,%mem,rss'])}
                try:
                    value['ollama'] = api('http://127.0.0.1:11434/api/ps')
                except (OSError, ValueError) as error:
                    value['ollama'] = {'error': type(error).__name__}
                with (self.root / 'telemetry.jsonl').open('a') as stream:
                    stream.write(json.dumps(value) + '\n')
                self.monitor_stop.wait(5)
        self.monitor = threading.Thread(target=sample, daemon=True)
        self.monitor.start()

    def container(self, stage, arguments, timeout):
        cidfile = self.root / (stage + '.cid')
        self.containers.append(cidfile)
        argv = ['docker', 'run', '--name', 'tvlens-' + stage + '-' + self.owner,
                '--cidfile', str(cidfile), '--label', 'tvlens.owner=' + self.owner] + arguments
        return self.command(stage, argv, timeout)

    def stop_container(self, cidfile):
        if not cidfile.exists():
            return True
        cid = cidfile.read_text().strip()
        inspected = capture(['docker', 'inspect', cid])
        write(self.root / (cidfile.stem + '-inspect-before.json'), inspected)
        if inspected.get('exitCode') != 0:
            return False
        state = json.loads(inspected['stdout'])[0]
        if state.get('Id') != cid or state.get('Config', {}).get('Labels', {}).get('tvlens.owner') != self.owner:
            return False
        if state['State']['Running']:
            stopped = capture(['docker', 'stop', '--time', '10', cid], timeout=15)
            write(self.root / (cidfile.stem + '-stop.json'), stopped)
        after = capture(['docker', 'inspect', '--format', '{{.State.Running}}', cid])
        if after.get('exitCode') != 0 or after.get('stdout', '').strip() != 'false':
            write(self.root / (cidfile.stem + '-kill.json'), capture(['docker', 'kill', cid], timeout=10))
            after = capture(['docker', 'inspect', '--format', '{{.State.Running}}', cid])
        write(self.root / (cidfile.stem + '-stopped.json'), after)
        write(self.root / (cidfile.stem + '-logs.json'), capture(['docker', 'logs', cid], timeout=15))
        write(self.root / (cidfile.stem + '-inspect-after.json'), capture(['docker', 'inspect', cid]))
        return after.get('exitCode') == 0 and after.get('stdout', '').strip() == 'false'

    def close(self):
        cleaned = [self.stop_container(cidfile) for cidfile in self.containers]
        self.monitor_stop.set()
        if self.monitor:
            self.monitor.join(timeout=20)
            if self.monitor.is_alive():
                raise RuntimeError('MONITOR_NOT_STOPPED')
        if not all(cleaned):
            self.event('cleanup-failed', cleanupConfirmed=False)
        elif self.state['status'] == 'workload-finished':
            self.event('finished', cleanupConfirmed=True)
        files = {str(p.relative_to(self.root)): digest(p) for p in sorted(self.root.rglob('*')) if p.is_file()}
        write(self.root / 'integrite.json', {'sealedAtUtc': utc(), 'files': files})
        return all(cleaned)
