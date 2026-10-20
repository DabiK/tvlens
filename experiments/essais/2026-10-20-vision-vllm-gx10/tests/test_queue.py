"""Frontières du lanceur GX10 avec preuves et commandes factices."""
import datetime
import hashlib
import importlib.util
import json
from pathlib import Path
import tempfile
import time
import types
import unittest
from unittest import mock

SOURCE = Path(__file__).resolve().parents[1] / 'queue.py'
SPEC = importlib.util.spec_from_file_location('vision_queue', SOURCE)
queue = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(queue)


def digest(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def write(path, value):
    Path(path).write_text(json.dumps(value, ensure_ascii=False) + '\n')


def read(path):
    return json.loads(Path(path).read_text())


class FakeNight:
    def __init__(self, root, remaining=3600):
        self.root = Path(root)
        self.root.mkdir()
        self.owner = 'fixture-owner'
        self.deadline = time.monotonic() + remaining
        self.events = []
        self.commands = []
        self.stopped = []
        self.sleep_count = 0

    def event(self, status, **data):
        self.events.append((status, data))

    def check(self):
        if self.sleep_count > 1:
            raise RuntimeError('FIXTURE_DEADLINE')

    def sleep(self, _seconds):
        self.sleep_count += 1

    def command(self, name, argv, _timeout, cwd=None):
        self.commands.append((name, [str(item) for item in argv], cwd))

    def stop_container(self, cidfile):
        self.stopped.append(cidfile)
        return True

    def close(self):
        return True


class QueueTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='vision-queue-test-')
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.ops = types.SimpleNamespace(read=read, write=write, digest=digest, utc=lambda: 'fixture-utc')

    def make_night_proof(self):
        root = self.root / 'night'
        root.mkdir()
        write(root / 'status.json', {'status': 'finished', 'cleanupConfirmed': True})
        (root / 'events.jsonl').write_text('{"status":"finished"}\n')
        write(root / 'integrite.json', {'files': {'status.json': digest(root / 'status.json'),
              'events.jsonl': digest(root / 'events.jsonl')}})
        return root

    def test_night_gate_requires_sealed_cleanup_and_exclusive_locks(self):
        night_root = self.make_night_proof()
        self.assertTrue(queue.night_finished(night_root, self.ops))
        locks = [self.root / name for name in ['night.lock', 'gpu.lock', 'reference.lock']]
        holder = queue.acquire(locks)
        self.assertIsNotNone(holder)
        self.assertIsNone(queue.acquire(locks))
        for handle in holder:
            handle.close()
        night = FakeNight(self.root / 'result')
        args = types.SimpleNamespace(night_root=night_root, night_lock=locks[0], gpu_lock=locks[1], reference_lock=locks[2])
        acquired = queue.wait_for_night(night, args, self.ops)
        self.assertEqual(len(acquired), 3)
        self.assertEqual(read(night.root / 'night-gate.json')['statusSha256'], digest(night_root / 'status.json'))
        for handle in acquired:
            handle.close()
        write(night_root / 'status.json', {'status': 'finished', 'cleanupConfirmed': False})
        self.assertFalse(queue.night_finished(night_root, self.ops))

    def test_tampered_night_proof_blocks_before_any_workload(self):
        night_root = self.make_night_proof()
        (night_root / 'events.jsonl').write_text('{"status":"finished","changed":true}\n')
        with self.assertRaisesRegex(RuntimeError, 'NIGHT_SEAL_INVALID'):
            queue.night_finished(night_root, self.ops)
        write(night_root / 'status.json', {'status': 'blocked', 'cleanupConfirmed': False})
        with self.assertRaisesRegex(RuntimeError, 'NIGHT_FAILED'):
            queue.night_finished(night_root, self.ops)

    def test_idle_gate_waits_for_resident_model_then_rechecks(self):
        night = FakeNight(self.root / 'result')
        states = [RuntimeError('OLLAMA_RESIDENT_OR_UNKNOWN'), None]

        def inspect(*_args):
            state = states.pop(0)
            if state:
                raise state

        with mock.patch.object(queue, 'resources', side_effect=inspect):
            self.assertTrue(queue.wait_idle(night, self.ops, 'before-vllm'))
        self.assertEqual(night.sleep_count, 1)
        self.assertEqual(states, [])

    def test_repo_drift_blocks_before_model_download(self):
        night = FakeNight(self.root / 'result')
        self.ops.capture = lambda argv: {'exitCode': 0, 'stdout': 'unexpected\n' if 'rev-parse' in argv else ''}
        with self.assertRaisesRegex(RuntimeError, 'REPO_SOURCE_CHANGED'):
            queue.verify_repo(night, self.ops, self.root)
        self.assertEqual(read(night.root / 'repo-identity.json')['expectedCommit'], queue.REPO_COMMIT)

    def test_probe_commands_use_one_five_image_case_then_twelve_cases_twice(self):
        package = self.root / 'package'
        (package / 'scripts').mkdir(parents=True)
        night = FakeNight(self.root / 'result')
        manifest = self.root / 'manifest.json'
        manifest.write_text('{}')
        args = types.SimpleNamespace(package=package, repo=self.root, manifest=manifest)

        def command(name, argv, timeout, cwd=None):
            FakeNight.command(night, name, argv, timeout, cwd)
            out = Path(argv[argv.index('--out') + 1])
            out.mkdir()
            count = int(argv[argv.index('--limit') + 1]) * int(argv[argv.index('--repeats') + 1])
            write(out / 'campaign.json', {'complete': True, 'cases': [
                  {'status': 'returned', 'frameSha256': ['x'] * 5} for _ in range(count)]})
            write(out / 'integrite.json', {'files': {}})

        night.command = command
        queue.probe(night, args, self.ops, 'vllm', 'preflight')
        queue.probe(night, args, self.ops, 'vllm', 'full')
        self.assertIn('--limit', night.commands[0][1])
        self.assertEqual(night.commands[0][1][night.commands[0][1].index('--limit') + 1], '1')
        self.assertEqual(night.commands[1][1][night.commands[1][1].index('--repeats') + 1], '2')
        self.assertEqual(night.commands[0][1][night.commands[0][1].index('--url') + 1], 'http://127.0.0.1:8002')

    def test_arm_missing_when_less_than_reserved_hour_remains(self):
        package = self.root / 'package'
        (package / 'scripts').mkdir(parents=True)
        for name in ['vision-probe.cjs', 'vision-input.cjs', 'vision-transport.cjs']:
            (package / 'scripts' / name).write_text('fixture')
        manifest = self.root / 'manifest.json'
        manifest.write_text('{}')
        args = types.SimpleNamespace(out=self.root / 'result', package=package, manifest=manifest,
                                     repo=SOURCE.parents[3])
        night = FakeNight(args.out, remaining=1800)
        self.ops.Night = lambda _out, _deadline: night
        calls = []
        with (mock.patch.object(queue, 'wait_for_night', return_value=[]),
              mock.patch.object(queue, 'verify_repo'),
              mock.patch.object(queue, 'wait_idle', return_value=True),
              mock.patch.object(queue, 'resources', side_effect=lambda *a: calls.append('resources')),
              mock.patch.object(queue, 'image_and_cuda', side_effect=lambda *a: calls.append('cuda')),
              mock.patch.object(queue, 'download_model', return_value=(self.root / 'cache', self.root / 'model')),
              mock.patch.object(queue, 'start_vllm', return_value=self.root / 'owned.cid'),
              mock.patch.object(queue, 'probe', side_effect=lambda *a: calls.append((a[3], a[4]))),
              mock.patch.object(queue, 'ollama_arm', side_effect=lambda *a: calls.append('ollama'))):
            self.assertEqual(queue.run(args, self.ops), 0)
        self.assertEqual([item for item in calls if isinstance(item, tuple)],
                         [('vllm', 'preflight'), ('vllm', 'full')])
        self.assertNotIn('ollama', calls)
        self.assertEqual(read(night.root / 'ollama-missing.json')['reason'], 'LESS_THAN_RESERVED_HOUR')
        self.assertEqual(night.stopped, [self.root / 'owned.cid'])

    def test_wrong_docker_architecture_refuses_cuda_launch(self):
        night = FakeNight(self.root / 'result')
        night.command = lambda *args, **kwargs: None
        night.container = lambda *args, **kwargs: self.fail('CUDA must not start')
        self.ops.capture = lambda _argv: {'exitCode': 0, 'stdout': json.dumps([{
            'Os': 'linux', 'Architecture': 'amd64', 'RepoDigests': [queue.IMAGE]}])}
        with self.assertRaisesRegex(RuntimeError, 'IMAGE_IDENTITY_MISMATCH'):
            queue.image_and_cuda(night, self.ops)

    def test_model_snapshot_is_hashed_and_requires_weights(self):
        night = FakeNight(self.root / 'result')
        cache = self.root / 'cache'
        snapshot = cache / 'models--Qwen--Qwen3-VL-4B-Instruct' / 'snapshots' / queue.REVISION
        snapshot.mkdir(parents=True)
        (snapshot / 'config.json').write_text('{"architectures":["Qwen3VLForConditionalGeneration"]}')
        (snapshot / 'model.safetensors').write_bytes(b'fixture-weights')
        self.assertEqual(queue.model_files(night, cache, self.ops), snapshot)
        report = read(night.root / 'model-files.json')
        self.assertEqual(report['revision'], queue.REVISION)
        self.assertEqual(report['files']['model.safetensors']['sha256'], digest(snapshot / 'model.safetensors'))
        (snapshot / 'model.safetensors').unlink()
        with self.assertRaisesRegex(RuntimeError, 'MODEL_WEIGHTS_MISSING'):
            queue.model_files(night, cache, self.ops)

    def test_ollama_digest_mismatch_blocks_pull_and_probe(self):
        night = FakeNight(self.root / 'result')
        args = types.SimpleNamespace()
        self.ops.api = lambda _url: {'models': [{'name': queue.OLLAMA_MODEL, 'digest': 'sha256:wrong'}]}
        with mock.patch.object(queue, 'probe', side_effect=AssertionError('No probe allowed')):
            with self.assertRaisesRegex(RuntimeError, 'OLLAMA_EXISTING_DIGEST_MISMATCH'):
                queue.ollama_arm(night, args, self.ops)
        self.assertEqual(night.commands, [])


if __name__ == '__main__':
    unittest.main()
