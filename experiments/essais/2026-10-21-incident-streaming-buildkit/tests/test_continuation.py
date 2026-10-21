"""Validation hors GPU de la reprise et du refus de dérive."""
import hashlib
import importlib.util
import json
import shutil
from pathlib import Path
import tempfile
import unittest
from unittest import mock

ROOT = Path(__file__).resolve().parents[1]
ESSAIS = ROOT.parent


def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    result = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(result)
    return result


recovery = load('recovery', ROOT / 'continuation.py')
queue = load('frozen_queue', ESSAIS / '2026-10-21-streamingvlm-gx10/scripts/queue.py')
guards = load('guards', ESSAIS / '2026-10-21-reprise-bras-qwen/guards.py')
ARCHIVE = ESSAIS / '2026-10-21-streamingvlm-gx10/rapatriements/reprise-streaming-arm-20261021T002414Z/results'


class Ops:
    read = staticmethod(lambda path: json.loads(Path(path).read_text()))
    write = staticmethod(lambda path, value: Path(path).write_text(json.dumps(value)))
    digest = staticmethod(lambda path: hashlib.sha256(Path(path).read_bytes()).hexdigest())


class FakeDockerNight:
    def __init__(self, root):
        self.root = root
        self.owner = 'fixture'
        self.deadline = 20000
        self.short_deadline = 5500
        self.commands = []

    def check(self):
        pass

    def event(self, *args):
        pass

    def command(self, name, argv, timeout, cwd=None):
        self.commands.append((name, argv, timeout))
        if name == 'dependency-build' and '--network=bridge' in argv:
            raise RuntimeError('UNSUPPORTED_NETWORK')
        folder = self.root / name
        folder.mkdir()
        return folder


class ContinuationTests(unittest.TestCase):
    def test_attested_incident_has_only_three_stages_and_original_budget(self):
        with tempfile.TemporaryDirectory() as directory:
            complete = Path(directory) / 'complete'
            shutil.copytree(ARCHIVE, complete)
            for name in ('base-packages.cid', 'telemetry.jsonl'):
                shutil.copyfile(ROOT / 'evidence' / name, complete / name)
            proof = recovery.verify_original(guards, complete)
        self.assertEqual(proof['effectiveDeadlineUtc'], '2026-10-21T07:07:16.052779+00:00')
        self.assertEqual(proof['shortDeadlineUtc'], '2026-10-21T05:07:16.052779+00:00')

    def test_altered_sealed_bytes_are_rejected(self):
        with mock.patch.object(guards, 'digest', return_value='wrong'):
            with self.assertRaisesRegex(RuntimeError, 'SEAL_IDENTITY_CHANGED'):
                recovery.verify_original(guards, ARCHIVE)

    def test_frozen_dependency_stage_changes_only_build_network(self):
        with tempfile.TemporaryDirectory() as directory:
            night = recovery.recovery_night(FakeDockerNight, Ops, ARCHIVE)(Path(directory))
            args = mock.Mock(image=recovery.IMAGE)
            after = {'packages': dict(queue.PYTHON_PINS) | {
                key: Ops.read(ARCHIVE / 'base-packages.json')['packages'][key] for key in ('torch', 'flash-attn')},
                'cuda': '13.4'}
            real_packages = mock.Mock(return_value=after)
            inspect = {'exitCode': 0, 'stdout': json.dumps([{'Architecture': 'arm64', 'Os': 'linux'}])}
            with mock.patch.object(queue, 'package_versions', recovery.reuse_packages(real_packages, Ops, ARCHIVE)), \
                 mock.patch.object(queue, 'captured', return_value=inspect), \
                 mock.patch.object(queue, 'bounded', return_value=60):
                image = queue.isolated_dependencies(night, args, Ops, 0, 5400)
            self.assertEqual(image, 'tvlens-streaming-fixture:dependencies')
            self.assertEqual(len(night.commands), 1)
            name, argv, timeout = night.commands[0]
            self.assertEqual(name, 'dependency-build')
            self.assertEqual(argv[:5], ['docker', 'build', '--pull=false', '--network=default', '--progress=plain'])
            self.assertEqual(timeout, 60)
            self.assertEqual(Ops.digest(night.root / 'dependency-layer/Dockerfile'),
                             Ops.digest(ARCHIVE / 'dependency-layer/Dockerfile'))
            real_packages.assert_called_once_with(night, Ops, image, 'derived-packages', 60)

    def test_pull_is_reused_but_other_commands_are_executed(self):
        with tempfile.TemporaryDirectory() as directory:
            night = recovery.recovery_night(FakeDockerNight, Ops, ARCHIVE)(Path(directory))
            night.command('image-pull', ['docker', 'pull', '--platform', 'linux/arm64', recovery.IMAGE], 60)
            night.command('other', ['docker', 'run', '--network', 'bridge', 'fixture'], 60)
            self.assertTrue((night.root / 'image-pull/reused.json').is_file())
            self.assertEqual([entry[0] for entry in night.commands], ['other'])
            self.assertIn('bridge', night.commands[0][1])

    def test_changed_dependency_dockerfile_is_rejected_before_docker(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory)
            night = recovery.recovery_night(FakeDockerNight, Ops, ARCHIVE)(path)
            dockerfile = path / 'Dockerfile'
            dockerfile.write_text('FROM other\n')
            with self.assertRaisesRegex(RuntimeError, 'DEPENDENCY_DOCKERFILE_CHANGED'):
                night.command('dependency-build', ['docker', 'build', '--pull=false', '--network=bridge',
                              '-f', str(dockerfile)], 60)
            self.assertEqual(night.commands, [])

    def test_failed_docker_command_is_not_retried(self):
        with tempfile.TemporaryDirectory() as directory:
            night = recovery.recovery_night(FakeDockerNight, Ops, ARCHIVE)(Path(directory))
            with mock.patch.object(FakeDockerNight, 'command', side_effect=RuntimeError('BUILD_FAILED')) as command:
                with self.assertRaisesRegex(RuntimeError, 'BUILD_FAILED'):
                    night.command('dependency-build', ['docker', 'build', '--pull=false', '--network=bridge',
                                  '-f', str(ARCHIVE / 'dependency-layer/Dockerfile')], 60)
                self.assertEqual(command.call_count, 1)

    def test_original_phase_and_overall_deadlines_do_not_reset(self):
        night = mock.Mock(deadline=10000, short_deadline=5500)
        with mock.patch.object(recovery.time, 'monotonic', return_value=5400):
            self.assertEqual(recovery.bounded(night, 5000, 10400, 2400), 100)
            self.assertEqual(recovery.bounded(night, 5000, 17600, 5400), 4600)
        with mock.patch.object(recovery.time, 'monotonic', return_value=5480):
            with self.assertRaisesRegex(RuntimeError, 'PILOT_TIME_BUDGET_EXHAUSTED'):
                recovery.bounded(night, 5000, 10400, 2400)

    def test_busy_lock_stops_without_wait_or_gpu_work(self):
        streaming = mock.Mock()
        streaming.acquire.return_value = None
        night = mock.Mock()
        with self.assertRaisesRegex(RuntimeError, 'EXCLUSIVE_LOCK_UNAVAILABLE'):
            recovery.acquire_gate(night, mock.Mock(), mock.Mock(), mock.Mock(), streaming, mock.Mock())
        night.sleep.assert_not_called()
        night.start_monitor.assert_not_called()

    def test_gate_failure_releases_all_acquired_locks(self):
        streaming = mock.Mock()
        handles = [mock.Mock(), mock.Mock(), mock.Mock()]
        streaming.acquire.return_value = handles
        with mock.patch.object(recovery, 'verify_original', side_effect=RuntimeError('FAIL_CLOSED')):
            with self.assertRaisesRegex(RuntimeError, 'FAIL_CLOSED'):
                recovery.acquire_gate(mock.Mock(), mock.Mock(), mock.Mock(), mock.Mock(), streaming, mock.Mock())
        for handle in handles:
            handle.close.assert_called_once()


if __name__ == '__main__':
    unittest.main()
