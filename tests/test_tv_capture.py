"""Capture TV simulée : vrai programme, faux Luna/arecord et récepteur local."""
import base64
from contextlib import ExitStack, redirect_stdout
import io
from types import SimpleNamespace
from unittest.mock import patch
import json
import os
from pathlib import Path
import signal
import subprocess
import sys
import tempfile
import threading
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

ROOT = Path(__file__).resolve().parents[1]
REFUSED_REPORTS = json.loads((ROOT / 'tests' / 'fixtures' / 'tv-capture-refusals.json').read_text())
sys.path.insert(0, str(ROOT / 'tv'))
import capture

FULL = {'x': 0, 'y': 0, 'width': 1280, 'height': 720}
PNG = base64.b64decode(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='
)
CAPTURE_PROCESS = '''
import json, sys
sys.path.insert(0, sys.argv.pop(1))
gate_path = sys.argv.pop(1)
audit_path = sys.argv.pop(1)
reads = []
def observe(event, args):
    if event == 'open' and args[0] == gate_path:
        reads.append(event)
sys.addaudithook(observe)
import capture
capture.FRAME_STEP = 0.02
capture.run(sys.argv[1:])
with open(audit_path, 'w') as output:
    json.dump(reads, output)
'''


class Server:
    """Fake inference host: session start, session identity, segments. Port 0, loopback."""

    def __init__(self, start=(200, {'id': 's1', 'elapsedMs': 0}), segment=(200, {'id': 'moment-1', 'duplicate': False}), state=None):
        self.start, self.segment = start, segment
        self.state = state or {'id': 's1', 'accepting': True, 'readOnly': False, 'storage': {'state': 'ok'}}
        self.segments = []
        self.starts = 0
        self.on_segment = None
        self.requests = []
        owner = self
        # Un test peut suspendre la réponse de démarrage, comme le ferait un serveur lent ou distant.
        self.hold = None
        self.started = threading.Event()

        class Handler(BaseHTTPRequestHandler):

            def log_message(self, *_):
                pass

            def reply(self, code, value):
                body = json.dumps(value).encode()
                self.send_response(code)
                self.send_header('Content-Length', str(len(body)))
                self.end_headers()
                self.wfile.write(body)

            def do_GET(self):
                owner.requests.append(('GET', self.path))
                self.reply(200, owner.state)

            def do_POST(self):
                body = json.loads(self.rfile.read(int(self.headers['Content-Length'])))
                owner.requests.append(('POST', self.path))
                if self.path == '/v1/session/start':
                    owner.starts += 1
                    owner.started.set()
                    if owner.hold:
                        owner.hold.wait(10)
                        try:
                            return self.reply(*owner.start)
                        except OSError:
                            # La capture peut partir avant la réponse au démarrage.
                            return
                    return self.reply(*owner.start)
                owner.segments.append(body)
                response = owner.on_segment(body) if owner.on_segment else owner.segment
                self.reply(*response)
        self.http = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
        self.thread = threading.Thread(target=self.http.serve_forever)
        self.thread.start()
        self.url = 'http://127.0.0.1:' + str(self.http.server_port)

    def close(self):
        self.http.shutdown()
        self.http.server_close()
        self.thread.join()

class CaptureRun(unittest.TestCase):
    """The real capture.py, in its own process, against the fakes. Only the pace between frames is shortened."""

    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        (self.root / 'run').mkdir()
        (self.root / 'luna').mkdir()
        self.gate = self.root / 'run' / 'tvlens-ambient-gate.json'
        self.addCleanup(self.temp.cleanup)

    def environment(self):
        return dict(
            os.environ,
            PATH=str(ROOT / 'tests' / 'tv_fakes') + os.pathsep + os.environ['PATH'],
            TVLENS_FAKE_LUNA=str(self.root / 'luna'),
            TVLENS_AMBIENT_RUN=str(self.root / 'run'),
            TVLENS_FAKE_ARECORD_SECONDS='0.05',
        )

    def run_capture(self, server, seconds=8, idle=600):
        (self.root / 'connection.json').write_text(json.dumps({'url': server.url, 'token': 'x' * 64}))
        args = [
            '--config', str(self.root / 'connection.json'), '--seconds', str(seconds),
            '--idle-seconds', str(idle), '--lock', str(self.root / 'capture.lock'),
            '--report', str(self.root / 'report.json'),
        ]
        command = [
            sys.executable, '-B', '-c', CAPTURE_PROCESS, str(ROOT / 'tv'),
            str(self.gate), str(self.root / 'gate-reads.json'),
        ] + args
        done = subprocess.run(command, env=self.environment(), capture_output=True, timeout=90)
        self.assertEqual(done.returncode, 0, done.stderr.decode())
        report = json.loads((self.root / 'report.json').read_text())
        # Un refus de démarrage écrit seulement le rapport ; une capture l’affiche aussi.
        if done.stdout.strip():
            self.assertEqual(json.loads(done.stdout.decode()), report)
        return report

    def assert_block_media(self, block):
        self.assertEqual(set(block), {'sessionId', 'sequence', 'startMs', 'endMs', 'frames', 'audio'})
        self.assertEqual(block['sessionId'], 's1')
        self.assertGreaterEqual(block['startMs'], 0)
        self.assertGreater(block['endMs'], block['startMs'])
        stamps = [frame['atMs'] for frame in block['frames']]
        self.assertEqual(stamps, sorted(stamps))
        self.assertTrue(all(block['startMs'] <= stamp <= block['endMs'] for stamp in stamps))
        self.assertEqual(block['frames'], [
            {'atMs': stamp, 'data': base64.b64encode(PNG).decode(), 'crop': FULL} for stamp in stamps
        ])
        self.assertEqual(len(stamps), 4)
        audio = base64.b64decode(block['audio'], validate=True)
        self.assertEqual(audio[:4], b'RIFF')
        self.assertEqual(audio[8:12], b'WAVE')
        self.assertGreater(len(audio), 44)

    def test_block_without_a_card_is_exactly_the_block_of_before(self):
        server = Server()
        try:
            self.run_capture(server)
        finally:
            server.close()
        block, = server.segments
        self.assert_block_media(block)

    def test_an_old_closed_gate_is_never_opened_and_does_not_change_media_or_report(self):
        self.gate.write_text(json.dumps({
            'v': 2, 'epoch': 5, 'state': 'shown', 'rect': None, 'shownMono': -1e9,
            'nonce': 'a' * 32, 'app': 'org.tvlens.ambient',
        }))
        original = self.gate.read_bytes()
        server = Server()
        try:
            report = self.run_capture(server, seconds=32)
        finally:
            server.close()
        self.assertEqual(len(server.segments), 4)
        blocks = sorted(server.segments, key=lambda block: block['sequence'])
        for block in blocks:
            self.assert_block_media(block)
        sequences = [block['sequence'] for block in blocks]
        self.assertEqual(sequences, list(range(sequences[0], sequences[0] + 4)))
        self.assertTrue(all(left['endMs'] <= right['startMs'] for left, right in zip(blocks, blocks[1:])))
        self.assertEqual((report['sent'], report['dropped'], report['frames'], report['framesMoved']), (4, 0, 16, 0))
        self.assertEqual((report['dropReasons'], report['retries'], report['queued']), ({}, 0, 0))
        self.assertEqual((report['sessionId'], report['stopReason'], report['stopped']), ('s1', 'duration', True))
        self.assertEqual(report['limits'], {'seconds': 32, 'idleSeconds': 600})
        self.assertIn('32 s', report['stopMessage'])
        self.assertEqual(set(report), {
            'sessionId', 'sent', 'dropped', 'dropReasons', 'errors', 'frames', 'retries', 'connection',
            'stopped', 'queued', 'pid', 'framesMoved', 'stopReason', 'stopMessage', 'limits', 'lastRefusal',
        })
        self.assertIsNone(report['lastRefusal'])
        self.assertEqual(json.loads((self.root / 'gate-reads.json').read_text()), [])
        self.assertEqual(self.gate.read_bytes(), original)

    def test_without_a_gate_file_the_capture_sends_what_it_sent_before(self):
        server = Server()
        try:
            self.run_capture(server)
        finally:
            server.close()
        block, = server.segments
        self.assertEqual(set(block), {'sessionId', 'sequence', 'startMs', 'endMs', 'frames', 'audio'})
        self.assertEqual([set(f) for f in block['frames']], [{'atMs', 'data', 'crop'}] * 4)
        self.assertEqual([f['crop'] for f in block['frames']], [FULL] * 4)
        self.assertFalse(self.gate.exists())

    def test_full_storage_ends_the_capture_cleanly_and_is_never_called_a_network_cut(self):
        server = Server(segment=(507, {'error': 'Espace disque insuffisant.', 'code': 'storage-full'}))
        try:
            report = self.run_capture(server, seconds=40)
        finally:
            server.close()
        self.assertEqual((report['stopReason'], report['connection'], report['retries']), ('storage-full', 'storage-full', 0))
        self.assertEqual(len(server.segments), 1)
        self.assertIn('Stockage plein', report['errors'][-1])
        self.assertEqual(report['dropReasons'].get('storageFull'), 1)
        self.assertEqual(report['dropped'], sum(report['dropReasons'].values()))
        self.assertEqual(report['lastRefusal'], REFUSED_REPORTS['storage-full']['lastRefusal'])

    def test_archive_open_read_only_refuses_the_start_in_plain_words(self):
        server = Server(start=(409, {'error': 'Session ouverte en lecture seule. Choisis Reprendre la capture ou Nouvelle session.', 'code': 'read-only'}))
        try:
            report = self.run_capture(server)
        finally:
            server.close()
        self.assertEqual((report['stopReason'], report['connection'], report['stopped'], report['sent']), ('read-only', 'read-only', True, 0))
        self.assertEqual(report['errors'], ['Session ouverte en lecture seule. Choisis Reprendre la capture ou Nouvelle session.'])
        self.assertEqual((server.starts, server.segments), (1, []))

    def test_start_refusals_produce_the_shared_reports_without_classifying_their_words(self):
        for name, expected in REFUSED_REPORTS.items():
            refusal = expected['lastRefusal']
            body = {'error': 'Vue d’état inconnue, lecture seule, 409 et 507 : texte arbitraire.'}
            if refusal['code'] is not None:
                body['code'] = refusal['code']
            with self.subTest(refusal=name):
                server = Server(start=(refusal['status'], body))
                try:
                    report = self.run_capture(server)
                finally:
                    server.close()
                self.assertEqual({key: value for key, value in report.items() if key != 'pid'}, expected)
                self.assertIsInstance(report['pid'], int)
                self.assertEqual((server.starts, server.segments), (1, []))

    def test_sequence_refusals_reject_blocks_without_stopping_for_read_only_or_retrying(self):
        for code in ('stale-sequence', 'sequence-conflict', 'capture-changed'):
            with self.subTest(code=code):
                server = Server(segment=(409, {'code': code, 'error': 'Lecture seule ? 507 / 409 : texte arbitraire.'}))
                try:
                    report = self.run_capture(server, seconds=16)
                finally:
                    server.close()
                self.assertEqual(report['lastRefusal'], REFUSED_REPORTS[code]['lastRefusal'])
                self.assertEqual((report['sent'], report['dropped'], report['dropReasons'], report['retries']),
                                 (0, 2, {'deliveryRejected': 2}, 0))
                self.assertEqual((report['stopReason'], report['connection'], report['stopped']), ('duration', 'capturing', True))
                self.assertEqual(report['errors'].count('HTTP 409'), 2)
                self.assertEqual((server.starts, len(server.segments)), (1, 2))
                self.assertEqual(len({segment['sequence'] for segment in server.segments}), 2)

    def test_stop_asked_while_the_session_start_is_still_pending_ends_with_its_cause_like_any_other(self):
        server = Server()
        server.hold = threading.Event()
        (self.root / 'connection.json').write_text(json.dumps({'url': server.url, 'token': 'x' * 64}))
        child = subprocess.Popen([
            sys.executable, '-B', str(ROOT / 'tv' / 'capture.py'), '--config', str(self.root / 'connection.json'),
            '--seconds', '40', '--lock', str(self.root / 'capture.lock'), '--report', str(self.root / 'report.json'),
        ], env=self.environment(), stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        try:
            self.assertTrue(server.started.wait(15))
            self.assertEqual((server.starts, json.loads((self.root / 'report.json').read_text())['connection']), (1, 'starting'))
            self.assertIsNone(json.loads((self.root / 'report.json').read_text())['lastRefusal'])
            # Le contrôleur arrête la capture alors que le serveur n’a pas encore répondu au démarrage.
            child.send_signal(signal.SIGTERM)
            _, stderr = child.communicate(timeout=15)
        finally:
            if child.poll() is None:
                child.kill()
                child.communicate()
            server.hold.set()
            server.close()
        self.assertEqual((child.returncode, stderr.decode()), (0, ''))
        report = json.loads((self.root / 'report.json').read_text())
        self.assertEqual(
            (report['stopReason'], report['stopMessage'], report['stopped'], report['connection'],
             report['errors'], report['sent'], report['sessionId']),
            ('stopped', 'Capture arrêtée à la demande.', True, 'stopped', [], 0, None),
        )

    def test_no_youtube_playback_stops_the_capture_as_idle_and_counts_every_block(self):
        foreign = {
            'sink': 'MAIN', 'appId': 'netflix', 'connected': True, 'context': 'x',
            'displayOutput': {'x': 0, 'y': 0, 'width': 3840, 'height': 2160},
        }
        (self.root / 'luna' / 'replies.json').write_text(json.dumps({'com.webos.service.videooutput/getStatus': {'returnValue': True, 'video': [foreign]}}))
        server = Server()
        try:
            report = self.run_capture(server, seconds=21600, idle=1)
        finally:
            server.close()
        self.assertEqual((report['stopReason'], report['stopped'], report['sent']), ('idle', True, 0))
        self.assertEqual(set(report['dropReasons']), {'foreignApp'})
        self.assertEqual(report['dropped'], report['dropReasons']['foreignApp'])
        self.assertEqual(report['limits'], {'seconds': 21600, 'idleSeconds': 1})
        self.assertEqual(server.segments, [])

    def test_a_panel_opened_during_one_shot_costs_that_frame_not_the_whole_block(self):
        """Incident observé sur la TV le 13 octobre 2026 : 2 blocs perdus sur 10 en 85 s, puis 3 sur 5.

        Le panneau ouvre un rectangle vidéo de 2560×1440 à x=640 pendant une prise, après le plein écran.
        Le bloc entier de 8 s était auparavant perdu avec son audio et ses trois images valides, au moment
        où le spectateur ouvrait le panneau pour interroger ce qui venait d’être dit. Seule l’image prise
        pendant le déplacement est désormais écartée ; un changement de contexte vidéo refuse encore le bloc.
        Ce test simule la géométrie observée et n’apporte aucune nouvelle preuve matérielle.
        """
        full = {
            'sink': 'MAIN', 'appId': 'youtube.leanback.v4', 'connected': True, 'context': 'c', 'fullScreen': True,
            'displayOutput': {'x': 0, 'y': 0, 'width': 3840, 'height': 2160},
        }
        beside = dict(full, fullScreen=False, displayOutput={'x': 640, 'y': 0, 'width': 2560, 'height': 1440})

        def run(readings, seconds=8):
            # Deux lectures par image, avant puis après la prise ; la dernière réponse fournie se répète.
            for name in ('counts.json', 'calls.jsonl'):
                (self.root / 'luna' / name).unlink(missing_ok=True)
            (self.root / 'luna' / 'replies.json').write_text(json.dumps({
                'com.webos.service.videooutput/getStatus': [{'returnValue': True, 'video': [v]} for v in readings]
            }))
            server = Server()
            try:
                return (self.run_capture(server, seconds=seconds), server.segments)
            finally:
                server.close()
        # Le panneau s’ouvre pendant la deuxième prise : seule cette image manque, l’audio reste envoyé.
        report, segments = run((full, full, full, beside, beside))
        self.assertEqual((report['sent'], report['dropped'], report['dropReasons'], report['framesMoved'], report['frames']), (1, 0, {}, 1, 3))
        block, = segments
        self.assertTrue(block['audio'])
        # Chaque image garde son rectangle réel : plein écran avant l’ouverture, vidéo réduite après.
        self.assertEqual([frame['crop'] for frame in block['frames']],
                         [{'x': 0, 'y': 0, 'width': 1280, 'height': 720}] + [{'x': 213, 'y': 0, 'width': 853, 'height': 480}] * 2)
        # Toutes les prises traversent un déplacement : le bloc sans image est compté avec cette cause.
        report, segments = run((full, beside) * 4)
        self.assertEqual((report['sent'], report['dropped'], report['dropReasons'], report['framesMoved'], segments), (0, 1, {'geometryChanged': 1}, 4, []))
        # Un autre contexte vidéo n’est pas un déplacement : il refuse le bloc, avec ou sans nouveau rectangle,
        # et aucune image n’est alors comptée comme simplement déplacée.
        other = dict(full, context='another-video')
        for readings in ((full, full, full, other, other),
                         (full, full, full, dict(beside, context='another-video'), dict(beside, context='another-video'))):
            report, segments = run(readings)
            self.assertEqual((report['sent'], report['dropped'], report['dropReasons'], report['framesMoved'], segments),
                             (0, 1, {'geometryChanged': 1}, 0, []))

    def controlled_capture(self, server, blocks=1, before_audio=lambda *_: None, video=None):
        """Horloge pilotée et médias locaux ; capture.run, thread d'envoi et HTTP réels."""
        clock = [100.0]
        stop = threading.Event()
        threads = []
        recordings = []
        events = iter((stop, threading.Event()))
        full = {
            'sink': 'MAIN', 'appId': 'youtube.leanback.v4', 'connected': True, 'context': 'c',
            'displayOutput': {'x': 0, 'y': 0, 'width': 3840, 'height': 2160},
        }

        def wait(delay):
            clock[0] += delay
            return stop.is_set()

        def launch_thread(*args, **kwargs):
            thread = threading.Thread(*args, **kwargs)
            threads.append(thread)
            return thread

        class Audio:
            def __init__(self, command, **_):
                self.returncode = None
                self.started = clock[0]
                self.path = Path(command[-1])
                recordings.append(self)
                before_audio(len(recordings), stop)

            def poll(self):
                return self.returncode

            def kill(self):
                self.returncode = -9

            def wait(self, **_):
                if self.returncode is None:
                    clock[0] = self.started + 8
                    self.path.write_bytes(b'RIFF' + b'\0' * 4 + b'WAVE' + b'\0' * 40)
                    self.returncode = 0
                return self.returncode

        def luna(endpoint, payload):
            if endpoint.endswith('/getStatus'):
                current = dict(full)
                if video:
                    current.update(video(len(recordings)))
                return {'video': [current]}
            Path(payload['path']).write_bytes(PNG)
            return {'returnValue': True}

        (self.root / 'connection.json').write_text(json.dumps({'url': server.url, 'token': 'x' * 64}))
        args = [
            '--config', str(self.root / 'connection.json'), '--seconds', str(blocks * 8),
            '--idle-seconds', '0', '--lock', str(self.root / 'capture.lock'),
            '--report', str(self.root / 'report.json'),
        ]
        output = io.StringIO()
        with ExitStack() as stack:
            stack.enter_context(patch.object(stop, 'wait', side_effect=wait))
            clock_source = SimpleNamespace(monotonic=lambda: clock[0])
            stack.enter_context(patch.object(capture, 'time', clock_source))
            stack.enter_context(patch('transport.time', clock_source))
            stack.enter_context(patch.object(capture, 'open',
                                            side_effect=lambda *args: stack.enter_context(open(*args)), create=True))
            stack.enter_context(patch.object(capture, 'threading', SimpleNamespace(
                Event=lambda: next(events), Lock=threading.Lock, Thread=launch_thread)))
            stack.enter_context(patch.object(capture.signal, 'signal'))
            stack.enter_context(patch.object(capture.os, 'umask'))
            stack.enter_context(patch.object(capture.subprocess, 'Popen', Audio))
            stack.enter_context(patch.object(capture, 'luna', side_effect=luna))
            stack.enter_context(redirect_stdout(output))
            capture.run(args)
        alive_threads = [thread.name for thread in threads if thread.is_alive()]
        self.assertEqual(alive_threads, [], 'le thread doit être terminé avant le rapport final')
        self.assertTrue(all(audio.poll() is not None for audio in recordings))
        report = json.loads((self.root / 'report.json').read_text())
        self.assertEqual(json.loads(output.getvalue()), report)
        self.assertTrue(report['stopped'])
        self.assertEqual(report['queued'], 0)
        self.assertEqual(report['dropped'], sum(report['dropReasons'].values()))
        return report

    def test_incomplete_block_is_counted_before_queueing_and_the_next_block_delivers(self):
        server = Server()
        try:
            report = self.controlled_capture(server, blocks=2,
                                            video=lambda block: {'connected': block != 1})
        finally:
            server.close()
        self.assertEqual((report['sent'], report['dropped'], report['dropReasons'], report['retries']),
                         (1, 1, {'foreignApp': 1}, 0))
        self.assertEqual((report['connection'], report['stopReason'], report['lastRefusal']), ('connected', 'duration', None))
        block, = server.segments
        self.assertEqual((block['sequence'], block['startMs'], block['endMs']), (100001, 8000, 16000))
        self.assertEqual(server.requests, [('POST', '/v1/session/start'), ('GET', '/v1/session'), ('POST', '/v1/segments')])

    def test_initial_elapsed_offset_and_monotone_deltas_define_all_block_and_frame_intervals(self):
        server = Server(start=(200, {'id': 's1', 'elapsedMs': 45000}))
        try:
            # La source de temps du banc expose seulement monotonic, aucune heure civile.
            report = self.controlled_capture(server, blocks=2)
        finally:
            server.close()
        self.assertEqual([(block['sequence'], block['startMs'], block['endMs']) for block in server.segments],
                         [(100000, 45000, 53000), (100001, 53000, 61000)])
        self.assertEqual([[frame['atMs'] for frame in block['frames']] for block in server.segments],
                         [[45000, 47000, 49000, 51000], [53000, 55000, 57000, 59000]])
        self.assertEqual((report['sent'], report['dropped'], report['dropReasons'], report['retries']), (2, 0, {}, 0))
        self.assertEqual((report['connection'], report['stopReason'], report['lastRefusal']), ('connected', 'duration', None))

    def test_blocked_post_makes_overflow_and_left_at_stop_exact_without_cancelling_the_inflight_post(self):
        server = Server()
        posted = threading.Event()
        release = threading.Event()
        barrier_failures = []

        def held_post(_):
            posted.set()
            if not release.wait(10):
                barrier_failures.append('POST non libéré')
            return 200, {'duplicate': False}

        # capture.run absorberait une exception du faux Popen : la barrière est donc vérifiée après son retour.
        def before_audio(number, stop):
            if number == 2 and not posted.wait(10):
                barrier_failures.append('premier POST absent')
            if number == 6:
                stop.set()
                release.set()

        server.on_segment = held_post
        try:
            report = self.controlled_capture(server, blocks=7, before_audio=before_audio)
        finally:
            release.set()
            server.close()
        self.assertEqual(barrier_failures, [])
        # Six blocs commencés : un POST en vol réussit, un déborde, un reste incomplet, trois restent en file.
        self.assertEqual((report['sent'], report['dropped'], report['dropReasons'], report['retries']),
                         (1, 5, {'queueOverflow': 1, 'stopped': 1, 'leftAtStop': 3}, 0))
        self.assertEqual((report['connection'], report['stopReason'], report['lastRefusal']), ('connected', 'stopped', None))
        self.assertEqual([block['sequence'] for block in server.segments], [100000])
        self.assertEqual(server.requests, [('POST', '/v1/session/start'), ('GET', '/v1/session'), ('POST', '/v1/segments')])

    def test_simulated_session_ended_rejects_one_block_without_a_specific_capture_stop(self):
        server = Server()
        server.on_segment = lambda _: (410, {'code': 'session-ended'}) if len(server.segments) == 1 else (200, {})
        try:
            report = self.controlled_capture(server, blocks=2)
        finally:
            server.close()
        self.assertEqual((report['sent'], report['dropped'], report['dropReasons'], report['retries']),
                         (1, 1, {'deliveryRejected': 1}, 0))
        self.assertEqual((report['connection'], report['stopReason'], report['lastRefusal']),
                         ('connected', 'duration', {'status': 410, 'code': 'session-ended'}))
        self.assertEqual([block['sequence'] for block in server.segments], [100000, 100001])
        self.assertIn('HTTP 410', report['errors'])

    def test_duration_bounds(self):
        for seconds in ('7', '21601'):
            with self.assertRaises(ValueError):
                capture.run(['--config', 'unused', '--seconds', seconds])

if __name__ == '__main__':
    unittest.main()
