"""Vérifier les frontières sans réseau, processus réels ni GPU."""
import importlib.util
import json
from pathlib import Path
import sys
import tempfile
import time
import types
import unittest
from unittest import mock

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import continuation
import guards


def write(path, data):
    Path(path).write_text(json.dumps(data) + '\n')


def seal(root):
    write(root / 'integrite.json', {'files': {
        str(path.relative_to(root)): guards.digest(path)
        for path in root.rglob('*') if path.is_file() and path.name != 'integrite.json'}})


class Handle:
    def __init__(self):
        self.closed = False

    def close(self):
        self.closed = True


class FakeNight:
    def __init__(self, root, seconds=7200):
        self.root = root
        self.deadline = time.monotonic() + seconds
        self.events = []
        self.sleeps = 0
        self.start_monitor = mock.Mock()

    def close(self):
        return True

    def event(self, name, **data):
        self.events.append((name, data))

    def check(self):
        if time.monotonic() >= self.deadline:
            raise RuntimeError('NIGHT_DEADLINE')

    def sleep(self, _seconds):
        self.sleeps += 1
        if self.sleeps > 1:
            raise RuntimeError('FIXTURE_STOP')


class ContinuationTests(unittest.TestCase):
    def setUp(self):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        self.root = Path(temp.name)
        self.ops = types.SimpleNamespace(write=write, read=guards.read, utc=lambda: 'fixture-utc')
        self.args = types.SimpleNamespace(night_lock='night', gpu_lock='gpu', reference_lock='reference')

    def make_terminal(self, state='finished'):
        write(self.root / 'status.json', {'status': state, 'cleanupConfirmed': True, 'id': 'owner'})
        (self.root / 'events.jsonl').write_text(json.dumps({'status': state}) + '\n')
        seal(self.root)

    def test_digest_normalizes_only_optional_sha256_prefix(self):
        self.assertEqual(guards.normalized_digest(guards.DIGEST), guards.DIGEST)
        self.assertEqual(guards.normalized_digest('sha256:' + guards.DIGEST), guards.DIGEST)
        for value in (None, '', 'sha512:' + guards.DIGEST, ' ' + guards.DIGEST,
                      guards.DIGEST.upper(), 'sha256:sha256:' + guards.DIGEST):
            with self.subTest(value=value), self.assertRaisesRegex(RuntimeError, 'DIGEST_FORMAT_INVALID'):
                guards.normalized_digest(value)

    def test_changed_digest_blocks_before_probe_without_pull(self):
        night = FakeNight(self.root)
        self.ops.api = lambda _url: {'models': [{'name': guards.MODEL, 'digest': 'a' * 64}]}
        vision = types.SimpleNamespace(probe=mock.Mock())
        with self.assertRaisesRegex(RuntimeError, 'INSTALLED_MODEL_IDENTITY_CHANGED'):
            continuation.ollama_arm(night, self.args, self.ops, vision)
        vision.probe.assert_not_called()

    def test_late_identity_check_skips_before_any_inference(self):
        night = FakeNight(self.root, seconds=3599)
        self.ops.api = lambda _url: {'models': [{'name': guards.MODEL, 'digest': guards.DIGEST}]}
        vision = types.SimpleNamespace(probe=mock.Mock(), OLLAMA_MIN_SECONDS=3600)
        continuation.ollama_arm(night, self.args, self.ops, vision)
        vision.probe.assert_not_called()
        night.start_monitor.assert_not_called()
        self.assertEqual(night.events[-1][1]['ollamaArm'], 'missing')

    def test_seal_detects_modified_events(self):
        self.make_terminal()
        (self.root / 'events.jsonl').write_text('{"status":"blocked"}\n')
        with self.assertRaisesRegex(RuntimeError, 'SEALED_FILE_CHANGED'):
            guards.terminal(self.root)

    def test_cleanup_failure_never_becomes_ready(self):
        self.make_terminal('cleanup-failed')
        with self.assertRaisesRegex(RuntimeError, 'PREDECESSOR_CLEANUP_FAILED'):
            guards.terminal(self.root)

    def test_no_slot_returns_without_reading_corpus_or_acquiring_gpu(self):
        night = FakeNight(self.root, seconds=3599)
        vision = types.SimpleNamespace(acquire=mock.Mock())
        with mock.patch.object(guards, 'terminal', side_effect=AssertionError('No predecessor access needed')):
            handles = continuation.wait_gate(night, self.args, self.ops, vision, None, reserve=3600)
        self.assertEqual(handles, [])
        vision.acquire.assert_not_called()
        continuation.missing(night, self.ops)
        self.assertEqual(guards.read(self.root / 'ollama-missing.json')['reason'], guards.MISSING_REASON)
        self.assertEqual(night.events[-1][1]['ollamaArm'], 'missing')

    def test_active_corpus_never_reaches_gpu_or_container_queries(self):
        night = FakeNight(self.root)
        vision = types.SimpleNamespace(acquire=mock.Mock())
        corpus = types.SimpleNamespace(idle=mock.Mock(), check_owned_containers=mock.Mock())
        with mock.patch.object(guards, 'terminal', return_value=None):
            with self.assertRaisesRegex(RuntimeError, 'FIXTURE_STOP'):
                continuation.wait_gate(night, self.args, self.ops, vision, corpus)
        vision.acquire.assert_not_called()
        corpus.idle.assert_not_called()
        corpus.check_owned_containers.assert_not_called()

    def test_busy_gpu_releases_all_three_locks_without_workload(self):
        night = FakeNight(self.root)
        groups = [[Handle() for _ in range(3)] for _ in range(2)]
        vision = types.SimpleNamespace(acquire=mock.Mock(side_effect=groups), night_finished=lambda *_: True)
        corpus = types.SimpleNamespace(check_owned_containers=lambda *_: [], idle=lambda *_: (False, {'busy': True}))
        with (mock.patch.object(guards, 'terminal', return_value={'id': 'fixture'}),
              mock.patch.object(guards, 'verify_original')):
            with self.assertRaisesRegex(RuntimeError, 'FIXTURE_STOP'):
                continuation.wait_gate(night, self.args, self.ops, vision, corpus)
        self.assertTrue(all(handle.closed for group in groups for handle in group))
        self.assertFalse((self.root / 'recovery-gate.json').exists())

    def test_streaming_gate_stops_at_deadline_before_gpu_queries(self):
        night = FakeNight(self.root, seconds=-1)
        vision = types.SimpleNamespace(acquire=mock.Mock())
        with self.assertRaisesRegex(RuntimeError, 'NIGHT_DEADLINE'):
            continuation.wait_gate(night, self.args, self.ops, vision, None, suffix=self.root / 'suffix')
        vision.acquire.assert_not_called()

    def test_unknown_cleanup_after_terminal_blocks_and_releases_locks(self):
        night = FakeNight(self.root)
        handles = [Handle() for _ in range(3)]
        vision = types.SimpleNamespace(acquire=lambda *_: handles, night_finished=lambda *_: True)
        corpus = types.SimpleNamespace(
            check_owned_containers=mock.Mock(side_effect=RuntimeError('PREDECESSOR_CONTAINER_UNKNOWN')),
            idle=mock.Mock())
        with (mock.patch.object(guards, 'terminal', return_value={'status': 'blocked', 'id': 'fixture'}),
              mock.patch.object(guards, 'verify_original')):
            with self.assertRaisesRegex(RuntimeError, 'PREDECESSOR_CONTAINER_UNKNOWN'):
                continuation.wait_gate(night, self.args, self.ops, vision, corpus)
        self.assertTrue(all(handle.closed for handle in handles))
        corpus.idle.assert_not_called()
        self.assertFalse((self.root / 'recovery-gate.json').exists())

    def test_suffix_accepts_only_explicit_time_skip_without_stages(self):
        self.make_terminal()
        state = guards.read(self.root / 'status.json')
        state.update(ollamaArm='missing', stages=[])
        write(self.root / 'status.json', state)
        write(self.root / 'continuation.json', {
            'original': {'sealSha256': guards.ORIGINAL_SEAL}, 'corpusRoot': str(guards.CORPUS)})
        missing = {'reason': guards.MISSING_REASON, 'remainingSeconds': 100, 'attempted': False}
        write(self.root / 'ollama-missing.json', missing)
        seal(self.root)
        self.assertEqual(guards.verify_suffix(self.root)['ollamaArm'], 'missing')
        del missing['attempted']
        write(self.root / 'ollama-missing.json', missing)
        seal(self.root)
        with self.assertRaisesRegex(RuntimeError, 'SUFFIX_MISSING_CAUSE_NOT_ALLOWED'):
            guards.verify_suffix(self.root)
        missing['attempted'] = False
        write(self.root / 'ollama-missing.json', missing)
        state['stages'] = [{'name': 'ollama-preflight-command', 'exitCode': 1}]
        write(self.root / 'status.json', state)
        seal(self.root)
        with self.assertRaisesRegex(RuntimeError, 'SUFFIX_MISSING_CAUSE_NOT_ALLOWED'):
            guards.verify_suffix(self.root)

    def test_incompatible_suffix_blocks_streaming(self):
        self.make_terminal('blocked')
        with self.assertRaisesRegex(RuntimeError, 'SUFFIX_FAILED'):
            guards.verify_suffix(self.root)

    def test_campaign_requires_each_sealed_response_and_five_images(self):
        for phase, count in (('preflight', 1), ('full', 24)):
            folder = self.root / ('vllm-' + phase)
            folder.mkdir()
            (folder / 'request.json').write_text('{}')
            (folder / 'response.raw.txt').write_text('{"fixture":true}')
            rows = [{'status': 'returned', 'frameSha256': ['x'] * 5,
                     'requestFile': 'request.json', 'requestSha256': guards.digest(folder / 'request.json'),
                     'responseFile': 'response.raw.txt', 'responseSha256': guards.digest(folder / 'response.raw.txt')}
                    for _ in range(count)]
            write(folder / 'campaign.json', {'complete': True, 'backend': 'vllm', 'model': 'fixture',
                                             'mode': 'execute', 'manifestSha256': guards.MANIFEST_SHA, 'cases': rows})
            seal(folder)
        guards.verify_cases(self.root, 'vllm', 'fixture')
        response = self.root / 'vllm-full/response.raw.txt'
        response.write_text('{"changed":true}')
        with self.assertRaisesRegex(RuntimeError, 'SEALED_FILE_CHANGED'):
            guards.verify_cases(self.root, 'vllm', 'fixture')

    def test_streaming_dispatch_preserves_frozen_workload_with_required_arguments(self):
        source = Path(__file__).resolve().parents[2] / '2026-10-21-streamingvlm-gx10/scripts/queue.py'
        spec = importlib.util.spec_from_file_location('fixture_frozen_streaming', source)
        streaming = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(streaming)
        night = FakeNight(self.root)
        self.ops.Night = lambda *_: night
        self.ops.digest = lambda _path: streaming.VIDEO_SHA256
        args = types.SimpleNamespace(**vars(self.args), out=self.root, suffix=self.root / 'suffix',
                                     image='fixture-image', video=self.root / 'video.mp4',
                                     package=self.root / 'package', upstream=self.root / 'upstream')
        state = {'error': {'message': 'PREDECESSOR_FAILED:' + str(guards.ORIGINAL)}, 'stages': []}
        handles = [Handle() for _ in range(3)]
        with (mock.patch.object(guards, 'load', return_value=streaming),
              mock.patch.object(guards, 'verify_streaming_package'), mock.patch.object(guards, 'sealed'),
              mock.patch.object(guards, 'terminal', return_value=state),
              mock.patch.object(guards, 'verify_original', return_value={'sealSha256': guards.ORIGINAL_SEAL}),
              mock.patch.object(continuation, 'wait_gate', return_value=handles) as gate,
              mock.patch.object(streaming, 'verify_source'), mock.patch.object(streaming, 'wait_idle'),
              mock.patch.object(streaming, 'image_preflight', return_value='fixture-image'),
              mock.patch.object(streaming, 'resources'),
              mock.patch.object(streaming, 'download', return_value='fixture-cache'),
              mock.patch.object(streaming, 'pilot') as pilot):
            self.assertEqual(continuation.run_streaming(args, self.ops, None, None), 0)
        gate.assert_called_once_with(night, args, self.ops, None, None, suffix=args.suffix)
        self.assertEqual([(call.args[5], call.args[6]) for call in pilot.call_args_list],
                         [(16, False), (72, False), (372, False), (16, True)])
        self.assertTrue(all(handle.closed for handle in handles))


if __name__ == '__main__':
    unittest.main()
