"""Contrôles hors GPU de l'ajout borné et de la conservation des résultats."""
import hashlib
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest import mock
from types import SimpleNamespace

ROOT = Path(__file__).resolve().parents[1]
ESSAIS = ROOT.parent
ARCHIVE = ESSAIS / '2026-10-21-incident-streaming-buildkit/rapatriements/reprise-streaming-buildkit-20261021T040610Z'


def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    result = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(result)
    return result


continuation = load('past_continuation', ROOT / 'continuation.py')
recovery = load('buildkit_continuation', ESSAIS / '2026-10-21-incident-streaming-buildkit/continuation.py')
queue = load('queue', ESSAIS / '2026-10-21-streamingvlm-gx10/scripts/queue.py')


class Ops:
    read = staticmethod(lambda p: json.loads(Path(p).read_text()))
    write = staticmethod(lambda p, value: Path(p).write_text(json.dumps(value)))
    digest = staticmethod(lambda p: hashlib.sha256(Path(p).read_bytes()).hexdigest())


class Night:
    def __init__(self, root):
        self.root = root
        self.owner = 'fixture'
        self.commands = []
        self.deadline = 10000
        self.short_deadline = 5500

    def check(self):
        pass

    def command(self, name, argv, timeout):
        self.commands.append((name, argv, timeout))
        (self.root / name).mkdir()


class ContinuationTests(unittest.TestCase):
    def fixtures(self):
        base = {'Id': continuation.DERIVED_ID, 'Architecture': 'arm64', 'Os': 'linux',
                'RootFS': {'Layers': ['sha256:base']}}
        corrected = {**base, 'Id': 'sha256:corrected', 'RootFS': {'Layers': ['sha256:base', 'sha256:future']}}
        return base, corrected

    def test_success_adds_only_correction_and_reuses_sealed_packages(self):
        base, corrected = self.fixtures()
        with tempfile.TemporaryDirectory() as directory:
            night = Night(Path(directory))
            packages = mock.Mock(return_value=Ops.read(ARCHIVE / 'derived-packages.json'))
            streaming = SimpleNamespace(PYTHON_PINS=queue.PYTHON_PINS, package_versions=packages)
            with mock.patch.object(continuation, 'inspect_image', side_effect=[base, corrected]), \
                 mock.patch.object(recovery, 'bounded', return_value=60):
                image = continuation.isolated_dependencies(night, None, Ops, 0, 5400, streaming, recovery, ARCHIVE)
            self.assertEqual(image, 'sha256:corrected')
            self.assertEqual([x[0] for x in night.commands], ['future-layer-build'])
            self.assertIn('--pull=false', night.commands[0][1])
            self.assertIn('--network=default', night.commands[0][1])
            self.assertEqual(Ops.read(night.root / 'reused-derived-packages.json'),
                             Ops.read(ARCHIVE / 'derived-packages.json'))
            packages.assert_called_once_with(night, Ops, image, 'corrected-packages', 60)

    def test_changed_image_identity_blocks_before_build(self):
        base, _ = self.fixtures()
        base['Id'] = 'wrong'
        with tempfile.TemporaryDirectory() as directory:
            night = Night(Path(directory))
            with mock.patch.object(continuation, 'inspect_image', return_value=base):
                with self.assertRaisesRegex(RuntimeError, 'REUSED_IMAGE_ID_CHANGED'):
                    continuation.isolated_dependencies(night, None, Ops, 0, 5400, queue, recovery, ARCHIVE)
            self.assertEqual(night.commands, [])

    def test_changed_base_layers_block_probe(self):
        base, corrected = self.fixtures()
        corrected['RootFS']['Layers'] = ['sha256:other']
        with tempfile.TemporaryDirectory() as directory:
            night = Night(Path(directory))
            with mock.patch.object(continuation, 'inspect_image', side_effect=[base, corrected]), \
                 mock.patch.object(recovery, 'bounded', return_value=60), \
                 mock.patch.object(queue, 'package_versions') as packages:
                with self.assertRaisesRegex(RuntimeError, 'CORRECTION_BASE_LAYERS_CHANGED'):
                    continuation.isolated_dependencies(night, None, Ops, 0, 5400, queue, recovery, ARCHIVE)
                packages.assert_not_called()

    def test_frozen_package_drift_blocks_probe(self):
        base, corrected = self.fixtures()
        with tempfile.TemporaryDirectory() as directory:
            night = Night(Path(directory))
            with mock.patch.object(continuation, 'inspect_image', side_effect=[base, corrected]), \
                 mock.patch.object(recovery, 'bounded', return_value=60), \
                 mock.patch.object(queue, 'package_versions', return_value={'changed': True}):
                with self.assertRaisesRegex(RuntimeError, 'EXISTING_PACKAGES_OR_CUDA_CHANGED'):
                    continuation.isolated_dependencies(night, None, Ops, 0, 5400, queue, recovery, ARCHIVE)

    def test_failed_build_is_attempted_once(self):
        base, _ = self.fixtures()
        with tempfile.TemporaryDirectory() as directory:
            night = Night(Path(directory))
            with mock.patch.object(continuation, 'inspect_image', return_value=base), \
                 mock.patch.object(recovery, 'bounded', return_value=60), \
                 mock.patch.object(night, 'command', side_effect=RuntimeError('BUILD_FAILED')) as command:
                with self.assertRaisesRegex(RuntimeError, 'BUILD_FAILED'):
                    continuation.isolated_dependencies(night, None, Ops, 0, 5400, queue, recovery, ARCHIVE)
                self.assertEqual(command.call_count, 1)

    def test_expired_phase_blocks_before_build(self):
        base, _ = self.fixtures()
        with tempfile.TemporaryDirectory() as directory:
            night = Night(Path(directory))
            with mock.patch.object(continuation, 'inspect_image', return_value=base), \
                 mock.patch.object(recovery.time, 'monotonic', return_value=5480):
                with self.assertRaisesRegex(RuntimeError, 'PILOT_TIME_BUDGET_EXHAUSTED'):
                    continuation.isolated_dependencies(night, None, Ops, 5000, 10400, queue, recovery, ARCHIVE)
                self.assertEqual(night.commands, [])

    def test_failed_predecessor_check_releases_locks(self):
        handles = [mock.Mock(), mock.Mock(), mock.Mock()]
        with mock.patch.object(recovery, 'acquire_gate', return_value=handles), \
             mock.patch.object(continuation, 'verify_previous', side_effect=RuntimeError('CHANGED')):
            with self.assertRaisesRegex(RuntimeError, 'CHANGED'):
                continuation.acquire_gate(None, None, None, None, recovery, None, None)
        for handle in handles:
            handle.close.assert_called_once()

    def test_previous_history_and_import_failure_are_checked(self):
        guards = mock.Mock()
        guards.terminal.return_value = Ops.read(ARCHIVE / 'status.json')
        guards.read.side_effect = lambda p: Ops.read(ARCHIVE / Path(p).name)
        self.assertEqual(continuation.verify_previous(guards, recovery, ARCHIVE)['status'], 'blocked')
        guards.sealed.assert_called_once_with(ARCHIVE, continuation.PREVIOUS_SEAL)
        guards.terminal.return_value['stages'].append({'name': 'pilot-16', 'exitCode': 1})
        with self.assertRaisesRegex(RuntimeError, 'PREVIOUS_STAGE_HISTORY_CHANGED'):
            continuation.verify_previous(guards, recovery, ARCHIVE)

    def test_mismatched_seal_blocks_before_history(self):
        guards = mock.Mock()
        guards.sealed.side_effect = RuntimeError('SEAL_IDENTITY_CHANGED')
        with self.assertRaisesRegex(RuntimeError, 'SEAL_IDENTITY_CHANGED'):
            continuation.verify_previous(guards, recovery, ARCHIVE)
        guards.terminal.assert_not_called()

    def test_phase_and_total_budget_are_not_reset(self):
        night = SimpleNamespace(deadline=10000, short_deadline=5500)
        with mock.patch.object(recovery.time, 'monotonic', return_value=5400):
            self.assertEqual(recovery.bounded(night, 5000, 10400, 300), 100)
            self.assertEqual(recovery.bounded(night, 5000, 17600, 5400), 4600)


if __name__ == '__main__':
    unittest.main()
