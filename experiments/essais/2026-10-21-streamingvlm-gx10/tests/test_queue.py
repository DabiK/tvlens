"""Garde-fous du pré-vol, sans conteneur ni poids réels."""
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest import mock


SCRIPTS = Path(__file__).resolve().parents[1] / 'scripts'


def module(name):
    spec = importlib.util.spec_from_file_location(name, SCRIPTS / (name + '.py'))
    value = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(value)
    return value


queue = module('queue')
runner = module('run_streamingvlm')


class Ops:
    read = staticmethod(lambda path: json.loads(Path(path).read_text()))
    digest = staticmethod(runner.digest)


def predecessor(root, status='finished', clean=True):
    root.mkdir()
    (root / 'status.json').write_text(json.dumps({'status': status, 'cleanupConfirmed': clean}))
    (root / 'events.jsonl').write_text(json.dumps({'status': status}) + '\n')
    (root / 'integrite.json').write_text(json.dumps({'files': {
        name: runner.digest(root / name) for name in ('status.json', 'events.jsonl')}}))


class QueueTests(unittest.TestCase):
    def test_predecessors_require_clean_seal_and_final_event(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory) / 'prior'
            predecessor(root)
            self.assertTrue(queue.finished(root, Ops))
            (root / 'events.jsonl').write_text('{"status":"blocked"}\n')
            with self.assertRaisesRegex(RuntimeError, 'SEAL_INVALID'):
                queue.finished(root, Ops)

    def test_predecessor_failure_stops_queue(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory) / 'prior'
            predecessor(root, status='blocked', clean=False)
            with self.assertRaisesRegex(RuntimeError, 'PREDECESSOR_FAILED'):
                queue.finished(root, Ops)

    def test_gate_checks_both_predecessors_before_any_work(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory)
            predecessor(path / 'night')
            predecessor(path / 'sidecar', status='blocked', clean=False)
            args = mock.Mock(night_root=path / 'night', sidecar_root=path / 'sidecar',
                             night_lock=path / 'night.lock', gpu_lock=path / 'gpu.lock',
                             reference_lock=path / 'reference.lock')
            night = mock.Mock()
            with self.assertRaisesRegex(RuntimeError, 'PREDECESSOR_FAILED'):
                queue.gate(night, args, Ops)
            self.assertFalse((path / 'gpu.lock').exists())
            night.sleep.assert_not_called()

    def test_lock_is_exclusive_and_released(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'gpu.lock'
            first = queue.acquire([path])
            self.assertIsNotNone(first)
            self.assertIsNone(queue.acquire([path]))
            for handle in first:
                handle.close()
            second = queue.acquire([path])
            self.assertIsNotNone(second)
            for handle in second:
                handle.close()

    def test_wrapper_refuses_existing_output_and_long_duration(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory)
            existing = path / 'result'
            existing.mkdir()
            with self.assertRaisesRegex(FileExistsError, 'OUTPUT_ALREADY_EXISTS'):
                runner.validate(path, path, path, existing, 16, 1, 16, False)
            with self.assertRaisesRegex(ValueError, 'PROTOCOL_OUT_OF_BOUNDS'):
                runner.validate(path, path, path, path / 'fresh', 6000, 1, 16, False)
            with self.assertRaisesRegex(ValueError, 'RECOMPUTE_ONLY_ON_16_SECONDS'):
                runner.validate(path, path, path, path / 'fresh', 72, 1, 16, True)

    def test_phase_budget_refuses_a_new_step_at_deadline(self):
        night = mock.Mock(deadline=20000)
        with mock.patch.object(queue.time, 'monotonic', return_value=5490):
            with self.assertRaisesRegex(RuntimeError, 'PILOT_TIME_BUDGET_EXHAUSTED'):
                queue.bounded(night, 100, 5500, 900)

    def test_dependency_layer_only_adds_pinned_python_packages(self):
        with tempfile.TemporaryDirectory() as directory:
            night = mock.Mock(root=Path(directory), owner='fixture', deadline=20000)
            args = mock.Mock(image='official/base@sha256:' + 'a' * 64)
            base = {'packages': {name: None for name in queue.PYTHON_PINS} |
                    {'torch': '2.14.0', 'flash-attn': '2.8.0'}, 'cuda': '13.4'}
            after = {'packages': dict(queue.PYTHON_PINS) |
                     {'torch': '2.14.0', 'flash-attn': '2.8.0'}, 'cuda': '13.4'}
            ops = mock.Mock()
            ops.write.side_effect = lambda path, value: Path(path).write_text(json.dumps(value))
            inspect = {'exitCode': 0, 'stdout': json.dumps([{'Architecture': 'arm64', 'Os': 'linux'}])}
            with mock.patch.object(queue, 'package_versions', side_effect=[base, after]), \
                 mock.patch.object(queue, 'captured', return_value=inspect), \
                 mock.patch.object(queue, 'bounded', return_value=60):
                image = queue.isolated_dependencies(night, args, ops, 0, 10000)
            self.assertEqual(image, 'tvlens-streaming-fixture:dependencies')
            dockerfile = (night.root / 'dependency-layer/Dockerfile').read_text()
            self.assertIn('--only-binary=:all: --no-deps', dockerfile)
            self.assertIn(queue.DECORD_COMMIT, dockerfile)
            self.assertIn(queue.FFMPEG_SHA256, dockerfile)
            self.assertIn('-DUSE_CUDA=0', dockerfile)
            self.assertNotIn('av==', dockerfile)
            self.assertNotIn('torch==', dockerfile)
            self.assertNotIn('flash-attn==', dockerfile)

    def test_existing_decord_avoids_source_build(self):
        wheels = ['transformers==4.52.4']
        dockerfile = queue.dependency_dockerfile('official/base@sha256:' + 'a' * 64, wheels, False)
        self.assertIn(wheels[0], dockerfile)
        self.assertNotIn('ffmpeg.org', dockerfile)
        self.assertNotIn('dmlc/decord', dockerfile)

    def test_wrapper_passes_bounded_duration_and_seals_fresh_output(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory)
            output = path / 'fresh'
            call = {}

            def fake_inference(**kwargs):
                call.update(kwargs)
                Path(kwargs['output_dir']).write_text('WEBVTT\n')
                return [{'GEN': 0.2}] * 16

            args = mock.Mock(source=str(path), model=str(path), video=str(path), output=str(output),
                             duration=16, chunk_duration=1, window_size=16, recompute=False, execute=True)
            original_cwd = Path.cwd()
            try:
                with mock.patch.object(runner, 'validate', return_value=runner.UPSTREAM_COMMIT), \
                     mock.patch.object(runner.importlib, 'import_module',
                                       return_value=mock.Mock(streaming_inference=fake_inference)):
                    self.assertEqual(runner.run(args), 0)
            finally:
                # Le wrapper s'exécute normalement dans un processus jetable.
                import os
                os.chdir(original_cwd)
            self.assertEqual(call['duration'], 16)
            self.assertTrue(call['emit_json'])
            self.assertTrue(call['time_test'])
            self.assertEqual(json.loads((output / 'status.json').read_text())['segmentCount'], 16)
            seal = json.loads((output / 'integrite.json').read_text())['files']
            self.assertEqual(seal['segments.vtt'], runner.digest(output / 'segments.vtt'))


if __name__ == '__main__':
    unittest.main()
