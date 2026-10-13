"""Loopback-only device adapter. Capture, named panel layouts and the ambient display; never arbitrary commands."""
import argparse
import hmac
import fcntl
import json
import os
from pathlib import Path
import re
import signal
import subprocess
import sys
import threading
import time
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
# The capture control must survive a missing or broken ambient module: its routes then answer 404, like an
# older controller, and nothing else changes.
try: import ambient
except Exception: ambient = None

class CaptureController:
    def __init__(self, config, report, command=None, lock_file="/tmp/tvlens-capture.lock"):
        self.config, self.report = Path(config), Path(report)
        self.lock_file = lock_file
        # Six hours at most, and ten minutes without YouTube playback end it: never a permanent recorder of the TV.
        self.command = command or [sys.executable or "/usr/bin/python3", str(Path(__file__).with_name('capture.py')),
            '--config', str(self.config), '--seconds', '21600', '--idle-seconds', '600', '--report', str(self.report),
            '--lock', str(self.lock_file), '--parent-pid', str(os.getpid())]
        self.start_error = None
        self.child = None
        self.stopping = False
        self.lock = threading.RLock()

    def status(self):
        with self.lock:
            active = self.child is not None and self.child.poll() is None
            try: report = json.loads(self.report.read_text())
            except (OSError, ValueError): report = {}
            if self.start_error: report = {'errors': [self.start_error]}
            return {'active': active, 'stopping': active and self.stopping,
                'exitCode': self.child.poll() if self.child else None, 'report': report}

    def start(self):
        with self.lock:
            if self.status()['active']: return self.status()
            self.start_error = None
            with open(self.lock_file, 'a') as capture_lock:
                try: fcntl.flock(capture_lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
                except BlockingIOError:
                    self.start_error = 'Une autre capture est déjà active. Attends sa fin puis réessaie.'
                    return self.status()
            self.report.unlink(missing_ok=True)
            self.stopping = False
            self.child = subprocess.Popen(self.command, stdin=subprocess.DEVNULL,
                stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, start_new_session=True)
            return self.status()

    def stop(self):
        with self.lock:
            if self.status()['active'] and not self.stopping:
                self.stopping = True
                child = self.child
                child.terminate()
                def reap():
                    try: child.wait(timeout=12)
                    except subprocess.TimeoutExpired:
                        try: os.killpg(child.pid, signal.SIGKILL)
                        except ProcessLookupError: pass
                        child.wait()
                threading.Thread(target=reap, daemon=True).start()
            return self.status()

class SettingsStore:
    """The viewer's choices for the ambient display, next to connection.json. Never a partial file."""
    def __init__(self, path):
        self.path, self.lock = path, threading.Lock()
    def read(self):
        return ambient.load_settings(self.path)
    def update(self, changes):
        with self.lock:
            value = dict(self.read(), **changes)
            ambient.write_json_atomic(self.path, value)
            return value

class AmbientController:
    """Keeps the ambient supervisor as a child, like the capture. It relays what the page asks and what the
    panel declares through files; it never calls Luna, never writes the display gate, never decides a paint."""
    def __init__(self, config, ambient_config=None, settings=None, command=None, recover=None, run_dir=None, port=8788, clock=time.monotonic):
        base = os.path.dirname(str(config))
        self.config = str(config)
        self.ambient_config = str(ambient_config or os.path.join(base, 'ambient.json'))
        self.settings = SettingsStore(str(settings or os.path.join(base, 'ambient-settings.json')))
        self.paths = ambient.AmbientPaths(run_dir)
        script, python = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'ambient.py'), sys.executable or "/usr/bin/python3"
        self.command = command or [python, script, '--config', self.config, '--ambient-config', self.ambient_config,
            '--settings', self.settings.path, '--parent-pid', str(os.getpid()), '--control-port', str(port)]
        self.recover_command = recover or [python, script, 'recover']
        self.clock = clock
        self.ack_wait, self.wait_hold = 1.2, 20
        self.child = self.recovering = None
        self.recovered_at = float('-inf')
        self.stopping = False
        self.lock = threading.RLock()

    def environment(self):
        # The children read and write the same run directory as this controller.
        return dict(os.environ, TVLENS_AMBIENT_RUN=str(self.paths.root))

    def active(self):
        return self.child is not None and self.child.poll() is None

    def status(self):
        with self.lock:
            active = self.active()
            state = ambient.read_json(self.paths.state) or {}
            # A supervisor that died without a word left its last state behind: it is not showing anything any more.
            if not active and state.get('status') != 'stopped': state = dict(state, status='stopped')
            state.setdefault('focus', ambient.load_config(self.ambient_config)['focus'])
            return {'supported': True, 'active': active, 'stopping': active and self.stopping,
                'exitCode': self.child.poll() if self.child else None, 'settings': self.settings.read(), 'state': state}

    def reconcile(self):
        """Child gone and gate not clear: the reopening is done by `ambient.py recover`, under the owner lock."""
        with self.lock:
            if self.active() or (self.recovering is not None and self.recovering.poll() is None): return False
            if ambient.read_gate(self.paths.gate)['state'] in ('clear', 'absent'): return False
            # A window that will not close keeps the gate shut: asked again, but not in a tight loop.
            if self.clock() - self.recovered_at < 30: return False
            self.recovered_at = self.clock()
            self.recovering = subprocess.Popen(self.recover_command, stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL, start_new_session=True, env=self.environment())
            return True

    def watch(self, stop=None, period=2):
        """At start and every two seconds: a gate left closed by a dead supervisor never stays without an owner."""
        stop = stop or threading.Event()
        def loop():
            while not stop.is_set():
                try: self.reconcile()
                except OSError: pass
                stop.wait(period)
        threading.Thread(target=loop, daemon=True).start()
        return stop

    def start(self):
        """Starts the display supervisor only. It never starts a capture and never calls the server."""
        with self.lock:
            if self.active(): return self.status()
            # A gate inherited closed is reopened by the supervisor itself, first thing, under the lock it takes.
            self.stopping = False
            self.child = subprocess.Popen(self.command, stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL, start_new_session=True, env=self.environment())
            return self.status()

    def stop(self):
        with self.lock:
            if self.active() and not self.stopping:
                self.stopping = True
                child = self.child
                child.terminate()
                def reap():
                    try: child.wait(timeout=12)
                    except subprocess.TimeoutExpired:
                        try: os.killpg(child.pid, signal.SIGKILL)
                        except ProcessLookupError: pass
                        child.wait()
                threading.Thread(target=reap, daemon=True).start()
            return self.status()

    def configure(self, changes):
        self.settings.update(changes)
        return self.status()

    def seen(self, kind, value, session=None):
        """The panel showed these cards itself: the supervisor never replays them. The numbering starts over with
        each session, so a declaration names the session it speaks of and is filed under it: the last one per
        kind with its time, for the last few sessions. A late word of another session lands in its own record
        and moves nothing of the one being read. Without a session (the route of an earlier panel) the call
        is answered and nothing is written: a number alone says nothing."""
        if not isinstance(session, str) or not session: return {}
        with self.lock:
            current = ambient.read_json(self.paths.seen) or {}
            sessions = {key: record for key, record in current['sessions'].items() if isinstance(record, dict)} if isinstance(current.get('sessions'), dict) else {}
            record = sessions.get(session, {})
            said = record.get('atMono') if isinstance(record.get('atMono'), dict) else {}
            sessions[session] = dict(record, **{kind: value, 'atMono': dict(said, **{kind: self.clock()})})
            latest = lambda key: max([at for at in sessions[key]['atMono'].values() if ambient.number(at)] or [float('-inf')]) if isinstance(sessions[key].get('atMono'), dict) else float('-inf')
            ambient.write_json_atomic(self.paths.seen, {'v': 2, 'sessions': {key: sessions[key] for key in sorted(sessions, key=latest)[-SEEN_SESSIONS:]}})
        return {}

    def test(self):
        config = ambient.load_config(self.ambient_config)
        # Shipped profile: nothing is displayed with the panel closed, a trial card included.
        if config['focus'] == 'off' and config['fallback'] != 'toast': return {'queued': False, 'reason': 'profile-off'}
        ambient.write_json_atomic(self.paths.test, {'id': uuid.uuid4().hex, 'atMono': self.clock()})
        self.start()
        return {'queued': True}

    # Asked by the ambient page, which holds no token. The nonce only names a value the supervisor produced
    # itself: it is compared, in constant time, and never becomes a path, an argument or a command.
    def gate_for(self, nonce, states, last=False):
        gate = ambient.read_gate(self.paths.gate)
        named = gate.get('nonce') if gate.get('state') in states else gate.get('lastNonce') if last and gate.get('state') == 'clear' else None
        return gate if isinstance(named, str) and hmac.compare_digest(named, nonce) else None

    def page_ack(self, nonce):
        """A request to paint. The supervisor alone grants it, by writing `shown`; this only carries the question."""
        if not self.gate_for(nonce, ('armed', 'shown')): return None
        ambient.write_json_atomic(self.paths.ack, {'nonce': nonce, 'atMono': self.clock()})
        deadline = time.monotonic() + self.ack_wait
        while True:
            gate = self.gate_for(nonce, ('armed', 'shown'))
            if not gate: return None
            if gate['state'] == 'shown': return {}
            if time.monotonic() >= deadline: return None
            time.sleep(.05)

    def page_wait(self, nonce):
        """Held open by a painted page; answers as soon as it must leave the screen."""
        if not self.gate_for(nonce, ('armed', 'shown', 'closing'), last=True): return None
        deadline = time.monotonic() + self.wait_hold
        while True:
            gate = self.gate_for(nonce, ('shown',))
            relay, panel = ambient.read_json(self.paths.dismiss_relay) or {}, ambient.read_json(self.paths.dismiss_panel) or {}
            noticed = relay.get('nonce') == nonce or (gate and ambient.number(panel.get('atMono')) and panel['atMono'] >= gate.get('armedMono', float('inf')))
            if not gate or noticed: return {'close': True}
            if time.monotonic() >= deadline: return {'close': False}
            time.sleep(.1)

    def page_key(self, nonce):
        """The page received a key that YouTube should have had: reported before it closes itself."""
        if not self.gate_for(nonce, ('armed', 'shown', 'closing'), last=True): return None
        ambient.write_json_atomic(self.paths.pagekey, {'nonce': nonce, 'atMono': self.clock()})
        return {}

AMBIENT_SETTINGS = {
    '/ambient/alerts/on': {'alerts': True}, '/ambient/alerts/off': {'alerts': False},
    '/ambient/activity/on': {'activity': True}, '/ambient/activity/off': {'activity': False},
    '/ambient/display/8': {'displayMs': 8000}, '/ambient/display/14': {'displayMs': 14000}, '/ambient/display/20': {'displayMs': 20000},
    '/ambient/position/raised': {'position': 'raised'}, '/ambient/position/low': {'position': 'low'},
}

# Session identifiers are the server's randomUUID(): anything else is not a session, and never becomes a key.
SESSION_ID = re.compile(r'[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}')
SEEN_SESSIONS = 4

def seen_route(path):
    """(session or None, kind, number) of a declaration of the panel, or None. /ambient/seen/<session>/<kind>/<n>;
    the form without a session is the one of an earlier panel. Compared as strings: nothing becomes a path."""
    parts = path.split('/')
    if len(parts) not in (5, 6) or parts[:3] != ['', 'ambient', 'seen']: return None
    session, kind, digits = (parts[3] if len(parts) == 6 else None), parts[-2], parts[-1]
    if kind not in ('overlay', 'signals') or not 1 <= len(digits) <= 9 or not all(c in '0123456789' for c in digits): return None
    if session is not None and not SESSION_ID.fullmatch(session): return None
    return session, kind, int(digits)

def page_route(path, prefixes):
    """(kind, nonce) of a route the ambient page may call without a token, or None. Strings only: no path is built."""
    for kind in prefixes:
        prefix = '/ambient/' + kind + '/'
        nonce = path[len(prefix):]
        if path.startswith(prefix) and len(nonce) == 32 and all(c in '0123456789abcdef' for c in nonce): return kind, nonce
    return None

class DeviceServer(ThreadingHTTPServer):
    daemon_threads = True
    def __init__(self, address, controller, token, ambient=None):
        self.controller, self.token, self.ambient = controller, token, ambient
        super().__init__(address, Handler)

class Handler(BaseHTTPRequestHandler):
    def log_message(self, *_): pass
    def reply(self, status, body):
        encoded = json.dumps(body).encode()
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Content-Length', str(len(encoded)))
        if self.headers.get('Origin') == 'null': self.send_header('Access-Control-Allow-Origin', 'null')
        self.send_header('Access-Control-Allow-Headers', 'Authorization, Content-Type')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.end_headers()
        self.wfile.write(encoded)
    def do_OPTIONS(self): self.reply(200, {})
    def authorized(self):
        if not hmac.compare_digest(self.headers.get('Authorization', ''), 'Bearer '+self.server.token):
            self.reply(401, {'error': 'Appareil non authentifié.'}); return False
        return True
    def panel_state(self):
        try: return json.loads(Path('/tmp/tvlens-panel-layout-state.json').read_text())
        except (OSError,ValueError): return {'active':False,'mode':'chat'}
    def page(self, prefixes):
        """Routes of the ambient page, answered before authorized(): the page holds no token."""
        if not any(self.path.startswith('/ambient/' + kind + '/') for kind in prefixes): return False
        route = page_route(self.path, prefixes)
        try: body = getattr(self.server.ambient, 'page_' + route[0])(route[1]) if route and self.server.ambient else None
        except OSError: body = None
        self.reply(404 if body is None else 200, body or {})
        return True
    def ambient_post(self):
        # Closed list, compared as strings before anything else; no request body is read.
        control, path = self.server.ambient, self.path
        if control is None: return self.reply(404, {})
        try:
            if path == '/ambient/start': return self.reply(200, control.start())
            if path == '/ambient/stop': return self.reply(200, control.stop())
            if path == '/ambient/test': return self.reply(200, control.test())
            if path in AMBIENT_SETTINGS: return self.reply(200, control.configure(AMBIENT_SETTINGS[path]))
            declared = seen_route(path)
            if declared: return self.reply(200, control.seen(declared[1], declared[2], declared[0]))
        except OSError:
            return self.reply(500, {'error': 'Impossible de contrôler les alertes.'})
        self.reply(404, {})
    def do_GET(self):
        if self.page(('wait',)): return
        if self.authorized():
            if self.path == '/panel':return self.reply(200,self.panel_state())
            if self.path == '/ambient' and self.server.ambient: return self.reply(200, self.server.ambient.status())
            self.reply(200, self.server.controller.status()) if self.path == '/capture' else self.reply(404, {})
    def do_POST(self):
        if self.page(('ack', 'key')): return
        if not self.authorized(): return
        if self.path.startswith('/ambient'): return self.ambient_post()
        if self.path in ('/panel/chat','/panel/timeline'):
            if not self.panel_state().get('active'):return self.reply(409,{'error':'Ouvre le companion avec Rakuten.'})
            request={'id':uuid.uuid4().hex,'mode':self.path.rsplit('/',1)[1]}
            temporary=Path('/tmp/tvlens-panel-layout-request.'+request['id']+'.tmp')
            try:
                temporary.write_text(json.dumps(request))
                temporary.replace(Path('/tmp/tvlens-panel-layout-request.json'))
            except OSError:
                return self.reply(500,{'error':'Impossible de changer la disposition.'})
            finally:
                temporary.unlink(missing_ok=True)
            return self.reply(200,request)
        # No request body, URL, PID, shell argument or filename can influence the command.
        if self.path not in ('/capture/start', '/capture/stop'): return self.reply(404, {})
        try:
            result = self.server.controller.start() if self.path.endswith('/start') else self.server.controller.stop()
            self.reply(200, result)
        except OSError:
            self.reply(500, {'error': 'Impossible de contrôler la capture.'})

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--config',required=True)
    # The defaults are the installation; the other values exist for a trial next to it, never in its place.
    parser.add_argument('--port',type=int,default=8788)
    parser.add_argument('--capture-report',default='/tmp/tvlens-capture-report.json')
    parser.add_argument('--capture-lock',default='/tmp/tvlens-capture.lock')
    args=parser.parse_args()
    os.umask(0o077)
    config=json.loads(Path(args.config).read_text())
    if len(config.get('token','')) < 32: raise ValueError('Token required')
    controller=CaptureController(args.config, args.capture_report, lock_file=args.capture_lock)
    display=AmbientController(args.config, port=args.port) if ambient else None
    server=DeviceServer(('127.0.0.1',args.port),controller,config['token'],display)
    # Nothing is displayed and nothing is captured at boot: only a gate left closed is reconciled.
    if display: display.watch()
    def stop(*_):
        controller.stop()
        if display: display.stop()
        raise KeyboardInterrupt
    signal.signal(signal.SIGTERM,stop)
    try: server.serve_forever()
    except KeyboardInterrupt: pass
    finally:
        controller.stop();server.server_close()
        if display: display.stop()
        if controller.child: controller.child.wait(timeout=15)
        if display and display.child: display.child.wait(timeout=15)
if __name__=='__main__':main()
