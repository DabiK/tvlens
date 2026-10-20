"""Contrôles factices de provenance et de non-répétition des bras terminés."""

import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch


SCRIPT = Path(__file__).resolve().parents[1] / 'scripts/resume_vllm.py'
spec = importlib.util.spec_from_file_location('resume_vllm', SCRIPT)
resume = importlib.util.module_from_spec(spec)
spec.loader.exec_module(resume)


class Ops:
    @staticmethod
    def read(path):
        return json.loads(Path(path).read_text())

    @staticmethod
    def write(path, value):
        Path(path).write_text(json.dumps(value))


def fixture(root, package):
    status = {'id': 'old-run', 'status': 'blocked',
              'error': {'message': 'docker-pull:EXIT_1'},
              'stages': [{'name': name, 'exitCode': code}
                         for name, code in zip(resume.STAGES, [0, 0, 0, 0, 0, 1])]}
    for name in resume.SEALED_FILES:
        path = root / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text('{}')
    (root / 'status.json').write_text(json.dumps(status))
    (root / 'events.jsonl').write_text('{"status":"blocked"}\n')
    campaign = {'complete': True, 'cases': [{'status': 'returned', 'fixtureServer': False}]
                * 20}
    (root / 'answers-ollama/campaign.json').write_text(json.dumps(campaign))
    (package / 'scripts').mkdir(parents=True)
    (package / 'package.sha256.json').write_text('{}')
    (package / 'scripts/vllm_stage.py').write_text('{}')
    (root / 'integrite.json').write_text(json.dumps({'files': {
        name: resume.file_sha(root / name) for name in resume.SEALED_FILES}}))


class ResumeTests(unittest.TestCase):
    def test_only_sealed_completed_stages_are_reused(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary) / 'original'
            package = Path(temporary) / 'package'
            root.mkdir()
            package.mkdir()
            fixture(root, package)
            result = resume.validate_original(root, package, Ops)
            self.assertEqual(result['completedStages'], list(resume.STAGES[:-1]))
            self.assertEqual(result['failedStage'], 'docker-pull')
            self.assertEqual(result['ollamaReturnedCases'], 20)

    def test_incomplete_or_tampered_original_is_rejected(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary) / 'original'
            package = Path(temporary) / 'package'
            root.mkdir()
            package.mkdir()
            fixture(root, package)
            campaign = root / 'answers-ollama/campaign.json'
            campaign.write_text(json.dumps({'complete': False, 'cases': []}))
            with self.assertRaisesRegex(RuntimeError, 'SEAL_INVALID'):
                resume.validate_original(root, package, Ops)
            seal = root / 'integrite.json'
            data = json.loads(seal.read_text())
            data['files']['answers-ollama/campaign.json'] = resume.file_sha(campaign)
            seal.write_text(json.dumps(data))
            with self.assertRaisesRegex(RuntimeError, 'PROBE_INCOMPLETE'):
                resume.validate_original(root, package, Ops)

    def test_suffix_calls_only_vllm_probe(self):
        class Night:
            owner = 'new-run'

            def __init__(self, root):
                self.root = root

            def container(self, name, *_args):
                self.calls.append(name)
                folder = self.root / name
                folder.mkdir()
                (folder / 'stdout.log').write_text('{"vllm":"0.28.0"}\n')
                return folder

        class Stage:
            IMAGE = 'vllm-image'
            IMAGE_DIGEST = 'image-sha'
            REVISION = 'model-revision'

            def __init__(self):
                self.calls = []

            def download(self, *_args):
                self.calls.append('download')

            def start_server(self, *_args):
                self.calls.append('server')

            def probe(self, _night, _package, _repo, backend, _identity):
                self.calls.append('probe:' + backend)

        class Response:
            def __enter__(self):
                return self

            def __exit__(self, *_args):
                return False

            def read(self):
                return b'vllm_metric 1\n'

        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary) / 'results'
            root.mkdir()
            night = Night(root)
            night.calls = []
            stage = Stage()
            with patch.object(resume.urllib.request, 'urlopen', return_value=Response()):
                resume.run_suffix(night, root, root, Ops, stage)
            self.assertEqual(stage.calls, ['download', 'server', 'probe:vllm'])
            self.assertEqual(night.calls, ['gpu-check'])
            self.assertTrue((root / 'vllm-metrics-after.txt').exists())


if __name__ == '__main__':
    unittest.main()
