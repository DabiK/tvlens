"""Tests sans modèle de la résolution Python et de la reprise figée."""
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest import mock
from types import SimpleNamespace

ROOT = Path(__file__).resolve().parents[1]


def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


continuation = load('continuation', ROOT / 'continuation.py')
recovery = load('recovery', ROOT.parent / '2026-10-21-incident-streaming-buildkit/continuation.py')


class Ops:
    read = staticmethod(lambda p: json.loads(Path(p).read_text()))
    write = staticmethod(lambda p, value: Path(p).write_text(json.dumps(value)))
    digest = staticmethod(lambda p: hashlib.sha256(Path(p).read_bytes()).hexdigest())


class Tests(unittest.TestCase):
    def test_safe_path_preserves_main_argv_and_explicit_source_imports(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / 'queue.py').write_text('shadow=True\n')
            source = root / 'source'
            source.mkdir()
            (source / 'upstream.py').write_text('from queue import Queue\n')
            script = root / 'runner.py'
            script.write_text('import sys,json\nsys.path.insert(0,sys.argv[1])\nimport upstream,queue\n'
                              'print(json.dumps([__name__,__file__,sys.argv,queue.__file__]))\n')
            env = {k: v for k, v in os.environ.items() if k not in ('PYTHONPATH', 'PYTHONSAFEPATH')}
            original = subprocess.run([sys.executable, str(script), str(source), '--execute'],
                                      text=True, capture_output=True, env=env)
            self.assertNotEqual(original.returncode, 0)
            self.assertIn("cannot import name 'Queue'", original.stderr)
            fixed = subprocess.run([sys.executable, '-P', str(script), str(source), '--execute'],
                                   text=True, capture_output=True, env=env, check=True)
            result = json.loads(fixed.stdout)
            self.assertEqual(result[:3], ['__main__', str(script), [str(script), str(source), '--execute']])
            self.assertNotEqual(result[3], str(root / 'queue.py'))

    def test_only_supported_pilot_command_is_modified(self):
        class Base:
            def container(self, *args):
                return args
        night = continuation.safe_pilot_night(Base)()
        argv = ['--network', 'none', '--entrypoint', 'python3', continuation.IMAGE,
                '/runner/run_streamingvlm.py', '--duration', '16', '--execute']
        stage, fixed, timeout = night.container('pilot-16', argv, 12)
        self.assertEqual((stage, timeout), ('pilot-16', 12))
        self.assertEqual(fixed[:4], ['--user', '1000:1000', '-e', 'HOME=/tmp'])
        self.assertEqual(fixed[4:9], argv[:5])
        self.assertEqual(fixed[9:], ['-P'] + argv[5:])
        self.assertNotIn('-P', argv)
        with self.assertRaisesRegex(RuntimeError, 'UNEXPECTED_CONTAINER_STAGE'):
            night.container('checkpoint-download', argv, 12)

    def test_checkpoint_reuse_hashes_every_file_and_rejects_mutation(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            cache = root / 'cache'
            snapshot = cache / 'models--mit-han-lab--StreamingVLM/snapshots/revision'
            snapshot.mkdir(parents=True)
            (snapshot / 'weights.safetensors').write_bytes(b'frozen')
            file = snapshot / 'weights.safetensors'
            record = {'repo': 'model', 'revision': 'revision', 'totalBytes': 6,
                      'files': {'weights.safetensors': {'bytes': 6, 'sha256': Ops.digest(file)}}}
            Ops.write(root / 'checkpoint-files.json', record)
            out = root / 'out'
            out.mkdir()
            night = SimpleNamespace(root=out, check=mock.Mock())
            streaming = SimpleNamespace(MODEL='model', REVISION='revision')
            self.assertEqual(continuation.reuse_checkpoint(night, None, Ops, continuation.IMAGE,
                             0, 5400, streaming, root, cache), cache)
            file.write_bytes(b'changed')
            with self.assertRaisesRegex(RuntimeError, 'CHECKPOINT_CONTENT_CHANGED'):
                continuation.reuse_checkpoint(night, None, Ops, continuation.IMAGE, 0, 5400, streaming, root, cache)

    def test_failed_gate_verification_releases_locks(self):
        handles = [mock.Mock(), mock.Mock(), mock.Mock()]
        with mock.patch.object(recovery, 'acquire_gate', return_value=handles), \
             mock.patch.object(continuation, 'verify_previous', side_effect=RuntimeError('CHANGED')):
            with self.assertRaisesRegex(RuntimeError, 'CHANGED'):
                continuation.acquire_gate(None, None, None, None, recovery, None, None)
        for handle in handles:
            handle.close.assert_called_once()

    def test_original_phase_limits_are_kept(self):
        night = SimpleNamespace(deadline=10000, short_deadline=5500)
        with mock.patch.object(recovery.time, 'monotonic', return_value=5400):
            self.assertEqual(recovery.bounded(night, 5000, 10400, 900), 100)
            self.assertEqual(recovery.bounded(night, 5000, 17600, 5400), 4600)


if __name__ == '__main__':
    unittest.main()
