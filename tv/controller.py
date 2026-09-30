"""Loopback-only device adapter. Exactly start, stop and status; never arbitrary commands."""
import argparse
import hmac
import fcntl
import json
import os
from pathlib import Path
import signal
import subprocess
import sys
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

class CaptureController:
    def __init__(self, config, report, command=None, lock_file="/tmp/tvlens-capture.lock"):
        self.config, self.report = Path(config), Path(report)
        self.command = command or [sys.executable, str(Path(__file__).with_name('capture.py')),
            '--config', str(self.config), '--seconds', '1800', '--report', str(self.report), '--parent-pid', str(os.getpid())]
        self.lock_file = lock_file
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

class DeviceServer(ThreadingHTTPServer):
    daemon_threads = True
    def __init__(self, address, controller, token):
        self.controller, self.token = controller, token
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
    def do_GET(self):
        if self.authorized():
            self.reply(200, self.server.controller.status()) if self.path == '/capture' else self.reply(404, {})
    def do_POST(self):
        if not self.authorized(): return
        # No request body, URL, PID, shell argument or filename can influence the command.
        if self.path not in ('/capture/start', '/capture/stop'): return self.reply(404, {})
        try:
            result = self.server.controller.start() if self.path.endswith('/start') else self.server.controller.stop()
            self.reply(200, result)
        except OSError:
            self.reply(500, {'error': 'Impossible de contrôler la capture.'})

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--config',required=True);args=parser.parse_args()
    os.umask(0o077)
    config=json.loads(Path(args.config).read_text())
    if len(config.get('token','')) < 32: raise ValueError('Token required')
    controller=CaptureController(args.config, '/tmp/tvlens-capture-report.json')
    server=DeviceServer(('127.0.0.1',8788),controller,config['token'])
    def stop(*_):
        controller.stop()
        raise KeyboardInterrupt
    signal.signal(signal.SIGTERM,stop)
    try: server.serve_forever()
    except KeyboardInterrupt: pass
    finally:
        controller.stop();server.server_close()
        if controller.child: controller.child.wait(timeout=15)
if __name__=='__main__':main()
