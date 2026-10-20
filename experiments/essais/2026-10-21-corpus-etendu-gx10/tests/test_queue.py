"""Essais factices des verrous, prédécesseur, budgets et fermeture."""
import datetime as dt
import importlib.util
import json
from pathlib import Path
import subprocess
import tempfile
import time
import unittest
from unittest.mock import patch


SCRIPT = Path(__file__).resolve().parents[1] / 'scripts' / 'queue.py'
spec = importlib.util.spec_from_file_location('extended_queue', SCRIPT)
queue = importlib.util.module_from_spec(spec)
spec.loader.exec_module(queue)


class Ops:
    @staticmethod
    def read(path):
        return json.loads(Path(path).read_text())

    @staticmethod
    def capture(argv, timeout=5):
        if argv[:2] == ['docker', 'ps']:
            return {'exitCode': 0, 'stdout': 'cid-one\n'}
        if argv[:2] == ['docker', 'inspect']:
            return {'exitCode': 0, 'stdout': json.dumps([{'Config': {'Labels': {'tvlens.owner': 'owner'}},
                                                          'State': {'Running': False}}])}
        raise AssertionError(argv)


class FakeNight:
    def __init__(self):
        self.deadline = time.monotonic() + 100


class QueueTests(unittest.TestCase):
    def test_predecessor_seal_and_blocked_compatibility(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            for state in ('finished', 'blocked'):
                status = {'id': 'owner', 'status': state}
                if state == 'finished':
                    status['cleanupConfirmed'] = True
                (root / 'status.json').write_text(json.dumps(status))
                (root / 'events.jsonl').write_text(json.dumps({'status': state}) + '\n')
                (root / 'integrite.json').write_text(json.dumps({'files': {
                    name: queue.digest(root / name) for name in ('status.json', 'events.jsonl')}}))
                self.assertEqual(queue.predecessor(root, Ops)['status'], state)
                self.assertEqual(queue.check_owned_containers(root, 'owner', Ops), ['cid-one'])
            (root / 'events.jsonl').write_text('{}\n')
            with self.assertRaisesRegex(RuntimeError, 'SEAL_INVALID'):
                queue.predecessor(root, Ops)
            (root / 'status.json').write_text(json.dumps({'id': 'owner', 'status': 'cleanup-failed'}))
            (root / 'events.jsonl').write_text('{"status":"cleanup-failed"}\n')
            (root / 'integrite.json').write_text(json.dumps({'files': {
                name: queue.digest(root / name) for name in ('status.json', 'events.jsonl')}}))
            with self.assertRaisesRegex(RuntimeError, 'CLEANUP_FAILED'):
                queue.predecessor(root, Ops)

    def test_running_or_unowned_container_blocks(self):
        class Running(Ops):
            @staticmethod
            def capture(argv, timeout=5):
                if argv[:2] == ['docker', 'inspect']:
                    return {'exitCode': 0, 'stdout': json.dumps([{
                        'Config': {'Labels': {'tvlens.owner': 'owner'}}, 'State': {'Running': True}}])}
                return Ops.capture(argv, timeout)

        with tempfile.TemporaryDirectory() as temporary:
            with self.assertRaisesRegex(RuntimeError, 'RUNNING_OR_UNOWNED'):
                queue.check_owned_containers(Path(temporary), 'owner', Running)

            class Unowned(Running):
                @staticmethod
                def capture(argv, timeout=5):
                    if argv[:2] == ['docker', 'inspect']:
                        return {'exitCode': 0, 'stdout': json.dumps([{
                            'Config': {'Labels': {'tvlens.owner': 'other'}}, 'State': {'Running': False}}])}
                    return Ops.capture(argv, timeout)

            with self.assertRaisesRegex(RuntimeError, 'RUNNING_OR_UNOWNED'):
                queue.check_owned_containers(Path(temporary), 'owner', Unowned)

    def test_nonblocking_lock_and_budget(self):
        with tempfile.TemporaryDirectory() as temporary:
            path = Path(temporary) / 'gpu.lock'
            first = queue.acquire([path])
            self.assertIsNotNone(first)
            self.assertIsNone(queue.acquire([path]))
            first[0].close()
            second = queue.acquire([path])
            self.assertIsNotNone(second)
            second[0].close()
        self.assertLessEqual(queue.bounded(FakeNight(), 500), 100)
        night = FakeNight()
        night.deadline = time.monotonic() + 10
        with self.assertRaisesRegex(RuntimeError, 'GLOBAL_BUDGET_EXHAUSTED'):
            queue.bounded(night, 500)

    def test_idle_requires_empty_gpu_and_models(self):
        class IdleOps:
            @staticmethod
            def capture(argv, timeout=5):
                if argv[0] == 'pgrep':
                    return {'exitCode': 1, 'stdout': ''}
                return {'exitCode': 0, 'stdout': ''}

        class Reply:
            def __enter__(self):
                return self

            def __exit__(self, *_):
                return False

            def read(self):
                return b'{"models":[]}'

        with patch.object(queue.urllib.request, 'urlopen', return_value=Reply()):
            self.assertTrue(queue.idle(IdleOps)[0])

    def test_scenario_contains_five_questions_and_no_expected_answers(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            (root / 'blocks.json').write_text(json.dumps({'blocks': [
                {'startMs': 0, 'endMs': 8000}, {'startMs': 8000, 'endMs': 16000}]}))
            (root / 'preparation.json').write_text('{}')
            questions = root / 'questions.json'
            questions.write_text(json.dumps({'questions': [
                {'id': str(index), 'atMs': index * 1000, 'question': 'Que voit-on ?'}
                for index in range(1, 6)]}))
            result = subprocess.run(['node', str(SCRIPT.with_name('scenario.cjs')),
                                     str(root), str(questions), 'en'], capture_output=True)
            self.assertEqual(result.returncode, 0, result.stderr.decode())
            scenario = json.loads((root / 'scenario.json').read_text())
            self.assertEqual(len(scenario['questions']), 5)
            self.assertEqual(scenario['plannedDurationMs'], 16000)
            self.assertNotIn('expected', json.dumps(scenario).lower())
            self.assertTrue(scenario['config']['visionDuringAsk'])

    def test_acquired_false_stays_visible_and_unscored(self):
        summary = queue.summarize({'status': 'complete', 'complete': True,
                                   'questions': [{'id': 'q1', 'acquired': False, 'status': 'failed'}]})
        self.assertIs(summary['questions'][0]['acquired'], False)
        self.assertIs(summary['readyForScoring'], False)


if __name__ == '__main__':
    unittest.main()
